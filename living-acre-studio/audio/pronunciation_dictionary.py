"""Kannada pronunciation dictionary.

HARD RULE: approved narration text is never rewritten. The dictionary only
produces a `spoken` form (hyphenation / pause hints) passed to the TTS
provider. Both forms are preserved alongside every generated audio file.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Rule:
    id: str
    language: str
    match: str
    spoken: str
    note: str
    domain: str  # livestock | agriculture | name | place | expression


DICTIONARY: tuple[Rule, ...] = (
    Rule("kn-ganga", "kn", "ಗಂಗ", "ಗಂಗೆ...", "Vocative lilt; soft trailing pause.", "name"),
    Rule("kn-nanjunda", "kn", "ನಂಜುಂಡ", "ನಂ-ಜುಂಡ", "Avoids a clipped first syllable.", "name"),
    Rule("kn-goshale", "kn", "ಗೋಶಾಲೆ", "ಗೋ-ಶಾಲೆ", "Keeps the long first vowel.", "livestock"),
    Rule("kn-hallikar", "kn", "ಹಳ್ಳಿಕಾರ್", "ಹಳ್ಳಿ-ಕಾರ್", "Hallikar breed name rhythm.", "livestock"),
    Rule("kn-mevu", "kn", "ಮೇವು", "ಮೇ...ವು", "Fodder term breath between syllables.", "livestock"),
    Rule("kn-tomato", "kn", "ಟೊಮ್ಯಾಟೊ", "ಟೊಮಾಟೊ", "Loan word in common farm usage.", "agriculture"),
    Rule("kn-ekare", "kn", "ಎಕರೆ", "ಎ-ಕರೆ", "Acre — lengthen the opening vowel.", "agriculture"),
    Rule("kn-beru", "kn", "ಬೇರಿನವರೆಗೆ", "ಬೇರಿನ...ವರೆಗೆ", "'Down to the roots' mid-phrase pause.", "agriculture"),
    Rule("hi-ganga", "hi", "गंगा", "गंगा...", "Vocative treatment for Hindi localisation.", "name"),
    Rule("en-hallikar", "en", "Hallikar", "Halli-kaar", "English track reading of breed name.", "livestock"),
)


def apply_pronunciation(text: str, language: str) -> tuple[str, list[str]]:
    spoken = text
    applied: list[str] = []
    for rule in DICTIONARY:
        if rule.language != language:
            continue
        if rule.match in spoken:
            spoken = spoken.replace(rule.match, rule.spoken)
            applied.append(rule.id)
    return spoken, applied
