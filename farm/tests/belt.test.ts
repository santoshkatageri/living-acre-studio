import { describe, expect, test } from "vitest";

import { bufferBelt, type Belt } from "../src/sim/belt";
import { WORLD, networkFor } from "../src/sim/canon";
import type { PathEdge, PathNetwork } from "../src/sim/paths";
import type { ParcelSide, Vec2, World, Zone } from "../src/sim/types";

/*  The decorative tree belt.

    Rules under test, straight from the brief: seeded and deterministic, two
    staggered rows inside a per-side band, every tree inside the parcel and
    clear of the paths, the zones, the pond keep-out, the pond ring and the gate
    aperture, a stated count range, and sensitivity to both the seed and the
    belt width. The trees are decoration: no collision here, and the last
    describe block shows the clearance test has teeth. */

const NETWORK: PathNetwork = networkFor(WORLD);
const BELT: Belt = bufferBelt(WORLD, NETWORK);
const SIDES: ParcelSide[] = ["west", "north", "east", "south"];

const POND = WORLD.zones.find((zone) => zone.circle) as Zone;
const GATE = WORLD.zones.find((zone) => zone.key === "gate") as Zone;
const KEEP_OUT = (POND.circle?.radiusFt ?? 0) + WORLD.pond.rimOuterFt + WORLD.pondRing.gapFt;
const RING_REACH = (POND.circle?.radiusFt ?? 0) + WORLD.pond.rimOuterFt + WORLD.pondRing.gapFt + WORLD.pondRing.widthFt;

function segmentDistance(point: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

/** Every tree must be clear of every leg of every path, walk included. */
function corridorViolations(world: World, belt: Belt, edges: PathEdge[]): string[] {
  const out: string[] = [];
  for (const tree of belt.trees) {
    for (const edge of edges) {
      const clear = edge.widthFt / 2 + world.buffer.pathClearanceFt;
      for (let i = 1; i < edge.points.length; i += 1) {
        const from = edge.points[i - 1] as Vec2;
        const to = edge.points[i] as Vec2;
        const d = segmentDistance(tree, from, to);
        if (d < clear) out.push(`${tree.side}#${belt.trees.indexOf(tree)} inside ${edge.id} (${d.toFixed(2)} < ${clear.toFixed(2)})`);
      }
    }
  }
  return out;
}

describe("the belt is seeded and deterministic", () => {
  test("the same world builds the same trees, twice", () => {
    const again = bufferBelt(WORLD, NETWORK);
    expect(again.trees).toEqual(BELT.trees);
    expect(again.count).toBe(BELT.count);
    expect(again.species).toEqual(BELT.species);
  });

  test("the seed and the belt width both change the planting", () => {
    const reseeded = bufferBelt({ ...WORLD, buffer: { ...WORLD.buffer, seed: WORLD.buffer.seed + 1 } }, NETWORK);
    expect(reseeded.count).toBeGreaterThan(0);
    const key = (tree: { x: number; y: number }): string => `${tree.x.toFixed(2)},${tree.y.toFixed(2)}`;
    const before = new Set(BELT.trees.map(key));
    const moved = reseeded.trees.filter((tree) => !before.has(key(tree)));
    expect(moved.length).toBeGreaterThan(reseeded.count / 2);

    // Belt width is data too: narrowing the east band pulls every east tree in
    // with it, and changes where they fall (the jitter is clipped per band).
    const narrow = bufferBelt(
      { ...WORLD, buffer: { ...WORLD.buffer, widthFt: { ...WORLD.buffer.widthFt, east: 3 } } },
      NETWORK,
    );
    const eastTrees = narrow.trees.filter((tree) => tree.side === "east");
    expect(eastTrees.length).toBeGreaterThan(0);
    for (const tree of eastTrees) {
      expect(tree.x).toBeGreaterThanOrEqual(WORLD.parcel.widthFt - 3);
    }
    expect(narrow.innerEdgeFt.east).toBe(WORLD.parcel.widthFt - 3);
  });
});

describe("every tree is inside its band, inside the parcel, and out of the way", () => {
  test("the count is the stated range and every side has trees", () => {
    expect(BELT.count).toBeGreaterThanOrEqual(120);
    expect(BELT.count).toBeLessThanOrEqual(170);
    expect(BELT.count).toBe(BELT.trees.length);
    for (const side of SIDES) {
      expect(BELT.trees.filter((tree) => tree.side === side).length, side).toBeGreaterThan(0);
    }
    // The weight-3 species is the common one, by a wide margin.
    const round = BELT.species.round_canopy ?? 0;
    const tall = BELT.species.tall_slender ?? 0;
    expect(round).toBeGreaterThan(tall * 2);
  });

  test("no tree leaves its band or the parcel", () => {
    const { widthFt } = WORLD.parcel;
    const { depthFt } = WORLD.parcel;
    for (const tree of BELT.trees) {
      expect(tree.x).toBeGreaterThanOrEqual(0);
      expect(tree.x).toBeLessThanOrEqual(widthFt);
      expect(tree.y).toBeGreaterThanOrEqual(0);
      expect(tree.y).toBeLessThanOrEqual(depthFt);
      switch (tree.side) {
        case "west":
          expect(tree.x).toBeLessThanOrEqual(WORLD.buffer.widthFt.west);
          break;
        case "north":
          expect(tree.y).toBeLessThanOrEqual(WORLD.buffer.widthFt.north);
          break;
        case "east":
          expect(tree.x).toBeGreaterThanOrEqual(widthFt - WORLD.buffer.widthFt.east);
          break;
        default:
          expect(tree.y).toBeGreaterThanOrEqual(depthFt - WORLD.buffer.widthFt.south);
          break;
      }
      // Rows are inside the band, so the innermost tree is never at the edge.
      expect(tree.row).toBeGreaterThanOrEqual(0);
      expect(tree.row).toBeLessThan(WORLD.buffer.rows);
    }
    expect(BELT.innerEdgeFt).toEqual({
      west: WORLD.buffer.widthFt.west,
      north: WORLD.buffer.widthFt.north,
      east: WORLD.parcel.widthFt - WORLD.buffer.widthFt.east,
      south: WORLD.parcel.depthFt - WORLD.buffer.widthFt.south,
    });
  });

  test("no tree crowds a path corridor", () => {
    expect(corridorViolations(WORLD, BELT, NETWORK.edges)).toEqual([]);
  });

  test("no tree stands in a zone, the pond, the keep-out or the ring", () => {
    for (const tree of BELT.trees) {
      for (const zone of WORLD.zones) {
        if (zone.circle) {
          const d = Math.hypot(tree.x - zone.circle.cx, tree.y - zone.circle.cy);
          expect(d, `${zone.key}`).toBeGreaterThanOrEqual(zone.circle.radiusFt + WORLD.buffer.zoneClearanceFt);
          expect(d, `${zone.key} ring`).toBeGreaterThanOrEqual(RING_REACH);
          expect(d, `${zone.key} keep-out`).toBeGreaterThanOrEqual(KEEP_OUT);
        } else {
          const inside =
            tree.x > zone.box.x - WORLD.buffer.zoneClearanceFt &&
            tree.x < zone.box.x + zone.box.widthFt + WORLD.buffer.zoneClearanceFt &&
            tree.y > zone.box.y - WORLD.buffer.zoneClearanceFt &&
            tree.y < zone.box.y + zone.box.depthFt + WORLD.buffer.zoneClearanceFt;
          expect(inside, `${tree.side} tree inside ${zone.key}`).toBe(false);
        }
      }
    }
  });

  test("the gate aperture stays open", () => {
    const gatePoint = { x: GATE.box.x + GATE.box.widthFt / 2, y: GATE.box.y + GATE.box.depthFt / 2 };
    const apertureEnd = { x: gatePoint.x, y: BELT.innerEdgeFt.south };
    for (const tree of BELT.trees) {
      const d = segmentDistance(tree, gatePoint, apertureEnd);
      expect(d, `${tree.side} tree in the gate gap`).toBeGreaterThan(WORLD.buffer.gateGapFt / 2);
    }
  });

  test("heights respect the canopy limit, so the farmer and labels stay visible", () => {
    for (const tree of BELT.trees) {
      expect(tree.heightFt).toBeLessThanOrEqual(WORLD.buffer.canopyTopLimitFt);
      expect(tree.heightFt).toBeGreaterThan(0);
      expect(tree.canopyFt).toBeGreaterThan(0);
      expect(tree.tintMix).toBeGreaterThanOrEqual(0);
      expect(tree.tintMix).toBeLessThanOrEqual(1);
    }
  });

  test("every dropped candidate is accounted for", () => {
    const dropped = BELT.dropped.reduce((sum, entry) => sum + entry.count, 0);
    expect(BELT.candidates).toBeGreaterThan(BELT.count);
    expect(BELT.count + dropped).toBe(BELT.candidates);
  });
});

describe("the clearance rule has teeth", () => {
  test("a zone put inside the belt is kept clear, and the same check fails without the clearance", () => {
    // A probe stall dropped straight into the west band, then reverted: the
    // belt has to drop the trees that would stand in it.
    const probe: Zone = {
      ...(WORLD.zones[0] as Zone),
      key: "probe_stall",
      name: "probe",
      box: { x: 0, y: 90, widthFt: 26, depthFt: 20 },
      circle: null,
      solid: true,
    };
    const withProbe: World = { ...WORLD, zones: [...WORLD.zones, probe] };
    const guarded = bufferBelt(withProbe, NETWORK);

    const insideProbe = (belt: Belt): number =>
      belt.trees.filter(
        (tree) =>
          tree.x > probe.box.x - WORLD.buffer.zoneClearanceFt &&
          tree.x < probe.box.x + probe.box.widthFt + WORLD.buffer.zoneClearanceFt &&
          tree.y > probe.box.y - WORLD.buffer.zoneClearanceFt &&
          tree.y < probe.box.y + probe.box.depthFt + WORLD.buffer.zoneClearanceFt,
      ).length;

    expect(insideProbe(guarded)).toBe(0);
    expect(guarded.dropped.some((entry) => entry.reason === "zone footprint (probe_stall)")).toBe(true);
    // Without the zone test in `fits` the same belt plants trees in the stall,
    // which is the failure this test exists to catch. (Reverted afterwards.)
    expect(guarded.count).toBeLessThan(BELT.count + 4);

    const unguarded = bufferBelt({ ...withProbe, buffer: { ...WORLD.buffer, zoneClearanceFt: -40 } }, NETWORK);
    expect(insideProbe(unguarded)).toBeGreaterThan(0);
  });
});
