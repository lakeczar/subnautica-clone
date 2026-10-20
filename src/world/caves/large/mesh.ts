import type { Aabb, LodLevel, Rect } from "../../types.js";
import type { CaveField } from "./field.js";

/** Chunk meshes for a cave biome (Babylon-free, deterministic).
 *
 * The field is sampled on a global node lattice (`voxel` metres, nodes at
 * `domain.min + index * voxel`). A chunk owns the lattice cells whose min
 * corner lies in it and samples a small apron, so it builds alone and its
 * border vertices are bit-identical to its neighbours' (each depends only on
 * the eight node values of its own cell).
 *
 * - **Fine:** surface nets on the node lattice. A vertex sits at the mean of
 *   its cell's sign-change crossings, snapped to 1/1024 m; its normal is the
 *   gradient of the cell's trilinear field. This mesh IS the collision mesh:
 *   art and collision are the same triangles.
 * - **Coarse:** surface nets on every second node, where each coarse node
 *   takes the MOST open (largest) value of the 27 fine nodes round it. Coarse
 *   water therefore contains every fine water node's neighbourhood: coarse
 *   walls sit inside the fine rock (about 0.5-0.9 m behind it) and a tunnel
 *   is never closed or narrowed at any distance.
 * - **Ownership:** a quad is emitted only when its lattice edge's midpoint
 *   is owned (`field.owned`), and triangles reaching unowned space are clipped
 *   to the collar that owns them, their cut edge snapped onto the seabed, so
 *   the cave's seabed ends exactly where the exterior heightfield's begins.
 * - **Band (fine, collision only):** the seabed in a ring of `band` metres
 *   round each collar, outside it. A shape touching a collar is answered by
 *   the cave alone (see `compose.ts`); the band is the exterior ground under
 *   the rest of that shape. It is never drawn: the heightfield art is there. */

export const POSITION_SNAP = 1024;
const snap = (v: number): number => Math.round(v * POSITION_SNAP) / POSITION_SNAP;

export interface ChunkCoord { readonly cx: number; readonly cy: number; readonly cz: number }
export const chunkKey = (c: ChunkCoord): string => `${c.cx}:${c.cy}:${c.cz}`;

export interface CaveLattice {
  readonly origin: { readonly x: number; readonly y: number; readonly z: number };
  readonly voxel: number;
  /** Cells per chunk edge. */
  readonly cells: number;
  readonly chunk: number;
  /** Chunks along each axis. */
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
}
export function caveLattice(field: CaveField): CaveLattice {
  const s = field.source, d = field.domain, cells = Math.round(s.chunk / s.voxel);
  if (Math.abs(cells * s.voxel - s.chunk) > 1e-9 || cells % 2) throw new Error(`cave ${s.id}: chunk must be an even number of voxels`);
  return { origin: d.min, voxel: s.voxel, cells, chunk: s.chunk,
    nx: Math.round((d.max.x - d.min.x) / s.chunk), ny: Math.round((d.max.y - d.min.y) / s.chunk), nz: Math.round((d.max.z - d.min.z) / s.chunk) };
}
export function chunkBox(l: CaveLattice, c: ChunkCoord): Aabb {
  const o = l.origin, C = l.chunk;
  return { min: { x: o.x + c.cx * C, y: o.y + c.cy * C, z: o.z + c.cz * C }, max: { x: o.x + (c.cx + 1) * C, y: o.y + (c.cy + 1) * C, z: o.z + (c.cz + 1) * C } };
}

/** One chunk's mesh at one LOD, in world metres. `zones` holds zone index
 * + 1 per vertex (0 for the exterior seabed). */
export interface ChunkMesh {
  readonly key: string;
  readonly coord: ChunkCoord;
  readonly lod: LodLevel;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly zones: Uint8Array;
  readonly indices: Uint32Array;
  /** Fine only: collision-only seabed band triangles (positions, indices). */
  readonly band: { readonly positions: Float32Array; readonly indices: Uint32Array } | null;
  readonly stats: { readonly sampled: number; readonly skipped: number; readonly ms: number };
}

/** Node values for one chunk's sampling window: global fine nodes
 * [c0 - 3, c0 + cells + 2) per axis, X fastest. Bricks of 8 nodes with no
 * primitive and no collar seabed in reach are filled from the exterior floor
 * alone, which is the exact field there. */
interface Samples { readonly lo: readonly [number, number, number]; readonly m: number; readonly v: Float64Array; sampled: number; skipped: number }
const APRON_LO = 3, APRON_HI = 2;

function sampleChunk(field: CaveField, l: CaveLattice, c: ChunkCoord): Samples {
  const N = l.cells, m = N + APRON_LO + APRON_HI, h = l.voxel, o = l.origin;
  const lo: [number, number, number] = [c.cx * N - APRON_LO, c.cy * N - APRON_LO, c.cz * N - APRON_LO];
  const v = new Float64Array(m * m * m);
  const floors = new Float64Array(m * m);
  for (let k = 0; k < m; k++) for (let i = 0; i < m; i++) floors[i + m * k] = field.floor(o.x + (lo[0] + i) * h, o.z + (lo[2] + k) * h);
  const B = 8;
  let sampled = 0, skipped = 0;
  for (let bk = 0; bk < m; bk += B) for (let bj = 0; bj < m; bj += B) for (let bi = 0; bi < m; bi += B) {
    const i1 = Math.min(m, bi + B), j1 = Math.min(m, bj + B), k1 = Math.min(m, bk + B);
    const box: Aabb = {
      min: { x: o.x + (lo[0] + bi) * h - 1, y: o.y + (lo[1] + bj) * h - 1, z: o.z + (lo[2] + bk) * h - 1 },
      max: { x: o.x + (lo[0] + i1 - 1) * h + 1, y: o.y + (lo[1] + j1 - 1) * h + 1, z: o.z + (lo[2] + k1 - 1) * h + 1 },
    };
    const full = field.mayHaveSurface(box);
    for (let k = bk; k < k1; k++) for (let j = bj; j < j1; j++) for (let i = bi; i < i1; i++) {
      const y = o.y + (lo[1] + j) * h, at = i + m * (j + m * k);
      if (full) { v[at] = field.rock(o.x + (lo[0] + i) * h, y, o.z + (lo[2] + k) * h, floors[i + m * k]); sampled++; }
      else { v[at] = y - floors[i + m * k]!; skipped++; }
    }
  }
  return { lo, m, v, sampled, skipped };
}

interface Raw { positions: number[]; normals: number[]; zones: number[]; indices: number[] }

/** Surface nets over a window of node values. `stride` is 1 (fine) or 2
 * (coarse, on the dilated values). Cells [c0, c0 + count) are the chunk's;
 * one apron cell below supplies quad neighbours. `emit(edge midpoint)` says
 * whether a lattice edge's quad belongs to this mesh. */
function surfaceNets(field: CaveField, l: CaveLattice, values: (gi: number, gj: number, gk: number) => number,
  c0: readonly [number, number, number], count: number, step: number, emit: (x: number, y: number, z: number) => boolean): Raw {
  const o = l.origin, h = l.voxel * step, span = count + 1;
  // Vertex per cell for cells c0 - 1 .. c0 + count - 1 (local 0..count).
  const vertexOf = new Int32Array(span * span * span).fill(-1);
  const out: Raw = { positions: [], normals: [], zones: [], indices: [] };
  const corner = new Float64Array(8);
  const node = (a: number, b: number, e: number): number => values(c0[0] - 1 + a, c0[1] - 1 + b, c0[2] - 1 + e);
  const vertex = (a: number, b: number, e: number): number => {
    const at = a + span * (b + span * e);
    let id = vertexOf[at]!;
    if (id !== -2 && id >= 0) return id;
    if (id === -2) return -1;
    let mask = 0;
    for (let q = 0; q < 8; q++) {
      const val = node(a + (q & 1), b + ((q >> 1) & 1), e + (q >> 2));
      corner[q] = val;
      if (val < 0) mask |= 1 << q;
    }
    if (mask === 0 || mask === 255) { vertexOf[at] = -2; return -1; }
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [qa, qb] of CELL_EDGES) {
      const va = corner[qa]!, vb = corner[qb]!;
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += (qa & 1) + ((qb & 1) - (qa & 1)) * t;
      sy += ((qa >> 1) & 1) + (((qb >> 1) & 1) - ((qa >> 1) & 1)) * t;
      sz += (qa >> 2) + ((qb >> 2) - (qa >> 2)) * t;
      n++;
    }
    const fx = sx / n, fy = sy / n, fz = sz / n;
    // Trilinear gradient at (fx, fy, fz): towards larger values, the water.
    const c = corner;
    const gx = (1 - fy) * (1 - fz) * (c[1]! - c[0]!) + fy * (1 - fz) * (c[3]! - c[2]!) + (1 - fy) * fz * (c[5]! - c[4]!) + fy * fz * (c[7]! - c[6]!);
    const gy = (1 - fx) * (1 - fz) * (c[2]! - c[0]!) + fx * (1 - fz) * (c[3]! - c[1]!) + (1 - fx) * fz * (c[6]! - c[4]!) + fx * fz * (c[7]! - c[5]!);
    const gz = (1 - fx) * (1 - fy) * (c[4]! - c[0]!) + fx * (1 - fy) * (c[5]! - c[1]!) + (1 - fx) * fy * (c[6]! - c[2]!) + fx * fy * (c[7]! - c[3]!);
    const gl = Math.hypot(gx, gy, gz) || 1;
    const x = snap(o.x + (c0[0] - 1 + a + fx) * h), y = snap(o.y + (c0[1] - 1 + b + fy) * h), z = snap(o.z + (c0[2] - 1 + e + fz) * h);
    id = out.positions.length / 3;
    out.positions.push(x, y, z);
    out.normals.push(gx / gl, gy / gl, gz / gl);
    // The zone of the water in front of the surface.
    out.zones.push(field.zoneAt(x + gx / gl * 0.6, y + gy / gl * 0.6, z + gz / gl * 0.6) + 1);
    vertexOf[at] = id;
    return id;
  };
  // Edges from node g (local cell coords a, b, e = g - c0 + 1) along each axis.
  for (let e = 1; e <= count; e++) for (let b = 1; b <= count; b++) for (let a = 1; a <= count; a++) {
    const v0 = node(a, b, e);
    for (let axis = 0; axis < 3; axis++) {
      const v1 = axis === 0 ? node(a + 1, b, e) : axis === 1 ? node(a, b + 1, e) : node(a, b, e + 1);
      if ((v0 < 0) === (v1 < 0)) continue;
      const mx = o.x + (c0[0] - 1 + a + (axis === 0 ? 0.5 : 0)) * h, my = o.y + (c0[1] - 1 + b + (axis === 1 ? 0.5 : 0)) * h;
      const mz = o.z + (c0[2] - 1 + e + (axis === 2 ? 0.5 : 0)) * h;
      if (!emit(mx, my, mz)) continue;
      // The four cells round the edge, in a fixed winding about the axis.
      let q: [number, number, number][];
      if (axis === 0) q = [[a, b - 1, e - 1], [a, b, e - 1], [a, b, e], [a, b - 1, e]];
      else if (axis === 1) q = [[a - 1, b, e - 1], [a - 1, b, e], [a, b, e], [a, b, e - 1]];
      else q = [[a - 1, b - 1, e], [a, b - 1, e], [a, b, e], [a - 1, b, e]];
      const ids = q.map(([x, y, z]) => vertex(x, y, z));
      if (ids.some(i => i < 0)) continue;
      // Rock at v0 means the surface faces +axis; flip the winding otherwise.
      const out0 = v0 < 0;
      const [p, r, s, t] = out0 ? ids : [ids[0]!, ids[3]!, ids[2]!, ids[1]!];
      // Split along the shorter diagonal.
      const P = out.positions, d02 = dist2(P, p!, s!), d13 = dist2(P, r!, t!);
      if (d02 <= d13) out.indices.push(p!, r!, s!, p!, s!, t!);
      else out.indices.push(p!, r!, t!, r!, s!, t!);
    }
  }
  return out;
}
const CELL_EDGES: readonly (readonly [number, number])[] = [
  [0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7],
];
function dist2(P: readonly number[], a: number, b: number): number {
  return (P[a * 3]! - P[b * 3]!) ** 2 + (P[a * 3 + 1]! - P[b * 3 + 1]!) ** 2 + (P[a * 3 + 2]! - P[b * 3 + 2]!) ** 2;
}

/** Clip raw triangles to keep only owned parts: a triangle with an unowned
 * vertex is clipped to the collar rect that owns its other vertices (the only
 * place a surface meets unowned space, by `validateOwnership`); new cut
 * vertices on the rect edge are snapped onto the seabed. `keepOutside`
 * inverts it for the collision band (seabed outside the collar, inside the
 * band ring). */
function clipOwned(raw: Raw, field: CaveField, owned: (x: number, y: number, z: number) => boolean,
  rectFor: (x: number, z: number) => Rect | null, keepOutside: boolean): Raw {
  const out: Raw = { positions: [], normals: [], zones: [], indices: [] };
  const remap = new Map<number, number>(), cut = new Map<string, number>();
  const P = raw.positions, N = raw.normals, Z = raw.zones;
  const keep = (v: number): number => {
    let id = remap.get(v);
    if (id === undefined) {
      id = out.positions.length / 3; remap.set(v, id);
      out.positions.push(P[v * 3]!, P[v * 3 + 1]!, P[v * 3 + 2]!); out.normals.push(N[v * 3]!, N[v * 3 + 1]!, N[v * 3 + 2]!); out.zones.push(Z[v]!);
    }
    return id;
  };
  type Q = { key: string; v?: number; p: number[]; n: number[]; z: number };
  const orig = (v: number): Q => ({ key: `v${v}`, v, p: [P[v * 3]!, P[v * 3 + 1]!, P[v * 3 + 2]!], n: [N[v * 3]!, N[v * 3 + 1]!, N[v * 3 + 2]!], z: Z[v]! });
  const emit = (q: Q): number => {
    if (q.v !== undefined) return keep(q.v);
    let id = cut.get(q.key);
    if (id === undefined) {
      id = out.positions.length / 3; cut.set(q.key, id);
      const ground = field.floor(q.p[0]!, q.p[2]!);
      // A cut through the seabed lands on the heightfield exactly.
      const y = Math.abs(q.p[1]! - ground) < 0.75 ? ground : q.p[1]!;
      const l = Math.hypot(q.n[0]!, q.n[1]!, q.n[2]!) || 1;
      out.positions.push(snap(q.p[0]!), snap(y), snap(q.p[2]!)); out.normals.push(q.n[0]! / l, q.n[1]! / l, q.n[2]! / l); out.zones.push(q.z);
    }
    return id;
  };
  const I = raw.indices;
  for (let t = 0; t < I.length; t += 3) {
    const tri = [I[t]!, I[t + 1]!, I[t + 2]!];
    const inside = tri.map(v => owned(P[v * 3]!, P[v * 3 + 1]!, P[v * 3 + 2]!));
    if (!keepOutside && inside.every(Boolean)) { out.indices.push(...tri.map(keep)); continue; }
    if (!keepOutside && !inside.some(Boolean)) continue;
    let rect: Rect | null = null;
    for (const v of tri) if ((rect = rectFor(P[v * 3]!, P[v * 3 + 2]!))) break;
    if (!rect) { if (keepOutside) out.indices.push(...tri.map(keep)); continue; }
    // Sutherland-Hodgman against the rect, or against its outside (one
    // half-plane at a time is enough for the band ring: the outside of a
    // rect is not convex, so it is cut into the four side slabs).
    const polys: Q[][] = keepOutside ? outsideRect(tri.map(orig), rect) : [clipRect(tri.map(orig), rect)];
    for (const poly of polys) {
      if (poly.length < 3) continue;
      const ids = poly.map(emit);
      for (let f = 1; f + 1 < ids.length; f++) out.indices.push(ids[0]!, ids[f]!, ids[f + 1]!);
    }
  }
  return out;
}
type Q = { key: string; v?: number; p: number[]; n: number[]; z: number };
function clipPlane(poly: Q[], axis: 0 | 2, value: number, sign: number): Q[] {
  const next: Q[] = [];
  for (let e = 0; e < poly.length; e++) {
    const a = poly[e]!, b = poly[(e + 1) % poly.length]!;
    const da = (a.p[axis]! - value) * sign, db = (b.p[axis]! - value) * sign;
    if (da >= 0) next.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const s = da / (da - db), lerp = (u: number[], w: number[]): number[] => u.map((x, i) => x + (w[i]! - x) * s);
      const [lo, hi] = a.key < b.key ? [a.key, b.key] : [b.key, a.key];
      const p = lerp(a.p, b.p); p[axis] = value;
      next.push({ key: `${lo}|${hi}|${axis}|${value}|${sign}`, p, n: lerp(a.n, b.n), z: s < 0.5 ? a.z : b.z });
    }
  }
  return next;
}
function clipRect(poly: Q[], r: Rect): Q[] {
  for (const [axis, value, sign] of [[0, r.minX, 1], [0, r.maxX, -1], [2, r.minZ, 1], [2, r.maxZ, -1]] as const) {
    poly = clipPlane(poly, axis, value, sign);
    if (poly.length < 3) return [];
  }
  return poly;
}
/** The parts of a polygon outside a rect, as up to four convex pieces. */
function outsideRect(poly: Q[], r: Rect): Q[][] {
  const out: Q[][] = [];
  const west = clipPlane(poly, 0, r.minX, -1); if (west.length >= 3) out.push(west);
  let rest = clipPlane(poly, 0, r.minX, 1);
  const east = clipPlane(rest, 0, r.maxX, 1); if (east.length >= 3) out.push(east);
  rest = clipPlane(rest, 0, r.maxX, -1);
  const south = clipPlane(rest, 2, r.minZ, -1); if (south.length >= 3) out.push(south);
  const north = clipPlane(clipPlane(rest, 2, r.minZ, 1), 2, r.maxZ, 1); if (north.length >= 3) out.push(north);
  return out;
}

const toMesh = (raw: Raw): { positions: Float32Array; normals: Float32Array; zones: Uint8Array; indices: Uint32Array } => ({
  positions: new Float32Array(raw.positions), normals: new Float32Array(raw.normals), zones: new Uint8Array(raw.zones), indices: new Uint32Array(raw.indices),
});

export interface MeshOptions {
  /** Collision band width round collars, metres (0: none). */
  readonly band?: number;
}

/** Build one chunk at one LOD. Pure: the same field and chunk always give
 * the same arrays. */
export function buildChunkMesh(field: CaveField, l: CaveLattice, c: ChunkCoord, lod: LodLevel, options: MeshOptions = {}): ChunkMesh {
  const started = Date.now();
  const s = sampleChunk(field, l, c), N = l.cells, m = s.m;
  const fineAt = (gi: number, gj: number, gk: number): number => s.v[(gi - s.lo[0]) + m * ((gj - s.lo[1]) + m * (gk - s.lo[2]))]!;
  const collars = field.source.collars;
  const rectFor = (x: number, z: number): Rect | null => collars.find(r => x >= r.minX && x < r.maxX && z >= r.minZ && z < r.maxZ) ?? null;
  const ownedOrBorder = (x: number, y: number, z: number): boolean => field.owned(x, y, z);
  let raw: Raw;
  if (lod === "fine") {
    const c0: [number, number, number] = [c.cx * N, c.cy * N, c.cz * N];
    raw = surfaceNets(field, l, fineAt, c0, N, 1, (x, y, z) => field.owned(x, y, z));
    raw = clipOwned(raw, field, ownedOrBorder, rectFor, false);
  } else {
    // Coarse node G sits on fine node 2G and takes the most open of its 27.
    const coarseAt = (gi: number, gj: number, gk: number): number => {
      let best = -Infinity;
      for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++)
        best = Math.max(best, fineAt(2 * gi + di, 2 * gj + dj, 2 * gk + dk));
      return best;
    };
    const c0: [number, number, number] = [c.cx * N / 2, c.cy * N / 2, c.cz * N / 2];
    raw = surfaceNets(field, l, coarseAt, c0, N / 2, 2, (x, y, z) => field.owned(x, y, z));
    raw = clipOwned(raw, field, ownedOrBorder, rectFor, false);
    // Coarse seabed in a collar sags into the dilation; lift exterior
    // vertices back onto the seabed (no carve is near them).
    for (let v = 0; v < raw.zones.length; v++) if (raw.zones[v] === 0) {
      const g = field.floor(raw.positions[v * 3]!, raw.positions[v * 3 + 2]!), y = raw.positions[v * 3 + 1]!;
      if (y < g && g - y < 1.5 && field.inCollar(raw.positions[v * 3]!, raw.positions[v * 3 + 2]!)) raw.positions[v * 3 + 1] = snap(g);
    }
  }
  let band: ChunkMesh["band"] = null;
  const width = options.band ?? 0;
  if (lod === "fine" && width > 0) {
    const ring = (x: number, z: number): Rect | null => collars.find(r => x >= r.minX - width && x < r.maxX + width && z >= r.minZ - width && z < r.maxZ + width) ?? null;
    // Unowned surfaces in the ring: the exterior seabed round the collar.
    const inRing = (x: number, y: number, z: number): boolean => !rectFor(x, z) && ring(x, z) !== null &&
      y >= field.domain.min.y && y <= field.domain.max.y && !field.owned(x, y, z);
    const c0: [number, number, number] = [c.cx * N, c.cy * N, c.cz * N];
    let b = surfaceNets(field, l, fineAt, c0, N, 1, inRing);
    b = clipOwned(b, field, (x, _y, z) => rectFor(x, z) === null, rectFor, true);
    if (b.indices.length) band = { positions: new Float32Array(b.positions), indices: new Uint32Array(b.indices) };
  }
  return { key: chunkKey(c), coord: c, lod, ...toMesh(raw), band, stats: { sampled: s.sampled, skipped: s.skipped, ms: Date.now() - started } };
}

/** Chunks whose box may hold any surface (owned or band), in key order. */
export function surfaceChunks(field: CaveField, l: CaveLattice, band = 0): ChunkCoord[] {
  const out: ChunkCoord[] = [];
  for (let cz = 0; cz < l.nz; cz++) for (let cy = 0; cy < l.ny; cy++) for (let cx = 0; cx < l.nx; cx++) {
    const b = chunkBox(l, { cx, cy, cz });
    const grown: Aabb = { min: { x: b.min.x - 1, y: b.min.y - 1, z: b.min.z - 1 }, max: { x: b.max.x + 1, y: b.max.y + 1, z: b.max.z + 1 } };
    const nearCollar = band > 0 && field.source.collars.some(r => r.minX - band < b.max.x && r.maxX + band > b.min.x && r.minZ - band < b.max.z && r.maxZ + band > b.min.z);
    if (field.mayHaveSurface(grown) || (nearCollar && collarSeabedIn(field, b))) out.push({ cx, cy, cz });
  }
  return out;
}
function collarSeabedIn(field: CaveField, b: Aabb): boolean {
  let lo = Infinity, hi = -Infinity;
  for (let x = b.min.x; x <= b.max.x; x += 2) for (let z = b.min.z; z <= b.max.z; z += 2) {
    const f = field.floor(x, z); lo = Math.min(lo, f); hi = Math.max(hi, f);
  }
  return hi + 1 >= b.min.y && lo - 1 <= b.max.y;
}
