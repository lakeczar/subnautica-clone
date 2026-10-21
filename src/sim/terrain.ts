import { SOURCES } from "../content/registry.js";
import { BASIN_FRACTURE, BASIN_GEOMETRY, LEGACY_TERRAIN_SOURCE_IDS, LEGACY_WORLD_BOUNDS, M2A_BASIN_MIN_Z,
  ROUTE_TERRAIN_SOURCE_IDS } from "../content/routes.js";

/** B1's heightfield, kept apart from `sim/world.ts` so S2's composed floor can
 * wrap it without an import cycle (`content/regions/worldFloor.ts`). */
export const RESCUE_BENCH = { minX: 38, maxX: 54, minZ: -60, maxZ: -48, y: -13 } as const;

/** Shared deterministic height field. Renderer samples this very function. */
export function legacyTerrainHeight(x: number, z: number): number {
  const shelf = -8.8 + Math.sin(x * 0.105) * 0.52 + Math.cos(z * 0.12) * 0.42;
  const beach = 16.8 * Math.exp(-((x - 9) ** 2 / 620 + (z + 57) ** 2 / 680));
  const westPeak = 13 * Math.exp(-((x + 1) ** 2 / 78 + (z + 62) ** 2 / 115));
  const eastPeak = 18 * Math.exp(-((x - 19) ** 2 / 65 + (z + 64) ** 2 / 90));
  const canopy = 155 * Math.max(0, Math.min(1, (x - 42) / 60));
  const reefBowl = 22 * Math.exp(-((x + 32) ** 2 / 190 + (z + 24) ** 2 / 190));
  let height = shelf + beach + westPeak + eastPeak - canopy - reefBowl;
  // Authored source ledges share their actual collision/terrain authority. No floating loot.
  for (const id of LEGACY_TERRAIN_SOURCE_IDS) {
    const source = SOURCES[id];
    if (source.position.y > 0 || source.item === "meal") continue;
    const weight = Math.exp(
      -((x - source.position.x) ** 2 + (z - source.position.z) ** 2) / 18,
    );
    height = height * (1 - weight) + (source.position.y - 0.8) * weight;
  }
  // The workshop apron continues into a broad submerged approach. Blend the
  // edges into the island rather than putting an impassable lip at the shore.
  const smooth = (a: number, b: number, v: number): number => {
    const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const apron = smooth(1, 3, x) * (1 - smooth(16, 18, x)) *
    smooth(-44, -40, z) * (1 - smooth(-22, -18, z));
  const approachY = 1.2 - Math.max(0, z + 31) * 0.55;
  height = height * (1 - apron) + approachY * apron;
  // Shallow recovery staging bench.
  if (x >= RESCUE_BENCH.minX && x <= RESCUE_BENCH.maxX &&
      z >= RESCUE_BENCH.minZ && z <= RESCUE_BENCH.maxZ) height = RESCUE_BENCH.y;
  return height;
}

const smoothstep = (a: number, b: number, v: number): number => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Additional depth south of the M2-A edge: a gentle terrace descent plus the
 * boundary fracture trench. Zero at and north of z = -262, so the accepted Basin
 * surface (to -260) is unchanged. */
export function fractureDepth(x: number, z: number): number {
  const f = BASIN_FRACTURE;
  const shelf = f.shelfDrop * smoothstep(f.shelfStartZ, f.shelfFullZ, z);
  const across = smoothstep(f.minX, f.fullMinX, x) * (1 - smoothstep(f.fullMaxX, f.maxX, x));
  const lip = smoothstep(f.lipStartZ, f.lipFullZ, z);
  return shelf + f.depth * Math.exp(-((z - f.centerZ) ** 2) / f.sigma2) * across * lip;
}

/** B1's accepted heightfield: the old rectangle bit-identical, including source
 * order and zero-weight math. Basin relief is local to the adjoining extension;
 * its new sources never feed the old loop. S2's `worldFloor` returns exactly
 * this inside `LEGACY_PRESERVE`; legacy art samples it directly. */
export function legacyWorldHeight(x: number, z: number): number {
  let height = legacyTerrainHeight(x, z);
  if (x >= LEGACY_WORLD_BOUNDS.minX && x <= LEGACY_WORLD_BOUNDS.maxX &&
      z >= LEGACY_WORLD_BOUNDS.minZ && z <= LEGACY_WORLD_BOUNDS.maxZ) return height;
  const t = Math.max(0, Math.min(1, (-z - 184) / 76));
  height -= 36 * t * t * (3 - 2 * t) * Math.max(0, Math.min(1, (x - 74) / 24));
  if (z < M2A_BASIN_MIN_Z) height -= fractureDepth(x, z);
  for (const id of ROUTE_TERRAIN_SOURCE_IDS) {
    const source = SOURCES[id], r2 = (x - source.position.x) ** 2 + (z - source.position.z) ** 2;
    if (r2 >= 144) continue;
    const weight = (Math.exp(-r2 / 18) - Math.exp(-8)) / (1 - Math.exp(-8));
    height = height * (1 - weight) + (source.position.y - 0.8) * weight;
  }
  for (const pad of BASIN_GEOMETRY.terrainPads)
    if (x >= pad.minX && x <= pad.maxX && z >= pad.minZ && z <= pad.maxZ) height = Math.max(height, pad.y);
  return height;
}
