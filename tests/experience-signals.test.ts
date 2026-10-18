import test from "node:test";
import assert from "node:assert/strict";
import { EVIDENCE, HULLS, HULL_COLLIDERS, OPTIONAL_RECORD, RECIPES, SOURCES } from "../src/content/registry.js";
import type { ItemKind, RecipeId, SourceId } from "../src/content/registry.js";
import type { GameCommand, GameEvent, GameState, Vec3, WorldQueries } from "../src/sim/types.js";
import { createGame, eyeHeight, makeVehicle } from "../src/sim/state.js";
import { collect, collectWithOutcome, craft, craftingBlock, craftingRefusal, discover, interactions, toggleBuoy } from "../src/sim/progression.js";
import { addItem, transfer, usedCapacity } from "../src/sim/inventory.js";
import { aimedInteraction, interactionHost, INTERACTION_REACH, PREVIEW_REACH, reachPreview } from "../src/sim/targeting.js";
import { service, serviceRefusal, serviceState, serviceWouldRestore } from "../src/sim/vehicles.js";
import { disableVehicle, recoveryCommand } from "../src/sim/recovery.js";
import { executeCommand, stepGame } from "../src/sim/step.js";
import { createWorldQueries, WORLD_BOUNDS } from "../src/sim/world.js";
import { faceTarget, NORMAL_VIEWS, readyState } from "./targeting-support.js";

const empty = createWorldQueries([], () => -200), world = createWorldQueries();
const forward: GameCommand = { type: "move", forward: 1, right: 0, vertical: 0, sprint: false };
const notices = (events: GameEvent[]) => events.filter(e => e.type === "notice");
const sounds = (events: GameEvent[]) => events.filter(e => e.type === "sound");
const thrusts = (events: GameEvent[]) => events.filter(e => e.type === "thrust-sample");
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-10, a + " != " + b);
function viewAt(s: GameState, id: string): void {
  const view = NORMAL_VIEWS.find(v => v.id === id)!;
  s.player.pose.position = { ...view.position }; s.player.mode = view.mode; faceTarget(s, id);
}
function addDart(s: GameState, position: Vec3 = { x: -55, y: -10, z: 30 }) {
  const v = makeVehicle("signal_dart", "dart", position, "signal_hold");
  s.fleet.vehicles.push(v);
  s.inventory.containers.push({ id: v.cargoId, kind: "vehicle", capacity: 32, ownerId: v.id });
  return v;
}
function pilot(position?: Vec3): GameState {
  const s = readyState(), v = addDart(s, position);
  s.player.controlledVehicleId = v.id; s.player.mode = "piloting"; s.player.pose = structuredClone(v.pose);
  return s;
}
function cache(s: GameState, id: string, position: Vec3): void {
  const containerId = id + "_hold";
  s.recovery.caches.push({ id, position, containerId });
  s.inventory.containers.push({ id: containerId, kind: "cache", capacity: 64, ownerId: id });
  addItem(s, "structural_alloy", 1, containerId);
}
function paid(withDart = true): GameState {
  const s = readyState(); discover(s, "C02"); discover(s, "C03");
  for (const id of ["pod_repair", "essential_tools", "suit_150", "salvage_buoy", "reserve_cells", "bobbin_kit", "restore_workshop", ...(withDart ? ["dart_base" as const] : [])] as const) {
    const r = RECIPES[id];
    if (r.site === "island_workshop") s.player.pose.position = { x: 10, y: 1.2, z: -34 };
    if (!r.maintenance) for (const [kind, quantity] of Object.entries(r.cost))
      addItem(s, kind as ItemKind, quantity, id === "restore_workshop" ? "diver" : r.site === "island_workshop" ? "workshop_locker" : "pod_locker");
    assert.equal(craft(s, id, world), null);
  }
  return s;
}
function receipt(out: { state: GameState; events: GameEvent[] }, expected: string, cue = "collect"): void {
  const ns = notices(out.events);
  assert.equal(ns.length, 1); assert.equal(ns[0]!.summary, expected);
  assert.equal(ns[0]!.message, out.state.feedback); assert.equal(ns[0]!.error, undefined);
  assert.deepEqual(sounds(out.events), [{ type: "sound", cue }], "one existing body/equipment sound, without an origin");
}

test("identical consecutive pickups each emit one actual receipt and collect sound through both command paths", () => {
  for (const stepping of [false, true]) {
    let s = readyState(); viewAt(s, "reef_service_scraps_east");
    s.world.resources.find(n => n.id === "reef_service_scraps_east")!.stock = 8;
    let full = "";
    for (const used of [8, 16]) {
      const out = stepping ? stepGame(s, [{ type: "interact" }], empty) : executeCommand(s, { type: "interact" }, empty);
      receipt(out, "+4 Structural alloy · diver hold " + used + "/16 CU");
      assert.ok(out.state.feedback.endsWith(SOURCES.reef_service_scraps_east.context));
      if (full) assert.equal(out.state.feedback, full, "receipt delivery does not depend on saved feedback changing");
      full = out.state.feedback; s = out.state;
      assert.equal(usedCapacity(s, "diver"), used);
    }
    assert.equal(s.metrics.collections, 2);
  }
});

test("partial bundles report actual buoy destination/capacity; full holds refuse without a pickup or sound", () => {
  let s = readyState(); viewAt(s, "reef_service_scraps_east");
  const buoy = addItem(s, "salvage_buoy", 1, "diver"); s.inventory.buoy.itemId = buoy.id;
  assert.equal(toggleBuoy(s), null); addItem(s, "structural_alloy", 8, "diver");
  s.world.resources.find(n => n.id === "reef_service_scraps_east")!.stock = 2;
  const out = executeCommand(s, { type: "interact" }, empty);
  receipt(out, "+2 Structural alloy · buoy hold 4/24 CU"); s = out.state;
  assert.equal(s.world.resources.find(n => n.id === "reef_service_scraps_east")!.stock, 0);
  addItem(s, "silica_glass", 20, "buoy_hold");
  s.world.resources.find(n => n.id === "reef_service_scraps_east")!.stock = 4;
  for (const stepping of [false, true]) {
    const before = structuredClone(s), result = stepping ? stepGame(s, [{ type: "interact" }], empty) : executeCommand(s, { type: "interact" }, empty);
    assert.deepEqual(result.state, stepping ? stepGame(s, [], empty).state : s);
    assert.deepEqual(s, before); assert.equal(result.state.metrics.collections, 1);
    assert.deepEqual(result.events, [{ type: "notice", channel: "action", error: true,
      message: "No room for this bundle. Stow cargo, or deploy the 24 CU salvage buoy. Nothing collected." }]);
  }
});

test("collect remains a compatible single mutation path and tending-only operations never claim a pickup", () => {
  for (const id of ["reef_service_scraps_east", "reef_edible_school_north"] as const) {
    const s = readyState(); viewAt(s, id);
    for (const stock of [2, 0]) {
      s.world.resources.find(n => n.id === id)!.stock = stock;
      const a = structuredClone(s), b = structuredClone(s), result = collectWithOutcome(a, id);
      assert.equal(collect(b, id), result.refusal); assert.deepEqual(a, b);
      assert.equal(result.pickup?.quantity ?? null, stock ? Math.min(stock, SOURCES[id].bundle) : null);
    }
  }
  const s = readyState(); viewAt(s, "reef_edible_school_north");
  s.world.resources.find(n => n.id === "reef_edible_school_north")!.stock = 0;
  for (const out of [executeCommand(s, { type: "interact" }, empty), stepGame(s, [{ type: "interact" }], empty)]) {
    assert.equal(notices(out.events).length, 1); assert.match(notices(out.events)[0]!.message, /Active tending started/);
    assert.equal(notices(out.events)[0]!.summary, undefined); assert.deepEqual(sounds(out.events), []);
    assert.deepEqual(out.state.inventory, s.inventory); assert.equal(out.state.metrics.collections, 0);
    assert.equal(out.state.world.action?.kind, "food");
  }
  assert.equal(collectWithOutcome(readyState(), "reef_service_scraps_east").pickup, null, "out-of-reach refusal");
});

test("transfer/store receipts use executed amounts and destination; stale/refused commands never get summaries", () => {
  let s = readyState(), item = addItem(s, "structural_alloy", 5, "diver");
  let out = executeCommand(s, { type: "transfer", itemId: item.id, to: "pod_locker", quantity: 2 }, empty);
  receipt(out, "2 × Structural alloy → pod locker"); s = out.state;
  addItem(s, "silica_glass", 1, "diver");
  out = executeCommand(s, { type: "store-materials", from: "diver", to: "pod_locker" }, empty);
  receipt(out, "Stored 7 CU → pod locker"); s = out.state;
  for (const c of [
    { type: "transfer", itemId: item.id, to: "pod_locker", quantity: 1 },
    { type: "store-materials", from: "diver", to: "pod_locker" },
    { type: "install-module", vehicleId: "missing", itemId: "missing" },
    { type: "service", vehicleId: "missing" },
    { type: "interact", target: "stale" },
  ] as const) {
    const result = executeCommand(s, c, empty);
    assert.equal(result.state, s); assert.equal(notices(result.events).length, 1);
    assert.equal(notices(result.events)[0]!.error, true); assert.equal(notices(result.events)[0]!.summary, undefined);
    assert.deepEqual(sounds(result.events), []);
  }
});

test("paid Dart/trim fabrication, fitting, service/reserve, boarding and underwater exit return concise exact receipts", () => {
  let s = paid(false);
  for (const [kind, n] of Object.entries(RECIPES.dart_base.cost)) addItem(s, kind as ItemKind, n, "workshop_locker");
  let out = executeCommand(s, { type: "craft", recipeId: "dart_base" }, world);
  receipt(out, "Dart scout built", "craft"); assert.match(out.state.feedback, /cockpit side/); s = out.state;
  discover(s, "C04");
  addItem(s, "conductive_crust", 2, "workshop_locker"); addItem(s, "buoyant_resin", 2, "workshop_locker");
  out = executeCommand(s, { type: "craft", recipeId: "dart_acoustic_trim" }, world);
  receipt(out, "Acoustic trim made", "craft"); assert.match(out.state.feedback, /fit it from Cargo/); s = out.state;
  const v = s.fleet.vehicles[0]!, trim = s.inventory.items.find(i => i.kind === "dart_acoustic_trim")!;
  out = executeCommand(s, { type: "install-module", vehicleId: v.id, itemId: trim.id }, world);
  receipt(out, "Dart acoustic trim fitted"); assert.equal(out.state.feedback, "Dart acoustic trim fitted."); s = out.state;
  out = executeCommand(s, { type: "remove-module", vehicleId: v.id, itemId: trim.id }, world);
  receipt(out, "Dart acoustic trim removed · Dart hold"); assert.equal(out.state.inventory.items.find(i => i.id === trim.id)!.containerId, v.cargoId); s = out.state;
  s.player.pose.position = { ...s.fleet.vehicles[0]!.pose.position, z: s.fleet.vehicles[0]!.pose.position.z + 3 };
  s.player.mode = "swimming"; faceTarget(s, v.id);
  out = executeCommand(s, { type: "interact" }, empty); receipt(out, "Piloting " + HULLS.dart.label); s = out.state;
  s.fleet.vehicles[0]!.charge = 90.5;
  out = executeCommand(s, { type: "reserve", vehicleId: v.id }, empty); receipt(out, "+9.5% hull power"); s = out.state;
  out = executeCommand(s, { type: "service", vehicleId: v.id }, empty); receipt(out, HULLS.dart.label + " serviced"); s = out.state;
  out = executeCommand(s, { type: "exit" }, empty); receipt(out, "Left the craft");
  assert.equal(out.state.player.mode, "swimming"); assert.ok(out.state.player.pose.position.y < 0);
});

test("validated panel openings suppress stale feedback and generic collect fallback in both paths", () => {
  const cases: [GameState, string, "inventory" | "notebook" | "craft"][] = [];
  for (const id of ["C01", "pod_services", "workshop_services", "rescue_staging"]) {
    const s = readyState(); viewAt(s, id); cases.push([s, id, id === "C01" ? "notebook" : id === "rescue_staging" ? "inventory" : "craft"]);
  }
  const disabled = readyState(); disabled.player.mode = "swimming"; disabled.player.pose.position = { x: 60, y: -20, z: -30 };
  const v = addDart(disabled, { x: 60, y: -20, z: -32 }); v.disabled = true; faceTarget(disabled, v.id);
  cases.push([disabled, v.id, "inventory"]);
  const cached = readyState(); cached.player.mode = "swimming"; cached.player.pose.position = { x: 60, y: -20, z: -30 };
  cache(cached, "signal_cache", { x: 60, y: -20, z: -32 }); faceTarget(cached, "signal_cache");
  cases.push([cached, "signal_cache", "inventory"]);
  for (const [s, id, panel] of cases) {
    s.feedback = "Protected previous recovery information";
    for (const stepping of [false, true]) {
      const out = stepping ? stepGame(s, [{ type: "interact", target: id }], empty) : executeCommand(s, { type: "interact", target: id }, empty);
      assert.deepEqual(out.events, [{ type: "interaction-panel", panel, targetId: id }, ...(stepping ? stepGame(s, [], empty).events : [])], id);
      assert.equal(out.state.feedback, s.feedback); assert.deepEqual(out.state.knowledge, s.knowledge);
    }
    const refused = executeCommand(s, { type: "interact", target: "stale" }, empty);
    assert.equal(refused.state, s); assert.equal(notices(refused.events)[0]!.error, true);
  }
});

test("preview has strict body-datum boundaries and cannot execute E/Q, mutate or discover", () => {
  assert.equal(INTERACTION_REACH, 4); assert.equal(PREVIEW_REACH, 8);
  for (const d of [3.99, 4, 7.99, 8]) {
    const s = readyState(); s.player.mode = "swimming"; s.player.pose.position = { x: 60, y: -20, z: -30 };
    cache(s, "boundary_cache", { x: 60, y: -20, z: -30 - d }); faceTarget(s, "boundary_cache");
    const before = structuredClone(s);
    assert.equal(aimedInteraction(s, empty)?.id ?? null, d < 4 ? "boundary_cache" : null);
    assert.equal(reachPreview(s, empty)?.id ?? null, d >= 4 && d < 8 ? "boundary_cache" : null);
    assert.deepEqual(s, before);
    if (d >= 4) {
      addItem(s, "essential_tools", 1, "equipment", "tools");
      for (const c of [{ type: "interact" }, { type: "scan" }] as const) {
        const result = executeCommand(s, c, empty);
        assert.deepEqual(result.state, s);
        assert.deepEqual(result.events, [{ type: "notice", channel: "action", message: "Nothing within reach." }]);
      }
    }
  }
});

test("preview uses the same centered/tie selection but never shadows an executable target", () => {
  const s = readyState(); s.player.mode = "swimming"; s.player.pose.position = { x: 60, y: -20, z: -30 };
  cache(s, "b", { x: 60, y: -20, z: -36 }); cache(s, "a", { x: 60, y: -20, z: -36 });
  faceTarget(s, "a"); assert.equal(reachPreview(s, empty)?.id, "a", "stable ID tie break");
  cache(s, "near", { x: 60.1, y: -19.65, z: -33 });
  assert.equal(aimedInteraction(s, empty)?.id, "near"); assert.equal(reachPreview(s, empty), null);
});

test("preview keeps actual LOS and exact own-host ignore, even with the eye inside a host sphere", () => {
  const s = readyState(), t = interactions(s).find(t => t.id === "pod_services")!;
  s.player.mode = "swimming"; s.player.pose.position = { ...t.position, z: t.position.z + 5 }; faceTarget(s, t.id);
  const h = interactionHost(s, t), wall = { min: { x: h.center.x - 1, y: h.center.y - 1, z: h.center.z + 1 }, max: { x: h.center.x + 1, y: h.center.y + 1, z: h.center.z + 1.1 } };
  const own = h.solidIds[0]!;
  assert.ok(own);
  assert.equal(reachPreview(s, createWorldQueries([{ ...wall, id: own }], () => -200))?.id, t.id);
  assert.equal(reachPreview(s, createWorldQueries([{ ...wall, id: "unrelated" }], () => -200)), null);
  let ignored: readonly string[] | undefined;
  const blocked: WorldQueries = { ...empty, lineOfSight(_a, _b, ignore) { ignored = ignore; return false; } };
  assert.equal(reachPreview(s, blocked), null); assert.deepEqual(ignored, h.solidIds);
  const inside = readyState(); inside.player.mode = "swimming"; inside.player.pose.position = { x: 60, y: -20, z: -30 };
  const v = addDart(inside, { x: 60, y: -20, z: -31 }); faceTarget(inside, v.id);
  assert.equal(aimedInteraction(inside, blocked), null); assert.equal(reachPreview(inside, blocked), null);
  const shifted = readyState(), bench = interactions(shifted).find(t => t.id === "workshop_services")!;
  const host = interactionHost(shifted, bench);
  shifted.player.pose.position = { x: host.center.x, y: host.center.y - eyeHeight(shifted), z: host.center.z + 0.2 };
  faceTarget(shifted, bench.id);
  assert.equal(aimedInteraction(shifted, empty), null, "body datum remains outside 4m");
  assert.equal(reachPreview(shifted, empty)?.id, bench.id, "eye is inside the shifted bench host sphere");
  const enclosing = createWorldQueries([{ id: "unrelated enclosing cabinet",
    min: { x: host.center.x - 0.3, y: host.center.y - 0.3, z: host.center.z - 0.3 },
    max: { x: host.center.x + 0.3, y: host.center.y + 0.3, z: host.center.z + 0.3 } }], () => -200);
  assert.equal(reachPreview(shifted, enclosing), null, "sphere containment cannot bypass real origin-containment LOS");
});

test("preview protects unknown evidence and every personal record, labels live hulls/caches/sources, and excludes empty hosts", () => {
  const s = readyState(); s.player.mode = "swimming";
  s.player.pose.position = { ...EVIDENCE.C02.position, z: EVIDENCE.C02.position.z + 5 }; faceTarget(s, "C02");
  assert.equal(reachPreview(s, empty)?.label, null); discover(s, "C02"); assert.equal(reachPreview(s, empty)?.label, EVIDENCE.C02.label);
  s.player.pose.position = { ...OPTIONAL_RECORD.position, z: OPTIONAL_RECORD.position.z + 5 }; faceTarget(s, OPTIONAL_RECORD.id);
  assert.equal(reachPreview(s, empty)?.label, null); s.knowledge.journals.push(OPTIONAL_RECORD.id);
  assert.equal(reachPreview(s, empty)?.label, null);
  const id: SourceId = "island_headland_scraps";
  s.player.pose.position = { ...SOURCES[id].position, z: SOURCES[id].position.z + 5 }; faceTarget(s, id);
  const node = s.world.resources.find(n => n.id === id)!; node.stock = 0;
  assert.equal(reachPreview(s, empty)?.label, SOURCES[id].label); node.reserve = 0;
  assert.equal(reachPreview(s, empty), null);
  const live = readyState(); live.player.mode = "swimming"; live.player.pose.position = { x: 60, y: -20, z: -30 };
  const v = addDart(live, { x: 60, y: -20, z: -35 }); faceTarget(live, v.id);
  assert.equal(reachPreview(live, empty)?.label, HULLS.dart.label);
  v.disabled = true; assert.equal(reachPreview(live, empty)?.label, HULLS.dart.label + " · disabled");
  v.pose.position.z -= 1; assert.equal(reachPreview(live, empty)?.host.center.z, v.pose.position.z);
  for (const gated of [createGame(), pilot(), { ...live, player: { ...live.player, mode: "interior" as const, interiorId: "carrier" } }])
    assert.equal(reachPreview(gated, empty), null);
});

test("service helpers keep command precedence, 7m access boundary, restoration and exact successful mutation", () => {
  const base = pilot({ x: 0, y: -1, z: 8 }), v = base.fleet.vehicles[0]!;
  v.charge = 23; v.health = 41; v.emergencyAir = 3;
  addItem(base, "reserve_cell", 1, "diver").charge = 11;
  addItem(base, "reserve_cell", 1, v.cargoId).charge = null;
  addItem(base, "reserve_cell", 1, "pod_locker").charge = 17;
  const scenarios: [string, (s: GameState) => void, ReturnType<typeof serviceState>][] = [
    ["missing", s => { s.fleet.vehicles = []; }, "away"],
    ["berthed", s => { s.fleet.vehicles[0]!.berth = { carrierId: "c", slot: 0, pose: { frame: "carrier-local", position: { x: 0, y: 0, z: 0 }, yaw: 0 } }; }, "away"],
    ["far and disabled", s => { s.player.pose.position.x += 7.001; s.fleet.vehicles[0]!.disabled = true; }, "away"],
    ["exactly seven", s => { s.player.pose.position.x += 7; }, "ready"],
    ["unsupported and disabled", s => { s.fleet.vehicles[0]!.pose.position.x = 60; s.player.pose.position.x = 60; s.fleet.vehicles[0]!.disabled = true; }, "unsupported"],
    ["unrestored workshop", s => { s.fleet.vehicles[0]!.pose.position = { x: 20, y: -1.6, z: -22 }; s.player.pose.position = { ...s.fleet.vehicles[0]!.pose.position }; }, "unsupported"],
    ["supported disabled", s => { s.fleet.vehicles[0]!.disabled = true; }, "patch"],
    ["piloted supported", () => {}, "ready"],
  ];
  for (const [label, mutate, expected] of scenarios) {
    const s = structuredClone(base); mutate(s); const before = structuredClone(s);
    assert.equal(serviceState(s, v.id), expected, label); const no = serviceRefusal(s, v.id);
    assert.deepEqual(s, before); const direct = structuredClone(s);
    assert.equal(service(direct, v.id), no);
    const out = executeCommand(s, { type: "service", vehicleId: v.id }, empty);
    assert.deepEqual(out.state, direct, label);
    if (no) { assert.equal(notices(out.events)[0]!.message, no); assert.deepEqual(direct, before); }
    else {
      const expectedState = structuredClone(before), ev = expectedState.fleet.vehicles[0]!;
      ev.health = 100; ev.charge = 100; ev.emergencyAir = 120;
      for (const i of expectedState.inventory.items) if (i.kind === "reserve_cell" && (i.containerId === "diver" || i.containerId === ev.cargoId)) i.charge = 100;
      expectedState.feedback = "Service complete: hull battery, health, emergency air and cells in your hold or this craft restored. Cargo and fitted modules retained.";
      assert.deepEqual(out.state, expectedState); assert.equal(serviceWouldRestore(out.state, out.state.fleet.vehicles[0]!), false);
      assert.equal(serviceRefusal(out.state, v.id), null, "a fully serviced command remains valid");
    }
  }
  assert.equal(serviceWouldRestore(base, v), true);
  const full = executeCommand(base, { type: "service", vehicleId: v.id }, empty).state;
  for (const field of ["health", "charge", "emergencyAir"] as const) {
    const s = structuredClone(full); s.fleet.vehicles[0]![field] -= 0.01;
    assert.equal(serviceWouldRestore(s, s.fleet.vehicles[0]!), true);
  }
  const cell = structuredClone(full); cell.inventory.items.find(i => i.containerId === "diver")!.charge = 99;
  assert.equal(serviceWouldRestore(cell, cell.fleet.vehicles[0]!), true);
});

test("crafting reason codes preserve all recipe messages, precedence and pure output capacity", () => {
  const codes = new Set<string>();
  for (const id of Object.keys(RECIPES) as RecipeId[]) {
    const r = RECIPES[id], s = readyState(); s.knowledge.blueprints.push(r.bp);
    s.knowledge.crafted = [...r.needs] as RecipeId[];
    for (const f of s.world.facilities) f.repaired = true;
    if (r.site === "island_workshop") s.player.pose.position = { x: 10, y: 1.2, z: -34 };
    for (const [k, n] of Object.entries(r.cost)) addItem(s, k as ItemKind, n, r.site === "island_workshop" ? "workshop_locker" : "pod_locker");
    const cases: [GameState, string | null, WorldQueries?][] = [[s, null]];
    const opened = structuredClone(s); opened.opening.phase = 0; cases.push([opened, "opening"]);
    const unknown = structuredClone(s); unknown.knowledge.blueprints = []; cases.push([unknown, "blueprint"]);
    if (r.once) { const done = structuredClone(s); done.knowledge.crafted.push(id); cases.push([done, "completed"]); }
    if (r.needs.length) { const needs = structuredClone(s); needs.knowledge.crafted = []; cases.push([needs, "needs"]); }
    const away = structuredClone(s); away.player.pose.position.x = 180; cases.push([away, "site"]);
    if (r.site === "pod_fabricator" || (r.site === "island_workshop" && id !== "restore_workshop")) {
      const unrestored = structuredClone(s); for (const f of unrestored.world.facilities) f.repaired = false;
      cases.push([unrestored, "restore"]);
    }
    const short = structuredClone(s); short.inventory.items = [];
    if (r.maintenance) { short.world.maintenance.alloy = 0; cases.push([short, "rescue-low"]); }
    else cases.push([short, "materials"]);
    if (id === "dart_base") {
      const duplicate = structuredClone(s); addDart(duplicate); cases.push([duplicate, "duplicate-hull"]);
      const wrongSite = structuredClone(duplicate); wrongSite.player.pose.position.x = 180;
      cases.push([wrongSite, "site"], [s, "clearance", { ...empty, clearance: () => false }]);
    }
    if (["reserve_cell", "salvage_buoy", "dart_acoustic_trim"].includes(r.output)) {
      const full = structuredClone(s); addItem(full, "silica_glass", 16, "diver"); cases.push([full, "space"]);
    }
    for (const [candidate, code, w = empty] of cases) {
      const before = structuredClone(candidate), b = craftingBlock(candidate, id, w);
      assert.equal(b?.code ?? null, code, id); assert.equal(craftingRefusal(candidate, id, w), b?.message ?? null);
      assert.deepEqual(candidate, before, "queries must not spend or mutate");
      if (b) {
        codes.add(b.code);
        if (code === "opening") continue; // action() deliberately ignores non-opening commands during the opening.
        const result = executeCommand(candidate, { type: "craft", recipeId: id }, w);
        assert.equal(result.state, candidate); assert.equal(notices(result.events)[0]!.message, b.message);
      }
    }
  }
  assert.deepEqual([...codes].sort(), ["opening", "blueprint", "completed", "needs", "site", "restore", "duplicate-hull", "clearance", "materials", "rescue-low", "space"].sort());
});

test("paid fabrication, full frame salvage and paid rebuild keep Dart once:false viable", () => {
  const s = paid(), v = s.fleet.vehicles[0]!;
  assert.equal(RECIPES.dart_base.once, false); assert.equal(craftingBlock(s, "dart_base", world)?.code, "duplicate-hull");
  v.pose.position = { x: 10, y: -1, z: -29 }; s.player.pose.position = { x: 10, y: -1, z: -27 }; s.player.mode = "swimming";
  assert.equal(toggleBuoy(s), null); disableVehicle(s, v.id);
  assert.equal(recoveryCommand(s, v.id, "salvage"), null); assert.equal(s.fleet.vehicles.length, 0);
  s.player.pose.position = { x: 10, y: 1.2, z: -34 }; s.player.mode = "walking";
  s.inventory.buoy.position = { ...s.player.pose.position };
  for (const i of [...s.inventory.items].filter(i => i.containerId === "buoy_hold"))
    assert.equal(transfer(s, i.id, "workshop_locker", i.quantity), null);
  assert.equal(craftingBlock(s, "dart_base", world), null);
  assert.equal(craft(s, "dart_base", world), null); assert.equal(s.fleet.vehicles.length, 1);
  assert.notEqual(s.fleet.vehicles[0]!.id, v.id);
});

test("actual cradle quiet/cruise/boost approaches measure sustained off-centre contact below 0.02m and no centred rail claim", () => {
  for (const x of [20, 22]) for (const mode of ["quiet", "cruise", "boost"]) {
    let s = pilot({ x, y: -0.9, z: -12 }), measured = 0, lastRequested = 0, floorStops = 0;
    for (let i = 0; i < 180; i++) {
      const out = stepGame(s, [{ ...forward, quiet: mode === "quiet", sprint: mode === "boost" }], world);
      const a = thrusts(out.events); assert.equal(a.length, 1);
      const t = a[0]!; lastRequested = t.requested;
      if (t.solidLimited >= (t.requested - t.actual) * 0.8 && t.actual <= t.requested * 0.1) measured++;
      if (t.actual < t.requested * 0.1 && t.solidLimited === 0) floorStops++;
      if (x === 20) assert.ok(t.solidLimited < 1e-10, "later shore-floor stop is not rail contact");
      s = out.state;
    }
    if (x === 22) { assert.ok(measured > 100); assert.ok(lastRequested < 0.02 && lastRequested > 1e-5); }
    else if (mode !== "quiet") assert.ok(floorStops > 0, "centred passage reaches the separate terrain floor");
  }
});

test("thrust and ascent share exactly one observed sweep, preserving both measurements and requested integration", () => {
  const s = pilot(); s.fleet.vehicles[0]!.velocity = { x: 0, y: 4, z: -24 };
  const calls: { delta: Vec3; origin: Vec3; result: Vec3 }[] = [];
  const measured: WorldQueries = { ...empty, moveCapsule(origin, d, shape) {
    if (shape !== HULL_COLLIDERS.dart) return empty.moveCapsule(origin, d, shape);
    const position = { x: origin.x + d.x, y: origin.y + d.y * 0.5, z: origin.z + d.z * 0.25 };
    calls.push({ delta: { ...d }, origin: { ...origin }, result: { ...position } });
    return { position, hitSolid: true, hitBoundary: false };
  } };
  const out = stepGame(s, [{ ...forward, vertical: 1 }], measured), t = thrusts(out.events)[0]!;
  const a = out.events.find(e => e.type === "ascent-sample")!;
  assert.ok(calls.length > 1); assert.equal(calls.length, Math.ceil(Math.hypot(
    (0 - 0) / 60,
    (4 + (6 / Math.sqrt(2) - 4) * 2.8 / 60) / 60,
    (-24 + (-8 / Math.sqrt(2) + 24) * 2.8 / 60) / 60,
  ) / 0.2));
  close(t.requested, Math.abs((-24 + (-8 / Math.sqrt(2) + 24) * 2.8 / 60) / 60));
  close(t.actual, Math.hypot(out.state.player.pose.position.x - s.player.pose.position.x, out.state.player.pose.position.z - s.player.pose.position.z));
  close(t.solidLimited, calls.reduce((n, c) => n + Math.hypot(c.delta.x, c.delta.z) - Math.hypot(c.result.x - c.origin.x, c.result.z - c.origin.z), 0));
  close(a.solidLimitedRise, calls.reduce((n, c) => n + c.origin.y + c.delta.y - c.result.y, 0));
  close(a.actualRise, out.state.player.pose.position.y - s.player.pose.position.y);
});

test("open water, tangent slides, surface clamp and terrain rejection cannot fabricate solid forward loss", () => {
  const wall = { id: "tangent", min: { x: -51.39, y: -20, z: 0 }, max: { x: -50, y: 0, z: 60 } };
  const tangent = pilot(); tangent.fleet.vehicles[0]!.velocity = { x: 0.01, y: 0, z: -8 };
  const cases: [GameState, WorldQueries, GameCommand][] = [
    [pilot(), empty, forward],
    [tangent, createWorldQueries([wall], () => -200), forward],
    [pilot({ x: -55, y: -0.901, z: 30 }), empty, { ...forward, vertical: 1 }],
    [pilot(), createWorldQueries([], () => -9.9), forward],
  ];
  for (const [s, w, input] of cases) {
    const out = stepGame(s, [input], w), t = thrusts(out.events)[0]!;
    assert.ok(t);
    assert.ok(t.solidLimited < 0.01 * t.requested, "no material solid limitation");
    if (w.groundHeight(0, 0) === -9.9) assert.equal(t.actual, 0, "floor rejection stays observable without being called solid loss");
    else assert.ok(t.actual > t.requested * 0.9);
  }
});

test("missing intent, reverse/strafe, passive coast, boundaries, other/disabled/unpowered hulls and actor replacement suppress thrust", () => {
  const coasting = pilot(); coasting.fleet.vehicles[0]!.velocity.z = -8;
  for (const commands of [[], [{ ...forward, forward: 0 }], [{ ...forward, forward: -1 }], [{ ...forward, forward: 0, right: 1 }], [{ ...forward, forward: 0, vertical: 1 }], [{ ...forward, right: 0.11 }], [{ ...forward, forward: 0.5 }]] as GameCommand[][])
    assert.deepEqual(thrusts(stepGame(coasting, commands, empty).events), []);
  const reverseInertia = pilot(); reverseInertia.fleet.vehicles[0]!.velocity.z = 8;
  assert.deepEqual(thrusts(stepGame(reverseInertia, [forward], empty).events), []);
  const edge = pilot({ x: -55, y: -10, z: WORLD_BOUNDS.minZ });
  assert.deepEqual(thrusts(stepGame(edge, [forward], empty).events), []);
  const floorAndBoundary = stepGame(edge, [forward], createWorldQueries([], () => -9.9));
  assert.deepEqual(thrusts(floorAndBoundary.events), [], "discard even when moveHull's separate floor rejection omits its aggregate boundary flag");
  const unpowered = pilot(); unpowered.fleet.vehicles[0]!.charge = 0;
  const disabled = pilot(); disabled.fleet.vehicles[0]!.disabled = true;
  const disabling = pilot(); disabling.fleet.vehicles[0]!.health = 0;
  const dying = pilot(); dying.player.vitals.health = 0;
  const other = pilot(); other.fleet.vehicles[0]!.hull = "hush";
  const replacing = readyState(); replacing.player.mode = "swimming"; replacing.player.pose.position = { x: 60, y: -20, z: -30 };
  const v = addDart(replacing, { x: 60, y: -20, z: -32 }); faceTarget(replacing, v.id);
  for (const s of [createGame(), unpowered, disabled, disabling, dying, other])
    assert.deepEqual(thrusts(stepGame(s, [forward], empty).events), []);
  const replaced = stepGame(replacing, [{ type: "interact" }, forward], empty);
  assert.equal(replaced.state.player.controlledVehicleId, v.id); assert.deepEqual(thrusts(replaced.events), []);
  const same = pilot();
  // Exit and reboard in one step must reset even when the final actor ID is the same.
  same.player.pose.yaw = -Math.PI / 2; same.player.pose.pitch = Math.atan2(-0.25, 3.1);
  const result = stepGame(same, [{ type: "exit" }, { type: "interact" }, forward], empty);
  assert.equal(result.state.player.controlledVehicleId, same.player.controlledVehicleId);
  assert.deepEqual(thrusts(result.events), []);
  const before = structuredClone(coasting); stepGame(coasting, [forward], empty); assert.deepEqual(coasting, before);
});
