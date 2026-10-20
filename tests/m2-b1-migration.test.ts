import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { HULLS, SOURCES } from "../src/content/registry.js";
import { decodeSave, encodeSave } from "../src/save/codec.js";
import { validExpedition5State } from "../src/save/expedition5/validation.js";
import { validState } from "../src/save/validation.js";
import { executeCommand } from "../src/sim/step.js";
import { createWorldQueries } from "../src/sim/world.js";
import { CREEL_SOURCE_IDS, historicalSchema3, withCreel, withRenewal, type Schema3Envelope, type Schema4Envelope } from "./legacy-fixture-support.js";

const world = createWorldQueries();
const read = (name: string) => readFileSync(`tests/fixtures/${name}`, "utf8");
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

test("the retained earned C06 export (schema3) migrates through renewal and expedition.6 with every field kept", () => {
  const raw = read("earned-c06-expedition4.json");
  assert.equal(sha(raw), "45840e6659e9aed6a98d0c0eed67761f5af8dfaab8d9c32ea051f48d652b4e44", "root-retained earned input, byte-identical");
  const old = JSON.parse(raw) as Schema3Envelope;
  assert.equal(old.schemaVersion, 3);
  const out = decodeSave(raw); assert.ok(out.ok, out.ok ? "" : out.error);
  const expected = withCreel(withRenewal(old));
  assert.deepEqual(out.value, expected, "only the declared renewal and expedition.6 additions");
  const s = out.value.state;
  assert.equal(s.player.mobileRefuge, null, "no mobile refuge is auto-registered");
  for (const v of s.fleet.vehicles) assert.equal(v.rating, HULLS[v.hull].initialDepth);
  assert.ok(s.knowledge.markers.includes("canopy_stop"), "a found C04 names the mooring");
  assert.ok(!s.world.facilities.find((f) => f.id === "canopy_stop")!.repaired, "nothing restored for free");
  for (const id of CREEL_SOURCE_IDS)
    assert.deepEqual(s.world.resources.find((n) => n.id === id), { id, stock: SOURCES[id].stock, reserve: SOURCES[id].reserve });
  assert.equal(JSON.stringify(JSON.parse(raw)), JSON.stringify(old), "the input is never rewritten");
  const written = encodeSave(out.value); assert.ok(written.ok);
  const again = decodeSave(written.value); assert.ok(again.ok); assert.deepEqual(again.value, out.value);
  // The migrated earned game is directly playable: its Notebook and fabricator now list the C05 workboat.
  assert.ok(s.knowledge.blueprints.includes("bp_creel_service"));
  const panelState = executeCommand(s, { type: "hint" }, world).state;
  assert.ok(validState(panelState));
});

test("a schema4 / expedition.5 export validates against the frozen predecessor before its one-time migration", () => {
  const raw = read("diagnostic-depleted-expedition5.json"), old = JSON.parse(raw) as Schema4Envelope;
  assert.equal(old.schemaVersion, 4); assert.ok(validExpedition5State(old.state));
  const out = decodeSave(raw); assert.ok(out.ok, out.ok ? "" : out.error);
  assert.deepEqual(out.value, withCreel(old), "depleted stock, renewal progress and every old field retained");
  // Laundering current fields into the old schema is refused before migration.
  for (const mutate of [
    (d: Schema4Envelope) => { Object.assign(d.state.player, { mobileRefuge: null }); },
    (d: Schema4Envelope) => { Object.assign(d.state.fleet.vehicles[0] ?? {}, { rating: 350 }); if (!d.state.fleet.vehicles[0]) (d.state as unknown as { extra: number }).extra = 1; },
    (d: Schema4Envelope) => { (d.state.world.facilities as unknown[]).push({ id: "canopy_stop", repaired: true }); },
    (d: Schema4Envelope) => { (d.state.world.resources as unknown[]).push({ id: "basin_frame_ridge", stock: 3, reserve: 0 }); },
    (d: Schema4Envelope) => { (d.state.inventory.items as unknown[]).push({ id: "item_99", kind: "tagged_frame", quantity: 1, containerId: "diver", fitted: null, charge: null, provenance: "public" }); },
  ]) {
    const bad = structuredClone(old); mutate(bad);
    assert.equal(decodeSave(JSON.stringify(bad)).ok, false);
  }
});

test("the retained schema2 trap export composes all three historical additions", () => {
  const raw = read("reef-rib-trap-expedition3.json"), old = JSON.parse(raw);
  const out = decodeSave(raw); assert.ok(out.ok);
  assert.deepEqual(out.value, withCreel(withRenewal(historicalSchema3(old))));
});
