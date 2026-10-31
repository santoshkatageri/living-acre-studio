import { findRoute, nearestWalkableCell } from "../../src/sim/astar";
import { networkFor, WORLD } from "../../src/sim/canon";
import { setRoute, updatePlayer, type PlayerState } from "../../src/sim/player";
import type { Vec2, World, Zone } from "../../src/sim/types";
import { buildWalkableGrid, cellCentre, type WalkableGrid } from "../../src/sim/walkable";

/*  Shared fixtures for the movement tests. Not a test file itself
    (vite.config includes only tests/**\/*.test.ts). */

/** The same world under the pre-M3 free-roam rule, for comparison tests. */
export const ROAM: World = {
  ...WORLD,
  movement: { ...WORLD.movement, mode: "free" },
};

export const NETWORK = networkFor(WORLD);
export const GRID: WalkableGrid = buildWalkableGrid(WORLD, NETWORK);

export const centreOf = (zone: Zone): Vec2 =>
  zone.circle
    ? { x: zone.circle.cx, y: zone.circle.cy }
    : { x: zone.box.x + zone.box.widthFt / 2, y: zone.box.y + zone.box.depthFt / 2 };

export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/** The last point of a non-empty list. */
export const last = <T>(list: T[]): T => list[list.length - 1] as T;

/**
 * The nearest point the farmer's CENTRE may occupy to `point`. Entrance
 * nodes on a solid wall (the farmhouse door) are approached, not entered.
 */
export function approachTo(point: Vec2, maxFt = 6): Vec2 {
  const cell = nearestWalkableCell(GRID, point, maxFt);
  if (cell === null) throw new Error(`no walkable cell within ${maxFt} ft of ${point.x},${point.y}`);
  return cellCentre(GRID, cell);
}

export interface WalkResult {
  ok: boolean;
  position: Vec2;
  travelledFt: number;
  seconds: number;
  frames: number;
  /** True when the walk gave up mid-route (blocked, not merely finished). */
  stalled: boolean;
}

const IDLE = { forward: false, back: false, left: false, right: false };

/** Walk a prepared list of waypoints with the real movement rule, frame by frame. */
export function walkPoints(from: Vec2, points: Vec2[], maxSeconds = 240): WalkResult {
  let player: PlayerState = setRoute({ position: { ...from }, target: null, route: null }, points);
  const dt = 1 / 60;
  let seconds = 0;
  let frames = 0;
  let travelled = 0;
  let previous = { ...player.position };
  let stalled = false;

  while (seconds < maxSeconds) {
    const before = player;
    player = updatePlayer(WORLD, player, IDLE, dt);
    seconds += dt;
    frames += 1;
    travelled += distance(player.position, previous);
    previous = { ...player.position };
    if (!player.route && !player.target) {
      // Stopped: did it stop short of the final waypoint?
      const goal = points[points.length - 1] as Vec2;
      stalled = distance(player.position, goal) > 2;
      break;
    }
    if (before === player) break;
  }

  const goal = points[points.length - 1] as Vec2;
  return {
    ok: distance(player.position, goal) < 2,
    position: player.position,
    travelledFt: travelled,
    seconds,
    frames,
    stalled,
  };
}

/** Plan an A* route and then actually walk it. */
export function walkRoute(from: Vec2, to: Vec2, maxSeconds = 240): WalkResult {
  const route = findRoute(GRID, from, to);
  if (!route) {
    return { ok: false, position: from, travelledFt: 0, seconds: 0, frames: 0, stalled: true };
  }
  return walkPoints(from, route.points, maxSeconds);
}
