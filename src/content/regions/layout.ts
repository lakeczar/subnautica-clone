import type { RegionId } from "../registry.js";
import { CHUNK_SIZE, WORLD_ENVELOPE, chunkId, columnRect, rectContains, resolveLod } from "../../world/frame.js";
import type { AccessKind, AccessPoint, Aabb, BiomeDescriptor, ChunkArtRef, ChunkDescriptor, Rect, RegionDescriptor,
  RegionLink, Vec3, WorldLayout } from "../../world/types.js";
import { ROUTES } from "./passages.js";
import { SITES } from "./sites.js";
import { STRUCTURES } from "./structures.js";
import { TERRAIN_EXTENT } from "../../render/terrainSurface.js";
import { MERIDIAN_CENTRE, MERIDIAN_TERRACES, terrainMasks, type TerrainMasks } from "./terrain.js";
import { worldFloor } from "./worldFloor.js";

/** S2 whole-world layout: biomes, seven region descriptors with footprints,
 * adjacency derived from the authored passages, entrances, and one terrain
 * chunk per 128 m column. Descriptors are plain data on S1's types. */

export const BIOMES: readonly BiomeDescriptor[] = [
  { id: "reef_shallows", label: "Hearth Reef shallows" },
  { id: "isle_land", label: "Splitspine land and surf", lod: { coarse: 440 } },
  { id: "isle_shoal", label: "Splitspine shoals" },
  { id: "canopy_crowns", label: "Lantern Canopy crowns and ribs" },
  { id: "basin_sediment", label: "Pale Basin rippled sediment" },
  { id: "basin_wreck", label: "Pale Basin wreck and dish ridges" },
  { id: "rift_cool_flank", label: "Ember Rift cooled ledges" },
  { id: "rift_trench", label: "Ember Rift warm trench" },
  { id: "divide_ridge", label: "Mirror Divide fractured ridge" },
  { id: "divide_brine", label: "Mirror Divide brine pools" },
  { id: "meridian_terraces", label: "Meridian terraces", lod: { fine: 128 } },
  { id: "meridian_escarpment", label: "Outer escarpment" },
];

/** Horizontal membership; earlier entries win overlaps (S1 contract). */
const FOOTPRINTS: readonly (readonly [RegionId, readonly Rect[]])[] = [
  ["island_chain", [
    { minX: -32, maxX: 44, minZ: -100, maxZ: -20 },
    { minX: 300, maxX: 640, minZ: -60, maxZ: 160 },
    { minX: 880, maxX: 1220, minZ: -80, maxZ: 160 },
  ]],
  ["thermal_rift", [
    { minX: -576, maxX: 180, minZ: -1632, maxZ: -640 },
    { minX: 40, maxX: 230, minZ: -640, maxZ: -570 },
  ]],
  ["silt_basin", [
    { minX: 98, maxX: 272, minZ: -352, maxZ: -184 },
    { minX: 64, maxX: 1088, minZ: -1000, maxZ: -352 },
    { minX: -576, maxX: 64, minZ: -640, maxZ: -230 },
  ]],
  ["suspended_garden", [{ minX: 64, maxX: 1472, minZ: -352, maxZ: 160 }]],
  ["refuge_reef", [{ minX: -576, maxX: 64, minZ: -230, maxZ: 160 }]],
  ["brine_divide", [{ minX: 180, maxX: 960, minZ: -1632, maxZ: -1000 }]],
  ["deep_district", [
    { minX: 960, maxX: 1472, minZ: -1632, maxZ: -1000 },
    { minX: 1088, maxX: 1472, minZ: -1000, maxZ: -352 },
  ]],
];

/** Pressure rating needed for each region's deepest REQUIRED site. */
const DEPTH_RATING: Readonly<Record<RegionId, number>> = {
  refuge_reef: 60, island_chain: 60, suspended_garden: 150, silt_basin: 180,
  thermal_rift: 350, brine_divide: 450, deep_district: 800,
};

/** Fine region lookup from footprints (exact rectangles, not chunk owners). */
export function regionAtPoint(x: number, z: number): RegionId | null {
  for (const [id, rects] of FOOTPRINTS) if (rects.some(r => rectContains(r, x, z))) return id;
  return null;
}

const box = (min: Vec3, max: Vec3): Aabb => ({ min, max });

function regionBounds(rects: readonly Rect[], id: RegionId): Aabb {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, lo = Infinity, hi = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.minX); maxX = Math.max(maxX, r.maxX); minZ = Math.min(minZ, r.minZ); maxZ = Math.max(maxZ, r.maxZ);
    for (let x = r.minX; x <= r.maxX; x += 16) for (let z = r.minZ; z <= r.maxZ; z += 16) {
      if (regionAtPoint(x, z) !== id) continue;
      const h = worldFloor(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
  }
  for (const s of STRUCTURES) if (s.region === id) for (const b of s.solids) { lo = Math.min(lo, b.min.y); hi = Math.max(hi, b.max.y); }
  return box({ x: minX, y: Math.max(WORLD_ENVELOPE.min.y, Math.floor(lo - 2)), z: minZ },
    { x: maxX, y: Math.min(WORLD_ENVELOPE.max.y, Math.ceil(Math.max(hi, 0) + 4)), z: maxZ });
}

/** Where a passage crosses from one region to the next. */
function portalOf(path: readonly Readonly<Vec3>[], from: RegionId, to: RegionId, halfWidth: number): Aabb {
  let at = path[Math.floor(path.length / 2)]!;
  for (let i = 1; i < path.length; i++) {
    const a = regionAtPoint(path[i - 1]!.x, path[i - 1]!.z), b = regionAtPoint(path[i]!.x, path[i]!.z);
    if (a === from && b === to) { at = path[i]!; break; }
  }
  const r = Math.max(halfWidth, 6);
  return box({ x: at.x - r, y: at.y - 12, z: at.z - r }, { x: at.x + r, y: Math.min(at.y + 12, 100), z: at.z + r });
}

const ENTRANCE_KIND: Partial<Record<string, AccessKind>> = { mooring: "carrier", entrance: "hull" };
function entrances(id: RegionId): AccessPoint[] {
  return SITES.filter(s => s.region === id && (s.role === "mooring" || s.role === "entrance" || s.role === "refuge"))
    .map(s => {
      const y = s.at.y === "floor" ? worldFloor(s.at.x, s.at.z) + (s.lift ?? 0) : s.at.y;
      const kind: AccessKind = y > 0 ? "land" : ENTRANCE_KIND[s.role] ?? "diver";
      return { id: s.id, kind, position: { x: s.at.x, y, z: s.at.z }, clearance: s.role === "mooring" ? 24 : 6 };
    });
}

function regions(): RegionDescriptor[] {
  const links = new Map<RegionId, RegionLink[]>();
  for (const r of ROUTES) {
    if (r.from === r.to) continue;
    for (const [a, b] of [[r.from, r.to], [r.to, r.from]] as const) {
      const portal = portalOf(a === r.from ? r.path : [...r.path].reverse(), a, b, r.minHalfWidth);
      if (!links.has(a)) links.set(a, []);
      links.get(a)!.push({ to: b, kind: r.kind, portal, minHalfWidth: r.minHalfWidth, carrier: r.carrier });
    }
  }
  return FOOTPRINTS.map(([id, footprint]) => {
    const bounds = regionBounds(footprint, id);
    const biomes = [...new Set(CHUNKS_BY_REGION().get(id) ?? [])];
    return { id, bounds, footprint, biomes: biomes.length ? biomes : ["reef_shallows"],
      adjacency: links.get(id) ?? [], access: { depthRatingM: DEPTH_RATING[id], entrances: entrances(id) } };
  });
}

/** Dominant biome at a point, from the same masks that carved the floor. */
export function biomeAt(x: number, z: number, m: TerrainMasks = terrainMasks(x, z)): string {
  const region = regionAtPoint(x, z), h = worldFloor(x, z);
  switch (region) {
    case "island_chain": return h > -1.5 ? "isle_land" : "isle_shoal";
    case "thermal_rift": return m.trench > 0.4 ? "rift_trench" : "rift_cool_flank";
    case "silt_basin": return m.ridge > 0.35 ? "basin_wreck" : "basin_sediment";
    case "suspended_garden": return "canopy_crowns";
    case "brine_divide": return m.brineSide > 0.5 && h < -440 ? "divide_brine" : "divide_ridge";
    case "deep_district": return m.escarpment > 0.5 ? "meridian_escarpment" : "meridian_terraces";
    default: return "reef_shallows";
  }
}

/** The extent S2 terrain leaves to the legacy terrain mesh (C2's legacy
 * terrain factory draws exactly this): accepted B1's `TERRAIN_EXTENT`. */
export const S2_TERRAIN_SKIP: Rect = { minX: TERRAIN_EXTENT.minX, maxX: TERRAIN_EXTENT.maxX, minZ: TERRAIN_EXTENT.minZ, maxZ: TERRAIN_EXTENT.maxZ };

/** Legacy coverage of a column: the existing renderer owns that terrain. */
export function legacyCoverage(rect: Rect): "none" | "partial" | "full" {
  const p = S2_TERRAIN_SKIP;
  const inter = rect.minX < p.maxX && rect.maxX > p.minX && rect.minZ < p.maxZ && rect.maxZ > p.minZ;
  if (!inter) return "none";
  return rect.minX >= p.minX && rect.maxX <= p.maxX && rect.minZ >= p.minZ && rect.maxZ <= p.maxZ ? "full" : "partial";
}

/** Columns crossed by a Meridian terrace wall get facade art. */
function meridianWall(rect: Rect): boolean {
  if (rect.maxX < 950 || rect.minZ > -1030) return false;
  const cx = (rect.minX + rect.maxX) / 2, cz = (rect.minZ + rect.maxZ) / 2;
  const d = Math.hypot(cx - MERIDIAN_CENTRE.x, cz - MERIDIAN_CENTRE.z), half = Math.SQRT1_2 * CHUNK_SIZE;
  return MERIDIAN_TERRACES.slice(1).some(t => Math.abs(d - t.outer) <= half + 4);
}

let chunkCache: ChunkDescriptor[] | null = null;
function chunks(): ChunkDescriptor[] {
  if (chunkCache) return chunkCache;
  const env = WORLD_ENVELOPE, out: ChunkDescriptor[] = [];
  const cols = (env.max.x - env.min.x) / CHUNK_SIZE, rows = (env.max.z - env.min.z) / CHUNK_SIZE;
  const biomeLod = new Map(BIOMES.map(b => [b.id, b.lod] as const));
  for (let ix = 0; ix < cols; ix++) for (let iz = 0; iz < rows; iz++) {
    const rect = columnRect(ix, iz, env, CHUNK_SIZE);
    const cx = (rect.minX + rect.maxX) / 2, cz = (rect.minZ + rect.maxZ) / 2;
    const counts = new Map<string, number>();
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
      const x = rect.minX + i * 16, z = rect.minZ + j * 16, h = worldFloor(x, z);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
      if (i < 8 && j < 8) { const b = biomeAt(x + 8, z + 8); counts.set(b, (counts.get(b) ?? 0) + 1); }
    }
    const here = STRUCTURES.filter(s => rectContains({ ...rect, maxX: rect.maxX - 1e-9, maxZ: rect.maxZ - 1e-9 }, s.x, s.z));
    for (const s of here) for (const b of s.solids) { lo = Math.min(lo, b.min.y); hi = Math.max(hi, b.max.y); }
    const biome = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]![0];
    const region = regionAtPoint(cx, cz) ?? "refuge_reef";
    const legacy = legacyCoverage(rect);
    const art: ChunkArtRef[] = legacy === "full" ? [] : [
      { factory: "s2.terrain", params: { legacy } },
      { factory: "s2.scatter", params: { biome } },
      ...(here.length || meridianWall(rect) ? [{ factory: "s2.structures" }] : []),
    ];
    const refuge = SITES.some(s => (s.role === "refuge" || s.role === "mooring") && rectContains(rect, s.at.x, s.at.z));
    const cell = { ix, iz, layer: 0 };
    out.push({
      id: chunkId(cell), cell, region, biome, art,
      bounds: { min: { x: rect.minX, y: Math.max(env.min.y, Math.floor(lo - 2)), z: rect.minZ },
        max: { x: rect.maxX, y: Math.min(env.max.y, Math.ceil(hi + 30)), z: rect.maxZ } },
      lod: resolveLod(biomeLod.get(biome)),
      ...(refuge ? { priority: 1 } : {}),
    });
  }
  chunkCache = out;
  return out;
}
function CHUNKS_BY_REGION(): Map<RegionId, string[]> {
  const m = new Map<RegionId, string[]>();
  for (const c of chunks()) { if (!m.has(c.region)) m.set(c.region, []); m.get(c.region)!.push(c.biome); }
  for (const [id, list] of m) {
    const count = new Map<string, number>();
    for (const b of list) count.set(b, (count.get(b) ?? 0) + 1);
    m.set(id, [...count].sort((a, b) => b[1] - a[1]).map(([b]) => b));
  }
  return m;
}

let layoutCache: WorldLayout | null = null;
/** The composed S2 layout. Built lazily: sampling the floor for 224 columns
 * and seven regions takes a few hundred milliseconds. */
export function worldLayout(): WorldLayout {
  return layoutCache ??= { envelope: WORLD_ENVELOPE, chunkSize: CHUNK_SIZE, biomes: BIOMES, regions: regions(), chunks: chunks() };
}
