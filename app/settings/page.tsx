import { PageHeader } from "@/components/empty-state";
import { getSettings } from "@/lib/settings";
import { SettingsForm } from "./settings-form";

export default function SettingsPage() {
  const s = getSettings();
  return (
    <>
      <PageHeader title="ICP Setup" description="Define who you sell to. Scoring and drafting prompts read this on every run." />
      <SettingsForm
        initial={{
          companyName: s.companyName, offerDescription: s.offerDescription, icp: s.icp, dailySendCap: s.dailySendCap,
          warmupEnabled: s.warmupEnabled, sendingDomain: s.sendingDomain, webhookUrl: s.webhookUrl,
        }}
      />
    </>
  );
}
