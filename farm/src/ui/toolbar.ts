import { t, type Lang } from "../sim/i18n";

/*  The tool row. Buttons are the only clickable UI; keys 1–5 mirror them. */

export type ToolId = "till" | "plant-tomato" | "plant-palak" | "water" | "refill";

const TOOLS: { id: ToolId; key: string }[] = [
  { id: "till", key: "1" },
  { id: "plant-tomato", key: "2" },
  { id: "plant-palak", key: "3" },
  { id: "water", key: "4" },
  { id: "refill", key: "5" },
];

export interface Toolbar {
  root: HTMLElement;
  markUsed(tool: ToolId): void;
  setLanguage(lang: Lang): void;
}

export function mountToolbar(
  container: HTMLElement,
  onTool: (tool: ToolId) => void,
  onLanguage: (lang: Lang) => void,
  initial: Lang,
): Toolbar {
  const root = document.createElement("div");
  root.className = "toolbar";

  const buttons = new Map<ToolId, HTMLButtonElement>();
  for (const tool of TOOLS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toolbar__button";
    button.dataset.tool = tool.id;
    button.textContent = t(initial, `tool.${tool.id}`);
    button.addEventListener("click", () => onTool(tool.id));
    const hint = document.createElement("span");
    hint.className = "toolbar__key";
    hint.textContent = tool.key;
    button.append(hint);
    root.append(button);
    buttons.set(tool.id, button);
  }

  const language = document.createElement("button");
  language.type = "button";
  language.className = "toolbar__button toolbar__button--lang";
  language.textContent = initial.toUpperCase();
  language.addEventListener("click", () => {
    const next: Lang = initial === "en" ? "hi" : initial === "hi" ? "kn" : "en";
    onLanguage(next);
  });
  root.append(language);

  container.append(root);

  let current = initial;
  let active: ToolId | null = null;

  return {
    root,
    markUsed(tool) {
      active = tool;
      for (const [id, button] of buttons) {
        button.dataset.active = id === active ? "yes" : "no";
      }
    },
    setLanguage(lang) {
      current = lang;
      language.textContent = lang.toUpperCase();
      for (const tool of TOOLS) {
        const button = buttons.get(tool.id);
        if (button) button.firstChild && (button.firstChild.textContent = t(current, `tool.${tool.id}`));
      }
    },
  };
}
