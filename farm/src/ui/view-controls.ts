import type { ViewMode } from "../hectare/render/view";

/*  The numbers behind the on-screen camera controls, kept out of the DOM so they
    can be tested: how far a press turns, how much a press zooms, and which mode
    the toggle lands on.

    One pad drives both cameras. In the farm view ← → turn the camera round the
    parcel and ↑ ↓ zoom; behind the farmer ← → walk the camera round him and ↑ ↓
    change how far back it stands, because turning is not a thing you can do to a
    camera that is already behind him. */

export type NavButton = "left" | "right" | "up" | "down";

/** Degrees one press turns the picture. */
export const NAV_TURN_DEG = 15;
/** How much one press zooms the farm view in (↑) or out (↓). */
export const NAV_ZOOM_FACTOR = 1.3;
/** How much one press moves the third-person camera in (↑) or out (↓). */
export const NAV_DISTANCE_FACTOR = 1.18;
/** How long a held button waits before it starts repeating, in ms. */
export const NAV_REPEAT_DELAY_MS = 340;
/** How fast it repeats after that, in ms. */
export const NAV_REPEAT_EVERY_MS = 90;

export function turnDirection(button: NavButton): -1 | 0 | 1 {
  if (button === "left") return -1;
  if (button === "right") return 1;
  return 0;
}

/** What one press multiplies the zoom by: more than one for ↑, closer in. */
export function zoomFactor(button: NavButton): number {
  if (button === "up") return NAV_ZOOM_FACTOR;
  if (button === "down") return 1 / NAV_ZOOM_FACTOR;
  return 1;
}

/** The same for the third-person camera's distance: ↑ is closer in. */
export function distanceFactor(button: NavButton): number {
  if (button === "up") return NAV_DISTANCE_FACTOR;
  if (button === "down") return 1 / NAV_DISTANCE_FACTOR;
  return 1;
}

export function modeAfterToggle(mode: ViewMode): ViewMode {
  return mode === "third-person" ? "iso" : "third-person";
}

/** What the two choices are called on screen. */
export const MODE_LABEL: Record<ViewMode, string> = {
  "third-person": "Follow farmer",
  iso: "Full farm",
};
