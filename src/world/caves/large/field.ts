import type { LargeCaveCarve, LargeCaveRock, LargeCaveSource, TunnelNode } from "../../../content/caves/largeCave.js";
import type { Aabb } from "../../types.js";
import { capAt, collarAt, createOwnership, owns, type CaveOwnership } from "./ownership.js";

/** The compiled field of a cave biome (Babylon-free, deterministic).
 *
 * `rock(x, y, z)` is a signed distance estimate in metres, negative in rock:
 *   max(y - floor(x, z), -water) with rock added back (pillars, blocks),
 * where `water` is the smooth union of every carve. It is evaluated through
 * an 8 m culling grid of primitive pieces, so a point far from every carve
 * costs one floor lookup. Surface noise is 3D value noise, bounded by each
 * primitive's `wobble`, and counted in its culling bounds.
 *
 * Ownership (see `LargeCaveSource`): `owned(x, y, z)` is true inside the
 * domain in a collar, or below the cap elsewhere: the seabed less `roofMin`,
 * read from a lattice cache of the floor. Generation
 * meshes owned space only and `validateOwnership` rejects carved water that
 * would reach unowned space. */

export type FloorFunction = (x: number, z: number) => number;

/** Smallest rock thickness the field promises between carves and unowned
 * space, metres (and the margin `validateOwnership` enforces). */
export const OWNERSHIP_MARGIN = 1;
const CULL = 8;
const FAR = 64;

// --- Noise ---------------------------------------------------------------------

function hash3(ix: number, iy: number, iz: number, seed: number): number {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 1103515245) ^ Math.imul(iz | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 2147483647.5 - 1;
}
/** Smooth 3D value noise in [-1, 1] at unit spacing. */
export function noise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const c = (dx: number, dy: number, dz: number): number => hash3(ix + dx, iy + dy, iz + dz, seed);
  const x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * u, x10 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * u;
  const x01 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * u, x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * u;
  const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}
/** Wall detail: a 4 m octave and a 1.6 m octave, roughly [-1, 1]. */
export function wallNoise(x: number, y: number, z: number, seed: number): number {
  return noise3(x * 0.25, y * 0.3, z * 0.25, seed) * 0.72 + noise3(x * 0.62, y * 0.62, z * 0.62, seed + 17) * 0.28;
}
export function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}
function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// --- Pieces --------------------------------------------------------------------

interface Box { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }
/** One culled primitive: a carve (or a straight piece of a tunnel spline) or
 * an added rock. `carve` groups the pieces of one carve, which join by plain
 * min; different carves join by smooth min. */
interface Piece {
  readonly carve: number;
  readonly zone: number;
  readonly water: boolean;
  /** Where the piece is evaluated: far enough out that culling it changes
   * nothing near any surface. */
  readonly box: Box;
  /** Where its surface can be: its own extent, wobble and smooth-union reach. */
  readonly core: Box;
  distance(x: number, y: number, z: number): number;
}

const grown = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number): Box =>
  ({ minX: x0 - r, minY: y0 - r, minZ: z0 - r, maxX: x1 + r, maxY: y1 + r, maxZ: z1 + r });

const TUNNEL_EXPONENT = 3.2;
/** Catmull-Rom points through the nodes, about every `step` metres. */
export function tunnelSamples(nodes: readonly TunnelNode[], step = 2): TunnelNode[] {
  if (nodes.length < 2) throw new Error("tunnel needs at least two nodes");
  const out: TunnelNode[] = [];
  const at = (i: number): TunnelNode => nodes[Math.max(0, Math.min(nodes.length - 1, i))]!;
  const keys = ["x", "y", "z", "width", "height"] as const;
  for (let s = 0; s + 1 < nodes.length; s++) {
    const p0 = at(s - 1), p1 = at(s), p2 = at(s + 1), p3 = at(s + 2);
    const n = Math.max(1, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z) / step));
    for (let i = 0; i < n; i++) {
      const t = i / n, t2 = t * t, t3 = t2 * t;
      const v = {} as Record<(typeof keys)[number], number>;
      for (const k of keys) {
        const a = p0[k], b = p1[k], c = p2[k], d = p3[k];
        v[k] = 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      }
      // Widths never overshoot their neighbours (Catmull-Rom can dip).
      v.width = Math.max(Math.min(p1.width, p2.width), v.width); v.height = Math.max(Math.min(p1.height, p2.height), v.height);
      out.push(v);
    }
  }
  out.push({ ...nodes[nodes.length - 1]! });
  return out;
}

/** A tunnel piece's surface bound: its section grown by `margin` in the
 * section's scaled distance. */
function tunnelCore(a: TunnelNode, b: TunnelNode, scale: number, margin: number): Box {
  const g = 1 + margin / scale, r = Math.max(a.width, b.width) / 2 * g;
  return { minX: Math.min(a.x, b.x) - r, maxX: Math.max(a.x, b.x) + r, minZ: Math.min(a.z, b.z) - r, maxZ: Math.max(a.z, b.z) + r,
    minY: Math.min(a.y, b.y) - margin, maxY: Math.max(a.y + a.height * (0.42 + 0.58 * g), b.y + b.height * (0.42 + 0.58 * g)) };
}
function tunnelPieces(c: Extract<LargeCaveCarve, { kind: "tunnel" }>, carve: number, zone: number, pad: number, core: number): Piece[] {
  const pts = tunnelSamples(c.nodes), seed = seedOf(c.id), pieces: Piece[] = [];
  for (let s = 1; s < pts.length; s++) {
    const a = pts[s - 1]!, b = pts[s]!;
    const ex = b.x - a.x, ez = b.z - a.z, len2 = ex * ex + ez * ez;
    // The section's distance is scaled by its smaller half-size, so it
    // reaches `pad` only at (1 + pad / scale) times the section's size.
    const scale = Math.min(a.width / 2, b.width / 2, a.height * 0.58, b.height * 0.58), grow = 1 + pad / scale;
    const r = Math.max(a.width, b.width) / 2 * grow + c.wobble;
    const top = Math.max(a.y + a.height * (0.42 + 0.58 * grow), b.y + b.height * (0.42 + 0.58 * grow));
    pieces.push({
      carve, zone, water: true,
      box: { minX: Math.min(a.x, b.x) - r, maxX: Math.max(a.x, b.x) + r, minZ: Math.min(a.z, b.z) - r, maxZ: Math.max(a.z, b.z) + r,
        minY: Math.min(a.y, b.y) - c.wobble - pad, maxY: top + c.wobble },
      core: tunnelCore(a, b, scale, c.wobble + core),
      distance(x, y, z) {
        const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / len2)) : 0;
        const u = Math.hypot(x - (a.x + ex * t), z - (a.z + ez * t));
        const floor = a.y + (b.y - a.y) * t, width = a.width + (b.width - a.width) * t, height = a.height + (b.height - a.height) * t;
        const hw = width / 2, hh = height * 0.58, v = Math.abs(y - (floor + height * 0.42));
        const q = Math.pow(Math.pow(u / hw, TUNNEL_EXPONENT) + Math.pow(v / hh, TUNNEL_EXPONENT), 1 / TUNNEL_EXPONENT);
        const d = (q - 1) * Math.min(hw, hh) - c.wobble * wallNoise(x, y, z, seed);
        return Math.max(d, floor - y - 0.35 * c.wobble * wallNoise(x * 1.3, 0, z * 1.3, seed + 5));
      },
    });
  }
  return pieces;
}

/** `pad` sizes the evaluation box, `core` the surface box: smooth union
 * moves a surface out by at most blend / 4. */
function carvePieces(c: LargeCaveCarve, carve: number, zone: number, pad: number, core = pad): Piece[] {
  const seed = seedOf(c.id);
  if (c.kind === "tunnel") return tunnelPieces(c, carve, zone, pad, core);
  if (c.kind === "chamber") {
    // Scaled distance (see `distance`): it reaches `pad` at (1 + pad / scale) radii.
    const r = c.radii, o = c.center, cos = Math.cos(c.yaw), sin = Math.sin(c.yaw);
    const grow = 1 + pad / Math.min(r.x, r.z, r.up, r.down), reach = Math.max(r.x, r.z) * grow + c.wobble;
    return [{
      carve, zone, water: true,
      box: { minX: o.x - reach, maxX: o.x + reach, minZ: o.z - reach, maxZ: o.z + reach,
        minY: Math.max(c.floor - pad, o.y - r.down * grow) - c.wobble, maxY: o.y + r.up * grow + c.wobble },
      // Noise and smooth union move the surface by `c.wobble + core` in the
      // scaled distance, so by that over `scale` in radii.
      core: (() => { const g = 1 + (c.wobble + core) / Math.min(r.x, r.z, r.up, r.down), h = Math.max(r.x, r.z) * g;
        return { minX: o.x - h, maxX: o.x + h, minZ: o.z - h, maxZ: o.z + h, minY: Math.max(c.floor - c.wobble - core, o.y - r.down * g), maxY: o.y + r.up * g }; })(),
      distance(x, y, z) {
        const lx = (x - o.x) * cos - (z - o.z) * sin, lz = (x - o.x) * sin + (z - o.z) * cos;
        const dx = Math.abs(lx) / r.x, dz = Math.abs(lz) / r.z;
        const rh = Math.pow(Math.pow(dx, 2.4) + Math.pow(dz, 2.4), 1 / 2.4);
        const up = y > o.y, dy = up ? (y - o.y) / r.up : (o.y - y) / r.down, nv = up ? 2 : 3;
        const q = Math.pow(Math.pow(rh, nv) + Math.pow(dy, nv), 1 / nv);
        // One scale for both halves keeps the field continuous at the centre height.
        const d = (q - 1) * Math.min(r.x, r.z, r.up, r.down) - c.wobble * wallNoise(x, y, z, seed);
        return Math.max(d, c.floor - y - 0.3 * c.wobble * wallNoise(x * 1.4, 0, z * 1.4, seed + 5));
      },
    }];
  }
  const a = c.bottom, b = c.top, ax = b.x - a.x, ay = b.y - a.y, az = b.z - a.z, len2 = ax * ax + ay * ay + az * az;
  const reach = c.radius + c.flare + c.wobble + pad;
  return [{
    carve, zone, water: true,
    // Rounded ends reach a full radius past both end points, in Y too.
    box: { minX: Math.min(a.x, b.x) - reach, maxX: Math.max(a.x, b.x) + reach, minY: Math.min(a.y, b.y) - reach,
      maxY: Math.max(a.y, b.y) + reach, minZ: Math.min(a.z, b.z) - reach, maxZ: Math.max(a.z, b.z) + reach },
    core: grown(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z), c.radius + c.flare + c.wobble + core),
    distance(x, y, z) {
      const t = Math.max(0, Math.min(1, ((x - a.x) * ax + (y - a.y) * ay + (z - a.z) * az) / len2));
      const radius = c.radius + c.flare * t * t + c.wobble * wallNoise(x, y, z, seed);
      // Rounded (capsule) ends: a flat cap would cut a sliver thinner than
      // the lattice where the shaft meets a hall.
      return Math.hypot(x - (a.x + ax * t), y - (a.y + ay * t), z - (a.z + az * t)) - radius;
    },
  }];
}

function rockPiece(r: LargeCaveRock, pad: number): Piece {
  if (r.kind === "pillar") {
    const a = r.a, b = r.b, ax = b.x - a.x, ay = b.y - a.y, az = b.z - a.z, len2 = ax * ax + ay * ay + az * az, seed = seedOf(r.id);
    const reach = Math.max(r.radiusA, r.radiusB) + r.wobble + pad;
    return {
      carve: -1, zone: -1, water: false,
      box: { minX: Math.min(a.x, b.x) - reach, maxX: Math.max(a.x, b.x) + reach, minY: Math.min(a.y, b.y) - reach,
        maxY: Math.max(a.y, b.y) + reach, minZ: Math.min(a.z, b.z) - reach, maxZ: Math.max(a.z, b.z) + reach },
      core: grown(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z), Math.max(r.radiusA, r.radiusB) + r.wobble + 0.5),
      distance(x, y, z) {
        const t = Math.max(0, Math.min(1, ((x - a.x) * ax + (y - a.y) * ay + (z - a.z) * az) / len2));
        const radius = r.radiusA + (r.radiusB - r.radiusA) * t;
        return Math.hypot(x - (a.x + ax * t), y - (a.y + ay * t), z - (a.z + az * t)) - radius - r.wobble * wallNoise(x, y, z, seed);
      },
    };
  }
  const o = r.center, h = r.half, cos = Math.cos(r.yaw), sin = Math.sin(r.yaw), reach = Math.hypot(h.x, h.z) + pad;
  return {
    carve: -1, zone: -1, water: false,
    box: { minX: o.x - reach, maxX: o.x + reach, minY: o.y - h.y - pad, maxY: o.y + h.y + pad, minZ: o.z - reach, maxZ: o.z + reach },
    core: grown(o.x, o.y, o.z, o.x, o.y, o.z, Math.max(Math.hypot(h.x, h.z), h.y) + 0.5),
    distance(x, y, z) {
      const lx = Math.abs((x - o.x) * cos - (z - o.z) * sin) - (h.x - r.round), ly = Math.abs(y - o.y) - (h.y - r.round);
      const lz = Math.abs((x - o.x) * sin + (z - o.z) * cos) - (h.z - r.round);
      return Math.hypot(Math.max(lx, 0), Math.max(ly, 0), Math.max(lz, 0)) + Math.min(Math.max(lx, ly, lz), 0) - r.round;
    },
  };
}

// --- Compiled field --------------------------------------------------------------

export interface CaveField {
  readonly source: LargeCaveSource;
  readonly domain: Aabb;
  readonly floor: FloorFunction;
  readonly zoneIds: readonly string[];
  readonly ownership: CaveOwnership;
  /** Signed rock distance estimate, metres, negative in rock. `ground` is
   * floor(x, z) when the caller has it already. */
  rock(x: number, y: number, z: number, ground?: number): number;
  /** Carved-water distance (negative inside a carve) and its zone index, or
   * -1 when no carve is near. */
  water(x: number, y: number, z: number): { distance: number; zone: number };
  /** Zone index of the nearest carve at a point, or -1 (exterior water or
   * rock far from every carve). */
  zoneAt(x: number, y: number, z: number): number;
  /** True when this cave owns the point (see the module note). */
  owned(x: number, y: number, z: number): boolean;
  /** Owned top at (x, z): the domain top in a collar, else the seabed less
   * `roofMin` (the lowest of the four lattice samples round the point). */
  capAt(x: number, z: number): number;
  inCollar(x: number, z: number): boolean;
  /** Whether any primitive or the seabed may produce a surface in the box. */
  mayHaveSurface(box: Aabb): boolean;
}


export function compileField(source: LargeCaveSource, floor: FloorFunction): CaveField {
  const d = source.domain, C = source.chunk, h = source.voxel;
  for (const v of [d.max.x - d.min.x, d.max.y - d.min.y, d.max.z - d.min.z])
    if (!(v > 0) || Math.abs(v / C - Math.round(v / C)) > 1e-9) throw new Error(`cave ${source.id}: domain side ${v} is not a whole number of ${C} m chunks`);
  for (const v of [d.min.x, d.min.y, d.min.z])
    if (Math.abs(v / h - Math.round(v / h)) > 1e-9) throw new Error(`cave ${source.id}: domain corner ${v} is off the ${h} m lattice`);
  for (const r of source.collars) for (const v of [r.minX, r.maxX, r.minZ, r.maxZ])
    if (Math.abs(v / h - Math.round(v / h)) > 1e-9) throw new Error(`cave ${source.id}: collar edge ${v} is off the ${h} m lattice`);
  const zoneIndex = new Map(source.zones.map((z, i) => [z.id, i]));
  // A carve still bends the smooth union wherever its distance is within
  // `blend` of another's, so its box must reach that far past its own water
  // (plus a metre for the surface band), or culling would put a step in it.
  const pad = source.blend + 1;
  const pieces: Piece[] = [];
  source.carves.forEach((c, i) => {
    const zone = zoneIndex.get(c.zone);
    if (zone === undefined) throw new Error(`cave ${source.id}: carve ${c.id} names unknown zone ${c.zone}`);
    pieces.push(...carvePieces(c, i, zone, pad, source.blend * 0.25 + 0.5));
  });
  // Rock joins by a hard min: its box must reach past the surface band.
  for (const r of source.rocks) pieces.push(rockPiece(r, 1.5));
  // Cull grid over the domain.
  const nx = Math.ceil((d.max.x - d.min.x) / CULL), ny = Math.ceil((d.max.y - d.min.y) / CULL), nz = Math.ceil((d.max.z - d.min.z) / CULL);
  const cells: number[][] = Array.from({ length: nx * ny * nz }, () => []);
  const ci = (v: number, o: number, n: number): number => Math.max(0, Math.min(n - 1, Math.floor((v - o) / CULL)));
  pieces.forEach((p, i) => {
    for (let k = ci(p.box.minZ, d.min.z, nz); k <= ci(p.box.maxZ, d.min.z, nz); k++)
      for (let j = ci(p.box.minY, d.min.y, ny); j <= ci(p.box.maxY, d.min.y, ny); j++)
        for (let a = ci(p.box.minX, d.min.x, nx); a <= ci(p.box.maxX, d.min.x, nx); a++) cells[a + nx * (j + ny * k)]!.push(i);
  });
  const cellOf = (x: number, y: number, z: number): number[] | null => {
    if (x < d.min.x || y < d.min.y || z < d.min.z || x >= d.max.x || y >= d.max.y || z >= d.max.z) return null;
    return cells[Math.floor((x - d.min.x) / CULL) + nx * (Math.floor((y - d.min.y) / CULL) + ny * Math.floor((z - d.min.z) / CULL))]!;
  };
  const inBox = (b: Box, x: number, y: number, z: number): boolean =>
    x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY && z >= b.minZ && z <= b.maxZ;
  const water = (x: number, y: number, z: number): { distance: number; zone: number } => {
    const list = cellOf(x, y, z);
    let total = FAR, best = FAR, zone = -1, carve = -2, current = FAR;
    if (list) for (const i of list) {
      const p = pieces[i]!;
      if (!p.water || !inBox(p.box, x, y, z)) continue;
      const v = p.distance(x, y, z);
      if (v < best) { best = v; zone = p.zone; }
      // Pieces of one carve join by min; carves by smooth min (list order
      // groups a carve's pieces together).
      if (p.carve === carve) current = Math.min(current, v);
      else { if (carve !== -2) total = smin(total, current, source.blend); carve = p.carve; current = v; }
    }
    if (carve !== -2) total = smin(total, current, source.blend);
    return { distance: total, zone };
  };
  const ownership = createOwnership(d, source.collars, source.roofMin, h, floor);
  const inCollar = (x: number, z: number): boolean => collarAt(ownership, x, z) !== null;
  const capOf = (x: number, z: number): number => capAt(ownership, x, z);
  const field: CaveField = {
    source, domain: d, floor, zoneIds: source.zones.map(z => z.id),
    water,
    rock(x, y, z, ground) {
      let r = Math.max(y - (ground ?? floor(x, z)), -water(x, y, z).distance);
      const list = cellOf(x, y, z);
      if (list) for (const i of list) {
        const p = pieces[i]!;
        if (!p.water && inBox(p.box, x, y, z)) r = Math.min(r, p.distance(x, y, z));
      }
      return r;
    },
    zoneAt(x, y, z) { return water(x, y, z).zone; },
    owned(x, y, z) { return owns(ownership, x, y, z); },
    ownership, capAt: capOf, inCollar,
    mayHaveSurface(box) {
      // Any piece box touching it, or (in a collar) the seabed inside its Y range.
      const x0 = ci(box.min.x, d.min.x, nx), x1 = ci(box.max.x, d.min.x, nx), y0 = ci(box.min.y, d.min.y, ny), y1 = ci(box.max.y, d.min.y, ny);
      const z0 = ci(box.min.z, d.min.z, nz), z1 = ci(box.max.z, d.min.z, nz);
      for (let k = z0; k <= z1; k++) for (let j = y0; j <= y1; j++) for (let a = x0; a <= x1; a++)
        for (const i of cells[a + nx * (j + ny * k)]!) {
          const b = pieces[i]!.core;
          if (b.maxX >= box.min.x && b.minX <= box.max.x && b.maxY >= box.min.y && b.minY <= box.max.y && b.maxZ >= box.min.z && b.minZ <= box.max.z) return true;
        }
      for (const r of source.collars) {
        if (r.maxX < box.min.x || r.minX > box.max.x || r.maxZ < box.min.z || r.minZ > box.max.z) continue;
        let lo = Infinity, hi = -Infinity;
        const x0 = Math.max(r.minX, box.min.x), x1 = Math.min(r.maxX, box.max.x), z0 = Math.max(r.minZ, box.min.z), z1 = Math.min(r.maxZ, box.max.z);
        for (let x = x0; x <= x1 + 1e-9; x += Math.max(0.5, (x1 - x0) / 16)) for (let z = z0; z <= z1 + 1e-9; z += Math.max(0.5, (z1 - z0) / 16)) {
          const f = floor(x, z); lo = Math.min(lo, f); hi = Math.max(hi, f);
        }
        if (hi + 2 >= box.min.y && lo - 2 <= box.max.y) return true;
      }
      return false;
    },
  };
  return field;
}

/** Problems with the source's ownership, as readable strings: carved water
 * that would reach unowned space (above a non-collar cap or outside the
 * domain) within `OWNERSHIP_MARGIN`. Sampled on a 1 m grid over every carve
 * piece's bounds. */
export function validateOwnership(field: CaveField): string[] {
  const s = field.source, d = field.domain, problems: string[] = [];
  const m = OWNERSHIP_MARGIN;
  for (const c of s.carves) {
    let count = 0, worst = -Infinity, at = "";
    for (const p of carvePieces(c, 0, 0, 0)) for (let x = Math.floor(p.box.minX); x <= p.box.maxX; x++)
      for (let z = Math.floor(p.box.minZ); z <= p.box.maxZ; z++) for (let y = Math.floor(p.box.minY); y <= p.box.maxY; y++) {
        if (p.distance(x, y, z) > 0) continue;
        // Water here: it and a margin round it must be owned.
        let over = -Infinity;
        for (const [a, b, e] of [[0, 0, 0], [m, 0, 0], [-m, 0, 0], [0, m, 0], [0, 0, m], [0, 0, -m]] as const) {
          const px = x + a, py = y + b, pz = z + e;
          if (px < d.min.x || pz < d.min.z || px > d.max.x || pz > d.max.z || py < d.min.y || py > d.max.y) { over = Infinity; break; }
          if (!field.inCollar(px, pz)) over = Math.max(over, py - field.capAt(px, pz));
        }
        if (over > 0) { count++; if (over > worst) { worst = over; at = `(${x}, ${y}, ${z})`; } }
      }
    if (count) problems.push(`carve ${c.id}: ${count} water points reach unowned space; worst ${worst === Infinity ? "outside the domain" : `${worst.toFixed(1)} m over the cap`} at ${at}`);
  }
  return problems;
}
