"use client";

import { Clock, FastForward, RotateCcw } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { advanceTimeAction, resetClockAction } from "@/app/actions";

export function ClockBar({ nowIso, offsetDays, sendMode }: { nowIso: string; offsetDays: number; sendMode: string }) {
  const d = new Date(nowIso);
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-b bg-background/80 px-4 py-2 text-xs backdrop-blur md:px-8">
      <span className="mr-auto inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-muted-foreground">
        <span className="live-dot size-1.5 rounded-full bg-emerald-500" />
        Sending: <span className="font-medium text-foreground">{sendMode === "dry-run" ? "Dry-run" : "Resend (live)"}</span>
      </span>
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Clock className="size-3.5" />
        <span suppressHydrationWarning className="font-medium text-foreground tabular-nums">
          {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}{" "}
          {d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </span>
        {offsetDays > 0 && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-300">+{+offsetDays.toFixed(2)}d simulated</span>}
      </span>
      {[1, 3, 7].map((n) => (
        <ActionButton key={n} action={() => advanceTimeAction(n)} pending={`Advancing ${n} day${n > 1 ? "s" : ""}…`} variant="outline" size="xs" icon={<FastForward className="size-3" />}>
          +{n}d
        </ActionButton>
      ))}
      {offsetDays > 0 && (
        <ActionButton action={resetClockAction} pending="Resetting…" variant="ghost" size="xs" icon={<RotateCcw className="size-3" />}>
          Reset
        </ActionButton>
      )}
    </div>
  );
}
