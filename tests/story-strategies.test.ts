import test from "node:test";
import assert from "node:assert/strict";
import { EVIDENCE_BLUEPRINTS } from "../src/content/registry.js";
import { DISCOVERY_IDS, isOptional, STORY_GRANTS } from "../src/content/story/evidence.js";
import type { DiscoveryId } from "../src/content/story/evidence.js";
import { FACT_IDS, FACTS } from "../src/content/story/facts.js";
import { CAMPAIGN_STEPS, FLEET_STRATEGIES } from "../src/content/story/strategies.js";
import type { StrategyId } from "../src/content/story/strategies.js";
import { learned } from "../src/sim/story/knowledge.js";
import { planCampaign, proposalModel } from "../src/sim/story/reachability.js";
import { completeOpening } from "../src/sim/progression.js";
import { createGame } from "../src/sim/state.js";

const STRATEGIES = Object.keys(FLEET_STRATEGIES) as StrategyId[];

for (const strategy of STRATEGIES) {
  test(`${strategy}: reaches the ending from New Game without optional finds`, () => {
    const plan = planCampaign(strategy);
    assert.equal(plan.ending, true, `steps ${plan.steps.join(",")} · found ${plan.order.join(",")}`);
    assert.equal(plan.story.resolution.phase, "complete");
    assert.ok(plan.order.every((id) => !isOptional(id)), "the plan collected no optional item");
  });

  test(`${strategy}: discovery order within a pass does not change the outcome`, () => {
    const forward = planCampaign(strategy), reverse = planCampaign(strategy, { reverse: true });
    assert.equal(reverse.ending, true);
    assert.deepEqual([...reverse.order].sort(), [...forward.order].sort());
    assert.notDeepEqual(reverse.order, forward.order, "the two runs really used different orders");
  });

  test(`${strategy}: every critical fact is answered by the end`, () => {
    const known = learned(planCampaign(strategy).story.discoveries);
    for (const f of FACT_IDS) if (FACTS[f].critical) assert.ok(known.has(f), f);
  });

  test(`${strategy}: collecting every optional record changes nothing required`, () => {
    const plain = planCampaign(strategy), full = planCampaign(strategy, { optional: true });
    assert.equal(full.ending, true);
    assert.deepEqual(full.steps, plain.steps);
    assert.ok(full.order.some(isOptional), "optional items were reachable and collected");
  });
}

test("the two strategies are distinct fleets", () => {
  const independent = planCampaign("independent"), carrier = planCampaign("carrier");
  assert.equal(independent.caps.hulls.hearthline, undefined, "independent route never builds the carrier");
  assert.equal(independent.caps.hulls.mantle, undefined);
  assert.ok((carrier.caps.hulls.creel ?? 0) <= 350, "carrier route never takes the Creel deep");
  assert.equal(carrier.caps.stops.has("stop_divide_lee"), false, "carrier route needs no Divide stop");
  assert.equal(carrier.caps.hulls.hush, undefined);
  for (const s of STRATEGIES) for (const step of FLEET_STRATEGIES[s].steps)
    assert.notEqual((CAMPAIGN_STEPS[step] as { hull?: readonly [string, number] }).hull?.[0], "spindle");
});

test("losing any one non-optional story source still reaches the ending", () => {
  for (const id of DISCOVERY_IDS) {
    if (isOptional(id)) continue;
    for (const strategy of STRATEGIES)
      assert.equal(planCampaign(strategy, { skip: [id] }).ending, true, `${strategy} without ${id}`);
  }
});

test("each plan-carrying early find and its local recovery record are interchangeable", () => {
  for (const [primary, recovery] of [["C01", "pod_checklist"], ["C03", "gantry_plates"], ["C04", "fin_survey_post"], ["C05", "basin_service_rack"]] as const)
    for (const strategy of STRATEGIES) {
      assert.equal(planCampaign(strategy, { skip: [recovery] }).ending, true, `${strategy} with only ${primary}`);
      assert.equal(planCampaign(strategy, { skip: [primary] }).ending, true, `${strategy} with only ${recovery}`);
      assert.equal(planCampaign(strategy, { skip: [primary, recovery] }).ending, false, `${strategy} needs one of ${primary}/${recovery}`);
    }
});

test("the game's opening always records the first evidence and its plans", () => {
  const s = createGame();
  completeOpening(s);
  assert.ok(s.knowledge.evidence.some((e) => e.id === "C01"));
  for (const bp of EVIDENCE_BLUEPRINTS.C01) assert.ok(s.knowledge.blueprints.includes(bp), bp);
});

test("the planner runs on an injected step model, so composition can feed it registry dependencies", () => {
  for (const strategy of STRATEGIES) {
    const model = proposalModel(strategy);
    assert.equal(planCampaign(strategy, { model }).ending, true);
    const broken = { ...model.steps, suit_350: { ...model.steps.suit_350!, needs: ["suit_350"] } };
    const plan = planCampaign(strategy, { model: { steps: broken } });
    assert.equal(plan.ending, false, `${strategy} with a self-dependent refit`);
    assert.ok(!plan.steps.includes("suit_350"));
    assert.throws(() => planCampaign(strategy, { model: { order: [...model.order, "missing_step"] } }), /missing_step/);
  }
});

test("optional items never grant plans", () => {
  for (const id of Object.keys(STORY_GRANTS) as DiscoveryId[]) assert.equal(isOptional(id), false, id);
});

test("adverse: losing both sources of a critical plan blocks the ending, so the planner is not vacuous", () => {
  for (const strategy of STRATEGIES) {
    const plan = planCampaign(strategy, { skip: ["C07", "rift_station_ledger"] });
    assert.equal(plan.ending, false, strategy);
    assert.ok(!plan.steps.includes("suit_800"), "no deep-service package without its plans");
  }
});
