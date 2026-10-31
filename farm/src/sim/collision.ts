import { networkFor } from "./canon";
import { pathMargin, type PathNetwork } from "./paths";
import type { Vec2, World, Zone } from "./types";
import { isWalkable } from "./walkable";

/* ------------------------------------------------------------------ */
/*  Where the farmer is, and how they move.                            */
/*                                                                     */
/*  What is walkable is decided in src/sim/walkable.ts: either the      */
/*  pre-M3 rule ("free": anywhere that is not a solid zone) or the      */
/*  paths-only rule (free zones + path corridors). This module only     */
/*  asks that predicate and turns it into sliding movement.             */
/*                                                                     */
/*  No zone name appears here; the rule and the labels are data.        */
/* ------------------------------------------------------------------ */

/** The zone whose footprint contains this point, if any. */
export function zoneAt(world: World, point: Vec2): Zone | null {
  for (const zone of world.zones) {
    if (zone.circle) {
      const dx = point.x - zone.circle.cx;
      const dy = point.y - zone.circle.cy;
      if (dx * dx + dy * dy <= zone.circle.radiusFt * zone.circle.radiusFt) return zone;
      continue;
    }
    if (
      point.x >= zone.box.x &&
      point.x <= zone.box.x + zone.box.widthFt &&
      point.y >= zone.box.y &&
      point.y <= zone.box.y + zone.box.depthFt
    ) {
      return zone;
    }
  }
  return null;
}

/** Zone name, or "outside" when between zones. Zones do not cover paths. */
export function zoneNameAt(world: World, point: Vec2): string {
  return zoneAt(world, point)?.name ?? "outside";
}

export type PlaceKind = "zone" | "path" | "outside";

export interface Place {
  kind: PlaceKind;
  zone: Zone | null;
}

/**
 * Where the farmer is standing, in three kinds. On a trail between zones the
 * answer is "path", never "outside": the trail is a place.
 */
export function placeAt(world: World, point: Vec2, network: PathNetwork | null): Place {
  const zone = zoneAt(world, point);
  if (zone) return { kind: "zone", zone };
  if (network && pathMargin(network, point, 0) >= 0) return { kind: "path", zone: null };
  return { kind: "outside", zone: null };
}

/** True when the farmer's centre may not stand here. */
export function isBlocked(
  world: World,
  centre: Vec2,
  radiusFt = world.player.radiusFt,
  network: PathNetwork | null = world.movement.mode === "free" ? null : networkFor(world),
): boolean {
  return !isWalkable(world, centre, network, radiusFt);
}

/** Keep the player inside the parcel, inset by its radius. */
export function clampToParcel(world: World, point: Vec2, radiusFt = world.player.radiusFt): Vec2 {
  return {
    x: Math.min(Math.max(point.x, radiusFt), world.parcel.widthFt - radiusFt),
    y: Math.min(Math.max(point.y, radiusFt), world.parcel.depthFt - radiusFt),
  };
}

/** Unit direction of the nearest corridor segment, or null. */
function nearestCorridorDirection(network: PathNetwork, point: Vec2, reachFt = 8): Vec2 | null {
  let best: { direction: Vec2; distance: number } | null = null;
  for (const edge of network.edges) {
    for (let i = 1; i < edge.points.length; i += 1) {
      const a = edge.points[i - 1] as Vec2;
      const b = edge.points[i] as Vec2;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSq = dx * dx + dy * dy;
      if (lengthSq === 0) continue;
      const t = Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
      const d = Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
      if (d > reachFt) continue;
      if (!best || d < best.distance) {
        const length = Math.sqrt(lengthSq);
        best = { direction: { x: dx / length, y: dy / length }, distance: d };
      }
    }
  }
  return best?.direction ?? null;
}

/**
 * Move from `from` by `delta`.
 *
 * Tries the direct step first, then the two axis steps (the old wall slide),
 * then a slide along the nearest corridor so a diagonal push against a path
 * edge keeps moving instead of sticking. Corridors are only a few feet wide,
 * so axis-only sliding is not enough on its own.
 */
export function moveWithCollision(
  world: World,
  from: Vec2,
  delta: Vec2,
  radiusFt = world.player.radiusFt,
): Vec2 {
  const network = world.movement.mode === "free" ? null : networkFor(world);

  const attempt = (dx: number, dy: number): Vec2 | null => {
    if (dx === 0 && dy === 0) return null;
    const candidate = clampToParcel(world, { x: from.x + dx, y: from.y + dy }, radiusFt);
    if (candidate.x === from.x && candidate.y === from.y) return null;
    return isWalkable(world, candidate, network, radiusFt) ? candidate : null;
  };

  const direct = attempt(delta.x, delta.y);
  if (direct) return direct;

  const xOnly = attempt(delta.x, 0);
  if (xOnly) return xOnly;

  const yOnly = attempt(0, delta.y);
  if (yOnly) return yOnly;

  if (network) {
    const direction = nearestCorridorDirection(network, from);
    if (direction) {
      const along = delta.x * direction.x + delta.y * direction.y;
      if (Math.abs(along) > 1e-6) {
        const slid = attempt(direction.x * along, direction.y * along);
        if (slid) return slid;
      }
    }
  }

  return from;
}

/** Step a distance towards `target`, stopping short rather than overshooting. */
export function stepTowards(
  world: World,
  from: Vec2,
  target: Vec2,
  maxDistanceFt: number,
  radiusFt = world.player.radiusFt,
): Vec2 {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return from;
  const step = Math.min(maxDistanceFt, length);
  return moveWithCollision(world, from, { x: (dx / length) * step, y: (dy / length) * step }, radiusFt);
}

/** HUD text: position in feet plus the place the player stands in. */
export function describePlayer(world: World, player: { position: Vec2 }, network: PathNetwork | null): string {
  const { x, y } = player.position;
  const place = placeAt(world, player.position, network);
  const label = place.zone ? place.zone.name : place.kind;
  return `x ${x.toFixed(1)} ft · y ${y.toFixed(1)} ft · ${label}`;
}
