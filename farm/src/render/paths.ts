import * as THREE from "three";

import { networkFor } from "../sim/canon";
import type { PathNetwork } from "../sim/paths";
import type { Vec2, World } from "../sim/types";
import type { WalkableGrid } from "../sim/walkable";

/*  The path network and the walkable overlay.

    One merged ribbon for every edge, each at its own data width, plus a round
    cap at every node, so junctions and the 48 ring joints read as smooth
    curves instead of overlapping strips. The overlay is rasterised from the
    sim's own grid, so what it shows is exactly what the movement rule allows. */

export interface PathsView {
  group: THREE.Group;
  network: PathNetwork;
  setOverlayVisible(visible: boolean): void;
  readonly overlayVisible: boolean;
  dispose(): void;
}

const PATH_Y = 0.045;
const CAP_LIFT = 0.012;
const OVERLAY_Y = 0.07;
const EDGE_Y = 0.035;

function pushDisc(
  positions: number[],
  indices: number[],
  centre: Vec2,
  radiusFt: number,
  y: number,
  segments = 12,
): void {
  const base = positions.length / 3;
  positions.push(centre.x, y, centre.y);
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    positions.push(centre.x + Math.cos(angle) * radiusFt, y, centre.y + Math.sin(angle) * radiusFt);
  }
  for (let i = 0; i < segments; i += 1) {
    indices.push(base, base + 1 + i, base + 1 + ((i + 1) % segments));
  }
}

/** A lighter, slightly wider strip under the garden walk only. */
function walkEdgeGeometry(network: PathNetwork, extraFt: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  let base = 0;
  for (const edge of network.edges) {
    if (edge.kind !== "walk") continue;
    const half = edge.widthFt / 2 + extraFt;
    const points = edge.points;
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i] as Vec2;
      const previous = points[Math.max(0, i - 1)] as Vec2;
      const next = points[Math.min(points.length - 1, i + 1)] as Vec2;
      const dx = next.x - previous.x;
      const dy = next.y - previous.y;
      const length = Math.hypot(dx, dy) || 1;
      const nx = (-dy / length) * half;
      const ny = (dx / length) * half;
      positions.push(point.x + nx, EDGE_Y, point.y + ny);
      positions.push(point.x - nx, EDGE_Y, point.y - ny);
    }
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = base + i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    base += points.length * 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function ribbonGeometry(network: PathNetwork): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  let base = 0;

  for (const edge of network.edges) {
    const half = edge.widthFt / 2;
    const points = edge.points;
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i] as Vec2;
      const previous = points[Math.max(0, i - 1)] as Vec2;
      const next = points[Math.min(points.length - 1, i + 1)] as Vec2;
      const dx = next.x - previous.x;
      const dy = next.y - previous.y;
      const length = Math.hypot(dx, dy) || 1;
      const nx = (-dy / length) * half;
      const ny = (dx / length) * half;
      positions.push(point.x + nx, PATH_Y, point.y + ny);
      positions.push(point.x - nx, PATH_Y, point.y - ny);
    }
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = base + i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    base += points.length * 2;
  }

  // A round cap at every node, as wide as the widest edge that meets it.
  const widthAt = new Map<string, number>();
  for (const edge of network.edges) {
    for (const id of [edge.from, edge.to]) {
      widthAt.set(id, Math.max(widthAt.get(id) ?? 0, edge.widthFt));
    }
  }
  for (const node of network.nodes) {
    const width = widthAt.get(node.id);
    if (!width) continue;
    pushDisc(positions, indices, { x: node.x, y: node.y }, width / 2, PATH_Y + CAP_LIFT);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** The walkable grid as merged runs of quads, one run per walkable span. */
function overlayGeometry(grid: WalkableGrid): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  let base = 0;

  for (let row = 0; row < grid.rows; row += 1) {
    let col = 0;
    while (col < grid.cols) {
      if (grid.cells[row * grid.cols + col] !== 1) {
        col += 1;
        continue;
      }
      const start = col;
      while (col < grid.cols && grid.cells[row * grid.cols + col] === 1) col += 1;
      const x0 = start * grid.cellFt;
      const x1 = col * grid.cellFt;
      const z0 = row * grid.cellFt;
      const z1 = z0 + grid.cellFt;
      positions.push(x0, OVERLAY_Y, z0, x1, OVERLAY_Y, z0, x1, OVERLAY_Y, z1, x0, OVERLAY_Y, z1);
      indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
      base += 4;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

export function createPaths(world: World, grid?: WalkableGrid): PathsView {
  const group = new THREE.Group();
  group.name = "paths";
  const network = networkFor(world);

  const trail = new THREE.Mesh(
    ribbonGeometry(network),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(world.paths.colour),
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  trail.name = "paths:trail";
  group.add(trail);

  // The garden walk reads differently: a lighter, wider strip under it.
  if (network.edges.some((edge) => edge.kind === "walk")) {
    const edgeStrip = new THREE.Mesh(
      walkEdgeGeometry(network, 0.9),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(world.palette["cream"] ?? "#f1ead9").multiplyScalar(0.55),
        roughness: 1,
        metalness: 0,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    );
    edgeStrip.name = "paths:walk-edge";
    group.add(edgeStrip);
  }

  if (network.steppingStones.length > 0) {
    const geometry = new THREE.CylinderGeometry(0.5, 0.55, 0.12, 7);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(world.tints["stone"] ?? "#7a7367"),
      roughness: 1,
      metalness: 0,
      flatShading: true,
    });
    const instanced = new THREE.InstancedMesh(geometry, material, network.steppingStones.length);
    instanced.name = "paths:stepping-stones";
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    network.steppingStones.forEach((stone, index) => {
      position.set(stone.x, PATH_Y + 0.06, stone.y);
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), stone.rotationRad);
      scale.set(stone.sizeFt, 1, stone.sizeFt);
      matrix.compose(position, quaternion, scale);
      instanced.setMatrixAt(index, matrix);
    });
    instanced.instanceMatrix.needsUpdate = true;
    group.add(instanced);
  }

  let overlay: THREE.Mesh | null = null;
  if (grid) {
    overlay = new THREE.Mesh(
      overlayGeometry(grid),
      new THREE.MeshBasicMaterial({ color: 0x9ff0c8, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    overlay.name = "paths:walkable-overlay";
    overlay.visible = false;
    overlay.renderOrder = 1;
    group.add(overlay);
  }

  return {
    group,
    network,
    setOverlayVisible(visible: boolean) {
      if (overlay) overlay.visible = visible;
    },
    get overlayVisible() {
      return overlay?.visible ?? false;
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
    },
  };
}
