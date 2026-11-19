"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search, Download, Upload, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/native-select";
import { ScoreBadge, SignalBadge, StatusBadge } from "@/components/badges";
import { ActionButton } from "@/components/action-button";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { pushCrmAction } from "@/app/actions";
import { LEAD_STATUSES, SIGNAL_TYPES } from "@/lib/db/schema";
import type { LeadRow } from "@/lib/queries";
import { label } from "@/lib/format";

type SortKey = "contactName" | "company" | "score" | "status" | "createdAt";

export function LeadsTable({ rows, initialStatus }: { rows: LeadRow[]; initialStatus?: string }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState((LEAD_STATUSES as readonly string[]).includes(initialStatus ?? "") ? (initialStatus as string) : "all");
  const [signal, setSignal] = useState("all");
  const [minScore, setMinScore] = useState(0);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "score", dir: -1 });

  const filtered = useMemo(() => {
    const needle = q.toLowerCase();
    return rows
      .filter((r) => status === "all" || r.status === status)
      .filter((r) => signal === "all" || r.signalType === signal)
      .filter((r) => (r.score ?? 0) >= minScore)
      .filter((r) => !needle || `${r.contactName} ${r.company} ${r.contactTitle}`.toLowerCase().includes(needle))
      .sort((a, b) => {
        const av = a[sort.key] ?? -1;
        const bv = b[sort.key] ?? -1;
        return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
      });
  }, [rows, q, status, signal, minScore, sort]);

  const header = (key: SortKey, text: string) => {
    const Icon = sort.key !== key ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
    return (
      <TableHead>
        <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))}>
          {text} <Icon className="size-3 opacity-60" />
        </button>
      </TableHead>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search name, company, title" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="all">All statuses</option>
          {LEAD_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </NativeSelect>
        <NativeSelect value={signal} onChange={(e) => setSignal(e.target.value)} aria-label="Signal type">
          <option value="all">All signals</option>
          {SIGNAL_TYPES.map((s) => <option key={s} value={s}>{s === "rfp" ? "RFP" : label(s)}</option>)}
        </NativeSelect>
        <NativeSelect value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} aria-label="Minimum score">
          {[0, 40, 60, 80].map((v) => <option key={v} value={v}>{v ? `Score ≥ ${v}` : "Any score"}</option>)}
        </NativeSelect>
        <div className="ml-auto flex gap-2">
          <a href="/api/export?kind=leads" className={buttonVariants({ variant: "outline", size: "sm" })}><Download /> CSV</a>
          <ActionButton action={() => pushCrmAction(filtered.map((r) => r.id))} pending="Pushing to CRM…" variant="outline" icon={<Upload />} disabled={!filtered.length}>
            Push {filtered.length} to CRM
          </ActionButton>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="No leads match" body="Try clearing filters, or create leads from the Signals feed." action={<Link className={buttonVariants({ size: "sm" })} href="/signals">Go to Signals</Link>} />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                {header("contactName", "Contact")}
                {header("company", "Company")}
                <TableHead>Signal</TableHead>
                {header("score", "Score")}
                {header("status", "Status")}
                {header("createdAt", "Created")}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id} className="cursor-pointer">
                  <TableCell>
                    <Link href={`/leads/${r.id}`} className="block">
                      <div className="font-medium hover:text-primary">{r.contactName}</div>
                      <div className="text-xs text-muted-foreground">{r.contactTitle}</div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div>{r.company}</div>
                    <div className="text-xs text-muted-foreground">{r.industry}</div>
                  </TableCell>
                  <TableCell>{r.signalType ? <SignalBadge type={r.signalType} /> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell><ScoreBadge score={r.score} disqualified={r.disqualified} /></TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{filtered.length} of {rows.length} leads</p>
    </div>
  );
}
