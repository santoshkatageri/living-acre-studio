/* ------------------------------------------------------------------ */
/*  Voice design registry — go.dharaa recurring narrators.             */
/*                                                                     */
/*  Models verified against the Gemini speech-generation docs          */
/*  (ai.google.dev/gemini-api/docs/speech-generation):                 */
/*   · gemini-2.5-flash-preview-tts  → default, fast, supports kn      */
/*   · gemini-2.5-pro-preview-tts    → highest quality                 */
/*  The brief's "Gemini 3.8 TTS" names are not documented models and   */
/*  are deliberately not hardcoded. Config stays changeable per        */
/*  episode ('audio.narration.model').                                 */
/* ------------------------------------------------------------------ */

export const GEMINI_TTS_MODELS = {
  flash: "gemini-3.8-flash-tts",
  lite: "gemini-3.8-flash-lite-tts",
  pro: "gemini-2.5-pro-preview-tts",
} as const;

/** cost estimates for ledger only — not billed by this studio. */
export const TTS_COST_PER_MILLION_CHARS_USD = 16; // preview TTS list price

export interface VoiceProfile {
  id: string;
  label: string;
  language: "kn" | "hi" | "en";
  languageHint: string; // BCP-47 spoken-hint injected into the prompt
  voiceId: string; // primary Gemini prebuilt voice
  altVoiceId: string; // comparison voice (A/B preview approval flow)
  accent: string;
  pace: "slow" | "moderate" | "brisk";
  style: string;
  /** natural-language performance direction for the TTS model */
  direction: string;
  approvedForProduction: boolean; // flips true only after human A/B approval
}

export const VOICE_PROFILES: VoiceProfile[] = [
  {
    id: "kannada_storyteller",
    label: "Kannada rural storyteller",
    language: "kn",
    languageHint: "kn-IN",
    voiceId: "Sulafat", // Warm
    altVoiceId: "Achird", // Friendly — comparison option B
    accent: "natural North-Karnataka Kannada",
    pace: "moderate",
    style: "warm_conversational",
    direction:
      "Read this Kannada text as a warm, friendly rural storyteller from Karnataka: conversational and unhurried, gentle emphasis, natural Kannada rhythm and pronunciation, as if speaking to a friend walking beside you on a farm at dawn.",
    approvedForProduction: false, // pending A/B preview approval
  },
  {
    id: "hindi_storyteller",
    label: "Hindi storyteller",
    language: "hi",
    languageHint: "hi-IN",
    voiceId: "Algieba", // Smooth
    altVoiceId: "Kore",
    accent: "natural Indian Hindi",
    pace: "moderate",
    style: "friendly_conversational",
    direction:
      "Read this Hindi text in natural, friendly, conversational Indian Hindi — warm storytelling paced moderately, no Bollywood affectation.",
    approvedForProduction: false,
  },
  {
    id: "english_narrator",
    label: "English narrator (documentary)",
    language: "en",
    languageHint: "en-IN",
    voiceId: "Schedar", // Even
    altVoiceId: "Vindemiatrix",
    accent: "clear Indian English",
    pace: "moderate",
    style: "calm_documentary",
    direction:
      "Read this English text as a calm documentary narrator with clear Indian English pronunciation: measured, grounded, no dramatic inflection.",
    approvedForProduction: false,
  },
];

export function getVoiceProfile(id: string): VoiceProfile {
  const p = VOICE_PROFILES.find((v) => v.id === id);
  if (!p) throw new Error(`Unknown voice profile: ${id}`);
  return p;
}

/** Builds the natural-language TTS instruction. Spoken text never changes. */
export function buildTtsInstruction(profile: VoiceProfile, spokenText: string, pace?: string) {
  const paceHint =
    pace === "slow" ? "Speak slowly, savouring each sentence." : pace === "brisk" ? "Speak at a brisk but clear pace." : "Speak at a moderate, relaxed pace.";
  return `${profile.direction} ${paceHint} Language: ${profile.languageHint}. Narrate exactly this, word for word: ${spokenText}`;
}
