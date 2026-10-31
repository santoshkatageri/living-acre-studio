import { createRng } from "./rng";
import type { Vec2, World, Zone } from "./types";

/*  The orchard's trees: a seeded grid, laid out inside the canon orchard box.

    Deterministic — the seed in sim_overrides.orchard_look fixes every
    position, height and canopy size — and conservative: the jitter is clipped
    so a canopy can never cross the orchard's edge. Nothing here draws. */

export interface OrchardTree {
  /** Trunk centre, in parcel feet. */
  x: number;
  y: number;
  heightFt: number;
  canopyFt: number;
  /** 0..1, for the per-instance tint: 0 is the darker leaf, 1 the lighter. */
  tintMix: number;
  rotationRad: number;
  /** Grid slot, so tests can talk about a tree without relying on order. */
  col: number;
  row: number;
}

function orchardZone(world: World): Zone {
  const zone = world.zones.find((entry) => entry.look === "canopy");
  if (!zone) throw new Error("orchard: the world has no canopy zone");
  return zone;
}

export function orchardTrees(world: World): OrchardTree[] {
  const config = world.orchard;
  const zone = orchardZone(world);
  const box = zone.box;

  const cols = Math.max(1, Math.round(config.cols));
  const rows = Math.max(1, Math.round(config.rows));
  const margin = Math.max(0, config.marginFt);
  const usableWidth = box.widthFt - margin * 2;
  const usableDepth = box.depthFt - margin * 2;
  if (usableWidth <= 0 || usableDepth <= 0) {
    throw new Error("orchard: margin_ft leaves no room for trees inside the orchard box");
  }

  const rng = createRng(config.seed);
  const trees: OrchardTree[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const canopyFt = rng.range(config.canopyFt[0], config.canopyFt[1]);
      const heightFt = rng.range(config.heightFt[0], config.heightFt[1]);

      // Staggered rows: every other row is offset by half a cell.
      const stagger = row % 2 === 0 ? 0 : 0.5;
      const cellX = (col + 0.5 + stagger) / (cols + stagger);
      const cellY = (row + 0.5) / rows;

      const jitterX = rng.range(-config.jitterFt, config.jitterFt);
      const jitterY = rng.range(-config.jitterFt, config.jitterFt);

      // Keep the trunk far enough from the box edge that the canopy stays in.
      const inset = canopyFt * 0.55;
      const x = clamp(
        box.x + margin + cellX * usableWidth + jitterX,
        box.x + inset,
        box.x + box.widthFt - inset,
      );
      const y = clamp(
        box.y + margin + cellY * usableDepth + jitterY,
        box.y + inset,
        box.y + box.depthFt - inset,
      );

      trees.push({
        x: round3(x),
        y: round3(y),
        heightFt: round3(heightFt),
        canopyFt: round3(canopyFt),
        tintMix: round3(rng.next()),
        rotationRad: round3(rng.range(0, Math.PI * 2)),
        col,
        row,
      });
    }
  }

  return trees;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Trunk foot and canopy centre for one tree, in parcel feet. */
export function treePoints(tree: OrchardTree): { foot: Vec2; canopy: Vec2; canopyCentreY: number } {
  return {
    foot: { x: tree.x, y: tree.y },
    canopy: { x: tree.x, y: tree.y },
    canopyCentreY: tree.heightFt + tree.canopyFt * 0.6,
  };
}
