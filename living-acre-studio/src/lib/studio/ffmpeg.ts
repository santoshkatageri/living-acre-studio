import { execFile } from "child_process";
import ffmpegPath from "ffmpeg-static";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

/* ------------------------------------------------------------------ */
/*  FFmpeg binaries + promise wrappers. The render engine never shells */
/*  through a string — args arrays only.                               */
/* ------------------------------------------------------------------ */

export function ffmpegBin(): string {
  if (typeof ffmpegPath === "string" && ffmpegPath) return ffmpegPath;
  throw new Error("ffmpeg-static binary not available on this platform");
}
export function ffprobeBin(): string {
  return ffprobeInstaller.path;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  ms: number;
}

export function runFfmpeg(
  args: string[],
  opts: { timeoutMs?: number; logTail?: (line: string) => void } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const proc = execFile(
      ffmpegBin(),
      ["-hide_banner", "-y", ...args],
      { timeout: opts.timeoutMs ?? 180_000, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const ms = Date.now() - t0;
        if (err) {
          reject(
            new Error(
              `ffmpeg exited ${proc.exitCode ?? "?"} after ${ms}ms\n${stderr.slice(-1600)}`,
            ),
          );
        } else resolve({ code: 0, stdout, stderr, ms });
      },
    );
    if (opts.logTail && proc.stderr) {
      let buf = "";
      proc.stderr.on("data", (c) => {
        buf += String(c);
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const l of lines.slice(-1)) opts.logTail!(l);
      });
    }
  });
}

export function runFfprobe(args: string[], timeoutMs = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      ffprobeBin(),
      args,
      { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) reject(new Error(`ffprobe failed: ${stderr.slice(-600)}`));
        else resolve(stdout);
      },
    );
  });
}

export interface ProbeResult {
  format: {
    duration: number;
    size: number;
    formatName: string;
  };
  video?: {
    codec: string;
    width: number;
    height: number;
    fps: number;
    pixFmt: string;
    frames: number;
  };
  audio?: {
    codec: string;
    sampleRate: number;
    channels: number;
  };
}

export async function probeMedia(file: string): Promise<ProbeResult> {
  const out = await runFfprobe([
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    file,
  ]);
  const j = JSON.parse(out);
  const v = (j.streams ?? []).find((s: any) => s.codec_type === "video");
  const a = (j.streams ?? []).find((s: any) => s.codec_type === "audio");
  const fps = v
    ? (() => {
        const [n, d] = String(v.avg_frame_rate || "0/1").split("/").map(Number);
        return d ? n / d : n;
      })()
    : 0;
  return {
    format: {
      duration: Number(j.format?.duration ?? 0),
      size: Number(j.format?.size ?? 0),
      formatName: String(j.format?.format_name ?? ""),
    },
    video: v
      ? {
          codec: v.codec_name,
          width: Number(v.width),
          height: Number(v.height),
          fps,
          pixFmt: String(v.pix_fmt ?? ""),
          frames: Number(v.nb_frames ?? 0),
        }
      : undefined,
    audio: a
      ? {
          codec: a.codec_name,
          sampleRate: Number(a.sample_rate ?? 0),
          channels: Number(a.channels ?? 0),
        }
      : undefined,
  };
}

/** ffmpeg filter runner whose stderr we parse (volumedetect / blackdetect). */
export async function analyzeFilter(file: string, filter: string, extra: string[] = []) {
  const res = await runFfmpeg(
    [...extra, "-i", file, "-filter_complex", filter, "-f", "null", "-"],
    { timeoutMs: 240_000 },
  );
  return res.stderr;
}
