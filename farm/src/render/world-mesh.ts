import * as THREE from "three";

import { orchardTrees } from "../sim/orchard";
import type { World, Zone } from "../sim/types";

/*  Ground, zone blocks and the two building shells.
    Everything is built from canon feet; +x east, canon y -> three z. */

export interface WorldMesh {
  group: THREE.Group;
  setMapOutlinesVisible(visible: boolean): void;
  dispose(): void;
}

const cache = new Map<string, THREE.MeshStandardMaterial | THREE.LineBasicMaterial>();

function standard(colour: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  const key = `s:${colour}:${JSON.stringify(extra)}`;
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshStandardMaterial;
  const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(colour), roughness: 1, metalness: 0, ...extra });
  cache.set(key, material);
  return material;
}

function boxMesh(widthFt: number, heightFt: number, depthFt: number, material: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(widthFt, heightFt, depthFt), material);
}

/** A slab for a zone: centred on its box, sitting on the ground. */
function slab(zone: Zone, colour: string, heightFt: number): THREE.Mesh {
  const mesh = boxMesh(zone.box.widthFt, heightFt, zone.box.depthFt, standard(colour));
  mesh.position.set(zone.box.x + zone.box.widthFt / 2, heightFt / 2, zone.box.y + zone.box.depthFt / 2);
  mesh.name = `zone:${zone.key}`;
  return mesh;
}

function farmhouse(world: World, zone: Zone, group: THREE.Group): void {
  const height = zone.heightFt;
  const walls = slab(zone, zone.palette[1] ?? "#dcb98a", height);
  group.add(walls);

  const roof = boxMesh(zone.box.widthFt + 1.6, 0.5, zone.box.depthFt + 1.6, standard(zone.palette[0] ?? "#a34d2f"));
  roof.position.set(zone.box.x + zone.box.widthFt / 2, height + 0.25, zone.box.y + zone.box.depthFt / 2);
  group.add(roof);

  // The front door, on the south face, where sim_overrides says it is.
  const door = world.doors["farmhouse"];
  if (door) {
    const leaf = boxMesh(door.gapFt, Math.min(6.4, height - 1), 0.25, standard(zone.palette[2] ?? "#5c4033"));
    leaf.position.set(door.point.x, Math.min(6.4, height - 1) / 2, door.point.y + 0.2);
    leaf.name = "farmhouse:door";
    group.add(leaf);
  }
}

function goshala(world: World, zone: Zone, group: THREE.Group): void {
  const height = zone.heightFt;
  const post = 0.4;
  const along = 5;
  const door = world.doors["goshala"];
  const gap = door?.gapFt ?? 8;
  const gapStart = (door?.point.x ?? 0) - gap / 2;
  const gapEnd = (door?.point.x ?? 0) + gap / 2;

  // Posts along the south face, skipping the door gap.
  for (let i = 0; i <= along * 3; i += 1) {
    const x = zone.box.x + (i / (along * 3)) * zone.box.widthFt;
    if (x > gapStart && x < gapEnd) continue;
    const mesh = boxMesh(post, height, post, standard("#7a5a3a"));
    mesh.position.set(x, height / 2, zone.box.y + zone.box.depthFt);
    group.add(mesh);
  }
  // Corner posts at the north face.
  for (const x of [zone.box.x, zone.box.x + zone.box.widthFt]) {
    const mesh = boxMesh(post, height, post, standard("#7a5a3a"));
    mesh.position.set(x, height / 2, zone.box.y);
    group.add(mesh);
  }
  const roof = boxMesh(zone.box.widthFt + 1.2, 0.4, zone.box.depthFt + 1.2, standard("#8d7448"));
  roof.position.set(zone.box.x + zone.box.widthFt / 2, height + 0.2, zone.box.y + zone.box.depthFt / 2);
  group.add(roof);

  // The hay bed inside the shed.
  const hay = boxMesh(zone.box.widthFt * 0.55, 0.3, zone.box.depthFt * 0.6, standard("#c8a86a"));
  hay.position.set(zone.box.x + zone.box.widthFt * 0.5, 0.15, zone.box.y + zone.box.depthFt * 0.45);
  group.add(hay);
}

function orchard(world: World, zone: Zone, group: THREE.Group): void {
  group.add(slab(zone, "#5a4632", zone.heightFt));
  const trees = orchardTrees(world);
  const canopyColour = new THREE.Color(world.palette["leaf"] ?? "#7c9a5d");

  /*  Two instanced draws for the whole orchard — one for the trunks, one for
      the canopies — whatever the tree count. Positions and sizes come from
      src/sim/orchard.ts; the tint variation is per instance, from the seed. */
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.24, 0.36, 1, 6),
    standard("#6b4a30"),
    trees.length,
  );
  trunks.name = "orchard:trunks";
  const canopies = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
    trees.length,
  );
  canopies.name = "orchard:canopies";

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const colour = new THREE.Color();

  trees.forEach((tree, index) => {
    quaternion.setFromAxisAngle(up, tree.rotationRad);
    position.set(tree.x, zone.heightFt + tree.heightFt / 2, tree.y);
    scale.set(1, tree.heightFt, 1);
    matrix.compose(position, quaternion, scale);
    trunks.setMatrixAt(index, matrix);

    quaternion.setFromAxisAngle(up, tree.rotationRad * 1.7);
    position.set(tree.x, zone.heightFt + tree.heightFt + tree.canopyFt * 0.55, tree.y);
    scale.set(tree.canopyFt, tree.canopyFt * 0.82, tree.canopyFt);
    matrix.compose(position, quaternion, scale);
    canopies.setMatrixAt(index, matrix);
    // 0 = the darker leaf, 1 = the lighter; the palette leaf is the midpoint.
    canopies.setColorAt(index, colour.copy(canopyColour).multiplyScalar(0.82 + tree.tintMix * 0.36));
  });

  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
  group.add(trunks, canopies);
}

function compost(zone: Zone, group: THREE.Group): void {
  const half = zone.box.widthFt / 2;
  for (const offset of [-half * 0.45, half * 0.45]) {
    const pit = boxMesh(zone.box.widthFt * 0.42, zone.heightFt, zone.box.depthFt * 0.8, standard("#4a3a24"));
    pit.position.set(zone.box.x + half + offset, zone.heightFt / 2, zone.box.y + zone.box.depthFt / 2);
    group.add(pit);
  }
  for (const [fx, fy] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as [number, number][]) {
    const post = boxMesh(0.3, 3.4, 0.3, standard("#6b5a3a"));
    post.position.set(zone.box.x + fx * zone.box.widthFt, 1.7, zone.box.y + fy * zone.box.depthFt);
    group.add(post);
  }
}

export function createWorldMesh(world: World): WorldMesh {
  const group = new THREE.Group();
  group.name = "world";

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(world.parcel.widthFt, world.parcel.depthFt),
    standard(world.tints["soil"] ?? "#6e4a2f"),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(world.parcel.widthFt / 2, 0, world.parcel.depthFt / 2);
  ground.name = "ground";
  group.add(ground);

  for (const zone of world.zones) {
    if (zone.circle) continue; // the pond builds its own water and rim
    if (zone.look === "solid") farmhouse(world, zone, group);
    else if (zone.look === "open_shed") goshala(world, zone, group);
    else if (zone.look === "canopy") orchard(world, zone, group);
    else if (zone.look === "pits") compost(zone, group);
    else if (zone.look === "marker") {
      const post = boxMesh(0.6, 4.2, 0.6, standard("#8a6a44"));
      post.position.set(zone.box.x + zone.box.widthFt / 2, 2.1, zone.box.y + zone.box.depthFt / 2);
      post.name = "zone:gate";
      group.add(post);
    } else if (zone.look === "beds") group.add(slab(zone, world.beds.soilTint, zone.heightFt));
    else group.add(slab(zone, "#3d5a3a", zone.heightFt));
  }

  // Map outlines: one rectangle per zone, drawn on the ground.
  const outlines = new THREE.Group();
  outlines.name = "outlines";
  const lineMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color(world.palette["cream"] ?? "#f1ead9") });
  for (const zone of world.zones) {
    const points = zone.circle
      ? Array.from({ length: 49 }, (_, i) => {
          const angle = (i / 48) * Math.PI * 2;
          return new THREE.Vector3(
            zone.circle!.cx + Math.cos(angle) * zone.circle!.radiusFt,
            0.12,
            zone.circle!.cy + Math.sin(angle) * zone.circle!.radiusFt,
          );
        })
      : [
          new THREE.Vector3(zone.box.x, 0.12, zone.box.y),
          new THREE.Vector3(zone.box.x + zone.box.widthFt, 0.12, zone.box.y),
          new THREE.Vector3(zone.box.x + zone.box.widthFt, 0.12, zone.box.y + zone.box.depthFt),
          new THREE.Vector3(zone.box.x, 0.12, zone.box.y + zone.box.depthFt),
          new THREE.Vector3(zone.box.x, 0.12, zone.box.y),
        ];
    outlines.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMaterial));
  }
  outlines.visible = false;
  group.add(outlines);

  return {
    group,
    setMapOutlinesVisible(visible: boolean) {
      outlines.visible = visible;
    },
    dispose() {
      group.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
          const material = object.material;
          if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
          else material.dispose();
        }
      });
      cache.clear();
    },
  };
}
