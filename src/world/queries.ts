import type { Solid } from "../sim/world.js";
import type { SpatialEntry } from "./types.js";

/** Solids as spatial entries. `createWorldQueries` (sim/world.ts) indexes its
 * roster the same way for its broad phase; the world map's index uses these
 * entries so place queries see the same boxes. */
export function solidEntries(solids: readonly Solid[]): SpatialEntry<Solid>[] {
  return solids.map(solid => ({ id: solid.id, kind: "solid" as const, bounds: solid, data: solid }));
}
