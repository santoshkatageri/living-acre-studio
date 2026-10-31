import sharp from "sharp";
import fs from "fs";
import path from "path";
import type { CaptionCue } from "./schemas";

/* ------------------------------------------------------------------ */
/*  Procedural graphics — brand cards, captions, thumbnails.           */
/*  Text is rasterized as SVG via libvips/librsvg (system DejaVu       */
/*  fonts), because the bundled ffmpeg ships libass but not drawtext.  */
/*  Captions burn through the libass `subtitles` filter with a styled  */
/*  .ass sidecar authored here.                                         */
/* ------------------------------------------------------------------ */

const INK = "#12100d";
const CREAM = "#f1ead9";
const AMBER = "#e8a33d";
const MUTED = "#9c8f78";

function escXml(t: string) {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function brandCardSvg(kind: "in" | "out", epNum: number, episodeTitle: string): string {
  const pad3 = String(epNum).padStart(3, "0");
  const centerLines =
    kind === "in"
      ? `
      <g text-anchor="middle">
        <text x="540" y="872" font-family="DejaVu Serif" font-weight="bold" font-size="150" fill="${CREAM}">go.dharaa</text>
        <text x="540" y="952" font-family="DejaVu Sans" font-weight="bold" font-size="39" letter-spacing="10" fill="${AMBER}">THE LIVING ACRE</text>
        <text x="540" y="1030" font-family="DejaVu Sans" font-size="30" letter-spacing="4" fill="${MUTED}">EPISODE ${pad3} · NORTH KARNATAKA</text>
      </g>`
      : `
      <g text-anchor="middle">
        <text x="540" y="828" font-family="DejaVu Serif" font-weight="bold" font-size="52" font-style="italic" fill="${CREAM}" opacity="0.92">${escXml(episodeTitle)}</text>
        <text x="540" y="958" font-family="DejaVu Serif" font-weight="bold" font-size="128" fill="${CREAM}">go.dharaa</text>
        <text x="540" y="1052" font-family="DejaVu Sans" font-weight="bold" font-size="30" letter-spacing="5" fill="${AMBER}">NEW EPISODES EVERY DAY · 7:00 AM IST</text>
      </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <radialGradient id="glow" cx="50%" cy="46%" r="60%">
      <stop offset="0%" stop-color="#3a2c18" stop-opacity="0.75"/>
      <stop offset="55%" stop-color="#241a0e" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${INK}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1080" height="1920" fill="${INK}"/>
  <rect width="1080" height="1920" fill="url(#glow)"/>
  <g transform="translate(540,640)">
    <circle cx="0" cy="0" r="62" fill="none" stroke="${AMBER}" stroke-width="4"/>
    <path d="M-128,132 C-84,100 -42,100 0,132 C42,164 84,164 128,132" fill="none" stroke="#8fae6a" stroke-width="5" stroke-linecap="round"/>
    <path d="M-108,168 C-70,142 -35,142 0,168 C35,194 70,194 108,168" fill="none" stroke="#5b7c4a" stroke-width="5" stroke-linecap="round" opacity="0.75"/>
  </g>
  <rect x="390" y="1178" width="300" height="3" fill="${AMBER}" opacity="0.9"/>
  ${centerLines}
  <g text-anchor="middle">
    <text x="540" y="1790" font-family="DejaVu Sans" font-size="24" letter-spacing="6" fill="${MUTED}">43,560 SQ FT · ONE FARMER · ONE HONEST DAY</text>
  </g>
</svg>`;
}

export function thumbOverlaySvg(epNum: number, title: string): string {
  const pad3 = String(epNum).padStart(3, "0");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="55%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.72"/>
    </linearGradient>
    <linearGradient id="shadeTop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="520" fill="url(#shadeTop)"/>
  <rect y="1200" width="1080" height="720" fill="url(#shade)"/>
  <text x="72" y="118" font-family="DejaVu Sans" font-weight="bold" font-size="30" letter-spacing="8" fill="${AMBER}">GO.DHARAA · THE LIVING ACRE</text>
  <rect x="72" y="146" width="190" height="3" fill="${AMBER}"/>
  <text x="72" y="1720" font-family="DejaVu Serif" font-weight="bold" font-size="120" fill="${CREAM}">EP.${pad3}</text>
  <text x="72" y="1796" font-family="DejaVu Sans" font-weight="bold" font-size="44" fill="${CREAM}" opacity="0.94">${escXml(title)}</text>
  <text x="72" y="1856" font-family="DejaVu Sans" font-size="27" letter-spacing="3" fill="${MUTED}">FIRST-PERSON · NORTH KARNATAKA · 9:16</text>
</svg>`;
}

export async function rasterize(svg: string, outFile: string) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  await sharp(Buffer.from(svg, "utf8"), { density: 72 }).png().toFile(outFile);
}

/* ------------------------------- ASS captions ------------------------------- */

function assTime(t: number) {
  const cs = Math.round((t % 1) * 100);
  const s = Math.floor(t) % 60;
  const m = Math.floor(t / 60) % 60;
  const h = Math.floor(t / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${h}:${pad(m)}:${pad(s)}.${String(cs).padStart(2, "0")}`;
}

export function buildAss(cues: CaptionCue[]): string {
  const header = `[Script Info]
Title: go.dharaa burn-in captions
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Burn,DejaVu Sans,56,&H00D9EAF1,&H00D9EAF1,&H32000000,&H64000000,-1,0,0,0,100,100,1.2,0,1,3.4,1.6,2,80,80,150,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const lines = cues
    .map(
      (c) =>
        `Dialogue: 0,${assTime(c.startS)},${assTime(c.endS)},Burn,,0,0,0,,${c.textEn.replace(/\n/g, "\\N")}`,
    )
    .join("\n");
  return header + lines + "\n";
}
