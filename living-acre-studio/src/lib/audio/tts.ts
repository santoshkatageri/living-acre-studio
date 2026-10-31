import fs from "fs";
import path from "path";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { audioSegments, episodes } from "@/db/schema";
import { probeMedia } from "@/lib/studio/ffmpeg";
import { episodeDir, episodeUrl } from "@/lib/studio/constants";
import { sha256 } from "@/lib/studio/util";
import type { AudioConfig, NarrationTrack } from "@/lib/studio/schemas";
import { applyPronunciation } from "./pronunciation";
import { buildTtsInstruction, getVoiceProfile } from "./voices";
import { pcmToWav, resolveProvider, type ResolvedProvider } from "./providers";

/* ------------------------------------------------------------------ */
/*  Narration processor + TTS generator (server side).                  */
/*  · Segment-level generation — one WAV per narration line.            */
/*  · Content-hash caching — identical text+config never re-generates.  */
/*  · Approved text is stored untouched beside the spoken form.         */
/*  · Single-segment regeneration without re-running the episode.       */
/* ------------------------------------------------------------------ */

export interface RenderedSegment {
  sceneKey: string;
  hash: string;
  path: string; // public URL
  file: string; // filesystem path
  durationS: number;
  window: { startS: number; endS: number };
  cached: boolean;
  degraded: boolean;
  textOriginal: string;
  textSpoken: string;
  rules: string[];
  voiceId: string;
  note: string;
}

function segHash(parts: Record<string, string>) {
  return sha256(Object.entries(parts).map(([k, v]) => `${k}=${v}`).join("|"));
}

async function probeDuration(file: string): Promise<number> {
  try {
    return (await probeMedia(file)).format.duration;
  } catch {
    const b = fs.statSync(file).size;
    return Math.max(0.3, (b - 44) / 48000); // 24k × 16-bit mono fallback
  }
}

export async function renderEpisodeNarration(params: {
  episodeId: string;
  narration: NarrationTrack;
  audio: AudioConfig;
  force?: boolean;
  onProgress?: (pct: number, label: string) => Promise<void> | void;
}): Promise<{ segments: RenderedSegment[]; providerInfo: ResolvedProvider; generated: number; cached: number }> {
  const { episodeId, narration, audio } = params;
  const onProgress = params.onProgress ?? (() => {});
  const profile = getVoiceProfile(audio.narration.voiceProfile);
  const lang = audio.language;
  const providerInfo = resolveProvider(audio.narration.provider);
  const provider = providerInfo.provider;
  const model = audio.narration.model;

  const segDir = path.join(episodeDir(episodeId), "audio", "narration");
  fs.mkdirSync(segDir, { recursive: true });

  const out: RenderedSegment[] = [];
  let generated = 0;
  let cached = 0;

  for (let i = 0; i < narration.lines.length; i++) {
    const line = narration.lines[i];
    const textOriginal = lang === "kn" ? line.kn : line.en;
    const { spoken, applied } = applyPronunciation(textOriginal, lang);
    const voiceId = profile.voiceId;
    const hash = segHash({
      provider: provider.id,
      model,
      voice: voiceId,
      style: audio.narration.style,
      pace: audio.narration.pace,
      spoken,
    });

    const existing = params.force
      ? undefined
      : (
          await db
            .select()
            .from(audioSegments)
            .where(eq(audioSegments.episodeId, episodeId))
        ).find((s) => s.hash === hash);

    if (existing && fs.existsSync(path.join(process.cwd(), "public", existing.path))) {
      out.push({
        sceneKey: line.sceneKey,
        hash,
        path: existing.path,
        file: path.join(process.cwd(), "public", existing.path),
        durationS: existing.durationSeconds,
        window: { startS: line.startS, endS: line.endS },
        cached: true,
        degraded: existing.degraded,
        textOriginal,
        textSpoken: existing.textSpoken,
        rules: existing.appliedRules,
        voiceId: existing.voiceId,
        note: existing.note,
      });
      cached++;
      await onProgress(((i + 1) / narration.lines.length) * 100, `${line.sceneKey} (cache)`);
      continue;
    }

    const instruction = buildTtsInstruction(profile, spoken, audio.narration.pace);
    const res = await provider.synthesize({
      text: spoken,
      voice: profile,
      voiceIdOverride: voiceId,
      model,
      pace: audio.narration.pace,
      style: audio.narration.style,
      instruction,
    });
    const wav = pcmToWav(res.pcm, res.sampleRate, res.channels);
    const relFs = `narration-${String(i + 1).padStart(2, "0")}-${line.sceneKey}-${hash.slice(0, 8)}.wav`;
    const file = path.join(segDir, relFs);
    fs.writeFileSync(file, wav);
    const publicPath = `${episodeUrl(episodeId)}/audio/narration/${relFs}`;
    const durationS = await probeDuration(file);

    await db
      .insert(audioSegments)
      .values({
        episodeId,
        sceneKey: line.sceneKey,
        language: lang,
        provider: provider.id,
        model,
        voiceId,
        textOriginal,
        textSpoken: spoken,
        appliedRules: applied,
        hash,
        path: publicPath,
        bytes: wav.length,
        durationSeconds: durationS,
        sampleRate: res.sampleRate,
        channels: res.channels,
        windowStartS: line.startS,
        windowEndS: line.endS,
        degraded: res.degraded,
        note: res.note,
      })
      .onConflictDoNothing({ target: [audioSegments.hash, audioSegments.episodeId] });

    out.push({
      sceneKey: line.sceneKey,
      hash,
      path: publicPath,
      file,
      durationS,
      window: { startS: line.startS, endS: line.endS },
      cached: false,
      degraded: res.degraded,
      textOriginal,
      textSpoken: spoken,
      rules: applied,
      voiceId,
      note: res.note,
    });
    generated++;
    await onProgress(((i + 1) / narration.lines.length) * 100, line.sceneKey);
  }

  return { segments: out, providerInfo, generated, cached };
}

/** Regenerate exactly one failed/insufficient line — never the whole episode. */
export async function regenerateSegment(episodeId: string, sceneKey: string) {
  const ep = (await db.select().from(episodes).where(eq(episodes.id, episodeId)))[0];
  if (!ep?.narration) throw new Error("Narration missing — run narration_script first");
  const line = ep.narration.lines.find((l) => l.sceneKey === sceneKey);
  if (!line) throw new Error(`Scene "${sceneKey}" has no narration line`);
  const audio = ep.spec!.audio;
  const segs = await db.select().from(audioSegments).where(eq(audioSegments.episodeId, episodeId));
  const stale = segs.filter((s) => s.sceneKey === sceneKey);
  for (const s of stale) await db.delete(audioSegments).where(eq(audioSegments.id, s.id));
  const res = await renderEpisodeNarration({
    episodeId,
    narration: { ...ep.narration, lines: [line] },
    audio,
    force: true,
  });
  return { regenerated: sceneKey, segment: res.segments[0] ?? null, provider: res.providerInfo.provider.id, reason: res.providerInfo.reason };
}

export async function listSegments(episodeId: string) {
  return db.select().from(audioSegments).where(eq(audioSegments.episodeId, episodeId)).orderBy(asc(audioSegments.id));
}
