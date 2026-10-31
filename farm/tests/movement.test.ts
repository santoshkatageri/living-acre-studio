import { describe, expect, test } from "vitest";

import { WORLD, zoneByKey } from "../src/sim/canon";
import { isBlocked, moveWithCollision } from "../src/sim/collision";
import type { Vec2, World, Zone } from "../src/sim/types";
import { cellsInZone, floodFill, isWalkable, pointInFreeZone } from "../src/sim/walkable";
import { centreOf, GRID, NETWORK, ROAM } from "./support/worlds";

/*  M3's movement rule: in "paths_only" mode the farmer may stand in the free
    zones or on the path corridors, and nowhere else. Zone names live here, in
    the test, on purpose — never in src/sim/collision.ts. */

describe("off-path ground is blocked", () => {
  const offPath: { label: string; point: Vec2 }[] = [
    { label: "open field between the beds and the pond", point: { x: 120, y: 165 } },
    { label: "open ground north of the goshala", point: { x: 80, y: 6 } },
    { label: "the yard west of the beds", point: { x: 18, y: 100 } },
    { label: "open ground between the beds and the orchard", point: { x: 115, y: 85 } },
    { label: "the strip east of the orchard", point: { x: 200, y: 120 } },
    { label: "open ground west of the gate track", point: { x: 6, y: 155 } },
  ];

  for (const item of offPath) {
    test(`${item.label} is not walkable`, () => {
      expect(pointInFreeZone(WORLD, item.point)).toBeNull();
      expect(isWalkable(WORLD, item.point, NETWORK)).toBe(false);
      expect(isBlocked(WORLD, item.point)).toBe(true);
    });
  }

  test("mode free still allows that same ground, so the rule is the data", () => {
    expect(isWalkable(ROAM, { x: 120, y: 165 }, null)).toBe(true);
    expect(isBlocked(ROAM, { x: 120, y: 165 })).toBe(false);
    expect(isBlocked(ROAM, centreOf(zoneByKey(WORLD, "farmhouse") as Zone))).toBe(true);
    expect(isBlocked(ROAM, centreOf(zoneByKey(WORLD, "pond") as Zone))).toBe(true);
  });
});

describe("the free zones are walkable", () => {
  for (const key of WORLD.movement.freeZones) {
    test(`${key} centre is walkable and free`, () => {
      const zone = zoneByKey(WORLD, key) as Zone;
      const centre = centreOf(zone);
      expect(isWalkable(WORLD, centre, NETWORK)).toBe(true);
      expect(pointInFreeZone(WORLD, centre)?.key).toBe(key);
    });
  }

  test("a zone outside the free list is not a free zone", () => {
    for (const zone of WORLD.zones) {
      if (WORLD.movement.freeZones.includes(zone.key)) continue;
      expect(pointInFreeZone(WORLD, centreOf(zone)), `${zone.key}`).toBeNull();
    }
  });
});

describe("corridors never enter a solid zone", () => {
  test("no walkable cell centre lies inside the farmhouse or the pond", () => {
    const walkable = (index: number) => GRID.cells[index] === 1;
    expect(cellsInZone(GRID, zoneByKey(WORLD, "farmhouse") as Zone).filter(walkable)).toHaveLength(0);
    expect(cellsInZone(GRID, zoneByKey(WORLD, "pond") as Zone).filter(walkable)).toHaveLength(0);
  });

  test("the grid is conservative: every walkable cell passes the rule", () => {
    let checked = 0;
    for (let index = 0; index < GRID.cells.length; index += 1) {
      if (GRID.cells[index] !== 1) continue;
      checked += 1;
      if (checked % 97 !== 0) continue;
      const col = index % GRID.cols;
      const row = Math.floor(index / GRID.cols);
      expect(isWalkable(WORLD, { x: col + 0.5, y: row + 0.5 }, NETWORK), `cell ${index}`).toBe(true);
    }
    expect(checked).toBeGreaterThan(5000);
  });

  test("a flood fill from the spawn reaches into every free zone", () => {
    const reached = floodFill(GRID, WORLD.player.spawn);
    for (const key of WORLD.movement.freeZones) {
      const zone = zoneByKey(WORLD, key) as Zone;
      const cells = cellsInZone(GRID, zone).filter((index) => GRID.cells[index] === 1);
      expect(cells.length, `${key} walkable cells`).toBeGreaterThan(0);
      expect(cells.every((index) => reached.has(index)), `${key} fully reached`).toBe(true);
    }
  });
});

describe("movement slides instead of sticking", () => {
  const beds = zoneByKey(WORLD, "vegetable_beds") as Zone;

  test("pushing diagonally along a 5 ft corridor keeps moving", () => {
    const start = centreOf(beds);
    const next = moveWithCollision(WORLD, start, { x: 3, y: 3 });
    expect(isWalkable(WORLD, next, NETWORK)).toBe(true);
    expect(Math.hypot(next.x - start.x, next.y - start.y)).toBeGreaterThan(0);
  });

  test("pushing straight off the beds' west edge is refused", () => {
    const start = { x: beds.box.x + 1, y: beds.box.y + beds.box.depthFt / 2 };
    expect(isWalkable(WORLD, start, NETWORK)).toBe(true);
    const next = moveWithCollision(WORLD, start, { x: -4, y: 0 });
    expect(isWalkable(WORLD, next, NETWORK)).toBe(true);
    expect(next.x).toBeGreaterThanOrEqual(start.x - 1e-6);
  });

  test("a long push down a corridor never leaves the walkable set", () => {
    let position: Vec2 = { ...WORLD.player.spawn };
    for (let i = 0; i < 400; i += 1) {
      const next = moveWithCollision(WORLD, position, { x: 0.8, y: -1.2 });
      expect(isWalkable(WORLD, next, NETWORK)).toBe(true);
      if (Math.hypot(next.x - position.x, next.y - position.y) < 1e-9) break;
      position = next;
    }
    expect(position).not.toEqual(WORLD.player.spawn);
  });

  test("free mode still moves on open ground", () => {
    const world: World = ROAM;
    const next = moveWithCollision(world, { x: 100, y: 120 }, { x: 2, y: 0 });
    expect(next.x).toBeGreaterThan(100);
  });
});
