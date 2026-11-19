import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { eq, sql } from "drizzle-orm";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Sidebar } from "@/components/sidebar";
import { ClockBar } from "@/components/clock-bar";
import { providerLabel } from "@/lib/ai";
import { db } from "@/lib/db/client";
import { emails, leads } from "@/lib/db/schema";
import { getSettings } from "@/lib/settings";
import { nowIso } from "@/lib/clock";
import { sendMode } from "@/lib/outreach/send";

const sans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Signalflow — signal-driven outbound",
  description: "AI-powered outbound CRM that turns buying signals into qualified, replied-to leads.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const p = providerLabel();
  const settings = getSettings();
  const queue = Number(db.select({ c: sql<number>`count(distinct ${emails.leadId})` }).from(emails).where(eq(emails.status, "draft")).get()?.c ?? 0);
  const interested = Number(db.select({ c: sql<number>`count(*)` }).from(leads).where(eq(leads.status, "interested")).get()?.c ?? 0);

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} ${mono.variable} font-sans antialiased`}>
        <Providers>
          <div className="flex min-h-screen flex-col bg-background lg:flex-row">
            <Sidebar provider={p.name === "mock" ? "Mock (offline)" : `${p.name} · ${p.model}`} counts={{ queue, replies: interested }} />
            <div className="flex min-w-0 flex-1 flex-col">
              <ClockBar nowIso={nowIso()} offsetDays={settings.simOffsetDays} sendMode={sendMode()} />
              <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8">{children}</main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
