import test from "node:test";
import assert from "node:assert/strict";
import { SOURCE_RENEWAL, SOURCES } from "../src/content/registry.js";
import { createEnvelope, decodeSave, encodeSave } from "../src/save/codec.js";
import { validState } from "../src/save/validation.js";
import { addItem } from "../src/sim/inventory.js";
import { completeOpening, discover } from "../src/sim/progression.js";
import { createGame } from "../src/sim/state.js";
import type { GameState } from "../src/sim/types.js";

const meta = { sessionId: "renewal-save-test-01", createdAt: "2026-10-18T00:00:00.000Z", savedAt: "2026-10-19T00:00:00.000Z" };
/** Depleted, partly sorted, investigated progress with collected living sheds. */
function progressed(): GameState {
  const s = createGame(); completeOpening(s);
  for (const id of ["C02", "C03", "C04"] as const) discover(s, id);
  s.tick = 48_000;
  const set = (id: keyof typeof SOURCES, stock: number, reserve: number) =>
    Object.assign(s.world.resources.find((n) => n.id === id)!, { stock, reserve });
  set("reef_ribbon_catch_north", 0, 6); set("reef_ribbon_catch_south", 4, 12);
  set("canopy_resin_lee_upper", 14, 6); set("canopy_resin_lee_lower", 0, 0);
  set("island_resin_cove_east", 0, 2); set("reef_service_scraps_east", 0, 0);
  addItem(s, "flex_membrane", 6, "pod_locker"); addItem(s, "buoyant_resin", 4, "diver");
  s.player.vitals = { health: 61, oxygen: 72.5, food: 44 };
  s.metrics.collections = 19;
  return s;
}
test("malformed current renewal state refuses atomically on decode and encode, without normalization", () => {
  const base = progressed();
  base.world.renewal.find((r) => r.id === "reef_ribbon_catch_north")!.progress = 777;
  const good = createEnvelope(base, meta);
  assert.ok(validState(good.state)); assert.ok(encodeSave(good).ok);
  const interval = SOURCE_RENEWAL.reef_ribbon_catch_north.intervalSteps;
  const mutations: ((s: GameState) => void)[] = [
    (s) => { Reflect.deleteProperty(s.world, "renewal"); },
    // A schema 5 entry; the last ones are CR-1's additive grounds, which load as New Game's.
    (s) => { s.world.renewal.splice(0, 1); },
    (s) => { s.world.renewal.push({ id: "reef_ribbon_catch_north", progress: 0 }); },
    (s) => { s.world.renewal.reverse(); },
    (s) => { Reflect.set(s.world.renewal[0]!, "id", "island_resin_cove_east"); },
    (s) => { Reflect.set(s.world.renewal[0]!, "id", "reef_service_scraps_east"); },
    (s) => { Reflect.set(s.world.renewal[0]!, "stock", 2); },
    (s) => { s.world.renewal[0]!.progress = -1; },
    (s) => { s.world.renewal[0]!.progress = 1.5; },
    (s) => { s.world.renewal[0]!.progress = interval; },
    (s) => { Reflect.set(s.world.renewal[0]!, "progress", "7"); },
    // Progress is impossible while the source is at or above its cap.
    (s) => { s.world.renewal[2]!.progress = 1; },
    (s) => { s.world.resources.find((n) => n.id === "reef_ribbon_catch_north")!.stock = 12; },
    (s) => { s.scenario = "carrier-fixture"; },
  ];
  for (const [i, mutate] of mutations.entries()) {
    const bad = structuredClone(good); mutate(bad.state);
    const snapshot = JSON.stringify(bad);
    assert.equal(validState(bad.state), false, `mutation ${i}`);
    assert.equal(decodeSave(snapshot).ok, false, `decode ${i}`);
    assert.equal(encodeSave(bad).ok, false, `encode ${i}`);
    assert.equal(JSON.stringify(bad), snapshot, `refusal ${i} does not normalize`);
  }
});
