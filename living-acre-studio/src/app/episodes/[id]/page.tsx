import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getEpisodeDetail } from "@/lib/studio/pipeline";
import { EpisodeConsole } from "@/components/episode-console";
import type { Detail } from "@/lib/studio/detail";

export const dynamic = "force-dynamic";

export default async function EpisodePage(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const detail = await getEpisodeDetail(id);
  if (!detail) notFound();
  const initial = JSON.parse(JSON.stringify(detail)) as Detail;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 lg:px-10 lg:py-10">
      <Link href="/episodes" className="mb-5 inline-flex items-center gap-2 text-xs text-muted hover:text-amber">
        <ArrowLeft className="h-3.5 w-3.5" /> all episodes
      </Link>
      <header className="rise-in mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="eyebrow mb-2">
            {initial.episode.id} · {initial.series?.name ?? initial.episode.seriesSlug}
          </div>
          <h1 className="font-display text-[32px] font-semibold leading-tight tracking-tight text-cream md:text-[40px]">
            {initial.episode.title}
          </h1>
          <p className="mt-3 max-w-2xl border-l-2 border-amber/40 pl-4 font-mono text-[12px] leading-relaxed text-muted">
            “{initial.episode.instruction}”
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 font-mono text-[11px] text-faint">
          <span>{initial.episode.width}×{initial.episode.height} · {initial.episode.aspectRatio} · {initial.episode.durationSeconds}s</span>
          <span>{initial.episode.visualStyle} · {initial.episode.cameraStyle}</span>
          <span className="text-sky">simulation — labelled AI-generated</span>
        </div>
      </header>
      <EpisodeConsole initial={initial} />
    </div>
  );
}
