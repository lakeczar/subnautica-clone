import assert from "node:assert/strict";
import test from "node:test";
import { VISTA_SETS, VISTA_SOLIDS } from "../src/content/vistas.js";
import type { Vec3 } from "../src/world/types.js";
import { RecipeBuilder } from "../src/render/biomes/recipe.js";
import { drawSolidSet } from "../src/render/biomes/vistas.js";

/** Collision hugs the art: no art outside its set's solids (sampled over
 * every triangle), and every point of every box — sampled on a 0.25 m grid
 * through its volume and over its faces — inside the art or within GAP of
 * its surface. A diver may bump just before contact, never swim through and
 * never meet an invisible wall. */
const GAP = 0.35;
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
/** Point to triangle distance (closest point by Voronoi region). */
function pointTriangle(p: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  const len = (q: Vec3): number => Math.sqrt(dot(q, q)), along = (o: Vec3, d: Vec3, t: number): Vec3 => ({ x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t });
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return len(ap);
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return len(bp);
  if (d1 * d4 - d3 * d2 <= 0 && d1 >= 0 && d3 <= 0) return len(sub(p, along(a, ab, d1 / (d1 - d3))));
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return len(cp);
  if (d5 * d2 - d1 * d6 <= 0 && d2 >= 0 && d6 <= 0) return len(sub(p, along(a, ac, d2 / (d2 - d6))));
  if (d3 * d6 - d5 * d4 <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return len(sub(p, along(b, sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6)))));
  const n = cross(ab, ac);
  return Math.abs(dot(n, ap)) / len(n);
}
type Tri = readonly [Vec3, Vec3, Vec3];
/** A set's drawn triangles and convex pieces, hashed in 1 m cells padded by
 * GAP, so a point query reads only its own cell. */
function artIndex(set: (typeof VISTA_SETS)[number]): { distance(p: Vec3): number } {
  const b = new RecipeBuilder();
  drawSolidSet(b, set, true);
  const P = b.positions, I = b.indices, at = (i: number): Vec3 => ({ x: P[i * 3]!, y: P[i * 3 + 1]!, z: P[i * 3 + 2]! });
  const tris = new Map<string, Tri[]>(), convex = new Map<string, { n: Vec3; p: Vec3 }[][]>();
  const cells = (lo: Vec3, hi: Vec3, f: (k: string) => void): void => {
    for (let x = Math.floor(lo.x - GAP); x <= Math.floor(hi.x + GAP); x++) for (let y = Math.floor(lo.y - GAP); y <= Math.floor(hi.y + GAP); y++)
      for (let z = Math.floor(lo.z - GAP); z <= Math.floor(hi.z + GAP); z++) f(`${x},${y},${z}`);
  };
  const bounds = (ps: readonly Vec3[]): [Vec3, Vec3] => [{ x: Math.min(...ps.map(q => q.x)), y: Math.min(...ps.map(q => q.y)), z: Math.min(...ps.map(q => q.z)) },
    { x: Math.max(...ps.map(q => q.x)), y: Math.max(...ps.map(q => q.y)), z: Math.max(...ps.map(q => q.z)) }];
  for (let t = 0; t < I.length; t += 3) {
    const tri: Tri = [at(I[t]!), at(I[t + 1]!), at(I[t + 2]!)];
    cells(...bounds(tri), k => { if (!tris.has(k)) tris.set(k, []); tris.get(k)!.push(tri); });
  }
  for (const k of set.blocks) {
    const planes = (["x", "y", "z"] as const).flatMap(a => [{ n: { x: 0, y: 0, z: 0, [a]: -1 }, p: k.min }, { n: { x: 0, y: 0, z: 0, [a]: 1 }, p: k.max }]);
    cells(k.min, k.max, c => { if (!convex.has(c)) convex.set(c, []); convex.get(c)!.push(planes); });
  }
  for (const piece of set.pieces) if (piece.closed) {
    const planes = piece.facets.map(f => ({ n: cross(sub(f.pts[1]!, f.pts[0]!), sub(f.pts[2]!, f.pts[0]!)), p: f.pts[0]! }));
    cells(...bounds(piece.facets.flatMap(f => f.pts)), c => { if (!convex.has(c)) convex.set(c, []); convex.get(c)!.push(planes); });
  }
  return { distance(p) {
    const key = `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
    if ((convex.get(key) ?? []).some(planes => planes.every(q => dot(q.n, sub(p, q.p)) <= 1e-3 * Math.sqrt(dot(q.n, q.n))))) return 0;
    let best = Infinity;
    for (const [a, b2, c] of tris.get(key) ?? []) { best = Math.min(best, pointTriangle(p, a, b2, c)); if (best <= GAP) break; }
    return best;
  } };
}

test("vista collision hugs its art: no art outside it, no part of it more than 0.35 m off the art", () => {
  const tol = 0.02;
  let boxes = 0, samples = 0;
  for (const set of VISTA_SETS) {
    const solids = VISTA_SOLIDS.filter(s => s.id.startsWith(`vista.${set.id}.`)).map(s => s.bounds);
    for (const fine of [true, false]) {
      const b = new RecipeBuilder();
      drawSolidSet(b, set, fine);
      assert.ok(solids.length > 0 && b.vertexCount > 0, set.id);
      const P = b.positions, I = b.indices, at = (i: number): Vec3 => ({ x: P[i * 3]!, y: P[i * 3 + 1]!, z: P[i * 3 + 2]! });
      for (let t = 0; t < I.length; t += 3) {
        const A = at(I[t]!), B = at(I[t + 1]!), Cc = at(I[t + 2]!);
        const n = Math.max(1, Math.ceil(Math.max(Math.sqrt(dot(sub(A, B), sub(A, B))), Math.sqrt(dot(sub(B, Cc), sub(B, Cc))), Math.sqrt(dot(sub(A, Cc), sub(A, Cc)))) / 0.25));
        for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
          const u = i / n, v = j / n, w = 1 - u - v;
          const x = A.x * w + B.x * u + Cc.x * v, y = A.y * w + B.y * u + Cc.y * v, z = A.z * w + B.z * u + Cc.z * v;
          assert.ok(solids.some(k => x >= k.min.x - tol && x <= k.max.x + tol && y >= k.min.y - tol && y <= k.max.y + tol && z >= k.min.z - tol && z <= k.max.z + tol),
            `${set.id} (${fine ? "fine" : "coarse"}) draws outside its collision at ${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`);
        }
      }
    }
    // Every box, through its volume and over its faces, edges and corners.
    const art = artIndex(set);
    for (const k of solids) {
      boxes++;
      const steps = (["x", "y", "z"] as const).map(a => Math.max(1, Math.ceil((k.max[a] - k.min[a]) / 0.25)));
      for (let i = 0; i <= steps[0]!; i++) for (let j = 0; j <= steps[1]!; j++) for (let l = 0; l <= steps[2]!; l++) {
        const p = { x: k.min.x + (k.max.x - k.min.x) * i / steps[0]!, y: k.min.y + (k.max.y - k.min.y) * j / steps[1]!, z: k.min.z + (k.max.z - k.min.z) * l / steps[2]! };
        samples++;
        const d = art.distance(p);
        assert.ok(d <= GAP + tol, `${set.id}: collision stands ${d === Infinity ? ">1" : d.toFixed(2)} m off the art at ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}`);
      }
    }
  }
  assert.ok(boxes === VISTA_SOLIDS.length && samples > boxes, `checked ${boxes} boxes, ${samples} samples`);
});

