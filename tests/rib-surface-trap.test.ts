import { withComposedFields } from "./persistence-support.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { HULL_COLLIDERS } from "../src/content/registry.js";
import { decodeSave, encodeSave } from "../src/save/codec.js";
import { stepGame } from "../src/sim/step.js";
import { exit, exitRefusal } from "../src/sim/vehicles.js";
import { RIB_CONTACT_TOLERANCE } from "../src/sim/ribCollision.js";
import { createWorldQueries, hullClearance, RIB_SEGMENTS, SOLIDS } from "../src/sim/world.js";
import type { Capsule, GameCommand, GameState, Vec3 } from "../src/sim/types.js";
import { directions, distance, gaps, input, noDeepening, pilot, swim, swimmer, world } from "./rib-support.js";

// The real trapped export, converted once to the current schema. The original is
// archived; save-bridge.test.ts checks the conversion kept its pose and ownership.
function trappedExport() {
  const text = readFileSync("tests/fixtures/reef-rib-trap.json", "utf8");
  const decoded = decodeSave(text); assert.ok(decoded.ok); return { text, envelope: decoded.value };
}

test("actual trapped export loads without relocation, escapes, roundtrips and moves again without grants", () => {
  const { text, envelope } = trappedExport();
  assert.deepEqual(envelope, withComposedFields(JSON.parse(text)), "loading adds only C1's additive fields");
  const encoded = encodeSave(envelope); assert.ok(encoded.ok);
  const decoded = decodeSave(encoded.value); assert.ok(decoded.ok); assert.deepEqual(decoded.value, envelope);
  const original = structuredClone(envelope.state);
  const still = stepGame(original, [input()], world).state;
  assert.deepEqual(still.player.pose, original.player.pose, "no always-on depenetration");
  let s = structuredClone(original); s.player.pose.yaw = 0; s.player.pose.pitch = 0;
  for (let i = 0; i < 60; i++) s = stepGame(s, [input(0, -1)], world).state;
  assert.ok(distance(original.player.pose.position, s.player.pose.position) > 0.1);
  assert.ok(world.clearance(s.player.pose.position, swimmer));
  for (const key of ["inventory", "knowledge", "fleet", "recovery", "migration"] as const)
    assert.deepEqual(s[key], original[key], key);
  assert.deepEqual(s.world.resources, original.world.resources); assert.deepEqual(s.world.facilities, original.world.facilities);
  assert.equal(s.migration, null);
  const saved = encodeSave({ ...envelope, state: s }); assert.ok(saved.ok);
  const loaded = decodeSave(saved.value); assert.ok(loaded.ok);
  // JSON's existing numeric format canonicalizes -0 to 0; every serialized field is exact.
  assert.deepEqual(loaded.value.state, JSON.parse(JSON.stringify(s)));
  const next = stepGame(loaded.value.state, [input(0, -1)], world).state;
  assert.ok(distance(next.player.pose.position, s.player.pose.position) > 0.01);
});

test("minimal clear swimmer surface approach remains clear for 60 complete steps, then leaves contact", () => {
  let s = swim({ x: -25.9, y: -0.7, z: -7.400000000000001 }, 1.57, 0.3);
  assert.ok(world.clearance(s.player.pose.position, swimmer));
  for (let i = 0; i < 60; i++) {
    s = stepGame(s, [input(1)], world).state;
    assert.ok(world.clearance(s.player.pose.position, swimmer), `tick ${i + 1}`);
    assert.ok(s.player.pose.position.y <= -0.5);
  }
  const contact = structuredClone(s.player.pose.position);
  for (let i = 0; i < 60; i++) s = stepGame(s, [input(-1, 0, -1)], world).state;
  assert.ok(distance(contact, s.player.pose.position) > 0.3);
  for (let i = 0; i < 30; i++) s = stepGame(s, [input()], world).state;
  assert.ok(world.clearance(s.player.pose.position, swimmer)); assert.ok(s.player.pose.position.y <= -0.5);
});

test("all 72 directional/look replays of the actual export preserve every rib gap after caller corrections", () => {
  const { envelope } = trappedExport();
  // Root's rejected-prototype counterexample is yaw=0/pitch=0/backward on tick one:
  // segment12 -0.01311010134142121 -> -0.02646727175319885 after its unchecked clamp.
  for (const yaw of [0, 1.57, 3.14, 4.71]) for (const pitch of [0, -1.2, 1.2]) for (const command of directions) {
    let s = structuredClone(envelope.state); Object.assign(s.player.pose, { yaw, pitch });
    for (let i = 0; i < 60; i++) {
      const next = stepGame(s, [command], world).state;
      noDeepening(s.player.pose.position, next.player.pose.position, swimmer); s = next;
    }
  }
});

// Frozen first-overlap poses and velocities produced by d9aaf63 from hullClearance-true
// starts (full traces and input provenance retained in the author's evidence archive).
const hullTraps = [
  { p: { x: -4.179157081725582, y: -0.9, z: -10.032405071654868 },
    velocity: { x: -4.1108372764481125, y: 7.829451676105529, z: -1.0182155487614462 } },
  { p: { x: -4.821035219680587, y: -0.9, z: -11.733421160497922 },
    velocity: { x: -0.9746026806911983, y: 7.856048095364841, z: 2.28126303541549 } },
];
test("baseline-generated shallow Dart traps escape and every final hull correction is non-deepening", () => {
  for (const trap of hullTraps) {
    assert.ok(Math.min(...gaps(trap.p, HULL_COLLIDERS.dart)) < -0.03);
    const leaving = pilot("dart", trap.p, trap === hullTraps[0] ? 4.955192865804982 : 3.545342708416026, 0.8);
    assert.equal(exitRefusal(leaving, world), null, "the pre-existing safe diver exit stays available");
    assert.equal(exit(leaving, world), null); assert.equal(leaving.player.controlledVehicleId, null);
    assert.ok(world.clearance(leaving.player.pose.position, swimmer));
    let best = 0;
    for (const yaw of [0, 1.57, 3.14, 4.71]) for (const pitch of [0, -1.2, 1.2]) for (const command of directions) {
      let s = pilot("dart", trap.p, yaw, pitch);
      s.fleet.vehicles[0]!.velocity = { ...trap.velocity }; s.player.velocity = { ...trap.velocity };
      for (let i = 0; i < 60; i++) {
        const next = stepGame(s, [command], world).state;
        noDeepening(s.player.pose.position, next.player.pose.position, HULL_COLLIDERS.dart);
        assert.ok(next.player.pose.position.y <= -0.9); s = next;
      }
      best = Math.max(best, distance(trap.p, s.player.pose.position));
    }
    assert.ok(best > 0.3);
  }
});

test("clear Dart approaches cannot generate a trapped hull and contact remains escapable", () => {
  const start = { x: -1.7930842825097262, y: -4.360815336603498, z: -9.441397386053284 };
  let s = pilot("dart", start, 4.955192865804982, 0.8);
  assert.ok(hullClearance(world, start, HULL_COLLIDERS.dart));
  for (let i = 0; i < 90; i++) {
    const before = s, sprint = i % 2 === 0;
    const out = stepGame(s, [{ ...input(1, 0, 1), sprint }], world); s = out.state;
    const actual = distance(before.player.pose.position, s.player.pose.position);
    assert.ok(Math.abs(s.metrics.pilotMetres - before.metrics.pilotMetres - actual) < 1e-12);
    // C4 (CY): drain follows the drive, not displacement; pressing into
    // contact under full input costs cruise power.
    const drain = 100 / 900 * (sprint ? 1.7 : 1) / 60;
    assert.ok(Math.abs(s.metrics.powerUsed - before.metrics.powerUsed - drain) < 1e-12);
    const impacts = out.events.filter(e => e.type === "impact");
    assert.ok(impacts.length <= 1, "retry cannot cause a second impact");
    assert.ok(Math.abs(before.fleet.vehicles[0]!.health - s.fleet.vehicles[0]!.health -
      impacts.reduce((sum, e) => sum + e.hullLoss, 0)) < 1e-12);
    for (const e of out.events) {
      if (e.type === "ascent-sample") assert.equal(e.actualRise, s.player.pose.position.y - before.player.pose.position.y);
      if (e.type === "thrust-sample") assert.equal(e.actual, Math.hypot(
        s.player.pose.position.x - before.player.pose.position.x, s.player.pose.position.z - before.player.pose.position.z));
      if (e.type === "impact") assert.deepEqual(e.origin, s.player.pose.position);
    }
    assert.ok(hullClearance(world, s.player.pose.position, HULL_COLLIDERS.dart), `tick ${i + 1}`);
    assert.ok(s.player.pose.position.y <= -0.9);
  }
  const contact = { ...s.player.pose.position };
  for (let i = 0; i < 120; i++) s = stepGame(s, [input(-1, 0, -1)], world).state;
  assert.ok(distance(contact, s.player.pose.position) > 0.3);
  for (let i = 0; i < 60; i++) s = stepGame(s, [input()], world).state;
  assert.ok(hullClearance(world, s.player.pose.position, HULL_COLLIDERS.dart));
  assert.ok(s.player.pose.position.y <= -0.9);
});

test("defined-normal junction, two-rib, Dart and deep overlaps separate conservatively against the full roster", () => {
  function overlap(segment: number, t: number, direction: Vec3, shape: Capsule, depth: number): Vec3 {
    const r = RIB_SEGMENTS[segment]!, centre = {
      x: r.a.x + (r.b.x - r.a.x) * t, y: r.a.y + (r.b.y - r.a.y) * t, z: r.a.z + (r.b.z - r.a.z) * t,
    };
    const length = Math.hypot(direction.x, direction.y, direction.z);
    const pose = (offset: number): Vec3 => ({ x: centre.x + direction.x / length * offset,
      y: centre.y + direction.y / length * offset - shape.height / 2, z: centre.z + direction.z / length * offset });
    let lo = 0, hi = 8;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (Math.min(...gaps(pose(mid), shape)) < -depth) lo = mid; else hi = mid;
    }
    return pose(hi);
  }
  const r = RIB_SEGMENTS[11]!, normal = { x: -(r.b.y - r.a.y), y: r.b.x - r.a.x, z: 0 };
  const poses: [Vec3, Capsule][] = [
    [overlap(11, 1, normal, swimmer, 0.01), swimmer],
    [overlap(11, 1, normal, swimmer, 0.06), swimmer],
    [overlap(11, 1, normal, HULL_COLLIDERS.dart, 0.03), HULL_COLLIDERS.dart],
    [overlap(5, 0.5, { x: 0, y: 0, z: 1 }, swimmer, 0.25), swimmer],
  ];
  assert.ok(gaps(poses[1]![0], swimmer).filter(g => g < -RIB_CONTACT_TOLERANCE).length >= 2);
  let seed = 73;
  const random = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (const [p, shape] of poses) {
    assert.deepEqual(world.moveCapsule(p, { x: 0, y: 0, z: 0 }, shape).position, p);
    let moved = 0;
    for (let i = 0; i < 2000; i++) {
      const d = { x: random() - 0.5, y: random() - 0.5, z: random() - 0.5 };
      const scale = 0.3 / Math.hypot(d.x, d.y, d.z);
      const result = world.moveCapsule(p, { x: d.x * scale, y: d.y * scale, z: d.z * scale }, shape);
      noDeepening(p, result.position, shape); if (distance(p, result.position) > 1e-6) moved++;
    }
    assert.ok(moved > 0, "a defined normal permits some separation");
  }
  const p = overlap(5, 0.5, { x: 0, y: 0, z: 1 }, swimmer, 0.01);
  const wall = { id: "separation.wall", min: { x: p.x - 2, y: p.y - 2, z: p.z + 0.39 },
    max: { x: p.x + 2, y: p.y + 2, z: p.z + 0.49 } };
  const w = createWorldQueries([...SOLIDS, wall]); // Keep ALL neighbouring canonical ribs.
  const exit = w.moveCapsule(p, { x: 0, y: 0, z: 0.5 }, swimmer);
  assert.ok(exit.hitSolid); assert.ok(exit.position.z + swimmer.radius < wall.min.z);
  noDeepening(p, exit.position, swimmer);
  for (let i = 0; i < 200; i++) {
    const result = w.moveCapsule(p, { x: random() - 0.5, y: random() - 0.5, z: random() }, swimmer);
    noDeepening(p, result.position, swimmer); assert.ok(result.position.z + swimmer.radius <= wall.min.z);
  }
  const point = { radius: 0, height: 0 }, zero = RIB_SEGMENTS[0]!.a;
  const blocked = world.moveCapsule(zero, { x: 1, y: 1, z: 1 }, point);
  assert.ok(blocked.hitSolid); assert.deepEqual(blocked.position, zero);
  const bad = world.moveCapsule(p, { x: Infinity, y: 0, z: 0 }, swimmer);
  assert.ok(bad.hitSolid); assert.deepEqual(bad.position, p);
});

test("safe ordinary movement and ascent/thrust traces retain exact pre-correction baseline results", () => {
  // Captured on clean 1c942bd/d9aaf63 BEFORE production edits; the full readable
  // traces are archived. Hashes include each pose, velocity, mode and movement event.
  const cases: [GameState, GameCommand, number, string][] = [
    [swim({ x: -55, y: -0.53, z: 30 }, 0, 0.3), input(1, 0, 1), 12, "f171189c773285118e750d3ca92fb8d3ecc350b5be69feb876ce86748fb75a50"],
    [swim({ x: -4.32, y: -0.7, z: 20.5 }, Math.PI / 2, 0.3), input(1, 0, 1), 60, "fd23b689529ef9ca8ea6c775baed5a70ea2129f4d942fe5d56b839511ae29ddd"],
    [swim({ x: 0, y: -1.2, z: 6 }, Math.PI), input(1), 90, "f8e8fdc4833829164503c14e3335466da4e4d30868135819b846eb4d34b478d7"],
    [swim({ x: 10, y: -0.8, z: -26 }), input(1), 160, "55858defa8081c19b75efb8b2cc9c3e88a31416d688eab97e3d72d366c8027ac"],
    [swim({ x: 0, y: 0.18, z: 14 }), input(), 12, "817e7f6688a2fd873c1ae10e3ec89e97d47b5965766eca1a65718d855731848a"],
    // Same retained trace with the new, zero-valued supportLimited member.
    [pilot("dart", { x: -55, y: -1, z: 30 }, 0, 0.3), input(1, 0, 1), 60, "e579ecda29ebfc34efbd943d24f261ccb94312f2725e3c27d38b0049e0c27d70"],
    [pilot("dart", { x: -55, y: -0.9, z: 30 }), input(-1), 60, "73af0a667a3e71d568bf8ca0d108df4df6b4f6101bf7c7364262916c8d0a97c0"],
    [pilot("spindle", { x: -55, y: -0.4, z: 30 }, 0, 0.3), input(1, 0, 1), 60, "629d3907361d73b4755de72c11f798e2af01b36f55e9aebd41938f3c1e079b5d"],
    [pilot("hearthline", { x: 140, y: -40, z: -80 }, 0.4), input(1), 60, "6aa1bc5493c2376901a6134ba1f84f2739096c110621984a0a4e79a04fce7288"],
  ];
  for (const [initial, command, ticks, expected] of cases) {
    let s = initial; const trace = [];
    for (let i = 0; i < ticks; i++) {
      const out = stepGame(s, [command], world); s = out.state;
      for (const e of out.events) if (e.type === "thrust-sample") assert.equal(e.supportLimited, 0);
      trace.push({ pose: s.player.pose, velocity: s.player.velocity, mode: s.player.mode,
        events: out.events.filter(e => ["ascent-sample", "thrust-sample", "impact", "foundation-boundary"].includes(e.type)) });
    }
    assert.equal(createHash("sha256").update(JSON.stringify(trace)).digest("hex"), expected, JSON.stringify(initial.player.pose));
  }
});

test("Spindle forced surface placement cannot cross an intervening solid between two clear endpoints", () => {
  // Diagnostic clear pose below a thin shelf: fixed placement is a correction,
  // regardless of its displacement. Endpoint clearance alone would allow tunnelling.
  const shelf = { id: "surface.shelf", min: { x: -65, y: -2, z: 20 }, max: { x: -45, y: -1.8, z: 40 } };
  const w = createWorldQueries([...SOLIDS, shelf]);
  const start = { x: -55, y: -4.4, z: 30 }, shape = HULL_COLLIDERS.spindle; // Below the shelf at the 2.1 m collider.
  assert.ok(hullClearance(w, start, shape)); assert.ok(hullClearance(w, { ...start, y: -0.4 }, shape));
  const next = stepGame(pilot("spindle", start), [input()], w).state;
  assert.deepEqual(next.player.pose.position, start, "no safe surface correction: retain the origin");
});

test("a long inherited hull rise selects a safe capped retry under a shelf without charging discarded impact", () => {
  const shelf = { id: "retry.shelf", min: { x: -48, y: 2, z: 20 }, max: { x: -46, y: 2.3, z: 40 } };
  const w = createWorldQueries([...SOLIDS, shelf]);
  const start = { x: -55, y: -3, z: 30 }, s = pilot("dart", start, Math.PI / 2);
  s.fleet.vehicles[0]!.velocity = { x: 600, y: 1200, z: 0 };
  s.player.velocity = { ...s.fleet.vehicles[0]!.velocity };
  assert.ok(hullClearance(w, start, HULL_COLLIDERS.dart));
  const out = stepGame(s, [input(1, 0, 1)], w), next = out.state;
  assert.ok(next.player.pose.position.x > -46, "retain the safe retry's horizontal progress");
  assert.ok(Math.abs(next.player.pose.position.y + 0.9) < 1e-12);
  assert.ok(hullClearance(w, next.player.pose.position, HULL_COLLIDERS.dart));
  assert.equal(next.fleet.vehicles[0]!.health, 100); assert.equal(out.events.filter(e => e.type === "impact").length, 0);
  const ascent = out.events.find(e => e.type === "ascent-sample"); assert.ok(ascent?.type === "ascent-sample");
  assert.ok(Math.abs(ascent.actualRise - 2.1) < 1e-12); assert.equal(ascent.solidLimitedRise, 0); assert.ok(ascent.surfaceLimitedRise > 0);
  const thrust = out.events.find(e => e.type === "thrust-sample"); assert.ok(thrust);
  assert.equal(thrust.supportLimited, 0); assert.equal(thrust.solidLimited, 0, "selected safe surface retry retains only its own measurements");
});
