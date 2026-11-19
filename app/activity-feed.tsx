"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Activity, Eye, Gauge, Handshake, Mail, MessageSquare, PenLine, Radar, Sparkles, UserPlus, Clock, Ban, Check } from "lucide-react";
import { relTime } from "@/lib/format";

const ICONS: Record<string, typeof Activity> = {
  signals_detected: Radar, lead_created: UserPlus, researched: Sparkles, scored: Gauge, rescored: Gauge, drafted: PenLine,
  approved: Check, email_sent: Mail, email_opened: Eye, email_clicked: Eye, reply_received: MessageSquare, handoff: Handshake,
  time_advanced: Clock, unsubscribed: Ban, bounced: Ban,
};

interface Item { id: number; type: string; message: string; createdAt: string; leadId: number | null }

export function ActivityFeed({ items, nowMs }: { items: Item[]; nowMs: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(t);
  }, [router]);

  return (
    <ol className="space-y-3">
      {items.map((a, i) => {
        const Icon = ICONS[a.type] ?? Activity;
        const body = (
          <div className="flex gap-3 animate-in-up" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-muted"><Icon className="size-3.5 text-muted-foreground" /></span>
            <div className="min-w-0">
              <p className="text-sm leading-snug">{a.message}</p>
              <p className="text-xs text-muted-foreground">{relTime(a.createdAt, nowMs)}</p>
            </div>
          </div>
        );
        return <li key={a.id}>{a.leadId ? <Link href={`/leads/${a.leadId}`} className="block rounded-md hover:bg-muted/50">{body}</Link> : body}</li>;
      })}
    </ol>
  );
}
