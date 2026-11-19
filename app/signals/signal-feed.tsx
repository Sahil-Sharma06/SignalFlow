"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, UserPlus } from "lucide-react";
import { SignalBadge } from "@/components/badges";
import { ActionButton } from "@/components/action-button";
import { buttonVariants } from "@/components/ui/button";
import { createLeadAction } from "@/app/actions";
import { SIGNAL_TYPES, type SignalType } from "@/lib/db/schema";
import { label, relTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Row {
  id: number; type: SignalType; description: string; source: string; detectedAt: string; leadId: number | null;
  company: { name: string; industry: string; size: number; location: string };
}

export function SignalFeed({ rows, nowMs }: { rows: Row[]; nowMs: number }) {
  const router = useRouter();
  const [type, setType] = useState<SignalType | "all">("all");
  const [industry, setIndustry] = useState("all");
  const industries = useMemo(() => [...new Set(rows.map((r) => r.company.industry))], [rows]);
  const filtered = rows.filter((r) => (type === "all" || r.type === type) && (industry === "all" || r.company.industry === industry));
  const chip = (active: boolean) => cn("rounded-full border px-3 py-1 text-xs transition-colors", active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button className={chip(type === "all")} onClick={() => setType("all")}>All types</button>
        {SIGNAL_TYPES.map((t) => <button key={t} className={chip(type === t)} onClick={() => setType(t)}>{t === "rfp" ? "RFP" : label(t)}</button>)}
        <span className="mx-1 w-px bg-border" />
        <button className={chip(industry === "all")} onClick={() => setIndustry("all")}>All industries</button>
        {industries.map((i) => <button key={i} className={chip(industry === i)} onClick={() => setIndustry(i)}>{i}</button>)}
      </div>
      <div className="divide-y rounded-xl border bg-card">
        {filtered.map((s, i) => {
          const fresh = nowMs - new Date(s.detectedAt).getTime() < 3_600_000;
          return (
            <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 animate-in-up" style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
              <div className="w-32 shrink-0"><SignalBadge type={s.type} /></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">{s.company.name}</span>{" "}
                  <span className="text-muted-foreground">· {s.company.industry} · {s.company.size} emp · {s.company.location}</span>
                </p>
                <p className="text-sm text-muted-foreground">{s.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-right text-xs text-muted-foreground">
                  {fresh && <span className="mr-1.5 inline-block size-1.5 rounded-full bg-emerald-500 align-middle live-dot" />}
                  {relTime(s.detectedAt, nowMs)}<br />{s.source}
                </span>
                {s.leadId ? (
                  <Link href={`/leads/${s.leadId}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>View lead <ArrowUpRight /></Link>
                ) : (
                  <ActionButton
                    action={createLeadAction.bind(null, s.id)}
                    pending="Creating company, contact and lead…"
                    variant="outline"
                    icon={<UserPlus />}
                    onDone={(r) => {
                      const data = r.ok ? (r.data as { leadId: number } | undefined) : undefined;
                      if (data) router.push(`/leads/${data.leadId}`);
                    }}
                  >
                    Create lead
                  </ActionButton>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No signals match these filters.</p>}
      </div>
    </div>
  );
}
