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
    /** The one stack of `kind` in `container`; fails if there are several, so ambiguous picks can't hide. */
    stack(container: string, kind: string): string {
      const found = s.inventory.items.filter((i) => i.containerId === container && i.kind === kind);
      assert.equal(found.length, 1, `one ${kind} stack in ${container}`);
      return found[0]!.id;
    },
    /** Moves `n` from the named stack to the diver hold at the cache. */
    take(cache: { position: GameState["player"]["pose"]["position"] }, itemId: string, n: number) {
      s.player.pose.position = { ...cache.position };
      assert.equal(transfer(s, itemId, "diver", n), null);
      go();
    },
    /** Moves `n` from the named diver stack into the cache. */
    put(cache: { position: GameState["player"]["pose"]["position"]; containerId: string }, itemId: string, n: number) {
      s.player.pose.position = { ...cache.position };
      assert.equal(transfer(s, itemId, cache.containerId, n), null);
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
  q.take(canister, q.stack(canister.containerId, "silica_glass"), 8);
  q.take(canister, q.stack(canister.containerId, "structural_alloy"), 6);
  q.reload();
  q.go(600);
  assert.deepEqual(Object.fromEntries(q.rec.pending[0]!.cargo.map((c) => [c.kind, c.quantity])),
    { structural_alloy: 4, flex_membrane: 4, conductive_crust: 4, buoyant_resin: 2 });
  assert.equal(q.deaths().unrecovered, 1);
  for (const kind of ["structural_alloy", "flex_membrane", "conductive_crust", "buoyant_resin"])
    q.take(canister, q.stack(canister.containerId, kind), q.s.inventory.items.find((i) => i.containerId === canister.containerId && i.kind === kind)!.quantity);
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
  const lost = q.stack(cache.containerId, "silica_glass");
  q.take(cache, lost, 1);
  addItem(q.s, "meal", 1, "diver");
  q.put(cache, q.stack("diver", "meal"), 1);
  q.reload();
  assert.deepEqual(q.rec.pending[0]!.cargo, [{ cache: cache.id, item: lost, kind: "silica_glass", quantity: 1, last: 1 }]);
  q.take(cache, lost, 1);
  assert.equal(q.recoveries().length, 1, "all the lost glass is back; the meal is the player's own deposit");
  assert.deepEqual(q.s.inventory.items.filter((i) => i.containerId === cache.containerId).map((i) => i.kind), ["meal"]);
  assert.equal(q.deaths().unrecovered, 0);
});

test("R4-F1: a same-kind deposit is its own stack; retrieving the original stack recovers, through a reload", () => {
  const q = session();
  const cache = q.die({ x: -40, y: -10, z: -20 }, [["silica_glass", 2]]);
  const original = q.stack(cache.containerId, "silica_glass");
  // A fresh glass in its own stack, deposited whole: it keeps its own ID in the cache.
  const deposit = addItem(q.s, "silica_glass", 1, "diver").id;
  assert.notEqual(deposit, original);
  q.put(cache, deposit, 1);
  assert.deepEqual(q.s.inventory.items.filter((i) => i.containerId === cache.containerId).map((i) => i.id).sort(), [original, deposit].sort());
  q.reload();
  assert.equal(q.recoveries().length, 0);
  q.take(cache, original, 2);
  assert.equal(q.recoveries().length, 1, "the original two glass are back; the deposit owes nothing");
  assert.deepEqual(q.s.inventory.items.filter((i) => i.containerId === cache.containerId).map((i) => i.id), [deposit]);
  q.reload();
  assert.deepEqual([q.deaths().unrecovered, q.rec.pending.length], [0, 0]);
});

test("R4-F1: put-back variant: partial retrieval, the returned glass as its own stack, then the last original", () => {
  const q = session();
  const cache = q.die({ x: -40, y: -10, z: -20 }, [["silica_glass", 2]]);
  const original = q.stack(cache.containerId, "silica_glass");
  q.take(cache, original, 1);
  const carried = q.stack("diver", "silica_glass");
  assert.notEqual(carried, original, "a partial transfer leaves the original ID in the cache");
  q.put(cache, carried, 1);
  assert.deepEqual(q.rec.pending[0]!.cargo.map((c) => [c.item, c.quantity]), [[original, 1]]);
  q.reload();
  q.take(cache, carried, 1);
  assert.equal(q.recoveries().length, 0, "taking back the returned stack is not the last original glass");
  q.take(cache, original, 1);
  assert.equal(q.recoveries().length, 1);
  assert.equal(q.deaths().unrecovered, 0);
});

test("R4-F1: a deposit that merges into an owed stack settles in the player's favour", () => {
  const q = session();
  const cache = q.die({ x: -40, y: -10, z: -20 }, [["silica_glass", 2]]);
  const original = q.stack(cache.containerId, "silica_glass");
  addItem(q.s, "silica_glass", 2, "diver");
  // A partial transfer into the cache merges into the original stack (inventory.ts addItem).
  q.put(cache, q.stack("diver", "silica_glass"), 1);
  assert.equal(q.s.inventory.items.find((i) => i.id === original)!.quantity, 3);
  assert.deepEqual(q.rec.pending[0]!.cargo.map((c) => [c.quantity, c.last]), [[2, 3]], "the merge adds nothing to what's owed");
  q.take(cache, original, 1);
  q.take(cache, original, 1);
  assert.equal(q.recoveries().length, 1, "two glass left the merged stack: the two lost are counted as back");
  assert.equal(q.s.inventory.items.find((i) => i.id === original)!.quantity, 1);
});
