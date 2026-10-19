import test from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../src/sim/state.js";
import { BASIN_GEOMETRY } from "../src/content/routes.js";
import { createEnvelope, decodeSave, encodeSave } from "../src/save/codec.js";
import { stepGame } from "../src/sim/step.js";
import { aimRay } from "../src/sim/targeting.js";
import { createWorldQueries, moveHull, surfaceHeight, terrainHeight } from "../src/sim/world.js";
import type { GameCommand, GameState, Vec3 } from "../src/sim/types.js";

const world = createWorldQueries();
const swimShape = { radius: .34, height: .95 };
const input = (forward = 0, right = 0, vertical = 0): GameCommand =>
  ({ type: "move", forward, right, vertical, sprint: false, quiet: false });
function swimmer(position: Vec3, yaw = 0, pitch = 0): GameState {
  const s = createGame(); s.opening.phase = 4; s.player.mode = "swimming";
  Object.assign(s.player.pose, { position: { ...position }, yaw, pitch }); return s;
}
function nearPlaneGaps(s: GameState): number[] {
  const ray = aimRay(s); assert.ok(ray);
  const { origin, dir } = ray, yaw = s.player.pose.yaw;
  const right = { x: Math.cos(yaw), y: 0, z: Math.sin(yaw) };
  const up = { x: -right.z * dir.y, y: right.z * dir.x - right.x * dir.z, z: right.x * dir.y };
  const half = .07 * Math.tan(1.02 / 2), gaps = [];
  for (const h of [-1, 1]) for (const v of [-1, 1]) {
    const p = { x: origin.x + dir.x * .07 + right.x * h * half * 1.6 + up.x * v * half,
      y: origin.y + dir.y * .07 + up.y * v * half,
      z: origin.z + dir.z * .07 + right.z * h * half * 1.6 + up.z * v * half };
    gaps.push(p.y - terrainHeight(p.x, p.z));
  }
  return gaps;
}

test("the minimized actual rescue approach keeps the full-step camera near plane outside the real wall", () => {
  // Exact pose of the unchanged staged production export at tick24423. No
  // renderer workaround: unchanged aim origin, FOV1.02 and near plane .07m.
  let s = swimmer({ x: 55, y: -40.61290619416708, z: -59.5 }, 3 * Math.PI / 2, -.7);
  for (let i = 0; i < 24; i++) {
    s = stepGame(s, [input(1)], world).state;
    assert.ok(Math.min(...nearPlaneGaps(s)) >= 0, `forward step ${i + 1}: ${JSON.stringify(s.player.pose)}`);
  }
  assert.ok(s.player.pose.position.x >= 54 + swimShape.radius - 1e-6);
});

test("the original 150-step approach, contact and retreat sequence stays visible, saveable and escapable", () => {
  let s = swimmer({ x: 55, y: -40.61290619416708, z: -59.5 }, 3 * Math.PI / 2, -.7);
  const health = s.player.vitals.health;
  let contact: Vec3 | null = null;
  for (const [command, ticks] of [[input(1), 24], [input(0, 0, -1), 48], [input(-1, 0, 1), 60], [input(), 18]] as const) {
    for (let i = 0; i < ticks; i++) {
      s = stepGame(s, [command], world).state;
      assert.ok(Math.min(...nearPlaneGaps(s)) >= 0);
      assert.ok(world.clearance(s.player.pose.position, swimShape));
      const encoded = encodeSave(createEnvelope(s, meta)); assert.ok(encoded.ok);
      const decoded = decodeSave(encoded.value); assert.ok(decoded.ok);
      assert.deepEqual(decoded.value.state, JSON.parse(JSON.stringify(s)));
    }
    if (command.type === "move" && command.vertical === -1) contact = { ...s.player.pose.position };
  }
  assert.ok(contact); assert.ok(s.player.pose.position.x > contact.x + 1);
  assert.ok(s.player.pose.position.y > contact.y + 2);
  assert.equal(s.player.vitals.health, health); assert.equal(s.metrics.failures, 0);
});

const meta = { sessionId: "terrain-contact", createdAt: "2026-10-18T00:00:00.000Z", savedAt: "2026-10-18T00:00:00.000Z" };
test("the retained real contact has no idle relocation, rejects closing travel and escapes without a grant", () => {
  const original = swimmer({ x: 54.00315568257252, y: -39.197393030355954, z: -59.5 }, 3 * Math.PI / 2, -.7);
  const encoded = encodeSave(createEnvelope(original, meta)); assert.ok(encoded.ok);
  const loaded = decodeSave(encoded.value); assert.ok(loaded.ok); assert.deepEqual(loaded.value.state, original);
  const still = stepGame(original, [input()], world).state;
  assert.deepEqual(still.player.pose.position, original.player.pose.position);
  const closing = stepGame(original, [input(1)], world).state;
  assert.ok(closing.player.pose.position.x >= original.player.pose.position.x - 1e-9);
  let s = original;
  for (let i = 0; i < 60; i++) {
    const before = s.player.pose.position;
    s = stepGame(s, [input(-1, 0, 1)], world).state;
    assert.ok(s.player.pose.position.x >= before.x - 1e-9);
    assert.ok(encodeSave(createEnvelope(s, meta)).ok);
  }
  assert.ok(s.player.pose.position.x > 55); assert.ok(s.player.pose.position.y > original.player.pose.position.y + 2);
  for (const key of ["inventory", "knowledge", "fleet", "recovery", "migration"] as const) assert.deepEqual(s[key], original[key]);
});

test("raised rescue sides and corners stop continuous diagonal travel at the full actor extent", () => {
  const w = createWorldQueries([]);
  for (const [p, d, axis, boundary, sign] of [
    [{ x: 60, y: -25, z: -54 }, { x: -20, y: 2, z: 1 }, "x", 54, 1],
    [{ x: 50, y: -15, z: -66 }, { x: .5, y: -1, z: 20 }, "z", -60, -1],
    [{ x: 50, y: -15, z: -42 }, { x: .5, y: 1, z: -20 }, "z", -48, 1],
    [{ x: 60, y: -25, z: -66 }, { x: -12, y: 0, z: 12 }, "x", 54, 1],
  ] as const) {
    const r = w.moveCapsule(p, d, swimShape); assert.ok(r.hitSolid);
    assert.ok((r.position[axis] - boundary) * sign >= swimShape.radius - 1e-6, JSON.stringify(r));
    assert.ok(Object.values(r.position).every(Number.isFinite));
  }
});

test("the bench cut blocks its higher exterior, permits vertical ascent, and has no lip above the true top", () => {
  const w = createWorldQueries([]), p = { x: 39, y: -13, z: -54 };
  const hit = w.moveCapsule(p, { x: -5, y: 0, z: 0 }, swimShape);
  assert.ok(hit.hitSolid); assert.ok(hit.position.x >= 38.34);
  const risen = w.moveCapsule(hit.position, { x: 0, y: 12, z: 0 }, swimShape);
  assert.ok(!risen.hitSolid); assert.ok(risen.position.y > terrainHeight(38 - .000001, -54));
  const out = w.moveCapsule(risen.position, { x: -3, y: 0, z: 1 }, swimShape);
  assert.ok(!out.hitSolid); assert.ok(out.position.x < 38);
  const supportedTop = w.moveCapsule({ x: 53, y: -13, z: -54 }, { x: 3, y: 0, z: 0 }, swimShape);
  assert.ok(!supportedTop.hitSolid); assert.equal(supportedTop.position.x, 56);
});

test("both cut corners retain their exposed natural walls and a supported top never gains an artificial lip", () => {
  const w = createWorldQueries([]);
  for (const x of [38.5, 39, 40, 41, 42, 43, 44]) for (const sign of [-1, 1]) {
    const edge = sign < 0 ? -60 : -48, exterior = terrainHeight(x, edge + sign * .000001);
    const start = { x, y: -13, z: edge - sign };
    const hit = w.moveCapsule(start, { x: 0, y: 0, z: sign * 3 }, swimShape);
    if (exterior > -13) {
      assert.ok(hit.hitSolid); assert.ok((edge - hit.position.z) * sign >= .34 - 1e-6);
    }
    // Use a true upper bound over the entire actor footprint, rather than a
    // centre-only claim of support at the steep natural side.
    let top = -13;
    for (let i = -34; i <= 34; i++) top = Math.max(top, terrainHeight(x + i / 100, edge + sign * .000001));
    const clear = w.moveCapsule({ ...start, y: top + .01 }, { x: 0, y: 0, z: sign * 3 }, swimShape);
    assert.ok(!clear.hitSolid, JSON.stringify({ x, sign, top, clear }));
  }
});

test("every exposed Basin pad side uses the full footprint, while the natural max join stays usable", () => {
  const w = createWorldQueries([]);
  for (const pad of BASIN_GEOMETRY.terrainPads) {
    for (const axis of ["x", "z"] as const) for (const sign of [-1, 1]) {
      const edge = axis === "x" ? sign < 0 ? pad.minX : pad.maxX : sign < 0 ? pad.minZ : pad.maxZ;
      const p: Vec3 = { x: (pad.minX + pad.maxX) / 2, y: pad.y, z: (pad.minZ + pad.maxZ) / 2 };
      p[axis] = edge + sign * 2;
      const outside = terrainHeight(p.x, p.z);
      if (outside >= pad.y) {
        // This pad does not override higher natural ground. No rectangular wall
        // may obstruct its supported/above-ground surface.
        p.y = outside + 2;
        assert.ok(!w.moveCapsule(p, { x: axis === "x" ? -sign * 4 : 0, y: 0,
          z: axis === "z" ? -sign * 4 : 0 }, swimShape).hitSolid);
        continue;
      }
      p.y = (outside + pad.y) / 2;
      const d = { x: axis === "x" ? -sign * 8 : 0, y: 0, z: axis === "z" ? -sign * 8 : 0 };
      const hit = w.moveCapsule(p, d, swimShape); assert.ok(hit.hitSolid);
      assert.ok((hit.position[axis] - edge) * sign >= .34 - 1e-6, JSON.stringify({ pad, p, hit }));
      const above = { ...p, y: pad.y + .001 };
      assert.ok(!w.moveCapsule(above, d, swimShape).hitSolid, "no lip above the supported pad top");
    }
  }
});

test("top descent, diagonal ascent and non-cardinal full steps cannot bypass a terrain face", () => {
  const w = createWorldQueries([]), top = w.moveCapsule({ x: 50, y: -10, z: -54 }, { x: 1, y: -10, z: 0 }, swimShape);
  assert.ok(top.hitSolid); assert.ok(top.position.y >= -13 - 1e-6); assert.ok(top.position.x > 50.9);
  for (const yaw of [4.3, 4.7, 5.1]) for (const pitch of [-.4, 0, .7]) for (const vertical of [-1, 0, 1]) {
    let s = swimmer({ x: 55, y: -30, z: -55 }, yaw, pitch);
    for (let i = 0; i < 45; i++) {
      s = stepGame(s, [input(1, .2, vertical)], world).state;
      assert.ok(s.player.pose.position.x >= 54.34 - 1e-6);
      assert.ok(Math.min(...nearPlaneGaps(s)) >= 0);
    }
  }
});

test("terrain sliding and retained overlap escape are swept again against an adjacent supplied solid", () => {
  const obstacle = { id: "adjacent", min: { x: 53, y: -50, z: -53 }, max: { x: 60, y: -10, z: -52 } };
  const w = createWorldQueries([obstacle]);
  for (const [p, d] of [
    [{ x: 55, y: -30, z: -55 }, { x: -3, y: 0, z: 5 }],
    [{ x: 54.00315568257252, y: -39.197393030355954, z: -59.5 }, { x: 1, y: 2, z: 10 }],
  ] as const) {
    const r = w.moveCapsule(p, d, swimShape); assert.ok(r.hitSolid); assert.ok(r.position.z <= -53.34 + 1e-6);
    assert.ok(r.position.x >= Math.min(p.x, 54.34) - 1e-9);
  }
});

test("caller-supplied floors do not acquire world terrain columns or cut walls", () => {
  const p = { x: 55, y: -30, z: -54 }, d = { x: -20, y: 0, z: 0 };
  for (const floor of [() => -200, (_x: number, _z: number) => -100]) {
    const r = createWorldQueries([], floor).moveCapsule(p, d, swimShape);
    assert.ok(!r.hitSolid); assert.deepEqual(r.position, { x: 35, y: -30, z: -54 });
  }
  assert.ok(createWorldQueries([], surfaceHeight).moveCapsule(p, d, swimShape).hitSolid);
  assert.ok(createWorldQueries([], terrainHeight).moveCapsule(p, d, swimShape).hitSolid);
});

test("excessive or non-finite hull travel is refused with a finite retained origin", () => {
  const p = { x: 55, y: -30, z: -54 };
  for (const x of [Infinity, NaN, 1e308, 100000]) {
    const r = moveHull(world, p, { x, y: 0, z: 0 }, swimShape);
    assert.ok(r.hitSolid); assert.deepEqual(r.position, p);
  }
  assert.throws(() => moveHull(world, { ...p, x: NaN }, { x: 0, y: 0, z: 0 }, swimShape), RangeError);
});
