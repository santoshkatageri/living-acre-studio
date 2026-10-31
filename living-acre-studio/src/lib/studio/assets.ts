import type { AssetSpec } from "./schemas";

/* ------------------------------------------------------------------ */
/*  The Living Acre — canonical Asset Bible (seed data).               */
/*  Stable IDs. Never change identity fields in place; version bumps   */
/*  create new asset IDs instead.                                       */
/* ------------------------------------------------------------------ */

export interface AssetSeed {
  id: string;
  kind: "location" | "character" | "livestock" | "scene_plate" | "brand" | "prop";
  name: string;
  subtitle: string;
  description: string;
  imagePath: string | null;
  tags: string[];
  spec: AssetSpec;
}

export const ASSET_BIBLE: AssetSeed[] = [
  /* ------------------------------ locations ------------------------- */
  {
    id: "loc-boundary",
    kind: "location",
    name: "The Acre — boundary",
    subtitle: "43,560 sq ft · 209 ft × 208.3 ft",
    description:
      "Canonical parcel of red laterite soil in North Karnataka. Gated to the south-west; every layout measurement references this boundary.",
    imagePath: "/assets/plates/08-aerial.jpg",
    tags: ["farm", "geography"],
    spec: {
      kind: "location",
      dimensions: { widthFt: 209, depthFt: 208.3, areaSqFt: 43560 },
      notes: "Location is fixed canon. Do not move, resize or reorient.",
      position: { x: 0, y: 0, w: 100, h: 100 },
    },
  },
  {
    id: "loc-farmhouse",
    kind: "location",
    name: "Farmhouse",
    subtitle: "Terracotta roof · our door opens east",
    description:
      "Single-storey farmhouse with clay-tiled roof and swept red-earth courtyard. Episode 001 begins at this door.",
    imagePath: "/assets/plates/01-sunrise-door.jpg",
    tags: ["structure", "morning"],
    spec: {
      kind: "location",
      materials: ["burnt brick", "clay tiles", "teak door", "lime wash"],
      palette: ["#a34d2f", "#dcb98a", "#5c4033"],
      dimensions: { widthFt: 30, depthFt: 22 },
      position: { x: 6, y: 6, w: 16, h: 13 },
      identityTokens: ["terracotta tiled roof", "teak door opening east", "swept courtyard"],
    },
  },
  {
    id: "loc-goshala",
    kind: "location",
    name: "Goshala",
    subtitle: "North side · Ganga's home",
    description:
      "Open-front cattle shed: wooden posts, hay bed, manger, and a water trough by the door. Morning light enters in shafts.",
    imagePath: "/assets/plates/03-goshala.jpg",
    tags: ["structure", "livestock"],
    spec: {
      kind: "location",
      materials: ["wooden posts", "clay tile roof", "packed earth floor"],
      dimensions: { widthFt: 34, depthFt: 24 },
      position: { x: 28, y: 8, w: 22, h: 12 },
      identityTokens: ["wooden post grid", "hay bed", "stone trough"],
    },
  },
  {
    id: "loc-vegbeds",
    kind: "location",
    name: "Vegetable beds",
    subtitle: "Tomatoes in season",
    description:
      "Raised red-soil beds in mulched rows — tomatoes, chilli, brinjal rotation, marigold borders for pest control.",
    imagePath: "/assets/plates/06-veg-garden.jpg",
    tags: ["crops"],
    spec: {
      kind: "location",
      palette: ["#6e4a2f", "#4c6b32", "#b8392a"],
      dimensions: { widthFt: 80, depthFt: 70 },
      position: { x: 12, y: 36, w: 44, h: 38 },
      identityTokens: ["raised beds", "marigold borders", "red laterite paths"],
    },
  },
  {
    id: "loc-orchard",
    kind: "location",
    name: "Orchard",
    subtitle: "Mango · sapota · a young drumstick line",
    description: "East orchard block with drip line and leaf litter mulch.",
    imagePath: "/assets/plates/02-farm-walk.jpg",
    tags: ["trees"],
    spec: {
      kind: "location",
      dimensions: { widthFt: 66, depthFt: 58 },
      position: { x: 60, y: 22, w: 34, h: 28 },
      identityTokens: ["mango canopy", "drip line", "leaf mulch"],
    },
  },
  {
    id: "loc-pond",
    kind: "location",
    name: "Pond",
    subtitle: "Rain-fed · our water bank",
    description:
      "Small circular farm pond in the south-east corner; feeds the garden through summer.",
    imagePath: "/assets/plates/08-aerial.jpg",
    tags: ["water"],
    spec: {
      kind: "location",
      dimensions: { diameterFt: 40 },
      position: { x: 70, y: 66, w: 26, h: 26 },
      identityTokens: ["stone rim", "long morning reflection"],
    },
  },
  {
    id: "loc-compost",
    kind: "location",
    name: "Compost corner",
    subtitle: "South fence",
    description: "Twin compost pits shaded by a neem tree; nothing organic leaves the acre.",
    imagePath: null,
    tags: ["soil"],
    spec: { kind: "location", position: { x: 8, y: 82, w: 16, h: 12 }, identityTokens: ["twin pits", "neem shade"] },
  },
  {
    id: "loc-path",
    kind: "location",
    name: "Main path",
    subtitle: "From door to goshala to beds",
    description: "The red-earth spine of the farm — every POV walk uses this route.",
    imagePath: "/assets/plates/02-farm-walk.jpg",
    tags: ["route"],
    spec: { kind: "location", identityTokens: ["red-dirt path", "banana line"] },
  },

  /* ------------------------------ characters ------------------------ */
  {
    id: "char-nanjunda",
    kind: "character",
    name: "Nanjunda",
    subtitle: "The farmer · our eyes and hands",
    description:
      "Early fifties, weathered and unhurried. We mostly see the world through his eyes; hands and silhouette only, per POV convention.",
    imagePath: "/assets/ref/farmer.jpg",
    tags: ["pov", "identity"],
    spec: {
      kind: "character",
      markings:
        "White cotton kurta, white panche, green cotton towel over left shoulder, simple leather sandals, short grey stubble.",
      dimensions: { heightM: 1.68 },
      identityTokens: [
        "white kurta",
        "green shoulder towel",
        "white panche",
        "leather sandals",
        "weathered hands",
        "grey stubble",
      ],
      notes: "POV rule: hands may enter frame naturally; face only in reflections or portraits.",
    },
  },
  {
    id: "animal-ganga",
    kind: "livestock",
    name: "Ganga",
    subtitle: "Hallikar cow · eleven years on the acre",
    description:
      "Grey-white Hallikar with long lyre-shaped horns and a rope halter. Calm, curious, camera-comfortable. One identity across all episodes.",
    imagePath: "/assets/plates/04-ganga.jpg",
    tags: ["cow", "hallikar", "identity"],
    spec: {
      kind: "livestock",
      breed: "Hallikar",
      markings:
        "Smooth grey-white coat, darker shading across neck and hump, black muzzle, long lyre-shaped backward-curving horns, simple rope halter.",
      dimensions: { heightM: 1.35, lengthM: 1.9 },
      identityTokens: [
        "grey-white coat",
        "lyre-shaped horns",
        "rope halter",
        "black muzzle",
        "calm demeanor",
      ],
      notes: "Never re-generate a new cow design — reuse identity tokens verbatim in prompts.",
    },
  },

  /* ------------------------------ plates ---------------------------- */
  ...[
    ["plate-sunrise-door", "Sunrise door", "01-sunrise-door.jpg", "door opening to dawn"],
    ["plate-farm-walk", "Red-earth walk", "02-farm-walk.jpg", "POV path between beds"],
    ["plate-goshala", "Goshala interior", "03-goshala.jpg", "shafts of dawn light in shed"],
    ["plate-ganga", "Ganga portrait", "04-ganga.jpg", "Hallikar portrait, goshala"],
    ["plate-feeding", "Feeding POV", "05-feeding.jpg", "hands offering fodder"],
    ["plate-veg-garden", "Tomato rows", "06-veg-garden.jpg", "raised beds, dew"],
    ["plate-watering", "Watering POV", "07-watering.jpg", "backlit droplets"],
    ["plate-aerial", "Acre overview", "08-aerial.jpg", "golden-hour elevated view"],
    ["plate-evening", "Amber courtyard", "09-evening.jpg", "evening lamp glow"],
  ].map(([id, name, file, note]) => ({
    id: id as string,
    kind: "scene_plate" as const,
    name: name as string,
    subtitle: "Cinematic plate · 9:16 library",
    description: `Canonical scene plate — ${note}.`,
    imagePath: `/assets/plates/${file}`,
    tags: ["plate", "library"],
    spec: {
      kind: "scene_plate",
      notes: "Approved plate. Renders must source plates from this library unless a new plate passes QC.",
      identityTokens: [],
    },
  })),

  {
    id: "brand-dharaa",
    kind: "brand",
    name: "go.dharaa wordmark",
    subtitle: "Logo & type system",
    description: "Warm cream serif wordmark on ink, sun-glyph accent. Used on intro and outro cards.",
    imagePath: null,
    tags: ["brand"],
    spec: {
      kind: "brand",
      palette: ["#f1ead9", "#e8a33d", "#12100d"],
      identityTokens: ["cream serif wordmark", "amber sun glyph", "ink background"],
    },
  },
];
