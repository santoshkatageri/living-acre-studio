import { describe, expect, test } from "vitest";

import { WORLD, zoneByKey } from "../src/sim/canon";
import { orchardTrees } from "../src/sim/orchard";
import type { Vec2, World, Zone } from "../src/sim/types";

/*  The orchard's tree grid: seeded, deterministic, and never outside the
    canon orchard box. No Three.js here — this is the layout, not the drawing. */

const orchard = zoneByKey(WORLD, "orchard") as Zone;

function withOrchard(patch: Partial<World["orchard"]>): World {
  return { ...WORLD, orchard: { ...WORLD.orchard, ...patch } };
}

const inside = (point: Vec2, zone: Zone): boolean =>
  point.x >= zone.box.x &&
  point.x <= zone.box.x + zone.box.widthFt &&
  point.y >= zone.box.y &&
  point.y <= zone.box.y + zone.box.depthFt;

describe("the orchard grid", () => {
  test("the same seed gives the same trees, twice", () => {
    const first = orchardTrees(WORLD);
    const second = orchardTrees(WORLD);
    expect(second).toEqual(first);
    // A fresh world object with the same data is the same orchard too.
    expect(orchardTrees({ ...WORLD })).toEqual(first);
  });

  test("a different seed moves the trees", () => {
    const base = orchardTrees(WORLD);
    const other = orchardTrees(withOrchard({ seed: WORLD.orchard.seed + 1 }));
    expect(other).toHaveLength(base.length);
    const moved = other.filter((tree, index) => tree.x !== base[index]?.x || tree.y !== base[index]?.y);
    expect(moved.length).toBeGreaterThan(0);
  });

  test("the count is the seeded grid, and inside the brief's 12 to 20", () => {
    const trees = orchardTrees(WORLD);
    expect(trees).toHaveLength(WORLD.orchard.cols * WORLD.orchard.rows);
    expect(trees.length).toBeGreaterThanOrEqual(12);
    expect(trees.length).toBeLessThanOrEqual(20);
  });

  test("every tree, canopy and all, stays inside the canon orchard box", () => {
    for (const tree of orchardTrees(WORLD)) {
      expect(inside({ x: tree.x, y: tree.y }, orchard), `trunk at ${tree.x},${tree.y}`).toBe(true);
      // The canopy is narrower than the trunk inset, so this is the strict case.
      const radius = tree.canopyFt * 0.55;
      expect(tree.x - radius).toBeGreaterThanOrEqual(orchard.box.x);
      expect(tree.y - radius).toBeGreaterThanOrEqual(orchard.box.y);
      expect(tree.x + radius).toBeLessThanOrEqual(orchard.box.x + orchard.box.widthFt);
      expect(tree.y + radius).toBeLessThanOrEqual(orchard.box.y + orchard.box.depthFt);
    }
  });

  test("no two trees land on top of each other", () => {
    const trees = orchardTrees(WORLD);
    for (let i = 0; i < trees.length; i += 1) {
      for (let j = i + 1; j < trees.length; j += 1) {
        const a = trees[i];
        const b = trees[j];
        if (!a || !b) continue;
        const gap = Math.hypot(a.x - b.x, a.y - b.y);
        expect(gap, `trees ${i} and ${j}`).toBeGreaterThan(Math.min(a.canopyFt, b.canopyFt));
      }
    }
  });

  test("sizes stay inside the configured ranges", () => {
    for (const tree of orchardTrees(WORLD)) {
      expect(tree.heightFt).toBeGreaterThanOrEqual(WORLD.orchard.heightFt[0]);
      expect(tree.heightFt).toBeLessThanOrEqual(WORLD.orchard.heightFt[1]);
      expect(tree.canopyFt).toBeGreaterThanOrEqual(WORLD.orchard.canopyFt[0]);
      expect(tree.canopyFt).toBeLessThanOrEqual(WORLD.orchard.canopyFt[1]);
      expect(tree.tintMix).toBeGreaterThanOrEqual(0);
      expect(tree.tintMix).toBeLessThanOrEqual(1);
    }
  });
});
