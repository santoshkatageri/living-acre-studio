import { moveWithCollision, stepTowards } from "./collision";
import type { Vec2, World } from "./types";

/*  The farmer: position, keyboard delta, and a route from click-to-move.
    Pure. The renderer reads position; nothing here knows about the screen. */

export interface PlayerState {
  position: Vec2;
  /** Final click-to-move point; cleared on arrival or when keys take over. */
  target: Vec2 | null;
  /** Remaining A* waypoints, nearest first. */
  route: Vec2[] | null;
}

export interface InputState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
}

export function createPlayer(world: World): PlayerState {
  return { position: { ...world.player.spawn }, target: null, route: null };
}

/** Follow a computed route; the final point becomes the target. */
export function setRoute(player: PlayerState, points: Vec2[]): PlayerState {
  if (points.length === 0) return { ...player, target: null, route: null };
  const last = points[points.length - 1] as Vec2;
  return {
    position: player.position,
    target: { x: last.x, y: last.y },
    route: points.map((point) => ({ ...point })),
  };
}

export function setTarget(player: PlayerState, target: Vec2 | null): PlayerState {
  return { position: player.position, target, route: null };
}

/** Keys are camera-relative: forward is up the screen, which is canon north. */
export function keyboardDelta(input: InputState, speedFtPerSec: number, dt: number): Vec2 {
  const x = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const y = (input.back ? 1 : 0) - (input.forward ? 1 : 0);
  const length = Math.hypot(x, y);
  if (length === 0) return { x: 0, y: 0 };
  const step = speedFtPerSec * dt;
  return { x: (x / length) * step, y: (y / length) * step };
}

export function updatePlayer(world: World, player: PlayerState, input: InputState, dt: number): PlayerState {
  const delta = keyboardDelta(input, world.player.speedFtPerSec, dt);

  if (delta.x !== 0 || delta.y !== 0) {
    // Keys always win: they cancel a pending click route.
    return { position: moveWithCollision(world, player.position, delta), target: null, route: null };
  }

  const route = player.route ?? null;
  if (route && route.length > 0) {
    const waypoint = route[0] as Vec2;
    const budget = world.player.speedFtPerSec * dt;
    const d = Math.hypot(waypoint.x - player.position.x, waypoint.y - player.position.y);

    if (d <= budget) {
      const rest = route.slice(1);
      if (rest.length === 0) {
        return { position: { x: waypoint.x, y: waypoint.y }, target: null, route: null };
      }
      return { position: { x: waypoint.x, y: waypoint.y }, target: player.target, route: rest };
    }

    const next = stepTowards(world, player.position, waypoint, budget);
    const moved = Math.hypot(next.x - player.position.x, next.y - player.position.y);
    if (moved < 1e-4) {
      // Blocked: give up rather than grinding against the edge forever.
      return { position: player.position, target: null, route: null };
    }
    return { position: next, target: player.target, route };
  }

  if (!player.target) return player;

  // A bare target (no route): walk straight at it, sliding on the edges.
  const budget = world.player.speedFtPerSec * dt;
  const next = stepTowards(world, player.position, player.target, budget);
  const arrived = Math.hypot(next.x - player.target.x, next.y - player.target.y) < 0.25;
  if (arrived) return { position: next, target: null, route: null };

  const moved = Math.hypot(next.x - player.position.x, next.y - player.position.y);
  if (moved < 1e-4) return { position: next, target: null, route: null };

  return { position: next, target: player.target, route: null };
}
