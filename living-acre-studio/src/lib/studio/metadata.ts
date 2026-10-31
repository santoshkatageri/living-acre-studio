import type { EpisodeSpec, PlatformMetadataSet } from "./schemas";
import { SERIES } from "./series";

/* ------------------------------------------------------------------ */
/*  Platform metadata — YouTube Shorts & Instagram Reels get separate,  */
/*  platform-native copy. Never blindly duplicated.                     */
/* ------------------------------------------------------------------ */

const HANDLE = "@godharaa.acre";
const YT_TAGS = [
  "#Shorts",
  "#Farming",
  "#VillageLife",
  "#KarnatakaVillage",
  "#Hallikar",
  "#Goshala",
  "#Kannada",
  "#SlowLiving",
  "#GoDharaa",
];
const IG_TAGS = [
  "#Reels",
  "#FarmLifeIndia",
  "#Karnataka",
  "#VillageLife",
  "#HallikarCow",
  "#MorningRoutine",
  "#SlowLiving",
  "#KannadaReels",
  "#OrganicFarming",
  "#GoDharaa",
];

export function buildMetadata(spec: EpisodeSpec): PlatformMetadataSet {
  const series = SERIES.find((s) => s.slug === spec.series);
  const ep = spec.episodeId.split("-").pop();
  const activities = spec.scenes.map((s) => s.activity);

  const ytTitle = `${spec.title} · ${ep} | Realistic Farm POV`.slice(0, 100);
  const ytDescription = [
    `${spec.title} — a first-person morning on one red-soil acre in North Karnataka.`,
    "",
    `In this episode: ${activities.join(" · ")}.`,
    "",
    spec.labels.disclosure,
    `Series: ${series?.name ?? spec.series}. New episodes daily, 7:00 AM IST.`,
    "",
    `Follow the acre: ${HANDLE}`,
    "",
    YT_TAGS.join(" "),
  ].join("\n");

  const igCaption = [
    `A quiet first-person morning on the Living Acre.`,
    `We open the door at six, walk the red path, and Ganga is already waiting. ${spec.scenes[2] ? "Then on to the beds before the sun clears the trees." : ""}`.trim(),
    "",
    `Which moment felt most like home? — comment below.`,
    "",
    spec.labels.disclosure,
    `— ${HANDLE} · Episode ${ep}`,
  ].join("\n");

  return {
    youtube: {
      title: ytTitle,
      description: ytDescription,
      caption: `${spec.title} · ${ep}`,
      hashtags: YT_TAGS,
      coverKind: "thumbnail",
    },
    instagram: {
      title: `${spec.title} · ${ep}`.slice(0, 100),
      description: igCaption,
      caption: igCaption.slice(0, 2200),
      hashtags: IG_TAGS,
      coverKind: "thumbnail",
    },
  };
}
