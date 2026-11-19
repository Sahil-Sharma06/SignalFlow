import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { emails, leads, replies, type LeadStatus } from "@/lib/db/schema";
import { generateJSON, lastAiMeta, type AiMeta } from "@/lib/ai";
import { addDays, now, nowIso } from "@/lib/clock";
import { logActivity } from "@/lib/activity";
import { classifySchema, handoffSchema, type ClassifyResult } from "@/lib/types";
import { computeSnooze, mockClassify, mockHandoff } from "@/lib/pipeline/mocks";
import { classifyPrompt, handoffPrompt } from "@/lib/pipeline/prompts";
import { loadLeadContext } from "@/lib/pipeline";
import { cancelRemaining } from "@/lib/outreach/engine";

const STATUS_FOR: Record<ClassifyResult["classification"], LeadStatus | null> = {
  interested: "interested",
  not_now: "snoozed",
  wrong_person: "replied",
  out_of_office: null, // keep sequence alive, just pause it
  not_interested: "closed_lost",
  unsubscribe: "unsubscribed",
};

function validDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) || d <= now() ? null : d.toISOString();
}

export async function handleReply(leadId: number, body: string): Promise<{ result: ClassifyResult; meta: AiMeta; handoff: string | null }> {
  const { lead, company, primary } = loadLeadContext(leadId);
  const today = now();
  const raw = await generateJSON(classifyPrompt(body, today.toISOString()), classifySchema, {
    task: "classify",
    mock: () => mockClassify(body, today),
  });
  const meta = lastAiMeta();

  // Never trust the model's date math blindly: snoozes must be in the future.
  let snooze: string | null = null;
  if (raw.classification === "not_now") {
    snooze = validDate(raw.snooze_until) ?? computeSnooze(body, today) ?? addDays(today, 90).toISOString();
  } else if (raw.classification === "out_of_office") {
    snooze = validDate(raw.snooze_until) ?? addDays(today, 7).toISOString();
  }
  const result: ClassifyResult = { ...raw, snooze_until: snooze };

  db.insert(replies).values({
    leadId, body, receivedAt: nowIso(), classification: result.classification,
    snoozeUntil: snooze, classifierReason: result.reason,
  }).run();
  logActivity(leadId, "reply_received", `Reply from ${lead.contactName} classified as ${result.classification.replace("_", " ")}`);

  if (result.classification === "out_of_office") {
    // Pause: push any pending follow-ups to after the return date.
    const pending = db.select().from(emails).where(eq(emails.leadId, leadId)).all().filter((e) => e.status === "approved");
    pending.forEach((e, i) => {
      db.update(emails).set({ scheduledFor: addDays(new Date(snooze as string), i * 2).toISOString() }).where(eq(emails.id, e.id)).run();
    });
    logActivity(leadId, "sequence_paused", `Follow-ups paused until ${snooze?.slice(0, 10)}`);
  } else {
    const n = cancelRemaining(leadId, result.classification === "unsubscribe" ? "Unsubscribed" : "Sequence stopped: lead replied");
    if (n) logActivity(leadId, "sequence_stopped", `${n} remaining step${n === 1 ? "" : "s"} cancelled`);
  }

  const status = STATUS_FOR[result.classification];
  if (status) db.update(leads).set({ status }).where(eq(leads.id, leadId)).run();
  if (result.classification === "not_now") logActivity(leadId, "snoozed", `Snoozed until ${snooze?.slice(0, 10)}`);
  if (result.classification === "unsubscribe") logActivity(leadId, "unsubscribed", `${lead.contactEmail} added to suppression list`);

  let handoff: string | null = null;
  if (result.classification === "interested") {
    const h = await generateJSON(handoffPrompt(lead.contactName, company.name, body, primary), handoffSchema, {
      task: "handoff",
      mock: () => mockHandoff(lead.contactName, company.name, body, primary),
    });
    db.update(leads).set({ handoffSummary: h.summary, handoffNextStep: h.next_step }).where(eq(leads.id, leadId)).run();
    logActivity(leadId, "handoff", `${lead.contactName} handed off: ${h.next_step}`);
    handoff = h.summary;
  }
  return { result, meta, handoff };
}
