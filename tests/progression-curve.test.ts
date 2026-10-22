import test from "node:test";
import assert from "node:assert/strict";
import {
  EVIDENCE, FUTURE_BLUEPRINTS, ITEMS, MATERIALS, RECIPES, RENEWABLE_SOURCE_IDS, SOURCES,
  type EvidenceId, type MaterialId, type RecipeId, type SourceId,
} from "../src/content/registry.js";
import { personalDepth } from "../src/sim/capabilities.js";
import { HUB_RECIPES } from "../src/content/hub/recipes.js";
import { CAMPAIGN_RECIPES, CAMPAIGN_SOURCE_SITES } from "../src/content/campaign/index.js";
import { SUIT_RATINGS } from "../src/content/registry.js";
import { addItem, available, fabricationContainers, hasRoom, transfer } from "../src/sim/inventory.js";
import { HOST_KNOWLEDGE_RECIPES, UPGRADE_RECIPES, UPGRADE_REFIT_RECIPES } from "../src/content/upgrades/registry.js";
import { SYS2_RECIPES } from "../src/content/systems/items.js";
import { collectWithOutcome, completeOpening, craft, craftingBlock, discover, frameDestination } from "../src/sim/progression.js";
import { createGame } from "../src/sim/state.js";
import { executeCommand } from "../src/sim/step.js";
import { createWorldQueries } from "../src/sim/world.js";
import { validState } from "../src/save/validation.js";
import type { GameState } from "../src/sim/types.js";

const world = createWorldQueries();
const ids = Object.keys(RECIPES) as RecipeId[];
/** M2-B1 recipes. Their full earned chain is proved in tests/m2-b1-economy.test.ts. */
const B1 = ["creel_base", "creel_cargo_rack", "creel_cabin", "strip_frame", "restore_canopy_stop", "creel_350", "dart_350"] as const;
/** S5 works recipes. Their plans come from evidence S2 has not placed yet, and two
 * use materials with no source yet; tests/story-composed.test.ts reports both. */
const STORY = ["service_power_assembly", "service_air_assembly", "pod_buffer"] as const;
/** S9 campaign recipes; tests/campaign-*.test.ts prove their chain and economy. */
const CAMPAIGN = Object.keys(CAMPAIGN_RECIPES) as RecipeId[];
/** C4's SYS-1 upgrade, refit and host-knowledge recipes and SYS-2's kits and
 * modules; tests/c4-systems.test.ts and the upgrade economy check prove them. */
const C4 = Object.keys({ ...UPGRADE_RECIPES, ...UPGRADE_REFIT_RECIPES, ...HOST_KNOWLEDGE_RECIPES, ...SYS2_RECIPES }) as RecipeId[];
/** HUB-2's crown station stages; tests/crown-station.test.ts proves them. */
const HUB = Object.keys(HUB_RECIPES) as RecipeId[];
const PRE_B1 = ids.filter((id) => !(B1 as readonly string[]).includes(id) && !(STORY as readonly string[]).includes(id) &&
  !(CAMPAIGN as readonly string[]).includes(id) && !(C4 as readonly string[]).includes(id) && !(HUB as readonly string[]).includes(id));
const visible = (s: GameState) => ids.filter((id) => s.knowledge.blueprints.includes(RECIPES[id].bp));
const POD = { x: 0, y: 0.18, z: 21.2 }, WORKSHOP = { x: 11, y: 1.2, z: -35 };
function opened(): GameState { const s = createGame(); completeOpening(s); return s; }
const permutations = <T,>(a: readonly T[]): T[][] =>
  a.length <= 1 ? [[...a]] : a.flatMap((x, i) => permutations([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));

test("New Game exposes only the pod checklist ladder; unknown or premature plans refuse atomically", () => {
  const fresh = createGame();
  for (const id of ids) assert.equal(craftingBlock(fresh, id, world)?.code, "opening", id);
  const s = opened();
  assert.deepEqual(s.knowledge.blueprints, ["bp_pod_checklist"]);
  assert.deepEqual(visible(s), ["pod_repair", "essential_tools", "suit_150", "reserve_cells"]);
  const codes = Object.fromEntries(ids.map((id) => [id, craftingBlock(s, id, world)?.code]));
  assert.deepEqual(codes, {
    pod_repair: "materials", essential_tools: "needs", suit_150: "needs", reserve_cells: "needs",
    restore_workshop: "blueprint", salvage_buoy: "blueprint", bobbin_kit: "blueprint", dart_base: "blueprint",
    dart_acoustic_trim: "blueprint", suit_350: "blueprint",
    ...Object.fromEntries(B1.map((id) => [id, "blueprint"])),
    ...Object.fromEntries(STORY.map((id) => [id, "blueprint"])),
    ...Object.fromEntries(CAMPAIGN.map((id) => [id, "blueprint"])),
    ...Object.fromEntries(HUB.map((id) => [id, "blueprint"])),
    ...Object.fromEntries(C4.map((id) => [id, "blueprint"])),
  }, "nothing beyond the first repair is attemptable; it still needs materials");
  // Even with every material at the right bench, unknown or later plans cannot be bypassed.
  for (const site of [POD, WORKSHOP]) {
    const rich = opened(); rich.player.pose.position = { ...site };
    for (const kind of ["structural_alloy", "silica_glass", "flex_membrane", "conductive_crust", "buoyant_resin"] as const)
      rich.inventory.items.push({ id: `item_${kind}`, kind, quantity: 4, containerId: "pod_locker", fitted: null, charge: null, provenance: "public" });
    for (const id of ids.filter((id) => id !== "pod_repair")) {
      const result = executeCommand(rich, { type: "craft", recipeId: id }, world);
      assert.equal(result.state, rich, `${id}: refused without a draft commit`);
    }
  }
});

test("each clue unlocks a bounded, exact plan set; every one of the 120 clue orders converges", () => {
  const unlocks: Record<string, RecipeId[]> = {};
  for (const id of Object.keys(EVIDENCE) as EvidenceId[]) {
    const s = opened(), before = visible(s); discover(s, id);
    unlocks[id] = visible(s).filter((r) => !before.includes(r));
  }
  assert.deepEqual(unlocks, {
    // C4: each clue's plans also carry the SYS-1 upgrades drawn on them.
    C01: [], C02: ["salvage_buoy", "bobbin_kit", "glow_lures", "startle_ink", "bobbin_deep_tether", "flare_launcher", "emergency_ballast"],
    C03: ["restore_workshop", "dart_base", "hearthline_base", "galley_planter", "plating_alloy", "cell_bank_1", "drive_tuning_1",
      "floodlights_1", "dart_overdrive", "hearthline_system_bay", "hearthline_mooring_anchor", "outpost_network_1"],
    // HUB-2: each crown stage unlocks with the plan it uses.
    C04: ["dart_acoustic_trim", "suit_350", "restore_canopy_stop", "trim_vanes", "restore_crown_dock", "silent_running", "chart_live_position"],
    C05: ["creel_base", "creel_cargo_rack", "creel_cabin", "strip_frame", "hearthline_keel", "restore_crown_power", "creel_service_head"],
    C06: ["creel_350", "suit_450", "creel_450", "restore_rift_station", "hearthline_550", "heat_shroud", "hull_heat_lining",
      "restore_crown_survey", "plating_ceramic", "cell_bank_2", "drive_tuning_2", "thermal_exchanger", "floodlights_2", "hush_450", "dart_450"],
  });
  // M2-B1: the Creel service plan is fully executable; carrier and deeper pressure
  // research stay listed as future knowledge even where part of a plan now executes.
  assert.ok(!Object.hasOwn(FUTURE_BLUEPRINTS, "bp_creel_service"));
  for (const bp of ["bp_carrier_basin", "bp_rift_pressure"] as const) assert.ok(Object.hasOwn(FUTURE_BLUEPRINTS, bp), bp);
  // S9: carrier construction is registered, done at the stack-yard berth C3 places.
  assert.deepEqual(ids.filter((r) => (RECIPES[r].bp as string) === "bp_carrier_workshop"),
    ["hearthline_base", "galley_planter", "hearthline_system_bay", "hearthline_mooring_anchor"]);
  const finals = new Set<string>();
  for (const order of permutations(["C02", "C03", "C04", "C05", "C06"] as const)) {
    const s = opened();
    for (const id of order) discover(s, id);
    assert.ok(validState(s));
    finals.add(JSON.stringify([...s.knowledge.blueprints].sort()));
  }
  assert.equal(finals.size, 1);
});

/** Personal protection that must already exist before a recipe can be made. */
function limitBefore(id: RecipeId, seen = new Set<RecipeId>()): number {
  let limit = 60;
  for (const need of RECIPES[id].needs as readonly RecipeId[]) {
    if (seen.has(need)) assert.fail(`circular prerequisite through ${need}`);
    limit = Math.max(limit, Object.hasOwn(SUIT_RATINGS, need) ? SUIT_RATINGS[need as keyof typeof SUIT_RATINGS] : 60,
      limitBefore(need, new Set([...seen, need])));
  }
  return limit;
}

test("prerequisites are acyclic and each material is reachable at two patches with the preceding protection", () => {
  // Story recipes' plans come only from deep sites; the composed campaign check covers them.
  for (const id of ids.filter((id) => !(STORY as readonly string[]).includes(id))) {
    const limit = limitBefore(id);
    for (const kind of Object.keys(RECIPES[id].cost) as MaterialId[]) {
      // First access never needs the protection a later deposit asks for.
      const patches = (Object.keys(SOURCES) as SourceId[]).filter((s) => SOURCES[s].item === kind &&
        personalDepth(SOURCES[s].position) <= limit &&
        !(Object.hasOwn(CAMPAIGN_SOURCE_SITES, s) && CAMPAIGN_SOURCE_SITES[s as keyof typeof CAMPAIGN_SOURCE_SITES].protection));
      assert.ok(patches.length >= 2, `${id}: ${kind} within ${limit} m before the recipe exists`);
      const exposed = patches.reduce((n, s) => n + SOURCES[s].stock, 0);
      const cost: Partial<Record<string, number>> = RECIPES[id].cost;
      assert.ok(exposed >= cost[kind]!, `${id}: ${kind} from exposed stock alone`);
    }
  }
});

/** Rule-staged diagnostic: positions are set directly, never ordinary input or play time.
 * Materials come only from exposed stock; no reserve sorting and no simulated time, so
 * living-shed renewal contributes nothing. */
function earnedSequence(clues: readonly EvidenceId[]): { order: RecipeId[]; taken: Record<string, number> } {
  const s = opened(), order: RecipeId[] = [], taken: Record<string, number> = {};
  const depositAt = (site: "pod" | "workshop"): void => {
    s.player.pose.position = { ...(site === "pod" ? POD : WORKSHOP) };
    const locker = site === "pod" ? "pod_locker" : "workshop_locker";
    // C4: a 10 CU frame lift needs the hold cleared of the kit made so far too.
    for (const item of s.inventory.items.filter((i) => i.containerId === "diver" && (Object.hasOwn(MATERIALS, i.kind) || i.kind !== "tagged_frame")))
      assert.equal(transfer(s, item.id, locker, item.quantity), null);
  };
  const make = (id: RecipeId): void => {
    const r = RECIPES[id], site = r.site === "island_workshop" ? "workshop" : "pod";
    const lockerReady = site === "pod" || s.world.facilities.find((f) => f.id === "island_workshop")!.repaired;
    for (const [k, q] of Object.entries(r.maintenance ? {} : r.cost) as [MaterialId, number][]) {
      s.player.pose.position = { ...(site === "pod" ? POD : WORKSHOP) };
      let need = q - available(s, k, fabricationContainers(s, r.site));
      for (const src of (Object.keys(SOURCES) as SourceId[]).filter((x) => SOURCES[x].item === k)) {
        const node = s.world.resources.find((n) => n.id === src)!;
        while (need > 0 && node.stock > 0) {
          if (!hasRoom(s, "diver", ITEMS[k].cu * SOURCES[src].bundle) || ((k as string) === "tagged_frame" && !frameDestination(s))) {
            assert.ok(lockerReady, `${id}: carried load must fit before the locker is restored`);
            depositAt(site);
          }
          s.player.pose.position = { ...SOURCES[src].position };
          if (personalDepth(SOURCES[src].position) > (s.inventory.items.some((i) => i.kind === "suit_350") ? 350
            : s.inventory.items.some((i) => i.kind === "suit_150") ? 150 : 60)) break;
          const got = collectWithOutcome(s, src);
          assert.equal(got.refusal, null, `${id}: ${src}`);
          if ((k as string) === "tagged_frame") {
            // C4: suit_350's frame is a timed lift; staged here as its completion does, without play time.
            assert.deepEqual(s.world.action, { sourceId: src, seconds: 10, kind: "lift" });
            addItem(s, "tagged_frame", 1, frameDestination(s)!); node.stock--; s.world.action = null;
            need -= 1; taken[src] = (taken[src] ?? 0) + 1;
            continue;
          }
          need -= got.pickup!.quantity; taken[src] = (taken[src] ?? 0) + got.pickup!.quantity;
        }
      }
      assert.ok(need <= 0, `${id}: ${k} short by ${need}`);
    }
    s.player.pose.position = { ...(site === "pod" ? POD : WORKSHOP) };
    assert.equal(craft(s, id, world), null, id);
    order.push(id);
    assert.ok(validState(s), `${id}: strict state`);
    if (lockerReady) depositAt(site);
  };
  const ladder: Record<EvidenceId, RecipeId[]> = {
    C01: [], C02: ["salvage_buoy", "bobbin_kit"], C03: ["restore_workshop", "dart_base"],
    C04: ["dart_acoustic_trim", "suit_350"], C05: [], C06: [],
  };
  for (const id of ["pod_repair", "essential_tools", "suit_150", "reserve_cells"] as const) make(id);
  for (const clue of clues) {
    discover(s, clue);
    for (const id of ladder[clue]) if (id !== "dart_acoustic_trim" || s.knowledge.crafted.includes("dart_base")) make(id);
  }
  if (!s.knowledge.crafted.includes("dart_acoustic_trim")) make("dart_acoustic_trim");
  assert.ok(s.world.renewal.every((r) => r.progress === 0), "no renewal time was credited");
  for (const id of RENEWABLE_SOURCE_IDS) assert.ok((taken[id] ?? 0) <= SOURCES[id].stock, `${id}: original exposed stock only`);
  assert.deepEqual([...s.knowledge.crafted].sort(), [...PRE_B1].sort());
  return { order, taken };
}

test("every pre-B1 recipe is earned from New Game on finite exposed stock with zero renewal, in either early clue order", () => {
  const reefFirst = earnedSequence(["C02", "C03", "C04", "C05", "C06"]);
  const islandFirst = earnedSequence(["C03", "C04", "C06", "C05", "C02"]);
  assert.deepEqual(reefFirst.order, ["pod_repair", "essential_tools", "suit_150", "reserve_cells", "salvage_buoy", "bobbin_kit",
    "restore_workshop", "dart_base", "dart_acoustic_trim", "suit_350"]);
  assert.deepEqual(islandFirst.order, ["pod_repair", "essential_tools", "suit_150", "reserve_cells", "restore_workshop", "dart_base",
    "dart_acoustic_trim", "suit_350", "salvage_buoy", "bobbin_kit"]);
  // Membrane demand stays inside the two reef catches' original exposed stock.
  const membrane = (r: typeof reefFirst) => (r.taken.reef_ribbon_catch_north ?? 0) + (r.taken.reef_ribbon_catch_south ?? 0);
  assert.ok(membrane(reefFirst) <= 24 && membrane(islandFirst) <= 24);
});
