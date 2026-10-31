import { describe, expect, test } from "vitest";

import { WORLD, zoneByKey } from "../src/sim/canon";
import { placeAt, zoneAt } from "../src/sim/collision";
import { findRoute, lineWalkable, nearestWalkableCell, planClickMove, routeLength } from "../src/sim/astar";
import { SECTIONS, entranceFor } from "../src/sim/paths";
import type { Zone } from "../src/sim/types";
import { isWalkable } from "../src/sim/walkable";
import { approachTo, centreOf, distance, GRID, NETWORK, walkRoute } from "./support/worlds";

/*  A* on the 1 ft grid, plus the click policy: route when possible, snap
    within 6 ft when close, refuse with a hint when not.

    The brief's ratios: gate -> beds, gate -> goshala and gate -> orchard must
    all be under 1.6x the straight-line distance. */

const SPAWN = WORLD.player.spawn;

describe("a route exists from the gate to every section", () => {
  for (const section of SECTIONS) {
    test(`${section}: plan, then actually walk it`, () => {
      const entrance = entranceFor(NETWORK, section);
      const goal = approachTo({ x: entrance.x, y: entrance.y });
      const route = findRoute(GRID, SPAWN, goal);
      expect(route, `${section} has no route`).not.toBeNull();

      const walk = walkRoute(SPAWN, goal);
      expect(walk.ok, `${section} walk did not arrive`).toBe(true);
      expect(walk.stalled).toBe(false);
      expect(distance(walk.position, goal)).toBeLessThan(2);
    });
  }
});

describe("routes are not allowed to wander", () => {
  const limits: { section: string; ratio: number }[] = [
    { section: "vegetable_beds", ratio: 1.6 },
    { section: "goshala", ratio: 1.6 },
    { section: "orchard", ratio: 1.6 },
  ];

  for (const limit of limits) {
    test(`gate -> ${limit.section} is under ${limit.ratio}x the straight line`, () => {
      const entrance = entranceFor(NETWORK, limit.section);
      const goal = approachTo({ x: entrance.x, y: entrance.y });
      const route = findRoute(GRID, SPAWN, goal);
      expect(route).not.toBeNull();
      const straight = distance(SPAWN, { x: entrance.x, y: entrance.y });
      const length = routeLength(route as NonNullable<typeof route>);
      expect(length).toBeLessThan(straight * limit.ratio);
      // And the walk really covers that distance rather than cutting a corner.
      expect(length).toBeGreaterThan(straight * 0.9);
    });
  }

  test("a route never leaves the walkable set", () => {
    const goal = approachTo({ x: entranceFor(NETWORK, "orchard").x, y: entranceFor(NETWORK, "orchard").y });
    const route = findRoute(GRID, SPAWN, goal);
    const points = route?.points ?? [];
    expect(points.length).toBeGreaterThan(1);
    for (const point of points) {
      expect(isWalkable(WORLD, point, NETWORK), JSON.stringify(point)).toBe(true);
    }
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1] as { x: number; y: number };
      const b = points[i] as { x: number; y: number };
      expect(lineWalkable(GRID, a, b), `leg ${i}`).toBe(true);
    }
  });

  test("open ground between the beds and the orchard is still blocked", () => {
    const beds = centreOf(zoneByKey(WORLD, "vegetable_beds") as Zone);
    const orchard = centreOf(zoneByKey(WORLD, "orchard") as Zone);
    expect(lineWalkable(GRID, beds, orchard)).toBe(false);
    const midpoint = { x: (beds.x + orchard.x) / 2, y: (beds.y + orchard.y) / 2 };
    expect(isWalkable(WORLD, midpoint, NETWORK)).toBe(false);
  });
});

describe("clicks route, snap or refuse", () => {
  test("a click on the path routes and is not snapped", () => {
    const plan = planClickMove(WORLD, GRID, NETWORK, SPAWN, centreOf(zoneByKey(WORLD, "compost") as Zone));
    expect(plan).not.toBeNull();
    expect(plan?.snapped).toBe(false);
  });

  test("a click just off the trail snaps within 6 ft", () => {
    const ring = NETWORK.ring;
    if (!ring) throw new Error("the ring is disabled");
    const offPath = { x: ring.centre.x + ring.radiusFt + ring.widthFt / 2 + 3, y: ring.centre.y };
    expect(isWalkable(WORLD, offPath, NETWORK)).toBe(false);

    const plan = planClickMove(WORLD, GRID, NETWORK, SPAWN, offPath);
    expect(plan).not.toBeNull();
    expect(plan?.snapped).toBe(true);
    expect(distance(plan?.goal ?? offPath, offPath)).toBeLessThanOrEqual(6);
    expect(isWalkable(WORLD, plan?.goal ?? offPath, NETWORK)).toBe(true);
  });

  test("a click far off the path is refused", () => {
    const openGround = { x: 120, y: 165 };
    expect(isWalkable(WORLD, openGround, NETWORK)).toBe(false);
    expect(nearestWalkableCell(GRID, openGround, 6)).toBeNull();
    expect(planClickMove(WORLD, GRID, NETWORK, SPAWN, openGround)).toBeNull();
  });

  test("a click on the water is refused", () => {
    const pond = zoneByKey(WORLD, "pond") as Zone;
    const centre = { x: pond.circle?.cx ?? 0, y: pond.circle?.cy ?? 0 };
    expect(planClickMove(WORLD, GRID, NETWORK, SPAWN, centre)).toBeNull();
  });

  test("there is no route across a sealed row", () => {
    const cells = new Uint8Array(GRID.cells);
    // A sealed row between the gate and the beds: only the gate trunks cross it.
    for (let col = 0; col < GRID.cols; col += 1) cells[160 * GRID.cols + col] = 0;
    const sealed = { ...GRID, cells };
    const goal = approachTo({ x: entranceFor(NETWORK, "orchard").x, y: entranceFor(NETWORK, "orchard").y });
    expect(findRoute(sealed, SPAWN, goal)).toBeNull();
  });
});

describe("the HUD knows when you are on a path", () => {
  test("standing on the gate-to-beds trunk is a path, not open ground", () => {
    const edge = NETWORK.edges.find((entry) => entry.id === "gate--beds_sw");
    expect(edge).toBeDefined();
    const midpoint = edge?.points[Math.floor((edge.points.length - 1) / 2)] as { x: number; y: number };
    expect(zoneAt(WORLD, midpoint)).toBeNull();
    expect(placeAt(WORLD, midpoint, NETWORK).kind).toBe("path");
  });

  test("each section's centre still reports its zone", () => {
    for (const key of WORLD.movement.freeZones) {
      expect(placeAt(WORLD, centreOf(zoneByKey(WORLD, key) as Zone), NETWORK).kind).toBe("zone");
    }
  });

  test("open ground is still outside", () => {
    expect(placeAt(WORLD, { x: 120, y: 165 }, NETWORK).kind).toBe("outside");
  });
});
