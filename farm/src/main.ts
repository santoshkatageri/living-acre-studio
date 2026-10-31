import "./ui/styles.css";

import canonJson from "../canon/canon-v1.json";
import { planClickMove, routeLength } from "./sim/astar";
import { WORLD, networkFor } from "./sim/canon";
import { easeTowards, focusOn, minZoom, overviewZoom, wheelZoom } from "./sim/camera-rules";
import { advanceClock, createClock, dayProgress, formatClock } from "./sim/clock";
import { placeAt, zoneAt } from "./sim/collision";
import { cropById, cropName, languageStatus, t, type Lang } from "./sim/crops";
import { isSimError } from "./sim/errors";
import { facingFromDelta, type Facing } from "./sim/facing";
import {
  activeCellIndex,
  cellCentre,
  cellIndexAt,
  createPlotGrid,
  describeCell,
  growOneDay,
  plantCell,
  tillCell,
  waterCell,
  type PlotGrid,
} from "./sim/plot";
import { createPlayer, setRoute, updatePlayer, type InputState, type PlayerState } from "./sim/player";
import { createTank, refillTank, spendWater } from "./sim/water";
import type { Vec2 } from "./sim/types";
import { createView } from "./render/view";
import { mountOverlay, setDayLabel } from "./ui/overlay";
import { mountToolbar, type ToolId } from "./ui/toolbar";

/*  Composition root: wires sim state to the renderer and the UI.
    All rules (movement, pathing, collision, plot, clock, water) live in src/sim. */

const container = document.querySelector<HTMLDivElement>("#app");
if (!container) throw new Error("#app mount point is missing from index.html");

const farmer = (canonJson as { identities: { farmer: { height_m: number } } }).identities.farmer;
const NETWORK = WORLD.movement.mode === "free" ? null : networkFor(WORLD);

/* ------------------------------- sim state ------------------------------- */

let grid: PlotGrid = createPlotGrid(WORLD, WORLD.plot);
let tank = createTank(WORLD);
let clock = createClock(WORLD.clock);
let lang: Lang = "en";

let player: PlayerState = createPlayer(WORLD);
let facing: Facing = "south";
let cursorCell: number | null = null;
let messageTimer = 0;

const view = createView(container, WORLD, farmer.height_m, grid);
const overlay = mountOverlay(container, WORLD);

/* ------------------------------- camera ---------------------------------- */

const aspect = () => container.clientWidth / Math.max(container.clientHeight, 1);
let cameraFocus: Vec2 = focusOn(WORLD.parcel, player.position);
let zoomGoal = 1;
const atOverview = (zoom: number) => zoom <= minZoom(WORLD, aspect()) * 1.001;

view.actor.sync(player.position.x, player.position.y);
view.setFocus(cameraFocus.x, cameraFocus.y);

/* -------------------------------- helpers -------------------------------- */

function say(text: string, kind: "error" | "ok" | "none" = "error"): void {
  overlay.setMessage(text, kind);
  messageTimer = kind === "none" ? 0 : 2.6;
}

function fail(error: unknown, fallback: string): void {
  say(isSimError(error) ? `${error.code}: ${error.message}` : fallback, "error");
}

function refreshPlot(): void {
  view.plot.sync(grid);
}

function activeCell(): number | null {
  return activeCellIndex(grid, player.position, facing);
}

function cellText(index: number | null): string {
  if (index === null) return "no cell";
  const cell = grid.cells[index];
  const name = cell?.cropId ? cropName(cropById(cell.cropId), lang) : undefined;
  return describeCell(grid, index, name);
}

/** The place label: a zone's name, or "Path" from the strings data. */
function placeLabel(point: Vec2): string {
  const place = placeAt(WORLD, point, NETWORK);
  if (place.zone) return place.zone.name;
  return t(lang, place.kind === "path" ? "place.path" : "place.outside");
}

/* --------------------------------- tools --------------------------------- */

function runTool(tool: ToolId): void {
  const index = activeCell();
  if (index === null) {
    say("Stand in the vegetable beds, facing a cell.", "error");
    return;
  }

  try {
    if (tool === "till") {
      grid = tillCell(grid, index);
      refreshPlot();
      say(`Tilled cell ${index}.`, "ok");
    } else if (tool === "water") {
      const nextGrid = waterCell(grid, index);
      const nextTank = spendWater(tank, WORLD.water.perUse);
      grid = nextGrid;
      tank = nextTank;
      refreshPlot();
      view.water.play({ x: player.position.x, y: player.position.y }, cellCentre(grid, index));
      say(`Watered cell ${index}. Tank ${tank.level}/${tank.capacity}.`, "ok");
    } else if (tool === "refill") {
      tank = refillTank(tank, WORLD, player.position);
      say(`Tank refilled: ${tank.level}/${tank.capacity}.`, "ok");
    } else {
      const cropId = tool === "plant-tomato" ? "tomato" : "palak";
      grid = plantCell(grid, index, cropId);
      refreshPlot();
      say(`Planted ${cropName(cropById(cropId), lang)} in cell ${index}.`, "ok");
    }
    toolbar.markUsed(tool);
  } catch (error) {
    fail(error, "That action did not work.");
  }
}

const TOOL_KEYS: Record<string, ToolId> = {
  "1": "till",
  "2": "plant-tomato",
  "3": "plant-palak",
  "4": "water",
  "5": "refill",
};

const toolbar = mountToolbar(container, runTool, setLanguage, lang);

function setLanguage(next: Lang): void {
  lang = next;
  toolbar.setLanguage(lang);
  overlay.setLanguageTag(
    languageStatus(lang) === "needs_review"
      ? `${lang.toUpperCase()} · ${t(lang, "draft")} — needs native review`
      : "English",
  );
  overlay.setPlace(placeLabel(player.position));
}

/* -------------------------------- input ---------------------------------- */

const input: InputState = { forward: false, back: false, left: false, right: false };
const KEY_MAP: Record<string, keyof InputState> = {
  w: "forward",
  arrowup: "forward",
  s: "back",
  arrowdown: "back",
  a: "left",
  arrowleft: "left",
  d: "right",
  arrowright: "right",
};

function toggleOverview(): void {
  if (atOverview(zoomGoal)) {
    zoomGoal = WORLD.camera.maxZoom * 0.4;
    cameraFocus = focusOn(WORLD.parcel, player.position);
    return;
  }
  zoomGoal = overviewZoom(WORLD, aspect());
}

/** Click-to-move: route if the rule allows, snap within 6 ft, else refuse. */
function moveTo(point: Vec2): void {
  const plan = planClickMove(WORLD, view.walkable, NETWORK, player.position, point);
  if (!plan) {
    say(t(lang, "hint.stayOnPath"), "error");
    return;
  }
  player = setRoute(player, plan.route.points);
  view.actor.setTargetMarker(plan.goal);
  if (plan.snapped) say("Moved to the nearest path point.", "ok");
  void routeLength;
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  const action = KEY_MAP[key];
  if (action) {
    input[action] = true;
    event.preventDefault();
    return;
  }
  const tool = TOOL_KEYS[key];
  if (tool) {
    runTool(tool);
    event.preventDefault();
    return;
  }
  if (key === "l") {
    setLanguage(lang === "en" ? "hi" : lang === "hi" ? "kn" : "en");
    event.preventDefault();
    return;
  }
  if (key === "o") {
    overlay.setOutlines(!overlay.outlinesVisible);
    view.world3d.setMapOutlinesVisible(overlay.outlinesVisible);
    return;
  }
  if (key === "p") {
    view.paths.setOverlayVisible(!view.paths.overlayVisible);
    overlay.setOverlayHint(view.paths.overlayVisible);
    say(view.paths.overlayVisible ? "Walkable overlay on." : "Walkable overlay off.", "ok");
    event.preventDefault();
    return;
  }
  if (key === "v") {
    toggleOverview();
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  const action = KEY_MAP[event.key.toLowerCase()];
  if (action) input[action] = false;
});

view.renderer.domElement.addEventListener("pointerdown", (event) => {
  const point = view.pickGround(event.clientX, event.clientY);
  if (!point) return;
  moveTo(point);
});

view.renderer.domElement.addEventListener("pointermove", (event) => {
  const point = view.pickGround(event.clientX, event.clientY);
  if (!point) return;
  overlay.setHover(placeLabel(point));
  const zone = zoneAt(WORLD, point);
  cursorCell = zone && zone.key === WORLD.plot.zone ? cellIndexAt(grid, point) : null;
});

view.renderer.domElement.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    zoomGoal = wheelZoom(zoomGoal, event.deltaY, WORLD, aspect());
  },
  { passive: false },
);

const resize = () => view.resize(container.clientWidth, container.clientHeight);
window.addEventListener("resize", resize);
resize();

/* --------------------------------- loop ---------------------------------- */

let last = performance.now();

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  const before = { ...player.position };
  player = updatePlayer(WORLD, player, input, dt);
  const heading = facingFromDelta(player.position.x - before.x, player.position.y - before.y);
  if (heading) facing = heading;

  const tick = advanceClock(clock, dt, WORLD.clock);
  clock = tick.clock;
  if (tick.daysPassed > 0) {
    for (let day = 0; day < tick.daysPassed; day += 1) {
      const growth = growOneDay(grid, WORLD.growth.stagesPerDay);
      grid = growth.grid;
      if (growth.grown.length > 0) {
        refreshPlot();
        say(`Day ${clock.day}: ${growth.grown.length} cell(s) grew.`, "ok");
      }
    }
  }

  if (messageTimer > 0) {
    messageTimer -= dt;
    if (messageTimer <= 0) overlay.setMessage("", "none");
  }

  view.actor.sync(player.position.x, player.position.y);
  view.actor.setTargetMarker(player.target);

  const zoomedOut = atOverview(zoomGoal);
  const goal = zoomedOut
    ? { x: WORLD.parcel.widthFt / 2, y: WORLD.parcel.depthFt / 2 }
    : focusOn(WORLD.parcel, player.position);
  cameraFocus = easeTowards(cameraFocus, goal, dt, 8);
  view.setFocus(cameraFocus.x, cameraFocus.y);

  const easedZoom = view.zoom + (zoomGoal - view.zoom) * (1 - Math.exp(-10 * dt));
  view.setZoom(easedZoom);

  const cell = activeCell();
  view.plot.setHighlights(cell, cursorCell);
  view.water.update(dt);

  overlay.update(player.position.x, player.position.y, placeLabel(player.position));
  overlay.setZoom(view.zoom, atOverview(view.zoom));
  overlay.setClock(formatClock(clock, WORLD.clock), dayProgress(clock, WORLD.clock));
  setDayLabel(overlay, clock.day);
  overlay.setTank(tank.level / tank.capacity, tank.level, tank.capacity, t(lang, "hud.tank"));
  overlay.setCell(cellText(cell));

  view.render();
  requestAnimationFrame(frame);
}

setLanguage("en");
refreshPlot();
requestAnimationFrame(frame);
