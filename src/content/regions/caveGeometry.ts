import type { Solid } from "../../sim/world.js";
import type { MeshRecipe } from "../../render/kit/types.js";
import type { Aabb, LodLevel, Rect, Vec3 } from "../../world/types.js";
import type { CaveDef, CaveRoom, CaveSource, CaveSurface, CarveSource, TerraceSource } from "./caves.js";
import { cachedBuild, type CacheKey, floorKey } from "../buildCache.js";
import { fbm, smooth } from "./noise.js";
import type { FloorFunction } from "./terrain.js";

/** One-source cave geometry (Babylon-free, deterministic).
 *
 * The authored source is two signed distances (negative inside): exterior
 * rock (the seabed plus stacked terraces) and carved open water (tubes,
 * chambers, shafts, smoothly unioned). `rock = max(exterior, -water)`.
 *
 * 1. **Sample once.** Every 0.5 m voxel of the owned footprint, from
 *    `baseY` to `topY`, is rock or water at its centre. A two-voxel pad
 *    around the footprint samples the heightfield, so the shell meets the
 *    surrounding seabed.
 * 2. **Thick rock.** Collision keeps exactly the union of every 2 m cube
 *    that fits in owned rock (a morphological opening). Rock thinner than a
 *    solid can be is dropped from collision AND art together, and reported.
 *    A greedy cover of that union with maximal boxes, each at least 2 m on
 *    every side and overlapping freely, becomes the `Solid` roster.
 * 3. **Shell.** Surface nets over the same opened occupancy. Each vertex
 *    stands for one voxel corner on the rock boundary and lies within
 *    `clamp` of it per axis, placed where the source distance crosses zero.
 *    Every shell point is therefore within `clamp * sqrt(3)` (0.35 m fine)
 *    of rock that is in the roster. Coarse samples 1 m voxels that are rock
 *    only when all eight fine voxels are, so coarse water contains all fine
 *    water: openings stay open and no tunnel is ever bridged. Both shells
 *    end exactly on the heightfield at the footprint edge.
 *
 * Meshes are plain `MeshRecipe`s with integer cel alpha, clipped to the
 * footprint and, for the bake, to 128 m columns (`clipMeshToRect`).
 *
 * **Linked caves (CA-1).** Caves whose footprints share an edge are
 * neighbours: a crawlway may cross that edge. Each side then samples the
 * OTHER cave's source (not the heightfield) in its pad, which is widened to
 * `LINKED_PAD`, and keeps shell vertices near the shared edge unrelaxed and
 * unsnapped. Both sides therefore compute identical occupancy, vertices,
 * triangles and normals across the seam, so the two clipped shells meet
 * exactly and the crawl's water is continuous. Rock ownership stays per
 * footprint: each cave's solids cover only its own columns. Neighbours must
 * share `baseY` and `topY` and sit on whole metres, so their fine and coarse
 * lattices coincide. A cave without neighbours builds exactly as before. */

const AXES = ["x", "y", "z"] as const;
const PAD = 2;
/** Pad, in voxels, of a cave with neighbours: 5 m. A neighbour's opened
 * rock is exact to 3.5 m past the seam (its 2 m cubes reach 1.5 m further),
 * which covers every voxel any seam triangle or normal reads at both LODs. */
const LINKED_PAD = 10;
/** Shell vertices within this many metres of a shared edge are not relaxed. */
const SEAM_FREEZE = 2.5;
const CUBE = 4; // 2 m of 0.5 m voxels
const FINE_CLAMP = 0.2;
const COARSE_CLAMP = 0.3;

export interface CaveGrid {
  readonly origin: Vec3;
  readonly voxel: number;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
}
/** The sampled cave. Arrays are indexed `i + nx * (j + ny * k)`, i along X,
 * j along Y, k along Z; voxel (i, j, k) has its centre at
 * `origin + (i + 0.5, j + 0.5, k + 0.5) * voxel`. */
export interface CaveVolume {
  readonly grid: CaveGrid;
  /** 1 = rock as collided and drawn: the opened rock inside the footprint,
   * the heightfield in the pad outside it. */
  readonly solid: Uint8Array;
  /** Rock signed distance at each centre, metres (negative in rock). */
  readonly field: Float32Array;
  /** Room index + 1 of carved water under the exterior (the cave inside);
   * 0 for rock and open exterior water. */
  readonly room: Uint8Array;
  /** 1 inside the owned footprint. */
  readonly owned: Uint8Array;
  readonly roomIds: readonly string[];
}

// --- Source distances -------------------------------------------------------

function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}
function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
const pow = Math.pow;

interface PreparedCarve {
  readonly carve: CarveSource;
  readonly room: number;
  readonly seed: number;
  readonly min: Vec3;
  readonly max: Vec3;
}
/** Conservative bound of a carve's water, padded by its wobble and blend. */
function carveBounds(c: CarveSource, pad: number): { min: Vec3; max: Vec3 } {
  const p = pad + c.wobble + 0.5;
  if (c.kind === "tube") {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of c.nodes) {
      const r = n.width / 2;
      minX = Math.min(minX, n.x - r); maxX = Math.max(maxX, n.x + r); minZ = Math.min(minZ, n.z - r); maxZ = Math.max(maxZ, n.z + r);
      minY = Math.min(minY, n.floor); maxY = Math.max(maxY, n.floor + n.height);
    }
    return { min: { x: minX - p, y: minY - p, z: minZ - p }, max: { x: maxX + p, y: maxY + p, z: maxZ + p } };
  }
  if (c.kind === "chamber") {
    const r = c.radii, o = c.center;
    return { min: { x: o.x - r.x - p, y: Math.max(c.floor, o.y - r.down) - p, z: o.z - r.z - p },
      max: { x: o.x + r.x + p, y: o.y + r.up + p, z: o.z + r.z + p } };
  }
  const r = c.radius + c.flare + p;
  return { min: { x: c.center[0] - r, y: c.bottom - p, z: c.center[1] - r }, max: { x: c.center[0] + r, y: c.top + p, z: c.center[1] + r } };
}

const TUBE_EXPONENT = 3.4;
function tubeDistance(c: Extract<CarveSource, { kind: "tube" }>, seed: number, x: number, y: number, z: number): number {
  let best = Infinity;
  const n1 = c.wobble * fbm(x + y * 0.6, z - y * 0.4, 4.5, 2, seed);
  for (let s = 1; s < c.nodes.length; s++) {
    const a = c.nodes[s - 1]!, b = c.nodes[s]!;
    const ex = b.x - a.x, ez = b.z - a.z, len2 = ex * ex + ez * ez;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / len2)) : 0;
    const u = Math.hypot(x - (a.x + ex * t), z - (a.z + ez * t));
    const floor = a.floor + (b.floor - a.floor) * t, width = a.width + (b.width - a.width) * t;
    const height = a.height + (b.height - a.height) * t;
    const hw = width / 2 + n1, hh = height * 0.58, v = Math.abs(y - (floor + height * 0.42));
    const q = pow(pow(u / hw, TUBE_EXPONENT) + pow(v / hh, TUBE_EXPONENT), 1 / TUBE_EXPONENT);
    const d = Math.max((q - 1) * Math.min(hw, hh), floor - y);
    if (d < best) best = d;
  }
  return best;
}
function chamberDistance(c: Extract<CarveSource, { kind: "chamber" }>, seed: number, x: number, y: number, z: number): number {
  const r = c.radii, o = c.center;
  const dx = Math.abs(x - o.x) / r.x, dz = Math.abs(z - o.z) / r.z;
  const rh = pow(pow(dx, 2.3) + pow(dz, 2.3), 1 / 2.3);
  const up = y > o.y, dy = up ? (y - o.y) / r.up : (o.y - y) / r.down, nv = up ? 2 : 3;
  const q = pow(pow(rh, nv) + pow(dy, nv), 1 / nv);
  const scale = Math.min(r.x, r.z, up ? r.up : r.down);
  const d = (q - 1) * scale - c.wobble * fbm(x + y * 0.7, z - y * 0.5, 5, 2, seed);
  return Math.max(d, c.floor - y);
}
function shaftDistance(c: Extract<CarveSource, { kind: "shaft" }>, seed: number, x: number, y: number, z: number): number {
  const radius = c.radius + c.flare * smooth(c.top - 4, c.top, y) + c.wobble * fbm(x + y, z - y, 3.5, 2, seed);
  return Math.max(Math.hypot(x - c.center[0], z - c.center[1]) - radius, c.bottom - y, y - c.top);
}
function carveDistance(p: PreparedCarve, x: number, y: number, z: number): number {
  const c = p.carve;
  return c.kind === "tube" ? tubeDistance(c, p.seed, x, y, z)
    : c.kind === "chamber" ? chamberDistance(c, p.seed, x, y, z) : shaftDistance(c, p.seed, x, y, z);
}

interface PreparedTerrace { readonly t: TerraceSource; readonly seed: number; readonly scale: number }
/** Outline part of a terrace distance at one column (negative inside),
 * before the batter. */
function terraceOutline(p: PreparedTerrace, x: number, z: number): number {
  const t = p.t, e = t.exponent;
  const dx = Math.abs(x - t.center[0]) / t.radii[0], dz = Math.abs(z - t.center[1]) / t.radii[1];
  return (pow(pow(dx, e) + pow(dz, e), 1 / e) - 1) * p.scale - t.wobble * fbm(x, z, t.wavelength, 2, p.seed);
}

/** Point queries on the authored source, for tests, art and the light field. */
export interface CaveSampler {
  /** Exterior rock distance: seabed and terraces, before carving. */
  exterior(x: number, y: number, z: number): number;
  /** Carved water distance and the room of the nearest carve (-1 if none). */
  water(x: number, y: number, z: number): { distance: number; room: number };
  /** Rock distance inside the owned footprint, a neighbour's own rock
   * inside a neighbour's footprint, the heightfield elsewhere. */
  rock(x: number, y: number, z: number): number;
}

const ownsPoint = (r: Rect, x: number, z: number): boolean => x >= r.minX && x < r.maxX && z >= r.minZ && z < r.maxZ;
/** Two footprints touch along a side for a positive length: a crawl may
 * cross there, and each samples the other's source in its pad. */
export function sharesEdge(a: Rect, b: Rect): boolean {
  const alongX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX), alongZ = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  return ((a.maxX === b.minX || b.maxX === a.minX) && alongZ > 0) || ((a.maxZ === b.minZ || b.maxZ === a.minZ) && alongX > 0);
}
/** The shared stretches of `a`'s boundary with its neighbours: a line at
 * `at` on `axis` (X = at for "x"), from `lo` to `hi` along the other axis. */
export interface SharedSpan { readonly axis: "x" | "z"; readonly at: number; readonly lo: number; readonly hi: number }
export function sharedSpans(a: Rect, neighbours: readonly CaveSource[]): SharedSpan[] {
  const out: SharedSpan[] = [];
  for (const n of neighbours) {
    const b = n.footprint;
    const loZ = Math.max(a.minZ, b.minZ), hiZ = Math.min(a.maxZ, b.maxZ), loX = Math.max(a.minX, b.minX), hiX = Math.min(a.maxX, b.maxX);
    if (hiZ > loZ && a.minX === b.maxX) out.push({ axis: "x", at: a.minX, lo: loZ, hi: hiZ });
    if (hiZ > loZ && a.maxX === b.minX) out.push({ axis: "x", at: a.maxX, lo: loZ, hi: hiZ });
    if (hiX > loX && a.minZ === b.maxZ) out.push({ axis: "z", at: a.minZ, lo: loX, hi: hiX });
    if (hiX > loX && a.maxZ === b.minZ) out.push({ axis: "z", at: a.maxZ, lo: loX, hi: hiX });
  }
  return out;
}
const spanDistance = (s: SharedSpan, x: number, z: number): number => s.axis === "x"
  ? Math.hypot(x - s.at, Math.max(s.lo - z, 0, z - s.hi)) : Math.hypot(z - s.at, Math.max(s.lo - x, 0, x - s.hi));

/** Neighbours must share the vertical envelope and whole-metre footprints,
 * so both lattices (fine 0.5 m and coarse 1 m) coincide across the seam. */
function checkNeighbours(source: CaveSource, neighbours: readonly CaveSource[]): void {
  for (const n of neighbours) {
    if (!sharesEdge(source.footprint, n.footprint)) throw new Error(`cave ${source.id}: ${n.id} is not an edge neighbour`);
    if (n.baseY !== source.baseY || n.topY !== source.topY) throw new Error(`caves ${source.id} and ${n.id}: neighbours must share baseY and topY`);
    for (const r of [source.footprint, n.footprint]) for (const v of [r.minX, r.maxX, r.minZ, r.maxZ])
      if (!Number.isInteger(v)) throw new Error(`caves ${source.id} and ${n.id}: neighbour footprints must sit on whole metres`);
  }
}

export function caveSampler(source: CaveSource, floor: FloorFunction, neighbours: readonly CaveSource[] = []): CaveSampler {
  const others = neighbours.map(n => ({ footprint: n.footprint, sampler: caveSampler(n, floor) }));
  const roomIndex = new Map(source.rooms.map((r, i) => [r.id, i]));
  const carves: PreparedCarve[] = source.carves.map(c => {
    const room = roomIndex.get(c.room);
    if (room === undefined) throw new Error(`cave ${source.id}: carve ${c.id} names unknown room ${c.room}`);
    return { carve: c, room, seed: seedOf(c.id), ...carveBounds(c, source.blend) };
  });
  const terraces: PreparedTerrace[] = source.terraces.map(t => ({ t, seed: seedOf(t.id), scale: Math.min(t.radii[0], t.radii[1]) }));
  const f = source.footprint;
  const exterior = (x: number, y: number, z: number): number => {
    let d = y - floor(x, z);
    for (const p of terraces) d = Math.min(d, Math.max(y - p.t.level, terraceOutline(p, x, z) - p.t.batter * Math.max(0, p.t.level - y)));
    return d;
  };
  const water = (x: number, y: number, z: number): { distance: number; room: number } => {
    let d = Infinity, best = Infinity, room = -1;
    for (const p of carves) {
      if (x < p.min.x || x > p.max.x || y < p.min.y || y > p.max.y || z < p.min.z || z > p.max.z) continue;
      const c = carveDistance(p, x, y, z);
      d = d === Infinity ? c : smin(d, c, source.blend);
      if (c < best) { best = c; room = p.room; }
    }
    return { distance: d, room };
  };
  return {
    exterior, water,
    rock(x, y, z) {
      if (!(x >= f.minX && x < f.maxX && z >= f.minZ && z < f.maxZ)) {
        for (const o of others) if (ownsPoint(o.footprint, x, z)) return o.sampler.rock(x, y, z);
        return y - floor(x, z);
      }
      if (y < source.baseY) return Math.max(-1, y - source.baseY);
      return Math.max(exterior(x, y, z), -water(x, y, z).distance);
    },
  };
}

// --- Sampling -----------------------------------------------------------------

function lattice(v: number, voxel: number): boolean {
  return Math.abs(v / voxel - Math.round(v / voxel)) < 1e-9;
}

const volumes = new WeakMap<CaveDef, CaveVolume>();
/** The sampled occupancy behind a generated definition. */
export function caveVolume(def: CaveDef): CaveVolume {
  const v = volumes.get(def);
  if (!v) throw new Error(`cave ${def.id}: not built by buildCave`);
  return v;
}

function sampleVolume(source: CaveSource, floor: FloorFunction, voxel: number, neighbours: readonly CaveSource[] = []): {
  grid: CaveGrid; raw: Uint8Array; field: Float32Array; near: Uint8Array; under: Uint8Array; owned: Uint8Array; linked: Uint8Array;
  group: Uint8Array;
} {
  const f = source.footprint;
  for (const v of [f.minX, f.maxX, f.minZ, f.maxZ, source.baseY, source.topY])
    if (!lattice(v, voxel)) throw new Error(`cave ${source.id}: ${v} is off the ${voxel} m lattice`);
  const pad = neighbours.length ? LINKED_PAD : PAD;
  const origin = { x: f.minX - pad * voxel, y: source.baseY, z: f.minZ - pad * voxel };
  const nx = Math.round((f.maxX - f.minX) / voxel) + 2 * pad, nz = Math.round((f.maxZ - f.minZ) / voxel) + 2 * pad;
  const ny = Math.round((source.topY - source.baseY) / voxel);
  const n = nx * ny * nz;
  // near: room + 1 of the nearest carve; under: beneath the exterior top;
  // linked: beneath a neighbour's exterior top, in its footprint.
  const raw = new Uint8Array(n), field = new Float32Array(n), near = new Uint8Array(n), under = new Uint8Array(n), owned = new Uint8Array(n);
  // group: 1 + the index of the neighbour owning a pad voxel, else 0.
  const linked = new Uint8Array(n), group = new Uint8Array(n);
  const sampler = caveSampler(source, floor);
  const others = neighbours.map(s => ({ footprint: s.footprint, sampler: caveSampler(s, floor) }));
  const terraces = source.terraces.map(t => ({ t, seed: seedOf(t.id), scale: Math.min(t.radii[0], t.radii[1]) }));
  const outline = new Float64Array(terraces.length);
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const x = origin.x + (i + 0.5) * voxel, z = origin.z + (k + 0.5) * voxel, ground = floor(x, z);
    const inside = i >= pad && i < nx - pad && k >= pad && k < nz - pad;
    const which = inside ? -1 : others.findIndex(o => ownsPoint(o.footprint, x, z)), other = others[which];
    if (inside) for (let t = 0; t < terraces.length; t++) outline[t] = terraceOutline(terraces[t]!, x, z);
    for (let j = 0; j < ny; j++) {
      const y = origin.y + (j + 0.5) * voxel, at = i + nx * (j + ny * k);
      if (other) {
        // The neighbour's own rock, exactly as its own build samples it.
        const ext = other.sampler.exterior(x, y, z);
        let d = ext;
        if (ext < 0) {
          d = Math.max(ext, -other.sampler.water(x, y, z).distance);
          linked[at] = 1;
          near[at] = sampler.water(x, y, z).room + 1;
        }
        field[at] = d; raw[at] = d < 0 ? 1 : 0; group[at] = which + 1;
        continue;
      }
      if (!inside) { field[at] = y - ground; raw[at] = y < ground ? 1 : 0; continue; }
      owned[at] = 1;
      let ext = y - ground;
      for (let t = 0; t < terraces.length; t++) {
        const p = terraces[t]!;
        ext = Math.min(ext, Math.max(y - p.t.level, outline[t]! - p.t.batter * Math.max(0, p.t.level - y)));
      }
      let d = ext;
      if (ext < 0) {
        under[at] = 1;
        const w = sampler.water(x, y, z);
        d = Math.max(ext, -w.distance);
        near[at] = w.room + 1;
      }
      field[at] = d; raw[at] = d < 0 ? 1 : 0;
    }
  }
  return { grid: { origin, voxel, nx, ny, nz }, raw, field, near, under, owned, linked, group };
}

// --- Thick rock -------------------------------------------------------------

/** Summed-volume table over a 0/1 grid, (nx+1)(ny+1)(nz+1). */
function summed(values: Uint8Array, nx: number, ny: number, nz: number): Int32Array {
  const sx = nx + 1, sy = ny + 1, s = new Int32Array(sx * sy * (nz + 1));
  for (let k = 1; k <= nz; k++) for (let j = 1; j <= ny; j++) for (let i = 1; i <= nx; i++) {
    const at = i + sx * (j + sy * k);
    s[at] = values[(i - 1) + nx * ((j - 1) + ny * (k - 1))]!
      + s[at - 1]! + s[at - sx]! + s[at - sx * sy]!
      - s[at - 1 - sx]! - s[at - 1 - sx * sy]! - s[at - sx - sx * sy]!
      + s[at - 1 - sx - sx * sy]!;
  }
  return s;
}
/** Sum over the half-open voxel box [i0, i1) x [j0, j1) x [k0, k1). */
function boxSum(s: Int32Array, nx: number, ny: number, i0: number, i1: number, j0: number, j1: number, k0: number, k1: number): number {
  const sx = nx + 1, sy = ny + 1, a = (i: number, j: number, k: number): number => s[i + sx * (j + sy * k)]!;
  return a(i1, j1, k1) - a(i0, j1, k1) - a(i1, j0, k1) - a(i1, j1, k0) + a(i0, j0, k1) + a(i0, j1, k0) + a(i1, j0, k0) - a(i0, j0, k0);
}

interface VoxelBox { i0: number; i1: number; j0: number; j1: number; k0: number; k1: number }

/** Open the masked rock by a 2 m cube: keep exactly the voxels some cube
 * lying wholly in masked rock contains. */
function openRock(raw: Uint8Array, mask: Uint8Array, grid: CaveGrid): { rock: Uint8Array; S: Int32Array; fits: Uint8Array; opened: Uint8Array; dropped: number } {
  const { nx, ny, nz } = grid, n = nx * ny * nz;
  const rock = new Uint8Array(n);
  for (let at = 0; at < n; at++) rock[at] = raw[at]! & mask[at]!;
  const S = summed(rock, nx, ny, nz), full = CUBE * CUBE * CUBE;
  const fits = new Uint8Array(n);
  for (let k = 0; k + CUBE <= nz; k++) for (let j = 0; j + CUBE <= ny; j++) for (let i = 0; i + CUBE <= nx; i++)
    if (boxSum(S, nx, ny, i, i + CUBE, j, j + CUBE, k, k + CUBE) === full) fits[i + nx * (j + ny * k)] = 1;
  const F = summed(fits, nx, ny, nz), opened = new Uint8Array(n);
  let dropped = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const at = i + nx * (j + ny * k);
    if (!rock[at]) continue;
    if (boxSum(F, nx, ny, Math.max(0, i - CUBE + 1), i + 1, Math.max(0, j - CUBE + 1), j + 1, Math.max(0, k - CUBE + 1), k + 1) > 0) opened[at] = 1;
    else dropped++;
  }
  return { rock, S, fits, opened, dropped };
}

/** Open owned rock by a 2 m cube, then cover the result with maximal boxes. */
function thickRock(raw: Uint8Array, owned: Uint8Array, grid: CaveGrid): { opened: Uint8Array; boxes: VoxelBox[]; dropped: number } {
  const { nx, ny, nz } = grid, n = nx * ny * nz;
  const { S, fits, opened, dropped } = openRock(raw, owned, grid);
  const inRock = (b: VoxelBox): boolean => b.i0 >= 0 && b.j0 >= 0 && b.k0 >= 0 && b.i1 <= nx && b.j1 <= ny && b.k1 <= nz &&
    boxSum(S, nx, ny, b.i0, b.i1, b.j0, b.j1, b.k0, b.k1) === (b.i1 - b.i0) * (b.j1 - b.j0) * (b.k1 - b.k0);
  const grow = (b: VoxelBox, faces: readonly (keyof VoxelBox)[]): void => {
    for (let moved = true; moved;) {
      moved = false;
      for (const face of faces) {
        const step = face.endsWith("0") ? -1 : 1;
        for (;;) {
          const next = { ...b, [face]: b[face] + step };
          if (!inRock(next)) break;
          b[face] = next[face]; moved = true;
        }
      }
    }
  };
  const covered = new Uint16Array(n), boxes: VoxelBox[] = [];
  // Seed from the bottom up so deep slabs come first and terraces stack on them.
  for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const at = i + nx * (j + ny * k);
    if (!opened[at] || covered[at]) continue;
    // Every 2 m cube holding this voxel may seed; each grows in three face
    // orders. Keep the candidate that covers the most still-uncovered rock.
    let seed: VoxelBox | null = null;
    for (let dk = 0; dk < CUBE && !seed; dk++) for (let dj = 0; dj < CUBE && !seed; dj++) for (let di = 0; di < CUBE && !seed; di++) {
      const oi = i - di, oj = j - dj, ok = k - dk;
      if (oi >= 0 && oj >= 0 && ok >= 0 && fits[oi + nx * (oj + ny * ok)])
        seed = { i0: oi, i1: oi + CUBE, j0: oj, j1: oj + CUBE, k0: ok, k1: ok + CUBE };
    }
    if (!seed) throw new Error("cave rock: opened voxel without a fitting cube");
    // Horizontal slabs first, then height, then widen again.
    grow(seed, ["i0", "i1", "k0", "k1"]);
    grow(seed, ["j0", "j1"]);
    grow(seed, ["i0", "i1", "k0", "k1"]);
    boxes.push(seed);
    for (let bk = seed.k0; bk < seed.k1; bk++) for (let bj = seed.j0; bj < seed.j1; bj++) for (let bi = seed.i0; bi < seed.i1; bi++)
      covered[bi + nx * (bj + ny * bk)] = covered[bi + nx * (bj + ny * bk)]! + 1;
  }
  // Drop boxes whose every voxel another box also covers, newest first.
  const kept: VoxelBox[] = [];
  for (let b = boxes.length - 1; b >= 0; b--) {
    const box = boxes[b]!;
    let redundant = true;
    for (let bk = box.k0; bk < box.k1 && redundant; bk++) for (let bj = box.j0; bj < box.j1 && redundant; bj++)
      for (let bi = box.i0; bi < box.i1; bi++) if (covered[bi + nx * (bj + ny * bk)]! < 2) { redundant = false; break; }
    if (!redundant) { kept.push(box); continue; }
    for (let bk = box.k0; bk < box.k1; bk++) for (let bj = box.j0; bj < box.j1; bj++) for (let bi = box.i0; bi < box.i1; bi++)
      covered[bi + nx * (bj + ny * bk)] = covered[bi + nx * (bj + ny * bk)]! - 1;
  }
  kept.reverse();
  return { opened, boxes: kept, dropped };
}

// --- Definition ---------------------------------------------------------------

/** Generate a cave definition from its source. Pure and deterministic, so on
 * a named floor the generated data may come from the build cache
 * (`content/buildCache.ts`); the definition still refers to `source` itself. */
export function buildCave(source: CaveSource, floor: FloorFunction, neighbours: readonly CaveSource[] = []): CaveDef {
  const key = floorKey("cave", floor, [source, neighbours], import.meta.url);
  const built = cachedBuild(key, () => {
    const def = generateCave(source, floor, neighbours);
    return { def: { ...def, source: null }, volume: caveVolume(def) };
  });
  const def: CaveDef = {
    ...built.def, replacementFootprints: [source.footprint],
    portals: source.portals, routes: source.routes, staging: source.staging, source,
  };
  volumes.set(def, built.volume);
  floors.set(def, floor);
  if (neighbours.length) linkedTo.set(def, neighbours);
  if (key) cacheKeys.set(def, key);
  return def;
}

const cacheKeys = new WeakMap<CaveDef, CacheKey>();
/** The build-cache key of data derived from `def` by the code of `module`,
 * or undefined when `def` itself was not cacheable (an unnamed floor). */
export function derivedCacheKey(def: CaveDef, kind: string, module: string, extra: readonly string[] = []): CacheKey | undefined {
  const base = cacheKeys.get(def);
  return base && { key: `${kind}:${base.key}`, modules: [module, ...base.modules, ...extra] };
}

function generateCave(source: CaveSource, floor: FloorFunction, neighbours: readonly CaveSource[]): CaveDef {
  const started = Date.now();
  checkNeighbours(source, neighbours);
  const s = sampleVolume(source, floor, 0.5, neighbours);
  const { grid } = s, { nx, ny, nz, origin, voxel } = grid;
  const { opened, boxes, dropped } = thickRock(s.raw, s.owned, grid);
  const solid = new Uint8Array(s.raw.length);
  for (let at = 0; at < solid.length; at++) solid[at] = s.owned[at] ? opened[at]! : s.raw[at]!;
  // In a neighbour's pad, its rock as its own build keeps it: opened by
  // cubes lying wholly in its columns, so the slivers it drops are water
  // here too and both sides see one occupancy at the seam.
  neighbours.forEach((_, k) => {
    const mask = new Uint8Array(solid.length);
    for (let at = 0; at < mask.length; at++) mask[at] = s.group[at] === k + 1 ? 1 : 0;
    const theirs = openRock(s.raw, mask, grid).opened;
    for (let at = 0; at < mask.length; at++) if (mask[at]) solid[at] = theirs[at]!;
  });
  // The cave inside: owned water beneath the exterior top, in the room of its
  // nearest carve. Rock the opening dropped is water now, in the same room.
  const room = new Uint8Array(solid.length);
  for (let at = 0; at < solid.length; at++) if (s.owned[at] && !solid[at] && s.under[at] && !s.raw[at]) room[at] = s.near[at]!;
  // A neighbour's cave water in the pad is cave inside too, never open water
  // (labelled before the slivers, which must not see a crawl across the seam
  // as open sea): the light field must not take it for daylight. It
  // takes the room of this cave's nearest carve (a crawl's carve is authored
  // in both sources), else of the water it touches, else the first room.
  if (neighbours.length) {
    let pending: number[] = [];
    for (let at = 0; at < solid.length; at++) if (s.linked[at] && !solid[at]) {
      if (s.near[at]) room[at] = s.near[at]!; else pending.push(at);
    }
    const sides = [1, -1, nx, -nx, nx * ny, -nx * ny];
    for (let moved = true; moved && pending.length;) {
      moved = false;
      const next: number[] = [];
      for (const at of pending) {
        const from = sides.find(d => at + d >= 0 && at + d < room.length && room[at + d]);
        if (from === undefined) next.push(at); else { room[at] = room[at + from]!; moved = true; }
      }
      pending = next;
    }
    for (const at of pending) room[at] = 1;
  }
  // Dropped slivers join the cave only where they touch its water; a lone
  // seabed knob dropped at the collar stays open exterior water.
  for (let pass = 0; pass < 3; pass++) for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const at = i + nx * (j + ny * k);
    if (room[at] || solid[at] || !s.raw[at] || !s.owned[at]) continue;
    const sides = [1, -1, nx, -nx, nx * ny, -nx * ny];
    if (sides.some(d => !solid[at + d] && !room[at + d] && !s.raw[at + d])) continue; // touches open water
    for (const d of sides) if (room[at + d]) { room[at] = room[at + d]!; break; }
  }
  let rockVoxels = 0, top = -Infinity;
  for (let at = 0; at < solid.length; at++) if (s.owned[at] && solid[at]) rockVoxels++;
  const rock: Solid[] = boxes.map((b, n) => {
    const min = { x: origin.x + b.i0 * voxel, y: origin.y + b.j0 * voxel, z: origin.z + b.k0 * voxel };
    const max = { x: origin.x + b.i1 * voxel, y: origin.y + b.j1 * voxel, z: origin.z + b.k1 * voxel };
    top = Math.max(top, max.y);
    return { id: `${source.id}.rock.${String(n).padStart(4, "0")}`, min, max };
  });
  const roomBounds = source.rooms.map(() => ({ min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } }));
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const r = room[i + nx * (j + ny * k)]!;
    if (!r || solid[i + nx * (j + ny * k)] || !s.owned[i + nx * (j + ny * k)]) continue;
    const b = roomBounds[r - 1]!, x = origin.x + i * voxel, y = origin.y + j * voxel, z = origin.z + k * voxel;
    b.min.x = Math.min(b.min.x, x); b.min.y = Math.min(b.min.y, y); b.min.z = Math.min(b.min.z, z);
    b.max.x = Math.max(b.max.x, x + voxel); b.max.y = Math.max(b.max.y, y + voxel); b.max.z = Math.max(b.max.z, z + voxel);
  }
  const rooms: CaveRoom[] = source.rooms.map((r, i) => {
    if (!Number.isFinite(roomBounds[i]!.min.x)) throw new Error(`cave ${source.id}: room ${r.id} has no water`);
    return { ...r, bounds: roomBounds[i]!, portals: source.portals.filter(p => p.between.includes(r.id)).map(p => p.id) };
  });
  const f = source.footprint;
  const surfaces: CaveSurface[] = [
    { id: `${source.id}.shell.fine`, lod: "fine", voxel, clamp: FINE_CLAMP },
    { id: `${source.id}.shell.coarse`, lod: "coarse", voxel: voxel * 2, clamp: COARSE_CLAMP },
  ];
  const def: CaveDef = {
    id: source.id, label: source.label, region: source.region,
    replacementFootprints: [f],
    bounds: { min: { x: f.minX, y: source.baseY, z: f.minZ }, max: { x: f.maxX, y: Math.min(source.topY, top + 0.5), z: f.maxZ } },
    rock, rooms, portals: source.portals, surfaces, routes: source.routes, staging: source.staging, source,
    stats: { voxels: solid.length, rockVoxels, droppedVoxels: dropped, ms: Date.now() - started },
  };
  volumes.set(def, { grid, solid, field: s.field, room, owned: s.owned, roomIds: source.rooms.map(r => r.id) });
  floors.set(def, floor);
  if (neighbours.length) linkedTo.set(def, neighbours);
  return def;
}
const floors = new WeakMap<CaveDef, FloorFunction>();
const linkedTo = new WeakMap<CaveDef, readonly CaveSource[]>();
/** The edge neighbours a definition was built with (empty for a lone cave). */
export function caveNeighbours(def: CaveDef): readonly CaveSource[] {
  return linkedTo.get(def) ?? [];
}

// --- Shell --------------------------------------------------------------------

interface Lattice {
  readonly grid: CaveGrid;
  readonly solid: Uint8Array;
  readonly field: Float32Array;
  readonly room: Uint8Array;
}
/** 1 m lattice: rock only where all eight fine voxels are rock. */
function coarsen(v: CaveVolume, sampler: CaveSampler): Lattice {
  const g = v.grid, nx = g.nx / 2, ny = g.ny / 2, nz = g.nz / 2, voxel = g.voxel * 2;
  if (![nx, ny, nz].every(Number.isInteger)) throw new Error("cave shell: fine grid must have even dimensions");
  const solid = new Uint8Array(nx * ny * nz), field = new Float32Array(nx * ny * nz), room = new Uint8Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let all = 1, r = 0;
    for (let c = 0; c < 8; c++) {
      const at = (2 * i + (c & 1)) + g.nx * ((2 * j + ((c >> 1) & 1)) + g.ny * (2 * k + (c >> 2)));
      all &= v.solid[at]!; if (!r) r = v.room[at]!;
    }
    const at = i + nx * (j + ny * k);
    solid[at] = all; room[at] = r;
    field[at] = sampler.rock(g.origin.x + (i + 0.5) * voxel, g.origin.y + (j + 0.5) * voxel, g.origin.z + (k + 0.5) * voxel);
  }
  return { grid: { origin: g.origin, voxel, nx, ny, nz }, solid, field, room };
}

/** Raw surface: positions, per-vertex room (0 exterior) and triangles. */
interface RawShell { positions: number[]; rooms: number[]; triangles: number[] }

/** `freeze` marks voxel corners (X/Z) whose vertices must not relax: near a
 * shared edge, so both neighbours compute the same seam. */
function surfaceNets(l: Lattice, clamp: number, freeze?: (x: number, z: number) => boolean): RawShell {
  const { grid, solid, field, room } = l, { nx, ny, nz, origin, voxel } = grid;
  const dx = nx - 1, dy = ny - 1, dz = nz - 1;
  const vertexOf = new Int32Array(dx * dy * dz).fill(-1);
  const positions: number[] = [], rooms: number[] = [], triangles: number[] = [], corners: number[] = [];
  const at = (i: number, j: number, k: number): number => i + nx * (j + ny * k);
  for (let k = 0; k < dz; k++) for (let j = 0; j < dy; j++) for (let i = 0; i < dx; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) mask |= solid[at(i + (c & 1), j + ((c >> 1) & 1), k + (c >> 2))]! << c;
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, count = 0, r = 0;
    for (let c = 0; c < 8; c++) {
      const ci = i + (c & 1), cj = j + ((c >> 1) & 1), ck = k + (c >> 2), a = at(ci, cj, ck);
      if (!solid[a] && !r) r = room[a]!;
      for (const [bit, di, dj, dk] of [[1, 1, 0, 0], [2, 0, 1, 0], [4, 0, 0, 1]] as const) {
        if (c & bit) continue;
        const b = at(ci + di, cj + dj, ck + dk), sa = solid[a]!, sb = solid[b]!;
        if (sa === sb) continue;
        const fa = field[a]!, fb = field[b]!;
        // The source crossing, unless the opening disagreed with its sign.
        const t = (fa < 0) === (sa === 1) && (fb < 0) === (sb === 1) && fa !== fb ? fa / (fa - fb) : 0.5;
        sx += ci + di * t; sy += cj + dj * t; sz += ck + dk * t; count++;
      }
    }
    // Lattice units from voxel centres; the shared corner is (i, j, k) + 1.
    const cx = origin.x + (i + 1) * voxel, cy = origin.y + (j + 1) * voxel, cz = origin.z + (k + 1) * voxel;
    const px = origin.x + (sx / count + 0.5) * voxel, py = origin.y + (sy / count + 0.5) * voxel, pz = origin.z + (sz / count + 0.5) * voxel;
    vertexOf[i + dx * (j + dy * k)] = positions.length / 3;
    corners.push(cx, cy, cz);
    positions.push(Math.max(cx - clamp, Math.min(cx + clamp, px)), Math.max(cy - clamp, Math.min(cy + clamp, py)),
      Math.max(cz - clamp, Math.min(cz + clamp, pz)));
    rooms.push(r);
  }
  const cell = (i: number, j: number, k: number): number =>
    i < 0 || j < 0 || k < 0 || i >= dx || j >= dy || k >= dz ? -1 : vertexOf[i + dx * (j + dy * k)]!;
  const P = (v: number): [number, number, number] => [positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!];
  const quad = (a: number, b: number, c: number, d: number, axis: number, sign: number): void => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    const pa = P(a), pb = P(b), pc = P(c), pd = P(d);
    const long = Math.hypot(pa[0] - pc[0], pa[1] - pc[1], pa[2] - pc[2]) > Math.hypot(pb[0] - pd[0], pb[1] - pd[1], pb[2] - pd[2]);
    const tris: [number, number, number][] = long ? [[a, b, d], [b, c, d]] : [[a, b, c], [a, c, d]];
    for (const [u, v, w] of tris) {
      const pu = P(u), pv = P(v), pw = P(w);
      const e1 = [pv[0] - pu[0], pv[1] - pu[1], pv[2] - pu[2]], e2 = [pw[0] - pu[0], pw[1] - pu[1], pw[2] - pu[2]];
      const nAxis = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!][axis]!;
      if (nAxis * sign >= 0) triangles.push(u, v, w); else triangles.push(u, w, v);
    }
  };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const s = solid[at(i, j, k)]!;
    if (i + 1 < nx && s !== solid[at(i + 1, j, k)]) quad(cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k), 0, s ? 1 : -1);
    if (j + 1 < ny && s !== solid[at(i, j + 1, k)]) quad(cell(i - 1, j, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i - 1, j, k), 1, s ? 1 : -1);
    if (k + 1 < nz && s !== solid[at(i, j, k + 1)]) quad(cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i, j, k), cell(i - 1, j, k), 2, s ? 1 : -1);
  }
  let frozen: Uint8Array | undefined;
  if (freeze) {
    frozen = new Uint8Array(corners.length / 3);
    for (let v = 0; v < frozen.length; v++) frozen[v] = freeze(corners[v * 3]!, corners[v * 3 + 2]!) ? 1 : 0;
  }
  relax(positions, corners, triangles, clamp, frozen);
  return { positions, rooms, triangles };
}

/** Two damped Laplacian passes over the shell, each vertex held within
 * `clamp` of its voxel corner per axis, so the rock bound still holds while
 * the voxel staircase relaxes into slopes the cel bands draw cleanly.
 * `frozen` vertices keep their raw position. */
function relax(positions: number[], corners: readonly number[], triangles: readonly number[], clamp: number, frozen?: Uint8Array): void {
  const n = positions.length / 3, sum = new Float64Array(n * 3), count = new Uint16Array(n);
  for (let pass = 0; pass < 2; pass++) {
    sum.fill(0); count.fill(0);
    for (let t = 0; t < triangles.length; t += 3) for (let e = 0; e < 3; e++) {
      const a = triangles[t + e]!, b = triangles[t + (e + 1) % 3]!;
      for (const [u, v] of [[a, b], [b, a]] as const) {
        sum[u * 3] = sum[u * 3]! + positions[v * 3]!; sum[u * 3 + 1] = sum[u * 3 + 1]! + positions[v * 3 + 1]!;
        sum[u * 3 + 2] = sum[u * 3 + 2]! + positions[v * 3 + 2]!; count[u] = count[u]! + 1;
      }
    }
    for (let v = 0; v < n; v++) {
      if (!count[v] || frozen?.[v]) continue;
      for (let a = 0; a < 3; a++) {
        const target = positions[v * 3 + a]! * 0.5 + sum[v * 3 + a]! / count[v]! * 0.5, c = corners[v * 3 + a]!;
        positions[v * 3 + a] = Math.max(c - clamp, Math.min(c + clamp, target));
      }
    }
  }
}

function vertexNormals(positions: readonly number[], triangles: readonly number[]): Float32Array {
  const n = new Float32Array(positions.length);
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t]! * 3, b = triangles[t + 1]! * 3, c = triangles[t + 2]! * 3;
    const ux = positions[b]! - positions[a]!, uy = positions[b + 1]! - positions[a + 1]!, uz = positions[b + 2]! - positions[a + 2]!;
    const vx = positions[c]! - positions[a]!, vy = positions[c + 1]! - positions[a + 1]!, vz = positions[c + 2]! - positions[a + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { n[v] = n[v]! + nx; n[v + 1] = n[v + 1]! + ny; n[v + 2] = n[v + 2]! + nz; }
  }
  for (let v = 0; v < n.length; v += 3) {
    const l = Math.hypot(n[v]!, n[v + 1]!, n[v + 2]!) || 1;
    n[v] = n[v]! / l; n[v + 1] = n[v + 1]! / l; n[v + 2] = n[v + 2]! / l;
  }
  return n;
}

// --- Colour -------------------------------------------------------------------

type Rgb = readonly [number, number, number];
const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const PALETTE = {
  top: hex("#cdd0ae"), top2: hex("#bfc6a2"), rim: hex("#dcb39a"),
  strata: [hex("#b8b392"), hex("#a8a78a"), hex("#c6bf9f")] as const,
  sand: hex("#b9d7b2"), sand2: hex("#a3c7a7"),
  wall: hex("#6f8580"), wall2: hex("#62797a"), ceiling: hex("#53676a"), silt: hex("#8a9f90"), silt2: hex("#7e9486"),
  amber: hex("#ffb45e"), teal: hex("#62e6d2"), violet: hex("#c6a1f2"),
} as const;

/** Unlit wayfinding colonies by each mouth, so an unlit diver can tell the
 * two exits apart from inside; dim ones mark the catch pocket. */
interface Glow { readonly at: Vec3; readonly radius: number; readonly color: Rgb; readonly room?: string }

/** Regional palettes (CA-1). Limestone is the Fanvault's own stone; basalt
 * is the Isles' black-green wave-cut rock with pale wet floors. */
const STYLE_PALETTES = {
  limestone: {
    top: PALETTE.top, top2: PALETTE.top2, rim: PALETTE.rim, strata: PALETTE.strata, sand: PALETTE.sand, sand2: PALETTE.sand2,
    wall: hex("#7a8c84"), wall2: hex("#6c8180"), ceiling: hex("#5d7271"), floor: PALETTE.silt, floor2: PALETTE.silt2,
    mouths: [PALETTE.amber, PALETTE.teal, PALETTE.violet],
  },
  basalt: {
    top: hex("#4d5b52"), top2: hex("#56645a"), rim: hex("#8a8f78"), strata: [hex("#3f4c49"), hex("#36433f"), hex("#47544d")] as const,
    sand: hex("#c4c3a4"), sand2: hex("#b2b597"),
    wall: hex("#3c4b4b"), wall2: hex("#34423f"), ceiling: hex("#566c6b"), floor: hex("#a7b3a2"), floor2: hex("#96a593"),
    mouths: [hex("#8ff0c4"), hex("#ffcf7a"), hex("#a8d8ff")],
  },
} as const;
const GLIMMER_HEAD = hex("#d8ffe9"), GLIMMER_TAIL = hex("#5fc9b4"), CLAPPER = hex("#e6dcc2"), CLAPPER2 = hex("#c9bfa6");

/** The styled cave shell: regional stone, mouth colonies and the resident.
 * Glimmer mats are unlit streaks along the direction to the nearest
 * opening, each brightening toward it, so a lamp-off diver reads the way out
 * off the ceiling. Clappers are pale shells banded along walls and lips,
 * thickest near the openings where the surge runs. */
function styledColors(source: CaveSource, style: NonNullable<CaveSource["style"]>, floor: FloorFunction,
  positions: Float32Array, normals: Float32Array, rooms: Uint8Array, out: Float32Array): void {
  const pal = STYLE_PALETTES[style.rock];
  const openings = source.portals.filter(p => p.kind === "mouth" || p.kind === "skylight");
  const mouths = source.portals.filter(p => p.kind === "mouth");
  const glows: Glow[] = mouths.map((p, i) => ({ at: { x: p.center.x - p.normal.x * 3, y: p.center.y, z: p.center.z - p.normal.z * 3 },
    radius: Math.min(4.6, 1.2 + Math.max(p.clear.width, p.clear.height) * 0.6), color: pal.mouths[i % pal.mouths.length]! }));
  for (let v = 0; v < positions.length / 3; v++) {
    const x = positions[v * 3]!, y = positions[v * 3 + 1]!, z = positions[v * 3 + 2]!, ny = normals[v * 3 + 1]!;
    const patch = fbm(x, z, 11, 2, 7101), fine = fbm(x + y, z - y, 3, 2, 7102);
    let c: Rgb, alpha = 1;
    if (rooms[v]) {
      c = ny > 0.55 ? mixRgb(pal.floor, pal.floor2, smooth(-0.2, 0.4, patch)) : ny < -0.45 ? pal.ceiling
        : mixRgb(pal.wall, pal.wall2, smooth(-0.3, 0.3, fine));
      if (ny > 0.55) alpha = 0;
      let near = Infinity, toward = { x: 0, z: 1 };
      for (const o of openings) {
        const d = Math.hypot(o.center.x - x, o.center.y - y, o.center.z - z);
        const h = Math.hypot(o.center.x - x, o.center.z - z);
        if (d < near) { near = d; toward = h > 1e-6 ? { x: (o.center.x - x) / h, z: (o.center.z - z) / h } : { x: 0, z: 1 }; }
      }
      if (style.resident === "vault_glimmer" && ny < -0.3) {
        const along = x * toward.x + z * toward.z, across = -x * toward.z + z * toward.x;
        const streak = fbm(along * 0.3, across * 1.6, 1, 2, 7106);
        if (streak > 0.12) {
          const head = along / 2.2 - Math.floor(along / 2.2); // rises toward the opening along each streak
          c = mixRgb(GLIMMER_TAIL, GLIMMER_HEAD, head * head); alpha = -1;
        }
      }
      if (style.resident === "tide_clapper" && Math.abs(ny) < 0.55) {
        const band = Math.abs(((y + 0.8 * fbm(x, z, 6, 2, 7107)) / 1.7) % 1);
        const thick = 0.1 + 0.18 * smooth(14, 2, near);
        if (band < thick && fbm(x * 2.2, z * 2.2 + y, 1.4, 2, 7108) > 0.05) c = mixRgb(CLAPPER, CLAPPER2, smooth(-0.3, 0.3, fine));
      }
      for (const g of glows) {
        const d = Math.hypot(x - g.at.x, y - g.at.y, z - g.at.z);
        if (d < g.radius && ny < 0.5 && fbm(x * 1.7, z * 1.7 + y, 2.2, 2, 7103) > 0.18 + 0.35 * d / g.radius) { c = g.color; alpha = -1; }
      }
    } else {
      const ground = floor(x, z), collar = smooth(0.4, 1.6, y - ground);
      const level = ny > 0.72;
      const stone = level ? mixRgb(pal.top, pal.top2, smooth(-0.25, 0.35, patch))
        : pal.strata[Math.abs(Math.floor((y + 1.6 * fbm(x, z, 14, 2, 7105)) / 1.3)) % 3]!;
      const rimmed = level && ny < 0.93 ? mixRgb(stone, pal.rim, 0.55) : stone;
      const sand = mixRgb(pal.sand, pal.sand2, smooth(-0.2, 0.3, patch));
      c = mixRgb(sand, rimmed, collar);
      alpha = level ? 0 : 1;
      for (const m of mouths) {
        const lateral = m.normal.z !== 0 ? Math.abs(x - m.center.x) : Math.abs(z - m.center.z);
        const depth = m.normal.z !== 0 ? (z - m.center.z) * m.normal.z : (x - m.center.x) * m.normal.x;
        const over = Math.max(lateral - m.clear.width / 2, y - (m.center.y + m.clear.height / 2));
        if (depth > -1.5 && depth < 1.5 && over > 0 && over < 1.1 && y > m.center.y - m.clear.height / 2) alpha = 2;
      }
    }
    const k = 1 + fine * 0.05;
    out[v * 4] = c[0] * k; out[v * 4 + 1] = c[1] * k; out[v * 4 + 2] = c[2] * k; out[v * 4 + 3] = alpha;
  }
}

function shellColors(source: CaveSource, floor: FloorFunction, positions: Float32Array, normals: Float32Array,
  rooms: Uint8Array, out: Float32Array): void {
  if (source.style) return styledColors(source, source.style, floor, positions, normals, rooms, out);
  const glows: Glow[] = [];
  for (const p of source.portals) if (p.kind === "mouth") {
    const inward = { x: -p.normal.x * 3, z: -p.normal.z * 3 };
    glows.push({ at: { x: p.center.x + inward.x, y: p.center.y, z: p.center.z + inward.z }, radius: 4.6,
      color: p.normal.z > 0 ? PALETTE.amber : PALETTE.teal });
  }
  const pocket = source.rooms.findIndex(r => r.role === "pocket");
  const mouths = source.portals.filter(p => p.kind === "mouth");
  for (let v = 0; v < positions.length / 3; v++) {
    const x = positions[v * 3]!, y = positions[v * 3 + 1]!, z = positions[v * 3 + 2]!, ny = normals[v * 3 + 1]!;
    const patch = fbm(x, z, 11, 2, 7101), fine = fbm(x + y, z - y, 3, 2, 7102);
    let c: Rgb, alpha = 1;
    const r = rooms[v]!;
    if (r) {
      // Inside: cool wet stone, darker overhead, silt on the floor.
      c = ny > 0.55 ? mixRgb(PALETTE.silt, PALETTE.silt2, smooth(-0.2, 0.4, patch)) : ny < -0.45 ? PALETTE.ceiling
        : mixRgb(PALETTE.wall, PALETTE.wall2, smooth(-0.3, 0.3, fine));
      if (ny > 0.55) alpha = 0;
      for (const g of glows) {
        const d = Math.hypot(x - g.at.x, y - g.at.y, z - g.at.z);
        if (d < g.radius && ny < 0.5 && fbm(x * 1.7, z * 1.7 + y, 2.2, 2, 7103) > 0.18 + 0.35 * d / g.radius) { c = g.color; alpha = -1; }
      }
      if (r - 1 === pocket && ny > 0.3 && fbm(x * 2, z * 2, 2.5, 2, 7104) > 0.42) { c = mixRgb(PALETTE.violet, PALETTE.silt, 0.35); alpha = -1; }
    } else {
      const ground = floor(x, z), collar = smooth(0.4, 1.6, y - ground);
      const level = ny > 0.72;
      const stone = level ? mixRgb(PALETTE.top, PALETTE.top2, smooth(-0.25, 0.35, patch))
        : PALETTE.strata[Math.abs(Math.floor((y + 1.6 * fbm(x, z, 14, 2, 7105)) / 1.3)) % 3]!;
      // A warm rim where a terrace top breaks over its riser: the fan edges.
      const rimmed = level && ny < 0.93 ? mixRgb(stone, PALETTE.rim, 0.55) : stone;
      const sand = mixRgb(PALETTE.sand, PALETTE.sand2, smooth(-0.2, 0.3, patch));
      c = mixRgb(sand, rimmed, collar);
      alpha = level ? 0 : 1;
      // Grazing ink on the arch itself, the rock just round each opening, so
      // its silhouette reads at distance without staining the face.
      for (const m of mouths) {
        const lateral = m.normal.z !== 0 ? Math.abs(x - m.center.x) : Math.abs(z - m.center.z);
        const depth = m.normal.z !== 0 ? (z - m.center.z) * m.normal.z : (x - m.center.x) * m.normal.x;
        const over = Math.max(lateral - m.clear.width / 2, y - (m.center.y + m.clear.height / 2));
        if (depth > -1.5 && depth < 1.5 && over > 0 && over < 1.1 && y > m.center.y - m.clear.height / 2) alpha = 2;
      }
    }
    const k = 1 + fine * 0.05;
    out[v * 4] = c[0] * k; out[v * 4 + 1] = c[1] * k; out[v * 4 + 2] = c[2] * k; out[v * 4 + 3] = alpha;
  }
}

// --- Clipping -----------------------------------------------------------------

/** Clip a mesh to a horizontal rectangle (X/Z, closed), keeping shared
 * vertices shared. New edge vertices interpolate position, normal and
 * colour; alpha takes the nearer endpoint so the codec's integer rule holds. */
export function clipMeshToRect(mesh: MeshRecipe, rect: Rect, name = mesh.name): MeshRecipe | null {
  const P = mesh.positions, N = mesh.normals, C = mesh.colors, I = mesh.indices;
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
  const kept = new Map<number, number>(), cut = new Map<string, number>();
  const keep = (v: number): number => {
    let out = kept.get(v);
    if (out === undefined) {
      out = positions.length / 3; kept.set(v, out);
      positions.push(P[v * 3]!, P[v * 3 + 1]!, P[v * 3 + 2]!); normals.push(N[v * 3]!, N[v * 3 + 1]!, N[v * 3 + 2]!);
      colors.push(C[v * 4]!, C[v * 4 + 1]!, C[v * 4 + 2]!, C[v * 4 + 3]!);
    }
    return out;
  };
  // A clipped polygon vertex: an original vertex, or a point on an edge.
  type Q = { key: string; v?: number; p: number[]; n: number[]; c: number[] };
  const original = (v: number): Q => ({ key: `v${v}`, v, p: [P[v * 3]!, P[v * 3 + 1]!, P[v * 3 + 2]!],
    n: [N[v * 3]!, N[v * 3 + 1]!, N[v * 3 + 2]!], c: [C[v * 4]!, C[v * 4 + 1]!, C[v * 4 + 2]!, C[v * 4 + 3]!] });
  const emit = (q: Q): number => {
    if (q.v !== undefined) return keep(q.v);
    let out = cut.get(q.key);
    if (out === undefined) {
      out = positions.length / 3; cut.set(q.key, out);
      const l = Math.hypot(q.n[0]!, q.n[1]!, q.n[2]!) || 1;
      positions.push(...q.p); normals.push(q.n[0]! / l, q.n[1]! / l, q.n[2]! / l); colors.push(...q.c);
    }
    return out;
  };
  const planes: [0 | 2, number, number][] = [[0, rect.minX, 1], [0, rect.maxX, -1], [2, rect.minZ, 1], [2, rect.maxZ, -1]];
  for (let t = 0; t < I.length; t += 3) {
    let poly: Q[] = [original(I[t]!), original(I[t + 1]!), original(I[t + 2]!)];
    for (const [axis, value, sign] of planes) {
      const next: Q[] = [];
      for (let e = 0; e < poly.length; e++) {
        const a = poly[e]!, b = poly[(e + 1) % poly.length]!;
        const da = (a.p[axis]! - value) * sign, db = (b.p[axis]! - value) * sign;
        if (da >= 0) next.push(a);
        if ((da >= 0) !== (db >= 0)) {
          const s = da / (da - db), lerp = (u: number[], w: number[]): number[] => u.map((x, i) => x + (w[i]! - x) * s);
          const [lo, hi] = a.key < b.key ? [a.key, b.key] : [b.key, a.key];
          const c = lerp(a.c, b.c); c[3] = s < 0.5 ? a.c[3]! : b.c[3]!;
          next.push({ key: `${lo}|${hi}|${axis}|${value}`, p: lerp(a.p, b.p), n: lerp(a.n, b.n), c });
        }
      }
      poly = next;
      if (poly.length < 3) break;
    }
    if (poly.length < 3) continue;
    const ids = poly.map(emit);
    for (let f = 1; f + 1 < ids.length; f++) indices.push(ids[0]!, ids[f]!, ids[f + 1]!);
  }
  if (!indices.length) return null;
  return { name, positions: new Float32Array(positions), normals: new Float32Array(normals), colors: new Float32Array(colors),
    indices: positions.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices) };
}

const shells = new WeakMap<CaveDef, Partial<Record<LodLevel, MeshRecipe>>>();
/** The cave's shell at one LOD: exterior top, collar, mouths, walls, floor,
 * roof and skylight as one cel mesh in world metres, clipped to the
 * replacement footprint. Built once per definition and LOD. */
export function caveShell(def: CaveDef, lod: LodLevel): MeshRecipe {
  const cached = shells.get(def)?.[lod];
  if (cached) return cached;
  const shell = cachedBuild(derivedCacheKey(def, `shell.${lod}`, import.meta.url), () => generateShell(def, lod));
  shells.set(def, { ...shells.get(def), [lod]: shell });
  return shell;
}

function generateShell(def: CaveDef, lod: LodLevel): MeshRecipe {
  const volume = caveVolume(def), floor = floors.get(def)!, neighbours = caveNeighbours(def);
  const surface = def.surfaces.find(s => s.lod === lod)!;
  const lattice: Lattice = lod === "fine" ? volume : coarsen(volume, caveSampler(def.source, floor, neighbours));
  const f = def.replacementFootprints[0]!, spans = sharedSpans(f, neighbours);
  const raw = surfaceNets(lattice, surface.clamp,
    spans.length ? (x, z) => spans.some(s => spanDistance(s, x, z) <= SEAM_FREEZE) : undefined);
  const positions = new Float32Array(raw.positions), normals = vertexNormals(raw.positions, raw.triangles);
  const colors = new Float32Array(positions.length / 3 * 4);
  shellColors(def.source, floor, positions, normals, new Uint8Array(raw.rooms), colors);
  const whole: MeshRecipe = { name: surface.id, positions, normals, colors, indices: new Uint32Array(raw.triangles) };
  const clipped = clipMeshToRect(whole, f, surface.id);
  if (!clipped) throw new Error(`cave ${def.id}: empty ${lod} shell`);
  // The collar edge sits exactly on the heightfield, so the seam with the
  // surrounding terrain is the floor itself. Fine rock tops there lie within
  // a quarter voxel of the floor, so the rock bound still holds.
  // Coarse water-dominant voxels sag up to a voxel below the floor along the
  // collar; lift that band back onto it (coarse makes no rock-bound promise).
  // An edge shared with a neighbour cave is not collar: both shells already
  // meet there exactly, so it is neither snapped nor lifted.
  const P = clipped.positions as Float32Array, edge = 1e-6, band = lod === "coarse" ? surface.voxel * 1.5 : 0;
  const sides = [["x", f.minX, 1], ["x", f.maxX, -1], ["z", f.minZ, 1], ["z", f.maxZ, -1]] as const;
  const collarDistance = (x: number, z: number): number => {
    let d = Infinity;
    if (spans.some(s => spanDistance(s, x, z) < edge)) return d; // on the seam itself
    for (const [axis, at, sign] of sides) {
      const along = axis === "x" ? z : x;
      if (spans.some(s => s.axis === axis && s.at === at && along >= s.lo && along <= s.hi)) continue;
      d = Math.min(d, ((axis === "x" ? x : z) - at) * sign);
    }
    return d;
  };
  const target = new Float64Array(P.length / 3).fill(NaN), onEdge = new Uint8Array(P.length / 3);
  for (let v = 0; v < P.length / 3; v++) {
    const x = P[v * 3]!, z = P[v * 3 + 2]!, d = collarDistance(x, z);
    if (d < edge) { target[v] = floor(x, z); onEdge[v] = 1; }
    else if (d < band) target[v] = Math.max(P[v * 3 + 1]!, floor(x, z));
  }
  return snapToFloor(clipped, target, onEdge, f, def.id);
}

/** Smallest triangle normal (unnormalised, m^2) whose direction counts. */
const DEGENERATE = 1e-9;
const triangleNormal = (P: ArrayLike<number>, I: ArrayLike<number>, t: number): [number, number, number] => {
  const a = I[t * 3]! * 3, b = I[t * 3 + 1]! * 3, c = I[t * 3 + 2]! * 3;
  const ux = P[b]! - P[a]!, uy = P[b + 1]! - P[a + 1]!, uz = P[b + 2]! - P[a + 2]!, vx = P[c]! - P[a]!, vy = P[c + 1]! - P[a + 1]!, vz = P[c + 2]! - P[a + 2]!;
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
};
/** Whether moving positions kept triangle t facing the way it did (`pre`):
 * a degenerate triangle before or after has no direction to keep. */
const keepsFacing = (pre: readonly number[], post: readonly number[]): boolean => {
  const lp = Math.hypot(pre[0]!, pre[1]!, pre[2]!), lq = Math.hypot(post[0]!, post[1]!, post[2]!);
  return lp < DEGENERATE || lq < DEGENERATE || pre[0]! * post[0]! + pre[1]! * post[1]! + pre[2]! * post[2]! > 0;
};

/** Whether segment p -> q passes through the interior of triangle (a, b, c)
 * (Moller-Trumbore, strict: touching an edge or an end does not count). */
function segmentThrough(P: ArrayLike<number>, p: number, q: number, a: number, b: number, c: number): boolean {
  const ox = P[p]!, oy = P[p + 1]!, oz = P[p + 2]!, dx = P[q]! - ox, dy = P[q + 1]! - oy, dz = P[q + 2]! - oz;
  const e1x = P[b]! - P[a]!, e1y = P[b + 1]! - P[a + 1]!, e1z = P[b + 2]! - P[a + 2]!, e2x = P[c]! - P[a]!, e2y = P[c + 1]! - P[a + 1]!, e2z = P[c + 2]! - P[a + 2]!;
  const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x, det = e1x * hx + e1y * hy + e1z * hz;
  if (Math.abs(det) < 1e-12) return false;
  const sx = ox - P[a]!, sy = oy - P[a + 1]!, sz = oz - P[a + 2]!, u = (sx * hx + sy * hy + sz * hz) / det;
  if (u <= 1e-7 || u >= 1 - 1e-7) return false;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, v = (dx * qx + dy * qy + dz * qz) / det;
  if (v <= 1e-7 || u + v >= 1 - 1e-7) return false;
  const t = (e2x * qx + e2y * qy + e2z * qz) / det;
  return t > 1e-7 && t < 1 - 1e-7;
}

/** Join the clipped shell to the floor without folding it (COL-1 R6).
 * Each vertex with a `target` height moves there **only if** that keeps the
 * surface honest: no incident triangle turns against the way it faced (a
 * flip) and none then passes through another triangle of the shell (a fold).
 * Moves are vertical, so one X/Z bucket grid serves every check; passes
 * repeat while vertices that moved free others. Nearly everywhere every
 * vertex moves, so the shell is as before. A footprint-edge vertex
 * (`onEdge`) that must stay gets a vertical skirt in the footprint's edge
 * plane from it to its floor point, wound coherently with the triangle
 * beside it, so the seam still meets the terrain exactly. Afterwards no
 * triangle faces against its pre-snap normal and no moved triangle crosses
 * another: the mesher's outward winding (`surfaceNets`) holds for the
 * final mesh, which COL-1's collision takes as its orientation. Throws
 * otherwise. */
function snapToFloor(mesh: MeshRecipe, target: Float64Array, onEdge: Uint8Array, foot: Rect, id: string): MeshRecipe {
  const P = mesh.positions as Float32Array, I = mesh.indices, n = I.length / 3, nv = P.length / 3;
  const pre = Array.from({ length: n }, (_, t) => triangleNormal(P, I, t));
  const incident: number[][] = Array.from({ length: nv }, () => []);
  for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) incident[I[t * 3 + k]!]!.push(t);
  // X/Z buckets over every triangle (moves are vertical, so they stay valid).
  const CELL = 1, buckets = new Map<number, number[]>(), key = (i: number, k: number): number => i * 1000003 + k;
  const xzBox = (t: number): [number, number, number, number] => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < 3; k++) { const v = I[t * 3 + k]! * 3; x0 = Math.min(x0, P[v]!); x1 = Math.max(x1, P[v]!); z0 = Math.min(z0, P[v + 2]!); z1 = Math.max(z1, P[v + 2]!); }
    return [x0, x1, z0, z1];
  };
  for (let t = 0; t < n; t++) {
    const [x0, x1, z0, z1] = xzBox(t);
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let k = Math.floor(z0 / CELL); k <= Math.floor(z1 / CELL); k++)
      (buckets.get(key(i, k)) ?? buckets.set(key(i, k), []).get(key(i, k))!).push(t);
  }
  const shares = (s: number, t: number): boolean => {
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (I[s * 3 + a] === I[t * 3 + b]) return true;
    return false;
  };
  const intersects = (s: number, t: number): boolean => {
    const A = [I[s * 3]! * 3, I[s * 3 + 1]! * 3, I[s * 3 + 2]! * 3], B = [I[t * 3]! * 3, I[t * 3 + 1]! * 3, I[t * 3 + 2]! * 3];
    for (let e = 0; e < 3; e++) {
      if (segmentThrough(P, A[e]!, A[(e + 1) % 3]!, B[0]!, B[1]!, B[2]!)) return true;
      if (segmentThrough(P, B[e]!, B[(e + 1) % 3]!, A[0]!, A[1]!, A[2]!)) return true;
    }
    return false;
  };
  /** Whether triangle s passes through any triangle it shares no vertex with. */
  const crosses = (s: number): boolean => {
    const [x0, x1, z0, z1] = xzBox(s), seen = new Set<number>();
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let k = Math.floor(z0 / CELL); k <= Math.floor(z1 / CELL); k++)
      for (const t of buckets.get(key(i, k)) ?? []) {
        if (t === s || seen.has(t)) continue;
        seen.add(t);
        if (!shares(s, t) && intersects(s, t)) return true;
      }
    return false;
  };
  const honest = (v: number): boolean => incident[v]!.every(t => keepsFacing(pre[t]!, triangleNormal(P, I, t)) && !crosses(t));
  const moved = new Uint8Array(nv);
  for (let pass = 0; pass < 4; pass++) {
    let any = false;
    for (let v = 0; v < nv; v++) {
      const goal = Math.fround(target[v]!);
      if (moved[v] || Number.isNaN(goal)) continue;
      if (P[v * 3 + 1] === goal) { moved[v] = 1; continue; }
      const from = P[v * 3 + 1]!;
      P[v * 3 + 1] = goal;
      if (honest(v)) { moved[v] = 1; any = true; } else P[v * 3 + 1] = from;
    }
    if (!any) break;
  }
  // Skirts along footprint-edge boundary edges with an end that stayed.
  const stayed = (v: number): boolean => onEdge[v] === 1 && !moved[v];
  const uses = new Map<string, number>();
  for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
    const a = I[t * 3 + k]!, b = I[t * 3 + (k + 1) % 3]!, e = a < b ? `${a},${b}` : `${b},${a}`;
    uses.set(e, (uses.get(e) ?? 0) + 1);
  }
  const positions = Array.from(P), normals = Array.from(mesh.normals), colors = Array.from(mesh.colors), indices = Array.from(I);
  const floorVertex = new Map<number, number>();
  const below = (v: number): number => {
    let w = floorVertex.get(v);
    if (w === undefined) {
      w = positions.length / 3; floorVertex.set(v, w);
      positions.push(P[v * 3]!, Math.fround(target[v]!), P[v * 3 + 2]!);
      normals.push(mesh.normals[v * 3]!, mesh.normals[v * 3 + 1]!, mesh.normals[v * 3 + 2]!);
      for (let c = 0; c < 4; c++) colors.push(mesh.colors[v * 4 + c]!);
    }
    return w;
  };
  for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
    const a = I[t * 3 + k]!, b = I[t * 3 + (k + 1) % 3]!;
    if (!stayed(a) && !stayed(b)) continue;
    if (uses.get(a < b ? `${a},${b}` : `${b},${a}`) !== 1) continue;
    // A boundary edge along a footprint side (its other end may be a corner
    // shared with a neighbour, which never snaps: the skirt still closes it).
    const ax = P[a * 3]!, az = P[a * 3 + 2]!, bx = P[b * 3]!, bz = P[b * 3 + 2]!;
    const along = (ax === bx && (ax === foot.minX || ax === foot.maxX)) || (az === bz && (az === foot.minZ || az === foot.maxZ));
    if (!along) continue;
    // The triangle runs a -> b; the skirt runs b -> a, so the two agree.
    const a2 = stayed(a) ? below(a) : a, b2 = stayed(b) ? below(b) : b;
    if (a2 !== a) indices.push(b, a, a2);
    if (b2 !== b) indices.push(b, a2, b2);
  }
  const final = new Float32Array(positions);
  for (let t = 0; t < n; t++) {
    if (!keepsFacing(pre[t]!, triangleNormal(final, indices, t)))
      throw new Error(`cave ${id}: shell triangle ${t} turned against its mesher normal when snapped to the floor`);
  }
  for (let v = 0; v < nv; v++) if (moved[v] && P[v * 3 + 1] !== Math.fround(target[v]!)) throw new Error(`cave ${id}: vertex ${v} moved partway`);
  return { ...mesh, positions: final, normals: new Float32Array(normals), colors: new Float32Array(colors),
    indices: final.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices) };
}

/** Bake form: the shell split per 128 m column (layer-0 recipe parts). */
export function caveShellByColumn(def: CaveDef, lod: LodLevel, columns: readonly { readonly id: string; readonly rect: Rect }[]): Map<string, MeshRecipe> {
  const out = new Map<string, MeshRecipe>(), shell = caveShell(def, lod), f = def.replacementFootprints[0]!;
  for (const c of columns) {
    if (c.rect.maxX <= f.minX || c.rect.minX >= f.maxX || c.rect.maxZ <= f.minZ || c.rect.minZ >= f.maxZ) continue;
    const part = clipMeshToRect(shell, c.rect, `${c.id}.cave.${def.id}`);
    if (part) out.set(c.id, part);
  }
  return out;
}

/** Bounds of a set of solids, for diagnostics. */
export function solidsBounds(solids: readonly Solid[]): Aabb {
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const s of solids) for (const a of AXES) { min[a] = Math.min(min[a], s.min[a]); max[a] = Math.max(max[a], s.max[a]); }
  return { min, max };
}
