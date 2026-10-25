// C4 stage B heavy tier (TT-1): the adverse case plays a decode and a crop to completion
// after a death (about 18 game-minutes). tests/c4-systems.test.ts keeps the rest and a fast smoke.
import test from "node:test";
import assert from "node:assert/strict";
import { incapacitate } from "../src/sim/recovery.js";
import { conservedTotals } from "../src/sim/systems/outposts.js";
import { at } from "./b1-support.js";
import { LEDGE, busyOutpost, idle, roundTrip, run, world } from "./c4-systems-support.js";

test("ADVERSE: dying while an outpost runs a decode and grows a crop loses and duplicates nothing; the save round-trips", () => {
  const { s, outpost, decoder, planter } = busyOutpost();
  const totals = conservedTotals(s, s.systems), decode = structuredClone(s.systems.decodes), crop = structuredClone(s.systems.planters);
  const sockets = structuredClone(s.systems.sockets);
  at(s, { x: LEDGE.x + 3, y: LEDGE.y + 2, z: LEDGE.z }, "swimming");
  incapacitate(s, "Test: drowned beside the outpost.", world);
  assert.deepEqual(conservedTotals(s, s.systems), totals, "every item, module and kit counted once");
  assert.deepEqual(s.systems.sockets, sockets, "both modules stay socketed");
  assert.deepEqual(s.systems.decodes, decode, "the decode is kept where it stood");
  assert.deepEqual(s.systems.planters, crop, "the crop is kept");
  assert.equal(s.systems.outposts.find((o) => o.id === outpost)?.tier, "standard");
  for (const id of [decoder, planter]) assert.equal(s.inventory.items.filter((i) => i.id === id).length, 0, "socketed modules are not inventory");
  let after = roundTrip(s);
  // Back at the ledge, both resume and finish: the decode pays its plan, the crop harvests.
  at(after, { ...LEDGE, y: LEDGE.y + 0.6 }, "swimming");
  for (let n = 0; n < 12 && !after.systems.decoded.includes("reef_pumphouse_log"); n++) after = idle(60, after);
  assert.ok(after.systems.decoded.includes("reef_pumphouse_log"), "the decode finished");
  assert.ok(after.knowledge.blueprints.includes("bp_small_fabricator"), "and granted the field fabricator plan");
  after = idle(Math.max(0, 360 - after.systems.planters[0]!.progress) + 1, after);
  at(after, { ...LEDGE, y: LEDGE.y + 0.6 }, "swimming");
  const meals = after.inventory.items.filter((i) => i.kind === "meal").reduce((n, i) => n + i.quantity, 0);
  after = run(after, { type: "harvest", hostId: outpost, socket: "s1" }).state;
  assert.equal(after.inventory.items.filter((i) => i.kind === "meal").reduce((n, i) => n + i.quantity, 0), meals + 2);
  roundTrip(after);
});
