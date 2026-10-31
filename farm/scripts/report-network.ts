/*  Prints the network as it really is: nodes, edges, junctions, route
    lengths and the section table. Run with `npx tsx scripts/report-network.ts`.
    Pure sim only — no renderer, no DOM. */
import { WORLD, networkFor } from "../src/sim/canon";
import { findRoute, routeLength } from "../src/sim/astar";
import { edgeLength, entranceFor, SECTIONS, totalLength } from "../src/sim/paths";
import { buildWalkableGrid, cellCentre } from "../src/sim/walkable";
import { nearestWalkableCell } from "../src/sim/astar";

const world = WORLD;
const network = networkFor(world);
const grid = buildWalkableGrid(world, network);
const spawn = world.player.spawn;
const fmt = (n: number) => n.toFixed(2);

console.log(`parcel ${world.parcel.widthFt} x ${world.parcel.depthFt} ft · mode ${world.movement.mode}`);
console.log(`spawn ${fmt(spawn.x)},${fmt(spawn.y)} · path width ${world.paths.widthFt} ft · ring ${world.pondRing.widthFt} ft\n`);

console.log(`NODES (${network.nodes.length})`);
for (const node of network.nodes) {
  if (node.id.startsWith("ring_") && node.role === "ring") continue;
  const role = node.section ? `entrance:${node.section}` : node.role;
  console.log(`  ${node.id.padEnd(20)} ${fmt(node.x).padStart(7)},${fmt(node.y).padStart(7)}  ${role}`);
}
console.log(`  ring_0 … ring_${(network.ring?.nodeIds.length ?? 1) - 1}   (${network.ring?.nodeIds.length} nodes at r=${network.ring?.radiusFt} ft)`);

console.log(`\nEDGES (${network.edges.length})`);
for (const edge of network.edges) {
  if (edge.kind === "ring") continue;
  console.log(
    `  ${edge.id.padEnd(38)} ${fmt(edgeLength(edge)).padStart(6)} ft  w=${edge.widthFt}  ${edge.from} -> ${edge.to}`,
  );
}
const ringEdges = network.edges.filter((edge) => edge.kind === "ring");
console.log(`  ring:${ringEdges.length - 1} … (${ringEdges.length} ring edges, ${fmt(edgeLength(ringEdges[0]!))} ft each)`);
console.log(`total length ${fmt(totalLength(network))} ft`);

console.log(`\nJUNCTIONS (${network.junctions.length})`);
for (const node of network.junctions) console.log(`  ${node.id} (${fmt(node.x)},${fmt(node.y)})`);

const approach = (x: number, y: number) => {
  const cell = nearestWalkableCell(grid, { x, y }, 6);
  if (cell === null) throw new Error("no approach");
  return cellCentre(grid, cell);
};

console.log(`\nSECTIONS`);
for (const section of SECTIONS) {
  const entrance = entranceFor(network, section);
  const goal = approach(entrance.x, entrance.y);
  const route = findRoute(grid, spawn, goal);
  const straight = Math.hypot(entrance.x - spawn.x, entrance.y - spawn.y);
  const length = route ? routeLength(route) : Number.NaN;
  console.log(
    `  ${section.padEnd(15)} entrance ${entrance.id.padEnd(15)} route ${fmt(length).padStart(7)} ft  straight ${fmt(straight).padStart(7)} ft  ratio ${(length / straight).toFixed(2)}`,
  );
}
