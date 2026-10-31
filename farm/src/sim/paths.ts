import { closestPointOnBox, distance } from "./geometry";
import { createRng } from "./rng";
import type { Vec2, World, Zone } from "./types";

/*  One path graph for the whole acre.

    NODES  a named entrance for every section, plus the meets, the beds
           corners and the pond ring's polygon nodes.
    EDGES  sampled centrelines between nodes. The ring is a closed polygon,
           so A* and the flood fill treat it like any other path.

    Every node is DERIVED: zone boxes come from the canon, doors from
    sim_overrides.doors, the ring radius from the pond and its rim. Nothing
    here is hand-placed, and no trunk enters a solid zone — the two solid
    entrances (the farmhouse door) end exactly on the wall. */

export type NodeRole = "entrance" | "meet" | "corner" | "ring";

export interface PathNode {
  id: string;
  x: number;
  y: number;
  role: NodeRole;
  /** Set on entrance nodes only: which section this node is the way in to. */
  section?: string;
}

export interface PathEdge {
  id: string;
  from: string;
  to: string;
  /** Drawn and walkable width. The ring is narrower than the trunks. */
  widthFt: number;
  kind: "trunk" | "ring";
  /** Densely sampled centreline; first point at `from`, last at `to`. */
  points: Vec2[];
}

export interface SteppingStone {
  x: number;
  y: number;
  sizeFt: number;
  rotationRad: number;
  edgeId: string;
}

export interface PondRing {
  centre: Vec2;
  radiusFt: number;
  /** Pond radius + rim + gap: the inner edge of the walkable corridor. */
  keepOutFt: number;
  widthFt: number;
  nodeIds: string[];
  /** The ring node the trunks join: the pond ring's own entrance. */
  entranceId: string;
}

export interface SectionEntrance {
  section: string;
  nodeId: string;
}

export interface PathNetwork {
  nodes: PathNode[];
  edges: PathEdge[];
  junctions: PathNode[];
  ring: PondRing | null;
  steppingStones: SteppingStone[];
  entrances: SectionEntrance[];
}

/** The sections the network must connect, in the order they are reported. */
export const SECTIONS = [
  "gate",
  "compost",
  "vegetable_beds",
  "goshala",
  "farmhouse",
  "orchard",
  "pond_ring",
] as const;

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

function zoneOf(world: World, key: string): Zone {
  const zone = world.zones.find((entry) => entry.key === key);
  if (!zone) throw new Error(`paths: the world has no zone "${key}"`);
  return zone;
}

export function zoneCentre(zone: Zone): Vec2 {
  return zone.circle
    ? { x: zone.circle.cx, y: zone.circle.cy }
    : { x: zone.box.x + zone.box.widthFt / 2, y: zone.box.y + zone.box.depthFt / 2 };
}

function boxCentre(zone: Zone): Vec2 {
  return { x: zone.box.x + zone.box.widthFt / 2, y: zone.box.y + zone.box.depthFt / 2 };
}

interface Corner {
  id: string;
  point: Vec2;
}

function boxCorners(box: { x: number; y: number; widthFt: number; depthFt: number }): Corner[] {
  return [
    { id: "sw", point: { x: box.x, y: box.y + box.depthFt } },
    { id: "se", point: { x: box.x + box.widthFt, y: box.y + box.depthFt } },
    { id: "ne", point: { x: box.x + box.widthFt, y: box.y } },
    { id: "nw", point: { x: box.x, y: box.y } },
  ];
}

/**
 * The fork point of the Y between the beds corner, the orchard and the ring.
 *
 * One trunk leaves the beds corner along the line to the FAR target (the ring)
 * and the near target (the orchard) peels off at the foot of its perpendicular
 * to that line. That is the shortest tree with a single shared trunk, and it
 * never doubles back; the clamp keeps the fork on the trunk, not on the ring.
 */
export function orchardForkPoint(apex: Vec2, a: Vec2, b: Vec2): Vec2 {
  const far = distance(apex, a) >= distance(apex, b) ? a : b;
  const near = far === a ? b : a;
  const length = distance(apex, far);
  if (length === 0) throw new Error("paths: the orchard trunk has zero length");
  const ux = (far.x - apex.x) / length;
  const uy = (far.y - apex.y) / length;
  const along = (near.x - apex.x) * ux + (near.y - apex.y) * uy;
  const t = Math.min(Math.max(along, length * 0.15), length * 0.85);
  return { x: round3(apex.x + ux * t), y: round3(apex.y + uy * t) };
}

/** The corner of a box nearest a point (the corner that faces it). */
function nearestCorner(zone: Zone, from: Vec2): Corner {
  const corners = boxCorners(zone.box);
  return corners.reduce((best, corner) =>
    distance(corner.point, from) < distance(best.point, from) ? corner : best,
  );
}

/** Quadratic Bézier through a bowed control point. */
export function smoothSpan(a: Vec2, b: Vec2, bendFt: number, samples: number): Vec2[] {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const px = -dy / length;
  const py = dx / length;
  const cx = mx + px * bendFt * 2;
  const cy = my + py * bendFt * 2;

  const points: Vec2[] = [];
  const steps = Math.max(2, Math.round(samples));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    points.push({
      x: round3(u * u * a.x + 2 * u * t * cx + t * t * b.x),
      y: round3(u * u * a.y + 2 * u * t * cy + t * t * b.y),
    });
  }
  return points;
}

function edgeSamples(a: Vec2, b: Vec2, bendFt = 0): Vec2[] {
  const length = distance(a, b);
  return smoothSpan(a, b, bendFt, Math.max(12, Math.round(length / 3)));
}

/* ------------------------------- the ring ------------------------------- */

/** Centreline radius: pond + rim thickness + gap + half the ring width. */
export function pondRingRadius(world: World): number {
  const pond = world.zones.find((zone) => zone.circle);
  if (!pond?.circle) throw new Error("paths: the world has no circular pond");
  return round3(
    pond.circle.radiusFt + world.pond.rimOuterFt + world.pondRing.gapFt + world.pondRing.widthFt / 2,
  );
}

/** The nearest point on the pond's water circle from a direction. */
export function pondEdgeToward(world: World, toward: Vec2): Vec2 {
  const pond = world.zones.find((zone) => zone.circle);
  if (!pond?.circle) throw new Error("paths: the world has no circular pond");
  const { cx, cy, radiusFt } = pond.circle;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  const length = Math.hypot(dx, dy) || 1;
  return { x: round3(cx + (dx / length) * radiusFt), y: round3(cy + (dy / length) * radiusFt) };
}

/* ------------------------------- the graph ------------------------------ */

function node(id: string, point: Vec2, role: NodeRole, section?: string): PathNode {
  return { id, x: round3(point.x), y: round3(point.y), role, ...(section ? { section } : {}) };
}

/**
 * The named entrance nodes. One per section, each derived from the canon
 * zone it opens onto and, for the two buildings, from the door data.
 */
export function deriveEntrances(world: World): PathNode[] {
  const gate = zoneOf(world, "gate");
  const compost = zoneOf(world, "compost");
  const beds = zoneOf(world, "vegetable_beds");
  const goshala = world.doors["goshala"];
  const farmhouse = world.doors["farmhouse"];
  if (!goshala || !farmhouse) throw new Error("paths: doors are missing from the overrides");
  const gateCentre = boxCentre(gate);

  return [
    node("gate", gateCentre, "entrance", "gate"),
    node("compost", closestPointOnBox(gateCentre, compost.box), "entrance", "compost"),
    node("beds_sw", closestPointOnBox(gateCentre, beds.box), "entrance", "vegetable_beds"),
    node("goshala_door", goshala.point, "entrance", "goshala"),
    node("farmhouse_door", farmhouse.point, "entrance", "farmhouse"),
    // The orchard is entered on the side facing the beds: its west / south-west edge.
    node("orchard_sw", closestPointOnBox(boxCentre(beds), zoneOf(world, "orchard").box), "entrance", "orchard"),
  ];
}

export function buildPathNetwork(world: World): PathNetwork {
  const beds = zoneOf(world, "vegetable_beds");
  const pond = world.zones.find((zone) => zone.circle);

  const entrances = deriveEntrances(world);
  const byId = new Map(entrances.map((entry) => [entry.id, entry]));
  const nodes: PathNode[] = [...entrances];

  const add = (entry: PathNode): PathNode => {
    nodes.push(entry);
    return entry;
  };

  /* ---- beds meets and corners: the loop around the beds block ----
     A meet faces the thing it leads to; a corner closes the loop round the
     block. Both come from the beds box, never from a typed coordinate. */
  const orchardNode = byId.get("orchard_sw") as PathNode;
  const orchardEntrance = { x: orchardNode.x, y: orchardNode.y };
  const goshalaDoor = world.doors["goshala"]?.point ?? boxCentre(beds);
  const farmhouseDoor = world.doors["farmhouse"]?.point ?? boxCentre(beds);
  const pondPosition = pond?.circle ? { x: pond.circle.cx, y: pond.circle.cy } : { x: 0, y: 0 };

  add(node("beds_to_goshala", closestPointOnBox(goshalaDoor, beds.box), "meet"));
  add(node("beds_to_farmhouse", closestPointOnBox(farmhouseDoor, beds.box), "meet"));
  add(node("beds_to_orchard", closestPointOnBox(orchardEntrance, beds.box), "meet"));
  add(node("beds_nw", boxCorners(beds.box)[3]?.point as Vec2, "corner"));
  // The south-east corner faces the water; the north-east one faces the orchard.
  add(node("beds_se", nearestCorner(beds, pondPosition).point, "corner"));
  add(node("beds_ne", nearestCorner(beds, orchardEntrance).point, "corner"));

  const edges: PathEdge[] = [];
  const seen = new Set<string>();
  const addEdge = (from: string, to: string, points: Vec2[], widthFt: number, kind: PathEdge["kind"], id?: string) => {
    const key = [from, to].sort().join("|");
    if (seen.has(key)) throw new Error(`paths: duplicate edge between ${from} and ${to}`);
    seen.add(key);
    edges.push({ id: id ?? `${from}--${to}`, from, to, widthFt, kind, points });
  };

  const nodePoint = (id: string): Vec2 => {
    const found = nodes.find((entry) => entry.id === id);
    if (!found) throw new Error(`paths: no node "${id}"`);
    return { x: found.x, y: found.y };
  };

  const trunk = (from: string, to: string, bendFt = 0) => {
    addEdge(from, to, edgeSamples(nodePoint(from), nodePoint(to), bendFt), world.paths.widthFt, "trunk");
  };

  /* ---- the pond ring: a closed polygon of `segments` nodes ---- */
  let ring: PondRing | null = null;
  if (world.pondRing.enabled) {
    if (!pond?.circle) throw new Error("paths: the ring is enabled but there is no circular pond");
    const centre = { x: round3(pond.circle.cx), y: round3(pond.circle.cy) };
    const radiusFt = pondRingRadius(world);
    const segments = Math.max(8, Math.round(world.pondRing.segments));
    const nodeIds: string[] = [];

    for (let i = 0; i < segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2;
      const id = `ring_${i}`;
      add(
        node(
          id,
          { x: centre.x + Math.cos(angle) * radiusFt, y: centre.y + Math.sin(angle) * radiusFt },
          "ring",
        ),
      );
      nodeIds.push(id);
    }

    for (let i = 0; i < segments; i += 1) {
      const from = nodeIds[i] as string;
      const to = nodeIds[(i + 1) % segments] as string;
      const a = nodePoint(from);
      const b = nodePoint(to);
      const startAngle = (i / segments) * Math.PI * 2;
      const endAngle = ((i + 1) / segments) * Math.PI * 2;
      const points: Vec2[] = [];
      const steps = 4;
      for (let s = 0; s <= steps; s += 1) {
        const angle = startAngle + ((endAngle - startAngle) * s) / steps;
        points.push({
          x: round3(centre.x + Math.cos(angle) * radiusFt),
          y: round3(centre.y + Math.sin(angle) * radiusFt),
        });
      }
      points[0] = { ...a };
      points[points.length - 1] = { ...b };
      addEdge(from, to, points, world.pondRing.widthFt, "ring", `ring:${i}`);
    }

    // The ring's own entrance: the ring node nearest the beds' orchard meet.
    const east = nodePoint("beds_to_orchard");
    let entranceId = nodeIds[0] as string;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const id of nodeIds) {
      const point = nodePoint(id);
      const d = distance(point, east);
      if (d < bestDistance) {
        bestDistance = d;
        entranceId = id;
      }
    }
    const entranceNode = nodes.find((entry) => entry.id === entranceId) as PathNode;
    entranceNode.role = "entrance";
    entranceNode.section = "pond_ring";

    ring = {
      centre,
      radiusFt,
      keepOutFt: round3(pond.circle.radiusFt + world.pond.rimOuterFt + world.pondRing.gapFt),
      widthFt: world.pondRing.widthFt,
      nodeIds,
      entranceId,
    };
  }

  /* ---- radial trunks (the required links) ---- */
  trunk("gate", "compost"); // gate - compost
  trunk("gate", "beds_sw"); // gate - beds
  trunk("beds_to_goshala", "goshala_door"); // beds - goshala door gap
  trunk("beds_to_farmhouse", "farmhouse_door"); // beds - farmhouse front door
  if (!ring) throw new Error("paths: the beds-to-pond trunk needs the ring");
  /*  The wedge between the beds corner, the orchard and the ring is one trunk
      that speaks once and then forks: beds corner -> fork -> orchard, and
      fork -> ring. The old shape sent two long legs out of the same node at a
      wide angle and left a wedge of open ground between them. */
  const apex = nodePoint("beds_to_orchard");
  const orchardPoint = nodePoint("orchard_sw");
  const ringPoint = nodePoint(ring.entranceId);
  add(node("orchard_fork", orchardForkPoint(apex, orchardPoint, ringPoint), "meet"));
  trunk("beds_to_orchard", "orchard_fork"); // the shared trunk out of the beds corner
  trunk("orchard_fork", "orchard_sw"); // beds - orchard, still a single edge
  trunk("orchard_fork", ring.entranceId); // beds - pond ring
  trunk("orchard_sw", ring.entranceId); // orchard - ring, kept: the loop closes

  /* ---- the loop around the beds block ---- */
  trunk("beds_sw", "beds_se");
  trunk("beds_se", "beds_to_orchard");
  trunk("beds_to_orchard", "beds_ne");
  trunk("beds_ne", "beds_to_goshala");
  trunk("beds_to_goshala", "beds_to_farmhouse");
  trunk("beds_to_farmhouse", "beds_nw");
  trunk("beds_nw", "beds_sw");

  /* ---- seams: what is left of a chain that never doubles back ---- */
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }
  const junctions = nodes.filter((entry) => (degree.get(entry.id) ?? 0) >= 3);

  /* ---- stepping stones on the crossing to the orchard ---- */
  const stoneEdge = edges.find((edge) => edge.id === "beds_to_orchard--orchard_fork");
  const steppingStones = stoneEdge
    ? steppingStonesAlong(stoneEdge, world.paths, world.paths.seed + 7)
    : [];

  const entranceRecords: SectionEntrance[] = nodes
    .filter((entry) => entry.role === "entrance" && entry.section)
    .map((entry) => ({ section: entry.section as string, nodeId: entry.id }));

  for (const section of SECTIONS) {
    const matches = entranceRecords.filter((entry) => entry.section === section);
    if (matches.length !== 1) {
      throw new Error(`paths: section "${section}" has ${matches.length} entrance nodes, expected exactly 1`);
    }
  }

  return { nodes, edges, junctions, ring, steppingStones, entrances: entranceRecords };
}

/** Evenly spaced stones with seeded sideways jitter. */
export function steppingStonesAlong(
  edge: PathEdge,
  config: { steppingIntervalFt: number; steppingJitterFt: number; steppingSizeFt: number },
  seed: number,
): SteppingStone[] {
  const rng = createRng(seed);
  const stones: SteppingStone[] = [];
  const spacing = Math.max(config.steppingIntervalFt, 1);

  let carried = 0;
  let nextAt = spacing * 0.5;

  for (let i = 1; i < edge.points.length; i += 1) {
    const a = edge.points[i - 1] as Vec2;
    const b = edge.points[i] as Vec2;
    const segment = distance(a, b);
    if (segment === 0) continue;

    while (carried + segment >= nextAt) {
      const t = (nextAt - carried) / segment;
      const cx = a.x + (b.x - a.x) * t;
      const cy = a.y + (b.y - a.y) * t;
      const nx = -(b.y - a.y) / segment;
      const ny = (b.x - a.x) / segment;
      const jitter = rng.range(-config.steppingJitterFt, config.steppingJitterFt);
      stones.push({
        x: round3(cx + nx * jitter),
        y: round3(cy + ny * jitter),
        sizeFt: round3(config.steppingSizeFt * rng.range(0.85, 1.15)),
        rotationRad: round3(rng.range(0, Math.PI * 2)),
        edgeId: edge.id,
      });
      nextAt += spacing;
    }
    carried += segment;
  }

  return stones;
}

/* ------------------------------- queries -------------------------------- */

export function nodeById(network: PathNetwork, id: string): PathNode {
  const found = network.nodes.find((entry) => entry.id === id);
  if (!found) throw new Error(`paths: no node "${id}"`);
  return found;
}

export function entranceFor(network: PathNetwork, section: string): PathNode {
  const record = network.entrances.find((entry) => entry.section === section);
  if (!record) throw new Error(`paths: section "${section}" has no entrance`);
  return nodeById(network, record.nodeId);
}

export function edgeLength(edge: PathEdge): number {
  let total = 0;
  for (let i = 1; i < edge.points.length; i += 1) {
    total += distance(edge.points[i - 1] as Vec2, edge.points[i] as Vec2);
  }
  return total;
}

export function totalLength(network: PathNetwork): number {
  return network.edges.reduce((sum, edge) => sum + edgeLength(edge), 0);
}

/** True when a point sits within `widthFt/2` of any edge's centreline. */
export function pointOnPath(network: PathNetwork, point: Vec2, widthFt: number): boolean {
  const half = widthFt / 2;
  for (const edge of network.edges) {
    for (let i = 1; i < edge.points.length; i += 1) {
      const a = edge.points[i - 1] as Vec2;
      const b = edge.points[i] as Vec2;
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const lengthSq = abx * abx + aby * aby;
      const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((point.x - a.x) * abx + (point.y - a.y) * aby) / lengthSq));
      if (Math.hypot(point.x - (a.x + abx * t), point.y - (a.y + aby * t)) <= half) return true;
    }
  }
  return false;
}

/** Shortest distance from a point to the network's centrelines. */
export function distanceToPath(network: PathNetwork, point: Vec2): number {
  let best = Number.POSITIVE_INFINITY;
  for (const edge of network.edges) {
    for (let i = 1; i < edge.points.length; i += 1) {
      const a = edge.points[i - 1] as Vec2;
      const b = edge.points[i] as Vec2;
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const lengthSq = abx * abx + aby * aby;
      const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((point.x - a.x) * abx + (point.y - a.y) * aby) / lengthSq));
      const d = Math.hypot(point.x - (a.x + abx * t), point.y - (a.y + aby * t));
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * Signed room to spare for the farmer's CENTRE: >= 0 means the body (radius
 * `radiusFt`) fits entirely inside some edge's drawn width. Per edge, so the
 * narrower ring keeps its own room instead of inheriting the trunk width.
 */
export function pathMargin(network: PathNetwork, point: Vec2, radiusFt: number): number {
  let best = Number.NEGATIVE_INFINITY;
  for (const edge of network.edges) {
    const allowed = edge.widthFt / 2 - radiusFt;
    for (let i = 1; i < edge.points.length; i += 1) {
      const a = edge.points[i - 1] as Vec2;
      const b = edge.points[i] as Vec2;
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const lengthSq = abx * abx + aby * aby;
      const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((point.x - a.x) * abx + (point.y - a.y) * aby) / lengthSq));
      const margin = allowed - Math.hypot(point.x - (a.x + abx * t), point.y - (a.y + aby * t));
      if (margin > best) best = margin;
    }
  }
  return best === Number.NEGATIVE_INFINITY ? Number.NEGATIVE_INFINITY : round3(best);
}
