import { sql } from "drizzle-orm";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  CircleDashed,
  FileSearch,
  GitBranch,
  Layers,
  ShieldAlert,
  Workflow,
} from "lucide-react";
import { db } from "@/db";
import { assets, episodes } from "@/db/schema";
import { STAGES } from "@/db/schema";
import { Badge, Card, PageHeader } from "@/components/ui";
import { TEMPLATES, SERIES } from "@/lib/studio/series";

export const dynamic = "force-dynamic";

const FINDINGS = [
  {
    title: "Existing engine: scaffold only",
    body: "Repository audit found a Next.js + PostgreSQL/Drizzle starter with no prior Python rendering pipeline, no Blender runtime, and no FFmpeg binary on the host. The 'existing engine' referenced in the brief was not present in this checkout.",
    tone: "warn",
  },
  {
    title: "JSON-first contract preserved",
    body: "Rather than rebuild blindly, the new engine consumes the same structured JSON episode specification format (EpisodeSpec) proposed in the brief, so a future Python/Blender provider can slot in behind the render adapter without touching the studio.",
    tone: "pass",
  },
  {
    title: "FFmpeg via static binaries",
    body: "ffmpeg-static + ffprobe binaries now power segment rendering, concat, synthesized ambience, caption burn-in and probing — no host install required.",
    tone: "pass",
  },
  {
    title: "Buffer is the only publisher",
    body: "A modular GraphQL client (api.buffer.com · createPost · customScheduled) sits behind env-driven config. Without BUFFER_API_KEY it runs a deterministic mock; no paid or external call can fire by accident (ALLOW_EXTERNAL_CALLS gate).",
    tone: "pass",
  },
  {
    title: "Missing: TTS, Higgsfield/Flow APIs, Blender",
    body: "Kannada narration ships as authored script + subtitles (tts_status=pending_voice). AI video providers and Blender runners are designed as adapters but intentionally not fabricated without credentials/subscriptions.",
    tone: "warn",
  },
];

const MODULES: [string, string, string][] = [
  ["content/planner.ts", "instruction → validated EpisodeSpec", "live"],
  ["content script.ts", "author-locked Kannada narration + captions/SRT", "live"],
  ["generation/series.ts", "6 series · 5 templates · activity library", "live"],
  ["generation/assets.ts", "Asset Bible v1 — frozen identities & geography", "live"],
  ["rendering/render.ts", "Ken Burns segments → concat → grade → master MP4", "live"],
  ["rendering/ffmpeg.ts", "binaries, exec, probe, volumedetect/blackdetect/silencedetect", "live"],
  ["audio/voices.ts + pronunciation.ts", "3 voice profiles (kn/hi/en) · Kannada rhythm dictionary", "live"],
  ["audio/providers.ts", "Gemini TTS adapter + labelled mock · retry · key hygiene", "live (mock until key)"],
  ["audio/tts.ts + mix.ts", "segment TTS w/ hash cache · 6-bus ducking mix · −15 LUFS", "live"],
  ["audio/*.py", "standalone Gemini TTS toolkit (google-genai SDK)", "live (CLI)"],
  ["quality/qc.ts", "measured video/audio/visual/metadata/publishing checks", "live"],
  ["publishing/buffer.ts", "GraphQL client + mock, retries, idempotency", "live (mock by default)"],
  ["analytics/collector.ts", "deterministic snapshots → Buffer/platform swap-in", "live (simulated)"],
  ["pipeline.ts", "resumable, logged, idempotent stage executor", "live"],
  ["ai_providers/*", "Higgsfield / Flow / voice adapters", "spec'd — awaiting credentials"],
  ["blender/*", "asset factory & camera-template runner", "spec'd — runtime absent"],
];

const ROADMAP: { phase: string; name: string; state: "done" | "active" | "next" }[] = [
  { phase: "0", name: "Repository & environment audit", state: "done" },
  { phase: "1", name: "Validated episode JSON schemas + templates", state: "done" },
  { phase: "2", name: "Asset Bible — persistent farm, Nanjunda, Ganga", state: "done" },
  { phase: "3", name: "Production automation — 12-stage pipeline", state: "done" },
  { phase: "4", name: "Episode 001 rendered & inspected", state: "active" },
  { phase: "5", name: "Automated QC gate with measured checks", state: "done" },
  { phase: "6", name: "Buffer scheduling (mock → live on credentials)", state: "active" },
  { phase: "7", name: "Analytics loop & reports", state: "active" },
  { phase: "8", name: "Autonomous operation behind AUTO_PUBLISH flag", state: "next" },
];

const RISKS: [string, string][] = [
  ["AI visual drift", "Plates are never ad-hoc generated per episode; new plates require QC before entering the library."],
  ["Voice dead-end without TTS", "Disclosed on every episode — subtitles carry meaning; book a Kannada voice session."],
  ["Buffer plan limits", "One pair/day scheduling; status never claimed before Buffer confirmation."],
  ["Factual drift for engagement", "Analytics inform format only — never farming facts."],
  ["Credential leakage", "Env-only secrets, masked in logs/UI, external calls behind a second flag."],
];

export default async function AuditPage() {
  const assetCount = (await db.select({ n: sql<number>`count(*)::int` }).from(assets))[0]?.n ?? 0;
  const epCount = (await db.select({ n: sql<number>`count(*)::int` }).from(episodes))[0]?.n ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10 lg:py-10">
      <PageHeader
        eyebrow="phase 0 · technical assessment"
        title={<>The studio, <span className="text-amber">on one page.</span></>}
        sub="What existed, what was reused, what was built, and what is deliberately left open. This page is written from the actual repository — not from a template."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rise-in">
          <h3 className="font-display mb-4 flex items-center gap-2 text-lg font-semibold text-cream">
            <FileSearch className="h-4 w-4 text-amber" /> Audit findings
          </h3>
          <ul className="space-y-3">
            {FINDINGS.map((f) => (
              <li key={f.title} className="rounded-xl border hairline bg-ink/50 p-3.5">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-cream">
                  {f.tone === "pass" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-leaf" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber" />
                  )}
                  {f.title}
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{f.body}</p>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-6">
          <Card className="rise-in">
            <h3 className="font-display mb-4 flex items-center gap-2 text-lg font-semibold text-cream">
              <Workflow className="h-4 w-4 text-amber" /> The 12-stage pipeline
            </h3>
            <ol className="columns-2 gap-3 space-y-1.5">
              {STAGES.map((s, i) => (
                <li key={s} className="flex items-center gap-2 break-inside-avoid rounded-lg border hairline bg-ink/50 px-2.5 py-2 font-mono text-[10.5px] text-straw">
                  <span className="text-amber">{String(i + 1).padStart(2, "0")}</span> {s}
                </li>
              ))}
            </ol>
            <p className="mt-4 text-[11.5px] leading-relaxed text-faint">
              Every stage is input-hashed, logged, resumable and idempotent. Failures never re-render finished work.
            </p>
          </Card>

          <Card className="rise-in">
            <h3 className="font-display mb-4 flex items-center gap-2 text-lg font-semibold text-cream">
              <GitBranch className="h-4 w-4 text-amber" /> Roadmap
            </h3>
            <ol className="space-y-2">
              {ROADMAP.map((r) => (
                <li key={r.phase} className="flex items-center gap-3">
                  {r.state === "done" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-leaf" />
                  ) : r.state === "active" ? (
                    <CircleDashed className="h-4 w-4 shrink-0 text-amber dot-pulse" />
                  ) : (
                    <CircleDashed className="h-4 w-4 shrink-0 text-faint" />
                  )}
                  <span className="font-mono text-[10px] text-faint">P{r.phase}</span>
                  <span className={`text-[12.5px] ${r.state === "done" ? "text-straw" : r.state === "active" ? "text-cream" : "text-faint"}`}>
                    {r.name}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      <Card className="rise-in mt-6">
        <h3 className="font-display mb-4 flex items-center gap-2 text-lg font-semibold text-cream">
          <Layers className="h-4 w-4 text-amber" /> Module map — what exists, what runs
        </h3>
        <div className="grid gap-1.5 md:grid-cols-2">
          {MODULES.map(([m, d, st]) => (
            <div key={m} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border hairline bg-ink/50 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate font-mono text-[11px] text-straw">{m}</div>
                <div className="text-[11px] text-faint">{d}</div>
              </div>
              <Badge tone={st.startsWith("live") ? "pass" : "manual"}>{st}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="rise-in">
          <h3 className="font-display mb-4 flex items-center gap-2 text-lg font-semibold text-cream">
            <ShieldAlert className="h-4 w-4 text-ember" /> Risks & guardrails
          </h3>
          <ul className="space-y-3">
            {RISKS.map(([r, g]) => (
              <li key={r} className="rounded-xl border hairline bg-ink/50 p-3.5">
                <div className="text-[12.5px] font-semibold text-cream">{r}</div>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">{g}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="rise-in">
          <h3 className="font-display mb-4 flex items-center gap-2 text-lg font-semibold text-cream">
            <Boxes className="h-4 w-4 text-amber" /> Studio ledger
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              ["series catalog", SERIES.length],
              ["video templates", TEMPLATES.length],
              ["canonical assets", assetCount],
              ["episodes planned", epCount],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-xl border hairline bg-ink/50 p-4 text-center">
                <div className="font-display text-3xl font-semibold text-amber">{v as number}</div>
                <div className="eyebrow mt-1 text-[9px]">{k as string}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border hairline bg-ink/50 p-4">
            <div className="eyebrow mb-2">environment contract</div>
            <pre className="overflow-x-auto font-mono text-[10.5px] leading-relaxed text-straw">
{`BUFFER_API_KEY=               # GraphQL Bearer — live mode switch
BUFFER_ORGANIZATION_ID=
BUFFER_INSTAGRAM_CHANNEL_ID=
BUFFER_YOUTUBE_CHANNEL_ID=
ALLOW_EXTERNAL_CALLS=false    # second gate before any paid/live call
AUTO_PUBLISH=false            # autonomous approval stays OFF`}
            </pre>
          </div>
        </Card>
      </div>
    </div>
  );
}
