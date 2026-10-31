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
}
