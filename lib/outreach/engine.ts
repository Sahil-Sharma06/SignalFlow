import { and, asc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { emails, leads, replies, workspaceSettings } from "@/lib/db/schema";
import { addDays, now, nowIso } from "@/lib/clock";
import { logActivity } from "@/lib/activity";
import { getSettings } from "@/lib/settings";
import { getGuardrails, sendBlockReason } from "./guardrails";
import { deliver, sendMode, simulateEngagement } from "./send";

export const FOLLOW_UP_DAYS: Record<number, number> = { 2: 3, 3: 7 };

function hashUnit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

export function updateDraft(emailId: number, subject: string, body: string) {
  const e = db.select().from(emails).where(eq(emails.id, emailId)).get();
  if (!e) throw new Error("Email not found");
  if (e.status === "sent") throw new Error("Email was already sent");
  db.update(emails).set({ subject, body }).where(eq(emails.id, emailId)).run();
}

/** Approve a lead's drafted sequence. Step 1 is due now; follow-ups are scheduled when step 1 sends. */
export async function approveLead(leadId: number, by: "user" | "auto" = "user") {
  const drafts = db.select().from(emails).where(and(eq(emails.leadId, leadId), eq(emails.status, "draft"))).all();
  if (!drafts.length) throw new Error("No drafts to approve");
  const at = nowIso();
  for (const d of drafts) {
    db.update(emails).set({ status: "approved", scheduledFor: d.step === 1 ? at : null, blockReason: null }).where(eq(emails.id, d.id)).run();
  }
  const lead = db.select().from(leads).where(eq(leads.id, leadId)).get();
  logActivity(leadId, "approved", by === "auto"
    ? `Sequence auto-approved (score ${lead?.score ?? "?"} ≥ threshold)`
    : `Sequence approved for ${lead?.contactName ?? "lead"}`);
  return processDue();
}

export function rejectLead(leadId: number) {
  db.update(emails).set({ status: "skipped", blockReason: "Rejected in approval queue" })
    .where(and(eq(emails.leadId, leadId), eq(emails.status, "draft"))).run();
  db.update(leads).set({ status: "scored" }).where(and(eq(leads.id, leadId), eq(leads.status, "drafted"))).run();
  logActivity(leadId, "rejected", "Draft rejected in approval queue");
}

/** Cancel all unsent steps for a lead (reply, unsubscribe, manual close). */
export function cancelRemaining(leadId: number, reason: string): number {
  const res = db.update(emails).set({ status: "skipped", blockReason: reason })
    .where(and(eq(emails.leadId, leadId), inArray(emails.status, ["draft", "approved"]))).run();
  return res.changes;
}

export interface ProcessResult {
  sent: number;
  blocked: { leadId: number; contactName: string; reason: string }[];
  bounced: number;
}

/** Send every approved email that is due, enforcing guardrails. */
export async function processDue(): Promise<ProcessResult> {
  const result: ProcessResult = { sent: 0, blocked: [], bounced: 0 };
  const due = db.select().from(emails)
    .where(and(eq(emails.status, "approved"), isNotNull(emails.scheduledFor), lte(emails.scheduledFor, nowIso())))
    .orderBy(asc(emails.scheduledFor), asc(emails.step))
    .all();

  for (const email of due) {
    const lead = db.select().from(leads).where(eq(leads.id, email.leadId)).get();
    if (!lead) continue;
    const replied = db.select({ id: replies.id }).from(replies).where(eq(replies.leadId, lead.id)).get();
    if (replied && lead.status !== "contacted") {
      cancelRemaining(lead.id, "Sequence stopped: lead replied");
      continue;
    }
    const g = getGuardrails();
    const reason = sendBlockReason(lead, g);
    if (reason) {
      db.update(emails).set({ blockReason: reason }).where(eq(emails.id, email.id)).run();
      result.blocked.push({ leadId: lead.id, contactName: lead.contactName, reason });
      continue;
    }
    const delivery = await deliver(email, lead);
    if (!delivery.ok) {
      db.update(emails).set({ blockReason: `Send failed: ${delivery.error}` }).where(eq(emails.id, email.id)).run();
      result.blocked.push({ leadId: lead.id, contactName: lead.contactName, reason: delivery.error });
      continue;
    }
    const sentAt = nowIso();
    const bounce = sendMode() === "dry-run" && email.step === 1 && hashUnit(`bounce-${lead.contactEmail}`) < 0.03;
    const engagement = bounce ? { opened: false, clicked: false } : simulateEngagement(email, lead);
    db.update(emails).set({ status: "sent", sentAt, blockReason: null, ...engagement }).where(eq(emails.id, email.id)).run();
    result.sent++;
    logActivity(lead.id, "email_sent", `Step ${email.step} sent to ${lead.contactName} (${sendMode()})`);

    if (bounce) {
      db.update(leads).set({ bounced: true }).where(eq(leads.id, lead.id)).run();
      cancelRemaining(lead.id, "Hard bounce");
      logActivity(lead.id, "bounced", `${lead.contactEmail} hard-bounced; sequence stopped`);
      result.bounced++;
      continue;
    }
    if (engagement.opened) logActivity(lead.id, "email_opened", `${lead.contactName} opened step ${email.step}`);
    if (engagement.clicked) logActivity(lead.id, "email_clicked", `${lead.contactName} clicked a link in step ${email.step}`);
    if (lead.status !== "contacted" && ["new", "researched", "scored", "drafted"].includes(lead.status)) {
      db.update(leads).set({ status: "contacted" }).where(eq(leads.id, lead.id)).run();
    }
    if (email.step === 1) {
      for (const [step, days] of Object.entries(FOLLOW_UP_DAYS)) {
        db.update(emails).set({ scheduledFor: addDays(new Date(sentAt), days).toISOString() })
          .where(and(eq(emails.leadId, lead.id), eq(emails.step, Number(step)), eq(emails.status, "approved"))).run();
      }
    }
  }
  return result;
}

/** Wake snoozed leads whose snooze date has passed. */
function wakeSnoozed(): number {
  const due = db.select({ leadId: replies.leadId, until: replies.snoozeUntil }).from(replies)
    .innerJoin(leads, eq(replies.leadId, leads.id))
    .where(and(eq(leads.status, "snoozed"), isNotNull(replies.snoozeUntil), lte(replies.snoozeUntil, nowIso())))
    .all();
  const ids = [...new Set(due.map((d) => d.leadId))];
  for (const id of ids) {
    db.update(leads).set({ status: "scored" }).where(eq(leads.id, id)).run();
    logActivity(id, "snooze_ended", "Snooze ended — lead is ready to re-engage");
  }
  return ids.length;
}

export async function advanceTime(days: number) {
  db.update(workspaceSettings).set({ simOffsetDays: sql`${workspaceSettings.simOffsetDays} + ${days}` })
    .where(eq(workspaceSettings.id, 1)).run();
  logActivity(null, "time_advanced", `Simulated clock advanced ${days} day${days === 1 ? "" : "s"}`);
  const woke = wakeSnoozed();
  const processed = await processDue();
  return { ...processed, woke, now: now().toISOString() };
}

export function resetClock() {
  db.update(workspaceSettings).set({ simOffsetDays: 0 }).where(eq(workspaceSettings.id, 1)).run();
}

/** Mock email verification (stands in for an MX/SMTP check provider). */
export function verifyEmail(leadId: number): { valid: boolean } {
  const lead = db.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!lead) throw new Error("Lead not found");
  const valid = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(lead.contactEmail) && hashUnit(`verify-${lead.contactEmail}`) > 0.08;
  db.update(leads).set({ emailVerified: valid }).where(eq(leads.id, leadId)).run();
  logActivity(leadId, "email_verified", valid ? `${lead.contactEmail} verified` : `${lead.contactEmail} failed verification`);
  return { valid };
}

export async function maybeAutoApprove(leadId: number): Promise<boolean> {
  const s = getSettings();
  if (!s.autoApproveEnabled) return false;
  const lead = db.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!lead || (lead.score ?? 0) < s.autoApproveThreshold || lead.disqualified) return false;
  await approveLead(leadId, "auto");
  return true;
}
