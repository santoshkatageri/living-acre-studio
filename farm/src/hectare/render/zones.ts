import * as THREE from "three";

import { createRng } from "../../sim/rng";
import type { HectareWorld } from "../world";

/*  The spaces themselves: a coloured plate for each, the buildings, the crop rows
    and the orchard.

    Two rules from the brief are load-bearing here.

    The cattle shed is a raised frame. A solid roof at 6.5 ft cut the third-person
    camera off whenever the farmer walked in; a solid roof at any height also hides
    the cattle from the farm view. So the shed is four posts, a ring beam at 13 ft,
    a lattice of beams over it, and open sides — you can see the herd from above
    and walk in behind the farmer.

    The orchard is five layers, not one height: upper canopy well above the rest,
    then the mid trees, then the shrubs, then beds and patches at the ground. */

export interface ZonesView {
  group: THREE.Group;
  dispose(): void;
}

const BEAM = 0.35;

export function createZones(world: HectareWorld): ZonesView {
  const group = new THREE.Group();
  group.name = "zones";

  /* ------------------------------- plates ------------------------------- */
  const plateGeometry = new THREE.PlaneGeometry(1, 1);
  plateGeometry.rotateX(-Math.PI / 2);
  const plates = new THREE.InstancedMesh(
    plateGeometry,
    new THREE.MeshStandardMaterial({ vertexColors: false, color: 0xffffff, roughness: 1 }),
    world.zones.length,
  );
  plates.name = "zones:plates";
  plates.receiveShadow = true;

  const matrix = new THREE.Matrix4();
  const colour = new THREE.Color();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  world.zones.forEach((zone, index) => {
    position.set(zone.box.x + zone.box.widthFt / 2, 0.04, zone.box.y + zone.box.depthFt / 2);
    scale.set(zone.box.widthFt, 1, zone.box.depthFt);
    matrix.compose(position, quaternion, scale);
    plates.setMatrixAt(index, matrix);
    plates.setColorAt(index, colour.set(zone.colour));
  });
  plates.instanceMatrix.needsUpdate = true;
  if (plates.instanceColor) plates.instanceColor.needsUpdate = true;
  group.add(plates);

  /* ------------------------------ buildings ----------------------------- */
  for (const zone of world.zones) {
    if (!zone.building) continue;
    const building = createBuilding(world, zone.id);
    group.add(building);
  }

  /* -------------------------------- crops ------------------------------- */
  // Crop plots: rows of plants, one instanced mesh per plot colour.
  const cropZones = world.zones.filter((zone) => zone.kind === "crop_plot" || zone.kind === "vegetables");
  for (const zone of cropZones) {
    group.add(createCropRows(world, zone.id));
  }

  /* ------------------------------- orchard ------------------------------ */
  for (const zone of world.zones.filter((entry) => entry.kind === "orchard")) {
    group.add(createOrchard(world, zone.id));
  }

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

/** A zone's box by id. */
function boxOf(world: HectareWorld, id: string): { x: number; y: number; widthFt: number; depthFt: number; heightFt: number; floorFt: number } {
  const zone = world.zones.find((entry) => entry.id === id);
  if (!zone) throw new Error(`no zone "${id}"`);
  return { ...zone.box, heightFt: zone.heightFt, floorFt: zone.building?.floorFt ?? 0 };
}

function boxMesh(
  size: { widthFt: number; heightFt: number; depthFt: number },
  material: THREE.Material,
  name: string,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.widthFt, size.heightFt, size.depthFt), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = name;
  return mesh;
}

function createBuilding(world: HectareWorld, id: string): THREE.Group {
  const box = boxOf(world, id);
  const building = world.zones.find((zone) => zone.id === id)?.building;
  const group = new THREE.Group();
  group.name = `building:${id}`;
  if (!building) return group;

  const floor = new THREE.MeshStandardMaterial({ color: new THREE.Color("#8b7a58"), roughness: 1 });
  const timber = new THREE.MeshStandardMaterial({ color: new THREE.Color("#6b4f36"), roughness: 0.95 });
  const plaster = new THREE.MeshStandardMaterial({ color: new THREE.Color(zoneColourOf(world, id)), roughness: 0.95 });

  // The floor, raised by the data's floor height.
  const slab = boxMesh({ widthFt: box.widthFt, heightFt: building.floorFt, depthFt: box.depthFt }, floor, `floor:${id}`);
  slab.position.set(box.x + box.widthFt / 2, building.floorFt / 2, box.y + box.depthFt / 2);
  group.add(slab);

  const wallMaterial = building.open ? timber : plaster;
  const wallHeight = building.heightFt - building.floorFt;

  if (building.open) {
    // Four posts, a ring beam, and a lattice roof: open to the eye from every side.
    for (const [dx, dz] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as [number, number][]) {
      const post = boxMesh(
        { widthFt: BEAM, heightFt: wallHeight, depthFt: BEAM },
        timber,
        `post:${id}:${dx}${dz}`,
      );
      post.position.set(
        box.x + box.widthFt * dx + (dx === 0 ? BEAM / 2 : -BEAM / 2),
        building.floorFt + wallHeight / 2,
        box.y + box.depthFt * dz + (dz === 0 ? BEAM / 2 : -BEAM / 2),
      );
      group.add(post);
    }
    const beamY = building.floorFt + wallHeight - BEAM;
    for (const along of [0, 1]) {
      const beamX = boxMesh({ widthFt: box.widthFt, heightFt: BEAM, depthFt: BEAM }, timber, `beamX:${id}:${along}`);
      beamX.position.set(box.x + box.widthFt / 2, beamY, box.y + (along === 1 ? box.depthFt - BEAM / 2 : BEAM / 2));
      group.add(beamX);
      const beamZ = boxMesh({ widthFt: BEAM, heightFt: BEAM, depthFt: box.depthFt }, timber, `beamZ:${id}:${along}`);
      beamZ.position.set(box.x + (along === 1 ? box.widthFt - BEAM / 2 : BEAM / 2), beamY, box.y + box.depthFt / 2);
      group.add(beamZ);
    }
    // The roof lattice: five members across, so light and the camera still get in.
    const members = 5;
    for (let index = 0; index < members; index += 1) {
      const t = (index + 0.5) / members;
      const rafter = boxMesh({ widthFt: BEAM, heightFt: BEAM, depthFt: box.depthFt }, timber, `rafter:${id}:${index}`);
      rafter.position.set(box.x + box.widthFt * t, beamY - BEAM * 0.5, box.y + box.depthFt / 2);
      group.add(rafter);
    }
  } else {
    // A closed building: four walls and a roof plate.
    const walls: [number, number, number, number, number, number][] = [
      [box.widthFt, wallHeight, BEAM, box.x + box.widthFt / 2, box.y + BEAM / 2, 0],
      [box.widthFt, wallHeight, BEAM, box.x + box.widthFt / 2, box.y + box.depthFt - BEAM / 2, 0],
      [BEAM, wallHeight, box.depthFt, box.x + BEAM / 2, box.y + box.depthFt / 2, 0],
      [BEAM, wallHeight, box.depthFt, box.x + box.widthFt - BEAM / 2, box.y + box.depthFt / 2, 0],
    ];
    walls.forEach(([widthFt, heightFt, depthFt, x, z], index) => {
      const wall = boxMesh({ widthFt, heightFt, depthFt }, wallMaterial, `wall:${id}:${index}`);
      wall.position.set(x, building.floorFt + heightFt / 2, z);
      group.add(wall);
    });
    const roof = boxMesh(
      { widthFt: box.widthFt + 0.8, heightFt: 0.3, depthFt: box.depthFt + 0.8 },
      new THREE.MeshStandardMaterial({ color: new THREE.Color("#6d5a44"), roughness: 0.9 }),
      `roof:${id}`,
    );
    roof.position.set(box.x + box.widthFt / 2, building.floorFt + wallHeight + 0.15, box.y + box.depthFt / 2);
    group.add(roof);
  }

  return group;
}

function zoneColourOf(world: HectareWorld, id: string): string {
  const zone = world.zones.find((entry) => entry.id === id);
  return zone?.colour ?? "#9a8161";
}

/** Rows of plants, thinned by a seeded jitter so a plot is not a grid of clones. */
function createCropRows(world: HectareWorld, id: string): THREE.Group {
  const zone = world.zones.find((entry) => entry.id === id);
  const group = new THREE.Group();
  group.name = `crops:${id}`;
  if (!zone) return group;

  const rng = createRng(id.split("").reduce((total, letter) => total + letter.charCodeAt(0), 7));
  const spacing = 4.2;
  const columns = Math.max(Math.floor(zone.box.widthFt / spacing) - 1, 1);
  const rows = Math.max(Math.floor(zone.box.depthFt / spacing) - 1, 1);
  const count = columns * rows;

  const crop = zone.crop ?? zone.kind;
  const plantColour =
    crop === "wheat" ? "#c9b26a" : crop === "jowar" ? "#9aa758" : crop === "sunflower" ? "#d9a53c" : crop === "groundnut" ? "#8f8f4e" : "#7c9a5d";

  const geometry = new THREE.ConeGeometry(0.75, 2.1, 5);
  geometry.translate(0, 1.05, 0);
  const mesh = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: new THREE.Color(plantColour), roughness: 1 }),
    count,
  );
  mesh.name = `crops:${id}:plants`;
  mesh.castShadow = true;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  let index = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = zone.box.x + spacing * (column + 0.9) + rng.range(-0.5, 0.5);
      const y = zone.box.y + spacing * (row + 0.9) + rng.range(-0.5, 0.5);
      const size = rng.range(0.75, 1.25);
      position.set(x, 0.3, y);
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, Math.PI));
      scale.set(size, size * rng.range(0.8, 1.2), size);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      index += 1;
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
  return group;
}

/**
 * The orchard's five layers, at five heights: the upper canopy tall over the
 * rest, then the mid trees, then shrubs, then a bed strip and a patch strip at
 * the ground.
 */
function createOrchard(world: HectareWorld, id: string): THREE.Group {
  const zone = world.zones.find((entry) => entry.id === id);
  const group = new THREE.Group();
  group.name = `orchard:${id}`;
  if (!zone) return group;

  const layers = world.orchard.layers;
  const rng = createRng(world.orchard.seed);
  const trunkGeom = new THREE.CylinderGeometry(0.5, 0.7, 1, 6);
  trunkGeom.translate(0, 0.5, 0);
  const crownGeom = new THREE.IcosahedronGeometry(1, 0);

  layers.forEach((layer, layerIndex) => {
    const target = layer.targetCount ?? 8;
    const nominalHeight = (layer.heightFt as unknown as [number, number])[0];
    const heightFt = layer.visualHeightCapFt ?? nominalHeight;
    // Spread the taller layers over the whole plot, the shrubs in their own band.
    const bandTop = 1 - layerIndex / layers.length;
    const bandBottom = 1 - (layerIndex + 1) / layers.length;

    const trunks = new THREE.InstancedMesh(
      trunkGeom,
      new THREE.MeshStandardMaterial({ color: new THREE.Color("#5c4231"), roughness: 1 }),
      target,
    );
    const crowns = new THREE.InstancedMesh(
      crownGeom,
      new THREE.MeshStandardMaterial({ color: new THREE.Color(layerIndex === 0 ? "#3f5a32" : layerIndex === 1 ? "#4f6b3a" : "#6b8a48"), roughness: 1 }),
      target,
    );
    trunks.name = `orchard:${id}:${layer.id}:trunks`;
    crowns.name = `orchard:${id}:${layer.id}:crowns`;
    crowns.castShadow = true;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const inset = 8;
    for (let index = 0; index < target; index += 1) {
      const x = zone.box.x + inset + rng.range(0, zone.box.widthFt - inset * 2);
      const y = zone.box.y + inset + bandBottom * zone.box.depthFt * 0.55 + rng.range(0, (bandTop - bandBottom) * zone.box.depthFt * 0.55 + 6);
      const crownRadius = Math.max(2.5, heightFt * 0.28);
      position.set(x, 0, y);
      scale.set(1, heightFt * 0.55, 1);
      matrix.compose(position, quaternion, scale);
      trunks.setMatrixAt(index, matrix);
      position.set(x, heightFt * 0.55 + crownRadius * 0.6, y);
      scale.set(crownRadius, crownRadius * 0.85, crownRadius);
      matrix.compose(position, quaternion, scale);
      crowns.setMatrixAt(index, matrix);
    }
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    group.add(trunks, crowns);

    // The two ground layers: a bed strip and a patch strip.
    if (layer.style === "bed_strips" || layer.style === "cover_patches") {
      const isBeds = layer.style === "bed_strips";
      const width = isBeds ? zone.box.widthFt * 0.8 : zone.box.widthFt * 0.5;
      const bed = new THREE.Mesh(
        new THREE.BoxGeometry(width, 0.45, isBeds ? 6 : 4),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(isBeds ? "#6b5136" : "#7a5f3f"), roughness: 1 }),
      );
      bed.position.set(zone.box.x + zone.box.widthFt / 2, 0.22, zone.box.y + zone.box.depthFt * (1 - (layerIndex + 0.5) / layers.length));
      bed.castShadow = true;
      bed.name = `orchard:${id}:${layer.id}:strip`;
      group.add(bed);
    }
  });

  return group;
}
