import { readFileSync } from "node:fs";

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, test } from "vitest";

import {
  blendFor,
  clipForArrival,
  dueForLookAround,
  FARMER_CLIPS,
  isStanding,
  wrapPhase,
} from "../src/hectare/render/farmer-motion";
import { windAround } from "../src/hectare/render/farmer-inspect";
import { REST_POSE } from "../src/hectare/gait";

/*  The farmer is a real model now, so these tests read the actual GLB the app
    serves. They are about the brief: a genuine skinned character, not a plane;
    a humanoid rig; the nine clips; and the rules that decide which one plays. */

const GLB = new URL("../public/models/farmer.glb", import.meta.url);

async function farmer() {
  const buffer = readFileSync(GLB);
  const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  return new GLTFLoader().parseAsync(data, "");
}

describe("the farmer's model", () => {
  test("is a skinned mesh on a humanoid rig, not a billboard", async () => {
    const gltf = await farmer();
    const skinned: THREE.SkinnedMesh[] = [];
    const bones = new Set<string>();
    gltf.scene.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) skinned.push(object as THREE.SkinnedMesh);
      if (object instanceof THREE.Bone) bones.add(object.name);
    });

    expect(skinned).toHaveLength(1);
    expect(skinned[0]?.isSkinnedMesh).toBe(true);
    expect(skinned[0]?.skeleton.bones.length).toBeGreaterThanOrEqual(20);
    // The bones the app's gait and the clips rely on.
    for (const bone of ["hips", "spine", "chest", "head", "thighL", "thighR", "footL", "footR", "handL", "handR"]) {
      expect(bones, `no ${bone} bone`).toContain(bone);
    }
    expect(skinned[0]?.geometry.attributes.position?.count ?? 0).toBeGreaterThan(1000);
    // A plane would be four vertices and no skin weights.
    expect(skinned[0]?.geometry.attributes.skinIndex).toBeTruthy();
    expect(skinned[0]?.skeleton.bones.length).toBeLessThan(40);
  });

  test("carries every clip the app can ask for", async () => {
    const gltf = await farmer();
    const names = gltf.animations.map((clip) => clip.name).sort();
    expect(names).toEqual([...FARMER_CLIPS].sort());
    for (const clip of gltf.animations) {
      expect(clip.duration, `${clip.name} has no duration`).toBeGreaterThan(0.5);
      expect(clip.tracks.length, `${clip.name} animates nothing`).toBeGreaterThan(30);
    }
  });

  test("is light enough to draw every frame, and keeps its palette", async () => {
    const gltf = await farmer();
    let triangles = 0;
    const materials = new Set<string>();
    gltf.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const geometry = object.geometry as THREE.BufferGeometry;
      triangles += (geometry.getIndex()?.count ?? geometry.getAttribute("position")?.count ?? 0) / 3;
      for (const one of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(one.name);
      }
    });
    expect(triangles).toBeLessThan(20_000);
    for (const name of ["skin", "turban", "kurta", "dhoti", "scarf", "leather"]) {
      expect(materials, `no ${name} material`).toContain(name);
    }
  });

  test("stands 1.72 m tall, facing +Z, with his feet on the floor", async () => {
    const gltf = await farmer();
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const height = box.max.y - box.min.y;
    // Metres in the file; the app scales to feet.
    expect(height).toBeGreaterThan(1.6);
    expect(height).toBeLessThan(1.9);
    expect(Math.abs(box.min.y)).toBeLessThan(0.02);
    // He faces -Y in Blender's space, which the exporter turns into +Z.
    expect(box.max.z).toBeGreaterThan(0.05);
  });
});

describe("which clip plays", () => {
  test("standing is idle, walking is walk, and a run fades in at speed", () => {
    const still = blendFor({ phase: 0, amplitude: 0 });
    expect(still).toMatchObject({ idle: 1, walk: 0, run: 0 });

    const walk = blendFor({ phase: 0.25, amplitude: 1, speedFtPerSec: 5 });
    expect(walk).toMatchObject({ idle: 0, walk: 1, run: 0 });
    expect(walk.phase).toBeCloseTo(0.25);

    const run = blendFor({ phase: 0, amplitude: 1, speedFtPerSec: 14 });
    expect(run).toMatchObject({ idle: 0, walk: 0, run: 1 });

    const between = blendFor({ phase: 0, amplitude: 1, speedFtPerSec: 10 });
    expect(between.walk).toBeGreaterThan(0);
    expect(between.run).toBeGreaterThan(0);
    expect(between.walk + between.run).toBeCloseTo(1);
  });

  test("the phase is always inside one cycle", () => {
    expect(wrapPhase(-0.25)).toBeCloseTo(0.75);
    expect(wrapPhase(2.25)).toBeCloseTo(0.25);
    expect(wrapPhase(Number.NaN)).toBe(0);
  });

  test("he is only standing when the app says he has stopped", () => {
    expect(isStanding(REST_POSE, { phase: 0, amplitude: 0 })).toBe(true);
    expect(isStanding(REST_POSE, { phase: 0, amplitude: 0.8 })).toBe(false);
    expect(isStanding({ ...REST_POSE, legSwing: 0.3 }, undefined)).toBe(false);
  });

  test("he looks about now and then, not constantly", () => {
    expect(dueForLookAround(0, 0)).toBe(false);
    expect(dueForLookAround(7, 0)).toBe(true);
    expect(dueForLookAround(7, 1)).toBe(false);
    expect(dueForLookAround(20, 1)).toBe(true);
    expect(dueForLookAround(-1, 0)).toBe(false);
  });

  test("arriving somewhere, he does that place's job", () => {
    expect(clipForArrival("goshala")).toBe("FeedCattle");
    expect(clipForArrival("vegetable_beds")).toBe("WaterCrops");
    expect(clipForArrival("orchard")).toBe("PickUp");
    expect(clipForArrival("compost")).toBe("BendDown");
    expect(clipForArrival("nowhere")).toBe("Gesture");
    expect(clipForArrival(null)).toBe("Gesture");
  });
});

describe("the stills rig", () => {
  test("winds the camera round without a jump at either side", () => {
    expect(windAround(0)).toBeCloseTo(0);
    expect(windAround(359)).toBeCloseTo(-1);
    expect(windAround(720)).toBeCloseTo(0);
  });
});
