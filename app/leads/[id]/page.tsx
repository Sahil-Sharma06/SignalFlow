import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, Building2, CheckCircle2, CircleAlert, Clock, Eye, FlaskConical, Gauge, Handshake, MailCheck, MousePointerClick,
  PenLine, Sparkles, Upload, Wand2, Globe, Users2, MapPin,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/action-button";
import { ReplyBadge, ScoreBadge, SignalBadge, StatusBadge } from "@/components/badges";
import { EmptyState } from "@/components/empty-state";
import { ReplySimulator } from "@/components/reply-simulator";
import { draftAction, pushCrmAction, researchAction, runPipelineAction, scoreAction, verifyEmailAction } from "@/app/actions";
import { leadDetail } from "@/lib/queries";
import { now } from "@/lib/clock";
import { dateTime, label, relTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const MAX_POINTS: Record<string, number> = {
  "Industry fit": 25, "Buyer title": 20, "Company size": 20, Geography: 10, "Buying signal": 15, "Signal recency": 10,
};

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const leadId = Number(id);
  const d = Number.isInteger(leadId) ? leadDetail(leadId) : null;
  if (!d) notFound();
  const { lead, company, signals, emails, replies, timeline } = d;
  const nowMs = now().getTime();
  const brief = lead.researchBrief;
  const closed = ["unsubscribed", "closed_lost"].includes(lead.status);

  return (
    <div className="space-y-6 animate-in-up">
      <Link href="/leads" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Leads
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{lead.contactName}</h1>
            <StatusBadge status={lead.status} />
            <ScoreBadge score={lead.score} disqualified={lead.disqualified} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {lead.contactTitle} at <span className="text-foreground">{company.name}</span> · {lead.contactEmail}{" "}
            {lead.emailVerified ? (
              <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="size-3.5" /> verified</span>
            ) : (
              <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400"><CircleAlert className="size-3.5" /> unverified</span>
            )}
            {lead.bounced && <span className="ml-1 text-red-600">· bounced</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton action={researchAction.bind(null, lead.id)} pending="Researching company…" variant="outline" icon={<FlaskConical />}>Research</ActionButton>
          <ActionButton action={scoreAction.bind(null, lead.id)} pending="Scoring against ICP…" variant="outline" icon={<Gauge />}>Score</ActionButton>
          <ActionButton action={draftAction.bind(null, lead.id)} pending="Drafting 3-step sequence…" variant="outline" icon={<PenLine />} disabled={closed}>Draft outreach</ActionButton>
          <ActionButton action={runPipelineAction.bind(null, lead.id)} pending="Running full pipeline…" icon={<Wand2 />} disabled={closed}>Run all</ActionButton>
          {!lead.emailVerified && <ActionButton action={verifyEmailAction.bind(null, lead.id)} pending="Verifying…" variant="secondary" icon={<MailCheck />}>Verify email</ActionButton>}
          <ActionButton action={pushCrmAction.bind(null, [lead.id])} pending="Pushing…" variant="ghost" icon={<Upload />}>Push to CRM</ActionButton>
        </div>
      </div>

      {lead.status === "interested" && lead.handoffSummary && (
        <div className="flex gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <Handshake className="mt-0.5 size-5 shrink-0 text-emerald-600" />
          <div>
            <p className="text-sm font-medium">Handed off to sales</p>
            <p className="text-sm text-muted-foreground">{lead.handoffSummary}</p>
            <p className="mt-1 text-sm"><span className="font-medium">Next step:</span> {lead.handoffNextStep}</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /> AI research brief</CardTitle>
            </CardHeader>
            <CardContent>
              {!brief ? (
                <EmptyState icon={FlaskConical} title="Not researched yet" body="Research turns the company and its signals into a brief: needs, recent moves and a why-now angle."
                  action={<ActionButton action={researchAction.bind(null, lead.id)} pending="Researching…" icon={<FlaskConical />}>Research now</ActionButton>} />
              ) : (
                <div className="space-y-4 text-sm">
                  <p>{brief.summary}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Industry</p><p className="font-medium">{brief.industry}</p></div>
                    <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Scale</p><p className="font-medium">{brief.scale}</p></div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent moves</p>
                      <ul className="list-disc space-y-1 pl-4">{brief.recent_moves.map((m) => <li key={m}>{m}</li>)}</ul>
                    </div>
                    <div>
                      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Likely pains</p>
                      <ul className="list-disc space-y-1 pl-4">{brief.likely_needs.map((m) => <li key={m}>{m}</li>)}</ul>
                    </div>
                  </div>
                  <div className="rounded-lg border-l-2 border-primary bg-primary/5 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-primary">Why now</p>
                    <p className="mt-0.5">{brief.why_now}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Gauge className="size-4 text-primary" /> Score breakdown</CardTitle>
              <CardDescription>Each criterion comes from your ICP. Change it in ICP Setup and re-score.</CardDescription>
            </CardHeader>
            <CardContent>
              {!lead.scoreReasons ? (
                <EmptyState icon={Gauge} title="Not scored yet" body="Scoring compares the research brief to your ICP and explains every point."
                  action={<ActionButton action={scoreAction.bind(null, lead.id)} pending="Scoring…" icon={<Gauge />}>Score now</ActionButton>} />
              ) : (
                <div className="space-y-3">
                  {lead.scoreReasons.map((r) => {
                    const max = MAX_POINTS[r.criterion] ?? Math.max(Math.abs(r.points), 10);
                    const neg = r.points < 0;
                    return (
                      <div key={r.criterion} className="text-sm">
                        <div className="flex justify-between">
                          <span className="font-medium">{r.criterion}</span>
                          <span className={cn("tabular-nums", neg ? "text-red-600" : "text-muted-foreground")}>{r.points > 0 ? "+" : ""}{r.points}{!neg && ` / ${max}`}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className={cn("h-full rounded-full transition-all", neg ? "bg-red-500" : "bg-primary")} style={{ width: `${Math.min(100, (Math.abs(r.points) / max) * 100)}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{r.explanation}</p>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between border-t pt-3 text-sm font-medium">
                    <span>Total</span>
                    <ScoreBadge score={lead.score} disqualified={lead.disqualified} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Email thread</CardTitle>
              <CardDescription>Step 1 sends on approval; step 2 at +3 days; step 3 at +7 days. Any reply stops the sequence.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {emails.length === 0 && replies.length === 0 ? (
                <EmptyState icon={PenLine} title="No outreach yet" body="Draft a personalized 3-step sequence grounded in the signal and research."
                  action={<ActionButton action={draftAction.bind(null, lead.id)} pending="Drafting…" icon={<PenLine />} disabled={closed}>Draft outreach</ActionButton>} />
              ) : (
                <>
                  {emails.map((e) => (
                    <div key={e.id} className={cn("rounded-lg border p-3", e.status === "skipped" && "opacity-60")}>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-medium">Step {e.step} · {label(e.status)}</span>
                        <span className="flex items-center gap-2 text-muted-foreground">
                          {e.sentAt ? <>Sent {dateTime(e.sentAt)}</> : e.scheduledFor ? <><Clock className="size-3" /> {relTime(e.scheduledFor, nowMs)}</> : null}
                          {e.opened && <span className="inline-flex items-center gap-0.5 text-sky-600"><Eye className="size-3" /> opened</span>}
                          {e.clicked && <span className="inline-flex items-center gap-0.5 text-violet-600"><MousePointerClick className="size-3" /> clicked</span>}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-medium">{e.subject}</p>
                      <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{e.body}</p>
                      {e.blockReason && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{e.blockReason}</p>}
                    </div>
                  ))}
                  {replies.map((r) => (
                    <div key={r.id} className="ml-6 rounded-lg border border-primary/30 bg-primary/5 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-medium">Reply from {lead.contactName}</span>
                        <span className="text-muted-foreground">{dateTime(r.receivedAt)}</span>
                      </div>
                      <p className="mt-2 text-sm">{r.body}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <ReplyBadge cls={r.classification} /> {r.classifierReason}
                        {r.snoozeUntil && <span>· snoozed until {new Date(r.snoozeUntil).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="size-4" /> {company.name}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">{company.websiteSummary}</p>
              <p className="flex items-center gap-2"><Globe className="size-3.5 text-muted-foreground" /> {company.domain}</p>
              <p className="flex items-center gap-2"><Users2 className="size-3.5 text-muted-foreground" /> {company.size.toLocaleString("en-US")} employees · {company.industry}</p>
              <p className="flex items-center gap-2"><MapPin className="size-3.5 text-muted-foreground" /> {company.location}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Signals</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {signals.map((s) => (
                <div key={s.id} className={cn("text-sm", s.id === lead.signalId && "rounded-lg bg-primary/5 p-2 -m-2")}>
                  <div className="flex items-center justify-between gap-2">
                    <SignalBadge type={s.type} />
                    <span className="text-xs text-muted-foreground">{relTime(s.detectedAt, nowMs)}</span>
                  </div>
                  <p className="mt-1">{s.description}</p>
                  <p className="text-xs text-muted-foreground">{s.source}{s.id === lead.signalId && " · triggering signal"}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {!closed && emails.some((e) => e.status === "sent") && (
            <Card>
              <CardHeader>
                <CardTitle>Simulate a reply</CardTitle>
                <CardDescription>For live demos: pick a preset or type anything.</CardDescription>
              </CardHeader>
              <CardContent><ReplySimulator leadId={lead.id} /></CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l pl-4">
                {timeline.map((t) => (
                  <li key={t.id} className="relative text-sm">
                    <span className="absolute -left-[21.5px] top-1.5 size-2.5 rounded-full border-2 border-background bg-primary" />
                    <p>{t.message}</p>
                    <p className="text-xs text-muted-foreground">{dateTime(t.createdAt)}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
