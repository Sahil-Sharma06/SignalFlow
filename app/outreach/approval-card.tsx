"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, Save, X, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScoreBadge, SignalBadge } from "@/components/badges";
import { approveAction, rejectAction, updateDraftAction, verifyEmailAction } from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import type { SignalType } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

interface DraftEmail { id: number; step: number; subject: string; body: string }

export function ApprovalCard(props: {
  leadId: number; contactName: string; contactTitle: string; company: string; score: number | null; verified: boolean;
  signal: { type: SignalType; description: string } | null; emails: DraftEmail[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState(props.emails[0]?.step ?? 1);
  const [edits, setEdits] = useState<Record<number, { subject: string; body: string }>>(
    Object.fromEntries(props.emails.map((e) => [e.id, { subject: e.subject, body: e.body }])),
  );
  const current = props.emails.find((e) => e.step === step) ?? props.emails[0];
  const edit = edits[current.id];
  const dirty = props.emails.some((e) => edits[e.id].subject !== e.subject || edits[e.id].body !== e.body);
  const words = edit.body.trim().split(/\s+/).filter(Boolean).length;

  const saveAll = async () => {
    for (const e of props.emails) {
      const x = edits[e.id];
      if (x.subject !== e.subject || x.body !== e.body) {
        const r = await updateDraftAction({ emailId: e.id, ...x });
        if (!r.ok) throw new Error(r.message);
      }
    }
  };

  const act = (kind: "save" | "approve" | "reject") =>
    start(async () => {
      const id = toast.loading(kind === "approve" ? "Approving and sending step 1…" : kind === "reject" ? "Rejecting…" : "Saving…");
      try {
        if (kind !== "reject") await saveAll();
        const r = kind === "approve" ? await approveAction(props.leadId) : kind === "reject" ? await rejectAction(props.leadId) : { ok: true as const, message: "Draft saved" };
        if (r.ok) toast.success(r.message, { id });
        else toast.error(r.message, { id });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed", { id });
      }
      router.refresh();
    });

  return (
    <div className="rounded-xl border bg-card p-4 animate-in-up">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={`/leads/${props.leadId}`} className="font-medium hover:text-primary">{props.contactName}</Link>
          <p className="text-xs text-muted-foreground">{props.contactTitle} · {props.company}</p>
        </div>
        <div className="flex items-center gap-2">
          {props.signal && <SignalBadge type={props.signal.type} />}
          <ScoreBadge score={props.score} />
        </div>
      </div>
      {props.signal && <p className="mt-2 text-xs text-muted-foreground">Signal: {props.signal.description}</p>}

      <div className="mt-3 flex gap-1 rounded-lg bg-muted p-1 text-xs">
        {props.emails.map((e) => (
          <button key={e.id} onClick={() => setStep(e.step)} className={cn("flex-1 rounded-md px-2 py-1 transition-colors", step === e.step ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}>
            Step {e.step} {e.step === 1 ? "· now" : e.step === 2 ? "· +3d" : "· +7d"}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        <Input value={edit.subject} onChange={(e) => setEdits((p) => ({ ...p, [current.id]: { ...edit, subject: e.target.value } }))} aria-label="Subject" />
        <Textarea rows={7} value={edit.body} onChange={(e) => setEdits((p) => ({ ...p, [current.id]: { ...edit, body: e.target.value } }))} aria-label="Body" />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className={cn(words > 120 ? "text-red-600" : "text-muted-foreground")}>{words}/120 words</span>
          {!props.verified && (
            <span className="inline-flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <CircleAlert className="size-3" /> Email unverified — send will be blocked
              <ActionButton action={verifyEmailAction.bind(null, props.leadId)} pending="Verifying…" variant="outline" size="xs">Verify</ActionButton>
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => act("reject")} disabled={pending}><X /> Reject</Button>
        {dirty && <Button variant="outline" size="sm" onClick={() => act("save")} disabled={pending}><Save /> Save</Button>}
        <Button size="sm" onClick={() => act("approve")} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Check />} Approve sequence</Button>
      </div>
    </div>
  );
}
