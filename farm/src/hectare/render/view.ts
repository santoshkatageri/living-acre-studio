import * as THREE from "three";

import { createFarmer, type Actor } from "./actor";
import {
  CAMERA_DISTANCE,
  cameraBasis,
  clampZoom,
  createFollowCamera,
  focusForAnchoredZoom,
  groundFromScreen,
  overviewZoom,
  viewFtForZoom,
} from "../camera";
import { createGround } from "./ground";
import { createLabels, type LabelsView } from "./labels";
import { createLivestock, type LivestockView } from "./livestock";
import { createWater, type WaterView } from "./water";
import { createZones } from "./zones";
import type { HectareWorld } from "../world";
import type { Vec2 } from "../../sim/types";

/*  The view: one renderer, one scene, two cameras.

    The farm camera is orthographic and framed by `viewFt`; the follow camera is
    perspective and belongs to the farmer. Everything else — ground, spaces,
    animals, signs, water — is built once and shared, so switching views costs
    nothing but which camera is passed to `render`. */

export type ViewMode = "third-person" | "iso";

export interface HectareView {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  actor: Actor;
  labels: LabelsView;
  water: WaterView;
  livestock: LivestockView;
  readonly mode: ViewMode;
  setMode(mode: ViewMode): void;
  readonly zoom: number;
  setZoom(zoom: number): void;
  readonly yawDeg: number;
  setYaw(yawDeg: number): void;
  setFocus(xFt: number, yFt: number): void;
  readonly focus: Vec2;
  setFollowTarget(xFt: number, yFt: number, headingRad: number): void;
  setFollowDistance(distanceFt: number): void;
  readonly followDistanceFt: number;
  /** The ground point under the pointer, or null if the ray misses it. */
  pick(clientX: number, clientY: number): Vec2 | null;
  resize(width: number, height: number): void;
  render(timeSec?: number): void;
  dispose(): void;
}

export function createHectareView(container: HTMLElement, world: HectareWorld): HectareView {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(world.palette["sky"] ?? "#cfd9d2");

  let aspect = (container.clientWidth || 1) / (container.clientHeight || 1);

  /* -------------------------------- light ------------------------------- */
  scene.add(new THREE.HemisphereLight(0xf2f4ea, 0x4a4a34, 1.1));
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.0);
  sun.position.set(world.parcel.widthFt * 0.3, 220, world.parcel.depthFt * 0.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const side = world.parcel.widthFt * 0.62;
  sun.shadow.camera.left = -side;
  sun.shadow.camera.right = side;
  sun.shadow.camera.top = side;
  sun.shadow.camera.bottom = -side;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);
  sun.target.position.set(world.parcel.widthFt / 2, 0, world.parcel.depthFt / 2);

  /* ------------------------------ the world ----------------------------- */
  const ground = createGround(world);
  scene.add(ground.group);
  const zones = createZones(world);
  scene.add(zones.group);
  const water = createWater(world);
  scene.add(water.group);
  const livestock = createLivestock(world);
  scene.add(livestock.group);
  const labels = createLabels(world);
  scene.add(labels.group);
  const actor = createFarmer(world.farmer);
  scene.add(actor.mesh, actor.marker);

  /* ------------------------------ the cameras ---------------------------- */
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 3000);
  let mode: ViewMode = "third-person";
  let zoomLevel = 1;
  let yawDeg = world.camera.yawDeg;
  let focus: Vec2 = { x: world.parcel.widthFt / 2, y: world.parcel.depthFt / 2 };
  let followTarget: Vec2 = { ...world.spawn };
  let followHeading = 0;
  let followDistanceFt = world.camera.follow.distanceFt;
  const follow = createFollowCamera(world);

  const applyFrustum = (): void => {
    const viewFt = viewFtForZoom(world, zoomLevel);
    const halfHeight = viewFt / 2;
    const halfWidth = (viewFt * aspect) / 2;
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    const basis = cameraBasis(world.camera.pitchDeg, yawDeg);
    camera.position.set(
      focus.x + basis.toCamera.x * CAMERA_DISTANCE,
      basis.toCamera.y * CAMERA_DISTANCE,
      focus.y + basis.toCamera.z * CAMERA_DISTANCE,
    );
    camera.lookAt(focus.x, 0, focus.y);
    camera.updateMatrixWorld();
  };

  const activeCamera = (): THREE.Camera => (mode === "third-person" ? follow.camera : camera);

  const resize = (width: number, height: number): void => {
    if (width <= 0 || height <= 0) return;
    renderer.setSize(width, height);
    aspect = width / height;
    applyFrustum();
    follow.update(followTarget, followHeading, aspect, followDistanceFt);
  };
  resize(container.clientWidth || 1, container.clientHeight || 1);

  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();

  return {
    renderer,
    scene,
    actor,
    labels,
    water,
    livestock,
    get mode() {
      return mode;
    },
    setMode(next) {
      mode = next;
      if (next === "third-person") follow.update(followTarget, followHeading, aspect, followDistanceFt);
    },
    get zoom() {
      return zoomLevel;
    },
    setZoom(zoom) {
      zoomLevel = clampZoom(world, aspect, zoom, yawDeg);
      applyFrustum();
    },
    get yawDeg() {
      return yawDeg;
    },
    setYaw(next) {
      yawDeg = ((next % 360) + 360) % 360;
      applyFrustum();
    },
    setFocus(xFt, yFt) {
      focus = { x: xFt, y: yFt };
      applyFrustum();
    },
    get focus() {
      return focus;
    },
    setFollowTarget(xFt, yFt, headingRad) {
      followTarget = { x: xFt, y: yFt };
      followHeading = headingRad;
      follow.update(followTarget, followHeading, aspect, followDistanceFt);
    },
    setFollowDistance(distanceFt) {
      followDistanceFt = Math.min(
        Math.max(distanceFt, world.camera.follow.minDistanceFt),
        world.camera.follow.maxDistanceFt,
      );
      follow.update(followTarget, followHeading, aspect, followDistanceFt);
    },
    get followDistanceFt() {
      return followDistanceFt;
    },
    pick(clientX, clientY) {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      if (mode === "iso") {
        // The farm camera is orthographic: the maths is exact, so no raycasting.
        return groundFromScreen(world, focus, viewFtForZoom(world, zoomLevel), aspect, yawDeg, {
          x: (clientX - rect.left) / rect.width,
          y: (clientY - rect.top) / rect.height,
        });
      }
      raycaster.setFromCamera(
        new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1)),
        follow.camera,
      );
      return raycaster.ray.intersectPlane(groundPlane, hit) ? { x: hit.x, y: hit.z } : null;
    },
    resize,
    render(timeSec = 0) {
      labels.setFrame(mode === "third-person" ? 0 : viewFtForZoom(world, zoomLevel));
      water.update(timeSec);
      labels.faceCamera(activeCamera());
      renderer.render(scene, activeCamera());
    },
    dispose() {
      labels.dispose();
      water.dispose();
      livestock.dispose();
      zones.dispose();
      ground.dispose();
      actor.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

/** The whole-farm zoom for this shape, which the app starts at. */
export function farmOverviewZoom(world: HectareWorld, aspect: number, yawDeg = world.camera.yawDeg): number {
  return overviewZoom(world, aspect, yawDeg);
}

export { focusForAnchoredZoom };
