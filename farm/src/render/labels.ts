import * as THREE from "three";

import type { World } from "../sim/types";

/*  Zone names, drawn to canvas textures once at start-up.
    A label sits above its zone's centre; nothing is loaded from the network. */

export interface ZoneLabels {
  group: THREE.Group;
  /** Keep the labels legible at whole-acre and close zoom alike. */
  setZoom(zoom: number): void;
  dispose(): void;
}

/** World size of a label at zoom 1, in feet. */
const BASE_SCALE = { width: 14, height: 3.5 };
/** How hard the labels shrink as the camera closes in: < 1 keeps them visible. */
const ZOOM_EXPONENT = 0.65;

const WIDTH = 512;
const HEIGHT = 128;

function makeSprite(text: string, colour: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas context unavailable for labels");
  context.clearRect(0, 0, WIDTH, HEIGHT);
  context.font = "600 54px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineWidth = 10;
  context.strokeStyle = "rgba(18,16,13,0.85)";
  context.strokeText(text, WIDTH / 2, HEIGHT / 2);
  context.fillStyle = colour;
  context.fillText(text, WIDTH / 2, HEIGHT / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(14, 3.5, 1);
  return sprite;
}

export function createZoneLabels(world: World): ZoneLabels {
  const group = new THREE.Group();
  group.name = "labels";
  const cream = world.palette["cream"] ?? "#f1ead9";

  for (const zone of world.zones) {
    const text = zone.name;
    const sprite = makeSprite(text, cream);
    const centre = zone.circle
      ? { x: zone.circle.cx, y: zone.circle.cy }
      : { x: zone.box.x + zone.box.widthFt / 2, y: zone.box.y + zone.box.depthFt / 2 };
    sprite.position.set(centre.x, zone.heightFt + 6, centre.y);
    group.add(sprite);
  }

  const setZoom = (zoom: number): void => {
    const factor = 1 / Math.pow(Math.max(zoom, 0.001), ZOOM_EXPONENT);
    for (const child of group.children) {
      if (child instanceof THREE.Sprite) {
        child.scale.set(BASE_SCALE.width * factor, BASE_SCALE.height * factor, 1);
      }
    }
  };
  setZoom(1);

  return {
    group,
    setZoom,
    dispose() {
      group.traverse((object) => {
        if (object instanceof THREE.Sprite) {
          object.material.map?.dispose();
          object.material.dispose();
        }
      });
    },
  };
}
