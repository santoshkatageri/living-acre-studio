import canonJson from "../../canon/canon-v1.json";
import overridesJson from "../../data/sim_overrides.json";

import { buildPathNetwork, type PathNetwork } from "./paths";
import type { Box, Circle, DoorSide, DoorSpec, MovementMode, Vec2, World, Zone, ZoneLook, ZoneMarker } from "./types";

/*  The world, built once from the read-only canon plus sim_overrides.
    Nothing here invents a placement the canon already fixes: sizes come from
    size_ft, positions from position_ft, and the pond from its diameter.
    Values the canon does not fix come from data/sim_overrides.json. */

interface CanonZone {
  key: string;
  asset_id: string | null;
  name: string | null;
  subtitle: string | null;
  /** width/depth for boxes; diameter for the pond (canon uses one or other). */
  size_ft: { width_ft?: number; depth_ft?: number; diameter_ft?: number } | null;
  position_ft: { x: number; y: number; width_ft: number; depth_ft: number } | null;
  palette: string[];
  identity_tokens: string[];
  notes: string | null;
}

interface CanonFile {
  parcel: { width_ft: number; depth_ft: number; total_sq_ft: number };
  palette: Record<string, string>;
  zones: CanonZone[];
}

interface ZoneOverride {
  walkable: boolean;
  look: ZoneLook;
  heights_ft: number;
}

interface OverridesFile {
  overrides: {
    zones: Record<string, ZoneOverride>;
    zone_placeholders: Record<string, { size_ft: { width_ft: number; depth_ft: number }; inset_ft?: number }>;
    player: { radius_ft: number; speed_ft_per_s: number; spawn_ft: Vec2 };
    camera: { pitch_deg: number; yaw_deg: number; max_zoom: number; overview_margin: number };
    clock: { day_seconds: number; start_hour: number };
    plot: { zone: string; rows: number; cols: number; cell_ft: number };
    water: {
      capacity: number;
      per_use: number;
      pause_per_use_s: number;
      refill_buffer_ft: number;
      refill_zone: string;
    };
    growth: { stages_per_day: number };
    pond_look: {
      seed: number;
      rim_inner_ft: number;
      rim_outer_ft: number;
      stone_count: number;
      lily_pad_count: number;
      stone_size_ft: [number, number];
    };
    paths_look: {
      seed: number;
      width_ft: number;
      colour: string;
      stepping_interval_ft: number;
      stepping_jitter_ft: number;
      stepping_size_ft: number;
    };
    movement: { mode: string; free_zones: string[]; path_width_ft: number; spawn: string };
    pond_ring: { enabled: boolean; gap_ft: number; width_ft: number; segments: number };
    doors: Record<string, { side: DoorSide; offset_ft: number; gap_ft: number }>;
    tints: Record<string, string>;
    markers: Record<string, { label: string; height_ft: number }>;
  };
}

const canon = canonJson as unknown as CanonFile;
const overrides = overridesJson as unknown as OverridesFile;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** Box for a canon zone: canon position, canon size (size_ft wins). */
function canonBox(zone: CanonZone): Box {
  const position = zone.position_ft;
  if (!position) throw new Error(`canon zone "${zone.key}" has no position_ft`);
  const widthFt = zone.size_ft?.width_ft ?? position.width_ft;
  const depthFt = zone.size_ft?.depth_ft ?? position.depth_ft;
  return { x: position.x, y: position.y, widthFt, depthFt };
}

function buildZone(zone: CanonZone): Zone {
  const override = overrides.overrides.zones[zone.key];
  if (!override) throw new Error(`sim_overrides.zones is missing "${zone.key}"`);
  const placeholder = overrides.overrides.zone_placeholders[zone.key];

  let box: Box;
  if (hasCanonSize(zone)) {
    box = canonBox(zone);
  } else {
    // The canon gives no size: a labelled PLACEHOLDER from the overrides.
    // Compost keeps the canon position; the gate has neither position nor
    // size, so the brief's south-west inset places it.
    if (!placeholder) throw new Error(`canon zone "${zone.key}" has no geometry and no placeholder`);
    const scale = { widthFt: placeholder.size_ft.width_ft, depthFt: placeholder.size_ft.depth_ft };
    const position = zone.position_ft;
    if (position) {
      box = { x: position.x, y: position.y, ...scale };
    } else if (placeholder.inset_ft !== undefined) {
      box = { x: placeholder.inset_ft, y: canon.parcel.depth_ft - placeholder.inset_ft - scale.depthFt, ...scale };
    } else {
      throw new Error(`canon zone "${zone.key}" has no position, no size and no inset`);
    }
  }

  const diameter = zone.size_ft?.diameter_ft;
  const circle: Circle | null =
    diameter !== undefined
      ? {
          cx: round3(box.x + box.widthFt / 2),
          cy: round3(box.y + box.depthFt / 2),
          radiusFt: diameter / 2,
        }
      : null;

  return {
    key: zone.key,
    assetId: zone.asset_id,
    name: zone.name ?? titleCase(zone.key),
    subtitle: zone.subtitle,
    box,
    circle,
    heightFt: override.heights_ft,
    look: override.look,
    solid: !override.walkable,
    palette: zone.palette,
    identityTokens: zone.identity_tokens,
  };
}

/** True when the canon fixes this zone's dimensions itself. */
function hasCanonSize(zone: CanonZone): boolean {
  if (!zone.size_ft || !zone.position_ft) return false;
  return zone.size_ft.width_ft !== undefined || zone.size_ft.diameter_ft !== undefined;
}

function titleCase(key: string): string {
  return key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** The door point for a zone face, from sim_overrides.doors. */
function buildDoor(zone: Zone, spec: { side: DoorSide; offset_ft: number; gap_ft: number }): DoorSpec {
  const x = zone.box.x + Math.min(Math.max(spec.offset_ft, 0), zone.box.widthFt);
  const y = zone.box.y + zone.box.depthFt;
  if (spec.side !== "south") throw new Error(`doors.${zone.key}: only "south" faces are supported`);
  return { side: spec.side, offsetFt: spec.offset_ft, gapFt: spec.gap_ft, point: { x: round3(x), y: round3(y) } };
}

export function createWorld(): World {
  const zones = canon.zones.map(buildZone);

  const seen = new Set<string>();
  for (const zone of zones) {
    if (seen.has(zone.key)) throw new Error(`Duplicate zone key "${zone.key}"`);
    seen.add(zone.key);
  }
  for (const key of Object.keys(overrides.overrides.zones)) {
    if (!seen.has(key)) throw new Error(`sim_overrides names a zone the canon does not have: "${key}"`);
  }

  const mode = overrides.overrides.movement.mode;
  if (mode !== "free" && mode !== "paths_only") {
    throw new Error(`movement.mode "${mode}" is not "free" or "paths_only"`);
  }
  for (const key of overrides.overrides.movement.free_zones) {
    if (!seen.has(key)) throw new Error(`movement.free_zones names an unknown zone "${key}"`);
  }
  if (overrides.overrides.pond_ring.gap_ft < 1) {
    throw new Error("pond_ring.gap_ft is below 1 ft; that needs a decision, not a silent change");
  }

  const doors: Record<string, DoorSpec> = {};
  for (const [key, spec] of Object.entries(overrides.overrides.doors)) {
    const zone = zones.find((entry) => entry.key === key);
    if (!zone) throw new Error(`doors.${key}: no such zone`);
    doors[key] = buildDoor(zone, spec);
  }

  const gate = zones.find((zone) => zone.key === "gate");
  const movementSpawn = overrides.overrides.movement.spawn;
  if (movementSpawn === "gate") {
    if (!gate) throw new Error('movement.spawn is "gate" but the world has no gate zone');
  } else if (!seen.has(movementSpawn)) {
    throw new Error(`movement.spawn "${movementSpawn}" names an unknown zone`);
  }
  const spawn: Vec2 =
    movementSpawn === "gate" && gate
      ? { x: round3(gate.box.x + gate.box.widthFt / 2), y: round3(gate.box.y + gate.box.depthFt / 2) }
      : { ...overrides.overrides.player.spawn_ft };

  const markers: ZoneMarker[] = Object.entries(overrides.overrides.markers).map(([key, spec]) => {
    const zone = zones.find((entry) => entry.key === key);
    if (!zone) throw new Error(`markers.${key}: no such zone`);
    return {
      key,
      label: spec.label,
      heightFt: spec.height_ft,
      position: { x: round3(zone.box.x + zone.box.widthFt / 2), y: round3(zone.box.y + zone.box.depthFt / 2) },
    };
  });

  return {
    parcel: {
      widthFt: canon.parcel.width_ft,
      depthFt: canon.parcel.depth_ft,
      totalSqFt: canon.parcel.total_sq_ft,
    },
    zoneKeys: zones.map((zone) => zone.key),
    zones,
    markers,
    palette: canon.palette,
    tints: overrides.overrides.tints,
    player: {
      spawn,
      radiusFt: overrides.overrides.player.radius_ft,
      speedFtPerSec: overrides.overrides.player.speed_ft_per_s,
    },
    camera: {
      pitchDeg: overrides.overrides.camera.pitch_deg,
      yawDeg: overrides.overrides.camera.yaw_deg,
      maxZoom: overrides.overrides.camera.max_zoom,
      overviewMargin: overrides.overrides.camera.overview_margin,
    },
    clock: {
      daySeconds: overrides.overrides.clock.day_seconds,
      startHour: overrides.overrides.clock.start_hour,
    },
    plot: {
      zone: overrides.overrides.plot.zone,
      rows: overrides.overrides.plot.rows,
      cols: overrides.overrides.plot.cols,
      cellFt: overrides.overrides.plot.cell_ft,
    },
    water: {
      capacity: overrides.overrides.water.capacity,
      perUse: overrides.overrides.water.per_use,
      pausePerUseS: overrides.overrides.water.pause_per_use_s,
      refillBufferFt: overrides.overrides.water.refill_buffer_ft,
      refillZone: overrides.overrides.water.refill_zone,
    },
    growth: { stagesPerDay: overrides.overrides.growth.stages_per_day },
    pond: {
      seed: overrides.overrides.pond_look.seed,
      rimInnerFt: overrides.overrides.pond_look.rim_inner_ft,
      rimOuterFt: overrides.overrides.pond_look.rim_outer_ft,
      stoneCount: overrides.overrides.pond_look.stone_count,
      lilyPadCount: overrides.overrides.pond_look.lily_pad_count,
      stoneSizeFt: overrides.overrides.pond_look.stone_size_ft,
    },
    paths: {
      seed: overrides.overrides.paths_look.seed,
      widthFt: overrides.overrides.paths_look.width_ft,
      colour: overrides.overrides.paths_look.colour,
      steppingIntervalFt: overrides.overrides.paths_look.stepping_interval_ft,
      steppingJitterFt: overrides.overrides.paths_look.stepping_jitter_ft,
      steppingSizeFt: overrides.overrides.paths_look.stepping_size_ft,
    },
    movement: {
      mode: mode as MovementMode,
      freeZones: [...overrides.overrides.movement.free_zones],
      pathWidthFt: overrides.overrides.movement.path_width_ft,
      spawn: movementSpawn,
    },
    pondRing: {
      enabled: overrides.overrides.pond_ring.enabled,
      gapFt: overrides.overrides.pond_ring.gap_ft,
      widthFt: overrides.overrides.pond_ring.width_ft,
      segments: overrides.overrides.pond_ring.segments,
    },
    doors,
  };
}

/** The singleton world used by the app. Tests may call createWorld() again. */
export const WORLD: World = createWorld();

export function zoneByKey(world: World, key: string): Zone | undefined {
  return world.zones.find((zone) => zone.key === key);
}

export function requireZone(world: World, key: string): Zone {
  const zone = zoneByKey(world, key);
  if (!zone) throw new Error(`world has no zone "${key}"`);
  return zone;
}

/*  The path network needs the finished world (the ring radius comes from the
    pond config), so it is built once per world and cached. */
const networks = new WeakMap<World, PathNetwork>();

export function networkFor(world: World): PathNetwork {
  let network = networks.get(world);
  if (!network) {
    network = buildPathNetwork(world);
    networks.set(world, network);
  }
  return network;
}
