import { describe, expect, test } from "vitest";

import { advancePhase, easeAmplitude, easeFacing, gaitPose, REST_POSE } from "../src/hectare/gait";
import { buildMoveGrid, CORRIDOR_FT, findRoute, nearestOpen, remainingFt } from "../src/hectare/move";
import { advanceWalker, createWalker, headingTo, setRoute } from "../src/hectare/walk";
import { HECTARE, zoneAt } from "../src/hectare/world";

/*  Walking: the grid, the route, the walker and the cycle.

    What matters is that a walk never goes through a wall, always ends where it
    was aimed, and finishes exactly on the last waypoint instead of overshooting
    it; and that the cycle is the walker's, not the clock's. */

const W = HECTARE;
const grid = buildMoveGrid(W);
const zoneById = (id: string) => W.zones.find((zone) => zone.id === id)!;
const centreOf = (id: string) => {
  const zone = zoneById(id);
  return { x: zone.box.x + zone.box.widthFt / 2, y: zone.box.y + zone.box.depthFt / 2 };
};

describe("the walking grid", () => {
  test("is open on paths and walkable spaces, shut on pens, buildings and the pond", () => {
    const openAt = (point: { x: number; y: number }): boolean => {
      const index = nearestOpen(grid, point, 1);
      return index !== null;
    };
    // The lane, the wheat plot, the cattle shed's yard.
    expect(openAt({ x: W.paths[0]!.box.x + 0.5, y: W.paths[0]!.box.y + 30 })).toBe(true);
    expect(openAt({ x: zoneById("plot_wheat").box.x + 20, y: zoneById("plot_wheat").box.y + 20 })).toBe(true);
    expect(openAt(centreOf("cattle_shed"))).toBe(true);
    // The pond, the goat pen, a closed building: not walkable.
    for (const id of ["fish_pond", "goat_pen", "poultry", "farmhouse"]) {
      const centre = centreOf(id);
      const zone = zoneById(id);
      expect(zone.walkable, id).toBe(false);
      const index = nearestOpen(grid, centre, 1);
      expect(index, id).toBeNull();
    }
  });

  test("a route from the gate to a plot is one unbroken walkable chain", () => {
    const route = findRoute(grid, W.spawn, centreOf("plot_wheat"));
    expect(route).toBeTruthy();
    const points = route!.points;
    expect(points.length).toBeGreaterThan(2);
    // Every waypoint is on walkable ground.
    for (const point of points) {
      // Walkable ground, or the shoulder the grid allows past it.
      const near = (box: { x: number; y: number; widthFt: number; depthFt: number }): boolean =>
        point.x >= box.x - CORRIDOR_FT &&
        point.x <= box.x + box.widthFt + CORRIDOR_FT &&
        point.y >= box.y - CORRIDOR_FT &&
        point.y <= box.y + box.depthFt + CORRIDOR_FT;
      const zone = zoneAt(W, point);
      const onPath = W.paths.some((path) => near(path.box));
      const onZone = W.zones.some((entry) => entry.walkable && near(entry.box));
      expect(Boolean(zone?.walkable) || onPath || onZone, `${point.x},${point.y}`).toBe(true);
    }
    // It ends where it was aimed, within a cell.
    const last = points[points.length - 1]!;
    expect(Math.hypot(last.x - centreOf("plot_wheat").x, last.y - centreOf("plot_wheat").y)).toBeLessThan(2);
    expect(route!.snapped).toBe(false);
  });

  test("every walkable space can be reached from the gate", () => {
    for (const zone of W.zones.filter((entry) => entry.walkable)) {
      const route = findRoute(grid, W.spawn, centreOf(zone.id));
      expect(route, `${zone.id} is walkable but unreachable`).toBeTruthy();
    }
  });

  test("a click in the pond is refused, not walked through", () => {
    const route = findRoute(grid, W.spawn, centreOf("fish_pond"));
    // Either no route at all, or one that stops on the bank — never one that
    // ends in the water.
    if (route) {
      const last = route.points[route.points.length - 1]!;
      expect(zoneAt(W, last)?.id).not.toBe("fish_pond");
    }
    // A cell deep in the pond has no open neighbour within a cell or two.
    expect(nearestOpen(grid, centreOf("fish_pond"), 1)).toBeNull();
  });

  test("a click just off a path walks to the nearest path point", () => {
    const lane = W.paths[0]!;
    // Open ground a few feet off the lane, and off every walkable space.
    const openGround = ((): { x: number; y: number } => {
      for (let y = 2; y < W.parcel.depthFt; y += 2) {
        for (let x = 2; x < W.parcel.widthFt; x += 2) {
          const point = { x: lane.box.x - 6, y };
          void point;
          const inZone = W.zones.some(
            (zone) => x >= zone.box.x && x <= zone.box.x + zone.box.widthFt && y >= zone.box.y && y <= zone.box.y + zone.box.depthFt,
          );
          const onPath = W.paths.some(
            (p) => x >= p.box.x - 3 && x <= p.box.x + p.box.widthFt + 3 && y >= p.box.y && y <= p.box.y + p.box.depthFt,
          );
          if (!inZone && !onPath) return { x, y };
        }
      }
      throw new Error("no open ground off the paths");
    })();
    const justOff = openGround;
    const route = findRoute(grid, W.spawn, justOff);
    expect(route).toBeTruthy();
    expect(route!.snapped).toBe(true);
    const points = route!.points;
    const last = points[points.length - 1]!;
    // It snaps to the nearest open cell, which is the shoulder of the path.
    expect(Math.abs(last.x - justOff.x)).toBeLessThan(2 * CORRIDOR_FT + 4);
  });

  test("counts the feet left to walk", () => {
    const route = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 4 },
    ];
    expect(remainingFt(route, { x: 0, y: 0 })).toBeCloseTo(7, 6);
    // Behind the first waypoint: back to it, then the rest of the route.
    expect(remainingFt(route, { x: 2, y: 0 })).toBeCloseTo(2 + 3 + 4, 6);
    // The route starts at (0, 0), so from the far end of the first leg it is
    // back to the start, then the whole route.
    expect(remainingFt(route, { x: 3, y: 0 })).toBeCloseTo(3 + 3 + 4, 6);
    expect(remainingFt(null, { x: 0, y: 0 })).toBe(0);
  });
});

describe("the walker", () => {
  test("starts at the gate, standing", () => {
    const walker = createWalker(W);
    expect(walker.position).toEqual(W.spawn);
    expect(walker.route).toBeNull();
    expect(walker.target).toBeNull();
  });

  test("walks the data's speed, and stops exactly on the last waypoint", () => {
    const start = createWalker(W);
    const route = [{ x: start.position.x, y: start.position.y + 10 }];
    let walker = setRoute(start, route);

    // Half a second at the data's speed: less than the whole leg.
    walker = advanceWalker(walker, 0.5, W.farmer.speedFtPerSec);
    expect(walker.position.y).toBeCloseTo(start.position.y + W.farmer.speedFtPerSec * 0.5, 6);
    expect(walker.route).not.toBeNull();

    // Long enough to overshoot: he stops on it, not past it.
    walker = advanceWalker(walker, 100, W.farmer.speedFtPerSec);
    expect(walker.position.y).toBeCloseTo(start.position.y + 10, 6);
    expect(walker.route).toBeNull();
    expect(walker.target).toBeNull();
  });

  test("works through waypoints in order", () => {
    const route = [
      { x: 100, y: 100 },
      { x: 110, y: 100 },
      { x: 110, y: 110 },
    ];
    let walker = setRoute(createWalker(W), route);
    // He starts at the gate, so allow the walk there as well as round the corner.
    for (let step = 0; step < 4000 && walker.route; step += 1) {
      walker = advanceWalker(walker, 0.1, 3.2);
    }
    expect(walker.position.x).toBeCloseTo(110, 6);
    expect(walker.position.y).toBeCloseTo(110, 6);
  });

  test("standing still moves nobody", () => {
    const walker = createWalker(W);
    expect(advanceWalker(walker, 5, 3.2)).toBe(walker);
  });

  test("faces the way he is going", () => {
    expect(headingTo({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(0, 6);
    expect(headingTo({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe("the walk cycle", () => {
  test("advances with the ground covered, not the clock", () => {
    expect(advancePhase(0, 0, 4)).toBeCloseTo(0, 9);
    expect(advancePhase(0, 2, 4)).toBeCloseTo(0.5, 9);
    // Wraps rather than growing without bound.
    expect(advancePhase(0.75, 2, 4)).toBeCloseTo(0.25, 9);
    expect(advancePhase(0.9, 100, 4)).toBeGreaterThanOrEqual(0);
    expect(advancePhase(0.9, 100, 4)).toBeLessThan(1);
  });

  test("stands still at zero amplitude, and strides at full", () => {
    const still = gaitPose(0.25, 0);
    for (const key of Object.keys(REST_POSE) as (keyof typeof REST_POSE)[]) {
      expect(Math.abs(still[key])).toBeLessThan(1e-12);
    }
    const full = gaitPose(0.25, 1);
    expect(Math.abs(full.legSwing)).toBeGreaterThan(0.3);
    // Legs and arms swing opposite, and the body rises twice a cycle.
    expect(Math.sign(full.armSwing)).toBe(-Math.sign(full.legSwing));
    expect(gaitPose(0, 1).bob).toBeGreaterThan(gaitPose(0.25, 1).bob);
  });

  test("eases the amplitude in and out", () => {
    let amplitude = 0;
    for (let step = 0; step < 40; step += 1) amplitude = easeAmplitude(amplitude, 1, 0.05, 6);
    expect(amplitude).toBeGreaterThan(0.6);
    expect(amplitude).toBeLessThanOrEqual(1);
    for (let step = 0; step < 60; step += 1) amplitude = easeAmplitude(amplitude, 0, 0.05, 6);
    expect(amplitude).toBeLessThan(0.1);
  });

  test("turns towards a heading by the short way round", () => {
    // From just under +pi to just over -pi: the short way is forward, not back.
    const turned = easeFacing(3.0, -3.0, 0.1, 10);
    expect(turned).toBeGreaterThan(3.0);
  });
});
