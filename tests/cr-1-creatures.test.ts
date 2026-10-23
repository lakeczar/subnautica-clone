/** CR-1: natural threat windows and creatures as resources.
 * A. Every threat has a natural, timed way through (feeding, resting); while an
 *    animal is busy it never harms, it breaks off an encounter, and afterwards
 *    ENC-1's warning ladder applies in full. Crossing inside a window is safe.
 * B. Grounds, catching, cooking, bait, the fish trap and planter feed conserve
 *    items, stay capped and loop-free, never touch protected animals, and load
 *    into older saves as additive content. */
import test from "node:test";
import { layerY } from "../src/sim/ecology/agents.js";
import { inCameraView, layingPose, swapWhileUnseen, windowOpen, windowSpot } from "../src/sim/fauna/windows.js";
import { SKATE_LAYING_SITE } from "../src/content/fauna/windows.js";
import type { Vec3 } from "../src/sim/types.js";
import { hunterPassPoint } from "../src/sim/hunter.js";
import { eyeHeight } from "../src/sim/state.js";
import { createWorldQueries } from "../src/sim/world.js";
import assert from "node:assert/strict";
import { CHIMNEY_PULSE, CREST_SLACK, CREATURE_CYCLES, WORLD_CYCLES } from "../src/content/currents/cycles.js";
import { THREATS } from "../src/content/ecology/species.js";
import { COOKING, FERTILISER, NET_BONUS, TRAP } from "../src/content/fauna/items.js";
import {
  FAUNA_RENEWAL, FAUNA_SOURCES, GROUNDS, HARVESTABLE_SPECIES, PROTECTED_SPECIES,
} from "../src/content/fauna/grounds.js";
import type { FaunaSourceId } from "../src/content/fauna/grounds.js";
import { THREAT_WINDOWS, WINDOW_IDS } from "../src/content/fauna/windows.js";
import type { WindowId } from "../src/content/fauna/windows.js";
import { PLACES, RECIPES, SOURCES, SOURCE_RENEWAL } from "../src/content/registry.js";
import type { SourceId } from "../src/content/registry.js";
import { SEEDS } from "../src/content/systems/cultivation.js";
import { createEnvelope, decodeSave } from "../src/save/codec.js";
import { sampleCycleAt, windows } from "../src/sim/cycles/cycle.js";
import { cookCatch, cookPlan, feedPlanter } from "../src/sim/fauna/catch.js";
import { faunaCommand } from "../src/sim/fauna/link.js";
import { advanceTraps, emptyTrap, trapViews } from "../src/sim/fauna/trap.js";
import { windowBusy } from "../src/sim/fauna/windows.js";
import { addItem } from "../src/sim/inventory.js";
import { collectWithOutcome } from "../src/sim/progression.js";
import { advanceRenewal } from "../src/sim/renewal.js";
import { installModule } from "../src/sim/systems/hosts.js";
import { plant } from "../src/sim/systems/cultivation.js";
import { validSystems } from "../src/sim/systems/state.js";
import { createEcology, homeOf, run, strikes } from "./ecology-support.js";
import { encoded } from "./persistence-support.js";
import { meta, opened, count, stock, roundTrip, windowAt, walker, loud } from "./cr-1-support.js";

// ============================================================ A. natural windows
test("every threat has a natural window: about a minute's wait at most, long enough to cross, logged as a cycle", () => {
  // The skates' laying visit is a rarer extra window; their slack rest is the frequent one.
  const minOpen: Record<WindowId, number> = { canopy_sound_hunter: 56, glare_stalker: 36, layer_skate: 34, hollow_choir: 26, layer_skate_laying: 90 };
  for (const id of WINDOW_IDS) {
    const w = THREAT_WINDOWS[id], r = windows(w.cycle, (x) => w.busy.includes(x.phase));
    assert.ok(r.longestClosed <= (id === "layer_skate_laying" ? 300 : 62), `${id}: worst wait ${r.longestClosed} s`);
    assert.ok(r.shortestOpen >= minOpen[id], `${id}: window ${r.shortestOpen} s`);
    assert.ok(WORLD_CYCLES.includes(w.cycle), `${id}: its cycle is logged in the journal`);
    assert.ok(w.seenBusy.length < 200 && w.seenIdle.length < 200, `${id}: first-sight captions stay short`);
  }
  assert.equal(CREATURE_CYCLES.length, WINDOW_IDS.length);
  // The stalkers feed through every vent; the skates rest through every slack.
  for (let tick = 0; tick < 200 * 60; tick += 7) {
    if (sampleCycleAt(CHIMNEY_PULSE, tick).phase === "active") assert.ok(windowBusy("glare_stalker", tick), `stalkers feed while it vents (${tick})`);
    if (sampleCycleAt(CREST_SLACK, tick).phase === "quiet") assert.ok(windowBusy("layer_skate", tick), `skates rest in slack water (${tick})`);
  }
});

// Fast smoke: one well-timed crossing (the heavy suite covers every threat, break-off and the ladder).
test("smoke: timed to its rest, a loud lit diver crosses the choir's reach and is never struck", () => {
  const h = homeOf("district_choir_gallery"), { start } = windowAt("hollow_choir", 30 * 60), state = createEcology();
  const at = walker([{ p: { x: h.x - 26, y: h.y + 1, z: h.z } }, { p: { x: h.x + 26, y: h.y + 1, z: h.z } }, { p: { x: h.x + 44, y: h.y + 1, z: h.z } }], 2);
  const log = run(state, 40 * 60, (tick, st) => loud(at((tick - start) / 60), st, "hollow_choir"), { start });
  assert.deepEqual(strikes(log), []);
});

// ============================================================ B. grounds and catching
test("catching conserves fish: one by hand, one more with a net, never more than the school holds; it regathers to its cap", () => {
  const s = opened(), id: SourceId = "reef_fish_ribs";
  s.player.pose.position = { ...SOURCES[id].position }; s.player.mode = "swimming";
  const cap = SOURCES[id].stock;
  assert.equal(collectWithOutcome(s, id).refusal, null);
  assert.equal(count(s, "small_fish"), 1);
  assert.equal(stock(s, id), cap - 1);
  addItem(s, "hand_net", 1, "diver");
  collectWithOutcome(s, id);
  assert.equal(count(s, "small_fish"), 1 + 1 + NET_BONUS);
  assert.equal(stock(s, id), cap - 3);
  collectWithOutcome(s, id);
  assert.equal(count(s, "small_fish"), cap, "a net takes only what is left");
  assert.equal(stock(s, id), 0);
  assert.match(collectWithOutcome(s, id).refusal ?? "", /regathers/);
  assert.equal(count(s, "small_fish") + stock(s, id), cap, "conserved");
  const interval = FAUNA_RENEWAL.reef_fish_ribs.intervalSteps;
  for (let i = 0; i < interval * (cap + 3); i++) advanceRenewal(s);
  assert.equal(stock(s, id), cap, "regathers to its cap, never past it");
});

test("cooking is one interaction with portions: roe first, fish in pairs, totals conserved; refused away from a cooker", () => {
  const s = opened();
  addItem(s, "small_fish", 5, "diver"); addItem(s, "roe_cluster", 1, "diver");
  s.player.pose.position = { x: 40, y: -20, z: -60 }; s.player.mode = "swimming";
  assert.match(cookCatch(s, 1) ?? "", /cooker/);
  assert.equal(count(s, "small_fish"), 5);
  s.player.pose.position = { ...PLACES.home_pod.position };
  assert.equal(cookPlan(s, 99).maxPortions, COOKING.roe_cluster.meals + Math.floor(5 / COOKING.small_fish.raw));
  const meals = count(s, "meal");
  assert.equal(cookCatch(s, 3), null);
  assert.equal(count(s, "roe_cluster"), 0);
  assert.equal(count(s, "small_fish"), 3);
  assert.equal(count(s, "meal") - meals, COOKING.roe_cluster.meals + COOKING.small_fish.meals, "1 roe and 2 fish make 3 meals");
  assert.equal(count(s, "meal", "pod_locker"), 3, "meals land in the pod locker");
  assert.equal(cookCatch(s, 2), null);
  assert.equal(count(s, "small_fish"), 1, "an odd fish stays raw");
  assert.match(cookCatch(s, 1) ?? "", /Nothing to cook/);
  roundTrip(s);
});

test("the fish trap: wet hosts only; one fish per interval, capped; emptied in one interaction; kept through a save", () => {
  let s = opened();
  const trap = addItem(s, "mod_fish_trap", 1, "diver");
  // The island workshop stands on land: refused before SYS-2 sees it.
  assert.match(faunaCommand(s, { type: "install-host-module", hostId: "island_workshop", socket: "s0", itemId: trap.id }) ?? "", /dry land/);
  s.player.pose.position = { ...PLACES.home_pod.position }; s.player.mode = "swimming";
  assert.equal(installModule(s, s.systems, "home_pod", "s0", trap.id), null);
  advanceTraps(s, s.systems, TRAP.seconds - 1);
  assert.equal(trapViews(s, s.systems)[0]!.held, 0);
  advanceTraps(s, s.systems, 1);
  assert.equal(trapViews(s, s.systems)[0]!.held, 1);
  for (let i = 0; i < 3600; i++) advanceTraps(s, s.systems, 1);
  assert.equal(trapViews(s, s.systems)[0]!.held, TRAP.cap, "a full trap waits");
  s = roundTrip(s);
  assert.equal(trapViews(s, s.systems)[0]!.held, TRAP.cap);
  const before = count(s, "small_fish", "pod_locker");
  assert.equal(emptyTrap(s, s.systems, "home_pod", "s0"), null);
  assert.equal(count(s, "small_fish", "pod_locker") - before, TRAP.cap);
  assert.equal(trapViews(s, s.systems)[0]!.held, 0);
  const bad = structuredClone(s.systems); bad.traps[0]!.held = TRAP.cap + 1;
  assert.equal(validSystems(bad), false, "an over-full trap is refused");
});

test("planter feed grows a young crop once, at a cost of one feed", () => {
  const s = opened();
  const planter = addItem(s, "mod_planter", 1, "diver");
  s.player.pose.position = { ...PLACES.home_pod.position }; s.player.mode = "swimming";
  assert.equal(installModule(s, s.systems, "home_pod", "s1", planter.id), null);
  addItem(s, "seed_staple_cup", 1, "diver");
  assert.equal(plant(s, s.systems, "home_pod", "s1", "seed_staple_cup"), null);
  assert.match(feedPlanter(s, s.systems, "home_pod", "s1") ?? "", /Carry/);
  addItem(s, "planter_feed", 2, "diver");
  assert.equal(feedPlanter(s, s.systems, "home_pod", "s1"), null);
  assert.equal(s.systems.planters[0]!.progress, SEEDS.seed_staple_cup.growSeconds * FERTILISER.boost);
  assert.equal(count(s, "planter_feed"), 1);
  assert.match(feedPlanter(s, s.systems, "home_pod", "s1") ?? "", /young crop/, "a crop takes feed once");
  assert.equal(count(s, "planter_feed"), 1);
});

test("protected animals are never harvested; only the two common schools give fish or roe", () => {
  const harvest = new Set<string>(HARVESTABLE_SPECIES), protectedSpecies = new Set<string>(PROTECTED_SPECIES);
  for (const id of Object.keys(FAUNA_SOURCES) as FaunaSourceId[]) {
    const g = GROUNDS[id], def = SOURCES[id];
    if (g.kind === "fish" || g.kind === "roe") assert.ok(harvest.has(g.species), `${id}: ${g.species} is not a common school`);
    if (protectedSpecies.has(g.species)) {
      assert.equal(g.kind, "protected", `${id}: a protected animal's ground can only be looked at`);
      assert.equal(def.stock + def.reserve, 0, `${id} holds nothing`);
      assert.ok(!Object.hasOwn(SOURCE_RENEWAL, id), `${id} never regrows`);
    }
  }
  for (const species of [...Object.keys(THREATS), "canopy_sound_hunter"]) assert.ok(protectedSpecies.has(species), `${species} is protected`);
  const s = opened(), id: SourceId = "divide_skate_eggcases";
  s.player.pose.position = { ...SOURCES[id].position }; s.player.mode = "swimming";
  addItem(s, "suit_800", 1, "equipment", "suit");
  const items = JSON.stringify(s.inventory.items);
  assert.ok(collectWithOutcome(s, id).refusal);
  assert.equal(JSON.stringify(s.inventory.items), items, "nothing taken");
});

test("the creature economy is capped and loop-free", () => {
  // Nothing turns meals, feed or crops back into fish, roe or feed.
  for (const [id, r] of Object.entries(RECIPES))
    assert.ok(r.output !== "small_fish" && r.output !== "roe_cluster" && r.output !== "planter_feed", `${id} makes a creature resource`);
  for (const seed of Object.values(SEEDS)) assert.ok(!["small_fish", "roe_cluster", "planter_feed"].includes(seed.produce));
  // Per source, at its cap and best rate: no ground or trap feeds more than 8 meals an hour.
  const mealsPerHour = (raw: "small_fish" | "roe_cluster", perHour: number): number => perHour / COOKING[raw].raw * COOKING[raw].meals;
  for (const [id, r] of Object.entries(FAUNA_RENEWAL)) {
    const g = GROUNDS[id as FaunaSourceId];
    assert.ok(SOURCES[id as SourceId].stock <= 4 && r.quantity === 1, `${id} cap`);
    if (g.kind === "fish" || g.kind === "roe")
      assert.ok(mealsPerHour(g.kind === "fish" ? "small_fish" : "roe_cluster", 216_000 / r.intervalSteps) <= 8, `${id} feeds too fast`);
  }
  assert.ok(TRAP.cap <= 4 && mealsPerHour("small_fish", 3600 / TRAP.seconds) <= 8, "a trap feeds too fast");
});

test("additive content: a save from before CR-1 loads with New Game's grounds and no traps", () => {
  const env = JSON.parse(encoded(createEnvelope(opened(), meta)));
  const fauna = new Set(Object.keys(FAUNA_SOURCES));
  env.state.world.resources = env.state.world.resources.filter((r: { id: string }) => !fauna.has(r.id));
  env.state.world.renewal = env.state.world.renewal.filter((r: { id: string }) => !fauna.has(r.id));
  delete env.state.systems.traps;
  const out = decodeSave(JSON.stringify(env));
  assert.ok(out.ok, out.ok ? "" : out.error);
  for (const id of fauna) assert.equal(out.value.state.world.resources.find((r) => r.id === id)!.stock, SOURCES[id as SourceId].stock);
  assert.deepEqual(out.value.state.systems.traps, []);
});

test("CRE-03: the hunter's silhouette pass always takes a point the player can see", () => {
  const s = opened(); s.player.mode = "swimming";
  s.player.pose = { frame: "world", position: { x: 132, y: -110, z: -90 }, yaw: 0, pitch: 0 };
  s.world.threat = { ...s.world.threat, mode: "investigate", modeSeconds: 1.5 };
  const eye = { ...s.player.pose.position, y: s.player.pose.position.y + eyeHeight(s) };
  const usual = hunterPassPoint(s);
  // A crown trunk standing across the usual point: 3 m wide, from the floor to well above the eye.
  const at = (p: Vec3, d: number): Vec3 => ({ x: eye.x + (p.x - eye.x) * d, y: 0, z: eye.z + (p.z - eye.z) * d });
  const c = at(usual, 0.85);
  const walled = createWorldQueries([{ id: "crown.trunk", min: { x: c.x - 1.5, y: -200, z: c.z - 1.5 }, max: { x: c.x + 1.5, y: eye.y + 2, z: c.z + 1.5 } }], () => -200);
  assert.equal(walled.lineOfSight(eye, usual), false, "premise: the usual pass point is hidden");
  const seen = hunterPassPoint(s, s.world.threat.modeSeconds, walled);
  assert.ok(walled.lineOfSight(eye, seen), "the pass moves to a visible point");
  assert.ok(Math.hypot(seen.x - eye.x, seen.z - eye.z) >= 4, "still in front, never on top of the diver");
  const open = createWorldQueries([], () => -200);
  assert.deepEqual(hunterPassPoint(s, s.world.threat.modeSeconds, open), usual, "open water keeps the usual pass");
});

test("CRE-05: a resting skate lies still just under the mirror, where its outline shows; a patrolling one stays deeper", () => {
  const mirror = layerY("divide_dense_layer");
  for (const id of ["divide_skate_saddle", "divide_skate_east"] as const) {
    let tick = 60; while (!(windowOpen("layer_skate", tick) && !windowOpen("layer_skate_laying", tick))) tick++;
    const rest = windowSpot(id, homeOf(id), tick)!;
    assert.ok(rest.y < mirror && mirror - rest.y <= 1, `${id} rests ${(mirror - rest.y).toFixed(2)} m under the mirror`);
    assert.ok(mirror - homeOf(id).y >= 5, `${id} patrols deeper than it rests`);
  }
});

test("CRE-04 (interim): stand-in laying skates come and go only while unseen", () => {
  // Never switched while in view; switched freely out of view.
  for (const present of [false, true]) for (const wanted of [false, true]) {
    assert.equal(swapWhileUnseen(present, wanted, true), present);
    assert.equal(swapWhileUnseen(present, wanted, false), wanted);
  }
  const cam = { x: 0, y: 0, z: 0 }, ahead = { x: 0, y: 0, z: -1 };
  assert.equal(inCameraView(cam, ahead, { x: 0, y: 0, z: -30 }), true, "ahead and near");
  assert.equal(inCameraView(cam, ahead, { x: 0, y: 0, z: 30 }), false, "behind");
  assert.equal(inCameraView(cam, ahead, { x: 0, y: 0, z: -300 }), false, "beyond the water's range");
  // After the visit a kept skate goes on circling the egg cases rather than freezing.
  let after = 60; while (!(windowOpen("layer_skate_laying", after - 1) && !windowOpen("layer_skate_laying", after))) after++;
  const a = layingPose(after, 0).position, b = layingPose(after + 60, 0).position;
  assert.ok(Math.hypot(a.x - SKATE_LAYING_SITE.x, a.z - SKATE_LAYING_SITE.z) < 6 && Math.hypot(a.x - b.x, a.z - b.z) > 0.5);
});
