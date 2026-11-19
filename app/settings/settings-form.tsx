"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw, Save, ShieldCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ActionButton } from "@/components/action-button";
import { rescoreAllAction, saveSettingsAction } from "@/app/actions";
import { SIGNAL_TYPES, type SignalType } from "@/lib/db/schema";
import type { Icp } from "@/lib/types";
import { label } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Initial {
  companyName: string;
  offerDescription: string;
  icp: Icp;
  dailySendCap: number;
  warmupEnabled: boolean;
  sendingDomain: string;
  webhookUrl: string | null;
}

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function Field({ id, label: l, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{l}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function SettingsForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [saving, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [f, setF] = useState({
    companyName: initial.companyName,
    offerDescription: initial.offerDescription,
    industries: initial.icp.industries.join(", "),
    titles: initial.icp.titles.join(", "),
    sizeMin: String(initial.icp.sizeMin),
    sizeMax: String(initial.icp.sizeMax),
    geographies: initial.icp.geographies.join(", "),
    dealSize: String(initial.icp.dealSize),
    mustHaveSignals: initial.icp.mustHaveSignals,
    disqualifiers: initial.icp.disqualifiers.join(", "),
    dailySendCap: String(initial.dailySendCap),
    warmupEnabled: initial.warmupEnabled,
    sendingDomain: initial.sendingDomain,
    webhookUrl: initial.webhookUrl ?? "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const toggleSignal = (t: SignalType) =>
    set("mustHaveSignals", f.mustHaveSignals.includes(t) ? f.mustHaveSignals.filter((x) => x !== t) : [...f.mustHaveSignals, t]);
  const subdomain = f.sendingDomain.split(".").filter(Boolean).length >= 3;

  const save = () =>
    start(async () => {
      const r = await saveSettingsAction({
        companyName: f.companyName,
        offerDescription: f.offerDescription,
        icp: {
          industries: list(f.industries), titles: list(f.titles), sizeMin: Number(f.sizeMin), sizeMax: Number(f.sizeMax),
          geographies: list(f.geographies), dealSize: Number(f.dealSize), mustHaveSignals: f.mustHaveSignals, disqualifiers: list(f.disqualifiers),
        },
        dailySendCap: Number(f.dailySendCap),
        warmupEnabled: f.warmupEnabled,
        sendingDomain: f.sendingDomain,
        webhookUrl: f.webhookUrl,
      });
      if (r.ok) {
        setErrors({});
        toast.success(r.message, { action: { label: "Re-score now", onClick: () => void rescoreAllAction().then((x) => { toast.success(x.message); router.refresh(); }) } });
        router.refresh();
      } else {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.message);
      }
    });

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Your company &amp; offer</CardTitle>
            <CardDescription>Injected into every drafting prompt so emails describe what you actually sell.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field id="companyName" label="Company name" error={errors.companyName}>
              <Input id="companyName" value={f.companyName} onChange={(e) => set("companyName", e.target.value)} />
            </Field>
            <Field id="offer" label="Offer description" hint="One or two plain sentences. No claims you can't back up." error={errors.offerDescription}>
              <Textarea id="offer" rows={3} value={f.offerDescription} onChange={(e) => set("offerDescription", e.target.value)} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ideal customer profile</CardTitle>
            <CardDescription>Injected into the scoring prompt. Change it and re-score to see scores move.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field id="industries" label="Target industries" hint="Comma-separated. Seed data uses Industrial / HVAC, SaaS, Logistics." error={errors["icp.industries"]}>
              <Input id="industries" value={f.industries} onChange={(e) => set("industries", e.target.value)} />
            </Field>
            <Field id="titles" label="Buyer titles" hint="Comma-separated" error={errors["icp.titles"]}>
              <Input id="titles" value={f.titles} onChange={(e) => set("titles", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id="sizeMin" label="Min employees" error={errors["icp.sizeMin"]}>
                <Input id="sizeMin" type="number" value={f.sizeMin} onChange={(e) => set("sizeMin", e.target.value)} />
              </Field>
              <Field id="sizeMax" label="Max employees" error={errors["icp.sizeMax"]}>
                <Input id="sizeMax" type="number" value={f.sizeMax} onChange={(e) => set("sizeMax", e.target.value)} />
              </Field>
            </div>
            <Field id="geos" label="Geographies" hint="Matched against company location, e.g. US, Canada" error={errors["icp.geographies"]}>
              <Input id="geos" value={f.geographies} onChange={(e) => set("geographies", e.target.value)} />
            </Field>
            <Field id="deal" label="Typical deal size (USD)" error={errors["icp.dealSize"]}>
              <Input id="deal" type="number" value={f.dealSize} onChange={(e) => set("dealSize", e.target.value)} />
            </Field>
            <Field id="dq" label="Disqualifiers" hint='Comma-separated. "fewer than N employees" is understood.' error={errors["icp.disqualifiers"]}>
              <Input id="dq" value={f.disqualifiers} onChange={(e) => set("disqualifiers", e.target.value)} />
            </Field>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Must-have signals</Label>
              <div className="flex flex-wrap gap-2">
                {SIGNAL_TYPES.map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => toggleSignal(t)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors",
                      f.mustHaveSignals.includes(t) ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {t === "rfp" ? "RFP" : label(t)}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Deliverability</CardTitle>
            <CardDescription>Guardrails enforced on every send.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field id="cap" label="Daily send cap" error={errors.dailySendCap}>
              <Input id="cap" type="number" value={f.dailySendCap} onChange={(e) => set("dailySendCap", e.target.value)} />
            </Field>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="warmup">Warm-up ramp</Label>
                <p className="text-xs text-muted-foreground">Starts at 10/day, +5 per day, up to the cap.</p>
              </div>
              <Switch id="warmup" checked={f.warmupEnabled} onCheckedChange={(v) => set("warmupEnabled", v)} />
            </div>
            <Field id="domain" label="Sending domain" error={errors.sendingDomain}>
              <Input id="domain" value={f.sendingDomain} onChange={(e) => set("sendingDomain", e.target.value)} />
            </Field>
            <p className={cn("flex items-center gap-1.5 text-xs", subdomain ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
              {subdomain ? <ShieldCheck className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
              {subdomain ? "Dedicated subdomain: your root domain's reputation is protected." : "Root domain: sends will be blocked until you use a subdomain."}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>CRM webhook</CardTitle>
            <CardDescription>&quot;Push to CRM&quot; POSTs HubSpot-shaped JSON here. Leave blank to preview only.</CardDescription>
          </CardHeader>
          <CardContent>
            <Field id="webhook" label="Webhook URL" error={errors.webhookUrl}>
              <Input id="webhook" placeholder="https://webhook.site/…" value={f.webhookUrl} onChange={(e) => set("webhookUrl", e.target.value)} />
            </Field>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-2">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} Save settings
          </Button>
          <ActionButton action={rescoreAllAction} pending="Re-scoring every lead…" variant="outline" size="default" icon={<RefreshCw />}>
            Re-score all leads
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
