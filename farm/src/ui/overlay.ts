import type { World } from "../sim/types";

/*  The HUD: clock, tank, the place the farmer stands in, the active cell,
    hover text, messages and the language tag. Plain DOM, no framework. */

export interface Overlay {
  readonly root: HTMLElement;
  update(xFt: number, yFt: number, placeLabel: string): void;
  setPlace(label: string): void;
  setHover(label: string): void;
  setCell(text: string): void;
  setClock(text: string, progress: number): void;
  setTank(fraction: number, level: number, capacity: number, label: string): void;
  setMessage(text: string, kind: "error" | "ok" | "none"): void;
  setLanguageTag(text: string): void;
  setZoom(zoom: number, atOverview: boolean): void;
  setOutlines(visible: boolean): void;
  readonly outlinesVisible: boolean;
  setOverlayHint(visible: boolean): void;
  dispose(): void;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mountOverlay(container: HTMLElement, world: World): Overlay {
  const root = element("div", "hud");
  root.dataset.world = `parcel ${world.parcel.widthFt} x ${world.parcel.depthFt} ft`;

  const top = element("section", "hud__panel hud__panel--top");
  const clock = element("div", "hud__clock", "06:00");
  const clockBar = element("div", "hud__bar");
  const clockFill = element("div", "hud__bar-fill");
  clockBar.append(clockFill);
  const day = element("div", "hud__day", "day 1");
  const place = element("div", "hud__place", "outside");
  top.append(clock, clockBar, day, place);

  const bottom = element("section", "hud__panel hud__panel--bottom");
  const position = element("div", "hud__pos", "x – · y –");
  const cell = element("div", "hud__cell", "no cell");
  const hover = element("div", "hud__hover", "");
  bottom.append(position, cell, hover);

  const side = element("section", "hud__panel hud__panel--side");
  const tankLabel = element("div", "hud__label", "tank");
  const tankBar = element("div", "hud__bar hud__bar--tank");
  const tankFill = element("div", "hud__bar-fill hud__bar-fill--tank");
  tankBar.append(tankFill);
  const tankText = element("div", "hud__tank-text", "");
  const languageTag = element("div", "hud__lang", "English");
  const keys = element(
    "div",
    "hud__keys",
    "WASD / arrows move · click to walk · 1–5 tools · L language · V zoom · P paths · O outlines",
  );
  side.append(tankLabel, tankBar, tankText, languageTag, keys);

  const message = element("div", "hud__message");
  message.hidden = true;

  root.append(top, side, bottom, message);
  container.append(root);

  let outlines = false;

  return {
    root,
    update(xFt, yFt, placeLabel) {
      position.textContent = `x ${xFt.toFixed(1)} ft · y ${yFt.toFixed(1)} ft`;
      place.textContent = placeLabel;
    },
    setPlace(label) {
      place.textContent = label;
    },
    setHover(label) {
      hover.textContent = label;
    },
    setCell(text) {
      cell.textContent = text;
    },
    setClock(text, progress) {
      clock.textContent = text;
      clockFill.style.width = `${Math.round(progress * 100)}%`;
    },
    setTank(fraction, level, capacity, label) {
      tankLabel.textContent = label;
      tankFill.style.width = `${Math.round(Math.min(Math.max(fraction, 0), 1) * 100)}%`;
      tankText.textContent = `${level} / ${capacity}`;
    },
    setMessage(text, kind) {
      message.textContent = text;
      message.hidden = text.length === 0;
      message.dataset.kind = kind;
    },
    setLanguageTag(text) {
      languageTag.textContent = text;
    },
    setZoom(zoom, atOverview) {
      side.dataset.zoom = zoom.toFixed(2);
      side.dataset.overview = atOverview ? "yes" : "no";
    },
    setOutlines(visible) {
      outlines = visible;
      root.dataset.outlines = visible ? "on" : "off";
    },
    get outlinesVisible() {
      return outlines;
    },
    setOverlayHint(visible) {
      root.dataset.walkableOverlay = visible ? "on" : "off";
    },
    dispose() {
      root.remove();
    },
  };
}

/** Day counter next to the clock, kept out of the setter list for brevity. */
export function setDayLabel(overlay: Overlay, day: number): void {
  const node = overlay.root.querySelector<HTMLElement>(".hud__day");
  if (node) node.textContent = `day ${day}`;
}
