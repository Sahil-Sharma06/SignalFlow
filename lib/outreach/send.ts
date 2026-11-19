import type { Email, Lead } from "@/lib/db/schema";
import { getSettings } from "@/lib/settings";

export type SendMode = "dry-run" | "resend";

export function sendMode(): SendMode {
  return process.env.SEND_MODE === "resend" && process.env.RESEND_API_KEY ? "resend" : "dry-run";
}

function hashUnit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/** Simulated engagement for dry-run sends: higher-scoring leads open more, deterministic per email. */
export function simulateEngagement(email: Email, lead: Lead): { opened: boolean; clicked: boolean } {
  const pOpen = 0.35 + ((lead.score ?? 50) / 100) * 0.4;
  const opened = hashUnit(`open-${email.id}`) < pOpen;
  const clicked = opened && hashUnit(`click-${email.id}`) < 0.25;
  return { opened, clicked };
}

/** Deliver one email. Dry-run by default; real sends via Resend only when SEND_MODE=resend. */
export async function deliver(email: Email, lead: Lead): Promise<{ ok: true } | { ok: false; error: string }> {
  if (sendMode() === "dry-run") return { ok: true };
  const settings = getSettings();
  // Safety: real sends go to RESEND_TEST_TO unless explicitly allowed, since seed contacts are fictional.
  const to = process.env.RESEND_ALLOW_REAL_RECIPIENTS === "true" ? lead.contactEmail : process.env.RESEND_TEST_TO;
  if (!to) return { ok: false, error: "RESEND_TEST_TO is not set" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM ?? `Alex <alex@${settings.sendingDomain}>`,
      to: [to],
      subject: email.subject,
      text: `${email.body}\n\n—\nReply "unsubscribe" to stop receiving these emails.`,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return { ok: false, error: `Resend HTTP ${res.status}` };
  return { ok: true };
}
