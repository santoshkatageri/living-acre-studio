"""Voice profiles for go.dharaa — Google AI Studio / Gemini TTS.

Models verified against ai.google.dev/gemini-api/docs/speech-generation:
  - gemini-2.5-flash-preview-tts  (default; fast; Kannada supported)
  - gemini-2.5-pro-preview-tts    (highest quality)
Output: PCM L16, 24 kHz, mono. Style/accent/pace are steered with
natural-language direction text (the TTS model understands performance
instructions); prebuilt voice selection uses the `voice_name` field.

Voice replication is NOT claimed or attempted here — prebuilt voices only.
"""
from __future__ import annotations

from dataclasses import dataclass, field

MODEL_FLASH = "gemini-2.5-flash-preview-tts"
MODEL_PRO = "gemini-2.5-pro-preview-tts"


@dataclass(frozen=True)
class VoiceProfile:
    id: str
    label: str
    language: str           # kn | hi | en
    language_hint: str      # BCP-47, e.g. kn-IN
    voice_id: str           # primary prebuilt Gemini voice
    alt_voice_id: str       # comparison voice for A/B approvals
    accent: str
    pace: str               # slow | moderate | brisk
    style: str
    direction: str          # natural-language TTS performance direction
    approved: bool = field(default=False)  # flips after human A/B approval


VOICE_PROFILES: dict[str, VoiceProfile] = {
    "kannada_storyteller": VoiceProfile(
        id="kannada_storyteller",
        label="Kannada rural storyteller",
        language="kn",
        language_hint="kn-IN",
        voice_id="Sulafat",       # Warm
        alt_voice_id="Achird",    # Friendly
        accent="natural North-Karnataka Kannada",
        pace="moderate",
        style="warm_conversational",
        direction=(
            "Read this Kannada text as a warm, friendly rural storyteller from "
            "Karnataka: conversational and unhurried, gentle emphasis, natural "
            "Kannada rhythm and pronunciation, as if speaking to a friend walking "
            "beside you on a farm at dawn."
        ),
    ),
    "hindi_storyteller": VoiceProfile(
        id="hindi_storyteller",
        label="Hindi storyteller",
        language="hi",
        language_hint="hi-IN",
        voice_id="Algieba",       # Smooth
        alt_voice_id="Kore",
        accent="natural Indian Hindi",
        pace="moderate",
        style="friendly_conversational",
        direction=(
            "Read this Hindi text in natural, friendly, conversational Indian "
            "Hindi — warm storytelling, moderate pace, no affectation."
        ),
    ),
    "english_narrator": VoiceProfile(
        id="english_narrator",
        label="English narrator (documentary)",
        language="en",
        language_hint="en-IN",
        voice_id="Schedar",       # Even
        alt_voice_id="Vindemiatrix",
        accent="clear Indian English",
        pace="moderate",
        style="calm_documentary",
        direction=(
            "Read this English text as a calm documentary narrator with clear "
            "Indian English pronunciation: measured, grounded, no dramatic "
            "inflection."
        ),
    ),
}


def get_profile(profile_id: str) -> VoiceProfile:
    if profile_id not in VOICE_PROFILES:
        raise KeyError(f"unknown voice profile: {profile_id}")
    return VOICE_PROFILES[profile_id]


def pace_hint(pace: str) -> str:
    return {
        "slow": "Speak slowly, savouring each sentence.",
        "brisk": "Speak at a brisk but clear pace.",
    }.get(pace, "Speak at a moderate, relaxed pace.")


def build_instruction(profile: VoiceProfile, spoken_text: str) -> str:
    """Compose the natural-language instruction. Spoken text is never altered."""
    return (
        f"{profile.direction} {pace_hint(profile.pace)} "
        f"Language: {profile.language_hint}. "
        f"Narrate exactly this, word for word: {spoken_text}"
    )
