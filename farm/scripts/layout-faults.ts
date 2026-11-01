/*  Four deliberate faults, used to prove the layout validator can fail.

    Each fault is applied to a deep copy of the parsed data in memory; nothing
    on disk is ever modified, so "revert" is simply validating the untouched
    files again. Both the CLI (scripts/validate-layout.ts) and the tests import
    this list, so the proof runs in the test suite too. */

export interface Fault {
  id: string;
  /** The brief's name for this fault. */
  what: string;
  /** Which check should catch it. */
  expectedCheck: string;
  /** Mutate the copies in place. */
  apply(layout: any, orchard: any): void;
}

export const FAULTS: Fault[] = [
  {
    id: "overlap",
    what: "two zones overlapping",
    expectedCheck: "zone.overlap",
    apply: (layout) => {
      // Nudge the sunflower plot onto the groundnut plot: 22 x 24 m each, 24 m apart.
      const plot = layout.zones.find((zone: { id: string }) => zone.id === "plot_groundnut");
      plot.x_m -= 11;
      plot.x_ft = Math.round(plot.x_m * 3.28084 * 100) / 100;
    },
  },
  {
    id: "outside",
    what: "a zone outside the 5..95 m interior",
    expectedCheck: "zone.interior",
    apply: (layout) => {
      // Push the solar dryer past the east edge of the interior.
      const zone = layout.zones.find((entry: { id: string }) => entry.id === "solar_dryer");
      zone.x_m = 92;
      zone.x_ft = Math.round(92 * 3.28084 * 100) / 100;
    },
  },
  {
    id: "parcel",
    what: "a parcel that is not a 100 m square",
    expectedCheck: "parcel.square",
    apply: (layout) => {
      layout.parcel.side_m = 90;
      layout.parcel.side_ft = Math.round(90 * 3.28084 * 1000) / 1000;
      layout.parcel.area_m2 = 8100;
    },
  },
  {
    id: "alley",
    what: "an alley outside the orchard",
    expectedCheck: "alley.inside",
    apply: (_layout, orchard) => {
      // The orchard is 82.02 ft wide; put the second N-S alley at 80 ft.
      const alley = orchard.alleys.find((entry: { id: string }) => entry.id === "ns_2");
      alley.x_ft = 80;
    },
  },
];
