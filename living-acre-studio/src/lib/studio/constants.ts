import path from "path";

/* ------------------------------------------------------------------ */
/*  Studio constants — brand, paths, render conventions                */
/* ------------------------------------------------------------------ */

export const BRAND = {
  name: "go.dharaa",
  property: "The Living Acre",
  tagline: "One acre. One farmer. One honest day at a time.",
  region: "North Karnataka, India",
  acreSqFt: 43560,
  // An acre is 43,560 sq ft; our canonical parcel is 209 ft × 208.3 ft.
  parcelWidthFt: 209,
  parcelDepthFt: 208.3,
  palette: {
    ink: "#12100d",
    paper: "#1b1712",
    cream: "#f1ead9",
    amber: "#e8a33d",
    leaf: "#7c9a5d",
    terra: "#c2613e",
  },
} as const;

export const TZ = "Asia/Kolkata";

export const DEFAULT_SLOTS = { youtube: "07:00", instagram: "19:30" } as const;

export const RENDER = {
  width: 1080,
  height: 1920,
  fps: 24,
  crfSegment: 21,
  crfMaster: 19,
  fontBold: "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  fontSerif: "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
} as const;

export const PUBLIC_DIR = path.join(process.cwd(), "public");

export function episodeDir(episodeId: string) {
  return path.join(PUBLIC_DIR, "outputs", episodeId);
}
export function episodeUrl(episodeId: string) {
  return `/outputs/${episodeId}`;
}

export const ENV = {
  bufferApiKey: process.env.BUFFER_API_KEY ?? "",
  bufferOrgId: process.env.BUFFER_ORGANIZATION_ID ?? "",
  bufferIgChannel: process.env.BUFFER_INSTAGRAM_CHANNEL_ID ?? "",
  bufferYtChannel: process.env.BUFFER_YOUTUBE_CHANNEL_ID ?? "",
  autoPublish: (process.env.AUTO_PUBLISH ?? "false").toLowerCase() === "true",
  yoloExternal: (process.env.ALLOW_EXTERNAL_CALLS ?? "false").toLowerCase(),
};

export function maskId(id: string) {
  if (!id) return "";
  if (id.length <= 6) return "••••••";
  return `${id.slice(0, 3)}••••${id.slice(-3)}`;
}
