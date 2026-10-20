import test from "node:test";
import assert from "node:assert/strict";
import { RECIPES } from "../src/content/registry.js";
import { completeOpening } from "../src/sim/progression.js";
import { addItem, transfer } from "../src/sim/inventory.js";
import { incapacitate, recoveryCommand } from "../src/sim/recovery.js";
import { createGame, makeVehicle } from "../src/sim/state.js";
import type { GameState } from "../src/sim/types.js";
import { createWorldQueries } from "../src/sim/world.js";
import { createRecorder, exportTimelineText, observe, resumeRecorder } from "../src/sim/timeline/recorder.js";
import type { TimelineRecorder } from "../src/sim/timeline/recorder.js";
import { analyseTimeline, parseTimeline } from "../src/sim/timeline/report.js";
import { exportTimeline } from "../src/sim/timeline/recorder.js";

const world = createWorldQueries();
/** A recorder over a real game, with real deaths, salvage and transfers. */
function session() {
  const s = createGame();
  completeOpening(s);
  s.inventory.containers.find((c) => c.id === "diver")!.capacity = 200;
  let rec: TimelineRecorder = createRecorder({ id: "recovery", started: "2026-10-20T10:00:00.000Z" });
  const go = (n = 1) => { for (let i = 0; i < n; i++) { s.tick++; observe(rec, s, { input: true }); } };
  go();
  return {
    s, go,
    get rec() { return rec; },
    reload() {
      const parsed = parseTimeline(exportTimelineText(rec, s));
      assert.ok(parsed.ok);
      if (parsed.ok) rec = resumeRecorder(parsed.value);
      go();
    },
    deaths: () => analyseTimeline(exportTimeline(rec, s)).deaths,
    recoveries: () => rec.events.filter((e) => e.kind === "recovery"),
    die(at: GameState["player"]["pose"]["position"], cargo: [string, number][]) {
      s.player.pose.position = { ...at };
      s.player.mode = "swimming";
      for (const [kind, n] of cargo) addItem(s, kind as never, n, "diver");
      incapacitate(s, "Test.");
      go();
      return s.recovery.caches.at(-1)!;
    },
    take(cache: { position: GameState["player"]["pose"]["position"]; containerId: string }, kind: string, n: number) {
      s.player.pose.position = { ...cache.position };
      const stack = s.inventory.items.find((i) => i.containerId === cache.containerId && i.kind === kind)!;
      assert.equal(transfer(s, stack.id, "diver", n), null);
      go();
    },
    put(cache: { position: GameState["player"]["pose"]["position"]; containerId: string }, kind: string, n: number) {
      s.player.pose.position = { ...cache.position };
      const stack = s.inventory.items.find((i) => i.containerId === "diver" && i.kind === kind)!;
      assert.equal(transfer(s, stack.id, cache.containerId, n), null);
      go();
    },
  };
}
/** Loses a piloted hull at a fixed spot; the diver carries nothing. */
function loseHull(q: ReturnType<typeof session>, hull: "dart" | "creel") {
  addItem(q.s, "bobbin_kit", 1, "equipment", "recovery");
  addItem(q.s, "suit_150", 1, "equipment", "suit");
  const v = makeVehicle(`lost_${hull}`, hull, { x: 80, y: -48, z: -89 }, `lost_${hull}_hold`);
  q.s.fleet.vehicles.push(v);
  q.s.inventory.containers.push({ id: v.cargoId, kind: "vehicle", ownerId: v.id, capacity: 128 });
  v.investment = { ...RECIPES[hull === "dart" ? "dart_base" : "creel_base"].cost };
  q.s.player.pose = structuredClone(v.pose);
  q.s.player.mode = "piloting";
  q.s.player.controlledVehicleId = v.id;
  q.go();
  incapacitate(q.s, "Test.");
  q.go();
  return v;
}

test("R3-F1: in-place canister salvage hands the death's obligation to the canister; partial hauls and a reload keep it open", () => {
  const q = session();
  const v = loseHull(q, "creel");
  addItem(q.s, "silica_glass", 4, v.cargoId);
  assert.deepEqual(q.rec.pending.map((p) => [p.losses, p.cargo]), [[[v.id], []]]);
  q.go(120);
  q.s.player.pose.position = { ...v.pose.position };
  q.s.player.mode = "swimming";
  q.s.player.controlledVehicleId = null;
  assert.equal(recoveryCommand(q.s, v.id, "salvage", world), null);
  q.go();
  const canister = q.s.recovery.caches.at(-1)!;
  assert.match(canister.id, /^canister_/);
  assert.equal(q.recoveries().length, 0, "an uncollected canister is not a recovery");
  const owed = q.rec.pending[0]!;
  assert.deepEqual(owed.losses, []);
  assert.ok(owed.keys.includes(`cache:${canister.id}`));
  assert.deepEqual(Object.fromEntries(owed.cargo.map((c) => [c.kind, c.quantity])),
    { structural_alloy: 10, silica_glass: 8, flex_membrane: 4, conductive_crust: 4, buoyant_resin: 2 });
  // Haul part of it, reload, wait: still open with the exact remainder.
  q.take(canister, "silica_glass", 8);
  q.take(canister, "structural_alloy", 6);
  q.reload();
  q.go(600);
  assert.deepEqual(Object.fromEntries(q.rec.pending[0]!.cargo.map((c) => [c.kind, c.quantity])),
    { structural_alloy: 4, flex_membrane: 4, conductive_crust: 4, buoyant_resin: 2 });
  assert.equal(q.deaths().unrecovered, 1);
  for (const kind of ["structural_alloy", "flex_membrane", "conductive_crust", "buoyant_resin"])
    q.take(canister, kind, q.s.inventory.items.find((i) => i.containerId === canister.containerId && i.kind === kind)!.quantity);
  const [recovery] = q.recoveries();
  assert.ok(recovery);
  assert.ok(recovery.keys!.includes(`loss:${v.id}`) && recovery.keys!.includes(`cache:${canister.id}`));
  // Steps after the death: 120 waiting, 1 salvage, 2 hauls, 1 after the reload, 600 waiting, 4 hauls.
  assert.ok(Math.abs(recovery.seconds! - 728 / 60) < 1e-9, `${recovery.seconds}`);
  assert.deepEqual(q.deaths(), { count: 1, recoverySeconds: [recovery.seconds!], nothingLost: 0, unrecovered: 0 });
});

test("R3-F1: salvage straight into a carried hold recovers at once", () => {
  const q = session();
  const v = loseHull(q, "dart");
  q.go(60);
  q.s.player.pose.position = { ...v.pose.position };
  q.s.player.mode = "swimming";
  q.s.player.controlledVehicleId = null;
  const caches = q.s.recovery.caches.length;
  assert.equal(recoveryCommand(q.s, v.id, "salvage", world), null);
  q.go();
  assert.equal(q.s.recovery.caches.length, caches, "the frame went to the diver hold, no canister");
  assert.equal(q.s.inventory.items.find((i) => i.kind === "structural_alloy" && i.containerId === "diver")?.quantity, 6);
  const [recovery] = q.recoveries();
  // Steps after the death: 60 waiting, 1 salvage.
  assert.ok(recovery && Math.abs(recovery.seconds! - 61 / 60) < 1e-9, `${recovery?.seconds}`);
  assert.equal(q.deaths().unrecovered, 0);
});

test("R3-F2: replacement cargo deposited in the cache never keeps a recovered death open, through a reload", () => {
  const q = session();
  const cache = q.die({ x: -40, y: -10, z: -20 }, [["silica_glass", 2]]);
  q.take(cache, "silica_glass", 1);
  addItem(q.s, "meal", 1, "diver");
  q.put(cache, "meal", 1);
  q.reload();
  assert.deepEqual(q.rec.pending[0]!.cargo, [{ cache: cache.id, kind: "silica_glass", quantity: 1 }]);
  q.take(cache, "silica_glass", 1);
  assert.equal(q.recoveries().length, 1, "all the lost glass is back; the meal is the player's own deposit");
  assert.deepEqual(q.s.inventory.items.filter((i) => i.containerId === cache.containerId).map((i) => i.kind), ["meal"]);
  assert.equal(q.deaths().unrecovered, 0);
});

test("R3-F2: putting retrieved cargo back neither closes the death early nor raises what's owed", () => {
  const q = session();
  const cache = q.die({ x: -40, y: -10, z: -20 }, [["silica_glass", 2], ["flex_membrane", 2]]);
  q.take(cache, "silica_glass", 2);
  q.put(cache, "silica_glass", 1);
  // One glass is back in the cache: still owed? No: the line only shrinks, so glass stays settled.
  assert.deepEqual(q.rec.pending[0]!.cargo, [{ cache: cache.id, kind: "flex_membrane", quantity: 2 }]);
  q.take(cache, "flex_membrane", 1);
  assert.equal(q.recoveries().length, 0, "a partial retrieval is not a recovery");
  q.reload();
  assert.deepEqual(q.rec.pending[0]!.cargo, [{ cache: cache.id, kind: "flex_membrane", quantity: 1 }]);
  q.put(cache, "flex_membrane", 1);
  q.take(cache, "flex_membrane", 1);
  assert.equal(q.recoveries().length, 0, "taking back what was just returned is not the last of the lost membrane");
  q.take(cache, "flex_membrane", 1);
  assert.equal(q.recoveries().length, 1);
  assert.equal(q.deaths().unrecovered, 0);
});
