import { describe, expect, test } from "vitest";

import { WORLD, zoneByKey } from "../src/sim/canon";
import { isSimError } from "../src/sim/errors";
import {
  activeCellIndex,
  cellCentre,
  cellIndexAt,
  createPlotGrid,
  describeCell,
  growOneDay,
  plantCell,
  tillCell,
  waterCell,
  type PlotGrid,
} from "../src/sim/plot";
import type { Zone } from "../src/sim/types";

/*  The 5 x 5 bed. Tilling, planting, watering and the dawn growth step. */

const beds = zoneByKey(WORLD, "vegetable_beds") as Zone;

function fresh(): PlotGrid {
  return createPlotGrid(WORLD, WORLD.plot);
}

describe("the plot grid", () => {
  test("fits inside the canon beds: 5 x 5 cells of the configured 4 ft", () => {
    const grid = fresh();
    expect(grid.rows).toBe(WORLD.plot.rows);
    expect(grid.cols).toBe(WORLD.plot.cols);
    expect(grid.cellFt).toBe(WORLD.plot.cellFt);
    // The brief fixes 4 ft per cell; it comes from data/sim_overrides.json.
    expect(grid.cellFt).toBe(4);
    expect(grid.cols * grid.cellFt).toBe(20);
    expect(grid.rows * grid.cellFt).toBe(20);
    expect(grid.cells).toHaveLength(grid.rows * grid.cols);
    expect(grid.origin.x).toBeGreaterThanOrEqual(beds.box.x);
    expect(grid.origin.x + grid.cols * grid.cellFt).toBeLessThanOrEqual(beds.box.x + beds.box.widthFt);
    expect(grid.origin.y).toBeGreaterThanOrEqual(beds.box.y);
    expect(grid.origin.y + grid.rows * grid.cellFt).toBeLessThanOrEqual(beds.box.y + beds.box.depthFt);
  });

  test("a point maps to the cell under it, and outside maps to nothing", () => {
    const grid = fresh();
    expect(cellIndexAt(grid, cellCentre(grid, 7))).toBe(7);
    expect(cellIndexAt(grid, { x: 1, y: 1 })).toBeNull();
  });

  test("the active cell is the one in front of the farmer", () => {
    const grid = fresh();
    const middle = cellCentre(grid, 12);
    expect(activeCellIndex(grid, middle, "south")).not.toBeNull();
    expect(activeCellIndex(grid, { x: 1, y: 1 }, "north")).toBeNull();
  });
});

describe("tilling, planting, watering", () => {
  test("till twice is refused, and the refusal is catchable", () => {
    const grid = tillCell(fresh(), 3);
    expect(grid.cells[3]?.tilled).toBe(true);
    try {
      tillCell(grid, 3);
      throw new Error("expected a refusal");
    } catch (error) {
      expect(isSimError(error)).toBe(true);
    }
  });

  test("planting needs tilled soil", () => {
    expect(() => plantCell(fresh(), 0, "tomato")).toThrow();
    const tilled = tillCell(fresh(), 0);
    const planted = plantCell(tilled, 0, "tomato");
    expect(planted.cells[0]?.cropId).toBe("tomato");
    expect(planted.cells[0]?.stage).toBe(0);
    expect(() => plantCell(planted, 0, "palak")).toThrow();
  });

  test("watering marks the cell and the growth step advances it once per day", () => {
    let grid = plantCell(tillCell(fresh(), 5), 5, "palak");
    grid = waterCell(grid, 5);
    expect(grid.cells[5]?.watered).toBe(true);

    const first = growOneDay(grid, WORLD.growth.stagesPerDay);
    expect(first.grown).toEqual([5]);
    expect(first.grid.cells[5]?.stage).toBe(1);
    // Dry soil does not grow twice.
    const second = growOneDay(first.grid, WORLD.growth.stagesPerDay);
    expect(second.grown).toEqual([]);
  });

  test("a crop stops at its final stage", () => {
    let grid = plantCell(tillCell(fresh(), 1), 1, "tomato");
    for (let day = 0; day < 10; day += 1) {
      grid = waterCell(grid, 1);
      grid = growOneDay(grid, WORLD.growth.stagesPerDay).grid;
    }
    expect(grid.cells[1]?.stage).toBe(3);
    expect(describeCell(grid, 1)).toContain("stage 4/4");
  });

  test("the grid is immutable: an edit returns a new grid", () => {
    const before = fresh();
    const after = tillCell(before, 2);
    expect(before.cells[2]?.tilled).toBe(false);
    expect(after.cells[2]?.tilled).toBe(true);
    expect(after.cells).not.toBe(before.cells);
  });
});
