import assert from "node:assert/strict";
import test from "node:test";
import type { Vec3 } from "../src/sim/types.js";
import { certifyOrientation, collarHeightfield, meshComponents, orientedShapes, type OrientedMesh } from "../src/world/collision/bake.js";
import { buildBoxes, createStaticCollider } from "../src/world/collision/collider.js";
import { cellCorners, heightAt, sampleHeightfield, type StaticHeightfield } from "../src/world/collision/heightfield.js";
import { gridBoxMesh, probeComponents, random } from "./col1-support.js";

/** COL-1 stage A, Sol R5 (`docs/build/reviews/COL-1A-SOL-XHIGH-R5.md`):
 * orientation by provenance, certified per connected component (R5-1, P3-A),
 * and a validated collar resolution (P3-C). The every-registry art sweep is
 * `col1-art.heavy.test.ts`. */

/** A closed box with welded corners: an n x n grid per face, outward or reversed. */
function weldedBox(lo: Vec3, hi: Vec3, n: number, reversed: boolean): { positions: number[]; indices: number[] } {
  const m = gridBoxMesh(lo, hi, n), key = new Map<string, number>(), positions: number[] = [], remap: number[] = [];
  for (let v = 0; v < m.positions.length / 3; v++) {
    const k = `${m.positions[v * 3]},${m.positions[v * 3 + 1]},${m.positions[v * 3 + 2]}`;
    let i = key.get(k);
    if (i === undefined) { i = positions.length / 3; key.set(k, i); positions.push(m.positions[v * 3]!, m.positions[v * 3 + 1]!, m.positions[v * 3 + 2]!); }
    remap.push(i);
  }
  const indices: number[] = [];
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = remap[m.indices[t]!]!, b = remap[m.indices[t + 1]!]!, c = remap[m.indices[t + 2]!]!;
    indices.push(...(reversed ? [a, c, b] : [a, b, c]));
  }
  return { positions, indices };
}
/** Two disjoint closed boxes in one mesh: A outward, B reversed (R5's P3-A fixture). */
function twoBoxes(bHi: Vec3, bLo: Vec3, nB: number): { mesh: { positions: Float32Array; indices: Uint32Array }; trianglesA: number } {
  const a = weldedBox({ x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 }, 1, false), b = weldedBox(bLo, bHi, nB, true), base = a.positions.length / 3;
  return { mesh: { positions: new Float32Array([...a.positions, ...b.positions]), indices: new Uint32Array([...a.indices, ...b.indices.map(i => i + base)]) }, trianglesA: a.indices.length / 3 };
}

test("P3-A: two disjoint components, one reversed: each is certified by its own provenance; a single claimed facing cannot reach the other", () => {
  const { mesh, trianglesA } = twoBoxes({ x: 12, y: 2, z: 2 }, { x: 10, y: 0, z: 0 }, 16);
  const { of, count } = meshComponents(mesh), n = mesh.indices.length / 3;
  assert.equal(count, 2);
  // Per-triangle provenance (as an assembler of two producers records it): A outward, B inward.
  const facing = new Int8Array(n).fill(1);
  for (let t = trianglesA; t < n; t++) facing[t] = -1;
  const oriented: OrientedMesh = { ...mesh, orientation: { facing, source: "test: A outward, B reversed" } };
  assert.deepEqual(Array.from(certifyOrientation("two", oriented, true)), [1, -1]);
  const col = createStaticCollider("two", orientedShapes("two", oriented, { interior: "solid", shared: false, closed: true }));
  assert.equal(col.support(11, 1, 3), 2, "B's top supports from above");
  assert.equal(col.support(1, 1, 3), 2, "A's top supports from above");
  const out = col.depenetrate({ x: 11.9, y: 1, z: 1 }, { x: 0.05, y: 0.05, z: 0.05 }, 0.3)!;
  assert.ok(out && Math.abs(out.x - 12.054) < 1e-6 && Math.abs(out.distance - 0.154) < 1e-6, JSON.stringify(out));
  // Provenance that differs inside one coherent component is a conflict; a triangle with none is refused.
  const conflict = new Int8Array(facing); conflict[trianglesA + 5] = 1;
  assert.throws(() => certifyOrientation("two", { ...mesh, orientation: { facing: conflict, source: "test" } }, true), /component 1 has conflicting provenance/);
  const missing = new Int8Array(facing); missing[3] = 0;
  assert.throws(() => certifyOrientation("two", { ...mesh, orientation: { facing: missing, source: "test" } }, true), /triangle 3 has no provenance/);
  // The test-only cross-check flags a component whose claimed facing is wrong, at every scale.
  const inside = (p: Vec3): boolean => (p.x > 0 && p.x < 2 || p.x > 10 && p.x < 12) && p.y > 0 && p.y < 2 && p.z > 0 && p.z < 2;
  const rows = probeComponents(mesh, of, new Int8Array([1, 1]), inside);
  assert.ok(rows[0]!.contrary === 0 && rows[0]!.agree > 0 && rows[1]!.contrary > 0 && rows[1]!.agree === 0, JSON.stringify(rows.map(r => ({ ...r, examples: [] }))));
});

test("P3-A: a small reversed cube beside an outward box keeps its own orientation (probes would jump it)", () => {
  const { mesh, trianglesA } = twoBoxes({ x: 10.02, y: 0.02, z: 0.02 }, { x: 10, y: 0, z: 0 }, 16), n = mesh.indices.length / 3;
  const facing = new Int8Array(n).fill(1);
  for (let t = trianglesA; t < n; t++) facing[t] = -1;
  const col = createStaticCollider("small", orientedShapes("small", { ...mesh, orientation: { facing, source: "test" } }, { interior: "solid", shared: false, closed: true }));
  const top = col.support(10.01, 0.01, 1);
  assert.ok(Math.abs(top - 0.02) < 1e-7, `the 2 cm cube top supports from above: ${top}`);
  assert.ok(col.solidAt({ x: 10.01, y: 0.01, z: 0.01 }));
});

test("P3-C: the collar bake picks the first validated cell; a floor no cell bounds is refused with every residual", () => {
  // A ridge between the 0.5 m cell's construction points (1.125, 1.25) but on its measurement (1.15625) and on a
  // 0.25 m cell's construction point (1.1875): 0.5 m refused, 0.25 m bakes it flat.
  const ridge = (x: number): number => (x > 1.15 && x < 1.2 ? 0.1 : 0);
  const h = collarHeightfield("ridge", { minX: 1, maxX: 2, minZ: 1, maxZ: 2 }, 1, ridge, []);
  assert.ok(h.cell === 0.25 && h.flatCells > 0 && h.residual <= 0.01, `${h.cell}, ${h.flatCells}, ${h.residual}`);
  for (let i = 0; i <= 8 * h.nx; i++) { const x = h.x0 + i * h.cell / 8; assert.ok(heightAt(h, x, 1.5) >= ridge(x) - 1e-6 || Number.isNaN(heightAt(h, x, 1.5)), `x ${x}`); }
  // Narrower still: between both cells' construction points, on both measurements (1/32 and 1/64 m): refused, naming both residuals.
  const sliver = (x: number): number => (x > 1.135 && x < 1.18 ? 0.1 : 0);
  assert.throws(() => collarHeightfield("sliver", { minX: 1, maxX: 2, minZ: 1, maxZ: 2 }, 1, sliver, []), /collar sliver: .*every cell tried \(0\.5 m: [\d.]+ mm, 0\.25 m: [\d.]+ mm\)/);
  // A cliff, by contrast, is bounded: its cells bake flat at the column top.
  const cliff = collarHeightfield("cliff", { minX: 1, maxX: 2, minZ: 1, maxZ: 2 }, 1, x => (x < 1.37 ? 0 : 0.5), []);
  assert.ok(cliff.cell === 0.5 && cliff.flatCells > 0 && cliff.residual === 0, `${cliff.cell}, ${cliff.flatCells}, ${cliff.residual}`);
});

// --- Per-cell heightfield: creases and cliffs bake as the old column tops, with step walls ---

/** Terraced seabed with 0.6 m and 1.4 m cliffs, gently sloped between. */
const terraces = (x: number, z: number): number => -20 + 0.05 * x + 0.03 * z + (x > 13.3 ? 0.6 : 0) + (z > 17.1 ? 1.4 : 0);
const columnTop = (x: number, z: number, cell: number, floor: (x: number, z: number) => number): number => {
  let top = -Infinity;
  for (let i = 0; i <= 2; i++) for (let k = 0; k <= 2; k++) top = Math.max(top, floor(x + i * cell / 2, z + k * cell / 2));
  return top + 0.02;
};

test("per-cell heightfield: no cell stands above its old column top, every cell is on the floor at its nine points, creases go flat", () => {
  const h = sampleHeightfield("terraces", { minX: 10, maxX: 20, minZ: 10, maxZ: 20 }, 0.5, terraces, { conservative: true, measure: true });
  assert.ok(h.flatCells > 0 && h.lift <= 0.02 + 1e-6, `flat ${h.flatCells}, lift ${h.lift}`);
  for (let k = 0; k < h.nz; k++) for (let i = 0; i < h.nx; i++) {
    const x = h.x0 + i * h.cell, z = h.z0 + k * h.cell, top = columnTop(x, z, h.cell, terraces);
    assert.ok(Math.max(...cellCorners(h, i, k)) <= top + 1e-5, `cell ${i}, ${k} stands above its column top ${top}`);
    for (const [u, w] of [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [0.5, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]] as const) {
      const px = x + u * h.cell, pz = z + w * h.cell, fx = Math.min(px, x + h.cell - 1e-9), fz = Math.min(pz, z + h.cell - 1e-9);
      assert.ok(cellHeightOf(h, i, k, fx, fz) >= terraces(px, pz) - 1e-5, `cell ${i}, ${k} below the floor at (${px}, ${pz})`);
    }
  }
});

/** The surface of cell (i, k) at a point inside it, from its corners (independent of `heightAt`). */
function cellHeightOf(h: StaticHeightfield, i: number, k: number, x: number, z: number): number {
  const [a, b, c, d] = cellCorners(h, i, k), u = (x - h.x0) / h.cell - i, w = (z - h.z0) / h.cell - k;
  return u >= w ? a + (b - a) * u + (d - b) * w : a + (d - c) * u + (c - a) * w;
}
/** Independent occupancy: under its own cell's surface. */
function underSurface(h: StaticHeightfield, p: Vec3): boolean {
  const i = Math.floor((p.x - h.x0) / h.cell), k = Math.floor((p.z - h.z0) / h.cell);
  if (i < 0 || k < 0 || i >= h.nx || k >= h.nz) return false;
  return p.y < cellHeightOf(h, i, k, p.x, p.z);
}

test("step walls: sweeps stop at a cliff's wall from below its top and pass above it; sight agrees with an independent dense walk", () => {
  const h = sampleHeightfield("terraces", { minX: 10, maxX: 20, minZ: 10, maxZ: 20 }, 0.5, terraces, { conservative: true, measure: true });
  const col = createStaticCollider("terraces", [h]), e = { x: 0.1, y: 0.1, z: 0.1 };
  // Along X across the 0.6 m cliff at x = 13.3, at z = 12 (no Z cliff): below the upper terrace's top, stopped; above it, free.
  const upper = Math.max(...cellCorners(h, Math.floor((13.6 - h.x0) / h.cell), Math.floor((12 - h.z0) / h.cell)));
  const low = { x: 11, y: upper - 0.3, z: 12 };
  assert.equal(col.overlaps(low, e), false);
  const m = col.move(low, e, { x: 5, y: 0, z: 0 });
  assert.ok(m.hit && m.x < 13.3 + 1e-9 && m.x > 12.5 && !col.overlaps(m, e), JSON.stringify(m));
  assert.equal(col.move({ ...low, y: upper + 0.2 }, e, { x: 5, y: 0, z: 0 }).hit, false);
  // Sight: random segments, compared where the dense walk is unambiguous (no sample within 2 mm of a surface).
  const rnd = random(71);
  let compared = 0, blocked = 0;
  for (let i = 0; i < 1500; i++) {
    const a = { x: 10 + 10 * rnd(), y: -20 + 3 * rnd(), z: 10 + 10 * rnd() }, b = { x: 10 + 10 * rnd(), y: -20 + 3 * rnd(), z: 10 + 10 * rnd() };
    let inside = false, grazing = false;
    for (let s = 0; s <= 4000 && !inside; s++) {
      const p = { x: a.x + (b.x - a.x) * s / 4000, y: a.y + (b.y - a.y) * s / 4000, z: a.z + (b.z - a.z) * s / 4000 };
      const ci = Math.floor((p.x - h.x0) / h.cell), ck = Math.floor((p.z - h.z0) / h.cell);
      if (ci < 0 || ck < 0 || ci >= h.nx || ck >= h.nz) continue;
      if (Math.abs(p.y - cellHeightOf(h, ci, ck, p.x, p.z)) < 0.002) grazing = true;
      if (underSurface(h, p)) inside = true;
    }
    if (grazing && !inside) continue;
    compared++;
    if (inside) blocked++;
    assert.equal(col.segmentClear(a, b), !inside, `segment ${i}: ${JSON.stringify([a, b])}`);
  }
  assert.ok(compared > 600 && blocked > 100 && blocked < compared - 100, `${blocked} of ${compared}`);
});

test("collar on a cliff: the per-cell heightfield never blocks a pose the old 0.5 m columns allow", () => {
  const footprint = { minX: 14, maxX: 16, minZ: 13, maxZ: 15 }, band = 4;
  const field = collarHeightfield("cliff", footprint, band, terraces, [footprint], [0.5]);
  const cols: { min: Vec3; max: Vec3 }[] = [];
  for (let x = footprint.minX - band; x < footprint.maxX + band - 1e-9; x += 0.5) for (let z = footprint.minZ - band; z < footprint.maxZ + band - 1e-9; z += 0.5) {
    if (x + 0.25 >= footprint.minX && x + 0.25 < footprint.maxX && z + 0.25 >= footprint.minZ && z + 0.25 < footprint.maxZ) continue;
    cols.push({ min: { x, y: -60, z }, max: { x: x + 0.5, y: columnTop(x, z, 0.5, terraces), z: z + 0.5 } });
  }
  const columns = createStaticCollider("columns", [buildBoxes("cols", cols.map((c, i) => ({ id: `c${i}`, ...c })))]), hf = createStaticCollider("hf", [field]);
  const rnd = random(73), e = { x: 0.34, y: 0.475, z: 0.34 };
  let clear = 0;
  for (let i = 0; i < 4000; i++) {
    const x = footprint.minX - band + (footprint.maxX - footprint.minX + 2 * band) * rnd(), z = footprint.minZ - band + (footprint.maxZ - footprint.minZ + 2 * band) * rnd();
    const c = { x, y: terraces(x, z) + e.y - 0.4 + 1.6 * rnd(), z };
    if (columns.overlaps(c, e)) continue;
    clear++;
    assert.equal(hf.overlaps(c, e), false, `clear of the columns, blocked by the heightfield at ${JSON.stringify(c)}`);
  }
  assert.ok(clear > 1000, `${clear} clear poses`);
});
