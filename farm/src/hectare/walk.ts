import type { Vec2 } from "../sim/types";

import type { HectareWorld } from "./world";

/*  The farmer's walk: following a route, and the cycle that carries him.

    State in, state out — `advanceWalker` returns a new walker rather than
    mutating one, which is what lets the tour and the tests run it at any rate
    they like. */

export interface Walker {
  position: Vec2;
  /** The waypoints still to walk, or null when he is standing. */
  route: Vec2[] | null;
  /** Where the route ends, for the readout. */
  target: Vec2 | null;
}

export function createWalker(world: HectareWorld): Walker {
  return { position: { x: world.spawn.x, y: world.spawn.y }, route: null, target: null };
}

export function setRoute(walker: Walker, points: Vec2[]): Walker {
  if (points.length === 0) return { ...walker, route: null, target: null };
  return { position: walker.position, route: points, target: points[points.length - 1] as Vec2 };
}

export function clearRoute(walker: Walker): Walker {
  return { ...walker, route: null, target: null };
}

/**
 * Walk for `dt` seconds at the data's speed. A frame that would overshoot the
 * last waypoint stops exactly on it, and the route comes back null, which is how
 * the app knows he has arrived.
 */
export function advanceWalker(walker: Walker, dt: number, speedFtPerSec: number): Walker {
  if (!walker.route || walker.route.length === 0) return walker;
  let budget = Math.max(speedFtPerSec, 0) * Math.max(dt, 0);
  let position = { ...walker.position };
  const route = [...walker.route];

  while (budget > 0 && route.length > 0) {
    const next = route[0] as Vec2;
    const dx = next.x - position.x;
    const dy = next.y - position.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= budget) {
      position = { x: next.x, y: next.y };
      budget -= distance;
      route.shift();
      continue;
    }
    position = { x: position.x + (dx / distance) * budget, y: position.y + (dy / distance) * budget };
    budget = 0;
  }

  return {
    position,
    route: route.length > 0 ? route : null,
    target: route.length > 0 ? (walker.target ?? null) : null,
  };
}

/** The heading he walks along, in radians, with 0 = +z (south on the map). */
export function headingTo(from: Vec2, to: Vec2): number {
  return Math.atan2(to.x - from.x, to.y - from.y);
}
