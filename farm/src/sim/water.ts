import { SimError } from "./errors";
import { zoneByKey } from "./canon";
import type { Vec2, World } from "./types";

/*  The tank: a fixed number of waterings, refilled only at the pond. */

export interface Tank {
  level: number;
  capacity: number;
}

export function createTank(world: World): Tank {
  return { level: world.water.capacity, capacity: world.water.capacity };
}

export function spendWater(tank: Tank, perUse: number): Tank {
  if (tank.level < perUse) {
    throw new SimError("TANK_EMPTY", `the tank is empty (0/${tank.capacity}) — refill at the pond`);
  }
  return { level: tank.level - perUse, capacity: tank.capacity };
}

/** Refill only while standing beside the pond. */
export function refillTank(tank: Tank, world: World, position: Vec2): Tank {
  const pond = zoneByKey(world, world.water.refillZone);
  if (!pond?.circle) throw new Error(`water.refill_zone "${world.water.refillZone}" is not a circular zone`);
  const reach = pond.circle.radiusFt + world.water.refillBufferFt;
  const distance = Math.hypot(position.x - pond.circle.cx, position.y - pond.circle.cy);
  if (distance > reach) {
    throw new SimError("NOT_AT_POND", "walk to the pond to refill");
  }
  if (tank.level >= tank.capacity) {
    throw new SimError("TANK_FULL", "the tank is already full");
  }
  return { level: tank.capacity, capacity: tank.capacity };
}
