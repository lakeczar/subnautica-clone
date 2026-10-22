// Run after `npm test` (compiled production modules). S9 campaign economy for both
// fleet strategies, against the real registry:
//   1. the composed story planner (planCampaign on real recipes, deposits and plans);
//   2. the finite-stock ledger: required progression + one credible optional spend +
//      one failed rescue, zero renewal; any single deposit lost; exposed-only margins;
//   3. runtime commands for the executable tiers: real collection at the late deposits
//      (positions staged, as in B1's script) and the real suit/Creel refits 450 → 800.
// Optional: --out <result.json>
import assert from "node:assert/strict";
import fs from "node:fs";
import { CONTENT_VERSION, MATERIALS, RECIPES, RENEWABLE_SOURCE_IDS, SOURCES } from "../.test-build/src/content/registry.js";
import { CAMPAIGN_SOURCE_SITES } from "../.test-build/src/content/campaign/index.js";
import { FIRST_WORKABLE } from "../.test-build/src/content/c4Sources.js";
import { audit, planRegistryCampaign } from "../.test-build/src/sim/storyCampaign.js";
import { finiteStock, runScenario, solvency } from "../.test-build/src/sim/campaignEconomy.js";
import { createGame } from "../.test-build/src/sim/state.js";
import { collectWithOutcome, completeOpening, craft, discover } from "../.test-build/src/sim/progression.js";
import { recordStory } from "../.test-build/src/sim/storyLink.js";
import { addItem, transfer } from "../.test-build/src/sim/inventory.js";
import { personalLimit } from "../.test-build/src/sim/capabilities.js";
import { createWorldQueries } from "../.test-build/src/sim/world.js";
import { createEnvelope, decodeSave, encodeSave, SAVE_SCHEMA_VERSION } from "../.test-build/src/save/codec.js";
import { validState } from "../.test-build/src/save/validation.js";

const args = process.argv.slice(2), out = args[args.indexOf("--out") + 1];
assert.ok(args.length === 0 || (args.length === 2 && args[0] === "--out"), "only --out is supported");
const STRATEGIES = ["independent", "carrier"];
const KINDS = [...Object.keys(MATERIALS), "tagged_frame"];

// 1. Planner.
const planner = Object.fromEntries(STRATEGIES.map((strategy) => {
  const blocked = audit(strategy).filter((a) => a.blocked.length);
  assert.deepEqual(blocked, [], `${strategy}: every step has real content`);
  const plan = planRegistryCampaign(strategy);
  assert.equal(plan.ending, true, `${strategy}: the composed planner reaches the ending`);
  return [strategy, { ending: plan.ending, steps: plan.steps, hulls: plan.caps.hulls, suit: plan.caps.suit, stops: [...plan.caps.stops] }];
}));

// 2. Ledger.
const counted = Object.keys(SOURCES).filter((id) => SOURCES[id].item !== "meal");
const ledger = Object.fromEntries(STRATEGIES.map((strategy) => {
  const full = solvency(strategy);
  assert.equal(full.solvent, true, `${strategy}: ${JSON.stringify(full.shortfalls)}`);
  assert.equal(full.renewalCredited, 0);
  assert.ok(full.rebuild?.fits, `${strategy}: canister`);
  const required = runScenario(strategy), exposedOnly = runScenario(strategy, { exposedOnly: true });
  assert.equal(required.solvent, true);
  const loseOne = counted.filter((id) => !runScenario(strategy, { failure: true, without: [id] }).solvent);
  assert.deepEqual(loseOne, [], `${strategy}: required + failed rescue survive any one deposit`);
  const loseOneFull = counted.filter((id) => !solvency(strategy, [id]).solvent);
  assert.ok(loseOneFull.every((id) => RENEWABLE_SOURCE_IDS.includes(id)), `${strategy}: only living sheds are load-bearing: ${loseOneFull}`);
  const margin = Object.fromEntries(KINDS.map((k) => [k, { stock: finiteStock(k), spent: full.spent[k] ?? 0, left: full.remaining[k], reserveSorted: full.reserveUsed[k] ?? 0 }]));
  return [strategy, {
    acts: full.acts, margin, lost: full.lost, rebuild: full.rebuild,
    requiredExposedOnly: { solvent: exposedOnly.solvent, shortfalls: exposedOnly.shortfalls },
    loadBearingWithOptional: loseOneFull,
    trips: full.trips,
  }];
}));

// 3. Runtime: real collection and real refits. Positions are staged diagnostics.
const world = createWorldQueries();
const WORKSHOP = { x: 10, y: 1.2, z: -34 };
const meta = { sessionId: "s9-campaign-economy", createdAt: "2026-10-20T00:00:00.000Z", savedAt: "2026-10-20T00:01:00.000Z" };
let s = createGame(); completeOpening(s);
for (const id of ["C02", "C03", "C04", "C05", "C06"]) discover(s, id);
recordStory(s, "C07");
const at = (p) => { s.player.pose.position = { ...p }; s.player.mode = p.y < 0 ? "swimming" : "walking";
  s.player.controlledVehicleId = null; s.player.interiorId = null; s.player.interiorPose = null; s.player.velocity = { x: 0, y: 0, z: 0 }; };
const saveable = () => {
  assert.ok(validState(s)); const e = encodeSave(createEnvelope(s, meta)); assert.ok(e.ok);
  const d = decodeSave(e.value); assert.ok(d.ok); assert.deepEqual(d.value.state, s);
};
// The B1 prefix is proved by check-m2-b1-economy.mjs; here it is funded at the bench.
const fund = (id) => {
  const r = RECIPES[id]; at(r.site === "island_workshop" ? WORKSHOP : { x: 0, y: 0.18, z: 21.2 });
  if (!r.maintenance) for (const [k, q] of Object.entries(r.cost)) addItem(s, k, q, r.site === "island_workshop" && id !== "restore_workshop" ? "workshop_locker" : "diver");
  assert.equal(craft(s, id, world), null, id);
};
for (const id of ["pod_repair", "essential_tools", "suit_150", "bobbin_kit", "salvage_buoy", "reserve_cells", "restore_workshop", "suit_350", "creel_base", "creel_350"]) fund(id);
const collected = {};
/** Real collection of `need` units from first-access deposits within the current suit. */
const gather = (kind, need) => {
  // C4: CB's frontier ledges are the first workable core and lattice (FIRST_WORKABLE).
  const hosts = [...new Set([...(FIRST_WORKABLE[kind] ?? []),
    ...Object.keys(CAMPAIGN_SOURCE_SITES).filter((id) => SOURCES[id].item === kind && CAMPAIGN_SOURCE_SITES[id].first)])];
  for (const id of hosts) while (need > 0 && s.world.resources.find((n) => n.id === id).stock > 0) {
    assert.ok(-SOURCES[id].position.y <= personalLimit(s), `${id} inside the suit`);
    at({ ...SOURCES[id].position, y: SOURCES[id].position.y + 0.5 });
    const got = collectWithOutcome(s, id); assert.equal(got.refusal, null, `${id}: ${got.refusal}`);
    need -= got.pickup.quantity; collected[id] = (collected[id] ?? 0) + got.pickup.quantity;
    at(WORKSHOP);
    for (const i of s.inventory.items.filter((i) => i.containerId === "diver" && i.kind === kind)) assert.equal(transfer(s, i.id, "workshop_locker", i.quantity), null);
  }
  assert.ok(need <= 0, `${kind} short ${need}`);
};
const runtime = [];
for (const id of ["suit_450", "creel_450", "suit_800", "creel_800"]) {
  const r = RECIPES[id];
  for (const [k, q] of Object.entries(r.cost)) {
    if (k === "pressure_ceramic" || k === "thermal_core" || k === "brine_lattice") gather(k, q);
    else addItem(s, k, q, "workshop_locker"); // early stock: funded; the ledger counts it
  }
  at(WORKSHOP); assert.equal(craft(s, id, world), null, id); saveable();
  runtime.push({ recipe: id, suit: personalLimit(s), creel: s.fleet.vehicles.find((v) => v.hull === "creel").rating });
}
assert.deepEqual(runtime.at(-1), { recipe: "creel_800", suit: 800, creel: 800 });
for (const id of Object.keys(collected)) assert.ok(collected[id] <= SOURCES[id].stock, `${id}: exposed stock only`);

const result = { schema: SAVE_SCHEMA_VERSION, content: CONTENT_VERSION,
  scope: "Real registry. Planner: capability-level story graph. Ledger: finite stock, zero renewal, no route time or oxygen. Runtime: staged positions, real collection and refit commands.",
  planner, ledger, runtime: { refits: runtime, collected } };
if (out) fs.writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
