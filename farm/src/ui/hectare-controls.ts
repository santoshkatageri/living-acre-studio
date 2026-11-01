import type { ViewMode } from "../hectare/render/view";

import { MODE_LABEL, NAV_REPEAT_DELAY_MS, NAV_REPEAT_EVERY_MS, type NavButton } from "./view-controls";

/*  The on-screen camera controls: a four-way pad and the view toggle.

    The pad is a plain D-pad — ← → turn, ↑ ↓ zoom (or, behind the farmer, walk the
    camera round him and in or out). Holding a button repeats it, the way holding
    an arrow key does, because a 360° turn in 15° presses is 24 clicks.

    The toggle says which of the two views you are in rather than which you would
    switch to, so the lit button is always the truth: "Follow farmer" or "Full
    farm". The C key does the same thing. */

export interface HectareControls {
  root: HTMLElement;
  setMode(mode: ViewMode): void;
  /** While a tour is playing the pad is dead, so the film cannot be steered. */
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

export interface ControlHandlers {
  onNav(button: NavButton, repeat: boolean): void;
  onMode(mode: ViewMode): void;
}

const BUTTONS: { button: NavButton; glyph: string; title: string }[] = [
  { button: "up", glyph: "↑", title: "Zoom in / camera closer" },
  { button: "left", glyph: "←", title: "Turn left" },
  { button: "down", glyph: "↓", title: "Zoom out / camera further" },
  { button: "right", glyph: "→", title: "Turn right" },
];

export function mountHectareControls(container: HTMLElement, handlers: ControlHandlers): HectareControls {
  const root = document.createElement("div");
  root.className = "controls";

  const modes = document.createElement("div");
  modes.className = "controls__modes";
  modes.setAttribute("role", "group");
  modes.setAttribute("aria-label", "View");

  const modeButtons = new Map<ViewMode, HTMLButtonElement>();
  for (const mode of ["third-person", "iso"] as ViewMode[]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "controls__mode";
    button.dataset.mode = mode;
    button.textContent = MODE_LABEL[mode];
    button.setAttribute("aria-pressed", String(mode === "third-person"));
    button.addEventListener("click", () => handlers.onMode(mode));
    modes.append(button);
    modeButtons.set(mode, button);
  }

  const pad = document.createElement("div");
  pad.className = "controls__pad";
  pad.setAttribute("role", "group");
  pad.setAttribute("aria-label", "Camera");

  const padButtons: HTMLButtonElement[] = [];
  for (const { button, glyph, title } of BUTTONS) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = `controls__key controls__key--${button}`;
    element.dataset.nav = button;
    element.textContent = glyph;
    element.title = title;
    element.setAttribute("aria-label", title);

    let delay: number | null = null;
    let repeat: number | null = null;
    const stop = (): void => {
      if (delay !== null) window.clearTimeout(delay);
      if (repeat !== null) window.clearInterval(repeat);
      delay = null;
      repeat = null;
    };

    element.addEventListener("pointerdown", (event) => {
      if (element.disabled) return;
      event.preventDefault();
      handlers.onNav(button, false);
      delay = window.setTimeout(() => {
        repeat = window.setInterval(() => handlers.onNav(button, true), NAV_REPEAT_EVERY_MS);
      }, NAV_REPEAT_DELAY_MS);
    });
    for (const ending of ["pointerup", "pointerleave", "pointercancel", "blur"]) {
      element.addEventListener(ending, stop);
    }
    // Keyboard users reach the same buttons through the pad's tab stops.
    element.addEventListener("click", (event) => {
      if ((event as MouseEvent).detail === 0) handlers.onNav(button, false);
    });
    pad.append(element);
    padButtons.push(element);
  }

  root.append(modes, pad);
  container.append(root);

  return {
    root,
    setMode(mode) {
      for (const [key, button] of modeButtons) {
        const on = key === mode;
        button.setAttribute("aria-pressed", String(on));
        button.classList.toggle("controls__mode--on", on);
      }
    },
    setEnabled(enabled) {
      for (const button of [...padButtons, ...modeButtons.values()]) {
        button.disabled = !enabled;
        button.classList.toggle("controls__key--off", !enabled);
      }
    },
    dispose() {
      root.remove();
    },
  };
}
