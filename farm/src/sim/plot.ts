import { SimError } from "./errors";
import { cropById } from "./crops";
import { facingVector, type Facing } from "./facing";
import type { Vec2, World } from "./types";

/*  The 5 x 5 bed: a grid of cells inside the vegetable_beds zone.
    Tilling, planting, watering and daily growth all live here. */

export interface PlotCell {
  cropId: string | null;
  /** 0 = just planted, crop.stages - 1 = ripe. */
  stage: number;
  tilled: boolean;
  watered: boolean;
}

export interface PlotGrid {
  zone: string;
  rows: number;
  cols: number;
  cellFt: number;
  /** North-west corner of the grid, in parcel feet. */
  origin: Vec2;
  cells: PlotCell[];
}

export interface PlotConfig {
  zone: string;
  rows: number;
  cols: number;
  cellFt: number;
}

export function createPlotGrid(world: World, config: PlotConfig): PlotGrid {
  const zone = world.zones.find((entry) => entry.key === config.zone);
  if (!zone) throw new Error(`plot.zone "${config.zone}" is not a zone`);
  const width = config.cols * config.cellFt;
  const depth = config.rows * config.cellFt;
  if (width > zone.box.widthFt || depth > zone.box.depthFt) {
    throw new Error("plot grid does not fit inside its zone");
  }
  const cells: PlotCell[] = Array.from({ length: config.rows * config.cols }, () => ({
    cropId: null,
    stage: 0,
    tilled: false,
    watered: false,
  }));
  return {
    zone: config.zone,
    rows: config.rows,
    cols: config.cols,
    cellFt: config.cellFt,
    origin: {
      x: zone.box.x + (zone.box.widthFt - width) / 2,
      y: zone.box.y + (zone.box.depthFt - depth) / 2,
    },
    cells,
  };
}

export function cellCentre(grid: PlotGrid, index: number): Vec2 {
  const col = index % grid.cols;
  const row = Math.floor(index / grid.cols);
  return {
    x: grid.origin.x + (col + 0.5) * grid.cellFt,
    y: grid.origin.y + (row + 0.5) * grid.cellFt,
  };
}

export function cellIndexAt(grid: PlotGrid, point: Vec2): number | null {
  const col = Math.floor((point.x - grid.origin.x) / grid.cellFt);
  const row = Math.floor((point.y - grid.origin.y) / grid.cellFt);
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return null;
  return row * grid.cols + col;
}

function requireCell(grid: PlotGrid, index: number): PlotCell {
  const cell = grid.cells[index];
  if (!cell) throw new Error(`plot: no cell ${index}`);
  return cell;
}

export function tillCell(grid: PlotGrid, index: number): PlotGrid {
  const cell = requireCell(grid, index);
  if (cell.tilled) throw new SimError("ALREADY_TILLED", `cell ${index} is already tilled`);
  const cells = grid.cells.slice();
  cells[index] = { ...cell, tilled: true };
  return { ...grid, cells };
}

export function plantCell(grid: PlotGrid, index: number, cropId: string): PlotGrid {
  const cell = requireCell(grid, index);
  cropById(cropId); // throws for an unknown crop
  if (!cell.tilled) throw new SimError("NOT_TILLED", `till cell ${index} before planting`);
  if (cell.cropId) throw new SimError("ALREADY_PLANTED", `cell ${index} already has ${cell.cropId}`);
  const cells = grid.cells.slice();
  cells[index] = { ...cell, cropId, stage: 0, watered: false };
  return { ...grid, cells };
}

export function waterCell(grid: PlotGrid, index: number): PlotGrid {
  const cell = requireCell(grid, index);
  if (!cell.tilled) throw new SimError("NOT_TILLED", `till cell ${index} before watering`);
  const cells = grid.cells.slice();
  cells[index] = { ...cell, watered: true };
  return { ...grid, cells };
}

/** One dawn: watered crops advance a stage, then the soil dries. */
export function growOneDay(grid: PlotGrid, stagesPerDay: number): { grid: PlotGrid; grown: number[] } {
  const grown: number[] = [];
  const cells = grid.cells.map((cell, index) => {
    if (!cell.cropId || !cell.watered) return { ...cell, watered: false };
    const crop = cropById(cell.cropId);
    const stage = Math.min(cell.stage + stagesPerDay, crop.stages - 1);
    if (stage !== cell.stage) grown.push(index);
    return { ...cell, stage, watered: false };
  });
  return { grid: { ...grid, cells }, grown };
}

/** The cell the farmer is facing, if any. */
export function activeCellIndex(grid: PlotGrid, position: Vec2, facing: Facing): number | null {
  const vector = facingVector(facing);
  const probe = {
    x: position.x + vector.x * (grid.cellFt * 0.6),
    y: position.y + vector.y * (grid.cellFt * 0.6),
  };
  return cellIndexAt(grid, probe);
}

export function describeCell(grid: PlotGrid, index: number, cropName?: string): string {
  const cell = requireCell(grid, index);
  const soil = cell.tilled ? "tilled" : "untilled";
  if (!cell.cropId) return `cell ${index} · ${soil}`;
  const crop = cropById(cell.cropId);
  const name = cropName ?? crop.id;
  return `cell ${index} · ${soil} · ${name} stage ${cell.stage + 1}/${crop.stages}${cell.watered ? " · watered" : ""}`;
}
