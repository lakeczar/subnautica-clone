import test from "node:test";
import assert from "node:assert/strict";
import { BERTH_ENVELOPES, HULL_COLLIDERS } from "../src/content/registry.js";
import { createWorldQueries, hullClearance, moveHull, RIB_SEGMENTS, SOLIDS, sweptHullClearance } from "../src/sim/world.js";
import { actorBox, RIB_CONTACT_TOLERANCE, RIB_SWEEP_ITERATIONS, ribUpperHeight,
  segmentBoxClosest, sweepBoxRib } from "../src/sim/ribCollision.js";
import type { Capsule, Vec3 } from "../src/sim/types.js";

const swimmer = { radius: 0.34, height: 0.95 };
const point = { radius: 0, height: 0 };
const ribSolids = SOLIDS.filter(s => s.id.startsWith("reef.rib."));
const empty = createWorldQueries([], () => -200);
const ribs = createWorldQueries(ribSolids, () => -200);
const first = RIB_SEGMENTS[0]!;
const one = createWorldQueries([ribSolids[0]!], () => -200);
const plus = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const near = (actual: number, expected: number, tolerance = 2e-6): void => {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
};
function gap(p: Vec3, shape: Capsule): number {
  return Math.min(...RIB_SEGMENTS.map(r => segmentBoxClosest(r.a, r.b, actorBox(p, shape)).distance - r.radius));
}

test("recorded A and B rise through the empty part of the rib registration boxes", () => {
  const world = createWorldQueries();
  for (const position of [
    { x: -26.37, y: -9.620000000000001, z: -8.91 },
    { x: -13.3, y: -1.6600000000000001, z: -5.84 },
    { x: -26.40, y: -9.62, z: -8.91 },
  ]) {
    assert.ok(world.clearance(position, swimmer));
    const result = world.moveCapsule(position, { x: 0, y: 0.3, z: 0 }, swimmer);
    assert.equal(result.hitSolid, false, JSON.stringify(position));
    assert.ok(Math.abs(result.position.y - position.y - 0.3) < 1e-12);
  }
});

test("rib-only local queries retain the same correction for detached canonical records", () => {
  const ribs = SOLIDS.filter(s => s.id.startsWith("reef.rib."));
  const world = createWorldQueries(structuredClone(ribs), () => -200);
  const position = { x: -13.3, y: -1.66, z: -5.84 };
  assert.equal(world.moveCapsule(position, { x: 0, y: 0.3, z: 0 }, swimmer).hitSolid, false);
});

test("the recorded neighbourhoods permit upward and diagonal tangential escape", () => {
  for (const centre of [{ x: -26.37, y: -9.62, z: -8.91 }, { x: -13.3, y: -1.66, z: -5.84 }])
    for (const dx of [-0.05, 0, 0.05]) for (const dy of [-0.05, 0, 0.05]) for (const dz of [-0.05, 0, 0.05]) {
      const p = plus(centre, { x: dx, y: dy, z: dz });
      for (const delta of [{ x: 0, y: 0.3, z: 0 }, { x: 0.2, y: 0.5, z: 0.1 }]) {
        assert.ok(gap(p, swimmer) > 0.15);
        const result = createWorldQueries().moveCapsule(p, delta, swimmer);
        assert.equal(result.hitSolid, false, JSON.stringify({ p, delta }));
        assert.deepEqual(result.position, plus(p, delta));
      }
    }
});

test("segment/box distance minimizes the whole axis, including parallel, degenerate and interior cases", () => {
  const box = { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } };
  const cases: [Vec3, Vec3, number][] = [
    [{ x: -4, y: 2, z: 0 }, { x: 4, y: 2, z: 0 }, 1],
    [{ x: -3, y: 3, z: 3 }, { x: 3, y: -3, z: 3 }, 2],
    [{ x: 3, y: 3, z: 3 }, { x: 4, y: 4, z: 4 }, Math.sqrt(12)],
    [{ x: 2, y: 2, z: 2 }, { x: 2, y: 2, z: 2 }, Math.sqrt(3)],
    [{ x: -4, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, 0],
  ];
  for (const [a, b, expected] of cases) {
    near(segmentBoxClosest(a, b, box).distance, expected, 1e-12);
    near(segmentBoxClosest(b, a, box).distance, expected, 1e-12);
  }
  // Independent point/segment projection on a non-cardinal axis, not endpoint sampling.
  const a = { x: -3, y: 2, z: 4 }, b = { x: 4, y: -2, z: 1 }, q = { x: 0.1, y: 0.2, z: 0.3 };
  const u = { x: 7, y: -4, z: -3 };
  const t = ((q.x - a.x) * u.x + (q.y - a.y) * u.y + (q.z - a.z) * u.z) / 74;
  const expected = Math.hypot(a.x + t * u.x - q.x, a.y + t * u.y - q.y, a.z + t * u.z - q.z);
  near(segmentBoxClosest(a, b, { min: q, max: q }).distance, expected, 1e-12);
});

test("analytic distance agrees with independent convex minimization for skew segments and boxes", () => {
  let seed = 0x51b7;
  const random = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let i = 0; i < 250; i++) {
    const vector = (): Vec3 => ({ x: random() * 16 - 8, y: random() * 16 - 8, z: random() * 16 - 8 });
    const a = vector(), b = vector(), min = vector(), box = { min, max: plus(min, { x: random() * 4, y: random() * 4, z: random() * 4 }) };
    const squared = (t: number): number => (["x", "y", "z"] as const).reduce((sum, axis) => {
      const v = a[axis] + (b[axis] - a[axis]) * t;
      return sum + Math.max(box.min[axis] - v, 0, v - box.max[axis]) ** 2;
    }, 0);
    let lo = 0, hi = 1;
    for (let j = 0; j < 100; j++) {
      const left = (2 * lo + hi) / 3, right = (lo + 2 * hi) / 3;
      if (squared(left) < squared(right)) hi = right; else lo = left;
    }
    near(segmentBoxClosest(a, b, box).distance, Math.sqrt(Math.min(squared(0), squared(1), squared((lo + hi) / 2))), 1e-10);
  }
});

test("continuous advancement finds the first endcap hit despite clear endpoints at high speed", () => {
  const sphere = { a: { x: 0, y: 0, z: 0 }, b: { x: 0, y: 0, z: 0 }, radius: 1 };
  const p = { x: -10, y: 0.5, z: 0 }, delta = { x: 20, y: 0, z: 0 };
  const hit = sweepBoxRib(actorBox(p, point), delta, sphere)!;
  assert.ok(hit && !hit.stop);
  near(hit.t, (10 - Math.sqrt(0.75)) / 20, 1e-7);
  near(hit.normal.x, -Math.sqrt(0.75)); near(hit.normal.y, 0.5);
  assert.ok(hit.iterations <= RIB_SWEEP_ITERATIONS);
  const fast = sweepBoxRib(actorBox({ ...p, x: -1e6 }, point), { x: 2e6, y: 0, z: 0 }, sphere)!;
  near(fast.t, (1e6 - Math.sqrt(0.75)) / 2e6, 1e-12);
  assert.equal(sweepBoxRib(actorBox({ x: -10, y: 1.001, z: 0 }, point), delta, sphere), null);
  const vertical = { a: { x: 0, y: -2, z: 0 }, b: { x: 0, y: 2, z: 0 }, radius: 1 };
  const parallel = sweepBoxRib(actorBox({ x: 0.5, y: -10, z: 0 }, point), { x: 0, y: 20, z: 0 }, vertical)!;
  near(parallel.t, (8 - Math.sqrt(0.75)) / 20, 1e-7);
});

test("each non-cardinal canonical rib and its junction stop a swept crossing", () => {
  for (const [i, r] of RIB_SEGMENTS.entries()) for (const t of [0, 0.5, 1]) {
    const centre = { x: r.a.x + (r.b.x - r.a.x) * t, y: r.a.y + (r.b.y - r.a.y) * t, z: r.a.z + (r.b.z - r.a.z) * t };
    const from = { ...centre, z: centre.z - 12 }, to = { ...centre, z: centre.z + 12 };
    const local = createWorldQueries([ribSolids[i]!], () => -200);
    assert.ok(local.clearance(from, swimmer) && local.clearance(to, swimmer));
    const result = local.moveCapsule(from, { x: 0, y: 0, z: 24 }, swimmer);
    assert.equal(result.hitSolid, true, `${i}/${t}`);
    assert.ok(result.position.z < centre.z);
    assert.ok(local.clearance(result.position, swimmer));
    assert.equal(sweptHullClearance(local, [from, to], swimmer), false);
  }
  const p = first.b;
  const result = ribs.moveCapsule({ ...p, z: p.z - 8 }, { x: 0, y: 0, z: 16 }, swimmer);
  assert.ok(result.hitSolid && ribs.clearance(result.position, swimmer));
});

test("all-axis geometric sliding preserves the tangent instead of zeroing normal-bearing axes", () => {
  const shape = { radius: 0.1, height: 0.2, bottom: -0.1 };
  const from = plus(first.a, { x: 2, y: -0.8, z: -0.6 }), delta = { x: -3, y: 0.4, z: 0.2 };
  const hit = sweepBoxRib(actorBox(from, shape), delta, first)!;
  assert.ok(Math.abs(hit.normal.x) > 0.1 && Math.abs(hit.normal.y) > 0.1 && Math.abs(hit.normal.z) > 0.1);
  const remaining = { x: delta.x * (1 - hit.t), y: delta.y * (1 - hit.t), z: delta.z * (1 - hit.t) };
  const inward = remaining.x * hit.normal.x + remaining.y * hit.normal.y + remaining.z * hit.normal.z;
  const tangent = { x: remaining.x - inward * hit.normal.x, y: remaining.y - inward * hit.normal.y, z: remaining.z - inward * hit.normal.z };
  const contact = plus(from, { x: delta.x * hit.t, y: delta.y * hit.t, z: delta.z * hit.t });
  const expected = plus(contact, tangent), moved = one.moveCapsule(from, delta, shape);
  assert.ok(moved.hitSolid && one.clearance(moved.position, shape));
  for (const axis of ["x", "y", "z"] as const) near(moved.position[axis], expected[axis], 1e-10);
  assert.ok(Math.hypot(tangent.x, tangent.y, tangent.z) > 0.5);
  // An unrelated wall placed across that new tangent must still be swept.
  const wallZ = contact.z + tangent.z / 2;
  const wall = { id: "slide.wall", min: { x: -20, y: -20, z: wallZ - 0.01 }, max: { x: 10, y: 10, z: wallZ + 0.01 } };
  const blocked = createWorldQueries([ribSolids[0]!, wall], () => -200).moveCapsule(from, delta, shape);
  assert.ok(blocked.hitSolid);
  assert.ok(blocked.position.z > wallZ, "the slide cannot cross the second solid");
});

test("wide shallow piloting hulls and every rectangular berth retain X/Z/bottom/top extents", () => {
  const shapes: Record<string, Capsule> = { ...HULL_COLLIDERS, ...Object.fromEntries(Object.entries(BERTH_ENVELOPES).map(([k, v]) => [`berth.${k}`, v])) };
  for (const [label, shape] of Object.entries(shapes)) {
    const rx = shape.halfWidth ?? shape.radius, rz = shape.halfLength ?? shape.radius, bottom = shape.bottom ?? 0;
    const cases: [Vec3, Vec3, "x" | "y" | "z", number][] = [
      [{ x: first.a.x + first.radius + rx + 0.02, y: first.a.y - (bottom + shape.height) / 2, z: first.a.z }, { x: -1, y: 0, z: 0 }, "x", first.a.x + first.radius + rx],
      [{ x: first.b.x, y: first.b.y - (bottom + shape.height) / 2, z: first.b.z + first.radius + rz + 0.02 }, { x: 0, y: 0, z: -1 }, "z", first.b.z + first.radius + rz],
      [{ x: first.a.x, y: first.a.y - first.radius - shape.height - 0.02, z: first.a.z }, { x: 0, y: 1, z: 0 }, "y", first.a.y - first.radius - shape.height],
      [{ x: first.b.x, y: first.b.y + first.radius - bottom + 0.02, z: first.b.z }, { x: 0, y: -1, z: 0 }, "y", first.b.y + first.radius - bottom],
    ];
    for (const [from, delta, axis, expected] of cases) {
      assert.ok(one.clearance(from, shape), label);
      const result = one.moveCapsule(from, delta, shape);
      assert.ok(result.hitSolid, `${label}/${axis}`);
      near(result.position[axis], expected);
      assert.ok(one.clearance(result.position, shape));
      const penetrating = { ...result.position, [axis]: result.position[axis] + delta[axis] * 0.01 };
      assert.equal(one.clearance(penetrating, shape), false, `${label}/${axis} footprint`);
    }
  }
});

test("contact tolerance permits exact tangency, blocks inward motion, and never teleports overlap diagnostics", () => {
  const p = { ...first.a, x: first.a.x + first.radius };
  assert.equal(one.clearance(p, point), true);
  assert.deepEqual(one.moveCapsule(p, { x: 0.3, y: 0, z: 0 }, point).position, plus(p, { x: 0.3, y: 0, z: 0 }));
  const into = one.moveCapsule(p, { x: -0.3, y: 0, z: 0 }, point);
  assert.ok(into.hitSolid); near(into.position.x, p.x, 1e-12);
  const tangent = one.moveCapsule(p, { x: 0, y: -0.3, z: 0 }, point);
  assert.equal(tangent.hitSolid, false); near(tangent.position.y, p.y - 0.3, 1e-12);
  assert.equal(one.clearance({ ...p, x: p.x - RIB_CONTACT_TOLERANCE / 2 }, point), true);
  for (const overlap of [{ ...p, x: p.x - 2 * RIB_CONTACT_TOLERANCE }, first.a]) {
    assert.equal(one.clearance(overlap, point), false);
    const result = one.moveCapsule(overlap, { x: 2, y: 3, z: 4 }, point);
    assert.equal(result.hitSolid, true); assert.deepEqual(result.position, overlap);
  }
});

test("previously safe registration-face tolerance poses stay exactly in place and can leave", () => {
  for (const shape of [point, swimmer, HULL_COLLIDERS.dart, HULL_COLLIDERS.hearthline]) {
    const p = { ...first.a, x: first.a.x + first.radius + shape.radius - 0.0005 };
    // This is within the old clearance's 1mm face tolerance, not a newly safe migration.
    assert.ok(one.clearance(p, shape));
    assert.deepEqual(one.moveCapsule(p, { x: 0, y: 0, z: 0 }, shape).position, p);
    const leaving = one.moveCapsule(p, { x: 0.1, y: 0, z: 0 }, shape);
    assert.equal(leaving.hitSolid, false); assert.deepEqual(leaving.position, plus(p, { x: 0.1, y: 0, z: 0 }));
  }
});

test("local roster, complete canonical bounds, LOS ignores and supplied floor remain authoritative", () => {
  const r = RIB_SEGMENTS[6]!, p = { ...r.a }, to = { ...p, z: p.z + 3 };
  assert.equal(empty.lineOfSight(p, to), true);
  assert.equal(one.lineOfSight(p, to), true, "filtered roster acquires no segment6");
  assert.equal(ribs.lineOfSight(p, to), false);
  assert.equal(createWorldQueries([structuredClone(ribSolids[6]!)], () => -200).lineOfSight(p, to), false);
  assert.equal(createWorldQueries([ribSolids[6]!], () => -200).lineOfSight(p, to, ["reef.rib.6"]), true);
  assert.ok(empty.clearance(p, swimmer));
  assert.deepEqual(empty.moveCapsule(p, { x: 1, y: 2, z: 3 }, swimmer).position, plus(p, { x: 1, y: 2, z: 3 }));
  assert.equal(empty.supportHeight(p.x, p.z, 100), -200);
  const canonical = ribSolids[0]!;
  const corner = { x: canonical.max.x - 0.01, y: canonical.min.y + 0.01, z: canonical.max.z - 0.01 };
  assert.ok(one.clearance(corner, point));
  for (const end of ["min", "max"] as const) for (const axis of ["x", "y", "z"] as const) {
    const impostor = structuredClone(canonical); impostor[end][axis] += end === "min" ? -0.01 : 0.01;
    const local = createWorldQueries([impostor], () => -200);
    assert.equal(local.clearance(corner, point), false, `${end}.${axis} must match`);
    assert.equal(local.lineOfSight(corner, corner), false);
    assert.equal(local.supportHeight(corner.x, corner.z, 100), impostor.max.y);
  }
  const floor = (x: number, z: number): number => x * 0.01 + z * 0.02 - 10;
  const supplied = createWorldQueries([], floor);
  assert.strictEqual(supplied.groundHeight, floor);
  assert.equal(supplied.supportHeight(2, 3, 100), floor(2, 3));
  assert.equal(supplied.clearance({ x: 2, y: floor(2, 3) - 0.03, z: 3 }, swimmer), false);
  assert.equal(supplied.lineOfSight({ x: 2, y: -20, z: 3 }, { x: 2, y: -19, z: 3 }), false);
});

test("support follows capsule upper intersections and fromY, with no flat registration roof", () => {
  const vertical = { a: { x: 0, y: -2, z: 0 }, b: { x: 0, y: 2, z: 0 }, radius: 1 };
  near(ribUpperHeight(0.6, 0, vertical)!, 2.8, 1e-12);
  near(ribUpperHeight(0.6, 0, { ...vertical, b: vertical.a })!, -1.2, 1e-12);
  assert.equal(ribUpperHeight(2, 0, vertical), null);
  const horizontal = { a: { x: -2, y: 3, z: 0 }, b: { x: 2, y: 3, z: 0 }, radius: 1 };
  near(ribUpperHeight(2.6, 0, horizontal)!, 3.8, 1e-12);
  for (const [i, r] of RIB_SEGMENTS.entries()) for (const t of [0, 0.3, 1]) {
    const x = r.a.x + (r.b.x - r.a.x) * t, z = r.a.z + (r.b.z - r.a.z) * t;
    const y = ribUpperHeight(x, z, r)!;
    const local = createWorldQueries([ribSolids[i]!], () => -200);
    near(local.supportHeight(x, z, y - 0.249), y, 1e-12);
    assert.equal(local.supportHeight(x, z, y - 0.251), -200);
    near(segmentBoxClosest(r.a, r.b, actorBox({ x, y, z }, point)).distance, r.radius, 1e-10);
    assert.ok(segmentBoxClosest(r.a, r.b, actorBox({ x, y: y + 0.001, z }, point)).distance > r.radius);
  }
  const s = ribSolids[0]!, x = s.max.x - 0.01, z = s.max.z - 0.01;
  assert.equal(one.supportHeight(x, z, 100), -200, "outside curved projection but inside registration rectangle");
});

test("repeated finite slides, zero travel and support queries remain clear and bounded", () => {
  let p = plus(first.a, { x: 2, y: -0.8, z: -0.6 });
  const shape = { radius: 0.1, height: 0.2, bottom: -0.1 };
  for (let i = 0; i < 500; i++) {
    const delta = { x: -0.03, y: Math.sin(i * 0.1) * 0.02, z: Math.cos(i * 0.11) * 0.02 };
    p = ribs.moveCapsule(p, delta, shape).position;
    assert.ok(Object.values(p).every(Number.isFinite));
    assert.ok(ribs.clearance(p, shape), `${i}: ${gap(p, shape)}`);
    assert.ok(Number.isFinite(ribs.supportHeight(p.x, p.z, p.y)));
    assert.deepEqual(ribs.moveCapsule(p, { x: 0, y: 0, z: 0 }, shape).position, p);
  }
  const bad = one.moveCapsule(p, { x: NaN, y: 0, z: 0 }, shape);
  assert.ok(bad.hitSolid); assert.deepEqual(bad.position, p);
  assert.equal(one.clearance({ ...p, x: NaN }, shape), false);
  assert.throws(() => one.moveCapsule({ ...p, x: NaN }, { x: 0, y: 0, z: 0 }, shape), RangeError);
});

test("bounded termination fails closed for unrepresentable distance and crowded junction slides", () => {
  const sphere = { a: { x: 0, y: 0, z: 0 }, b: { x: 0, y: 0, z: 0 }, radius: 1 };
  const from = { x: -10, y: 0.5, z: 0 }, delta = { x: 20, y: 0, z: 0 };
  const exhausted = sweepBoxRib(actorBox(from, point), delta, sphere, 1)!;
  assert.ok(exhausted.stop && exhausted.iterations === 1 && exhausted.t > 0 && exhausted.t < 1);
  assert.ok(Math.hypot(from.x + delta.x * exhausted.t, 0.5) >= sphere.radius, "budget exhaustion retains the proved separating side");
  const overflow = sweepBoxRib(actorBox({ x: 1e200, y: 0, z: 0 }, point), { x: -1e200, y: 0, z: 0 }, sphere)!;
  assert.ok(overflow.stop && overflow.t === 0 && overflow.iterations <= RIB_SWEEP_ITERATIONS);
  // Repeated normals from adjoining curved segments may consume the slide budget;
  // no discarded remainder can be interpreted as clear travel or enter a corner.
  let seed = 73, checked = 0;
  const random = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let i = 0; i < 600; i++) {
    const p = { x: -32 + random() * 28, y: -13 + random() * 17, z: -17 + random() * 14 };
    if (!ribs.clearance(p, swimmer)) continue;
    const result = ribs.moveCapsule(p, { x: random() * 24 - 12, y: random() * 24 - 12, z: random() * 24 - 12 }, swimmer);
    assert.ok(Object.values(result.position).every(Number.isFinite));
    assert.ok(ribs.clearance(result.position, swimmer), JSON.stringify({ p, result }));
    checked++;
  }
  assert.ok(checked > 300);
});

test("unrelated walls, actual terrain, hull floor and boundary behavior still block", () => {
  const wall = { id: "real.wall", min: { x: 5, y: -20, z: -20 }, max: { x: 6, y: 20, z: 20 } };
  const world = createWorldQueries([wall], () => -10);
  const from = { x: 0, y: -5, z: 0 }, delta = { x: 20, y: 2, z: 0 };
  const result = world.moveCapsule(from, delta, swimmer);
  assert.ok(result.hitSolid && result.position.x < 5 - swimmer.radius);
  near(result.position.y, -3, 1e-12);
  assert.equal(hullClearance(world, { ...from, y: -11 }, swimmer), false);
  const terrain = createWorldQueries([], x => x > 2 ? -1 : -20);
  const moved = moveHull(terrain, { x: -4, y: -8, z: 0 }, { x: 10, y: 0, z: 0 }, HULL_COLLIDERS.dart);
  assert.ok(moved.hitSolid && moved.position.x < -1.59);
  assert.ok(empty.moveCapsule(from, { x: 1000, y: 0, z: 0 }, swimmer).hitBoundary);
});
