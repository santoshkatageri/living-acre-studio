import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Binary-carrying packages must resolve via Node require at runtime —
  // never through the bundler.
  serverExternalPackages: ["ffmpeg-static", "@ffprobe-installer/ffprobe"],
};

export default nextConfig;
