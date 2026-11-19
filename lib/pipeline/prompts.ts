import type { Company, Lead, Signal } from "@/lib/db/schema";
import type { Icp, ResearchBrief } from "@/lib/types";

const signalLines = (signals: Signal[]) =>
  signals.map((s) => `- [${s.type}] ${s.description} (source: ${s.source}, detected ${s.detectedAt.slice(0, 10)})`).join("\n") || "- none";

export function researchPrompt(company: Company, signals: Signal[]): string {
  return `You are a B2B sales researcher. Write a concise research brief about this company for an outbound rep.
Only use the facts given. Do not invent numbers, customers, or quotes.

Company: ${company.name} (${company.domain})
Industry: ${company.industry}
Employees: ${company.size}
Location: ${company.location}
Website summary: ${company.websiteSummary}
Buying signals:
${signalLines(signals)}

Return JSON with exactly these keys:
{"summary": string (2 sentences), "industry": string, "scale": string (e.g. "mid-sized (~200 employees)"),
 "likely_needs": string[] (2-4 items, operational pains plausibly tied to the signals),
 "recent_moves": string[] (1-3 items, restating the signals), "why_now": string (1 sentence: why reach out this week)}`;
}

export function scorePrompt(company: Company, lead: Lead, brief: ResearchBrief, signals: Signal[], icp: Icp, todayIso: string): string {
  return `You are scoring an outbound lead against an Ideal Customer Profile (ICP). Be strict and explain every point.

ICP:
- Target industries: ${icp.industries.join(", ")}
- Target buyer titles: ${icp.titles.join(", ")}
- Company size: ${icp.sizeMin}-${icp.sizeMax} employees
- Geographies: ${icp.geographies.join(", ") || "any"}
- Typical deal size: $${icp.dealSize}
- Must-have signal types: ${icp.mustHaveSignals.join(", ") || "any"}
- Disqualifiers: ${icp.disqualifiers.join("; ") || "none"}

Lead:
- Contact title: ${lead.contactTitle}
- Company: ${company.name}, ${company.industry}, ${company.size} employees, ${company.location}
- Research: ${brief.summary} Needs: ${brief.likely_needs.join("; ")}
- Signals (today is ${todayIso.slice(0, 10)}):
${signalLines(signals)}

Use this rubric (max points): Industry fit 25, Buyer title 20, Company size 20, Geography 10, Buying signal 15, Signal recency 10.
If any disqualifier applies, set disqualified=true and cap the score at 10.
Return JSON: {"score": integer 0-100 (sum of points), "reasons": [{"criterion": string, "points": integer, "explanation": string}], "disqualified": boolean}`;
}

export function draftPrompt(opts: {
  contactName: string; contactTitle: string; company: Company; signal: Signal | null; brief: ResearchBrief | null;
  offer: string; senderCompany: string; step: number;
}): string {
  const { contactName, contactTitle, company, signal, brief, offer, senderCompany, step } = opts;
  const stepRule =
    step === 1 ? "This is the first email."
    : step === 2 ? "This is follow-up #1, sent 3 days after the first with no reply. Keep it to 2-3 sentences and add one new angle."
    : "This is the final follow-up, sent 7 days after the first. Politely close the loop in 2 sentences.";
  return `Write a cold outbound email from Alex at ${senderCompany}.
${stepRule}

Recipient: ${contactName}, ${contactTitle} at ${company.name} (${company.industry}, ${company.size} employees).
Triggering signal: ${signal ? `[${signal.type}] ${signal.description}` : "none"}
Research: ${brief ? `${brief.summary} Likely needs: ${brief.likely_needs.join("; ")}. Why now: ${brief.why_now}` : "none"}
What we offer: ${offer}

Rules:
- Under 120 words in the body.
- Reference the specific signal in the first line${step === 1 ? "" : " (or the earlier note)"}.
- Exactly one clear, low-friction call to action (e.g. a short call or "want me to send X?").
- No fake claims, no invented statistics or customer names, no hype words ("revolutionary", "game-changing").
- Plain text, sign off as "Alex".
Return JSON: {"subject": string (under 60 chars), "body": string}`;
}

export function classifyPrompt(body: string, todayIso: string): string {
  return `Classify this reply to a sales email. Today is ${todayIso.slice(0, 10)}.

Reply:
"""
${body}
"""

Classes:
- interested: wants to talk or asked for more information
- not_now: open but timing is wrong ("try again in Q2", "after our migration"). This is NOT a rejection.
- wrong_person: redirects to someone else
- out_of_office: auto-reply / away message
- not_interested: clear decline
- unsubscribe: asks to stop or be removed

For not_now and out_of_office, compute snooze_until as an ISO-8601 date when to follow up
(e.g. "Q2" means April 1 of the next upcoming Q2; "next month" means the 1st of next month; for OOO use the return date).
Otherwise snooze_until is null.
Return JSON: {"classification": string, "snooze_until": string | null, "reason": string (one sentence)}`;
}

export function handoffPrompt(contactName: string, companyName: string, reply: string, signal: Signal | null): string {
  return `A prospect replied positively to outbound. Write a handoff note for the account executive.
Prospect: ${contactName} at ${companyName}. Trigger signal: ${signal ? signal.description : "none"}.
Reply: """${reply}"""
Return JSON: {"summary": string (one line, under 25 words), "next_step": string (one concrete action)}`;
}
