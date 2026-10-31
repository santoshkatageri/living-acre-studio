"""Gemini TTS generator for go.dharaa — single & multi-speaker.

Uses the official Google GenAI Python SDK (`google-genai`).

    pip install google-genai
    export GEMINI_API_KEY=...          # read from env; never hardcode, never log

Authentication honours GOOGLE_API_KEY as a fallback. When neither is set the
generator refuses paid calls and instead produces a clearly-labelled "--mock"
placeholder take (cadence hum, correct duration) so pipeline mechanics are
provable offline.

Usage:
    python3 audio/tts_generator.py --poc                 # narration A/B + mix plan
    python3 audio/tts_generator.py --poc --mock          # force offline takes
    python3 audio/tts_generator.py --text-file n.json --out-dir out/  # per-scene
"""
from __future__ import annotations

import argparse
import math
import subprocess
import sys
import wave
from pathlib import Path

from audio_cache import AudioCache, cache_key
from narration_processor import load_segments
from pronunciation_dictionary import apply_pronunciation
from voice_profiles import MODEL_FLASH, VOICE_PROFILES, build_instruction, get_profile

import os

POC_TEXT_KN = (
    "ಲಿವಿಂಗ್ ಎಕರಿನ ಶಾಂತ ಬೆಳಗ್ಗೆ. ಬೆಳಗ್ಗೆ ಆರು ಗಂಟೆ. ಬಾನು ಹಳದಿ ಬೆಳಕಿನಲ್ಲಿ ನಿಧಾನವಾಗಿ ಎದ್ದಿದೆ. "
    "ನಂಜುಂಡ ಮನೆಯ ಬಾಗಿಲು ನಿಧಾನವಾಗಿ ತೆರೆಯುತ್ತಾನೆ. ಕೆಂಪು ಮಣ್ಣಿನ ದಾರಿಯಲ್ಲಿ ಮೊದಲ ನಡಿಗೆ. "
    "ಮುಂದೆ ಗೋಶಾಲೆ ಕಾಣುತ್ತದೆ. ಅಲ್ಲಿ ಗಂಗ — ನಮ್ಮ ಹಳ್ಳಿಕಾರ್ ಹಸು — ಅವನಿಗಾಗಿ ಕಾದಿದ್ದಾಳೆ. "
    "ನಂಜುಂಡ ಹತ್ತಿರ ಹೋಗಿ, ಅವಳ ಮುಖ ನೋಟವಾಗಿ, ಮೆದುವಾಗಿ ಮಾತನಾಡುತ್ತಾನೆ: ಬನ್ನಿ ಗಂಗೆ, ಇಂದೂ ಒಳ್ಳೆಯ ದಿನ."
)

SAMPLE_RATE = 24000  # Gemini TTS PCM output rate


def get_api_key() -> str | None:
    return os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")


def synthesize_gemini(text_instruction: str, voice_name: str, model: str) -> bytes:
    """Single-speaker synthesis via google-genai. Returns raw 16-bit PCM."""
    try:
        from google import genai
        from google.genai import types
    except ImportError as e:  # pragma: no cover
        raise SystemExit("google-genai is not installed: pip install -r audio/requirements.txt") from e

    client = genai.Client(api_key=get_api_key())
    response = client.models.generate_content(
        model=model,
        contents=text_instruction,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice_name)
                )
            ),
        ),
    )
    return response.candidates[0].content.parts[0].inline_data.data


def synthesize_gemini_dialogue(instruction: str, turns: list[tuple[str, str, str]], model: str) -> bytes:
    """Multi-speaker dialogue. turns = [(speaker_label, line, voice_name), ...]"""
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=get_api_key())
    speaker_configs = [
        types.SpeakerVoiceConfig(
            speaker=name,
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice_name)
            ),
        )
        for name, _, voice_name in turns
    ]
    script = "\n".join(f"{name}: {line}" for name, line, _ in turns)
    response = client.models.generate_content(
        model=model,
        contents=f"{instruction}\n{script}",
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                multi_speaker_voice_config=types.MultiSpeakerVoiceConfig(
                    speaker_voice_configs=speaker_configs
                )
            ),
        ),
    )
    return response.candidates[0].content.parts[0].inline_data.data


def write_wav(path: Path, pcm: bytes, rate: int = SAMPLE_RATE) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(rate)
        f.writeframes(pcm)
    return path


def mock_pcm(duration_s: float, seed: int = 7) -> bytes:
    """Audible cadence placeholder — clearly not speech."""
    frames = int(duration_s * SAMPLE_RATE)
    out = bytearray()
    for i in range(frames):
        t = i / SAMPLE_RATE
        envelope = 0.35 + 0.4 * abs(math.sin(2 * math.pi * 3.1 * t))
        value = int(32767 * 0.22 * envelope * math.sin(2 * math.pi * (150 + seed * 7) * t))
        out += value.to_bytes(2, "little", signed=True)
    return bytes(out)


def mix_preview(out_dir: Path, narration: Path, ambience: Path, target: Path, loudness: str = "-15") -> Path:
    """FFmpeg mix: narration ducked-ambience + a faint pad. Local, deterministic."""
    pad = "aevalsrc='0.15*sin(2*PI*174.61*t)+0.11*sin(2*PI*220*t)+0.08*sin(2*PI*261.63*t)':d=999:s=44100"
    graph = (
        "[0:a]aresample=44100,aformat=channel_layouts=stereo[n];"
        "[1:a]aresample=44100[amb];[2:a]volume=0.16[m];"
        "[amb][m]amix=inputs=2:normalize=0[bg];"
        "[bg][n]sidechaincompress=threshold=0.018:ratio=6:attack=25:release=620:makeup=1.4[bgd];"
        f"[bgd][n]amix=inputs=2:normalize=0,loudnorm=I={loudness}:TP=-1.5:LRA=11,"
        "aresample=44100,aformat=channel_layouts=stereo[a]"
    )
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-y", "-i", str(narration), "-i", str(ambience),
         "-f", "lavfi", "-i", pad, "-filter_complex", graph,
         "-map", "[a]", "-c:a", "aac", "-b:a", "160k", "-shortest", str(target)],
        check=True,
    )
    return target


def ambience_bed(out_file: Path, duration: float) -> Path:
    wind = f"anoisesrc=color=brown:duration={duration}:amplitude=0.26,lowpass=f=430"
    birds = (
        f"aevalsrc='0.30*sin(2*PI*(2350+760*sin(2*PI*8.5*t))*t)*"
        f"gt(sin(2*PI*0.32*t)+0.45*sin(2*PI*0.117*t+1.7),0.42)':d={duration}:s=44100"
    )
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-y", "-f", "lavfi", "-i", wind,
         "-f", "lavfi", "-i", birds,
         "-filter_complex", "[0:a][1:a]amix=inputs=2:normalize=0,aresample=44100,aformat=channel_layouts=stereo[a]",
         "-map", "[a]", "-c:a", "pcm_s16le", str(out_file)],
        check=True,
    )
    return out_file


def poc(out_dir: Path, force_mock: bool) -> None:
    profile = get_profile("kannada_storyteller")
    spoken, applied = apply_pronunciation(POC_TEXT_KN, "kn")
    spoken += " ..."  # gentle trailing pause
    print(f"pronunciation rules applied: {applied}")

    mock = force_mock or not get_api_key() or os.environ.get("ALLOW_EXTERNAL_CALLS") != "true"
    cache = AudioCache(out_dir / "cache")

    takes: list[Path] = []
    for label, voice in (("narration_a", profile.voice_id), ("narration_b", profile.alt_voice_id)):
        key = cache_key("google_gemini" if not mock else "local_mock", MODEL_FLASH, voice, profile.style, profile.pace, spoken)
        hit = cache.get(key)
        if hit:
            print(f"[cache hit] {label} → {hit.name}")
            takes.append(hit)
            continue
        if mock:
            pcm = mock_pcm(20.0)
            note = "MOCK take — cadence placeholder, not speech. Set GEMINI_API_KEY for real synthesis."
        else:
            pcm = synthesize_gemini(build_instruction(profile, spoken), voice, MODEL_FLASH)
            note = "gemini synthesis"
        path = cache.put(key, pcm, {"text_original": POC_TEXT_KN, "text_spoken": spoken, "voice": voice, "note": note})
        wrote = out_dir / f"{label}-{voice.lower()}.wav"
        wrote.parent.mkdir(parents=True, exist_ok=True)
        wrote.write_bytes(path.read_bytes())
        print(f"[{'mock' if mock else 'gemini'}] {label} ({voice}) → {wrote}")
        takes.append(wrote)

    amb = ambience_bed(out_dir / "ambience-only.wav", duration=26)
    print(f"ambience bed → {amb}")
    mix = mix_preview(out_dir, takes[0], amb, out_dir / "mixed-preview.m4a")
    print(f"mixed preview → {mix}")


def main() -> None:
    ap = argparse.ArgumentParser(description="go.dharaa Gemini TTS generator")
    ap.add_argument("--poc", action="store_true", help="run the 20-30s Kannada POC")
    ap.add_argument("--mock", action="store_true", help="force offline placeholder takes")
    ap.add_argument("--text-file", help="narration JSON to synthesize per-scene")
    ap.add_argument("--out-dir", default="outputs/audio")
    ap.add_argument("--profile", default="kannada_storyteller")
    args = ap.parse_args()
    out_dir = Path(args.out_dir)

    if args.text_file:
        profile = get_profile(args.profile)
        segments = load_segments(args.text_file)
        mock = not get_api_key() or os.environ.get("ALLOW_EXTERNAL_CALLS") != "true"
        cache = AudioCache(out_dir / "cache")
        for i, seg in enumerate(segments, 1):
            text = seg.text_kn if profile.language == "kn" else seg.text_en
            spoken, applied = apply_pronunciation(text, profile.language)
            key = cache_key("google_gemini" if not mock else "local_mock", MODEL_FLASH, profile.voice_id, profile.style, profile.pace, spoken)
            hit = cache.get(key)
            target = out_dir / f"seg-{i:02d}-{seg.scene_key}.wav"
            if hit:
                target.write_bytes(hit.read_bytes())
                print(f"[cache hit] {seg.scene_key}")
                continue
            pcm = mock_pcm(max(1.6, seg.end_s - seg.start_s)) if mock else synthesize_gemini(build_instruction(profile, spoken), profile.voice_id, MODEL_FLASH)
            cached = cache.put(key, pcm, {"text_original": text, "text_spoken": spoken, "rules": applied, "mock": mock})
            target.write_bytes(cached.read_bytes())
            print(f"[{'mock' if mock else 'gemini'}] {seg.scene_key} → {target}")
        return

    if args.poc:
        poc(out_dir, args.mock)
        return

    ap.print_help()


if __name__ == "__main__":
    sys.exit(main())
