"""Content-hash cache for generated speech segments.

Key = sha256(provider|model|voice|style|pace|spoken_text). Identical
narration + identical configuration never regenerates — zero extra spend.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path


def cache_key(provider: str, model: str, voice: str, style: str, pace: str, spoken: str) -> str:
    raw = "|".join([provider, model, voice, style, pace, spoken])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class AudioCache:
    def __init__(self, root: str | Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def get(self, key: str) -> Path | None:
        wav = self.root / f"{key}.wav"
        meta = self.root / f"{key}.json"
        if wav.exists() and meta.exists():
            return wav
        return None

    def put(self, key: str, wav_bytes: bytes, metadata: dict) -> Path:
        wav = self.root / f"{key}.wav"
        wav.write_bytes(wav_bytes)
        (self.root / f"{key}.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2))
        return wav
