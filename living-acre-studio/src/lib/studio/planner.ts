import {
  ACTIVITIES,
  DEFAULT_ORDER,
  SERIES,
  type ActivityDef,
  type SeriesDef,
} from "./series";
import { EpisodeSpecSchema, type EpisodeSpec, type SceneSpec } from "./schemas";
import { pad3 } from "./util";

/* ------------------------------------------------------------------ */
/*  Content planner — instruction → validated EpisodeSpec.             */
/*  Deterministic: the same instruction always plans the same episode. */
/* ------------------------------------------------------------------ */

export interface PlanResult {
  spec: EpisodeSpec;
  series: SeriesDef;
  matched: ActivityDef[];
  notes: string[];
}

const CARD_SECONDS = 2.4 * 2; // brand intro + outro
const SERIES_TITLES: Record<string, string> = {
  "morning-at-the-living-acre": "A Morning at the Living Acre",
  "life-at-the-goshala": "Morning Rounds with Ganga",
  "farmers-daily-life": "A Working Day on the Acre",
  "sustainable-living": "Nothing Wasted on the Acre",
  "evening-at-the-farm": "An Evening at the Living Acre",
  "learn-about-farming": "Small Lessons from the Acre",
};

export function detectSeries(instruction: string): SeriesDef {
  const t = instruction.toLowerCase();
  const pick = (words: string[]) => words.some((w) => t.includes(w));
  if (pick(["goshala", "ganga", "cow", "cattle", "milk", "feeding", "livestock"]))
    return SERIES[1];
  if (pick(["compost", "solar", "conserve", "waste", "sustainable"]))
    return SERIES[3];
  if (pick(["evening", "sunset", "dusk", "night", "dinner", "courtyard"]))
    return SERIES[4];
  if (pick(["how to", "learn", "explain", "what is", "teach"]))
    return SERIES[5];
  if (pick(["irrigate", "plant", "harvest", "soil", "maintain"]))
    return SERIES[2];
  return SERIES[0];
}

export function matchActivities(instruction: string): {
  matched: ActivityDef[];
  notes: string[];
} {
  const t = instruction.toLowerCase();
  const notes: string[] = [];
  const chosen: ActivityDef[] = [];
  for (const a of ACTIVITIES) {
    if (a.match.some((m) => t.includes(m))) chosen.push(a);
  }
  if (chosen.length < 3) {
    notes.push(
      `Instruction matched ${chosen.length} activity(ies); falling back to canonical morning order.`,
    );
    return {
      matched: DEFAULT_ORDER.map((k) => ACTIVITIES.find((a) => a.key === k)!),
      notes,
    };
  }
  // Canonical pacing: open with a arrival context if absent.
  const keys = chosen.map((c) => c.key);
  if (!keys.includes("open-door") && !keys.includes("evening-court"))
    chosen.unshift(ACTIVITIES.find((a) => a.key === "farm-walk")!);
  if (!keys.includes("overlook"))
    chosen.push(ACTIVITIES.find((a) => a.key === "overlook")!);
  // De-dupe preserving order
  const seen = new Set<string>();
  return { matched: chosen.filter((c) => !seen.has(c.key) && (seen.add(c.key), true)), notes };
}

export function planEpisode(params: {
  instruction: string;
  episodeNumber: number;
  seriesSlug?: string;
  language?: "kn" | "hi" | "en";
}): PlanResult {
  const { instruction, episodeNumber } = params;
  const series = params.seriesSlug
    ? SERIES.find((s) => s.slug === params.seriesSlug)!
    : detectSeries(instruction);
  const { matched, notes } = matchActivities(instruction);

  // Fit total to 52–56 s: scale scene durations, clamp to template pacing.
  const target = 56 - CARD_SECONDS;
  const raw = matched.reduce((s, a) => s + a.duration, 0);
  const scale = target / raw;
  const scenes: SceneSpec[] = matched.map((a, i) => ({
    sceneKey: a.key,
    title: a.title,
    activity: a.activity,
    camera: a.camera,
    locationId: a.locationId,
    durationSeconds: Math.max(5, Math.min(12, Math.round(a.duration * scale))),
    subjects: a.subjects,
    motionProfile: a.motionProfile,
  }));
  // Round-trip trim so the sum lands in range.
  let sum = scenes.reduce((s, x) => s + x.durationSeconds, 0) + CARD_SECONDS;
  let i = 0;
  while (sum > 58 && i < scenes.length * 3) {
    const idx = i % scenes.length;
    if (scenes[idx].durationSeconds > 5) {
      scenes[idx].durationSeconds -= 1;
      sum -= 1;
    }
    i++;
  }

  const durationSeconds = Math.round(scenes.reduce((s, x) => s + x.durationSeconds, 0) + CARD_SECONDS);
  const title = SERIES_TITLES[series.slug] ?? "A Day at the Living Acre";

  const spec = EpisodeSpecSchema.parse({
    episodeId: `living-acre-${pad3(episodeNumber)}`,
    title,
    series: series.slug,
    language: params.language ?? "kn",
    durationSeconds,
    aspectRatio: "9:16",
    resolution: { width: 1080, height: 1920 },
    visualStyle: "realistic_cinematic",
    cameraStyle: "first_person_pov",
    templateId: series.templateId,
    scenes,
    publishing: { youtube: true, instagram: true, requiresApproval: true },
    audio: {
      language: params.language ?? "kn",
      narration: {
        voiceProfile: params.language === "hi" ? "hindi_storyteller" : params.language === "en" ? "english_narrator" : "kannada_storyteller",
        voiceId: params.language === "hi" ? "Algieba" : params.language === "en" ? "Schedar" : "Sulafat",
      },
      ambience: { tracks: ["morning_birds", "gentle_wind", "farm_roomtone"] },
    },
  });
  return { spec, series, matched, notes };
}
