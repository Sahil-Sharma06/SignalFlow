import { db } from "@/lib/db/client";
import { workspaceSettings } from "@/lib/db/schema";

const DAY = 86_400_000;

/** Simulated "now": real time plus the workspace's sim offset (advanced by "Simulate time passing"). */
export function now(): Date {
  const row = db.select({ o: workspaceSettings.simOffsetDays }).from(workspaceSettings).get();
  return new Date(Date.now() + (row?.o ?? 0) * DAY);
}

export function nowIso(): string {
  return now().toISOString();
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY);
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export { DAY };
