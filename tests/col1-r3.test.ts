import assert from "node:assert/strict";
import test from "node:test";
import { prism, v } from "../src/content/vistaKit.js";
import type { Vec3 } from "../src/sim/types.js";
import { certifyOrientation, orientationProblems, solidPiecesShape } from "../src/world/collision/bake.js";
import { createHit } from "../src/world/collision/boxTriangle.js";
import { buildBoxes, createStaticCollider, depenetrate, type StaticMember } from "../src/world/collision/collider.js";
import { buildShape, TRAVERSAL } from "../src/world/collision/shape.js";
import { gridBoxMesh } from "./col1-support.js";

/** COL-1 stage A, Sol R3 (`docs/build/reviews/COL-1A-SOL-XHIGH-R3.md`):
 * recovery's one-sided rule only for closed solids (R3-1), one traversal
 * per shape however many parts hold the centre (R3-2), and the two P3s
 * (a coherent-winding precondition, a finite budget). */

const DIVER = { x: 0.34, y: 0.475, z: 0.34 };
const C0 = { x: -0.6, y: 0, z: 0 };
const solidBox = (id: string, lo: Vec3, hi: Vec3) => { const m = gridBoxMesh(lo, hi, 1); return buildShape(id, m.positions, m.indices, { interior: "solid", facing: 1 }); };
const PLATE = new Float32Array([-0.2, -3, -3, -0.2, 3, -3, -0.2, 3, 3, -0.2, -3, 3]);

// --- R3-1: open skin stays a barrier in recovery, whatever its facing -------------------

for (const [label, indices] of [["normals +X", [0, 1, 2, 0, 2, 3]], ["normals -X", [0, 2, 1, 0, 3, 2]]] as const) {
  test(`R3-1 ADVERSE (${label}): a diver inside rock never escapes through a separate open plate with facing`, () => {
    const rock = solidBox("rock", { x: -2, y: -2, z: -2 }, { x: 0, y: 2, z: 2 }), hit = createHit();
    for (const facing of [1, -1, 0] as const) {
      const plate = buildShape(`plate.${facing}`, PLATE, indices, { interior: "none", facing });
      const col = createStaticCollider("r3", [rock, plate]);
      assert.ok(col.overlaps(C0, DIVER) && !createStaticCollider("p", [plate]).overlaps(C0, DIVER), "starts in the rock, 6 cm clear of the plate");
      // The way east meets the plate in the escape sweep, as in an ordinary sweep.
      assert.ok(col.sweep(C0, DIVER, { x: 0.944, y: 0, z: 0 }, 0, hit) && col.escapeSweep(C0, DIVER, { x: 0.944, y: 0, z: 0 }, 0, hit), `facing ${facing}`);
      assert.equal(col.depenetrate(C0, DIVER, 1), null, `facing ${facing}: within 1 m every way out crosses the plate or stays in the rock`);
    }
  });
}

test("R3-1 control: a closed solid wall keeps the one-sided rule, so the diver leaves the rock through its own faces", () => {
  const rock = solidBox("rock", { x: -2, y: -2, z: -2 }, { x: 0, y: 2, z: 2 });
  const free = createStaticCollider("free", [rock]).depenetrate(C0, DIVER, 1)!;
  assert.ok(free && Math.abs(free.x - 0.344) < 1e-6, JSON.stringify(free));
  // Leaving the rock through its own east face meets no contact in the escape sweep, but does in the ordinary one.
  const col = createStaticCollider("r", [rock]), hit = createHit();
  assert.equal(col.escapeSweep(C0, DIVER, { x: 0.944, y: 0, z: 0 }, 0, hit), false);
});

// --- R3-2: many containing parts in one shape: one traversal per shape -------------------

/** n nested closed boxes, radius 1 + k / n, as parts of one shape (or as n members). */
function nested(n: number, oneShape: boolean): StaticMember[] {
  const meshes = Array.from({ length: n }, (_, k) => { const r = 1 + k / n; return gridBoxMesh({ x: -r, y: -r, z: -r }, { x: r, y: r, z: r }, 1); });
  if (!oneShape) return meshes.map((m, k) => buildShape(`box.${k}`, m.positions, m.indices, { interior: "solid", facing: 1 }));
  const pos: number[] = [], idx: number[] = [], parts: number[] = [];
  meshes.forEach((m, k) => { const base = pos.length / 3; pos.push(...m.positions); for (const i of m.indices) idx.push(i + base); for (let t = 0; t < m.indices.length / 3; t++) parts.push(k); });
  return [buildShape("nested", new Float32Array(pos), idx, { interior: "solid", facing: 1, parts })];
}

test("R3-2: recovery from 1,000 nested parts of one shape walks each triangle a bounded number of times, as separate members do", () => {
  const n = 1000, c = { x: 0.1, y: 0.2, z: 0.3 }, triangles = 12 * n;
  const results: { r: unknown; work: number; tried: number; sweeps: number }[] = [];
  for (const oneShape of [true, false]) {
    const col = createStaticCollider(oneShape ? "one" : "many", nested(n, oneShape));
    assert.equal(col.containing(c).length, n, "every part holds the centre");
    const trace = { tried: 0, sweeps: 0 };
    TRAVERSAL.triangles = 0;
    const r = depenetrate({ sweep: col.escapeSweep, blocked: (p, e) => col.overlaps(p, e), containing: col.containing, candidates: col.escapeCandidates,
      exitBound: col.exitBound, trace }, c, DIVER, 3);
    results.push({ r, work: TRAVERSAL.triangles, tried: trace.tried, sweeps: trace.sweeps });
    assert.ok(r && !col.overlaps(r, DIVER), JSON.stringify(r));
  }
  const [one, many] = results as [typeof results[0], typeof results[0]];
  assert.deepEqual(one.r, many.r, "the same escape either way");
  assert.equal(one.tried, many.tried);
  // R3's candidate visited about n x triangles (12 million here). Now candidates and the bound
  // are one pass each; the rest is each tried candidate's parity ray through the stacked parts.
  assert.ok(one.work < 40 * triangles, `one shape: ${one.work} triangle visits for ${triangles} triangles`);
  // And it scales linearly: half the parts, about half the work.
  const half = createStaticCollider("half", nested(n / 2, true));
  TRAVERSAL.triangles = 0;
  half.depenetrate(c, DIVER, 3);
  assert.ok(one.work < 2.5 * TRAVERSAL.triangles, `${n} parts: ${one.work}; ${n / 2} parts: ${TRAVERSAL.triangles}`);
});

// --- P3: coherent winding, finite budget ------------------------------------------------

test("P3: a mesh with flipped triangles is refused by orientation certification and the solid-piece baker, naming it", () => {
  // A closed box with shared corners: 8 vertices, 12 outward triangles (the west face, X = -0.2, is triangles 0 and 1).
  const positions = new Float32Array([-0.2, -3, -3, -0.1, -3, -3, -0.1, 3, -3, -0.2, 3, -3, -0.2, -3, 3, -0.1, -3, 3, -0.1, 3, 3, -0.2, 3, 3]);
  const m = { positions, indices: new Uint32Array([0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 3, 2, 0, 2, 1, 4, 5, 6, 4, 6, 7]) };
  assert.deepEqual(orientationProblems("wall", m, true), []);
  // Flip the two west-face triangles (R3's ten-out, two-in vote).
  const bad = new Uint32Array(m.indices);
  for (const t of [0, 1]) { const q = bad[t * 3 + 1]!; bad[t * 3 + 1] = bad[t * 3 + 2]!; bad[t * 3 + 2] = q; }
  const flipped = { positions: m.positions, indices: bad };
  assert.ok(orientationProblems("wall", flipped, true).some(p => /flipped/.test(p)));
  const orientation = { facing: 1, source: "test: wound outward" } as const;
  assert.throws(() => certifyOrientation("wall", { ...flipped, orientation }, true), /wall: winding is not coherent/);
  assert.deepEqual(Array.from(certifyOrientation("wall", { ...m, orientation }, true)), [1]);
  // A closed prism bakes; one with a facet removed (open) is refused.
  const p = prism(v(0, 0, 0), v(4, 0, 0), 0.4, 0.4, 0.1, () => "rust");
  assert.ok(solidPiecesShape("bar", [p]));
  assert.throws(() => solidPiecesShape("bar.open", [{ ...p, facets: p.facets.slice(1) }]), /bar\.open: a closed piece is not closed/);
});

test("P3: recovery refuses a non-finite budget or centre instead of building an endless ring", () => {
  const col = createStaticCollider("b", [buildBoxes("b", [{ id: "b", min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } }])]);
  assert.throws(() => col.depenetrate({ x: 0, y: 0, z: 0 }, DIVER, Infinity), /finite and nonnegative/);
  assert.throws(() => col.depenetrate({ x: 0, y: 0, z: 0 }, DIVER, -1), /finite and nonnegative/);
  assert.throws(() => col.depenetrate({ x: NaN, y: 0, z: 0 }, DIVER, 1), /centre must be finite/);
  assert.ok(col.depenetrate({ x: 0, y: 0, z: 0 }, DIVER, 2));
});
