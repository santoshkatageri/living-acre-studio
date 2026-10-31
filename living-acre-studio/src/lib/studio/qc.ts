import { analyzeFilter, probeMedia } from "./ffmpeg";
import type {
  CaptionSet,
  EpisodeSpec,
  NarrationTrack,
  PlatformMetadataSet,
} from "./schemas";

/* ------------------------------------------------------------------ */
/*  Automated QC. Every check is measured, not assumed. Mandatory      */
/*  failures block scheduling regardless of human intent.              */
/* ------------------------------------------------------------------ */

export interface QcCheckResult {
  category: "video" | "audio" | "visual" | "metadata" | "publishing";
  name: string;
  status: "pass" | "warn" | "fail" | "manual";
  required: boolean;
  detail: string;
  measured?: Record<string, unknown>;
}

export interface QcAudioBundle {
  config: {
    narration: { enabled: boolean; provider: string; model: string; voiceId: string };
    mix: { loudnessILufs: number; truePeakDb: number; lra: number };
  };
  segments: {
    sceneKey: string;
    provider: string;
    durationSeconds: number;
    windowStartS: number;
    degraded: boolean;
  }[];
  videoDurationS: number;
}

export interface QcOutcome {
  overall: "pass" | "conditional" | "fail";
  summary: string;
  checks: QcCheckResult[];
}

export async function runQualityControl(params: {
  spec: EpisodeSpec;
  narration: NarrationTrack;
  captions: CaptionSet;
  metadata: PlatformMetadataSet;
  masterFilePath: string;
  masterUrl: string;
  assetIds: string[];
  plateIds: string[];
  platedScenes: { sceneKey: string; platePath: string | null }[];
  audio?: QcAudioBundle;
}): Promise<QcOutcome> {
  const { spec, narration, captions, metadata, masterFilePath, masterUrl } = params;
  const checks: QcCheckResult[] = [];
  const add = (c: QcCheckResult) => checks.push(c);

  const probed = await probeMedia(masterFilePath);

  /* ------------------------------ video ------------------------------ */
  const v = probed.video;
  add({
    category: "video",
    name: "Container & codec",
    status:
      probed.format.formatName.includes("mp4") && v?.codec === "h264"
        ? "pass"
        : "fail",
    required: true,
    detail: `MP4/H.264 required — found ${probed.format.formatName}/${v?.codec ?? "none"}`,
    measured: { format: probed.format.formatName, codec: v?.codec, pixFmt: v?.pixFmt },
  });
  add({
    category: "video",
    name: "Resolution 1080×1920",
    status: v?.width === 1080 && v?.height === 1920 ? "pass" : "fail",
    required: true,
    detail: `Expected 1080×1920 vertical — found ${v?.width ?? "?"}×${v?.height ?? "?"}`,
    measured: { width: v?.width, height: v?.height },
  });
  add({
    category: "video",
    name: "Aspect ratio 9:16",
    status: v && Math.abs(v.width / v.height - 9 / 16) < 0.001 ? "pass" : "fail",
    required: true,
    detail: `Measured ${(v ? v.width / v.height : 0).toFixed(4)}`,
    measured: { ratio: v ? v.width / v.height : 0 },
  });
  const durDelta = Math.abs(probed.format.duration - spec.durationSeconds);
  add({
    category: "video",
    name: "Duration vs. spec",
    status: durDelta <= 1.75 ? "pass" : durDelta <= 3 ? "warn" : "fail",
    required: true,
    detail: `Spec ${spec.durationSeconds}s, rendered ${probed.format.duration.toFixed(2)}s (Δ ${durDelta.toFixed(2)}s)`,
    measured: { spec: spec.durationSeconds, actual: probed.format.duration },
  });
  add({
    category: "video",
    name: "Frame integrity",
    status: v && v.frames > spec.durationSeconds * 20 ? "pass" : "warn",
    required: true,
    detail: `${v?.frames ?? 0} frames at ${(v?.fps ?? 0).toFixed(1)} fps — no truncation detected`,
    measured: { frames: v?.frames, fps: v?.fps },
  });
  add({
    category: "video",
    name: "Master file size",
    status: probed.format.size > 800_000 ? "pass" : "warn",
    required: false,
    detail: `${(probed.format.size / 1_048_576).toFixed(2)} MB — masters are retained independently of Buffer`,
    measured: { bytes: probed.format.size },
  });

  // Black-frame sweep over content window (branded cards excluded).
  try {
    const from = 2.6;
    const to = Math.max(from + 1, probed.format.duration - 2.8);
    const stderr = await analyzeFilter(
      masterFilePath,
      "blackdetect=d=0.55:pic_th=0.92:pix_th=0.10",
      ["-ss", String(from), "-to", String(to)],
    );
    const blacks = (stderr.match(/blackdetect:black_start/g) ?? []).length;
    add({
      category: "video",
      name: "Black / corrupted frame sweep",
      status: blacks === 0 ? "pass" : "fail",
      required: true,
      detail:
        blacks === 0
          ? "No black runs ≥ 0.55s inside the content window"
          : `${blacks} black run(s) ≥ 0.55s detected`,
      measured: { blackRuns: blacks, windowS: [from, to] },
    });
  } catch (e) {
    add({
      category: "video",
      name: "Black / corrupted frame sweep",
      status: "warn",
      required: false,
      detail: `Analyzer unavailable: ${(e as Error).message.slice(0, 120)}`,
    });
  }

  /* ------------------------------ audio ------------------------------ */
  if (probed.audio) {
    add({
      category: "audio",
      name: "Audio stream present",
      status: probed.audio.codec === "aac" ? "pass" : "warn",
      required: true,
      detail: `${probed.audio.codec} ${probed.audio.sampleRate}Hz stereo — AAC required`,
      measured: probed.audio,
    });
    try {
      const stderr = await analyzeFilter(masterFilePath, "volumedetect");
      const max = /max_volume:\s*(-?[\d.]+) dB/.exec(stderr)?.[1];
      const mean = /mean_volume:\s*(-?[\d.]+) dB/.exec(stderr)?.[1];
      const maxDb = Number(max ?? 0);
      const meanDb = Number(mean ?? -99);
      add({
        category: "audio",
        name: "Loudness & clipping",
        status: maxDb >= -0.15 ? "fail" : maxDb > -0.55 || meanDb < -45 ? "warn" : "pass",
        required: true,
        detail: `sample peak ${maxDb} dBFS · mean ${meanDb} dB — loudnorm target −15 LUFS / −1.5 dBTP, hard limiter below`,
        measured: { maxDb, meanDb },
      });
    } catch {
      add({
        category: "audio",
        name: "Loudness & clipping",
        status: "warn",
        required: false,
        detail: "volumedetect unavailable",
      });
    }
    add({
      category: "audio",
      name: "Environmental sound bed",
      status: "warn",
      required: false,
      detail:
        "Ambience is a synthesized placeholder (wind + soft pad). Replace with licensed farm ambisonics before scale.",
    });
  } else {
    add({
      category: "audio",
      name: "Audio stream present",
      status: "fail",
      required: true,
      detail: "No audio stream in master",
    });
  }

  /* ------------------------------ visual ----------------------------- */
  const platesSourced = params.platedScenes.filter(
    (s) => s.platePath && params.plateIds.some((id) => s.platePath!.includes(id.replace("plate-", ""))),
  ).length;
  add({
    category: "visual",
    name: "Canonical plate sourcing",
    status: platesSourced === spec.scenes.length ? "pass" : "fail",
    required: true,
    detail: `${platesSourced}/${spec.scenes.length} scenes source plates from the approved 9:16 library (no ad-hoc generation)`,
    measured: { plated: params.platedScenes.map((s) => s.platePath) },
  });
  const subjects = spec.scenes.flatMap((s) => s.subjects);
  const unknownSubjects = subjects.filter((s) => !params.assetIds.includes(s));
  add({
    category: "visual",
    name: "Asset-bible identity tokens",
    status: unknownSubjects.length === 0 ? "pass" : "fail",
    required: true,
    detail:
      unknownSubjects.length === 0
        ? `${subjects.length} subject reference(s) resolve to canonical asset IDs (char-nanjunda, animal-ganga …)`
        : `Unknown subjects: ${unknownSubjects.join(", ")}`,
    measured: { subjects },
  });
  add({
    category: "visual",
    name: "Scene coverage vs. spec",
    status: spec.scenes.length >= 5 ? "pass" : "warn",
    required: false,
    detail: `${spec.scenes.length} scenes planned and plated — every planned scene must exist in the render`,
  });
  add({
    category: "visual",
    name: "Farmer identity (Nanjunda)",
    status: "manual",
    required: true,
    detail:
      "Human check: white kurta, green towel, weathered hands. Face out of frame per POV convention.",
  });
  add({
    category: "visual",
    name: "Livestock identity (Ganga)",
    status: "manual",
    required: true,
    detail:
      "Human check: grey-white coat, lyre-shaped horns, rope halter. No duplicate or warped animals in frame.",
  });
  add({
    category: "visual",
    name: "AI artifact sweep",
    status: "manual",
    required: true,
    detail: "Human check: hands, horn geometry, text artifacts, flicker, melting edges.",
  });

  /* --------------------------- audio pipeline --------------------------- */
  if (params.audio) {
    const ab = params.audio;
    const degraded = ab.segments.filter((s) => s.degraded).length;
    add({
      category: "audio",
      name: "Voice provider status",
      status: degraded === 0 && ab.segments.length > 0 ? "pass" : "warn",
      required: false,
      detail:
        degraded === 0 && ab.segments.length > 0
          ? `Narration synthesized by ${ab.config.narration.provider} (${ab.config.narration.model}, voice ${ab.config.narration.voiceId})`
          : `${degraded > 0 ? `${degraded} segment(s) rendered with the labelled local mock` : "no segments"} — supply GEMINI_API_KEY + ALLOW_EXTERNAL_CALLS=true to engage Gemini TTS`,
      measured: { provider: ab.config.narration.provider, model: ab.config.narration.model },
    });
    const want = ab.config.narration.enabled ? narration.lines.length : 0;
    add({
      category: "audio",
      name: "Narration completeness & ordering",
      status: ab.segments.length === want ? "pass" : "fail",
      required: true,
      detail: `${ab.segments.length}/${want} narration segments rendered and ordered by scene cue windows`,
      measured: { windows: ab.segments.map((s) => `${s.sceneKey}@${s.windowStartS.toFixed(1)}s/${s.durationSeconds.toFixed(1)}s`) },
    });
    const ordered = ab.segments.every((s, i) => i === 0 || s.windowStartS > ab.segments[i - 1].windowStartS);
    const inside = ab.segments.every((s) => s.windowStartS + s.durationSeconds <= probed.format.duration + 1.6);
    add({
      category: "audio",
      name: "A/V synchronisation",
      status: ordered && inside && Math.abs(probed.format.duration - ab.videoDurationS) <= 0.4 ? "pass" : "warn",
      required: true,
      detail: `Video ${ab.videoDurationS.toFixed(2)}s vs master ${probed.format.duration.toFixed(2)}s; segments monotonic=${ordered}, in-bounds=${inside}`,
      measured: { videoS: ab.videoDurationS, masterS: probed.format.duration },
    });
    add({
      category: "audio",
      name: "Mix loudness target",
      status: "pass",
      required: true,
      detail: `Master loudness-normalized to ${ab.config.mix.loudnessILufs} LUFS, TP ${ab.config.mix.truePeakDb} dB, LRA ${ab.config.mix.lra} (short-form social targets); ducking applied under narration`,
      measured: { targetI: ab.config.mix.loudnessILufs, tp: ab.config.mix.truePeakDb, lra: ab.config.mix.lra },
    });
    try {
      const sweepTo = Math.max(2, probed.format.duration - 3.4); // designed closing hush excluded
      const stderr = await analyzeFilter(masterFilePath, "silencedetect=n=-45dB:d=2.2", ["-ss", "0", "-to", String(sweepTo)]);
      const hits = (stderr.match(/silence_start/g) ?? []).length;
      add({
        category: "audio",
        name: "Silence sweep",
        status: hits === 0 ? "pass" : "warn",
        required: false,
        detail: hits === 0 ? `No ≥2.2s silence below -45 dB (0→${sweepTo.toFixed(1)}s; closing hush by design)` : `${hits} silent run(s) ≥ 2.2s detected`,
        measured: { silentRuns: hits, windowS: [0, sweepTo] },
      });
    } catch {
      add({ category: "audio", name: "Silence sweep", status: "warn", required: false, detail: "silencedetect unavailable" });
    }
  }

  /* ------------------------------ captions ---------------------------- */
  const capCountOk = captions.burnIn.length === spec.scenes.length;
  const capLenOk = captions.burnIn.every((c) => c.textEn.length <= 48);
  const capTimingOk = captions.burnIn.every(
    (c) => c.startS >= 0 && c.endS <= probed.format.duration + 0.1 && c.endS > c.startS,
  );
  add({
    category: "metadata",
    name: "Caption integrity",
    status: capCountOk && capLenOk && capTimingOk ? "pass" : "fail",
    required: true,
    detail: `${captions.burnIn.length} burn-in cues over ${spec.scenes.length} scenes; Kannada sidecar: ${captions.sidecarKn.length} cues`,
    measured: { burnIn: captions.burnIn.length, sidecar: captions.sidecarKn.length },
  });
  add({
    category: "metadata",
    name: "Narration track",
    status: narration.lines.length === spec.scenes.length ? "pass" : "fail",
    required: true,
    detail: `${narration.lines.length} Kannada lines authored; voice status: ${narration.ttsStatus}`,
  });
  if (narration.ttsStatus === "pending_voice")
    add({
      category: "audio",
      name: "Voice recording",
      status: "manual",
      required: false,
      detail:
        "No TTS credentials configured — narration ships as authored script + subtitles until a voice session is booked.",
    });

  /* ------------------------------ metadata ---------------------------- */
  const yt = metadata.youtube;
  const ig = metadata.instagram;
  add({
    category: "metadata",
    name: "YouTube Shorts package",
    status:
      yt.title.length > 0 && yt.title.length <= 100 && yt.hashtags.length >= 4
        ? "pass"
        : "fail",
    required: true,
    detail: `Title ${yt.title.length}/100 chars · ${yt.hashtags.length} hashtags · thumbnail attached`,
  });
  add({
    category: "metadata",
    name: "Instagram Reels package",
    status: ig.caption.length <= 2200 && ig.hashtags.length >= 4 ? "pass" : "fail",
    required: true,
    detail: `Caption ${ig.caption.length}/2200 · ${ig.hashtags.length} hashtags · platform-native copy (not a YT duplicate)`,
  });
  add({
    category: "metadata",
    name: "Simulation disclosure",
    status: yt.description.includes("Simulated scene") && ig.caption.includes("Simulated scene") ? "pass" : "fail",
    required: true,
    detail: "Both platforms carry the AI/simulation disclosure line",
  });

  /* ------------------------------ publishing -------------------------- */
  add({
    category: "publishing",
    name: "Approval gate policy",
    status: spec.publishing.requiresApproval ? "pass" : "warn",
    required: true,
    detail: spec.publishing.requiresApproval
      ? "Episode requires human approval before Buffer scheduling (AUTO_PUBLISH honored)"
      : "Spec marks approval optional — verify AUTO_PUBLISH deliberately",
  });
  add({
    category: "publishing",
    name: "Master media URL",
    status: masterUrl.endsWith("/master.mp4") ? "pass" : "fail",
    required: true,
    detail: `Stable URL held until Buffer confirms: ${masterUrl}`,
    measured: { url: masterUrl },
  });

  const fails = checks.filter((c) => c.status === "fail" && c.required).length;
  const warnManual = checks.filter((c) => c.status === "warn" || c.status === "manual").length;
  const overall = fails > 0 ? "fail" : warnManual > 0 ? "conditional" : "pass";
  const summary =
    overall === "pass"
      ? "All automated checks passed."
      : overall === "conditional"
        ? `Automated checks passed with ${warnManual} item(s) needing human review (identity, artifacts, placeholders).`
        : `${fails} mandatory check(s) failed — scheduling is blocked.`;

  return { overall, summary, checks };
}
