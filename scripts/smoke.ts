// End-to-end smoke test against a throwaway copy of the database.
import fs from "node:fs";
import path from "node:path";

const tmp = path.resolve("data/smoke.db");
for (const f of [tmp, `${tmp}-wal`, `${tmp}-shm`]) fs.rmSync(f, { force: true });
process.env.DATABASE_PATH = tmp;

function check(cond: unknown, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`ok   ${msg}`);
}

void (async () => {
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const pipeline = await import("@/lib/pipeline");
  const { getSettings, updateSettings } = await import("@/lib/settings");
  const { providerLabel } = await import("@/lib/ai");

  console.log(`provider: ${providerLabel().name}`);
  const fresh = db.select().from(schema.leads).where(eq(schema.leads.status, "new")).all();
  check(fresh.length > 0, "seed has new leads");
  const id = fresh[0].id;

  const r = await pipeline.researchLead(id);
  check(r.value.likely_needs.length > 0, `research produced brief (${r.meta.source})`);
  const s = await pipeline.scoreLead(id);
  check(s.value.score >= 0 && s.value.score <= 100 && s.value.reasons.length > 0, `score ${s.value.score} with ${s.value.reasons.length} reasons`);
  const d = await pipeline.draftLead(id);
  check(pipeline.wordCount(d.value.body) <= 120, `draft under 120 words (${pipeline.wordCount(d.value.body)})`);
  const drafts = db.select().from(schema.emails).where(eq(schema.emails.leadId, id)).all();
  check(drafts.length === 3, "3-step sequence drafted");

  // ICP change must change scores.
  const settings = getSettings();
  const saas = db.select().from(schema.leads).innerJoin(schema.companies, eq(schema.leads.companyId, schema.companies.id))
    .where(eq(schema.companies.industry, "SaaS")).get();
  if (saas) {
    const before = (await pipeline.scoreLead(saas.leads.id)).value.score;
    updateSettings({ ...settings, icp: { ...settings.icp, industries: [...settings.icp.industries, "SaaS"] } });
    const after = (await pipeline.scoreLead(saas.leads.id)).value.score;
    check(after > before, `adding SaaS to ICP raises SaaS lead score (${before} -> ${after})`);
    updateSettings(settings);
  }

  // Outreach: unverified emails are blocked with a reason.
  const engine = await import("@/lib/outreach/engine");
  db.update(schema.leads).set({ emailVerified: false }).where(eq(schema.leads.id, id)).run();
  const blocked = await engine.approveLead(id);
  check(blocked.sent === 0 && blocked.blocked[0]?.reason.includes("not verified"), "unverified email blocked with reason");
  db.update(schema.leads).set({ emailVerified: true, bounced: false }).where(eq(schema.leads.id, id)).run();
  const sent = await engine.processDue();
  const stepsFor = () => db.select().from(schema.emails).where(eq(schema.emails.leadId, id)).all().sort((a, b) => a.step - b.step);
  check(sent.sent === 1 && stepsFor()[0].status === "sent", "step 1 sends after verification");
  check(stepsFor()[1].scheduledFor !== null && stepsFor()[1].status === "approved", "step 2 scheduled");

  await engine.advanceTime(3.1);
  check(stepsFor()[1].status === "sent" && stepsFor()[2].status === "approved", "after 3 days step 2 sent, step 3 pending");

  // "Not now, try Q2" -> snoozed with a computed date, remaining steps cancelled.
  const { handleReply } = await import("@/lib/replies");
  const r1 = await handleReply(id, "Not now, we're mid-migration. Try me again in Q2.");
  const leadAfter = db.select().from(schema.leads).where(eq(schema.leads.id, id)).get();
  check(r1.result.classification === "not_now" && leadAfter?.status === "snoozed", "not-now reply snoozes the lead");
  const snoozeMonth = new Date(r1.result.snooze_until ?? "").getMonth();
  check(snoozeMonth === 3, `snooze computed to April 1 (${r1.result.snooze_until?.slice(0, 10)})`);
  check(stepsFor()[2].status === "skipped", "reply cancels remaining steps");

  // Interested reply creates handoff; unsubscribe blocks future sends.
  const contacted = db.select().from(schema.leads).where(eq(schema.leads.status, "contacted")).all();
  const r2 = await handleReply(contacted[0].id, "Sounds interesting, can you send times for a call?");
  check(r2.result.classification === "interested" && r2.handoff, "interested reply produces handoff summary");
  const r3 = await handleReply(contacted[1].id, "Please unsubscribe me.");
  const unsubLead = db.select().from(schema.leads).where(eq(schema.leads.id, contacted[1].id)).get();
  check(r3.result.classification === "unsubscribe" && unsubLead?.status === "unsubscribed", "unsubscribe reply suppresses lead");
  const g = (await import("@/lib/outreach/guardrails"));
  check(g.sendBlockReason(unsubLead as NonNullable<typeof unsubLead>, g.getGuardrails())?.includes("nsubscribe"), "unsubscribed lead blocked from sending");

  const crm = await import("@/lib/crm");
  check(crm.toCsv(crm.exportRows("leads")).split("\n").length > 30, "CSV export has rows");
  check(crm.hubspotPayload(id).contact.properties.email.endsWith(".example"), "HubSpot payload built");

  const det = await (await import("@/lib/signals")).runDetection();
  check(det.added >= 3, `detection added ${det.added} signals`);
  console.log("smoke test passed");
})();