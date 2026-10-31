import { ACTIVITIES } from "./series";
import type {
  CaptionCue,
  CaptionSet,
  EpisodeSpec,
  NarrationTrack,
  SceneSpec,
} from "./schemas";
import { srtTime } from "./util";

/* ------------------------------------------------------------------ */
/*  Script writer + captioner. Narration is author-locked per activity; */
/*  timings are derived from the scene plan.                            */
/* ------------------------------------------------------------------ */

const INTRO = 2.4; // brand card

export function sceneOffsets(spec: EpisodeSpec): Map<string, number> {
  const m = new Map<string, number>();
  let t = INTRO;
  for (const s of spec.scenes) {
    m.set(s.sceneKey, t);
    t += s.durationSeconds;
  }
  return m;
}

function lineFor(a: SceneSpec) {
  return ACTIVITIES.find((x) => x.key === a.sceneKey)!;
}

export function writeNarration(spec: EpisodeSpec): NarrationTrack {
  const offsets = sceneOffsets(spec);
  const lines = spec.scenes.map((s) => {
    const def = lineFor(s);
    const start = offsets.get(s.sceneKey)! + 0.7;
    return {
      sceneKey: s.sceneKey,
      kn: def.kn,
      en: def.en,
      startS: start,
      endS: Math.min(start + 4.6, offsets.get(s.sceneKey)! + s.durationSeconds - 0.3),
      voiceNote:
        "warm male, mid-40s, kn-IN, unhurried — as if speaking to a friend walking beside him",
    };
  });
  return {
    language: spec.language,
    voiceProfile: "kn-IN / warm male / mid-40s / calm field voice",
    // No TTS credentials configured for this studio run — voice synthesis
    // is deliberately marked pending rather than fabricated.
    ttsStatus: "pending_voice",
    lines,
  };
}

export function writeCaptions(spec: EpisodeSpec): CaptionSet {
  const offsets = sceneOffsets(spec);
  const mk = (kind: "burn" | "sidecar"): CaptionCue[] =>
    spec.scenes.map((s) => {
      const def = lineFor(s);
      const start = offsets.get(s.sceneKey)! + 0.55;
      return {
        sceneKey: s.sceneKey,
        startS: start,
        endS: Math.min(start + 4.4, offsets.get(s.sceneKey)! + s.durationSeconds - 0.2),
        textEn: def.burn,
        textKn: kind === "sidecar" ? def.kn : def.burn,
      };
    });
  return { burnIn: mk("burn"), sidecarKn: mk("sidecar") };
}

export function toSrt(cues: CaptionCue[], lang: "kn" | "en"): string {
  return cues
    .map((c, i) => {
      const text = lang === "kn" ? c.textKn : c.textEn;
      return `${i + 1}\n${srtTime(c.startS)} --> ${srtTime(c.endS)}\n${text}\n`;
    })
    .join("\n");
}
