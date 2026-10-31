/*  Shared types. Pure data: no three, no DOM. 1 unit = 1 ft.
    position_ft is the north-west corner; +x is east, canon +y is south
    (the renderer maps canon y to three.js z). */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  widthFt: number;
  depthFt: number;
}

export interface Circle {
  cx: number;
  cy: number;
  radiusFt: number;
}

export interface Parcel {
  widthFt: number;
  depthFt: number;
  totalSqFt: number;
}

export type ZoneLook = "solid" | "open_shed" | "canopy" | "beds" | "pits" | "marker";

export interface Zone {
  key: string;
  assetId: string | null;
  name: string;
  subtitle: string | null;
  /** Footprint: the canon size_ft at the canon position_ft corner. */
  box: Box;
  /** Set for the pond; a circle overrides the box for collision and labels. */
  circle: Circle | null;
  heightFt: number;
  look: ZoneLook;
  /** Solid zones are drawn as blocks and cannot be entered. */
  solid: boolean;
  palette: string[];
  identityTokens: string[];
}

export interface ZoneMarker {
  key: string;
  label: string;
  position: Vec2;
  heightFt: number;
}

export type DoorSide = "south" | "west";

export interface DoorSpec {
  side: DoorSide;
  /** Feet along the face from its west (south face) or north (west face) end. */
  offsetFt: number;
  /** Width of the opening in that face. */
  gapFt: number;
  /** The point on the face, in parcel feet. */
  point: Vec2;
}

export type MovementMode = "free" | "paths_only";

/** The four sides of the parcel, in the order the belt is walked. */
export type ParcelSide = "west" | "north" | "east" | "south";

/** One belt species. A SHAPE, not a botanical name. */
export interface BeltSpecies {
  id: string;
  weight: number;
  heightFt: [number, number];
  canopyFt: [number, number];
  /** Optional human label; null unless the data names one (then needs_review). */
  label: string | null;
}

/** Lighting preset. Every value is data; nothing is tinted in code. */
export interface LightPreset {
  sky: string;
  sunColour: string;
  sunIntensity: number;
  /** Compass angle of the sun: 0 = north, 90 = east, 180 = south. */
  sunAzimuthDeg: number;
  sunElevationDeg: number;
  ambientColour: string;
  ambientIntensity: number;
}

export interface World {
  parcel: Parcel;
  zoneKeys: string[];
  zones: Zone[];
  markers: ZoneMarker[];
  palette: Record<string, string>;
  tints: Record<string, string>;
  player: { spawn: Vec2; radiusFt: number; speedFtPerSec: number };
  camera: { pitchDeg: number; yawDeg: number; maxZoom: number; overviewMargin: number };
  clock: { daySeconds: number; startHour: number };
  plot: { zone: string; rows: number; cols: number; cellFt: number };
  water: { capacity: number; perUse: number; pausePerUseS: number; refillBufferFt: number; refillZone: string };
  growth: { stagesPerDay: number };
  pond: { seed: number; rimInnerFt: number; rimOuterFt: number; stoneCount: number; lilyPadCount: number; stoneSizeFt: [number, number] };
  paths: {
    seed: number;
    widthFt: number;
    colour: string;
    steppingIntervalFt: number;
    steppingJitterFt: number;
    steppingSizeFt: number;
  };
  movement: { mode: MovementMode; freeZones: string[]; pathWidthFt: number; spawn: string };
  pondRing: { enabled: boolean; gapFt: number; widthFt: number; segments: number };
  doors: Record<string, DoorSpec>;
  /** The vegetable bed's look: soil tint and the raised rows / edging. */
  beds: {
    soilTint: string;
    rowLiftFt: number;
    rowWidthFt: number;
    edgingWidthFt: number;
    edgingHeightFt: number;
  };
  /** The orchard's seeded tree grid (see src/sim/orchard.ts). */
  orchard: {
    seed: number;
    cols: number;
    rows: number;
    marginFt: number;
    jitterFt: number;
    heightFt: [number, number];
    canopyFt: [number, number];
  };
  /** The decorative tree belt just inside the boundary. No collision. */
  buffer: {
    enabled: boolean;
    widthFt: Record<ParcelSide, number>;
    spacingFt: number;
    rows: number;
    jitterFt: number;
    seed: number;
    gateGapFt: number;
    pathClearanceFt: number;
    zoneClearanceFt: number;
    canopyTopLimitFt: number;
    species: BeltSpecies[];
  };
  /** The garden walk: a closed loop joined to the path network. */
  perimeter: {
    enabled: boolean;
    widthFt: number;
    offsetFt: number;
    cornerRadiusFt: number;
    connectors: string[];
    maxConnectors: number;
    nodeSpacingFt: number;
    clearanceFt: number;
  };
  lighting: {
    defaultPreset: string;
    shadowExtentFt: number;
    shadowMapSize: number;
    presets: Record<string, LightPreset>;
  };
}
