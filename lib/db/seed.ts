import { eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import {
  COMPANY_SEEDS, DEFAULT_ICP, DEFAULT_SETTINGS, FIRST_NAMES, LAST_NAMES, REPLY_PRESETS,
  templatesFor, TITLES_BY_INDUSTRY, domainFor,
} from "./seed-data";
import { mockClassify, mockDraft, mockHandoff, mockResearch, mockScore } from "@/lib/pipeline/mocks";

type DB = BetterSQLite3Database<typeof schema>;
const DAY = 86_400_000;

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Stage = "new" | "researched" | "scored" | "drafted" | "contacted" | "replied" | "interested" | "snoozed" | "closed_lost" | "unsubscribed";
const STAGE_PLAN: Stage[] = [
  ...Array<Stage>(5).fill("new"),
  ...Array<Stage>(4).fill("researched"),
  ...Array<Stage>(4).fill("scored"),
  ...Array<Stage>(5).fill("drafted"),
  ...Array<Stage>(9).fill("contacted"),
  ...Array<Stage>(2).fill("replied"),
  ...Array<Stage>(5).fill("interested"),
  ...Array<Stage>(2).fill("snoozed"),
  ...Array<Stage>(2).fill("closed_lost"),
  ...Array<Stage>(1).fill("unsubscribed"),
];

const ORDER: Stage[] = ["new", "researched", "scored", "drafted", "contacted"];
const atLeast = (s: Stage, min: Stage) => {
  const i = ORDER.indexOf(s);
  return i === -1 ? true : i >= ORDER.indexOf(min);
};

export function seed(db: DB, opts: { log?: boolean } = {}) {
  const rand = rng(42);
  const pickOne = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();

  db.transaction((tx) => {
    for (const t of [schema.activityLog, schema.replies, schema.emails, schema.leads, schema.signals, schema.companies, schema.workspaceSettings, schema.aiCalls]) {
      tx.delete(t).run();
    }
    // Restart ids at 1 so demo URLs like /leads/1 are stable across reseeds.
    tx.run(sql`DELETE FROM sqlite_sequence`);

    tx.insert(schema.workspaceSettings).values({
      id: 1,
      ...DEFAULT_SETTINGS,
      icp: DEFAULT_ICP,
      dailySendCap: 40,
      warmupEnabled: true,
      autoApproveEnabled: false,
      autoApproveThreshold: 80,
      webhookUrl: null,
      simOffsetDays: 0,
      warmupStartedAt: iso(now - 14 * DAY),
    }).run();

    const companies = COMPANY_SEEDS.map((c) =>
      tx.insert(schema.companies).values({
        name: c.name, domain: domainFor(c.name), industry: c.industry, size: c.size,
        location: c.location, websiteSummary: c.summary,
      }).returning().get(),
    );

    // Signals: 1Ã¢â‚¬â€œ3 per company over the last 30 days, a handful in the last 24h.
    const signalsByCompany = new Map<number, schema.Signal[]>();
    const types = schema.SIGNAL_TYPES;
    let signalCount = 0;
    companies.forEach((c, idx) => {
      const n = 1 + Math.floor(rand() * 3);
      const list: schema.Signal[] = [];
      for (let i = 0; i < n; i++) {
        const type = pickOne(types);
        const tpl = pickOne(templatesFor(type, c.industry));
        const recent = idx % 7 === 0 && i === 0;
        const ageMs = recent ? rand() * 20 * 3_600_000 : (1 + rand() * 29) * DAY;
        list.push(tx.insert(schema.signals).values({
          companyId: c.id, type, description: tpl.text, source: tpl.source, detectedAt: iso(now - ageMs),
        }).returning().get());
        signalCount++;
      }
      list.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
      signalsByCompany.set(c.id, list);
    });
    // Top up so we always have 80+ signals.
    while (signalCount < 85) {
      const c = pickOne(companies);
      const type = pickOne(types);
      const tpl = pickOne(templatesFor(type, c.industry));
      const s = tx.insert(schema.signals).values({
        companyId: c.id, type, description: tpl.text, source: tpl.source, detectedAt: iso(now - (1 + rand() * 28) * DAY),
      }).returning().get();
      signalsByCompany.get(c.id)?.push(s);
      signalCount++;
    }

    const log = (leadId: number | null, type: string, message: string, at: number) =>
      tx.insert(schema.activityLog).values({ leadId, type, message, createdAt: iso(at) }).run();

    // Prefer ICP-ish companies for advanced stages so the demo funnel looks credible.
    const ranked = [...companies].sort((a, b) => {
      const fit = (c: schema.Company) => (c.industry === "SaaS" ? 0 : 1) + (c.size >= 50 && c.size <= 1000 ? 1 : 0);
      return fit(a) - fit(b) + (rand() - 0.5) * 2.5;
    });
    const chosen = ranked.slice(ranked.length - STAGE_PLAN.length);
    // Advanced stages last in the plan get the best-fit companies.
    let leadCount = 0;

    STAGE_PLAN.forEach((stage, i) => {
      const company = chosen[i];
      const sigs = signalsByCompany.get(company.id) ?? [];
      const signal = sigs[0] ?? null;
      const titles = TITLES_BY_INDUSTRY[company.industry as keyof typeof TITLES_BY_INDUSTRY];
      const contactName = `${FIRST_NAMES[(i * 7) % FIRST_NAMES.length]} ${LAST_NAMES[(i * 3 + 5) % LAST_NAMES.length]}`;
      const title = atLeast(stage, "contacted") ? titles[i % 4] : titles[(i * 5) % titles.length];
      const email = `${contactName.split(" ")[0].toLowerCase()}.${contactName.split(" ")[1].toLowerCase()}@${company.domain}`;
      const verified = rand() > 0.15 || atLeast(stage, "contacted");
      const createdMs = now - (1.5 + ((i * 5) % 13)) * DAY - rand() * DAY;

      const brief = stage === "new" ? null : mockResearch(company, sigs);
      const score = atLeast(stage, "scored") ? mockScore(company, title, sigs, DEFAULT_ICP, now) : null;

      const lead = tx.insert(schema.leads).values({
        companyId: company.id, signalId: signal?.id ?? null, contactName, contactTitle: title,
        contactEmail: email, emailVerified: verified, status: stage,
        score: score?.score ?? null, scoreReasons: score?.reasons ?? null, disqualified: score?.disqualified ?? false,
        researchBrief: brief, createdAt: iso(createdMs),
      }).returning().get();
      leadCount++;

      log(lead.id, "lead_created", `Lead created for ${contactName} at ${company.name} from ${signal?.type.replace("_", " ") ?? "manual"} signal`, createdMs);
      if (brief) log(lead.id, "researched", `AI research brief generated for ${company.name}`, createdMs + 2 * 3_600_000);
      if (score) log(lead.id, "scored", `Scored ${score.score}/100 against ICP`, createdMs + 3 * 3_600_000);

      if (!atLeast(stage, "drafted") && ORDER.includes(stage)) return;

      const draftArgs = { contactName, company, signal, brief, offer: DEFAULT_SETTINGS.offerDescription, senderCompany: DEFAULT_SETTINGS.companyName };
      const d1 = mockDraft({ ...draftArgs, step: 1 });
      log(lead.id, "drafted", "Outreach draft created (step 1)", createdMs + 4 * 3_600_000);

      if (stage === "drafted") {
        for (const step of [1, 2, 3]) {
          const d = step === 1 ? d1 : mockDraft({ ...draftArgs, step });
          tx.insert(schema.emails).values({ leadId: lead.id, step, subject: d.subject, body: d.body, status: "draft" }).run();
        }
        return;
      }

      // Contacted or beyond: step 1 sent, follow-ups at +3 and +7 days.
      const sent1 = createdMs + 0.5 * DAY;
      const steps = [1, 2, 3].map((step) => ({ step, at: sent1 + [0, 3, 7][step - 1] * DAY, draft: step === 1 ? d1 : mockDraft({ ...draftArgs, step }) }));
      const replied = !["contacted"].includes(stage);
      const replyAt = replied ? Math.min(now - 0.3 * DAY, sent1 + (1 + rand() * 3) * DAY) : Infinity;

      for (const s of steps) {
        const isSent = s.at <= now && s.at < replyAt;
        const cancelled = s.at >= replyAt;
        const opened = isSent && rand() < 0.62;
        tx.insert(schema.emails).values({
          leadId: lead.id, step: s.step, subject: s.draft.subject, body: s.draft.body,
          status: isSent ? "sent" : cancelled ? "skipped" : "approved",
          scheduledFor: iso(s.at), sentAt: isSent ? iso(s.at) : null,
          opened, clicked: opened && rand() < 0.25,
          blockReason: cancelled ? "Sequence stopped: lead replied" : null,
        }).run();
        if (isSent) {
          log(lead.id, "email_sent", `Step ${s.step} sent to ${contactName} (dry-run)`, s.at);
          if (opened) log(lead.id, "email_opened", `${contactName} opened step ${s.step}`, s.at + rand() * 6 * 3_600_000);
        }
      }

      if (!replied) return;
      const preset: keyof typeof REPLY_PRESETS =
        stage === "interested" ? "interested"
        : stage === "snoozed" ? "not_now"
        : stage === "closed_lost" ? "not_interested"
        : stage === "unsubscribed" ? "unsubscribe"
        : i % 2 ? "wrong_person" : "out_of_office";
      const body = REPLY_PRESETS[preset];
      const cls = mockClassify(body, new Date(replyAt));
      tx.insert(schema.replies).values({
        leadId: lead.id, body, receivedAt: iso(replyAt), classification: cls.classification,
        snoozeUntil: cls.snooze_until ?? null, classifierReason: cls.reason,
      }).run();
      log(lead.id, "reply_received", `Reply from ${contactName} classified as ${cls.classification.replace("_", " ")}`, replyAt);
      if (stage === "interested") {
        const h = mockHandoff(contactName, company.name, body, signal);
        tx.update(schema.leads).set({ handoffSummary: h.summary, handoffNextStep: h.next_step }).where(eq(schema.leads.id, lead.id)).run();
        log(lead.id, "handoff", `${contactName} handed off to sales: ${h.next_step}`, replyAt + 600_000);
      }
    });

    // Sprinkle signal-detection activity across the 14 days so the feed and chart look alive.
    for (let d = 0; d < 14; d++) {
      log(null, "signals_detected", `Detection run found ${2 + Math.floor(rand() * 6)} new buying signals`, now - d * DAY - rand() * 8 * 3_600_000);
    }

    if (opts.log) console.log(`Seeded ${companies.length} companies, ${signalCount} signals, ${leadCount} leads.`);
  });
}

