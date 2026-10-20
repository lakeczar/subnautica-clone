import test from "node:test";
import assert from "node:assert/strict";
import { validState } from "../src/save/validation.js";
import { RECIPES } from "../src/content/registry.js";
import { makeVehicle } from "../src/sim/state.js";
import { collect, runGroups } from "../scripts/playthrough/parallel.js";
import type { ChildOutcome } from "../scripts/playthrough/parallel.js";
import { staleExpected } from "../scripts/playthrough/pending.js";
import { emptyRun } from "../scripts/playthrough/timeline.js";
import { loadCampaign, need } from "../scripts/playthrough/content.js";
import { Blocked, Driver } from "../scripts/playthrough/driver.js";
import { CARRIER_LATER, CREEL_LATER, sortieHull, worksSite } from "../scripts/playthrough/later.js";
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
  assert.deepEqual(need.recipe("no_such_recipe").map((m) => m.key), ["recipe:no_such_recipe"]);
  assert.deepEqual(need.source("basin_frame_fracture"), []);
  assert.deepEqual(need.route("route.legacy.reef_canopy"), []);
  assert.deepEqual(need.route("route.no_such").map((m) => m.key), ["route:route.no_such"]);
  assert.deepEqual(need.story("C05"), []);
  assert.deepEqual(need.facility("canopy_stop"), []);
  // Every later phase's list is keyed, readable content; an empty list means playable.
  const d = new Driver("fast-pending", "carrier");
  for (const phase of [...CREEL_LATER, ...CARRIER_LATER])
    for (const m of phase.missing(d)) assert.ok(/^[a-z-]+:/.test(m.key) && m.text.length > 8, `${phase.id}: ${JSON.stringify(m)}`);
});

test("a crashed, killed, timed-out or silent parallel child fails its whole group; nothing disappears", async () => {
  const run = (id: string) => ({ ...emptyRun(id, "creel"), outcome: "pending-c3" as const });
  const ok = (ids: string[]) => JSON.stringify({ runs: ids.map(run) });
  const group = ["creel", "carrier", "creel-loss"];
  const cases: [string, ChildOutcome][] = [
    ["clean", { code: 0, signal: null, error: null, json: ok(group) }],
    ["crash, no output", { code: 1, signal: null, error: null, json: null }],
    ["killed", { code: null, signal: "SIGKILL", error: null, json: ok(group) }],
    ["timeout", { code: null, signal: "SIGKILL", error: "timed out after 1800 s", json: null }],
    ["abnormal exit", { code: 134, signal: null, error: null, json: ok(group) }],
    ["a scenario missing", { code: 0, signal: null, error: null, json: ok(["creel", "carrier"]) }],
    ["a scenario twice", { code: 0, signal: null, error: null, json: ok([...group, "creel"]) }],
    ["garbage", { code: 0, signal: null, error: null, json: "{" }],
  ];
  for (const [name, outcome] of cases) {
    const runs = collect(group, outcome, () => "creel");
    assert.deepEqual(runs.map((r) => r.scenario), group, name);
    const blocked = runs.filter((r) => r.outcome === "blocked" && r.checks.some((c) => c.name === "child process" && !c.ok));
    assert.equal(blocked.length, name === "clean" ? 0 : name === "a scenario missing" || name === "a scenario twice" ? 1 : 3, name);
  }
  // A launcher that throws still yields every requested scenario, blocked.
  const runs = await runGroups(["creel", "reverse"], 2, async () => { throw new Error("spawn EAGAIN"); }, () => undefined, () => "creel");
  assert.deepEqual(runs.map((r) => [r.scenario, r.outcome]), [["creel", "blocked"], ["reverse", "blocked"]]);
});

test("removing an existing recipe blocks the phase that needs it instead of reporting pending", async () => {
  await loadCampaign();
  const registry = RECIPES as Record<string, unknown>, saved = registry.pod_buffer;
  try {
    delete registry.pod_buffer;
    const d = new Driver("fast-regression", "creel");
    const run = await runPhases(d, CREEL_LATER.filter((p) => p.id === "ending"), { readOptional: true, reverse: false });
    assert.equal(run.outcome, "blocked");
    assert.match(run.phases[0]!.detail!.join(), /unexpected missing content \[recipe:pod_buffer\]/);
  } finally { registry.pod_buffer = saved; }
  // Untouched, the same phase is merely pending on listed C3 content.
  const run = await runPhases(new Driver("fast-pending-ok", "creel"), CREEL_LATER.filter((p) => p.id === "ending"), { readOptional: true, reverse: false });
  assert.equal(run.outcome, "pending-c3");
  assert.deepEqual(staleExpected(), [], "every expected-pending key is still missing in this build");
});

test("works follow S5's sites, and a hull is never sent below its rating", () => {
  assert.equal(worksSite("install_power"), "meridian_gate_hall");
  assert.equal(worksSite("route_power"), "meridian_gate_hall");
  assert.equal(worksSite("restore_hall"), "meridian_upper_hall");
  assert.equal(worksSite("restore_food"), "meridian_upper_hall");
  const d = new Driver("fast-rating", "carrier");
  d.state.fleet.vehicles.push(makeVehicle("creel_1", "creel", { x: 0, y: -2, z: 0 }, "creel_1_hold"));
  d.state.fleet.vehicles[0]!.rating = 350;
  assert.throws(() => sortieHull(d, "creel", 600), /rated 350 m; the site is at 600 m/);
  assert.throws(() => sortieHull(d, "carrier", 600), /no mantle/);
});
