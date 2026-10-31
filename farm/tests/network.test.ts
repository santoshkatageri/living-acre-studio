import { describe, expect, test } from "vitest";

import { WORLD, zoneByKey } from "../src/sim/canon";
import { closestPointOnBox, distanceToBox, pointStrictlyInBox, segmentsCross } from "../src/sim/geometry";
import {
  SECTIONS,
  edgeLength,
  entranceFor,
  nodeById,
  pondRingRadius,
  type PathEdge,
  type PathNetwork,
} from "../src/sim/paths";
import type { Vec2, Zone } from "../src/sim/types";
import { cellOf, floodFill, isWalkable } from "../src/sim/walkable";
import { approachTo, centreOf, distance, GRID, NETWORK, walkPoints } from "./support/worlds";

/*  M4: the network connects every section.

    The rules under test, straight from the brief:
      - one shared graph, one named entrance per section, no duplicate legs;
      - a required edge for every link, plus one loop;
      - no node inside a solid zone or the pond keep-out;
      - corridors clear of the water, the rim and the goshala;
      - the farmer can walk every edge end to end. */

const POND = zoneByKey(WORLD, "pond") as Zone;
const KEEP_OUT = (POND.circle?.radiusFt ?? 0) + WORLD.pond.rimOuterFt + WORLD.pondRing.gapFt;
const HOUSE = zoneByKey(WORLD, "farmhouse") as Zone;
const SHED = zoneByKey(WORLD, "goshala") as Zone;

const nodePoint = (id: string): Vec2 => {
  const node = nodeById(NETWORK, id);
  return { x: node.x, y: node.y };
};

const edgeBetween = (a: string, b: string): PathEdge | undefined =>
  NETWORK.edges.find((edge) => (edge.from === a && edge.to === b) || (edge.from === b && edge.to === a));

/** Node ids reachable from `from` over the graph, walking edges both ways. */
function reachableFrom(network: PathNetwork, from: string, skip?: (edge: PathEdge) => boolean): Set<string> {
  const seen = new Set<string>([from]);
  const queue = [from];
  while (queue.length > 0) {
    const id = queue.pop() as string;
    for (const edge of network.edges) {
      if (skip?.(edge)) continue;
      const other = edge.from === id ? edge.to : edge.to === id ? edge.from : null;
      if (other && !seen.has(other)) {
        seen.add(other);
        queue.push(other);
      }
    }
  }
  return seen;
}

/** Number of connected components in the graph. */
function componentCount(network: PathNetwork): number {
  const seen = new Set<string>();
  let count = 0;
  for (const node of network.nodes) {
    if (seen.has(node.id)) continue;
    count += 1;
    for (const id of reachableFrom(network, node.id)) seen.add(id);
  }
  return count;
}

describe("every section has exactly one named entrance node", () => {
  test("one entrance per section, and the sections are the seven asked for", () => {
    expect([...SECTIONS].sort()).toEqual(
      ["compost", "farmhouse", "gate", "goshala", "orchard", "pond_ring", "vegetable_beds"].sort(),
    );
    for (const section of SECTIONS) {
      const matches = NETWORK.nodes.filter((node) => node.role === "entrance" && node.section === section);
      expect(matches, `${section} entrance count`).toHaveLength(1);
      expect(entranceFor(NETWORK, section).id).toBe(matches[0]?.id);
    }
  });

  test("node ids are unique and no node claims a section twice", () => {
    const ids = NETWORK.nodes.map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    const sections = NETWORK.nodes.filter((node) => node.section).map((node) => node.section);
    expect(new Set(sections).size).toBe(sections.length);
  });

  test("the gate, compost and beds entrances are the canon geometry", () => {
    const gate = zoneByKey(WORLD, "gate") as Zone;
    const compost = zoneByKey(WORLD, "compost") as Zone;
    const beds = zoneByKey(WORLD, "vegetable_beds") as Zone;

    expect(nodePoint("gate")).toMatchObject({ x: gate.box.x + gate.box.widthFt / 2, y: gate.box.y + gate.box.depthFt / 2 });

    const compostExpected = closestPointOnBox(centreOf(gate), compost.box);
    expect(nodePoint("compost").x).toBeCloseTo(compostExpected.x, 6);
    expect(nodePoint("compost").y).toBeCloseTo(compostExpected.y, 6);
    // ... and it sits on the compost's boundary, not inside it.
    expect(distanceToBox(nodePoint("compost"), compost.box)).toBeCloseTo(0, 6);

    const bedsExpected = closestPointOnBox(centreOf(gate), beds.box);
    expect(nodePoint("beds_sw").x).toBeCloseTo(bedsExpected.x, 6);
    expect(nodePoint("beds_sw").y).toBeCloseTo(bedsExpected.y, 6);
  });

  test("the two door nodes come from sim_overrides and sit on the south face", () => {
    for (const key of ["farmhouse", "goshala"] as const) {
      const zone = zoneByKey(WORLD, key) as Zone;
      const door = WORLD.doors[key];
      if (!door) throw new Error(`${key} has no door`);
      const node = nodePoint(key === "farmhouse" ? "farmhouse_door" : "goshala_door");

      expect(node.x).toBeCloseTo(door.point.x, 6);
      expect(node.y).toBeCloseTo(door.point.y, 6);
      // On the south wall: the face, at the configured offset along it.
      expect(node.y).toBeCloseTo(zone.box.y + zone.box.depthFt, 6);
      expect(node.x).toBeCloseTo(zone.box.x + door.offsetFt, 6);
      expect(door.offsetFt + door.gapFt / 2).toBeLessThanOrEqual(zone.box.widthFt);
      expect(door.offsetFt - door.gapFt / 2).toBeGreaterThanOrEqual(0);
    }
  });

  test("the orchard entrance is on its west / south-west edge", () => {
    const orchard = zoneByKey(WORLD, "orchard") as Zone;
    const node = nodePoint("orchard_sw");
    expect(node.x).toBeCloseTo(orchard.box.x, 6); // the west edge
    expect(node.y).toBeGreaterThan(orchard.box.y);
    expect(node.y).toBeLessThanOrEqual(orchard.box.y + orchard.box.depthFt);
    // Southern half of that edge: the south-west corner region.
    expect(node.y).toBeGreaterThan(orchard.box.y + orchard.box.depthFt / 2);
  });
});

describe("the required links are single edges", () => {
  const required: { label: string; a: string; b: string }[] = [
    { label: "gate - compost", a: "gate", b: "compost" },
    { label: "gate - beds", a: "gate", b: "beds_sw" },
    { label: "beds - goshala door gap", a: "beds_to_goshala", b: "goshala_door" },
    { label: "beds - farmhouse front door", a: "beds_to_farmhouse", b: "farmhouse_door" },
    // The wedge is one trunk out of the beds corner that forks once.
    { label: "beds - orchard fork (the shared trunk)", a: "beds_to_orchard", b: "orchard_fork" },
    { label: "orchard fork - orchard (direct)", a: "orchard_fork", b: "orchard_sw" },
    { label: "orchard - ring", a: "orchard_sw", b: NETWORK.ring?.entranceId ?? "ring_0" },
    { label: "orchard fork - pond ring", a: "orchard_fork", b: NETWORK.ring?.entranceId ?? "ring_0" },
  ];

  for (const link of required) {
    test(`${link.label} is one edge, and there is no second parallel leg`, () => {
      const edge = edgeBetween(link.a, link.b);
      expect(edge, `${link.label} missing`).toBeDefined();
      const between = NETWORK.edges.filter(
        (candidate) =>
          (candidate.from === link.a && candidate.to === link.b) || (candidate.from === link.b && candidate.to === link.a),
      );
      expect(between).toHaveLength(1);
    });
  }

  test("no two edges share the same pair of nodes", () => {
    const pairs = NETWORK.edges.map((edge) => [edge.from, edge.to].sort().join("|"));
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  test("the graph is one component and has the three cycles the design claims", () => {
    expect(componentCount(NETWORK)).toBe(1);
    const cycleRank = NETWORK.edges.length - NETWORK.nodes.length + 1;
    expect(cycleRank, "ring + beds perimeter + orchard triangle").toBe(3);
  });

  test("the ring is a closed polygon of ring-only edges", () => {
    const ring = NETWORK.ring;
    expect(ring).not.toBeNull();
    const ids = new Set(ring?.nodeIds ?? []);
    const ringEdges = NETWORK.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
    expect(ringEdges).toHaveLength(ring?.nodeIds.length ?? 0);
    for (const id of ids) {
      const degree = ringEdges.filter((edge) => edge.from === id || edge.to === id).length;
      expect(degree, `${id} degree`).toBe(2);
    }
  });

  test("alternative routes: the orchard is still reachable with the direct link cut", () => {
    const direct = edgeBetween("orchard_fork", "orchard_sw") as PathEdge;
    const without = reachableFrom(NETWORK, "gate", (edge) => edge.id === direct.id);
    expect(without.has("orchard_sw"), "the orchard needs the ring link too").toBe(true);

    const ringLink = edgeBetween("orchard_sw", NETWORK.ring?.entranceId ?? "") as PathEdge;
    const withoutRing = reachableFrom(NETWORK, "gate", (edge) => edge.id === ringLink.id);
    expect(withoutRing.has("orchard_sw"), "the direct link keeps it reachable").toBe(true);
  });
});

describe("nodes and corridors keep out of the water", () => {
  test("no node lies inside a solid zone", () => {
    for (const node of NETWORK.nodes) {
      for (const zone of WORLD.zones.filter((entry) => entry.solid)) {
        const inside = zone.circle
          ? Math.hypot(node.x - zone.circle.cx, node.y - zone.circle.cy) < zone.circle.radiusFt
          : pointStrictlyInBox(node, zone.box);
        expect(inside, `${node.id} inside ${zone.key}`).toBe(false);
      }
    }
    // The farmhouse door is exactly on the wall, which is the point.
    expect(nodePoint("farmhouse_door").y).toBeCloseTo(HOUSE.box.y + HOUSE.box.depthFt, 6);
  });

  test("no node lies inside the pond keep-out", () => {
    const centre = { x: POND.circle?.cx ?? 0, y: POND.circle?.cy ?? 0 };
    for (const node of NETWORK.nodes) {
      expect(distance(node, centre), `${node.id}`).toBeGreaterThanOrEqual(KEEP_OUT - 1e-6);
    }
  });

  test("no trunk centreline comes inside the keep-out", () => {
    const centre = { x: POND.circle?.cx ?? 0, y: POND.circle?.cy ?? 0 };
    for (const edge of NETWORK.edges.filter((entry) => entry.kind === "trunk")) {
      for (const point of edge.points) {
        expect(distance(point, centre), `${edge.id}`).toBeGreaterThanOrEqual(KEEP_OUT - 1e-6);
      }
    }
  });

  test("the ring's inner edge clears the water and every rim stone", () => {
    const ringRadius = pondRingRadius(WORLD);
    const innerEdge = ringRadius - WORLD.pondRing.widthFt / 2;
    const water = POND.circle?.radiusFt ?? 0;
    const furthestStone = water + WORLD.pond.rimOuterFt;
    expect(innerEdge).toBeGreaterThan(furthestStone);
    expect(innerEdge - furthestStone).toBeGreaterThanOrEqual(WORLD.pondRing.gapFt - 1e-6);
    expect(innerEdge).toBeCloseTo(KEEP_OUT, 6);
  });

  test("no edge sample is inside the farmhouse or the water", () => {
    for (const edge of NETWORK.edges) {
      for (const point of edge.points) {
        expect(pointStrictlyInBox(point, HOUSE.box), `${edge.id} in the farmhouse`).toBe(false);
        const fromPond = Math.hypot(point.x - (POND.circle?.cx ?? 0), point.y - (POND.circle?.cy ?? 0));
        expect(fromPond, `${edge.id} in the water`).toBeGreaterThan(POND.circle?.radiusFt ?? 0);
      }
    }
  });

  test("no two edges cross away from a node", () => {
    // A crossing off-node would be a leg with no junction; walk the pairs.
    const segments: { edge: string; a: Vec2; b: Vec2 }[] = [];
    for (const edge of NETWORK.edges) {
      for (let i = 1; i < edge.points.length; i += 1) {
        segments.push({ edge: edge.id, a: edge.points[i - 1] as Vec2, b: edge.points[i] as Vec2 });
      }
    }
    const crossings: string[] = [];
    for (let i = 0; i < segments.length; i += 1) {
      for (let j = i + 1; j < segments.length; j += 1) {
        const s = segments[i] as { edge: string; a: Vec2; b: Vec2 };
        const t = segments[j] as { edge: string; a: Vec2; b: Vec2 };
        if (s.edge === t.edge) continue;
        if (segmentsCross(s.a, s.b, t.a, t.b)) crossings.push(`${s.edge} x ${t.edge}`);
      }
    }
    expect(crossings).toEqual([]);
  });

  test("the corridor into the goshala only enters through its door gap", () => {
    const door = WORLD.doors["goshala"];
    if (!door) throw new Error("the goshala has no door");
    const half = WORLD.paths.widthFt / 2;
    for (const edge of NETWORK.edges) {
      for (let i = 1; i < edge.points.length; i += 1) {
        const a = edge.points[i - 1] as Vec2;
        const b = edge.points[i] as Vec2;
        const length = distance(a, b);
        if (length === 0) continue;
        const nx = -(b.y - a.y) / length;
        const ny = (b.x - a.x) / length;
        for (let step = 0; step <= 4; step += 1) {
          const t = step / 4;
          const px = a.x + (b.x - a.x) * t;
          const py = a.y + (b.y - a.y) * t;
          for (const offset of [-half, 0, half]) {
            const sample = { x: px + nx * offset, y: py + ny * offset };
            if (!pointStrictlyInBox(sample, SHED.box)) continue;
            expect(Math.abs(sample.x - door.point.x), `${edge.id} beside the door gap`).toBeLessThanOrEqual(
              door.gapFt / 2 + 1e-6,
            );
            const face = SHED.box.y + SHED.box.depthFt;
            expect(face - sample.y, `${edge.id} depth past the door`).toBeLessThanOrEqual(half + 0.2);
          }
        }
      }
    }
  });

  test("no corridor strip reaches inside the farmhouse", () => {
    const half = WORLD.paths.widthFt / 2;
    for (const edge of NETWORK.edges) {
      for (let i = 1; i < edge.points.length; i += 1) {
        const a = edge.points[i - 1] as Vec2;
        const b = edge.points[i] as Vec2;
        const length = distance(a, b);
        if (length === 0) continue;
        const nx = -(b.y - a.y) / length;
        const ny = (b.x - a.x) / length;
        for (let step = 0; step <= 4; step += 1) {
          const t = step / 4;
          const px = a.x + (b.x - a.x) * t;
          const py = a.y + (b.y - a.y) * t;
          for (const offset of [-half, 0, half]) {
            const sample = { x: px + nx * offset, y: py + ny * offset };
            expect(pointStrictlyInBox(sample, HOUSE.box), `${edge.id} clips the farmhouse`).toBe(false);
          }
        }
      }
    }
  });
});

describe("the flood fill from the gate reaches every section", () => {
  const reached = floodFill(GRID, WORLD.player.spawn);

  test("the spawn itself is walkable and the fill is not empty", () => {
    expect(reached.size).toBeGreaterThan(1000);
    const spawnCell = cellOf(GRID, WORLD.player.spawn);
    expect(spawnCell).not.toBeNull();
  });

  for (const section of SECTIONS) {
    test(`${section}: its entrance is reachable`, () => {
      const entrance = entranceFor(NETWORK, section);
      const node = { x: entrance.x, y: entrance.y };
      const approach = approachTo(node);
      expect(distance(approach, node), `${section} approach distance`).toBeLessThanOrEqual(2.6);

      const cell = cellOf(GRID, approach);
      expect(cell).not.toBeNull();
      const index = (cell?.row ?? 0) * GRID.cols + (cell?.col ?? 0);
      expect(reached.has(index), `${section} not reached from the gate`).toBe(true);
      expect(isWalkable(WORLD, approach, NETWORK)).toBe(true);
    });
  }

  test("the fill stays inside the walkable rule", () => {
    const ids = [...reached].slice(0, 400);
    for (const index of ids) {
      const col = index % GRID.cols;
      const row = Math.floor(index / GRID.cols);
      const point = { x: (col + 0.5) * GRID.cellFt, y: (row + 0.5) * GRID.cellFt };
      expect(isWalkable(WORLD, point, NETWORK)).toBe(true);
    }
  });
});

describe("edges can be walked end to end", () => {
  // Bridges: the four dead-end doorway branches, plus the one shared trunk the
  // beds corner sends to the orchard fork. Cutting anything inside the three
  // cycles still leaves a way round; cutting that trunk, or a doorway branch,
  // strands a section.
  test("exactly the four doorway branches and the orchard trunk are bridges", () => {
    const bridges: string[] = [];
    for (const edge of NETWORK.edges) {
      const reachable = reachableFrom(NETWORK, "gate", (candidate) => candidate.id === edge.id);
      if (reachable.size < NETWORK.nodes.length) bridges.push(edge.id);
    }
    expect(bridges.sort()).toEqual(
      [
        "beds_to_farmhouse--farmhouse_door",
        "beds_to_goshala--goshala_door",
        "beds_to_orchard--orchard_fork",
        "gate--beds_sw",
        "gate--compost",
      ].sort(),
    );
  });

  test("the orchard trunk is the only way out to the orchard and the ring", () => {
    const trunk = edgeBetween("beds_to_orchard", "orchard_fork") as PathEdge;
    const without = reachableFrom(NETWORK, "gate", (edge) => edge.id === trunk.id);
    expect(without.has("orchard_fork")).toBe(false);
    expect(without.has("orchard_sw"), "merged wedge: one trunk feeds both").toBe(false);
    expect(without.has(NETWORK.ring?.entranceId ?? "ring_0")).toBe(false);
  });

  test("cutting a bridge really isolates a section (this is the failure the brief asks for)", () => {
    const gateTrunk = edgeBetween("gate", "beds_sw") as PathEdge;
    const without = reachableFrom(NETWORK, "gate", (edge) => edge.id === gateTrunk.id);
    expect(without.has("beds_sw")).toBe(false);
    expect(without.has("goshala_door")).toBe(false);
    expect(without.has("orchard_sw")).toBe(false);
    expect(without.has("compost"), "compost is on its own branch").toBe(true);
  });

  test("every edge is walkable end to end without sticking", () => {
    const failures: string[] = [];
    for (const edge of NETWORK.edges) {
      const from = approachTo(nodePoint(edge.from));
      const to = approachTo(nodePoint(edge.to));
      // Walk the edge's own centreline, not a re-planned route: this proves
      // the corridor is continuous along the edge that was drawn.
      const points = [from, ...edge.points.slice(1, -1), to];
      const walk = walkPoints(from, points, 120);
      if (!walk.ok || walk.stalled) {
        failures.push(`${edge.id} (${edgeLength(edge).toFixed(1)} ft): ok=${walk.ok} stalled=${walk.stalled}`);
      }
    }
    expect(failures).toEqual([]);
  });
});

describe("the wedge is one trunk that forks once", () => {
  const apex = nodePoint("beds_to_orchard");
  const fork = nodePoint("orchard_fork");
  const orchard = nodePoint("orchard_sw");
  const ring = nodePoint(NETWORK.ring?.entranceId ?? "ring_0");

  const triangleArea = (a: Vec2, b: Vec2, c: Vec2): number =>
    Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;

  test("the beds corner sends one leg out, and the split happens at the fork", () => {
    const fromApex = NETWORK.edges.filter((edge) => edge.from === "beds_to_orchard" || edge.to === "beds_to_orchard");
    const towardTheWedge = fromApex.filter((edge) => {
      const other = edge.from === "beds_to_orchard" ? edge.to : edge.from;
      return other === "orchard_fork" || other === "orchard_sw" || other === (NETWORK.ring?.entranceId ?? "ring_0");
    });
    expect(towardTheWedge.map((edge) => edge.id)).toEqual(["beds_to_orchard--orchard_fork"]);
    expect(edgeBetween("orchard_fork", "orchard_sw")).toBeDefined();
    expect(edgeBetween("orchard_fork", NETWORK.ring?.entranceId ?? "ring_0")).toBeDefined();
    expect(edgeBetween("orchard_sw", NETWORK.ring?.entranceId ?? "ring_0")).toBeDefined();
  });

  test("the fork is the foot of the orchard's perpendicular, so nothing doubles back", () => {
    const norm = (v: Vec2): Vec2 => {
      const length = Math.hypot(v.x, v.y);
      return { x: v.x / length, y: v.y / length };
    };
    const trunk = norm({ x: fork.x - apex.x, y: fork.y - apex.y });
    const toOrchard = norm({ x: orchard.x - fork.x, y: orchard.y - fork.y });
    const toRing = norm({ x: ring.x - fork.x, y: ring.y - fork.y });
    const cosOrchard = trunk.x * toOrchard.x + trunk.y * toOrchard.y;
    const cosRing = trunk.x * toRing.x + trunk.y * toRing.y;
    // The orchard branch peels off square to the trunk; the ring branch runs on.
    expect(Math.abs(cosOrchard)).toBeLessThan(0.02);
    expect(cosRing).toBeGreaterThan(0.99);
    // Nothing folds back: no branch points back the way the trunk came.
    expect(cosOrchard).toBeGreaterThan(-0.02);
  });

  test("the drawn wedge is smaller, and the approach is shorter, than the two legs", () => {
    const wedgeBefore = triangleArea(apex, orchard, ring);
    const wedgeAfter = triangleArea(apex, fork, orchard);
    expect(wedgeAfter).toBeLessThan(wedgeBefore * 0.6);
    const before = distance(apex, orchard) + distance(apex, ring);
    const after = distance(apex, fork) + distance(fork, orchard) + distance(fork, ring);
    expect(after).toBeLessThan(before);
  });
});
