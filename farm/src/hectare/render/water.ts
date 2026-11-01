import * as THREE from "three";

import { createRng } from "../../sim/rng";
import type { Vec2 } from "../../sim/types";
import type { HectareBox, HectareWorld } from "../world";

/*  Moving water: the irrigation channels and the fish pond.

    The channels used to be flat blue strips. Now each has a rippling surface
    texture that drifts along its length — toward the pond, which is where the
    water would go — and rings break on the surface, expanding and dying.

    The surface is one plane per channel with its own texture offset, so the drift
    is per-channel rather than one pattern sliding over the whole farm. The rings
    are one InstancedMesh for every ripple on the farm: a ring's whole life is a
    scale, and a scale is one matrix, so the animation costs one buffer upload a
    frame and one draw call.

    Textures need a 2D canvas, which Node has not got; `makeTexture` lets the
    tests build the water without one. */

export interface WaterView {
  group: THREE.Group;
  readonly surfaces: number;
  readonly rippleCount: number;
  update(timeSec: number): void;
  dispose(): void;
}

export interface WaterOptions {
  makeTexture?: () => THREE.Texture;
}

/** Which way the water runs in a channel, and which axis it runs along. */
export interface Flow {
  axis: "x" | "z";
  sign: 1 | -1;
}

const RIPPLES_X = 128;
const RIPPLES_Y = 128;

function rippleTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = RIPPLES_X;
  canvas.height = RIPPLES_Y;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas context unavailable for water");
  context.clearRect(0, 0, RIPPLES_X, RIPPLES_Y);
  context.strokeStyle = "rgba(255,255,255,0.5)";
  context.lineWidth = 3;
  const rng = createRng(7);
  for (let index = 0; index < 9; index += 1) {
    const x = rng.range(0, RIPPLES_X);
    const y = rng.range(0, RIPPLES_Y);
    const radius = rng.range(9, 26);
    context.beginPath();
    context.arc(x, y, radius, Math.PI * (0.15 + rng.next() * 0.4), Math.PI * (1.05 + rng.next() * 0.5));
    context.stroke();
  }
  context.strokeStyle = "rgba(255,255,255,0.28)";
  context.lineWidth = 2;
  for (let index = 0; index < 4; index += 1) {
    const y = (index + 0.5) * (RIPPLES_Y / 4);
    context.beginPath();
    context.moveTo(0, y);
    context.bezierCurveTo(RIPPLES_X * 0.3, y - 6, RIPPLES_X * 0.7, y + 6, RIPPLES_X, y);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * Where a channel's water runs: toward the pond, along whichever axis it lies
 * on. With no pond in the layout it runs along its own long side.
 */
export function flowTowardPond(box: HectareBox, pond: Vec2 | null): Flow {
  const centre = { x: box.x + box.widthFt / 2, y: box.y + box.depthFt / 2 };
  const alongX = box.widthFt >= box.depthFt;
  if (!pond) return { axis: alongX ? "x" : "z", sign: 1 };
  const dx = pond.x - centre.x;
  const dz = pond.y - centre.y;
  if (Math.abs(dx) >= Math.abs(dz)) return { axis: "x", sign: dx >= 0 ? 1 : -1 };
  return { axis: "z", sign: dz >= 0 ? 1 : -1 };
}

export function createWater(world: HectareWorld, options: WaterOptions = {}): WaterView {
  const group = new THREE.Group();
  group.name = "water";
  const style = world.waterStyle;
  const makeTexture = options.makeTexture ?? rippleTexture;
  const pondZone = world.zones.find((zone) => zone.kind === "water") ?? null;
  const pond = pondZone
    ? { x: pondZone.box.x + pondZone.box.widthFt / 2, y: pondZone.box.y + pondZone.box.depthFt / 2 }
    : null;

  const surfaces: { texture: THREE.Texture; flow: Flow }[] = [];

  const surface = (box: HectareBox, y: number, flow: Flow, colour: string): THREE.Mesh => {
    const texture = makeTexture();
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(
      Math.max(box.widthFt / style.textureTileFt, 0.5),
      Math.max(box.depthFt / style.textureTileFt, 0.5),
    );
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colour),
      map: texture,
      transparent: true,
      opacity: 0.95,
      roughness: style.surfaceRoughness,
      metalness: 0,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(box.widthFt, box.depthFt), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(box.x + box.widthFt / 2, y, box.y + box.depthFt / 2);
    mesh.receiveShadow = true;
    group.add(mesh);
    surfaces.push({ texture, flow });
    return mesh;
  };

  for (const channel of world.channels) {
    const mesh = surface(channel.box, 0.07, flowTowardPond(channel.box, pond), world.palette["water"] ?? "#3f7d8c");
    mesh.name = `water:${channel.id}`;
  }
  if (pondZone) {
    const mesh = surface(pondZone.box, 0.06, { axis: "x", sign: 1 }, world.palette["water"] ?? "#3f7d8c");
    mesh.name = "water:pond";
  }

  /* ------------------------------- the rings ------------------------------ */
  const spots: { x: number; y: number; flow: Flow }[] = [];
  for (const channel of world.channels) {
    const flow = flowTowardPond(channel.box, pond);
    const length = Math.max(channel.box.widthFt, channel.box.depthFt);
    const steps = Math.max(2, Math.round(length / 12));
    for (let step = 0; step < steps; step += 1) {
      const t = (step + 0.5) / steps;
      spots.push({
        x: channel.box.x + (flow.axis === "x" ? t * channel.box.widthFt : channel.box.widthFt * 0.5),
        y: channel.box.y + (flow.axis === "z" ? t * channel.box.depthFt : channel.box.depthFt * 0.5),
        flow,
      });
    }
  }
  if (pondZone) {
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        spots.push({
          x: pondZone.box.x + ((column + 0.5) / 3) * pondZone.box.widthFt,
          y: pondZone.box.y + ((row + 0.5) / 3) * pondZone.box.depthFt,
          flow: { axis: "x", sign: 1 },
        });
      }
    }
  }

  const want = Math.max(1, Math.min(style.rippleCount, spots.length));
  const rng = createRng(11);
  const ripples = Array.from({ length: want }, (_, index) => {
    const spot = spots[Math.floor((index / want) * spots.length)] as { x: number; y: number; flow: Flow };
    return { ...spot, phase: (index / want + rng.range(0, 0.05)) % 1 };
  });

  const ringGeometry = new THREE.RingGeometry(0.34, 0.5, 14);
  ringGeometry.rotateX(-Math.PI / 2);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(style.rippleColour),
    transparent: true,
    opacity: Math.min(Math.max(style.rippleGlow, 0.05), 1),
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const rings = new THREE.InstancedMesh(ringGeometry, ringMaterial, ripples.length);
  rings.name = "water:ripples";
  rings.frustumCulled = false;
  group.add(rings);

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  const update = (timeSec: number): void => {
    const travelled = (style.flowFtPerS * timeSec) / Math.max(style.textureTileFt, 0.001);
    for (const entry of surfaces) {
      if (entry.flow.axis === "x") entry.texture.offset.x = entry.flow.sign * travelled;
      else entry.texture.offset.y = entry.flow.sign * travelled;
    }

    ripples.forEach((ripple, index) => {
      const life = (timeSec / Math.max(style.rippleCycleS, 0.01) + ripple.phase) % 1;
      // Grows from nothing and back to nothing: no ring pops.
      const size = Math.sin(life * Math.PI) * style.rippleMaxFt;
      const drift = style.flowFtPerS * life * style.rippleCycleS * 0.4;
      position.set(
        ripple.x + (ripple.flow.axis === "x" ? ripple.flow.sign * drift : 0),
        0.09,
        ripple.y + (ripple.flow.axis === "z" ? ripple.flow.sign * drift : 0),
      );
      scale.setScalar(Math.max(size, 0.0001));
      matrix.compose(position, quaternion, scale);
      rings.setMatrixAt(index, matrix);
    });
    rings.instanceMatrix.needsUpdate = true;
  };

  update(0);

  return {
    group,
    surfaces: surfaces.length,
    rippleCount: ripples.length,
    update,
    dispose() {
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const material = object.material as THREE.MeshStandardMaterial;
        material.map?.dispose();
        material.dispose();
      });
      group.clear();
    },
  };
}
