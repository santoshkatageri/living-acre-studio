import * as THREE from "three";

/*  A short arc of water from the farmer's hand to the cell being watered.
    Two and a half seconds of a stretched sphere; no particles, no pool. */

export interface WaterEffect {
  group: THREE.Group;
  play(from: { x: number; y: number }, to: { x: number; y: number }): void;
  update(dt: number): void;
  dispose(): void;
}

const DURATION = 0.55;

export function createWaterEffect(baseY: number): WaterEffect {
  const group = new THREE.Group();
  group.name = "water-effect";

  const drop = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x8fd3e8, transparent: true, opacity: 0.85, roughness: 0.2 }),
  );
  drop.visible = false;
  group.add(drop);

  let elapsed = DURATION;
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();

  return {
    group,
    play(start, end) {
      from.set(start.x, baseY + 4.4, start.y);
      to.set(end.x, baseY + 0.4, end.y);
      elapsed = 0;
      drop.visible = true;
    },
    update(dt) {
      if (elapsed >= DURATION) {
        drop.visible = false;
        return;
      }
      elapsed = Math.min(elapsed + dt, DURATION);
      const t = elapsed / DURATION;
      drop.position.lerpVectors(from, to, t);
      // A shallow arc.
      drop.position.y += Math.sin(t * Math.PI) * 1.6;
      const shrink = 1 - t * 0.4;
      drop.scale.set(shrink, shrink * 1.8, shrink);
    },
    dispose() {
      drop.geometry.dispose();
      drop.material.dispose();
    },
  };
}
