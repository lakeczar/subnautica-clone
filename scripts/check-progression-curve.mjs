// Run after npm test (compiled production modules). Derives the IMPLEMENTED part of the
// acquisition curve from runtime rules only; planned/unbuilt rows live in PROGRESSION-CURVE.md.
import assert from "node:assert/strict";
import { guardLocalRun } from "./local-guard.mjs";

// On factory-worker, only inside a heavy-check job (STEW-2), and admitted before the
// compiled modules load. Routed, the job compiles them first.
guardLocalRun({ cls: "quick", before: "node scripts/test-build.mjs" });
const { EVIDENCE, EVIDENCE_BLUEPRINTS, FUTURE_BLUEPRINTS, RECIPES, RENEWABLE_SOURCE_IDS, SOURCE_RENEWAL, SOURCES } = await import("../.test-build/src/content/registry.js");
const { SUIT_RATINGS } = await import("../.test-build/src/content/registry.js");
const { CAMPAIGN_SOURCE_SITES } = await import("../.test-build/src/content/campaign/index.js");
const { HOST_KNOWLEDGE_RECIPES, UPGRADE_RECIPES, UPGRADE_REFIT_RECIPES } = await import("../.test-build/src/content/upgrades/registry.js");
const { SYS2_RECIPES } = await import("../.test-build/src/content/systems/items.js");
const { personalDepth } = await import("../.test-build/src/sim/capabilities.js");
const { completeOpening, craftingBlock, discover } = await import("../.test-build/src/sim/progression.js");
const { advanceRenewal, renewalCap } = await import("../.test-build/src/sim/renewal.js");
const { createGame } = await import("../.test-build/src/sim/state.js");
const { FIXED_SECONDS } = await import("../.test-build/src/sim/clock.js");
const { createWorldQueries } = await import("../.test-build/src/sim/world.js");

const world = createWorldQueries(), ids = Object.keys(RECIPES);
const opened = () => { const s = createGame(); completeOpening(s); return s; };
const visible = s => ids.filter(id => s.knowledge.blueprints.includes(RECIPES[id].bp));

// 1. Gate codes on a fresh, opened New Game at the pod.
const fresh = opened();
const newGame = Object.fromEntries(ids.map(id => [id, craftingBlock(fresh, id, world)?.code ?? "ready"]));
assert.ok(ids.every(id => id === "pod_repair" || newGame[id] !== "ready" && newGame[id] !== "materials"), "only the first repair is attemptable");

// 2. What each clue adds, independently of order.
const unlocks = Object.fromEntries(Object.keys(EVIDENCE).map(id => {
  const s = opened(), before = visible(s); discover(s, id);
  return [id, { blueprints: EVIDENCE_BLUEPRINTS[id], executable: visible(s).filter(r => !before.includes(r)),
    research: EVIDENCE_BLUEPRINTS[id].filter(bp => Object.hasOwn(FUTURE_BLUEPRINTS, bp)) }];
}));

// 3. Preceding personal protection and reachable source patches per recipe.
const limit = id => Math.max(60, ...RECIPES[id].needs.map(n => Object.hasOwn(SUIT_RATINGS, n) ? SUIT_RATINGS[n] : limit(n)));
const protectedDeposit = s => Object.hasOwn(CAMPAIGN_SOURCE_SITES, s) && CAMPAIGN_SOURCE_SITES[s].protection !== null;
// S5 works recipes' plans come only from deep, unplaced sites; tests/story-composed.test.ts audits them.
const STORY = ["service_power_assembly", "service_air_assembly", "pod_buffer"];
const recipes = Object.fromEntries(ids.filter(id => !STORY.includes(id)).map(id => {
  const before = limit(id), materials = Object.fromEntries(Object.entries(RECIPES[id].cost).map(([kind, q]) => {
    const patches = Object.keys(SOURCES).filter(s => SOURCES[s].item === kind && personalDepth(SOURCES[s].position) <= before && !protectedDeposit(s));
    assert.ok(patches.length >= 2, `${id}: ${kind}`);
    return [kind, { quantity: q, patches: patches.length, exposed: patches.reduce((n, s) => n + SOURCES[s].stock, 0) }];
  }));
  return [id, { blueprint: RECIPES[id].bp, needs: RECIPES[id].needs, site: RECIPES[id].site, protectionBefore: before,
    rescueStock: RECIPES[id].maintenance, materials }];
}));

// 4. Living-shed arithmetic, executed through the per-step rule from an empty source.
const renewal = Object.fromEntries(RENEWABLE_SOURCE_IDS.map(id => {
  const s = opened(), node = s.world.resources.find(n => n.id === id);
  node.stock = 0; let steps = 0;
  while (node.stock < renewalCap(id)) { advanceRenewal(s); steps++; }
  for (let i = 0; i < SOURCE_RENEWAL[id].intervalSteps * 2; i++) advanceRenewal(s);
  assert.equal(node.stock, renewalCap(id), "never exceeds its cap");
  return [id, { item: SOURCES[id].item, perInterval: SOURCE_RENEWAL[id].quantity,
    intervalMinutes: SOURCE_RENEWAL[id].intervalSteps * FIXED_SECONDS / 60, cap: renewalCap(id),
    finiteReserve: SOURCES[id].reserve, emptyToCapActiveMinutes: steps * FIXED_SECONDS / 60 }];
}));
const finite = kind => Object.values(SOURCES).filter(s => s.item === kind).reduce((n, s) => n + s.stock + s.reserve, 0);
// C4's optional upgrades and SYS-2 modules are not progression demand: the upgrade
// economy (scripts/upgrade-economy.mjs) and the campaign ledger's optional spend own them.
const C4 = new Set(Object.keys({ ...UPGRADE_RECIPES, ...UPGRADE_REFIT_RECIPES, ...HOST_KNOWLEDGE_RECIPES, ...SYS2_RECIPES }));
const demand = kind => ids.filter(id => !C4.has(id)).reduce((n, id) => n + (RECIPES[id].maintenance ? 0 : RECIPES[id].cost[kind] ?? 0), 0);
const solvency = Object.fromEntries(["flex_membrane", "buoyant_resin"].map(k => [k, { implementedDemand: demand(k), finiteStockAndReserve: finite(k) }]));
for (const [k, v] of Object.entries(solvency)) assert.ok(v.finiteStockAndReserve >= v.implementedDemand, `${k}: zero-renewal solvency`);

console.log(JSON.stringify({ scope: "Implemented runtime rules only; staged rule checks, not play time", newGame, unlocks, recipes, renewal, solvency }, null, 2));
