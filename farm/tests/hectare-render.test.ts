import * as THREE from "three";
import { describe, expect, test } from "vitest";

import { createLabels } from "../src/hectare/render/labels";
import { createLivestock } from "../src/hectare/render/livestock";
import { createWater, flowTowardPond } from "../src/hectare/render/water";
import { HECTARE } from "../src/hectare/world";

/*  The signs, the water and the herd, built in Node.

    A 2D canvas does not exist here, so the textures are blank stand-ins; the
    meshes, the instances and the maths are the real ones, and those are what the
    brief is about: boards on posts rather than floating sprites, water that
    moves, and animals standing on the right floor. */

const STYLE = HECTARE.labelStyle;
const WATER = HECTARE.waterStyle;
const blank = (): THREE.Texture => new THREE.Texture();

const instanced = (group: THREE.Group, name: string): THREE.InstancedMesh => {
  const found = group.getObjectByName(name);
  if (!(found instanceof THREE.InstancedMesh)) throw new Error(`${name} is not an instanced mesh`);
  return found;
};

const positionAt = (mesh: THREE.InstancedMesh, index: number): THREE.Vector3 => {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  return new THREE.Vector3().setFromMatrixPosition(matrix);
};

describe("the label boards", () => {
  const build = () => createLabels(HECTARE, { makeTexture: blank });

  test("one board per space, in two instanced meshes, plus a name each", () => {
    const view = build();
    expect(view.count).toBe(HECTARE.labels.length);
    expect(instanced(view.group, "labels:posts").count).toBe(HECTARE.labels.length);
    expect(instanced(view.group, "labels:plates").count).toBe(HECTARE.labels.length);
    expect(view.group.children.filter((child) => child.name.startsWith("label-text:"))).toHaveLength(
      HECTARE.labels.length,
    );
  });

  test("stand on the ground at a corner, with the name at the top of the post", () => {
    const view = build();
    const posts = instanced(view.group, "labels:posts");
    HECTARE.labels.forEach((label, index) => {
      const post = positionAt(posts, index);
      expect(post.x).toBeCloseTo(label.boardX, 3);
      expect(post.y).toBeCloseTo(0, 6);
      expect(post.z).toBeCloseTo(label.boardY, 3);
      const plane = view.group.getObjectByName(`label-text:${label.id}`) as THREE.Mesh;
      // On the board, not in the air above the plot.
      expect(plane.position.y).toBeGreaterThan(STYLE.postHeightFt);
      expect(plane.position.y).toBeLessThan(STYLE.postHeightFt + STYLE.boardHeightFt);
      // And it is not the middle of the space.
      expect(Math.hypot(label.boardX - label.x, label.boardY - label.y)).toBeGreaterThan(5);
    });
  });

  test("turn to face whichever camera is showing", () => {
    const view = build();
    const first = HECTARE.labels[0]!;
    const plane = view.group.getObjectByName(`label-text:${first.id}`) as THREE.Mesh;
    for (const [dx, dz] of [
      [20, 0],
      [0, 20],
      [-14, -14],
    ] as [number, number][]) {
      const camera = new THREE.PerspectiveCamera();
      camera.position.set(first.boardX + dx, 9, first.boardY + dz);
      camera.updateMatrixWorld();
      view.faceCamera(camera);
      expect(plane.rotation.y).toBeCloseTo(Math.atan2(dx, dz), 5);
      const facing = new THREE.Vector3(0, 0, 1).applyEuler(plane.rotation);
      expect(facing.x).toBeCloseTo(dx / Math.hypot(dx, dz), 5);
      expect(facing.z).toBeCloseTo(dz / Math.hypot(dx, dz), 5);
    }
  });

  test("grow as the camera pulls back, and stop at the data's cap", () => {
    const view = build();
    const plates = instanced(view.group, "labels:plates");
    const scaleAt = (frameFt: number): number => {
      view.setFrame(frameFt);
      const matrix = new THREE.Matrix4();
      plates.getMatrixAt(0, matrix);
      return new THREE.Vector3().setFromMatrixScale(matrix).x;
    };
    expect(scaleAt(0)).toBeCloseTo(1, 5);
    expect(scaleAt(STYLE.growthFromFt)).toBeCloseTo(1, 5);
    expect(scaleAt(STYLE.growthFromFt * 2)).toBeCloseTo(2, 3);
    expect(scaleAt(STYLE.growthFromFt * 100)).toBeCloseTo(STYLE.boardGrowthMax, 5);
  });

  test("takes its colours from the data", () => {
    const view = build();
    const post = (instanced(view.group, "labels:posts").material as THREE.MeshStandardMaterial).color.getHexString();
    const plate = (instanced(view.group, "labels:plates").material as THREE.MeshStandardMaterial).color.getHexString();
    expect(`#${post}`).toBe(STYLE.postColour.toLowerCase());
    expect(`#${plate}`).toBe(STYLE.boardColour.toLowerCase());
  });
});

describe("the moving water", () => {
  const build = () => createWater(HECTARE, { makeTexture: blank });
  const pondZone = HECTARE.zones.find((zone) => zone.kind === "water")!;
  const pond = { x: pondZone.box.x + pondZone.box.widthFt / 2, y: pondZone.box.y + pondZone.box.depthFt / 2 };

  test("runs toward the pond, along the axis each channel lies on", () => {
    const channel = HECTARE.channels[0]!;
    const centre = { x: channel.box.x + channel.box.widthFt / 2, y: channel.box.y + channel.box.depthFt / 2 };
    // The pond pulls the water along whichever axis lies between them.
    expect(flowTowardPond(channel.box, { x: centre.x + 40, y: centre.y })).toEqual({ axis: "x", sign: 1 });
    expect(flowTowardPond(channel.box, { x: centre.x - 40, y: centre.y })).toEqual({ axis: "x", sign: -1 });
    expect(flowTowardPond(channel.box, { x: centre.x, y: centre.y + 40 })).toEqual({ axis: "z", sign: 1 });
    expect(flowTowardPond(channel.box, null)).toEqual({
      axis: channel.box.widthFt >= channel.box.depthFt ? "x" : "z",
      sign: 1,
    });
  });

  test("gives every channel and the pond a surface", () => {
    const view = build();
    expect(view.surfaces).toBe(HECTARE.channels.length + 1);
    for (const channel of HECTARE.channels) expect(view.group.getObjectByName(`water:${channel.id}`)).toBeTruthy();
    expect(view.group.getObjectByName("water:pond")).toBeTruthy();
  });

  test("drifts at the data's speed, in the data's direction", () => {
    const view = build();
    const channel = HECTARE.channels[0]!;
    const texture = ((view.group.getObjectByName(`water:${channel.id}`) as THREE.Mesh).material as THREE.MeshStandardMaterial)
      .map!;
    const flow = flowTowardPond(channel.box, pond);
    const drift = (): number => (flow.axis === "x" ? texture.offset.x : texture.offset.y);
    view.update(0);
    expect(drift()).toBeCloseTo(0, 6);
    view.update(1);
    expect(drift()).toBeCloseTo((flow.sign * WATER.flowFtPerS) / WATER.textureTileFt, 5);
    view.update(2);
    expect(drift()).toBeCloseTo((flow.sign * 2 * WATER.flowFtPerS) / WATER.textureTileFt, 5);
  });

  test("breaks rings on the water, out of step, growing from nothing", () => {
    const view = build();
    const rings = view.group.getObjectByName("water:ripples") as THREE.InstancedMesh;
    expect(rings).toBeTruthy();
    expect(view.rippleCount).toBe(Math.min(WATER.rippleCount, rings.count));

    view.update(0.6);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    for (let index = 0; index < rings.count; index += 1) {
      rings.getMatrixAt(index, matrix);
      matrix.decompose(position, new THREE.Quaternion(), scale);
      const onChannel = HECTARE.channels.some(
        (channel) =>
          position.x >= channel.box.x - 1 &&
          position.x <= channel.box.x + channel.box.widthFt + 1 &&
          position.z >= channel.box.y - 1 &&
          position.z <= channel.box.y + channel.box.depthFt + 1,
      );
      const inPond =
        position.x >= pondZone.box.x &&
        position.x <= pondZone.box.x + pondZone.box.widthFt &&
        position.z >= pondZone.box.y &&
        position.z <= pondZone.box.y + pondZone.box.depthFt;
      expect(onChannel || inPond).toBe(true);
      expect(position.y).toBeGreaterThan(0.05);
      expect(position.y).toBeLessThan(0.2);
    }

    const sizeAt = (timeSec: number, index = 0): number => {
      view.update(timeSec);
      rings.getMatrixAt(index, matrix);
      return new THREE.Vector3().setFromMatrixScale(matrix).x;
    };
    const samples: number[] = [];
    for (let step = 0; step <= 10; step += 1) samples.push(sizeAt((step / 10) * WATER.rippleCycleS, 0));
    expect(Math.max(...samples)).toBeGreaterThan(WATER.rippleMaxFt * 0.8);
    expect(Math.min(...samples)).toBeLessThan(WATER.rippleMaxFt * 0.25);
  });
});

describe("the herd", () => {
  test("is one set of instanced parts per species, on the pen floor", () => {
    const view = createLivestock(HECTARE);
    expect(view.animals).toBe(HECTARE.animals.length);
    const species = new Set(HECTARE.animals.map((animal) => animal.species));
    for (const kind of species) {
      const parts = view.group.children.filter((child) => child.name.startsWith(`livestock:${kind}:`));
      expect(parts.length, kind).toBeGreaterThan(3);
      for (const part of parts) expect(part).toBeInstanceOf(THREE.InstancedMesh);
    }
    // Every instance is at its animal's floor height or above it.
    const floors = new Map(HECTARE.animals.map((animal, index) => [index, animal.floorFt]));
    const first = view.group.children[0] as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < first.count; index += 1) {
      first.getMatrixAt(index, matrix);
      const y = new THREE.Vector3().setFromMatrixPosition(matrix).y;
      expect(y).toBeGreaterThanOrEqual((floors.get(index) ?? 0) - 1e-6);
    }
  });

  test("puts the cattle in the raised shed, above the ground", () => {
    const shed = HECTARE.zones.find((zone) => zone.id === "cattle_shed")!;
    const cattle = HECTARE.animals.filter((animal) => animal.species === "bullock" || animal.species === "buffalo");
    expect(cattle.length).toBe(5);
    for (const animal of cattle) expect(animal.floorFt).toBeCloseTo(shed.building!.floorFt, 6);
  });
});
