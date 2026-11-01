import type { HectareWorld } from "../hectare/world";

/*  The orchard's five layers, as toggles.

    The names and counts come from the orchard data, not from here, so the panel
    cannot drift from what is planted. */

export type LayerName = "L1" | "L2" | "L3" | "L4" | "L5";
export const LAYER_NAMES: LayerName[] = ["L1", "L2", "L3", "L4", "L5"];

export interface LayersPanel {
  readonly root: HTMLElement;
  isVisible(layer: LayerName): boolean;
  setLayerVisible(layer: LayerName, visible: boolean): void;
  dispose(): void;
}

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function mountLayersPanel(
  container: HTMLElement,
  world: HectareWorld,
  onToggle: (layer: LayerName, visible: boolean) => void,
): LayersPanel {
  const root = element("section", "layers");
  root.setAttribute("aria-label", "Orchard layers");
  root.append(element("div", "layers__title", "Orchard layers"));

  const state = new Map<LayerName, boolean>();
  const boxes = new Map<LayerName, HTMLInputElement>();
  const rows = new Map<LayerName, HTMLElement>();

  world.orchard.layers.forEach((layer, index) => {
    const name = LAYER_NAMES[index];
    if (!name) return;
    const row = element("label", "layers__row");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = true;
    box.dataset.layer = name;
    box.addEventListener("change", () => {
      state.set(name, box.checked);
      onToggle(name, box.checked);
    });
    const label = element("span", "layers__name", `${name} · ${layer.name.en}`);
    const count = element("span", "layers__count", String(layer.targetCount ?? ""));
    row.append(box, label, count);
    root.append(row);
    state.set(name, true);
    boxes.set(name, box);
    rows.set(name, row);
  });

  root.append(element("div", "layers__note", "1–5 toggle, or click"));
  container.append(root);

  return {
    root,
    isVisible(layer) {
      return state.get(layer) ?? false;
    },
    setLayerVisible(layer, visible) {
      state.set(layer, visible);
      const box = boxes.get(layer);
      if (box) box.checked = visible;
      rows.get(layer)?.classList.toggle("layers__row--off", !visible);
    },
    dispose() {
      root.remove();
    },
  };
}
