import * as THREE from "three";

import type { HectareWorld } from "../world";

/*  Zone names, on boards.

    Each space has a signpost planted at its north-west corner: a post and a
    plate, with the name painted on it. The board turns about its post to face the
    camera, so the name reads from any heading and from either camera — a flat
    plate seen edge-on would be a sliver half the time.

    The posts and the plates are two InstancedMeshes (two draw calls for all of
    them); the names are one textured plane each, because every board carries
    different text.

    Boards grow once the frame is taller than the data's threshold, capped by the
    data's maximum: a physical sign cannot stay legible from the whole-farm view
    without growing, and it must not grow into a monument.

    Textures need a 2D canvas, which Node has not got; `makeTexture` lets the
    tests build the whole group without one. */

export interface LabelsView {
  group: THREE.Group;
  /** Grow the signs to suit a frame this many feet tall. */
  setFrame(frameFt: number): void;
  /** Turn every board's face to the camera, so its name reads from any heading. */
  faceCamera(camera: THREE.Camera): void;
  readonly count: number;
  dispose(): void;
}

export interface LabelOptions {
  makeTexture?: (text: string, colour: string) => THREE.Texture;
}

// 4:1, the shape of the plate; large enough that even the longest name is set
// at the data's fill fraction rather than shrunk.
const WIDTH = 1024;
const HEIGHT = 256;

function canvasTexture(text: string, colour: string, fillFrac: number): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas context unavailable for labels");
  context.clearRect(0, 0, WIDTH, HEIGHT);
  let size = Math.round(HEIGHT * fillFrac);
  do {
    context.font = `600 ${size}px system-ui, sans-serif`;
    size -= 2;
  } while (size > 18 && context.measureText(text).width > WIDTH - 32);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = colour;
  context.fillText(text, WIDTH / 2, HEIGHT / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createLabels(world: HectareWorld, options: LabelOptions = {}): LabelsView {
  const group = new THREE.Group();
  group.name = "labels";
  const style = world.labelStyle;
  const makeTexture = options.makeTexture ?? ((text: string, colour: string) => canvasTexture(text, colour, style.textFillFrac));
  const count = world.labels.length;

  const postGeometry = new THREE.BoxGeometry(style.postWidthFt, style.postHeightFt, style.postWidthFt);
  postGeometry.translate(0, style.postHeightFt / 2, 0);
  const posts = new THREE.InstancedMesh(postGeometry, wood(style.postColour), count);
  posts.name = "labels:posts";

  const plateGeometry = new THREE.BoxGeometry(style.boardWidthFt, style.boardHeightFt, style.boardThicknessFt);
  plateGeometry.translate(0, style.postHeightFt + style.boardHeightFt * 0.1, 0);
  const plates = new THREE.InstancedMesh(plateGeometry, wood(style.boardColour), count);
  plates.name = "labels:plates";
  group.add(posts, plates);

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  const textY = style.postHeightFt + style.boardHeightFt * 0.1;

  const textPlanes: THREE.Mesh[] = [];
  world.labels.forEach((label, index) => {
    position.set(label.boardX, 0, label.boardY);
    matrix.compose(position, quaternion.identity(), scale);
    posts.setMatrixAt(index, matrix);
    plates.setMatrixAt(index, matrix);

    const material = new THREE.MeshBasicMaterial({
      map: makeTexture(label.text, style.textColour),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(style.boardWidthFt * 0.92, style.boardHeightFt * 0.78), material);
    plane.position.set(label.boardX, textY, label.boardY);
    plane.name = `label-text:${label.id}`;
    group.add(plane);
    textPlanes.push(plane);
  });

  posts.instanceMatrix.needsUpdate = true;
  plates.instanceMatrix.needsUpdate = true;

  let growth = 1;
  const apply = (): void => {
    scale.set(growth, growth, growth);
    quaternion.identity();
    world.labels.forEach((label, index) => {
      position.set(label.boardX, 0, label.boardY);
      matrix.compose(position, quaternion, scale);
      posts.setMatrixAt(index, matrix);
      plates.setMatrixAt(index, matrix);
      const plane = textPlanes[index];
      if (plane) {
        plane.position.y = textY * growth;
        plane.scale.setScalar(growth);
      }
    });
    posts.instanceMatrix.needsUpdate = true;
    plates.instanceMatrix.needsUpdate = true;
  };

  const setFrame = (frameFt: number): void => {
    const wanted = Math.max(frameFt, 0) / Math.max(style.growthFromFt, 0.001);
    const next = Math.min(Math.max(wanted, 1), Math.max(style.boardGrowthMax, 1));
    if (Math.abs(next - growth) < 1e-4) return;
    growth = next;
    apply();
  };
  setFrame(0);

  const target = new THREE.Vector3();

  return {
    group,
    count,
    setFrame,
    faceCamera(camera) {
      camera.getWorldPosition(target);
      const lift = (style.boardThicknessFt / 2 + 0.02) * growth;
      for (const [index, label] of world.labels.entries()) {
        const plane = textPlanes[index];
        if (!plane) continue;
        const dx = target.x - label.boardX;
        const dz = target.z - label.boardY;
        const reach = Math.hypot(dx, dz) || 1;
        plane.rotation.y = Math.atan2(dx, dz);
        // The name sits just proud of the plate, on the camera's side.
        plane.position.x = label.boardX + (dx / reach) * lift;
        plane.position.z = label.boardY + (dz / reach) * lift;
      }
    },
    dispose() {
      posts.geometry.dispose();
      plates.geometry.dispose();
      (posts.material as THREE.Material).dispose();
      (plates.material as THREE.Material).dispose();
      for (const plane of textPlanes) {
        plane.geometry.dispose();
        const material = plane.material as THREE.MeshBasicMaterial;
        material.map?.dispose();
        material.dispose();
      }
      group.clear();
    },
  };
}

function wood(colour: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(colour), roughness: 0.9, metalness: 0 });
}
