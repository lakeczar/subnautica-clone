import { PLACES } from "../../content/registry.js";
import type { Vec3, WorldQueries } from "../types.js";
import type { EcologyWorld } from "./types.js";

/** Today's refuges. The coordinator replaces this with the composed refuge
 * list (mobile refuges included) when ecology joins step.ts. */
export const CURRENT_REFUGES: EcologyWorld["refuges"] = [
  { position: PLACES.home_pod.position, radius: 10 },
  { position: PLACES.island_workshop.position, radius: 9 },
  { position: PLACES.canopy_lab.position, radius: 8 },
];

/** Adapter over `sim/world.ts` WorldQueries. S1's index can supply the same
 * three calls; ecology never reads solids or terrain tables directly. */
export function ecologyWorldFrom(world: WorldQueries, refuges: EcologyWorld["refuges"] = CURRENT_REFUGES): EcologyWorld {
  return {
    waterY: world.waterHeight,
    floor: (x, z) => world.groundHeight(x, z),
    clearLine: (a, b) => world.lineOfSight(a, b),
    refuges,
  };
}

/** Open water with an optional flat floor and box solids, for tests and the
 * creature viewer, where the later regions are not yet authored terrain. */
export function openWater(options: { floorY?: number; solids?: readonly { min: Vec3; max: Vec3 }[]; refuges?: EcologyWorld["refuges"] } = {}): EcologyWorld {
  const floorY = options.floorY ?? -Infinity, solids = options.solids ?? [];
  return {
    waterY: 0,
    floor: () => floorY,
    clearLine: (a, b) => solids.every(s => !segmentHitsBox(a, b, s)),
    refuges: options.refuges ?? [],
  };
}
function segmentHitsBox(a: Vec3, b: Vec3, box: { min: Vec3; max: Vec3 }): boolean {
  let t0 = 0, t1 = 1;
  for (const axis of ["x", "y", "z"] as const) {
    const d = b[axis] - a[axis];
    if (Math.abs(d) < 1e-12) {
      if (a[axis] < box.min[axis] || a[axis] > box.max[axis]) return false;
      continue;
    }
    const u = (box.min[axis] - a[axis]) / d, w = (box.max[axis] - a[axis]) / d;
    t0 = Math.max(t0, Math.min(u, w));
    t1 = Math.min(t1, Math.max(u, w));
    if (t0 > t1) return false;
  }
  return true;
}
