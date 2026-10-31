/* ------------------------------------------------------------------ */
/*  Kannada-first pronunciation dictionary.                            */
/*                                                                     */
/*  HARD RULE: approved narration text is never rewritten. The dicti-  */
/*  onary produces a `spoken` form (rhythm hints only — hyphenation,   */
/*  ellipses for pauses) passed solely to the TTS provider. Both the   */
/*  original and spoken forms are stored on every segment row.         */
/* ------------------------------------------------------------------ */

export interface PronunciationRule {
  id: string;
  language: "kn" | "hi" | "en";
  match: string;
  spoken: string; // rhythm-guided form (syllable grouping / pauses)
  note: string;
  domain: "livestock" | "agriculture" | "name" | "place" | "expression";
}

export const PRONUNCIATION_DICTIONARY: PronunciationRule[] = [
  { id: "kn-ganga", language: "kn", match: "ಗಂಗ", spoken: "ಗಂಗೆ...", note: "Vocative lilt on the name; soft trailing pause before address lines.", domain: "name" },
  { id: "kn-nanjunda", language: "kn", match: "ನಂಜುಂಡ", spoken: "ನಂ-ಜುಂಡ", note: "Syllable-grouped reading avoids a clipped first syllable.", domain: "name" },
  { id: "kn-goshale", language: "kn", match: "ಗೋಶಾಲೆ", spoken: "ಗೋ-ಶಾಲೆ", note: "Keeps the long first vowel in the cattle-shed term.", domain: "livestock" },
  { id: "kn-hallikar", language: "kn", match: "ಹಳ್ಳಿಕಾರ್", spoken: "ಹಳ್ಳಿ-ಕಾರ್", note: "Hallikar breed name — prevents 'halli-kaar' elision.", domain: "livestock" },
  { id: "kn-mevu", language: "kn", match: "ಮೇವು", spoken: "ಮೇ...ವು", note: "Fodder term reads more naturally with a breath between syllables.", domain: "livestock" },
  { id: "kn-tomato", language: "kn", match: "ಟೊಮ್ಯಾಟೊ", spoken: "ಟೊಮಾಟೊ", note: "Loan word — spoken form follows common farm usage.", domain: "agriculture" },
  { id: "kn-ekare", language: "kn", match: "ಎಕರೆ", spoken: "ಎ-ಕರೆ", note: "Acre — lengthens the opening vowel.", domain: "agriculture" },
  { id: "kn-neeru", language: "kn", match: "ಬೇರಿನವರೆಗೆ", spoken: "ಬೇರಿನ...ವರೆಗೆ", note: "'Down to the roots' lands better with a mid-phrase pause.", domain: "agriculture" },
  { id: "hi-name", language: "hi", match: "गंगा", spoken: "गंगा...", note: "Same vocative treatment for Hindi localisation.", domain: "name" },
  { id: "en-hallikar", language: "en", match: "Hallikar", spoken: "Halli-kaar", note: "English track reading of the breed name.", domain: "livestock" },
];

export interface SpokenResult {
  spoken: string;
  applied: string[]; // rule ids
}

export function applyPronunciation(text: string, language: "kn" | "hi" | "en"): SpokenResult {
  let spoken = text;
  const applied: string[] = [];
  for (const rule of PRONUNCIATION_DICTIONARY) {
    if (rule.language !== language) continue;
    if (spoken.includes(rule.match)) {
      spoken = spoken.split(rule.match).join(rule.spoken);
      applied.push(rule.id);
    }
  }
  return { spoken, applied };
}
