/*  Loading the rigged farmer.

    The character is authored in Blender (`scripts/character/build_farmer.py`)
    and shipped as `public/models/farmer.glb`: one skinned mesh, a 22-bone
    humanoid rig, and nine clips. It is loaded once, cloned per actor, and then
    driven by the app's own gait — see `farmer-motion.ts`.

    Model space is metres and he is 1.72 m tall; the farm is in feet, so the
    clone is scaled by the height the canon gives the farmer. He faces +Z, which
    is the direction `Actor.setFacing` points him in. */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

import type { FarmerClip } from "./farmer-motion";

/** Served from `public/`, and relative, so the page works at any path. */
export const FARMER_GLB_URL = "models/farmer.glb";
/** His height in the Blender file, in metres. */
export const FARMER_MODEL_HEIGHT_M = 1.72;

export interface FarmerModel {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Partial<Record<FarmerClip, THREE.AnimationAction>>;
  /** Triangles in the character, for the readout. */
  triangles: number;
  dispose(): void;
}

function prepare(scene: THREE.Group, heightFt: number): { root: THREE.Group; triangles: number } {
  const root = new THREE.Group();
  root.name = "farmer:rig";
  root.add(scene);

  const scale = heightFt > 0 ? heightFt / FARMER_MODEL_HEIGHT_M : 1;
  scene.scale.setScalar(scale);
  scene.updateMatrixWorld(true);

  let triangles = 0;
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = false;
    // Skinned bounds are computed from the bind pose, so a swinging arm can
    // leave the frustum and vanish; the farmer is always near the camera.
    object.frustumCulled = false;
    const geometry = object.geometry as THREE.BufferGeometry;
    const count = geometry.getIndex()?.count ?? geometry.getAttribute("position")?.count ?? 0;
    triangles += count / 3;
    const material = object.material;
    for (const one of Array.isArray(material) ? material : [material]) {
      one.shadowSide = THREE.FrontSide;
    }
  });

  // Stand him on the ground rather than wherever his origin happens to be.
  const box = new THREE.Box3().setFromObject(scene);
  if (Number.isFinite(box.min.y)) scene.position.y -= box.min.y;
  return { root, triangles: Math.round(triangles) };
}

function tidy(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const material = child.material;
    for (const one of Array.isArray(material) ? material : [material]) one.dispose();
  });
}

/**
 * Load the character. Rejects if the file is missing; the caller decides what
 * to do about it, because a farmer that fails to load should not take the farm
 * down with him.
 */
export async function loadFarmerModel(heightFt: number): Promise<FarmerModel> {
  const gltf = await new GLTFLoader().loadAsync(FARMER_GLB_URL);
  const { root, triangles } = prepare(cloneSkinned(gltf.scene) as THREE.Group, heightFt);

  const mixer = new THREE.AnimationMixer(root);
  const actions: Partial<Record<FarmerClip, THREE.AnimationAction>> = {};
  for (const clip of gltf.animations) {
    const action = mixer.clipAction(clip);
    action.enabled = true;
    action.setEffectiveWeight(0);
    action.play();
    actions[clip.name as FarmerClip] = action;
  }

  return {
    root,
    mixer,
    actions,
    triangles,
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      tidy(root);
      root.clear();
    },
  };
}
