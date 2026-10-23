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
  // Each mooring as moored, and low over the seabed (keel datum 4 m up, so the
  // corridor, which drops 3 m under the keel, meets slopes) at it and on a 25 m ring.
  const low = (x: number, z: number) => ({ x, y: Math.min(-1, world.groundHeight(x, z) + 4), z });
  const poses = CARRIER_SUPPORTS.flatMap((p) => [{ x: p.x, y: Math.min(-1, p.y), z: p.z }, low(p.x, p.z),
    ...Array.from({ length: 8 }, (_, k) => low(p.x + 25 * Math.cos(k * Math.PI / 4), p.z + 25 * Math.sin(k * Math.PI / 4)))]);
  const kinds = new Map<string, number>();
  for (const support of poses) for (let deg = 0; deg < 360; deg += 15) {
    const s = fixtureGame(), h = carrierHull(s)!, dart = s.fleet.vehicles.find((v) => v.hull === "dart")!;
    h.pose.position = { ...support };
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
    const remedy = corridorRemedy(s, dart, world), kind = remedy ? Object.keys(remedy)[0]! : "none";
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    if (!remedy || !("turn" in remedy)) continue;
    turns++;
    h.pose.yaw = ((h.pose.yaw + remedy.turn) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    updateBerth(s, world);
    assert.notEqual(transferBlock(s, dart, 0, "launch", world), "terrain", `${JSON.stringify(support)} ${deg}° + ${remedy.turn.toFixed(3)} clears`);
  }
  console.log(`corridor sweep: ${checked} poses, ${blocked} obstructed, ${turns} turn hints verified; terrain remedies ${JSON.stringify(Object.fromEntries(kinds))}`);
  assert.ok(checked >= 48);
  assert.ok(blocked > 0 && turns > 0, "the sweep met obstructed corridors and verified turn hints");
});
