/*  A stills rig for the character.

    Every character view in `reports/character/` is shot inside the running
    hectare, not in a Blender viewport — the brief asks for the model as the app
    draws it, with the app's camera and light. Orbiting the follow camera by hand
    for each shot would make the pictures unrepeatable, so this puts him on a
    fixed mark, points the camera at a given angle, and drives one clip at a time.

    It only does anything when the page is opened with `?inspect=farmer`, so it
    cannot affect the farm:

        ?inspect=farmer                     idle, from behind
        ?inspect=farmer&orbit=180           front
        ?inspect=farmer&orbit=90            side
        ?inspect=farmer&orbit=35            three-quarter
        ?inspect=farmer&clip=FeedCattle&orbit=200
        ?inspect=farmer&clip=Walk&orbit=140&phase=0.25   the walk cycle, mid-stride

    `phase` freezes the walk cycle at that point, so a still is the same still
    every time. */

import { REST_POSE } from "../gait";
import type { FarmerClip } from "./farmer-motion";
import { FARMER_CLIPS, wrapPhase } from "./farmer-motion";

export interface InspectSpec {
  clip: FarmerClip;
  orbitDeg: number;
  distanceFt: number;
  /** Set for the cycle clips: where to freeze the stride. */
  phase: number | null;
}

export interface InspectActor {
  animate: (
    pose: typeof REST_POSE,
    motion?: { phase: number; amplitude: number; speedFtPerSec: number },
  ) => void;
  playOnce: (clip: FarmerClip) => void;
  durations: Partial<Record<FarmerClip, number>>;
  setFacing: (radians: number) => void;
}

export interface Inspector {
  frame(actor: InspectActor, place: { x: number; y: number }, elapsedS: number): void;
}

/** An angle in degrees, folded into (-180, 180]: the camera's own convention. */
export function windAround(degrees: number): number {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

const isClip = (value: string | null): value is FarmerClip =>
  value !== null && (FARMER_CLIPS as string[]).includes(value);

/** The walk cycle's length, used only when `phase` is not given. */
const CYCLE_SECONDS: Partial<Record<FarmerClip, number>> = { Walk: 1.07, Run: 0.73 };

/** Read the query string; null unless this page asked for the stills rig. */
export function inspectSpec(search: string): InspectSpec | null {
  const params = new URLSearchParams(search);
  if (params.get("inspect") !== "farmer") return null;
  const clip = params.get("clip");
  const orbit = Number(params.get("orbit"));
  const distance = Number(params.get("distance"));
  const phase = params.get("phase");
  return {
    clip: isClip(clip) ? clip : "Idle",
    orbitDeg: Number.isFinite(orbit) ? orbit : 0,
    distanceFt: Number.isFinite(distance) && distance > 0 ? distance : 10,
    phase: phase === null ? null : wrapPhase(Number(phase)),
  };
}

/**
 * Build the rig: it holds the camera aim and, for a one-shot clip, which run of
 * the clip is playing, so the frame can restart it when it finishes.
 */
/** The compass direction the sun comes from, in the app's radian convention.
 *
 *  The farm's sun sits up and over one corner of the parcel, so a character who
 *  faces it is lit from the front. The stills rig turns him towards it: a
 *  screenshot of a backlit face says nothing about the face. */
export function sunAzimuth(widthFt: number, depthFt: number): number {
  return Math.atan2(-0.2 * widthFt, -0.3 * depthFt);
}

export function createInspector(
  spec: InspectSpec,
  setFollowTarget: (xFt: number, yFt: number, headingRad: number) => void,
  setFollowDistance: (distanceFt: number) => void,
  facingRad = 0,
): Inspector {
  let startIndex = -1;

  return {
    frame(actor, place, elapsedS) {
      setFollowDistance(spec.distanceFt);
      // He faces the light and the camera orbits him: 180° is head on, 0° is his
      // back, 90° his left side.
      actor.setFacing(facingRad);
      // The world camera measures its yaw from the reverse of his heading, so
      // adding half a turn to the orbit is what puts 0° in front of his face.
      const heading = facingRad + Math.PI + (windAround(spec.orbitDeg) * Math.PI) / 180;
      setFollowTarget(place.x, place.y, heading);

      const cycle = CYCLE_SECONDS[spec.clip];
      if (cycle !== undefined) {
        const phase = spec.phase ?? wrapPhase(elapsedS / cycle);
        actor.animate(REST_POSE, {
          phase,
          amplitude: 1,
          speedFtPerSec: spec.clip === "Run" ? 12 : 0,
        });
        return;
      }

      // A one-shot: play it, and play it again when it has run out.
      const duration = actor.durations[spec.clip] ?? 3;
      const index = Math.floor(elapsedS / duration);
      if (index !== startIndex) {
        startIndex = index;
        actor.playOnce(spec.clip);
      }
      actor.animate(REST_POSE);
    },
  };
}
