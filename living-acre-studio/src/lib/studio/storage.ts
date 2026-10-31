import fs from "fs";
import path from "path";
import { PUBLIC_DIR, episodeDir, episodeUrl } from "./constants";
import { sha256 } from "./util";

/* ------------------------------------------------------------------ */
/*  Media storage. Masters live under public/outputs/<episode>/... —    */
/*  served as stable HTTPS URLs by the app itself. Buffer consumes the  */
/*  media URL; the master is never handed off or deleted.               */
/* ------------------------------------------------------------------ */

export function ensureEpisodeDirs(episodeId: string) {
  const dirs = ["", "render", "render/segments", "audio", "captions", "thumb"];
  for (const d of dirs)
    fs.mkdirSync(path.join(episodeDir(episodeId), d), { recursive: true });
}

export function freshRenderDirs(episodeId: string) {
  const seg = path.join(episodeDir(episodeId), "render", "segments");
  fs.rmSync(seg, { recursive: true, force: true });
  fs.mkdirSync(seg, { recursive: true });
}

export function writeEpisodeText(episodeId: string, rel: string, content: string) {
  const p = path.join(episodeDir(episodeId), rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  return {
    filePath: p,
    url: `${episodeUrl(episodeId)}/${rel}`,
    bytes: Buffer.byteLength(content),
    checksum: sha256(content),
  };
}

export function fileInfo(episodeId: string, rel: string) {
  const p = path.join(episodeDir(episodeId), rel);
  const st = fs.statSync(p);
  return {
    filePath: p,
    url: `${episodeUrl(episodeId)}/${rel}`,
    bytes: st.size,
    checksum: sha256(fs.readFileSync(p)),
  };
}

export function publicPlateToFile(publicPath: string) {
  // "/assets/plates/x.jpg" -> <cwd>/public/assets/plates/x.jpg
  return path.join(PUBLIC_DIR, publicPath.replace(/^\//, ""));
}

export function dirSizeBytes(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) n += dirSizeBytes(p);
    else n += fs.statSync(p).size;
  }
  return n;
}
