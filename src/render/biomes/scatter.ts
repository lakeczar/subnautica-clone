import type { ChunkArtFactory, ChunkBuildContext, InstanceRecipe } from "../kit/types.js";
import type { ChunkDescriptor } from "../../world/types.js";
import { regionAtPoint } from "../../content/regions/layout.js";
import { fbm, hash2, smooth } from "../../content/regions/noise.js";
import { ROUTES, CRAFT_PROFILES } from "../../content/regions/passages.js";
import { RESCUE_PLANS } from "../../content/regions/rescue.js";
import { SITES } from "../../content/regions/sites.js";
import { STRUCTURES } from "../../content/regions/structures.js";
import { BRINE_Y, emptyMasks, terrainMasks, type TerrainMasks } from "../../content/regions/terrain.js";
import { TERRAIN_EXTENT } from "../terrainSurface.js";
import { writeInstance } from "./recipe.js";
import { vistaMesh } from "./vistas.js";
import { CAVE_SOURCES } from "../../content/regions/caves.js";

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
  /** Weighted silhouettes to draw instead of `template` alone. Neighbours
   * mostly share one (a slow noise picks it), so a field reads as colonies of
   * a form rather than one shape stamped on a grid. */
  variants?: readonly (readonly [string, number])[];
  /** Colony placement: centres on a world lattice of `spacing` (so a colony
   * continues across chunk edges), each with `members` pieces within
   * `radius`, largest at the heart. `chance` applies per centre. */
  clump?: { readonly members: readonly [number, number]; readonly radius: number };
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
const WHITE = [1, 1, 1] as const;
const WARM = [[1, 0.95, 0.9], [1.05, 1, 0.92], [0.92, 0.95, 1]] as const;
const GREEN = [[1, 1, 1], [0.9, 1.05, 0.95], [1.08, 1.02, 0.9]] as const;
const BOULDERS = [["s2.rock.boulder", 3], ["s2.rock.boulder.flat", 2], ["s2.rock.boulder.pair", 1]] as const;
const SLABS = [["s2.rock.slab", 2], ["s2.rock.slab.stack", 1], ["s2.rock.slab.split", 1], ["s2.rock.slab.wedge", 1]] as const;
const COLUMNS = [["s2.rock.column", 3], ["s2.rock.column.lean", 1], ["s2.rock.column.stump", 2]] as const;
const SHARDS = [["s2.rock.shard", 3], ["s2.rock.shard.spray", 1]] as const;
const TUBES = [["s2.flora.tube", 3], ["s2.flora.tube.organ", 1], ["s2.flora.tube.ring", 1]] as const;
const CUPS = [["s2.flora.cup", 3], ["s2.flora.cup.tier", 1]] as const;
const fans = (id: string): readonly (readonly [string, number])[] =>
  [[id, 3], [`${id}.whip`, 2], [`${id}.twin`, 2], [`${id}.ruffle`, 1]];

export const SCATTER_RULES: Readonly<Record<string, readonly Rule[]>> = {
  reef_shallows: [
    { template: "s2.flora.cup", variants: CUPS, spacing: 9, chance: 0.45, clump: { members: [3, 8], radius: 2.4 }, scale: [0.8, 1.4], slope: [0, 0.45], height: 0.5, tints: WARM },
    { template: "s2.flora.fan_coral", variants: fans("s2.flora.fan_coral"), spacing: 13, chance: 0.5, clump: { members: [3, 9], radius: 3.2 }, scale: [0.8, 1.6], cluster: { scale: 30, above: -0.1 }, height: 1.5, tints: WARM },
    { template: "s2.flora.ribbon", spacing: 5, chance: 0.25, scale: [0.8, 1.3], cluster: { scale: 22, above: 0.1 }, height: 2.6 },
    { template: "s2.rock.boulder", variants: BOULDERS, spacing: 9, chance: 0.3, scale: [0.6, 2], align: 0.5, coarse: 0.6, height: 1.3 },
  ],
  isle_land: [
    { template: "s2.flora.grass", spacing: 2, chance: 0.55, scale: [0.8, 1.5], y: [1.4, 95], slope: [0, 0.75], height: 0.7, tints: GREEN },
    { template: "s2.flora.shrub", spacing: 5, chance: 0.3, scale: [0.7, 1.8], y: [2.5, 85], slope: [0, 0.6], cluster: { scale: 28, above: -0.05 }, coarse: 0.5, height: 1.4, tints: GREEN },
    { template: "s2.rock.column", variants: COLUMNS, spacing: 8, chance: 0.25, scale: [0.6, 1.6], slope: [0.6, 9], coarse: 0.5, height: 4 },
    { template: "s2.rock.boulder", variants: BOULDERS, spacing: 7, chance: 0.2, scale: [0.4, 1.4], align: 0.7, height: 1 },
  ],
  isle_shoal: [
    { template: "s2.rock.boulder", variants: BOULDERS, spacing: 6, chance: 0.3, scale: [0.5, 1.8], align: 0.6, coarse: 0.5, height: 1.2 },
    { template: "s2.rock.slab", variants: SLABS, spacing: 16, chance: 0.4, clump: { members: [2, 5], radius: 3.5 }, scale: [0.6, 1.4], align: 0.8, height: 0.8 },
    { template: "s2.flora.ribbon", spacing: 5, chance: 0.3, scale: [0.7, 1.2], y: [-40, -2], cluster: { scale: 18, above: 0 }, height: 2.6 },
    { template: "s2.flora.cup", variants: CUPS, spacing: 11, chance: 0.35, clump: { members: [2, 6], radius: 2 }, scale: [0.7, 1.2], y: [-30, -1], height: 0.5, tints: WARM },
  ],
  canopy_crowns: [
    { template: "s2.flora.frond", spacing: 4, chance: 0.45, scale: [0.8, 1.6], cluster: { scale: 36, above: -0.15 }, weight: m => 0.4 + m.rib, coarse: 0.25, height: 7 },
    { template: "s2.flora.crown", spacing: 34, chance: 0.6, scale: [0.8, 1.35], weight: m => 0.3 + m.rib, coarse: 1, height: 30 },
    { template: "s2.flora.ribbon", spacing: 6, chance: 0.2, scale: [0.8, 1.4], height: 2.6 },
    { template: "s2.rock.boulder", variants: BOULDERS, spacing: 10, chance: 0.2, scale: [0.6, 1.6], align: 0.5, height: 1.2 },
  ],
  basin_sediment: [
    { template: "s2.rock.boulder", variants: BOULDERS, spacing: 14, chance: 0.12, scale: [0.6, 1.5], align: 0.4, coarse: 0.5, height: 1.2 },
    { template: "s2.flora.tube", variants: TUBES, spacing: 18, chance: 0.3, clump: { members: [3, 7], radius: 3 }, scale: [0.8, 1.5], cluster: { scale: 40, above: 0.15 }, height: 1.9 },
    { template: "s2.debris.panel", spacing: 12, chance: 0.08, scale: [0.8, 1.4], align: 1, height: 0.2 },
  ],
  // W2 hub spur: Hearth Reef life on the pinnacle caps, bare limestone below.
  hub_reef: [
    { template: "s2.flora.cup", variants: CUPS, spacing: 8, chance: 0.5, clump: { members: [3, 8], radius: 2.4 }, scale: [0.8, 1.5], slope: [0, 0.5], weight: m => m.reefCap, height: 0.5, tints: WARM },
    { template: "s2.flora.fan_coral", variants: fans("s2.flora.fan_coral"), spacing: 10, chance: 0.6, clump: { members: [3, 9], radius: 3.2 }, scale: [0.9, 1.8], weight: m => m.reefCap, cluster: { scale: 24, above: -0.2 }, coarse: 0.3, height: 1.5, tints: WARM },
    { template: "s2.flora.ribbon", spacing: 5, chance: 0.3, scale: [0.8, 1.4], weight: m => m.reefCap, cluster: { scale: 18, above: 0.05 }, height: 2.6 },
    { template: "s2.rock.column", variants: COLUMNS, spacing: 9, chance: 0.22, scale: [0.6, 1.4], slope: [0.6, 9], weight: m => 1 - m.reefCap, coarse: 0.4, height: 4 },
    { template: "s2.rock.boulder", variants: BOULDERS, spacing: 10, chance: 0.2, scale: [0.6, 1.6], align: 0.5, height: 1.2 },
  ],
  basin_wreck: [
    { template: "s2.debris.panel", spacing: 4, chance: 0.4, scale: [0.8, 1.8], align: 1, weight: m => m.ridge, cluster: { scale: 26, above: 0.25 }, height: 0.3 },
    { template: "s2.debris.pipe", spacing: 7, chance: 0.25, scale: [0.6, 1.4], align: 1, weight: m => m.ridge, cluster: { scale: 26, above: 0.15 }, coarse: 0.5, height: 0.6 },
    { template: "s2.rock.slab", variants: SLABS, spacing: 14, chance: 0.5, clump: { members: [2, 6], radius: 4 }, scale: [0.7, 1.6], align: 0.8, coarse: 0.4, height: 0.8 },
    { template: "s2.flora.tube", variants: TUBES, spacing: 12, chance: 0.35, clump: { members: [3, 8], radius: 2.6 }, scale: [0.8, 1.4], cluster: { scale: 20, above: -0.1 }, height: 1.9 },
    { template: "s2.flora.fan", variants: fans("s2.flora.fan"), spacing: 15, chance: 0.4, clump: { members: [2, 6], radius: 3 }, scale: [0.7, 1.2], weight: m => m.ridge, height: 1.9 },
  ],
  rift_cool_flank: [
    { template: "s2.flora.fan", variants: fans("s2.flora.fan"), spacing: 10, chance: 0.7, clump: { members: [4, 10], radius: 3.8 }, scale: [0.8, 1.7], weight: m => m.ledge * (0.4 + m.coolFlank), cluster: { scale: 26, above: -0.2 }, coarse: 0.2, height: 1.9, tints: WARM },
    { template: "s2.rock.slab", variants: SLABS, spacing: 15, chance: 0.5, clump: { members: [2, 5], radius: 4 }, scale: [0.7, 1.8], align: 0.9, coarse: 0.4, height: 0.8 },
    { template: "s2.rock.column", variants: COLUMNS, spacing: 10, chance: 0.18, scale: [0.6, 1.4], slope: [0.5, 9], height: 4 },
    { template: "s2.flora.tube", variants: TUBES, spacing: 6, chance: 0.2, scale: [0.8, 1.3], height: 1.9 },
  ],
  rift_trench: [
    { template: "s2.rock.column", variants: COLUMNS, spacing: 13, chance: 0.6, clump: { members: [2, 6], radius: 4 }, scale: [0.8, 2.2], coarse: 0.4, height: 6 },
    { template: "s2.rock.boulder", variants: BOULDERS, spacing: 6, chance: 0.3, scale: [0.6, 2], align: 0.5, height: 1.5 },
    { template: "s2.flora.tube", variants: TUBES, spacing: 5, chance: 0.3, scale: [1, 2], y: [-560, -440], height: 2, tints: [[1.15, 0.85, 0.7], [1.2, 0.9, 0.75]] },
  ],
  divide_ridge: [
    { template: "s2.rock.shard", variants: SHARDS, spacing: 12, chance: 0.5, clump: { members: [3, 8], radius: 3.4 }, scale: [0.6, 1.8], y: [-420, -330], slope: [0, 0.6], cluster: { scale: 24, above: -0.05 }, coarse: 0.3, height: 3 },
    { template: "s2.rock.slab", variants: SLABS, spacing: 6, chance: 0.3, scale: [0.7, 2], align: 0.9, coarse: 0.4, height: 0.8 },
    { template: "s2.rock.boulder", variants: BOULDERS, spacing: 7, chance: 0.3, scale: [0.6, 2], align: 0.5, height: 1.5 },
    { template: "s2.flora.ribbon", spacing: 5, chance: 0.25, scale: [0.8, 1.5], y: [BRINE_Y + 15, -320], height: 2.6 },
  ],
  divide_brine: [
    { template: "s2.salt.crust", spacing: 5, chance: 0.45, scale: [0.8, 2.6], y: [-800, BRINE_Y], align: 1, coarse: 0.3, height: 0.2 },
    { template: "s2.rock.boulder", variants: BOULDERS, spacing: 10, chance: 0.15, scale: [0.6, 1.6], y: [-800, BRINE_Y], align: 0.5, height: 1.2 },
    { template: "s2.rock.shard", variants: SHARDS, spacing: 12, chance: 0.1, scale: [0.5, 1], y: [-800, BRINE_Y], height: 2 },
  ],
  meridian_terraces: [
    { template: "s2.lamp", spacing: 22, chance: 0.5, scale: [1, 1], slope: [0, 0.3], weight: m => m.terrace, coarse: 1, height: 3.6 },
    { template: "s2.debris.panel", spacing: 8, chance: 0.15, scale: [0.8, 1.5], align: 1, height: 0.2 },
    { template: "s2.debris.pipe", spacing: 10, chance: 0.1, scale: [0.7, 1.4], align: 1, height: 0.6 },
    { template: "s2.rock.boulder", variants: BOULDERS, spacing: 12, chance: 0.12, scale: [0.4, 1.2], slope: [0.3, 9], height: 1 },
    { template: "s2.flora.tube", variants: TUBES, spacing: 16, chance: 0.35, clump: { members: [2, 6], radius: 2.4 }, scale: [0.8, 1.2], cluster: { scale: 30, above: 0.2 }, height: 1.9 },
  ],
  meridian_escarpment: [
    { template: "s2.rock.column", variants: COLUMNS, spacing: 14, chance: 0.55, clump: { members: [3, 8], radius: 4.5 }, scale: [0.8, 2], slope: [0.4, 9], coarse: 0.4, height: 6 },
    { template: "s2.rock.boulder", variants: BOULDERS, spacing: 12, chance: 0.5, clump: { members: [2, 7], radius: 4 }, scale: [0.6, 2], align: 0.5, height: 1.5 },
    { template: "s2.rock.shard", variants: SHARDS, spacing: 9, chance: 0.12, scale: [0.6, 1.2], height: 2 },
    { template: "s2.flora.fan", variants: fans("s2.flora.fan"), spacing: 18, chance: 0.35, clump: { members: [2, 6], radius: 2.5 }, scale: [0.7, 1.3], slope: [0, 0.7], height: 1.9 },
  ],
};

// --- Keep-out: open water the passages, tethers and moorings need ----------
/** Open water above (x, z): radius `r`, from just below `y` up to `y + head`. */
interface KeepPoint { x: number; z: number; y: number; r: number; head: number }
const KEEP_BUCKET = 64;
let keep: Map<number, KeepPoint[]> | null = null;
const kkey = (bx: number, bz: number): number => (bx + 1000) * 4096 + (bz + 1000);
/** Build the keep-out index ahead of the first chunk (a one-time cost of a
 * few milliseconds), so no scatter build step pays for it. */
export function prewarmScatter(): void { keepIndex(); }
function keepIndex(): Map<number, KeepPoint[]> {
  if (keep) return keep;
  keep = new Map();
  const add = (p: KeepPoint): void => {
    for (let bx = Math.floor((p.x - p.r) / KEEP_BUCKET); bx <= Math.floor((p.x + p.r) / KEEP_BUCKET); bx++)
      for (let bz = Math.floor((p.z - p.r) / KEEP_BUCKET); bz <= Math.floor((p.z + p.r) / KEEP_BUCKET); bz++) {
        const k = kkey(bx, bz); if (!keep!.has(k)) keep!.set(k, []); keep!.get(k)!.push(p);
      }
  };
  const line = (path: readonly { x: number; y: number; z: number }[], r: number, bottom: number, head: number): void => {
    for (let i = 0; i < path.length - 1; i++) {
      // By 3D length: every 3 m, so the 4 m+ headroom columns overlap even
      // where a tether drops straight down.
      const a = path[i]!, b = path[i + 1]!, n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 3));
      for (let k = 0; k <= n; k++) { const t = k / n; add({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t + bottom, r, head }); }
    }
  };
  for (const r of ROUTES) {
    if (r.role === "walk") continue;
    const c = CRAFT_PROFILES[r.profile];
    line(r.path, Math.max(c.radius, r.kind === "open" ? r.minHalfWidth : c.radius) + 1, c.bottom, c.height + 4);
  }
  for (const p of RESCUE_PLANS) for (const b of p.tethers) line(b, 5.5, 0, 4);
  for (const s of SITES) if (s.pad && typeof s.at.y === "number") add({ x: s.at.x, z: s.at.z, y: s.at.y + 40, r: s.pad.radius * (s.pad.flat ?? 0.55), head: Infinity });
  for (const s of STRUCTURES) for (const b of s.solids)
    add({ x: (b.min.x + b.max.x) / 2, z: (b.min.z + b.max.z) / 2, y: b.max.y + 40, r: Math.hypot(b.max.x - b.min.x, b.max.z - b.min.z) / 2 + 1.5, head: Infinity });
  return keep;
}
/** True where an axis-aligned box overlaps any keep-out column. */
export function blockedBox(min: { x: number; y: number; z: number }, max: { x: number; y: number; z: number }): boolean {
  const index = keepIndex(), seen = new Set<KeepPoint>();
  for (let bx = Math.floor(min.x / KEEP_BUCKET) - 1; bx <= Math.floor(max.x / KEEP_BUCKET) + 1; bx++)
    for (let bz = Math.floor(min.z / KEEP_BUCKET) - 1; bz <= Math.floor(max.z / KEEP_BUCKET) + 1; bz++)
      for (const p of index.get(kkey(bx, bz)) ?? []) {
        if (seen.has(p)) continue;
        seen.add(p);
        const dx = Math.max(min.x - p.x, 0, p.x - max.x), dz = Math.max(min.z - p.z, 0, p.z - max.z);
        if (max.y > p.y - 0.5 && min.y < p.y + p.head && Math.hypot(dx, dz) < p.r) return true;
      }
  return false;
}

/** True where a piece at (x, z) spanning `bottom`..`top` (scatter grows from
 * the floor, so its bottom is unbounded) with `radius` would stand in open
 * water a passage, tether, mooring or structure needs. */
export function blocked(x: number, z: number, top: number, radius: number, bottom = -Infinity): boolean {
  const list = keepIndex().get(kkey(Math.floor(x / KEEP_BUCKET), Math.floor(z / KEEP_BUCKET)));
  if (!list) return false;
  for (const p of list) if (top > p.y - 0.5 && bottom < p.y + p.head && Math.hypot(x - p.x, z - p.z) < p.r + radius) return true;
  return false;
}

const L = TERRAIN_EXTENT;
const legacy = (x: number, z: number): boolean => x >= L.minX && x <= L.maxX && z >= L.minZ && z <= L.maxZ;
/** Inside a W1 cave's replacement footprint (plus a metre): the heightfield is
 * not the floor there, so nothing is scattered on it. */
const caved = (x: number, z: number): boolean => CAVE_SOURCES.some(({ footprint: f }) =>
  x >= f.minX - 1 && x <= f.maxX + 1 && z >= f.minZ - 1 && z <= f.maxZ + 1);

/** One rule's output: a typed buffer pair per silhouette that doubles when
 * full, so allocation follows what is placed rather than every candidate. */
class Placements {
  private readonly out = new Map<string, { mats: Float32Array; tints: Float32Array; count: number }>();
  add(template: string, x: number, y: number, z: number, yaw: number, s: number, tiltX: number, tiltZ: number,
    t: readonly [number, number, number], v: number): void {
    let o = this.out.get(template);
    if (!o) { o = { mats: new Float32Array(64 * 16), tints: new Float32Array(64 * 4), count: 0 }; this.out.set(template, o); }
    if (o.count * 16 === o.mats.length) {
      const mats = new Float32Array(o.mats.length * 2), tints = new Float32Array(o.tints.length * 2);
      mats.set(o.mats); tints.set(o.tints); o.mats = mats; o.tints = tints;
    }
    writeInstance(o.mats, o.count * 16, x, y, z, yaw, s, tiltX, tiltZ);
    o.tints[o.count * 4] = t[0] * v; o.tints[o.count * 4 + 1] = t[1] * v; o.tints[o.count * 4 + 2] = t[2] * v; o.tints[o.count * 4 + 3] = 1;
    o.count++;
  }
  recipes(): InstanceRecipe[] {
    return [...this.out].sort(([a], [b]) => a < b ? -1 : 1).filter(([, o]) => o.count)
      .map(([template, o]) => ({ template, matrices: o.mats.slice(0, o.count * 16), tints: o.tints.slice(0, o.count * 4) }));
  }
}

/** A rule's silhouette at a point: a slow noise biases neighbours toward one
 * form (by `share`) and `r` (0..1) picks among the rest. */
function variantAt(rule: Rule, x: number, z: number, r: number, ri: number, share = 0.7): string {
  const v = rule.variants;
  if (!v) return rule.template;
  const total = v.reduce((n, e) => n + e[1], 0);
  let k = ((fbm(x, z, 26, 1, 700 + ri) * 0.5 + 0.5) * share + r * (1 - share)) * total;
  for (const [id, w] of v) { if (k < w) return id; k -= w; }
  return v[v.length - 1]![0];
}

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
  const scratch = emptyMasks();
  const out: InstanceRecipe[] = [];
  for (let ri = 0; ri < rules.length; ri++) {
    const rule = rules[ri]!;
    if (!fine && !rule.coarse) continue;
    /** The checks every piece passes; returns its floor height or NaN. */
    const site = (px: number, pz: number, s: number): number => {
      if (legacy(px, pz) || caved(px, pz) || biomeOf(px, pz, maskAt(px, pz)) !== biome) return NaN;
      const y = floor(px, pz);
      if (rule.y && (y < rule.y[0] || y > rule.y[1])) return NaN;
      if (y > 0 && !rule.template.startsWith("s2.flora.grass") && !rule.template.startsWith("s2.flora.shrub") &&
        !rule.template.startsWith("s2.rock")) return NaN;
      if (blocked(px, pz, y + rule.height * s, s)) return NaN;
      return y;
    };
    // Forward differences from the piece's own floor height: two more floor
    // queries per piece rather than four.
    const tilt = (px: number, y: number, pz: number): [number, number, number] => {
      const gx = (floor(px + 0.5, pz) - y) * 2, gz = (floor(px, pz + 0.5) - y) * 2;
      return [gx, gz, Math.hypot(gx, gz)];
    };
    const align = rule.align ?? 0.15;
    if (rule.clump) {
      // Colonies: centres on a world lattice, members kept where they fall in
      // this chunk, so a colony is whole however the chunks divide it.
      const sp = rule.spacing, rad = rule.clump.radius, [lo, hi] = rule.clump.members;
      const i0 = Math.floor((min.x - rad) / sp), i1 = Math.floor((max.x + rad) / sp);
      const j0 = Math.floor((min.z - rad) / sp), j1 = Math.floor((max.z + rad) / sp);
      const place = new Placements();
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        if (ctx.due()) yield;
        const rc = random(Math.floor((hash2(i, j, 811 + ri * 37 + biome.length) + 1) * 2147483647));
        rc();
        const cx = (i + rc()) * sp, cz = (j + rc()) * sp, roll = rc(), form = rc(), keep = rc();
        const n = lo + Math.floor(rc() * (hi - lo + 1));
        if (!fine && keep >= (rule.coarse ?? 0)) continue;
        if (cx + rad < min.x || cx - rad >= max.x || cz + rad < min.z || cz - rad >= max.z || legacy(cx, cz)) continue;
        const m = terrainMasks(cx, cz, scratch);
        if (biomeOf(cx, cz, m) !== biome) continue;
        if (roll > rule.chance * Math.min(1.5, rule.weight ? rule.weight(m, 0) : 1)) continue;
        if (rule.cluster && fbm(cx, cz, rule.cluster.scale, 2, 400 + ri) < rule.cluster.above) continue;
        const colony = variantAt(rule, cx, cz, form, ri);
        for (let k = 0; k < n; k++) {
          if (ctx.due()) yield;
          const a = rc() * Math.PI * 2, r = rad * Math.sqrt(rc()), stray = rc(), sv = rc(), yaw = rc() * Math.PI * 2, tint = rc();
          if (!fine && r > rad * 0.6) continue;
          const px = cx + Math.cos(a) * r, pz = cz + Math.sin(a) * r;
          if (px < min.x || px >= max.x || pz < min.z || pz >= max.z) continue;
          // Largest at the heart, smaller toward the fringe.
          const s = (rule.scale[0] + (rule.scale[1] - rule.scale[0]) * sv) * (1.15 - 0.5 * r / rad);
          const y = site(px, pz, s);
          if (Number.isNaN(y)) continue;
          const [gx, gz, slope] = tilt(px, y, pz);
          if (rule.slope && (slope < rule.slope[0] || slope > rule.slope[1])) continue;
          const t = rule.tints?.[Math.floor(form * rule.tints.length)] ?? WHITE;
          place.add(stray < 0.75 ? colony : variantAt(rule, px, pz, (stray - 0.75) / 0.25, ri, 0), px, y - 0.05 * s, pz, yaw, s,
            Math.atan(gz) * align, -Math.atan(gx) * align, t, 0.93 + 0.14 * smooth(0, 1, tint));
        }
      }
      out.push(...place.recipes());
      continue;
    }
    const rnd = random(chunk.cell.ix * 7919 + chunk.cell.iz * 104729 + ri * 31337 + biome.length * 17);
    const place = new Placements();
    for (let z = min.z; z < max.z; z += rule.spacing) for (let x = min.x; x < max.x; x += rule.spacing) {
      if (ctx.due()) yield;
      const px = x + rnd() * rule.spacing, pz = z + rnd() * rule.spacing;
      const roll = rnd(), s = rule.scale[0] + (rule.scale[1] - rule.scale[0]) * rnd(), yaw = rnd() * Math.PI * 2, tint = rnd();
      const keepCoarse = fine || rnd() < (rule.coarse ?? 0);
      if (!keepCoarse || px >= max.x || pz >= max.z) continue;
      const m = maskAt(px, pz), w = rule.weight ? rule.weight(m, 0) : 1;
      if (roll > rule.chance * Math.min(1.5, w)) continue;
      if (rule.cluster && fbm(px, pz, rule.cluster.scale, 2, 400 + ri) < rule.cluster.above) continue;
      const y = site(px, pz, s);
      if (Number.isNaN(y)) continue;
      const [gx, gz, slope] = tilt(px, y, pz);
      if (rule.slope && (slope < rule.slope[0] || slope > rule.slope[1])) continue;
      const t = rule.tints?.[Math.floor(tint * rule.tints.length)] ?? WHITE;
      place.add(variantAt(rule, px, pz, tint, ri), px, y - 0.05 * s, pz, yaw, s, Math.atan(gz) * align, -Math.atan(gx) * align,
        t, 0.93 + 0.14 * smooth(0, 1, tint));
    }
    out.push(...place.recipes());
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
    case "silt_basin": return m.pinnacle > 0.5 ? "hub_reef" : m.ridge > 0.35 ? "basin_wreck" : "basin_sediment";
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
    if (ctx.due()) yield;
    // Composed set pieces anchored here (vistas.ts) ride with the dressing.
    const vista = yield* vistaMesh(chunk, lod, ctx.floor, ctx.due);
    return { meshes: vista ? [vista] : [], instances };
  },
};
