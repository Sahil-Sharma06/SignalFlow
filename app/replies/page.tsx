import Link from "next/link";
import { ArrowRight, Download, Handshake, Inbox, Upload } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/empty-state";
import { ReplyBadge, ScoreBadge } from "@/components/badges";
import { ReplySimulator } from "@/components/reply-simulator";
import { ActionButton } from "@/components/action-button";
import { pushCrmAction } from "@/app/actions";
import { handoffs, inbox, replyableLeads } from "@/lib/queries";
import { now } from "@/lib/clock";
import { relTime, shortDate } from "@/lib/format";

export default function RepliesPage() {
  const replies = inbox();
  const handoff = handoffs();
  const targets = replyableLeads();
  const nowMs = now().getTime();

  return (
    <>
      <PageHeader
        title="Replies & handoff"
        description="Every reply is classified by AI. Interested leads move to Handoff with a summary and suggested next step."
        actions={<a href="/api/export?kind=replies" className={buttonVariants({ variant: "outline", size: "sm" })}><Download /> Export replies</a>}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <h2 className="font-semibold">Inbox <span className="text-muted-foreground">({replies.length})</span></h2>
          {replies.length === 0 ? (
            <EmptyState icon={Inbox} title="No replies yet" body="Send some outreach, then use Simulate reply to see classification in action." />
          ) : (
            replies.map((r) => (
              <div key={r.id} className="rounded-xl border bg-card p-4 animate-in-up">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Link href={`/leads/${r.leadId}`} className="font-medium hover:text-primary">{r.lead.contactName}</Link>
                    <span className="text-sm text-muted-foreground"> · {r.company}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ReplyBadge cls={r.classification} />
                    <span className="text-xs text-muted-foreground">{relTime(r.receivedAt, nowMs)}</span>
                  </div>
                </div>
                <p className="mt-2 text-sm">{r.body}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">AI:</span> {r.classifierReason}
                  {r.snoozeUntil && <> · follow up on <span className="font-medium text-foreground">{shortDate(r.snoozeUntil)}</span></>}
                </p>
              </div>
            ))
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Simulate reply</CardTitle>
              <CardDescription>Presets for a live demo, or type any reply.</CardDescription>
            </CardHeader>
            <CardContent><ReplySimulator leads={targets} /></CardContent>
          </Card>

          <Card className="border-emerald-500/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Handshake className="size-4 text-emerald-600" /> Handoff <span className="text-muted-foreground">({handoff.length})</span></CardTitle>
              <CardDescription>Interested leads ready for a sales conversation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {handoff.length === 0 && <p className="text-sm text-muted-foreground">No interested leads yet.</p>}
              {handoff.map((l) => (
                <div key={l.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/leads/${l.id}`} className="text-sm font-medium hover:text-primary">{l.contactName} · {l.company}</Link>
                    <ScoreBadge score={l.score} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{l.handoffSummary ?? "Positive reply."}</p>
                  {l.handoffNextStep && <p className="mt-1.5 flex items-start gap-1 text-xs"><ArrowRight className="mt-0.5 size-3 shrink-0 text-emerald-600" /> {l.handoffNextStep}</p>}
                </div>
              ))}
              {handoff.length > 0 && (
                <ActionButton action={pushCrmAction.bind(null, handoff.map((l) => l.id))} pending="Pushing to CRM…" variant="outline" className="w-full" icon={<Upload />}>
                  Push {handoff.length} to CRM
                </ActionButton>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
