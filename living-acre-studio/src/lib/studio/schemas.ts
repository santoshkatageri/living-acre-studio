import { z } from "zod";

/* ------------------------------------------------------------------ */
/*  Validated JSON contracts — the episode spec every render consumes. */
/*  Backward-compatible extension rule: new fields must be optional or */
/*  carry defaults so older specs still validate.                      */
/* ------------------------------------------------------------------ */

export const CameraStyleSchema = z.enum([
  "first_person",
  "cinematic",
  "static_broll",
]);
export type CameraStyle = z.infer<typeof CameraStyleSchema>;

export const SceneSpecSchema = z.object({
  sceneKey: z.string().min(1),
  title: z.string().min(1),
  activity: z.string().min(1),
  camera: CameraStyleSchema,
  locationId: z.string().min(1),
  durationSeconds: z.number().int().min(2).max(20),
  subjects: z.array(z.string()).default([]), // stable asset IDs
  motionProfile: z
    .enum(["push-in", "pull-back", "drift-left", "drift-right", "rise", "settle"])
    .default("push-in"),
  platePath: z.string().optional(),
});
export type SceneSpec = z.infer<typeof SceneSpecSchema>;

export const PublishingSpecSchema = z.object({
  youtube: z.boolean().default(true),
  instagram: z.boolean().default(true),
  requiresApproval: z.boolean().default(true),
});
export type PublishingSpec = z.infer<typeof PublishingSpecSchema>;

/* --------------------------- audio configuration --------------------- */
/* Six independent production buses voices / ambience / sfx / activity  */
/* sounds / music / transitions. Narration text is never rewritten — the */
/* pronunciation layer only shapes what is SPOKEN, storing both forms.   */

export const AudioConfigSchema = z.object({
  language: z.enum(["kn", "hi", "en"]).default("kn"),
  narration: z
    .object({
      enabled: z.boolean().default(true),
      provider: z.enum(["google_gemini", "elevenlabs", "local_mock"]).default("google_gemini"),
      model: z.string().default("gemini-2.5-flash-preview-tts"),
      voiceProfile: z.string().default("kannada_storyteller"),
      voiceId: z.string().default("Sulafat"),
      style: z.string().default("warm_conversational"),
      pace: z.enum(["slow", "moderate", "brisk"]).default("moderate"),
      pauseAfterSceneMs: z.number().int().min(0).max(2000).default(250),
    })
    .prefault({}),
  ambience: z
    .object({
      enabled: z.boolean().default(true),
      tracks: z.array(z.string()).default(["gentle_wind", "farm_roomtone"]),
    })
    .prefault({}),
  soundEffects: z
    .object({
      enabled: z.boolean().default(true),
      tracks: z.array(z.string()).default(["footsteps", "water_flowing"]),
    })
    .prefault({}),
  music: z
    .object({
      enabled: z.boolean().default(true),
      style: z.string().default("peaceful_rural"),
      duckDuringNarration: z.boolean().default(true),
    })
    .prefault({}),
  mix: z
    .object({
      loudnessILufs: z.number().default(-15),
      truePeakDb: z.number().default(-1.5),
      lra: z.number().default(11),
      narrationLevel: z.number().default(1.0),
      ambienceLevel: z.number().default(0.35),
      musicLevel: z.number().default(0.22),
      duckRatio: z.number().default(6),
    })
    .prefault({}),
});
export type AudioConfig = z.infer<typeof AudioConfigSchema>;

export const EpisodeSpecSchema = z.object({
  episodeId: z.string().min(1),
  title: z.string().min(1),
  series: z.string().min(1),
  language: z.enum(["kn", "hi", "en"]).default("kn"),
  durationSeconds: z.number().int().min(15).max(90),
  aspectRatio: z.literal("9:16").default("9:16"),
  resolution: z
    .object({ width: z.number().int(), height: z.number().int() })
    .default({ width: 1080, height: 1920 }),
  visualStyle: z.string().default("realistic_cinematic"),
  cameraStyle: z.string().default("first_person_pov"),
  templateId: z.string().min(1),
  scenes: z.array(SceneSpecSchema).min(3),
  publishing: PublishingSpecSchema.default({
    youtube: true,
    instagram: true,
    requiresApproval: true,
  }),
  audio: AudioConfigSchema.prefault({}),
  labels: z
    .object({
      aiGenerated: z.boolean().default(true),
      disclosure: z
        .string()
        .default(
          "Simulated scene from the go.dharaa virtual farm. Farming methods described follow documented practice; depicts no real location.",
        ),
    })
    .default({
      aiGenerated: true,
      disclosure:
        "Simulated scene from the go.dharaa virtual farm. Farming methods described follow documented practice; depicts no real location.",
    }),
});
export type EpisodeSpec = z.infer<typeof EpisodeSpecSchema>;

/* ----------------------------- narration ---------------------------- */

export const NarrationLineSchema = z.object({
  sceneKey: z.string(),
  kn: z.string(),
  en: z.string(),
  startS: z.number(),
  endS: z.number(),
  voiceNote: z.string().default(""),
});
export type NarrationLine = z.infer<typeof NarrationLineSchema>;

export const NarrationTrackSchema = z.object({
  language: z.string(),
  voiceProfile: z.string(),
  ttsStatus: z.enum(["synthesized", "recorded", "pending_voice"]),
  lines: z.array(NarrationLineSchema),
});
export type NarrationTrack = z.infer<typeof NarrationTrackSchema>;

/* ------------------------------ captions ---------------------------- */

export const CaptionCueSchema = z.object({
  sceneKey: z.string(),
  startS: z.number(),
  endS: z.number(),
  textEn: z.string(),
  textKn: z.string(),
});
export type CaptionCue = z.infer<typeof CaptionCueSchema>;

export const CaptionSetSchema = z.object({
  burnIn: z.array(CaptionCueSchema), // English burn-in (render-safe glyphs)
  sidecarKn: z.array(CaptionCueSchema), // Kannada sidecar (.srt)
  srtPath: z.string().optional(),
});
export type CaptionSet = z.infer<typeof CaptionSetSchema>;

/* ------------------------- platform metadata ------------------------ */

export const PlatformMetaSchema = z.object({
  title: z.string().max(100),
  description: z.string().max(5000),
  caption: z.string().max(2200),
  hashtags: z.array(z.string()).max(30),
  coverKind: z.enum(["thumbnail", "frame"]).default("thumbnail"),
});
export type PlatformMeta = z.infer<typeof PlatformMetaSchema>;

export const PlatformMetadataSetSchema = z.object({
  youtube: PlatformMetaSchema,
  instagram: PlatformMetaSchema,
});
export type PlatformMetadataSet = z.infer<typeof PlatformMetadataSetSchema>;

/* ----------------------------- asset bible -------------------------- */

export const AssetSpecSchema = z
  .object({
    kind: z.string(),
    dimensions: z.record(z.string(), z.number()).optional(),
    materials: z.array(z.string()).optional(),
    palette: z.array(z.string()).optional(),
    markings: z.string().optional(),
    breed: z.string().optional(),
    identityTokens: z.array(z.string()).optional(), // tokens that must appear in generation prompts
    notes: z.string().optional(),
    position: z
      .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
      .optional(), // farm-map placement (percent of acre square)
  })
  .passthrough();
export type AssetSpec = z.infer<typeof AssetSpecSchema>;

/* ------------------------------ QC ---------------------------------- */

export interface QcMeasured {
  [k: string]: unknown;
}
export interface QcSummary {
  pass: number;
  warn: number;
  fail: number;
  manual: number;
}
