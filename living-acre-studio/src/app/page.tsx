import Link from "next/link";
import Image from "next/image";
import { desc, sql } from "drizzle-orm";
import {
  ArrowRight,
  ArrowUpRight,
  CircleDollarSign,
  Clapperboard,
  Clock3,
  Database,
  Sprout,
  Timer,
  Video,
} from "lucide-react";
import { db } from "@/db";
import { assets, episodes, mediaFiles, series, stages, usageEvents } from "@/db/schema";
import { bufferStatusSummary } from "@/lib/studio/buffer";
import { Badge, Card, ProgressBar, Stat } from "@/components/ui";
import { ProduceForm } from "@/components/produce-form";
import { DEFAULT_SLOTS, TZ } from "@/lib/studio/constants";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const eps = await db.select().from(episodes).orderBy(desc(episodes.seq));
  const latest = eps[0];
  const latestStages = latest
    ? await db.select().from(stages).where(sql`${stages.episodeId} = ${latest.id}`).orderBy(stages.idx)
    : [];
  const seriesRows = await db.select().from(series).orderBy(series.sortOrder);
  const assetCount = (await db.select({ n: sql<number>`count(*)::int` }).from(assets))[0]?.n ?? 0;
  const usage = await db.select().from(usageEvents);
  const usageTotals = usage.reduce<Record<string, number>>((acc, u) => {
    acc[u.kind] = (acc[u.kind] ?? 0) + u.units;
    return acc;
  }, {});
  const masters = await db.select().from(mediaFiles).where(sql`${mediaFiles.kind} = 'master_video'`);
  const renderSeconds = Math.round(usageTotals["render_seconds"] ?? 0);
  const storageMb = ((usageTotals["storage_bytes"] ?? 0) / 1048576).toFixed(1);
  const buffer = bufferStatusSummary();
  const doneStages = latestStages.filter((s) => s.status === "complete").length;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10 lg:py-10">
      {/* Hero */}
      <section className="rise-in relative mb-10 overflow-hidden rounded-3xl border hairline">
        <Image
          src="/assets/plates/08-aerial.jpg"
          alt="The Living Acre at sunrise"
          fill
          priority
          sizes="(min-width: 1024px) 1100px, 100vw"
          className="object-cover object-center opacity-60"
        />
        <div className="sunrise-band absolute inset-0" />
        <div className="relative z-[2] px-7 py-12 lg:px-10 lg:py-16">
          <div className="eyebrow mb-4 !text-amber/90">autonomous rural-life video studio</div>
          <h1 className="font-display max-w-2xl text-[40px] font-semibold leading-[1.02] tracking-tight text-cream md:text-[56px]">
            The Living Acre<span className="text-amber">.</span>
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-straw/90">
            One acre of red North-Karnataka soil, rendered as a continuous world. The engine plans,
            scripts, renders, validates and schedules first-person farm episodes — a human approves;
            Buffer publishes.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href={latest ? `/episodes/${latest.id}` : "/episodes"}
              className="btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm"
            >
              <Video className="h-4 w-4" />
              {latest ? `Open ${latest.id}` : "Produce Episode 001"}
            </Link>
            <Link href="/farm" className="btn-ghost inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm">
              <Sprout className="h-4 w-4" /> The Acre canon
            </Link>
            <span className="eyebrow ml-1">{TZ} · YT {DEFAULT_SLOTS.youtube} · IG {DEFAULT_SLOTS.instagram}</span>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <div className="rise-in mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Episodes planned" value={eps.length} sub={`latest: ${latest?.id ?? "—"}`} />
        <Stat label="Masters rendered" value={masters.length} sub="1080×1920 · H.264 · AAC" />
        <Stat
          label="Render wall-time"
          value={`${Math.floor(renderSeconds / 60)}m ${renderSeconds % 60}s`}
          sub="local ffmpeg · $0.00"
        />
        <Stat label="Master storage" value={`${storageMb} MB`} sub="retained off-Buffer" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        {/* Today's production */}
        <Card grainy className="rise-in">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-cream">Today's production</h2>
            {latest && <Badge tone={latest.status} />}
          </div>

          {latest ? (
            <div className="mb-5 rounded-2xl border hairline bg-ink/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-amber">{latest.id}</div>
                  <div className="font-display mt-1 text-lg font-medium text-cream">{latest.title}</div>
                </div>
                <Link href={`/episodes/${latest.id}`} className="btn-ghost inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs">
                  Production console <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="mt-4">
                <div className="mb-1.5 flex justify-between text-[11px] text-faint">
                  <span>{doneStages}/{latestStages.length} stages</span>
                  <span>{Math.round((doneStages / Math.max(1, latestStages.length)) * 100)}%</span>
                </div>
                <ProgressBar pct={(doneStages / Math.max(1, latestStages.length)) * 100} tone={latest.status === "failed" ? "amber" : "leaf"} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {latestStages.map((s) => (
                  <span
                    key={s.id}
                    title={s.stage}
                    className={`h-2 w-6 rounded-full ${
                      s.status === "complete"
                        ? "bg-leaf"
                        : s.status === "running"
                          ? "bg-amber dot-pulse"
                          : s.status === "failed"
                            ? "bg-ember"
                            : "bg-line"
                    }`}
                  />
                ))}
              </div>
            </div>
          ) : (
            <p className="mb-5 text-sm text-muted">No episodes yet — plan the first morning below.</p>
          )}

          <div className="eyebrow mb-2">instruction → episode spec</div>
          <ProduceForm />
        </Card>

        {/* Right column */}
        <div className="space-y-6">
          <Card className="rise-in">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-cream">Buffer bridge</h3>
              <Badge tone={buffer.mode} />
            </div>
            <dl className="space-y-2 font-mono text-[12px]">
              {[
                ["organization", buffer.organizationId],
                ["channels", String(buffer.channels.length || 2)],
                ["auto_publish", buffer.autoPublish ? "true (armed)" : "false (manual approval)"],
                ["external calls", buffer.externalCallsEnabled ? "allowed" : "blocked — sandbox default"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b hairline pb-2 last:border-0">
                  <dt className="text-faint">{k}</dt>
                  <dd className="text-right text-straw">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[11.5px] leading-relaxed text-faint">{buffer.note}</p>
          </Card>

          <Card className="rise-in">
            <div className="mb-3 flex items-center gap-2">
              <CircleDollarSign className="h-4 w-4 text-leaf" />
              <h3 className="font-display text-lg font-semibold text-cream">Spend discipline</h3>
            </div>
            <dl className="space-y-2 font-mono text-[12px]">
              {[
                ["ai generation", `${usageTotals["ai_plate"] ?? 0} plate-uses · $0`],
                ["ffmpeg renders", `${renderSeconds}s wall · $0`],
                ["storage", `${storageMb} MB`],
                ["paid api calls", "$0.00 — approval-gated"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b hairline pb-2 last:border-0">
                  <dt className="text-faint">{k}</dt>
                  <dd className="text-straw">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 flex items-center gap-2 text-[11.5px] text-faint">
              <Database className="h-3.5 w-3.5" /> {assetCount} canonical assets · versioned, never silently mutated
            </p>
          </Card>
        </div>
      </div>

      {/* Series */}
      <div className="rise-in mt-10">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <div className="eyebrow">content strategy</div>
            <h2 className="font-display mt-2 text-2xl font-semibold text-cream">Six recurring series</h2>
          </div>
          <Link href="/audit" className="inline-flex items-center gap-1 text-xs text-muted hover:text-amber">
            roadmap <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {seriesRows.map((s) => (
            <Card key={s.id} className="group">
              <div className="mb-3 flex items-center justify-between">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.accent }} />
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">{s.cadence}</span>
              </div>
              <h3 className="font-display text-[17px] font-semibold leading-tight text-cream group-hover:text-amber">
                {s.name}
              </h3>
              <p className="mt-1 text-[12.5px] italic text-amber/80">{s.tagline}</p>
              <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-muted">{s.description}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent episodes */}
      {eps.length > 0 && (
        <div className="rise-in mt-10">
          <div className="eyebrow mb-4">production register</div>
          <div className="card-surface overflow-hidden">
            {eps.slice(0, 6).map((e) => (
              <Link
                key={e.id}
                href={`/episodes/${e.id}`}
                className="flex flex-wrap items-center gap-4 border-b hairline px-5 py-4 last:border-0 hover:bg-raise/60"
              >
                <Clapperboard className="h-4 w-4 text-faint" />
                <span className="font-mono text-[12px] text-amber">{e.id}</span>
                <span className="flex-1 text-[13.5px] font-semibold text-cream">{e.title}</span>
                <span className="hidden items-center gap-1 text-[11.5px] text-faint sm:flex">
                  <Timer className="h-3.5 w-3.5" /> {e.durationSeconds}s · {e.aspectRatio}
                </span>
                <span className="hidden items-center gap-1 text-[11.5px] text-faint md:flex">
                  <Clock3 className="h-3.5 w-3.5" />
                  {new Date(e.createdAt).toLocaleDateString("en-GB", { timeZone: TZ })}
                </span>
                <Badge tone={e.status} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
