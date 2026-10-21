import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validState } from "../src/save/validation.js";
import { SITES } from "../src/content/regions/sites.js";
import type { ItemKind } from "../src/content/registry.js";
import { fixtureGame } from "../src/sim/carrier.js";
import { addItem } from "../src/sim/inventory.js";
import { creelFirst } from "./b1-support.js";
import { moveCargo, ferryFromCarrier, ferryToCarrier } from "../scripts/playthrough/cargo.js";
import type { Cargo } from "../scripts/playthrough/cargo.js";
import { enterCarrier } from "../scripts/playthrough/carrierplay.js";
import { RECIPES } from "../src/content/registry.js";
import { makeVehicle } from "../src/sim/state.js";
import { collect, runGroups } from "../scripts/playthrough/parallel.js";
import type { ChildOutcome } from "../scripts/playthrough/parallel.js";
import { malformedExpected, staleExpected } from "../scripts/playthrough/pending.js";
import { emptyRun } from "../scripts/playthrough/timeline.js";
import { loadCampaign, need, optionalModule } from "../scripts/playthrough/content.js";
import { Blocked, Driver } from "../scripts/playthrough/driver.js";
import { CARRIER_LATER, CREEL_LATER, deliverToCarrier, sortieHull, stageWorksCargo, worksSite } from "../scripts/playthrough/later.js";
import { LIVE_PHASES, REFITS_PHASE } from "../scripts/playthrough/live.js";
import { executeCommand } from "../src/sim/step.js";
import type { GameCommand, GameState } from "../src/sim/types.js";
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
    // Every failure is a failing "child process" check (the run is blocked, or kept with
    // its diagnostics when the child exited nonzero after a complete result).
    const blocked = runs.filter((r) => r.checks.some((c) => c.name === "child process" && !c.ok));
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
  // Untouched: since C3 nothing is pending, so the phase never reports missing content.
  const run = await runPhases(new Driver("fast-pending-ok", "creel"), CREEL_LATER.filter((p) => p.id === "ending"), { readOptional: true, reverse: false });
  assert.notEqual(run.outcome, "pending-c3");
  assert.doesNotMatch(run.phases[0]!.detail?.join() ?? "", /missing content/);
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

test("R2: a missing dependency inside an existing optional module propagates; an absent module is null", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p1-optional-"));
  try {
    fs.writeFileSync(path.join(dir, "index.js"), 'import "./p1_missing_dependency.js";\nexport const X = 1;\n');
    await assert.rejects(optionalModule(pathToFileURL(path.join(dir, "index.js")).href), (e: { code?: string }) => e.code === "ERR_MODULE_NOT_FOUND");
    assert.equal(await optionalModule(pathToFileURL(path.join(dir, "absent.js")).href), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("R2: an S2 site that exists but is broken blocks; it is never pending", async () => {
  await loadCampaign();
  const site = SITES.find((s) => s.id === "rift.materials_station")!, work = site.work as { x: number } | undefined, at = site.at as { x: number };
  const saved = { work: work?.x, at: at.x };
  try {
    if (work) work.x = 9000; at.x = 9000;
    assert.deepEqual(need.site("rift.materials_station").map((m) => m.key), ["broken:site:rift.materials_station"]);
    const run = await runPhases(new Driver("fast-broken-site", "creel"), CREEL_LATER.filter((p) => p.id === "rift"), { readOptional: true, reverse: false });
    assert.equal(run.outcome, "blocked");
    assert.match(run.phases[0]!.detail!.join(), /\[broken:site:rift\.materials_station\]/);
  } finally { if (work) work.x = saved.work!; at.x = saved.at; }
  // Healthy, it is reachable since C3 lifted B1's bounds; and the list holds no present-but-broken keys.
  assert.deepEqual(need.site("rift.materials_station").map((m) => m.key), []);
  assert.deepEqual(malformedExpected(), []);
});

test("R2: works cargo is tracked by item identity into the moored Creel's hold (seeded diagnostic, real commands)", () => {
  // Seeded: an earned-equivalent Creel-first state, the two assembly plans, and the
  // materials in the workshop locker. Everything after this is real commands.
  const s = creelFirst(["creel_cargo_rack"]);
  for (const bp of ["bp_service_power", "bp_service_air"] as const) s.knowledge.blueprints.push(bp);
  for (const [k, n] of Object.entries({ thermal_core: 2, conductive_crust: 5, structural_alloy: 8, brine_lattice: 2, flex_membrane: 11,
    silica_glass: 8, buoyant_resin: 4 })) addItem(s, k as ItemKind, n, "workshop_locker");
  const d = new Driver("fast-works-cargo", "creel", s);
  const creel = d.vehicle("creel")!, rack = d.state.inventory.items.find((i) => i.kind === "creel_cargo_rack")!;
  d.command({ type: "install-module", vehicleId: creel.id, itemId: rack.id });
  const cargo = stageWorksCargo(d);
  assert.equal(cargo.ids.length, 2);
  assert.deepEqual(cargo.ids.map((id) => d.state.inventory.items.find((i) => i.id === id)?.containerId), [creel.cargoId, creel.cargoId]);
  assert.deepEqual(cargo.ids.map((id) => d.state.inventory.items.find((i) => i.id === id)!.kind), ["service_power_assembly", "service_air_assembly"]);
  for (const [k, n] of Object.entries(cargo.stock)) assert.equal(d.count(k as ItemKind, [creel.cargoId]), n, k);
  // The same instances come back out to the diver at the bench, where both are local.
  moveCargo(d, { ids: cargo.ids, stock: {} }, creel.cargoId, "diver");
  assert.deepEqual(cargo.ids.map((id) => d.state.inventory.items.find((i) => i.id === id)!.containerId), ["diver", "diver"]);
  assert.equal(d.run.refusals.length, 0);
});

test("R2: carrier cargo moves only through the vestibule and the craft's side (seeded fixture, real commands)", () => {
  // Seeded: the root carrier fixture, two assemblies and stock in its Creel's hold, the
  // diver swimming beside that Creel. Everything after this is real commands.
  const s = fixtureGame(), creel = s.fleet.vehicles.find((v) => v.hull === "creel")!, h = s.fleet.vehicles.find((v) => v.hull === "hearthline")!;
  const a = addItem(s, "service_power_assembly", 1, creel.cargoId), b = addItem(s, "service_air_assembly", 1, creel.cargoId);
  addItem(s, "silica_glass", 6, creel.cargoId);
  s.player.pose.position = { x: creel.pose.position.x + 4, y: creel.pose.position.y, z: creel.pose.position.z };
  Object.assign(s.player, { mode: "swimming", interiorId: null, interiorPose: null, controlledVehicleId: null });
  const d = new Driver("fast-ferry", "carrier", s);
  const cargo: Cargo = { ids: [a.id, b.id], stock: { silica_glass: 6 } };
  // A remote transfer is refused by the harness before any command is issued.
  d.state = { ...d.state, player: { ...d.state.player, pose: { ...d.state.player.pose, position: { x: 0, y: -1, z: 0 } } } };
  assert.throws(() => moveCargo(d, cargo, creel.cargoId, h.cargoId), /no physical interface/);
  assert.equal(d.run.refusals.length, 0);
  d.state = s;
  ferryToCarrier(d, creel.id, cargo);
  assert.deepEqual([a.id, b.id].map((id) => d.state.inventory.items.find((i) => i.id === id)!.containerId), [h.cargoId, h.cargoId]);
  assert.equal(d.count("silica_glass", [h.cargoId]), 6);
  enterCarrier(d);
  ferryFromCarrier(d, creel.id, { ids: [a.id, b.id], stock: {} });
  assert.deepEqual([a.id, b.id].map((id) => d.state.inventory.items.find((i) => i.id === id)!.containerId), [creel.cargoId, creel.cargoId]);
  assert.equal(d.run.refusals.length, 0);
});

test("R3: a command accepted without its effect blocks: a silent refit, transfer, service, mount or store", () => {
  // Seeded: a Creel-first state at the workshop bench with the 350 m refit paid for.
  const s = creelFirst(["creel_cargo_rack"]);
  for (const [k, n] of Object.entries(RECIPES.creel_350.cost)) addItem(s, k as ItemKind, n, "workshop_locker");
  const d = new Driver("fast-effects", "creel", s);
  const creel = d.vehicle("creel")!;
  // The reviewer's case: the game answers "refitted" but the hull keeps its rating.
  const silent: typeof d.exec = (state, c, w) => c.type === "craft" || c.type === "transfer" || c.type === "service" ||
      c.type === "install-module" || c.type === "store-materials"
    ? { state: { ...structuredClone(state), feedback: "Done." }, events: [{ type: "notice", channel: "action", message: "Done." }] }
    : executeCommand(state, c, w);
  d.exec = silent;
  const rack = d.state.inventory.items.find((i) => i.kind === "creel_cargo_rack")!;
  const cell = d.state.inventory.items.find((i) => i.kind === "reserve_cell")!;
  for (const [command, why] of [
    [{ type: "craft", recipeId: "creel_350" }, /no creel newly rated 350 m/],
    [{ type: "transfer", itemId: cell.id, to: "workshop_locker", quantity: 1 }, /changed by 0, expected -1/],
    [{ type: "install-module", vehicleId: creel.id, itemId: rack.id }, /is not installed/],
  ] as const) assert.throws(() => d.command(command), (e) => e instanceof Blocked && why.test(e.message), JSON.stringify(command));
  // With the real game every one of them takes effect and passes verification.
  d.exec = executeCommand;
  d.command({ type: "craft", recipeId: "creel_350" });
  assert.equal(d.vehicle("creel")!.rating, 350);
  d.command({ type: "install-module", vehicleId: creel.id, itemId: rack.id });
  d.command({ type: "transfer", itemId: cell.id, to: "workshop_locker", quantity: 1 });
});

test("R3: a refits milestone whose Creel kept its 240 m rating does not pass", () => {
  const d = new Driver("fast-refit-outcome", "creel", creelFirst());
  assert.match(REFITS_PHASE.verify(d).join("; "), /the creel is rated 240 m, not 350 m/);
  assert.match(REFITS_PHASE.verify(d).join("; "), /creel_350 was never crafted/);
});

test("R3: connected delivery to the carrier: moor, exit, approach in range, station keep, ferry (seeded fixture, real commands)", () => {
  // Seeded: the root carrier fixture with station keeping off, the diver at the
  // fixture Creel's helm, and the works cargo in its hold. The rest is real commands.
  const s = fixtureGame(), creel = s.fleet.vehicles.find((v) => v.hull === "creel")!, h = s.fleet.vehicles.find((v) => v.hull === "hearthline")!;
  s.fleet.docking!.stationKeeping = false;
  const a = addItem(s, "service_power_assembly", 1, creel.cargoId), b = addItem(s, "service_air_assembly", 1, creel.cargoId);
  addItem(s, "structural_alloy", 6, creel.cargoId);
  Object.assign(s.player, { mode: "piloting", controlledVehicleId: creel.id, interiorId: null, interiorPose: null,
    pose: structuredClone(creel.pose), velocity: { x: 0, y: 0, z: 0 } });
  const d = new Driver("fast-delivery", "carrier", s);
  deliverToCarrier(d, { ids: [a.id, b.id], stock: { structural_alloy: 6 } }, null);
  assert.deepEqual([a.id, b.id].map((id) => d.state.inventory.items.find((i) => i.id === id)!.containerId), [h.cargoId, h.cargoId]);
  assert.equal(d.count("structural_alloy", [h.cargoId]), 6);
  assert.equal(d.state.fleet.docking!.stationKeeping, true);
  assert.equal(d.run.refusals.length, 0);
});

test("R4: accepted-but-wrong inventory effects block: wrong source, duplicate, partial store, wrong craft destination, unknown kind", () => {
  // Seeded: a Creel-first state at the workshop bench; three glass carried, one in the pod locker.
  const fresh = (): Driver => {
    const s = creelFirst();
    addItem(s, "silica_glass", 3, "diver"); addItem(s, "silica_glass", 1, "pod_locker");
    s.knowledge.blueprints.push("bp_service_power");
    for (const [k, n] of Object.entries(RECIPES.service_power_assembly.cost)) addItem(s, k as ItemKind, n, "workshop_locker");
    return new Driver("fast-conservation", "creel", s);
  };
  const glass = (d: Driver, container: string) => d.state.inventory.items.find((i) => i.kind === "silica_glass" && i.containerId === container)!;
  const faulty = (mutate: (s: GameState, c: GameCommand) => void): typeof executeCommand => (state, c, w) => {
    const real = executeCommand(state, c, w);
    if (real.events.some((e) => e.type === "notice" && e.error)) return real;
    const s = structuredClone(state);
    mutate(s, c);
    return { state: s, events: real.events };
  };
  const blocks = (d: Driver, c: GameCommand, why: RegExp) =>
    assert.throws(() => d.command(c), (e) => e instanceof Blocked && why.test(e.message), JSON.stringify(c));

  // 1. Wrong source: the unit comes from the remote pod stack, not the requested diver stack.
  let d = fresh();
  d.exec = faulty((s) => { s.inventory.items.find((i) => i.kind === "silica_glass" && i.containerId === "pod_locker")!.containerId = "workshop_locker"; });
  blocks(d, { type: "transfer", itemId: glass(d, "diver").id, to: "workshop_locker", quantity: 1 }, /pod_locker\|silica_glass\|-\|public changed by -1, expected 0/);
  // 1b. Duplicate: the destination gains a unit, nothing is removed.
  d = fresh();
  d.exec = faulty((s) => { addItem(s, "silica_glass", 1, "workshop_locker"); });
  blocks(d, { type: "transfer", itemId: glass(d, "diver").id, to: "workshop_locker", quantity: 1 }, /diver\|silica_glass\|-\|public changed by 0, expected -1/);
  // 2. Partial bulk store: one of three arrives, two vanish.
  d = fresh();
  d.exec = faulty((s) => { const g = s.inventory.items.find((i) => i.kind === "silica_glass" && i.containerId === "diver")!; g.quantity = 1; g.containerId = "workshop_locker"; });
  blocks(d, { type: "store-materials", from: "diver", to: "workshop_locker" }, /workshop_locker\|silica_glass\|-\|public changed by 1, expected 3/);
  // 3. Wrong craft destination: the assembly appears in the workshop locker, not the diver hold.
  d = fresh();
  d.exec = (state, c, w) => {
    const real = executeCommand(state, c, w);
    if (c.type === "craft") for (const i of real.state.inventory.items) if (i.kind === "service_power_assembly") i.containerId = "workshop_locker";
    return real;
  };
  blocks(d, { type: "craft", recipeId: "service_power_assembly" }, /diver\|service_power_assembly\|-\|public changed by 0, expected 1/);
  // Controls: the real game passes every one of them.
  d = fresh();
  d.command({ type: "transfer", itemId: glass(d, "diver").id, to: "workshop_locker", quantity: 1 });
  d.command({ type: "store-materials", from: "diver", to: "workshop_locker" });
  d.command({ type: "craft", recipeId: "service_power_assembly" });
  // Exhaustive: a command kind without an effect rule fails closed.
  d = fresh();
  blocks(d, { type: "hint" }, /no effect rule/);
});
