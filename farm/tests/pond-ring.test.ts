import { describe, expect, test } from "vitest";

import { findRoute } from "../src/sim/astar";
import { WORLD, zoneByKey } from "../src/sim/canon";
import { isBlocked } from "../src/sim/collision";
import { pondRingRadius } from "../src/sim/paths";
import type { Vec2, Zone } from "../src/sim/types";
import { cellOf, floodFill, isWalkable } from "../src/sim/walkable";
import { centreOf, distance, GRID, NETWORK, walkPoints } from "./support/worlds";

/*  The pond ring: a closed walkable loop around the water, outside the stone
    rim and clear of every zone. All expected values come from the pond and
    the ring configuration; none are literals. */

const RING = NETWORK.ring;
const POND = zoneByKey(WORLD, "pond") as Zone;
const CIRCLE = POND.circle as { cx: number; cy: number; radiusFt: number };
const KEEP_OUT = CIRCLE.radiusFt + WORLD.pond.rimOuterFt + WORLD.pondRing.gapFt;

const ringNodes = (): Vec2[] =>
  (RING?.nodeIds ?? []).map((id) => {
    const node = NETWORK.nodes.find((entry) => entry.id === id);
    if (!node) throw new Error(`missing ring node ${id}`);
    return { x: node.x, y: node.y };
  });

const ringNode = (index: number): Vec2 => {
  const id = RING?.nodeIds[index] ?? "";
  const node = NETWORK.nodes.find((entry) => entry.id === id);
  if (!node) throw new Error(`missing ring node ${id}`);
  return { x: node.x, y: node.y };
};

describe("the ring sits in the gap it was given", () => {
  test("the radius is pond + rim + gap + half width", () => {
    expect(RING).not.toBeNull();
    expect(RING?.radiusFt).toBeCloseTo(
      CIRCLE.radiusFt + WORLD.pond.rimOuterFt + WORLD.pondRing.gapFt + WORLD.pondRing.widthFt / 2,
      3,
    );
    expect(pondRingRadius(WORLD)).toBeCloseTo(RING?.radiusFt ?? 0, 6);
  });

  test("every node clears the keep-out and stays inside the parcel", () => {
    for (const node of ringNodes()) {
      expect(distance(node, { x: CIRCLE.cx, y: CIRCLE.cy })).toBeGreaterThanOrEqual(KEEP_OUT - 1e-6);
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(WORLD.parcel.widthFt);
      expect(node.y).toBeLessThanOrEqual(WORLD.parcel.depthFt);
    }
  });

  test("the ring clears every zone", () => {
    const half = WORLD.pondRing.widthFt / 2;
    const samples = NETWORK.edges
      .filter((edge) => edge.kind === "ring")
      .flatMap((edge) => edge.points);
    for (const zone of WORLD.zones) {
      if (zone.circle) continue;
      for (const point of samples) {
        const nx = Math.min(Math.max(point.x, zone.box.x), zone.box.x + zone.box.widthFt);
        const ny = Math.min(Math.max(point.y, zone.box.y), zone.box.y + zone.box.depthFt);
        expect(Math.hypot(point.x - nx, point.y - ny), `ring vs ${zone.key}`).toBeGreaterThan(half);
      }
    }
  });

  test("the grid keeps the water out and the ring in", () => {
    for (const node of ringNodes()) {
      const cell = cellOf(GRID, node);
      expect(cell).not.toBeNull();
      if (!cell) continue;
      expect(GRID.cells[cell.row * GRID.cols + cell.col], "ring node cell").toBe(1);
    }
    const water = cellOf(GRID, { x: CIRCLE.cx, y: CIRCLE.cy });
    if (water) expect(GRID.cells[water.row * GRID.cols + water.col]).toBe(0);
  });
});

describe("the water still blocks", () => {
  test("walking straight into the pond is refused", () => {
    expect(isBlocked(WORLD, { x: CIRCLE.cx, y: CIRCLE.cy })).toBe(true);
    let blocked = 0;
    for (let inward = 0; inward < CIRCLE.radiusFt; inward += 0.5) {
      const point = { x: CIRCLE.cx, y: CIRCLE.cy + (RING?.radiusFt ?? 0) - inward };
      if (inward < WORLD.pondRing.widthFt / 2 - WORLD.player.radiusFt) continue;
      if (!isWalkable(WORLD, point, NETWORK)) blocked += 1;
    }
    expect(blocked).toBeGreaterThan(10);
  });

  test("the rim stones are not walkable", () => {
    for (let i = 0; i < 24; i += 1) {
      const angle = (i / 24) * Math.PI * 2;
      const rimRadius = CIRCLE.radiusFt + WORLD.pond.rimOuterFt / 2;
      const point = {
        x: CIRCLE.cx + Math.cos(angle) * rimRadius,
        y: CIRCLE.cy + Math.sin(angle) * rimRadius,
      };
      expect(isWalkable(WORLD, point, NETWORK), `rim at ${i}`).toBe(false);
    }
  });
});

describe("walking the ring", () => {
  test("the gate reaches the far side without approaching the water", () => {
    const far = ringNode(24);
    const route = findRoute(GRID, WORLD.player.spawn, far);
    expect(route).not.toBeNull();
    for (const point of route?.points ?? []) {
      expect(distance(point, { x: CIRCLE.cx, y: CIRCLE.cy })).toBeGreaterThanOrEqual(KEEP_OUT - 1e-6);
    }
  });

  test("a full lap closes without getting stuck", () => {
    const segments = RING?.nodeIds.length ?? 0;
    const quarter = Math.round(segments / 4);
    let position = ringNode(0);
    const start = { ...position };

    for (const index of [quarter, quarter * 2, quarter * 3, 0]) {
      const target = ringNode(index);
      const points = [position, target];
      const walk = walkPoints(position, points, 120);
      expect(walk.ok, `lap leg to node ${index}`).toBe(true);
      expect(walk.stalled).toBe(false);
      position = walk.position;
    }
    expect(distance(position, start), "back where the lap began").toBeLessThan(2.5);
  });

  test("the flood fill reaches the whole ring and the orchard through it", () => {
    const reached = floodFill(GRID, WORLD.player.spawn);
    for (const node of ringNodes()) {
      const cell = cellOf(GRID, node);
      if (!cell) continue;
      expect(reached.has(cell.row * GRID.cols + cell.col), "ring node reached").toBe(true);
    }
    const orchardCell = cellOf(GRID, centreOf(zoneByKey(WORLD, "orchard") as Zone));
    expect(orchardCell).not.toBeNull();
    if (orchardCell) {
      expect(reached.has(orchardCell.row * GRID.cols + orchardCell.col), "orchard reached").toBe(true);
    }
  });
});
