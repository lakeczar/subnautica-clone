import type { VistaBlock, VistaFacet, VistaPiece } from "../../content/vistaKit.js";
import type { Rect, Vec3 } from "../types.js";
import { buildBoxes, type StaticMember } from "./collider.js";
import { sampleHeightfield, type StaticHeightfield } from "./heightfield.js";
import { buildShape, MAX_SHAPE_VERTICES, type Facing, type Interior, type StaticShape } from "./shape.js";

/** Bake static collision from the same source as the art (COL-1).
 *
 * Every function here takes the art's own data: the facets and blocks a set
 * piece is drawn from (`vistaKit.ts`), the mesh a cave shell is drawn from,
 * the floor a seabed is drawn from. Nothing is re-authored for collision,
 * so art and collision cannot drift: where the art changes, a rebake
 * changes the collision with it.
 *
 * **Adopting it (builders, before stage B lands).** Keep the intended art.
 * Collide it with `artMembers(id, blocks, pieces)` (or `meshMembers` for a
 * mesh) in a `createStaticCollider`; until the world composes static
 * colliders, ship the old conservative box cover beside it and file the gap
 * as COL-1 debt. The collider and the oracle (`tests/col1-oracle-support.ts`)
 * then show what the art itself would block. */

export interface TriangleMesh { readonly positions: Float32Array; readonly indices: Uint32Array }

/** Fan-triangulated convex facets, with vertices merged where their Float32
 * coordinates are equal. `outwardFrom` (a closed convex piece's inside
 * point) winds every triangle so (b - a) x (c - a) faces away from it. */
export function facetMesh(facets: readonly VistaFacet[], outwardFrom?: Vec3): TriangleMesh {
  const pos: number[] = [], idx: number[] = [], seen = new Map<string, number>();
  const vertex = (p: Vec3): number => {
    const x = Math.fround(p.x), y = Math.fround(p.y), z = Math.fround(p.z), key = `${x},${y},${z}`;
    let i = seen.get(key);
    if (i === undefined) { i = pos.length / 3; pos.push(x, y, z); seen.set(key, i); }
    return i;
  };
  for (const f of facets) {
    const v = f.pts.map(vertex);
    for (let k = 1; k + 1 < v.length; k++) {
      let a = v[0]!, b = v[k]!, c = v[k + 1]!;
      if (a === b || b === c || a === c) continue;
      if (outwardFrom) {
        const P = (i: number): Vec3 => ({ x: pos[i * 3]!, y: pos[i * 3 + 1]!, z: pos[i * 3 + 2]! });
        const A = P(a), B = P(b), C = P(c);
        const ux = B.x - A.x, uy = B.y - A.y, uz = B.z - A.z, vx = C.x - A.x, vy = C.y - A.y, vz = C.z - A.z;
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        if (nx * (A.x - outwardFrom.x) + ny * (A.y - outwardFrom.y) + nz * (A.z - outwardFrom.z) < 0) { const q = b; b = c; c = q; }
      }
      idx.push(a, b, c);
    }
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}

const centroid = (facets: readonly VistaFacet[]): Vec3 => {
  let x = 0, y = 0, z = 0, n = 0;
  for (const f of facets) for (const p of f.pts) { x += p.x; y += p.y; z += p.z; n++; }
  return { x: x / n, y: y / n, z: z / n };
};

/** One shape from several closed convex pieces, each its own parity part. */
export function solidPiecesShape(id: string, pieces: readonly VistaPiece[]): StaticShape | null {
  const pos: number[] = [], idx: number[] = [], parts: number[] = [];
  let part = 0;
  for (const p of pieces) {
    if (!p.closed) throw new Error(`${id}: open piece in a solid shape`);
    const m = facetMesh(p.facets, centroid(p.facets)), base = pos.length / 3;
    for (const v of m.positions) pos.push(v);
    for (const i of m.indices) idx.push(i + base);
    for (let t = 0; t < m.indices.length / 3; t++) parts.push(part);
    part++;
  }
  if (!idx.length) return null;
  if (part > 65535) throw new Error(`${id}: ${part} solid parts exceed 65,535`);
  if (pos.length / 3 > MAX_SHAPE_VERTICES) throw new Error(`${id}: ${pos.length / 3} vertices; bake its pieces as several sets`);
  return buildShape(id, new Float32Array(pos), idx, { interior: "solid", facing: 1, parts: part > 1 ? parts : null });
}

/** One two-sided skin shape from open facets (plates, panels). */
export function skinShape(id: string, facets: readonly VistaFacet[]): StaticShape | null {
  const m = facetMesh(facets);
  if (!m.indices.length) return null;
  if (m.positions.length / 3 > MAX_SHAPE_VERTICES) throw new Error(`${id}: ${m.positions.length / 3} vertices; bake it as several sets`);
  return buildShape(id, m.positions, m.indices, { interior: "none", facing: 0 });
}

/** A set piece's collision from its own art: blocks as boxes (they are
 * drawn as boxes), closed pieces as solid parts, open pieces as skin. */
export function artMembers(id: string, blocks: readonly VistaBlock[], pieces: readonly VistaPiece[], skinFacets: readonly VistaFacet[] = []): StaticMember[] {
  const out: StaticMember[] = [];
  if (blocks.length) out.push(buildBoxes(`${id}.blocks`, blocks.map((b, i) => ({ id: `${id}.block${i}`, min: b.min, max: b.max }))));
  const solid = solidPiecesShape(`${id}.solid`, pieces.filter(p => p.closed));
  if (solid) out.push(solid);
  const skin = skinShape(`${id}.skin`, [...pieces.filter(p => !p.closed).flatMap(p => p.facets), ...skinFacets]);
  if (skin) out.push(skin);
  return out;
}

export interface MeshShapeOptions {
  readonly interior: Interior;
  readonly facing: Facing;
  /** The positions are the art's own buffer: shapes view it where they can. */
  readonly shared: boolean;
}
/** A mesh as one shape, or (over 65,536 vertices) several, split in X/Z
 * columns at the median triangle. A split part views the art's buffer when
 * its vertices fall in one 65,536 window, else copies just its vertices.
 * Parts of a closed mesh share a group, so interior parity spans them. */
export function meshShapes(id: string, mesh: TriangleMesh, options: MeshShapeOptions): StaticShape[] {
  const nv = mesh.positions.length / 3;
  if (nv <= MAX_SHAPE_VERTICES) return [buildShape(id, mesh.positions, mesh.indices, { ...options, group: null })];
  const P = mesh.positions, I = mesh.indices, out: StaticShape[] = [];
  const split = (tris: Int32Array): void => {
    let lo = Infinity, hi = -Infinity;
    const used = new Set<number>();
    for (const t of tris) for (let k = 0; k < 3; k++) { const v = I[t * 3 + k]!; used.add(v); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (used.size <= MAX_SHAPE_VERTICES) {
      const name = `${id}.${out.length}`;
      if (hi - lo < MAX_SHAPE_VERTICES) {
        const view = P.subarray(lo * 3, (hi + 1) * 3), idx = new Uint32Array(tris.length * 3);
        tris.forEach((t, j) => { for (let k = 0; k < 3; k++) idx[j * 3 + k] = I[t * 3 + k]! - lo; });
        out.push(buildShape(name, view, idx, { ...options, group: id }));
      } else {
        const remap = new Map<number, number>(), pos: number[] = [], idx = new Uint32Array(tris.length * 3);
        tris.forEach((t, j) => {
          for (let k = 0; k < 3; k++) {
            const v = I[t * 3 + k]!;
            let r = remap.get(v);
            if (r === undefined) { r = remap.size; remap.set(v, r); pos.push(P[v * 3]!, P[v * 3 + 1]!, P[v * 3 + 2]!); }
            idx[j * 3 + k] = r;
          }
        });
        out.push(buildShape(name, new Float32Array(pos), idx, { ...options, shared: false, group: id }));
      }
      return;
    }
    // Median split along the wider of X and Z (never Y: columns keep rays whole).
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    const cx = new Float64Array(tris.length), cz = new Float64Array(tris.length);
    tris.forEach((t, j) => {
      const a = I[t * 3]! * 3, b = I[t * 3 + 1]! * 3, c = I[t * 3 + 2]! * 3;
      cx[j] = (P[a]! + P[b]! + P[c]!) / 3; cz[j] = (P[a + 2]! + P[b + 2]! + P[c + 2]!) / 3;
      x0 = Math.min(x0, cx[j]!); x1 = Math.max(x1, cx[j]!); z0 = Math.min(z0, cz[j]!); z1 = Math.max(z1, cz[j]!);
    });
    const key = x1 - x0 >= z1 - z0 ? cx : cz, order = Array.from(tris.keys()).sort((a, b) => key[a]! - key[b]! || a - b);
    const mid = order.length >> 1;
    split(Int32Array.from(order.slice(0, mid), j => tris[j]!));
    split(Int32Array.from(order.slice(mid), j => tris[j]!));
  };
  split(Int32Array.from({ length: I.length / 3 }, (_, t) => t));
  return out;
}

/** Which way a closed mesh's winding faces: 1 when (b - a) x (c - a) points
 * out of the solid, -1 when in, by majority over up to `samples` triangles
 * of `isSolid` a hair either side. Throws when the vote is not clear. */
export function meshFacing(id: string, mesh: TriangleMesh, isSolid: (p: Vec3) => boolean, samples = 96): 1 | -1 {
  const P = mesh.positions, I = mesh.indices, n = I.length / 3, step = Math.max(1, Math.floor(n / samples));
  let out = 0, inward = 0;
  for (let t = 0; t < n; t += step) {
    const a = I[t * 3]! * 3, b = I[t * 3 + 1]! * 3, c = I[t * 3 + 2]! * 3;
    const ux = P[b]! - P[a]!, uy = P[b + 1]! - P[a + 1]!, uz = P[b + 2]! - P[a + 2]!, vx = P[c]! - P[a]!, vy = P[c + 1]! - P[a + 1]!, vz = P[c + 2]! - P[a + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) continue;
    const m = { x: (P[a]! + P[b]! + P[c]!) / 3, y: (P[a + 1]! + P[b + 1]! + P[c + 1]!) / 3, z: (P[a + 2]! + P[b + 2]! + P[c + 2]!) / 3 }, h = 0.05 / l;
    const plus = isSolid({ x: m.x + nx * h, y: m.y + ny * h, z: m.z + nz * h }), minus = isSolid({ x: m.x - nx * h, y: m.y - ny * h, z: m.z - nz * h });
    if (minus && !plus) out++;
    else if (plus && !minus) inward++;
  }
  if (out > 3 * inward && out > 0) return 1;
  if (inward > 3 * out && inward > 0) return -1;
  throw new Error(`${id}: winding vote unclear (${out} out, ${inward} in)`);
}

/** The exterior seabed round a cave footprint as a heightfield (the collar),
 * sampled from the same floor the seabed art is drawn from. Cells whose
 * centre any owned footprint holds are holes, as the old collar columns
 * skipped them. */
export function collarHeightfield(id: string, footprint: Rect, band: number, floor: (x: number, z: number) => number,
  owned: readonly Rect[], cell = 0.5): StaticHeightfield {
  const rect = { minX: footprint.minX - band, maxX: footprint.maxX + band, minZ: footprint.minZ - band, maxZ: footprint.maxZ + band };
  return sampleHeightfield(id, rect, cell, floor, (x, z) => owned.some(r => x >= r.minX && x < r.maxX && z >= r.minZ && z < r.maxZ));
}
