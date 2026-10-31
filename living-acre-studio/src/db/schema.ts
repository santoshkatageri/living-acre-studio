import {
  pgTable,
  text,
  integer,
  real,
  boolean,
  timestamp,
  serial,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import type {
  EpisodeSpec,
  NarrationTrack,
  CaptionSet,
  PlatformMetadataSet,
  AssetSpec,
} from "@/lib/studio/schemas";

/* ------------------------------------------------------------------ */
/*  go.dharaa — The Living Acre · production database                  */
/* ------------------------------------------------------------------ */

export const series = pgTable("studio_series", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull(),
  description: text("description").notNull(),
  templateId: text("template_id").notNull(),
  cadence: text("cadence").notNull(),
  accent: text("accent").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const episodes = pgTable("episodes", {
  id: text("id").primaryKey(), // e.g. living-acre-001
  seq: integer("seq").notNull().unique(),
  instruction: text("instruction").notNull(),
  title: text("title").notNull(),
  seriesSlug: text("series_slug")
    .notNull()
    .references(() => series.slug),
  language: text("language").notNull().default("kn"),
  durationSeconds: integer("duration_seconds").notNull(),
  aspectRatio: text("aspect_ratio").notNull().default("9:16"),
  width: integer("width").notNull().default(1080),
  height: integer("height").notNull().default(1920),
  visualStyle: text("visual_style").notNull(),
  cameraStyle: text("camera_style").notNull(),
  status: text("status").notNull().default("draft"),
  // draft → in_production → awaiting_approval → approved → scheduled → published | failed | rejected
  spec: jsonb("spec").$type<EpisodeSpec>(),
  narration: jsonb("narration").$type<NarrationTrack>(),
  captions: jsonb("captions").$type<CaptionSet>(),
  platformMetadata: jsonb("platform_metadata").$type<PlatformMetadataSet>(),
  approvalNote: text("approval_note"),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const scenes = pgTable(
  "scenes",
  {
    id: text("id").primaryKey(), // `${episodeId}:${sceneKey}`
    episodeId: text("episode_id")
      .notNull()
      .references(() => episodes.id),
    idx: integer("idx").notNull(),
    sceneKey: text("scene_key").notNull(),
    activity: text("activity").notNull(),
    cameraStyle: text("camera_style").notNull(),
    locationId: text("location_id").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    narrationKn: text("narration_kn"),
    narrationEn: text("narration_en"),
    platePath: text("plate_path"),
    motionProfile: text("motion_profile").notNull().default("push-in"),
    status: text("status").notNull().default("planned"),
  },
  (t) => [index("scenes_episode_idx").on(t.episodeId)],
);

export const STAGES = [
  "specification",
  "narration_script",
  "audio_design",
  "captions",
  "storyboard",
  "metadata",
  "voice_render",
  "render",
  "audio_mix",
  "thumbnail",
  "quality_control",
  "approval_gate",
  "publishing_package",
  "buffer_schedule",
  "analytics_baseline",
] as const;
export type StageId = (typeof STAGES)[number];

export const stages = pgTable(
  "pipeline_stages",
  {
    id: text("id").primaryKey(), // `${episodeId}:${stage}`
    episodeId: text("episode_id")
      .notNull()
      .references(() => episodes.id),
    stage: text("stage").notNull(),
    idx: integer("idx").notNull(),
    status: text("status").notNull().default("pending"),
    // pending | running | complete | failed | skipped | awaiting_human
    attempt: integer("attempt").notNull().default(0),
    inputHash: text("input_hash"),
    progress: integer("progress").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    output: jsonb("output").$type<Record<string, unknown>>(),
    error: text("error"),
  },
  (t) => [index("stages_episode_idx").on(t.episodeId)],
);

export const productionLogs = pgTable(
  "production_logs",
  {
    id: serial("id").primaryKey(),
    episodeId: text("episode_id")
      .notNull()
      .references(() => episodes.id),
    stage: text("stage").notNull(),
    level: text("level").notNull().default("info"), // info | warn | error
    message: text("message").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("logs_episode_idx").on(t.episodeId)],
);

export const assets = pgTable("assets", {
  id: text("id").primaryKey(), // stable canonical IDs e.g. loc-goshala
  kind: text("kind").notNull(), // location | character | livestock | scene_plate | brand | prop
  name: text("name").notNull(),
  subtitle: text("subtitle").notNull().default(""),
  description: text("description").notNull().default(""),
  imagePath: text("image_path"),
  spec: jsonb("spec").$type<AssetSpec>(), // canonical asset bible spec
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const qcReports = pgTable(
  "qc_reports",
  {
    id: serial("id").primaryKey(),
    episodeId: text("episode_id")
      .notNull()
      .references(() => episodes.id),
    overall: text("overall").notNull(), // pass | conditional | fail
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("qc_episode_idx").on(t.episodeId)],
);

export const qcChecks = pgTable(
  "qc_checks",
  {
    id: serial("id").primaryKey(),
    reportId: integer("report_id")
      .notNull()
      .references(() => qcReports.id),
    category: text("category").notNull(), // video | audio | visual | metadata | publishing
    name: text("name").notNull(),
    status: text("status").notNull(), // pass | warn | fail | manual
    required: boolean("required").notNull().default(true),
    detail: text("detail").notNull().default(""),
    measured: jsonb("measured").$type<Record<string, unknown>>(),
  },
  (t) => [index("qcc_report_idx").on(t.reportId)],
);

export const mediaFiles = pgTable(
  "media_files",
  {
    id: serial("id").primaryKey(),
    episodeId: text("episode_id")
      .notNull()
      .references(() => episodes.id),
    kind: text("kind").notNull(), // master_video | thumbnail | audio_mix | captions_srt | storyboard_plate
    path: text("path").notNull(), // public URL path e.g. /outputs/.../master.mp4
    bytes: integer("bytes").notNull().default(0),
    durationSeconds: real("duration_seconds"),
    width: integer("width"),
    height: integer("height"),
    checksum: text("checksum"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("media_episode_idx").on(t.episodeId)],
);

export const publications = pgTable(
  "publications",
  {
    id: serial("id").primaryKey(),
    episodeId: text("episode_id")
      .notNull()
      .references(() => episodes.id),
    channel: text("channel").notNull(), // instagram | youtube
    channelId: text("channel_id").notNull(),
    status: text("status").notNull().default("draft"),
    // draft | scheduled | sent | confirmed | failed
    mode: text("mode").notNull().default("mock"), // mock | live
    bufferPostId: text("buffer_post_id"),
    mediaUrl: text("media_url"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    caption: text("caption").notNull(),
    hashtags: jsonb("hashtags").$type<string[]>().notNull().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    attempts: integer("attempts").notNull().default(0),
    response: jsonb("response").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("pub_episode_idx").on(t.episodeId)],
);

export const analyticsSnapshots = pgTable(
  "analytics_snapshots",
  {
    id: serial("id").primaryKey(),
    publicationId: integer("publication_id")
      .notNull()
      .references(() => publications.id),
    capturedDate: text("captured_date").notNull(), // YYYY-MM-DD Asia/Kolkata
    views: integer("views").notNull().default(0),
    watchSeconds: integer("watch_seconds").notNull().default(0),
    avgViewSeconds: real("avg_view_seconds").notNull().default(0),
    retentionPct: real("retention_pct").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    followsDelta: integer("follows_delta").notNull().default(0),
    source: text("source").notNull().default("simulated"), // simulated | buffer | platform_api
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("analytics_pub_date_uniq").on(t.publicationId, t.capturedDate),
  ],
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: serial("id").primaryKey(),
    episodeId: text("episode_id"),
    kind: text("kind").notNull(), // render_seconds | ai_plate | storage_bytes | api_call | tts_chars
    units: real("units").notNull(),
    costEstimateUsd: real("cost_estimate_usd").notNull().default(0),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("usage_episode_idx").on(t.episodeId)],
);

export const studioConfig = pgTable("studio_config", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
});

/* --------------------------- audio pipeline --------------------------- */

export const audioSegments = pgTable(
  "audio_segments",
  {
    id: serial("id").primaryKey(),
    episodeId: text("episode_id").notNull(),
    sceneKey: text("scene_key").notNull(),
    language: text("language").notNull(),
    provider: text("provider").notNull(), // google_gemini | local_mock | elevenlabs
    model: text("model").notNull(),
    voiceId: text("voice_id").notNull(),
    textOriginal: text("text_original").notNull(), // approved narration — never rewritten
    textSpoken: text("text_spoken").notNull(), // pronunciation-shaped spoken form
    appliedRules: jsonb("applied_rules").$type<string[]>().notNull().default([]),
    hash: text("hash").notNull(), // content key: provider+model+voice+style+spoken
    path: text("path").notNull(),
    bytes: integer("bytes").notNull().default(0),
    durationSeconds: real("duration_seconds").notNull().default(0),
    sampleRate: integer("sample_rate").notNull().default(24000),
    channels: integer("channels").notNull().default(1),
    windowStartS: real("window_start_s").notNull(),
    windowEndS: real("window_end_s").notNull(),
    degraded: boolean("degraded").notNull().default(false),
    note: text("note").notNull().default(""),
    regenerated: integer("regenerated").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("audio_segments_hash_uniq").on(t.hash, t.episodeId),
    index("audio_segments_episode_idx").on(t.episodeId),
  ],
);

export const audioPoc = pgTable(
  "audio_poc",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(), // narration_a | narration_b | ambience | mixed_preview
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    voiceId: text("voice_id").notNull().default(""),
    language: text("language").notNull().default("kn"),
    textOriginal: text("text_original").notNull().default(""),
    path: text("path").notNull(),
    durationSeconds: real("duration_seconds").notNull().default(0),
    degraded: boolean("degraded").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audio_poc_kind_idx").on(t.kind)],
);
