import assert from "node:assert/strict";
import test from "node:test";
import { caveDef } from "../src/content/regions/caves.js";
import { buildCave, caveShell, clipMeshToRect } from "../src/content/regions/caveGeometry.js";
import { DEEP_CAVES } from "../src/content/regions/caves/deep.js";
import { capProblems, capTriangles, type PlanePoint } from "../src/content/regions/seamCap.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import type { Vec3 } from "../src/sim/types.js";
import { createHit } from "../src/world/collision/boxTriangle.js";
import { kitShellShapes } from "../src/world/collision/caveShapes.js";
import { createStaticCollider } from "../src/world/collision/collider.js";
import { lineCrossings, seamAudit, wallContradictions } from "./col1-support.js";

/** COL-1 stage A, Sol R7 (`docs/build/reviews/COL-1A-SOL-XHIGH-R7.md`, on
 * `review/col-1a-r7`): R6's skirts extruded each open edge to the floor on
 * its own, so where the cut doubled back in its side plane their curtains
 * overlapped with opposite normals. The seam is now built from its boundary
 * (`seamCap.ts`) and checked against it in the build. The sweep over all 110
 * shells is `col1-art.heavy.test.ts`. */

const step = caveDef("hub_step_arch", worldFloor), glimmer = caveDef("hub_glimmer_crack", worldFloor);
const culvert = buildCave(DEEP_CAVES.find(c => c.source.id === "meridian_culvert_north")!.source, worldFloor);
const mesh = (def: typeof step, lod: "fine" | "coarse" = "fine") => { const s = caveShell(def, lod); return { positions: s.positions, indices: Uint32Array.from(s.indices) }; };
const SIZES = [1e-7, 1e-5, 1e-4];

test("R7-1 Step exit: a box leaving the shell's solid across its footprint side isn't stopped there", () => {
  const col = createStaticCollider("step", kitShellShapes(step));
  const p = { x: 100, y: -98.47240956624347, z: -384.12711588541663 }, a = { ...p, x: 99.999 }, b = { ...p, x: 100.001 };
  assert.equal(!!col.solidAt(a), true);
  assert.equal(!!col.solidAt(b), false);
  for (const size of SIZES) {
    const hit = createHit();
    assert.equal(col.escapeSweep(a, { x: size, y: size, z: size }, { x: 0.002, y: 0, z: 0 }, 0, hit), false, `half-extent ${size}: ${JSON.stringify(hit)}`);
  }
});

test("R7-1 Glimmer wall: water on both sides of the side plane, so no face there, and a box crosses it both ways", () => {
  const col = createStaticCollider("glimmer", kitShellShapes(glimmer)), p = { x: 173.38644409179688, y: -110.57162475585938, z: -486 };
  assert.deepEqual(lineCrossings(mesh(glimmer), 2, p.y, p.x).filter(h => Math.abs(h.s - p.z) < 1e-4), []);
  for (const size of SIZES) for (const sign of [-1, 1]) {
    const a = { ...p, z: p.z + 0.001 * sign }, hit = createHit();
    assert.equal(!!col.solidAt(a), false);
    assert.equal(col.escapeSweep(a, { x: size, y: size, z: size }, { x: 0, y: 0, z: -0.002 * sign }, 0, hit), false, `half-extent ${size}, ${sign}: ${JSON.stringify(hit)}`);
  }
});

test("R7: the seam faces of the reviewer's caves are embedded (independent audit) and every wall agrees with occupancy along X and Z", () => {
  for (const def of [step, glimmer, culvert]) {
    const f = def.replacementFootprints[0]!, fine = mesh(def), col = createStaticCollider(def.id, kitShellShapes(def));
    const solid = (p: Vec3): boolean => !!col.solidAt(p);
    assert.deepEqual(seamAudit(fine, f), [], `${def.id} fine`);
    assert.deepEqual(seamAudit(mesh(def, "coarse"), f), [], `${def.id} coarse`);
    assert.deepEqual(wallContradictions(fine, solid, 0, f, 400), [], `${def.id} x`);
    assert.deepEqual(wallContradictions(fine, solid, 2, f, 400), [], `${def.id} z`);
  }
});

test("R7: every coarse open edge lies in a footprint side plane (the coarse lattice runs past every face)", () => {
  for (const def of [step, glimmer, culvert]) {
    const f = def.replacementFootprints[0]!, m = mesh(def, "coarse"), P = m.positions, I = m.indices, nv = P.length / 3, uses = new Map<number, number>();
    for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) {
      const a = I[t + k]!, b = I[t + (k + 1) % 3]!, e = Math.min(a, b) * nv + Math.max(a, b);
      uses.set(e, (uses.get(e) ?? 0) + 1);
    }
    const inPlane = (a: number, b: number): boolean => ([[0, f.minX], [0, f.maxX], [2, f.minZ], [2, f.maxZ]] as const).some(([ax, at]) => P[a * 3 + ax] === at && P[b * 3 + ax] === at);
    const off = [...uses].filter(([e, n]) => n === 1 && !inPlane(Math.floor(e / nv), e % nv));
    assert.equal(off.length, 0, `${def.id}: ${off.length} open edges off the side planes`);
  }
});

test("R7: the clip keeps an endpoint lying on the plane as itself (no duplicate vertex, no null triangle)", () => {
  // One triangle with a vertex exactly on x = 0, the rest inside, and one with it on the plane and the rest outside.
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, -1, 1, 0, -1, 0, 0.5]);
  const m = clipMeshToRect({ name: "t", positions, normals: new Float32Array(18), colors: new Float32Array(24), indices: new Uint32Array([0, 1, 2, 3, 4, 5]) },
    { minX: 0, maxX: 2, minZ: -1, maxZ: 1 })!;
  assert.equal(m.indices.length, 3, "the outside triangle, touching the plane at a point, leaves nothing");
  assert.equal(m.positions.length / 3, 3, "no cut point duplicates the vertex on the plane");
});

// --- The construction itself (synthetic, exact answers) ----------------------------

/** Strips from a polyline (u, y) to the floor y = 0, summed as boundaries the
 * way the shell's seam is: floor vertices at every cut vertex's u. */
function strips(chain: readonly [number, number][]): { edges: number[]; at: (v: number) => PlanePoint } {
  const pts: PlanePoint[] = [], add = (u: number, y: number): number => {
    const had = pts.findIndex(p => p.u === u && p.y === y);
    return had >= 0 ? had : (pts.push({ u, y }), pts.length - 1);
  };
  const ids = chain.map(([u, y]) => add(u, y)), floor = new Map<number, number>();
  const us = [...new Set(chain.map(([u]) => u))].sort((a, b) => a - b);
  for (const u of us) floor.set(u, add(u, 0));
  const edges: number[] = [];
  for (let i = 0; i + 1 < ids.length; i++) {
    const a = ids[i]!, b = ids[i + 1]!, ua = pts[a]!.u, ub = pts[b]!.u, ia = us.indexOf(ua), ib = us.indexOf(ub);
    edges.push(b, a, a, floor.get(ua)!);
    for (let k = ia; k !== ib; k += ib > ia ? 1 : -1) edges.push(floor.get(us[k]!)!, floor.get(us[k + (ib > ia ? 1 : -1)]!)!);
    edges.push(floor.get(ub)!, b);
  }
  return { edges, at: v => pts[v]! };
}
const signedArea = (tris: readonly number[], at: (v: number) => PlanePoint): number => {
  let s = 0;
  for (let t = 0; t < tris.length; t += 3) { const a = at(tris[t]!), b = at(tris[t + 1]!), c = at(tris[t + 2]!); s += ((b.u - a.u) * (c.y - a.y) - (b.y - a.y) * (c.u - a.u)) / 2; }
  return s;
};

test("R7 construction: a strip, a hairpin (the doubled-back cut of R7-1) and a closed loop each give exactly their region, once", () => {
  const one = strips([[0, 1], [2, 1]]);
  assert.equal(signedArea(capTriangles(one.edges, one.at, "strip"), one.at), 2);
  // Forward at y 2 over u 0..4, back at y 1 over u 4..1: the overlap of the two arms' strips cancels.
  const hair = strips([[0, 2], [2, 2], [4, 2], [4, 1], [2.5, 1], [1, 1]]), tris = capTriangles(hair.edges, hair.at, "hairpin");
  assert.equal(signedArea(tris, hair.at), 5);
  assert.deepEqual(capProblems(hair.edges, tris, hair.at), []);
  // A passage cross-section below the floor: its interior, wound inward.
  const loop = strips([[0, -3], [2, -3], [2, -1], [0, -1], [0, -3]]);
  assert.equal(signedArea(capTriangles(loop.edges, loop.at, "loop"), loop.at), -4);
});

test("R7 construction: regions touching at a vertex are cut into simple loops; a crossing or a double cover is refused", () => {
  const pts: PlanePoint[] = [{ u: 0, y: 0 }, { u: 1, y: 0 }, { u: 1, y: 1 }, { u: 0, y: 1 }, { u: 2, y: 1 }, { u: 2, y: 2 }, { u: 1, y: 2 }], at = (v: number) => pts[v]!;
  // Two unit squares meeting at (1, 1): one walk passes that vertex twice.
  const pinch = [0, 1, 1, 2, 2, 4, 4, 5, 5, 6, 6, 2, 2, 3, 3, 0];
  assert.equal(signedArea(capTriangles(pinch, at, "pinch"), at), 2);
  // A bow-tie boundary crosses itself.
  assert.throws(() => capTriangles([0, 2, 2, 1, 1, 3, 3, 0], at, "bow-tie"), /crosses itself/);
  // The same square twice over.
  assert.throws(() => capTriangles([0, 1, 1, 2, 2, 3, 3, 0, 0, 1, 1, 2, 2, 3, 3, 0], at, "twice"), /covers/);
});

test("R7 construction: the validator catches overlapping faces and a face wound against its region", () => {
  const pts: PlanePoint[] = [{ u: 0, y: 0 }, { u: 2, y: 0 }, { u: 2, y: 2 }, { u: 0, y: 2 }], at = (v: number) => pts[v]!;
  const square = [0, 1, 1, 2, 2, 3, 3, 0];
  assert.deepEqual(capProblems(square, [0, 1, 2, 0, 2, 3], at), []);
  assert.match(capProblems(square, [0, 1, 2, 0, 2, 3, 0, 1, 3], at).join(" "), /overlap/);
  assert.match(capProblems(square, [0, 2, 1, 0, 2, 3], at).join(" "), /wound/);
});
