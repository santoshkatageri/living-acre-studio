/* Seed: series catalog, canonical Asset Bible, studio config, and      */
/* Episode 001 in draft form ready for the pipeline console.            */
import "dotenv/config";
import { db } from "../src/db";
import { assets, episodes, series, studioConfig } from "../src/db/schema";
import { ASSET_BIBLE } from "../src/lib/studio/assets";
import { SERIES } from "../src/lib/studio/series";
import { createEpisode } from "../src/lib/studio/pipeline";

const EP001 = {
  id: "living-acre-001",
  instruction:
    "Create today's morning farm episode. Show the farmer walking to the goshala, feeding Ganga, inspecting the tomato crop and watering the vegetable beds. Produce Kannada narration and prepare YouTube and Instagram posts.",
};

async function main() {
  console.log("Seeding series…");
  for (const s of SERIES) {
    await db
      .insert(series)
      .values({ ...s })
      .onConflictDoNothing({ target: series.slug });
  }

  console.log("Seeding the Asset Bible…");
  for (const a of ASSET_BIBLE) {
    await db
      .insert(assets)
      .values({
        id: a.id,
        kind: a.kind,
        name: a.name,
        subtitle: a.subtitle,
        description: a.description,
        imagePath: a.imagePath,
        spec: a.spec,
        tags: a.tags,
      })
      .onConflictDoNothing({ target: assets.id });
  }

  console.log("Seeding studio config…");
  const configSeeds: [string, Record<string, unknown>][] = [
    ["schedule", { youtube: "07:00", instagram: "19:30", timezone: "Asia/Kolkata" }],
    ["publishing", { requiresApproval: true, engine: "buffer", mediaRetention: "masters retained under /outputs until Buffer confirms" }],
    ["asset_bible_version", { version: 1, note: "v1 frozen: farmhouse, goshala, tomato beds, orchard, pond, Nanjunda, Ganga (Hallikar)" }],
  ];
  for (const [key, value] of configSeeds) {
    await db
      .insert(studioConfig)
      .values({ key, value })
      .onConflictDoNothing({ target: studioConfig.key });
  }

  const existing = await db.select().from(episodes);
  if (!existing.some((e) => e.id === EP001.id)) {
    console.log("Planning Episode 001…");
    const id = await createEpisode({ instruction: EP001.instruction, seriesSlug: "morning-at-the-living-acre" });
    console.log(`Episode ready: ${id}`);
  } else {
    console.log("Episode 001 already present — leaving as-is (no silent overwrite).");
  }
  console.log("Seed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
