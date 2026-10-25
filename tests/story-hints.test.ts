import test from "node:test";
import assert from "node:assert/strict";
import { DISCOVERY_IDS, siteOf } from "../src/content/story/evidence.js";
import type { DiscoveryId } from "../src/content/story/evidence.js";
import { LEADS } from "../src/content/story/leads.js";
import { STORY_SITES } from "../src/content/story/sites.js";
import { NOTHING_PRESSING, WORKS_HINTS } from "../src/content/story/works.js";
import { learned, recordDiscovery } from "../src/sim/story/knowledge.js";
import { nextWorksStep, requestHint } from "../src/sim/story/hints.js";
import { planCampaign } from "../src/sim/story/reachability.js";
import { createStory } from "../src/sim/story/state.js";

const storyOf = (ids: readonly DiscoveryId[]) => {
  const s = createStory();
  ids.forEach((id, i) => recordDiscovery(s, id, i + 1));
  return s;
};

test("hints graduate one tier per request, cap at three, and change nothing else", () => {
  const s = storyOf(["C01"]);
  const before = JSON.stringify({ d: s.discoveries, w: s.works, r: s.resolution });
  const tiers = [1, 2, 3, 4].map(() => requestHint(s));
  assert.deepEqual(tiers.map((h) => h.subject), ["L01", "L01", "L01", "L01"]);
  assert.deepEqual(tiers.map((h) => h.tier), [1, 2, 3, 3]);
  assert.deepEqual(tiers.slice(0, 3).map((h) => h.text), LEADS.L01.hints);
  assert.equal(JSON.stringify({ d: s.discoveries, w: s.works, r: s.resolution }), before, "a hint never discovers or operates anything");
});

test("tier one restates what is known; the lead moves on once its target is found", () => {
  const s = storyOf(["C01"]);
  assert.match(requestHint(s).text, /regulator/);
  recordDiscovery(s, "C02", 2);
  const next = requestHint(s);
  assert.equal(next.subject, "L02");
  assert.equal(next.tier, 1, "a new subject starts again at tier one");
});

test("reachable leads are preferred when the coordinator supplies a physical check", () => {
  const s = storyOf(["C01"]);
  assert.equal(requestHint(s, { reachable: (site) => site !== "reef_ribs" }).subject, "L02");
  assert.equal(requestHint(s, { reachable: () => false }).subject, "L01", "falls back to the earliest open lead");
});

test("before the reveal, works hints follow the procedure once it is known", () => {
  const s = storyOf(["C01", "gate_panel"]);
  for (const id of ["C02", "C03", "C04", "C05", "C06", "C07", "C08", "C09", "C10", "C11", "C12", "rift_station_ledger"] as const)
    recordDiscovery(s, id, s.discoveries.length + 1);
  assert.equal(learned(s.discoveries).has("F17"), false);
  // Open leads still come first before the reveal; the works step waits behind them.
  assert.match(String(requestHint(s).subject), /^L\d+$/);
  assert.equal(nextWorksStep(s), "w_power");
});

test("after the reveal, practical works steps come before remaining leads", () => {
  const s = storyOf(["C01", "C13"]);
  const h = requestHint(s);
  assert.equal(h.subject, "w_power");
  const second = requestHint(s);
  assert.equal(second.text, WORKS_HINTS.w_power.plans, "tier two names where the missing plans are kept");
  const withPlans = storyOf(["C01", "C13", "C07"]);
  requestHint(withPlans);
  assert.equal(requestHint(withPlans).text, WORKS_HINTS.w_power.tiers[1]);
});

test("a completed story has nothing pressing", () => {
  const plan = planCampaign("independent");
  assert.deepEqual(requestHint(plan.story), { subject: null, tier: 0, text: NOTHING_PRESSING });
});

test("no hint before the reveal states it, along either strategy's route", () => {
  const reveal = /\b191\b|asleep|\balive\b|living occupants|still occupied|empty (slot|one)|\bbeds?\b/i;
  for (const strategy of ["independent", "carrier"] as const) {
    const s = createStory();
    for (const [i, id] of planCampaign(strategy, { optional: true }).order.entries()) {
      recordDiscovery(s, id, i + 1);
      if (learned(s.discoveries).has("F17")) break;
      for (let k = 0; k < 3; k++) assert.doesNotMatch(requestHint(s).text, reveal, `after ${id}`);
    }
  }
});

test("every hint subject points at a placed site", () => {
  for (const id of DISCOVERY_IDS) assert.ok(STORY_SITES[siteOf(id)], id);
  for (const l of Object.values(LEADS)) assert.ok(STORY_SITES[l.site]);
});
