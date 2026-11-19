import { NextResponse, type NextRequest } from "next/server";
import { exportKind, exportRows, toCsv } from "@/lib/crm";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const parsed = exportKind.safeParse(req.nextUrl.searchParams.get("kind") ?? "leads");
  if (!parsed.success) return NextResponse.json({ error: "kind must be leads, replies or outcomes" }, { status: 400 });
  const csv = toCsv(exportRows(parsed.data));
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="signalflow-${parsed.data}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
