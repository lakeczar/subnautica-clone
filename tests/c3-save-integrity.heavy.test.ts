// C3 save integrity, heavy tier (TT-1): the Rift plume disables a parked Creel on its
// own (up to 12000 steps) before salvage. tests/c3-save-integrity.test.ts keeps the rest and a fast smoke.
import test from "node:test";
import assert from "node:assert/strict";
import { executeCommand, stepGame } from "../src/sim/step.js";
import { creelFirst, parkCreel, pilotCreel, world } from "./b1-support.js";
import { roundTrips } from "./c3-save-integrity-support.js";

test("C3-R1-2: salvaging a heat-disabled Creel drops its ecology exposure, and the save writes at once and after a step", () => {
  let s = creelFirst(["creel_350"]);
  const v = parkCreel(s, { x: -165, y: -280, z: -1065 }); pilotCreel(s); s.tick = 1800;
  let steps = 0;
  while (!s.fleet.vehicles.find((x) => x.id === v.id)!.disabled && steps < 12000) { s = stepGame(s, [], world).state; steps++; }
  assert.ok(s.fleet.vehicles.find((x) => x.id === v.id)!.disabled, "the plume disables the Creel");
  s = executeCommand(s, { type: "exit" }, world).state;
  assert.ok(s.world.ecology.hulls.some((h) => h.id === v.id), "the hull carries heat exposure");
  assert.ok(roundTrips(s), "saveable before salvage");
  const r = executeCommand(s, { type: "recover", vehicleId: v.id, method: "salvage" }, world);
  s = r.state;
  assert.ok(!s.fleet.vehicles.some((x) => x.id === v.id), r.state.feedback);
  assert.ok(!s.world.ecology.hulls.some((h) => h.id === v.id), "exposure leaves with the hull");
  assert.notEqual(s.world.ecology.controlled, v.id);
  assert.ok(roundTrips(s), "saveable immediately after salvage");
  s = stepGame(s, [], world).state;
  assert.ok(roundTrips(s), "saveable after the next step");
});
