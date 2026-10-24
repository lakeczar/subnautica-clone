// Run after npm test (compiled production modules). Only the registry is runtime authority.
import assert from "node:assert/strict";
import fs from "node:fs";
import { CONTENT_VERSION, RECIPES, SOURCES, ITEMS, PLACES } from "../.test-build/src/content/registry.js";
import { LEGACY_TERRAIN_SOURCE_IDS } from "../.test-build/src/content/routes.js";
import { createGame } from "../.test-build/src/sim/state.js";
import { collect, completeOpening, craft, discover, toggleBuoy } from "../.test-build/src/sim/progression.js";
import { available, fabricationContainers, materialStoragePreview, storeMaterials, transfer, usedCapacity } from "../.test-build/src/sim/inventory.js";
import { installModule } from "../.test-build/src/sim/modules.js";
import { createWorldQueries } from "../.test-build/src/sim/world.js";
import { validState } from "../.test-build/src/save/validation.js";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const delta = JSON.parse(read("../docs/build/design/M1-PLAY-ECONOMY.json"));
// STEW-1 (F28): this script keeps M1's current invariant, the opening's solvency
// played through real transactions. Its adoption receipt (the historical
// proposal's hash, its literal content tags, a hand-listed recipe roster and the
// per-recipe reconciliation against economy-candidate.json) was retired from the
// merge gate by DIRECTION's no-hash-inventory rule; see git history before STEW-1.
const m1Ids = [...delta.preCanopy, ...Object.keys(delta.optionalReturn)];
assert.equal(new Set(m1Ids).size, m1Ids.length, "each adopted M1 recipe is covered exactly once");
assert.equal(new Set(delta.preCanopy).size, delta.preCanopy.length);
for (const id of m1Ids) assert.ok(RECIPES[id], `${id}: an M1 recipe the opening budget names is still in the registry`);
const sumCosts = (ids) => {
  const out = {};
  for (const id of ids) for (const [k, n] of Object.entries(RECIPES[id].cost)) out[k] = (out[k] ?? 0) + n;
  return out;
};
const cu = (quantities) => Object.entries(quantities).reduce((n, [k, q]) => n + ITEMS[k].cu * q, 0);
const starterSpend = sumCosts(delta.preCanopy.filter((id) => !RECIPES[id].maintenance));
const optionalSpend = sumCosts(Object.keys(delta.optionalReturn));
assert.deepEqual(starterSpend, delta.budget.publicStarterSpend); assert.deepEqual(optionalSpend, delta.budget.optionalReturnSpend);
assert.equal(cu(starterSpend), delta.budget.publicStarterCu); assert.deepEqual(RECIPES.bobbin_kit.cost, delta.budget.rescueOnlyKitSpend);
assert.deepEqual(RECIPES.dart_base.cost, { structural_alloy: 6, silica_glass: 3, flex_membrane: 2 });
const stock = {}, starterStock = {}, patches = {};
// M1 solvency must precede Basin access. New stock cannot cover a missing old
// source or pay the optional return upgrade that helps prepare that next route.
for (const id of LEGACY_TERRAIN_SOURCE_IDS) {
  const source = SOURCES[id];
  stock[source.item] = (stock[source.item] ?? 0) + source.stock;
  if (["refuge_reef", "island_chain"].includes(source.region)) {
    assert.ok(-source.position.y <= 60, "starter sources precede suit/vehicle protection");
    starterStock[source.item] = (starterStock[source.item] ?? 0) + source.stock;
  }
  (patches[source.item] ??= []).push(source.label);
  assert.ok(ITEMS[source.item].cu * source.bundle <= delta.budget.diverCu, "whole bundle fits an empty diver hold");
}
for (const [kind, n] of Object.entries(starterSpend)) { assert.ok(starterStock[kind] >= n); assert.ok(patches[kind].length >= 2); }
for (const [kind, n] of Object.entries(optionalSpend)) {
  assert.ok(stock[kind] >= n); assert.ok(patches[kind].length >= 2);
  assert.ok(delta.optionalReturn.dart_acoustic_trim.firstObservedCargo[kind] >= n);
}
const frameCu = cu(RECIPES.dart_base.cost);
assert.equal(frameCu, 17); assert.ok(frameCu > delta.budget.diverCu && frameCu <= delta.budget.buoyCu && frameCu <= delta.budget.dartCu);
// Workshop repair rounds to a 4-alloy/2-glass payload plus the packed buoy and two cells.
assert.equal(4 * ITEMS.structural_alloy.cu + 2 * ITEMS.silica_glass.cu + ITEMS.salvage_buoy.cu + 2 * ITEMS.reserve_cell.cu, 16);

function stagedPreparation(order) {
  const s = createGame(), world = createWorldQueries(); completeOpening(s);
  for (const id of order === "reef-first" ? ["C02", "C03"] : ["C03", "C02"]) discover(s, id);
  const startingResources = structuredClone(s.world.resources), receipts = [], sources = {};
  const peak = { diver: 0, buoy_hold: 0, dart: 0 };
  function check() {
    for (const c of s.inventory.containers) assert.ok(usedCapacity(s, c.id) <= c.capacity, `${order}: ${c.id} overflow`);
    assert.ok(validState(s), `${order}: strict state after each transaction`);
    for (const id of ["diver", "buoy_hold"]) peak[id] = Math.max(peak[id], usedCapacity(s, id));
    if (s.fleet.vehicles[0]) peak.dart = Math.max(peak.dart, usedCapacity(s, s.fleet.vehicles[0].cargoId));
  }
  function visit(position) {
    s.player.pose.position = { ...position }; s.player.velocity = { x: 0, y: 0, z: 0 };
    s.player.mode = position.y < 0 ? "swimming" : "walking";
  }
  function gather(id) {
    visit(SOURCES[id].position); assert.equal(collect(s, id), null, `${order}: ${id} whole-bundle collection`);
    sources[id] = (sources[id] ?? 0) + 1; check();
  }
  const firstRegion = order === "reef-first" ? "refuge_reef" : "island_chain";
  gather(Object.entries(SOURCES).find(([, d]) => d.region === firstRegion && d.item === "meal")[0]);
  for (const id of delta.preCanopy) {
    const r = RECIPES[id], bench = r.site === "island_workshop" ? PLACES.island_workshop.position : PLACES.home_pod.position;
    const locker = r.site === "island_workshop" ? "workshop_locker" : "pod_locker";
    visit(bench);
    // Two carried meals make the packed-buoy payload too large for the whole repair
    // bundles. Deploying the reusable buoy frees its 2 CU; no prerequisite changed.
    if (id === "restore_workshop") { assert.equal(toggleBuoy(s), null); check(); }
    if (!r.maintenance) for (const [kind, n] of Object.entries(r.cost)) {
      while (available(s, kind, fabricationContainers(s, r.site)) < n) {
        const options = Object.entries(SOURCES).filter(([sid, d]) => d.item === kind && ["refuge_reef", "island_chain"].includes(d.region) && s.world.resources.find((a) => a.id === sid).stock > 0);
        const preferred = order === "reef-first" ? "refuge_reef" : "island_chain";
        options.sort((a, b) => Number(b[1].region === preferred) - Number(a[1].region === preferred));
        assert.ok(options.length, `${order}: reachable exposed ${kind}`);
        gather(options[0][0]); visit(bench);
        // Before restoration use the diver/buoy, never consume a locked locker.
        if (!materialStoragePreview(s, "diver", locker).refusal) assert.equal(storeMaterials(s, "diver", locker), null);
        check();
      }
    }
    // Prove real local buoy sourcing at the pod, then pack it empty for the island.
    if (id === "reserve_cells") {
      assert.equal(toggleBuoy(s), null); assert.equal(storeMaterials(s, "pod_locker", "buoy_hold"), null); check();
    }
    const containers = fabricationContainers(s, r.site), diverBefore = usedCapacity(s, "diver");
    assert.equal(craft(s, id, world), null, `${order}: ${id}`); check();
    receipts.push({ id, containers, diverBefore, diverAfter: usedCapacity(s, "diver") });
    if (!materialStoragePreview(s, "diver", locker).refusal) assert.equal(storeMaterials(s, "diver", locker), null);
    if (id === "reserve_cells" || id === "restore_workshop") {
      if (!materialStoragePreview(s, "buoy_hold", locker).refusal) assert.equal(storeMaterials(s, "buoy_hold", locker), null);
      assert.equal(toggleBuoy(s), null);
    }
    check();
  }
  // Two meals, both cells and the packed buoy fit alongside the observed first 4+4 return.
  for (const id of ["canopy_grounding_fins_upper", "canopy_resin_lee_upper"]) { gather(id); gather(id); }
  assert.equal(usedCapacity(s, "diver"), 16, "4+4 cargo, meals2, cells4 CU, packed buoy2 CU");
  const v = s.fleet.vehicles[0]; visit(v.pose.position);
  for (const kind of ["conductive_crust", "buoyant_resin"]) {
    const item = s.inventory.items.find((i) => i.kind === kind && i.containerId === "diver");
    assert.equal(item.quantity, 4); assert.equal(transfer(s, item.id, v.cargoId, 4), null); check();
  }
  discover(s, "C04"); visit(PLACES.island_workshop.position);
  assert.ok(fabricationContainers(s, "island_workshop").includes(v.cargoId));
  assert.equal(craft(s, "dart_acoustic_trim", world), null); check();
  const item = s.inventory.items.find((i) => i.kind === "dart_acoustic_trim");
  assert.equal(installModule(s, v.id, item.id), null); check();
  for (const kind of ["conductive_crust", "buoyant_resin"]) assert.equal(available(s, kind, [v.cargoId]), 2);
  assert.equal(usedCapacity(s, v.cargoId), 6, "remaining 2+2 cargo plus installed 2 CU trim");
  assert.deepEqual(s.world.maintenance, { alloy: 14, glass: 0, membrane: 7 });
  for (const original of startingResources) {
    const now = s.world.resources.find((r) => r.id === original.id);
    assert.ok(now.stock <= original.stock); assert.equal(now.reserve, original.reserve, "no reserve sorting/replenishment");
  }
  return { order, scope: "Staged source/bench positions, real collection/crafting/transfer/install transactions; no movement, survival or ordinary-input claim",
    sources, receipts, peakCu: peak, firstCanopyPayloadCu: 16, installedHoldCu: usedCapacity(s, v.cargoId), moduleId: item.id,
    publicFrameInvestment: v.investment, collections: s.metrics.collections };
}
console.log(JSON.stringify({ scope: delta.limits, content: CONTENT_VERSION,
  comparedRecipes: m1Ids.length, executableRecipes: Object.keys(RECIPES).length,
  starterSpend, starterRawCu: cu(starterSpend), optionalReturnSpend: optionalSpend, optionalRawCu: cu(optionalSpend),
  exposedStarterStock: starterStock, exposedStock: stock, starterRemaining: Object.fromEntries(Object.entries(starterSpend).map(([k, n]) => [k, starterStock[k] - n])),
  rescueOnlyKitSpend: RECIPES.bobbin_kit.cost, frameCu, capacities: { diver: delta.budget.diverCu, buoy: delta.budget.buoyCu, dart: delta.budget.dartCu },
  scenarios: [stagedPreparation("reef-first"), stagedPreparation("island-first")] }, null, 2));
