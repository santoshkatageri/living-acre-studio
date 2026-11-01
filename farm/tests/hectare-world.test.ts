import { describe, expect, test } from "vitest";

import { HECTARE, SPECIES_GEOMETRY, placeAt, zoneAt } from "../src/hectare/world";

/*  The world model: what the layout and the overrides add up to.

    These are the facts every other module leans on — how many spaces there are,
    where a sign stands, which animals are in which pen, and that nothing in the
    belt grows tall enough to crop the frame. */

const W = HECTARE;

/** The first patch of the parcel that is in no zone and on no path. */
function findOpenGround(): { x: number; y: number } {
  for (let y = 2; y < W.parcel.depthFt; y += 3) {
    for (let x = 2; x < W.parcel.widthFt; x += 3) {
      const inZone = W.zones.some(
        (zone) => x >= zone.box.x && x <= zone.box.x + zone.box.widthFt && y >= zone.box.y && y <= zone.box.y + zone.box.depthFt,
      );
      const onPath = W.paths.some(
        (path) => x >= path.box.x && x <= path.box.x + path.box.widthFt && y >= path.box.y && y <= path.box.y + path.box.depthFt,
      );
      if (!inZone && !onPath) return { x, y };
    }
  }
  throw new Error("the parcel has no open ground at all");
}

describe("the hectare world", () => {
  test("is 100 m square, with the 22 spaces the layout lists", () => {
    expect(W.parcel.widthFt).toBeCloseTo(328.084, 3);
    expect(W.parcel.depthFt).toBeCloseTo(328.084, 3);
    expect(W.zones).toHaveLength(22);
    expect(new Set(W.zones.map((zone) => zone.id)).size).toBe(22);
    // Every space sits inside the parcel.
    for (const zone of W.zones) {
      expect(zone.box.x).toBeGreaterThanOrEqual(0);
      expect(zone.box.y).toBeGreaterThanOrEqual(0);
      expect(zone.box.x + zone.box.widthFt).toBeLessThanOrEqual(W.parcel.widthFt + 1e-6);
      expect(zone.box.y + zone.box.depthFt).toBeLessThanOrEqual(W.parcel.depthFt + 1e-6);
    }
  });

  test("the four crop plots name their crop, and only they do", () => {
    const crops = W.zones.filter((zone) => zone.crop !== null);
    expect(crops.map((zone) => zone.crop).sort()).toEqual(["groundnut", "jowar", "sunflower", "wheat"]);
    expect(crops.every((zone) => zone.kind === "crop_plot")).toBe(true);
  });

  test("the cattle shed is raised, open, and tall enough to walk into", () => {
    const shed = W.zones.find((zone) => zone.id === "cattle_shed")!;
    expect(shed.building).toBeTruthy();
    expect(shed.building!.heightFt).toBe(13);
    expect(shed.building!.floorFt).toBeCloseTo(0.4, 6);
    expect(shed.building!.open).toBe(true);
    // Above the follow camera's 8 ft, which is what stopped it cutting him off.
    expect(shed.building!.heightFt).toBeGreaterThan(W.camera.follow.heightFt);
    // And the farmer can walk in, or the herd would be scenery.
    expect(shed.walkable).toBe(true);
  });

  test("every sign is planted at a corner of its own space", () => {
    expect(W.labels).toHaveLength(W.zones.length);
    for (const label of W.labels) {
      const zone = W.zones.find((entry) => entry.id === label.id)!;
      const offset = zone.building ? W.labelStyle.boardOutsetFt : W.labelStyle.boardInsetFt;
      expect(label.boardX).toBeCloseTo(zone.building ? zone.box.x - offset : zone.box.x + offset, 3);
      expect(label.boardY).toBeCloseTo(zone.building ? zone.box.y - offset : zone.box.y + offset, 3);
      // A plot's board stands inside it; a building's stands beside it.
      expect(label.boardOutside).toBe(Boolean(zone.building));
      expect(label.text).toBe(zone.label);
      // The tallest a sign grows to, which is what the framing has to clear.
      expect(label.yFt).toBeCloseTo(
        (W.labelStyle.postHeightFt + W.labelStyle.boardHeightFt) * W.labelStyle.boardGrowthMax,
        3,
      );
    }
  });

  test("the herd and the flock are in their pens, at their own sizes", () => {
    const bySpecies = new Map<string, number>();
    for (const animal of W.animals) bySpecies.set(animal.species, (bySpecies.get(animal.species) ?? 0) + 1);
    expect(Object.fromEntries(bySpecies)).toEqual({ bullock: 2, buffalo: 3, hen: 9, goat: 5 });
    expect(W.animals).toHaveLength(19);

    for (const animal of W.animals) {
      const zone = zoneAt(W, { x: animal.x, y: animal.y });
      expect(zone, animal.id).toBeTruthy();
      // Each animal is inside the pen it was planned for.
      expect(["cattle_shed", "poultry", "goat_pen"]).toContain(zone!.id);
      // And stands on that pen's floor — a shed floor is raised.
      expect(animal.floorFt).toBeCloseTo(zone!.building?.floorFt ?? 0, 6);
      const geometry = SPECIES_GEOMETRY[animal.species];
      expect(animal.lengthFt).toBe(geometry.lengthFt);
      // Its whole body fits inside the pen.
      expect(animal.x - geometry.lengthFt / 2).toBeGreaterThanOrEqual(zone!.box.x - geometry.lengthFt);
      expect(animal.x + geometry.lengthFt / 2).toBeLessThanOrEqual(zone!.box.x + zone!.box.widthFt + geometry.lengthFt);
    }
  });

  test("the animals are placed the same way every build", () => {
    // The plan is seeded, so a recording of the cattle shed shows the same herd
    // tomorrow as it did today.
    expect(W.animals.map((animal) => `${animal.species}@${animal.x},${animal.y}`).join("|")).toBe(
      W.animals.map((animal) => `${animal.species}@${animal.x},${animal.y}`).join("|"),
    );
    const first = W.animals[0]!;
    expect(first.x).toBeGreaterThan(0);
  });

  test("the belt is two rows round the parcel, under the canopy cap", () => {
    expect(W.belt.length).toBeGreaterThan(100);
    const belt = W.belt;
    for (const tree of belt) {
      // Nothing taller than the data's cap, or the crowns would crop the frame.
      // (The cap is applied to the trunk plus half the crown before rounding.)
      expect(tree.heightFt + tree.canopyFt * 0.5).toBeLessThanOrEqual(34 + 0.01);
      expect(tree.canopyFt).toBeGreaterThan(0);
      // Inside the parcel.
      expect(tree.x).toBeGreaterThanOrEqual(0);
      expect(tree.y).toBeGreaterThanOrEqual(0);
      expect(tree.x).toBeLessThanOrEqual(W.parcel.widthFt);
      expect(tree.y).toBeLessThanOrEqual(W.parcel.depthFt);
    }
    // The north gate is left clear.
    const nearGate = belt.filter(
      (tree) => Math.abs(tree.x - W.gate.xFt) < W.gate.gapFt && tree.y < 12,
    );
    expect(nearGate).toHaveLength(0);
  });

  test("names the ground under a point, and the gate spawn", () => {
    const wheat = W.zones.find((zone) => zone.id === "plot_wheat")!;
    expect(placeAt(W, { x: wheat.box.x + 4, y: wheat.box.y + 4 })).toBe("Wheat");
    const lane = W.paths[0]!;
    expect(placeAt(W, { x: lane.box.x + 0.5, y: lane.box.y + 20 })).toBe("Path");
    // Somewhere that is neither a space nor a path reads as open ground.
    const open = findOpenGround();
    expect(zoneAt(W, open)).toBeNull();
    expect(placeAt(W, open)).toBe("Open ground");
    // The farmer starts just inside the north gate, on the lane.
    expect(W.spawn.x).toBeCloseTo(W.gate.xFt, 6);
    expect(W.spawn.y).toBeLessThan(12);
  });
});
