import * as THREE from "three";

import type { World } from "../sim/types";

/*  The farmer: a simple figure in white cotton with a green shoulder towel,
    plus the ring that marks a click-to-move target. Canon heights are metres. */

export interface Actor {
  mesh: THREE.Group;
  marker: THREE.Mesh;
  sync(xFt: number, yFt: number): void;
  setTargetMarker(target: { x: number; y: number } | null): void;
  dispose(): void;
}

const METRES_TO_FEET = 3.28084;

export function createFarmer(world: World, heightMFt: number): Actor {
  const height = heightMFt * METRES_TO_FEET;
  const group = new THREE.Group();
  group.name = "farmer";

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.9, height * 0.52, 4, 10),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(world.palette["cream"] ?? "#f1ead9"), roughness: 1 }),
  );
  body.position.y = height * 0.55;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.72, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0x8a5a3c, roughness: 1 }),
  );
  head.position.y = height * 0.92;
  group.add(head);

  const towel = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, height * 0.34, 1.5),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(world.palette["leaf"] ?? "#7c9a5d"), roughness: 1 }),
  );
  towel.position.set(-0.7, height * 0.62, 0);
  group.add(towel);

  const marker = new THREE.Mesh(
    new THREE.RingGeometry(1.1, 1.5, 24),
    new THREE.MeshBasicMaterial({ color: 0xe8a33d, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.1;
  marker.visible = false;
  marker.name = "farmer:target";

  return {
    mesh: group,
    marker,
    sync(xFt, yFt) {
      group.position.set(xFt, 0, yFt);
    },
    setTargetMarker(target) {
      if (!target) {
        marker.visible = false;
        return;
      }
      marker.position.set(target.x, 0.1, target.y);
      marker.visible = true;
    },
    dispose() {
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const material = object.material;
          if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
          else material.dispose();
        }
      });
      marker.geometry.dispose();
      (marker.material as THREE.Material).dispose();
    },
  };
}
