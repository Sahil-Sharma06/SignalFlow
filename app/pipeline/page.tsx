import { PageHeader } from "@/components/empty-state";
import { boardData } from "@/lib/queries";
import { BOARD_COLUMNS } from "@/lib/board";
import { Board } from "./board";

export default function PipelinePage() {
  const leads = boardData();
  return (
    <>
      <PageHeader title="Pipeline" description="Drag a card to change its stage. Every move is logged to the lead's timeline." />
      <Board
        key={leads.map((l) => `${l.id}:${l.column}`).join(",")}
        columns={BOARD_COLUMNS.map((c) => ({ id: c.id, label: c.label }))}
        initial={leads.map((l) => ({
          id: l.id, contactName: l.contactName, company: l.company, score: l.score, disqualified: l.disqualified,
          status: l.status, signalType: l.signalType, column: l.column,
        }))}
      />
    </>
  );
}
