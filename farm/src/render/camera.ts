import * as THREE from "three";

import { viewHeightFt } from "../sim/camera-rules";
import type { Vec2, World } from "../sim/types";

/*  A fixed isometric camera: pitch and yaw are data, zoom only moves the
    frustum. Canon +y (south) maps to three.js +z. */

const DISTANCE = 600;

export function createIsometricCamera(world: World, aspect: number): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
  applyAspect(camera, world, aspect);
  camera.position.set(0, DISTANCE, 0);
  camera.lookAt(0, 0, 0);
  return camera;
}

export function viewCentre(world: World): Vec2 {
  return { x: world.parcel.widthFt / 2, y: world.parcel.depthFt / 2 };
}

export function applyAspect(camera: THREE.OrthographicCamera, world: World, aspect: number): void {
  const height = viewHeightFt(world, aspect, 1);
  const width = height * aspect;
  camera.left = -width / 2;
  camera.right = width / 2;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.updateProjectionMatrix();
}

/** Zoom 1 = the whole acre; larger is closer. */
export function applyZoom(camera: THREE.OrthographicCamera, world: World, aspect: number, zoom: number): void {
  const height = viewHeightFt(world, aspect, zoom);
  const width = height * aspect;
  camera.left = -width / 2;
  camera.right = width / 2;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.updateProjectionMatrix();
}

export function focusCamera(camera: THREE.OrthographicCamera, world: World, focus: Vec2): void {
  const pitch = (world.camera.pitchDeg * Math.PI) / 180;
  const yaw = (world.camera.yawDeg * Math.PI) / 180;
  const dir = new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  );
  camera.position.set(focus.x + dir.x * DISTANCE, dir.y * DISTANCE, focus.y + dir.z * DISTANCE);
  camera.lookAt(focus.x, 0, focus.y);
}
