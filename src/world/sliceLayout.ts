import { REGIONS, SOURCES, type RegionId } from "../content/registry.js";
import { ROUTE_REGIONS, ROUTE_WORLD_BOUNDS } from "../content/routes.js";
import { SOLIDS, terrainHeight } from "../sim/world.js";
import { CHUNK_SIZE, WORLD_ENVELOPE } from "./frame.js";
import { deriveTerrainChunks, sampleRange } from "./map.js";
import { solidEntries } from "./queries.js";
import type { Aabb, BiomeDescriptor, RegionDescriptor, RegionLink, RegionLinkKind, Rect, SpatialEntry,
  Vec3, WorldLayout } from "./types.js";

/** PROVISIONAL scale-slice layout: the seven registry regions placed per
 * docs/WORLD_PROGRESSION.md (+Z north, +X east) on the ratified envelope.
 * It exists to exercise residency, LOD and queries at full size. S2 owns the
 * authored geography in src/content/regions/* and may adopt or replace this.
 *
 * Inside today's route bounds the floor IS the accepted `terrainHeight`, so
 * the reef, isles, Canopy and Basin keep their real shape. Elsewhere a smooth
 * synthetic basin descends to 780 m, blended across a 48 m seam. */

interface Basin { x: number; z: number; y: number; sigma: number }
const BASINS: readonly Basin[] = [
  { x: 520, z: -560, y: -300, sigma: 260 },   // Pale Basin bowl
  { x: 300, z: -150, y: -170, sigma: 220 },   // Canopy shelf
  { x: -260, z: -900, y: -440, sigma: 280 },  // Ember Rift
  { x: 380, z: -1260, y: -580, sigma: 300 },  // Mirror Divide saddle
  { x: 1080, z: -1200, y: -740, sigma: 320 }, // Meridian terraces
  { x: -300, z: -40, y: -40, sigma: 260 },    // western reef shelf
  { x: 960, z: -60, y: -60, sigma: 260 },     // eastern rim shoals
];
const ISLANDS = [
  { x: 640, z: 70, height: 70, radius: 70 },
  { x: 1120, z: -10, height: 48, radius: 60 },
] as const;

function syntheticFloor(x: number, z: number): number {
  let sum = 0, weight = 1e-9;
  for (const b of BASINS) {
    const w = Math.exp(-((x - b.x) ** 2 + (z - b.z) ** 2) / (2 * b.sigma * b.sigma));
    sum += w * b.y; weight += w;
  }
  let y = sum / weight;
  // Ridges and fractures read as geology at chunk scale, not as noise.
  y += Math.sin(x * 0.021 + Math.sin(z * 0.013) * 2) * 9 + Math.cos(z * 0.017 - x * 0.006) * 7;
  // Rift trench along a NE-SW fracture.
  const across = ((x + 260) * 0.8 + (z + 900) * 0.6);
  y -= 70 * Math.exp(-(across * across) / 1800) * Math.exp(-(((x + 260) * 0.6 - (z + 900) * 0.8) ** 2) / 200000);
  // Meridian terraces: soft steps below 600 m.
  if (y < -600) y = -600 + Math.round((y + 600) / 30) * 30 + ((y + 600) % 30) * 0.25;
  for (const i of ISLANDS) {
    const d = Math.hypot(x - i.x, z - i.z) / i.radius;
    y = Math.max(y, i.height - d * d * 60 - 8);
  }
  return Math.max(-790, Math.min(95, y));
}

const SEAM = 48;
/** Floor for the whole envelope. Physically exact inside today's bounds. */
export function sliceFloor(x: number, z: number): number {
  const b = ROUTE_WORLD_BOUNDS;
  const inside = Math.min(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z);
  if (inside >= 0) return terrainHeight(x, z);
  const t = Math.min(1, -inside / SEAM), s = t * t * (3 - 2 * t);
  const cx = Math.max(b.minX, Math.min(b.maxX, x)), cz = Math.max(b.minZ, Math.min(b.maxZ, z));
  return terrainHeight(cx, cz) * (1 - s) + syntheticFloor(x, z) * s;
}

const rect = (minX: number, maxX: number, minZ: number, maxZ: number): Rect => ({ minX, maxX, minZ, maxZ });
const FOOTPRINTS: readonly [RegionId, readonly Rect[]][] = [
  ["island_chain", [rect(-40, 72, -120, -22), rect(448, 1472, -96, 160)]],
  ["silt_basin", [rect(98, 704, -704, -184)]],
  ["suspended_garden", [rect(72, 448, -184, 160), rect(448, 1472, -448, -96)]],
  ["refuge_reef", [rect(-576, 72, -184, 160)]],
  ["thermal_rift", [rect(-576, 98, -1024, -184)]],
  ["brine_divide", [rect(-576, 704, -1632, -1024), rect(98, 704, -1024, -704)]],
  ["deep_district", [rect(704, 1472, -1632, -448)]],
];
const BIOMES: readonly BiomeDescriptor[] = [
  { id: "reef_shelf", label: "Reef shelf" },
  { id: "island_shoal", label: "Island shoal" },
  { id: "canopy_crown", label: "Canopy crown" },
  // Deep water fog (density ~0.023/m below 175 m) hides everything past
  // ~200 m, so deep biomes stop drawing much sooner than the shelf.
  { id: "silt_bowl", label: "Silt bowl", lod: { fine: 112, coarse: 300 } },
  { id: "thermal_fracture", label: "Thermal fracture", lod: { coarse: 240 } },
  { id: "brine_saddle", label: "Brine saddle", lod: { coarse: 240 } },
  { id: "research_terrace", label: "Research terrace", lod: { coarse: 240 } },
];
const BIOME_OF: Record<RegionId, string> = {
  refuge_reef: "reef_shelf", island_chain: "island_shoal", suspended_garden: "canopy_crown",
  silt_basin: "silt_bowl", thermal_rift: "thermal_fracture", brine_divide: "brine_saddle",
  deep_district: "research_terrace",
};
/** Spec adjacency: Reef-Isles-Canopy-Basin loop, Basin to Rift and Divide,
 * Rift flank to Divide, Divide to Meridian, Meridian escarpment to Canopy. */
const LINKS: readonly [RegionId, RegionId, RegionLinkKind, Vec3, boolean][] = [
  ["refuge_reef", "island_chain", "open", { x: 20, y: -10, z: -24 }, true],
  ["refuge_reef", "suspended_garden", "open", { x: 72, y: -20, z: -40 }, true],
  ["island_chain", "suspended_garden", "open", { x: 72, y: -30, z: -90 }, true],
  ["suspended_garden", "silt_basin", "passage", { x: 160, y: -150, z: -184 }, true],
  ["silt_basin", "refuge_reef", "ledge", { x: 98, y: -120, z: -190 }, false],
  ["silt_basin", "thermal_rift", "passage", { x: 98, y: -280, z: -500 }, true],
  ["silt_basin", "brine_divide", "open", { x: 400, y: -360, z: -704 }, true],
  ["thermal_rift", "brine_divide", "ledge", { x: -200, y: -460, z: -1024 }, false],
  ["brine_divide", "deep_district", "open", { x: 704, y: -600, z: -1200 }, true],
  ["deep_district", "suspended_garden", "ledge", { x: 900, y: -300, z: -448 }, false],
];
const ENTRANCES: Record<RegionId, Vec3> = {
  refuge_reef: { x: 0, y: -2, z: 14 }, island_chain: { x: 10, y: 1, z: -40 },
  suspended_garden: ROUTE_REGIONS.suspended_garden.safePocket, silt_basin: ROUTE_REGIONS.silt_basin.safePocket,
  thermal_rift: { x: -260, y: -430, z: -880 }, brine_divide: { x: 380, y: -560, z: -1240 },
  deep_district: { x: 1060, y: -700, z: -1180 },
};

function union(rects: readonly Rect[], minY: number, maxY: number): Aabb {
  return {
    min: { x: Math.min(...rects.map(r => r.minX)), y: minY, z: Math.min(...rects.map(r => r.minZ)) },
    max: { x: Math.max(...rects.map(r => r.maxX)), y: maxY, z: Math.max(...rects.map(r => r.maxZ)) },
  };
}

function regions(): RegionDescriptor[] {
  return FOOTPRINTS.map(([id, footprint]) => {
    const [shallow, deep] = REGIONS[id].depth;
    const adjacency: RegionLink[] = LINKS.filter(l => l[0] === id || l[1] === id).map(([a, b, kind, p, carrier]) => ({
      to: a === id ? b : a, kind, carrier, minHalfWidth: kind === "ledge" ? 6 : 24,
      portal: { min: { x: p.x - 24, y: p.y - 24, z: p.z - 24 }, max: { x: p.x + 24, y: p.y + 24, z: p.z + 24 } },
    }));
    return {
      id, footprint, biomes: [BIOME_OF[id]],
      // Envelope Y spans the registry depth band, plus land for the isles.
      bounds: union(footprint, -Math.max(deep, 0) - 20, id === "island_chain" ? 100 : Math.min(-shallow, 0) + 20),
      adjacency,
      access: { depthRatingM: Math.max(0, deep), entrances: [{ id: `${id}.entry`, kind: "hull", position: ENTRANCES[id] }] },
    };
  });
}

/** Scatter density per 100 m^2 of floor, by biome; the harness's "dense" case. */
export const SCATTER_DENSITY: Readonly<Record<string, number>> = {
  reef_shelf: 4.5, island_shoal: 2.2, canopy_crown: 5, silt_bowl: 1.4,
  thermal_fracture: 1.6, brine_saddle: 1.1, research_terrace: 1.8,
};

/** `density` multiplies scatter; `setPieces` (0..1) is the share of chunks
 * that also carry a heavy merged set piece of `parts` parts. */
export function createSliceLayout(options: { density?: number; setPieces?: number; parts?: number } = {}): WorldLayout {
  const base = { envelope: WORLD_ENVELOPE, chunkSize: CHUNK_SIZE, biomes: BIOMES, regions: regions() };
  const pod = { x: 0, z: 20 };
  const chunks = deriveTerrainChunks(base, {
    terrainRange: r => sampleRange(sliceFloor, r, 8, 6),
    art: (_region, biome, r) => {
      const hash = (Math.imul(Math.floor(r.minX / CHUNK_SIZE) + 4099, 73856093) ^ Math.imul(Math.floor(r.minZ / CHUNK_SIZE) + 4099, 19349663)) >>> 0;
      return [
        { factory: "terrain" },
        { factory: "scatter", params: { density: (SCATTER_DENSITY[biome] ?? 1) * (options.density ?? 1) } },
        ...((hash % 1000) / 1000 < (options.setPieces ?? 0) ? [{ factory: "setpiece", params: { parts: options.parts ?? 240 } }] : []),
      ];
    },
    priority: (_region, r) => (pod.x >= r.minX && pod.x < r.maxX && pod.z >= r.minZ && pod.z < r.maxZ ? 1 : undefined),
  });
  return { ...base, chunks };
}

/** Real place data for the slice index: today's solids, sources and landmarks. */
export function sliceEntries(): SpatialEntry[] {
  const out: SpatialEntry[] = [...solidEntries(SOLIDS)];
  for (const [id, source] of Object.entries(SOURCES)) {
    const p = source.position;
    out.push({ id: `source.${id}`, kind: "source", region: source.region,
      bounds: { min: { x: p.x - 1.5, y: p.y - 1, z: p.z - 1.5 }, max: { x: p.x + 1.5, y: p.y + 1.5, z: p.z + 1.5 } }, data: source });
  }
  for (const [id, r] of Object.entries(ROUTE_REGIONS)) {
    const p = r.landmark;
    out.push({ id: `landmark.${id}`, kind: "landmark", region: id as RegionId,
      bounds: { min: { x: p.x - 4, y: p.y - 4, z: p.z - 4 }, max: { x: p.x + 4, y: p.y + 4, z: p.z + 4 } } });
  }
  return out;
}
