import * as THREE from "three";

import type { HectareWorld } from "../world";

/*  The ground: the parcel's soil, the gravel paths, the pond's bank and the two
    rows of belt trees round the edge.

    Everything that repeats is one InstancedMesh, so the whole ground is a handful
    of draw calls whatever the tree count. The water is not here — it moves, and
    lives in water.ts. */

export interface GroundView {
  group: THREE.Group;
  dispose(): void;
}

export function createGround(world: HectareWorld): GroundView {
  const group = new THREE.Group();
  group.name = "ground";

  const soil = new THREE.Mesh(
    new THREE.PlaneGeometry(world.parcel.widthFt, world.parcel.depthFt),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(world.palette["ground"] ?? "#6f7a4a"), roughness: 1 }),
  );
  soil.rotation.x = -Math.PI / 2;
  soil.position.set(world.parcel.widthFt / 2, 0, world.parcel.depthFt / 2);
  soil.receiveShadow = true;
  soil.name = "ground:soil";
  group.add(soil);

  // The paths, one instanced slab each.
  const slab = new THREE.PlaneGeometry(1, 1);
  slab.rotateX(-Math.PI / 2);
  const pathMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(world.palette["path"] ?? "#a8926a"),
    roughness: 0.95,
  });
  const paths = new THREE.InstancedMesh(slab, pathMaterial, world.paths.length);
  paths.name = "ground:paths";
  paths.receiveShadow = true;
  const matrix = new THREE.Matrix4();
  world.paths.forEach((path, index) => {
    matrix.compose(
      new THREE.Vector3(path.box.x + path.box.widthFt / 2, 0.03, path.box.y + path.box.depthFt / 2),
      new THREE.Quaternion(),
      new THREE.Vector3(path.box.widthFt, 1, path.box.depthFt),
    );
    paths.setMatrixAt(index, matrix);
  });
  paths.instanceMatrix.needsUpdate = true;
  group.add(paths);

  // The pond's bank, a plate under the water.
  const pond = world.zones.find((zone) => zone.kind === "water");
  if (pond) {
    const bank = new THREE.Mesh(
      new THREE.PlaneGeometry(pond.box.widthFt + 2.4, pond.box.depthFt + 2.4),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(world.palette["bank"] ?? "#8c7a55"), roughness: 1 }),
    );
    bank.rotation.x = -Math.PI / 2;
    bank.position.set(pond.box.x + pond.box.widthFt / 2, 0.02, pond.box.y + pond.box.depthFt / 2);
    bank.receiveShadow = true;
    bank.name = "ground:pond-bank";
    group.add(bank);
  }

  /* -------------------------------- belt -------------------------------- */
  const trunkGeometry = new THREE.CylinderGeometry(0.55, 0.8, 1, 6);
  trunkGeometry.translate(0, 0.5, 0);
  const canopyGeometry = new THREE.IcosahedronGeometry(1, 0);
  const trunks = new THREE.InstancedMesh(
    trunkGeometry,
    new THREE.MeshStandardMaterial({ color: new THREE.Color(world.palette["belt_trunk"] ?? "#5c4231"), roughness: 1 }),
    world.belt.length,
  );
  const canopies = new THREE.InstancedMesh(
    canopyGeometry,
    new THREE.MeshStandardMaterial({ color: new THREE.Color(world.palette["belt_leaf"] ?? "#5f7a45"), roughness: 1 }),
    world.belt.length,
  );
  trunks.name = "belt:trunks";
  canopies.name = "belt:canopies";
  trunks.receiveShadow = true;
  canopies.castShadow = true;

  const colour = new THREE.Color();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  world.belt.forEach((tree, index) => {
    const trunkHeight = tree.heightFt - tree.canopyFt * 0.45;
    position.set(tree.x, 0, tree.y);
    scale.set(1, Math.max(trunkHeight, 1), 1);
    matrix.compose(position, quaternion, scale);
    trunks.setMatrixAt(index, matrix);

    position.set(tree.x, trunkHeight + tree.canopyFt * 0.42, tree.y);
    scale.set(tree.canopyFt * 0.5, tree.canopyFt * 0.45, tree.canopyFt * 0.5);
    matrix.compose(position, quaternion, scale);
    canopies.setMatrixAt(index, matrix);
    canopies.setColorAt(index, colour.set(tree.leafColour));
  });
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
  group.add(trunks, canopies);

  return {
    group,
    dispose() {
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const entry = object.material;
        if (Array.isArray(entry)) entry.forEach((one) => one.dispose());
        else entry.dispose();
      });
      group.clear();
    },
  };
}
