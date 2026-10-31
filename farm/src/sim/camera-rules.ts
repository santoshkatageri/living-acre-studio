import type { Parcel, Vec2 } from "./types";

/*  Camera rules, pure: how much ground is on screen, and where the camera
    looks. An orthographic isometric view; zoom 1 is the whole acre. */

interface CameraWorld {
  parcel: Parcel;
  camera: { maxZoom: number; overviewMargin: number };
}

/** Ground height (ft) that fills the viewport at zoom 1. */
export function fitHeightFt(world: CameraWorld, aspect: number): number {
  const margin = world.camera.overviewMargin;
  return Math.max(world.parcel.depthFt, world.parcel.widthFt / Math.max(aspect, 0.1)) * margin;
}

export function viewHeightFt(world: CameraWorld, aspect: number, zoom: number): number {
  return fitHeightFt(world, aspect) / Math.max(zoom, 1e-3);
}

export function overviewZoom(world: CameraWorld, aspect: number): number {
  void world;
  void aspect;
  return 1;
}

export function minZoom(world: CameraWorld, aspect: number): number {
  return overviewZoom(world, aspect);
}

export function clampZoom(world: CameraWorld, aspect: number, zoom: number): number {
  return Math.min(Math.max(zoom, minZoom(world, aspect)), world.camera.maxZoom);
}

/** Wheel up (negative deltaY) zooms in. One notch is about 12%. */
export function wheelZoom(zoom: number, deltaY: number, world: CameraWorld, aspect: number): number {
  const next = zoom * Math.exp(-deltaY * 0.0015);
  return clampZoom(world, aspect, next);
}

/** Look at the farmer, but never so far that the acre leaves the frame. */
export function focusOn(parcel: Parcel, position: Vec2): Vec2 {
  const margin = 12;
  return {
    x: Math.min(Math.max(position.x, margin), parcel.widthFt - margin),
    y: Math.min(Math.max(position.y, margin), parcel.depthFt - margin),
  };
}

export function easeTowards(current: Vec2, goal: Vec2, dt: number, rate: number): Vec2 {
  const k = 1 - Math.exp(-rate * dt);
  return { x: current.x + (goal.x - current.x) * k, y: current.y + (goal.y - current.y) * k };
}
