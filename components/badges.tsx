import { cn } from "@/lib/utils";
import { label } from "@/lib/format";
import type { LeadStatus, ReplyClass, SignalType } from "@/lib/db/schema";
import { Briefcase, DollarSign, Building2, Rocket, UserPlus, FileText } from "lucide-react";

const pill = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap";

const SIGNAL_STYLE: Record<SignalType, { cls: string; Icon: typeof Briefcase }> = {
  hiring: { cls: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300", Icon: Briefcase },
  funding: { cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", Icon: DollarSign },
  expansion: { cls: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300", Icon: Building2 },
  product_launch: { cls: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300", Icon: Rocket },
  new_exec: { cls: "border-pink-500/30 bg-pink-500/10 text-pink-700 dark:text-pink-300", Icon: UserPlus },
  rfp: { cls: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300", Icon: FileText },
};

export function SignalBadge({ type }: { type: SignalType }) {
  const { cls, Icon } = SIGNAL_STYLE[type];
  return (
    <span className={cn(pill, cls)}>
      <Icon className="size-3" />
      {type === "rfp" ? "RFP" : label(type)}
    </span>
  );
}

const STATUS_STYLE: Record<LeadStatus, string> = {
  new: "border-border bg-muted text-muted-foreground",
  researched: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  scored: "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  drafted: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  contacted: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  replied: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  interested: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  snoozed: "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
  closed_lost: "border-zinc-500/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  unsubscribed: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return <span className={cn(pill, STATUS_STYLE[status])}>{label(status)}</span>;
}

const REPLY_STYLE: Record<ReplyClass, string> = {
  interested: STATUS_STYLE.interested,
  not_now: STATUS_STYLE.snoozed,
  wrong_person: STATUS_STYLE.replied,
  out_of_office: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  not_interested: STATUS_STYLE.closed_lost,
  unsubscribe: STATUS_STYLE.unsubscribed,
};

export function ReplyBadge({ cls }: { cls: ReplyClass }) {
  return <span className={cn(pill, REPLY_STYLE[cls])}>{label(cls)}</span>;
}

export function ScoreBadge({ score, disqualified }: { score: number | null; disqualified?: boolean }) {
  if (score === null) return <span className="text-xs text-muted-foreground">—</span>;
  const tone = disqualified
    ? "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30"
    : score >= 80 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
    : score >= 60 ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
    : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/30";
  return <span className={cn(pill, "tabular-nums", tone)}>{disqualified ? "DQ " : ""}{score}</span>;
}
