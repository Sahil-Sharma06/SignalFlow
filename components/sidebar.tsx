"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { LayoutDashboard, Radar, Users, Send, Inbox, KanbanSquare, SlidersHorizontal, Moon, Sun, Menu, X, Waves } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/signals", label: "Signals", Icon: Radar },
  { href: "/leads", label: "Leads", Icon: Users },
  { href: "/outreach", label: "Outreach", Icon: Send },
  { href: "/replies", label: "Replies", Icon: Inbox },
  { href: "/pipeline", label: "Pipeline", Icon: KanbanSquare },
  { href: "/settings", label: "ICP Setup", Icon: SlidersHorizontal },
];

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <button
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      {dark ? "Light mode" : "Dark mode"}
    </button>
  );
}

export function Sidebar({ provider, counts }: { provider: string; counts: { queue: number; replies: number } }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  const nav = (
    <nav className="flex flex-1 flex-col gap-1">
      {NAV.map(({ href, label, Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        const badge = href === "/outreach" ? counts.queue : href === "/replies" ? counts.replies : 0;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            <span className="flex-1">{label}</span>
            {badge > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground tabular-nums">{badge}</span>}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="space-y-1 border-t pt-3">
      <ThemeToggle />
      <div className="px-3 pt-1 text-xs text-muted-foreground">
        AI: <span className="font-medium text-foreground">{provider}</span>
      </div>
    </div>
  );

  const brand = (
    <Link href="/" className="mb-6 flex items-center gap-2 px-3">
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Waves className="size-4" />
      </span>
      <span className="text-lg font-semibold tracking-tight">Signalflow</span>
    </Link>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar p-4 lg:flex">
        {brand}
        {nav}
        {footer}
      </aside>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/90 px-4 py-2 backdrop-blur lg:hidden">
        <span className="flex items-center gap-2 font-semibold"><Waves className="size-4 text-primary" /> Signalflow</span>
        <button aria-label="Open menu" onClick={() => setOpen(true)} className="rounded-md p-2 hover:bg-muted"><Menu className="size-5" /></button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-sidebar p-4 shadow-xl animate-in-up">
            <button aria-label="Close menu" onClick={() => setOpen(false)} className="absolute right-3 top-3 rounded-md p-1 hover:bg-muted"><X className="size-4" /></button>
            {brand}
            {nav}
            {footer}
          </aside>
        </div>
      )}
    </>
  );
}
