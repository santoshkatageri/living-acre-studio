/*  How the farmer's clips are driven.

    The app's walk is not on a clock: `gaitPose` turns distance covered into a
    phase, so his feet keep pace with his speed. The rigged walk cycle is driven
    the same way — the clip is *scrubbed* by that phase rather than played at a
    fixed rate — which is why the model and the old boxes walk in step.

    Everything here is pure, so the blending rules can be tested in Node. */

import type { Pose } from "../gait";

/** The nine clips baked into `farmer.glb`, by the names the rig exports. */
export type FarmerClip =
  | "Idle"
  | "Walk"
  | "Run"
  | "LookAround"
  | "BendDown"
  | "PickUp"
  | "FeedCattle"
  | "WaterCrops"
  | "Gesture";

export const FARMER_CLIPS: FarmerClip[] = [
  "Idle",
  "Walk",
  "Run",
  "LookAround",
  "BendDown",
  "PickUp",
  "FeedCattle",
  "WaterCrops",
  "Gesture",
];

/** What the app knows about his motion this frame. */
export interface ActorMotion {
  /** Where in the walk cycle he is, 0..1. */
  phase: number;
  /** 0 standing, 1 striding, eased by the app. */
  amplitude: number;
  /** Ground speed, which decides walk against run. */
  speedFtPerSec?: number;
}

export interface Blend {
  idle: number;
  walk: number;
  run: number;
  /** The walk phase, wrapped into 0..1. */
  phase: number;
}

/** Walk turns into run somewhere between these, so it never snaps. */
export const RUN_FROM_FT_PER_SEC = 8.5;
export const RUN_FULL_FT_PER_SEC = 11.5;

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);

export function wrapPhase(phase: number): number {
  if (!Number.isFinite(phase)) return 0;
  return ((phase % 1) + 1) % 1;
}

/** The three weights, and the phase the walk clip should be scrubbed to. */
export function blendFor(motion: ActorMotion | undefined, speedFtPerSec = 0): Blend {
  const amplitude = clamp01(motion?.amplitude ?? 0);
  const speed = motion?.speedFtPerSec ?? speedFtPerSec;
  const span = RUN_FULL_FT_PER_SEC - RUN_FROM_FT_PER_SEC;
  const runShare = clamp01((speed - RUN_FROM_FT_PER_SEC) / (span > 0 ? span : 1));
  const moving = amplitude;
  return {
    idle: 1 - moving,
    walk: moving * (1 - runShare),
    run: moving * runShare,
    phase: wrapPhase(motion?.phase ?? 0),
  };
}

/** Standing still, the walk clip would be frozen: fall back on the pose's lean. */
export function isStanding(pose: Pose, motion: ActorMotion | undefined): boolean {
  const amplitude = motion?.amplitude;
  if (amplitude !== undefined) return amplitude < 0.02;
  return Math.abs(pose.legSwing) < 0.01 && Math.abs(pose.armSwing) < 0.01;
}

/*  Standing around he should not be a statue. Every so often he looks about,
    which is the clip the brief asks for and costs nothing to play. */
export const LOOK_AROUND_FIRST_S = 7;
export const LOOK_AROUND_EVERY_S = 13;

/** True when it is time for another look-around. */
export function dueForLookAround(idleSeconds: number, looks: number): boolean {
  if (!Number.isFinite(idleSeconds) || idleSeconds < 0) return false;
  return idleSeconds >= LOOK_AROUND_FIRST_S + looks * LOOK_AROUND_EVERY_S;
}

/*  Arriving somewhere, he does the thing that belongs to it. Keyed by the zone
    ids in the farm layout; anything else gets a wave. */
const ARRIVAL_CLIP: Record<string, FarmerClip> = {
  goshala: "FeedCattle",
  vegetable_beds: "WaterCrops",
  orchard: "PickUp",
  compost: "BendDown",
  pond: "WaterCrops",
  gate: "Gesture",
  farmhouse: "Gesture",
};

export function clipForArrival(zoneId: string | null | undefined): FarmerClip {
  if (!zoneId) return "Gesture";
  return ARRIVAL_CLIP[zoneId] ?? "Gesture";
}
