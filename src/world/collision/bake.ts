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
  // Recovery's one-sided rule needs every closed part closed and coherently wound.
  const problems = orientationProblems(id, { positions: new Float32Array(pos), indices: new Uint32Array(idx) }, true, parts);
  if (problems.length) throw new Error(`${id}: a closed piece is not closed and coherently wound:\n- ${problems.join("\n- ")}`);
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

/** Orientation problems of a mesh, per part. A coherently wound surface
 * uses each undirected edge equally often in both directions (a manifold
 * edge once each way; a non-manifold one, as surface nets can leave, twice
 * each way), except, on an open mesh, once at its boundary. So a flipped
 * triangle shows as an edge used two more times one way than the other, and
 * with `closed`, any imbalance is a hole or seam. Empty when coherent.
 *
 * **Intake precondition: conforming indexed topology.** Vertices are
 * compared by index, so equal positions must be merged first (`facetMesh`
 * does), and an edge must not be split on one side only (a T-junction reads
 * as a hole). Null triangles (a repeated index) have no orientation and are
 * skipped. Edge balance certifies coherent winding of such a mesh; it is not
 * a geometric closedness proof for arbitrary input. */
export function orientationProblems(id: string, mesh: TriangleMesh, closed: boolean, parts?: ArrayLike<number> | null): string[] {
  const I = mesh.indices, n = I.length / 3, nv = mesh.positions.length / 3, out: string[] = [];
  // Net uses of each undirected edge, per part: + for low -> high, - for high -> low.
  const net = new Map<number, number>();
  for (let t = 0; t < n; t++) {
    const a0 = I[t * 3]!, b0 = I[t * 3 + 1]!, c0 = I[t * 3 + 2]!;
    if (a0 === b0 || b0 === c0 || a0 === c0) continue;
    const p = parts ? parts[t]! : 0;
    for (let k = 0; k < 3; k++) {
      const a = I[t * 3 + k]!, b = I[t * 3 + (k + 1) % 3]!, lo = Math.min(a, b), hi = Math.max(a, b), e = (p * nv + lo) * nv + hi;
      net.set(e, (net.get(e) ?? 0) + (a < b ? 1 : -1));
    }
  }
  const allowed = closed ? 0 : 1;
  for (const [e, v] of net) {
    if (Math.abs(v) <= allowed) continue;
    const hi = e % nv, lo = Math.floor(e / nv) % nv, p = Math.floor(e / (nv * nv));
    if (out.length < 12) out.push(`${id}: edge ${lo}-${hi} (part ${p}) is used ${Math.abs(v)} more times one way than the other: ${closed && Math.abs(v) === 1 ? "not closed" : "a flipped triangle"}`);
  }
  return out;
}

/** Probe offsets, metres, tried in turn until a vote is decisive. */
export const FACING_PROBES = [0.05, 0.1, 0.2] as const;
/** Which way a coherently wound mesh faces: 1 when (b - a) x (c - a) points
 * out of the solid, -1 when in.
 * - **Coherence is the guarantee:** the mesh must have no orientation
 *   problems (`orientationProblems`), so every face agrees with its
 *   neighbours and one decision orients them all.
 * - **The vote decides which way, with the shape's own authoritative
 *   occupancy:** `inside(p)` is true in the solid, false outside, and `null`
 *   where it doesn't know (outside its domain). Pass the source field the
 *   mesh was built from, not a proxy such as a box cover, which disagrees
 *   with the surface near its own edges.
 * - **A vote is decisive** only when both probes either side of a sampled
 *   triangle are classified and differ. Otherwise it retries at the next
 *   offset (`FACING_PROBES`), and abstains if none decides (a thin feature,
 *   an ownership cutoff).
 * - **Every decisive vote must agree,** and at least one must exist; else it
 *   throws, naming the mesh. */
export function meshFacing(id: string, mesh: TriangleMesh, inside: (p: Vec3) => boolean | null, samples = 96): 1 | -1 {
  const problems = orientationProblems(id, mesh, false);
  if (problems.length) throw new Error(`${id}: winding is not coherent:\n- ${problems.join("\n- ")}`);
  const P = mesh.positions, I = mesh.indices, n = I.length / 3, step = Math.max(1, Math.floor(n / samples));
  let out = 0, inward = 0, abstained = 0;
  for (let t = 0; t < n; t += step) {
    const a = I[t * 3]! * 3, b = I[t * 3 + 1]! * 3, c = I[t * 3 + 2]! * 3;
    const ux = P[b]! - P[a]!, uy = P[b + 1]! - P[a + 1]!, uz = P[b + 2]! - P[a + 2]!, vx = P[c]! - P[a]!, vy = P[c + 1]! - P[a + 1]!, vz = P[c + 2]! - P[a + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) continue;
    const mx = (P[a]! + P[b]! + P[c]!) / 3, my = (P[a + 1]! + P[b + 1]! + P[c + 1]!) / 3, mz = (P[a + 2]! + P[b + 2]! + P[c + 2]!) / 3;
    let vote = 0;
    for (const off of FACING_PROBES) {
      const h = off / l;
      const plus = inside({ x: mx + nx * h, y: my + ny * h, z: mz + nz * h }), minus = inside({ x: mx - nx * h, y: my - ny * h, z: mz - nz * h });
      if (plus === null || minus === null || plus === minus) continue;
      vote = minus ? 1 : -1;
      break;
    }
    if (vote > 0) out++; else if (vote < 0) inward++; else abstained++;
  }
  if (out > 0 && inward === 0) return 1;
  if (inward > 0 && out === 0) return -1;
  throw new Error(`${id}: winding votes disagree or are absent (${out} out, ${inward} in, ${abstained} undecided)`);
}

/** The inside predicate of a signed distance (negative inside), for `meshFacing`. */
export const insideOf = (distance: (x: number, y: number, z: number) => number) => (p: Vec3): boolean | null => {
  const d = distance(p.x, p.y, p.z);
  return Number.isFinite(d) ? d < 0 : null;
};

/** Most a collar's floor may stand above its lattice between the
 * conservative points, metres: half the exterior world's 2 cm floor
 * tolerance, so a box resting on the collar is never called buried. */
export const COLLAR_RESIDUAL = 0.01;
/** The exterior seabed round a cave footprint as a heightfield (the collar),
 * sampled from the same floor the seabed art is drawn from and the exterior
 * world tests clearance against. It is lifted where the floor curves
 * (`conservative`), so it is on or above the floor at each cell's nine
 * half-cell points, and the sag left between them is measured: a floor that
 * curves more than `COLLAR_RESIDUAL` inside a 0.5 m cell throws, naming the
 * collar, rather than leave a hidden float or sink. Cells whose centre any
 * owned footprint holds are holes, as the old collar columns skipped them. */
export function collarHeightfield(id: string, footprint: Rect, band: number, floor: (x: number, z: number) => number,
  owned: readonly Rect[], cell = 0.5): StaticHeightfield {
  const rect = { minX: footprint.minX - band, maxX: footprint.maxX + band, minZ: footprint.minZ - band, maxZ: footprint.maxZ + band };
  const h = sampleHeightfield(id, rect, cell, floor, {
    conservative: true, measure: true, hole: (x, z) => owned.some(r => x >= r.minX && x < r.maxX && z >= r.minZ && z < r.maxZ),
  });
  if (h.residual > COLLAR_RESIDUAL)
    throw new Error(`collar ${id}: the floor stands ${(h.residual * 1000).toFixed(1)} mm above the ${cell} m lattice between samples; use a finer cell`);
  return h;
}
