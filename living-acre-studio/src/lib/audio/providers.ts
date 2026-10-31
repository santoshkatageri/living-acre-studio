import { prng, sha256 } from "@/lib/studio/util";
import type { VoiceProfile } from "./voices";

/* ------------------------------------------------------------------ */
/*  TTS provider adapter.                                               */
/*  · google_gemini — Gemini speech generation, REST generateContent.   */
/*    Dormant until GEMINI_API_KEY + ALLOW_EXTERNAL_CALLS are set.     */
/*  · local_mock — deterministic, clearly-labelled placeholder voice    */
/*    so the full pipeline is exercisable without paid calls.           */
/*  An ElevenLabs provider can register here later without touching     */
/*  producers. (None exists in this repository today.)                  */
/* ------------------------------------------------------------------ */

export interface TtsRequest {
  text: string; // spoken form (pronunciation-shaped)
  voice: VoiceProfile;
  voiceIdOverride?: string;
  model: string;
  pace: string;
  style: string;
  instruction: string; // natural-language performance direction
  speakers?: { speaker: string; line: string; voiceId: string }[]; // multi-speaker dialogue
}

export interface TtsResult {
  pcm: Buffer; // signed 16-bit LE PCM
  sampleRate: number;
  channels: number;
  providerId: string;
  model: string;
  voiceId: string;
  degraded: boolean;
  note: string;
}

export interface TtsProvider {
  id: string;
  synthesize(req: TtsRequest): Promise<TtsResult>;
}

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

async function withRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      // Exponential backoff with jitter
      const delay = (1000 * 2 ** i) + (Math.random() * 1000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw last;
}

export class GeminiTtsProvider implements TtsProvider {
  id = "google_gemini";
  private apiKey: string;
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const voiceId = req.voiceIdOverride ?? req.voice.voiceId;
    const speechConfig = req.speakers?.length
      ? {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: req.speakers.map((s) => ({
              speaker: s.speaker,
              voiceConfig: { prebuiltVoiceConfig: { voiceName: s.voiceId } },
            })),
          },
        }
      : { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceId } } };

    const body = {
      contents: [
        {
          parts: [
            {
              // Multi-speaker scripts carry "Speaker: line" turns; single
              // speaker passes the pronunciation-shaped spoken form as-is.
              text: req.speakers?.length
                ? `${req.instruction}\n${req.speakers.map((s) => `${s.speaker}: ${s.line}`).join("\n")}`
                : req.instruction,
            },
          ],
        },
      ],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig },
    };

    const json = await withRetry(async () => {
      const res = await fetch(`${GEMINI_BASE}/${req.model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Gemini TTS HTTP ${res.status}`);
      return (await res.json()) as {
        candidates?: { content?: { parts?: { inlineData?: { data: string; mimeType: string } }[] } }[];
        error?: { message: string };
      };
    });
    if (json.error) throw new Error(`Gemini TTS: ${json.error.message}`);
    const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part?.inlineData) throw new Error("Gemini TTS returned no audio payload");
    const pcm = Buffer.from(part.inlineData.data, "base64");
    const rate = /rate=(\d+)/.exec(part.inlineData.mimeType)?.[1];
    return {
      pcm,
      sampleRate: rate ? Number(rate) : 24000,
      channels: 1,
      providerId: this.id,
      model: req.model,
      voiceId,
      degraded: false,
      note: part.inlineData.mimeType,
    };
  }
}

/** Deterministic placeholder voice — audible, obviously synthetic, zero cost. */
export class MockTtsProvider implements TtsProvider {
  id = "local_mock";
  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const sampleRate = 24000;
    const words = Math.max(2, req.text.trim().split(/\s+/).length);
    const wps = req.pace === "slow" ? 1.5 : req.pace === "brisk" ? 2.6 : 1.9;
    const seconds = Math.min(26, Math.max(2.0, words / wps + 0.7));
    const n = Math.floor(seconds * sampleRate);
    const rand = prng(sha256(req.text + req.voice.voiceId));
    const pcm = new Int16Array(n);
    const syllables = Math.floor(seconds / 0.32);
    const env: number[] = [];
    for (let i = 0; i < syllables; i++) env.push(0.35 + rand() * 0.6, 0.06 + rand() * 0.1);
    const base = 132 + (sha256(req.voice.voiceId).charCodeAt(0) % 40);
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      const syll = Math.min(env.length - 1, Math.floor(t / 0.16));
      const a = env[syll];
      const drift = 1 + 0.05 * Math.sin(2 * Math.PI * 1.7 * t);
      const v =
        Math.sin(2 * Math.PI * base * drift * t) * 0.5 +
        Math.sin(2 * Math.PI * base * 2.02 * t) * 0.28 +
        Math.sin(2 * Math.PI * base * 3.9 * t) * 0.12;
      pcm[i] = Math.round(Math.max(-1, Math.min(1, v * a * 0.4)) * 32767);
    }
    return {
      pcm: Buffer.from(pcm.buffer),
      sampleRate,
      channels: 1,
      providerId: this.id,
      model: "cadence-synth/v1",
      voiceId: req.voiceIdOverride ?? req.voice.voiceId,
      degraded: true,
      note: "MOCK voice — cadence-shaped placeholder, NOT speech. Set GEMINI_API_KEY for real narration.",
    };
  }
}

export interface ResolvedProvider {
  provider: TtsProvider;
  degraded: boolean;
  reason: string;
}

export function resolveProvider(desired: string): ResolvedProvider {
  const key = process.env.GEMINI_API_KEY ?? "";
  const externalAllowed = (process.env.ALLOW_EXTERNAL_CALLS ?? "false").toLowerCase() === "true";
  if (desired === "local_mock" || desired === "elevenlabs" /* reserved — no integration yet */) {
    return {
      provider: new MockTtsProvider(),
      degraded: true,
      reason:
        desired === "elevenlabs"
          ? "No ElevenLabs integration exists in this repository — falling back to mock (would be added as a peer provider, never a destructive replacement)."
          : "Config select local mock voice.",
    };
  }
  if (desired === "google_gemini") {
    if (key && externalAllowed)
      return { provider: new GeminiTtsProvider(key), degraded: false, reason: "Live Gemini TTS." };
    return {
      provider: new MockTtsProvider(),
      degraded: true,
      reason: !key
        ? "GEMINI_API_KEY not configured — mock voice in use; no paid call attempted."
        : "ALLOW_EXTERNAL_CALLS=false — paid/external calls blocked; mock voice in use.",
    };
  }
  return { provider: new MockTtsProvider(), degraded: true, reason: `Unknown provider "${desired}" — mock voice in use.` };
}

/* ------------------------------- WAV plumbing ------------------------------- */

export function pcmToWav(pcm: Buffer, sampleRate: number, channels: number): Buffer {
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
