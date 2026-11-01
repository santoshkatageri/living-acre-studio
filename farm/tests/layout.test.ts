import { describe, expect, test } from "vitest";

import layoutJson from "../data/farm-layout-v2.json";
import layoutSchema from "../data/schema/farm-layout-v2.schema.json";
import orchardJson from "../data/orchard-5layer.json";
import orchardSchema from "../data/schema/orchard-5layer.schema.json";
import { WORLD_ID, WORLD_IDS, parseWorldId } from "../src/sim/canon";
import { unsupportedKeywords, validateSchema, type SchemaNode } from "../src/sim/json-schema";
import {
  FT_PER_M,
  INTERIOR_M,
  LAYOUT,
  ORCHARD_LAYERS,
  layoutViolations,
  orchardViolations,
  readLayout,
  readOrchard,
  toLayout,
} from "../src/sim/layout";
import { FAULTS } from "../scripts/layout-faults";

/*  Step 1: the hectare layout and the orchard file.

    The schema checks are structural; the cross-checks are the ones the brief
    lists — a 100 m square parcel, zones inside the 5..95 m interior, no
    overlaps with each other or with a gravel path, four 22 x 24 m crop plots,
    unique ids, and the orchard's alleys and entrance inside the orchard. */

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const checksOf = (violations: { check: string }[]): string[] => violations.map((violation) => violation.check);

describe("the schema validator only claims what it can check", () => {
  test("both shipped schemas use only the supported subset", () => {
    expect(unsupportedKeywords(layoutSchema as SchemaNode)).toEqual([]);
    expect(unsupportedKeywords(orchardSchema as SchemaNode)).toEqual([]);
  });

  test("it reports the failures it should", () => {
    const schema: SchemaNode = {
      type: "object",
      required: ["a", "b"],
      additionalProperties: false,
      properties: {
        a: { type: "number", minimum: 5, maximum: 95 },
        b: { type: "array", minItems: 2, items: { enum: ["x", "y"] } },
      },
    };
    expect(validateSchema({ a: 50, b: ["x", "y"] }, schema)).toEqual([]);
    const violations = validateSchema({ a: 100, b: ["x", "z"], c: 1 }, schema);
    expect(violations.map((violation) => violation.path)).toContain("$.a");
    expect(violations.map((violation) => violation.path)).toContain("$.b[1]");
    expect(violations.map((violation) => violation.message).join(" ")).toContain('unexpected key "c"');
  });
});

describe("the saved files validate", () => {
  test("the layout has no violations and converts", () => {
    expect(layoutViolations(layoutJson)).toEqual([]);
    expect(() => readLayout(layoutJson)).not.toThrow();
  });

  test("the orchard file has no violations and converts", () => {
    expect(orchardViolations(orchardJson, LAYOUT)).toEqual([]);
    expect(() => readOrchard(orchardJson, LAYOUT)).not.toThrow();
  });

  test("the parcel is the 100 m square the brief fixes", () => {
    expect(LAYOUT.parcel.sideM).toBe(100);
    expect(LAYOUT.parcel.sideFt).toBeCloseTo(328.084, 6);
    expect(LAYOUT.parcel.areaM2).toBe(10000);
    expect(LAYOUT.parcel.sideFt).toBeCloseTo(LAYOUT.parcel.sideM * FT_PER_M, 6);
    expect(INTERIOR_M).toEqual({ min: 5, max: 95 });
  });

  test("every zone is inside the interior at the converted size", () => {
    expect(LAYOUT.zones.length).toBe(22);
    for (const zone of LAYOUT.zones) {
      expect(zone.boxM.x).toBeGreaterThanOrEqual(INTERIOR_M.min);
      expect(zone.boxM.y).toBeGreaterThanOrEqual(INTERIOR_M.min);
      expect(zone.boxM.x + zone.boxM.w).toBeLessThanOrEqual(INTERIOR_M.max);
      expect(zone.boxM.y + zone.boxM.d).toBeLessThanOrEqual(INTERIOR_M.max);
      // The feet the sim will use are the metres, to a thousandth.
      expect(zone.boxFt.widthFt).toBeCloseTo(zone.boxM.w * FT_PER_M, 2);
      expect(zone.boxFt.depthFt).toBeCloseTo(zone.boxM.d * FT_PER_M, 2);
      // And the file's own columns agree with the conversion.
      expect(zone.declaredFt.widthFt).toBeCloseTo(zone.boxFt.widthFt, 1);
    }
  });

  test("the four crop plots are 22 x 24 m and carry their crop", () => {
    const plots = LAYOUT.zones.filter((zone) => zone.kind === "crop_plot");
    expect(plots).toHaveLength(4);
    for (const plot of plots) {
      expect(plot.boxM.w).toBe(22);
      expect(plot.boxM.d).toBe(24);
      expect(LAYOUT.cropsInPlots[plot.id]).toBeTruthy();
    }
    expect(Object.values(LAYOUT.cropsInPlots).sort()).toEqual(["groundnut", "jowar", "sunflower", "wheat"]);
  });

  test("the orchard file describes the layout's orchard zone", () => {
    const orchard = LAYOUT.zones.find((zone) => zone.id === "orchard");
    expect(orchard).toBeDefined();
    expect(orchard?.boxM.w).toBe(25);
    expect(orchard?.boxM.d).toBe(40);
    expect(ORCHARD_LAYERS.zoneId).toBe("orchard");
    expect(ORCHARD_LAYERS.zoneSizeFt.widthFt).toBeCloseTo(orchard?.boxFt.widthFt ?? 0, 2);
    expect(ORCHARD_LAYERS.zoneSizeFt.depthFt).toBeCloseTo(orchard?.boxFt.depthFt ?? 0, 2);
    expect(ORCHARD_LAYERS.zoneSizeFt.widthFt).toBeCloseTo(82.02, 2);
    expect(ORCHARD_LAYERS.zoneSizeFt.depthFt).toBeCloseTo(131.23, 2);
  });

  test("five layers, each with its own species, and the drafts stay marked", () => {
    expect(ORCHARD_LAYERS.layers.map((layer) => layer.id)).toEqual(["L1", "L2", "L3", "L4", "L5"]);
    for (const layer of ORCHARD_LAYERS.layers) {
      expect(layer.species.length).toBeGreaterThanOrEqual(3);
      expect(layer.name.hi.length).toBeGreaterThan(0);
      expect(layer.name.kn.length).toBeGreaterThan(0);
      for (const species of layer.species) {
        expect(species.name.hi.length).toBeGreaterThan(0);
        expect(species.name.kn.length).toBeGreaterThan(0);
      }
    }
    expect(ORCHARD_LAYERS.needsReview).toContain("names.hi");
    expect(ORCHARD_LAYERS.needsReview).toContain("names.kn");
    expect(ORCHARD_LAYERS.placeholder).toBe(true);
    expect(ORCHARD_LAYERS.seed).toBe(20261101);
  });
});

describe("the validator has teeth", () => {
  test("each of the four injected faults is caught by the check it targets", () => {
    for (const fault of FAULTS) {
      const badLayout = clone(layoutJson);
      const badOrchard = clone(orchardJson);
      fault.apply(badLayout, badOrchard);
      // Every violation of both files: the orchard cross-checks need a layout
      // object even when it is the broken one, so convert without validating.
      const violations = [...layoutViolations(badLayout), ...orchardViolations(badOrchard, toLayout(badLayout))];
      expect(checksOf(violations), `${fault.id} was not caught`).toContain(fault.expectedCheck);
      // And the untouched files are still clean — that is the "revert".
      expect(layoutViolations(layoutJson)).toEqual([]);
      expect(orchardViolations(orchardJson, LAYOUT)).toEqual([]);
    }
  });

  test("a zone pushed into the belt is caught, and the real file is not", () => {
    const bad = clone(layoutJson);
    const zone = bad.zones.find((entry) => entry.id === "fish_pond");
    if (!zone) throw new Error("fish_pond is missing");
    zone.y_m = 96;
    zone.y_ft = Math.round(96 * FT_PER_M * 100) / 100;
    const violations = layoutViolations(bad);
    expect(checksOf(violations)).toContain("zone.interior");
    expect(checksOf(violations)).toContain("zone.path_overlap"); // the south walk
  });

  test("a duplicate zone id is caught", () => {
    const bad = clone(layoutJson);
    const zone = bad.zones[0];
    if (!zone) throw new Error("the layout has no zones");
    zone.id = "plot_jowar";
    expect(checksOf(layoutViolations(bad))).toContain("zone.unique");
  });
});

describe("the world switch", () => {
  test("the data asks for the hectare world by default", () => {
    expect(WORLD_ID).toBe("hectare_v2");
    expect(WORLD_IDS).toEqual(["acre_v1", "hectare_v2"]);
  });

  test("both worlds are accepted and anything else is refused", () => {
    expect(parseWorldId("acre_v1")).toBe("acre_v1");
    expect(parseWorldId("hectare_v2")).toBe("hectare_v2");
    expect(() => parseWorldId("acre_v3")).toThrow(/not one of acre_v1, hectare_v2/);
    expect(() => parseWorldId("")).toThrow();
  });
});
