/*  Draw-call and triangle accounting for the farm scene, without a GPU.

    `renderer.info` needs a live WebGL context, which node does not have, so
    this mirrors its accounting instead: build the same groups `createView`
    builds, walk the scene, and count one call per drawable (an InstancedMesh is
    one call whatever its count), one extra call per shadow caster for the
    shadow pass, and triangles = geometry triangles x instances.

    Run with `npx tsx scripts/report-render.ts`. */
import * as THREE from "three";

import canonJson from "../canon/canon-v1.json";
import { WORLD, networkFor } from "../src/sim/canon";
import { createPlotGrid } from "../src/sim/plot";
import { buildWalkableGrid } from "../src/sim/walkable";
import { createFarmer } from "../src/render/actor";
import { createBelt } from "../src/render/belt";
import { createPaths } from "../src/render/paths";
import { createPlotView } from "../src/render/plots";
import { createPond } from "../src/render/pond";
import { createWaterEffect } from "../src/render/water-effect";
import { createWorldMesh } from "../src/render/world-mesh";

/*  The zone labels are canvas sprites, so node needs just enough of a 2D
    context for them to be built. Nothing is rasterised — only counted. */
const fakeContext = new Proxy(
  {},
  {
    get: (_target, key) => {
      if (key === "measureText") return () => ({ width: 0 });
      if (key === "canvas") return { width: 256, height: 64 };
      return () => undefined;
    },
  },
);
(globalThis as unknown as { document: unknown }).document = {
  createElement: () => ({ width: 256, height: 64, getContext: () => fakeContext }),
};
const { createZoneLabels } = await import("../src/render/labels");

const farmer = (canonJson as { identities: { farmer: { height_m: number } } }).identities.farmer;
const network = networkFor(WORLD);
const walkable = buildWalkableGrid(WORLD, network);
const grid = createPlotGrid(WORLD, WORLD.plot);

const scene = new THREE.Scene();
const world3d = createWorldMesh(WORLD);
scene.add(world3d.group);
const labels = createZoneLabels(WORLD);
scene.add(labels.group);
const bedsZone = WORLD.zones.find((zone) => zone.key === grid.zone);
const plotBaseY = (bedsZone?.heightFt ?? 0) + 0.02;
const pond = createPond(WORLD);
scene.add(pond.group);
const paths = createPaths(WORLD, walkable);
scene.add(paths.group);
const belt = createBelt(WORLD, network);
scene.add(belt.group);
const plot = createPlotView(grid, plotBaseY, WORLD.beds);
plot.sync(grid);
scene.add(plot.group);
const water = createWaterEffect(plotBaseY + 0.25);
scene.add(water.group);
const actor = createFarmer(WORLD, farmer.height_m);
scene.add(actor.mesh, actor.marker);
scene.traverse((object) => {
  if (object instanceof THREE.Mesh) {
    object.receiveShadow = true;
    object.castShadow = object.name !== "ground";
  }
});

interface Totals {
  calls: number;
  triangles: number;
  casters: number;
}

function trianglesOf(mesh: THREE.Mesh): number {
  const geometry = mesh.geometry as THREE.BufferGeometry;
  const count = geometry.index ? geometry.index.count : (geometry.getAttribute("position")?.count ?? 0);
  const drawn = (mesh as THREE.InstancedMesh).isInstancedMesh
    ? (mesh as THREE.InstancedMesh).count
    : 1;
  return (count / 3) * drawn;
}

function count(options: { visibleOnly: boolean }): Totals {
  const totals: Totals = { calls: 0, triangles: 0, casters: 0 };
  scene.traverseVisible((object) => {
    const drawable =
      object instanceof THREE.Mesh ||
      object instanceof THREE.Line ||
      object instanceof THREE.Points ||
      object instanceof THREE.Sprite;
    if (!drawable) return;
    if (options.visibleOnly && !object.visible) return;
    totals.calls += 1;
    if (object instanceof THREE.Mesh) {
      totals.triangles += trianglesOf(object);
      if (object.castShadow) totals.casters += 1;
    } else {
      totals.triangles += 2; // sprites and lines are counted as two triangles
    }
  });
  return totals;
}

const visible = count({ visibleOnly: true });
const shadowCalls = visible.casters;
const shadowTriangles = (() => {
  let tris = 0;
  scene.traverseVisible((object) => {
    if (object instanceof THREE.Mesh && object.castShadow) tris += trianglesOf(object);
  });
  return tris;
})();

const meshes = (() => {
  let n = 0;
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) n += 1;
  });
  return n;
})();

const names = new Map<string, number>();
scene.traverse((object) => {
  if (!(object instanceof THREE.Mesh)) return;
  const key = object.name.split(":")[0] || "unnamed";
  names.set(key, (names.get(key) ?? 0) + 1);
});
console.log(`meshes            ${meshes}`);
const groupTris = new Map<string, number>();
scene.traverse((object) => {
  if (!(object instanceof THREE.Mesh)) return;
  const key = object.name.split(":")[0] || "unnamed";
  groupTris.set(key, (groupTris.get(key) ?? 0) + trianglesOf(object));
});
console.log(`by group          ${[...names.entries()].map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log(`tris by group     ${[...groupTris.entries()].map(([k, v]) => `${k} ${Math.round(v)}`).join(" · ")}`);
const beltTris = (() => {
  let tris = 0;
  belt.group.traverse((object) => {
    if (object instanceof THREE.Mesh) tris += trianglesOf(object);
  });
  return tris;
})();
const walkTris = (() => {
  let tris = 0;
  paths.group.traverse((object) => {
    if (object instanceof THREE.Mesh && object.name.includes("walk")) tris += trianglesOf(object);
  });
  return tris;
})();
console.log(`belt trees        ${belt.count}`);
console.log(`belt tris         ${Math.round(beltTris).toLocaleString("en-US")}`);
console.log(`walk tris         ${Math.round(walkTris).toLocaleString("en-US")}`);
console.log(`draws, visible    ${visible.calls}`);
console.log(`tris,  visible    ${Math.round(visible.triangles).toLocaleString("en-US")}`);
console.log(`shadow casters    ${shadowCalls}`);
console.log(`draws, + shadows  ${visible.calls + shadowCalls}`);
console.log(`tris,  + shadows  ${Math.round(visible.triangles + shadowTriangles).toLocaleString("en-US")}`);
