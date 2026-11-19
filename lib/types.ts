import { z } from "zod";

export const icpSchema = z.object({
  industries: z.array(z.string().min(1)).min(1),
  titles: z.array(z.string().min(1)).min(1),
  sizeMin: z.number().int().min(1),
  sizeMax: z.number().int().min(1),
  geographies: z.array(z.string().min(1)),
  dealSize: z.number().int().min(0),
  mustHaveSignals: z.array(z.enum(["hiring", "funding", "expansion", "product_launch", "new_exec", "rfp"])),
  disqualifiers: z.array(z.string().min(1)),
});
export type Icp = z.infer<typeof icpSchema>;

export const researchSchema = z.object({
  summary: z.string().min(1),
  industry: z.string().min(1),
  scale: z.string().min(1),
  likely_needs: z.array(z.string()).min(1).max(6),
  recent_moves: z.array(z.string()).min(1).max(6),
  why_now: z.string().min(1),
});
export type ResearchBrief = z.infer<typeof researchSchema>;

export const scoreReasonSchema = z.object({
  criterion: z.string(),
  points: z.number(),
  explanation: z.string(),
});
export type ScoreReason = z.infer<typeof scoreReasonSchema>;

export const scoreSchema = z.object({
  score: z.number().min(0).max(100),
  reasons: z.array(scoreReasonSchema).min(1),
  disqualified: z.boolean(),
});
export type ScoreResult = z.infer<typeof scoreSchema>;

export const draftSchema = z.object({
  subject: z.string().min(1).max(120),
  body: z.string().min(1),
});
export type Draft = z.infer<typeof draftSchema>;

export const classifySchema = z.object({
  classification: z.enum(["interested", "not_now", "wrong_person", "out_of_office", "not_interested", "unsubscribe"]),
  snooze_until: z.string().nullable().optional(),
  reason: z.string().min(1),
});
export type ClassifyResult = z.infer<typeof classifySchema>;

export const handoffSchema = z.object({
  summary: z.string().min(1),
  next_step: z.string().min(1),
});
export type Handoff = z.infer<typeof handoffSchema>;
