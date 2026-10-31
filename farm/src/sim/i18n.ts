import stringsJson from "../data/strings.json";

/*  UI strings, with an explicit review status per language.
    Hindi and Kannada are drafts: the data says so and the HUD says so. */

export type Lang = "en" | "hi" | "kn";
export type ReviewStatus = "approved" | "needs_review";

interface StringsFile {
  languages: Record<string, { name: string; status: string }>;
  strings: Record<string, Record<string, string>>;
}

const data = stringsJson as unknown as StringsFile;
export const LANGS: Lang[] = ["en", "hi", "kn"];

function checkStatus(value: string): ReviewStatus {
  if (value !== "approved" && value !== "needs_review") {
    throw new Error(`strings.json: status "${value}" must be approved or needs_review`);
  }
  return value;
}

export function languageStatus(lang: Lang): ReviewStatus {
  const record = data.languages[lang];
  if (!record) throw new Error(`strings.json: no language "${lang}"`);
  return checkStatus(record.status);
}

export function languageName(lang: Lang): string {
  return data.languages[lang]?.name ?? lang;
}

export function t(lang: Lang, key: string): string {
  const entry = data.strings[key];
  if (!entry) throw new Error(`strings.json: no key "${key}"`);
  const value = entry[lang];
  if (value === undefined) throw new Error(`strings.json: "${key}" has no "${lang}" text`);
  return value;
}

export function stringStatus(key: string, lang: Lang): ReviewStatus {
  const entry = data.strings[key];
  if (!entry) throw new Error(`strings.json: no key "${key}"`);
  if (entry[lang] === undefined) throw new Error(`strings.json: "${key}" has no "${lang}" text`);
  return languageStatus(lang);
}
