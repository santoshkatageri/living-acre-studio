"use client";

import { useEffect, useState } from "react";
import { Activity, Eye, Heart, Radio, Sparkles, ThumbsUp, TrendingUp } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, Stat } from "@/components/ui";

interface Daily { date: string; views: number; likes: number; comments: number; shares: number; follows: number; watchHours: number }
interface ChannelTotals { views: number; likes: number; comments: number; shares: number; follows: number; watchHours: number }
interface PubPerf { id: number; channel: string; status: string; episode: string; bufferPostId: string | null; scheduledAt: string | null; views: number; likes: number; comments: number; shares: number; retentionAvg: number; days: number; source: string }
interface Payload {
  daily: Daily[];
  channels: Record<string, ChannelTotals>;
  publications: PubPerf[];
  retentionCurve: { t: number; pct: number }[];
  insights: string[];
  sources: string[];
  note: string;
}

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));

export default function AnalyticsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch("/api/analytics", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setErr(e.message));
  }, []);

  const totals = data
    ? data.daily.reduce(
        (a, d) => ({
          views: a.views + d.views,
          likes: a.likes + d.likes,
          comments: a.comments + d.comments,
          shares: a.shares + d.shares,
          follows: a.follows + d.follows,
          watchHours: a.watchHours + d.watchHours,
        }),
        { views: 0, likes: 0, comments: 0, shares: 0, follows: 0, watchHours: 0 },
      )
    : null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10 lg:py-10">
      <PageHeader
        eyebrow="signal & retention"
        title={<>What the acre <span className="text-amber">returns.</span></>}
        sub="An independent analytics layer — Buffer-compatible, never Buffer-dependent. Until real channels are wired, a deterministic simulator demonstrates the shape of the data; every point is labelled."
        right={<Badge tone="mock">simulated source</Badge>}
      />

      {err && <EmptyState icon={<Activity className="h-8 w-8" />} title="Analytics unavailable" body={err} />}

      {!data && !err && <p className="font-mono text-xs text-muted">loading…</p>}

      {data && totals && data.daily.length === 0 && (
        <EmptyState
          icon={<Radio className="h-8 w-8" />}
          title="No publications yet"
          body="Approve and schedule an episode; snapshots begin accruing the evening it goes live. The charts below show the exact model that will be replaced by Buffer/platform data."
        />
      )}

      {data && data.daily.length > 0 && totals && (
        <>
          <div className="rise-in mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Views (all channels)" value={fmt(totals.views)} sub={`${data.daily.length} day window`} accent />
            <Stat label="Watch hours" value={totals.watchHours.toFixed(1)} sub="56-sec pieces" />
            <Stat label="Engagements" value={fmt(totals.likes + totals.comments + totals.shares)} sub={`${((totals.likes + totals.comments + totals.shares) / Math.max(1, totals.views) * 100).toFixed(1)}% of views`} />
            <Stat label="Follow delta" value={`+${fmt(totals.follows)}`} sub="across both channels" />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
            <Card className="rise-in">
              <h3 className="font-display mb-4 flex items-center gap-2 text-lg font-semibold text-cream">
                <TrendingUp className="h-4 w-4 text-amber" /> Daily views
              </h3>
              <LineSeries points={data.daily.map((d) => d.views)} labels={data.daily.map((d) => d.date.slice(5))} />
              <div className="mt-2 flex justify-between font-mono text-[9.5px] text-faint">
                <span>{data.daily[0]?.date}</span>
                <span>{data.daily[data.daily.length - 1]?.date}</span>
              </div>
            </Card>

            <Card className="rise-in">
              <h3 className="font-display mb-4 flex items-center gap-2 text-lg font-semibold text-cream">
                <Eye className="h-4 w-4 text-amber" /> Retention model
              </h3>
              <AreaCurve points={data.retentionCurve} />
              <p className="mt-2 text-[11px] leading-relaxed text-faint">
                Expected audience retention across a 60s vertical. Hands-in-frame activity scenes hold longest.
              </p>
            </Card>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card className="rise-in">
              <h3 className="font-display mb-4 text-lg font-semibold text-cream">Channel split</h3>
              <div className="space-y-4">
                {(["instagram", "youtube"] as const).map((ch) => {
                  const c = data.channels[ch] ?? { views: 0, likes: 0, follows: 0 };
                  const total = (data.channels.instagram?.views ?? 0) + (data.channels.youtube?.views ?? 0);
                  const pct = total ? Math.round((c.views / total) * 100) : 0;
                  return (
                    <div key={ch}>
                      <div className="mb-1.5 flex items-center justify-between text-[12px]">
                        <span className="font-semibold capitalize text-cream">{ch === "instagram" ? "Instagram · Reels" : "YouTube · Shorts"}</span>
                        <span className="font-mono text-muted">{fmt(c.views)} · {pct}%</span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-line/60">
                        <div className={`h-full rounded-full ${ch === "instagram" ? "bg-amber" : "bg-ember"}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="rise-in">
              <h3 className="font-display mb-4 flex items-center gap-2 text-lg font-semibold text-cream">
                <Sparkles className="h-4 w-4 text-amber" /> Reading the signal
              </h3>
              <ul className="space-y-2.5">
                {data.insights.map((s, i) => (
                  <li key={i} className="flex gap-3 rounded-xl border hairline bg-ink/50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-muted">
                    <ThumbsUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf" /> {s}
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-l-2 border-sky/50 pl-3 text-[11px] leading-relaxed text-faint">{data.note}</p>
            </Card>
          </div>

          {data.publications.length > 0 && (
            <Card className="rise-in mt-6">
              <h3 className="font-display mb-4 flex items-center gap-2 text-lg font-semibold text-cream">
                <Heart className="h-4 w-4 text-amber" /> Per-publication
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left font-mono text-[11.5px]">
                  <thead>
                    <tr className="border-b hairline text-faint">
                      {["episode", "channel", "status", "views", "likes", "shares", "retention", "source"].map((h) => (
                        <th key={h} className="px-3 py-2 font-medium uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.publications.map((p) => (
                      <tr key={p.id} className="border-b hairline last:border-0">
                        <td className="max-w-[220px] truncate px-3 py-2.5 text-straw">{p.episode}</td>
                        <td className="px-3 py-2.5 capitalize text-muted">{p.channel}</td>
                        <td className="px-3 py-2.5"><Badge tone={p.status} /></td>
                        <td className="px-3 py-2.5 text-cream">{fmt(p.views)}</td>
                        <td className="px-3 py-2.5 text-muted">{fmt(p.likes)}</td>
                        <td className="px-3 py-2.5 text-muted">{fmt(p.shares)}</td>
                        <td className="px-3 py-2.5 text-muted">{p.retentionAvg}%</td>
                        <td className="px-3 py-2.5 text-sky">{p.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function LineSeries({ points, labels }: { points: number[]; labels: string[] }) {
  if (!points.length) return null;
  const w = 560, h = 180, padX = 8, padY = 14;
  const max = Math.max(...points, 1);
  const xs = points.map((_, i) => padX + (i / Math.max(1, points.length - 1)) * (w - padX * 2));
  const ys = points.map((p) => h - padY - (p / max) * (h - padY * 2));
  const path = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const area = `${path} L${xs[xs.length - 1].toFixed(1)},${h - padY} L${xs[0].toFixed(1)},${h - padY} Z`;
  void labels;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <defs>
        <linearGradient id="lv" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8a33d" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#e8a33d" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#lv)" />
      <path d={path} fill="none" stroke="#e8a33d" strokeWidth="2" strokeLinecap="round" />
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r="2.6" fill="#12100e" stroke="#e8a33d" strokeWidth="1.6" />
      ))}
    </svg>
  );
}

function AreaCurve({ points }: { points: { t: number; pct: number }[] }) {
  const w = 560, h = 170, padX = 10, padY = 12;
  const xs = points.map((p) => padX + (p.t / 60) * (w - padX * 2));
  const ys = points.map((p) => h - padY - (Math.max(0, p.pct) / 100) * (h - padY * 2));
  const path = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const area = `${path} L${xs[xs.length - 1].toFixed(1)},${h - padY} L${padX},${h - padY} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <defs>
        <linearGradient id="rc" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8fae6a" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#8fae6a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#rc)" />
      <path d={path} fill="none" stroke="#8fae6a" strokeWidth="2" strokeLinecap="round" />
      {[0, 15, 30, 45, 60].map((t) => (
        <text key={t} x={padX + (t / 60) * (w - padX * 2)} y={h - 2} textAnchor="middle" fontSize="9" fill="#6f6454" fontFamily="monospace">
          {t}s
        </text>
      ))}
    </svg>
  );
}
