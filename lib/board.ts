import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leads, type LeadStatus } from "@/lib/db/schema";
import { logActivity } from "@/lib/activity";
import { cancelRemaining } from "@/lib/outreach/engine";

export const BOARD_COLUMNS = [
  { id: "signal", label: "Signal", statuses: ["new"], target: "new" },
  { id: "researched", label: "Researched", statuses: ["researched", "scored", "drafted"], target: "researched" },
  { id: "contacted", label: "Contacted", statuses: ["contacted"], target: "contacted" },
  { id: "replied", label: "Replied", statuses: ["replied", "snoozed"], target: "replied" },
  { id: "interested", label: "Interested", statuses: ["interested"], target: "interested" },
  { id: "closed", label: "Closed", statuses: ["closed_lost", "unsubscribed"], target: "closed_lost" },
] as const satisfies readonly { id: string; label: string; statuses: readonly LeadStatus[]; target: LeadStatus }[];

export type BoardColumn = (typeof BOARD_COLUMNS)[number]["id"];

export function columnFor(status: LeadStatus): BoardColumn {
  return BOARD_COLUMNS.find((c) => (c.statuses as readonly LeadStatus[]).includes(status))?.id ?? "signal";
}

export function setLeadStage(leadId: number, column: BoardColumn): string {
  const col = BOARD_COLUMNS.find((c) => c.id === column);
  const lead = db.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!col || !lead) throw new Error("Lead or column not found");
  if (columnFor(lead.status) === column) return col.label;
  db.update(leads).set({ status: col.target }).where(eq(leads.id, leadId)).run();
  if (column === "closed" || column === "interested") cancelRemaining(leadId, `Moved to ${col.label} manually`);
  logActivity(leadId, "stage_changed", `Moved from ${lead.status.replace("_", " ")} to ${col.label} on the pipeline board`);
  return col.label;
}
