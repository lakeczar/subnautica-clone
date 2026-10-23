// Carrier boundary, heavy tier (TT-1): the full 2000-tick ascent and reverse, and
// launch/capture interruptions at every edge in both configurations.
// tests/carrier-boundary.test.ts keeps the rest and fast smokes.
import test from "node:test";
import assert from "node:assert/strict";
import { fixtureGame } from "../src/sim/carrier.js";
import { executeCommand, stepGame } from "../src/sim/step.js";
import { coherent, command, edges, move, roundTrip, staged, world } from "./carrier-boundary-support.js";

test("ordinary production carrier ascent/reverse route remains coherent and saveable through the former tick 1681 failure", () => {
  let s = roundTrip(fixtureGame());
  const items = structuredClone(s.inventory.items), identities = s.fleet.vehicles.map((v) => v.id);
  s = executeCommand(s, { type: "carrier", action: "helm" }, world).state;
  coherent(s);
  for (let i = 0; i < 600; i++) s = stepGame(s, [move(0, 0, 1)], world).state;
  coherent(s);
  for (let i = 0; i < 1400; i++) {
    s = stepGame(s, [move(-1), { type: "look", yawDelta: 0, pitchDelta: -s.player.pose.pitch }], world).state;
    coherent(s);
  }
  assert.equal(s.tick, 2000);
  assert.deepEqual(s.inventory.items, items);
  assert.deepEqual(s.fleet.vehicles.map((v) => v.id), identities);
});

test("boundary launch/capture prepared and lock interruptions keep exactly one vehicle and preserve cargo", () => {
  for (const configuration of ["compact", "medium"] as const) for (const edge of edges) {
    const yaw = (Math.atan2(448 - edge.x, -(-736 - edge.z)) + Math.PI * 2) % (Math.PI * 2);
    let s = staged(configuration, { x: edge.x, y: -0.9, z: edge.z }, yaw);
    s = command(s, "station-keep");
    s = command(s, "leave-helm");
    const vehicleId = configuration === "compact" ? "fixture_dart" : "fixture_creel";
    const ids = s.fleet.vehicles.map((v) => v.id), items = structuredClone(s.inventory.items);
    for (const type of ["launch", "capture"] as const) {
      s = command(s, type, vehicleId);
      for (const phase of ["prepared", "lock"]) {
        if (phase === "lock") s = stepGame(s, [], world).state;
        s = roundTrip(s);
        assert.equal(s.fleet.docking!.transaction!.phase, phase);
        let stopped = command(s, "interrupt");
        for (let i = 0; i < 35; i++) stopped = stepGame(stopped, [], world).state;
        coherent(stopped);
        assert.equal(!!stopped.fleet.vehicles.find((v) => v.id === vehicleId)!.berth, type === "launch");
        assert.equal(stopped.fleet.docking!.completed.length, type === "launch" ? 0 : 1);
      }
      for (let i = 0; i < 60; i++) {
        s = stepGame(s, [], world).state;
        coherent(s);
      }
      assert.equal(!!s.fleet.vehicles.find((v) => v.id === vehicleId)!.berth, type === "capture");
      assert.equal(s.fleet.docking!.completed.length, type === "launch" ? 1 : 2);
      assert.deepEqual(s.fleet.vehicles.map((v) => v.id), ids);
      assert.deepEqual(s.inventory.items, items);
    }
  }
});
