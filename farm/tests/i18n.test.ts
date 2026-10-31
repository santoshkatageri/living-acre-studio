import { describe, expect, test } from "vitest";

import stringsJson from "../src/data/strings.json";
import cropsJson from "../src/data/crops.json";
import { allCrops, cropById, cropName } from "../src/sim/crops";
import { LANGS, languageStatus, stringStatus, t, type Lang } from "../src/sim/i18n";

/*  The HUD's "Path" label comes from data, and the Hindi and Kannada drafts
    say so. Nothing may present an unreviewed language as approved. */

const strings = stringsJson as unknown as {
  languages: Record<string, { status: string }>;
  strings: Record<string, Record<string, string>>;
};

describe("the path label is data", () => {
  test("Path exists in all three languages", () => {
    for (const lang of LANGS) {
      expect(t(lang, "place.path").length).toBeGreaterThan(0);
      expect(stringStatus("place.path", lang)).toBe(languageStatus(lang));
    }
    expect(t("en", "place.path")).toBe("Path");
  });

  test("the HUD hint for a refused click is data too", () => {
    expect(t("en", "hint.stayOnPath")).toBe("Stay on the path");
    for (const lang of LANGS) expect(t(lang, "hint.stayOnPath").length).toBeGreaterThan(0);
  });

  test("every string has every language", () => {
    for (const [key, entry] of Object.entries(strings.strings)) {
      for (const lang of LANGS) {
        expect(entry[lang], `${key}.${lang}`).toBeDefined();
        expect((entry[lang] ?? "").length, `${key}.${lang}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("draft languages are never presented as reviewed", () => {
  test("English is approved, Hindi and Kannada are not", () => {
    expect(languageStatus("en")).toBe("approved");
    expect(languageStatus("hi")).toBe("needs_review");
    expect(languageStatus("kn")).toBe("needs_review");
    expect(strings.languages["hi"]?.status).toBe("needs_review");
    expect(strings.languages["kn"]?.status).toBe("needs_review");
  });

  test("every crop carries the same per-language status", () => {
    for (const crop of allCrops()) {
      expect(crop.status.en).toBe("approved");
      expect(crop.status.hi).toBe("needs_review");
      expect(crop.status.kn).toBe("needs_review");
    }
    for (const raw of cropsJson.crops) {
      expect(raw.status.hi).toBe("needs_review");
      expect(raw.status.kn).toBe("needs_review");
    }
  });

  test("crop names resolve per language", () => {
    const tomato = cropById("tomato");
    for (const lang of LANGS as Lang[]) expect(cropName(tomato, lang).length).toBeGreaterThan(0);
    expect(cropName(tomato, "en")).toBe("Tomato");
  });

  test("an unknown key or language throws rather than showing an empty label", () => {
    expect(() => t("en", "nope.missing")).toThrow();
    expect(() => t("fr" as Lang, "place.path")).toThrow();
  });
});
