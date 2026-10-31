"""Narration processor — parse authored narration JSON into TTS segments.

Input is the narration object the studio's narration_script stage persists
(episode.narration). Ordering and cue windows are preserved exactly.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Segment:
    scene_key: str
    text_kn: str
    text_en: str
    start_s: float
    end_s: float
    voice_note: str


def load_segments(narration_json: str | Path) -> list[Segment]:
    doc = json.loads(Path(narration_json).read_text())
    segments = [
        Segment(
            scene_key=line["sceneKey"],
            text_kn=line["kn"],
            text_en=line["en"],
            start_s=float(line["startS"]),
            end_s=float(line["endS"]),
            voice_note=line.get("voiceNote", ""),
        )
        for line in doc["lines"]
    ]
    assert all(b.start_s > a.start_s for a, b in zip(segments, segments[1:])), (
        "narration windows must be ordered by scene"
    )
    return segments
