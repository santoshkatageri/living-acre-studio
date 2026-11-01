import overridesJson from "../../data/sim_overrides.json";
import layoutJson from "../../data/farm-layout-v2.json";
import orchardJson from "../../data/orchard-5layer.json";

import { readLayout, readOrchard, FT_PER_M, type FarmLayout, type OrchardData } from "../sim/layout";
import { createRng } from "../sim/rng";
import type { Vec2 } from "../sim/types";

/*  The hectare world (100 m square, 22 spaces), read from the layout and the
    overrides into one model the renderer and the sim both use.

    Nothing here draws. Everything a renderer needs — the boxes, the heights, the
    colours, where every animal stands, where every signpost is planted — is
    decided here, once, from data. The pure sim (move.ts, walk.ts, tour.ts) takes
    this model and nothing else. */

export const LAYOUT: FarmLayout = readLayout(layoutJson);
export const ORCHARD: OrchardData = readOrchard(orchardJson, LAYOUT);

export const FT = FT_PER_M;

export interface HectareBox {
  x: number;
  y: number;
  widthFt: number;
  depthFt: number;
}

export type ZoneKind =
  | "crop_plot"
  | "rotational_strip"
  | "orchard"
  | "vegetables"
  | "livestock"
  | "water"
  | "building"
  | "yard";

export interface HectareBuilding {
  id: string;
  heightFt: number;
  floorFt: number;
  /** Sides open, roof on beams: the cattle and tractor sheds. */
  open: boolean;
}

export interface HectareZone {
  id: string;
  ref: string;
  label: string;
  kind: ZoneKind;
  walkable: boolean;
  box: HectareBox;
  /** The zone's own lift off the ground, for its floor plate. */
  heightFt: number;
  colour: string;
  crop: string | null;
  building: HectareBuilding | null;
}

export interface HectarePath {
  id: string;
  box: HectareBox;
}

export interface HectareChannel {
  id: string;
  box: HectareBox;
}

export interface BeltTree {
  x: number;
  y: number;
  speciesId: string;
  heightFt: number;
  canopyFt: number;
  trunkColour: string;
  leafColour: string;
}

export interface HectareLabel {
  id: string;
  text: string;
  /** The space's centre, for framing. */
  x: number;
  y: number;
  /** The tallest the sign ever stands: what the framing maths must clear. */
  yFt: number;
  /** Where the post is planted: a corner of the space. */
  boardX: number;
  boardY: number;
  boardOutside: boolean;
}

export type Species = "bullock" | "buffalo" | "hen" | "goat";

export interface Animal {
  id: string;
  species: Species;
  x: number;
  y: number;
  /** The floor it stands on: a shed's raised floor, or the ground. */
  floorFt: number;
  facingRad: number;
  /** Body length in feet, the thing that must fit in the pen. */
  lengthFt: number;
}

export interface FarmerLook {
  heightFt: number;
  skin: string;
  hair: string;
  headband: string;
  kurta: string;
  dhoti: string;
  sash: string;
  staff: string;
  moustache: string;
  radiusFt: number;
  speedFtPerSec: number;
  /** Feet of ground covered per walk cycle: two strides. */
  strideFt: number;
}

export interface LabelStyle {
  postHeightFt: number;
  postWidthFt: number;
  boardWidthFt: number;
  boardHeightFt: number;
  boardThicknessFt: number;
  boardInsetFt: number;
  boardOutsetFt: number;
  boardGrowthMax: number;
  growthFromFt: number;
  textFillFrac: number;
  boardColour: string;
  postColour: string;
  textColour: string;
}

export interface WaterStyle {
  flowFtPerS: number;
  textureTileFt: number;
  rippleCount: number;
  rippleCycleS: number;
  rippleMaxFt: number;
  rippleGlow: number;
  rippleColour: string;
  surfaceRoughness: number;
}

export interface FollowCamera {
  pitchDeg: number;
  distanceFt: number;
  heightFt: number;
  lookAheadFt: number;
  lookHeightFt: number;
  fovDeg: number;
  minDistanceFt: number;
  maxDistanceFt: number;
}

export interface HectareCamera {
  defaultViewFt: number;
  overviewMargin: number;
  maxZoom: number;
  pitchDeg: number;
  yawDeg: number;
  follow: FollowCamera;
}

export type TourMode = "iso" | "third-person";

export interface TourShot {
  id: string;
  caption: string;
  mode: TourMode;
  zoneId: string | null;
  frameFt: number | null;
  moveS: number;
  holdS: number;
  walkToZoneId: string | null;
}

export interface HectareWorld {
  parcel: { widthFt: number; depthFt: number };
  gate: { xFt: number; yFt: number; gapFt: number };
  spawn: Vec2;
  zones: HectareZone[];
  paths: HectarePath[];
  channels: HectareChannel[];
  belt: BeltTree[];
  labels: HectareLabel[];
  animals: Animal[];
  farmer: FarmerLook;
  camera: HectareCamera;
  labelStyle: LabelStyle;
  waterStyle: WaterStyle;
  tour: TourShot[];
  palette: Record<string, string>;
  zoneColours: Record<string, string>;
  orchard: OrchardData;
}

/* ------------------------------------------------------------------ data -- */

type Look = (typeof overridesJson)["overrides"]["hectare_look"];

const LOOK: Look = (overridesJson as unknown as { overrides: { hectare_look: Look } }).overrides.hectare_look;
const FARMER_M = ((): number => {
  const canon = (overridesJson as unknown as { overrides: { farmer_height_m?: number } }).overrides;
  void canon;
  return LOOK.farmer.height_m;
})();

/** Species geometry: how much room an animal of each kind needs in its pen. */
export const SPECIES_GEOMETRY: Record<Species, { lengthFt: number; marginFt: number }> = {
  bullock: { lengthFt: 7.4, marginFt: 8 },
  buffalo: { lengthFt: 7.0, marginFt: 9 },
  goat: { lengthFt: 3.6, marginFt: 3 },
  hen: { lengthFt: 1.3, marginFt: 2.5 },
};

function boxOf(rect: { x: number; y: number; widthFt: number; depthFt: number }): HectareBox {
  return {
    x: round3(rect.x),
    y: round3(rect.y),
    widthFt: round3(rect.widthFt),
    depthFt: round3(rect.depthFt),
  };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function centreOf(box: HectareBox): Vec2 {
  return { x: box.x + box.widthFt / 2, y: box.y + box.depthFt / 2 };
}

/* ----------------------------------------------------------------- zones -- */

const BUILDINGS: Record<string, { height_ft: number; floor_ft: number; open: boolean }> = LOOK.buildings as Record<
  string,
  { height_ft: number; floor_ft: number; open: boolean }
>;

const ZONE_KINDS: ZoneKind[] = [
  "crop_plot",
  "rotational_strip",
  "orchard",
  "vegetables",
  "livestock",
  "water",
  "building",
  "yard",
];

function kindOf(id: string, kind: string): ZoneKind {
  if ((ZONE_KINDS as string[]).includes(kind)) return kind as ZoneKind;
  throw new Error(`zone "${id}" has an unknown kind "${kind}"`);
}

const zones: HectareZone[] = LAYOUT.zones.map((zone) => {
  const kind = kindOf(zone.id, zone.kind);
  const building = BUILDINGS[zone.id]
    ? {
        id: zone.id,
        heightFt: BUILDINGS[zone.id]!.height_ft,
        floorFt: BUILDINGS[zone.id]!.floor_ft,
        open: BUILDINGS[zone.id]!.open,
      }
    : null;
  const baseHeight = (LOOK.zone_heights_ft as Record<string, number>)[kind] ?? 0.2;
  return {
    id: zone.id,
    ref: zone.ref,
    label: zone.label,
    kind,
    walkable: zone.walkable,
    box: boxOf(zone.boxFt),
    // A building stands as tall as the data says; everything else is a plate.
    heightFt: building ? building.heightFt : baseHeight,
    colour: (LOOK.zone_colours as Record<string, string>)[kind] ?? "#8a8161",
    crop: LAYOUT.cropsInPlots[zone.id] ?? null,
    building,
  };
});

const paths: HectarePath[] = LAYOUT.paths.map((path) => ({ id: path.id, box: boxOf(path.boxFt) }));
const channels: HectareChannel[] = LAYOUT.channels.map((channel) => ({ id: channel.id, box: boxOf(channel.boxFt) }));

/* --------------------------------------------------------------- labels -- */
/*  A signpost at the north-west corner of each space: inside a plot, and beside
    a building so it is not standing in a wall. The board turns about its post to
    face the camera, so the name reads from any heading. */

const labels: HectareLabel[] = zones.map((zone) => {
  const outside = zone.building !== null;
  const offset = outside ? LOOK.labels.board_outset_ft : LOOK.labels.board_inset_ft;
  return {
    id: zone.id,
    text: zone.label,
    x: round3(zone.box.x + zone.box.widthFt / 2),
    y: round3(zone.box.y + zone.box.depthFt / 2),
    yFt: round3((LOOK.labels.post_height_ft + LOOK.labels.board_height_ft) * LOOK.labels.board_growth_max),
    boardX: round3(outside ? zone.box.x - offset : zone.box.x + offset),
    boardY: round3(outside ? zone.box.y - offset : zone.box.y + offset),
    boardOutside: outside,
  };
});

/* -------------------------------------------------------------- animals -- */

function planAnimals(world: { zones: HectareZone[] }): Animal[] {
  const rng = createRng(LOOK.livestock.seed);
  const animals: Animal[] = [];
  for (const [zoneId, bySpecies] of Object.entries(LOOK.livestock.counts as Record<string, Record<string, number>>)) {
    const zone = world.zones.find((entry) => entry.id === zoneId);
    if (!zone) throw new Error(`livestock plan names a zone "${zoneId}" the layout has not got`);
    for (const [speciesId, count] of Object.entries(bySpecies)) {
      const species = speciesId as Species;
      const geometry = SPECIES_GEOMETRY[species];
      if (!geometry) throw new Error(`livestock plan names an unknown species "${speciesId}"`);
      // The pen, less the room an animal of this size needs to turn round.
      const inset = geometry.marginFt;
      const usable = {
        x: zone.box.x + inset,
        y: zone.box.y + inset,
        widthFt: Math.max(zone.box.widthFt - inset * 2, geometry.lengthFt),
        depthFt: Math.max(zone.box.depthFt - inset * 2, geometry.lengthFt),
      };
      const across = Math.max(Math.floor((usable.widthFt + inset) / (inset + geometry.lengthFt * 0.6)), 1);
      for (let index = 0; index < count; index += 1) {
        const column = index % across;
        const row = Math.floor(index / across);
        const cellW = usable.widthFt / across;
        const x = usable.x + cellW * (column + 0.5) + rng.range(-0.6, 0.6);
        const y = usable.y + Math.min(inset * 0.9, 2.2) + row * Math.min(inset * 1.1, 4.5) + rng.range(-0.5, 0.5);
        animals.push({
          id: `${zoneId}:${species}:${index + 1}`,
          species,
          x: round3(x),
          y: round3(Math.min(y, usable.y + usable.depthFt)),
          // The shed floor is raised; an animal stands on it, not beside it.
          floorFt: zone.building?.floorFt ?? 0,
          facingRad: round3(rng.range(-Math.PI, Math.PI)),
          lengthFt: geometry.lengthFt,
        });
      }
    }
  }
  return animals;
}

/* ----------------------------------------------------------------- belt -- */
/*  Two rows of trees round the parcel, on all four sides, with the north gate
    left open. Nothing taller than the data's cap, or the crowns would crop the
    framing and hide the signs. */

function planBelt(): BeltTree[] {
  const rng = createRng(LOOK.belt.seed);
  const band = LAYOUT.belt.widthM * FT;
  const spacing = LOOK.belt.spacing_ft;
  const jitter = LOOK.belt.jitter_ft;
  const side = LAYOUT.parcel.sideFt;
  const gateX = LAYOUT.parcel.gate.xM * FT;
  const gateGap = LAYOUT.parcel.gate.gapM * FT + 8;
  const trees: BeltTree[] = [];

  const plant = (x: number, y: number): void => {
    const species = rng.pick(LOOK.belt.species);
    const canopy = species.canopyFt as [number, number];
    const heights = species.heightFt as [number, number];
    const canopyFt = rng.range(canopy[0], canopy[1]);
    const heightFt = Math.min(rng.range(heights[0], heights[1]), LOOK.belt.canopy_top_limit_ft - canopyFt * 0.5);
    trees.push({
      x: round3(x),
      y: round3(y),
      speciesId: species.id,
      heightFt: round3(heightFt),
      canopyFt: round3(canopyFt),
      trunkColour: species.trunk,
      leafColour: species.leaf,
    });
  };

  const rows = Math.max(LOOK.belt.rows, 1);
  for (let row = 0; row < rows; row += 1) {
    const offset = (band / (rows + 1)) * (row + 1);
    // North and south run the full width; west and east the full depth.
    for (let along = spacing / 2; along < side; along += spacing) {
      const x = along + rng.range(-jitter, jitter);
      const y = along + rng.range(-jitter, jitter);
      if (Math.abs(x - gateX) > gateGap) plant(x, offset);
      if (Math.abs(y - gateX) > gateGap) plant(y, side - offset);
      const westX = offset;
      const eastX = side - offset;
      if (x > band + 2 && x < side - band - 2) {
        plant(westX, x);
        plant(eastX, x);
      }
    }
  }
  return trees;
}

/* ---------------------------------------------------------------- world -- */

function readTour(raw: Look["tour"]["shots"], zoneList: HectareZone[]): TourShot[] {
  if (raw.length === 0) throw new Error("the tour has no shots to play");
  const byId = new Map(zoneList.map((zone) => [zone.id, zone]));
  const seen = new Set<string>();
  return raw.map((shot) => {
    if (seen.has(shot.id)) throw new Error(`the tour has two shots called "${shot.id}"`);
    seen.add(shot.id);
    if (!shot.caption.trim()) throw new Error(`tour shot "${shot.id}" has no caption`);
    if (shot.mode !== "iso" && shot.mode !== "third-person") {
      throw new Error(`tour shot "${shot.id}" has an unknown camera "${shot.mode}"`);
    }
    for (const [field, id] of [["zone", shot.zone], ["walk_to", shot.walk_to]] as const) {
      if (id === null) continue;
      const zone = byId.get(id);
      if (!zone) throw new Error(`tour shot "${shot.id}" names a ${field} "${id}" the layout has not got`);
      if (field === "walk_to" && !zone.walkable) {
        throw new Error(`tour shot "${shot.id}" sends the farmer into "${zone.label}", which is not walkable`);
      }
    }
    if (shot.move_s < 0 || shot.hold_s < 0) throw new Error(`tour shot "${shot.id}" has a negative duration`);
    if (shot.frame_ft !== null && !(shot.frame_ft > 0)) throw new Error(`tour shot "${shot.id}" has an empty frame`);
    return {
      id: shot.id,
      caption: shot.caption,
      mode: shot.mode,
      zoneId: shot.zone,
      frameFt: shot.frame_ft,
      moveS: shot.move_s,
      holdS: shot.hold_s,
      walkToZoneId: shot.walk_to,
    };
  });
}

const CROPS: Record<string, string> = { wheat: "#c9b26a", jowar: "#9aa758", sunflower: "#d9a53c", groundnut: "#8f8f4e" };
void CROPS;

const world: HectareWorld = {
  parcel: { widthFt: round3(LAYOUT.parcel.sideFt), depthFt: round3(LAYOUT.parcel.sideFt) },
  gate: {
    xFt: round3(LAYOUT.parcel.gate.xM * FT),
    yFt: round3(LAYOUT.parcel.gate.yM * FT),
    gapFt: round3(LAYOUT.parcel.gate.gapM * FT),
  },
  spawn: { x: round3(LAYOUT.parcel.gate.xM * FT), y: 7 },
  zones,
  paths,
  channels,
  belt: planBelt(),
  labels,
  animals: [],
  farmer: {
    heightFt: round3(FARMER_M * FT),
    skin: LOOK.farmer.skin,
    hair: LOOK.farmer.hair,
    headband: LOOK.farmer.headband,
    kurta: LOOK.farmer.kurta,
    dhoti: LOOK.farmer.dhoti,
    sash: LOOK.farmer.sash,
    staff: LOOK.farmer.staff,
    moustache: LOOK.farmer.moustache,
    radiusFt: 1.1,
    speedFtPerSec: 3.2,
    strideFt: 4.6,
  },
  camera: {
    defaultViewFt: LOOK.camera.default_view_ft,
    overviewMargin: LOOK.camera.overview_margin,
    maxZoom: LOOK.camera.max_zoom,
    pitchDeg: LOOK.camera.pitch_deg,
    yawDeg: LOOK.camera.yaw_deg,
    follow: {
      pitchDeg: LOOK.camera.follow.pitch_deg,
      distanceFt: LOOK.camera.follow.distance_ft,
      heightFt: LOOK.camera.follow.height_ft,
      lookAheadFt: LOOK.camera.follow.look_ahead_ft,
      lookHeightFt: LOOK.camera.follow.look_height_ft,
      fovDeg: LOOK.camera.follow.fov_deg,
      minDistanceFt: LOOK.camera.follow.min_distance_ft,
      maxDistanceFt: LOOK.camera.follow.max_distance_ft,
    },
  },
  labelStyle: {
    postHeightFt: LOOK.labels.post_height_ft,
    postWidthFt: LOOK.labels.post_width_ft,
    boardWidthFt: LOOK.labels.board_width_ft,
    boardHeightFt: LOOK.labels.board_height_ft,
    boardThicknessFt: LOOK.labels.board_thickness_ft,
    boardInsetFt: LOOK.labels.board_inset_ft,
    boardOutsetFt: LOOK.labels.board_outset_ft,
    boardGrowthMax: LOOK.labels.board_growth_max,
    growthFromFt: LOOK.labels.growth_from_ft,
    textFillFrac: LOOK.labels.text_fill_frac,
    boardColour: LOOK.labels.board_colour,
    postColour: LOOK.labels.post_colour,
    textColour: LOOK.labels.text_colour,
  },
  waterStyle: {
    flowFtPerS: LOOK.water.flow_ft_per_s,
    textureTileFt: LOOK.water.texture_tile_ft,
    rippleCount: LOOK.water.ripple_count,
    rippleCycleS: LOOK.water.ripple_cycle_s,
    rippleMaxFt: LOOK.water.ripple_max_ft,
    rippleGlow: LOOK.water.ripple_glow,
    rippleColour: LOOK.water.ripple_colour,
    surfaceRoughness: LOOK.water.surface_roughness,
  },
  tour: readTour(LOOK.tour.shots, zones),
  palette: LOOK.palette as Record<string, string>,
  zoneColours: LOOK.zone_colours as Record<string, string>,
  orchard: ORCHARD,
};

// Animals are planned after the zones exist, because a shed's raised floor is
// part of where they stand.
world.animals = planAnimals(world);

export const HECTARE: HectareWorld = world;

/** The zone a ground point falls in, or null for open ground. */
export function zoneAt(world: HectareWorld, point: Vec2): HectareZone | null {
  return (
    world.zones.find(
      (zone) =>
        point.x >= zone.box.x &&
        point.x <= zone.box.x + zone.box.widthFt &&
        point.y >= zone.box.y &&
        point.y <= zone.box.y + zone.box.depthFt,
    ) ?? null
  );
}

export function pathAt(world: HectareWorld, point: Vec2): HectarePath | null {
  return (
    world.paths.find(
      (path) =>
        point.x >= path.box.x &&
        point.x <= path.box.x + path.box.widthFt &&
        point.y >= path.box.y &&
        point.y <= path.box.y + path.box.depthFt,
    ) ?? null
  );
}

/** What the HUD calls the ground under the cursor. */
export function placeAt(world: HectareWorld, point: Vec2): string {
  const zone = zoneAt(world, point);
  if (zone) return zone.label;
  return pathAt(world, point) ? "Path" : "Open ground";
}

/** A zone's centre: where a tour shot looks and a walk is aimed. */
export function zoneCentre(zone: HectareZone): Vec2 {
  return centreOf(zone.box);
}
