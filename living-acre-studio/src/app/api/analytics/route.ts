import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { analyticsSnapshots, episodes, publications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { syncAnalytics } from "@/lib/studio/pipeline";
import * as analyticsLib from "@/lib/studio/analytics";

export const dynamic = "force-dynamic";

export async function GET() {
  await syncAnalytics();
  const snaps = await db
    .select()
    .from(analyticsSnapshots)
    .orderBy(asc(analyticsSnapshots.capturedDate));
  const pubs = await db.select().from(publications).orderBy(asc(publications.id));

  const byDate = new Map<string, { date: string; views: number; likes: number; comments: number; shares: number; follows: number; watchHours: number }>();
  const zero = () => ({ views: 0, likes: 0, comments: 0, shares: 0, follows: 0, watchHours: 0 });
  const channels: Record<string, ReturnType<typeof zero>> = { instagram: zero(), youtube: zero() };

  for (const s of snaps) {
    const pub = pubs.find((p) => p.id === s.publicationId);
    const day = byDate.get(s.capturedDate) ?? { date: s.capturedDate, ...zero() };
    day.views += s.views;
    day.likes += s.likes;
    day.comments += s.comments;
    day.shares += s.shares;
    day.follows += s.followsDelta;
    day.watchHours += s.watchSeconds / 3600;
    byDate.set(s.capturedDate, day);
    if (pub && channels[pub.channel]) {
      const c = channels[pub.channel];
      c.views += s.views;
      c.likes += s.likes;
      c.comments += s.comments;
      c.shares += s.shares;
      c.follows += s.followsDelta;
      c.watchHours += s.watchSeconds / 3600;
    }
  }

  const pubPerf = await Promise.all(
    pubs.map(async (p) => {
      const rows = snaps.filter((s) => s.publicationId === p.id);
      const ep = (await db.select().from(episodes).where(eq(episodes.id, p.episodeId)))[0];
      return {
        id: p.id,
        channel: p.channel,
        status: p.status,
        episode: ep?.title ?? p.episodeId,
        bufferPostId: p.bufferPostId,
        scheduledAt: p.scheduledAt,
        views: rows.reduce((a, r) => a + r.views, 0),
        likes: rows.reduce((a, r) => a + r.likes, 0),
        comments: rows.reduce((a, r) => a + r.comments, 0),
        shares: rows.reduce((a, r) => a + r.shares, 0),
        retentionAvg: rows.length ? Math.round(rows.reduce((a, r) => a + r.retentionPct, 0) / rows.length) : 0,
        days: rows.length,
        source: rows[0]?.source ?? "simulated",
      };
    }),
  );

  // Expected retention shape — measured model from studio plots.
  const retentionCurve = Array.from({ length: 21 }, (_, i) => {
    const t = (i / 20) * 60;
    return { t: Math.round(t), pct: Math.round(100 * Math.exp(-t / 95) - t * 0.28) };
  });

  const titles = pubPerf.map((p) => p.episode);
  return NextResponse.json({
    daily: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    channels,
    publications: pubPerf,
    retentionCurve,
    insights: analyticsLib.insights(
      titles,
      channels as { instagram: analyticsLib.ChannelTotals; youtube: analyticsLib.ChannelTotals },
    ),
    sources: ["simulated"],
    note: "Buffer analytics wiring planned; platform APIs optional future integrations. Numbers here are the deterministic simulator until then.",
  });
}
