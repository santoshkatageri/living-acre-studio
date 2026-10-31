import cropsJson from "../data/crops.json";

import { languageStatus, t, type Lang, type ReviewStatus } from "./i18n";

/*  Crops: names in three languages, each with its own review status. */

export interface Crop {
  id: string;
  name: Record<Lang, string>;
  status: Record<Lang, ReviewStatus>;
  stages: number;
  daysPerStage: number;
  colour: string;
}

interface CropsFile {
  crops: {
    id: string;
    name: Record<string, string>;
    status: Record<string, string>;
    stages: number;
    days_per_stage: number;
    colour: string;
  }[];
}

function status(value: string, where: string): ReviewStatus {
  if (value !== "approved" && value !== "needs_review") {
    throw new Error(`crops.json: ${where} status must be approved or needs_review`);
  }
  return value;
}

const crops: Crop[] = (cropsJson as unknown as CropsFile).crops.map((raw) => {
  const name = {} as Record<Lang, string>;
  const statuses = {} as Record<Lang, ReviewStatus>;
  for (const lang of ["en", "hi", "kn"] as Lang[]) {
    const text = raw.name[lang];
    if (text === undefined) throw new Error(`crops.json: "${raw.id}" has no ${lang} name`);
    name[lang] = text;
    statuses[lang] = status(raw.status[lang] ?? "needs_review", `${raw.id}.${lang}`);
  }
  return {
    id: raw.id,
    name,
    status: statuses,
    stages: raw.stages,
    daysPerStage: raw.days_per_stage,
    colour: raw.colour,
  };
});

export function allCrops(): Crop[] {
  return crops;
}

export function cropById(id: string): Crop {
  const crop = crops.find((entry) => entry.id === id);
  if (!crop) throw new Error(`crops.json: no crop "${id}"`);
  return crop;
}

export function cropName(crop: Crop, lang: Lang): string {
  return crop.name[lang];
}

export { languageStatus, t, type Lang, type ReviewStatus };
