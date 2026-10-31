import fs from "fs";
import path from "path";
import { db } from "@/db";
import { audioPoc, studioConfig } from "@/db/schema";
import { PUBLIC_DIR } from "@/lib/studio/constants";
import { probeMedia, runFfmpeg } from "@/lib/studio/ffmpeg";
import { eq } from "drizzle-orm";
import { applyPronunciation } from "./pronunciation";
import { buildTtsInstruction, getVoiceProfile } from "./voices";
import { pcmToWav, resolveProvider, type ResolvedProvider } from "./providers";

/* ------------------------------------------------------------------ */
/*  First audio proof of concept                                       */
/*  "A peaceful morning at the Living Acre…"                            */
/*  Take A (Sulafat, warm) · Take B (Achird, friendly) · ambience ·    */
/*  mixed preview. Clearly labelled when the provider is mocked.        */
/* ------------------------------------------------------------------ */

export const POC_TEXT_KN =
  "ಲಿವಿಂಗ್ ಎಕರಿನ ಶಾಂತ ಬೆಳಗ್ಗೆ. ಬೆಳಗ್ಗೆ ಆರು ಗಂಟೆ. ಬಾನು ಹಳದಿ ಬೆಳಕಿನಲ್ಲಿ ನಿಧಾನವಾಗಿ ಎದ್ದಿದೆ. ನಂಜುಂಡ ಮನೆಯ ಬಾಗಿಲು ನಿಧಾನವಾಗಿ ತೆರೆಯುತ್ತಾನೆ. ಕೆಂಪು ಮಣ್ಣಿನ ದಾರಿಯಲ್ಲಿ ಮೊದಲ ನಡಿಗೆ. ಮುಂದೆ ಗೋಶಾಲೆ ಕಾಣುತ್ತದೆ. ಅಲ್ಲಿ ಗಂಗ — ನಮ್ಮ ಹಳ್ಳಿಕಾರ್ ಹಸು — ಅವನಿಗಾಗಿ ಕಾದಿದ್ದಾಳೆ. ನಂಜುಂಡ ಹತ್ತಿರ ಹೋಗಿ, ಅವಳ ಮುಖ ನೋಟವಾಗಿ, ಮೆದುವಾಗಿ ಮಾತನಾಡುತ್ತಾನೆ: ಬನ್ನಿ ಗಂಗೆ, ಇಂದೂ ಒಳ್ಳೆಯ ದಿನ.";

export const POC_TEXT_EN =
  "A peaceful morning at the Living Acre. Six in the morning. The farmer slowly opens the farmhouse door, walks towards the goshala and greets Ganga, the Hallikar cow.";

export interface PocTake {
  kind: string;
  path: string;
  provider: string;
  model: string;
  voiceId: string;
  durationS: number;
  degraded: boolean;
  createdAt: string;
}

export async function runAudioPoc(): Promise<{ takes: PocTake[]; providerInfo: ResolvedProvider }> {
  const profile = getVoiceProfile("kannada_storyteller");
  const providerInfo = resolveProvider("google_gemini");
  const provider = providerInfo.provider;
  const model = "gemini-2.5-flash-preview-tts";
  const outDir = path.join(PUBLIC_DIR, "outputs", "audio-poc");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  await db.delete(audioPoc).execute();

  const { spoken, applied } = applyPronunciation(POC_TEXT_KN, "kn");
  const takes: PocTake[] = [];
  const wavPaths: string[] = [];

  for (const [kind, voiceId] of [
    ["narration_a", profile.voiceId],
    ["narration_b", profile.altVoiceId],
  ] as const) {
    const instruction = buildTtsInstruction(profile, spoken, "moderate");
    const res = await provider.synthesize({
      text: spoken,
      voice: profile,
      voiceIdOverride: voiceId,
      model,
      pace: "moderate",
      style: profile.style,
      instruction,
    });
    const wav = pcmToWav(res.pcm, res.sampleRate, res.channels);
    const file = path.join(outDir, `${kind}-${voiceId.toLowerCase()}.wav`);
    fs.writeFileSync(file, wav);
    const durationS = (await probeMedia(file)).format.duration;
    wavPaths.push(path.join(outDir, `${kind}-${voiceId.toLowerCase()}.wav`));
    takes.push({
      kind,
      path: `/outputs/audio-poc/${path.basename(file)}`,
      provider: provider.id,
      model,
      voiceId,
      durationS: Math.round(durationS * 100) / 100,
      degraded: res.degraded,
      createdAt: new Date().toISOString(),
    });
  }

  // Ambience-only bed (wind + birds — no music, no voice)
  const ambDur = Math.max(24, takes[0].durationS + 5);
  const ambFile = path.join(outDir, "ambience-only.wav");
  await runFfmpeg([
    "-f", "lavfi", "-i", `anoisesrc=color=brown:duration=${ambDur}:amplitude=0.26,lowpass=f=430,afade=t=in:st=0:d=1.8,afade=t=out:st=${ambDur - 2.4}:d=2.4`,
    "-f", "lavfi", "-i", `aevalsrc='0.30*sin(2*PI*(2350+760*sin(2*PI*8.5*t))*t)*gt(sin(2*PI*0.32*t)+0.45*sin(2*PI*0.117*t+1.7),0.42)':d=${ambDur}:s=44100,volume=0.55`,
    "-filter_complex", "[0:a][1:a]amix=inputs=2:normalize=0,aresample=44100,aformat=channel_layouts=stereo[a]",
    "-map", "[a]", "-c:a", "pcm_s16le", ambFile,
  ], { timeoutMs: 90_000 });
  takes.push({
    kind: "ambience",
    path: "/outputs/audio-poc/ambience-only.wav",
    provider: "local_synthesis",
    model: "ffmpeg/anoisesrc+aevalsrc",
    voiceId: "",
    durationS: ambDur,
    degraded: false,
    createdAt: new Date().toISOString(),
  });

  // Mixed preview: take A + ambience (ducked) + faint pad
  const durA = takes[0].durationS;
  const mixDur = Math.min(ambDur, durA + 4);
  const mixFile = path.join(outDir, "mixed-preview.m4a");
  await runFfmpeg([
    "-i", wavPaths[0],
    "-i", ambFile,
    "-f", "lavfi", "-i", `aevalsrc='0.15*sin(2*PI*174.61*t)+0.11*sin(2*PI*220*t)+0.08*sin(2*PI*261.63*t)':d=${mixDur}:s=44100`,
    "-filter_complex",
    `[0:a]aresample=44100,aformat=channel_layouts=stereo,volume=1.0,asplit=2[n][nsc];` +
      `[1:a]atrim=0:${mixDur}[amb];[2:a]volume=0.16[m];[amb][m]amix=inputs=2:normalize=0[bg];` +
      `[bg][nsc]sidechaincompress=threshold=0.018:ratio=6:attack=25:release=620:makeup=1.4[bgd];` +
      `[bgd][n]amix=inputs=2:normalize=0,apad=whole_dur=${mixDur},loudnorm=I=-15:TP=-1.5:LRA=11,atrim=0:${mixDur},aresample=44100,aformat=channel_layouts=stereo[a]`,
    "-map", "[a]", "-c:a", "aac", "-b:a", "160k", "-t", String(mixDur), mixFile,
  ], { timeoutMs: 120_000 });
  takes.push({
    kind: "mixed_preview",
    path: "/outputs/audio-poc/mixed-preview.m4a",
    provider: `${provider.id}+ffmpeg`,
    model,
    voiceId: profile.voiceId,
    durationS: Math.round(mixDur * 100) / 100,
    degraded: providerInfo.degraded,
    createdAt: new Date().toISOString(),
  });

  for (const t of takes) {
    await db.insert(audioPoc).values({
      kind: t.kind,
      provider: t.provider,
      model: t.model,
      voiceId: t.voiceId,
      language: "kn",
      textOriginal: t.kind.startsWith("narration") || t.kind === "mixed_preview" ? POC_TEXT_KN : "",
      path: t.path,
      durationSeconds: t.durationS,
      degraded: t.degraded,
    });
  }
  return { takes, providerInfo };
}

export async function approveVoice(profileId: string, voiceId: string, note?: string) {
  const current = (await db.select().from(studioConfig).where(eq(studioConfig.key, "voice_approvals")))[0];
  const value = { ...((current?.value as Record<string, unknown> | undefined) ?? {}) };
  value[profileId] = { voiceId, approvedAt: new Date().toISOString(), note: note ?? "" };
  await db
    .insert(studioConfig)
    .values({ key: "voice_approvals", value })
    .onConflictDoUpdate({ target: studioConfig.key, set: { value } });
  return value;
}
