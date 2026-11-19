import Link from "next/link";
import { Download, Radar, Sparkles, Send, Eye, MessageSquare, Handshake, Cpu } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/empty-state";
import { dashboardStats, recentActivity } from "@/lib/queries";
import { providerLabel } from "@/lib/ai";
import { now } from "@/lib/clock";
import { pct, usd } from "@/lib/format";
import { SendsChart } from "./dashboard-charts";
import { ActivityFeed } from "./activity-feed";

export default function Dashboard() {
  const { kpis, funnel, series, cost } = dashboardStats();
  const feed = recentActivity(20);
  const nowMs = now().getTime();
  const provider = providerLabel();

  const tiles = [
    { label: "Signals (24h)", value: kpis.signals24h.toString(), Icon: Radar, href: "/signals" },
    { label: "Leads researched", value: kpis.researched.toString(), Icon: Sparkles, href: "/leads" },
    { label: "Emails sent", value: kpis.sent.toString(), Icon: Send, href: "/outreach" },
    { label: "Open rate", value: pct(kpis.openRate), Icon: Eye, href: "/outreach" },
    { label: "Reply rate", value: pct(kpis.replyRate), Icon: MessageSquare, href: "/replies" },
    { label: "Interested", value: kpis.interested.toString(), Icon: Handshake, href: "/replies" },
  ];
  const top = funnel[0].value || 1;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Signals in, qualified conversations out."
        actions={
          <>
            <a href="/api/export?kind=outcomes" className={buttonVariants({ variant: "outline", size: "sm" })}><Download /> Export outcomes</a>
            <Link href="/signals" className={buttonVariants({ size: "sm" })}><Radar /> View signals</Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {tiles.map(({ label, value, Icon, href }, i) => (
          <Link key={label} href={href} className="group animate-in-up" style={{ animationDelay: `${i * 40}ms` }}>
            <Card size="sm" className="h-full transition-colors group-hover:ring-primary/40">
              <CardHeader>
                <CardDescription className="flex items-center gap-1.5"><Icon className="size-3.5" /> {label}</CardDescription>
                <p className="text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Sends and replies, last 14 days</CardTitle>
            <CardDescription>Daily counts on the simulated clock.</CardDescription>
          </CardHeader>
          <CardContent><SendsChart data={series} /></CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Funnel</CardTitle>
            <CardDescription>Conversion from each stage to the next.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {funnel.map((f, i) => {
              const prev = i > 0 ? funnel[i - 1].value : null;
              const conv = prev ? f.value / prev : null;
              return (
                <div key={f.stage} title={`${f.stage}: ${f.value}${conv !== null ? ` (${pct(conv)} of previous stage)` : ""}`}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span>{f.stage}</span>
                    <span className="tabular-nums">
                      <span className="font-semibold">{f.value}</span>
                      {conv !== null && <span className="ml-2 text-xs text-muted-foreground">{pct(conv)}</span>}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded bg-muted">
                    <div className="h-full rounded" style={{ width: `${Math.max(2, (f.value / top) * 100)}%`, background: "var(--series-1)" }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="live-dot size-2 rounded-full bg-emerald-500" /> Live activity
            </CardTitle>
            <CardDescription>Refreshes every 15 seconds.</CardDescription>
          </CardHeader>
          <CardContent><ActivityFeed items={feed} nowMs={nowMs} /></CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Cpu className="size-4" /> AI cost</CardTitle>
            <CardDescription>
              Provider: {provider.name === "mock" ? "mock (offline)" : `${provider.name} · ${provider.model}`}. Estimates use Gemini 2.5 Flash list prices; the free tier is $0.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Estimated AI calls</p>
                <p className="text-2xl font-semibold tabular-nums">{cost.estimatedCalls}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Cost per interested lead</p>
                <p className="text-2xl font-semibold tabular-nums">{cost.costPerInterested === null ? "—" : usd(cost.costPerInterested)}</p>
              </div>
            </div>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Estimated pipeline cost</dt><dd className="tabular-nums">{usd(cost.estimatedCost)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Per call (≈700 in / 250 out tokens)</dt><dd className="tabular-nums">{usd(cost.perCall)}</dd></div>
              <div className="flex justify-between border-t pt-1.5"><dt className="text-muted-foreground">Calls this session: live / cached / mock</dt><dd className="tabular-nums">{cost.logged.live} / {cost.logged.cached} / {cost.logged.mock}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Actual live spend</dt><dd className="tabular-nums">{usd(cost.logged.liveCost)}</dd></div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
