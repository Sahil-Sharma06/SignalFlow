// Deterministic stand-ins for each AI step. They use the real inputs (company, signal, ICP)
// so the demo still behaves sensibly — e.g. editing the ICP changes mock scores.
import type { Company, Signal, SignalType, ReplyClass } from "@/lib/db/schema";
import type { ClassifyResult, Draft, Handoff, Icp, ResearchBrief, ScoreResult } from "@/lib/types";

const NEEDS: Record<string, string[]> = {
  "Industrial / HVAC": [
    "Faster quote turnaround for commercial jobs",
    "Technician scheduling across a growing service area",
    "Visibility into job margins by crew",
    "Reducing no-shows and repeat truck rolls",
  ],
  SaaS: [
    "Onboarding new sales hires quickly",
    "Pipeline visibility across a larger team",
    "Consistent outbound messaging at scale",
    "Shortening time from signup to first value",
  ],
  Logistics: [
    "Dispatch coordination across new lanes or sites",
    "Carrier and driver onboarding at volume",
    "Real-time shipment exception handling",
    "Standardizing operations across facilities",
  ],
};

const WHY_NOW: Record<SignalType, (s: Signal) => string> = {
  hiring: () => "They are adding headcount now, so process gaps show up before the new hires ramp.",
  funding: () => "Fresh capital usually comes with growth targets and a mandate to put tooling in place this quarter.",
  expansion: () => "Opening new locations stretches existing workflows; standardizing early is cheaper than retrofitting.",
  product_launch: () => "A launch creates a spike in demand and support load that current processes were not built for.",
  new_exec: () => "New leaders typically review the stack in their first 90 days and are open to changes.",
  rfp: () => "An active RFP means budget is approved and a decision timeline exists.",
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
}

function pick<T>(arr: T[], seed: string, n: number): T[] {
  const start = hash(seed) % arr.length;
  return Array.from({ length: Math.min(n, arr.length) }, (_, i) => arr[(start + i) % arr.length]);
}

export function sizeBand(size: number): string {
  if (size < 50) return "small (under 50 employees)";
  if (size < 250) return `mid-sized (~${size} employees)`;
  if (size < 1000) return `upper mid-market (~${size} employees)`;
  return `enterprise (~${size.toLocaleString("en-US")} employees)`;
}

export function mockResearch(company: Company, signalList: Signal[]): ResearchBrief {
  const primary = signalList[0];
  const needs = NEEDS[company.industry] ?? NEEDS.SaaS;
  return {
    summary: `${company.name} is a ${sizeBand(company.size)} ${company.industry.toLowerCase()} company based in ${company.location}. ${company.websiteSummary}`,
    industry: company.industry,
    scale: sizeBand(company.size),
    likely_needs: pick(needs, company.domain, 3),
    recent_moves: signalList.slice(0, 3).map((s) => s.description),
    why_now: primary ? WHY_NOW[primary.type](primary) : "No recent trigger found; timing is unclear.",
  };
}

const norm = (s: string) => s.toLowerCase().trim();

export function mockScore(company: Company, title: string, signalList: Signal[], icp: Icp, nowMs: number): ScoreResult {
  const reasons: ScoreResult["reasons"] = [];

  const industryHit = icp.industries.some((i) => norm(company.industry).includes(norm(i)) || norm(i).includes(norm(company.industry)));
  reasons.push({
    criterion: "Industry fit",
    points: industryHit ? 25 : 0,
    explanation: industryHit ? `${company.industry} is a target industry.` : `${company.industry} is not in the ICP industries (${icp.industries.join(", ")}).`,
  });

  const t = norm(title);
  const titleHit = icp.titles.some((x) => t.includes(norm(x)) || norm(x).includes(t));
  const titlePartial = !titleHit && icp.titles.some((x) => norm(x).split(/\s+/).some((w) => w.length > 3 && t.includes(w)));
  reasons.push({
    criterion: "Buyer title",
    points: titleHit ? 20 : titlePartial ? 10 : 0,
    explanation: titleHit ? `${title} matches a target title.` : titlePartial ? `${title} is adjacent to a target title.` : `${title} is not a target buyer.`,
  });

  const inRange = company.size >= icp.sizeMin && company.size <= icp.sizeMax;
  const near = !inRange && company.size >= icp.sizeMin / 2 && company.size <= icp.sizeMax * 2;
  reasons.push({
    criterion: "Company size",
    points: inRange ? 20 : near ? 8 : 0,
    explanation: inRange
      ? `${company.size} employees is within ${icp.sizeMin}–${icp.sizeMax}.`
      : `${company.size} employees is outside ${icp.sizeMin}–${icp.sizeMax}${near ? " (close)" : ""}.`,
  });

  const geoHit = icp.geographies.length === 0 || icp.geographies.some((g) => norm(company.location).includes(norm(g)));
  reasons.push({
    criterion: "Geography",
    points: geoHit ? 10 : 0,
    explanation: geoHit ? `${company.location} is in a target region.` : `${company.location} is outside ${icp.geographies.join(", ")}.`,
  });

  const mustHave = signalList.find((s) => icp.mustHaveSignals.includes(s.type));
  reasons.push({
    criterion: "Buying signal",
    points: mustHave ? 15 : signalList.length ? 5 : 0,
    explanation: mustHave
      ? `Has a priority signal: ${mustHave.type.replace("_", " ")}.`
      : signalList.length ? "Has a signal, but not one of the must-have types." : "No buying signal.",
  });

  const newest = signalList.reduce((m, s) => Math.max(m, new Date(s.detectedAt).getTime()), 0);
  const ageDays = newest ? (nowMs - newest) / 86_400_000 : Infinity;
  reasons.push({
    criterion: "Signal recency",
    points: ageDays <= 7 ? 10 : ageDays <= 30 ? 5 : 0,
    explanation: Number.isFinite(ageDays) ? `Most recent signal is ${Math.max(0, Math.round(ageDays))} days old.` : "No dated signal.",
  });

  const haystack = norm(`${company.name} ${company.industry} ${company.location} ${company.websiteSummary}`);
  const hit = icp.disqualifiers.find((d) => {
    const fewer = d.match(/fewer than\s+(\d+)/i);
    if (fewer) return company.size < Number(fewer[1]);
    return haystack.includes(norm(d));
  });
  let score = reasons.reduce((s, r) => s + r.points, 0);
  if (hit) {
    reasons.push({ criterion: "Disqualifier", points: -score + Math.min(score, 10), explanation: `Matches disqualifier "${hit}".` });
    score = Math.min(score, 10);
  }
  return { score: Math.max(0, Math.min(100, score)), reasons, disqualified: Boolean(hit) };
}

function firstName(full: string) {
  return full.split(" ")[0];
}

const SIGNAL_HOOK: Record<SignalType, string> = {
  hiring: "saw you're hiring",
  funding: "saw the funding news",
  expansion: "noticed the expansion",
  product_launch: "saw the launch",
  new_exec: "saw the leadership news",
  rfp: "saw the open RFP",
};

export function mockDraft(opts: {
  contactName: string;
  company: Company;
  signal: Signal | null;
  brief: ResearchBrief | null;
  offer: string;
  senderCompany: string;
  step: number;
}): Draft {
  const { contactName, company, signal, brief, offer, senderCompany, step } = opts;
  const need = brief?.likely_needs[0]?.toLowerCase() ?? "keeping operations smooth while growing";
  const hook = signal ? `I ${SIGNAL_HOOK[signal.type]} — ${signal.description.replace(/\.$/, "")}.` : `I came across ${company.name}.`;
  const name = firstName(contactName);
  if (step === 2) {
    return {
      subject: `Re: ${company.name} + ${senderCompany}`,
      body: `Hi ${name},\n\nFollowing up on my note. Teams in your spot often find ${need} becomes the bottleneck first.\n\nIf it's useful, I can send a one-page summary of how others handled it. Want me to?\n\nThanks,\nAlex`,
    };
  }
  if (step === 3) {
    return {
      subject: `Close the loop?`,
      body: `Hi ${name},\n\nI'll stop here so I'm not cluttering your inbox. If ${need} comes up later, just reply and I'll pick it back up.\n\nAll the best,\nAlex`,
    };
  }
  return {
    subject: `${company.name}: ${signal ? signal.type.replace("_", " ") : "quick question"}`,
    body: `Hi ${name},\n\n${hook} Moments like this usually put pressure on ${need}.\n\nAt ${senderCompany} we offer ${offer.charAt(0).toLowerCase()}${offer.slice(1).replace(/\.$/, "")}.\n\nWould a 15-minute call next week be worth it to see if it fits?\n\nBest,\nAlex`,
  };
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** Compute snooze dates from phrases like "Q2", "next month", "in 3 weeks", "after March". */
export function computeSnooze(text: string, now: Date): string | null {
  const t = text.toLowerCase();
  const q = t.match(/\bq([1-4])\b/);
  if (q) {
    const quarter = Number(q[1]);
    const startMonth = (quarter - 1) * 3;
    let year = now.getFullYear();
    if (new Date(year, startMonth, 1) <= now) year += 1;
    return new Date(year, startMonth, 1, 9).toISOString();
  }
  const inN = t.match(/in\s+(\d+|a|one|two|three|four|six)\s+(day|week|month)s?/);
  if (inN) {
    const words: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4, six: 6 };
    const n = Number(inN[1]) || words[inN[1]] || 1;
    const d = new Date(now);
    if (inN[2] === "day") d.setDate(d.getDate() + n);
    if (inN[2] === "week") d.setDate(d.getDate() + n * 7);
    if (inN[2] === "month") d.setMonth(d.getMonth() + n);
    return d.toISOString();
  }
  if (/next (month)/.test(t)) {
    return new Date(now.getFullYear(), now.getMonth() + 1, 1, 9).toISOString();
  }
  if (/next (quarter)/.test(t)) {
    const nextQ = Math.floor(now.getMonth() / 3) * 3 + 3;
    return new Date(now.getFullYear(), nextQ, 1, 9).toISOString();
  }
  if (/next year/.test(t)) return new Date(now.getFullYear() + 1, 0, 1, 9).toISOString();
  const m = MONTHS.findIndex((mo) => t.includes(mo));
  if (m >= 0) {
    let year = now.getFullYear();
    if (new Date(year, m, 1) <= now) year += 1;
    return new Date(year, m, 1, 9).toISOString();
  }
  return null;
}

export function mockClassify(body: string, now: Date): ClassifyResult {
  const t = body.toLowerCase();
  const rule = (classification: ReplyClass, reason: string, snooze: string | null = null): ClassifyResult => ({
    classification,
    reason,
    snooze_until: snooze,
  });
  if (/unsubscribe|remove me|stop emailing|take me off|opt out/.test(t)) return rule("unsubscribe", "Asked to be removed from outreach.");
  if (/out of (the )?office|ooo|on leave|vacation|annual leave|limited access to email/.test(t)) {
    const back = t.match(/(?:back|return(?:ing)?)\s+(?:on\s+)?([a-z]+\s+\d{1,2})/);
    let snooze = computeSnooze(t, now);
    if (back) {
      const parsed = new Date(`${back[1]} ${now.getFullYear()}`);
      if (!Number.isNaN(parsed.getTime())) snooze = (parsed < now ? new Date(parsed.setFullYear(now.getFullYear() + 1)) : parsed).toISOString();
    }
    return rule("out_of_office", "Auto-reply: contact is away. Follow-up paused until they return.", snooze ?? new Date(now.getTime() + 7 * 86_400_000).toISOString());
  }
  if (/wrong person|not the right person|not my area|you should (talk|reach|speak)|reach out to|better contact|handles this/.test(t)) {
    return rule("wrong_person", "Contact redirected us to someone else.");
  }
  const later = /not now|not right now|bad time|revisit|circle back|later this year|next (quarter|year|month)|\bq[1-4]\b|in \d+ (weeks|months)|after (january|february|march|april|may|june|july|august|september|october|november|december)/.test(t);
  if (later) {
    const snooze = computeSnooze(t, now) ?? new Date(now.getTime() + 90 * 86_400_000).toISOString();
    return rule("not_now", "Interested in principle but timing is wrong; snoozed rather than closed.", snooze);
  }
  if (/not interested|no thanks|no thank you|we('re| are) (all )?set|already (use|have)|not a fit|pass on this/.test(t)) {
    return rule("not_interested", "Explicitly declined.");
  }
  if (/interest(ed|ing)|let'?s (talk|chat|set|book)|sounds (good|great)|happy to|send (me|over|some|a few)?\s*(times|info|details)|send me|book a|calendar|tell me more|open to|worth a (call|chat)|a call|\byes\b|demo/.test(t)) {
    return rule("interested", "Positive intent: open to a conversation or asked for more info.");
  }
  return rule("not_interested", "No clear positive intent detected.");
}

export function mockHandoff(contactName: string, companyName: string, replyBody: string, signal: Signal | null): Handoff {
  const short = replyBody.replace(/\s+/g, " ").trim().slice(0, 90);
  return {
    summary: `${contactName} at ${companyName} replied positively${signal ? ` after the ${signal.type.replace("_", " ")} signal` : ""}: "${short}${replyBody.length > 90 ? "…" : ""}"`,
    next_step: /call|calendar|book|time|chat/.test(replyBody.toLowerCase())
      ? "Send 2–3 meeting times for a 20-minute discovery call this week."
      : "Reply with a one-page overview and propose a short call.",
  };
}
