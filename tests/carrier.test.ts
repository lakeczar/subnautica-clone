import test from "node:test";
import assert from "node:assert/strict";
import {
  carrierCommand,
  fixtureGame,
  localToWorld,
  updateBerth,
  LAUNCH_LOCAL,
} from "../src/sim/carrier.js";
import { createWorldQueries } from "../src/sim/world.js";
import { createEnvelope, decodeSave, encodeSave } from "../src/save/codec.js";
import { stepGame } from "../src/sim/step.js";
import { incapacitate } from "../src/sim/recovery.js";
import type { GameState } from "../src/sim/types.js";
const w = createWorldQueries();
const save = (s: GameState): GameState => {
  const e = createEnvelope(s, {
      sessionId: "carrier-test-session",
      createdAt: "2026-10-17T12:00:00.000Z",
      savedAt: "2026-10-17T12:00:00.000Z",
    }),
    t = encodeSave(e);
  assert.equal(t.ok, true, t.ok ? "" : t.error);
  const d = decodeSave(t.value);
  assert.equal(d.ok, true);
  assert.deepEqual(d.value.state, s);
  return d.value.state;
};
const advance = (s: GameState): void => {
  for (let i = 0; i < 35; i++) updateBerth(s, w);
};
test("carrier requires station keeping before walking/launch, and stationary interior movement uses explicit local transforms", () => {
  let s = fixtureGame();
  assert.equal(carrierCommand(s, "helm", undefined, w), null);
  assert.match(
    carrierCommand(s, "leave-helm", undefined, w)!,
    /station keeping/,
  );
  assert.match(carrierCommand(s, "launch", "fixture_dart", w)!, /Station/);
  assert.equal(carrierCommand(s, "station-keep", undefined, w), null);
  assert.equal(carrierCommand(s, "leave-helm", undefined, w), null);
  const before = { ...s.player.interiorPose!.position };
  for (let i = 0; i < 60; i++)
    s = stepGame(
      s,
      [{ type: "move", forward: 1, right: 1, vertical: 0, sprint: false }],
      w,
    ).state;
  assert.ok(s.player.interiorPose!.position.x > before.x);
  assert.ok(s.player.interiorPose!.position.z < before.z);
  save(s);
});
test("two compact berths keep Spindle dry when the other lock launches; blocked exit preserves all independent vessel data", () => {
  const s = fixtureGame(),
    before = structuredClone(s.fleet.vehicles);
  s.fleet.docking!.launchBlocked = true;
  assert.match(carrierCommand(s, "launch", "fixture_dart", w)!, /obstructed/);
  assert.deepEqual(s.fleet.vehicles, before);
  assert.equal(s.fleet.docking!.transaction, null);
  assert.match(carrierCommand(s, "launch", "fixture_spindle", w)!, /surface/);
  s.fleet.docking!.launchBlocked = false;
  assert.equal(carrierCommand(s, "launch", "fixture_dart", w), null);
  save(s);
  updateBerth(s, w);
  save(s);
  advance(s);
  assert.equal(s.fleet.vehicles.find((v) => v.hull === "dart")!.berth, null);
  assert.ok(s.fleet.vehicles.find((v) => v.hull === "spindle")!.berth);
  assert.equal(s.fleet.vehicles.find((v) => v.hull === "spindle")!.health, 91);
  assert.equal(s.fleet.vehicles.length, 4);
  assert.equal(s.inventory.items[0]!.containerId, "fixture_dart_hold");
  advance(s);
  assert.equal(s.fleet.docking!.completed.length, 1);
  save(s);
});
test("save/reload/interruption at capture and launch boundaries commit or roll back once without detaching twice", () => {
  for (const type of ["launch", "capture"] as const)
    for (const boundary of ["prepared", "lock"] as const) {
      let s = fixtureGame();
      if (type === "capture") {
        const v = s.fleet.vehicles.find((v) => v.id === "fixture_dart")!;
        v.berth = null;
        v.pose.position = localToWorld(LAUNCH_LOCAL, s.fleet.vehicles[0]!);
      }
      assert.equal(carrierCommand(s, type, "fixture_dart", w), null);
      if (boundary === "lock") updateBerth(s, w);
      s = save(s);
      const interrupted = structuredClone(s);
      assert.equal(
        carrierCommand(interrupted, "interrupt", undefined, w),
        null,
      );
      advance(interrupted);
      assert.equal(
        !!interrupted.fleet.vehicles.find((v) => v.id === "fixture_dart")!
          .berth,
        type === "launch",
      );
      assert.equal(interrupted.fleet.vehicles.length, 4);
      save(interrupted);
      advance(s);
      assert.equal(
        !!s.fleet.vehicles.find((v) => v.id === "fixture_dart")!.berth,
        type === "capture",
      );
      assert.equal(s.fleet.docking!.completed.length, 1);
      advance(s);
      assert.equal(s.fleet.docking!.completed.length, 1);
      save(s);
    }
});
test("physical launch obstruction discovered after preparation aborts safely", () => {
  const s = fixtureGame();
  assert.equal(carrierCommand(s, "launch", "fixture_dart", w), null);
  const h = s.fleet.vehicles[0]!,
    p = localToWorld(LAUNCH_LOCAL, h);
  const blocked = createWorldQueries([
    {
      id: "blocked-launch",
      min: { x: p.x - 4, y: p.y - 2, z: p.z - 4 },
      max: { x: p.x + 4, y: p.y + 4, z: p.z + 4 },
    },
  ]);
  for (let i = 0; i < 35; i++) updateBerth(s, blocked);
  assert.ok(s.fleet.vehicles[1]!.berth);
  assert.equal(s.fleet.docking!.completed.length, 0);
  save(s);
});
test("Spindle surface release and empty supported-dock medium reconfiguration preserve independent identities", () => {
  const s = fixtureGame(),
    h = s.fleet.vehicles[0]!;
  assert.match(carrierCommand(s, "reconfigure", undefined, w)!, /empty/);
  h.pose.position.y = -0.9;
  updateBerth(s, w);
  s.player.pose.position = localToWorld(s.player.interiorPose!.position, h);
  assert.equal(carrierCommand(s, "launch", "fixture_spindle", w), null);
  advance(s);
  assert.equal(s.fleet.vehicles[2]!.berth, null);
  s.fleet.vehicles[2]!.pose.position.x += 12;
  assert.equal(carrierCommand(s, "launch", "fixture_dart", w), null);
  advance(s);
  s.fleet.vehicles[1]!.pose.position.x -= 12;
  assert.equal(carrierCommand(s, "reconfigure", undefined, w), null);
  assert.equal(s.fleet.docking!.configuration, "medium");
  const c = s.fleet.vehicles[3]!;
  c.pose.position = localToWorld(LAUNCH_LOCAL, h);
  assert.equal(carrierCommand(s, "capture", c.id, w), null);
  advance(s);
  assert.equal(c.berth!.slot, 0);
  assert.match(carrierCommand(s, "reconfigure", undefined, w)!, /empty/);
  save(s);
});
test("death inside carrier falls back to a valid refuge and never silently moves a vessel or loses its cargo", () => {
  const s = fixtureGame(),
    fleet = structuredClone(s.fleet.vehicles);
  incapacitate(s, "Fixture pressure drill");
  assert.equal(s.player.interiorId, null);
  assert.equal(s.player.refugeId, "home_pod");
  assert.equal(s.player.mode, "walking");
  assert.deepEqual(s.fleet.vehicles, fleet);
  save(s);
});
test("invalid berth occupancy, duplicate transaction completion and incoherent local ownership fail closed", () => {
  for (const mutate of [
    (s: GameState) => (s.fleet.vehicles[2]!.berth!.slot = 0),
    (s: GameState) => (s.fleet.docking!.configuration = "medium"),
    (s: GameState) =>
      (s.fleet.vehicles[1]!.berth!.carrierId = "missing_carrier"),
    (s: GameState) => (s.player.interiorId = "missing_carrier"),
  ]) {
    const s = fixtureGame();
    mutate(s);
    const e = createEnvelope(s, {
      sessionId: "bad-carrier-data",
      createdAt: "2026-10-17T12:00:00.000Z",
      savedAt: "2026-10-17T12:00:00.000Z",
    });
    assert.equal(encodeSave(e).ok, false);
  }
});
