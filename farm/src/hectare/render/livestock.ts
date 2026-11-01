import * as THREE from "three";

import type { Animal, HectareWorld, Species } from "../world";

/*  The herd and the flock: bullocks and buffalo in the cattle shed, hens in the
    poultry unit, goats in the pen.

    Each species is a small set of boxes and cones in its own local space, facing
    +z; every animal of that species is one instance of each part. Four species
    and a dozen parts is a dozen draw calls for all nineteen animals, whatever
    the count, and the herd still reads as bullocks with horns, buffalo with
    heavier ones, goats and hens.

    They stand where the plan puts them and do not wander: a tour camera and a
    recorded film both look worse if the herd has drifted. */

export interface LivestockView {
  group: THREE.Group;
  readonly animals: number;
  readonly instances: number;
  dispose(): void;
}

interface Part {
  shape: "box" | "cone" | "sphere";
  size: [number, number, number];
  at: [number, number, number];
  rotation?: [number, number, number];
  colour: string;
}

interface SpeciesShape {
  /** Body length, for the pen maths; kept in step with SPECIES_GEOMETRY. */
  lengthFt: number;
  parts: Part[];
}

const BULLOCK_WHITE = "#e3ded2";
const BUFFALO_BLACK = "#3a3733";
const HORN_BLUE = "#5b7f9a";
const HORN_DARK = "#4a453d";
const GOAT_BROWN = "#8a6a4a";
const GOAT_WHITE = "#d8d2c4";
const HEN_BROWN = "#9a5a3a";
const HEN_WHITE = "#e8e2d2";
const COMB = "#b2402f";
const HOOF = "#3b342d";
const EYE = "#231f1b";

/** Legs at the four corners of a body of this length and width. */
function legs(lengthFt: number, widthFt: number, heightFt: number, thickness: number, colour: string): Part[] {
  const out: Part[] = [];
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      out.push({
        shape: "box",
        size: [thickness, heightFt, thickness],
        at: [side * widthFt * 0.35, heightFt / 2, end * lengthFt * 0.3],
        colour,
      });
    }
  }
  return out;
}

const SHAPES: Record<Species, SpeciesShape> = {
  bullock: {
    lengthFt: 7.4,
    parts: [
      { shape: "box", size: [2.6, 2.2, 5.4], at: [0, 3.1, 0], colour: BULLOCK_WHITE },
      { shape: "box", size: [1.6, 1.5, 2.1], at: [0, 3.5, 3.3], colour: BULLOCK_WHITE },
      { shape: "box", size: [0.5, 0.18, 1.6], at: [0, 4.6, 2.6], colour: "#c9b98a" },
      { shape: "cone", size: [0.28, 1.8, 0.28], at: [-0.6, 4.3, 3.7], rotation: [0.9, 0, 0.5], colour: HORN_BLUE },
      { shape: "cone", size: [0.28, 1.8, 0.28], at: [0.6, 4.3, 3.7], rotation: [0.9, 0, -0.5], colour: HORN_BLUE },
      { shape: "sphere", size: [0.16, 0.16, 0.16], at: [-0.55, 3.75, 4.3], colour: EYE },
      { shape: "sphere", size: [0.16, 0.16, 0.16], at: [0.55, 3.75, 4.3], colour: EYE },
      { shape: "box", size: [0.2, 2.6, 0.2], at: [0, 2.6, -3.0], rotation: [0.3, 0, 0], colour: "#7a6a52" },
      ...legs(5.4, 2.6, 2.1, 0.55, HOOF),
    ],
  },
  buffalo: {
    lengthFt: 7.0,
    parts: [
      { shape: "box", size: [2.9, 2.4, 5.4], at: [0, 2.9, 0], colour: BUFFALO_BLACK },
      { shape: "box", size: [1.7, 1.6, 2.2], at: [0, 3.0, 3.4], colour: BUFFALO_BLACK },
      // The Murrah curl: a wide sweep back over the shoulders.
      { shape: "cone", size: [0.34, 2.6, 0.34], at: [-0.7, 3.9, 3.6], rotation: [0.4, 0, 1.15], colour: HORN_DARK },
      { shape: "cone", size: [0.34, 2.6, 0.34], at: [0.7, 3.9, 3.6], rotation: [0.4, 0, -1.15], colour: HORN_DARK },
      // The rope halter, and a bell.
      { shape: "box", size: [1.2, 0.12, 0.12], at: [0, 3.1, 4.4], colour: "#c9b98a" },
      { shape: "sphere", size: [0.22, 0.22, 0.22], at: [0, 2.6, 4.5], colour: "#c9a227" },
      { shape: "sphere", size: [0.15, 0.15, 0.15], at: [-0.6, 3.4, 4.3], colour: EYE },
      { shape: "sphere", size: [0.15, 0.15, 0.15], at: [0.6, 3.4, 4.3], colour: EYE },
      ...legs(5.4, 2.9, 1.9, 0.6, HOOF),
    ],
  },
  goat: {
    lengthFt: 3.6,
    parts: [
      { shape: "box", size: [1.5, 1.5, 2.6], at: [0, 2.1, 0], colour: GOAT_BROWN },
      { shape: "box", size: [0.95, 0.95, 1.25], at: [0, 2.5, 1.7], colour: GOAT_BROWN },
      { shape: "cone", size: [0.16, 1.0, 0.16], at: [-0.28, 3.2, 1.7], rotation: [0.3, 0, 0.35], colour: "#6a6156" },
      { shape: "cone", size: [0.16, 1.0, 0.16], at: [0.28, 3.2, 1.7], rotation: [0.3, 0, -0.35], colour: "#6a6156" },
      { shape: "box", size: [0.55, 0.9, 0.12], at: [0, 2.0, 2.35], colour: GOAT_WHITE },
      { shape: "sphere", size: [0.12, 0.12, 0.12], at: [-0.34, 2.66, 2.2], colour: EYE },
      { shape: "sphere", size: [0.12, 0.12, 0.12], at: [0.34, 2.66, 2.2], colour: EYE },
      ...legs(2.4, 1.4, 1.4, 0.34, HOOF),
    ],
  },
  hen: {
    lengthFt: 1.3,
    parts: [
      { shape: "box", size: [0.85, 0.85, 1.15], at: [0, 0.85, 0], colour: HEN_BROWN },
      { shape: "box", size: [0.5, 0.55, 0.6], at: [0, 1.35, 0.75], colour: HEN_BROWN },
      { shape: "cone", size: [0.13, 0.4, 0.13], at: [0, 1.72, 0.85], rotation: [0.1, 0, 0], colour: COMB },
      { shape: "box", size: [0.22, 0.12, 0.24], at: [0, 1.3, 1.15], colour: "#d9a53c" },
      { shape: "box", size: [0.6, 0.55, 0.45], at: [0, 1.1, -0.72], rotation: [-0.5, 0, 0], colour: HEN_WHITE },
      { shape: "box", size: [0.1, 0.5, 0.1], at: [-0.24, 0.25, 0.1], colour: "#d9a53c" },
      { shape: "box", size: [0.1, 0.5, 0.1], at: [0.24, 0.25, 0.1], colour: "#d9a53c" },
      { shape: "sphere", size: [0.07, 0.07, 0.07], at: [-0.2, 1.45, 1.02], colour: EYE },
      { shape: "sphere", size: [0.07, 0.07, 0.07], at: [0.2, 1.45, 1.02], colour: EYE },
    ],
  },
};

function geometryFor(part: Part): THREE.BufferGeometry {
  const [x, y, z] = part.size;
  if (part.shape === "cone") return new THREE.ConeGeometry(x, y, 6);
  if (part.shape === "sphere") return new THREE.SphereGeometry(x, 8, 6);
  return new THREE.BoxGeometry(x, y, z);
}

export function createLivestock(world: HectareWorld): LivestockView {
  const group = new THREE.Group();
  group.name = "livestock";

  const bySpecies = new Map<Species, Animal[]>();
  for (const animal of world.animals) {
    const list = bySpecies.get(animal.species) ?? [];
    list.push(animal);
    bySpecies.set(animal.species, list);
  }

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  let instances = 0;

  for (const [species, animals] of bySpecies) {
    const shape = SHAPES[species];
    if (!shape) throw new Error(`no livestock shape for species "${species}"`);
    let partIndex = 0;
    for (const part of shape.parts) {
      const mesh = new THREE.InstancedMesh(
        geometryFor(part),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(part.colour), roughness: 0.95 }),
        animals.length,
      );
      mesh.name = `livestock:${species}:${partIndex}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      animals.forEach((animal, index) => {
        quaternion.setFromAxisAngle(up, animal.facingRad);
        const offset = new THREE.Vector3(part.at[0], part.at[1], part.at[2]);
        if (part.rotation) {
          const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(part.rotation[0], part.rotation[1], part.rotation[2]));
          offset.applyQuaternion(tilt);
        }
        offset.applyQuaternion(quaternion);
        position.set(animal.x + offset.x, animal.floorFt + offset.y, animal.y + offset.z);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
      instances += animals.length;
      partIndex += 1;
    }
  }

  return {
    group,
    animals: world.animals.length,
    instances,
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
