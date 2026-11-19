import Link from "next/link";
import { CheckCircle2, CircleAlert, Clock, Eye, Inbox, MousePointerClick, Send, ShieldCheck, ShieldAlert, FastForward, Ban } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, EmptyState } from "@/components/empty-state";
import { ActionButton } from "@/components/action-button";
import { buttonVariants } from "@/components/ui/button";
import { advanceTimeAction, processQueueAction } from "@/app/actions";
import { approvalQueue, recentSends, scheduledEmails } from "@/lib/queries";
import { getGuardrails, BOUNCE_LIMIT, WARMUP_START, WARMUP_STEP } from "@/lib/outreach/guardrails";
import { getSettings } from "@/lib/settings";
import { now } from "@/lib/clock";
import { dateTime, pct, relTime } from "@/lib/format";
import { db } from "@/lib/db/client";
import { signals } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { cn } from "@/lib/utils";
import { ApprovalCard } from "./approval-card";
import { AutoApprove } from "./auto-approve";

function Meter({ value, max, tone = "primary" }: { value: number; max: number; tone?: "primary" | "warn" | "bad" }) {
  const w = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full transition-all", tone === "bad" ? "bg-red-500" : tone === "warn" ? "bg-amber-500" : "bg-primary")} style={{ width: `${w}%` }} />
    </div>
  );
}

export default function OutreachPage() {
  const g = getGuardrails();
  const s = getSettings();
  const queue = approvalQueue();
  const scheduled = scheduledEmails();
  const sends = recentSends();
  const nowMs = now().getTime();
  const ramp = Array.from({ length: 7 }, (_, i) => Math.min(s.dailySendCap, WARMUP_START + WARMUP_STEP * (g.warmupDay - 1 + i)));
  const bounceTone = g.bounceRate > BOUNCE_LIMIT ? "bad" : g.bounceRate > BOUNCE_LIMIT / 2 ? "warn" : "primary";

  return (
    <>
      <PageHeader
        title="Outreach"
        description="Approve drafts, run sequences, and stay inside deliverability guardrails. Sending is dry-run unless Resend is configured."
        actions={
          <>
            <ActionButton action={processQueueAction} pending="Sending due emails…" variant="outline" icon={<Send />}>Send due now</ActionButton>
            <ActionButton action={advanceTimeAction.bind(null, 3)} pending="Advancing 3 days…" icon={<FastForward />}>Simulate 3 days passing</ActionButton>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card size="sm">
          <CardHeader><CardDescription>Today&apos;s sends</CardDescription><p className="text-2xl font-semibold tabular-nums">{g.sentToday} <span className="text-sm font-normal text-muted-foreground">/ {g.effectiveCap}</span></p></CardHeader>
          <CardContent className="space-y-1.5">
            <Meter value={g.sentToday} max={g.effectiveCap} tone={g.remainingToday === 0 ? "warn" : "primary"} />
            <p className="text-xs text-muted-foreground">{g.remainingToday} remaining · hard cap {g.dailyCap}/day</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader><CardDescription>Warm-up ramp</CardDescription><p className="text-2xl font-semibold">{g.warmupEnabled ? `Day ${g.warmupDay}` : "Off"}</p></CardHeader>
          <CardContent>
            <div className="flex h-8 items-end gap-1">
              {ramp.map((v, i) => (
                <div key={i} title={`${v}/day`} className={cn("flex-1 rounded-sm", i === 0 ? "bg-primary" : "bg-primary/30")} style={{ height: `${(v / s.dailySendCap) * 100}%` }} />
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{g.warmupEnabled ? `Cap grows +${WARMUP_STEP}/day to ${s.dailySendCap}` : "Full cap applies immediately"}</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader><CardDescription>Bounce rate</CardDescription><p className="text-2xl font-semibold tabular-nums">{pct(g.bounceRate)}</p></CardHeader>
          <CardContent className="space-y-1.5">
            <Meter value={g.bounceRate} max={BOUNCE_LIMIT * 2} tone={bounceTone} />
            <p className="text-xs text-muted-foreground">{g.bounced} of {g.sentLeads} recipients · sends pause above {BOUNCE_LIMIT * 100}%</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader><CardDescription>Sending identity</CardDescription><CardTitle className="truncate text-base">{g.sendingDomain}</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-xs">
            <p className={cn("flex items-center gap-1.5", g.dedicatedSubdomain ? "text-emerald-600 dark:text-emerald-400" : "text-red-600")}>
              {g.dedicatedSubdomain ? <ShieldCheck className="size-3.5" /> : <ShieldAlert className="size-3.5" />} {g.dedicatedSubdomain ? "Dedicated subdomain" : "Not a subdomain — sends blocked"}
            </p>
            <p className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"><Ban className="size-3.5" /> Unsubscribe check on every send</p>
            <p className={cn("flex items-center gap-1.5", g.unverifiedQueued ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
              {g.unverifiedQueued ? <CircleAlert className="size-3.5" /> : <CheckCircle2 className="size-3.5" />} {g.unverifiedQueued} unverified in queue
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-4"><AutoApprove enabled={s.autoApproveEnabled} threshold={s.autoApproveThreshold} /></div>

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="space-y-4 xl:col-span-3">
          <h2 className="font-semibold">Approval queue <span className="text-muted-foreground">({queue.length})</span></h2>
          {queue.length === 0 ? (
            <EmptyState icon={Inbox} title="Nothing waiting for approval" body="Draft outreach from a lead's page, or run the pipeline on new leads."
              action={<Link href="/leads?status=scored" className={buttonVariants({ size: "sm" })}>Find scored leads</Link>} />
          ) : (
            queue.map((q) => {
              const sig = q.lead.signalId ? db.select().from(signals).where(eq(signals.id, q.lead.signalId)).get() : undefined;
              return (
                <ApprovalCard
                  key={q.lead.id}
                  leadId={q.lead.id}
                  contactName={q.lead.contactName}
                  contactTitle={q.lead.contactTitle}
                  company={q.company.name}
                  score={q.lead.score}
                  verified={q.lead.emailVerified}
                  signal={sig ? { type: sig.type, description: sig.description } : null}
                  emails={q.emails.map((e) => ({ id: e.id, step: e.step, subject: e.subject, body: e.body }))}
                />
              );
            })
          )}
        </div>

        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Scheduled</CardTitle>
              <CardDescription>Approved steps waiting for their send time.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {scheduled.length === 0 && <p className="text-sm text-muted-foreground">No scheduled sends.</p>}
              {scheduled.slice(0, 14).map((e) => (
                <div key={e.id} className="flex items-start justify-between gap-3 rounded-lg border p-2.5 text-sm">
                  <div className="min-w-0">
                    <Link href={`/leads/${e.leadId}`} className="font-medium hover:text-primary">{e.contactName}</Link>
                    <span className="text-muted-foreground"> · step {e.step}</span>
                    <p className="truncate text-xs text-muted-foreground">{e.company}</p>
                    {e.blockReason && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Blocked: {e.blockReason}</p>}
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" /> {e.scheduledFor ? relTime(e.scheduledFor, nowMs) : "after step 1"}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recent sends</CardTitle><CardDescription>Dry-run sends generate simulated opens and clicks.</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {sends.length === 0 && <p className="text-sm text-muted-foreground">Nothing sent yet.</p>}
              {sends.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate"><span className="font-medium">{e.contactName}</span> <span className="text-muted-foreground">· step {e.step}</span></p>
                    <p className="text-xs text-muted-foreground">{dateTime(e.sentAt)}</p>
                  </div>
                  <span className="flex shrink-0 gap-2 text-xs">
                    <Eye className={cn("size-3.5", e.opened ? "text-sky-600" : "text-muted-foreground/30")} />
                    <MousePointerClick className={cn("size-3.5", e.clicked ? "text-violet-600" : "text-muted-foreground/30")} />
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
