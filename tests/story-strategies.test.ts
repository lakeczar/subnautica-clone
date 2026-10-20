import test from "node:test";
import assert from "node:assert/strict";
import { DISCOVERY_IDS, isOptional, STORY_GRANTS } from "../src/content/story/evidence.js";
import type { DiscoveryId } from "../src/content/story/evidence.js";
import { FACT_IDS, FACTS } from "../src/content/story/facts.js";
import { CAMPAIGN_STEPS, FLEET_STRATEGIES } from "../src/content/story/strategies.js";
import type { StrategyId } from "../src/content/story/strategies.js";
import { learned } from "../src/sim/story/knowledge.js";
import { planCampaign } from "../src/sim/story/reachability.js";

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
  // C01–C05 are the opening, workshop and first-hull records owned with the
  // registry; their single-source plans are a known limit for the coordinator.
  const registryOwned = new Set<DiscoveryId>(["C01", "C02", "C03", "C04", "C05"]);
  for (const id of DISCOVERY_IDS) {
    if (isOptional(id) || registryOwned.has(id)) continue;
    for (const strategy of STRATEGIES)
      assert.equal(planCampaign(strategy, { skip: [id] }).ending, true, `${strategy} without ${id}`);
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
