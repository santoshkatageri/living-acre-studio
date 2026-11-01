import type { Vec2 } from "../sim/types";

import type { HectareWorld, TourMode, TourShot } from "./world";

/*  The scripted farm tour.

    A tour is a list of shots. Each shot says where the camera looks, how wide the
    frame is (in feet, or null for the whole farm), how long the camera takes to
    get there and how long it then holds, and what the caption says. A shot that
    names a `walkToZoneId` also sends the farmer there while it is on screen,
    which is how the third-person shot has something to follow.

    Everything here is a pure function of the tour clock, so a given second of the
    tour always puts the camera in the same place: no frame-rate dependence, no
    wall clock, no randomness. That is what makes the tour recordable — the camera
    path is the same film every time. (What is in the frame still moves on the
    browser clock: the water, the animals, his stride.) */

export interface ShotTarget {
  focus: Vec2;
  frameFt: number;
}

export interface TourState {
  index: number;
  shotId: string;
  caption: string;
  mode: TourMode;
  focus: Vec2;
  frameFt: number;
  walkToZoneId: string | null;
  zoneId: string | null;
  progress: number;
  done: boolean;
}

/** Smoothstep: the camera sets off and arrives gently. */
export function tourEase(t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1);
  return clamped * clamped * (3 - 2 * clamped);
}

export function tourDuration(shots: TourShot[]): number {
  return shots.reduce((total, shot) => total + shot.moveS + shot.holdS, 0);
}

export function shotStarts(shots: TourShot[]): number[] {
  const starts: number[] = [];
  let at = 0;
  for (const shot of shots) {
    starts.push(at);
    at += shot.moveS + shot.holdS;
  }
  return starts;
}

function centreOf(world: HectareWorld, zoneId: string | null): Vec2 {
  if (!zoneId) return { x: world.parcel.widthFt / 2, y: world.parcel.depthFt / 2 };
  const zone = world.zones.find((entry) => entry.id === zoneId);
  if (!zone) throw new Error(`the tour points at a zone "${zoneId}" the layout has not got`);
  return { x: zone.box.x + zone.box.widthFt / 2, y: zone.box.y + zone.box.depthFt / 2 };
}

export function shotTarget(shot: TourShot, world: HectareWorld, overviewFt: number): ShotTarget {
  return { focus: centreOf(world, shot.zoneId), frameFt: shot.frameFt ?? overviewFt };
}

/**
 * The tour, one instant of it. `overviewFt` is the frame height that frames the
 * whole farm at the window's current shape; null-frame shots ease towards it.
 */
export function tourAt(shots: TourShot[], world: HectareWorld, timeSec: number, overviewFt: number): TourState {
  if (shots.length === 0) throw new Error("the tour has no shots");
  const duration = tourDuration(shots);
  const starts = shotStarts(shots);
  const t = Math.min(Math.max(timeSec, 0), duration);
  const done = t >= duration;

  // The last shot that has started is the one on screen, so the final frame is
  // the closing shot's and not the one before it.
  let index = 0;
  for (let candidate = 0; candidate < starts.length; candidate += 1) {
    if (t >= (starts[candidate] as number)) index = candidate;
  }

  const shot = shots[index] as TourShot;
  const start = starts[index] as number;
  const to = shotTarget(shot, world, overviewFt);
  const previous = index > 0 ? (shots[index - 1] as TourShot) : null;
  // A cut between cameras has nothing to interpolate: the frame changes when the
  // camera does.
  const from = previous && previous.mode === shot.mode ? shotTarget(previous, world, overviewFt) : to;

  const within = t - start;
  const eased = shot.moveS <= 0 ? 1 : tourEase(within / shot.moveS);
  return {
    index,
    shotId: shot.id,
    caption: shot.caption,
    mode: shot.mode,
    focus: {
      x: from.focus.x + (to.focus.x - from.focus.x) * eased,
      y: from.focus.y + (to.focus.y - from.focus.y) * eased,
    },
    frameFt: from.frameFt + (to.frameFt - from.frameFt) * eased,
    walkToZoneId: shot.walkToZoneId,
    zoneId: shot.zoneId,
    progress: duration > 0 ? t / duration : 1,
    done,
  };
}
