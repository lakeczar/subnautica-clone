import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ITEMS, PLACES, SOURCES } from "../src/content/registry.js";
import { createEnvelope, decodeSave, encodeSave, type SaveEnvelope } from "../src/save/codec.js";
import { addItem } from "../src/sim/inventory.js";
import { completeOpening, discover } from "../src/sim/progression.js";
import { createGame } from "../src/sim/state.js";
import type { GameState } from "../src/sim/types.js";
import { encoded } from "./persistence-support.js";

// Rule (docs/build/streams/S7.md): additive content = no schema bump; changed
// meaning = bump + previous-version bridge. These tests grow the live registry
// the way composition will, then load saves written before the growth.
const meta = { sessionId: "additive-content-01", createdAt: "2026-10-20T00:00:00.000Z", savedAt: "2026-10-20T00:10:00.000Z" };
const registry = { sources: SOURCES as Record<string, unknown>, places: PLACES as Record<string, unknown>, items: ITEMS as Record<string, unknown> };
const NEW = { source: "test_vent_glass", place: "test_vent", item: "test_vent_lens" } as const;

/** Adds one new source, place and item for the duration of `run`. */
function withNewContent(run: () => void): void {
  registry.sources[NEW.source] = { ...SOURCES.reef_glass_ridge_north, label: "Test vent glass", position: { x: 40, y: -30, z: -60 } };
  registry.places[NEW.place] = { label: "Test vent", region: "refuge_reef", position: { x: 40, y: -30, z: -60 } };
  registry.items[NEW.item] = { label: "Test vent lens", sources: [], cu: 1 };
  try { run(); } finally {
    delete registry.sources[NEW.source]; delete registry.places[NEW.place]; delete registry.items[NEW.item];
  }
}
function progressed(): GameState {
  const s = createGame(); completeOpening(s);
  for (const id of ["C02", "C03"] as const) discover(s, id);
  s.tick = 30_000;
  Object.assign(s.world.resources.find((n) => n.id === "reef_glass_ridge_north")!, { stock: 0, reserve: 2 });
  Object.assign(s.world.resources.find((n) => n.id === "reef_ribbon_catch_north")!, { stock: 0, reserve: 6 });
  s.world.renewal.find((r) => r.id === "reef_ribbon_catch_north")!.progress = 55;
  addItem(s, "silica_glass", 3, "pod_locker");
  return s;
}
const refused = (raw: string, pattern: RegExp, message: string) => {
  const out = decodeSave(raw);
  assert.equal(out.ok, false, message);
  if (!out.ok) assert.match(out.error, pattern, message);
};

test("saves written before a new source, place and item load with the source at its first stock, once", () => {
  const before = progressed(), raw = encoded(createEnvelope(before, meta));
  const earned = readFileSync("tests/fixtures/earned-c06.json", "utf8");
  const bridged = readFileSync("tests/fixtures/diagnostic-depleted-expedition5.json", "utf8");
  withNewContent(() => {
    const def = SOURCES[NEW.source as keyof typeof SOURCES];
    const first = { id: NEW.source, stock: def.stock, reserve: def.reserve };
    for (const [name, text] of [["progressed", raw], ["earned C06", earned], ["schema 4 bridge", bridged]] as const) {
      const out = decodeSave(text); assert.ok(out.ok, `${name}: ${out.ok ? "" : out.error}`);
      const s = out.value.state;
      assert.deepEqual(s.world.resources.at(-1), first, `${name}: the new source starts at New Game's stock`);
      assert.equal(s.world.resources.length, Object.keys(SOURCES).length);
      // Normalized once: the written save already holds it and reads back unchanged.
      const again = decodeSave(encoded(out.value)); assert.ok(again.ok); assert.deepEqual(again.value, out.value);
    }
    const out = decodeSave(raw); assert.ok(out.ok);
    assert.deepEqual(out.value.state, { ...before, world: { ...before.world, resources: [...before.world.resources, first] } },
      "every saved field, depletion and renewal progress is kept; nothing else changes");
    // The new place and item are ordinary content in the loaded game.
    const s = out.value.state;
    s.knowledge.markers.push(NEW.place as never);
    addItem(s, NEW.item as never, 2, "diver");
    const written = encodeSave(out.value); assert.ok(written.ok, written.ok ? "" : written.error);
  });
});

test("unknown, removed, missing-base, duplicate and malformed roster content is refused, not repaired", () => {
  const good = (): SaveEnvelope => createEnvelope(progressed(), meta);
  withNewContent(() => {
    const unknown = good(); unknown.state.world.resources.push({ id: "rift_vent_future" as never, stock: 1, reserve: 0 });
    refused(JSON.stringify(unknown), /content this build does not have.*rift_vent_future/, "unknown source");
    const facility = good(); facility.state.world.facilities.push({ id: "future_station" as never, repaired: false });
    refused(JSON.stringify(facility), /content this build does not have/, "unknown facility");
    const marker = good(); marker.state.knowledge.markers.push("future_station" as never);
    refused(JSON.stringify(marker), /invalid/, "unknown place");
    const item = good(); addItem(item.state, "silica_glass", 1, "diver"); Reflect.set(item.state.inventory.items.at(-1)!, "kind", "rift_lens");
    refused(JSON.stringify(item), /invalid/, "unknown item");
  });
  // Written while the new source existed, read by a build without it.
  let later = "";
  withNewContent(() => { const out = decodeSave(encoded(good())); assert.ok(out.ok); later = encoded(out.value); });
  refused(later, /content this build does not have.*test_vent_glass/, "removed source");
  for (const [name, mutate] of [
    ["schema 5 source missing", (s: GameState) => { s.world.resources.splice(3, 1); }],
    ["schema 5 renewal missing", (s: GameState) => { s.world.renewal.pop(); }],
    ["schema 5 facility missing", (s: GameState) => { s.world.facilities.splice(s.world.facilities.findIndex((f) => f.id === "canopy_stop"), 1); }],
    ["schema 5 locker missing", (s: GameState) => { s.inventory.containers.splice(2, 1); }],
    ["duplicate source", (s: GameState) => { s.world.resources.push({ ...s.world.resources[0]! }); }],
    ["malformed source", (s: GameState) => { Reflect.set(s.world.resources, 0, { id: 7, stock: 1, reserve: 0 }); }],
    ["renewal out of order", (s: GameState) => { s.world.renewal.reverse(); }],
  ] as const) {
    const bad = good(); mutate(bad.state);
    refused(JSON.stringify(bad), /invalid/, name);
  }
});
