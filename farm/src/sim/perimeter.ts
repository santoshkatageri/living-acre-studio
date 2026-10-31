import { distance } from "./geometry";
import type { PathEdge, PathNode } from "./paths";
import type { Vec2, World } from "./types";

/*  The garden walk: a closed loop inside the tree belt's inner edge, joined to
    the path network by one spur per listed section.

    A plain rounded rectangle does not fit this parcel — the farmhouse is
    12.5 ft from two boundaries and the pond ring reaches 14.1 ft from the
    south — so the loop carries NOTCHES around the two buildings and around the
    pond ring. Every one of those is derived from the canon box or the ring
    radius; nothing here is typed as a coordinate. */

export interface PerimeterLoop {
  /** The rounded centreline, closed (last point is not repeated). */
  points: Vec2[];
  nodeIds: string[];
  lengthFt: number;
}

export interface PerimeterConnector {
  section: string;
  fromNode: string;
  toNode: string;
  lengthFt: number;
}

export interface PerimeterDropped {
  section: string;
  reason: string;
}

export interface PerimeterFit {
  /** Centreline distance from each boundary, in feet. */
  inset: { west: number; north: number; east: number; south: number };
  /** Where the belt's inner edge sits, in feet from each boundary. */
  beltInnerEdge: { west: number; north: number; east: number; south: number };
  /** The nearest obstacle to each boundary, and how far away it is. */
  nearest: Record<string, { name: string; fromBoundaryFt: number }>;
  /** Spare room between the belt's inner edge and that obstacle. >= 0 fits. */
  beltClearanceFt: Record<string, number>;
  /** What the walk needs beyond the belt: half its width + clearance. */
  walkMarginFt: number;
  /** True when a plain rounded rectangle would fit (it does not, here). */
  plainRectangleFits: boolean;
  /** The side that is tightest, and by how much a plain rectangle is short. */
  tightest: { side: string; name: string; shortfallFt: number };
}

export interface Perimeter {
  loop: PerimeterLoop;
  nodes: PathNode[];
  edges: PathEdge[];
  connectors: PerimeterConnector[];
  /** Crossings with existing legs, split into real junctions by paths.ts. */
  junctions: PathNode[];
  dropped: PerimeterDropped[];
  fit: PerimeterFit;
  widthFt: number;
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** How far in from the boundary the walk's centreline sits, per side. */
export function perimeterInset(world: World): PerimeterFit["inset"] {
  const half = world.perimeter.widthFt / 2;
  const offset = world.perimeter.offsetFt + half;
  return {
    west: round3(world.buffer.widthFt.west + offset),
    north: round3(world.buffer.widthFt.north + offset),
    east: round3(world.parcel.widthFt - (world.buffer.widthFt.east + offset)),
    south: round3(world.parcel.depthFt - (world.buffer.widthFt.south + offset)),
  };
}

/** The pond ring's outer edge, the thing the loop has to go round. */
function ringOuterFt(world: World): number | null {
  const pond = world.zones.find((zone) => zone.circle);
  if (!pond?.circle || !world.pondRing.enabled) return null;
  return pond.circle.radiusFt + world.pond.rimOuterFt + world.pondRing.gapFt + world.pondRing.widthFt;
}

/**
 * Fit check: how much room each side has between the belt's inner edge and the
 * nearest thing the walk must avoid. Run before the loop is built, and again
 * by the tests.
 */
export function perimeterFitCheck(world: World): PerimeterFit {
  const inset = perimeterInset(world);
  const W = world.parcel.widthFt;
  const D = world.parcel.depthFt;
  const beltInnerEdge = {
    west: world.buffer.widthFt.west,
    north: world.buffer.widthFt.north,
    east: W - world.buffer.widthFt.east,
    south: D - world.buffer.widthFt.south,
  };
  // Distance from the boundary to the belt's inner edge, per side.
  const beltFromBoundary = {
    west: beltInnerEdge.west,
    north: beltInnerEdge.north,
    east: W - beltInnerEdge.east,
    south: D - beltInnerEdge.south,
  };

  const nearest: Record<string, { name: string; fromBoundaryFt: number }> = {};
  const note = (side: string, name: string, fromBoundaryFt: number): void => {
    const current = nearest[side];
    if (!current || fromBoundaryFt < current.fromBoundaryFt) {
      nearest[side] = { name, fromBoundaryFt: round3(fromBoundaryFt) };
    }
  };

  for (const zone of world.zones) {
    if (zone.key === "gate") continue; // the gate sits in its own gap
    if (zone.circle) {
      const reach = ringOuterFt(world) ?? zone.circle.radiusFt;
      note("west", zone.key, zone.circle.cx - reach);
      note("east", zone.key, W - (zone.circle.cx + reach));
      note("north", zone.key, zone.circle.cy - reach);
      note("south", zone.key, D - (zone.circle.cy + reach));
      continue;
    }
    const right = zone.box.x + zone.box.widthFt;
    const bottom = zone.box.y + zone.box.depthFt;
    note("west", zone.key, zone.box.x);
    note("east", zone.key, W - right);
    note("north", zone.key, zone.box.y);
    note("south", zone.key, D - bottom);
  }

  const beltClearanceFt: Record<string, number> = {};
  for (const side of ["west", "north", "east", "south"] as const) {
    beltClearanceFt[side] = round3((nearest[side]?.fromBoundaryFt ?? Number.POSITIVE_INFINITY) - beltFromBoundary[side]);
  }

  const walkMarginFt = round3(world.perimeter.widthFt / 2 + world.perimeter.clearanceFt);
  let tightest = { side: "west", name: nearest["west"]?.name ?? "boundary", shortfallFt: 0 };
  for (const side of ["west", "north", "east", "south"] as const) {
    const needed = beltFromBoundary[side] + walkMarginFt;
    const available = nearest[side]?.fromBoundaryFt ?? Number.POSITIVE_INFINITY;
    const shortfall = round3(available - needed);
    if (shortfall < tightest.shortfallFt || tightest.shortfallFt === 0) {
      if (shortfall < tightest.shortfallFt) tightest = { side, name: nearest[side]?.name ?? "boundary", shortfallFt: shortfall };
    }
  }
  if (tightest.shortfallFt > 0) tightest = { side: "none", name: "nothing", shortfallFt: 0 };

  return {
    inset,
    beltInnerEdge,
    nearest,
    beltClearanceFt,
    walkMarginFt,
    plainRectangleFits: Object.values(beltClearanceFt).every((value) => value >= walkMarginFt),
    tightest,
  };
}

/** The notch depth a box needs so the loop can pass on its far side. */
function notchDepth(world: World): number {
  return world.perimeter.widthFt / 2 + world.perimeter.clearanceFt;
}

/**
 * The un-rounded spine: the rectangle's four lines, detoured around the boxes
 * that straddle them and around the pond ring.
 */
export function perimeterSpine(world: World): Vec2[] {
  return spineWithSharp(world).points;
}

/**
 * The spine plus a flag per vertex: a notch corner must stay sharp, because a
 * rounded arc there would bulge back across the very thing the notch avoids.
 */
export function spineWithSharp(world: World): { points: Vec2[]; sharp: boolean[] } {
  const inset = perimeterInset(world);
  const margin = notchDepth(world);
  const points: Vec2[] = [];

  const sharp: boolean[] = [];
  const push = (x: number, y: number, isSharp = false): void => {
    const last = points[points.length - 1];
    if (last && Math.abs(last.x - x) < 0.01 && Math.abs(last.y - y) < 0.01) {
      sharp[points.length - 1] = sharp[points.length - 1] || isSharp;
      return;
    }
    points.push({ x: round3(x), y: round3(y) });
    sharp.push(isSharp);
  };

  /* ---- the north leg, left to right, detouring round the buildings ---- */
  const notches = world.zones
    .filter((zone) => !zone.circle && zone.key !== "gate")
    .filter((zone) => {
      const top = zone.box.y;
      const bottom = zone.box.y + zone.box.depthFt;
      return top - margin <= inset.north && inset.north <= bottom + margin;
    })
    .filter((zone) => zone.box.x < inset.east && zone.box.x + zone.box.widthFt > inset.west)
    .map((zone) => ({
      x0: Math.max(inset.west, zone.box.x - margin),
      x1: Math.min(inset.east, zone.box.x + zone.box.widthFt + margin),
      y: zone.box.y + zone.box.depthFt + margin,
    }))
    .sort((a, b) => a.x0 - b.x0);

  const startY = notches.length > 0 && Math.abs((notches[0] as { x0: number }).x0 - inset.west) < 0.01
    ? (notches[0] as { y: number }).y
    : inset.north;

  let cursor = inset.west;
  if (startY === inset.north) push(inset.west, inset.north);
  for (const notch of notches) {
    // A notch that starts at the corner drops straight down: the horizontal
    // run along the north line only exists once the polygon has started.
    const x0 = Math.max(notch.x0, cursor);
    if (x0 >= notch.x1) continue;
    if (points.length > 0) push(x0, inset.north, true);
    push(x0, notch.y, true);
    push(notch.x1, notch.y, true);
    push(notch.x1, inset.north, true);
    cursor = notch.x1;
  }
  push(cursor, inset.north);
  push(inset.east, inset.north);

  /* ---- the pond ring: round its north side, then down its west side ---- */
  const pond = world.zones.find((zone) => zone.circle);
  const ring = ringOuterFt(world);
  let detoured = false;
  if (pond?.circle && ring !== null) {
    const clear = ring + margin;
    const hitsEast = Math.abs(inset.east - pond.circle.cx) < clear;
    const hitsSouth = Math.abs(inset.south - pond.circle.cy) < clear;
    if (hitsEast || hitsSouth) {
      const north = Math.max(round3(pond.circle.cy - clear), inset.north + margin);
      const west = round3(pond.circle.cx - clear);
      push(inset.east, north, true);
      push(west, north, true);
      push(west, inset.south, true);
      detoured = true;
    }
  }
  if (!detoured) push(inset.east, inset.south);

  /* ---- the south leg back west, then up the west side ---- */
  push(inset.west, inset.south);
  push(inset.west, startY);
  // A corner notch makes the closing point the same as the opening one.
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && Math.abs(first.x - last.x) < 0.01 && Math.abs(first.y - last.y) < 0.01) {
    points.pop();
    sharp.pop();
  }
  return { points, sharp };
}

/** Rounded corners: every turn becomes an arc of the configured radius. */
function roundCorners(points: Vec2[], radiusFt: number, sampleFt: number, sharp: boolean[]): Vec2[] {
  const count = points.length;
  const out: Vec2[] = [];
  for (let i = 0; i < count; i += 1) {
    const previous = points[(i - 1 + count) % count] as Vec2;
    const current = points[i] as Vec2;
    const next = points[(i + 1) % count] as Vec2;
    if (sharp[i]) {
      out.push({ ...current });
      continue;
    }
    const inLength = distance(previous, current);
    const outLength = distance(current, next);
    const radius = Math.min(radiusFt, inLength / 2, outLength / 2);
    const ux = { x: (previous.x - current.x) / inLength, y: (previous.y - current.y) / inLength };
    const vx = { x: (next.x - current.x) / outLength, y: (next.y - current.y) / outLength };
    const start = { x: current.x + ux.x * radius, y: current.y + ux.y * radius };
    const end = { x: current.x + vx.x * radius, y: current.y + vx.y * radius };
    const steps = Math.max(2, Math.ceil((radius * Math.PI) / 2 / sampleFt));
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      // Quadratic Bézier: the corner as a smooth turn, exact at both ends.
      const x = (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * current.x + t * t * end.x;
      const y = (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * current.y + t * t * end.y;
      out.push({ x: round3(x), y: round3(y) });
    }
  }
  return out;
}

/** Resample a closed polyline at an even spacing, keeping the corners. */
function resampleClosed(points: Vec2[], spacingFt: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i] as Vec2;
    const b = points[(i + 1) % points.length] as Vec2;
    const length = distance(a, b);
    const steps = Math.max(1, Math.round(length / spacingFt));
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      out.push({ x: round3(a.x + (b.x - a.x) * t), y: round3(a.y + (b.y - a.y) * t) });
    }
  }
  // A closed polyline must not repeat its first point at the end.
  const first = out[0];
  const last = out[out.length - 1];
  if (first && last && Math.abs(first.x - last.x) < 0.01 && Math.abs(first.y - last.y) < 0.01) out.pop();
  return out;
}

/** Does a straight leg cross a solid zone or the pond's water? */
function crossesSolid(world: World, a: Vec2, b: Vec2): string | null {
  for (const zone of world.zones) {
    if (!zone.solid) continue;
    if (zone.circle) {
      // Sample the leg; the water is a circle, so this is exact enough at 1 ft.
      const steps = Math.max(2, Math.ceil(distance(a, b)));
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        if (Math.hypot(x - zone.circle.cx, y - zone.circle.cy) < zone.circle.radiusFt) return zone.key;
      }
      continue;
    }
    // Straight-leg vs box, sampled for the same reason.
    const steps = Math.max(2, Math.ceil(distance(a, b)));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const inside =
        x > zone.box.x && x < zone.box.x + zone.box.widthFt && y > zone.box.y && y < zone.box.y + zone.box.depthFt;
      if (inside) return zone.key;
    }
  }
  return null;
}

/**
 * How many legs a proposed spur would cross: walk the spur at half-foot steps
 * and count every time it comes within a corridor's width of a leg already
 * drawn. A segmented test misses a hit that lands on a sample vertex, and that
 * is exactly the case that leaves a lens between two junctions.
 */
function crossingsOf(points: Vec2[], edges: PathEdge[]): number {
  let count = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as Vec2;
    const b = points[i] as Vec2;
    const steps = Math.max(1, Math.ceil(distance(a, b) / 0.5));
    let inside = false;
    for (let s = 0; s <= steps; s += 1) {
      const point = { x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps };
      let nearest = Number.POSITIVE_INFINITY;
      for (const edge of edges) {
        for (let j = 1; j < edge.points.length; j += 1) {
          const p0 = edge.points[j - 1] as Vec2;
          const p1 = edge.points[j] as Vec2;
          const dx = p1.x - p0.x;
          const dy = p1.y - p0.y;
          const lengthSq = dx * dx + dy * dy;
          const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((point.x - p0.x) * dx + (point.y - p0.y) * dy) / lengthSq));
          nearest = Math.min(nearest, Math.hypot(point.x - (p0.x + dx * t), point.y - (p0.y + dy * t)));
        }
      }
      const near = nearest < 0.4;
      if (near && !inside) count += 1;
      inside = near;
    }
  }
  return count;
}

/**
 * Build the loop and its connector spurs.
 * `existing` is the network as it stands: connectors join its nodes.
 */
export function buildPerimeter(
  world: World,
  existing: { nodes: PathNode[]; edges: PathEdge[] },
): Perimeter | null {
  if (!world.perimeter.enabled) return null;
  if (world.perimeter.connectors.length > world.perimeter.maxConnectors) {
    throw new Error(
      `perimeter: ${world.perimeter.connectors.length} connectors is more than the ${world.perimeter.maxConnectors} allowed`,
    );
  }

  const fit = perimeterFitCheck(world);
  const pond = world.zones.find((zone) => zone.circle);
  const ring = ringOuterFt(world);
  const margin = notchDepth(world);
  const spineResult = spineWithSharp(world);
  const rounded = roundCorners(spineResult.points, world.perimeter.cornerRadiusFt, world.perimeter.nodeSpacingFt, spineResult.sharp);
  const points = resampleClosed(rounded, world.perimeter.nodeSpacingFt).filter((point, index, all) => {
    const previous = all[(index - 1 + all.length) % all.length] as Vec2;
    return Math.hypot(point.x - previous.x, point.y - previous.y) > 0.01;
  });
  if (points.length < 8) throw new Error("perimeter: the loop degenerated to fewer than 8 points");

  const nodes: PathNode[] = points.map((point, index) => ({
    id: `walk_${index}`,
    x: point.x,
    y: point.y,
    role: "walk" as const,
  }));

  const edges: PathEdge[] = [];
  let lengthFt = 0;
  for (let i = 0; i < points.length; i += 1) {
    const from = nodes[i] as PathNode;
    const to = nodes[(i + 1) % points.length] as PathNode;
    lengthFt += distance(from, to);
    edges.push({
      id: `walk:${i}`,
      from: from.id,
      to: to.id,
      widthFt: world.perimeter.widthFt,
      kind: "walk",
      points: [
        { x: from.x, y: from.y },
        { x: to.x, y: to.y },
      ],
    });
  }

  /* ---- one spur per listed section, to the nearest point ON the loop ----
     Projecting onto the polyline (rather than snapping to the nearest node)
     is what lets a door leave square to its own wall: the nearest node can sit
     four feet up the loop, which would make the spur run along the wall. */
  const connectors: PerimeterConnector[] = [];
  const dropped: PerimeterDropped[] = [];
  const loopEdges = (): PathEdge[] => edges.filter((edge) => edge.kind === "walk" && edge.id.startsWith("walk:"));
  const loopSnapshot = nodes.map((node) => node.id);

  const nearestOnLoop = (point: Vec2): { edge: PathEdge; at: Vec2; distance: number; t: number } | null => {
    let best: { edge: PathEdge; at: Vec2; distance: number; t: number } | null = null;
    for (const edge of loopEdges()) {
      const a = edge.points[0] as Vec2;
      const b = edge.points[edge.points.length - 1] as Vec2;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSq = dx * dx + dy * dy;
      const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
      const at = { x: round3(a.x + dx * t), y: round3(a.y + dy * t) };
      const d = Math.hypot(point.x - at.x, point.y - at.y);
      if (!best || d < best.distance) best = { edge, at, distance: d, t };
    }
    return best;
  };

  for (const section of world.perimeter.connectors) {
    const entrance = existing.nodes.find((node) => node.section === section);
    if (!entrance) {
      dropped.push({ section, reason: "no entrance node for this section" });
      continue;
    }

    const owner = world.zones.find(
      (zone) =>
        !zone.circle &&
        (Math.abs(entrance.x - zone.box.x) < 0.01 ||
          Math.abs(entrance.x - (zone.box.x + zone.box.widthFt)) < 0.01 ||
          Math.abs(entrance.y - zone.box.y) < 0.01 ||
          Math.abs(entrance.y - (zone.box.y + zone.box.depthFt)) < 0.01),
    );
    const clear = world.perimeter.widthFt / 2 + world.perimeter.clearanceFt;

    // Candidate attach points: the projection onto the loop, then the loop's
    // own nodes. Both are scored the same way — fewest bends, then shortest —
    // so a door that can leave square to its wall does, and a door in a corner
    // falls back to the nearest node.
    const candidates: Vec2[] = [];
    const projection = nearestOnLoop({ x: entrance.x, y: entrance.y });
    if (projection) candidates.push(projection.at);
    for (const id of loopSnapshot) {
      const node = nodes.find((candidate) => candidate.id === id);
      if (node) candidates.push({ x: node.x, y: node.y });
    }

    let chosen: { at: Vec2; points: Vec2[]; bends: number; lengthFt: number } | null = null;
    for (const target of candidates) {
      const dx = Math.abs(target.x - entrance.x);
      const dy = Math.abs(target.y - entrance.y);
      const points: Vec2[] = [{ x: entrance.x, y: entrance.y }];
      if (dx > 0.5 && dy > 0.5) {
        if (owner) {
          // Leave square to the wall, far enough to clear its own corridor.
          const faceY = entrance.y <= owner.box.y ? owner.box.y : entrance.y >= owner.box.y + owner.box.depthFt ? owner.box.y + owner.box.depthFt : null;
          const faceX = entrance.x <= owner.box.x ? owner.box.x : entrance.x >= owner.box.x + owner.box.widthFt ? owner.box.x + owner.box.widthFt : null;
          if (faceY !== null && Math.abs(entrance.y - faceY) < 0.01) {
            points.push({ x: entrance.x, y: faceY + (target.y >= faceY ? clear : -clear) });
            points.push({ x: target.x, y: (points[points.length - 1] as Vec2).y });
          } else if (faceX !== null && Math.abs(entrance.x - faceX) < 0.01) {
            points.push({ x: faceX + (target.x >= faceX ? clear : -clear), y: entrance.y });
            points.push({ x: (points[points.length - 1] as Vec2).x, y: target.y });
          } else {
            points.push(dx >= dy ? { x: target.x, y: entrance.y } : { x: entrance.x, y: target.y });
          }
        } else {
          points.push(dx >= dy ? { x: target.x, y: entrance.y } : { x: entrance.x, y: target.y });
        }
      }
      points.push({ x: target.x, y: target.y });

      let blocked = false;
      for (let i = 1; i < points.length && !blocked; i += 1) {
        if (crossesSolid(world, points[i - 1] as Vec2, points[i] as Vec2)) blocked = true;
      }
      if (blocked) continue;
      // The loop keeps clear of the pond ring; a spur may end at the ring's own
      // door (that section opens onto the ring) but must not cut across it.
      if (pond?.circle && ring !== null && section !== "pond_ring") {
        const keepOut = ring + margin;
        let inside = false;
        for (let i = 1; i < points.length && !inside; i += 1) {
          const from = points[i - 1] as Vec2;
          const to = points[i] as Vec2;
          const steps = Math.max(1, Math.ceil(distance(from, to) / 0.5));
          for (let k = 0; k <= steps && !inside; k += 1) {
            const p = { x: from.x + ((to.x - from.x) * k) / steps, y: from.y + ((to.y - from.y) * k) / steps };
            if (Math.hypot(p.x - pond.circle.cx, p.y - pond.circle.cy) < keepOut) inside = true;
          }
        }
        if (inside) continue;
      }
      const walkOnly = edges.filter((edge) => edge.kind !== "walk");
      if (crossingsOf(points.slice(0, -1), walkOnly) > 0) continue;

      const lengthFt = points.reduce((sum, point, index) => (index === 0 ? 0 : sum + distance(points[index - 1] as Vec2, point)), 0);
      const bends = points.length - 2;
      const better =
        !chosen ||
        bends < chosen.bends ||
        (bends === chosen.bends && lengthFt < chosen.lengthFt);
      if (better) chosen = { at: target, points, bends, lengthFt };
    }

    if (!chosen) {
      dropped.push({ section, reason: "no clean link from the loop" });
      continue;
    }

    // Make the attach point a node: split the loop edge it landed on.
    let attach = nodes.find((node) => Math.hypot(node.x - chosen.at.x, node.y - chosen.at.y) < 0.01) ?? null;
    if (!attach) {
      attach = { id: `walk_join_${section}`, x: chosen.at.x, y: chosen.at.y, role: "walk" };
      nodes.push(attach);
      const host = loopEdges().find((edge) => {
        const a = edge.points[0] as Vec2;
        const b = edge.points[edge.points.length - 1] as Vec2;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lengthSq = dx * dx + dy * dy;
        const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((chosen.at.x - a.x) * dx + (chosen.at.y - a.y) * dy) / lengthSq));
        return Math.hypot(chosen.at.x - (a.x + dx * t), chosen.at.y - (a.y + dy * t)) < 0.01 && t > 0.01 && t < 0.99;
      });
      if (host) {
        const index = edges.indexOf(host);
        const [first, second] = splitEdge(host, { x: attach.x, y: attach.y }, attach);
        edges.splice(index, 1, first, second);
      }
    }
    if (attach.id === entrance.id) {
      dropped.push({ section, reason: "the section node already sits on the loop" });
      continue;
    }

    edges.push({
      id: `walk-connector:${section}`,
      from: entrance.id,
      to: attach.id,
      widthFt: world.perimeter.widthFt,
      kind: "walk",
      points: chosen.points,
    });
    connectors.push({ section, fromNode: entrance.id, toNode: attach.id, lengthFt: round3(chosen.lengthFt) });
  }

  return {
    loop: { points, nodeIds: nodes.map((node) => node.id), lengthFt: round3(lengthFt) },
    nodes,
    edges,
    connectors,
    junctions: [],
    dropped,
    fit,
    widthFt: world.perimeter.widthFt,
  };
}

function segmentHit(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const q = { x: d.x - c.x, y: d.y - c.y };
  const denominator = r.x * q.y - r.y * q.x;
  if (Math.abs(denominator) < 1e-9) return null;
  const t = ((c.x - a.x) * q.y - (c.y - a.y) * q.x) / denominator;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / denominator;
  if (t <= 0.001 || t >= 0.999 || u <= 0.001 || u >= 0.999) return null;
  return { x: a.x + r.x * t, y: a.y + r.y * t };
}

function splitEdge(edge: PathEdge, point: Vec2, junction: PathNode): [PathEdge, PathEdge] {
  const points = edge.points.slice();
  let index = 1;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as Vec2;
    const b = points[i] as Vec2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
    const d = Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
    if (d < best) {
      best = d;
      index = i;
    }
  }
  const before = [...points.slice(0, index), { x: point.x, y: point.y }];
  const after = [{ x: point.x, y: point.y }, ...points.slice(index)];
  return [
    { id: `${edge.from}--${junction.id}`, from: edge.from, to: junction.id, widthFt: edge.widthFt, kind: edge.kind, points: before },
    { id: `${junction.id}--${edge.to}`, from: junction.id, to: edge.to, widthFt: edge.widthFt, kind: edge.kind, points: after },
  ];
}

/**
 * Where the garden walk crosses an existing leg, both are split at the
 * crossing: two paths that share a point must share a node, or the junction is
 * only drawn, not walkable. Returns the new junction nodes.
 */
export function joinWalkCrossings(nodes: PathNode[], edges: PathEdge[]): PathNode[] {
  const added: PathNode[] = [];
  for (let guard = 0; guard < 64; guard += 1) {
    let found: { point: Vec2; walk: PathEdge; other: PathEdge } | null = null;
    for (const walk of edges) {
      if (walk.kind !== "walk") continue;
      for (const other of edges) {
        // The pond ring stays a clean closed polygon of uniform arcs.
        if (other.kind === "walk" || other.kind === "ring" || other === walk) continue;
        for (let i = 1; i < walk.points.length && !found; i += 1) {
          for (let j = 1; j < other.points.length && !found; j += 1) {
            const hit = segmentHit(
              walk.points[i - 1] as Vec2,
              walk.points[i] as Vec2,
              other.points[j - 1] as Vec2,
              other.points[j] as Vec2,
            );
            // A crossing right at an endpoint is not a crossing: the two legs
            // already meet at that node, and splitting there would leave a
            // pair of edges between the same two junctions.
            if (!hit) continue;
            const ends = [
              walk.points[0],
              walk.points[walk.points.length - 1],
              other.points[0],
              other.points[other.points.length - 1],
            ];
            const nearEnd = ends.some((end) => end !== undefined && Math.hypot(hit.x - end.x, hit.y - end.y) < 0.5);
            if (!nearEnd) found = { point: hit, walk, other };
          }
        }
        if (found) break;
      }
      if (found) break;
    }
    if (!found) break;

    const junction: PathNode = {
      id: `walk_junction_${added.length}`,
      x: round3(found.point.x),
      y: round3(found.point.y),
      role: "walk",
    };
    added.push(junction);
    nodes.push(junction);

    const replace = (edge: PathEdge): void => {
      const index = edges.indexOf(edge);
      if (index < 0) return;
      const [first, second] = splitEdge(edge, { x: junction.x, y: junction.y }, junction);
      edges.splice(index, 1, first, second);
    };
    replace(found.walk);
    replace(found.other);
  }
  return added;
}
