"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AiMeta } from "@/lib/ai";
import { draftLead, researchLead, rescoreAll, runFullPipeline, scoreLead } from "@/lib/pipeline";
import { advanceTime, approveLead, maybeAutoApprove, processDue, rejectLead, resetClock, updateDraft, verifyEmail } from "@/lib/outreach/engine";
import { handleReply } from "@/lib/replies";
import { createLeadFromSignal, runDetection } from "@/lib/signals";
import { pushToCrm } from "@/lib/crm";
import { settingsInputSchema, updateOutreachPrefs, updateSettings } from "@/lib/settings";
import { setLeadStage, type BoardColumn, BOARD_COLUMNS } from "@/lib/board";

export type ActionResult<T = undefined> =
  | { ok: true; message: string; data?: T; meta?: AiMeta }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

const id = z.coerce.number().int().positive();

function revalidateAll() {
  revalidatePath("/", "layout");
}

async function run<T>(fn: () => Promise<ActionResult<T>> | ActionResult<T>): Promise<ActionResult<T>> {
  try {
    const r = await fn();
    revalidateAll();
    return r;
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, message: e.issues.map((i) => i.message).join("; ") };
    return { ok: false, message: e instanceof Error ? e.message : "Something went wrong" };
  }
}

const metaNote = (m: AiMeta) => (m.source === "cache" ? " (cached)" : m.source === "mock" ? " (mock AI)" : "");

export async function researchAction(leadId: number) {
  return run(async () => {
    const r = await researchLead(id.parse(leadId));
    return { ok: true, message: `Research brief ready${metaNote(r.meta)}`, meta: r.meta };
  });
}

export async function scoreAction(leadId: number) {
  return run(async () => {
    const r = await scoreLead(id.parse(leadId));
    return { ok: true, message: `Scored ${r.value.score}/100${r.value.disqualified ? " — disqualified" : ""}${metaNote(r.meta)}`, meta: r.meta };
  });
}

export async function draftAction(leadId: number) {
  return run(async () => {
    const lid = id.parse(leadId);
    const r = await draftLead(lid);
    const auto = await maybeAutoApprove(lid);
    return { ok: true, message: `3-step sequence drafted${auto ? " and auto-approved" : ""}${metaNote(r.meta)}`, meta: r.meta };
  });
}

export async function runPipelineAction(leadId: number) {
  return run(async () => {
    const lid = id.parse(leadId);
    const r = await runFullPipeline(lid);
    const auto = r.value.disqualified ? false : await maybeAutoApprove(lid);
    return {
      ok: true,
      message: r.value.disqualified ? `Disqualified (score ${r.value.score}); not drafted` : `Researched, scored ${r.value.score} and drafted${auto ? " — auto-approved" : ""}`,
      meta: r.meta,
    };
  });
}

export async function rescoreAllAction() {
  return run(async () => {
    const r = await rescoreAll();
    return { ok: true, message: `Re-scored ${r.count} leads — ${r.changed} scores changed` };
  });
}

export async function saveSettingsAction(input: unknown): Promise<ActionResult> {
  const parsed = settingsInputSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[i.path.join(".")] = i.message;
    return { ok: false, message: "Please fix the highlighted fields", fieldErrors };
  }
  return run(() => {
    updateSettings(parsed.data);
    return { ok: true, message: "Settings saved. Re-score leads to apply the new ICP." };
  });
}

export async function outreachPrefsAction(input: unknown) {
  return run(() => {
    const p = z.object({ autoApproveEnabled: z.boolean().optional(), autoApproveThreshold: z.number().int().min(0).max(100).optional() }).parse(input);
    updateOutreachPrefs(p);
    return { ok: true, message: "Approval settings updated" };
  });
}

export async function updateDraftAction(input: unknown) {
  return run(() => {
    const p = z.object({ emailId: id, subject: z.string().trim().min(1).max(120), body: z.string().trim().min(1).max(2000) }).parse(input);
    updateDraft(p.emailId, p.subject, p.body);
    return { ok: true, message: "Draft saved" };
  });
}

export async function approveAction(leadId: number) {
  return run(async () => {
    const r = await approveLead(id.parse(leadId));
    const blocked = r.blocked[0];
    if (blocked) return { ok: false, message: `Approved, but send blocked: ${blocked.reason}` };
    return { ok: true, message: r.sent ? `Approved — step 1 sent (${r.sent})` : "Approved and queued" };
  });
}

export async function rejectAction(leadId: number) {
  return run(() => {
    rejectLead(id.parse(leadId));
    return { ok: true, message: "Draft rejected" };
  });
}

export async function processQueueAction() {
  return run(async () => {
    const r = await processDue();
    return { ok: true, message: `Sent ${r.sent}, blocked ${r.blocked.length}${r.bounced ? `, bounced ${r.bounced}` : ""}` };
  });
}

export async function advanceTimeAction(days: number) {
  return run(async () => {
    const d = z.number().min(0.25).max(90).parse(days);
    const r = await advanceTime(d);
    const parts = [`Advanced ${d} day${d === 1 ? "" : "s"}`, `${r.sent} sent`];
    if (r.blocked.length) parts.push(`${r.blocked.length} blocked`);
    if (r.woke) parts.push(`${r.woke} snooze${r.woke === 1 ? "" : "s"} ended`);
    return { ok: true, message: parts.join(" · ") };
  });
}

export async function resetClockAction() {
  return run(() => {
    resetClock();
    return { ok: true, message: "Clock reset to real time" };
  });
}

export async function verifyEmailAction(leadId: number) {
  return run(() => {
    const r = verifyEmail(id.parse(leadId));
    return r.valid ? { ok: true, message: "Email verified" } : { ok: false, message: "Email failed verification — sends will stay blocked" };
  });
}

export async function simulateReplyAction(input: unknown) {
  return run(async () => {
    const p = z.object({ leadId: id, body: z.string().trim().min(2).max(2000) }).parse(input);
    const r = await handleReply(p.leadId, p.body);
    const snooze = r.result.snooze_until ? ` until ${r.result.snooze_until.slice(0, 10)}` : "";
    return { ok: true, message: `Classified as ${r.result.classification.replace("_", " ")}${snooze}${metaNote(r.meta)}`, meta: r.meta };
  });
}

export async function runDetectionAction() {
  return run(async () => {
    const r = await runDetection();
    const extra = r.rss !== null ? ` (${r.rss} from RSS)` : r.rssError ? ` (RSS failed: ${r.rssError})` : "";
    return { ok: true, message: `Detected ${r.added} new signals${extra}` };
  });
}

export async function createLeadAction(signalId: number) {
  return run<{ leadId: number }>(() => {
    const r = createLeadFromSignal(id.parse(signalId));
    return { ok: true, message: r.created ? "Lead created" : "A lead already exists for this company", data: { leadId: r.leadId } };
  });
}

export async function pushCrmAction(leadIds: number[]) {
  return run(async () => {
    const ids = z.array(id).min(1).max(500).parse(leadIds);
    const r = await pushToCrm(ids);
    return { ok: true, message: r.mock ? `${r.pushed} records built (mock — set a webhook URL in Settings to send)` : `Pushed ${r.pushed} to ${r.target}` };
  });
}

export async function moveStageAction(input: unknown) {
  return run(() => {
    const p = z.object({ leadId: id, column: z.enum(BOARD_COLUMNS.map((c) => c.id) as [BoardColumn, ...BoardColumn[]]) }).parse(input);
    const label = setLeadStage(p.leadId, p.column);
    return { ok: true, message: `Moved to ${label}` };
  });
}
