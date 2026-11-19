import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { activityLog, aiCalls, companies, emails, leads, replies, signals, type LeadStatus } from "@/lib/db/schema";
import { addDays, now, startOfDay } from "@/lib/clock";
import { columnFor } from "@/lib/board";

const count = (q: { c: number } | undefined) => Number(q?.c ?? 0);

// List-price estimate (Gemini 2.5 Flash, USD per 1M tokens). The free tier costs $0; this shows production cost.
const PRICE_IN = 0.3;
const PRICE_OUT = 2.5;
const AVG_IN_TOKENS = 700;
const AVG_OUT_TOKENS = 250;

export function dashboardStats() {
  const n = now();
  const dayAgo = addDays(n, -1).toISOString();
  const signals24h = count(db.select({ c: sql<number>`count(*)` }).from(signals).where(gte(signals.detectedAt, dayAgo)).get());
  const totalSignals = count(db.select({ c: sql<number>`count(*)` }).from(signals).get());
  const researched = count(db.select({ c: sql<number>`count(*)` }).from(leads).where(isNotNull(leads.researchBrief)).get());
  const sent = count(db.select({ c: sql<number>`count(*)` }).from(emails).where(eq(emails.status, "sent")).get());
  const opened = count(db.select({ c: sql<number>`count(*)` }).from(emails).where(and(eq(emails.status, "sent"), eq(emails.opened, true))).get());
  const contactedLeads = count(db.select({ c: sql<number>`count(distinct ${emails.leadId})` }).from(emails).where(eq(emails.status, "sent")).get());
  const repliedLeads = count(db.select({ c: sql<number>`count(distinct ${replies.leadId})` }).from(replies).get());
  const interested = count(db.select({ c: sql<number>`count(*)` }).from(leads).where(eq(leads.status, "interested")).get());
  const totalLeads = count(db.select({ c: sql<number>`count(*)` }).from(leads).get());

  const funnel = [
    { stage: "Signals", value: totalSignals },
    { stage: "Researched", value: researched },
    { stage: "Contacted", value: contactedLeads },
    { stage: "Replied", value: repliedLeads },
    { stage: "Interested", value: interested },
  ];

  const start = startOfDay(addDays(n, -13));
  const sentRows = db.select({ at: emails.sentAt }).from(emails).where(and(eq(emails.status, "sent"), gte(emails.sentAt, start.toISOString()))).all();
  const replyRows = db.select({ at: replies.receivedAt }).from(replies).where(gte(replies.receivedAt, start.toISOString())).all();
  const series = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(start, i);
    const key = d.toDateString();
    return {
      day: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      sends: sentRows.filter((r) => r.at && new Date(r.at).toDateString() === key).length,
      replies: replyRows.filter((r) => new Date(r.at).toDateString() === key).length,
    };
  });

  const calls = db.select({ cached: aiCalls.cached, provider: aiCalls.provider, inC: aiCalls.promptChars, outC: aiCalls.outputChars }).from(aiCalls).all();
  const live = calls.filter((c) => !c.cached && c.provider !== "mock");
  const liveCost = live.reduce((s, c) => s + (c.inC / 4 / 1e6) * PRICE_IN + (c.outC / 4 / 1e6) * PRICE_OUT, 0);
  const drafted = count(db.select({ c: sql<number>`count(*)` }).from(emails).get());
  const scored = count(db.select({ c: sql<number>`count(*)` }).from(leads).where(isNotNull(leads.score)).get());
  const estimatedCalls = researched + scored + drafted + repliedLeads + interested;
  const perCall = (AVG_IN_TOKENS / 1e6) * PRICE_IN + (AVG_OUT_TOKENS / 1e6) * PRICE_OUT;
  const estimatedCost = estimatedCalls * perCall;

  return {
    kpis: {
      signals24h, researched, sent, totalLeads,
      openRate: sent ? opened / sent : 0,
      replyRate: contactedLeads ? repliedLeads / contactedLeads : 0,
      interested,
    },
    funnel,
    series,
    cost: {
      estimatedCalls,
      estimatedCost,
      costPerInterested: interested ? estimatedCost / interested : null,
      perCall,
      logged: {
        total: calls.length,
        live: live.length,
        cached: calls.filter((c) => c.cached).length,
        mock: calls.filter((c) => c.provider === "mock").length,
        liveCost,
      },
    },
  };
}

export function recentActivity(limit = 25) {
  return db.select({ a: activityLog, contactName: leads.contactName, company: companies.name })
    .from(activityLog)
    .leftJoin(leads, eq(activityLog.leadId, leads.id))
    .leftJoin(companies, eq(leads.companyId, companies.id))
    .orderBy(desc(activityLog.createdAt), desc(activityLog.id))
    .limit(limit)
    .all()
    .map((r) => ({ ...r.a, contactName: r.contactName, company: r.company }));
}

export function listSignals(limit = 150) {
  const rows = db.select({ s: signals, c: companies }).from(signals).innerJoin(companies, eq(signals.companyId, companies.id))
    .orderBy(desc(signals.detectedAt)).limit(limit).all();
  const leadByCompany = new Map(db.select({ id: leads.id, companyId: leads.companyId }).from(leads).all().map((l) => [l.companyId, l.id]));
  return rows.map((r) => ({ ...r.s, company: r.c, leadId: leadByCompany.get(r.c.id) ?? null }));
}

export type LeadRow = ReturnType<typeof listLeads>[number];

export function listLeads() {
  const rows = db.select({ l: leads, c: companies, s: signals }).from(leads)
    .innerJoin(companies, eq(leads.companyId, companies.id))
    .leftJoin(signals, eq(leads.signalId, signals.id))
    .orderBy(desc(leads.createdAt)).all();
  return rows.map((r) => ({
    id: r.l.id, contactName: r.l.contactName, contactTitle: r.l.contactTitle, status: r.l.status, score: r.l.score,
    disqualified: r.l.disqualified, emailVerified: r.l.emailVerified, createdAt: r.l.createdAt,
    company: r.c.name, industry: r.c.industry, signalType: r.s?.type ?? null, signalText: r.s?.description ?? null,
  }));
}

export function leadDetail(leadId: number) {
  const lead = db.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!lead) return null;
  const company = db.select().from(companies).where(eq(companies.id, lead.companyId)).get();
  if (!company) return null;
  return {
    lead,
    company,
    signals: db.select().from(signals).where(eq(signals.companyId, company.id)).orderBy(desc(signals.detectedAt)).all(),
    emails: db.select().from(emails).where(eq(emails.leadId, leadId)).orderBy(asc(emails.step), asc(emails.id)).all(),
    replies: db.select().from(replies).where(eq(replies.leadId, leadId)).orderBy(asc(replies.receivedAt)).all(),
    timeline: db.select().from(activityLog).where(eq(activityLog.leadId, leadId)).orderBy(desc(activityLog.createdAt), desc(activityLog.id)).all(),
  };
}

export function approvalQueue() {
  const drafts = db.select({ e: emails, l: leads, c: companies }).from(emails)
    .innerJoin(leads, eq(emails.leadId, leads.id)).innerJoin(companies, eq(leads.companyId, companies.id))
    .where(eq(emails.status, "draft")).orderBy(desc(leads.score), asc(emails.step)).all();
  const byLead = new Map<number, { lead: typeof leads.$inferSelect; company: typeof companies.$inferSelect; emails: (typeof emails.$inferSelect)[] }>();
  for (const d of drafts) {
    const cur = byLead.get(d.l.id) ?? { lead: d.l, company: d.c, emails: [] };
    cur.emails.push(d.e);
    byLead.set(d.l.id, cur);
  }
  return [...byLead.values()];
}

export function scheduledEmails() {
  return db.select({ e: emails, contactName: leads.contactName, company: companies.name, verified: leads.emailVerified })
    .from(emails).innerJoin(leads, eq(emails.leadId, leads.id)).innerJoin(companies, eq(leads.companyId, companies.id))
    .where(eq(emails.status, "approved")).orderBy(asc(emails.scheduledFor)).all()
    .map((r) => ({ ...r.e, contactName: r.contactName, company: r.company, verified: r.verified }));
}

export function recentSends(limit = 12) {
  return db.select({ e: emails, contactName: leads.contactName, company: companies.name })
    .from(emails).innerJoin(leads, eq(emails.leadId, leads.id)).innerJoin(companies, eq(leads.companyId, companies.id))
    .where(eq(emails.status, "sent")).orderBy(desc(emails.sentAt)).limit(limit).all()
    .map((r) => ({ ...r.e, contactName: r.contactName, company: r.company }));
}

export function inbox() {
  return db.select({ r: replies, l: leads, c: companies }).from(replies)
    .innerJoin(leads, eq(replies.leadId, leads.id)).innerJoin(companies, eq(leads.companyId, companies.id))
    .orderBy(desc(replies.receivedAt)).all()
    .map((x) => ({ ...x.r, lead: x.l, company: x.c.name }));
}

export function handoffs() {
  return db.select({ l: leads, c: companies }).from(leads).innerJoin(companies, eq(leads.companyId, companies.id))
    .where(eq(leads.status, "interested")).orderBy(desc(leads.score)).all()
    .map((x) => ({ ...x.l, company: x.c.name }));
}

/** Leads that can receive a simulated reply (have been emailed and aren't closed). */
export function replyableLeads() {
  const contacted: LeadStatus[] = ["contacted", "replied", "snoozed"];
  return db.select({ id: leads.id, contactName: leads.contactName, company: companies.name, status: leads.status })
    .from(leads).innerJoin(companies, eq(leads.companyId, companies.id))
    .where(inArray(leads.status, contacted)).orderBy(asc(companies.name)).all();
}

export function boardData() {
  return listLeads().map((l) => ({ ...l, column: columnFor(l.status) }));
}
