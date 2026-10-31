import Link from "next/link";
import { desc } from "drizzle-orm";
import { Clapperboard, Film, Plus } from "lucide-react";
import { db } from "@/db";
import { episodes } from "@/db/schema";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { ProduceForm } from "@/components/produce-form";
import { TZ } from "@/lib/studio/constants";

export const dynamic = "force-dynamic";

export default async function EpisodesPage() {
  const eps = await db.select().from(episodes).orderBy(desc(episodes.seq));
  return (
    <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10 lg:py-10">
      <PageHeader
        eyebrow="production library"
        title={<>Every day the acre <span className="text-amber">speaks</span>.</>}
        sub="Each episode starts as a plain-language instruction, becomes a validated JSON spec, renders through the plate library, passes QC, and waits for a human green light before Buffer touches it."
      />

      <div className="card-surface rise-in mb-8 p-5">
        <div className="eyebrow mb-3 flex items-center gap-2"><Plus className="h-3.5 w-3.5" /> new episode instruction</div>
        <ProduceForm />
      </div>

      {eps.length === 0 ? (
        <EmptyState
          icon={<Film className="h-8 w-8" />}
          title="No episodes yet"
          body="Plan the first morning — the planner will draft the spec, scenes and stages instantly."
        />
      ) : (
        <div className="space-y-3">
          {eps.map((e) => (
            <Link
              key={e.id}
              href={`/episodes/${e.id}`}
              className="card-surface rise-in flex flex-wrap items-center gap-4 p-5"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border hairline bg-ink">
                <Clapperboard className="h-5 w-5 text-amber" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-amber">{e.id}</span>
                  <Badge tone={e.status} />
                </div>
                <div className="font-display mt-1 truncate text-lg font-semibold text-cream">{e.title}</div>
                <div className="mt-0.5 line-clamp-1 text-xs text-muted">{e.instruction}</div>
              </div>
              <div className="hidden text-right font-mono text-[11px] text-faint sm:block">
                <div>{e.durationSeconds}s · {e.aspectRatio} · {e.language}</div>
                <div className="mt-1">
                  {new Date(e.createdAt).toLocaleString("en-GB", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" })} IST
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
