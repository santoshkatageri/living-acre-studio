import type { PathNetwork } from "./paths";
import type { Vec2, World } from "./types";
import { cellCentre, cellOf, gridIndex, isCellWalkable, isWalkable, type WalkableGrid } from "./walkable";

/*  A* over the 1 ft walkable grid, then string-pulled into a short, smooth
    route. Pure: no timers, no rendering, deterministic for a given grid.

    Diagonal steps need at least ONE open orthogonal neighbour. The stricter
    "both" rule is the usual one, but at 1 ft resolution the 4 ft pond ring is
    a single cell wide: all of its cells are diagonal neighbours, and requiring
    both orthogonals would make the ring an island. One orthogonal still stops
    a route slipping through a corner-to-corner gap, because the step's own
    cells are checked too. */

export interface Route {
  /** Grid cells from start to goal, inclusive. */
  cells: number[];
  /** Simplified waypoints, in feet, ending at the target cell centre. */
  points: Vec2[];
}

const SQRT2 = Math.SQRT2;

class MinHeap {
  private readonly keys: number[] = [];
  private readonly values: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, value: number): void {
    this.keys.push(key);
    this.values.push(value);
    let i = this.keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((this.keys[parent] as number) <= (this.keys[i] as number)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.values[0] as number;
    const lastKey = this.keys.pop() as number;
    const lastValue = this.values.pop() as number;
    if (this.keys.length > 0) {
      this.keys[0] = lastKey;
      this.values[0] = lastValue;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.keys.length && (this.keys[left] as number) < (this.keys[smallest] as number)) smallest = left;
        if (right < this.keys.length && (this.keys[right] as number) < (this.keys[smallest] as number)) smallest = right;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const k = this.keys[a] as number;
    this.keys[a] = this.keys[b] as number;
    this.keys[b] = k;
    const v = this.values[a] as number;
    this.values[a] = this.values[b] as number;
    this.values[b] = v;
  }
}

/** Nearest walkable cell index to a point, searching outward. */
export function nearestWalkableCell(grid: WalkableGrid, point: Vec2, maxFt = 6): number | null {
  const start = cellOf(grid, point);
  if (!start) return null;
  const maxCells = Math.ceil(maxFt / grid.cellFt);
  let best: { index: number; distance: number } | null = null;

  for (let dr = -maxCells; dr <= maxCells; dr += 1) {
    for (let dc = -maxCells; dc <= maxCells; dc += 1) {
      const col = start.col + dc;
      const row = start.row + dr;
      if (!isCellWalkable(grid, col, row)) continue;
      const centre = cellCentre(grid, gridIndex(grid, col, row));
      const d = Math.hypot(centre.x - point.x, centre.y - point.y);
      if (d > maxFt) continue;
      if (!best || d < best.distance) best = { index: gridIndex(grid, col, row), distance: d };
    }
  }
  return best?.index ?? null;
}

/** Straight-line check between two points, sampled through grid cells. */
export function lineWalkable(grid: WalkableGrid, a: Vec2, b: Vec2): boolean {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(d / (grid.cellFt * 0.5)));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const cell = cellOf(grid, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    if (!cell || !isCellWalkable(grid, cell.col, cell.row)) return false;
  }
  return true;
}

/** Pull the route straight wherever the line stays walkable. */
export function simplifyRoute(grid: WalkableGrid, points: Vec2[]): Vec2[] {
  if (points.length <= 2) return points;
  const result: Vec2[] = [points[0] as Vec2];
  let anchor = 0;
  while (anchor < points.length - 1) {
    let best = anchor + 1;
    for (let candidate = points.length - 1; candidate > anchor + 1; candidate -= 1) {
      if (lineWalkable(grid, points[anchor] as Vec2, points[candidate] as Vec2)) {
        best = candidate;
        break;
      }
    }
    result.push(points[best] as Vec2);
    anchor = best;
  }
  return result;
}

/**
 * Find a route between two points. Returns null when either end is
 * unreachable — the caller decides whether to snap or to refuse the click.
 */
export function findRoute(grid: WalkableGrid, from: Vec2, to: Vec2): Route | null {
  const startCell = cellOf(grid, from);
  const goalCell = cellOf(grid, to);
  if (!startCell || !goalCell) return null;

  const start = gridIndex(grid, startCell.col, startCell.row);
  const goal = gridIndex(grid, goalCell.col, goalCell.row);
  if (!isCellWalkable(grid, startCell.col, startCell.row)) return null;
  if (!isCellWalkable(grid, goalCell.col, goalCell.row)) return null;
  if (start === goal) {
    const centre = cellCentre(grid, start);
    return { cells: [start], points: [centre] };
  }

  const open = new MinHeap();
  const cameFrom = new Int32Array(grid.cells.length).fill(-1);
  const gScore = new Float64Array(grid.cells.length).fill(Number.POSITIVE_INFINITY);
  const closed = new Uint8Array(grid.cells.length);
  const goalCol = goal % grid.cols;
  const goalRow = Math.floor(goal / grid.cols);

  const heuristic = (index: number): number => {
    const col = index % grid.cols;
    const row = Math.floor(index / grid.cols);
    const dx = Math.abs(col - goalCol);
    const dy = Math.abs(row - goalRow);
    return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
  };

  gScore[start] = 0;
  open.push(heuristic(start), start);

  while (open.size > 0) {
    const current = open.pop();
    if (closed[current]) continue;
    closed[current] = 1;
    if (current === goal) break;

    const col = current % grid.cols;
    const row = Math.floor(current / grid.cols);

    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dc === 0 && dr === 0) continue;
        const nc = col + dc;
        const nr = row + dr;
        if (!isCellWalkable(grid, nc, nr)) continue;
        const diagonal = dc !== 0 && dr !== 0;
        if (diagonal && !isCellWalkable(grid, col + dc, row) && !isCellWalkable(grid, col, row + dr)) continue;
        const next = gridIndex(grid, nc, nr);
        if (closed[next]) continue;
        const step = diagonal ? SQRT2 : 1;
        const tentative = (gScore[current] as number) + step;
        if (tentative < (gScore[next] as number)) {
          cameFrom[next] = current;
          gScore[next] = tentative;
          open.push(tentative + heuristic(next), next);
        }
      }
    }
  }

  if (!closed[goal]) return null;

  const cells: number[] = [];
  let cursor = goal;
  while (cursor !== -1) {
    cells.push(cursor);
    cursor = cameFrom[cursor] as number;
  }
  cells.reverse();
  const points = simplifyRoute(grid, cells.map((index) => cellCentre(grid, index)));
  return { cells, points };
}

/* --------------------------- click-to-move ------------------------------ */

export interface ClickPlan {
  /** Where the farmer will actually try to stand (maybe snapped). */
  goal: Vec2;
  snapped: boolean;
  route: Route;
}

/**
 * Turn a click into a route.
 *
 * A click on walkable ground routes straight there. A click on blocked or
 * unreachable ground snaps to the nearest walkable cell within `maxSnapFt`
 * (6 ft, per the brief); beyond that, or when no route exists, the click is
 * refused and the caller shows the "Stay on the path" hint.
 */
export function planClickMove(
  world: World,
  grid: WalkableGrid,
  network: PathNetwork | null,
  from: Vec2,
  to: Vec2,
  maxSnapFt = 6,
): ClickPlan | null {
  let goal = to;
  let snapped = false;

  if (!isWalkable(world, goal, network)) {
    const cell = nearestWalkableCell(grid, goal, maxSnapFt);
    if (cell === null) return null;
    goal = cellCentre(grid, cell);
    snapped = true;
  }

  const route = findRoute(grid, from, goal);
  if (!route) return null;
  return { goal, snapped, route };
}

/** Polyline length of a route, in feet. */
export function routeLength(route: Route): number {
  let total = 0;
  for (let i = 1; i < route.points.length; i += 1) {
    const a = route.points[i - 1] as Vec2;
    const b = route.points[i] as Vec2;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}
