import { circleIntersectsBox, circleIntersectsCircle, pointInBox } from "./geometry";
import { pathMargin, type PathNetwork } from "./paths";
import type { Vec2, World, Zone } from "./types";

/* ------------------------------------------------------------------ */
/*  The walkable rule, in one place.                                   */
/*                                                                     */
/*  mode "free":       anywhere inside the parcel that is not a solid   */
/*                     zone (the pre-M3 rule, kept for comparison).     */
/*  mode "paths_only": the free zones, plus the corridor around the     */
/*                     path network. Open ground is not walkable.       */
/*                                                                     */
/*  The farmer is a circle of radius r, so a corridor's usable half     */
/*  width is width/2 - r: the body always fits inside the drawn trail.  */
/* ------------------------------------------------------------------ */

export interface WalkableGrid {
  cellFt: number;
  cols: number;
  rows: number;
  /** 1 = walkable, 0 = blocked. Index = row * cols + col. */
  cells: Uint8Array;
  /** The margin the corridors were rasterised one half-cell inside by. */
  safetyFt: number;
}

/** Usable half-width for the farmer's CENTRE on an edge of this width. */
export function corridorHalfWidth(world: World, widthFt = world.movement.pathWidthFt): number {
  return Math.max(widthFt / 2 - world.player.radiusFt, 0.25);
}

export function isSolidAt(centre: Vec2, radiusFt: number, zones: Zone[]): boolean {
  for (const zone of zones) {
    if (!zone.solid) continue;
    if (zone.circle) {
      if (circleIntersectsCircle(centre, radiusFt, { x: zone.circle.cx, y: zone.circle.cy }, zone.circle.radiusFt)) {
        return true;
      }
      continue;
    }
    if (circleIntersectsBox(centre, radiusFt, zone.box)) return true;
  }
  return false;
}

export function insideParcel(world: World, point: Vec2, radiusFt: number): boolean {
  return (
    point.x >= radiusFt &&
    point.y >= radiusFt &&
    point.x <= world.parcel.widthFt - radiusFt &&
    point.y <= world.parcel.depthFt - radiusFt
  );
}

export function zoneIsFree(world: World, zone: Zone): boolean {
  return world.movement.freeZones.includes(zone.key);
}

export function pointInFreeZone(world: World, point: Vec2): Zone | null {
  for (const zone of world.zones) {
    if (!zoneIsFree(world, zone)) continue;
    if (zone.circle) {
      const dx = point.x - zone.circle.cx;
      const dy = point.y - zone.circle.cy;
      if (dx * dx + dy * dy <= zone.circle.radiusFt * zone.circle.radiusFt) return zone;
      continue;
    }
    if (pointInBox(point, zone.box)) return zone;
  }
  return null;
}

/**
 * May the farmer's centre stand here?
 * `network` is optional only so "mode free" worlds need no path data.
 */
export function isWalkable(
  world: World,
  point: Vec2,
  network: PathNetwork | null,
  radiusFt = world.player.radiusFt,
): boolean {
  if (!insideParcel(world, point, radiusFt)) return false;
  if (isSolidAt(point, radiusFt, world.zones)) return false;
  if (world.movement.mode === "free") return true;

  if (pointInFreeZone(world, point)) return true;
  if (!network) return false;
  return pathMargin(network, point, radiusFt) >= 0;
}

/**
 * Bake the rule into a 1 ft grid for A* and the flood fill.
 * Each edge is rasterised at its own width, one half-cell narrow, but never
 * thinner than 0.9 cells: a narrower band cannot be chained at 1 ft
 * resolution (the 4 ft ring is only one cell wide) and 0.9 cells is still
 * inside the real corridor.
 */
export function buildWalkableGrid(world: World, network: PathNetwork, cellFt = 1): WalkableGrid {
  const cols = Math.ceil(world.parcel.widthFt / cellFt);
  const rows = Math.ceil(world.parcel.depthFt / cellFt);
  const cells = new Uint8Array(cols * rows);
  const safety = cellFt * 0.45;

  const markSegment = (a: Vec2, b: Vec2, half: number) => {
    const minX = Math.floor((Math.min(a.x, b.x) - half) / cellFt);
    const maxX = Math.ceil((Math.max(a.x, b.x) + half) / cellFt);
    const minY = Math.floor((Math.min(a.y, b.y) - half) / cellFt);
    const maxY = Math.ceil((Math.max(a.y, b.y) + half) / cellFt);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;

    for (let row = Math.max(0, minY); row <= Math.min(rows - 1, maxY); row += 1) {
      for (let col = Math.max(0, minX); col <= Math.min(cols - 1, maxX); col += 1) {
        const px = (col + 0.5) * cellFt;
        const py = (row + 0.5) * cellFt;
        const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((px - a.x) * dx + (py - a.y) * dy) / lengthSq));
        const distance = Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t));
        if (distance <= half) cells[row * cols + col] = 1;
      }
    }
  };

  if (world.movement.mode === "free") {
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const point = { x: (col + 0.5) * cellFt, y: (row + 0.5) * cellFt };
        cells[row * cols + col] = isWalkable(world, point, network) ? 1 : 0;
      }
    }
    return { cellFt, cols, rows, cells, safetyFt: safety };
  }

  for (const edge of network.edges) {
    const trueHalf = corridorHalfWidth(world, edge.widthFt);
    const half = Math.max(trueHalf - safety, Math.min(trueHalf, cellFt * 0.9));
    for (let i = 1; i < edge.points.length; i += 1) {
      markSegment(edge.points[i - 1] as Vec2, edge.points[i] as Vec2, half);
    }
  }

  for (const zone of world.zones) {
    if (!zoneIsFree(world, zone)) continue;
    const box = zone.circle
      ? {
          x: zone.circle.cx - zone.circle.radiusFt,
          y: zone.circle.cy - zone.circle.radiusFt,
          widthFt: zone.circle.radiusFt * 2,
          depthFt: zone.circle.radiusFt * 2,
        }
      : zone.box;
    const minX = Math.max(0, Math.floor(box.x / cellFt));
    const maxX = Math.min(cols - 1, Math.ceil((box.x + box.widthFt) / cellFt));
    const minY = Math.max(0, Math.floor(box.y / cellFt));
    const maxY = Math.min(rows - 1, Math.ceil((box.y + box.depthFt) / cellFt));
    for (let row = minY; row <= maxY; row += 1) {
      for (let col = minX; col <= maxX; col += 1) {
        const point = { x: (col + 0.5) * cellFt, y: (row + 0.5) * cellFt };
        if (zone.circle) {
          const dx = point.x - zone.circle.cx;
          const dy = point.y - zone.circle.cy;
          if (dx * dx + dy * dy > zone.circle.radiusFt * zone.circle.radiusFt) continue;
        } else if (!pointInBox(point, zone.box)) {
          continue;
        }
        if (!insideParcel(world, point, world.player.radiusFt)) continue;
        cells[row * cols + col] = 1;
      }
    }
  }

  // Solid zones win, at the farmer's radius.
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col;
      if (cells[index] !== 1) continue;
      const point = { x: (col + 0.5) * cellFt, y: (row + 0.5) * cellFt };
      if (isSolidAt(point, world.player.radiusFt, world.zones)) cells[index] = 0;
    }
  }

  return { cellFt, cols, rows, cells, safetyFt: safety };
}

export function gridIndex(grid: WalkableGrid, col: number, row: number): number {
  return row * grid.cols + col;
}

export function cellCentre(grid: WalkableGrid, index: number): Vec2 {
  const col = index % grid.cols;
  const row = Math.floor(index / grid.cols);
  return { x: (col + 0.5) * grid.cellFt, y: (row + 0.5) * grid.cellFt };
}

export function cellOf(grid: WalkableGrid, point: Vec2): { col: number; row: number } | null {
  const col = Math.floor(point.x / grid.cellFt);
  const row = Math.floor(point.y / grid.cellFt);
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return null;
  return { col, row };
}

export function isCellWalkable(grid: WalkableGrid, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return false;
  return grid.cells[row * grid.cols + col] === 1;
}

/**
 * Flood fill from a point; returns the set of reachable cell indices.
 * 8-connected, matching what A* may step: a diagonal needs at least one open
 * orthogonal neighbour, or the 1 ft-wide ring band would be an island.
 */
export function floodFill(grid: WalkableGrid, start: Vec2): Set<number> {
  const startCell = cellOf(grid, start);
  const reached = new Set<number>();
  if (!startCell || !isCellWalkable(grid, startCell.col, startCell.row)) return reached;

  const queue: number[] = [gridIndex(grid, startCell.col, startCell.row)];
  reached.add(queue[0] as number);

  while (queue.length > 0) {
    const index = queue.pop() as number;
    const col = index % grid.cols;
    const row = Math.floor(index / grid.cols);
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dc === 0 && dr === 0) continue;
        if (dc !== 0 && dr !== 0) {
          if (!isCellWalkable(grid, col + dc, row) && !isCellWalkable(grid, col, row + dr)) continue;
        }
        const nc = col + dc;
        const nr = row + dr;
        if (!isCellWalkable(grid, nc, nr)) continue;
        const next = gridIndex(grid, nc, nr);
        if (reached.has(next)) continue;
        reached.add(next);
        queue.push(next);
      }
    }
  }
  return reached;
}

/** Cell indices whose centre lies inside a zone footprint (for the tests). */
export function cellsInZone(grid: WalkableGrid, zone: Zone): number[] {
  const hits: number[] = [];
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const point = { x: (col + 0.5) * grid.cellFt, y: (row + 0.5) * grid.cellFt };
      const inside = zone.circle
        ? Math.hypot(point.x - zone.circle.cx, point.y - zone.circle.cy) <= zone.circle.radiusFt
        : pointInBox(point, zone.box);
      if (inside) hits.push(gridIndex(grid, col, row));
    }
  }
  return hits;
}
