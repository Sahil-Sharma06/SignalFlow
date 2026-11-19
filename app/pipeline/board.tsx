"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DndContext, PointerSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { ScoreBadge, SignalBadge, StatusBadge } from "@/components/badges";
import { moveStageAction } from "@/app/actions";
import type { LeadStatus, SignalType } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

export interface BoardLead {
  id: number; contactName: string; company: string; score: number | null; disqualified: boolean;
  status: LeadStatus; signalType: SignalType | null; column: string;
}

function CardItem({ lead }: { lead: BoardLead }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={cn("rounded-lg border bg-card p-3 shadow-xs transition-shadow", isDragging && "z-50 shadow-lg ring-2 ring-primary/40")}
    >
      <div className="flex items-start gap-2">
        <button {...listeners} {...attributes} aria-label={`Drag ${lead.contactName}`} className="mt-0.5 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing">
          <GripVertical className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <Link href={`/leads/${lead.id}`} className="block truncate text-sm font-medium hover:text-primary">{lead.contactName}</Link>
          <p className="truncate text-xs text-muted-foreground">{lead.company}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {lead.signalType && <SignalBadge type={lead.signalType} />}
            <ScoreBadge score={lead.score} disqualified={lead.disqualified} />
            {["scored", "drafted", "snoozed", "unsubscribed"].includes(lead.status) && <StatusBadge status={lead.status} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function Column({ id, label, leads }: { id: string; label: string; leads: BoardLead[] }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn("flex min-w-52 flex-1 flex-col rounded-xl border bg-muted/30 p-2 transition-colors", isOver && "border-primary bg-primary/5")}>
      <div className="flex items-center justify-between px-1.5 pb-2 pt-1">
        <span className="text-sm font-medium">{label}</span>
        <span className="rounded-full bg-muted px-2 text-xs tabular-nums text-muted-foreground">{leads.length}</span>
      </div>
      <div className="flex min-h-24 flex-col gap-2">
        {leads.map((l) => <CardItem key={l.id} lead={l} />)}
        {leads.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Drop leads here</p>}
      </div>
    </div>
  );
}

export function Board({ columns, initial }: { columns: { id: string; label: string }[]; initial: BoardLead[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [leads, setLeads] = useState(initial);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));

  const onDragEnd = (e: DragEndEvent) => {
    const to = e.over?.id;
    const lead = leads.find((l) => l.id === e.active.id);
    if (!to || !lead || lead.column === to) return;
    const before = leads;
    setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, column: String(to) } : l)));
    start(async () => {
      const r = await moveStageAction({ leadId: lead.id, column: to });
      if (r.ok) toast.success(`${lead.contactName}: ${r.message}`);
      else {
        toast.error(r.message);
        setLeads(before);
      }
      router.refresh();
    });
  };

  return (
    <DndContext id="pipeline-board" sensors={sensors} onDragEnd={onDragEnd}>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
        {columns.map((c) => <Column key={c.id} id={c.id} label={c.label} leads={leads.filter((l) => l.column === c.id)} />)}
      </div>
    </DndContext>
  );
}
