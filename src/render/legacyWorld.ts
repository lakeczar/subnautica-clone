import { REGIONS, type RegionId } from "../content/registry.js";
import { ROUTE_REGIONS } from "../content/routes.js";
import { terrainHeight } from "../sim/world.js";
import { CHUNK_SIZE, WORLD_ENVELOPE, chunkId, columnRect, rectContains, rectsIntersect, resolveLod } from "../world/frame.js";
import { sampleRange } from "../world/map.js";
import type { Aabb, BiomeDescriptor, ChunkDescriptor, LodBands, Rect, RegionDescriptor, RegionLink, WorldLayout } from "../world/types.js";
import { LEGACY_TERRAIN_FACTORY } from "./legacyTerrain.js";
import { TERRAIN_EXTENT } from "./terrainSurface.js";

/** Today's four route regions as world descriptors, for the interim legacy
 * region owners and today's refined terrain. S2's authored layout replaces
 * the geography; this file keeps the existing renderer's behaviour as data.
 *
 * Footprints are the render handover lines the renderer always used (earlier
 * footprints win). Links carry the detailed-pair prefetch zones: beside its
 * own region the renderer keeps the linked region whose portal is nearest to
 * the viewer, ties to the earlier link. A portal covering the envelope is the
 * fallback neighbour. `hold` boxes are the handover hysteresis. */

const env = WORLD_ENVELOPE;
const bits = new Float64Array(1), word = new BigInt64Array(bits.buffer);
/** Adjacent doubles: strict inequalities as inclusive rectangles. */
const nextUp = (n: number): number => { bits[0] = n; word[0]! += n >= 0 ? 1n : -1n; return bits[0]!; };
const nextDown = (n: number): number => { bits[0] = n; word[0]! += n > 0 ? -1n : 1n; return bits[0]!; };
const rect = (minX: number, maxX: number, minZ: number, maxZ: number): Rect => ({ minX, maxX, minZ, maxZ });
const ALL = rect(env.min.x, env.max.x, env.min.z, env.max.z);
const column = (r: Rect): Aabb => ({ min: { x: r.minX, y: env.min.y, z: r.minZ }, max: { x: r.maxX, y: env.max.y, z: r.maxZ } });

const basin = ROUTE_REGIONS.silt_basin.bounds, canopy = ROUTE_REGIONS.suspended_garden.bounds;
/** Detailed render regions, in footprint priority order. */
const FOOTPRINTS: readonly [RegionId, Rect][] = [
  ["silt_basin", rect(basin.minX, env.max.x, env.min.z, basin.maxZ)],
  // The outer return lane is east of the Canopy bounds, in the same visible
  // corridor: its landmark does not unload merely because a return crosses it.
  ["suspended_garden", rect(canopy.minX, env.max.x, env.min.z, canopy.maxZ)],
  ["island_chain", rect(nextUp(-30), nextDown(70), env.min.z, nextDown(-22))],
  ["refuge_reef", ALL],
];
/** Eight metres of hysteresis across the shared Canopy-Basin edge only. */
const EDGE = basin.maxZ, HOLD = 8;
const LINKS: Readonly<Record<string, readonly [RegionId, Rect, Rect?][]>> = {
  silt_basin: [["suspended_garden", ALL, rect(env.min.x, env.max.x, nextUp(EDGE - HOLD), env.max.z)]],
  suspended_garden: [["silt_basin", rect(env.min.x, env.max.x, env.min.z, nextDown(-154)), rect(env.min.x, env.max.x, env.min.z, nextDown(EDGE + HOLD))],
    ["refuge_reef", ALL], ["island_chain", ALL]],
  island_chain: [["suspended_garden", rect(nextUp(42), env.max.x, env.min.z, nextDown(-52))], ["refuge_reef", ALL]],
  refuge_reef: [["suspended_garden", rect(nextUp(48), env.max.x, env.min.z, nextDown(-48))], ["island_chain", ALL]],
};

/** Legacy terrain is one recipe at every LOD and is drawn to the camera's
 * 450 m far plane, as the single mesh was. */
export const LEGACY_LOD: LodBands = { fine: 480, coarse: 480, hysteresis: 16 };
const BIOMES: readonly BiomeDescriptor[] = [{ id: "legacy", label: "Legacy route", lod: LEGACY_LOD }];

function regions(): RegionDescriptor[] {
  return FOOTPRINTS.map(([id, footprint]) => ({
    id, footprint: [footprint], bounds: column(footprint), biomes: ["legacy"],
    adjacency: LINKS[id]!.map(([to, zone, hold]): RegionLink => ({ to, kind: "open", portal: column(zone),
      ...(hold ? { hold: column(hold) } : {}) })),
    access: { depthRatingM: Math.max(0, REGIONS[id].depth[1]), entrances: [] },
  }));
}

/** Columns that hold some of today's refined terrain. */
export function legacyTerrainColumn(r: Rect): boolean {
  return rectsIntersect(r, TERRAIN_EXTENT);
}

/** Adds today's terrain to every column it covers: `legacy.terrain` art on
 * the column's layer 0, creating that chunk when the layout has none. A
 * column holding only legacy terrain draws to the far plane (LEGACY_LOD). */
export function withLegacyTerrain(layout: WorldLayout): WorldLayout {
  const { envelope, chunkSize } = layout;
  const chunks = [...layout.chunks];
  const at = new Map(chunks.map((c, i) => [c.id, i] as const));
  for (let ix = 0; ix < (envelope.max.x - envelope.min.x) / chunkSize; ix++)
    for (let iz = 0; iz < (envelope.max.z - envelope.min.z) / chunkSize; iz++) {
      const r = columnRect(ix, iz, envelope, chunkSize);
      if (!legacyTerrainColumn(r)) continue;
      const cell = { ix, iz, layer: 0 }, id = chunkId(cell);
      const { minY, maxY } = sampleRange(terrainHeight, r, 8, 12);
      const art = { factory: LEGACY_TERRAIN_FACTORY };
      const existing = at.get(id);
      if (existing !== undefined) {
        const c = chunks[existing]!;
        if (c.art.some(a => a.factory === LEGACY_TERRAIN_FACTORY)) continue;
        chunks[existing] = {
          ...c, art: [art, ...c.art],
          bounds: { min: { ...c.bounds.min, y: Math.min(c.bounds.min.y, minY) }, max: { ...c.bounds.max, y: Math.max(c.bounds.max.y, maxY) } },
          ...(c.art.length ? {} : { lod: LEGACY_LOD }),
        };
        continue;
      }
      const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
      const region = layout.regions.find(g => g.footprint.some(f => rectContains(f, cx, cz))) ?? layout.regions[0]!;
      const descriptor: ChunkDescriptor = {
        id, cell, region: region.id, biome: region.biomes[0]!, art: [art], lod: resolveLod(LEGACY_LOD),
        bounds: { min: { x: r.minX, y: Math.max(envelope.min.y, minY), z: r.minZ },
          max: { x: r.maxX, y: Math.min(envelope.max.y, maxY), z: r.maxZ } },
      };
      chunks.push(descriptor);
    }
  return { ...layout, chunks };
}

/** Today's world: the four route regions, with the refined terrain chunked. */
export function legacyLayout(): WorldLayout {
  return withLegacyTerrain({ envelope: env, chunkSize: CHUNK_SIZE, biomes: BIOMES, regions: regions(), chunks: [] });
}
