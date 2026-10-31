import { describe, expect, test } from "vitest";

import { findRoute, nearestWalkableCell, routeLength } from "../src/sim/astar";
import { bufferBelt } from "../src/sim/belt";
import { WORLD, networkFor } from "../src/sim/canon";
import { SECTIONS, entranceFor, type PathEdge, type PathNetwork } from "../src/sim/paths";
import type { Vec2, Zone } from "../src/sim/types";
import { buildWalkableGrid } from "../src/sim/walkable";
import { approachTo, distance, GRID, NETWORK, walkRoute } from "./support/worlds";

/*  The perimeter garden walk.

    Rules under test, straight from the brief: one closed loop that stays
    inside the parcel, inside the belt's inner edge and outside every zone, the
    pond ring and the keep-out; one spur per listed section; the graph stays one
    component with the walk on or off; the loop is walkable end to end,
    including all four corners; no belt tree crowds it; and the routes to the
    six joined sections do not get worse. */

const PARCEL = WORLD.parcel;
const POND = WORLD.zones.find((zone) => zone.circle) as Zone;
const KEEP_OUT = (POND.circle?.radiusFt ?? 0) + WORLD.pond.rimOuterFt + WORLD.pondRing.gapFt;
const LOOP_CLEARANCE = WORLD.perimeter.widthFt / 2 + WORLD.perimeter.clearanceFt;

const NO_WALK: PathNetwork = networkFor({ ...WORLD, perimeter: { ...WORLD.perimeter, enabled: false } });

/** The loop's own legs: every walk leg that is not one of the spurs. */
function loopEdges(network: PathNetwork = NETWORK): PathEdge[] {
  return (network.perimeter?.edges ?? []).filter((edge) => !edge.id.startsWith("walk-connector:"));
}

function loopNodes(network: PathNetwork = NETWORK): string[] {
  return network.perimeter?.loop.nodeIds ?? [];
}

function loopPoints(network: PathNetwork = NETWORK): Vec2[] {
  return loopNodes(network).map((id) => {
    const node = network.nodes.find((candidate) => candidate.id === id) as Vec2;
    return { x: node.x, y: node.y };
  });
}

function reachable(network: PathNetwork, from: string): Set<string> {
  const seen = new Set<string>([from]);
  const queue = [from];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    for (const edge of network.edges) {
      const other = edge.from === id ? edge.to : edge.to === id ? edge.from : null;
      if (other && !seen.has(other)) {
        seen.add(other);
        queue.push(other);
      }
    }
  }
  return seen;
}

describe("the loop is one closed walk round the parcel", () => {
  test("it is a single cycle: as many legs as nodes, every node joined twice", () => {
    const edges = loopEdges();
    const ids = loopNodes();
    expect(ids.length).toBeGreaterThan(40);
    expect(edges.length).toBe(ids.length);
    const degree = new Map<string, number>();
    for (const edge of edges) {
      degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
      degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
    }
    for (const id of ids) expect(degree.get(id), id).toBe(2);
  });

  test("its length matches the walk the data describes", () => {
    const perimeter = NETWORK.perimeter;
    expect(perimeter).not.toBeNull();
    const length = loopEdges().reduce((sum, edge) => {
      let ft = 0;
      for (let i = 1; i < edge.points.length; i += 1) {
        ft += distance(edge.points[i - 1] as Vec2, edge.points[i] as Vec2);
      }
      return sum + ft;
    }, 0);
    expect(length).toBeCloseTo(perimeter?.loop.lengthFt ?? 0, 0);
    expect(length).toBeGreaterThan(PARCEL.widthFt * 2 + PARCEL.depthFt * 2 - 200);
  });
});

describe("the loop keeps out of everything it should", () => {
  test("every loop node is inside the parcel and inside the belt's inner edge", () => {
    const belt = bufferBelt(WORLD, NETWORK);
    for (const point of loopPoints()) {
      expect(point.x).toBeGreaterThanOrEqual(belt.innerEdgeFt.west);
      expect(point.x).toBeLessThanOrEqual(belt.innerEdgeFt.east);
      expect(point.y).toBeGreaterThanOrEqual(belt.innerEdgeFt.north);
      expect(point.y).toBeLessThanOrEqual(belt.innerEdgeFt.south);
    }
  });

  test("no loop node stands in a zone, the pond, the keep-out or the ring", () => {
    for (const point of loopPoints()) {
      for (const zone of WORLD.zones) {
        if (zone.circle) continue;
        const inside =
          point.x > zone.box.x &&
          point.x < zone.box.x + zone.box.widthFt &&
          point.y > zone.box.y &&
          point.y < zone.box.y + zone.box.depthFt;
        expect(inside, `loop point inside ${zone.key}`).toBe(false);
      }
      const d = Math.hypot(point.x - (POND.circle?.cx ?? 0), point.y - (POND.circle?.cy ?? 0));
      expect(d).toBeGreaterThanOrEqual(KEEP_OUT);
    }
  });

  test("no loop leg cuts a zone corner", () => {
    for (const edge of loopEdges()) {
      for (let i = 1; i < edge.points.length; i += 1) {
        const a = edge.points[i - 1] as Vec2;
        const b = edge.points[i] as Vec2;
        const steps = Math.max(1, Math.ceil(distance(a, b) / 0.5));
        for (let s = 0; s <= steps; s += 1) {
          const point = { x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps };
          for (const zone of WORLD.zones) {
            if (zone.circle) continue;
            const inside =
              point.x > zone.box.x &&
              point.x < zone.box.x + zone.box.widthFt &&
              point.y > zone.box.y &&
              point.y < zone.box.y + zone.box.depthFt;
            expect(inside, `${edge.id} inside ${zone.key}`).toBe(false);
          }
        }
      }
    }
  });

  test("no belt tree crowds the walk", () => {
    const belt = bufferBelt(WORLD, NETWORK);
    for (const tree of belt.trees) {
      for (const edge of loopEdges()) {
        for (let i = 1; i < edge.points.length; i += 1) {
          const a = edge.points[i - 1] as Vec2;
          const b = edge.points[i] as Vec2;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const lengthSq = dx * dx + dy * dy;
          const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((tree.x - a.x) * dx + (tree.y - a.y) * dy) / lengthSq));
          const d = Math.hypot(tree.x - (a.x + dx * t), tree.y - (a.y + dy * t));
          expect(d, `${tree.side} tree at ${tree.x.toFixed(1)},${tree.y.toFixed(1)}`).toBeGreaterThanOrEqual(LOOP_CLEARANCE);
        }
      }
    }
  });
});

describe("the walk joins the network", () => {
  test("every listed section gets exactly one spur, and none is dropped", () => {
    const perimeter = NETWORK.perimeter;
    expect(perimeter).not.toBeNull();
    expect(perimeter?.dropped).toEqual([]);
    expect(perimeter?.connectors.map((connector) => connector.section).sort()).toEqual([...WORLD.perimeter.connectors].sort());
    for (const connector of perimeter?.connectors ?? []) {
      expect(connector.lengthFt).toBeGreaterThan(0);
      expect(connector.toNode.startsWith("walk_")).toBe(true);
      const edges = (NETWORK.perimeter?.edges ?? []).filter((edge) => edge.id === `walk-connector:${connector.section}`);
      expect(edges.length, connector.section).toBe(1);
    }
  });

  test("each spur reaches the network without crossing a solid zone", () => {
    for (const connector of NETWORK.perimeter?.connectors ?? []) {
      const edge = (NETWORK.perimeter?.edges ?? []).find(
        (candidate) => candidate.id === `walk-connector:${connector.section}`,
      ) as PathEdge;
      expect(edge).toBeDefined();
      for (let i = 1; i < edge.points.length; i += 1) {
        const a = edge.points[i - 1] as Vec2;
        const b = edge.points[i] as Vec2;
        const steps = Math.max(1, Math.ceil(distance(a, b) / 0.5));
        for (let s = 0; s <= steps; s += 1) {
          const point = { x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps };
          for (const zone of WORLD.zones.filter((entry) => entry.solid && !entry.circle)) {
            const inside =
              point.x > zone.box.x &&
              point.x < zone.box.x + zone.box.widthFt &&
              point.y > zone.box.y &&
              point.y < zone.box.y + zone.box.depthFt;
            expect(inside, `${connector.section} spur inside ${zone.key}`).toBe(false);
          }
        }
      }
    }
  });

  test("the graph is still one component, with or without the walk", () => {
    const withWalk = reachable(NETWORK, "gate");
    const withoutWalk = reachable(NO_WALK, "gate");
    expect(withWalk.size).toBe(NETWORK.nodes.length);
    expect(withoutWalk.size).toBe(NO_WALK.nodes.length);
    for (const section of SECTIONS) {
      expect(withoutWalk.has(entranceFor(NO_WALK, section).id), `${section} without the loop`).toBe(true);
      expect(withWalk.has(entranceFor(NETWORK, section).id), `${section} with the loop`).toBe(true);
    }
  });

  test("a section that is cut from the connector list loses its spur", () => {
    // The check above has teeth: drop one connector from the data and the spur
    // for that section is gone. (Reverted — the real data lists all six.)
    const cut = networkFor({
      ...WORLD,
      perimeter: { ...WORLD.perimeter, connectors: WORLD.perimeter.connectors.filter((section) => section !== "orchard") },
    });
    const sections = (cut.perimeter?.connectors ?? []).map((connector) => connector.section);
    expect(sections).not.toContain("orchard");
    expect(NETWORK.perimeter?.connectors.map((connector) => connector.section)).toContain("orchard");
  });
});

describe("the loop is walkable", () => {
  test("every loop node sits on walkable ground", () => {
    for (const id of loopNodes()) {
      const node = NETWORK.nodes.find((candidate) => candidate.id === id) as Vec2;
      const cell = nearestWalkableCell(GRID, { x: node.x, y: node.y }, 3);
      expect(cell, id).not.toBeNull();
    }
  });

  test("a full lap round the loop, all four corners, never stalls", () => {
    // Four legs between the loop's four corners: each leg is planned by A* on
    // the real grid and then walked with the real movement rule, so this is a
    // lap of the walk as the farmer would make it.
    const points = loopPoints();
    const corner = (score: (point: Vec2) => number): Vec2 => {
      let best = points[0] as Vec2;
      for (const point of points) if (score(point) > score(best)) best = point;
      return best;
    };
    const corners = [
      corner((point) => -point.x - point.y), // west / north
      corner((point) => point.x - point.y), // east / north
      corner((point) => point.x + point.y), // east / south
      corner((point) => -point.x + point.y), // west / south
    ];
    let travelled = 0;
    for (let i = 0; i < corners.length; i += 1) {
      const from = approachTo(corners[i] as Vec2, 8);
      const to = approachTo(corners[(i + 1) % corners.length] as Vec2, 8);
      const walk = walkRoute(from, to, 900);
      expect(walk.ok, `leg ${i} did not arrive`).toBe(true);
      expect(walk.stalled, `leg ${i} stalled`).toBe(false);
      travelled += walk.travelledFt;
    }
    // Four corners, all the way round, and not by a shortcut.
    expect(travelled).toBeGreaterThan((NETWORK.perimeter?.loop.lengthFt ?? 0) * 0.95);
  });

  test("the routes to the six joined sections do not get worse", () => {
    const withWalkGrid = buildWalkableGrid(WORLD, NETWORK);
    const withoutWalkGrid = buildWalkableGrid(WORLD, NO_WALK);
    const spawn = WORLD.player.spawn;
    for (const section of WORLD.perimeter.connectors) {
      const entrance = entranceFor(NETWORK, section);
      const goal = approachTo({ x: entrance.x, y: entrance.y });
      const before = findRoute(withoutWalkGrid, spawn, goal);
      const after = findRoute(withWalkGrid, spawn, goal);
      expect(after, `${section} has no route with the loop`).not.toBeNull();
      expect(before, `${section} has no route without the loop`).not.toBeNull();
      // Added walkable ground can only shorten a route in principle; the
      // 2 % slack covers A* tie-breaking between equal-cost paths.
      const beforeFt = routeLength(before as never);
      expect(routeLength(after as never), `${section} got worse`).toBeLessThanOrEqual(beforeFt * 1.02);
    }
  });
});
