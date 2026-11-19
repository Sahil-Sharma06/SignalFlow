import { Radar } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/empty-state";
import { ActionButton } from "@/components/action-button";
import { runDetectionAction } from "@/app/actions";
import { listSignals } from "@/lib/queries";
import { now } from "@/lib/clock";
import { SignalFeed } from "./signal-feed";

export default function SignalsPage() {
  const rows = listSignals();
  const nowMs = now().getTime();
  return (
    <>
      <PageHeader
        title="Signals"
        description="Buying signals detected across your market: hiring, funding, expansion, launches, new execs and RFPs."
        actions={<ActionButton action={runDetectionAction} pending="Scanning sources for signals…" icon={<Radar />}>Run detection</ActionButton>}
      />
      {rows.length === 0 ? (
        <EmptyState icon={Radar} title="No signals yet" body="Run detection to scan the seeded source pool (and your RSS feed, if configured)."
          action={<ActionButton action={runDetectionAction} pending="Scanning…" icon={<Radar />}>Run detection</ActionButton>} />
      ) : (
        <SignalFeed
          nowMs={nowMs}
          rows={rows.map((r) => ({
            id: r.id, type: r.type, description: r.description, source: r.source, detectedAt: r.detectedAt, leadId: r.leadId,
            company: { name: r.company.name, industry: r.company.industry, size: r.company.size, location: r.company.location },
          }))}
        />
      )}
    </>
  );
}
