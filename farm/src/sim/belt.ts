import { createRng } from "./rng";
import type { PathNetwork } from "./paths";
import type { BeltSpecies, ParcelSide, Vec2, World } from "./types";

/*  The tree belt: a decorative edge of trees just inside the parcel boundary.

    No collision — the parcel boundary and the paths-only rule already keep the
    farmer in, so these trees are drawn and nothing else. Everything is seeded
    from sim_overrides.buffer_zone, and every candidate is tested against the
    paths, the zones, the pond ring and the gate gap before it is kept. */

export interface BeltTree {
  x: number;
  y: number;
  side: ParcelSide;
  row: number;
  species: string;
  heightFt: number;
  canopyFt: number;
  /** 0..1 per-instance tint, from the seed. */
  tintMix: number;
  rotationRad: number;
}

export interface BeltDrop {
  reason: string;
  count: number;
}

export interface Belt {
  enabled: boolean;
  /** Distance from each boundary to the belt's inner edge. */
  innerEdgeFt: Record<ParcelSide, number>;
  trees: BeltTree[];
  candidates: number;
  dropped: BeltDrop[];
  species: Record<string, number>;
  count: number;
}

const SIDES: ParcelSide[] = ["west", "north", "east", "south"];

function speciesFor(world: World, pick: number): BeltSpecies {
  const total = world.buffer.species.reduce((sum, species) => sum + Math.max(species.weight, 0), 0);
  let roll = pick * total;
  for (const species of world.buffer.species) {
    roll -= Math.max(species.weight, 0);
    if (roll <= 0) return species;
  }
  return world.buffer.species[world.buffer.species.length - 1] as BeltSpecies;
}

/** Distance from a point to a segment. */
function segmentDistance(point: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

/**
 * Place the belt. `network` is the finished graph, so the trees are kept off
 * the garden walk as well as the trunks.
 */
export function bufferBelt(world: World, network: PathNetwork): Belt {
  const config = world.buffer;
  const W = world.parcel.widthFt;
  const D = world.parcel.depthFt;
  const innerEdgeFt: Record<ParcelSide, number> = {
    west: config.widthFt.west,
    north: config.widthFt.north,
    east: W - config.widthFt.east,
    south: D - config.widthFt.south,
  };

  const belt: Belt = {
    enabled: config.enabled,
    innerEdgeFt,
    trees: [],
    candidates: 0,
    dropped: [],
    species: {},
    count: 0,
  };
  if (!config.enabled) return belt;

  const drops = new Map<string, number>();
  const drop = (reason: string): void => {
    drops.set(reason, (drops.get(reason) ?? 0) + 1);
  };

  const rng = createRng(config.seed);
  const pond = world.zones.find((zone) => zone.circle);
  const ringReach = pond?.circle
    ? pond.circle.radiusFt + world.pond.rimOuterFt + world.pondRing.gapFt + world.pondRing.widthFt
    : 0;
  const gate = world.zones.find((zone) => zone.key === "gate");
  const gatePoint: Vec2 | null = gate ? { x: gate.box.x + gate.box.widthFt / 2, y: gate.box.y + gate.box.depthFt / 2 } : null;
  // The aperture the belt leaves for the gate: straight in from the gate post.
  const apertureEnd: Vec2 | null = gatePoint ? { x: gatePoint.x, y: innerEdgeFt.south } : null;

  const pathClearance = config.pathClearanceFt;
  const zoneClearance = config.zoneClearanceFt;

  const fits = (point: Vec2): string | null => {
    // 1. the gate gap: nothing grows in the way through
    if (gatePoint && apertureEnd && segmentDistance(point, gatePoint, apertureEnd) <= config.gateGapFt / 2) {
      return "gate gap";
    }
    // 2. path corridors, including the garden walk
    for (const edge of network.edges) {
      const clear = edge.widthFt / 2 + pathClearance;
      for (let i = 1; i < edge.points.length; i += 1) {
        if (segmentDistance(point, edge.points[i - 1] as Vec2, edge.points[i] as Vec2) < clear) return "path corridor";
      }
    }
    // 3. every zone footprint
    for (const zone of world.zones) {
      if (zone.circle) {
        if (Math.hypot(point.x - zone.circle.cx, point.y - zone.circle.cy) < zone.circle.radiusFt + zoneClearance) {
          return "pond water";
        }
        continue;
      }
      const inside =
        point.x > zone.box.x - zoneClearance &&
        point.x < zone.box.x + zone.box.widthFt + zoneClearance &&
        point.y > zone.box.y - zoneClearance &&
        point.y < zone.box.y + zone.box.depthFt + zoneClearance;
      if (inside) return `zone footprint (${zone.key})`;
    }
    // 4. the pond ring, which is walkable ground
    if (pond?.circle) {
      const d = Math.hypot(point.x - pond.circle.cx, point.y - pond.circle.cy);
      if (d < ringReach + pathClearance) return "pond ring";
    }
    return null;
  };

  for (const side of SIDES) {
    const width = config.widthFt[side];
    for (let row = 0; row < config.rows; row += 1) {
      // Rows are measured from the boundary inwards.
      const across = ((row + 0.5) / config.rows) * width;
      const alongLength = side === "west" || side === "east" ? D : W;
      const stagger = row % 2 === 0 ? 0 : config.spacingFt / 2;
      for (let alongBase = config.spacingFt / 2 + stagger; alongBase < alongLength; alongBase += config.spacingFt) {
        belt.candidates += 1;

        // Jitter both axes, then clip back into the band so a tree can never
        // wander out of the belt.
        const jitterAlong = rng.range(-config.jitterFt, config.jitterFt);
        const jitterAcross = rng.range(-config.jitterFt, config.jitterFt);
        const raw = (() => {
          switch (side) {
            case "west":
              return { x: across + jitterAcross, y: alongBase + jitterAlong };
            case "north":
              return { x: alongBase + jitterAlong, y: across + jitterAcross };
            case "east":
              return { x: W - across + jitterAcross, y: alongBase + jitterAlong };
            default:
              return { x: alongBase + jitterAlong, y: D - across + jitterAcross };
          }
        })();

        // The species pick is consumed for every candidate, so the stream — and
        // therefore the whole belt — is stable whatever gets dropped.
        const species = speciesFor(world, rng.next());
        const canopyFt = rng.range(species.canopyFt[0], species.canopyFt[1]);
        const heightRaw = rng.range(species.heightFt[0], species.heightFt[1]);
        const tintMix = rng.next();
        const rotationRad = rng.range(0, Math.PI * 2);

        // Only the axis across the belt is clipped into the band; the other
        // one simply stays inside the parcel.
        const alongValue = side === "west" || side === "east" ? raw.y : raw.x;
        const along = Math.min(Math.max(alongValue, 0.5), alongLength - 0.5);
        const acrossRaw =
          side === "west" ? raw.x : side === "east" ? W - raw.x : side === "north" ? raw.y : D - raw.y;
        const acrossClamped = Math.min(Math.max(acrossRaw, 0.5), width - 0.5);
        const point: Vec2 =
          side === "west"
            ? { x: acrossClamped, y: along }
            : side === "east"
              ? { x: W - acrossClamped, y: along }
              : side === "north"
                ? { x: along, y: acrossClamped }
                : { x: along, y: D - acrossClamped };

        const reason = fits(point);
        if (reason) {
          drop(reason);
          continue;
        }
        if (belt.trees.some((tree) => Math.hypot(tree.x - point.x, tree.y - point.y) < config.spacingFt * 0.5)) {
          drop("overlaps a neighbour");
          continue;
        }

        // A canopy that reaches the sky would hide the acre; the data caps it.
        const heightFt = Math.min(heightRaw, config.canopyTopLimitFt - canopyFt * 0.6);
        belt.trees.push({
          x: Math.round(point.x * 1000) / 1000,
          y: Math.round(point.y * 1000) / 1000,
          side,
          row,
          species: species.id,
          heightFt: Math.round(heightFt * 1000) / 1000,
          canopyFt: Math.round(canopyFt * 1000) / 1000,
          tintMix: Math.round(tintMix * 1000) / 1000,
          rotationRad: Math.round(rotationRad * 1000) / 1000,
        });
      }
    }
  }

  belt.count = belt.trees.length;
  belt.dropped = [...drops.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
  for (const tree of belt.trees) belt.species[tree.species] = (belt.species[tree.species] ?? 0) + 1;
  return belt;
}
