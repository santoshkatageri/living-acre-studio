import { createHash } from "crypto";
import { TZ } from "./constants";

export function sha256(input: string | Buffer) {
  return createHash("sha256").update(input).digest("hex");
}

export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(",")}}`;
}
export const hashJson = (v: unknown) => sha256(stableStringify(v));

/** mulberry32 — deterministic PRNG seeded by string */
export function prng(seed: string) {
  let h = 1779033703;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function istNow(): Date {
  return new Date();
}
export function istDateString(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}
export function istParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(d); // HH:mm
}

/** Next occurrence of HH:mm (IST), today or tomorrow. */
export function nextSlotIst(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const now = new Date();
  // Build the wall-clock time in IST by probing via Intl parts.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const istTodayUtc = Date.parse(
    `${get("year")}-${get("month")}-${get("day")}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+05:30`,
  );
  const candidate = new Date(istTodayUtc);
  if (candidate.getTime() <= now.getTime() + 5 * 60_000) {
    return new Date(candidate.getTime() + 24 * 3600_000);
  }
  return candidate;
}

export function fmtClock(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export function srtTime(t: number): string {
  const ms = Math.round((t % 1) * 1000);
  const s = Math.floor(t) % 60;
  const m = Math.floor(t / 60) % 60;
  const h = Math.floor(t / 3600);
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

export const pad3 = (n: number) => String(n).padStart(3, "0");
