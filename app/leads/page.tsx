import { PageHeader } from "@/components/empty-state";
import { listLeads } from "@/lib/queries";
import { LeadsTable } from "./leads-table";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const rows = listLeads();
  return (
    <>
      <PageHeader title="Leads" description="Every lead created from a buying signal. Click one to see research, score, emails and timeline." />
      <LeadsTable rows={rows} initialStatus={status} />
    </>
  );
}