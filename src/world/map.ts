import type { RegionId } from "../content/registry.js";
import { boxDistance, chunkId, columnAt, columnRect, rectContains, rectsIntersect, resolveLod } from "./frame.js";
import { createSpatialIndex } from "./spatialIndex.js";
import type { Aabb, ChunkArtRef, ChunkDescriptor, ChunkId, Rect, RegionDescriptor, SpatialEntry,
  Vec3, WorldLayout, WorldMap } from "./types.js";

/** Every structural problem in a layout, as short readable strings. An empty
 * list means the layout can be composed. */
export function validateLayout(layout: WorldLayout): string[] {
  const problems: string[] = [];
  const { envelope: env, chunkSize: size } = layout;
  const spanX = env.max.x - env.min.x, spanZ = env.max.z - env.min.z;
  if (!(size > 0) || spanX % size !== 0 || spanZ % size !== 0)
    problems.push(`envelope ${spanX}x${spanZ} m is not a whole number of ${size} m chunks`);
  const biomes = new Set<string>();
  for (const b of layout.biomes) {
    if (biomes.has(b.id)) problems.push(`duplicate biome ${b.id}`);
    biomes.add(b.id);
  }
  const regions = new Map<RegionId, RegionDescriptor>();
  for (const r of layout.regions) {
    if (regions.has(r.id)) problems.push(`duplicate region ${r.id}`);
    regions.set(r.id, r);
  }
  const lodOk = (where: string, lod: ReturnType<typeof resolveLod>): void => {
    if (!(lod.fine > 0 && lod.coarse >= lod.fine && lod.hysteresis >= 0))
      problems.push(`${where}: LOD bands must satisfy 0 < fine <= coarse, hysteresis >= 0`);
  };
  for (const r of layout.regions) {
    if (!boxValid(r.bounds)) problems.push(`region ${r.id}: invalid bounds`);
    if (!r.footprint.length) problems.push(`region ${r.id}: empty footprint`);
    for (const f of r.footprint)
      if (!(f.minX < f.maxX && f.minZ < f.maxZ) || f.minX < r.bounds.min.x || f.maxX > r.bounds.max.x ||
        f.minZ < r.bounds.min.z || f.maxZ > r.bounds.max.z)
        problems.push(`region ${r.id}: footprint rectangle outside its bounds or empty`);
    if (!r.biomes.length) problems.push(`region ${r.id}: no biome`);
    for (const b of r.biomes) if (!biomes.has(b)) problems.push(`region ${r.id}: unknown biome ${b}`);
    for (const link of r.adjacency) {
      const other = regions.get(link.to);
      if (!other) { problems.push(`region ${r.id}: link to unknown region ${link.to}`); continue; }
      if (!other.adjacency.some(l => l.to === r.id)) problems.push(`region ${r.id}: link to ${link.to} is not reciprocated`);
      if (!boxValid(link.portal)) problems.push(`region ${r.id}: invalid portal to ${link.to}`);
    }
    const entrances = new Set<string>();
    for (const e of r.access.entrances) {
      if (entrances.has(e.id)) problems.push(`region ${r.id}: duplicate entrance ${e.id}`);
      entrances.add(e.id);
      if (!within(r.bounds, e.position)) problems.push(`region ${r.id}: entrance ${e.id} outside region bounds`);
    }
    lodOk(`region ${r.id}`, resolveLod(r.lod));
  }
  const ids = new Set<ChunkId>(), columns = new Map<string, ChunkDescriptor[]>();
  for (const c of layout.chunks) {
    const where = `chunk ${c.id}`;
    if (ids.has(c.id)) problems.push(`duplicate ${where}`);
    ids.add(c.id);
    if (c.id !== chunkId(c.cell)) problems.push(`${where}: id does not match cell`);
    const rect = columnRect(c.cell.ix, c.cell.iz, env, size);
    if (c.cell.ix < 0 || c.cell.iz < 0 || rect.maxX > env.max.x || rect.maxZ > env.max.z)
      problems.push(`${where}: cell outside the envelope`);
    if (c.bounds.min.x !== rect.minX || c.bounds.max.x !== rect.maxX ||
      c.bounds.min.z !== rect.minZ || c.bounds.max.z !== rect.maxZ)
      problems.push(`${where}: X/Z bounds differ from its grid cell`);
    if (!boxValid(c.bounds) || c.bounds.min.y < env.min.y || c.bounds.max.y > env.max.y)
      problems.push(`${where}: Y extent invalid or outside the envelope`);
    if (!regions.has(c.region)) problems.push(`${where}: unknown region ${c.region}`);
    if (!biomes.has(c.biome)) problems.push(`${where}: unknown biome ${c.biome}`);
    lodOk(where, c.lod);
    const k = `${c.cell.ix}:${c.cell.iz}`;
    columns.set(k, [...(columns.get(k) ?? []), c]);
  }
  for (const [k, layers] of columns) {
    if (!layers.some(c => c.cell.layer === 0)) problems.push(`column ${k}: no layer 0`);
    const sorted = [...layers].sort((a, b) => a.bounds.min.y - b.bounds.min.y);
    for (let i = 1; i < sorted.length; i++)
      if (sorted[i]!.bounds.min.y < sorted[i - 1]!.bounds.max.y)
        problems.push(`column ${k}: layers ${sorted[i - 1]!.id} and ${sorted[i]!.id} overlap in Y`);
  }
  return problems;
}

/** Compose a validated layout and its place entries into one map. Throws with
 * every problem listed, so a bad layout fails at composition, not in play. */
export function createWorldMap<T = unknown>(layout: WorldLayout, entries: readonly SpatialEntry<T>[] = []): WorldMap<T> {
  const problems = validateLayout(layout);
  if (problems.length) throw new Error(`Invalid world layout:\n- ${problems.join("\n- ")}`);
  const index = createSpatialIndex(entries);
  const regions = new Map(layout.regions.map(r => [r.id, r] as const));
  const chunks = new Map(layout.chunks.map(c => [c.id, c] as const));
  const columns = new Map<string, ChunkDescriptor[]>();
  for (const c of layout.chunks) {
    const k = `${c.cell.ix}:${c.cell.iz}`;
    columns.set(k, [...(columns.get(k) ?? []), c].sort((a, b) => a.bounds.min.y - b.bounds.min.y));
  }
  const chunkAt = (p: Readonly<Vec3>): ChunkDescriptor | null => {
    const col = columnAt(p.x, p.z, layout.envelope, layout.chunkSize);
    const layers = col && columns.get(`${col.ix}:${col.iz}`);
    if (!layers) return null;
    let best = layers[0]!, bestGap = Infinity;
    for (const c of layers) {
      const gap = Math.max(c.bounds.min.y - p.y, 0, p.y - c.bounds.max.y);
      if (gap < bestGap) { best = c; bestGap = gap; }
    }
    return best;
  };
  return {
    layout,
    index,
    region: id => regions.get(id),
    chunk: id => chunks.get(id),
    chunkAt,
    // Footprints are finer than 128 m columns; a chunk's region is only its
    // primary owner. Outside every footprint, fall back to that owner.
    regionAt: p => layout.regions.find(r => r.footprint.some(f => rectContains(f, p.x, p.z)))?.id ??
      chunkAt(p)?.region ?? null,
    chunksWithin(p, radius) {
      const { envelope: env, chunkSize: size } = layout;
      const x0 = Math.max(0, Math.floor((p.x - radius - env.min.x) / size));
      const x1 = Math.min((env.max.x - env.min.x) / size - 1, Math.floor((p.x + radius - env.min.x) / size));
      const z0 = Math.max(0, Math.floor((p.z - radius - env.min.z) / size));
      const z1 = Math.min((env.max.z - env.min.z) / size - 1, Math.floor((p.z + radius - env.min.z) / size));
      const out: { chunk: ChunkDescriptor; distance: number }[] = [];
      for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++)
        for (const chunk of columns.get(`${ix}:${iz}`) ?? []) {
          const distance = boxDistance(chunk.bounds, p);
          if (distance <= radius) out.push({ chunk, distance });
        }
      return out.sort((a, b) => a.distance - b.distance || (a.chunk.id < b.chunk.id ? -1 : 1));
    },
  };
}

export interface DeriveChunkOptions {
  /** Vertical content extent of the terrain layer in this column. */
  terrainRange(rect: Rect, region: RegionDescriptor): { minY: number; maxY: number };
  /** Art references for the terrain layer of one column. */
  art(region: RegionDescriptor, biome: string, rect: Rect): readonly ChunkArtRef[];
  priority?(region: RegionDescriptor, rect: Rect): number | undefined;
}

/** Layer-0 chunks for every column that a region footprint covers. The owner
 * is the first region (layout order) whose footprint contains the column
 * centre, else the one overlapping it most. Authors add upper layers and
 * per-chunk overrides on top of this. */
export function deriveTerrainChunks(layout: Omit<WorldLayout, "chunks">, options: DeriveChunkOptions): ChunkDescriptor[] {
  const { envelope: env, chunkSize: size } = layout;
  const biomes = new Map(layout.biomes.map(b => [b.id, b] as const));
  const out: ChunkDescriptor[] = [];
  for (let ix = 0; ix < (env.max.x - env.min.x) / size; ix++)
    for (let iz = 0; iz < (env.max.z - env.min.z) / size; iz++) {
      const rect = columnRect(ix, iz, env, size);
      const cx = (rect.minX + rect.maxX) / 2, cz = (rect.minZ + rect.maxZ) / 2;
      let owner = layout.regions.find(r => r.footprint.some(f => rectContains(f, cx, cz)));
      if (!owner) {
        let bestArea = 0;
        for (const r of layout.regions) {
          const area = r.footprint.reduce((n, f) => n + (rectsIntersect(f, rect)
            ? (Math.min(f.maxX, rect.maxX) - Math.max(f.minX, rect.minX)) *
              (Math.min(f.maxZ, rect.maxZ) - Math.max(f.minZ, rect.minZ)) : 0), 0);
          if (area > bestArea) { bestArea = area; owner = r; }
        }
      }
      if (!owner) continue;
      const biome = owner.biomes[0]!;
      const { minY, maxY } = options.terrainRange(rect, owner);
      const cell = { ix, iz, layer: 0 };
      const priority = options.priority?.(owner, rect);
      out.push({
        id: chunkId(cell), cell, region: owner.id, biome,
        bounds: { min: { x: rect.minX, y: Math.max(env.min.y, minY), z: rect.minZ },
          max: { x: rect.maxX, y: Math.min(env.max.y, maxY), z: rect.maxZ } },
        lod: resolveLod(biomes.get(biome)?.lod, owner.lod),
        art: options.art(owner, biome, rect),
        ...(priority === undefined ? {} : { priority }),
      });
    }
  return out;
}

/** Sampled vertical range of a height function over a rectangle, padded. */
export function sampleRange(height: (x: number, z: number) => number, rect: Rect,
  step = 8, pad = 4): { minY: number; maxY: number } {
  let minY = Infinity, maxY = -Infinity;
  for (let x = rect.minX; x <= rect.maxX; x += step) for (let z = rect.minZ; z <= rect.maxZ; z += step) {
    const y = height(x, z);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { minY: minY - pad, maxY: maxY + pad };
}

function boxValid(b: Aabb): boolean {
  return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].every(Number.isFinite) &&
    b.min.x <= b.max.x && b.min.y <= b.max.y && b.min.z <= b.max.z;
}
function within(b: Aabb, p: Readonly<Vec3>): boolean {
  return p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y && p.z >= b.min.z && p.z <= b.max.z;
}
