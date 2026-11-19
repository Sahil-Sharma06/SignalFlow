import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { companies, emails, leads, signals, type Company, type Lead, type LeadStatus, type Signal } from "@/lib/db/schema";
import { generateJSON, lastAiMeta, type AiMeta } from "@/lib/ai";
import { now, nowIso } from "@/lib/clock";
import { getSettings } from "@/lib/settings";
import { logActivity } from "@/lib/activity";
import { draftSchema, researchSchema, scoreSchema, type ResearchBrief, type ScoreResult } from "@/lib/types";
import { mockDraft, mockResearch, mockScore } from "./mocks";
import { draftPrompt, researchPrompt, scorePrompt } from "./prompts";

export interface StepResult<T> {
  value: T;
  meta: AiMeta;
}

const PRE_CONTACT: LeadStatus[] = ["new", "researched", "scored", "drafted"];
const rank: Record<string, number> = { new: 0, researched: 1, scored: 2, drafted: 3 };

/** Move a pre-contact lead forward, never backwards and never out of contacted/replied states. */
function advance(lead: Lead, to: "researched" | "scored" | "drafted"): LeadStatus {
  if (!PRE_CONTACT.includes(lead.status)) return lead.status;
  return rank[to] > rank[lead.status] ? to : lead.status;
}

export function loadLeadContext(leadId: number): { lead: Lead; company: Company; signals: Signal[]; primary: Signal | null } {
  const lead = db.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!lead) throw new Error(`Lead ${leadId} not found`);
  const company = db.select().from(companies).where(eq(companies.id, lead.companyId)).get();
  if (!company) throw new Error(`Company ${lead.companyId} not found`);
  const sigs = db.select().from(signals).where(eq(signals.companyId, company.id)).orderBy(desc(signals.detectedAt)).all();
  const primary = sigs.find((s) => s.id === lead.signalId) ?? sigs[0] ?? null;
  const ordered = primary ? [primary, ...sigs.filter((s) => s.id !== primary.id)] : sigs;
  return { lead, company, signals: ordered, primary };
}

export async function researchLead(leadId: number): Promise<StepResult<ResearchBrief>> {
  const { lead, company, signals: sigs } = loadLeadContext(leadId);
  const brief = await generateJSON(researchPrompt(company, sigs.slice(0, 4)), researchSchema, {
    task: "research",
    mock: () => mockResearch(company, sigs),
  });
  const meta = lastAiMeta();
  db.update(leads).set({ researchBrief: brief, status: advance(lead, "researched") }).where(eq(leads.id, leadId)).run();
  logActivity(leadId, "researched", `AI research brief generated for ${company.name}`);
  return { value: brief, meta };
}

export async function scoreLead(leadId: number, opts: { log?: boolean } = {}): Promise<StepResult<ScoreResult>> {
  let ctx = loadLeadContext(leadId);
  if (!ctx.lead.researchBrief) {
    await researchLead(leadId);
    ctx = loadLeadContext(leadId);
  }
  const { lead, company, signals: sigs } = ctx;
  const brief = lead.researchBrief as ResearchBrief;
  const { icp } = getSettings();
  const today = now();
  const raw = await generateJSON(scorePrompt(company, lead, brief, sigs.slice(0, 4), icp, today.toISOString()), scoreSchema, {
    task: "score",
    mock: () => mockScore(company, lead.contactTitle, sigs, icp, today.getTime()),
  });
  const meta = lastAiMeta();
  const result: ScoreResult = { ...raw, score: Math.round(raw.disqualified ? Math.min(raw.score, 10) : raw.score) };
  db.update(leads)
    .set({ score: result.score, scoreReasons: result.reasons, disqualified: result.disqualified, status: advance(lead, "scored") })
    .where(eq(leads.id, leadId))
    .run();
  if (opts.log !== false) logActivity(leadId, "scored", `Scored ${result.score}/100 against ICP${result.disqualified ? " (disqualified)" : ""}`);
  return { value: result, meta };
}

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Draft the full 3-step sequence. Replaces any unsent drafts. */
export async function draftLead(leadId: number): Promise<StepResult<{ subject: string; body: string }>> {
  const ctx = loadLeadContext(leadId);
  const { lead, company, primary } = ctx;
  if (["unsubscribed", "closed_lost"].includes(lead.status)) throw new Error(`Lead is ${lead.status.replace("_", " ")}; drafting is blocked.`);
  const settings = getSettings();
  const brief = lead.researchBrief ?? null;
  let firstMeta: AiMeta | null = null;
  let first: { subject: string; body: string } | null = null;

  const drafts: { step: number; subject: string; body: string }[] = [];
  for (const step of [1, 2, 3]) {
    const args = {
      contactName: lead.contactName, contactTitle: lead.contactTitle, company, signal: primary, brief,
      offer: settings.offerDescription, senderCompany: settings.companyName, step,
    };
    const schema = draftSchema.refine((d) => wordCount(d.body) <= 120, { message: "body must be under 120 words", path: ["body"] });
    const d = await generateJSON(draftPrompt(args), schema, { task: "draft", mock: () => mockDraft(args) });
    if (step === 1) {
      firstMeta = lastAiMeta();
      first = d;
    }
    drafts.push({ step, ...d });
  }

  db.transaction((tx) => {
    tx.delete(emails).where(and(eq(emails.leadId, leadId), inArray(emails.status, ["draft", "approved"]))).run();
    for (const d of drafts) {
      tx.insert(emails).values({ leadId, step: d.step, subject: d.subject, body: d.body, status: "draft" }).run();
    }
    tx.update(leads).set({ status: advance(lead, "drafted") }).where(eq(leads.id, leadId)).run();
  });
  logActivity(leadId, "drafted", `3-step outreach sequence drafted for ${lead.contactName}`);
  return { value: first ?? drafts[0], meta: firstMeta ?? lastAiMeta() };
}

/** Run every remaining step for a lead: research → score → draft. */
export async function runFullPipeline(leadId: number) {
  const { lead } = loadLeadContext(leadId);
  if (!lead.researchBrief) await researchLead(leadId);
  const score = await scoreLead(leadId);
  if (!score.value.disqualified) await draftLead(leadId);
  return score;
}

export async function rescoreAll(): Promise<{ count: number; changed: number }> {
  const rows = db.select({ id: leads.id, score: leads.score }).from(leads).all();
  let changed = 0;
  for (const r of rows) {
    const res = await scoreLead(r.id, { log: false });
    if (res.value.score !== r.score) changed++;
  }
  logActivity(null, "rescored", `Re-scored ${rows.length} leads against the updated ICP (${changed} changed)`);
  return { count: rows.length, changed };
}

export { nowIso };
