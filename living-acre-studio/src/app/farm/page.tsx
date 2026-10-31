import Image from "next/image";
import { asc } from "drizzle-orm";
import { PawPrint, PersonStanding, Palette, Camera, Leaf } from "lucide-react";
import { db } from "@/db";
import { assets } from "@/db/schema";
import { PageHeader, Card, Badge } from "@/components/ui";
import { FarmMap, type MapAsset } from "@/components/farm-map";

export const dynamic = "force-dynamic";

export default async function FarmPage() {
  const rows = await db.select().from(assets).orderBy(asc(assets.id));
  const farmer = rows.find((a) => a.id === "char-nanjunda");
  const ganga = rows.find((a) => a.id === "animal-ganga");
  const plates = rows.filter((a) => a.kind === "scene_plate");

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10 lg:py-10">
      <PageHeader
        eyebrow="asset bible · version 1 (frozen)"
        title={<>One acre. <span className="text-amber">Never redrawn.</span></>}
        sub="Every episode references this canonical parcel: same geography, same farmer, same cow, same dawn light. Identity tokens are enforced by the QC gate."
      />

      <div className="rise-in">
        <FarmMap assets={rows as unknown as MapAsset[]} />
      </div>

      {/* Identities */}
      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        {farmer && (
          <Card grainy className="rise-in">
            <div className="relative z-[2] grid gap-5 sm:grid-cols-[180px_1fr]">
              <div className="video-frame relative aspect-[3/4] overflow-hidden rounded-xl">
                {farmer.imagePath && (
                  <Image src={farmer.imagePath} alt={farmer.name} fill sizes="180px" className="object-cover" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <PersonStanding className="h-4 w-4 text-amber" />
                  <span className="eyebrow">farmer · pov identity</span>
                </div>
                <h3 className="font-display mt-2 text-3xl font-semibold text-cream">{farmer.name}</h3>
                <p className="mt-1 text-sm italic text-amber/80">{farmer.subtitle}</p>
                <p className="mt-3 text-[13px] leading-relaxed text-muted">{farmer.description}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {(farmer.spec?.identityTokens ?? []).map((t: string) => (
                    <span key={t} className="rounded-md border hairline bg-raise px-2 py-1 font-mono text-[10.5px] text-straw">{t}</span>
                  ))}
                </div>
                <p className="mt-4 border-l-2 border-amber/50 pl-3 font-mono text-[10.5px] leading-relaxed text-faint">{farmer.spec?.markings}</p>
              </div>
            </div>
          </Card>
        )}
        {ganga && (
          <Card grainy className="rise-in">
            <div className="relative z-[2] grid gap-5 sm:grid-cols-[180px_1fr]">
              <div className="video-frame relative aspect-[3/4] overflow-hidden rounded-xl">
                {ganga.imagePath && (
                  <Image src={ganga.imagePath} alt={ganga.name} fill sizes="180px" className="object-cover" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <PawPrint className="h-4 w-4 text-amber" />
                  <span className="eyebrow">livestock · hallikar</span>
                </div>
                <h3 className="font-display mt-2 text-3xl font-semibold text-cream">{ganga.name}</h3>
                <p className="mt-1 text-sm italic text-amber/80">{ganga.subtitle}</p>
                <p className="mt-3 text-[13px] leading-relaxed text-muted">{ganga.description}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {(ganga.spec?.identityTokens ?? []).map((t: string) => (
                    <span key={t} className="rounded-md border hairline bg-raise px-2 py-1 font-mono text-[10.5px] text-straw">{t}</span>
                  ))}
                </div>
                <p className="mt-4 border-l-2 border-leaf/60 pl-3 font-mono text-[10.5px] leading-relaxed text-faint">{ganga.spec?.markings}</p>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Conventions */}
      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <Card className="rise-in">
          <div className="mb-3 flex items-center gap-2"><Palette className="h-4 w-4 text-amber" /><h3 className="font-display text-lg font-semibold text-cream">Light & palette</h3></div>
          <div className="flex flex-wrap gap-2">
            {["#f1ead9", "#e8a33d", "#c96a45", "#8fae6a", "#6e4a2f", "#12100e"].map((c) => (
              <span key={c} className="flex items-center gap-2 rounded-lg border hairline bg-ink/50 px-2.5 py-1.5 font-mono text-[10.5px] text-straw">
                <span className="h-3.5 w-3.5 rounded" style={{ background: c }} /> {c}
              </span>
            ))}
          </div>
          <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
            Golden-hour first light for mornings; deep amber for evenings. Gentle film grain and a restrained
            vignette are applied at master grade — no heavy LUTs.
          </p>
        </Card>
        <Card className="rise-in">
          <div className="mb-3 flex items-center gap-2"><Camera className="h-4 w-4 text-amber" /><h3 className="font-display text-lg font-semibold text-cream">POV conventions</h3></div>
          <ul className="space-y-2 text-[12.5px] leading-relaxed text-muted">
            <li className="flex gap-2"><Badge tone="pass">rule</Badge> First-person is the default eye; hands enter frame only when acting.</li>
            <li className="flex gap-2"><Badge tone="pass">rule</Badge> 6–12s unhurried holds; motion is motivated (push-in on approach, settle on arrival).</li>
            <li className="flex gap-2"><Badge tone="warn">never</Badge> No whip-pans, no idle drift, no game-like constant motion.</li>
          </ul>
        </Card>
        <Card className="rise-in">
          <div className="mb-3 flex items-center gap-2"><Leaf className="h-4 w-4 text-amber" /><h3 className="font-display text-lg font-semibold text-cream">Scene plate library</h3></div>
          <div className="grid grid-cols-3 gap-2">
            {plates.map((p) => (
              <div key={p.id} className="group relative aspect-[9/16] overflow-hidden rounded-lg border hairline">
                {p.imagePath && (
                  <Image src={p.imagePath} alt={p.name} fill sizes="110px" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                )}
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/95 to-transparent px-1.5 pb-1.5 pt-5 font-mono text-[8.5px] uppercase tracking-wide text-straw">
                  {p.name}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
