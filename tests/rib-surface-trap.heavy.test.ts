// Rib surface trap, heavy tier (TT-1): all 72 replays of the actual export and of both
// shallow Dart traps. tests/rib-surface-trap.test.ts keeps the rest and fast smokes.
import test from "node:test";
import assert from "node:assert/strict";
import { HULL_COLLIDERS } from "../src/content/registry.js";
import { stepGame } from "../src/sim/step.js";
import { exit, exitRefusal } from "../src/sim/vehicles.js";
import { directions, distance, gaps, noDeepening, pilot, swimmer, world } from "./rib-support.js";
import { hullTraps, trappedExport } from "./rib-surface-trap-support.js";

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
