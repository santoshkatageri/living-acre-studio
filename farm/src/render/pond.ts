import * as THREE from "three";

import { buildLilyPads, buildPondStones, pondCircle } from "../sim/pond";
import type { World } from "../sim/types";

/*  Water, the seeded stone rim and the lily pads. Decorative: collision is
    the canon circle, which never moves for a stone. */

export interface PondView {
  group: THREE.Group;
  dispose(): void;
}

export function createPond(world: World): PondView {
  const group = new THREE.Group();
  group.name = "pond";
  const circle = pondCircle(world);

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(circle.radiusFt, 64),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(world.tints["water"] ?? "#3f6b63"),
      roughness: 0.25,
      metalness: 0.1,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(circle.cx, 0.08, circle.cy);
  water.name = "pond:water";
  group.add(water);

  const stones = buildPondStones(world, world.pond);
  const stoneGeometry = new THREE.DodecahedronGeometry(0.5, 0);
  const stoneMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(world.tints["stone"] ?? "#7a7367"),
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });
  const rim = new THREE.InstancedMesh(stoneGeometry, stoneMaterial, stones.length);
  rim.name = "pond:rim";
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  stones.forEach((stone, index) => {
    position.set(stone.x, 0.22, stone.y);
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), stone.rotationRad);
    scale.set(stone.radiusFt, stone.radiusFt * 0.75, stone.radiusFt);
    matrix.compose(position, quaternion, scale);
    rim.setMatrixAt(index, matrix);
  });
  rim.instanceMatrix.needsUpdate = true;
  group.add(rim);

  const pads = buildLilyPads(world, world.pond);
  const padGeometry = new THREE.CircleGeometry(1, 9);
  const padMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(world.palette["leaf"] ?? "#7c9a5d"),
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const padMesh = new THREE.InstancedMesh(padGeometry, padMaterial, Math.max(pads.length, 1));
  padMesh.name = "pond:pads";
  pads.forEach((pad, index) => {
    position.set(pad.x, 0.12, pad.y);
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pad.rotationRad);
    scale.set(pad.radiusFt, pad.radiusFt, 1);
    matrix.compose(position, quaternion, scale);
    padMesh.setMatrixAt(index, matrix);
  });
  padMesh.count = pads.length;
  padMesh.instanceMatrix.needsUpdate = true;
  group.add(padMesh);

  return {
    group,
    dispose() {
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const material = object.material;
          if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
          else material.dispose();
        }
      });
    },
  };
}
