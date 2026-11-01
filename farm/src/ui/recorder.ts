/*  Recording the farm to a video file, in the browser.

    Two pieces, deliberately separate:

    `createFrameCompositor` keeps a 2D canvas the same size as the renderer and
    paints each rendered frame into it, with the tour caption and a progress line
    drawn on top. The 3D canvas cannot carry DOM captions into a recording, so the
    captions that go into the video are painted here; the ones on screen are the
    same words from the same tour.

    `createRecorder` records that compositor canvas through MediaRecorder, which
    every current browser supports for canvas streams. The result is WebM — VP9
    if the browser has it, VP8 otherwise.

    Neither piece needs a server, a plugin, or a codec download. */

export const VIDEO_FPS = 60;
export const VIDEO_BITS_PER_SECOND = 12_000_000;

/** The container/codec strings to try, best first. */
export const VIDEO_MIME_TYPES = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];

export interface FrameCompositor {
  readonly canvas: HTMLCanvasElement;
  frame(caption: string, progress: number): void;
  readonly width: number;
  readonly height: number;
}

export interface VideoRecorder {
  readonly supported: boolean;
  readonly recording: boolean;
  readonly mimeType: string | null;
  start(): boolean;
  stop(): Promise<Blob | null>;
}

export interface CaptionLayout {
  bandTop: number;
  bandHeight: number;
  padding: number;
  fontSize: number;
  barHeight: number;
}

export function captionLayout(width: number, height: number): CaptionLayout {
  const short = Math.min(width, height);
  const fontSize = Math.max(Math.round(short * 0.034), 12);
  const padding = Math.max(Math.round(fontSize * 0.6), 6);
  const bandHeight = Math.round(fontSize * 2.1);
  return {
    bandTop: height - bandHeight - Math.round(height * 0.02),
    bandHeight,
    padding,
    fontSize,
    barHeight: Math.max(Math.round(height * 0.004), 2),
  };
}

/** Just enough of a 2D context to draw a caption, so this can be tested. */
export interface CaptionContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textAlign: string;
  textBaseline: string;
  fillRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
}

/**
 * Paint the caption band and the progress line. `progress` below zero means no
 * tour is running, and nothing is drawn: a recording of ordinary play should not
 * carry a progress bar.
 */
export function drawCaption(
  context: CaptionContext,
  width: number,
  height: number,
  caption: string,
  progress: number,
): CaptionLayout | null {
  if (progress < 0) return null;
  const layout = captionLayout(width, height);
  const text = caption.trim();

  if (text) {
    context.fillStyle = "rgba(18, 16, 13, 0.62)";
    context.fillRect(0, layout.bandTop, width, layout.bandHeight);
    context.fillStyle = "#f1ead9";
    // Shrink a long caption until it fits, rather than letting it run off.
    const room = width - layout.padding * 2;
    const floor = 9;
    let size = layout.fontSize;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      context.font = `600 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      if (context.measureText(text).width <= room || size <= floor) break;
      size = Math.max(size - 1, floor);
    }
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, width / 2, layout.bandTop + layout.bandHeight / 2);
    layout.fontSize = size;
  }

  const barY = height - layout.barHeight;
  context.fillStyle = "rgba(241, 234, 217, 0.22)";
  context.fillRect(0, barY, width, layout.barHeight);
  context.fillStyle = "#e8a33d";
  context.fillRect(0, barY, Math.round(width * Math.min(Math.max(progress, 0), 1)), layout.barHeight);
  return layout;
}

export function createFrameCompositor(source: HTMLCanvasElement): FrameCompositor {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(source.width, 2);
  canvas.height = Math.max(source.height, 2);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas context unavailable for the video compositor");

  const resize = (): void => {
    if (source.width === canvas.width && source.height === canvas.height) return;
    canvas.width = Math.max(source.width, 2);
    canvas.height = Math.max(source.height, 2);
  };

  return {
    canvas,
    get width() {
      return canvas.width;
    },
    get height() {
      return canvas.height;
    },
    frame(caption, progress) {
      resize();
      // Runs in the same task as the render, before the drawing buffer is cleared.
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      drawCaption(context, canvas.width, canvas.height, caption, progress);
    },
  };
}

/** The best WebM flavour this browser can record, or null if it can record none. */
export function pickMimeType(supported: (type: string) => boolean): string | null {
  for (const type of VIDEO_MIME_TYPES) {
    if (supported(type)) return type;
  }
  return null;
}

/** `farm-tour-2026-11-01T05-42-17.webm` — local time, no colons (some filesystems). */
export function videoFilename(at: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  const date = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  const time = `${pad(at.getHours())}-${pad(at.getMinutes())}-${pad(at.getSeconds())}`;
  return `farm-tour-${date}T${time}.webm`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function createRecorder(canvas: HTMLCanvasElement, fps = VIDEO_FPS): VideoRecorder {
  const supported = typeof MediaRecorder !== "undefined" && typeof canvas.captureStream === "function";
  const mimeType = supported ? pickMimeType((type) => MediaRecorder.isTypeSupported(type)) : null;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];

  return {
    supported,
    mimeType,
    get recording() {
      return recorder !== null;
    },
    start() {
      if (!supported || recorder) return false;
      let stream: MediaStream;
      try {
        stream = canvas.captureStream(fps);
      } catch {
        return false;
      }
      chunks = [];
      try {
        recorder = new MediaRecorder(stream, {
          ...(mimeType ? { mimeType } : {}),
          videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
        });
      } catch {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      // A timeslice means the file survives even if the tab is closed mid-record.
      recorder.start(1000);
      return true;
    },
    stop() {
      const active = recorder;
      if (!active) return Promise.resolve(null);
      recorder = null;
      return new Promise<Blob | null>((resolve) => {
        active.onstop = () => {
          active.stream.getTracks().forEach((track) => track.stop());
          const type = active.mimeType || chunks[0]?.type || "video/webm";
          resolve(chunks.length > 0 ? new Blob(chunks, { type }) : null);
          chunks = [];
        };
        if (active.state === "inactive") active.onstop(new Event("stop"));
        else active.stop();
      });
    },
  };
}
