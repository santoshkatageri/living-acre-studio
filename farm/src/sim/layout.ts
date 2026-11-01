import layoutJson from "../../data/farm-layout-v2.json";
import layoutSchema from "../../data/schema/farm-layout-v2.schema.json";
import orchardJson from "../../data/orchard-5layer.json";
import orchardSchema from "../../data/schema/orchard-5layer.schema.json";

import { validateSchema, type SchemaNode, type SchemaViolation } from "./json-schema";

/*  The hectare layout (world "hectare_v2").

    Metres are authoritative in the data; the sim works in feet, so every box
    is converted once here and the file's own *_ft columns are checked against
    the conversion rather than trusted. Both files are imported at build time
    and validated on load: a bad layout throws instead of rendering.

    Everything in the data is a PLACEHOLDER estimated from the reference
    blueprint; nothing here invents a value. */

export const FT_PER_M = 3.28084;

/** The usable interior: no zone may start before 5 m or end after 95 m. */
export const INTERIOR_M = { min: 5, max: 95 } as const;

/** Tolerance on the file's 2-decimal foot columns. */
const FT_TOLERANCE = 0.01;

export type ZoneKind =
  | "crop_plot"
  | "rotational_strip"
  | "orchard"
  | "vegetables"
  | "livestock"
  | "water"
  | "building"
  | "yard";

export interface LayoutRectM {
  x: number;
  y: number;
  w: number;
  d: number;
}

export interface LayoutRectFt {
  x: number;
  y: number;
  widthFt: number;
  depthFt: number;
}

export interface LayoutZone {
  id: string;
  ref: string;
  label: string;
  kind: ZoneKind;
  walkable: boolean;
  placeholder: boolean;
  /** Metres, as written in the file. */
  boxM: LayoutRectM;
  /** Feet, converted from the metres (the sim's unit). */
  boxFt: LayoutRectFt;
  /** The file's own *_ft columns, kept for the cross-check. */
  declaredFt: LayoutRectFt;
}

export interface LayoutPath {
  id: string;
  boxM: LayoutRectM;
  boxFt: LayoutRectFt;
  widthM: number;
}

export interface LayoutChannel {
  id: string;
  boxM: LayoutRectM;
  boxFt: LayoutRectFt;
}

export interface LayoutGate {
  side: "north" | "south" | "east" | "west";
  xM: number;
  yM: number;
  gapM: number;
}

export interface FarmLayout {
  schemaVersion: string;
  parcel: { sideM: number; sideFt: number; areaM2: number; gate: LayoutGate };
  belt: { widthM: number; note: string };
  zones: LayoutZone[];
  paths: LayoutPath[];
  channels: LayoutChannel[];
  cropsInPlots: Record<string, string>;
  openDecisions: string[];
}

export interface OrchardSpecies {
  id: string;
  name: { en: string; hi: string; kn: string };
  heightFt: [number, number];
  crownRadiusFt: [number, number];
}

export type LayerId = "L1" | "L2" | "L3" | "L4" | "L5";

export interface OrchardLayer {
  id: LayerId;
  name: { en: string; hi: string; kn: string };
  heightFt: [number, number];
  /** Absent for the low layers, whose own height range already caps them. */
  visualHeightCapFt: number | null;
  sameLayerMinSpacingFt: number | null;
  targetCount: number | null;
  trunkSolidRadiusFt: number | null;
  style: "bed_strips" | "cover_patches" | null;
  bedWidthFt: number | null;
  targetBeds: number | null;
  targetPatches: number | null;
  species: OrchardSpecies[];
}

export interface OrchardAlley {
  id: string;
  dir: "N-S" | "E-W";
  /** N-S alleys carry xFt, E-W alleys carry yFt; the other one is null. */
  xFt: number | null;
  yFt: number | null;
  widthFt: number;
}

export interface OrchardData {
  zoneId: string;
  zoneSizeFt: { widthFt: number; depthFt: number };
  entrance: { edge: "north" | "south" | "east" | "west"; offset: "centre" | "left" | "right" };
  seed: number;
  minTrunkGapFt: number;
  alleys: OrchardAlley[];
  layers: OrchardLayer[];
  drip: { along: string; lateralRule: string; decorativeOnly: boolean };
  needsReview: string[];
  placeholder: boolean;
  note: string;
}

export interface Violation {
  check: string;
  detail: string;
}

const metresToFeet = (m: number): number => m * FT_PER_M;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

function boxFt(box: LayoutRectM): LayoutRectFt {
  return {
    x: round3(metresToFeet(box.x)),
    y: round3(metresToFeet(box.y)),
    widthFt: round3(metresToFeet(box.w)),
    depthFt: round3(metresToFeet(box.d)),
  };
}

/** Positive-area overlap. Edge-to-edge contact is not an overlap. */
function overlapAreaM(a: LayoutRectM, b: LayoutRectM): number {
  const x = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const y = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y);
  return x > 0 && y > 0 ? x * y : 0;
}

const inInterior = (box: LayoutRectM): boolean =>
  box.x >= INTERIOR_M.min - 1e-9 &&
  box.y >= INTERIOR_M.min - 1e-9 &&
  box.x + box.w <= INTERIOR_M.max + 1e-9 &&
  box.y + box.d <= INTERIOR_M.max + 1e-9;

interface RawZone {
  id: string;
  ref: string;
  label: string;
  kind: ZoneKind;
  walkable: boolean;
  placeholder: boolean;
  x_m: number;
  y_m: number;
  w_m: number;
  d_m: number;
  x_ft: number;
  y_ft: number;
  w_ft: number;
  d_ft: number;
}

interface RawLayout {
  schema_version: string;
  parcel: { side_m: number; side_ft: number; area_m2: number; gate: { side: LayoutGate["side"]; x_m: number; y_m: number; gap_m: number } };
  belt: { width_m: number; note: string };
  zones: RawZone[];
  paths: { id: string; x_m: number; y_m: number; w_m: number; d_m: number; width_m: number }[];
  channels: { id: string; x_m: number; y_m: number; w_m: number; d_m: number }[];
  crops_in_plots: Record<string, string>;
  open_decisions: string[];
}

interface RawOrchard {
  zone_id: string;
  zone_size_ft: { w_ft: number; d_ft: number };
  entrance: OrchardData["entrance"];
  seed: number;
  min_trunk_gap_ft: number;
  alleys: { id: string; dir: "N-S" | "E-W"; x_ft?: number; y_ft?: number; width_ft: number }[];
  layers: {
    id: LayerId;
    name: OrchardLayer["name"];
    height_ft: [number, number];
    visual_height_cap_ft?: number;
    same_layer_min_spacing_ft?: number;
    target_count?: number;
    trunk_solid_radius_ft?: number;
    style?: "bed_strips" | "cover_patches";
    bed_width_ft?: number;
    target_beds?: number;
    target_patches?: number;
    species: { id: string; name: OrchardSpecies["name"]; height_ft: [number, number]; crown_radius_ft: [number, number] }[];
  }[];
  drip: { mainline: { along: string; note: string }; lateral_rule: string; decorative_only: boolean };
  needs_review: string[];
  placeholder: boolean;
  note: string;
}

const zoneBox = (zone: RawZone): LayoutRectM => ({ x: zone.x_m, y: zone.y_m, w: zone.w_m, d: zone.d_m });
const pathBox = (path: RawLayout["paths"][number]): LayoutRectM => ({ x: path.x_m, y: path.y_m, w: path.w_m, d: path.d_m });

/** The cross-checks the brief lists, plus the metre/foot agreement. */
export function layoutViolations(raw: unknown): Violation[] {
  const violations: Violation[] = [];
  const add = (check: string, detail: string): void => {
    violations.push({ check, detail });
  };

  const structural: SchemaViolation[] = validateSchema(raw, layoutSchema as SchemaNode);
  for (const entry of structural) add("schema", `${entry.path}: ${entry.message}`);
  if (structural.length > 0) return violations;

  const layout = raw as RawLayout;

  // 1. the parcel is a 100 m square (the brief fixes 100 x 100 m)
  const side = layout.parcel.side_m;
  if (Math.abs(side - 100) > 1e-9) add("parcel.square", `side_m is ${side}, the brief says 100`);
  if (Math.abs(side * side - layout.parcel.area_m2) > 1e-6) {
    add("parcel.area", `side ${side} m squared is ${side * side} m2, area_m2 says ${layout.parcel.area_m2}`);
  }
  if (Math.abs(metresToFeet(side) - layout.parcel.side_ft) > FT_TOLERANCE) {
    add("parcel.feet", `side_ft ${layout.parcel.side_ft} is not ${side} m x ${FT_PER_M} (${round3(metresToFeet(side))})`);
  }

  // 2. unique zone ids
  const seen = new Set<string>();
  for (const zone of layout.zones) {
    if (seen.has(zone.id)) add("zone.unique", `zone id "${zone.id}" appears twice`);
    seen.add(zone.id);
  }

  // 3. every zone inside the 5..95 m interior
  for (const zone of layout.zones) {
    const box = zoneBox(zone);
    if (!inInterior(box)) {
      add(
        "zone.interior",
        `${zone.id} spans x ${box.x}..${round3(box.x + box.w)} m, y ${box.y}..${round3(box.y + box.d)} m, outside ${INTERIOR_M.min}..${INTERIOR_M.max}`,
      );
    }
  }

  // 4. no zone overlaps another zone
  for (let i = 0; i < layout.zones.length; i += 1) {
    for (let j = i + 1; j < layout.zones.length; j += 1) {
      const a = layout.zones[i] as RawZone;
      const b = layout.zones[j] as RawZone;
      const area = overlapAreaM(zoneBox(a), zoneBox(b));
      if (area > 1e-9) add("zone.overlap", `${a.id} and ${b.id} overlap by ${round3(area)} m2`);
    }
  }

  // 5. no zone overlaps a gravel path
  for (const zone of layout.zones) {
    for (const path of layout.paths) {
      const area = overlapAreaM(zoneBox(zone), pathBox(path));
      if (area > 1e-9) add("zone.path_overlap", `${zone.id} overlaps path "${path.id}" by ${round3(area)} m2`);
    }
  }

  // 6. the four crop plots are 22 x 24 m
  const plots = layout.zones.filter((zone) => zone.kind === "crop_plot");
  for (const plot of plots) {
    if (Math.abs(plot.w_m - 22) > 1e-9 || Math.abs(plot.d_m - 24) > 1e-9) {
      add("crop_plot.size", `${plot.id} is ${plot.w_m} x ${plot.d_m} m, the brief says 22 x 24`);
    }
  }
  const expectedPlots = ["plot_wheat", "plot_jowar", "plot_sunflower", "plot_groundnut"];
  for (const id of expectedPlots) {
    if (!layout.zones.some((zone) => zone.id === id)) add("crop_plot.present", `${id} is missing`);
  }

  // 7. the file's foot columns match the metres (2-decimal columns, 0.01 ft)
  for (const zone of layout.zones) {
    const pairs: [string, number, number][] = [
      ["x_ft", zone.x_ft, metresToFeet(zone.x_m)],
      ["y_ft", zone.y_ft, metresToFeet(zone.y_m)],
      ["w_ft", zone.w_ft, metresToFeet(zone.w_m)],
      ["d_ft", zone.d_ft, metresToFeet(zone.d_m)],
    ];
    for (const [key, declared, computed] of pairs) {
      if (Math.abs(declared - computed) > FT_TOLERANCE) {
        add("zone.feet", `${zone.id}.${key} is ${declared}, ${round3(computed)} from the metres`);
      }
    }
  }

  return violations;
}

/** Orchard-file cross-checks against the layout it belongs to. */
export function orchardViolations(raw: unknown, layout: FarmLayout): Violation[] {
  const violations: Violation[] = [];
  const add = (check: string, detail: string): void => {
    violations.push({ check, detail });
  };

  const structural: SchemaViolation[] = validateSchema(raw, orchardSchema as SchemaNode);
  for (const entry of structural) add("schema", `${entry.path}: ${entry.message}`);
  if (structural.length > 0) return violations;

  const orchard = raw as RawOrchard;
  const zone = layout.zones.find((entry) => entry.id === orchard.zone_id);
  if (!zone) {
    add("orchard.zone", `the layout has no zone "${orchard.zone_id}"`);
    return violations;
  }

  // the orchard file's own size must be the layout's orchard zone
  if (
    Math.abs(orchard.zone_size_ft.w_ft - zone.boxFt.widthFt) > 0.05 ||
    Math.abs(orchard.zone_size_ft.d_ft - zone.boxFt.depthFt) > 0.05
  ) {
    add(
      "orchard.size",
      `orchard-5layer zone_size_ft ${orchard.zone_size_ft.w_ft} x ${orchard.zone_size_ft.d_ft} is not the layout's ${zone.boxFt.widthFt} x ${zone.boxFt.depthFt}`,
    );
  }

  const widthFt = orchard.zone_size_ft.w_ft;
  const depthFt = orchard.zone_size_ft.d_ft;

  // every alley lies inside the orchard, and N-S/E-W alleys carry the right coordinate
  for (const alley of orchard.alleys) {
    if (alley.dir === "N-S") {
      if (alley.x_ft === undefined) add("alley.shape", `${alley.id} is N-S but has no x_ft`);
      else if (alley.x_ft < 0 || alley.x_ft + alley.width_ft > widthFt) {
        add("alley.inside", `${alley.id} spans x ${alley.x_ft}..${round3(alley.x_ft + alley.width_ft)} ft, the orchard is 0..${widthFt}`);
      }
    } else if (alley.y_ft === undefined) add("alley.shape", `${alley.id} is E-W but has no y_ft`);
    else if (alley.y_ft < 0 || alley.y_ft + alley.width_ft > depthFt) {
      add("alley.inside", `${alley.id} spans y ${alley.y_ft}..${round3(alley.y_ft + alley.width_ft)} ft, the orchard is 0..${depthFt}`);
    }
  }

  // the entrance is a real point on a real edge
  const edge = orchard.entrance.edge;
  if (edge === "south" || edge === "north") {
    const point = { x: widthFt / 2, y: edge === "south" ? depthFt : 0 };
    if (point.x < 0 || point.x > widthFt || point.y < 0 || point.y > depthFt) {
      add("orchard.entrance", `the ${edge} entrance ${point.x},${point.y} ft is outside the orchard`);
    }
  }

  // five layers, L1..L5, once each, each with species
  const ids = orchard.layers.map((layer) => layer.id);
  for (const id of ["L1", "L2", "L3", "L4", "L5"] as const) {
    const count = ids.filter((entry) => entry === id).length;
    if (count !== 1) add("orchard.layers", `layer ${id} appears ${count} times`);
  }
  for (const layer of orchard.layers) {
    const speciesIds = new Set(layer.species.map((species) => species.id));
    if (speciesIds.size !== layer.species.length) add("orchard.species", `layer ${layer.id} repeats a species id`);
  }

  // drafts stay labelled as drafts
  for (const key of ["names.hi", "names.kn"]) {
    if (!orchard.needs_review.includes(key)) add("orchard.needs_review", `"${key}" is not listed in needs_review`);
  }
  if (!orchard.placeholder) add("orchard.placeholder", "the file does not declare itself a placeholder");

  return violations;
}

/** Convert without checking. Only for code that has already validated, or that
    wants to cross-check a deliberately broken copy. */
export function toLayout(raw: unknown): FarmLayout {
  const source = raw as RawLayout;
  return {
    schemaVersion: source.schema_version,
    parcel: {
      sideM: source.parcel.side_m,
      sideFt: source.parcel.side_ft,
      areaM2: source.parcel.area_m2,
      gate: {
        side: source.parcel.gate.side,
        xM: source.parcel.gate.x_m,
        yM: source.parcel.gate.y_m,
        gapM: source.parcel.gate.gap_m,
      },
    },
    belt: { widthM: source.belt.width_m, note: source.belt.note },
    zones: source.zones.map((zone) => {
      const box = zoneBox(zone);
      return {
        id: zone.id,
        ref: zone.ref,
        label: zone.label,
        kind: zone.kind,
        walkable: zone.walkable,
        placeholder: zone.placeholder,
        boxM: box,
        boxFt: boxFt(box),
        declaredFt: { x: zone.x_ft, y: zone.y_ft, widthFt: zone.w_ft, depthFt: zone.d_ft },
      };
    }),
    paths: source.paths.map((path) => ({
      id: path.id,
      boxM: pathBox(path),
      boxFt: boxFt(pathBox(path)),
      widthM: path.width_m,
    })),
    channels: source.channels.map((channel) => ({
      id: channel.id,
      boxM: { x: channel.x_m, y: channel.y_m, w: channel.w_m, d: channel.d_m },
      boxFt: boxFt({ x: channel.x_m, y: channel.y_m, w: channel.w_m, d: channel.d_m }),
    })),
    cropsInPlots: source.crops_in_plots,
    openDecisions: source.open_decisions,
  };
}

/** Validate, convert, and return the layout. Throws on any violation. */
export function readLayout(raw: unknown): FarmLayout {
  const violations = layoutViolations(raw);
  if (violations.length > 0) {
    throw new Error(`farm-layout-v2 failed validation:\n${violations.map((v) => `  ${v.check}: ${v.detail}`).join("\n")}`);
  }
  return toLayout(raw);
}

/** Validate the orchard file against a layout, then convert it. */
export function readOrchard(raw: unknown, layout: FarmLayout): OrchardData {
  const violations = orchardViolations(raw, layout);
  if (violations.length > 0) {
    throw new Error(`orchard-5layer.json failed validation:\n${violations.map((v) => `  ${v.check}: ${v.detail}`).join("\n")}`);
  }
  const source = raw as RawOrchard;
  return {
    zoneId: source.zone_id,
    zoneSizeFt: { widthFt: source.zone_size_ft.w_ft, depthFt: source.zone_size_ft.d_ft },
    entrance: source.entrance,
    seed: source.seed,
    minTrunkGapFt: source.min_trunk_gap_ft,
    alleys: source.alleys.map((alley) => ({
      id: alley.id,
      dir: alley.dir,
      xFt: alley.x_ft ?? null,
      yFt: alley.y_ft ?? null,
      widthFt: alley.width_ft,
    })),
    layers: source.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      heightFt: layer.height_ft,
      visualHeightCapFt: layer.visual_height_cap_ft ?? null,
      sameLayerMinSpacingFt: layer.same_layer_min_spacing_ft ?? null,
      targetCount: layer.target_count ?? null,
      trunkSolidRadiusFt: layer.trunk_solid_radius_ft ?? null,
      style: layer.style ?? null,
      bedWidthFt: layer.bed_width_ft ?? null,
      targetBeds: layer.target_beds ?? null,
      targetPatches: layer.target_patches ?? null,
      species: layer.species.map((species) => ({
        id: species.id,
        name: species.name,
        heightFt: species.height_ft,
        crownRadiusFt: species.crown_radius_ft,
      })),
    })),
    drip: {
      along: source.drip.mainline.along,
      lateralRule: source.drip.lateral_rule,
      decorativeOnly: source.drip.decorative_only,
    },
    needsReview: source.needs_review,
    placeholder: source.placeholder,
    note: source.note,
  };
}

/*  Built at import time, so a broken layout fails the build rather than the
    render. Keyed by the world switch in sim_overrides.json — but the acre
    world is still the one the app renders until step 3. */
export const LAYOUT: FarmLayout = readLayout(layoutJson);
export const ORCHARD_LAYERS: OrchardData = readOrchard(orchardJson, LAYOUT);

export const layoutZone = (id: string): LayoutZone => {
  const zone = LAYOUT.zones.find((entry) => entry.id === id);
  if (!zone) throw new Error(`the hectare layout has no zone "${id}"`);
  return zone;
};
