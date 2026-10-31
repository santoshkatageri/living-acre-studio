import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  analyticsSnapshots,
  assets,
  audioSegments,
  episodes,
  mediaFiles,
  productionLogs,
  publications,
  qcChecks,
  qcReports,
  scenes,
  series,
  stages,
  usageEvents,
  STAGES,
  type StageId,
} from "@/db/schema";
import { buildAudioMix, type SceneWindow } from "@/lib/audio/mix";
import { listSegments, renderEpisodeNarration } from "@/lib/audio/tts";
import { PUBLIC_DIR } from "./constants";
import { sceneOffsets } from "./script";
import { ASSET_BIBLE } from "./assets";
import { confirmPublished, createScheduledPost, getBufferMode, resolveChannelIdAsync } from "./buffer";
import { probeMedia } from "./ffmpeg";
import { DEFAULT_SLOTS, episodeDir, maskId } from "./constants";
import { buildMetadata } from "./metadata";
import { planEpisode } from "./planner";
import { runQualityControl } from "./qc";
import { extractThumbnail, renderEpisode } from "./render";
import { writeCaptions, writeNarration, toSrt } from "./script";
import { ACTIVITIES } from "./series";
import type { EpisodeSpec } from "./schemas";
import { simulateDay } from "./analytics";
import {
  ensureEpisodeDirs,
  publicPlateToFile,
  writeEpisodeText,
} from "./storage";
import { hashJson, istDateString, nextSlotIst } from "./util";
import fs from "fs";

/* ------------------------------------------------------------------ */
/*  Pipeline orchestrator — every stage is:                            */
/*    · resumable    (skip if complete with an identical input hash)   */
/*    · logged       (production_logs per decisive step)               */
/*    · idempotent   (no duplicate renders, posts or publications)      */
/* ------------------------------------------------------------------ */

async function log(
  episodeId: string,
  stage: string,
  level: "info" | "warn" | "error",
  message: string,
  data?: Record<string, unknown>,
) {
  await db.insert(productionLogs).values({ episodeId, stage, level, message, data });
}

async function recordUsage(episodeId: string | null, kind: string, units: number, note: string, cost = 0) {
  await db.insert(usageEvents).values({ episodeId, kind, units, note, costEstimateUsd: cost });
}

/* ------------------------------ creation ---------------------------- */

export async function createEpisode(params: {
  instruction: string;
  seriesSlug?: string;
  language?: "kn" | "hi" | "en";
}) {
  const all = await db.select({ seq: episodes.seq }).from(episodes);
  const episodeNumber = (all.length ? Math.max(...all.map((e) => e.seq)) : 0) + 1;
  const { spec, matched, notes } = planEpisode({
    instruction: params.instruction,
    episodeNumber,
    seriesSlug: params.seriesSlug,
    language: params.language,
  });

  await db.insert(episodes).values({
    id: spec.episodeId,
    seq: episodeNumber,
    instruction: params.instruction,
    title: spec.title,
    seriesSlug: spec.series,
    language: spec.language,
    durationSeconds: spec.durationSeconds,
    aspectRatio: spec.aspectRatio,
    width: spec.resolution.width,
    height: spec.resolution.height,
    visualStyle: spec.visualStyle,
    cameraStyle: spec.cameraStyle,
    status: "in_production",
    spec,
    publishedAt: null,
  });

  await db.insert(scenes).values(
    spec.scenes.map((s, i) => ({
      id: `${spec.episodeId}:${s.sceneKey}`,
      episodeId: spec.episodeId,
      idx: i,
      sceneKey: s.sceneKey,
      activity: s.activity,
      cameraStyle: s.camera,
      locationId: s.locationId,
      durationSeconds: s.durationSeconds,
      motionProfile: s.motionProfile,
      status: "planned",
    })),
  );

  const specHash = hashJson({ instruction: params.instruction, series: spec.series });
  await db.insert(stages).values(
    STAGES.map((stage, idx) => ({
      id: `${spec.episodeId}:${stage}`,
      episodeId: spec.episodeId,
      stage,
      idx,
      status: stage === "specification" ? "complete" : "pending",
      attempt: stage === "specification" ? 1 : 0,
      inputHash: stage === "specification" ? specHash : null,
      progress: stage === "specification" ? 100 : 0,
      startedAt: stage === "specification" ? new Date() : null,
      finishedAt: stage === "specification" ? new Date() : null,
      durationMs: stage === "specification" ? 1 : null,
      output:
        stage === "specification"
          ? {
              title: spec.title,
              scenes: spec.scenes.length,
              durationSeconds: spec.durationSeconds,
              activities: matched.map((m) => m.key),
              plannerNotes: notes,
            }
          : null,
    })),
  );

  await log(spec.episodeId, "specification", "info", `Episode planned: ${spec.title}`, {
    scenes: spec.scenes.length,
    durationSeconds: spec.durationSeconds,
    notes,
  });
  return spec.episodeId;
}

/* ------------------------------ reading ----------------------------- */

export async function getEpisodeDetail(episodeId: string) {
  const ep = (await db.select().from(episodes).where(eq(episodes.id, episodeId)))[0];
  if (!ep) return null;
  const sceneRows = await db.select().from(scenes).where(eq(scenes.episodeId, episodeId)).orderBy(asc(scenes.idx));
  const stageRows = await db.select().from(stages).where(eq(stages.episodeId, episodeId)).orderBy(asc(stages.idx));
  const media = await db.select().from(mediaFiles).where(eq(mediaFiles.episodeId, episodeId)).orderBy(desc(mediaFiles.id));
  const pubs = await db.select().from(publications).where(eq(publications.episodeId, episodeId)).orderBy(asc(publications.id));
  const logs = await db.select().from(productionLogs).where(eq(productionLogs.episodeId, episodeId)).orderBy(desc(productionLogs.id)).limit(60);
  const report = (await db.select().from(qcReports).where(eq(qcReports.episodeId, episodeId)).orderBy(desc(qcReports.id)).limit(1))[0];
  const checks = report
    ? await db.select().from(qcChecks).where(eq(qcChecks.reportId, report.id))
    : [];
  const s = (await db.select().from(series).where(eq(series.slug, ep.seriesSlug)))[0];
  const audioSegs = await db.select().from(audioSegments).where(eq(audioSegments.episodeId, episodeId)).orderBy(asc(audioSegments.id));
  return { episode: ep, scenes: sceneRows, stages: stageRows, media, publications: pubs, logs, qc: report ? { report, checks } : null, series: s ?? null, audioSegments: audioSegs };
}

/* --------------------------- stage runner --------------------------- */

async function setStage(
  id: string,
  patch: Partial<typeof stages.$inferInsert>,
) {
  await db.update(stages).set(patch).where(eq(stages.id, id));
}

function stageInput(ep: typeof episodes.$inferSelect, extra: unknown) {
  return hashJson({ v: 1, episodeId: ep.id, extra });
}

export async function runStage(episodeId: string, stage: StageId) {
  const ep = (await db.select().from(episodes).where(eq(episodes.id, episodeId)))[0];
  if (!ep) throw Object.assign(new Error("Episode not found"), { code: 404 });
  const row = (await db.select().from(stages).where(eq(stages.id, `${episodeId}:${stage}`)))[0];
  if (!row) throw Object.assign(new Error("Stage not found"), { code: 404 });
  if (row.status === "running")
    throw Object.assign(new Error("Stage already running"), { code: 409 });
  if (stage === "approval_gate")
    throw Object.assign(
      new Error("The approval gate is a human action — use Approve from the console."),
      { code: 422 },
    );

  // Dependency gate: all earlier stages must be complete (or skipped).
  const prev = await db.select().from(stages).where(eq(stages.episodeId, episodeId)).orderBy(asc(stages.idx));
  for (const p of prev) {
    if (p.idx >= row.idx) break;
    if (!["complete", "skipped"].includes(p.status)) {
      if (p.stage === "approval_gate" && ["publishing_package", "buffer_schedule", "analytics_baseline"].includes(stage))
        throw Object.assign(new Error("Episode has not been approved yet."), { code: 409 });
      throw Object.assign(new Error(`Stage "${p.stage}" must complete first.`), { code: 409 });
    }
  }

  const spec = ep.spec as EpisodeSpec;
  const inputHash = stageInput(ep, { stage, spec, captions: ep.captions, narration: ep.narration, meta: ep.platformMetadata });
  if (row.status === "complete" && row.inputHash === inputHash) {
    await log(episodeId, stage, "info", "Skipped — stage already complete with identical inputs (idempotent).");
    return { stage, status: "skipped" };
  }

  await setStage(row.id, {
    status: "running",
    attempt: row.attempt + 1,
    inputHash,
    progress: 0,
    startedAt: new Date(),
    error: null,
    finishedAt: null,
  });
  const t0 = Date.now();
  await log(episodeId, stage, "info", `Stage started (attempt ${row.attempt + 1}).`);

  try {
    let output: Record<string, unknown> = {};
    switch (stage) {
      case "specification":
        output = { note: "Planned at creation." };
        break;
      case "narration_script":
        output = await execNarration(episodeId);
        break;
      case "captions":
        output = await execCaptions(episodeId);
        break;
      case "storyboard":
        output = await execStoryboard(episodeId);
        break;
      case "audio_design":
        output = await execAudioDesign(episodeId);
        break;
      case "voice_render":
        output = await execVoiceRender(episodeId);
        break;
      case "audio_mix":
        output = await execAudioMix(episodeId);
        break;
      case "metadata":
        output = await execMetadata(episodeId);
        break;
      case "render":
        output = await execRender(episodeId);
        break;
      case "thumbnail":
        output = await execThumbnail(episodeId);
        break;
      case "quality_control":
        output = await execQc(episodeId);
        break;
      case "publishing_package":
        output = await execPublishingPackage(episodeId);
        break;
      case "buffer_schedule":
        output = await execBufferSchedule(episodeId);
        break;
      case "analytics_baseline":
        output = await execAnalyticsBaseline(episodeId);
        break;
      default:
        throw new Error(`Unknown stage ${stage}`);
    }
    await setStage(row.id, {
      status: "complete",
      progress: 100,
      finishedAt: new Date(),
      durationMs: Date.now() - t0,
      output,
    });
    await log(episodeId, stage, "info", `Stage complete in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
    return { stage, status: "complete", output };
  } catch (err) {
    const message = (err as Error).message.slice(0, 2000);
    await setStage(row.id, {
      status: "failed",
      finishedAt: new Date(),
      durationMs: Date.now() - t0,
      error: message,
    });
    await db.update(episodes).set({ status: "failed" }).where(eq(episodes.id, episodeId));
    await log(episodeId, stage, "error", `Stage failed: ${message}`);
    throw err;
  }
}

/* --------------------------- stage executors ------------------------ */

async function loadEp(episodeId: string) {
  const ep = (await db.select().from(episodes).where(eq(episodes.id, episodeId)))[0];
  if (!ep) throw new Error("Episode not found");
  return ep;
}

async function execNarration(episodeId: string) {
  const ep = await loadEp(episodeId);
  const narration = writeNarration(ep.spec as EpisodeSpec);
  await db.update(episodes).set({ narration }).where(eq(episodes.id, episodeId));
  await log(episodeId, "narration_script", "info", `${narration.lines.length} Kannada lines authored (${narration.ttsStatus}).`);
  return { lines: narration.lines.length, voice: narration.voiceProfile, ttsStatus: narration.ttsStatus };
}

async function execCaptions(episodeId: string) {
  const ep = await loadEp(episodeId);
  const spec = ep.spec as EpisodeSpec;
  const caps = writeCaptions(spec);
  ensureEpisodeDirs(episodeId);
  const srtKn = toSrt(caps.sidecarKn, "kn");
  const srtEn = toSrt(caps.burnIn, "en");
  const kn = writeEpisodeText(episodeId, "captions/narration.kn.srt", srtKn);
  const en = writeEpisodeText(episodeId, "captions/captions.en.srt", srtEn);
  await db.insert(mediaFiles).values([
    { episodeId, kind: "captions_srt", path: kn.url, bytes: kn.bytes, checksum: kn.checksum },
    { episodeId, kind: "captions_srt", path: en.url, bytes: en.bytes, checksum: en.checksum },
  ]);
  const withPaths = { ...caps, srtPath: kn.url };
  await db.update(episodes).set({ captions: withPaths }).where(eq(episodes.id, episodeId));
  await log(episodeId, "captions", "info", "SRT sidecars written (Kannada narration + English).");
  return { burnIn: caps.burnIn.length, sidecarKn: caps.sidecarKn.length, srtKn: kn.url, srtEn: en.url };
}

async function execStoryboard(episodeId: string) {
  const ep = await loadEp(episodeId);
  const spec = ep.spec as EpisodeSpec;
  const assetRows = await db.select().from(assets).where(eq(assets.kind, "scene_plate"));
  const plateById = new Map(assetRows.map((a) => [a.id, a.imagePath]));
  const assignment: { scene: string; plate: string; motion: string }[] = [];
  for (const s of spec.scenes) {
    const def = ACTIVITIES.find((a) => a.key === s.sceneKey);
    if (!def) throw new Error(`Scene "${s.sceneKey}" has no activity-library definition`);
    const plate = plateById.get(def.plate);
    if (!plate) throw new Error(`Canonical plate missing from asset bible: ${def.plate}`);
    if (!fs.existsSync(publicPlateToFile(plate)))
      throw new Error(`Plate file not present on disk: ${plate}`);
    await db
      .update(scenes)
      .set({
        platePath: plate,
        motionProfile: def.motionProfile,
        narrationKn: def.kn,
        narrationEn: def.en,
        status: "plated",
      })
      .where(eq(scenes.id, `${episodeId}:${s.sceneKey}`));
    assignment.push({ scene: s.sceneKey, plate, motion: def.motionProfile });
  }
  await log(episodeId, "storyboard", "info", "Scenes bound to canonical plates from the asset library.");
  return { assignment, plateCount: assignment.length, source: "canonical plate library v1" };
}

async function execMetadata(episodeId: string) {
  const ep = await loadEp(episodeId);
  const meta = buildMetadata(ep.spec as EpisodeSpec);
  await db.update(episodes).set({ platformMetadata: meta }).where(eq(episodes.id, episodeId));
  await log(episodeId, "metadata", "info", "Platform-native metadata generated for YouTube Shorts and Instagram Reels.");
  return { youtubeTitle: meta.youtube.title, igCaptionChars: meta.instagram.caption.length };
}

async function execRender(episodeId: string) {
  const ep = await loadEp(episodeId);
  const spec = ep.spec as EpisodeSpec;
  const caps = ep.captions;
  if (!caps) throw new Error("Captions stage must complete before render");
  const sceneRows = await db.select().from(scenes).where(eq(scenes.episodeId, episodeId)).orderBy(asc(scenes.idx));
  const renderScenes = sceneRows.map((s) => ({
    sceneKey: s.sceneKey,
    platePath: s.platePath ?? "",
    motionProfile: s.motionProfile,
    durationSeconds: s.durationSeconds,
  }));
  const stageId = `${episodeId}:render`;
  await db.delete(mediaFiles).where(and(eq(mediaFiles.episodeId, episodeId), eq(mediaFiles.kind, "visual_master")));
  const out = await renderEpisode({
    spec,
    epNum: ep.seq,
    captions: caps,
    scenes: renderScenes,
    onProgress: async (pct) => {
      await setStage(stageId, { progress: pct });
    },
  });
  await db.insert(mediaFiles).values({
    episodeId,
    kind: "visual_master",
    path: out.masterUrl,
    bytes: out.bytes,
    durationSeconds: out.durationS,
    width: out.width,
    height: out.height,
    checksum: out.checksum,
  });
  await recordUsage(episodeId, "render_seconds", Math.round(out.wallMs / 1000), "local ffmpeg render (4-core, x264 veryfast)", 0);
  await recordUsage(episodeId, "ai_plate", out.segments.length, "canonical library plates reused — no new generation spend", 0);
  await recordUsage(episodeId, "storage_bytes", out.bytes, `visual master ${(out.bytes / 1048576).toFixed(1)} MB retained under /outputs`, 0);
  await db.update(episodes).set({ status: "in_production" }).where(eq(episodes.id, episodeId));
  return {
    visualMasterUrl: out.masterUrl,
    durationS: out.durationS,
    resolution: `${out.width}×${out.height}`,
    bytes: out.bytes,
    checksum: out.checksum.slice(0, 16),
    wallSeconds: Math.round(out.wallMs / 1000),
    segments: out.segments,
    note: "Silent visual master — narration/ambience/music arrive in audio_mix.",
  };
}

/* ------------------------- audio stage executors --------------------- */

async function execAudioDesign(episodeId: string) {
  const ep = await loadEp(episodeId);
  const spec = ep.spec as EpisodeSpec;
  const audio = spec.audio;
  const offsets = sceneOffsets(spec);
  const windows: SceneWindow[] = spec.scenes.map((s) => ({
    key: s.sceneKey,
    startS: offsets.get(s.sceneKey)!,
    durationS: s.durationSeconds,
  }));
  const providerRequested = audio.narration.provider;
  const key = process.env.GEMINI_API_KEY ?? "";
  const externalOk = (process.env.ALLOW_EXTERNAL_CALLS ?? "").toLowerCase() === "true";
  await log(
    episodeId,
    "audio_design",
    providerRequested === "google_gemini" && !(key && externalOk)
      ? "warn"
      : "info",
    providerRequested === "google_gemini" && !(key && externalOk)
      ? "Gemini narration requested but credentials/external flag absent — deterministic mock voice will be used and labelled."
      : `Audio design resolved: provider=${providerRequested}, voice=${audio.narration.voiceId}.`,
    { providerRequested, model: audio.narration.model },
  );
  return {
    provider: providerRequested,
    model: audio.narration.model,
    voiceProfile: audio.narration.voiceProfile,
    voiceId: audio.narration.voiceId,
    pace: audio.narration.pace,
    style: audio.narration.style,
    ambienceTracks: audio.ambience.tracks,
    sfxTracks: audio.soundEffects.tracks,
    music: audio.music.style,
    duckDuringNarration: audio.music.duckDuringNarration,
    mixTargets: audio.mix,
    sfxWindows: windows.map((w) => `${w.key}@${w.startS.toFixed(1)}s`),
  };
}

async function execVoiceRender(episodeId: string) {
  const ep = await loadEp(episodeId);
  const spec = ep.spec as EpisodeSpec;
  if (!ep.narration) throw new Error("Run narration_script first");
  if (!spec.audio.narration.enabled) {
    await log(episodeId, "voice_render", "info", "Narration disabled by audio config — skipped by design.");
    return { skipped: true };
  }
  const stageId = `${episodeId}:voice_render`;
  const res = await renderEpisodeNarration({
    episodeId,
    narration: ep.narration,
    audio: spec.audio,
    onProgress: async (pct, label) => {
      await setStage(stageId, { progress: Math.round(pct), output: { lastSegment: label } });
    },
  });
  const charsGenerated = res.segments.filter((s) => !s.cached).reduce((n, s) => n + s.textSpoken.length, 0);
  if (res.generated > 0) {
    const cost = (charsGenerated / 1_000_000) * 16;
    await recordUsage(
      episodeId,
      "tts_chars",
      charsGenerated,
      `${res.providerInfo.provider.id} · cost estimate only ($0 if free tier)`,
      res.providerInfo.degraded ? 0 : cost,
    );
  }
  const ttsStatus = res.providerInfo.degraded ? "pending_voice" : "synthesized";
  await db
    .update(episodes)
    .set({ narration: { ...ep.narration, ttsStatus } })
    .where(eq(episodes.id, episodeId));
  await log(
    episodeId,
    "voice_render",
    res.providerInfo.degraded ? "warn" : "info",
    `${res.segments.length} segments ready — ${res.generated} generated, ${res.cached} cache hits. ${res.providerInfo.reason}`,
  );
  return {
    provider: res.providerInfo.provider.id,
    degraded: res.providerInfo.degraded,
    reason: res.providerInfo.reason,
    segments: res.segments.length,
    generated: res.generated,
    cached: res.cached,
    voices: [...new Set(res.segments.map((s) => s.voiceId))],
    ttsStatus,
  };
}

async function execAudioMix(episodeId: string) {
  const ep = await loadEp(episodeId);
  const spec = ep.spec as EpisodeSpec;
  const videoFile = `${episodeDir(episodeId)}/video.mp4`;
  if (!fs.existsSync(videoFile)) throw new Error("Visual master missing — run render first");
  const segRows = await listSegments(episodeId);
  const rendered = segRows.map((s) => ({
    sceneKey: s.sceneKey,
    hash: s.hash,
    path: s.path,
    file: `${PUBLIC_DIR}${s.path}`,
    durationS: s.durationSeconds,
    window: { startS: s.windowStartS, endS: s.windowEndS },
    cached: true,
    degraded: s.degraded,
    textOriginal: s.textOriginal,
    textSpoken: s.textSpoken,
    rules: s.appliedRules,
    voiceId: s.voiceId,
    note: s.note,
  }));
  const offsets = sceneOffsets(spec);
  const windows = spec.scenes.map((s) => ({ key: s.sceneKey, startS: offsets.get(s.sceneKey)!, durationS: s.durationSeconds }));
  const masterFile = `${episodeDir(episodeId)}/master.mp4`;
  const vidDur = (await probeMedia(videoFile)).format.duration;
  const stageId = `${episodeId}:audio_mix`;
  await db.delete(mediaFiles).where(and(eq(mediaFiles.episodeId, episodeId), eq(mediaFiles.kind, "master_video")));
  const out = await buildAudioMix({
    episodeId,
    durationS: Math.round(vidDur * 100) / 100,
    videoFile,
    masterFile,
    segments: rendered,
    windows,
    audio: spec.audio,
    onProgress: async (pct) => {
      await setStage(stageId, { progress: pct });
    },
  });
  await db.insert(mediaFiles).values({
    episodeId,
    kind: "master_video",
    path: out.masterUrl,
    bytes: out.bytes,
    durationSeconds: out.durationS,
    width: spec.resolution.width,
    height: spec.resolution.height,
    checksum: out.checksum,
  });
  await recordUsage(episodeId, "storage_bytes", out.bytes, `final master ${(out.bytes / 1048576).toFixed(1)} MB`, 0);
  await log(
    episodeId,
    "audio_mix",
    "info",
    `Mix complete: ${rendered.length} narration segment(s), ${out.sfxFiles.length} sfx window(s), ducking ${out.ducking ? "on" : "off"}, targets ${spec.audio.mix.loudnessILufs} LUFS / ${spec.audio.mix.truePeakDb} dBTP.`,
  );
  return {
    masterUrl: out.masterUrl,
    durationS: out.durationS,
    bytes: out.bytes,
    narrationSegments: rendered.length,
    sfxWindows: out.sfxFiles,
    ducking: out.ducking,
    mixTargets: spec.audio.mix,
  };
}

async function execThumbnail(episodeId: string) {
  const ep = await loadEp(episodeId);
  const thumb = await extractThumbnail({ spec: ep.spec as EpisodeSpec, epNum: ep.seq });
  await db.insert(mediaFiles).values({
    episodeId,
    kind: "thumbnail",
    path: thumb.url,
    bytes: thumb.bytes,
    width: 1080,
    height: 1920,
    checksum: thumb.checksum,
  });
  await log(episodeId, "thumbnail", "info", "Branded thumbnail extracted from master frame.");
  return { url: thumb.url, bytes: thumb.bytes };
}

async function execQc(episodeId: string) {
  const ep = await loadEp(episodeId);
  const spec = ep.spec as EpisodeSpec;
  if (!ep.narration || !ep.captions || !ep.platformMetadata)
    throw new Error("Narration, captions and metadata must exist before QC");
  const master = (
    await db.select().from(mediaFiles).where(eq(mediaFiles.episodeId, episodeId)).orderBy(desc(mediaFiles.id))
  ).find((m) => m.kind === "master_video");
  if (!master) throw new Error("Master video missing — run render first");
  const masterFilePath = `${episodeDir(episodeId)}/master.mp4`;
  const assetIds = ASSET_BIBLE.map((a) => a.id);
  const plateIds = ASSET_BIBLE.filter((a) => a.kind === "scene_plate").map((a) => a.id);
  const sceneRows = await db.select().from(scenes).where(eq(scenes.episodeId, episodeId)).orderBy(asc(scenes.idx));
  const segRows = await listSegments(episodeId);
  const outcome = await runQualityControl({
    spec,
    narration: ep.narration,
    captions: ep.captions,
    metadata: ep.platformMetadata,
    masterFilePath,
    masterUrl: master.path,
    assetIds,
    plateIds,
    platedScenes: sceneRows.map((s) => ({ sceneKey: s.sceneKey, platePath: s.platePath })),
    audio: {
      config: spec.audio,
      segments: segRows.map((s) => ({
        sceneKey: s.sceneKey,
        provider: s.provider,
        durationSeconds: s.durationSeconds,
        windowStartS: s.windowStartS,
        degraded: s.degraded,
      })),
      videoDurationS: (await probeMedia(`${episodeDir(episodeId)}/video.mp4`)).format.duration,
    },
  });
  const [report] = await db
    .insert(qcReports)
    .values({ episodeId, overall: outcome.overall, summary: outcome.summary })
    .returning();
  await db.insert(qcChecks).values(
    outcome.checks.map((c) => ({
      reportId: report.id,
      category: c.category,
      name: c.name,
      status: c.status,
      required: c.required,
      detail: c.detail,
      measured: c.measured ?? null,
    })),
  );
  const next = outcome.overall === "fail" ? "failed" : "awaiting_approval";
  await db.update(episodes).set({ status: next }).where(eq(episodes.id, episodeId));
  if (outcome.overall === "fail") throw new Error(outcome.summary);
  await log(episodeId, "quality_control", outcome.overall === "pass" ? "info" : "warn", outcome.summary);
  return { overall: outcome.overall, summary: outcome.summary, reportId: report.id, checks: outcome.checks.length };
}

async function execPublishingPackage(episodeId: string) {
  const ep = await loadEp(episodeId);
  const spec = ep.spec as EpisodeSpec;
  const meta = ep.platformMetadata;
  if (!meta) throw new Error("Metadata missing");
  const master = (
    await db.select().from(mediaFiles).where(eq(mediaFiles.episodeId, episodeId)).orderBy(desc(mediaFiles.id))
  ).find((m) => m.kind === "master_video");
  if (!master) throw new Error("Master video missing");
  if (!fs.existsSync(publicPlateToFile(master.path.replace(/^\//, "/")))) {
    // file lives under public/ — guard rebuilds path consistently
  }
  const mediaUrl = master.path;
  const channels: ("youtube" | "instagram")[] = [];
  if (spec.publishing.youtube) channels.push("youtube");
  if (spec.publishing.instagram) channels.push("instagram");
  const created: string[] = [];
  for (const ch of channels) {
    const m = meta[ch];
    const idem = hashJson({ episodeId, channel: ch, title: m.title, checksum: master.checksum });
    const existing = (await db.select().from(publications).where(eq(publications.idempotencyKey, idem)))[0];
    if (existing) {
      created.push(`${ch}: existing draft #${existing.id} reused`);
      continue;
    }
    // A re-render produces a new master checksum → new package. Older
    // packages for this channel are retired so they can never double-post.
    await db
      .update(publications)
      .set({ status: "superseded" })
      .where(
        and(
          eq(publications.episodeId, episodeId),
          eq(publications.channel, ch),
          inArray(publications.status, ["draft", "scheduled"]),
        ),
      );
    const slot = nextSlotIst(DEFAULT_SLOTS[ch === "youtube" ? "youtube" : "instagram"]);
    const [pub] = await db
      .insert(publications)
      .values({
        episodeId,
        channel: ch,
        channelId: ch === "youtube" ? "(resolved at schedule)" : "(resolved at schedule)",
        status: "draft",
        mediaUrl,
        scheduledAt: slot,
        caption: ch === "instagram" ? m.caption : m.title,
        hashtags: m.hashtags,
        metadata: {
          title: m.title,
          description: m.description,
          coverKind: m.coverKind,
          disclosure: spec.labels.disclosure,
        },
        idempotencyKey: idem,
      })
      .returning();
    created.push(`${ch}: draft #${pub.id} for ${slot.toISOString()}`);
  }
  await log(episodeId, "publishing_package", "info", `Publishing package built: ${created.join(" · ")}`);
  return { packages: created, mediaUrl };
}

async function execBufferSchedule(episodeId: string) {
  const ep = await loadEp(episodeId);
  const pubs = await db.select().from(publications).where(eq(publications.episodeId, episodeId)).orderBy(asc(publications.id));
  if (!pubs.length) throw new Error("No publishing package — run publishing_package first");
  const mode = getBufferMode();
  const results: string[] = [];
  for (const pub of pubs) {
    if (pub.status !== "draft") {
      results.push(`${pub.channel}: already ${pub.status} (idempotent skip)`);
      continue;
    }
    const ch = pub.channel as "instagram" | "youtube";
    const realChannelId = await resolveChannelIdAsync(ch);
    const meta = (pub.metadata ?? {}) as { title?: string; description?: string };
    const text =
      ch === "instagram"
        ? `${pub.caption}\n\n${pub.hashtags.join(" ")}`
        : `${meta.title ?? pub.caption}\n\n${meta.description ?? ""}`.trim();

    // Buffer needs a full HTTPS URL to fetch the video file.
    // The media path is relative (e.g. /outputs/...); resolve it against
    // the public base URL from MEDIA_BASE_URL env or the app's own origin.
    const relPath = pub.mediaUrl ?? "";
    const baseUrl = process.env.MEDIA_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const fullMediaUrl = baseUrl && relPath.startsWith("/")
      ? `${baseUrl.replace(/\/$/, "")}${relPath}`
      : relPath;

    try {
      const res = await createScheduledPost({
        channelId: realChannelId,
        channel: ch,
        text,
        mediaUrl: fullMediaUrl,
        title: meta.title,
        description: meta.description,
        dueAt: pub.scheduledAt ?? nextSlotIst("07:00"),
        idempotencyKey: pub.idempotencyKey,
      });
      await db
        .update(publications)
        .set({
          status: "scheduled",
          mode,
          bufferPostId: res.postId,
          channelId: realChannelId,
          attempts: pub.attempts + 1,
          response: { dueAt: res.dueAt, requestMode: mode, postRaw: res.raw },
        })
        .where(eq(publications.id, pub.id));
      await recordUsage(episodeId, pub.channel, 1, `buffer createPost (${mode})`, 0);
      results.push(`${pub.channel}: ${res.postId} @ ${res.dueAt}`);
    } catch (e) {
      await db
        .update(publications)
        .set({ status: "failed", attempts: pub.attempts + 1, response: { error: (e as Error).message.slice(0, 500) } })
        .where(eq(publications.id, pub.id));
      throw e;
    }
  }
  const earliest = pubs
    .map((p) => p.scheduledAt)
    .filter(Boolean)
    .sort((a, b) => a!.getTime() - b!.getTime())[0];
  await db
    .update(episodes)
    .set({ status: "scheduled", scheduledFor: earliest ?? null })
    .where(eq(episodes.id, episodeId));
  await log(episodeId, "buffer_schedule", "info", `Scheduled via Buffer (${mode}): ${results.join(" · ")}`);
  return { mode, results };
}

async function execAnalyticsBaseline(episodeId: string) {
  const pubs = await db.select().from(publications).where(eq(publications.episodeId, episodeId));
  let seeded = 0;
  for (const pub of pubs) {
    const baseDate = istDateString(pub.scheduledAt ?? new Date());
    const day0 = simulateDay(`${pub.channel}-${pub.id}`, baseDate, 0);
    await db
      .insert(analyticsSnapshots)
      .values({ publicationId: pub.id, capturedDate: baseDate, ...day0, source: "simulated" })
      .onConflictDoNothing();
    seeded++;
  }
  await log(episodeId, "analytics_baseline", "info", `Baseline snapshots seeded for ${seeded} publication(s) (simulated until Buffer analytics wired).`);
  return { publications: seeded };
}

/* ------------------------------ approval ---------------------------- */

export async function approveEpisode(episodeId: string, note?: string) {
  const ep = await loadEp(episodeId);
  if (!["awaiting_approval", "approved"].includes(ep.status))
    throw Object.assign(new Error(`Episode is "${ep.status}" — QC must pass before approval.`), { code: 409 });
  await setStage(`${episodeId}:approval_gate`, {
    status: "complete",
    progress: 100,
    attempt: 1,
    startedAt: new Date(),
    finishedAt: new Date(),
    output: { approvedBy: "studio operator (human)", note: note ?? "", at: new Date().toISOString() },
  });
  await db.update(episodes).set({ status: "approved", approvalNote: note ?? null }).where(eq(episodes.id, episodeId));
  await log(episodeId, "approval_gate", "info", `Approved by human reviewer${note ? `: ${note}` : ""}.`);
  // Approval authorizes Buffer scheduling immediately.
  await runStage(episodeId, "publishing_package");
  await runStage(episodeId, "buffer_schedule");
  await runStage(episodeId, "analytics_baseline");
  return getEpisodeDetail(episodeId);
}

export async function refreshPublications(episodeId: string) {
  const ep = await loadEp(episodeId);
  const pubs = await db.select().from(publications).where(eq(publications.episodeId, episodeId));
  const updates: string[] = [];
  for (const pub of pubs) {
    if (!pub.bufferPostId || pub.status === "confirmed") continue;
    const res = await confirmPublished(pub.bufferPostId, pub.scheduledAt ?? new Date());
    if (res.confirmed) {
      await db
        .update(publications)
        .set({ status: "confirmed", publishedAt: pub.scheduledAt ?? new Date() })
        .where(eq(publications.id, pub.id));
      updates.push(`${pub.channel}: confirmed published`);
    } else {
      updates.push(`${pub.channel}: ${res.status}`);
    }
  }
  const stillOpen = (
    await db.select().from(publications).where(eq(publications.episodeId, episodeId))
  ).some((p) => p.status === "scheduled");
  if (!stillOpen && pubs.length && ep.status !== "published") {
    await db
      .update(episodes)
      .set({ status: "published", publishedAt: new Date() })
      .where(eq(episodes.id, episodeId));
  }
  await log(episodeId, "buffer_schedule", "info", `Status refresh → ${updates.join(" · ") || "nothing to refresh"}`);
  return { updates };
}

/* ------------------------- analytics roll-up ------------------------ */

export async function syncAnalytics() {
  const pubs = await db.select().from(publications);
  const today = istDateString();
  let inserted = 0;
  for (const pub of pubs.filter((p) => ["confirmed", "scheduled"].includes(p.status))) {
    const start = istDateString(pub.scheduledAt ?? new Date());
    const dayIndexStart = 0;
    const d = new Date(`${start}T00:00:00Z`);
    const end = new Date(`${today}T00:00:00Z`);
    let i = dayIndexStart;
    while (d <= end && i < 30) {
      const date = d.toISOString().slice(0, 10);
      const snap = simulateDay(`${pub.channel}-${pub.id}`, date, i);
      const res = await db
        .insert(analyticsSnapshots)
        .values({ publicationId: pub.id, capturedDate: date, ...snap, source: "simulated" })
        .onConflictDoNothing();
      if ((res as unknown as { rowCount?: number }).rowCount) inserted++;
      d.setUTCDate(d.getUTCDate() + 1);
      i++;
    }
  }
  return inserted;
}
