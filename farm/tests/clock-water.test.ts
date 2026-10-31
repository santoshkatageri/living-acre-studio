import { describe, expect, test } from "vitest";

import { WORLD, zoneByKey } from "../src/sim/canon";
import { advanceClock, createClock, dayProgress, formatClock } from "../src/sim/clock";
import { isSimError } from "../src/sim/errors";
import type { Zone } from "../src/sim/types";
import { createTank, refillTank, spendWater } from "../src/sim/water";

/*  The clock drives growth; the tank limits watering and refills only at the
    pond. Both are configured from sim_overrides. */

describe("the clock", () => {
  test("starts at the configured hour and counts days", () => {
    const clock = createClock(WORLD.clock);
    expect(formatClock(clock, WORLD.clock)).toBe(`${String(WORLD.clock.startHour).padStart(2, "0")}:00`);
    expect(clock.day).toBe(1);

    const after = advanceClock(clock, WORLD.clock.daySeconds, WORLD.clock);
    expect(after.daysPassed).toBe(1);
    expect(after.clock.day).toBe(2);
  });

  test("a partial tick does not pass a day, and progress is 0..1", () => {
    const clock = createClock(WORLD.clock);
    const tick = advanceClock(clock, WORLD.clock.daySeconds / 4, WORLD.clock);
    expect(tick.daysPassed).toBe(0);
    expect(dayProgress(tick.clock, WORLD.clock)).toBeGreaterThan(0);
    expect(dayProgress(tick.clock, WORLD.clock)).toBeLessThanOrEqual(1);
  });

  test("time wraps at midnight instead of running past a day", () => {
    let clock = createClock(WORLD.clock);
    for (let i = 0; i < 40; i += 1) clock = advanceClock(clock, WORLD.clock.daySeconds / 7, WORLD.clock).clock;
    expect(clock.secondsInDay).toBeLessThan(WORLD.clock.daySeconds);
    expect(clock.day).toBeGreaterThan(1);
  });
});

describe("the tank", () => {
  test("starts full and spends one use at a time", () => {
    const tank = createTank(WORLD);
    expect(tank.level).toBe(WORLD.water.capacity);
    expect(spendWater(tank, WORLD.water.perUse).level).toBe(WORLD.water.capacity - WORLD.water.perUse);
  });

  test("an empty tank refuses, and the refusal is catchable", () => {
    let tank = createTank(WORLD);
    for (let i = 0; i < WORLD.water.capacity; i += 1) tank = spendWater(tank, WORLD.water.perUse);
    expect(tank.level).toBe(0);
    try {
      spendWater(tank, WORLD.water.perUse);
      throw new Error("expected a refusal");
    } catch (error) {
      expect(isSimError(error)).toBe(true);
    }
  });

  test("refilling works only beside the pond", () => {
    const pond = zoneByKey(WORLD, "pond") as Zone;
    const nearPond = {
      x: (pond.circle?.cx ?? 0) + (pond.circle?.radiusFt ?? 0) + 2,
      y: pond.circle?.cy ?? 0,
    };
    const empty = { level: 0, capacity: WORLD.water.capacity };

    expect(refillTank(empty, WORLD, nearPond).level).toBe(WORLD.water.capacity);
    expect(() => refillTank(empty, WORLD, { x: 10, y: 10 })).toThrow();
    expect(() => refillTank(createTank(WORLD), WORLD, nearPond)).toThrow(); // already full
  });
});
