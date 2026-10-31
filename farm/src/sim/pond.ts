import { createRng } from "./rng";
import type { Circle, World } from "./types";

/*  The pond's decorations: a stone rim and lily pads.
    Decorative only — the collision circle is canon and never moves. */

export interface PondConfig {
  seed: number;
  rimInnerFt: number;
  rimOuterFt: number;
  stoneCount: number;
  lilyPadCount: number;
  stoneSizeFt: [number, number];
}

export interface PondStone {
  x: number;
  y: number;
  radiusFt: number;
  rotationRad: number;
  shade: number;
}

export interface LilyPad {
  x: number;
  y: number;
  radiusFt: number;
  rotationRad: number;
}

export function pondCircle(world: World): Circle {
  const pond = world.zones.find((zone) => zone.circle);
  if (!pond?.circle) throw new Error("the world has no circular pond");
  return pond.circle;
}

export function buildPondStones(world: World, config: PondConfig): PondStone[] {
  const circle = pondCircle(world);
  const rng = createRng(config.seed);
  const stones: PondStone[] = [];

  for (let i = 0; i < config.stoneCount; i += 1) {
    const angle = (i / config.stoneCount) * Math.PI * 2 + rng.range(-0.02, 0.02);
    const radius = circle.radiusFt + rng.range(config.rimInnerFt, config.rimOuterFt);
    stones.push({
      x: circle.cx + Math.cos(angle) * radius,
      y: circle.cy + Math.sin(angle) * radius,
      radiusFt: rng.range(config.stoneSizeFt[0], config.stoneSizeFt[1]),
      rotationRad: rng.range(0, Math.PI * 2),
      shade: rng.range(0.75, 1.1),
    });
  }
  return stones;
}

export function buildLilyPads(world: World, config: PondConfig): LilyPad[] {
  const circle = pondCircle(world);
  const rng = createRng(config.seed + 1);
  const pads: LilyPad[] = [];
  for (let i = 0; i < config.lilyPadCount; i += 1) {
    const angle = rng.range(0, Math.PI * 2);
    const radius = rng.range(circle.radiusFt * 0.25, circle.radiusFt * 0.72);
    pads.push({
      x: circle.cx + Math.cos(angle) * radius,
      y: circle.cy + Math.sin(angle) * radius,
      radiusFt: rng.range(1.4, 2.6),
      rotationRad: rng.range(0, Math.PI * 2),
    });
  }
  return pads;
}
