import fs from "fs";
import path from "path";
import sharp from "sharp";
import { RENDER, episodeDir } from "./constants";
import { probeMedia, runFfmpeg } from "./ffmpeg";
import { brandCardSvg, buildAss, rasterize, thumbOverlaySvg } from "./graphics";
import {
  ensureEpisodeDirs,
  fileInfo,
  freshRenderDirs,
  publicPlateToFile,
  writeEpisodeText,
} from "./storage";
import type { CaptionSet, EpisodeSpec } from "./schemas";

/* ------------------------------------------------------------------ */
/*  Render engine. Canonical plates → Ken Burns motion segments →      */
/*  concat → synthesized ambience mux → libass captioned, graded       */
/*  master. Brand cards rasterized as SVG via sharp (no drawtext in    */
/*  the bundled ffmpeg; libass present and used for burn-in).          */
/* ------------------------------------------------------------------ */

export interface RenderScene {
  sceneKey: string;
  platePath: string;
  motionProfile: string;
  durationSeconds: number;
}

export interface RenderOutput {
  masterUrl: string; // visual master (silent video) — audio is muxed by audio_mix
  masterFile: string;
  bytes: number;
  checksum: string;
  durationS: number;
  width: number;
  height: number;
  wallMs: number;
  segments: string[];
}

const CARD_IN = 2.4;
const CARD_OUT = 2.6;

function motionExpr(profile: string, frames: number) {
  const cx = "iw/2-(iw/zoom/2)";
  const cy = "ih/2-(ih/zoom/2)";
  switch (profile) {
    case "push-in":
      return { z: `1+0.075*on/${frames}`, x: cx, y: cy };
    case "pull-back":
      return { z: `1.075-0.075*on/${frames}`, x: cx, y: cy };
    case "drift-left":
      return { z: "1.08", x: `(iw-iw/zoom)*(1-on/${frames})`, y: cy };
    case "drift-right":
      return { z: "1.08", x: `(iw-iw/zoom)*on/${frames}`, y: cy };
    case "rise":
      return { z: "1.06", x: cx, y: `(ih-ih/zoom)*(1-on/${frames})` };
    case "settle":
      return { z: `1.06-0.04*on/${frames}`, x: cx, y: `(ih-ih/zoom)*(0.45+0.55*on/${frames})` };
    default:
      return { z: `1+0.06*on/${frames}`, x: cx, y: cy };
  }
}

async function encodeCard(cardPng: string, dur: number, outFile: string) {
  const fadeOut = Math.max(0, dur - 0.45).toFixed(2);
  await runFfmpeg(
    [
      "-loop", "1",
      "-framerate", String(RENDER.fps),
      "-t", String(dur),
      "-i", cardPng,
      "-vf", `fade=t=in:st=0:d=0.45,fade=t=out:st=${fadeOut}:d=0.45,format=yuv420p`,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", String(RENDER.crfMaster),
      "-an",
      outFile,
    ],
    { timeoutMs: 120_000 },
  );
}

async function buildSceneSegment(scene: RenderScene, outFile: string) {
  const dur = scene.durationSeconds;
  const frames = Math.max(2, Math.round(dur * RENDER.fps));
  const m = motionExpr(scene.motionProfile, frames);
  const plate = publicPlateToFile(scene.platePath);
  if (!fs.existsSync(plate))
    throw new Error(`Missing scene plate for "${scene.sceneKey}": ${scene.platePath}`);
  await runFfmpeg(
    [
      "-i", plate,
      "-vf",
      `scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,setsar=1,` +
        `zoompan=z='${m.z}':x='${m.x}':y='${m.y}':d=${frames}:fps=${RENDER.fps}:s=${RENDER.width}x${RENDER.height},` +
        `fade=t=in:st=0:d=0.45,fade=t=out:st=${Math.max(0, dur - 0.45).toFixed(2)}:d=0.45,format=yuv420p`,
      "-frames:v", String(frames),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", String(RENDER.crfSegment),
      "-an",
      outFile,
    ],
    { timeoutMs: 180_000 },
  );
}

async function buildAmbience(totalS: number, outFile: string) {
  // Synthesized placeholder bed: prairie wind + a soft detuned pad. Deliberately
  // understated; QC flags it as placeholder until a licensed library replaces it.
  const wind = `anoisesrc=color=brown:duration=${totalS}:amplitude=0.30,lowpass=f=430,volume=0.35,afade=t=in:st=0:d=2.5,afade=t=out:st=${(totalS - 3).toFixed(1)}:d=3`;
  const pad = `aevalsrc='0.16*sin(2*PI*174.61*t)+0.12*sin(2*PI*220*t)+0.09*sin(2*PI*261.63*t)':d=${totalS}:s=44100,volume=0.30,afade=t=in:st=0:d=2.5,afade=t=out:st=${(totalS - 3).toFixed(1)}:d=3`;
  await runFfmpeg(
    [
      "-f", "lavfi", "-i", wind,
      "-f", "lavfi", "-i", pad,
      "-filter_complex",
      "[0:a][1:a]amix=inputs=2:duration=longest:normalize=0,volume=0.9,alimiter=limit=0.85:level=false,aresample=44100,aformat=channel_layouts=stereo[a]",
      "-map", "[a]",
      "-c:a", "aac",
      "-b:a", "128k",
      "-t", String(totalS),
      outFile,
    ],
    { timeoutMs: 90_000 },
  );
}

export async function renderEpisode(params: {
  spec: EpisodeSpec;
  epNum: number;
  captions: CaptionSet;
  scenes: RenderScene[];
  onProgress?: (pct: number, label: string) => void | Promise<void>;
}): Promise<RenderOutput> {
  const { spec, epNum, captions } = params;
  const scenes = params.scenes;
  const onProgress = params.onProgress ?? (() => {});
  const t0 = Date.now();
  const dir = episodeDir(spec.episodeId);
  ensureEpisodeDirs(spec.episodeId);
  freshRenderDirs(spec.episodeId);

  if (scenes.length !== spec.scenes.length)
    throw new Error(`Scene/plate mismatch: ${scenes.length} plates vs ${spec.scenes.length} scenes`);

  // Brand cards as SVG → PNG --------------------------------------------
  const cardInPng = path.join(dir, "render", "card-in.png");
  const cardOutPng = path.join(dir, "render", "card-out.png");
  await rasterize(brandCardSvg("in", epNum, spec.title), cardInPng);
  await rasterize(brandCardSvg("out", epNum, spec.title), cardOutPng);

  const segDir = path.join(dir, "render", "segments");
  const tasks: { label: string; out: string; run: () => Promise<void> }[] = [];
  const cardInSeg = path.join(segDir, "00-card-in.mp4");
  const cardOutSeg = path.join(segDir, "99-card-out.mp4");
  tasks.push({ label: "card:in", out: cardInSeg, run: () => encodeCard(cardInPng, CARD_IN, cardInSeg) });
  scenes.forEach((s, i) => {
    const out = path.join(segDir, `${String(i + 1).padStart(2, "0")}-${s.sceneKey}.mp4`);
    tasks.push({ label: s.sceneKey, out, run: () => buildSceneSegment(s, out) });
  });
  tasks.push({ label: "card:out", out: cardOutSeg, run: () => encodeCard(cardOutPng, CARD_OUT, cardOutSeg) });

  // Parallel pool — 4 concurrent encodes.
  let done = 0;
  const pool = 4;
  const executing = new Set<Promise<void>>();
  async function worker(task: (typeof tasks)[number]) {
    await task.run();
    done++;
    await onProgress(Math.round((done / tasks.length) * 62), task.label);
  }
  for (const task of tasks) {
    const p = worker(task).finally(() => executing.delete(p));
    executing.add(p);
    if (executing.size >= pool) await Promise.race(executing);
  }
  await Promise.all([...executing]);

  const segFiles = tasks.map((t) => t.out);
  for (const f of segFiles)
    if (!fs.existsSync(f) || fs.statSync(f).size < 5_000)
      throw new Error(`Segment failed to materialize: ${path.basename(f)}`);

  // Concat (stream copy) -------------------------------------------------
  await onProgress(70, "concat");
  const listFile = path.join(dir, "render", "concat.txt");
  fs.writeFileSync(listFile, segFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"));
  const concatFile = path.join(dir, "render", "concat.mp4");
  await runFfmpeg(
    ["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", concatFile],
    { timeoutMs: 90_000 },
  );

  const vidDur = (await probeMedia(concatFile)).format.duration;
  const totalS = Math.max(1, Math.round(vidDur * 10) / 10);
  void totalS;

  // Styled ASS burn-in captions ------------------------------------------
  writeEpisodeText(spec.episodeId, "render/captions.burn.ass", buildAss(captions.burnIn));
  const assPath = path.join(dir, "render", "captions.burn.ass").replace(/\\/g, "/");

  // Caption + grade → SILENT visual master (audio arrives in audio_mix) ----
  await onProgress(88, "captions & grade");
  const masterFile = path.join(dir, "video.mp4");
  const grade = `subtitles=filename='${assPath}':fontsdir=/usr/share/fonts,vignette=angle=PI/4.6,noise=alls=3.2:allf=t,format=yuv420p`;
  await runFfmpeg(
    [
      "-i", concatFile,
      "-filter_complex", `[0:v]${grade}[v]`,
      "-map", "[v]",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", String(RENDER.crfMaster),
      "-r", String(RENDER.fps),
      "-an",
      "-movflags", "+faststart",
      masterFile,
    ],
    { timeoutMs: 240_000 },
  );

  await onProgress(96, "probe");
  const probed = await probeMedia(masterFile);
  const info = fileInfo(spec.episodeId, "video.mp4");
  await onProgress(100, "visual master ready");

  return {
    masterUrl: info.url,
    masterFile,
    bytes: info.bytes,
    checksum: info.checksum,
    durationS: probed.format.duration,
    width: probed.video?.width ?? 0,
    height: probed.video?.height ?? 0,
    wallMs: Date.now() - t0,
    segments: segFiles.map((f) => path.basename(f)),
  };
}

export async function extractThumbnail(params: {
  spec: EpisodeSpec;
  epNum: number;
  atS?: number;
}): Promise<{ url: string; bytes: number; checksum: string }> {
  const { spec, epNum } = params;
  const masterFile = path.join(episodeDir(spec.episodeId), "master.mp4");
  const at = params.atS ?? Math.min(14, Math.max(3, spec.durationSeconds * 0.25));
  const frameTmp = path.join(episodeDir(spec.episodeId), "render", "frame-src.jpg");
  fs.mkdirSync(path.dirname(frameTmp), { recursive: true });
  await runFfmpeg(
    ["-ss", String(at), "-i", masterFile, "-frames:v", "1", "-q:v", "2", frameTmp],
    { timeoutMs: 60_000 },
  );
  const out = path.join(episodeDir(spec.episodeId), "thumb", "thumbnail.jpg");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const overlay = await sharp(Buffer.from(thumbOverlaySvg(epNum, spec.title), "utf8")).png().toBuffer();
  await sharp(frameTmp)
    .resize(1080, 1920, { fit: "cover" })
    .composite([{ input: overlay }])
    .jpeg({ quality: 90 })
    .toFile(out);
  return fileInfo(spec.episodeId, "thumb/thumbnail.jpg");
}
