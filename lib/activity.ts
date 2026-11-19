import { db } from "@/lib/db/client";
import { activityLog } from "@/lib/db/schema";
import { nowIso } from "@/lib/clock";

export function logActivity(leadId: number | null, type: string, message: string) {
  db.insert(activityLog).values({ leadId, type, message, createdAt: nowIso() }).run();
}
