import assert from "node:assert/strict";
import test from "node:test";
import { WORLD_VERTICAL_BOUNDS } from "../src/content/routes.js";
import type { Capsule, Vec3 } from "../src/sim/types.js";
import { createWorldQueries, WORLD_BOUNDS } from "../src/sim/world.js";
import { createHit } from "../src/world/collision/boxTriangle.js";
import { createStaticCollider, depenetrate, type StaticCollider } from "../src/world/collision/collider.js";
import { createHeightfield, heightAt, sampleHeightfield } from "../src/world/collision/heightfield.js";
import { buildShape } from "../src/world/collision/shape.js";
import { composeStaticWorld } from "../src/world/collision/world.js";
import { gridBoxMesh, prismMesh, random, sphereMesh } from "./col1-support.js";

/** COL-1 stage A, Sol R2 (`docs/build/reviews/COL-1A-SOL-XHIGH-R2.md`):
 * recovery validates with oriented contacts (N1, N4), the heightfield's
 * later contacts are oriented too (N2), and the static world keeps the
 * exterior's whole bounds policy by default (N3). */

const DIVER = { x: 0.34, y: 0.475, z: 0.34 };
const DIVER_SHAPE: Capsule = { radius: 0.34, height: 0.95 };
const solid = (id: string, m: { positions: Float32Array; indices: Uint32Array }, parts?: number[]) =>
  buildShape(id, m.positions, m.indices, { interior: "solid", facing: 1, ...(parts ? { parts } : {}) });
const box = (lo: Vec3, hi: Vec3) => gridBoxMesh(lo, hi, 1);

// --- N1: no re-entry into a part already left -------------------------------------------

/** A: one closed U, extruded through Y [-5, 5]: west arm X [-5, 0], bridge X [0, 0.7]
 * at Z [-5, -4], east arm X [0.7, 1.1]; Z [-5, 4]. Only the union's faces. */
const U_POLY: readonly [number, number][] = [[-5, -5], [0, -5], [0.7, -5], [1.1, -5], [1.1, 4], [0.7, 4], [0.7, -4], [0, -4], [0, 4], [-5, 4]];
const U_TOPS = [0, 1, 7, 0, 7, 8, 0, 8, 9, 1, 2, 6, 1, 6, 7, 4, 5, 6, 4, 6, 2, 4, 2, 3];
const uMesh = () => prismMesh(U_POLY, U_TOPS, -5, 5);
const bMesh = () => box({ x: -5, y: -3, z: -3 }, { x: 1.1, y: 3, z: 2 });
const eastArm = createStaticCollider("east", [solid("east", box({ x: 0.7, y: -5, z: -5 }, { x: 1.1, y: 5, z: 4 }))]);
const C0 = { x: -0.6, y: 0, z: 0 };

/** The way from C0 to `p` never enters the east arm (an independent sweep against it alone). */
function avoidsEastArm(p: Vec3): boolean {
  const hit = createHit();
  if (eastArm.overlaps(p, DIVER)) return false;
  return !eastArm.sweep(C0, DIVER, { x: p.x - C0.x, y: p.y - C0.y, z: p.z - C0.z }, 0, hit);
}

for (const [label, make] of [
  ["separate members", (): StaticCollider => createStaticCollider("ub", [solid("u", uMesh()), solid("b", bMesh())])],
  ["two parts of one shape", (): StaticCollider => {
    const u = uMesh(), b = bMesh(), nu = u.positions.length / 3;
    const pos = new Float32Array([...u.positions, ...b.positions]), idx = new Uint32Array([...u.indices, ...Array.from(b.indices, i => i + nu)]);
    return createStaticCollider("ub1", [solid("uAndB", { positions: pos, indices: idx }, [...Array(u.indices.length / 3).fill(0), ...Array(b.indices.length / 3).fill(1)])]);
  }],
] as const) {
  test(`N1 ADVERSE (${label}): leaving the U's west arm and B never re-enters the U's east arm`, () => {
    const col = make();
    assert.equal(col.containing(C0).length, 2, "the centre starts in A and B");
    assert.ok(!eastArm.overlaps(C0, DIVER), "control: clear of the east arm at the start");
    const r = col.depenetrate(C0, DIVER, 3);
    if (r) {
      assert.ok(!col.overlaps(r, DIVER), JSON.stringify(r));
      assert.ok(avoidsEastArm(r), `escape ${JSON.stringify(r)} crosses the east arm`);
    }
    // R1's old answer, through the east arm, is not accepted.
    assert.ok(!r || Math.abs(r.x - 1.444) > 0.01, JSON.stringify(r));
  });
}

test("N1 controls: without B the diver stops in the U's gap; nested and touching convex boxes leave by one face", () => {
  const u = createStaticCollider("u", [solid("u", uMesh())]);
  const gap = u.depenetrate(C0, DIVER, 3)!;
  assert.ok(gap && Math.abs(gap.x - 0.344) < 1e-6 && Math.abs(gap.distance - 0.944) < 1e-6 && avoidsEastArm(gap), JSON.stringify(gap));
  // Nested: a box inside a bigger box; the way out is the outer box's nearest face.
  const nested = createStaticCollider("nested", [solid("outer", box({ x: -2, y: -2, z: -2 }, { x: 2, y: 2, z: 2 })), solid("inner", box({ x: -1, y: -1, z: -1 }, { x: 1, y: 1, z: 1 }))]);
  // (Legal within the world's 1 mm overlap tolerance, as every pose is.)
  const n = nested.depenetrate({ x: 0, y: 0, z: 1.5 }, DIVER, 3)!;
  assert.ok(n && n.x === 0 && n.y === 0 && n.z > 2 + 0.34 - 0.001 && n.distance <= 0.844 + 1e-9 && !nested.overlaps(n, DIVER), JSON.stringify(n));
  // Touching: two boxes sharing the face X = 0; the centre in the west one, beside it.
  const touching = createStaticCollider("touch", [solid("w", box({ x: -2, y: -2, z: -2 }, { x: 0, y: 2, z: 2 })), solid("e", box({ x: 0, y: -2, z: -2 }, { x: 2, y: 2, z: 2 }))]);
  const t = touching.depenetrate({ x: -0.3, y: 1.5, z: 0 }, DIVER, 3)!;
  assert.ok(t && Math.abs(t.y - (2 + 0.479)) < 1e-6 && !touching.overlaps(t, DIVER), JSON.stringify(t));
});

// --- N4: dense curved solids: one validation, not thousands -----------------------------

test("N4: recovery from a 25,280-triangle sphere validates in a handful of sweeps and takes a face exit", () => {
  const m = sphereMesh(2, 80, 160);
  assert.equal(m.indices.length / 3, 25280);
  const col = createStaticCollider("sphere", [solid("sphere", m)]), c = { x: 0.1, y: 0.2, z: 0.3 };
  assert.ok(col.solidAt(c));
  const trace = { tried: 0, sweeps: 0 };
  const r = depenetrate({ sweep: col.escapeSweep, blocked: (p, e) => col.overlaps(p, e), containing: col.containing, candidates: col.escapeCandidates,
    exitBound: col.exitBound, trace }, c, DIVER, 3)!;
  assert.ok(r && !col.overlaps(r, DIVER), JSON.stringify(r));
  // R1's validation took the 2.561 m ring exit after 5,991 rejected face exits.
  assert.ok(r.distance < 2.5, `distance ${r.distance}`);
  assert.ok(trace.sweeps <= 3 && trace.tried <= 50, JSON.stringify(trace));
  // The same through the collider's own entry point.
  const s = col.depenetrate(c, DIVER, 3)!;
  assert.ok(s && Math.abs(s.distance - r.distance) < 1e-12, JSON.stringify(s));
});

test("N4: a straddled curved surface lets the box leave along any face normal it overlaps", () => {
  const col = createStaticCollider("sphere", [solid("sphere", sphereMesh(2, 40, 80))]), hit = createHit(), rnd = random(51);
  for (let i = 0; i < 60; i++) {
    // On the surface: the box half inside, half out.
    const t = Math.acos(2 * rnd() - 1), p = 2 * Math.PI * rnd(), n = { x: Math.sin(t) * Math.cos(p), y: Math.cos(t), z: Math.sin(t) * Math.sin(p) };
    const c = { x: 2 * n.x, y: 2 * n.y, z: 2 * n.z };
    assert.ok(col.overlaps(c, DIVER));
    assert.equal(col.escapeSweep(c, DIVER, { x: n.x * 1.5, y: n.y * 1.5, z: n.z * 1.5 }, 0, hit), false, `outward from ${JSON.stringify(c)} meets ${JSON.stringify(hit)}`);
    assert.equal(col.escapeSweep(c, DIVER, { x: -n.x * 0.2, y: -n.y * 0.2, z: -n.z * 0.2 }, 0, hit), true, `inward from ${JSON.stringify(c)} is free`);
  }
});

// --- N2: the heightfield's later contacts are oriented -----------------------------------

test("N2 ADVERSE: a buried diver rising at a sloping corner is not pushed sideways by an edge contact", () => {
  const h = createHeightfield("slope", 0, 0, 0.5, 1, 1, new Float32Array([1, 2.262206554412842, 0.07073720544576645, 1.3329437971115112]));
  const col = createStaticCollider("slope", [h]), c = { x: 0.45, y: 0.2, z: 0.55 }, d = { x: 0, y: 3, z: 0 }, hit = createHit();
  assert.ok(col.overlaps(c, DIVER));
  assert.equal(col.sweep(c, DIVER, d, 0, hit), false, JSON.stringify(hit));
  assert.deepEqual(col.move(c, DIVER, d), { x: 0.45, y: 3.2, z: 0.55, hit: false });
  // Recovery: straight up, where R1 returned null.
  const f = (x: number, z: number): number => 1.5 * Math.sin(2 * x) + Math.cos(3 * z);
  const field = sampleHeightfield("field", { minX: 0, maxX: 4, minZ: 0, maxZ: 4 }, 0.5, f, { hole: (x, z) => Math.floor(2 * x) % 3 === 1 && Math.floor(2 * z) % 3 === 1 });
  const fc = createStaticCollider("field", [field]), start = { x: 0.4443732062354684, y: 0.18210308509878814, z: 0.5344570316374302 };
  const up = fc.depenetrate(start, DIVER, 4)!;
  assert.ok(up && !fc.overlaps(up, DIVER) && up.distance <= 2.79, JSON.stringify(up));
});

test("N2: straight-up escape is monotonic at sloping tops, walls and hole corners (Float32 samples)", () => {
  const f = (x: number, z: number): number => 1.5 * Math.sin(2 * x) + Math.cos(3 * z) + 0.4 * Math.sin(5 * x * z);
  const field = sampleHeightfield("wavy", { minX: 0, maxX: 6, minZ: 0, maxZ: 6 }, 0.5, f, { hole: (x, z) => (Math.floor(2 * x) + 2 * Math.floor(2 * z)) % 5 === 0 });
  const col = createStaticCollider("wavy", [field]), rnd = random(61);
  let buried = 0;
  for (let i = 0; i < 2000; i++) {
    const e = { x: 0.05 + 0.6 * rnd(), y: 0.05 + 0.6 * rnd(), z: 0.05 + 0.6 * rnd() }, c = { x: 0.5 + 5 * rnd(), y: -3 + 6 * rnd(), z: 0.5 + 5 * rnd() };
    if (col.overlaps(c, e)) buried++;
    const m = col.move(c, e, { x: 0, y: 8, z: 0 });
    assert.ok(!m.hit && m.x === c.x && m.z === c.z && m.y === c.y + 8, `rising from ${JSON.stringify(c)}, extents ${JSON.stringify(e)}: ${JSON.stringify(m)}`);
  }
  assert.ok(buried > 500, `only ${buried} buried starts`);
  // Entry stays blocked: down into the top and sideways into a wall, from clear starts.
  let blocked = 0, tried = 0;
  for (let i = 0; i < 2000; i++) {
    const c = { x: 0.5 + 5 * rnd(), y: -3 + 6 * rnd(), z: 0.5 + 5 * rnd() }, u = rnd() * 2 * Math.PI;
    if (col.overlaps(c, DIVER)) continue;
    tried++;
    const end = col.move(c, DIVER, { x: Math.cos(u) * 3, y: -3 * rnd(), z: Math.sin(u) * 3 });
    assert.ok(!col.overlaps(end, DIVER), `entered from ${JSON.stringify(c)}: ${JSON.stringify(end)}`);
    if (end.hit) blocked++;
  }
  assert.ok(tried > 300 && blocked > 100, `${blocked} of ${tried} moves met the field`);
});

test("NaN-corner cells are empty throughout: height, support and sight agree with overlap", () => {
  const field = sampleHeightfield("nan", { minX: 0, maxX: 4, minZ: 0, maxZ: 4 }, 0.5, (x, z) => (x === 2 && z === 2 ? NaN : 0.2 * x + 0.3 * z));
  const col = createStaticCollider("nan", [field]), p = { x: 2.1, y: 0, z: 1.6 }, tiny = { x: 0.01, y: 0.01, z: 0.01 };
  assert.equal(col.overlaps(p, tiny), false);
  assert.ok(Number.isNaN(heightAt(field, p.x, p.z)));
  assert.equal(col.support(p.x, p.z, 1), -Infinity);
  assert.equal(col.segmentClear(p, { ...p, y: 0.01 }), true);
});

// --- N3: the exterior's whole bounds policy by default ----------------------------------

test("N3: R5's original reproduction, as written (no bounds), keeps the exterior's Y policy in both modes", () => {
  const exterior = createWorldQueries([], () => -1000);
  const art = createStaticCollider("art", [solid("art", box({ x: 10, y: -10, z: 0 }, { x: 12, y: -8, z: 2 }))]);
  const world = composeStaticWorld({ exterior, solids: [], collider: art });
  const pose = { x: 0, y: -5, z: 1 }, d = { x: 0, y: -2000, z: 0 };
  const same = (a: ReturnType<typeof exterior.moveCapsule>, b: typeof a, what: string): void => {
    assert.ok(a.hitSolid === b.hitSolid && a.hitBoundary === b.hitBoundary &&
      Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y, a.position.z - b.position.z) < 1e-9, `${what}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  };
  const got = world.moveCapsule(pose, d, DIVER_SHAPE);
  assert.equal(world.counters.staticSweeps, 1, "the conservative envelope took the static path");
  same(got, exterior.moveCapsule(pose, d, DIVER_SHAPE), "ordinary");
  assert.ok(Math.abs(got.position.y - WORLD_VERTICAL_BOUNDS.minY) < 1e-9 && got.hitBoundary, JSON.stringify(got));
  same(world.moveCapsule(pose, d, DIVER_SHAPE, { separateBoxOverlaps: true }), exterior.moveCapsule(pose, d, DIVER_SHAPE, { separateBoxOverlaps: true }), "separated");
  assert.equal(world.counters.staticSweeps, 2);
});

test("N3 ADVERSE: an incomplete or inverted bounds policy is refused at construction", () => {
  const exterior = createWorldQueries([], () => -1000), collider = createStaticCollider("art", [solid("art", box({ x: 10, y: -10, z: 0 }, { x: 12, y: -8, z: 2 }))]);
  // X/Z only (`WORLD_BOUNDS`), as R1's adapter accepted.
  assert.throws(() => composeStaticWorld({ exterior, solids: [], collider, bounds: WORLD_BOUNDS as never }), /finite minY <= maxY/);
  assert.throws(() => composeStaticWorld({ exterior, solids: [], collider, bounds: { ...WORLD_BOUNDS, minY: 10, maxY: -10 } }), /minY <= maxY/);
  assert.throws(() => composeStaticWorld({ exterior, solids: [], collider, bounds: { ...WORLD_BOUNDS, minY: -800, maxY: Infinity } }), /finite/);
});
