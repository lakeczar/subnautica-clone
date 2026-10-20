import test from "node:test";
import assert from "node:assert/strict";
import { validState } from "../src/save/validation.js";
import { loadCampaign, need } from "../scripts/playthrough/content.js";
import { Blocked, Driver } from "../scripts/playthrough/driver.js";
import { CARRIER_LATER, CREEL_LATER } from "../scripts/playthrough/later.js";
import { LIVE_PHASES } from "../scripts/playthrough/live.js";
import { runPhases } from "../scripts/playthrough/runner.js";

// The full campaign runs as `npm run playthrough`; this keeps its first real slice
// and its contracts in the fast tier.

test("New Game through the reef plays on real commands, with exact milestone reloads and a coherent ledger", async () => {
  const d = new Driver("fast-slice", "creel");
  const run = await runPhases(d, LIVE_PHASES.slice(0, 2), { readOptional: true, reverse: false });
  assert.equal(run.outcome, "complete", JSON.stringify(run.phases.map((p) => [p.id, p.status, p.detail])));
  assert.deepEqual(run.phases.map((p) => p.status), ["pass", "pass"]);
  assert.equal(run.saves.length, 2);
  assert.ok(run.saves.every((s) => s.equal), "every milestone reload hashes like the live state");
  assert.ok(validState(d.state));
  for (const id of ["pod_repair", "essential_tools", "suit_150", "reserve_cells", "salvage_buoy", "bobbin_kit"])
    assert.ok(d.crafted(id), id);
  assert.deepEqual(run.discoveries.slice(0, 1).map((r) => r.id), ["C01"]);
  assert.ok(d.knows("C02") && d.knows("pod_checklist"));
  // Nothing is spent that was not gathered: the harness never adds stock.
  for (const [kind, n] of Object.entries(run.spent)) assert.ok(n <= (run.gathered[kind] ?? 0), `${kind}: spent ${n}`);
  assert.ok(run.legs.some((l) => l.kind === "travel") && run.legs.every((l) => l.ticks >= 0));
  assert.ok(run.legs.every((l) => l.minima.oxygen > 0), "no leg ran out of air");
  assert.equal(run.failures, 0);
});

test("a refused command surfaces as a Blocked finding and leaves the state untouched", () => {
  const d = new Driver("fast-refusal", "creel");
  for (let i = 0; i < 4; i++) d.command({ type: "interact" });
  const before = structuredClone(d.state);
  assert.throws(() => d.command({ type: "craft", recipeId: "dart_base" }), (e) => e instanceof Blocked && /refused/.test(e.message));
  assert.deepEqual(d.state, before);
  assert.equal(d.run.refusals.length, 1);
});

test("the content checks name what a later phase waits on and pass what exists", async () => {
  await loadCampaign();
  assert.deepEqual(need.recipe("pod_repair"), []);
  assert.match(need.recipe("no_such_recipe").join(), /no_such_recipe/);
  assert.deepEqual(need.source("basin_frame_fracture"), []);
  assert.deepEqual(need.route("route.legacy.reef_canopy"), []);
  assert.match(need.route("route.no_such").join(), /route.no_such/);
  assert.deepEqual(need.story("C05"), []);
  assert.deepEqual(need.facility("canopy_stop"), []);
  // Every later phase's list is a list of readable strings; an empty list means playable.
  const d = new Driver("fast-pending", "carrier");
  for (const phase of [...CREEL_LATER, ...CARRIER_LATER])
    for (const line of phase.missing(d)) assert.ok(typeof line === "string" && line.length > 8, `${phase.id}: ${line}`);
});
