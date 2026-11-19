"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { outreachPrefsAction } from "@/app/actions";

export function AutoApprove({ enabled, threshold }: { enabled: boolean; threshold: number }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [on, setOn] = useState(enabled);
  const [value, setValue] = useState(threshold);

  const save = (p: { autoApproveEnabled?: boolean; autoApproveThreshold?: number }) =>
    start(async () => {
      const r = await outreachPrefsAction(p);
      if (r.ok) toast.success(p.autoApproveEnabled === undefined ? `Auto-approve threshold set to ${p.autoApproveThreshold}` : `Auto-approve ${p.autoApproveEnabled ? "on" : "off"}`);
      else toast.error(r.message);
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card px-4 py-3">
      <div className="flex items-center gap-2">
        <Switch id="auto" checked={on} onCheckedChange={(v) => { setOn(v); save({ autoApproveEnabled: v }); }} />
        <Label htmlFor="auto">Auto-approve drafts with score ≥</Label>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range" min={50} max={100} step={5} value={value} disabled={!on}
          onChange={(e) => setValue(Number(e.target.value))}
          onPointerUp={() => save({ autoApproveThreshold: value })}
          onKeyUp={() => save({ autoApproveThreshold: value })}
          className="w-36 accent-[var(--primary)] disabled:opacity-40"
          aria-label="Auto-approve threshold"
        />
        <span className="w-8 text-sm font-semibold tabular-nums">{value}</span>
      </div>
      <p className="text-xs text-muted-foreground">Applies to newly drafted sequences. Guardrails still apply.</p>
    </div>
  );
}
