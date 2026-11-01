import layoutJson from "../../data/farm-layout-v2.json";
import orchardJson from "../../data/orchard-5layer.json";

import { readLayout, readOrchard, type FarmLayout, type LayoutZone, type OrchardData } from "./layout";

/*  The hectare world's validated data, built at import time.

    Importing this module validates both files: a broken layout throws here,
    which fails the build (typecheck-time import) and the test run rather than
    the render. Keep the data imports here, not in layout.ts, so the validator
    can still inspect a deliberately broken copy. */

export const LAYOUT: FarmLayout = readLayout(layoutJson);
export const ORCHARD_LAYERS: OrchardData = readOrchard(orchardJson, LAYOUT);

export const layoutZone = (id: string): LayoutZone => {
  const zone = LAYOUT.zones.find((entry) => entry.id === id);
  if (!zone) throw new Error(`the hectare layout has no zone "${id}"`);
  return zone;
};
