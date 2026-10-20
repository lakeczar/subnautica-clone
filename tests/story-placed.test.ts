import test from "node:test";
import assert from "node:assert/strict";
import { STORY_RECIPES } from "../src/content/story/evidence.js";
import { PLACED_HOSTS, STORY_PLACEMENTS, WORKS_FACES } from "../src/content/story/placements.js";
import { placedSite, STORY_SITES } from "../src/content/story/sites.js";
import { SITES } from "../src/content/regions/sites.js";
import { type ItemKind } from "../src/content/registry.js";
import { addItem } from "../src/sim/inventory.js";
import { interactions } from "../src/sim/progression.js";
import { executeCommand, stepGame } from "../src/sim/step.js";
import { recordStory } from "../src/sim/storyLink.js";
import type { GameState } from "../src/sim/types.js";
import { saveable, world } from "./b1-support.js";
import { faceTarget, NORMAL_VIEWS, protectedReadyState } from "./targeting-support.js";

test("every later story site is placed at an S2 site; the gate hall is at 769 m; every host rests on S2's world", () => {
  for (const [site, p] of Object.entries(STORY_PLACEMENTS)) {
    assert.ok(placedSite(site as keyof typeof STORY_PLACEMENTS), site);
    assert.ok(p.s2.startsWith("legacy:") || SITES.some((s) => s.id === p.s2), `${site} → ${p.s2}`);
    assert.equal(STORY_SITES[site as keyof typeof STORY_PLACEMENTS].depth, p.depth);
  }
  assert.equal(STORY_SITES.meridian_gate_hall.depth, 769);
  for (const [id, h] of [...Object.entries(PLACED_HOSTS), ...Object.entries(WORKS_FACES).map(([k, f]) => [k, f.position] as const)]) {
    // Floor or the structure it stands on (the dock platform, the hall's furniture).
    const above = h.y - world.supportHeight(h.x, h.z, h.y + 0.3);
    assert.ok(above > -0.05 && above < 2, `${id} rests on the floor or its structure (${above.toFixed(2)} m)`);
  }
});

/** Stand at the host's collision-checked normal view, face it and press E. */
function use(s: GameState, id: string): { state: GameState; message: string; error: boolean } {
  const v = NORMAL_VIEWS.find((x) => x.id === id)!;
  s.player.pose.position = { ...v.position }; s.player.mode = v.mode; faceTarget(s, id);
  const r = executeCommand(s, { type: "interact" }, world);
  const notice = r.events.find((e) => e.type === "notice");
  const error = !!(notice?.type === "notice" && notice.error);
  return { state: r.state, message: error && notice?.type === "notice" ? notice.message : r.state.feedback, error };
}

test("COMPOSED WORKS AND ENDING: the gate procedure, the hall and food restorations and the controller, by ordinary interaction", () => {
  let s = protectedReadyState(800);
  // The records that grant the works plans, found where they stand (C07–C10).
  for (const id of ["C07", "C08", "C09", "C10"]) s = use(s, id).state;
  for (const bp of ["bp_service_power", "bp_service_air", "bp_works_hall", "bp_food_module"] as const) assert.ok(s.knowledge.blueprints.includes(bp), bp);
  // Without the assemblies, the live panel reads out the procedure and what is missing.
  s = use(s, "gate_panel").state;
  let r = use(s, "gate_panel");
  assert.match(r.message, /Procedure · stage power · stage air · isolate · equalize · open/);
  assert.equal(r.state.story.works.power, false);
  // Carry both fabricated assemblies (staged: the bench recipes are tested elsewhere).
  addItem(s, "service_power_assembly", 1, "diver"); addItem(s, "service_air_assembly", 1, "diver");
  for (const expected of ["power", "air", "isolated", "equalizing"] as const) {
    r = use(s, "gate_panel"); assert.equal(r.error, false, r.message); s = r.state;
    if (expected === "power") assert.equal(s.story.works.power, true);
    if (expected === "air") assert.equal(s.story.works.air, true);
    if (expected === "isolated" || expected === "equalizing") assert.equal(s.story.works.gate, expected);
  }
  assert.ok(!s.inventory.items.some((i) => i.kind === "service_power_assembly" || i.kind === "service_air_assembly"), "assemblies spent");
  saveable(s);
  // The pipe drains over real steps; opening early is refused with a reason.
  r = use(s, "gate_panel"); assert.equal(s.story.works.gate, "equalizing");
  for (let i = 0; i < 5400; i++) s = stepGame(s, [], world).state;
  assert.equal(s.story.works.gate, "equalized");
  s = use(s, "gate_panel").state;
  assert.equal(s.story.works.gate, "open");
  // The inner hall appears once the gate is open.
  assert.ok(interactions(s).some((t) => t.id === "C15"), "the inner hall's finds are now reachable");
  // Hall, then food, from carried stock; then power routed from the gate panel.
  assert.equal(use(s, "works:food").error, true, "the food module waits for the hall");
  for (const recipe of ["restore_upper_hall", "restore_food_module"] as const)
    for (const [k, q] of Object.entries(STORY_RECIPES[recipe].cost)) addItem(s, k as ItemKind, q, "diver");
  // 30 CU of stock: the diver hold carries part; the rest rides in a nearby buoy-sized cache (staged as diver overflow).
  s.inventory.containers.find((c) => c.id === "diver")!.capacity = 64;
  for (const face of ["works:hall", "works:food"] as const) {
    r = use(s, face); assert.equal(r.error, false, r.message); s = r.state;
  }
  s.inventory.containers.find((c) => c.id === "diver")!.capacity = 16;
  assert.ok(s.story.works.hall && s.story.works.food);
  s = use(s, "gate_panel").state;
  assert.equal(s.story.works.hallPower, true);
  // The controller: its record first, then the closing scene, then the epilogue.
  s = use(s, "C13").state;
  s = use(s, "district_controller").state;
  r = use(s, "district_controller");
  assert.equal(r.error, false, r.message);
  s = r.state;
  assert.equal(s.story.resolution.phase, "first");
  r = use(s, "district_controller");
  assert.equal(r.state.story.resolution.phase, "complete");
  saveable(r.state);
});

test("ADVERSE: the controller refuses the closing scene while any requirement is unmet, and changes nothing", () => {
  let s = protectedReadyState(800);
  s = use(s, "C13").state; s = use(s, "district_controller").state;
  recordStory(s, "C09");
  const before = structuredClone(s), r = use(s, "district_controller");
  assert.equal(r.error, true);
  assert.match(r.message, /Not yet safe/);
  assert.equal(r.state, s); assert.deepEqual(s, before);
});

test("COMMANDS: {type:\"works\"} and {type:\"resolution\"} act only at their hosts, with S5's own refusals", () => {
  let s = protectedReadyState(800);
  for (const id of ["C07", "C08", "C09", "C10", "C13", "district_controller"]) s = use(s, id).state;
  const at = (id: string) => { const v = NORMAL_VIEWS.find((x) => x.id === id)!; s.player.pose.position = { ...v.position }; s.player.mode = v.mode; };
  // Away from the gate panel the command names where it works.
  at("C13");
  let r = executeCommand(s, { type: "works", action: "isolate" }, world);
  assert.match((r.events[0] as { message: string }).message, /gate panel/);
  at("gate_panel");
  r = executeCommand(s, { type: "works", action: "isolate" }, world);
  assert.ok(r.events.some((e) => e.type === "notice" && e.error), "isolation waits for both assemblies");
  addItem(s, "service_power_assembly", 1, "diver"); addItem(s, "service_air_assembly", 1, "diver");
  for (const action of ["install_power", "install_air", "isolate", "equalize"] as const) {
    r = executeCommand(s, { type: "works", action }, world);
    assert.ok(!r.events.some((e) => e.type === "notice" && e.error), action); s = r.state;
  }
  assert.equal(s.story.works.gate, "equalizing");
  // The controller refuses to begin while requirements are unmet, and a bad roster.
  at("district_controller");
  r = executeCommand(s, { type: "resolution", action: "begin" }, world);
  assert.match((r.events[0] as { message: string }).message, /Not yet safe/);
  r = executeCommand(s, { type: "resolution", action: "begin", roster: "nobody" as never }, world);
  assert.match((r.events[0] as { message: string }).message, /roster/);
  saveable(s);
});
