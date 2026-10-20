import { createWorldQueries, SOLIDS, surfaceHeight, type Solid } from "../sim/world.js";
import { actorBox } from "../sim/ribCollision.js";
import type { WorldQueries } from "../sim/types.js";
import { createSpatialIndex } from "./spatialIndex.js";
import type { Aabb, SpatialEntry, SpatialQuery } from "./types.js";

/** Candidate margin. Any superset of the touched solids, in roster order, gives
 * the exact same answer because the existing narrow phase still decides. */
const MARGIN = 1;
const TALL = 1e6;

export function solidEntries(solids: readonly Solid[]): SpatialEntry<Solid>[] {
  return solids.map(solid => ({ id: solid.id, kind: "solid" as const, bounds: solid, data: solid }));
}

/** Today's `WorldQueries` with the broad phase moved onto the spatial index:
 * each call narrows the roster to the solids near its own box, then runs the
 * unchanged narrow phase from `sim/world.ts` over that subset. Results are
 * identical to the full scan (see tests/world-queries.test.ts); cost scales
 * with nearby solids instead of the whole world. */
export function createIndexedWorldQueries(
  solids: readonly Solid[] = SOLIDS,
  floorHeight: (x: number, z: number) => number = surfaceHeight,
  index: SpatialQuery<Solid> = createSpatialIndex(solidEntries(solids)),
): WorldQueries {
  const subset = (box: Aabb): WorldQueries =>
    createWorldQueries(index.inBox(box, ["solid"]).map(e => e.data!), floorHeight);
  const grow = (box: Aabb, by: number): Aabb => ({
    min: { x: box.min.x - by, y: box.min.y - by, z: box.min.z - by },
    max: { x: box.max.x + by, y: box.max.y + by, z: box.max.z + by },
  });
  const full = createWorldQueries([], floorHeight);
  return {
    waterHeight: full.waterHeight,
    groundHeight: floorHeight,
    lineOfSight(a, b, ignore) {
      const list = index.alongSegment(a, b, MARGIN, ["solid"]).map(e => e.data!);
      return createWorldQueries(list, floorHeight).lineOfSight(a, b, ignore);
    },
    clearance(origin, capsule) {
      return subset(grow(actorBox(origin, capsule), MARGIN)).clearance(origin, capsule);
    },
    supportHeight(x, z, fromY) {
      return subset({ min: { x: x - MARGIN, y: -TALL, z: z - MARGIN }, max: { x: x + MARGIN, y: TALL, z: z + MARGIN } })
        .supportHeight(x, z, fromY);
    },
    moveCapsule(origin, delta, capsule, options) {
      // Slides never travel further than |delta| in total, so the actor box
      // grown by that length bounds every swept contact.
      const reach = Math.hypot(delta.x, delta.y, delta.z);
      const box = Number.isFinite(reach) ? grow(actorBox(origin, capsule), reach + MARGIN)
        : { min: { x: -TALL, y: -TALL, z: -TALL }, max: { x: TALL, y: TALL, z: TALL } };
      return subset(box).moveCapsule(origin, delta, capsule, options);
    },
  };
}
