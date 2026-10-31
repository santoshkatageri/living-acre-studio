import type { Box, Circle, Vec2 } from "./types";

/*  Plane geometry for 1 ft coordinates. Every helper here is pure. */

export function pointInBox(point: Vec2, box: Box): boolean {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.widthFt &&
    point.y >= box.y &&
    point.y <= box.y + box.depthFt
  );
}

/** Same test, but a point exactly on the boundary does not count. */
export function pointStrictlyInBox(point: Vec2, box: Box): boolean {
  return (
    point.x > box.x &&
    point.x < box.x + box.widthFt &&
    point.y > box.y &&
    point.y < box.y + box.depthFt
  );
}

export function pointInCircle(point: Vec2, circle: Circle): boolean {
  return Math.hypot(point.x - circle.cx, point.y - circle.cy) <= circle.radiusFt;
}

/** Closest point on a box's outline to an outside point. */
export function closestPointOnBox(point: Vec2, box: Box): Vec2 {
  return {
    x: Math.min(Math.max(point.x, box.x), box.x + box.widthFt),
    y: Math.min(Math.max(point.y, box.y), box.y + box.depthFt),
  };
}

export function distanceToBox(point: Vec2, box: Box): number {
  const nearest = closestPointOnBox(point, box);
  return Math.hypot(point.x - nearest.x, point.y - nearest.y);
}

export function circleIntersectsBox(centre: Vec2, radiusFt: number, box: Box): boolean {
  return distanceToBox(centre, box) < radiusFt;
}

export function circleIntersectsCircle(a: Vec2, aRadius: number, b: Vec2, bRadius: number): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < aRadius + bRadius;
}

/** Squared distance from a point to a segment, plus the closest point. */
export function closestOnSegment(point: Vec2, a: Vec2, b: Vec2): { point: Vec2; distance: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  const nearest = { x: a.x + dx * t, y: a.y + dy * t };
  return { point: nearest, distance: Math.hypot(point.x - nearest.x, point.y - nearest.y) };
}

/** Do two segments cross strictly between their endpoints? */
export function segmentsCross(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
  const cross = (o: Vec2, p: Vec2, q: Vec2) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(b1, b2, a1);
  const d2 = cross(b1, b2, a2);
  const d3 = cross(a1, a2, b1);
  const d4 = cross(a1, a2, b2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
