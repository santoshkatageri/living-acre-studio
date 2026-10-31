import { describe, expect, test } from "vitest";

import canonJson from "../canon/canon-v1.json";
import overridesJson from "../data/sim_overrides.json";
import { WORLD, createWorld, networkFor, zoneByKey } from "../src/sim/canon";
import { pondCircle } from "../src/sim/pond";
import { closestPointOnBox } from "../src/sim/geometry";
import type { Zone } from "../src/sim/types";

/*  The world is the canon, plus labelled overrides. These tests recompute
    every derived value from the canon file itself. */

const canon = canonJson as unknown as {
  parcel: { width_ft: number; depth_ft: number; total_sq_ft: number };
  zones: {
    key: string;
    size_ft: { width_ft?: number; depth_ft?: number; diameter_ft?: number } | null;
    position_ft: { x: number; y: number } | null;
  }[];
};
const overrides = (overridesJson as unknown as { overrides: { zones: Record<string, { walkable: boolean }> } }).overrides;

describe("the world is the canon", () => {
  test("the parcel is canon, unchanged", () => {
    expect(WORLD.parcel.widthFt).toBe(canon.parcel.width_ft);
    expect(WORLD.parcel.depthFt).toBe(canon.parcel.depth_ft);
    expect(WORLD.parcel.totalSqFt).toBe(canon.parcel.total_sq_ft);
  });

  test("every canon zone exists, with size_ft winning over the map percentages", () => {
    expect(WORLD.zones.map((zone) => zone.key).sort()).toEqual(canon.zones.map((zone) => zone.key).sort());
    for (const raw of canon.zones) {
      const zone = zoneByKey(WORLD, raw.key) as Zone;
      if (!raw.position_ft) {
        // The gate has no canon position at all: it is a labelled placeholder.
        expect(zone.key).toBe("gate");
        continue;
      }
      expect(zone.box.x, `${raw.key} x`).toBeCloseTo(raw.position_ft.x, 6);
      expect(zone.box.y, `${raw.key} y`).toBeCloseTo(raw.position_ft.y, 6);
      // size_ft wins where the canon gives it; the pond gives a diameter.
      if (raw.size_ft?.width_ft !== undefined) {
        expect(zone.box.widthFt, `${raw.key} width`).toBe(raw.size_ft.width_ft);
      }
      if (raw.size_ft?.depth_ft !== undefined) {
        expect(zone.box.depthFt, `${raw.key} depth`).toBe(raw.size_ft.depth_ft);
      }
    }
  });

  test("the pond is a 20 ft circle at the centre of its canon box", () => {
    const pond = zoneByKey(WORLD, "pond") as Zone;
    const circle = pondCircle(WORLD);
    expect(circle.radiusFt).toBe(20);
    expect(circle.cx).toBeCloseTo(pond.box.x + pond.box.widthFt / 2, 3);
    expect(circle.cy).toBeCloseTo(pond.box.y + pond.box.depthFt / 2, 3);
    expect(pond.circle?.cx).toBe(circle.cx);
  });

  test("the placeholders are labelled and sized in the data, not in code", () => {
    const gate = zoneByKey(WORLD, "gate") as Zone;
    expect(gate.box.widthFt).toBe(1);
    expect(gate.box.depthFt).toBe(1);
    expect(gate.box.x).toBe(3);
    expect(gate.box.y).toBeCloseTo(WORLD.parcel.depthFt - 3 - 1, 6);

    const compost = zoneByKey(WORLD, "compost") as Zone;
    expect(compost.box.widthFt).toBe(8);
    expect(compost.box.depthFt).toBe(8);
  });

  test("solid is exactly the inverse of the walkable flag", () => {
    for (const zone of WORLD.zones) {
      expect(zone.solid, zone.key).toBe(!overrides.zones[zone.key]?.walkable);
    }
  });

  test("the spawn is the gate, because the data says so", () => {
    const gate = zoneByKey(WORLD, "gate") as Zone;
    expect(WORLD.movement.spawn).toBe("gate");
    expect(WORLD.player.spawn.x).toBeCloseTo(gate.box.x + gate.box.widthFt / 2, 6);
    expect(WORLD.player.spawn.y).toBeCloseTo(gate.box.y + gate.box.depthFt / 2, 6);
  });

  test("both door points are on their zone's south face at the configured offset", () => {
    for (const key of ["farmhouse", "goshala"]) {
      const zone = zoneByKey(WORLD, key) as Zone;
      const door = WORLD.doors[key];
      if (!door) throw new Error(`${key} has no door`);
      expect(door.side).toBe("south");
      expect(door.point.y).toBeCloseTo(zone.box.y + zone.box.depthFt, 6);
      expect(door.point.x).toBeCloseTo(zone.box.x + door.offsetFt, 6);
    }
  });

  test("the ring keeps its configured gap, never below one foot", () => {
    expect(WORLD.pondRing.gapFt).toBeGreaterThanOrEqual(1);
    expect(WORLD.pondRing.widthFt).toBeGreaterThan(0);
    expect(WORLD.pondRing.segments).toBeGreaterThanOrEqual(8);
  });

  test("the network builds from the world and is cached", () => {
    expect(networkFor(WORLD)).toBe(networkFor(WORLD));
    expect(networkFor(createWorld()).edges.length).toBe(networkFor(WORLD).edges.length);
  });

  test("an unknown movement mode is rejected, not guessed", () => {
    // The guard lives in createWorld; the data itself is valid.
    expect(["free", "paths_only"]).toContain(WORLD.movement.mode);
    expect(WORLD.movement.mode).toBe("paths_only");
  });

  test("every entrance is on its zone's boundary or inside a free zone", () => {
    const network = networkFor(WORLD);
    const beds = zoneByKey(WORLD, "vegetable_beds") as Zone;
    const entrance = network.entrances.find((entry) => entry.section === "vegetable_beds");
    const node = network.nodes.find((entry) => entry.id === entrance?.nodeId);
    expect(node).toBeDefined();
    const nearest = closestPointOnBox({ x: node?.x ?? 0, y: node?.y ?? 0 }, beds.box);
    expect(Math.hypot((node?.x ?? 0) - nearest.x, (node?.y ?? 0) - nearest.y)).toBeCloseTo(0, 6);
  });
});
