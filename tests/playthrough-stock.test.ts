/** PACE-1 stage 1: the expedition stock plan (R2). The bot stocks only for recipes it
 * knows it will make and for needs read from evidence it has seen; a plan it doesn't
 * hold reserves nothing. */
import test from "node:test";
import assert from "node:assert/strict";
import { RECIPES } from "../src/content/registry.js";
import { STORY_RECIPES } from "../src/content/story/evidence.js";
import { CLUES, costOf, describe, knows, planExpedition, shortfall } from "../scripts/playthrough/stock.js";
import type { Clue } from "../scripts/playthrough/stock.js";

test("an unknown plan reserves nothing; a known one reserves its whole cost", () => {
  const air = planExpedition({ recipes: ["service_air_assembly"], blueprints: [] });
  assert.deepEqual(air.needs, {});
  assert.deepEqual(air.unknown, ["service_air_assembly"]);
  const known = planExpedition({ recipes: ["service_air_assembly"], blueprints: ["bp_service_air"] });
  assert.deepEqual(known.needs, { ...STORY_RECIPES.service_air_assembly.cost });
  assert.equal(known.unknown.length, 0);
  assert.ok(known.reserved.every((r) => r.why === "recipe service_air_assembly"));
});

test("the Divide's lattice is the known recipes' sum, never the air assembly's before its plan", () => {
  // Read at the Rift ledger: the dock and the 800 m refits. The air plan comes in the district.
  const plan = planExpedition({
    recipes: ["restore_divide_stop", "creel_800", "suit_800", "service_air_assembly"],
    blueprints: ["bp_deep_service", "bp_rift_pressure"], items: ["brine_lattice"],
  });
  const sum = ["restore_divide_stop", "creel_800", "suit_800"].reduce((n, r) => n + (RECIPES[r as keyof typeof RECIPES].cost as Record<string, number>).brine_lattice!, 0);
  assert.equal(plan.needs.brine_lattice, sum);
  assert.equal(sum, 11);
  assert.deepEqual(plan.unknown, ["service_air_assembly"]);
});

test("repeated recipes add up; items restricts the plan; declared extras carry their reason", () => {
  const plan = planExpedition({
    recipes: ["pod_buffer", "pod_buffer"], blueprints: ["bp_pod_buffer"], items: ["silica_glass"],
    extra: [{ why: "outpost pack loss", item: "structural_alloy", quantity: 1 }, { why: "spare", item: "silica_glass", quantity: 1 }],
  });
  assert.deepEqual(plan.needs, { silica_glass: 2 * STORY_RECIPES.pod_buffer.cost.silica_glass + 1 });
  assert.ok(plan.reserved.some((r) => r.why === "spare"));
});

test("a seen clue reserves its need until the recipe is known, then the recipe alone counts", () => {
  const clue: Clue = { id: "fixture.housing", for: "service_air_assembly", item: "brine_lattice", quantity: 2, where: "the Divide dock" };
  const unseen = planExpedition({ recipes: [], blueprints: [], clues: [clue] });
  assert.deepEqual(unseen.needs, {});
  const seen = planExpedition({ recipes: [], blueprints: [], seen: ["fixture.housing"], clues: [clue] });
  assert.deepEqual(seen.needs, { brine_lattice: 2 });
  assert.match(seen.reserved[0]!.why, /clue fixture.housing \(the Divide dock\)/);
  const both = planExpedition({ recipes: ["service_air_assembly"], blueprints: ["bp_service_air"], seen: ["fixture.housing"], clues: [clue] });
  assert.equal(both.needs.brine_lattice, STORY_RECIPES.service_air_assembly.cost.brine_lattice);
});

test("no clue is placed before stage 2", () => {
  assert.equal(CLUES.length, 0);
});

test("shortfall subtracts what is held and drops what is covered", () => {
  assert.deepEqual(shortfall({ silica_glass: 4, flex_membrane: 2 }, (k) => k === "silica_glass" ? 1 : 5), { silica_glass: 3 });
  assert.equal(describe({}), "nothing");
});

test("plans and costs come from the registry and the story recipes", () => {
  assert.equal(knows([], "pod_repair"), (RECIPES.pod_repair.bp ?? null) === null);
  assert.deepEqual(costOf("restore_upper_hall"), { ...STORY_RECIPES.restore_upper_hall.cost });
  assert.deepEqual(costOf("creel_800"), { ...RECIPES.creel_800.cost });
});
