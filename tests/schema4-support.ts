import assert from "node:assert/strict";
import { HULLS, SOURCES } from "../src/content/registry.js";
import type { GameState as Expedition5State } from "../src/save/expedition5/types.js";
import { SOURCES as EXPEDITION5_SOURCES } from "../src/save/expedition5/domain.js";
import { validExpedition5State } from "../src/save/expedition5/validation.js";
import type { SaveEnvelope, SaveMetadata } from "../src/save/codec.js";
import type { GameState } from "../src/sim/types.js";
import { S9_RESOURCES, withComposedFields, withoutComposedFields } from "./persistence-support.js";

// Schema 4 / expedition.5 is the only bridged predecessor. Remove this file, the
// bridge tests and src/save/expedition5/ together when the bridge retires.
export interface Schema4Envelope {
  format: "siltwake.save";
  schemaVersion: 4;
  contentVersion: "expedition.5";
  meta: SaveMetadata;
  state: Expedition5State;
}
/** expedition.6 source IDs, in registry order. Later additive sources (S9) arrive with the composed fields. */
export const CREEL_SOURCE_IDS = (Object.keys(SOURCES) as (keyof typeof SOURCES)[])
  .filter(id => !Object.hasOwn(EXPEDITION5_SOURCES, id) && !S9_RESOURCES.some(r => r.id === id));
/** Inverse of the declared expedition.6 additions, for constructing genuine schema4
 * inputs from pristine current states. Asserts nothing paid/earned is laundered. */
export function stripCreelAdditions(state: GameState): Expedition5State {
  const s = withoutComposedFields(state) as GameState;
  for (const id of CREEL_SOURCE_IDS)
    assert.deepEqual(s.world.resources.find(n => n.id === id), { id, stock: SOURCES[id].stock, reserve: SOURCES[id].reserve }, `${id} pristine`);
  assert.deepEqual(s.world.facilities.find(f => f.id === "canopy_stop"), { id: "canopy_stop", repaired: false });
  assert.ok(!s.inventory.items.some(i => i.containerId === "canopy_stop_locker"), "mooring locker empty");
  assert.equal(s.player.mobileRefuge, null, "no registered mobile refuge");
  for (const v of s.fleet.vehicles) assert.equal(v.rating, HULLS[v.hull].initialDepth, "no hull refit");
  const { mobileRefuge: _r, ...player } = s.player;
  const old = { ...s, player,
    inventory: { ...s.inventory, containers: s.inventory.containers.filter(c => c.id !== "canopy_stop_locker") },
    knowledge: { ...s.knowledge, markers: s.knowledge.markers.filter(m => m !== "canopy_stop") },
    world: { ...s.world, resources: s.world.resources.filter(n => Object.hasOwn(EXPEDITION5_SOURCES, n.id)),
      facilities: s.world.facilities.filter(f => f.id !== "canopy_stop") },
    fleet: { ...s.fleet, vehicles: s.fleet.vehicles.map(({ rating: _rating, ...v }) => v) } };
  assert.ok(validExpedition5State(old), "stripped state must satisfy the frozen schema4 validator");
  return old as Expedition5State;
}
export function schema4Fixture(state: GameState, meta: SaveMetadata): Schema4Envelope {
  return { format: "siltwake.save", schemaVersion: 4, contentVersion: "expedition.5", meta: { ...meta }, state: stripCreelAdditions(state) };
}
/** The declared expedition.6 additions, written independently of production code:
 * no refuge, initial hull ratings, dark mooring + empty locker, first stock for new
 * sources, and the mooring marker when C04 is known; then C1's additive fields. */
export function withCreel(old: Schema4Envelope): SaveEnvelope {
  return withComposedFields(creelOnly(old));
}
function creelOnly(old: Schema4Envelope): SaveEnvelope {
  const s = structuredClone(old.state);
  const markers = s.knowledge.evidence.some(e => e.id === "C04") ? [...s.knowledge.markers, "canopy_stop" as const] : s.knowledge.markers;
  return { ...old, schemaVersion: 5, contentVersion: "expedition.6", meta: { ...old.meta }, state: { ...s,
    player: { ...s.player, mobileRefuge: null },
    inventory: { ...s.inventory, containers: s.inventory.containers.flatMap(c => c.id === "buoy_hold"
      ? [c, { id: "canopy_stop_locker", kind: "locker" as const, capacity: 48, ownerId: "canopy_stop" }] : [c]) },
    knowledge: { ...s.knowledge, markers },
    world: { ...s.world, resources: [...s.world.resources, ...CREEL_SOURCE_IDS.map(id => ({ id, stock: SOURCES[id].stock, reserve: SOURCES[id].reserve }))],
      facilities: [...s.world.facilities, { id: "canopy_stop", repaired: false }] },
    fleet: { ...s.fleet, vehicles: s.fleet.vehicles.map(v => ({ ...v, rating: HULLS[v.hull].initialDepth })) },
  } as GameState };
}
