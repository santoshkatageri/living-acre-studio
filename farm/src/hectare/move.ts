import type { HectareWorld } from "./world";
import type { Vec2 } from "../sim/types";

/*  Walking the hectare: the grid, the route, and the walker.

    The grid is 1 ft per cell over the parcel. A cell is walkable when it is
    inside a walkable space or on a path, give or take a shoulder's width; a pen, a
    building, the pond and the open ground between plots are not. That is the rule
    the whole tour and every click obey, and it is the reason a click on the middle
    of a closed pond is refused rather than walked through.

    The shoulder matters: several plots sit a couple of feet off the lane they are
    reached from, and a grid that insisted on touching edges would make them
    islands. `CORRIDOR_FT` says how far a walkable edge carries.

    A* is the usual 8-connected search with a diagonal cost of root two and a rule
    that a diagonal step needs at least one open orthogonal neighbour: at 1 ft
    resolution the 4 ft pond ring is a single cell wide, and requiring both would
    make it an island. The route is then string-pulled, so the farmer walks
    straight lines instead of a staircase. */

export interface MoveGrid {
  cellFt: number;
  cols: number;
  rows: number;
  /** 1 = walkable, 0 = blocked. Index = row * cols + col. */
  cells: Uint8Array;
  /** How far in from the parcel edge the farmer's centre may go. */
  insetFt: number;
}

export interface Route {
  points: Vec2[];
  /** The click was not on walkable ground and was pulled to the nearest cell. */
  snapped: boolean;
}

const SQRT2 = Math.SQRT2;

/** How far a walkable edge carries past its own box: a shoulder, not a wall. */
export const CORRIDOR_FT = 2.2;

export function buildMoveGrid(world: HectareWorld, cellFt = 1): MoveGrid {
  const insetFt = world.farmer.radiusFt;
  const cols = Math.ceil(world.parcel.widthFt / cellFt);
  const rows = Math.ceil(world.parcel.depthFt / cellFt);
  const cells = new Uint8Array(cols * rows);

  const inBox = (x: number, y: number, box: { x: number; y: number; widthFt: number; depthFt: number }): boolean =>
    x >= box.x && x <= box.x + box.widthFt && y >= box.y && y <= box.y + box.depthFt;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = (col + 0.5) * cellFt;
      const y = (row + 0.5) * cellFt;
      let open = x >= insetFt && y >= insetFt && x <= world.parcel.widthFt - insetFt && y <= world.parcel.depthFt - insetFt;
      if (open) {
        for (const zone of world.zones) {
          if (zone.walkable) continue;
          if (inBox(x, y, zone.box)) {
            open = false;
            break;
          }
        }
      }
      if (open) {
        const near = (box: { x: number; y: number; widthFt: number; depthFt: number }): boolean =>
          inBox(x, y, {
            x: box.x - CORRIDOR_FT,
            y: box.y - CORRIDOR_FT,
            widthFt: box.widthFt + CORRIDOR_FT * 2,
            depthFt: box.depthFt + CORRIDOR_FT * 2,
          });
        const onPath = world.paths.some((path) => near(path.box));
        const onZone = world.zones.some((zone) => zone.walkable && near(zone.box));
        open = onPath || onZone;
      }
      cells[row * cols + col] = open ? 1 : 0;
    }
  }
  return { cellFt, cols, rows, cells, insetFt };
}

export function cellIndexOf(grid: MoveGrid, point: Vec2): number | null {
  const col = Math.floor(point.x / grid.cellFt);
  const row = Math.floor(point.y / grid.cellFt);
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return null;
  return row * grid.cols + col;
}

export function cellCentreOf(grid: MoveGrid, index: number): Vec2 {
  const col = index % grid.cols;
  const row = Math.floor(index / grid.cols);
  return { x: (col + 0.5) * grid.cellFt, y: (row + 0.5) * grid.cellFt };
}

export function isOpen(grid: MoveGrid, index: number): boolean {
  return grid.cells[index] === 1;
}

/** The nearest open cell, searched outward a ring at a time. */
export function nearestOpen(grid: MoveGrid, point: Vec2, maxCells = 10): number | null {
  const start = cellIndexOf(grid, point);
  if (start !== null && isOpen(grid, start)) return start;
  const col = Math.floor(point.x / grid.cellFt);
  const row = Math.floor(point.y / grid.cellFt);
  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let radius = 1; radius <= maxCells; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const c = col + dx;
        const r = row + dy;
        if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) continue;
        const index = r * grid.cols + c;
        if (!isOpen(grid, index)) continue;
        const distance = Math.hypot(dx, dy);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      }
    }
    if (best !== null) return best;
  }
  return best;
}

/** Is every cell along the segment open? Used to string-pull the route. */
export function lineOpen(grid: MoveGrid, a: Vec2, b: Vec2): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (grid.cellFt * 0.5));
  for (let step = 0; step <= steps; step += 1) {
    const t = steps === 0 ? 0 : step / steps;
    const index = cellIndexOf(grid, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    if (index === null || !isOpen(grid, index)) return false;
  }
  return true;
}

function simplify(grid: MoveGrid, points: Vec2[]): Vec2[] {
  if (points.length <= 2) return points;
  const out: Vec2[] = [points[0] as Vec2];
  let anchor = 0;
  for (let index = 2; index < points.length; index += 1) {
    if (!lineOpen(grid, points[anchor] as Vec2, points[index] as Vec2)) {
      anchor = index - 1;
      out.push(points[anchor] as Vec2);
    }
  }
  out.push(points[points.length - 1] as Vec2);
  return out;
}

/** A* from one cell to another, or null when the walk is impossible. */
export function findRoute(grid: MoveGrid, from: Vec2, to: Vec2): Route | null {
  const start = nearestOpen(grid, from);
  if (start === null) return null;
  const goalCell = cellIndexOf(grid, to);
  const goal = goalCell !== null && isOpen(grid, goalCell) ? goalCell : nearestOpen(grid, to);
  if (goal === null) return null;
  const snapped = !(goalCell !== null && goalCell === goal);

  const size = grid.cols * grid.rows;
  const cameFrom = new Int32Array(size).fill(-1);
  const cost = new Float64Array(size).fill(Number.POSITIVE_INFINITY);
  const closed = new Uint8Array(size);

  const goalCol = goal % grid.cols;
  const goalRow = Math.floor(goal / grid.cols);
  const heuristics = (index: number): number => {
    const dx = Math.abs((index % grid.cols) - goalCol);
    const dy = Math.abs(Math.floor(index / grid.cols) - goalRow);
    return (dx + dy) + (SQRT2 - 2) * Math.min(dx, dy);
  };

  // A binary heap of indices keyed by f; small enough to inline.
  const heap: { index: number; f: number }[] = [];
  const push = (index: number, f: number): void => {
    heap.push({ index, f });
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((heap[parent] as { f: number }).f <= (heap[i] as { f: number }).f) break;
      [heap[parent], heap[i]] = [heap[i] as { index: number; f: number }, heap[parent] as { index: number; f: number }];
      i = parent;
    }
  };
  const pop = (): number => {
    const top = heap[0] as { index: number; f: number };
    const last = heap.pop() as { index: number; f: number };
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < heap.length && (heap[left] as { f: number }).f < (heap[smallest] as { f: number }).f) smallest = left;
        if (right < heap.length && (heap[right] as { f: number }).f < (heap[smallest] as { f: number }).f) smallest = right;
        if (smallest === i) break;
        [heap[smallest], heap[i]] = [heap[i] as { index: number; f: number }, heap[smallest] as { index: number; f: number }];
        i = smallest;
      }
    }
    return top.index;
  };

  cost[start] = 0;
  push(start, heuristics(start));
  while (heap.length > 0) {
    const current = pop();
    if (current === goal) break;
    if (closed[current] === 1) continue;
    closed[current] = 1;
    const col = current % grid.cols;
    const row = Math.floor(current / grid.cols);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const c = col + dx;
        const r = row + dy;
        if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) continue;
        const neighbour = r * grid.cols + c;
        if (!isOpen(grid, neighbour)) continue;
        if (dx !== 0 && dy !== 0) {
          // One open orthogonal neighbour is enough: the pond ring is one cell wide.
          const a = r * grid.cols + col;
          const b = row * grid.cols + c;
          if (!isOpen(grid, a) && !isOpen(grid, b)) continue;
        }
        const step = dx === 0 || dy === 0 ? 1 : SQRT2;
        const tentative = (cost[current] as number) + step;
        if (tentative < (cost[neighbour] as number)) {
          cost[neighbour] = tentative;
          cameFrom[neighbour] = current;
          push(neighbour, tentative + heuristics(neighbour));
        }
      }
    }
  }

  if (cameFrom[goal] === -1 && goal !== start) return null;
  const points: Vec2[] = [];
  for (let index = goal; index !== -1; index = cameFrom[index] as number) {
    points.push(cellCentreOf(grid, index));
    if (index === start) break;
  }
  points.reverse();
  return { points: simplify(grid, points), snapped };
}

/** Total feet left on the route, from a point partway along it. */
export function remainingFt(route: Vec2[] | null, from: Vec2): number {
  if (!route || route.length === 0) return 0;
  let total = Math.hypot((route[0] as Vec2).x - from.x, (route[0] as Vec2).y - from.y);
  for (let index = 1; index < route.length; index += 1) {
    total += Math.hypot((route[index] as Vec2).x - (route[index - 1] as Vec2).x, (route[index] as Vec2).y - (route[index - 1] as Vec2).y);
  }
  return total;
}
