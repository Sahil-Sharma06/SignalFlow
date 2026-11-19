import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { emails, leads, replies, type Lead } from "@/lib/db/schema";
import { now, startOfDay, addDays, DAY } from "@/lib/clock";
import { getSettings } from "@/lib/settings";

export const BOUNCE_LIMIT = 0.05;
export const WARMUP_START = 10;
export const WARMUP_STEP = 5;

export interface Guardrails {
  dailyCap: number;
  effectiveCap: number;
  warmupEnabled: boolean;
  warmupDay: number;
  sentToday: number;
  remainingToday: number;
  bounceRate: number;
  bounced: number;
  sentLeads: number;
  bounceBlocked: boolean;
  sendingDomain: string;
  dedicatedSubdomain: boolean;
  unverifiedQueued: number;
}

export function isDedicatedSubdomain(domain: string): boolean {
  return domain.split(".").filter(Boolean).length >= 3;
}

export function getGuardrails(): Guardrails {
  const s = getSettings();
  const today = startOfDay(now());
  const warmupDay = Math.max(1, Math.floor((now().getTime() - new Date(s.warmupStartedAt).getTime()) / DAY) + 1);
  const warm = WARMUP_START + WARMUP_STEP * (warmupDay - 1);
  const effectiveCap = s.warmupEnabled ? Math.min(s.dailySendCap, warm) : s.dailySendCap;

  const sentToday = db.select({ c: sql<number>`count(*)` }).from(emails)
    .where(and(eq(emails.status, "sent"), gte(emails.sentAt, today.toISOString()), lt(emails.sentAt, addDays(today, 1).toISOString())))
    .get()?.c ?? 0;

  const sentLeads = db.select({ c: sql<number>`count(distinct ${emails.leadId})` }).from(emails).where(eq(emails.status, "sent")).get()?.c ?? 0;
  const bounced = db.select({ c: sql<number>`count(*)` }).from(leads).where(eq(leads.bounced, true)).get()?.c ?? 0;
  const bounceRate = sentLeads ? bounced / sentLeads : 0;

  const unverifiedQueued = db.select({ c: sql<number>`count(distinct ${emails.leadId})` }).from(emails)
    .innerJoin(leads, eq(emails.leadId, leads.id))
    .where(and(eq(emails.status, "approved"), eq(leads.emailVerified, false)))
    .get()?.c ?? 0;

  return {
    dailyCap: s.dailySendCap,
    effectiveCap,
    warmupEnabled: s.warmupEnabled,
    warmupDay,
    sentToday,
    remainingToday: Math.max(0, effectiveCap - sentToday),
    bounceRate,
    bounced,
    sentLeads,
    bounceBlocked: bounceRate > BOUNCE_LIMIT,
    sendingDomain: s.sendingDomain,
    dedicatedSubdomain: isDedicatedSubdomain(s.sendingDomain),
    unverifiedQueued,
  };
}

/** Returns null if the email may be sent, otherwise a human-readable reason. */
export function sendBlockReason(lead: Lead, g: Guardrails): string | null {
  if (lead.status === "unsubscribed") return "Recipient unsubscribed — sending is permanently blocked.";
  const unsub = db.select({ id: replies.id }).from(replies)
    .where(and(eq(replies.leadId, lead.id), eq(replies.classification, "unsubscribe"))).get();
  if (unsub) return "Recipient asked to unsubscribe.";
  if (lead.bounced) return "Address previously bounced.";
  if (!lead.emailVerified) return "Email address is not verified. Verify it before sending.";
  if (!g.dedicatedSubdomain) return `Sending domain "${g.sendingDomain}" is not a dedicated subdomain; protect your root domain first.`;
  if (g.bounceBlocked) return `Bounce rate ${(g.bounceRate * 100).toFixed(1)}% exceeds ${BOUNCE_LIMIT * 100}% — sends paused.`;
  if (g.remainingToday <= 0) {
    return g.warmupEnabled && g.effectiveCap < g.dailyCap
      ? `Warm-up cap reached (${g.effectiveCap}/day on day ${g.warmupDay}). Will send tomorrow.`
      : `Daily send cap reached (${g.effectiveCap}/day). Will send tomorrow.`;
  }
  return null;
}
