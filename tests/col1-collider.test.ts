import assert from "node:assert/strict";
import test from "node:test";
import { boxOverlapsTriangle as lcOverlaps, buildCollider, sweepBoxTriangle as lcSweep } from "../src/world/caves/large/collision.js";
import {
  boxOverlapsTriangle, createHit, sweepBoxBox, sweepBoxTriangle,
} from "../src/world/collision/boxTriangle.js";
import { isLeaf, leafCount, leafFirst } from "../src/world/collision/bvh.js";
import { buildBoxes, createStaticCollider } from "../src/world/collision/collider.js";
import { meshShapes } from "../src/world/collision/bake.js";
import { buildShape, candidate, candidates, MAX_SHAPE_VERTICES } from "../src/world/collision/shape.js";
import { boxMesh, gridBoxMesh, random } from "./col1-support.js";

/** COL-1 stage A: the compact static collider's format and kernels. The
 * oracle against today's box world is `col1-oracle.heavy.test.ts`. */

const DIVER = { x: 0.34, y: 0.475, z: 0.34 };

test("format: Uint16 indices, 16-byte nodes, shared positions not owned, about half LC's bytes", () => {
  const m = gridBoxMesh({ x: 0, y: 0, z: 0 }, { x: 8, y: 4, z: 6 }, 24);
  const owned = buildShape("owned", m.positions, m.indices);
  const shared = buildShape("shared", m.positions, m.indices, { shared: true });
  assert.ok(owned.indices instanceof Uint16Array);
  assert.equal(owned.nodes.BYTES_PER_ELEMENT * 6 + owned.links.BYTES_PER_ELEMENT, 16);
  assert.equal(owned.bytes - shared.bytes, m.positions.byteLength);
  assert.equal(shared.sharedBytes, m.positions.byteLength);
  // LC's chunk collider over the same triangles.
  const lc = buildCollider("lc", 0, { positions: m.positions, indices: m.indices }, null);
  const perTri = (b: number): number => b / owned.triangles;
  assert.ok(owned.bytes <= lc.bytes * 0.6, `compact ${perTri(owned.bytes).toFixed(1)} B/tri vs LC ${perTri(lc.bytes).toFixed(1)} B/tri`);
  assert.ok(shared.bytes <= lc.bytes * 0.45, `shared ${perTri(shared.bytes).toFixed(1)} B/tri vs LC ${perTri(lc.bytes).toFixed(1)} B/tri`);
});

test("format: a shape refuses more than 65,536 vertices; meshShapes splits and views the art's buffer", () => {
  const big = gridBoxMesh({ x: 0, y: 0, z: 0 }, { x: 40, y: 10, z: 40 }, 106);
  assert.ok(big.positions.length / 3 > MAX_SHAPE_VERTICES);
  assert.throws(() => buildShape("big", big.positions, big.indices), /exceed 65536/);
  const parts = meshShapes("big", big, { interior: "solid", facing: 1, shared: true });
  assert.ok(parts.length >= 2);
  assert.equal(parts.reduce((n, s) => n + s.triangles, 0), big.indices.length / 3);
  assert.ok(parts.every(s => s.group === "big"));
  assert.ok(parts.some(s => s.shared && s.positions.buffer === big.positions.buffer), "no part viewed the art's buffer");
});

test("bvh: quantised node boxes contain every triangle beneath them", () => {
  const m = gridBoxMesh({ x: 711.3, y: -183.2, z: -1520.7 }, { x: 731.9, y: -170.1, z: -1500.2 }, 17);
  const s = buildShape("s", m.positions, m.indices);
  const deq = (id: number, k: number): [number, number] =>
    [s.origin[k]! + s.nodes[id * 6 + k]! * s.scale[k]!, s.origin[k]! + s.nodes[id * 6 + 3 + k]! * s.scale[k]!];
  const walk = (id: number, ancestors: number[]): void => {
    const l = s.links[id]!, chain = [...ancestors, id];
    if (!isLeaf(l)) { walk(id + 1, chain); walk(l, chain); return; }
    for (let t = leafFirst(l); t < leafFirst(l) + leafCount(l); t++) for (let q = 0; q < 3; q++) {
      const v = s.indices[t * 3 + q]! * 3;
      for (const n of chain) for (let k = 0; k < 3; k++) {
        const [lo, hi] = deq(n, k);
        assert.ok(s.positions[v + k]! >= lo && s.positions[v + k]! <= hi, `node ${n} axis ${k}: ${s.positions[v + k]} outside [${lo}, ${hi}]`);
      }
    }
  };
  walk(0, []);
});

test("bvh: candidates never miss a triangle whose bounds meet the query", () => {
  const m = gridBoxMesh({ x: -5, y: -3, z: -4 }, { x: 5, y: 3, z: 4 }, 14);
  const s = buildShape("s", m.positions, m.indices), rnd = random(7);
  for (let q = 0; q < 300; q++) {
    const c = { x: -7 + 14 * rnd(), y: -5 + 10 * rnd(), z: -6 + 12 * rnd() }, r = 0.05 + 2 * rnd();
    const n = candidates(s, c.x - r, c.y - r, c.z - r, c.x + r, c.y + r, c.z + r), got = new Set<number>();
    for (let i = 0; i < n; i++) got.add(candidate(i));
    for (let t = 0; t < s.triangles; t++) {
      const vs = [0, 1, 2].map(k => s.indices[t * 3 + k]! * 3);
      const lo = [0, 1, 2].map(k => Math.min(...vs.map(v => s.positions[v + k]!))), hi = [0, 1, 2].map(k => Math.max(...vs.map(v => s.positions[v + k]!)));
      const meets = lo[0]! <= c.x + r && hi[0]! >= c.x - r && lo[1]! <= c.y + r && hi[1]! >= c.y - r && lo[2]! <= c.z + r && hi[2]! >= c.z - r;
      if (meets) assert.ok(got.has(t), `query ${q} missed triangle ${t}`);
    }
  }
});

test("kernels: the sweep and overlap tests are LC's, bit for bit", () => {
  const rnd = random(11), tri = new Float64Array(9), a = createHit(), b = { t: 0, nx: 0, ny: 0, nz: 0, start: false };
  let hits = 0, starts = 0;
  for (let i = 0; i < 20000; i++) {
    for (let k = 0; k < 9; k++) tri[k] = -3 + 6 * rnd();
    const c = [-2 + 4 * rnd(), -2 + 4 * rnd(), -2 + 4 * rnd()], e = [0.1 + rnd(), 0.1 + rnd(), 0.1 + rnd()], d = [-4 + 8 * rnd(), -4 + 8 * rnd(), -4 + 8 * rnd()];
    if (i % 5 === 0) d[1] = 0;
    const skin = i % 3 === 0 ? 0 : 0.004;
    const mine = sweepBoxTriangle(c[0]!, c[1]!, c[2]!, e[0]!, e[1]!, e[2]!, d[0]!, d[1]!, d[2]!, tri, 0, 3, 6, skin, a);
    const theirs = lcSweep(c[0]!, c[1]!, c[2]!, e[0]!, e[1]!, e[2]!, d[0]!, d[1]!, d[2]!, tri, 0, skin, b);
    assert.equal(mine, theirs, `case ${i}`);
    if (mine) { assert.deepEqual(a, b, `case ${i}`); hits++; if (a.start) starts++; }
    assert.equal(boxOverlapsTriangle(c[0]!, c[1]!, c[2]!, e[0]!, e[1]!, e[2]!, tri, 0, 3, 6, 0.001), lcOverlaps(c[0]!, c[1]!, c[2]!, e[0]!, e[1]!, e[2]!, tri, 0, 0.001), `overlap ${i}`);
  }
  assert.ok(hits > 2000 && starts > 100, `coverage: ${hits} hits, ${starts} start contacts`);
});

test("sweeps: a box as triangles stops exactly where the box obstacle does, at any speed", () => {
  const lo = { x: 2, y: -1, z: -1.5 }, hi = { x: 3.5, y: 1.2, z: 2 }, m = boxMesh(lo, hi);
  const col = createStaticCollider("c", [buildShape("cube", m.positions, m.indices, { interior: "solid", facing: 1 })]);
  const rnd = random(3), hit = createHit(), ref = createHit();
  for (let i = 0; i < 400; i++) {
    const c = { x: -2 - 3 * rnd(), y: -2 + 4 * rnd(), z: -2 + 4 * rnd() }, speed = 2 + 60 * rnd();
    const target = { x: lo.x + (hi.x - lo.x) * rnd(), y: lo.y + (hi.y - lo.y) * rnd(), z: lo.z + (hi.z - lo.z) * rnd() };
    const l = Math.hypot(target.x - c.x, target.y - c.y, target.z - c.z), d = { x: (target.x - c.x) / l * speed, y: (target.y - c.y) / l * speed, z: (target.z - c.z) / l * speed };
    const a = col.sweep(c, DIVER, d, 0.004, hit);
    const b = sweepBoxBox(c.x, c.y, c.z, DIVER.x, DIVER.y, DIVER.z, d.x, d.y, d.z, lo.x, lo.y, lo.z, hi.x, hi.y, hi.z, 0.004, ref);
    assert.equal(a, b, `case ${i}`);
    if (a) assert.ok(Math.abs(hit.t - ref.t) * speed < 1e-6, `case ${i}: t ${hit.t} vs ${ref.t}`);
    // Never ends inside.
    const moved = col.move(c, DIVER, d);
    assert.ok(!col.overlaps(moved, DIVER), `case ${i}: move ended overlapping`);
  }
});

test("slides: a grazing move runs along a wall, and into a corner runs along the crease", () => {
  const wall = boxMesh({ x: 0, y: -10, z: -10 }, { x: 1, y: 10, z: 10 }), floor = boxMesh({ x: -10, y: -11, z: -10 }, { x: 1, y: -10, z: 10 });
  const col = createStaticCollider("c", [buildShape("wall", wall.positions, wall.indices, { interior: "solid", facing: 1 }),
    buildShape("floor", floor.positions, floor.indices, { interior: "solid", facing: 1 })]);
  const start = { x: -1, y: 0, z: 0 };
  const along = col.move(start, DIVER, { x: 2, y: 0, z: 6 });
  assert.ok(along.hit && along.x <= -DIVER.x + 1e-9 && along.x > -DIVER.x - 0.01 && Math.abs(along.z - 6) < 1e-6, JSON.stringify(along));
  // Down and into the wall: ends in the wall/floor crease, still sliding along Z.
  const crease = col.move({ x: -1, y: -9, z: 0 }, DIVER, { x: 3, y: -3, z: 4 });
  assert.ok(Math.abs(crease.x + DIVER.x) < 0.01 && Math.abs(crease.y - (-10 + DIVER.y)) < 0.01 && Math.abs(crease.z - 4) < 1e-6, JSON.stringify(crease));
});

test("support: solids rest on their up faces only; skin from either side", () => {
  const m = boxMesh({ x: 0, y: 0, z: 0 }, { x: 4, y: 2, z: 4 });
  const solid = createStaticCollider("s", [buildShape("cube", m.positions, m.indices, { interior: "solid", facing: 1 })]);
  assert.equal(solid.support(2, 2, 5), 2);
  // From inside the box the bottom face (facing down) is no floor.
  assert.equal(solid.support(2, 2, 1), -Infinity);
  const plate = new Float32Array([0, 1, 0, 4, 1, 0, 4, 1, 4, 0, 1, 4]);
  for (const idx of [[0, 1, 2, 0, 2, 3], [0, 2, 1, 0, 3, 2]]) {
    const skin = createStaticCollider("k", [buildShape("plate", plate, idx)]);
    assert.equal(skin.support(1, 1, 3), 1);
    assert.equal(skin.support(1, 1, 0.5), -Infinity);
  }
});

test("interiors: a box wholly inside a closed solid is blocked; overlapping parts are a union", () => {
  const a = boxMesh({ x: 0, y: 0, z: 0 }, { x: 6, y: 4, z: 6 }), b = boxMesh({ x: 3, y: 1, z: 3 }, { x: 9, y: 3, z: 9 });
  const pos = new Float32Array([...a.positions, ...b.positions]), idx = [...a.indices, ...Array.from(b.indices, i => i + a.positions.length / 3)];
  const parts = [...Array(a.indices.length / 3).fill(0), ...Array(b.indices.length / 3).fill(1)];
  const col = createStaticCollider("u", [buildShape("two", pos, idx, { interior: "solid", facing: 1, parts })]);
  // In the overlap of both parts (even crossings overall, odd in each part).
  for (const p of [{ x: 4.5, y: 2, z: 4.5 }, { x: 1.5, y: 2, z: 1.5 }, { x: 7.5, y: 2, z: 7.5 }]) {
    assert.ok(col.solidAt(p), `${JSON.stringify(p)} not inside`);
    assert.ok(col.overlaps(p, { x: 0.3, y: 0.3, z: 0.3 }), `${JSON.stringify(p)} clear`);
    assert.equal(col.segmentClear(p, { x: p.x + 0.1, y: p.y, z: p.z }), false);
  }
  assert.equal(col.solidAt({ x: 7.5, y: 2, z: 1.5 }), null);
  assert.equal(col.overlaps({ x: 7.5, y: 2, z: 1.5 }, { x: 0.3, y: 0.3, z: 0.3 }), false);
  // Without parts, parity would call the overlap water: the control.
  const merged = createStaticCollider("m", [buildShape("two", pos, idx, { interior: "solid", facing: 1 })]);
  assert.equal(merged.solidAt({ x: 4.5, y: 2, z: 4.5 }), null);
});

test("interiors: a closed mesh split for Uint16 indices keeps its parity across the group", () => {
  const big = gridBoxMesh({ x: 0, y: 0, z: 0 }, { x: 40, y: 10, z: 40 }, 106);
  const col = createStaticCollider("g", meshShapes("big", big, { interior: "solid", facing: 1, shared: true }));
  const rnd = random(5);
  for (let i = 0; i < 200; i++) {
    const p = { x: -2 + 44 * rnd(), y: -2 + 14 * rnd(), z: -2 + 44 * rnd() };
    const inside = p.x > 0 && p.x < 40 && p.y > 0 && p.y < 10 && p.z > 0 && p.z < 40;
    assert.equal(col.solidAt(p) !== null, inside, JSON.stringify(p));
  }
});

test("boxes: real boxes stay boxes, with box semantics", () => {
  const col = createStaticCollider("b", [buildBoxes("beams", [{ id: "beam.0", min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 8 } },
    { id: "beam.1", min: { x: 4, y: 0, z: 0 }, max: { x: 5, y: 1, z: 8 } }])]);
  assert.equal(col.support(0.5, 4, 3), 1);
  assert.ok(col.overlaps({ x: 0.5, y: 0.5, z: 4 }, DIVER));
  assert.equal(col.segmentClear({ x: -1, y: 0.5, z: 4 }, { x: 6, y: 0.5, z: 4 }), false);
  assert.equal(col.segmentClear({ x: -1, y: 0.5, z: 4 }, { x: 6, y: 0.5, z: 4 }, ["beam.0", "beam.1"]), true);
  const m = col.move({ x: 2.5, y: 0.5, z: 4 }, DIVER, { x: 3, y: 0, z: 0 });
  assert.ok(Math.abs(m.x - (4 - DIVER.x - 0.004)) < 1e-6, JSON.stringify(m));
});
