import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { completeOpening } from "../src/sim/progression.js";
import { createGame, makeVehicle } from "../src/sim/state.js";
import { stepGame } from "../src/sim/step.js";
import { createWorldQueries, moveHull } from "../src/sim/world.js";
import { HULL_COLLIDERS } from "../src/content/registry.js";
import type { GameCommand, GameEvent, GameState, WorldQueries } from "../src/sim/types.js";

register("./app-loader.js", import.meta.url);
const { SiltwakeApp } = await import("../src/runtime/app.js");

// Minimized from the unchanged earned tick9370 export (SHA256 8165e44f…646).
// Keep the actual hull pose/inertia and default world: an empty-world fake
// misses the footprint-floor refusal that occurs after the capsule sweep.
function groundedDart(): GameState {
  const s = createGame(); completeOpening(s);
  const v = makeVehicle("dart_17", "dart", {
    x: 43.89680192297775, y: -7.697553729032596, z: -34.96197954305927,
  }, "dart_17_hold");
  v.pose.yaw = 0.4165926535897544; v.pose.pitch = -0.08;
  v.velocity = { x: 2.3218782039593679e-7, y: -0.20284728716855766, z: -5.247278714331337e-7 };
  s.fleet.vehicles.push(v);
  s.inventory.containers.push({ id: v.cargoId, kind: "vehicle", capacity: 32, ownerId: v.id });
  s.player.mode = "piloting"; s.player.controlledVehicleId = v.id;
  s.player.pose = structuredClone(v.pose); s.player.velocity = { ...v.velocity };
  return s;
}
const forward: GameCommand = { type: "move", forward: 1, right: 0, vertical: 0, sprint: false, quiet: false };

function observer() {
  // Call the actual production consumers, with only their view/session ports
  // replaced. Each observation below comes from a real complete stepGame.
  const port = Object.create(SiltwakeApp.prototype) as {
    state: GameState; active: boolean; ascentSeconds: number; ascentActor: string | null;
    thrustSeconds: number; thrustActor: string | null;
    session: { state: GameState }; view: unknown;
    observeAscent(events: GameEvent[]): void; observeThrust(events: GameEvent[]): void;
  };
  port.session = { state: groundedDart() };
  Object.defineProperty(port, "active", { value: true });
  port.ascentSeconds = 0; port.ascentActor = null; port.thrustSeconds = 0; port.thrustActor = null;
  const visible = { ahead: false, above: false };
  port.view = { blockedThrust: (v: boolean) => { visible.ahead = v; }, blockedAscent: (v: boolean) => { visible.above = v; } };
  return { port, visible };
}

test("earned footprint-floor stall reaches Blocked ahead after exactly 30 full steps; retreat/rise clears it", () => {
  for (const escape of [{ ...forward, forward: -1 }, { ...forward, vertical: 1 }]) {
    const { port, visible } = observer(), world = createWorldQueries();
    let s = port.state; const origin = structuredClone(s.player.pose.position);
    for (let i = 1; i <= 60; i++) {
      const out = stepGame(s, [forward], world); s = out.state;
      port.session.state = s; port.observeAscent(out.events); port.observeThrust(out.events);
      const sample = out.events.find(e => e.type === "thrust-sample"); assert.ok(sample);
      assert.ok(sample.requested > 0); assert.equal(sample.actual, 0);
      assert.deepEqual(s.player.pose.position, origin, "presentation correction must not move the earned hull");
      assert.equal(visible.ahead, i >= 30, "unchanged 0.5s dwell at 60 Hz");
      assert.equal(visible.above, false, "floor support is not a ceiling");
    }
    for (let i = 0; i < 30; i++) {
      const out = stepGame(s, [escape], world); s = out.state;
      port.session.state = s; port.observeAscent(out.events); port.observeThrust(out.events);
      if (escape.forward < 0) assert.equal(visible.ahead, false, "released forward intent resets immediately");
      assert.equal(visible.above, false);
    }
    assert.equal(visible.ahead, false, "rise clears once ordinary motion makes progress");
    assert.notDeepEqual(s.player.pose.position, origin, "ordinary retreat/rise escapes after retained inertia decays");
  }
});

test("floor observation excludes sweep-refused travel and includes only the remaining cancelled slices", () => {
  const floor = createWorldQueries([], () => -9.9);
  let sweptLoss = 0, support = 0, calls = 0;
  const w: WorldQueries = { ...floor, moveCapsule(p, d) {
    calls++; sweptLoss += Math.hypot(d.x, d.z) / 2;
    return { position: { x: p.x + d.x / 2, y: p.y + d.y, z: p.z + d.z / 2 }, hitSolid: true, hitBoundary: false };
  } };
  const origin = { x: -55, y: -10, z: 30 }, delta = { x: 0.6, y: 0, z: 0 };
  const result = moveHull(w, origin, delta, HULL_COLLIDERS.dart, undefined, rejected => { support += rejected; });
  assert.equal(calls, 1); assert.deepEqual(result.position, origin);
  assert.ok(Math.abs(sweptLoss - 0.1) < 1e-12); assert.ok(Math.abs(support - 0.5) < 1e-12);
  assert.ok(Math.abs(sweptLoss + support - 0.6) < 1e-12, "each refused metre belongs to one cause");
  assert.deepEqual(moveHull(w, origin, delta, HULL_COLLIDERS.dart), result, "optional observer preserves movement shape/result");
});

test("partial footprint support still permits progress and cannot accrue the stalled-thrust dwell", () => {
  const { port, visible } = observer(); let s = port.state;
  const v = s.fleet.vehicles[0]!;
  v.pose.position = { x: -55, y: -10, z: 30 }; v.pose.yaw = 0; v.pose.pitch = 0;
  v.velocity = { x: 0, y: 0, z: -24 }; s.player.pose = structuredClone(v.pose); s.player.velocity = { ...v.velocity };
  const w = createWorldQueries([], (_x, z) => z < 26.15 ? -9.9 : -200);
  const out = stepGame(s, [forward], w), sample = out.events.find(e => e.type === "thrust-sample");
  assert.ok(sample); assert.ok(sample.supportLimited > 0); assert.equal(sample.solidLimited, 0);
  assert.ok(sample.actual > sample.requested * 0.1); assert.ok(sample.actual < sample.requested);
  assert.ok(Math.abs(sample.actual + sample.supportLimited - sample.requested) < 1e-10);
  port.session.state = out.state;
  for (let i = 0; i < 60; i++) { port.observeAscent(out.events); port.observeThrust(out.events); }
  assert.equal(visible.ahead, false); assert.equal(visible.above, false);
});

test("discarded support attempts do not double-count a final surface rollback", () => {
  const s = groundedDart(), v = s.fleet.vehicles[0]!;
  v.pose.position = { x: -55, y: -.5, z: 30 }; v.pose.pitch = 0; v.pose.yaw = 0; v.velocity = { x: 0, y: 0, z: 0 };
  s.player.pose = structuredClone(v.pose); s.player.velocity = { ...v.velocity };
  let calls = 0;
  const floor = createWorldQueries([], () => -.4);
  // Deliberately retained invalid floor/surface placement: neither ordinary
  // movement nor the capped retry can safely leave it. No placement-policy fix.
  const w: WorldQueries = { ...floor, moveCapsule(p, d, shape) {
    if (shape === HULL_COLLIDERS.dart) calls++;
    return floor.moveCapsule(p, d, shape);
  } };
  const out = stepGame(s, [forward], w), sample = out.events.find(e => e.type === "thrust-sample");
  assert.ok(sample); assert.equal(calls, 2); assert.equal(sample.supportLimited, 0);
  assert.equal(sample.solidLimited, sample.requested); assert.equal(sample.actual, 0);
});
