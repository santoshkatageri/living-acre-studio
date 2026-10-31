import { ReactNode } from "react";

/* ---------------------------------- badges --------------------------------- */

const BADGE_TONES: Record<string, string> = {
  draft: "bg-line/60 text-muted",
  in_production: "bg-sky/15 text-sky",
  awaiting_approval: "bg-amber/15 text-amber",
  approved: "bg-leaf/15 text-leaf",
  scheduled: "bg-leaf/15 text-leaf",
  published: "bg-leaf/20 text-leaf",
  failed: "bg-ember/15 text-ember",
  rejected: "bg-ember/15 text-ember",
  pass: "bg-leaf/15 text-leaf",
  conditional: "bg-amber/15 text-amber",
  fail: "bg-ember/15 text-ember",
  complete: "bg-leaf/15 text-leaf",
  running: "bg-amber/15 text-amber",
  pending: "bg-line/60 text-muted",
  skipped: "bg-line/60 text-muted",
  manual: "bg-sky/15 text-sky",
  warn: "bg-amber/15 text-amber",
  mock: "bg-sky/15 text-sky",
  live: "bg-leaf/15 text-leaf",
  sent: "bg-leaf/20 text-leaf",
  confirmed: "bg-leaf/20 text-leaf",
  superseded: "bg-line/50 text-faint",
};

export function Badge({ tone, children }: { tone: string; children?: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] ${
        BADGE_TONES[tone] ?? "bg-line/60 text-muted"
      }`}
    >
      {tone === "running" && <span className="h-1 w-1 rounded-full bg-amber dot-pulse" />}
      {children ?? tone.replace(/_/g, " ")}
    </span>
  );
}

/* ---------------------------------- layout --------------------------------- */

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="eyebrow">{children}</div>;
}

export function PageHeader({
  eyebrow,
  title,
  sub,
  right,
}: {
  eyebrow: string;
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="rise-in mb-8 flex flex-wrap items-end justify-between gap-5">
      <div>
        <div className="eyebrow mb-3">{eyebrow}</div>
        <h1 className="font-display max-w-3xl text-[34px] font-semibold leading-[1.05] tracking-tight text-cream md:text-[44px]">
          {title}
        </h1>
        {sub && <p className="mt-3 max-w-xl text-[14.5px] leading-relaxed text-muted">{sub}</p>}
      </div>
      {right && <div className="flex items-center gap-3">{right}</div>}
    </header>
  );
}

export function Card({
  children,
  className = "",
  grainy = false,
}: {
  children: ReactNode;
  className?: string;
  grainy?: boolean;
}) {
  return (
    <section className={`card-surface relative overflow-hidden p-5 ${grainy ? "grain" : ""} ${className}`}>
      <div className="relative z-[2]">{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="card-surface p-5">
      <div className="eyebrow">{label}</div>
      <div className={`font-display mt-2 text-[30px] font-semibold tabular-nums ${accent ? "text-amber" : "text-cream"}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-faint">{sub}</div>}
    </div>
  );
}

export function ProgressBar({ pct, tone = "amber" }: { pct: number; tone?: "amber" | "leaf" }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line/70">
      <div
        className={`h-full rounded-full transition-all duration-700 ${tone === "leaf" ? "bg-leaf" : "bg-amber"}`}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

export function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed hairline px-6 py-14 text-center">
      <div className="text-faint">{icon}</div>
      <div className="font-display text-lg text-straw">{title}</div>
      <p className="max-w-sm text-[13px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}

export function KV({ k, v, mono = true }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b hairline py-2 last:border-0">
      <span className="text-[12px] text-faint">{k}</span>
      <span className={`text-right text-[12.5px] text-straw ${mono ? "font-mono" : ""}`}>{v}</span>
    </div>
  );
}
