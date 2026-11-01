/*  The hectare HUD: where you are pointing, the zoom state, the path being walked
    and the keys that do something. Plain DOM, no framework. */

export interface HectareHud {
  readonly root: HTMLElement;
  setPlace(text: string): void;
  setHover(text: string): void;
  setZoom(zoom: number, atOverview: boolean): void;
  setHeading(yawDeg: number): void;
  setMessage(text: string, kind?: "none" | "ok" | "error"): void;
  setPath(text: string, state: "none" | "route" | "refused"): void;
  dispose(): void;
}

/** Write only when the text changed: the frame loop calls these every frame. */
const setText = (node: HTMLElement, text: string): void => {
  if (node.textContent !== text) node.textContent = text;
};

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function mountHectareHud(container: HTMLElement, parcel: { widthFt: number; depthFt: number }): HectareHud {
  const root = element("div", "hud hud--hectare");
  root.dataset.world = `hectare ${parcel.widthFt.toFixed(1)} x ${parcel.depthFt.toFixed(1)} ft`;

  const top = element("section", "hud__panel hud__panel--top");
  const place = element("div", "hud__place", "north gate");
  const zoom = element("div", "hud__day", "whole hectare");
  const heading = element("div", "hud__day hud__heading", "yaw 45°");
  top.append(place, zoom, heading);

  const bottom = element("section", "hud__panel hud__panel--bottom");
  const hover = element("div", "hud__hover", "");
  const path = element("div", "hud__path", "Path — click a path to walk it");
  path.dataset.state = "none";
  const message = element("div", "hud__message", "");
  message.dataset.kind = "none";
  const keys = element(
    "div",
    "hud__keys",
    "click to walk · ← → turn · ↑ ↓ zoom · C farmer / farm · T tour · R record · wheel zoom · P paths · V whole / close · 1–5 layers",
  );
  bottom.append(hover, path, message, keys);

  root.append(top, bottom);
  container.append(root);

  return {
    root,
    setPlace(text) {
      setText(place, text);
    },
    setHover(text) {
      setText(hover, text);
    },
    setZoom(level, atOverview) {
      setText(zoom, atOverview ? "whole hectare" : `zoom ${level.toFixed(1)}`);
    },
    setHeading(yawDeg) {
      setText(heading, `yaw ${((Math.round(yawDeg) % 360) + 360) % 360}°`);
    },
    setMessage(text, kind = "none") {
      setText(message, text);
      if (message.dataset.kind !== kind) message.dataset.kind = kind;
    },
    setPath(text, state) {
      setText(path, text);
      if (path.dataset.state !== state) path.dataset.state = state;
    },
    dispose() {
      root.remove();
    },
  };
}
