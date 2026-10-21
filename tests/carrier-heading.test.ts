import test from "node:test";
import assert from "node:assert/strict";
import { carrierCommand, fixtureGame } from "../src/sim/carrier.js";
import { createWorldQueries } from "../src/sim/world.js";

// Open water: only the carrier's own structure can refuse the transfer.
const open = createWorldQueries([], () => -1000);

test("a berthed craft launches at any carrier heading and at the Divide lee depth", () => {
  const refused: string[] = [];
  for (let k = 0; k < 96; k++) {
    // The Divide lee pose from the C3 playthrough: 390 m down (the other-craft check had a
    // 200 m stand-in floor) and an oblique heading (a world round trip put the lock leg
    // an ulp into the lock floor).
    const yaw = k === 0 ? 0.3805063771129369 : (k / 96) * Math.PI * 2;
    const s = fixtureGame(), h = s.fleet.vehicles.find((v) => v.hull === "hearthline")!;
    h.pose.position = { x: 559.5819135545207, y: -389.7243383071843, z: -1118.9547838863032 };
    h.pose.yaw = yaw;
    const no = carrierCommand(s, "launch", "fixture_dart", open);
    if (no) refused.push(`${yaw.toFixed(4)}: ${no}`);
  }
  assert.deepEqual(refused, []);
});

test("a medium-berth Mantle launches at the Divide lee heading", () => {
  const s = fixtureGame(), h = s.fleet.vehicles.find((v) => v.hull === "hearthline")!;
  for (const v of s.fleet.vehicles) if (v.berth) { v.berth = null; v.pose.position = { x: 60 + v.pose.position.x, y: -20, z: 40 }; }
  s.fleet.docking!.configuration = "medium";
  const dart = s.fleet.vehicles.find((v) => v.id === "fixture_dart")!;
  dart.hull = "mantle";
  dart.berth = { carrierId: h.id, slot: 0, pose: { frame: "carrier-local", position: { x: -3, y: 4, z: 1 }, yaw: 0 } };
  h.pose.position = { x: 559.5819135545207, y: -389.7243383071843, z: -1118.9547838863032 };
  h.pose.yaw = 0.3805063771129369;
  assert.equal(carrierCommand(s, "launch", dart.id, open), null);
});
