import { describe, expect, test } from "vitest";

import {
  clampZoom,
  overviewViewFt,
  overviewZoom,
  followPose,
  viewFtForZoom,
} from "../src/hectare/camera";
import { shotStarts, shotTarget, tourAt, tourDuration } from "../src/hectare/tour";
import { HECTARE } from "../src/hectare/world";

/*  The tour clock, and the framing maths it leans on.

    The tour has to be a pure function of its clock — that is what makes the
    recording reproducible — so most of what is worth testing is that the same
    time always gives the same frame, that the shots go in order, and that the
    camera lands exactly on each shot's space. */

const SHOTS = HECTARE.tour;
const LENGTH = tourDuration(SHOTS);
const OVERVIEW_FT = overviewViewFt(HECTARE, 16 / 9);
const at = (timeSec: number) => tourAt(SHOTS, HECTARE, timeSec, OVERVIEW_FT);
const centreOf = (zoneId: string) => {
  const zone = HECTARE.zones.find((entry) => entry.id === zoneId)!;
  return { x: zone.box.x + zone.box.widthFt / 2, y: zone.box.y + zone.box.depthFt / 2 };
};

describe("the farm tour", () => {
  test("is a data-driven film of eight shots, 43.5 seconds long", () => {
    expect(SHOTS).toHaveLength(8);
    expect(LENGTH).toBeCloseTo(43.5, 6);
    expect(SHOTS.map((shot) => shot.id)).toEqual([
      "farm",
      "crops",
      "orchard",
      "walk",
      "cattle",
      "pond",
      "rotation",
      "home",
    ]);
    // It opens on the whole farm, shows him walking, and closes on the farm.
    expect(SHOTS[0]!.frameFt).toBeNull();
    expect(SHOTS.some((shot) => shot.mode === "third-person")).toBe(true);
    expect(SHOTS[SHOTS.length - 1]!.frameFt).toBeNull();
  });

  test("plays the shots in order and owns its last frame", () => {
    const starts = shotStarts(SHOTS);
    for (const [index, start] of starts.entries()) {
      const shot = SHOTS[index]!;
      expect(at(start + 0.01).index).toBe(index);
      expect(at(start + shot.moveS + shot.holdS - 0.01).index).toBe(index);
      expect(at(start + 0.01).caption).toBe(shot.caption);
    }
    expect(at(LENGTH).done).toBe(true);
    expect(at(LENGTH).index).toBe(SHOTS.length - 1);
    expect(at(LENGTH + 10).progress).toBe(1);
    expect(at(0).done).toBe(false);
  });

  test("lands exactly on each shot's space when its move is done", () => {
    for (const [index, shot] of SHOTS.entries()) {
      if (!shot.zoneId) continue;
      const start = shotStarts(SHOTS)[index]!;
      const state = at(start + shot.moveS + shot.holdS / 2);
      const centre = centreOf(shot.zoneId);
      expect(state.focus.x).toBeCloseTo(centre.x, 6);
      expect(state.focus.y).toBeCloseTo(centre.y, 6);
    }
  });

  test("eases between two spaces instead of jumping, and cuts between cameras", () => {
    const crops = shotStarts(SHOTS)[1]!;
    const moveS = SHOTS[1]!.moveS;
    const from = { x: HECTARE.parcel.widthFt / 2, y: HECTARE.parcel.depthFt / 2 };
    const to = centreOf("plot_wheat");
    const distance = (state: { focus: { x: number; y: number } }): number =>
      Math.hypot(state.focus.x - from.x, state.focus.y - from.y);

    const quarter = at(crops + moveS * 0.25);
    const threeQuarters = at(crops + moveS * 0.75);
    expect(quarter.focus.x).toBeGreaterThan(Math.min(from.x, to.x) - 1e-9);
    expect(quarter.focus.x).toBeLessThan(Math.max(from.x, to.x) + 1e-9);
    expect(distance(threeQuarters)).toBeGreaterThan(distance(quarter));
    // The frame size eases too, between the whole farm and 150 ft.
    const middle = at(crops + moveS * 0.5).frameFt;
    expect(middle).toBeLessThan(OVERVIEW_FT);
    expect(middle).toBeGreaterThan(150);

    // A cut to his shoulder is a cut: the whole shot sits on its own target.
    const walkIndex = SHOTS.findIndex((shot) => shot.mode === "third-person");
    const walkShot = SHOTS[walkIndex]!;
    const walkStart = shotStarts(SHOTS)[walkIndex]!;
    const target = shotTarget(walkShot, HECTARE, OVERVIEW_FT);
    for (const offset of [0, walkShot.moveS * 0.5, walkShot.moveS + walkShot.holdS - 0.01]) {
      const frame = at(walkStart + offset);
      expect(frame.mode).toBe("third-person");
      expect(frame.focus.x).toBeCloseTo(target.focus.x, 9);
    }
  });

  test("resolves the whole-farm frame from the window, not from a guess", () => {
    expect(shotTarget(SHOTS[0]!, HECTARE, OVERVIEW_FT).frameFt).toBe(OVERVIEW_FT);
    expect(shotTarget(SHOTS[0]!, HECTARE, 400).frameFt).toBe(400);
    expect(shotTarget(SHOTS[1]!, HECTARE, OVERVIEW_FT).frameFt).toBe(150);
  });

  test("sends the farmer walking on every frame of the shot that asks for it", () => {
    const index = SHOTS.findIndex((shot) => shot.walkToZoneId !== null);
    expect(index).toBeGreaterThanOrEqual(0);
    const shot = SHOTS[index]!;
    const start = shotStarts(SHOTS)[index]!;
    for (const offset of [0, shot.moveS * 0.5, shot.moveS + shot.holdS * 0.9]) {
      expect(at(start + offset).walkToZoneId).toBe(shot.walkToZoneId);
    }
    // Only that one shot sends him anywhere, and only to walkable ground.
    expect(SHOTS.filter((entry) => entry.walkToZoneId !== null)).toHaveLength(1);
    const zone = HECTARE.zones.find((entry) => entry.id === shot.walkToZoneId)!;
    expect(zone.walkable).toBe(true);
  });

  test("is the same film every time, and every shot names a real space", () => {
    for (const time of [0, 3.2, 11.7, 25, 43.4]) expect(at(time)).toEqual(at(time));
    for (const shot of SHOTS) {
      if (shot.zoneId) expect(HECTARE.zones.some((zone) => zone.id === shot.zoneId)).toBe(true);
      expect(shot.caption.trim().length).toBeGreaterThan(0);
      expect(shot.holdS).toBeGreaterThan(0);
    }
  });
});

describe("the framing maths", () => {
  test("frames the whole parcel at any window shape", () => {
    for (const aspect of [4 / 3, 16 / 9, 21 / 9]) {
      const viewFt = overviewViewFt(HECTARE, aspect);
      const zoom = overviewZoom(HECTARE, aspect);
      // The frame is at least the parcel across, in both directions.
      expect(viewFt).toBeGreaterThanOrEqual(HECTARE.parcel.widthFt * 0.9);
      expect(viewFt * aspect).toBeGreaterThanOrEqual(HECTARE.parcel.widthFt * 0.9);
      // And the zoom the app starts at frames exactly that.
      expect(viewFtForZoom(HECTARE, zoom)).toBeCloseTo(viewFt, 6);
    }
  });

  test("will not let the camera crop the parcel, or go through the ground", () => {
    const overview = overviewZoom(HECTARE, 16 / 9);
    expect(clampZoom(HECTARE, 16 / 9, 0.001)).toBeCloseTo(overview, 6);
    expect(clampZoom(HECTARE, 16 / 9, 1e6)).toBeCloseTo(HECTARE.camera.maxZoom, 6);
    // A heading change re-frames: a square parcel seen corner-on is wider.
    const a = overviewViewFt(HECTARE, 16 / 9, 0);
    const b = overviewViewFt(HECTARE, 16 / 9, 45);
    expect(Math.abs(a - b)).toBeGreaterThan(1);
  });

  test("follows the farmer from behind, at the data's distance and height", () => {
    const pose = followPose(HECTARE, { x: 160, y: 160 }, 0);
    const follow = HECTARE.camera.follow;
    // Directly behind him: he walks +z, so the camera is at smaller z.
    expect(pose.position.z).toBeLessThan(160);
    expect(pose.position.x).toBeCloseTo(160, 6);
    // Never below the data's height, and looking ahead of him.
    expect(pose.position.y).toBeGreaterThanOrEqual(follow.heightFt - 1e-9);
    expect(pose.lookAt.z).toBeGreaterThan(160);
    expect(pose.lookAt.y).toBeCloseTo(follow.lookHeightFt, 6);
    // Turning him turns the camera with him.
    const turned = followPose(HECTARE, { x: 160, y: 160 }, Math.PI / 2);
    expect(turned.position.x).toBeLessThan(160);
    // And its distance is clamped to the data's bounds.
    expect(followPose(HECTARE, { x: 0, y: 0 }, 0, 1000).position.length()).toBeGreaterThan(
      followPose(HECTARE, { x: 0, y: 0 }, 0, 1).position.length(),
    );
  });
});
