import type { ChunkArtFactory, ChunkBuildContext, InstanceRecipe } from "../kit/types.js";
import type { ChunkDescriptor } from "../../world/types.js";
import { regionAtPoint } from "../../content/regions/layout.js";
import { fbm, smooth } from "../../content/regions/noise.js";
import { ROUTES, CRAFT_PROFILES } from "../../content/regions/passages.js";
import { RESCUE_PLANS } from "../../content/regions/rescue.js";
import { SITES } from "../../content/regions/sites.js";
import { STRUCTURES } from "../../content/regions/structures.js";
import { BRINE_Y, emptyMasks, terrainMasks, type TerrainMasks } from "../../content/regions/terrain.js";
import { TERRAIN_EXTENT } from "../terrainSurface.js";
import { instanceMatrix } from "./recipe.js";

/** `s2.scatter`: dense instanced dressing per biome, placed by rules that
 * read the same masks the floor was carved with. Pale fans open on cool
 * ledges and vanish below the brine, wreck debris follows the ridges, crowns
 * stand on Canopy ribs. Nothing is placed where a passage, rescue tether,
 * mooring bowl or structure needs open water. Purely visual: scatter adds no
 * collision, so large pieces stay small enough to read as set dressing. */
interface Rule {
  template: string;
  spacing: number;
  chance: number;
  scale: readonly [number, number];
  /** Floor height window (Y). */
  y?: readonly [number, number];
  slope?: readonly [number, number];
  weight?: (m: TerrainMasks, y: number) => number;
  /** Clustered placement: fbm over this wavelength must exceed `above`. */
  cluster?: { scale: number; above: number };
  /** Lean with the slope (0 upright, 1 fully aligned). */
  align?: number;
  tints?: readonly (readonly [number, number, number])[];
  /** Kept at coarse LOD (with density `coarse`), otherwise fine only. */
  coarse?: number;
  /** Rise above the floor in metres at scale 1, for keep-out tests. */
  height: number;
}
const WARM = [[1, 0.95, 0.9], [1.05, 1, 0.92], [0.92, 0.95, 1]] as const;
const GREEN = [[1, 1, 1], [0.9, 1.05, 0.95], [1.08, 1.02, 0.9]] as const;

export const SCATTER_RULES: Readonly<Record<string, readonly Rule[]>> = {
  reef_shallows: [
    { template: "s2.flora.cup", spacing: 3, chance: 0.3, scale: [0.8, 1.4], slope: [0, 0.45], height: 0.5, tints: WARM },
    { template: "s2.flora.fan_coral", spacing: 5, chance: 0.25, scale: [0.8, 1.6], cluster: { scale: 30, above: -0.1 }, height: 1.5, tints: WARM },
    { template: "s2.flora.ribbon", spacing: 5, chance: 0.25, scale: [0.8, 1.3], cluster: { scale: 22, above: 0.1 }, height: 2.6 },
    { template: "s2.rock.boulder", spacing: 9, chance: 0.3, scale: [0.6, 2], align: 0.5, coarse: 0.6, height: 1.3 },
  ],
  isle_land: [
    { template: "s2.flora.grass", spacing: 2, chance: 0.55, scale: [0.8, 1.5], y: [1.4, 95], slope: [0, 0.75], height: 0.7, tints: GREEN },
    { template: "s2.flora.shrub", spacing: 5, chance: 0.3, scale: [0.7, 1.8], y: [2.5, 85], slope: [0, 0.6], cluster: { scale: 28, above: -0.05 }, coarse: 0.5, height: 1.4, tints: GREEN },
    { template: "s2.rock.column", spacing: 8, chance: 0.25, scale: [0.6, 1.6], slope: [0.6, 9], coarse: 0.5, height: 4 },
    { template: "s2.rock.boulder", spacing: 7, chance: 0.2, scale: [0.4, 1.4], align: 0.7, height: 1 },
  ],
  isle_shoal: [
    { template: "s2.rock.boulder", spacing: 6, chance: 0.3, scale: [0.5, 1.8], align: 0.6, coarse: 0.5, height: 1.2 },
    { template: "s2.rock.slab", spacing: 8, chance: 0.2, scale: [0.6, 1.4], align: 0.8, height: 0.6 },
    { template: "s2.flora.ribbon", spacing: 5, chance: 0.3, scale: [0.7, 1.2], y: [-40, -2], cluster: { scale: 18, above: 0 }, height: 2.6 },
    { template: "s2.flora.cup", spacing: 4, chance: 0.2, scale: [0.7, 1.2], y: [-30, -1], height: 0.5, tints: WARM },
  ],
  canopy_crowns: [
    { template: "s2.flora.frond", spacing: 4, chance: 0.45, scale: [0.8, 1.6], cluster: { scale: 36, above: -0.15 }, weight: m => 0.4 + m.rib, coarse: 0.25, height: 7 },
    { template: "s2.flora.crown", spacing: 34, chance: 0.6, scale: [0.8, 1.35], weight: m => 0.3 + m.rib, coarse: 1, height: 30 },
    { template: "s2.flora.ribbon", spacing: 6, chance: 0.2, scale: [0.8, 1.4], height: 2.6 },
    { template: "s2.rock.boulder", spacing: 10, chance: 0.2, scale: [0.6, 1.6], align: 0.5, height: 1.2 },
  ],
  basin_sediment: [
    { template: "s2.rock.boulder", spacing: 14, chance: 0.12, scale: [0.6, 1.5], align: 0.4, coarse: 0.5, height: 1.2 },
    { template: "s2.flora.tube", spacing: 9, chance: 0.12, scale: [0.8, 1.5], cluster: { scale: 40, above: 0.25 }, height: 1.1 },
    { template: "s2.debris.panel", spacing: 12, chance: 0.08, scale: [0.8, 1.4], align: 1, height: 0.2 },
  ],
  basin_wreck: [
    { template: "s2.debris.panel", spacing: 4, chance: 0.4, scale: [0.8, 1.8], align: 1, weight: m => m.ridge, cluster: { scale: 26, above: 0.25 }, height: 0.3 },
    { template: "s2.debris.pipe", spacing: 7, chance: 0.25, scale: [0.6, 1.4], align: 1, weight: m => m.ridge, cluster: { scale: 26, above: 0.15 }, coarse: 0.5, height: 0.6 },
    { template: "s2.rock.slab", spacing: 6, chance: 0.3, scale: [0.7, 1.6], align: 0.8, coarse: 0.4, height: 0.7 },
    { template: "s2.flora.tube", spacing: 5, chance: 0.3, scale: [0.8, 1.4], cluster: { scale: 20, above: -0.1 }, height: 1.1 },
    { template: "s2.flora.fan", spacing: 7, chance: 0.2, scale: [0.7, 1.2], weight: m => m.ridge, height: 1.4 },
  ],
  rift_cool_flank: [
    { template: "s2.flora.fan", spacing: 3.5, chance: 0.5, scale: [0.8, 1.7], weight: m => m.ledge * (0.4 + m.coolFlank), cluster: { scale: 26, above: -0.2 }, coarse: 0.2, height: 1.6, tints: WARM },
    { template: "s2.rock.slab", spacing: 6, chance: 0.35, scale: [0.7, 1.8], align: 0.9, coarse: 0.4, height: 0.7 },
    { template: "s2.rock.column", spacing: 10, chance: 0.18, scale: [0.6, 1.4], slope: [0.5, 9], height: 4 },
    { template: "s2.flora.tube", spacing: 6, chance: 0.2, scale: [0.8, 1.3], height: 1.1 },
  ],
  rift_trench: [
    { template: "s2.rock.column", spacing: 5, chance: 0.4, scale: [0.8, 2.2], coarse: 0.4, height: 6 },
    { template: "s2.rock.boulder", spacing: 6, chance: 0.3, scale: [0.6, 2], align: 0.5, height: 1.5 },
    { template: "s2.flora.tube", spacing: 5, chance: 0.3, scale: [1, 2], y: [-560, -440], height: 2, tints: [[1.15, 0.85, 0.7], [1.2, 0.9, 0.75]] },
  ],
  divide_ridge: [
    { template: "s2.rock.shard", spacing: 4, chance: 0.35, scale: [0.6, 1.8], y: [-420, -330], slope: [0, 0.6], cluster: { scale: 24, above: -0.05 }, coarse: 0.3, height: 3 },
    { template: "s2.rock.slab", spacing: 6, chance: 0.3, scale: [0.7, 2], align: 0.9, coarse: 0.4, height: 0.8 },
    { template: "s2.rock.boulder", spacing: 7, chance: 0.3, scale: [0.6, 2], align: 0.5, height: 1.5 },
    { template: "s2.flora.ribbon", spacing: 5, chance: 0.25, scale: [0.8, 1.5], y: [BRINE_Y + 15, -320], height: 2.6 },
  ],
  divide_brine: [
    { template: "s2.salt.crust", spacing: 5, chance: 0.45, scale: [0.8, 2.6], y: [-800, BRINE_Y], align: 1, coarse: 0.3, height: 0.2 },
    { template: "s2.rock.boulder", spacing: 10, chance: 0.15, scale: [0.6, 1.6], y: [-800, BRINE_Y], align: 0.5, height: 1.2 },
    { template: "s2.rock.shard", spacing: 12, chance: 0.1, scale: [0.5, 1], y: [-800, BRINE_Y], height: 2 },
  ],
  meridian_terraces: [
    { template: "s2.lamp", spacing: 22, chance: 0.5, scale: [1, 1], slope: [0, 0.3], weight: m => m.terrace, coarse: 1, height: 3.6 },
    { template: "s2.debris.panel", spacing: 8, chance: 0.15, scale: [0.8, 1.5], align: 1, height: 0.2 },
    { template: "s2.debris.pipe", spacing: 10, chance: 0.1, scale: [0.7, 1.4], align: 1, height: 0.6 },
    { template: "s2.rock.boulder", spacing: 12, chance: 0.12, scale: [0.4, 1.2], slope: [0.3, 9], height: 1 },
    { template: "s2.flora.tube", spacing: 8, chance: 0.15, scale: [0.8, 1.2], cluster: { scale: 30, above: 0.2 }, height: 1.1 },
  ],
  meridian_escarpment: [
    { template: "s2.rock.column", spacing: 6, chance: 0.3, scale: [0.8, 2], slope: [0.4, 9], coarse: 0.4, height: 6 },
    { template: "s2.rock.boulder", spacing: 6, chance: 0.3, scale: [0.6, 2], align: 0.5, height: 1.5 },
    { template: "s2.rock.shard", spacing: 9, chance: 0.12, scale: [0.6, 1.2], height: 2 },
  ],
};

// --- Keep-out: open water the passages, tethers and moorings need ----------
interface KeepPoint { x: number; z: number; y: number; r: number }
const KEEP_BUCKET = 64;
let keep: Map<number, KeepPoint[]> | null = null;
const kkey = (bx: number, bz: number): number => (bx + 1000) * 4096 + (bz + 1000);
function keepIndex(): Map<number, KeepPoint[]> {
  if (keep) return keep;
  keep = new Map();
  const add = (p: KeepPoint): void => {
    for (let bx = Math.floor((p.x - p.r) / KEEP_BUCKET); bx <= Math.floor((p.x + p.r) / KEEP_BUCKET); bx++)
      for (let bz = Math.floor((p.z - p.r) / KEEP_BUCKET); bz <= Math.floor((p.z + p.r) / KEEP_BUCKET); bz++) {
        const k = kkey(bx, bz); if (!keep!.has(k)) keep!.set(k, []); keep!.get(k)!.push(p);
      }
  };
  const line = (path: readonly { x: number; y: number; z: number }[], r: number, bottom: number): void => {
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i]!, b = path[i + 1]!, n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 3));
      for (let k = 0; k <= n; k++) { const t = k / n; add({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t + bottom, r }); }
    }
  };
  for (const r of ROUTES) {
    if (r.role === "walk") continue;
    const c = CRAFT_PROFILES[r.profile];
    line(r.path, Math.max(c.radius, r.kind === "open" ? r.minHalfWidth : c.radius) + 1, c.bottom);
  }
  for (const p of RESCUE_PLANS) for (const b of p.tethers) line(b, 5.5, 0);
  for (const s of SITES) if (s.pad && typeof s.at.y === "number") add({ x: s.at.x, z: s.at.z, y: s.at.y + 40, r: s.pad.radius * (s.pad.flat ?? 0.55) });
  for (const s of STRUCTURES) for (const b of s.solids)
    add({ x: (b.min.x + b.max.x) / 2, z: (b.min.z + b.max.z) / 2, y: b.max.y + 40, r: Math.hypot(b.max.x - b.min.x, b.max.z - b.min.z) / 2 + 1.5 });
  return keep;
}
function blocked(x: number, z: number, top: number, radius: number): boolean {
  const list = keepIndex().get(kkey(Math.floor(x / KEEP_BUCKET), Math.floor(z / KEEP_BUCKET)));
  if (!list) return false;
  for (const p of list) if (top > p.y - 0.5 && Math.hypot(x - p.x, z - p.z) < p.r + radius) return true;
  return false;
}

const L = TERRAIN_EXTENT;
const legacy = (x: number, z: number): boolean => x >= L.minX && x <= L.maxX && z >= L.minZ && z <= L.maxZ;

function* scatterChunk(ctx: ChunkBuildContext, chunk: ChunkDescriptor, biome: string, fine: boolean): Generator<void, InstanceRecipe[]> {
  const floor = ctx.floor, random = ctx.random;
  const rules = SCATTER_RULES[biome] ?? [];
  const { min, max } = chunk.bounds;
  // Masks on an 8 m lattice; rules read the nearest node.
  const mstep = 8, mn = Math.round((max.x - min.x) / mstep) + 1, masks: TerrainMasks[] = [];
  for (let j = 0; j < mn; j++) {
    for (let i = 0; i < mn; i++) { masks.push(terrainMasks(min.x + i * mstep, min.z + j * mstep, emptyMasks())); if (ctx.due()) yield; }
  }
  const maskAt = (x: number, z: number): TerrainMasks =>
    masks[Math.min(mn - 1, Math.round((z - min.z) / mstep)) * mn + Math.min(mn - 1, Math.round((x - min.x) / mstep))]!;
  const out: InstanceRecipe[] = [];
  for (let ri = 0; ri < rules.length; ri++) {
    const rule = rules[ri]!;
    if (!fine && !rule.coarse) continue;
    const rnd = random(chunk.cell.ix * 7919 + chunk.cell.iz * 104729 + ri * 31337 + biome.length * 17);
    const mats: number[] = [], tints: number[] = [];
    const tmp = new Float32Array(16);
    for (let z = min.z; z < max.z; z += rule.spacing) for (let x = min.x; x < max.x; x += rule.spacing) {
      if (ctx.due()) yield;
      const px = x + rnd() * rule.spacing, pz = z + rnd() * rule.spacing;
      const roll = rnd(), s = rule.scale[0] + (rule.scale[1] - rule.scale[0]) * rnd(), yaw = rnd() * Math.PI * 2, tint = rnd();
      const keepCoarse = fine || rnd() < (rule.coarse ?? 0);
      if (!keepCoarse || legacy(px, pz) || px >= max.x || pz >= max.z) continue;
      if (biomeOf(px, pz, maskAt(px, pz)) !== biome) continue;
      const m = maskAt(px, pz), w = rule.weight ? rule.weight(m, 0) : 1;
      if (roll > rule.chance * Math.min(1.5, w)) continue;
      if (rule.cluster && fbm(px, pz, rule.cluster.scale, 2, 400 + ri) < rule.cluster.above) continue;
      const y = floor(px, pz);
      if (rule.y && (y < rule.y[0] || y > rule.y[1])) continue;
      const gx = (floor(px + 0.5, pz) - floor(px - 0.5, pz)), gz = (floor(px, pz + 0.5) - floor(px, pz - 0.5));
      const slope = Math.hypot(gx, gz);
      if (rule.slope && (slope < rule.slope[0] || slope > rule.slope[1])) continue;
      if (y > 0 && !rule.template.startsWith("s2.flora.grass") && !rule.template.startsWith("s2.flora.shrub") &&
        !rule.template.startsWith("s2.rock")) continue;
      if (blocked(px, pz, y + rule.height * s, s)) continue;
      const align = rule.align ?? 0.15;
      instanceMatrix(tmp, 0, [px, y - 0.05 * s, pz], yaw, [s, s, s], Math.atan(gz) * align, -Math.atan(gx) * align);
      for (let k = 0; k < 16; k++) mats.push(tmp[k]!);
      const t = rule.tints?.[Math.floor(tint * rule.tints.length)] ?? [1, 1, 1];
      const v = 0.93 + 0.14 * smooth(0, 1, tint);
      tints.push(t[0] * v, t[1] * v, t[2] * v, 1);
    }
    if (mats.length) out.push({ template: rule.template, matrices: new Float32Array(mats), tints: new Float32Array(tints) });
  }
  return out;
}

/** Same classification as `layout.biomeAt`, using precomputed masks. */
function biomeOf(x: number, z: number, m: TerrainMasks): string {
  // Floor is sampled by the caller; this keeps the per-candidate cost low.
  const region = regionAtPoint(x, z);
  switch (region) {
    case "island_chain": return m.land > 0.5 ? "isle_land" : "isle_shoal";
    case "thermal_rift": return m.trench > 0.4 ? "rift_trench" : "rift_cool_flank";
    case "silt_basin": return m.ridge > 0.35 ? "basin_wreck" : "basin_sediment";
    case "suspended_garden": return "canopy_crowns";
    case "brine_divide": return m.brineSide > 0.5 ? "divide_brine" : "divide_ridge";
    case "deep_district": return m.escarpment > 0.5 ? "meridian_escarpment" : "meridian_terraces";
    default: return "reef_shallows";
  }
}

export const scatterFactory: ChunkArtFactory = {
  id: "s2.scatter",
  *build(ctx, chunk, _ref, lod) {
    // A chunk's column can span several biomes; dress each where it occurs.
    const biomes = new Set<string>();
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const x = chunk.bounds.min.x + 16 + i * 32, z = chunk.bounds.min.z + 16 + j * 32;
        biomes.add(biomeOf(x, z, terrainMasks(x, z)));
        if (ctx.due()) yield;
      }
    }
    const instances: InstanceRecipe[] = [];
    for (const b of [...biomes].sort()) instances.push(...yield* scatterChunk(ctx, chunk, b, lod === "fine"));
    return { meshes: [], instances };
  },
};
