import test from "node:test";
import assert from "node:assert/strict";
import {
  BLUEPRINTS, EVIDENCE_BLUEPRINTS, HULLS, ITEMS, MATERIALS, RECIPES, REFIT_TIERS, SOURCES, TECH_RECORDS,
  type ItemKind, type RecipeId, type SourceId,
} from "../src/content/registry.js";
import {
  CAMPAIGN_HULL_ROLES, CAMPAIGN_ITEMS, CAMPAIGN_PENDING, CAMPAIGN_PLAN_SOURCES, CAMPAIGN_RECIPES, CAMPAIGN_SITES,
  CAMPAIGN_SOURCE_SITES, CAMPAIGN_SOURCES, CAMPAIGN_TECH_RECORDS, DART_QUIET, HEARTHLINE_CAMPAIGN, HUNTER_INTEREST_LOUDNESS,
  HUNTER_TERRITORY_M, HUSH_HANDLING, SERVICE_STOPS,
} from "../src/content/campaign/index.js";
import { STORY_GRANTS, STORY_RECIPES } from "../src/content/story/evidence.js";
import { personalLimit } from "../src/sim/capabilities.js";
import { addItem } from "../src/sim/inventory.js";
import { collectWithOutcome, craft, craftingBlock, readTechRecord } from "../src/sim/progression.js";
import { executeCommand } from "../src/sim/step.js";
import { recordStory } from "../src/sim/storyLink.js";
import { validState } from "../src/save/validation.js";
import type { GameState } from "../src/sim/types.js";
import { at, creelFirst, creelOf, fund, saveable, world, WORKSHOP_BENCH } from "./b1-support.js";

const CAMPAIGN = Object.keys(CAMPAIGN_RECIPES) as (keyof typeof CAMPAIGN_RECIPES)[];
const depth = (id: SourceId): number => -SOURCES[id].position.y;

test("the registry carries every campaign recipe, item, deposit and plan, from the eight shared materials", () => {
  for (const id of CAMPAIGN) {
    assert.deepEqual(RECIPES[id], CAMPAIGN_RECIPES[id], id);
    for (const k of Object.keys(RECIPES[id].cost)) assert.ok(Object.hasOwn(MATERIALS, k) || k === "tagged_frame", `${id}: ${k}`);
    assert.ok(BLUEPRINTS.includes(RECIPES[id].bp), `${id}: plan ${RECIPES[id].bp}`);
  }
  for (const k of Object.keys(CAMPAIGN_ITEMS)) assert.ok(Object.hasOwn(ITEMS, k), k);
  for (const id of Object.keys(CAMPAIGN_SOURCES)) assert.ok(Object.hasOwn(SOURCES, id), id);
  for (const id of Object.keys(CAMPAIGN_TECH_RECORDS)) assert.ok(Object.hasOwn(TECH_RECORDS, id), id);
  // S5's works costs also use only the eight materials.
  for (const r of Object.values(STORY_RECIPES)) for (const k of Object.keys(r.cost)) assert.ok(Object.hasOwn(MATERIALS, k), k);
});

test("each campaign plan is granted where the plan table says, and no plan depends on its own craft", () => {
  const grants = (src: string): readonly string[] =>
    Object.hasOwn(EVIDENCE_BLUEPRINTS, src) ? EVIDENCE_BLUEPRINTS[src as keyof typeof EVIDENCE_BLUEPRINTS]
      : Object.hasOwn(STORY_GRANTS, src) ? STORY_GRANTS[src as keyof typeof STORY_GRANTS]
        : TECH_RECORDS[src as keyof typeof TECH_RECORDS].blueprints;
  for (const [bp, sources] of Object.entries(CAMPAIGN_PLAN_SOURCES))
    for (const src of sources) assert.ok(grants(src).includes(bp as never), `${src} grants ${bp}`);
  for (const id of CAMPAIGN) assert.ok(Object.hasOwn(CAMPAIGN_PLAN_SOURCES, RECIPES[id].bp), `${id}: plan source listed`);
  // Progression-critical campaign plans have two sources; the optional specialists one.
  for (const id of ["suit_450", "suit_800", "creel_450", "creel_800", "restore_divide_stop", "hearthline_keel", "hearthline_base", "hearthline_550", "mantle_base"] as const)
    assert.ok(CAMPAIGN_PLAN_SOURCES[RECIPES[id].bp as keyof typeof CAMPAIGN_PLAN_SOURCES].length >= 2, id);
});

test("late materials: two first-access deposits each, inside the preceding tier with margin, and no protection needed", () => {
  const preceding = { pressure_ceramic: 350, thermal_core: 350, brine_lattice: 450 } as const;
  for (const [kind, rating] of Object.entries(preceding)) {
    const all = (Object.keys(CAMPAIGN_SOURCES) as (keyof typeof CAMPAIGN_SOURCES)[]).filter((id) => SOURCES[id].item === kind);
    const first = all.filter((id) => CAMPAIGN_SOURCE_SITES[id].first);
    assert.ok(first.length >= 2, kind);
    for (const id of first) {
      assert.equal(CAMPAIGN_SOURCE_SITES[id].protection, null, id);
      assert.ok(depth(id) < rating * 0.9, `${id} at ${depth(id)} m under 90% of ${rating} m`);
      assert.ok(SOURCES[id].stock >= 8, id);
    }
    // Richer stock is deeper or protected, never the only access.
    for (const id of all.filter((id) => !CAMPAIGN_SOURCE_SITES[id].first))
      assert.ok(depth(id) > Math.max(...first.map(depth)) || CAMPAIGN_SOURCE_SITES[id].protection, id);
  }
  // The protection a deposit asks for is made from earlier stock: ceramic shroud, lattice seals.
  assert.ok(Object.keys(RECIPES.heat_shroud.cost).includes("pressure_ceramic"));
  assert.ok(Object.keys(RECIPES.brine_seals.cost).includes("brine_lattice"));
});

test("every campaign site and stop is one of S2's sites, and the Divide stop serves the Creel route", () => {
  for (const site of Object.values(CAMPAIGN_SITES)) assert.match(site.s2, /^[a-z]+\.[a-z_]+$/);
  for (const id of CAMPAIGN) {
    const site = RECIPES[id].site;
    assert.ok(["home_pod", "pod_fabricator", "island_workshop", ...Object.keys(CAMPAIGN_SITES)].includes(site), `${id} at ${site}`);
  }
  assert.equal(SERVICE_STOPS.stop_divide_lee.recipe, "restore_divide_stop");
  assert.equal(RECIPES.restore_divide_stop.site, "divide_dock");
  assert.ok(SERVICE_STOPS.stop_divide_lee.services.includes("air"));
  // A restored stop's cost is one diver load: its own locker is shut until it works.
  for (const id of ["restore_rift_station", "restore_divide_stop"] as const)
    assert.ok(Object.entries(RECIPES[id].cost).reduce((n, [k, q]) => n + ITEMS[k as ItemKind].cu * q, 0) <= 16, id);
});

test("hull workloads rise compact < Creel < Mantle < Hearthline, and each specialist mission states a measurable benefit", () => {
  const units = (...ids: RecipeId[]): number => ids.reduce((n, id) => n + Object.entries(RECIPES[id].cost)
    .reduce((m, [k, q]) => m + (k === "tagged_frame" ? 8 : 1) * q, 0), 0);
  const dart = units("dart_base"), creel = units("creel_base"), mantle = units("mantle_base"), carrier = units("hearthline_keel", "hearthline_base");
  assert.ok(dart < creel && creel < mantle && mantle < carrier, `${dart} < ${creel} < ${mantle} < ${carrier}`);
  assert.ok(carrier >= 4 * dart, "the carrier costs substantially more than a specialist");
  assert.ok(units("hush_base") < creel && units("spindle_base") < creel);
  for (const [hull, role] of Object.entries(CAMPAIGN_HULL_ROLES)) assert.equal(RECIPES[role.recipe as RecipeId].output, hull);
  // Hush: under the hunter's threshold at full survey speed; the Dart must crawl.
  assert.ok(HUSH_HANDLING.loudness.cruise < HUNTER_INTEREST_LOUDNESS && DART_QUIET.cruiseLoudness > HUNTER_INTEREST_LOUDNESS);
  assert.match(CAMPAIGN_HULL_ROLES.hush.mission.measure, new RegExp(`${2 * HUNTER_TERRITORY_M / HUSH_HANDLING.cruise} s instead of ${2 * HUNTER_TERRITORY_M / DART_QUIET.speed} s`));
  // Spindle: the carrier fit-out stock in one trip.
  const fitOut = Object.entries(RECIPES.hearthline_base.cost).reduce((n, [k, q]) => n + ITEMS[k as ItemKind].cu * q, 0);
  assert.ok(fitOut <= CAMPAIGN_HULL_ROLES.spindle.hold && fitOut > 32);
  assert.match(CAMPAIGN_HULL_ROLES.spindle.mission.measure, new RegExp(`^The ${fitOut} CU`));
  // Mantle: works stock and both assemblies in two 32 CU sorties.
  const works = STORY_RECIPES.restore_upper_hall.cu + STORY_RECIPES.restore_food_module.cu + STORY_RECIPES.service_power_assembly.cu + STORY_RECIPES.service_air_assembly.cu;
  assert.equal(Math.ceil(works / CAMPAIGN_HULL_ROLES.mantle.hold), 2);
  assert.match(CAMPAIGN_HULL_ROLES.hearthline.mission.measure, new RegExp(`^The ${works} CU`));
  assert.ok(works <= HEARTHLINE_CAMPAIGN.services.stores.holdCu);
  // The district shelf needs the refit; every other mooring is inside the 400 m hull.
  for (const m of HEARTHLINE_CAMPAIGN.moorings) assert.ok(m.depth < m.rating && (m.rating === 400 || m.depth > HULLS.hearthline.initialDepth), m.site);
});

/** Staged: a 350 m Creel and suit at the workshop, with the cool-flank and deep-service plans. */
function deepReady(): GameState {
  const s = creelFirst(["creel_350"]);
  recordStory(s, "C07");
  assert.ok(s.knowledge.blueprints.includes("bp_deep_service") && validState(s));
  return s;
}

test("real collection at the late deposits follows the suit, and refused work takes nothing", () => {
  const s = deepReady(), lip = "rift_ceramic_lip_north" as const;
  at(s, { ...SOURCES[lip].position, y: SOURCES[lip].position.y + 0.5 });
  const got = collectWithOutcome(s, lip);
  assert.equal(got.refusal, null); assert.deepEqual(got.pickup, { item: "pressure_ceramic", quantity: 2, destination: "diver" });
  assert.ok(s.knowledge.scans.includes(lip));
  // C3 widened the simulation to S2's whole envelope: a pose at the Rift is saveable.
  assert.equal(validState(s), true, "a pose at the Rift is inside the saved world");
  at(s, WORKSHOP_BENCH); saveable(s);
  const ledge = "divide_lattice_ledge_west" as const, before = s.world.resources.find((n) => n.id === ledge)!.stock;
  at(s, { ...SOURCES[ledge].position, y: SOURCES[ledge].position.y + 0.5 });
  assert.match(collectWithOutcome(s, ledge).refusal!, /350 m personal suit/);
  assert.equal(s.world.resources.find((n) => n.id === ledge)!.stock, before, "nothing collected past the suit");
});

test("paid suit refits 350 → 450 → 800 in place; personal limit and saves follow; tiers cannot be skipped", () => {
  const s = deepReady(), suitId = s.inventory.items.find((i) => i.fitted === "suit")!.id;
  at(s, WORKSHOP_BENCH);
  for (const [k, q] of Object.entries(RECIPES.suit_800.cost)) addItem(s, k as ItemKind, q, "workshop_locker");
  assert.equal(craftingBlock(s, "suit_800", world)?.code, "needs", "the 800 m suit needs the 450 m refit first");
  fund(s, "suit_450");
  assert.equal(personalLimit(s), 450); saveable(s);
  assert.equal(craft(s, "suit_800", world), null);
  assert.equal(personalLimit(s), 800);
  const suit = s.inventory.items.find((i) => i.fitted === "suit")!;
  assert.deepEqual([suit.id, suit.kind], [suitId, "suit_800"], "the same fitted suit was refitted");
  saveable(s);
  const tampered = structuredClone(s); tampered.inventory.items.find((i) => i.fitted === "suit")!.kind = "suit_450";
  assert.equal(validState(tampered), false, "the fitted suit must match the highest paid tier");
  const forged = structuredClone(s); forged.knowledge.crafted = forged.knowledge.crafted.filter((r) => r !== "suit_450");
  assert.equal(validState(forged), false, "no 800 m suit without its 450 m refit");
});

test("paid Creel refits 350 → 450 → 800 at the slip, with the whole frame investment; out-of-order refits refuse", () => {
  const s = deepReady(), v = creelOf(s);
  assert.equal(v.rating, 350);
  const early = creelFirst();
  at(early, WORKSHOP_BENCH); recordStory(early, "C07");
  for (const [k, q] of Object.entries(RECIPES.creel_450.cost)) addItem(early, k as ItemKind, q, "workshop_locker");
  assert.equal(craftingBlock(early, "creel_450", world)?.code, "needs", "the 450 refit follows the paid 350 refit");
  early.knowledge.crafted.push("creel_350");
  assert.equal(craftingBlock(early, "creel_450", world)?.message, "Refit this Creel to 350 m first.", "a rebuilt 240 m hull starts again at 350");
  fund(s, "creel_450"); assert.equal(creelOf(s).rating, 450); saveable(s);
  fund(s, "suit_450");
  fund(s, "creel_800"); assert.equal(creelOf(s).rating, 800); saveable(s);
  assert.match(s.feedback, /rated 800 m/);
  const expected: Record<string, number> = {};
  for (const id of ["creel_base", "creel_350", "creel_450", "creel_800"] as const)
    for (const [k, q] of Object.entries(RECIPES[id].cost)) expected[k] = (expected[k] ?? 0) + q;
  assert.deepEqual(creelOf(s).investment, expected, "salvage returns every paid tier");
  assert.equal(craftingBlock(s, "creel_800", world)?.code, "refit", "already rated");
  const skipped = structuredClone(s); skipped.knowledge.crafted = skipped.knowledge.crafted.filter((r) => r !== "creel_450");
  assert.equal(validState(skipped), false, "an 800 m Creel needs the 450 m tier in its record");
  const odd = structuredClone(s); creelOf(odd).rating = 600;
  assert.equal(validState(odd), false, "ratings follow the refit tiers");
  assert.equal(REFIT_TIERS.creel_800.from, REFIT_TIERS.creel_450.rating);
});

test("campaign work not yet composed refuses with its reason, atomically, even when fully paid", () => {
  const s = deepReady(); fund(s, "suit_450");
  for (const id of ["C03", "C05"] as const) recordStory(s, id);
  readTechRecord(s, "canopy_glider_log"); readTechRecord(s, "yard_tender_plate");
  for (const id of Object.keys(CAMPAIGN_PENDING) as RecipeId[]) {
    const r = RECIPES[id], c = structuredClone(s);
    c.knowledge.crafted = [...new Set([...c.knowledge.crafted, ...(r.needs as readonly string[] as RecipeId[])])];
    for (const [k, q] of Object.entries(r.cost)) addItem(c, k as ItemKind, q, "diver");
    const block = craftingBlock(c, id, world);
    assert.equal(block?.code, "unplaced", id);
    assert.match(block!.message, /^Plans recorded\. /, id);
    const before = structuredClone(c), result = executeCommand(c, { type: "craft", recipeId: id }, world);
    assert.equal(result.state, c, id); assert.deepEqual(c, before, id);
  }
  // C3 placed the yard, the Rift station, the Divide dock and the later hulls.
  for (const id of CAMPAIGN.filter((id) => !Object.hasOwn(CAMPAIGN_PENDING, id)))
    assert.ok(["suit_450", "suit_800", "creel_450", "creel_800", "restore_rift_station", "restore_divide_stop", "hearthline_keel",
      "hearthline_base", "hearthline_550", "mantle_base", "hush_base", "spindle_base", "bobbin_deep_tether",
      "heat_shroud", "hull_heat_lining", "brine_seals", "hull_brine_seals", "trim_vanes", "glow_lures", "startle_ink"].includes(id), id);
});
