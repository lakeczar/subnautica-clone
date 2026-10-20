import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { ITEMS } from "../src/content/registry.js";
import { SYS2_ITEMS } from "../src/content/systems/items.js";
import { transfer } from "../src/sim/inventory.js";
import { incapacitate } from "../src/sim/recovery.js";
import { advanceDecodes, decodeViews, discoverSite, startDecode } from "../src/sim/systems/decoder.js";
import { installModule, removeModule } from "../src/sim/systems/hosts.js";
import { incapacitateKeepingInstances, instanceProblems, retainsIdentity } from "../src/sim/systems/instances.js";
import { deployOutpost, packOutpost } from "../src/sim/systems/outposts.js";
import { validSystems } from "../src/sim/systems/state.js";
import { give, opened, siteTable, SPOTS, swimTo } from "./systems-support.js";

// Recovery rebuilds cache stacks from ITEMS, so compose the proposed rows here as
// the coordinator will, and take them out again afterwards.
const composed = Object.keys(SYS2_ITEMS).filter((k) => !Object.hasOwn(ITEMS, k));
before(() => Object.assign(ITEMS, SYS2_ITEMS));
after(() => { for (const k of composed) delete (ITEMS as Record<string, unknown>)[k]; });

/** A thermal outpost at SPOTS.a; a decode at 99 s whose decoder sits in the diver hold. */
function midDecode() {
  const { s, sys } = opened();
  const id = give(s, "outpost_kit_basic");
  swimTo(s, SPOTS.a);
  assert.equal(deployOutpost(s, sys, id, SPOTS.a, siteTable({ ventDistance: 4 })), null);
  const decoder = give(s, "mod_decoder");
  installModule(s, sys, id, "s0", decoder);
  discoverSite(sys, "demo_relay_hut");
  startDecode(s, sys, id, "demo_hut_fragment");
  advanceDecodes(s, sys, 99);
  assert.equal(removeModule(s, sys, id, "s0"), null);
  return { s, sys, id, decoder };
}

test("modules and kits are identity items; seeds, beacons and produce are not", () => {
  for (const k of ["mod_decoder", "mod_planter", "mod_locker", "outpost_kit_basic", "outpost_kit_advanced"]) assert.ok(retainsIdentity(k), k);
  for (const k of ["seed_staple_cup", "nav_beacon", "field_salve", "bio_cell", "structural_alloy"]) assert.ok(!retainsIdentity(k), k);
});

test("the unadapted incapacity rule would orphan a paused decode: the reason for the SYS-2 rule", () => {
  const { s, sys, decoder } = midDecode();
  incapacitate(s, "Test.");
  assert.ok(!s.inventory.items.some((i) => i.id === decoder));
  assert.match(instanceProblems(s, sys).join("\n"), /decode demo_hut_fragment references missing decoder/);
});

test("death → cache → retrieval: identity items stay with the diver, ordinary cargo caches, the decode resumes", () => {
  const { s, sys, id, decoder } = midDecode();
  give(s, "seed_staple_cup", 2);
  give(s, "silica_glass", 2);
  const kit = give(s, "outpost_kit_basic");
  const lossAt = { ...s.player.pose.position };
  incapacitateKeepingInstances(s, "Test.");
  assert.equal(s.metrics.failures, 1);
  assert.equal(s.inventory.items.find((i) => i.id === decoder)?.containerId, "diver", "the decoder keeps its ID and place");
  assert.equal(s.inventory.items.find((i) => i.id === kit)?.containerId, "diver");
  const cache = s.recovery.caches.at(-1)!;
  assert.deepEqual(cache.position, lossAt);
  const cached = s.inventory.items.filter((i) => i.containerId === cache.containerId);
  assert.deepEqual(cached.map((i) => i.kind).sort(), ["seed_staple_cup", "silica_glass"]);
  assert.deepEqual(instanceProblems(s, sys), []);
  assert.ok(validSystems(sys));
  assert.equal(decodeViews(s, sys)[0]!.progress, 99);
  // Retrieve the cache, refit the decoder: the job finishes from 99 s.
  swimTo(s, cache.position);
  for (const i of cached) assert.equal(transfer(s, i.id, "diver", i.quantity), null);
  assert.equal(installModule(s, sys, id, "s0", decoder), null);
  advanceDecodes(s, sys, 81);
  assert.deepEqual(sys.decoded, ["demo_hut_fragment"]);
  assert.deepEqual(instanceProblems(s, sys), []);
});

test("a packed kit and its remembered modules survive incapacity and redeploy with the work intact", () => {
  const { s, sys, id, decoder } = midDecode();
  installModule(s, sys, id, "s0", decoder);
  give(s, "structural_alloy", 1);
  assert.equal(packOutpost(s, sys, id), null);
  incapacitateKeepingInstances(s, "Test.");
  assert.deepEqual(instanceProblems(s, sys), []);
  assert.deepEqual(sys.packed[0]!.layout, [{ socket: "s0", itemId: decoder }]);
  swimTo(s, SPOTS.b);
  assert.equal(deployOutpost(s, sys, id, SPOTS.b, siteTable({ ventDistance: 4 })), null);
  advanceDecodes(s, sys, 81);
  assert.deepEqual(sys.decoded, ["demo_hut_fragment"]);
});
