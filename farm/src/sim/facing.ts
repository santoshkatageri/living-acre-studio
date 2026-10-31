import type { Vec2 } from "./types";

/*  Which way the farmer looks, from the direction they last moved.
    Canon +y is south, so a positive dy faces south. */

export type Facing = "north" | "south" | "east" | "west";

export function facingFromDelta(dx: number, dy: number, epsilon = 1e-4): Facing | null {
  if (Math.abs(dx) < epsilon && Math.abs(dy) < epsilon) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "east" : "west";
  return dy > 0 ? "south" : "north";
}

/** Unit vector for a facing, in canon feet. */
export function facingVector(facing: Facing): Vec2 {
  switch (facing) {
    case "north":
      return { x: 0, y: -1 };
    case "south":
      return { x: 0, y: 1 };
    case "east":
      return { x: 1, y: 0 };
    default:
      return { x: -1, y: 0 };
  }
}
