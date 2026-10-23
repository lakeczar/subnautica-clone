/** UX-1 sweep over the composed world: wherever the carrier moors, at every 15°
 * heading, a corridor the terrain obstructs gets advice, the advice is the
 * launch command's own refusal, and a turn it names really clears the corridor. */
import test from "node:test";
import assert from "node:assert/strict";
import { CARRIER_SUPPORTS, carrierCommand, carrierHull, corridorRemedy, fixtureGame, transferBlock, updateBerth } from "../src/sim/carrier.js";
import { launchCorridor } from "../src/sim/carrierStations.js";
import { gameWorld } from "../src/sim/world.js";

test("at every mooring and heading, corridor advice matches the launch refusal and a named turn clears it", () => {
  const world = gameWorld();
  let blocked = 0, turns = 0, checked = 0;
  for (const support of CARRIER_SUPPORTS) for (let deg = 0; deg < 360; deg += 15) {
    const s = fixtureGame(), h = carrierHull(s)!, dart = s.fleet.vehicles.find((v) => v.hull === "dart")!;
    h.pose.position = { x: support.x, y: Math.min(-1, support.y), z: support.z };
    h.pose.yaw = deg * Math.PI / 180;
    s.player.pose.position = { ...h.pose.position };
    updateBerth(s, world);
    const status = launchCorridor(s, world)!, block = transferBlock(s, dart, 0, "launch", world);
    checked++;
    assert.equal(status.clear, block === null, `${JSON.stringify(support)} ${deg}°`);
    if (block === null) continue;
    blocked++;
    assert.equal(carrierCommand(structuredClone(s), "launch", dart.id, world), status.advice, `${JSON.stringify(support)} ${deg}°: one message`);
    if (block !== "terrain") continue;
    const remedy = corridorRemedy(s, dart, world);
    if (!remedy || !("turn" in remedy)) continue;
    turns++;
    h.pose.yaw = ((h.pose.yaw + remedy.turn) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    updateBerth(s, world);
    assert.notEqual(transferBlock(s, dart, 0, "launch", world), "terrain", `${JSON.stringify(support)} ${deg}° + ${remedy.turn.toFixed(3)} clears`);
  }
  console.log(`corridor sweep: ${checked} poses, ${blocked} obstructed, ${turns} turn hints verified`);
  assert.ok(checked >= 24);
});
