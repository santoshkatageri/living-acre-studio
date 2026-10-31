import * as THREE from "three";

import { networkFor } from "../sim/canon";
import { buildWalkableGrid, type WalkableGrid } from "../sim/walkable";
import type { World } from "../sim/types";
import type { PlotGrid } from "../sim/plot";
import { createFarmer, type Actor } from "./actor";
import { applyAspect, applyZoom, createIsometricCamera, focusCamera } from "./camera";
import { createZoneLabels, type ZoneLabels } from "./labels";
import { createPaths, type PathsView } from "./paths";
import { createPlotView, type PlotView } from "./plots";
import { createPond, type PondView } from "./pond";
import { createWaterEffect, type WaterEffect } from "./water-effect";
import { createWorldMesh, type WorldMesh } from "./world-mesh";

/*  Renderer bootstrap. Owns Three.js objects only; all rules live in src/sim. */

export interface View {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  world3d: WorldMesh;
  actor: Actor;
  labels: ZoneLabels;
  plot: PlotView;
  water: WaterEffect;
  pond: PondView;
  paths: PathsView;
  /** The same grid A* and the overlay use, built once here. */
  walkable: WalkableGrid;
  setFocus(xFt: number, yFt: number): void;
  setZoom(zoom: number): void;
  readonly zoom: number;
  resize(width: number, height: number): void;
  render(): void;
  pickGround(clientX: number, clientY: number): { x: number; y: number } | null;
  dispose(): void;
}

export function createView(
  container: HTMLElement,
  world: World,
  farmerHeightM: number,
  plotGrid: PlotGrid,
): View {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(world.palette["ink"] ?? "#12100d");

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
  container.appendChild(renderer.domElement);

  let aspect = (container.clientWidth || 1) / (container.clientHeight || 1);
  const camera = createIsometricCamera(world, aspect);

  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const sun = new THREE.DirectionalLight(0xffe6bd, 2.2);
  sun.position.set(-120, 220, -80);
  scene.add(sun);

  const world3d = createWorldMesh(world);
  scene.add(world3d.group);

  const labels = createZoneLabels(world);
  scene.add(labels.group);

  const bedsZone = world.zones.find((zone) => zone.key === plotGrid.zone);
  const plotBaseY = (bedsZone?.heightFt ?? 0) + 0.02;

  const pond = createPond(world);
  scene.add(pond.group);

  const walkable = buildWalkableGrid(world, networkFor(world));
  const paths = createPaths(world, walkable);
  scene.add(paths.group);

  const plot = createPlotView(plotGrid, plotBaseY);
  plot.sync(plotGrid);
  scene.add(plot.group);

  const water = createWaterEffect(plotBaseY + 0.25);
  scene.add(water.group);

  const actor = createFarmer(world, farmerHeightM);
  scene.add(actor.mesh);
  scene.add(actor.marker);

  let focusX = world.parcel.widthFt / 2;
  let focusY = world.parcel.depthFt / 2;
  let zoomLevel = 1;

  const applyZoomLevel = (zoom: number) => {
    zoomLevel = zoom;
    applyZoom(camera, world, aspect, zoom);
    focusCamera(camera, world, { x: focusX, y: focusY });
  };

  focusCamera(camera, world, { x: focusX, y: focusY });
  applyZoomLevel(1);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();

  return {
    renderer,
    scene,
    camera,
    world3d,
    actor,
    labels,
    plot,
    water,
    pond,
    paths,
    walkable,
    setFocus(xFt, yFt) {
      focusX = xFt;
      focusY = yFt;
      focusCamera(camera, world, { x: focusX, y: focusY });
    },
    setZoom(zoom) {
      applyZoomLevel(zoom);
    },
    get zoom() {
      return zoomLevel;
    },
    resize(width, height) {
      if (width <= 0 || height <= 0) return;
      renderer.setSize(width, height);
      aspect = width / height;
      applyAspect(camera, world, aspect);
      applyZoomLevel(zoomLevel);
    },
    render() {
      renderer.render(scene, camera);
    },
    pickGround(clientX, clientY) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const point = raycaster.ray.intersectPlane(groundPlane, hit);
      if (!point) return null;
      return { x: point.x, y: point.z };
    },
    dispose() {
      labels.dispose();
      plot.dispose();
      pond.dispose();
      paths.dispose();
      world3d.dispose();
      actor.dispose();
      water.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
