import { asc, desc } from "drizzle-orm";
import { CalendarClock, KeyRound, ShieldCheck, TimerReset } from "lucide-react";
import { db } from "@/db";
import { episodes, publications } from "@/db/schema";
import { bufferStatusSummary } from "@/lib/studio/buffer";
import { DEFAULT_SLOTS, TZ } from "@/lib/studio/constants";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { eq } from "drizzle-orm";
import { RefreshAll } from "@/components/queue-refresh";

export const dynamic = "force-dynamic";

export default async function PublishingPage() {
  const pubs = await db.select().from(publications).orderBy(asc(publications.scheduledAt));
  const eps = await db.select().from(episodes).orderBy(desc(episodes.seq));
  const buffer = bufferStatusSummary();

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10 lg:py-10">
      <PageHeader
        eyebrow="buffer bridge · single integration"
        title={<>Publishing, <span className="text-amber">by the sun.</span></>}
        sub={`One daily episode. YouTube Shorts ${DEFAULT_SLOTS.youtube} IST, Instagram Reels ${DEFAULT_SLOTS.instagram} IST — scheduled on approval only, and never claimed published until Buffer confirms.`}
        right={pubs.length > 0 ? <RefreshAll episodeIds={[...new Set(pubs.map((p) => p.episodeId))]} /> : undefined}
      />

      <div className="mb-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card className="rise-in">
          <h3 className="font-display mb-4 text-lg font-semibold text-cream">Connection</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border hairline bg-ink/50 p-4">
              <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-amber" /><span className="eyebrow">credentials</span></div>
              <dl className="mt-3 space-y-1.5 font-mono text-[11.5px]">
                <div className="flex justify-between"><dt className="text-faint">BUFFER_API_KEY</dt><dd className={buffer.apiKeyConfigured ? "text-leaf" : "text-amber"}>{buffer.apiKeyConfigured ? "set" : "not set — mock mode"}</dd></div>
                <div className="flex justify-between"><dt className="text-faint">ORGANIZATION_ID</dt><dd className="text-straw">{buffer.organizationId}</dd></div>
                <div className="flex justify-between"><dt className="text-faint">ALLOW_EXTERNAL</dt><dd className="text-straw">{buffer.externalCallsEnabled ? "true" : "false"}</dd></div>
              </dl>
            </div>
            <div className="rounded-xl border hairline bg-ink/50 p-4">
              <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-leaf" /><span className="eyebrow">policy</span></div>
              <dl className="mt-3 space-y-1.5 font-mono text-[11.5px]">
                <div className="flex justify-between"><dt className="text-faint">AUTO_PUBLISH</dt><dd className={buffer.autoPublish ? "text-amber" : "text-leaf"}>{String(buffer.autoPublish)}</dd></div>
                <div className="flex justify-between"><dt className="text-faint">approval gate</dt><dd className="text-straw">human-required</dd></div>
                <div className="flex justify-between"><dt className="text-faint">idempotency</dt><dd className="text-straw">sha256 keys</dd></div>
              </dl>
            </div>
          </div>
          <p className="mt-4 border-l-2 border-sky/50 pl-3 text-[12px] leading-relaxed text-muted">
            Set <code className="text-sky">BUFFER_API_KEY</code>, channel IDs and{" "}
            <code className="text-sky">ALLOW_EXTERNAL_CALLS=true</code> to go live against the GraphQL API at
            api.buffer.com. Until then, every stage of this pipeline is exercised by a deterministic mock and no
            network call ever leaves the box.
          </p>
        </Card>

        <Card className="rise-in">
          <h3 className="font-display mb-4 flex items-center gap-2 text-lg font-semibold text-cream">
            <TimerReset className="h-4 w-4 text-amber" /> Daily slots — {TZ}
          </h3>
          <div className="space-y-3">
            {[
              ["YouTube Shorts", DEFAULT_SLOTS.youtube, "morning drop — commute & chai"],
              ["Instagram Reels", DEFAULT_SLOTS.instagram, "evening scroll window"],
            ].map(([ch, t, why]) => (
              <div key={ch} className="flex items-center gap-4 rounded-xl border hairline bg-ink/50 px-4 py-3">
                <span className="font-display text-xl font-semibold tabular-nums text-amber">{t}</span>
                <div>
                  <div className="text-[12.5px] font-semibold text-cream">{ch}</div>
                  <div className="text-[11px] text-faint">{why}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
            Buffer plan limits are respected: one scheduled pair per day. Masters stay hosted on this studio — the
            public media URL simply hands Buffer a copy.
          </p>
        </Card>
      </div>

      {/* Queue */}
      {pubs.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="h-8 w-8" />}
          title="Queue empty"
          body="Approve a QC-passed episode and its YouTube + Instagram packages land here, idempotency-guarded."
        />
      ) : (
        <div className="rise-in space-y-3">
          {pubs.map((p) => {
            const ep = eps.find((e) => e.id === p.episodeId);
            return (
              <Card key={p.id} className="!p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone={p.status} />
                  <Badge tone={p.mode} />
                  <span className="text-[13px] font-bold capitalize text-cream">{p.channel}</span>
                  <span className="font-mono text-[11px] text-amber">{p.episodeId}</span>
                  <span className="truncate text-[12px] text-muted">{ep?.title}</span>
                  <span className="ml-auto font-mono text-[11px] text-straw">
                    {p.scheduledAt
                      ? new Date(p.scheduledAt).toLocaleString("en-GB", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" })
                      : "—"}{" "}
                    IST
                  </span>
                </div>
                <div className="mt-2 grid gap-1 px-0.5 font-mono text-[10.5px] text-faint md:grid-cols-2">
                  <span className="truncate">post: {p.bufferPostId ?? "— (draft until scheduled)"}</span>
                  <span className="truncate">media: {p.mediaUrl ?? "—"}</span>
                </div>
                {p.publishedAt && (
                  <div className="mt-2 font-mono text-[10.5px] text-leaf">
                    confirmed {new Date(p.publishedAt).toLocaleString("en-GB", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" })} IST
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
