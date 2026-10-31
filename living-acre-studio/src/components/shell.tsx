"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AudioLines,
  BarChart3,
  CalendarClock,
  FileSearch,
  LayoutDashboard,
  Map,
  Clapperboard,
} from "lucide-react";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/", label: "Studio", icon: LayoutDashboard, hint: "Mission control" },
  { href: "/episodes", label: "Episodes", icon: Clapperboard, hint: "Production library" },
  { href: "/farm", label: "The Acre", icon: Map, hint: "Asset bible & map" },
  { href: "/audio", label: "Audio Studio", icon: AudioLines, hint: "Voice lab & buses" },
  { href: "/publishing", label: "Publishing", icon: CalendarClock, hint: "Buffer queue" },
  { href: "/analytics", label: "Analytics", icon: BarChart3, hint: "Signal & retention" },
  { href: "/audit", label: "Architecture", icon: FileSearch, hint: "Phase-0 audit" },
];

export function SunGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className}>
      <circle cx="20" cy="17" r="7.5" stroke="#e8a33d" strokeWidth="2" />
      <path d="M4 30c5.5-3.2 10.5-3.2 16 0s10.5 3.2 16 0" stroke="#8fae6a" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 35c4.7-2.7 9.3-2.7 14 0s9.3 2.7 14 0" stroke="#5b7c4a" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

export function StudioShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [clock, setClock] = useState("");
  useEffect(() => {
    const tick = () =>
      setClock(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Kolkata",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(new Date()),
      );
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen lg:pl-[248px]">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r hairline bg-soil/80 backdrop-blur-sm lg:flex">
        <Link href="/" className="group flex items-center gap-3 px-6 pb-5 pt-7">
          <SunGlyph className="h-10 w-10 shrink-0 transition-transform duration-500 group-hover:rotate-12" />
          <span>
            <span className="font-display block text-[21px] leading-none font-semibold tracking-tight text-cream">
              go.dharaa
            </span>
            <span className="eyebrow mt-1 block text-[9px]">the living acre</span>
          </span>
        </Link>
        <nav className="mt-2 flex-1 space-y-1 px-3">
          {NAV.map((n) => {
            const active =
              n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] ${
                  active
                    ? "bg-raise text-cream"
                    : "text-muted hover:bg-panel hover:text-straw"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-amber" />
                )}
                <n.icon
                  className={`h-[17px] w-[17px] shrink-0 ${active ? "text-amber" : "text-faint group-hover:text-amber/80"}`}
                  strokeWidth={1.8}
                />
                <span className="flex-1 font-semibold tracking-wide">{n.label}</span>
                <span className="eyebrow hidden text-[8px] opacity-0 transition-opacity group-hover:block group-hover:opacity-100 xl:group-hover:block">
                  {active ? "" : ""}
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t hairline px-6 py-5">
          <div className="eyebrow text-[9px]">north karnataka</div>
          <div className="font-mono mt-1.5 text-[13px] tabular-nums text-straw">
            {clock} <span className="text-faint">IST</span>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-faint">
            <span className="h-1.5 w-1.5 rounded-full bg-leaf dot-pulse" />
            one acre · 43,560 sq ft · fixed canon
          </div>
        </div>
      </aside>

      {/* Mobile topbar */}
      <header className="sticky top-0 z-40 flex items-center gap-4 border-b hairline bg-ink/90 px-5 py-3 backdrop-blur lg:hidden">
        <Link href="/" className="flex items-center gap-2">
          <SunGlyph className="h-7 w-7" />
          <span className="font-display text-lg font-semibold">go.dharaa</span>
        </Link>
        <nav className="ml-auto flex gap-1 overflow-x-auto">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href))
                  ? "text-amber"
                  : "text-muted"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="relative min-h-screen">{children}</main>
    </div>
  );
}
