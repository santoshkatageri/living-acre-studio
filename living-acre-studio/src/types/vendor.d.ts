declare module "ffmpeg-static" {
  const path: string | null;
  export default path;
}

declare module "@ffprobe-installer/ffprobe" {
  const installer: { path: string; version: string };
  export default installer;
}
