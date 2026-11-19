// Schema kept Postgres-compatible: integer PKs, ISO-8601 text timestamps,
// JSON stored as text (maps to jsonb), booleans as integers (maps to boolean).
import { sqliteTable, integer, text, real, index } from "drizzle-orm/sqlite-core";
import type { Icp, ResearchBrief, ScoreReason } from "@/lib/types";

export const SIGNAL_TYPES = ["hiring", "funding", "expansion", "product_launch", "new_exec", "rfp"] as const;
export const LEAD_STATUSES = [
  "new", "researched", "scored", "drafted", "contacted", "replied",
  "interested", "snoozed", "closed_lost", "unsubscribed",
] as const;
export const EMAIL_STATUSES = ["draft", "approved", "sent", "skipped"] as const;
export const REPLY_CLASSES = [
  "interested", "not_now", "wrong_person", "out_of_office", "not_interested", "unsubscribe",
] as const;

export const workspaceSettings = sqliteTable("workspace_settings", {
  id: integer("id").primaryKey(),
  companyName: text("company_name").notNull(),
  offerDescription: text("offer_description").notNull(),
  icp: text("icp", { mode: "json" }).$type<Icp>().notNull(),
  dailySendCap: integer("daily_send_cap").notNull().default(40),
  warmupEnabled: integer("warmup_enabled", { mode: "boolean" }).notNull().default(true),
  sendingDomain: text("sending_domain").notNull(),
  autoApproveEnabled: integer("auto_approve_enabled", { mode: "boolean" }).notNull().default(false),
  autoApproveThreshold: integer("auto_approve_threshold").notNull().default(80),
  webhookUrl: text("webhook_url"),
  simOffsetDays: real("sim_offset_days").notNull().default(0),
  warmupStartedAt: text("warmup_started_at").notNull(),
});

export const companies = sqliteTable("companies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  domain: text("domain").notNull().unique(),
  industry: text("industry").notNull(),
  size: integer("size").notNull(),
  location: text("location").notNull(),
  websiteSummary: text("website_summary").notNull(),
});

export const signals = sqliteTable("signals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().references(() => companies.id),
  type: text("type", { enum: SIGNAL_TYPES }).notNull(),
  description: text("description").notNull(),
  detectedAt: text("detected_at").notNull(),
  source: text("source").notNull(),
}, (t) => [index("signals_company_idx").on(t.companyId)]);

export const leads = sqliteTable("leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().references(() => companies.id),
  signalId: integer("signal_id").references(() => signals.id),
  contactName: text("contact_name").notNull(),
  contactTitle: text("contact_title").notNull(),
  contactEmail: text("contact_email").notNull(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  status: text("status", { enum: LEAD_STATUSES }).notNull().default("new"),
  score: integer("score"),
  scoreReasons: text("score_reasons", { mode: "json" }).$type<ScoreReason[]>(),
  disqualified: integer("disqualified", { mode: "boolean" }).notNull().default(false),
  researchBrief: text("research_brief", { mode: "json" }).$type<ResearchBrief>(),
  handoffSummary: text("handoff_summary"),
  handoffNextStep: text("handoff_next_step"),
  bounced: integer("bounced", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
}, (t) => [index("leads_status_idx").on(t.status)]);

export const emails = sqliteTable("emails", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id").notNull().references(() => leads.id),
  step: integer("step").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status", { enum: EMAIL_STATUSES }).notNull().default("draft"),
  scheduledFor: text("scheduled_for"),
  sentAt: text("sent_at"),
  opened: integer("opened", { mode: "boolean" }).notNull().default(false),
  clicked: integer("clicked", { mode: "boolean" }).notNull().default(false),
  blockReason: text("block_reason"),
}, (t) => [index("emails_lead_idx").on(t.leadId)]);

export const replies = sqliteTable("replies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id").notNull().references(() => leads.id),
  body: text("body").notNull(),
  receivedAt: text("received_at").notNull(),
  classification: text("classification", { enum: REPLY_CLASSES }).notNull(),
  snoozeUntil: text("snooze_until"),
  classifierReason: text("classifier_reason").notNull(),
});

export const activityLog = sqliteTable("activity_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id").references(() => leads.id),
  type: text("type").notNull(),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => [index("activity_created_idx").on(t.createdAt)]);

export const aiCache = sqliteTable("ai_cache", {
  key: text("key").primaryKey(),
  provider: text("provider").notNull(),
  response: text("response").notNull(),
  createdAt: text("created_at").notNull(),
});

export const aiCalls = sqliteTable("ai_calls", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  provider: text("provider").notNull(),
  task: text("task").notNull(),
  cached: integer("cached", { mode: "boolean" }).notNull(),
  promptChars: integer("prompt_chars").notNull(),
  outputChars: integer("output_chars").notNull(),
  createdAt: text("created_at").notNull(),
});

export type Company = typeof companies.$inferSelect;
export type Signal = typeof signals.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Email = typeof emails.$inferSelect;
export type Reply = typeof replies.$inferSelect;
export type Activity = typeof activityLog.$inferSelect;
export type Settings = typeof workspaceSettings.$inferSelect;
export type SignalType = (typeof SIGNAL_TYPES)[number];
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type ReplyClass = (typeof REPLY_CLASSES)[number];
