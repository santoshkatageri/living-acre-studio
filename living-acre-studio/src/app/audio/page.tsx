import { asc, eq } from "drizzle-orm";
import { AudioLines, BookOpenText, CheckCircle2, KeyRound, ListMusic, Volume2 } from "lucide-react";
import { db } from "@/db";
import { audioPoc, studioConfig, usageEvents } from "@/db/schema";
import { Badge, Card, KV, PageHeader } from "@/components/ui";
import { PRONUNCIATION_DICTIONARY } from "@/lib/audio/pronunciation";
import { GEMINI_TTS_MODELS, VOICE_PROFILES } from "@/lib/audio/voices";
import { PocRunner } from "@/components/poc-runner";
import { POC_TEXT_EN, POC_TEXT_KN } from "@/lib/audio/poc";

export const dynamic = "force-dynamic";

export default async function AudioStudioPage() {
  const takes = await db.select().from(audioPoc).orderBy(asc(audioPoc.id));
  const approvals = (
    (await db.select().from(studioConfig).where(eq(studioConfig.key, "voice_approvals")))[0]?.value ?? {}
  ) as Record<string, { voiceId: string; approvedAt: string; note: string }>;
  const ttsUsage = (await db.select().from(usageEvents)).filter((u) => u.kind === "tts_chars");
  const chars = ttsUsage.reduce((n, u) => n + u.units, 0);
  const geminiSet = Boolean(process.env.GEMINI_API_KEY);
  const externalOk = (process.env.ALLOW_EXTERNAL_CALLS ?? "").toLowerCase() === "true";
  const live = geminiSet && externalOk;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10 lg:py-10">
      <PageHeader
        eyebrow="audio production · google ai studio / gemini tts"
        title={<>The voice of <span className="text-amber">the acre.</span></>}
        sub="Kannada-first narration with Hindi and English localisation tracks, independent ambience / sfx / music buses, ducking and loudness targets validated by QC. Real voices engage only when a GEMINI_API_KEY is configured and external calls are explicitly allowed."
        right={<Badge tone={live ? "live" : "mock"}>{live ? "gemini live" : "mock voice"}</Badge>}
      />

      {/* Provider & cost */}
      <div className="mb-8 grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <Card className="rise-in">
          <div className="mb-4 flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-amber" />
            <h3 className="font-display text-lg font-semibold text-cream">Provider & credentials</h3>
          </div>
          <KV k="provider adapter" v="google_gemini (registry: elevenlabs reserved, none present in repo)" />
          <KV k="endpoint" v="generativelanguage.googleapis.com/v1beta/…:generateContent" />
          <KV k="models" v={`${GEMINI_TTS_MODELS.flash} · ${GEMINI_TTS_MODELS.pro}`} />
          <KV k="GEMINI_API_KEY" v={geminiSet ? "set (value hidden)" : "not set"} />
          <KV k="ALLOW_EXTERNAL_CALLS" v={externalOk ? "true" : "false — paid calls blocked"} />
          <KV k="output" v="PCM L16 24 kHz mono → WAV segment → AAC in master" />
          <p className="mt-3 border-l-2 border-sky/50 pl-3 text-[11.5px] leading-relaxed text-muted">
            Keys are read from environment at request time, never logged, never shipped to the browser.
            Narration characters used to date: <b className="text-straw">{Math.round(chars)}</b> (est. $
            {((chars / 1_000_000) * 16).toFixed(4)} at list price — $0 on free tier).
          </p>
        </Card>

        <Card className="rise-in">
          <div className="mb-4 flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-amber" />
            <h3 className="font-display text-lg font-semibold text-cream">Episode audio schema</h3>
          </div>
          <pre className="overflow-x-auto rounded-xl border hairline bg-ink/70 p-4 font-mono text-[10px] leading-relaxed text-straw">
{`"audio": {
  "language": "kn",
  "narration": { "provider": "google_gemini",
    "model": "gemini-2.5-flash-preview-tts",
    "voiceProfile": "kannada_storyteller",
    "voiceId": "Sulafat", "pace": "moderate" },
  "ambience":  { "enabled": true,
    "tracks": ["morning_birds","gentle_wind","farm_roomtone"] },
  "soundEffects": { "enabled": true,
    "tracks": ["footsteps","water_flowing"] },
  "music": { "enabled": true, "style": "peaceful_rural",
    "duckDuringNarration": true },
  "mix": { "loudnessILufs": -15, "truePeakDb": -1.5 } }`}
          </pre>
        </Card>
      </div>

      {/* Voice profiles */}
      <div className="rise-in mb-8">
        <div className="eyebrow mb-3">voice profiles</div>
        <div className="grid gap-4 md:grid-cols-3">
          {VOICE_PROFILES.map((v) => {
            const appr = approvals[v.id];
            return (
              <Card key={v.id} grainy>
                <div className="relative z-[2]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-amber">{v.language} · {v.languageHint}</span>
                    {appr ? (
                      <span className="inline-flex items-center gap-1 font-mono text-[9.5px] text-leaf"><CheckCircle2 className="h-3.5 w-3.5" /> approved</span>
                    ) : (
                      <span className="font-mono text-[9.5px] text-faint">awaiting A/B approval</span>
                    )}
                  </div>
                  <h4 className="font-display mt-2 text-xl font-semibold text-cream">{v.label}</h4>
                  <p className="mt-1 text-[12px] text-muted">{v.accent} · {v.style.replace(/_/g, " ")}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[10.5px]">
                    <div className="rounded-lg border hairline bg-ink/50 px-2.5 py-2"><span className="text-faint">primary</span><div className="text-straw">{v.voiceId}</div></div>
                    <div className="rounded-lg border hairline bg-ink/50 px-2.5 py-2"><span className="text-faint">compare</span><div className="text-straw">{v.altVoiceId}</div></div>
                  </div>
                  <p className="mt-3 border-l-2 border-amber/40 pl-3 text-[11px] leading-relaxed text-muted">{v.direction}</p>
                  {appr && <p className="mt-2 font-mono text-[9.5px] text-faint">approved {new Date(appr.approvedAt).toLocaleDateString("en-GB")} · voice {appr.voiceId}</p>}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* POC */}
      <div className="rise-in mb-8 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <Card grainy>
          <div className="relative z-[2]">
            <div className="mb-3 flex items-center gap-2">
              <AudioLines className="h-4 w-4 text-amber" />
              <h3 className="font-display text-lg font-semibold text-cream">First audio POC — 20–30s Kannada</h3>
            </div>
            <p className="rounded-xl border hairline bg-ink/50 p-3.5 text-[14px] leading-relaxed text-cream">{POC_TEXT_KN}</p>
            <p className="mt-2 text-[11.5px] italic text-muted">{POC_TEXT_EN}</p>
            <PocRunner takes={takes.map((t) => ({ id: t.id, kind: t.kind, path: t.path, voiceId: t.voiceId, provider: t.provider, durationS: t.durationSeconds, degraded: t.degraded }))} approvals={approvals} />
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2">
            <BookOpenText className="h-4 w-4 text-amber" />
            <h3 className="font-display text-lg font-semibold text-cream">Kannada pronunciation dictionary</h3>
          </div>
          <p className="mb-3 text-[11.5px] leading-relaxed text-muted">
            Rhythm hints only — approved narration text is never rewritten. Both forms persist on every segment.
          </p>
          <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
            {PRONUNCIATION_DICTIONARY.map((r) => (
              <div key={r.id} className="rounded-lg border hairline bg-ink/50 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-cream">{r.match} → <span className="text-amber">{r.spoken}</span></span>
                  <span className="font-mono text-[9px] uppercase tracking-widest text-faint">{r.domain}</span>
                </div>
                <p className="mt-0.5 text-[10.5px] text-muted">{r.note}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Bus model */}
      <Card className="rise-in">
        <div className="mb-3 flex items-center gap-2">
          <ListMusic className="h-4 w-4 text-amber" />
          <h3 className="font-display text-lg font-semibold text-cream">Six production buses</h3>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Narration", "voice segments placed at scene cue windows", "amber"],
            ["Ambience", "wind, roomtone, morning birds", "leaf"],
            ["Animal sounds", "licensed library slot — no fake moos synthesized", "sky"],
            ["Activity FX", "footsteps, water handling, door — per scene window", "ember"],
            ["Music", "soft pad bed, ducked under voice", "amber"],
            ["Transitions", "card whoosh/fades — minimal", "leaf"],
          ].map(([t, d, c]) => (
            <div key={t} className={`rounded-xl border border-${c}-30 border hairline bg-ink/50 p-3`}>
              <div className="text-[12px] font-bold uppercase tracking-wide text-cream">{t}</div>
              <div className="mt-1 text-[10.5px] leading-relaxed text-muted">{d}</div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11.5px] leading-relaxed text-faint">
          All synthesized beds are QC-flagged placeholders until replaced by licensed field recordings. Nothing is
          synthesized that contradicts the scene — silent beats are preferred over invented sound.
        </p>
      </Card>
    </div>
  );
}
