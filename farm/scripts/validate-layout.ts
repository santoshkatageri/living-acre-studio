/*  Step 1: validate the two hectare input files and write the report.

    Usage (from farm/):
      npx tsx scripts/validate-layout.ts

    Reads both files from disk and never writes them; the only write is
    reports/step1-layout.json. Exits non-zero if the saved files are invalid,
    so a broken layout fails CI as well as the build. */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { FAULTS } from "./layout-faults";
import { WORLD_ID } from "../src/sim/canon";
import {
  channelPathOverlaps,
  layoutViolations,
  orchardViolations,
  toLayout,
  type FarmLayout,
  type Violation,
} from "../src/sim/layout";

const LAYOUT_FILE = "data/farm-layout-v2.json";
const ORCHARD_FILE = "data/orchard-5layer.json";
const REPORT_FILE = "reports/step1-layout.json";

const readText = (path: string): string => {
  if (!existsSync(path)) throw new Error(`${path} is missing (run this from the farm/ directory)`);
  return readFileSync(path, "utf8");
};
const parse = (path: string): unknown => {
  try {
    return JSON.parse(readText(path));
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${(error as Error).message}`);
  }
};
const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

function printViolations(title: string, violations: Violation[]): void {
  if (violations.length === 0) {
    console.log(`${title}: no violations`);
    return;
  }
  console.log(`${title}: ${violations.length} violation(s)`);
  for (const violation of violations) console.log(`  [${violation.check}] ${violation.detail}`);
}

const layoutText = readText(LAYOUT_FILE);
const orchardText = readText(ORCHARD_FILE);
const layoutRaw = parse(LAYOUT_FILE);
const orchardRaw = parse(ORCHARD_FILE);

/** Every violation of the pair, without ever throwing on a broken copy. */
function allViolations(layout: unknown, orchard: unknown): Violation[] {
  const violations = [...layoutViolations(layout)];
  try {
    violations.push(...orchardViolations(orchard, toLayout(layout)));
  } catch (error) {
    violations.push({ check: "orchard.unchecked", detail: (error as Error).message });
  }
  return violations;
}

/* ------------------------------- the faults ------------------------------- */

interface FaultResult {
  id: string;
  what: string;
  expected_check: string;
  caught: boolean;
  violations: Violation[];
  reverted_clean: boolean;
}

function runFaults(): FaultResult[] {
  const results: FaultResult[] = [];
  for (const fault of FAULTS) {
    const badLayout = clone(layoutRaw);
    const badOrchard = clone(orchardRaw);
    fault.apply(badLayout, badOrchard);
    const violations = allViolations(badLayout, badOrchard);
    results.push({
      id: fault.id,
      what: fault.what,
      expected_check: fault.expectedCheck,
      caught: violations.some((violation) => violation.check === fault.expectedCheck),
      violations,
      reverted_clean: false,
    });
  }
  // The "revert": the files on disk were never touched, so validating them
  // again is the proof. Confirm that and record it.
  const clean = allViolations(layoutRaw, orchardRaw);
  for (const result of results) result.reverted_clean = clean.length === 0;
  return results;
}

/* -------------------- the channel rules, demonstrated --------------------- */

/*  Two things to show: a channel through a zone is an error (the v2 draft had
    one — perim_S crossed the fish pond — and v2.1 moved it), and a channel under
    a gravel path is fine and only listed. */

function prepatchChannelProof(): { geometry: string; violations: Violation[]; overlaps: { channel: string; path: string; areaM2: number }[] } {
  const old = clone(layoutRaw) as { channels: { id: string; x_m: number; y_m: number; w_m: number; d_m: number }[] };
  const perimS = old.channels.find((channel) => channel.id === "perim_S");
  if (!perimS) throw new Error("perim_S is missing from the layout");
  // The v2 draft geometry, restored in memory only.
  perimS.x_m = 5;
  perimS.w_m = 90;
  const layout = toLayout(old);
  return {
    geometry: "perim_S x_m 5, w_m 90 (the v2 draft)",
    violations: layoutViolations(old),
    overlaps: channelPathOverlaps(layout),
  };
}

function channelOverPathDemo(): { geometry: string; violations: Violation[]; overlaps: { channel: string; path: string; areaM2: number }[] } {
  const demo = clone(layoutRaw) as { channels: { id: string; x_m: number; y_m: number; w_m: number; d_m: number }[] };
  const ab = demo.channels.find((channel) => channel.id === "A_B");
  if (!ab) throw new Error("A_B is missing from the layout");
  // Slide the A/B channel onto the cross_AB path: a ditch under a path.
  ab.y_m = 56.5;
  const layout = toLayout(demo);
  return {
    geometry: "A_B y_m 56.5 (laid across the cross_AB path)",
    violations: layoutViolations(demo),
    overlaps: channelPathOverlaps(layout),
  };
}

/* ------------------------------- the report ------------------------------- */

const violations = allViolations(layoutRaw, orchardRaw);
const valid = violations.length === 0;
const layout: FarmLayout | null = valid ? toLayout(layoutRaw) : null;
const faults = runFaults();
const prepatch = prepatchChannelProof();
const channelDemo = channelOverPathDemo();

const zoneRows = (layout?.zones ?? []).map((zone) => ({
  id: zone.id,
  ref: zone.ref,
  kind: zone.kind,
  walkable: zone.walkable,
  area_m2: round3(zone.boxM.w * zone.boxM.d),
  area_ft2: round3(zone.boxFt.widthFt * zone.boxFt.depthFt),
  box_ft: zone.boxFt,
}));

const kinds = [...new Set((layout?.zones ?? []).map((zone) => zone.kind))].sort();
const totalsByKind = Object.fromEntries(
  kinds.map((kind) => {
    const zones = zoneRows.filter((zone) => zone.kind === kind);
    return [
      kind,
      {
        count: zones.length,
        area_m2: round3(zones.reduce((sum, zone) => sum + zone.area_m2, 0)),
        area_ft2: round3(zones.reduce((sum, zone) => sum + zone.area_ft2, 0)),
      },
    ];
  }),
);

const channelPathList = layout ? channelPathOverlaps(layout) : [];

const report = {
  step: 1,
  generated_by: "scripts/validate-layout.ts",
  world_switch: WORLD_ID,
  data_version: layout?.schemaVersion ?? "invalid",
  supersedes: layout?.supersedes ?? null,
  changes: layout?.changes ?? [],
  inputs: {
    // sha256 is over the UTF-8 bytes; the counts are characters, which differs
    // from bytes in the files that carry Devanagari and Kannada text.
    [LAYOUT_FILE]: { utf8_chars: layoutText.length, sha256: sha256(layoutText) },
    [ORCHARD_FILE]: { utf8_chars: orchardText.length, sha256: sha256(orchardText) },
  },
  parcel: layout
    ? {
        side_m: layout.parcel.sideM,
        side_ft: layout.parcel.sideFt,
        area_m2: layout.parcel.areaM2,
        gate: layout.parcel.gate,
      }
    : null,
  zone_count: layout ? layout.zones.length : 0,
  path_count: layout ? layout.paths.length : 0,
  channel_count: layout ? layout.channels.length : 0,
  walkable_zones: layout ? layout.zones.filter((zone) => zone.walkable).length : 0,
  zones: zoneRows,
  totals_by_kind: totalsByKind,
  checks_run: [
    "schema (both files, structural)",
    "parcel.square / parcel.area / parcel.feet",
    "zone.unique",
    "zone.interior (5..95 m)",
    "zone.overlap (zone vs zone)",
    "zone.path_overlap (zone vs gravel path)",
    "channel.zone_overlap (channel vs zone is an error)",
    "channel.path_overlap (channel vs path is allowed, listed below)",
    "crop_plot.size (22 x 24 m) and crop_plot.present",
    "zone.feet (declared ft columns vs metres x 3.28084)",
    "orchard.size / alley.inside / alley.shape / orchard.entrance / orchard.layers / orchard.species / orchard.needs_review / orchard.placeholder",
  ],
  violations,
  channel_checks: {
    zone_overlaps: violations.filter((violation) => violation.check === "channel.zone_overlap"),
    path_overlaps_listed: channelPathList,
  },
  channel_check_proofs: {
    prepatch_perim_s: {
      what: "the v2 draft's own channel geometry, re-checked in memory",
      geometry: prepatch.geometry,
      violations: prepatch.violations,
      listed_path_overlaps: prepatch.overlaps,
    },
    channel_over_path: {
      what: "a channel under a gravel path must be allowed and listed, not an error",
      geometry: channelDemo.geometry,
      violations: channelDemo.violations,
      listed_path_overlaps: channelDemo.overlaps,
    },
  },
  injected_faults: faults.map((fault) => ({
    id: fault.id,
    what: fault.what,
    expected_check: fault.expected_check,
    caught: fault.caught,
    reverted_clean: fault.reverted_clean,
    violations: fault.violations,
  })),
};

console.log("=== saved files ===");
printViolations("layout + orchard", violations);
if (layout) {
  console.log(`zones ${layout.zones.length} · paths ${layout.paths.length} · channels ${layout.channels.length}`);
  console.log(`data ${layout.schemaVersion}${layout.supersedes ? ` (supersedes ${layout.supersedes.schemaVersion})` : ""}`);
  console.log(`parcel ${layout.parcel.sideM} m (${layout.parcel.sideFt} ft) square, ${layout.parcel.areaM2} m2`);
  for (const [kind, totals] of Object.entries(totalsByKind)) {
    console.log(`  ${kind.padEnd(17)} ${String(totals.count).padStart(2)} zones  ${totals.area_m2.toFixed(2).padStart(8)} m2  ${totals.area_ft2.toFixed(2).padStart(10)} ft2`);
  }
  console.log(`channel over path (allowed, listed): ${channelPathList.length === 0 ? "none" : channelPathList.map((entry) => `${entry.channel} x ${entry.path} (${entry.areaM2} m2)`).join(", ")}`);
  for (const change of layout.changes) {
    console.log(`changed ${change.id}.${change.field}: ${change.from} -> ${change.to} (${change.why})`);
  }
}

console.log("\n=== channel proofs ===");
console.log(`pre-patch geometry, ${prepatch.geometry}: ${prepatch.violations.length} violation(s)`);
for (const violation of prepatch.violations) console.log(`  [${violation.check}] ${violation.detail}`);
console.log(`channel under a path, ${channelDemo.geometry}: ${channelDemo.violations.length} violation(s), ${channelDemo.overlaps.length} listed`);
for (const overlap of channelDemo.overlaps) console.log(`  listed: ${overlap.channel} x ${overlap.path} (${overlap.areaM2} m2)`);

console.log("\n=== injected faults (in memory; files untouched) ===");
for (const fault of faults) {
  console.log(`${fault.id}: ${fault.what} → expected [${fault.expected_check}] caught=${fault.caught}`);
  for (const violation of fault.violations) console.log(`    [${violation.check}] ${violation.detail}`);
}
console.log(`\nrevert: both files re-validate with ${violations.length} violation(s) — ${valid ? "clean" : "STILL BROKEN"}`);

mkdirSync("reports", { recursive: true });
writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 1)}\n`, "utf8");
console.log(`\nwrote ${REPORT_FILE}`);

if (!valid) process.exitCode = 1;
