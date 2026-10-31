import fs from "fs";
import path from "path";
import { episodeDir } from "@/lib/studio/constants";
import { fileInfo } from "@/lib/studio/storage";
import { probeMedia, runFfmpeg } from "@/lib/studio/ffmpeg";
import type { AudioConfig } from "@/lib/studio/schemas";
import type { RenderedSegment } from "./tts";

/* ------------------------------------------------------------------ */
/*  Audio production mixer. Six-bus model, arena-rendered locally:      */
/*    narration · ambience (wind/birds/roomtone) · activity SFX         */
/*    (footsteps/water) · music pad · transitions · ducking.            */
/*  All synthesized beds are labelled placeholders in QC; the graph is  */
/*  built so licensed/original libraries drop in 1:1 by file replace.   */
/* ------------------------------------------------------------------ */

export interface SceneWindow {
  key: string;
  startS: number;
  durationS: number;
}

const FOOTSTEP_KEYS = new Set(["open-door", "farm-walk", "enter-goshala", "veg-inspect", "clean-goshala"]);
const WATER_KEYS = new Set(["water-beds", "trough-water", "pond-check"]);

export async function buildAudioMix(params: {
  episodeId: string;
  durationS: number;
  videoFile: string; // silent visual master (captions/grade already burned in)
  masterFile: string;
  segments: RenderedSegment[];
  windows: SceneWindow[];
  audio: AudioConfig;
  onProgress?: (pct: number, label: string) => void | Promise<void>;
}): Promise<{ masterUrl: string; bytes: number; checksum: string; durationS: number; sfxFiles: string[]; ducking: boolean }> {
  const { episodeId, durationS, videoFile, masterFile, segments, windows, audio } = params;
  const onProgress = params.onProgress ?? (() => {});
  const mix = audio.mix;
  const sfxDir = path.join(episodeDir(episodeId), "audio", "sfx");
  fs.mkdirSync(sfxDir, { recursive: true });
  fs.rmSync(sfxDir, { recursive: true, force: true });
  fs.mkdirSync(sfxDir, { recursive: true });

  /* ---------- per-window activity SFX (synthesized placeholders) ------- */
  await onProgress(6, "activity sfx");
  const sfxJobs: { key: string; file: string; startS: number }[] = [];
  if (audio.soundEffects.enabled) {
    for (const w of windows) {
      const isSteps = audio.soundEffects.tracks.includes("footsteps") && FOOTSTEP_KEYS.has(w.key);
      const isWater = audio.soundEffects.tracks.includes("water_flowing") && WATER_KEYS.has(w.key);
      if (!isSteps && !isWater) continue;
      const file = path.join(sfxDir, `${w.key}-${Math.round(w.startS * 10)}.wav`);
      const dur = Math.max(1.5, w.durationS - 1.2);
      const src = isSteps
        ? `anoisesrc=color=pink:duration=${dur}:amplitude=0.5,lowpass=f=170,tremolo=f=1.85:d=0.9,volume=1.6,afade=t=in:st=0:d=0.25,afade=t=out:st=${(dur - 0.4).toFixed(1)}:d=0.4`
        : `anoisesrc=color=pink:duration=${dur}:amplitude=0.30,bandpass=f=2400:w=2200,tremolo=f=0.85:d=0.28,afade=t=in:st=0:d=0.5,afade=t=out:st=${(dur - 0.6).toFixed(1)}:d=0.6`;
      await runFfmpeg(["-f", "lavfi", "-i", src, "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", file], { timeoutMs: 60_000 });
      sfxJobs.push({ key: w.key, file, startS: w.startS + (isSteps ? 0.4 : 0.9) });
    }
  }

  /* ------------------------------ assemble --------------------------- */
  await onProgress(18, "graph assembly");
  const args: string[] = ["-i", videoFile];
  for (const s of segments) args.push("-i", s.file);
  for (const j of sfxJobs) args.push("-i", j.file);
  const lavfiStart = 1 + segments.length + sfxJobs.length;
  let lav = lavfiStart;
  const windIdx = audio.ambience.enabled && audio.ambience.tracks.includes("gentle_wind") ? lav++ : -1;
  if (windIdx >= 0)
    args.push("-f", "lavfi", "-i", `anoisesrc=color=brown:duration=${durationS}:amplitude=0.28,lowpass=f=430,volume=0.34,afade=t=in:st=0:d=2.2,afade=t=out:st=${durationS - 2.6}:d=2.6`);
  const roomIdx = audio.ambience.enabled && audio.ambience.tracks.includes("farm_roomtone") ? lav++ : -1;
  if (roomIdx >= 0)
    args.push("-f", "lavfi", "-i", `anoisesrc=color=pink:duration=${durationS}:amplitude=0.05,lowpass=f=260`);
  const birdsIdx = audio.ambience.enabled && audio.ambience.tracks.includes("morning_birds") ? lav++ : -1;
  if (birdsIdx >= 0)
    args.push(
      "-f", "lavfi", "-i",
      `aevalsrc='0.30*sin(2*PI*(2350+760*sin(2*PI*8.5*t))*t)*gt(sin(2*PI*0.32*t)+0.45*sin(2*PI*0.117*t+1.7),0.42)':d=${durationS}:s=44100,volume=0.5,afade=t=in:st=0:d=1.8,afade=t=out:st=${durationS - 2.4}:d=2.4`,
    );
  const musicIdx = audio.music.enabled ? lav++ : -1;
  if (musicIdx >= 0)
    args.push(
      "-f", "lavfi", "-i",
      `aevalsrc='0.15*sin(2*PI*174.61*t)+0.11*sin(2*PI*220*t)+0.08*sin(2*PI*261.63*t)+0.05*sin(2*PI*349.23*t)':d=${durationS}:s=44100,afade=t=in:st=0:d=3,afade=t=out:st=${durationS - 3.4}:d=3.4`,
    );

  const lines: string[] = [];
  // narration bus
  if (segments.length) {
    const names: string[] = [];
    segments.forEach((s, i) => {
      const ms = Math.round(s.window.startS * 1000);
      lines.push(`[${1 + i}:a]aresample=44100,aformat=channel_layouts=stereo,volume=${mix.narrationLevel},adelay=${ms}|${ms}[n${i}]`);
      names.push(`[n${i}]`);
    });
    if (names.length === 1) lines.push(`[n0]acopy[narr]`);
    else lines.push(`${names.join("")}amix=inputs=${names.length}:normalize=0[narr]`);
  }
  // sfx bus
  let sfxLabel = "";
  if (sfxJobs.length) {
    const names: string[] = [];
    sfxJobs.forEach((j, i) => {
      const idx = 1 + segments.length + i;
      const ms = Math.round(j.startS * 1000);
      lines.push(`[${idx}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[x${i}]`);
      names.push(`[x${i}]`);
    });
    if (names.length === 1) lines.push(`[x0]acopy[sfx]`);
    else lines.push(`${names.join("")}amix=inputs=${names.length}:normalize=0[sfx]`);
    sfxLabel = "[sfx]";
  }
  // bed bus
  const bedLabels: string[] = [];
  if (windIdx >= 0) {
    lines.push(`[${windIdx}:a]aresample=44100,aformat=channel_layouts=stereo,volume=${(mix.ambienceLevel * 0.85).toFixed(3)}[w]`);
    bedLabels.push("[w]");
  }
  if (roomIdx >= 0) {
    lines.push(`[${roomIdx}:a]aresample=44100,aformat=channel_layouts=stereo,volume=${(mix.ambienceLevel * 0.28).toFixed(3)}[r]`);
    bedLabels.push("[r]");
  }
  if (birdsIdx >= 0) {
    lines.push(`[${birdsIdx}:a]aresample=44100,aformat=channel_layouts=stereo,volume=${(mix.ambienceLevel * 0.42).toFixed(3)}[b]`);
    bedLabels.push("[b]");
  }
  if (musicIdx >= 0) {
    lines.push(`[${musicIdx}:a]aresample=44100,aformat=channel_layouts=stereo,volume=${mix.musicLevel.toFixed(3)}[m]`);
    bedLabels.push("[m]");
  }
  const beds = sfxLabel ? [...bedLabels, sfxLabel] : bedLabels;
  if (beds.length === 1) lines.push(`${beds[0]}acopy[bg]`);
  else if (beds.length > 1) lines.push(`${beds.join("")}amix=inputs=${beds.length}:normalize=0[bg]`);

  // ducking + sum + loudness targets (narration must be split: one feed to
  // the sidechain detector, one to the final sum — a link can only be used once)
  const ducking = audio.music.duckDuringNarration && segments.length > 0 && bedLabels.length + sfxJobs.length > 0;
  if (segments.length && beds.length) {
    if (ducking) {
      lines.push(`[narr]asplit=2[narr_out][narr_sc]`);
      lines.push(`[bg][narr_sc]sidechaincompress=threshold=0.018:ratio=${mix.duckRatio}:attack=25:release=620:makeup=1.4[bgd]`);
      lines.push(`[bgd][narr_out]amix=inputs=2:normalize=0[mixed]`);
    } else {
      lines.push(`[bg][narr]amix=inputs=2:normalize=0[mixed]`);
    }
  } else if (segments.length) {
    lines.push(`[narr]acopy[mixed]`);
  } else if (beds.length) {
    lines.push(`[bg]acopy[mixed]`);
  } else {
    lines.push(`anullsrc=r=44100:cl=stereo:d=${durationS}[mixed]`);
  }
  lines.push(
    `[mixed]apad=whole_dur=${durationS},loudnorm=I=${mix.loudnessILufs}:TP=${mix.truePeakDb}:LRA=${mix.lra},atrim=0:${durationS},aresample=44100,aformat=channel_layouts=stereo,alimiter=limit=0.92[aout]`,
  );

  await onProgress(52, "render mix & mux");
  const graph = lines.join(";");
  await runFfmpeg(
    [
      ...args,
      "-filter_complex", graph,
      "-map", "0:v",
      "-map", "[aout]",
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "160k",
      "-movflags", "+faststart",
      "-shortest",
      masterFile,
    ],
    { timeoutMs: 240_000 },
  );

  await onProgress(92, "probe master");
  const probed = await probeMedia(masterFile);
  const rel = path.relative(episodeDir(episodeId), masterFile).split(path.sep).join("/");
  const info = fileInfo(episodeId, rel);
  await onProgress(100, "mix complete");
  return {
    masterUrl: info.url,
    bytes: info.bytes,
    checksum: info.checksum,
    durationS: probed.format.duration,
    sfxFiles: sfxJobs.map((j) => path.basename(j.file)),
    ducking,
  };
}
