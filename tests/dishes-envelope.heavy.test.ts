import assert from "node:assert/strict";
import test from "node:test";
import { BOWL_STANDOFF, triangleDistance } from "../src/content/regions/dishGeometry.js";
import { STRUCTURES } from "../src/content/regions/structures.js";
import type { VistaFacet } from "../src/content/vistaKit.js";
import type { Aabb, Vec3 } from "../src/world/types.js";
import { structureMesh } from "../src/render/biomes/structures.js";

/** The dishes' collision hugs their art, as A1's vista envelope does: no
 * drawn point (sampled over every triangle, at every LOD) outside the dish's
 * solids, and every point of every solid (sampled through its volume and over
 * its faces) within 0.35 m of the frame (rim, feed, hub, fins) or, for the
 * bowl's boxes, within `BOWL_STANDOFF` of the bowl. */
const FRAME_GAP = 0.35, TOL = 0.02;
const DISHES = STRUCTURES.filter(s => s.kind === "dish");
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
type Tri = readonly [Vec3, Vec3, Vec3];
const fan = (fs: readonly VistaFacet[]): Tri[] => fs.flatMap(f => f.pts.slice(1, -1).map((p, i): Tri => [f.pts[0]!, p, f.pts[i + 2]!]));
/** Distance to some art: convex solids (inside is 0) and triangles, hashed in 1 m cells padded by `pad`. */
function index(convex: readonly { n: Vec3; p: Vec3 }[][], tris: readonly Tri[], pad: number): (p: Vec3) => number {
  const cells = new Map<string, { c: { n: Vec3; p: Vec3 }[][]; t: Tri[] }>();
  const at = (k: string) => { let e = cells.get(k); if (!e) cells.set(k, e = { c: [], t: [] }); return e; };
  const span = (ps: readonly Vec3[], f: (k: string) => void): void => {
    const lo = { x: Math.min(...ps.map(q => q.x)), y: Math.min(...ps.map(q => q.y)), z: Math.min(...ps.map(q => q.z)) };
    const hi = { x: Math.max(...ps.map(q => q.x)), y: Math.max(...ps.map(q => q.y)), z: Math.max(...ps.map(q => q.z)) };
    for (let x = Math.floor(lo.x - pad); x <= Math.floor(hi.x + pad); x++) for (let y = Math.floor(lo.y - pad); y <= Math.floor(hi.y + pad); y++)
      for (let z = Math.floor(lo.z - pad); z <= Math.floor(hi.z + pad); z++) f(`${x},${y},${z}`);
  };
  for (const planes of convex) span(planes.map(q => q.p), k => at(k).c.push(planes));
  for (const t of tris) span(t, k => at(k).t.push(t));
  return p => {
    const e = cells.get(`${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`);
    if (!e) return Infinity;
    if (e.c.some(planes => planes.every(q => dot(q.n, sub(p, q.p)) <= 1e-3 * Math.sqrt(dot(q.n, q.n))))) return 0;
    let best = Infinity;
    for (const [a, b, c] of e.t) best = Math.min(best, triangleDistance(p, a, b, c));
    return best;
  };
}
const boxPlanes = (k: Aabb): { n: Vec3; p: Vec3 }[] => (["x", "y", "z"] as const).flatMap(a =>
  [{ n: { x: 0, y: 0, z: 0, [a]: -1 } as Vec3, p: k.min }, { n: { x: 0, y: 0, z: 0, [a]: 1 } as Vec3, p: k.max }]);
const grid = (k: Aabb, step: number, f: (p: Vec3) => void): void => {
  const n = (["x", "y", "z"] as const).map(a => Math.max(1, Math.ceil((k.max[a] - k.min[a]) / step)));
  for (let i = 0; i <= n[0]!; i++) for (let j = 0; j <= n[1]!; j++) for (let l = 0; l <= n[2]!; l++)
    f({ x: k.min.x + (k.max.x - k.min.x) * i / n[0]!, y: k.min.y + (k.max.y - k.min.y) * j / n[1]!, z: k.min.z + (k.max.z - k.min.z) * l / n[2]! });
};

test("dish collision hugs its art: nothing drawn outside it, the frame's within 0.35 m, the bowl's within its stand-off", () => {
  let samples = 0;
  for (const d of DISHES) {
    const art = d.dish!, solids = d.solids;
    // 1. Every drawn point, at both LODs, inside a solid.
    const where = new Map<string, Aabb[]>();
    for (const k of solids) for (let x = Math.floor(k.min.x); x <= Math.floor(k.max.x); x++) for (let y = Math.floor(k.min.y); y <= Math.floor(k.max.y); y++)
      for (let z = Math.floor(k.min.z); z <= Math.floor(k.max.z); z++) { const key = `${x},${y},${z}`; if (!where.has(key)) where.set(key, []); where.get(key)!.push(k); }
    const inside = (p: Vec3): boolean => [-1, 0, 1].some(dx => [-1, 0, 1].some(dy => [-1, 0, 1].some(dz =>
      (where.get(`${Math.floor(p.x + dx * TOL)},${Math.floor(p.y + dy * TOL)},${Math.floor(p.z + dz * TOL)}`) ?? []).some(k =>
        p.x >= k.min.x - TOL && p.x <= k.max.x + TOL && p.y >= k.min.y - TOL && p.y <= k.max.y + TOL && p.z >= k.min.z - TOL && p.z <= k.max.z + TOL))));
    for (const fine of [true, false]) {
      const m = structureMesh([d], d.id, fine)!, P = m.positions, I = m.indices, at = (i: number): Vec3 => ({ x: P[i * 3]!, y: P[i * 3 + 1]!, z: P[i * 3 + 2]! });
      for (let t = 0; t < I.length; t += 3) {
        const A = at(I[t]!), B = at(I[t + 1]!), C = at(I[t + 2]!);
        const n = Math.max(1, Math.ceil(Math.max(Math.hypot(...Object.values(sub(A, B))), Math.hypot(...Object.values(sub(B, C))), Math.hypot(...Object.values(sub(A, C)))) / 0.25));
        for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
          const u = i / n, v = j / n, w = 1 - u - v, p = { x: A.x * w + B.x * u + C.x * v, y: A.y * w + B.y * u + C.y * v, z: A.z * w + B.z * u + C.z * v };
          samples++;
          assert.ok(inside(p), `${d.id} (${fine ? "fine" : "coarse"}) draws outside its collision at ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}`);
        }
      }
    }
    // 2. No solid off its art.
    const convex = [...art.blocks.map(boxPlanes), ...art.pieces.filter(p => p.closed).map(p => p.facets.map(f => ({ n: cross(sub(f.pts[1]!, f.pts[0]!), sub(f.pts[2]!, f.pts[0]!)), p: f.pts[0]! })))];
    const frameTris = fan(art.pieces.flatMap(p => p.facets)), bowlTris = fan(art.bowl);
    const frame = index(convex, frameTris, FRAME_GAP + TOL), bowl = index(convex, [...frameTris, ...bowlTris], BOWL_STANDOFF + TOL);
    for (const [boxes, dist, gap, step] of [[art.solids.frame, frame, FRAME_GAP, 0.25], [art.solids.bowl, bowl, BOWL_STANDOFF, 0.35]] as const)
      for (const k of boxes) grid(k, step, p => {
        samples++;
        const g = dist(p);
        assert.ok(g <= gap + TOL, `${d.id}: collision stands ${g === Infinity ? "> 1" : g.toFixed(2)} m off the art at ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)} (limit ${gap})`);
      });
  }
  console.log(`dish envelope: ${samples} samples over ${DISHES.reduce((n, d) => n + d.solids.length, 0)} solids`);
});
