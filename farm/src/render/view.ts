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
  /** The sunlight the scene was built with (morning / evening from data). */
  sun: THREE.DirectionalLight;
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

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
  container.appendChild(renderer.domElement);

  let aspect = (container.clientWidth || 1) / (container.clientHeight || 1);
  const camera = createIsometricCamera(world, aspect);

  /*  Lighting: one warm directional sun with a soft shadow, plus a cool
      ambient fill. Both presets live in sim_overrides.lighting; the default is
      data too. Shadow extent is the parcel, so nothing is cut off. */
  const presetName = world.lighting.defaultPreset;
  const preset = world.lighting.presets[presetName];
  if (!preset) throw new Error(`lighting preset "${presetName}" is not in the world`);
  scene.background = new THREE.Color(preset.sky);

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene.add(new THREE.AmbientLight(new THREE.Color(preset.ambientColour), preset.ambientIntensity));
  const sun = new THREE.DirectionalLight(new THREE.Color(preset.sunColour), preset.sunIntensity);
  const azimuth = (preset.sunAzimuthDeg * Math.PI) / 180;
  const elevation = (preset.sunElevationDeg * Math.PI) / 180;
  const sunDistance = 420;
  const centre = { x: world.parcel.widthFt / 2, y: world.parcel.depthFt / 2 };
  sun.position.set(
    centre.x + Math.sin(azimuth) * Math.cos(elevation) * sunDistance,
    Math.sin(elevation) * sunDistance,
    centre.y - Math.cos(azimuth) * Math.cos(elevation) * sunDistance,
  );
  sun.target.position.set(centre.x, 0, centre.y);
  sun.castShadow = true;
  sun.shadow.mapSize.set(world.lighting.shadowMapSize, world.lighting.shadowMapSize);
  const extent = world.lighting.shadowExtentFt;
  sun.shadow.camera.left = -extent;
  sun.shadow.camera.right = extent;
  sun.shadow.camera.top = extent;
  sun.shadow.camera.bottom = -extent;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 1200;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);

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

  const plot = createPlotView(plotGrid, plotBaseY, world.beds);
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
    labels.setZoom(zoom);
  };

  focusCamera(camera, world, { x: focusX, y: focusY });
  applyZoomLevel(1);

  /*  Shadows: everything solid casts and receives, the ground only receives,
      and the labels / HUD sprites stay out of the shadow pass. */
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.receiveShadow = true;
      object.castShadow = object.name !== "ground";
    }
  });

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
    sun,
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
