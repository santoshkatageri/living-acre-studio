/*  Step 1: validate the two hectare input files and write the report.

    Usage:
      npx tsx scripts/validate-layout.ts            validate, print, write the report
      npx tsx scripts/validate-layout.ts --faults   inject the four faults in memory,
                                                    show each one failing, then re-validate
                                                    the untouched files to show the revert

    Files are read from disk and never written: the only write is the report. */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { FAULTS } from "./layout-faults";
import { WORLD_ID } from "../src/sim/canon";
import { layoutViolations, orchardViolations, readLayout, toLayout, type FarmLayout, type Violation } from "../src/sim/layout";

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
    // The layout checks run first; the orchard cross-checks need a layout
    // object even when that layout is the broken one, so convert without
    // validating (and fall back to the layout faults alone if it cannot).
    const violations = [...layoutViolations(badLayout)];
    try {
      violations.push(...orchardViolations(badOrchard, toLayout(badLayout)));
    } catch (error) {
      console.log(`  (orchard cross-checks skipped for ${fault.id}: ${(error as Error).message})`);
    }
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
  const clean = [...layoutViolations(layoutRaw), ...orchardViolations(orchardRaw, readLayout(layoutRaw))];
  for (const result of results) result.reverted_clean = clean.length === 0;
  return results;
}

/* ------------------------------- the report ------------------------------- */

const violations = [...layoutViolations(layoutRaw), ...orchardViolations(orchardRaw, readLayout(layoutRaw))];
const layout: FarmLayout = readLayout(layoutRaw);
const faults = runFaults();

const zoneRows = layout.zones.map((zone) => ({
  id: zone.id,
  ref: zone.ref,
  kind: zone.kind,
  walkable: zone.walkable,
  area_m2: round3(zone.boxM.w * zone.boxM.d),
  area_ft2: round3(zone.boxFt.widthFt * zone.boxFt.depthFt),
  box_ft: zone.boxFt,
}));

const kinds = [...new Set(layout.zones.map((zone) => zone.kind))].sort();
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

const report = {
  step: 1,
  generated_by: "scripts/validate-layout.ts",
  world_switch: WORLD_ID,
  inputs: {
    // sha256 is over the UTF-8 bytes; the counts are characters, which differs
    // from bytes in the files that carry Devanagari and Kannada text.
    [LAYOUT_FILE]: { utf8_chars: layoutText.length, sha256: sha256(layoutText) },
    [ORCHARD_FILE]: { utf8_chars: orchardText.length, sha256: sha256(orchardText) },
  },
  parcel: {
    side_m: layout.parcel.sideM,
    side_ft: layout.parcel.sideFt,
    area_m2: layout.parcel.areaM2,
    gate: layout.parcel.gate,
  },
  zone_count: layout.zones.length,
  path_count: layout.paths.length,
  channel_count: layout.channels.length,
  walkable_zones: layout.zones.filter((zone) => zone.walkable).length,
  zones: zoneRows,
  totals_by_kind: totalsByKind,
  checks_run: [
    "schema (both files, structural)",
    "parcel.square / parcel.area / parcel.feet",
    "zone.unique",
    "zone.interior (5..95 m)",
    "zone.overlap (zone vs zone)",
    "zone.path_overlap (zone vs gravel path)",
    "crop_plot.size (22 x 24 m) and crop_plot.present",
    "zone.feet (declared ft columns vs metres x 3.28084)",
    "orchard.size / alley.inside / alley.shape / orchard.entrance / orchard.layers / orchard.species / orchard.needs_review / orchard.placeholder",
  ],
  violations,
  injected_faults: faults.map((fault) => ({
    id: fault.id,
    what: fault.what,
    expected_check: fault.expected_check,
    caught: fault.caught,
    reverted_clean: fault.reverted_clean,
    violations: fault.violations,
  })),
};

console.log("=== clean files ===");
printViolations("layout + orchard", violations);
console.log(`zones ${layout.zones.length} · paths ${layout.paths.length} · channels ${layout.channels.length}`);
console.log(`parcel ${layout.parcel.sideM} m (${layout.parcel.sideFt} ft) square, ${layout.parcel.areaM2} m2`);
for (const [kind, totals] of Object.entries(totalsByKind)) {
  console.log(`  ${kind.padEnd(17)} ${String(totals.count).padStart(2)} zones  ${totals.area_m2.toFixed(2).padStart(8)} m2  ${totals.area_ft2.toFixed(2).padStart(10)} ft2`);
}

console.log("\n=== injected faults (in memory; files untouched) ===");
for (const fault of faults) {
  console.log(`${fault.id}: ${fault.what} → expected [${fault.expected_check}] caught=${fault.caught}`);
  for (const violation of fault.violations) console.log(`    [${violation.check}] ${violation.detail}`);
}
console.log(`\nrevert: both files re-validate with ${violations.length} violation(s) — ${violations.length === 0 ? "clean" : "STILL BROKEN"}`);

mkdirSync("reports", { recursive: true });
writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 1)}\n`, "utf8");
console.log(`\nwrote ${REPORT_FILE}`);

if (violations.length > 0) process.exitCode = 1;
