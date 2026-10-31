import * as THREE from "three";

import { bufferBelt } from "../sim/belt";
import type { PathNetwork } from "../sim/paths";
import type { World } from "../sim/types";

/*  The tree belt, drawn straight from src/sim/belt.ts.

    Two instanced draws per species — trunks and canopies — so 148 trees cost 4
    draw calls. Decorative only: no collision is added for them, because the
    parcel boundary and the paths-only rule already keep the farmer in. */

export interface BeltView {
  group: THREE.Group;
  /** Trees kept, after the drops. */
  readonly count: number;
  dispose(): void;
}

export function createBelt(world: World, network: PathNetwork): BeltView {
  const group = new THREE.Group();
  group.name = "belt";

  const belt = bufferBelt(world, network);
  const canopyColour = new THREE.Color(world.palette["leaf"] ?? "#7c9a5d");
  const barkColour = new THREE.Color("#5c4231");

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const colour = new THREE.Color();

  for (const species of world.buffer.species) {
    const trees = belt.trees.filter((tree) => tree.species === species.id);
    if (trees.length === 0) continue;

    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.34, 0.5, 1, 6),
      new THREE.MeshStandardMaterial({ color: barkColour, roughness: 1 }),
      trees.length,
    );
    trunks.name = `belt:trunks:${species.id}`;

    const canopies = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
      trees.length,
    );
    canopies.name = `belt:canopies:${species.id}`;

    trees.forEach((tree, index) => {
      // Trunk: the cylinder is unit height, so the instance carries the height.
      const trunkHeight = tree.heightFt * 0.62;
      quaternion.setFromAxisAngle(up, tree.rotationRad);
      position.set(tree.x, trunkHeight / 2, tree.y);
      scale.set(1, trunkHeight, 1);
      matrix.compose(position, quaternion, scale);
      trunks.setMatrixAt(index, matrix);

      // Canopy: squashed sphere sitting on the trunk.
      const canopyHeight = tree.canopyFt * 0.85;
      quaternion.setFromAxisAngle(up, tree.rotationRad * 1.6);
      position.set(tree.x, trunkHeight + canopyHeight * 0.42, tree.y);
      scale.set(tree.canopyFt / 2, canopyHeight / 2, tree.canopyFt / 2);
      matrix.compose(position, quaternion, scale);
      canopies.setMatrixAt(index, matrix);
      canopies.setColorAt(index, colour.copy(canopyColour).multiplyScalar(0.78 + tree.tintMix * 0.4));
    });

    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
    group.add(trunks, canopies);
  }

  return {
    group,
    count: belt.count,
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
