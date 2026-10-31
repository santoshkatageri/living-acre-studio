/* ------------------------------------------------------------------ */
/*  Series catalog, video templates and the reusable activity library. */
/*  Deterministic, versioned content law for The Living Acre.          */
/* ------------------------------------------------------------------ */

export interface SeriesDef {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  templateId: string;
  cadence: string;
  accent: string; // hex
  sortOrder: number;
}

export const SERIES: SeriesDef[] = [
  {
    id: "series-a",
    slug: "morning-at-the-living-acre",
    name: "Morning at the Living Acre",
    tagline: "Sunrise walks and first chores",
    description:
      "Opening the farmhouse, bird-filled dawn walks, inspection rounds and the quiet start of the day.",
    templateId: "tpl-pov",
    cadence: "weekday mornings",
    accent: "#e8a33d",
    sortOrder: 1,
  },
  {
    id: "series-b",
    slug: "life-at-the-goshala",
    name: "Life at the Goshala",
    tagline: "Ganga's world",
    description:
      "Feeding, cleaning, water troughs and livestock care with Ganga, our Hallikar cow.",
    templateId: "tpl-livestock",
    cadence: "twice weekly",
    accent: "#cdb37e",
    sortOrder: 2,
  },
  {
    id: "series-c",
    slug: "farmers-daily-life",
    name: "Farmer's Daily Life",
    tagline: "Soil, water and work",
    description:
      "Irrigation, planting, harvesting, soil preparation and honest farm maintenance.",
    templateId: "tpl-pov",
    cadence: "twice weekly",
    accent: "#c2613e",
    sortOrder: 3,
  },
  {
    id: "series-d",
    slug: "sustainable-living",
    name: "Sustainable Living",
    tagline: "Nothing wasted",
    description:
      "Composting, organic waste, water conservation, solar energy and low-input agriculture.",
    templateId: "tpl-edu",
    cadence: "weekly",
    accent: "#7c9a5d",
    sortOrder: 4,
  },
  {
    id: "series-e",
    slug: "evening-at-the-farm",
    name: "Evening at the Farm",
    tagline: "Slow amber hours",
    description:
      "Sunset walks, evening livestock routines, courtyard food and night ambience.",
    templateId: "tpl-ambience",
    cadence: "weekends",
    accent: "#d97f4a",
    sortOrder: 5,
  },
  {
    id: "series-f",
    slug: "learn-about-farming",
    name: "Learn About Farming",
    tagline: "Small lessons, real science",
    description:
      "Crop growth, techniques, soil & water and livestock education — always clearly labelled simulation vs. observation.",
    templateId: "tpl-edu",
    cadence: "weekly",
    accent: "#7ba3b5",
    sortOrder: 6,
  },
];

/* ------------------------------ templates --------------------------- */

export interface TemplateDef {
  id: string;
  name: string;
  description: string;
  narrationDensity: "none" | "sparse" | "full";
  pacing: string;
  music: boolean;
  sceneDuration: [number, number];
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: "tpl-pov",
    name: "First-person immersive experience",
    description:
      "POV camera movement, realistic environmental sounds, natural activities, minimal narration.",
    narrationDensity: "sparse",
    pacing: "unhurried cuts, 6–12s holds",
    music: false,
    sceneDuration: [6, 12],
  },
  {
    id: "tpl-cinematic",
    name: "Cinematic rural-life story",
    description: "Sequenced cinematic shots with storytelling and score.",
    narrationDensity: "sparse",
    pacing: "longer holds, motivated moves",
    music: true,
    sceneDuration: [8, 14],
  },
  {
    id: "tpl-edu",
    name: "Educational farm experience",
    description:
      "Short narration, explanatory overlays, demonstrations and captions. Facts must be grounded and labelled.",
    narrationDensity: "full",
    pacing: "caption-timed",
    music: false,
    sceneDuration: [8, 14],
  },
  {
    id: "tpl-livestock",
    name: "Livestock care",
    description:
      "Realistic animal care — feeding, drinking, cleaning and daily routines with canonical animals.",
    narrationDensity: "sparse",
    pacing: "slow, respectful distance",
    music: false,
    sceneDuration: [8, 14],
  },
  {
    id: "tpl-ambience",
    name: "Peaceful rural ambience",
    description: "Visual storytelling, environmental audio, minimal text.",
    narrationDensity: "none",
    pacing: "very slow holds",
    music: true,
    sceneDuration: [10, 15],
  },
];

/* --------------------------- activity library ----------------------- */
/* Canonical, reusable scene verbs. The planner composes these into     */
/* episodes; every entry is bound to a farm location, a plate and       */
/* bilingual narration with a render-safe English burn-in caption.      */

export interface ActivityDef {
  key: string;
  match: string[]; // instruction keywords
  title: string;
  activity: string;
  locationId: string;
  camera: "first_person" | "cinematic" | "static_broll";
  plate: string; // canonical plate asset id
  motionProfile:
    | "push-in"
    | "pull-back"
    | "drift-left"
    | "drift-right"
    | "rise"
    | "settle";
  duration: number;
  subjects: string[];
  kn: string;
  en: string; // narration english
  burn: string; // <= 42 chars, latin-safe
}

export const PLATE = {
  sunriseDoor: "plate-sunrise-door",
  farmWalk: "plate-farm-walk",
  goshala: "plate-goshala",
  ganga: "plate-ganga",
  feeding: "plate-feeding",
  vegGarden: "plate-veg-garden",
  watering: "plate-watering",
  aerial: "plate-aerial",
  evening: "plate-evening",
} as const;

export const ACTIVITIES: ActivityDef[] = [
  {
    key: "open-door",
    match: ["door", "sunrise", "morning", "open farmhouse", "wake"],
    title: "Opening the farmhouse",
    activity: "open farmhouse door to the sunrise",
    locationId: "loc-farmhouse",
    camera: "first_person",
    plate: PLATE.sunriseDoor,
    motionProfile: "push-in",
    duration: 7,
    subjects: ["char-nanjunda"],
    kn: "ಬೆಳಗ್ಗೆ ಆರು ಗಂಟೆ. ಮನೆ ಬಾಗಿಲು ತೆರೆಯೋಣ.",
    en: "Six in the morning. We open the farmhouse door.",
    burn: "6:00 AM — we open the farmhouse",
  },
  {
    key: "farm-walk",
    match: ["walk", "path", "inspect", "morning round", "fields"],
    title: "The red-earth walk",
    activity: "walk the farm path at first light",
    locationId: "loc-path",
    camera: "first_person",
    plate: PLATE.farmWalk,
    motionProfile: "drift-right",
    duration: 8,
    subjects: ["char-nanjunda"],
    kn: "ಕೆಂಪು ಮಣ್ಣಿನ ದಾರಿಯಲ್ಲಿ ದಿನದ ಮೊದಲ ನಡಿಗೆ.",
    en: "The first steps of the day on the red-earth path.",
    burn: "First steps on the red-earth path",
  },
  {
    key: "enter-goshala",
    match: ["goshala", "shed", "cattle shed", "enter goshala", "approach"],
    title: "Entering the goshala",
    activity: "enter the goshala and greet the morning",
    locationId: "loc-goshala",
    camera: "first_person",
    plate: PLATE.goshala,
    motionProfile: "push-in",
    duration: 8,
    subjects: ["char-nanjunda", "animal-ganga"],
    kn: "ಗೋಶಾಲೆಯ ಬಾಗಿಲು. ಗಂಗ ನಮಗಾಗಿ ಕಾದಿದ್ದಾಳೆ.",
    en: "The goshala door. Ganga has been waiting for us.",
    burn: "The goshala. Ganga is waiting.",
  },
  {
    key: "greet-ganga",
    match: ["ganga", "approach ganga", "cow", "hallikar", "greet"],
    title: "Approaching Ganga",
    activity: "approach Ganga the Hallikar cow",
    locationId: "loc-goshala",
    camera: "first_person",
    plate: PLATE.ganga,
    motionProfile: "settle",
    duration: 10,
    subjects: ["animal-ganga"],
    kn: "ಗಂಗೆ — ಹಳ್ಳಿಕಾರ್ ದನ. ಹನ್ನೊಂದು ವರ್ಷದಿಂದ ನಮ್ಮ ಜೊತೆ.",
    en: "Ganga — a Hallikar cow. Eleven years with our family.",
    burn: "Ganga — Hallikar, eleven years with us",
  },
  {
    key: "feed-ganga",
    match: ["feed", "feeding", "fodder", "hay", "grass"],
    title: "Morning fodder",
    activity: "feed fresh fodder to Ganga",
    locationId: "loc-goshala",
    camera: "first_person",
    plate: PLATE.feeding,
    motionProfile: "push-in",
    duration: 10,
    subjects: ["animal-ganga", "char-nanjunda"],
    kn: "ಮೊದಲು ಮೇವು. ಹೊಟ್ಟೆ ತುಂಬಿದ ಹಸು — ನಗುವ ಹಸು.",
    en: "Fodder first. A fed cow is a smiling cow.",
    burn: "Fodder first. Always.",
  },
  {
    key: "veg-inspect",
    match: ["tomato", "vegetable", "garden", "crop", "inspect crop", "beds"],
    title: "Between the tomato rows",
    activity: "inspect the tomato beds",
    locationId: "loc-vegbeds",
    camera: "first_person",
    plate: PLATE.vegGarden,
    motionProfile: "drift-left",
    duration: 10,
    subjects: ["char-nanjunda"],
    kn: "ಟೊಮ್ಯಾಟೊ ಸಾಲುಗಳ ನಡುವೆ — ನಿನ್ನೆಯ ಬೀಜ, ಇಂದು ಸಸಿ.",
    en: "Between the tomato rows — yesterday's seed, today's seedling.",
    burn: "Between the tomato rows",
  },
  {
    key: "water-beds",
    match: ["water", "watering", "irrigate", "irrigation"],
    title: "Watering the beds",
    activity: "water the vegetable beds",
    locationId: "loc-vegbeds",
    camera: "first_person",
    plate: PLATE.watering,
    motionProfile: "drift-right",
    duration: 8,
    subjects: ["char-nanjunda"],
    kn: "ನೀರು ನಿಧಾನವಾಗಿ — ಬೇರಿನವರೆಗೆ.",
    en: "Water slowly — all the way to the roots.",
    burn: "Water slow — down to the roots",
  },
  {
    key: "overlook",
    match: ["overview", "aerial", "closing", "sunrise overview", "establishing"],
    title: "One acre of morning",
    activity: "cinematic closing view over the farm",
    locationId: "loc-boundary",
    camera: "cinematic",
    plate: PLATE.aerial,
    motionProfile: "rise",
    duration: 7,
    subjects: [],
    kn: "ಒಂದು ಎಕರೆ, ಒಂದು ಬೆಳಗ್ಗೆ. ಇದೇ ನಮ್ಮ ಜಗತ್ತು.",
    en: "One acre. One morning. This is our world.",
    burn: "One acre. One morning. Our world.",
  },
  {
    key: "evening-court",
    match: ["evening", "sunset", "courtyard", "dusk", "night"],
    title: "The amber hour",
    activity: "evening quiet in the farm courtyard",
    locationId: "loc-farmhouse",
    camera: "first_person",
    plate: PLATE.evening,
    motionProfile: "settle",
    duration: 10,
    subjects: ["char-nanjunda"],
    kn: "ಸಂಜೆಯ ಬೆಳಕು. ದಿನದ ಕೆಲಸ ನಿಲ್ಲುತ್ತದೆ.",
    en: "Evening light. The day's work comes to rest.",
    burn: "Evening light — the work rests",
  },
  {
    key: "clean-goshala",
    match: ["clean", "cleaning", "sweep"],
    title: "Cleaning the shed",
    activity: "clean and refresh the goshala floor",
    locationId: "loc-goshala",
    camera: "first_person",
    plate: PLATE.goshala,
    motionProfile: "drift-left",
    duration: 9,
    subjects: ["char-nanjunda", "animal-ganga"],
    kn: "ಚೆನ್ನಾಗಿ ಬಾಚಿದ ಮನೆ — ಆರೋಗ್ಯದ ಮೊದಲ ಹೆಜ್ಜೆ.",
    en: "A clean shed — the first step to animal health.",
    burn: "A clean shed means a healthy herd",
  },
  {
    key: "trough-water",
    match: ["trough", "drinking", "fill water"],
    title: "Filling the trough",
    activity: "fill the drinking trough for Ganga",
    locationId: "loc-goshala",
    camera: "first_person",
    plate: PLATE.watering,
    motionProfile: "push-in",
    duration: 8,
    subjects: ["animal-ganga"],
    kn: "ಶುದ್ಧ ನೀರು — ದಿನಕ್ಕೆ ಮೂರು ಬಾರಿ.",
    en: "Clean water — three times a day.",
    burn: "Clean water, three times a day",
  },
  {
    key: "compost",
    match: ["compost", "waste", "organic"],
    title: "Turning the compost",
    activity: "turn the compost heap near the south fence",
    locationId: "loc-compost",
    camera: "first_person",
    plate: PLATE.farmWalk,
    motionProfile: "drift-right",
    duration: 9,
    subjects: ["char-nanjunda"],
    kn: "ಕಸವಲ್ಲ — ಮ futರದ ಬೆಳಕಿಗೆ ಮಣ್ಣು.",
    en: "Not waste — tomorrow's soil in the making.",
    burn: "Not waste — tomorrow's soil",
  },
  {
    key: "pond-check",
    match: ["pond", "check pond", "water level"],
    title: "Checking the pond",
    activity: "inspect the farm pond level",
    locationId: "loc-pond",
    camera: "first_person",
    plate: PLATE.evening,
    motionProfile: "settle",
    duration: 8,
    subjects: ["char-nanjunda"],
    kn: "ಕೆರೆ ನಮ್ಮ ಬ್ಯಾಂಕ್ — ನೀರು ಉಳಿವೇ ಸಂಪತ್ತು.",
    en: "The pond is our bank — saved water is wealth.",
    burn: "Saved water is saved wealth",
  },
];

export const DEFAULT_ORDER = [
  "open-door",
  "farm-walk",
  "enter-goshala",
  "greet-ganga",
  "feed-ganga",
  "veg-inspect",
  "water-beds",
  "overlook",
];
