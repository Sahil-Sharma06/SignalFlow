import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { companies, emails, leads, replies } from "@/lib/db/schema";
import { getSettings } from "@/lib/settings";
import { logActivity } from "@/lib/activity";

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [headers.join(","), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(","))].join("\n");
}

export const exportKind = z.enum(["leads", "replies", "outcomes"]);

export function exportRows(kind: z.infer<typeof exportKind>): Record<string, unknown>[] {
  if (kind === "replies") {
    return db.select({
      reply_id: replies.id, lead_id: replies.leadId, contact: leads.contactName, company: companies.name,
      received_at: replies.receivedAt, classification: replies.classification, snooze_until: replies.snoozeUntil,
      reason: replies.classifierReason, body: replies.body,
    }).from(replies).innerJoin(leads, eq(replies.leadId, leads.id)).innerJoin(companies, eq(leads.companyId, companies.id))
      .orderBy(desc(replies.receivedAt)).all();
  }
  const rows = db.select({ lead: leads, company: companies }).from(leads).innerJoin(companies, eq(leads.companyId, companies.id)).all();
  if (kind === "leads") {
    return rows.map(({ lead, company }) => ({
      lead_id: lead.id, contact_name: lead.contactName, title: lead.contactTitle, email: lead.contactEmail,
      email_verified: lead.emailVerified, company: company.name, domain: company.domain, industry: company.industry,
      employees: company.size, location: company.location, status: lead.status, score: lead.score, created_at: lead.createdAt,
    }));
  }
  const sentByLead = new Map<number, { sent: number; opened: number }>();
  for (const e of db.select().from(emails).all()) {
    const cur = sentByLead.get(e.leadId) ?? { sent: 0, opened: 0 };
    if (e.status === "sent") cur.sent++;
    if (e.opened) cur.opened++;
    sentByLead.set(e.leadId, cur);
  }
  const lastReply = new Map<number, string>();
  for (const r of db.select().from(replies).orderBy(replies.receivedAt).all()) lastReply.set(r.leadId, r.classification);
  return rows.map(({ lead, company }) => ({
    lead_id: lead.id, company: company.name, contact: lead.contactName, status: lead.status, score: lead.score,
    emails_sent: sentByLead.get(lead.id)?.sent ?? 0, emails_opened: sentByLead.get(lead.id)?.opened ?? 0,
    last_reply: lastReply.get(lead.id) ?? "", handoff_next_step: lead.handoffNextStep ?? "",
  }));
}

const HUBSPOT_STAGE: Record<string, string> = {
  interested: "appointmentscheduled", replied: "qualifiedtobuy", contacted: "qualifiedtobuy",
  closed_lost: "closedlost", unsubscribed: "closedlost",
};

/** HubSpot-shaped payload (contact + company + deal with associations). */
export function hubspotPayload(leadId: number) {
  const row = db.select({ lead: leads, company: companies }).from(leads).innerJoin(companies, eq(leads.companyId, companies.id))
    .where(eq(leads.id, leadId)).get();
  if (!row) throw new Error("Lead not found");
  const { lead, company } = row;
  const [firstname, ...rest] = lead.contactName.split(" ");
  const { icp } = getSettings();
  return {
    source: "signalflow",
    contact: {
      properties: {
        email: lead.contactEmail, firstname, lastname: rest.join(" "), jobtitle: lead.contactTitle,
        lifecyclestage: lead.status === "interested" ? "salesqualifiedlead" : "lead",
        hs_lead_status: lead.status.toUpperCase(), signalflow_score: lead.score ?? 0,
      },
    },
    company: {
      properties: { name: company.name, domain: company.domain, industry: company.industry, numberofemployees: company.size, city: company.location },
    },
    deal: {
      properties: {
        dealname: `${company.name} — Signalflow`, dealstage: HUBSPOT_STAGE[lead.status] ?? "appointmentscheduled",
        pipeline: "default", amount: icp.dealSize, description: lead.handoffSummary ?? "",
      },
    },
    associations: [{ from: "contact", to: "company" }, { from: "deal", to: "contact" }],
  };
}

export async function pushToCrm(leadIds: number[]): Promise<{ pushed: number; target: string; mock: boolean; status?: number }> {
  const { webhookUrl } = getSettings();
  const payloads = leadIds.map(hubspotPayload);
  if (!webhookUrl) {
    for (const id of leadIds) logActivity(id, "crm_push", "Pushed to CRM (mock — no webhook configured)");
    return { pushed: payloads.length, target: "mock", mock: true };
  }
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ records: payloads }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
  for (const id of leadIds) logActivity(id, "crm_push", `Pushed to CRM webhook (${new URL(webhookUrl).host})`);
  return { pushed: payloads.length, target: new URL(webhookUrl).host, mock: false, status: res.status };
}
