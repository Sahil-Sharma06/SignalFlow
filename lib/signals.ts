import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { companies, leads, signals, SIGNAL_TYPES, type SignalType } from "@/lib/db/schema";
import { now } from "@/lib/clock";
import { logActivity } from "@/lib/activity";
import { FIRST_NAMES, LAST_NAMES, templatesFor, TITLES_BY_INDUSTRY } from "@/lib/db/seed-data";

const KEYWORDS: [RegExp, SignalType][] = [
  [/\b(rfp|request for proposal|tender)\b/i, "rfp"],
  [/\b(raises?|raised|funding|series [a-e]|investment)\b/i, "funding"],
  [/\b(hiring|hires|job|recruit)/i, "hiring"],
  [/\b(appoints?|names?|new (ceo|coo|cro|vp))\b/i, "new_exec"],
  [/\b(launch(es|ed)?|unveils?|introduces?)\b/i, "product_launch"],
  [/\b(opens?|expands?|expansion|acquires?|new (site|facility|location))\b/i, "expansion"],
];

/** Optional live source: any RSS feed (e.g. a news search feed). Only items naming a known company become signals. */
async function fromRss(url: string): Promise<{ companyId: number; type: SignalType; description: string; source: string }[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
  const xml = await res.text();
  const titles = [...xml.matchAll(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g)].map((m) => m[1].trim());
  const all = db.select().from(companies).all();
  const out: { companyId: number; type: SignalType; description: string; source: string }[] = [];
  for (const t of titles) {
    const company = all.find((c) => t.toLowerCase().includes(c.name.toLowerCase()));
    const type = KEYWORDS.find(([re]) => re.test(t))?.[1];
    if (company && type) out.push({ companyId: company.id, type, description: t.slice(0, 200), source: "RSS" });
  }
  return out;
}

export async function runDetection(): Promise<{ added: number; rss: number | null; rssError?: string }> {
  const at = now().getTime();
  const all = db.select().from(companies).all();
  const n = 3 + Math.floor(Math.random() * 3);
  const rows: (typeof signals.$inferInsert)[] = [];
  for (let i = 0; i < n; i++) {
    const c = all[Math.floor(Math.random() * all.length)];
    const type = SIGNAL_TYPES[Math.floor(Math.random() * SIGNAL_TYPES.length)];
    const tpls = templatesFor(type, c.industry);
    const tpl = tpls[Math.floor(Math.random() * tpls.length)];
    rows.push({ companyId: c.id, type, description: tpl.text, source: tpl.source, detectedAt: new Date(at - i * 60_000).toISOString() });
  }

  let rss: number | null = null;
  let rssError: string | undefined;
  const feed = process.env.SIGNAL_RSS_URL;
  if (feed) {
    try {
      const items = await fromRss(feed);
      rss = items.length;
      rows.push(...items.map((it) => ({ ...it, detectedAt: new Date(at).toISOString() })));
    } catch (e) {
      rssError = e instanceof Error ? e.message : String(e);
    }
  }
  if (rows.length) db.insert(signals).values(rows).run();
  logActivity(null, "signals_detected", `Detection run found ${rows.length} new buying signals`);
  return { added: rows.length, rss, rssError };
}

export function createLeadFromSignal(signalId: number): { leadId: number; created: boolean } {
  const signal = db.select().from(signals).where(eq(signals.id, signalId)).get();
  if (!signal) throw new Error("Signal not found");
  const company = db.select().from(companies).where(eq(companies.id, signal.companyId)).get();
  if (!company) throw new Error("Company not found");
  const existing = db.select().from(leads).where(eq(leads.companyId, company.id)).get();
  if (existing) return { leadId: existing.id, created: false };

  const seed = company.id * 31 + signalId;
  const first = FIRST_NAMES[seed % FIRST_NAMES.length];
  const last = LAST_NAMES[(seed * 7) % LAST_NAMES.length];
  const titles = TITLES_BY_INDUSTRY[company.industry as keyof typeof TITLES_BY_INDUSTRY] ?? ["Director of Operations"];
  const lead = db.insert(leads).values({
    companyId: company.id,
    signalId,
    contactName: `${first} ${last}`,
    contactTitle: titles[seed % 3],
    contactEmail: `${first.toLowerCase()}.${last.toLowerCase()}@${company.domain}`,
    emailVerified: false,
    status: "new",
    createdAt: now().toISOString(),
  }).returning().get();
  logActivity(lead.id, "lead_created", `Lead created for ${lead.contactName} at ${company.name} from ${signal.type.replace("_", " ")} signal`);
  return { leadId: lead.id, created: true };
}
