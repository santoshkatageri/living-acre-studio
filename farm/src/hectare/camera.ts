import * as THREE from "three";

import type { Vec2 } from "../sim/types";

import type { HectareWorld } from "./world";

/*  The two cameras.

    The farm camera is orthographic: it looks down the data's pitch (35°) and yaw
    (45°), and zoom only changes how much ground the frustum spans. The framing
    maths walks the eight corners of the parcel (plus the tallest thing in it) onto
    the camera's own axes, so "the whole farm" means the whole farm at any window
    shape and any heading — a square parcel seen corner-on is wider on screen than
    one seen face-on.

    The follow camera is a perspective camera behind the farmer, at the data's
    distance, pitch and field of view, looking a little ahead of him so he has
    room to walk into the frame. */

export const CAMERA_DISTANCE = 900;

export interface CameraBasis {
  /** Screen right, in world space. */
  right: THREE.Vector3;
  /** Screen up, in world space. */
  up: THREE.Vector3;
  /** Where the camera stands, as a unit vector from the focus. */
  toCamera: THREE.Vector3;
}

export function cameraBasis(pitchDeg: number, yawDeg: number): CameraBasis {
  const pitch = (pitchDeg * Math.PI) / 180;
  const yaw = (yawDeg * Math.PI) / 180;
  const toCamera = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize();
  const forward = toCamera.clone().negate();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  return { right, up, toCamera };
}

export function normaliseYaw(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** The tallest thing the farm frame has to fit: the belt canopy and the signs. */
export function tallestFt(world: HectareWorld): number {
  const trees = world.belt.reduce((tallest, tree) => Math.max(tallest, tree.heightFt + tree.canopyFt * 0.9), 0);
  const signs = world.labels.reduce((tallest, label) => Math.max(tallest, label.yFt), 0);
  return Math.max(trees, signs, 10);
}

/**
 * The frame height, in feet, that fits the whole parcel at this aspect and
 * heading — with the data's margin.
 */
export function overviewViewFt(world: HectareWorld, aspect: number, yawDeg = world.camera.yawDeg): number {
  const { right, up } = cameraBasis(world.camera.pitchDeg, yawDeg);
  const top = tallestFt(world);
  const side = world.parcel.widthFt;
  let halfWidth = 0;
  let halfHeight = 0;
  for (const x of [0, side]) {
    for (const z of [0, side]) {
      for (const y of [0, top]) {
        const point = new THREE.Vector3(x, y, z);
        halfWidth = Math.max(halfWidth, Math.abs(point.dot(right)));
        halfHeight = Math.max(halfHeight, Math.abs(point.dot(up)));
      }
    }
  }
  const margin = world.camera.overviewMargin;
  const heightNeeded = 2 * halfHeight * margin;
  const widthNeeded = (2 * halfWidth * margin) / Math.max(aspect, 0.0001);
  return Math.max(heightNeeded, widthNeeded);
}

/** Zoom 1 is the data's default view; smaller numbers pull back to the parcel. */
export function overviewZoom(world: HectareWorld, aspect: number, yawDeg = world.camera.yawDeg): number {
  return world.camera.defaultViewFt / overviewViewFt(world, aspect, yawDeg);
}

export function clampZoom(world: HectareWorld, aspect: number, zoom: number, yawDeg = world.camera.yawDeg): number {
  const min = overviewZoom(world, aspect, yawDeg);
  return Math.min(Math.max(zoom, min), world.camera.maxZoom);
}

/** The ground height a zoom level frames: zoom 1 is the data's default view. */
export function viewFtForZoom(world: HectareWorld, zoom: number): number {
  return world.camera.defaultViewFt / Math.max(zoom, 0.001);
}

/** Which way the ground under the cursor is from the frame's centre. */
export function groundFromScreen(
  world: HectareWorld,
  focus: Vec2,
  viewFt: number,
  aspect: number,
  yawDeg: number,
  ndc: Vec2,
): Vec2 {
  const { right, up } = cameraBasis(world.camera.pitchDeg, yawDeg);
  // Only the ground plane matters: solve for the world point whose projections
  // onto `right` and `up` match the click's.
  const halfHeight = viewFt / 2;
  const halfWidth = (viewFt * aspect) / 2;
  const sx = (ndc.x - 0.5) * 2 * halfWidth;
  const sy = (0.5 - ndc.y) * 2 * halfHeight;
  // right and up span the screen; on the ground plane (y = 0) the change is
  // right.xz * sx + up.xz * sy, scaled by how much of them lies in the plane.
  const m00 = right.x;
  const m01 = up.x;
  const m10 = right.z;
  const m11 = up.z;
  const det = m00 * m11 - m01 * m10;
  if (Math.abs(det) < 1e-6) return { x: focus.x, y: focus.y };
  const dx = (sx * m11 - sy * m01) / det;
  const dz = (sy * m00 - sx * m10) / det;
  return { x: focus.x + dx, y: focus.y + dz };
}

/** One wheel notch is about 12%. */
export function zoomAfterWheel(
  world: HectareWorld,
  aspect: number,
  zoom: number,
  deltaY: number,
  yawDeg = world.camera.yawDeg,
): number {
  return clampZoom(world, aspect, zoom * Math.exp(-deltaY * 0.0015), yawDeg);
}

/**
 * Where the focus has to go so the ground under the cursor stays under the
 * cursor while the frame changes height.
 */
export function focusForAnchoredZoom(focus: Vec2, cursor: Vec2, viewBeforeFt: number, viewAfterFt: number): Vec2 {
  if (viewBeforeFt <= 0 || viewAfterFt <= 0) return { x: focus.x, y: focus.y };
  const ratio = viewAfterFt / viewBeforeFt;
  return { x: cursor.x - (cursor.x - focus.x) * ratio, y: cursor.y - (cursor.y - focus.y) * ratio };
}

/**
 * How far the frame may move to follow him: it stops at the parcel's own edges
 * rather than showing the void beyond them.
 */
export function clampFocus(world: HectareWorld, focus: Vec2, viewFt: number, aspect: number, yawDeg: number): Vec2 {
  const { right, up } = cameraBasis(world.camera.pitchDeg, yawDeg);
  const halfWidth = (viewFt * aspect) / 2;
  const halfHeight = viewFt / 2;
  // Half-extents of the visible ground, from the frame's own size.
  const alongX = (Math.abs(right.x) * halfWidth + Math.abs(up.x) * halfHeight) * 0.9;
  const alongZ = (Math.abs(right.z) * halfWidth + Math.abs(up.z) * halfHeight) * 0.9;
  const side = world.parcel.widthFt;
  return {
    x: Math.min(Math.max(focus.x, Math.min(alongX, side / 2)), Math.max(side - alongX, side / 2)),
    y: Math.min(Math.max(focus.y, Math.min(alongZ, side / 2)), Math.max(side - alongZ, side / 2)),
  };
}

export function easeFocus(current: Vec2, goal: Vec2, dt: number, rate: number): Vec2 {
  const k = 1 - Math.exp(-rate * dt);
  return { x: current.x + (goal.x - current.x) * k, y: current.y + (goal.y - current.y) * k };
}

/* ------------------------------ follow camera ---------------------------- */

export interface FollowPose {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
}

/** A heading in radians (0 = +z) as the unit vector he walks along. */
export function headingVector(headingRad: number): THREE.Vector3 {
  return new THREE.Vector3(Math.sin(headingRad), 0, Math.cos(headingRad));
}

export function followPose(
  world: HectareWorld,
  target: Vec2,
  headingRad: number,
  distanceFt = world.camera.follow.distanceFt,
): FollowPose {
  const follow = world.camera.follow;
  const distance = Math.min(Math.max(distanceFt, follow.minDistanceFt), follow.maxDistanceFt);
  const pitch = (follow.pitchDeg * Math.PI) / 180;
  const forward = headingVector(headingRad);

  const lookAt = new THREE.Vector3(
    target.x + forward.x * follow.lookAheadFt,
    follow.lookHeightFt,
    target.y + forward.z * follow.lookAheadFt,
  );
  // Behind him, at the pitch, and never lower than the data's height: a shallow
  // pitch would otherwise put the camera in the dirt.
  const position = new THREE.Vector3(
    target.x - forward.x * distance * Math.cos(pitch),
    Math.max(distance * Math.sin(pitch), follow.heightFt),
    target.y - forward.z * distance * Math.cos(pitch),
  );
  return { position, lookAt };
}

export function createFollowCamera(world: HectareWorld): {
  camera: THREE.PerspectiveCamera;
  update(target: Vec2, headingRad: number, aspect: number, distanceFt: number): void;
} {
  const camera = new THREE.PerspectiveCamera(world.camera.follow.fovDeg, 1, 0.5, 3000);
  const update = (target: Vec2, headingRad: number, aspect: number, distanceFt: number): void => {
    const pose = followPose(world, target, headingRad, distanceFt);
    camera.position.copy(pose.position);
    camera.lookAt(pose.lookAt);
    camera.aspect = Math.max(aspect, 0.0001);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };
  return { camera, update };
}
