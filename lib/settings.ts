import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { workspaceSettings, type Settings } from "@/lib/db/schema";
import { icpSchema } from "@/lib/types";

export function getSettings(): Settings {
  const row = db.select().from(workspaceSettings).where(eq(workspaceSettings.id, 1)).get();
  if (!row) throw new Error("Workspace settings missing. Run `npm run seed`.");
  return row;
}

export const settingsInputSchema = z.object({
  companyName: z.string().trim().min(1).max(100),
  offerDescription: z.string().trim().min(10).max(600),
  icp: icpSchema.refine((v) => v.sizeMax >= v.sizeMin, { message: "Max size must be ≥ min size", path: ["sizeMax"] }),
  dailySendCap: z.number().int().min(1).max(500),
  warmupEnabled: z.boolean(),
  sendingDomain: z.string().trim().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i, "Enter a domain like outreach.example.com"),
  webhookUrl: z.union([z.string().trim().url(), z.literal("")]).transform((v) => v || null),
});
export type SettingsInput = z.input<typeof settingsInputSchema>;

export function updateSettings(input: z.output<typeof settingsInputSchema>) {
  db.update(workspaceSettings).set(input).where(eq(workspaceSettings.id, 1)).run();
}

export function updateOutreachPrefs(prefs: { autoApproveEnabled?: boolean; autoApproveThreshold?: number }) {
  db.update(workspaceSettings).set(prefs).where(eq(workspaceSettings.id, 1)).run();
}
