# go.dharaa — Audio Production Toolkit (Google AI Studio / Gemini TTS)

Server-side production runs in TypeScript (`src/lib/audio/*`) so the pipeline
stays one process; **this `audio/` suite is the standalone Python toolkit** for
voice R&D, offline POC generation, pronunciation tuning and multi-speaker
dialogue experiments. Both layers share the same voice profiles, pronunciation
dictionary, caching contract and cost rules.

## Setup

```bash
pip install -r audio/requirements.txt     # google-genai SDK
export GEMINI_API_KEY=...                  # Google AI Studio key (never committed)
export ALLOW_EXTERNAL_CALLS=true           # secondary gate for paid calls
```

The API key is read from the environment (`GEMINI_API_KEY`, falling back to
`GOOGLE_API_KEY`). It is never printed or persisted.

## Models & voices

Verified against https://ai.google.dev/gemini-api/docs/speech-generation:

| Model | Role |
| --- | --- |
| `gemini-2.5-flash-preview-tts` | default — fast, supports Kannada (kn) |
| `gemini-2.5-pro-preview-tts` | quality tier for final locks |

> The brief's "Gemini 3.8 Flash TTS" is **not** a documented model; nothing is
> hardcoded to it. `audio/voice_profiles.py` is the single place to change IDs.

30 prebuilt voices; recurring narrator A/B pair for Kannada: **Sulafat** (warm)
vs **Achird** (friendly). Voice design uses natural-language direction;
voice *replication* is unsupported and is not claimed or attempted.

## Test procedures

```bash
# 1. Offline mechanics check — labelled placeholder takes, zero spend:
python3 audio/tts_generator.py --poc --mock --out-dir outputs/audio-poc

# 2. Full POC (requires GEMINI_API_KEY + ALLOW_EXTERNAL_CALLS=true):
python3 audio/tts_generator.py --poc

# 3. Per-scene episode narration from an exported narration JSON:
python3 audio/tts_generator.py --text-file narration.json --out-dir outputs/ep-001-audio
```

Outputs: `narration_a-*.wav`, `narration_b-*.wav`, `ambience-only.wav`,
`mixed-preview.m4a`. Every take carries a JSON sidecar with the original text,
spoken form, voice and mock flag. Cache keys =
`sha256(provider|model|voice|style|pace|spoken)` — unchanged text never
regenerates.

## Provider neutrality

The studio adapter (`src/lib/audio/providers.ts`) treats Gemini as one
`TtsProvider`. No ElevenLabs integration exists in this repository; if one is
added later it registers as a peer provider selected by
`audio.narration.provider` — it does not replace working code.

## Mixing rules (enforced in `src/lib/audio/mix.ts`)

- Narration is placed at scene cue windows; ambience/SFX/music sit on separate buses.
- Background buses are ducked under narration (`sidechaincompress`).
- Final mix is normalized to −15 LUFS integrated, −1.5 dBTP (configurable), then
  AAC 160 kbps into the master; loudness and silence are validated in QC.
