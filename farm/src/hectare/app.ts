import "../ui/styles.css";

import {
  clampFocus,
  clampZoom,
  easeFocus,
  focusForAnchoredZoom,
  normaliseYaw,
  overviewViewFt,
  overviewZoom,
  viewFtForZoom,
  zoomAfterWheel,
} from "./camera";
import { advancePhase, easeAmplitude, easeFacing, gaitPose, REST_POSE } from "./gait";
import { buildMoveGrid, findRoute, remainingFt } from "./move";
import { createHectareView, type HectareView, type ViewMode } from "./render/view";
import { tourAt, tourDuration } from "./tour";
import { advanceWalker, createWalker, setRoute, headingTo } from "./walk";
import { HECTARE, placeAt, zoneAt, type HectareWorld } from "./world";
import { mountHectareControls, type HectareControls } from "../ui/hectare-controls";
import { mountHectareHud, type HectareHud } from "../ui/hectare-hud";
import { mountLayersPanel, LAYER_NAMES, type LayerName, type LayersPanel } from "../ui/hectare-layers";
import { createFrameCompositor, createRecorder, downloadBlob, videoFilename, VIDEO_FPS } from "../ui/recorder";
import { mountVideoPanel, type VideoPanel } from "../ui/video-panel";
import { distanceFactor, NAV_TURN_DEG, turnDirection, zoomFactor, type NavButton } from "../ui/view-controls";

/*  The hectare app: the farm, walkable, with a camera you can put behind the
    farmer and a tour you can record.

    The sim lives in move.ts (the grid and the route), walk.ts (the walker),
    gait.ts (the cycle) and tour.ts (the film). This file is the composition root:
    it wires those to the view and the UI, and owns the only pieces of state that
    are not the renderer's or the sim's — which camera is showing, where it is
    pointed, and what the tour clock says. */

const world: HectareWorld = HECTARE;

export function startHectare(): void {
  const container = document.querySelector<HTMLDivElement>("#app");
  if (!container) throw new Error("#app mount point is missing from index.html");

  const view: HectareView = createHectareView(container, world);
  const hud: HectareHud = mountHectareHud(container, world.parcel);
  const grid = buildMoveGrid(world);

  let walker = createWalker(world);
  let facing = 0;
  let gaitPhase = 0;
  let gaitAmplitude = 0;
  let destination = "north gate";

  // Third person by default: the point of the view is to watch him walk.
  let mode: ViewMode = "third-person";
  // Behind the farmer, ← → walk the camera round him: degrees off his back.
  let orbitDeg = 0;

  const aspectNow = (): number => Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1);
  let yawDeg = normaliseYaw(world.camera.yawDeg);
  // Start with the whole hectare on screen: 100 m across is the point of it.
  let overview = true;
  const centre = { x: world.parcel.widthFt / 2, y: world.parcel.depthFt / 2 };
  let focus = { x: centre.x, y: centre.y };
  let zoomGoal = overviewZoom(world, aspectNow(), yawDeg);

  const layers: LayersPanel = mountLayersPanel(container, world, (layer: LayerName, visible: boolean) => {
    for (const child of view.scene.children) {
      if (!child.name.startsWith("orchard:")) continue;
      child.visible = visible || !child.name.includes(`:${layer}:`);
      if (!visible && child.name.includes(`:${layer}:`)) child.visible = false;
    }
    void layers;
  });

  const controls: HectareControls = mountHectareControls(container, {
    onNav: (button, repeat) => navStep(button, repeat),
    onMode: (next) => setMode(next),
  });
  controls.setMode(mode);

  const tourShots = world.tour;
  const tourLengthS = tourDuration(tourShots);
  const compositor = createFrameCompositor(view.renderer.domElement);
  const recorder = createRecorder(compositor.canvas, VIDEO_FPS);
  let tour: { time: number; record: boolean; shotIndex: number; caption: string; progress: number } | null = null;
  let modeBeforeTour: ViewMode = "third-person";
  let tourLoop = false;

  const video: VideoPanel = mountVideoPanel(container, {
    onPlay: () => startTour(false),
    onRecord: () => startTour(true),
    onStop: () => stopTour(true),
  });
  video.setEnabled(false);
  const status = (): string =>
    `${Math.round(tourLengthS)} s · ${compositor.width}×${compositor.height} · ${VIDEO_FPS} fps` +
    (recorder.supported ? "" : " · this browser cannot record");
  video.setStatus(status());

  /* ------------------------------- walking ------------------------------- */

  const pathText = (): string => {
    const left = remainingFt(walker.route, walker.position);
    if (walker.route && walker.route.length > 0) return `Path → ${destination} · ${left.toFixed(1)} ft left`;
    return `Path — at ${placeAt(world, walker.position)} · click to walk`;
  };

  const walkTo = (point: { x: number; y: number }): void => {
    const route = findRoute(grid, walker.position, point);
    if (!route || route.points.length === 0) {
      const zone = zoneAt(world, point);
      const text = zone
        ? zone.walkable
          ? `No path to ${zone.label}: nothing in the layout reaches it.`
          : `${zone.label} is not walkable.`
        : "No path to that spot: click a path or a walkable plot.";
      hud.setPath(`Path — ${text}`, "refused");
      hud.setMessage(text, "error");
      return;
    }
    walker = setRoute(walker, route.points);
    destination = placeAt(world, route.points[route.points.length - 1] as { x: number; y: number });
    view.actor.setTargetMarker(route.points[route.points.length - 1] as { x: number; y: number });
    hud.setPath(pathText(), "route");
    hud.setMessage(route.snapped ? "Moved to the nearest path point." : "", route.snapped ? "ok" : "none");
  };

  /* ------------------------------- cameras ------------------------------- */

  const setMode = (next: ViewMode): void => {
    mode = next;
    view.setMode(next);
    controls.setMode(next);
    if (next === "third-person") {
      view.setFollowTarget(walker.position.x, walker.position.y, facing + (orbitDeg * Math.PI) / 180);
      hud.setMessage("Following the farmer in third person.", "ok");
      return;
    }
    view.setFocus(focus.x, focus.y);
    view.setZoom(view.zoom);
    hud.setZoom(view.zoom, overview);
    hud.setMessage("Full view of the farm.", "ok");
  };

  const setOverview = (on: boolean): void => {
    overview = on;
    zoomGoal = on ? overviewZoom(world, aspectNow(), yawDeg) : 1;
    if (on) focus = { x: centre.x, y: centre.y };
    else focus = clampFocus(world, walker.position, viewFtForZoom(world, zoomGoal), aspectNow(), yawDeg);
    view.setFocus(focus.x, focus.y);
    view.setZoom(zoomGoal);
    hud.setZoom(view.zoom, overview);
  };

  const turnTo = (nextYawDeg: number): void => {
    yawDeg = normaliseYaw(nextYawDeg);
    view.setYaw(yawDeg);
    if (overview) {
      zoomGoal = overviewZoom(world, aspectNow(), yawDeg);
      view.setZoom(zoomGoal);
    }
    hud.setHeading(yawDeg);
    hud.setZoom(view.zoom, overview);
  };

  const orbitBy = (deltaDeg: number): void => {
    orbitDeg = ((((orbitDeg + deltaDeg + 180) % 360) + 360) % 360) - 180;
    view.setFollowTarget(walker.position.x, walker.position.y, facing + (orbitDeg * Math.PI) / 180);
  };

  const zoomTo = (zoom: number, anchor: { x: number; y: number } | null): void => {
    const next = clampZoom(world, aspectNow(), zoom, yawDeg);
    if (anchor && view.zoom !== next) {
      const moved = focusForAnchoredZoom(focus, anchor, viewFtForZoom(world, view.zoom), viewFtForZoom(world, next));
      focus = clampFocus(world, moved, viewFtForZoom(world, next), aspectNow(), yawDeg);
    }
    zoomGoal = next;
    overview = next <= overviewZoom(world, aspectNow(), yawDeg) * 1.001;
    if (overview) focus = { x: centre.x, y: centre.y };
    view.setFocus(focus.x, focus.y);
    view.setZoom(next);
    hud.setZoom(next, overview);
  };

  /** One press of the pad, or one arrow key. */
  const navStep = (button: NavButton, repeat: boolean): void => {
    if (tour) return;
    const turn = turnDirection(button);
    if (turn !== 0) {
      const step = turn * (repeat ? NAV_TURN_DEG / 3 : NAV_TURN_DEG);
      if (mode === "iso") turnTo(yawDeg + step);
      else orbitBy(step);
      return;
    }
    if (mode === "third-person") {
      view.setFollowDistance(view.followDistanceFt / distanceFactor(button));
      hud.setMessage(`Camera ${view.followDistanceFt.toFixed(0)} ft back.`, "none");
      return;
    }
    zoomTo(view.zoom * zoomFactor(button), null);
  };

  /* --------------------------------- tour -------------------------------- */

  const startTour = (record: boolean): void => {
    if (tour) return;
    modeBeforeTour = mode;
    walker = createWalker(world);
    facing = 0;
    orbitDeg = 0;
    gaitPhase = 0;
    gaitAmplitude = 0;
    view.actor.setTargetMarker(null);
    view.actor.sync(walker.position.x, walker.position.y);
    view.actor.animate(REST_POSE);
    turnTo(normaliseYaw(world.camera.yawDeg));
    setOverview(true);
    setMode("iso");
    tour = { time: 0, record, shotIndex: -1, caption: "", progress: 0 };
    const started = record && recorder.start();
    video.setRecording(started);
    video.setEnabled(true);
    video.setStatus(status());
    controls.setEnabled(false);
    hud.setMessage(
      started
        ? "Recording the farm tour."
        : record
          ? "This browser cannot record — playing the tour instead."
          : "Playing the farm tour.",
      started || !record ? "ok" : "error",
    );
  };

  const stopTour = (keepRecording: boolean): void => {
    if (!tour) return;
    const wasRecording = tour.record;
    tour = null;
    video.setCaption("", -1);
    video.setRecording(false);
    video.setEnabled(false);
    controls.setEnabled(true);
    if (wasRecording) {
      void recorder.stop().then((blob) => {
        if (!blob) {
          hud.setMessage("Nothing was recorded.", "error");
          return;
        }
        if (!keepRecording) {
          hud.setMessage("Recording discarded.", "none");
          return;
        }
        const name = videoFilename(new Date());
        downloadBlob(blob, name);
        hud.setMessage(`Saved ${name} · ${(blob.size / 1_000_000).toFixed(1)} MB`, "ok");
      });
    }
    setMode(modeBeforeTour);
    hud.setMessage("Tour finished.", "none");
    if (tourLoop) window.setTimeout(() => startTour(false), 2000);
  };

  /* --------------------------------- input ------------------------------- */

  const LAYER_KEYS: Record<string, LayerName> = { "1": "L1", "2": "L2", "3": "L3", "4": "L4", "5": "L5" };

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (tour) {
      if (key === "escape") {
        stopTour(false);
        event.preventDefault();
      }
      return;
    }
    if (key === "t") {
      startTour(false);
      event.preventDefault();
      return;
    }
    if (key === "r") {
      startTour(true);
      event.preventDefault();
      return;
    }
    if (key === "c" || key === "h") {
      setMode(mode === "third-person" ? "iso" : "third-person");
      event.preventDefault();
      return;
    }
    if (key === "v") {
      if (mode !== "iso") setMode("iso");
      setOverview(!overview);
      event.preventDefault();
      return;
    }
    if (key === "arrowleft" || key === "arrowright" || key === "arrowup" || key === "arrowdown") {
      navStep(
        key === "arrowleft" ? "left" : key === "arrowright" ? "right" : key === "arrowup" ? "up" : "down",
        event.repeat,
      );
      event.preventDefault();
      return;
    }
    const layer = LAYER_KEYS[key];
    if (layer) {
      layers.setLayerVisible(layer, !layers.isVisible(layer));
      const visible = layers.isVisible(layer);
      for (const child of view.scene.children) {
        if (child.name.startsWith("orchard:") && child.name.includes(`:${layer}:`)) child.visible = visible;
      }
      event.preventDefault();
    }
  });

  view.renderer.domElement.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      if (tour) return;
      if (mode === "third-person") {
        view.setFollowDistance(view.followDistanceFt * Math.exp(event.deltaY * 0.0015));
        return;
      }
      zoomTo(zoomAfterWheel(world, aspectNow(), view.zoom, event.deltaY, yawDeg), view.pick(event.clientX, event.clientY));
    },
    { passive: false },
  );

  let press: { x: number; y: number; dragged: boolean } | null = null;

  view.renderer.domElement.addEventListener("pointermove", (event) => {
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 4) press.dragged = true;
    if (press?.dragged && mode === "iso") {
      // Dragging sideways turns the farm.
      turnTo(yawDeg + (event.movementX ?? 0) * 0.4);
      return;
    }
    const point = view.pick(event.clientX, event.clientY);
    hud.setHover(point ? placeAt(world, point) : "");
  });

  view.renderer.domElement.addEventListener("pointerdown", (event) => {
    press = { x: event.clientX, y: event.clientY, dragged: false };
  });

  view.renderer.domElement.addEventListener("pointerup", (event) => {
    if (tour) return;
    const walked = press?.dragged !== true;
    press = null;
    if (!walked) return;
    const point = view.pick(event.clientX, event.clientY);
    if (point) walkTo(point);
  });

  view.renderer.domElement.addEventListener("pointerleave", () => {
    hud.setHover("");
    press = null;
  });

  const resize = (): void => {
    view.resize(container.clientWidth, container.clientHeight);
    if (overview) {
      zoomGoal = overviewZoom(world, aspectNow(), yawDeg);
      view.setZoom(zoomGoal);
      hud.setZoom(view.zoom, true);
    }
  };
  window.addEventListener("resize", resize);
  resize();

  /* ------------------------------ the frame ------------------------------ */

  let last = performance.now();
  const frame = (now: number): void => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    if (tour) {
      tour.time = Math.min(tour.time + dt, tourLengthS);
      const overviewFt = overviewViewFt(world, aspectNow(), yawDeg);
      const state = tourAt(tourShots, world, tour.time, overviewFt);
      if (state.index !== tour.shotIndex) {
        tour.shotIndex = state.index;
        if (state.mode !== mode) setMode(state.mode);
        if (state.walkToZoneId) {
          const zone = world.zones.find((entry) => entry.id === state.walkToZoneId);
          if (zone) walkTo({ x: zone.box.x + zone.box.widthFt / 2, y: zone.box.y + zone.box.depthFt / 2 });
        }
      }
      tour.caption = state.caption;
      tour.progress = state.progress;
      if (mode === "iso") {
        const zoom = clampZoom(world, aspectNow(), world.camera.defaultViewFt / Math.max(state.frameFt, 1), yawDeg);
        focus = { x: state.focus.x, y: state.focus.y };
        zoomGoal = zoom;
        view.setFocus(focus.x, focus.y);
        view.setZoom(zoom);
        overview = Math.abs(state.frameFt - overviewFt) < 1.5;
        hud.setZoom(zoom, overview);
      }
      video.setCaption(state.caption, state.progress);
      if (state.done) stopTour(true);
    }

    // The isometric camera follows him while he walks, unless the tour is
    // driving it. The follow camera is his, so none of this runs in third person.
    if (mode === "iso" && !tour) {
      if (walker.route) {
        const goal = clampFocus(
          world,
          walker.position,
          viewFtForZoom(world, view.zoom),
          aspectNow(),
          yawDeg,
        );
        focus = easeFocus(focus, goal, dt, 3);
      } else if (overview) {
        focus = { x: centre.x, y: centre.y };
      }
      view.setFocus(focus.x, focus.y);
      const eased = view.zoom + (zoomGoal - view.zoom) * (1 - Math.exp(-6 * dt));
      view.setZoom(eased);
    }

    const from = { x: walker.position.x, y: walker.position.y };
    const wasWalking = walker.route !== null;
    walker = advanceWalker(walker, dt, world.farmer.speedFtPerSec);
    const covered = Math.hypot(walker.position.x - from.x, walker.position.y - from.y);

    if (wasWalking && walker.route === null) {
      view.actor.setTargetMarker(null);
      hud.setPath(pathText(), "none");
      hud.setMessage(`Arrived at ${destination}.`, "ok");
      hud.setPlace(placeAt(world, walker.position));
    } else if (walker.route) {
      hud.setPath(pathText(), "route");
    }

    const next = walker.route && walker.route.length > 0 ? (walker.route[0] as { x: number; y: number }) : null;
    if (next && Math.hypot(next.x - walker.position.x, next.y - walker.position.y) > 0.1) {
      facing = easeFacing(facing, headingTo(walker.position, next), dt, 9);
    }

    gaitPhase = advancePhase(gaitPhase, covered, world.farmer.strideFt);
    gaitAmplitude = easeAmplitude(gaitAmplitude, walker.route ? 1 : 0, dt, 6);
    view.actor.sync(walker.position.x, walker.position.y);
    view.actor.setFacing(facing);
    view.actor.animate(gaitPose(gaitPhase, gaitAmplitude));
    view.setFollowTarget(walker.position.x, walker.position.y, facing + (orbitDeg * Math.PI) / 180);

    view.render(now / 1000);
    if (tour?.record) compositor.frame(tour.caption, tour.progress);
    requestAnimationFrame(frame);
  };

  /* -------------------------------- start -------------------------------- */

  view.actor.sync(walker.position.x, walker.position.y);
  view.actor.animate(REST_POSE);
  hud.setPlace(placeAt(world, walker.position));
  hud.setPath(pathText(), "none");
  hud.setHeading(yawDeg);
  setOverview(true);
  setMode(mode);
  view.setFollowTarget(walker.position.x, walker.position.y, facing);

  // `?tour=1` plays the tour on load, `&record=1` records it and downloads the
  // file when it ends, `&loop=1` replays it forever: one flag for a demo, the
  // others for a kiosk screen or a live stream.
  const params = new URLSearchParams(window.location.search);
  tourLoop = params.has("loop");
  if (params.has("tour") || params.has("record")) startTour(params.has("record"));

  void LAYER_NAMES;
  requestAnimationFrame(frame);
}
