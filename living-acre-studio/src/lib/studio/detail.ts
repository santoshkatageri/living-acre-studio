/* Serialisable shapes passed from server components to the console. */
import type {
  CaptionSet,
  EpisodeSpec,
  NarrationTrack,
  PlatformMetadataSet,
} from "./schemas";

export interface EpRow {
  id: string;
  seq: number;
  instruction: string;
  title: string;
  seriesSlug: string;
  language: string;
  durationSeconds: number;
  aspectRatio: string;
  width: number;
  height: number;
  visualStyle: string;
  cameraStyle: string;
  status: string;
  spec: EpisodeSpec | null;
  narration: NarrationTrack | null;
  captions: CaptionSet | null;
  platformMetadata: PlatformMetadataSet | null;
  scheduledFor: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface SceneRow {
  id: string;
  idx: number;
  sceneKey: string;
  activity: string;
  cameraStyle: string;
  locationId: string;
  durationSeconds: number;
  narrationKn: string | null;
  narrationEn: string | null;
  platePath: string | null;
  motionProfile: string;
  status: string;
}

export interface StageRow {
  id: string;
  stage: string;
  idx: number;
  status: string;
  attempt: number;
  progress: number;
  durationMs: number | null;
  output: Record<string, unknown> | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface MediaRow {
  id: number;
  kind: string;
  path: string;
  bytes: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  checksum: string | null;
}

export interface PubRow {
  id: number;
  channel: string;
  channelId: string;
  status: string;
  mode: string;
  bufferPostId: string | null;
  mediaUrl: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  caption: string;
  hashtags: string[];
  attempts: number;
}

export interface LogRow {
  id: number;
  stage: string;
  level: string;
  message: string;
  createdAt: string;
}

export interface AudioSegRow {
  id: number;
  sceneKey: string;
  language: string;
  provider: string;
  model: string;
  voiceId: string;
  textOriginal: string;
  textSpoken: string;
  appliedRules: string[];
  path: string;
  durationSeconds: number;
  windowStartS: number;
  degraded: boolean;
  note: string;
  regenerated: number;
}

export interface QcBundle {
  report: { id: number; overall: string; summary: string; createdAt: string };
  checks: {
    id: number;
    category: string;
    name: string;
    status: string;
    required: boolean;
    detail: string;
  }[];
}

export interface Detail {
  episode: EpRow;
  scenes: SceneRow[];
  stages: StageRow[];
  media: MediaRow[];
  publications: PubRow[];
  logs: LogRow[];
  qc: QcBundle | null;
  series: { name: string; slug: string; accent: string } | null;
  audioSegments: AudioSegRow[];
}
