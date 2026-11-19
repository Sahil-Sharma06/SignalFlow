"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MessageSquareReply } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { simulateReplyAction } from "@/app/actions";
import { REPLY_PRESETS } from "@/lib/db/seed-data";
import { label } from "@/lib/format";
import { cn } from "@/lib/utils";

type PresetKey = keyof typeof REPLY_PRESETS;
const ORDER: PresetKey[] = ["interested", "not_now", "wrong_person", "out_of_office", "unsubscribe", "not_interested"];

export function ReplySimulator({ leadId, leads }: { leadId?: number; leads?: { id: number; contactName: string; company: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<number | undefined>(leadId ?? leads?.[0]?.id);
  const [preset, setPreset] = useState<PresetKey | null>(null);
  const [body, setBody] = useState("");

  const submit = () => {
    if (!target) return toast.error("Pick a lead first");
    if (body.trim().length < 2) return toast.error("Write a reply or pick a preset");
    start(async () => {
      const id = toast.loading("Classifying reply with AI…");
      const r = await simulateReplyAction({ leadId: target, body });
      if (r.ok) {
        toast.success(r.message, { id });
        setBody("");
        setPreset(null);
      } else toast.error(r.message, { id });
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {leads && (
        <NativeSelect className="w-full" value={target ?? ""} onChange={(e) => setTarget(Number(e.target.value))} aria-label="Lead">
          {leads.length === 0 && <option value="">No contacted leads yet</option>}
          {leads.map((l) => <option key={l.id} value={l.id}>{l.contactName} · {l.company}</option>)}
        </NativeSelect>
      )}
      <div className="flex flex-wrap gap-1.5">
        {ORDER.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => { setPreset(k); setBody(REPLY_PRESETS[k]); }}
            className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors", preset === k ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}
          >
            {label(k)}
          </button>
        ))}
      </div>
      <Textarea rows={3} placeholder="…or type any reply. The AI classifies it." value={body} onChange={(e) => { setBody(e.target.value); setPreset(null); }} />
      <Button onClick={submit} disabled={pending || !target} size="sm" className="w-full">
        {pending ? <Loader2 className="animate-spin" /> : <MessageSquareReply />} Simulate reply
      </Button>
    </div>
  );
}
