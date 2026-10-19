import assert from "node:assert/strict";
import { RENEWABLE_SOURCE_IDS, SOURCES } from "../src/content/registry.js";
import { BASIN_SOURCE_IDS, LEGACY_WORLD_BOUNDS } from "../src/content/routes.js";
import { SOURCES as LEGACY_SOURCES } from "../src/save/legacy/registry.js";
import type { GameState as LegacyState } from "../src/save/legacy/types.js";
import type { GameState as Expedition4State } from "../src/save/expedition4/types.js";
import { validExpedition2Domain, validState as validLegacyState } from "../src/save/legacy/validation.js";
import type { SaveEnvelope, SaveMetadata } from "../src/save/codec.js";
import { decodeSave, encodeSave } from "../src/save/codec.js";
import type { GameState } from "../src/sim/types.js";
import { createWorldQueries } from "../src/sim/world.js";

export interface Schema2Envelope {
  format: "siltwake.save";
  schemaVersion: 2;
  contentVersion: "expedition.2" | "expedition.3";
  meta: SaveMetadata;
  state: LegacyState;
}

/** Construct synthetic old fixtures before any intentional corruption. Only the
 * four pristine M2 seed records, zero renewal progress and canopy route annotation may be removed.
 * Paid new content, depletion or Basin operations cannot be laundered this way.
 * Never use this constructor to rewrite a retained/archived input. */
export function schema2Fixture(state: GameState, meta: SaveMetadata,
  contentVersion: Schema2Envelope["contentVersion"] = "expedition.3"): Schema2Envelope {
  const s = structuredClone(state);
  assert.deepEqual(s.world.resources.filter(n => !Object.hasOwn(LEGACY_SOURCES, n.id)),
    BASIN_SOURCE_IDS.map(id => ({ id, stock: SOURCES[id].stock, reserve: SOURCES[id].reserve })));
  const operation = s.recovery.operation;
  if (operation) assert.equal(operation.routeId, "canopy", "only the historical route has schema2 waypoint semantics");
  const oldOperation = operation ? (({ routeId: _routeId, ...old }) => old)(operation) : null;
  assert.deepEqual(s.world.renewal, RENEWABLE_SOURCE_IDS.map(id => ({ id, progress: 0 })),
    "accumulated renewal progress cannot be laundered into a historical fixture");
  const { renewal: _renewal, ...world } = s.world;
  const old: unknown = { ...s,
    world: { ...world, resources: s.world.resources.filter(n => Object.hasOwn(LEGACY_SOURCES, n.id)) },
    recovery: { ...s.recovery, operation: oldOperation },
  };
  assert.ok(validLegacyState(old), "fixture must satisfy the frozen schema2 roster, bounds and semantics");
  assert.equal(old.world.resources.length, Object.keys(LEGACY_SOURCES).length);
  if (contentVersion === "expedition.2") assert.ok(validExpedition2Domain(old), "expedition.2 predates acoustic trim");
  return { format: "siltwake.save", schemaVersion: 2, contentVersion, meta: { ...meta }, state: old };
}

export interface Schema3Envelope {
  format: "siltwake.save";
  schemaVersion: 3;
  contentVersion: "expedition.4";
  meta: SaveMetadata;
  state: Expedition4State;
}

/** Exact historical schema3 / expedition.4 additions, leaving every prior field in the
 * comparison. Also a genuine schema3 input for the next migration step. */
export function historicalSchema3(old: Schema2Envelope): Schema3Envelope {
  const s = structuredClone(old.state);
  return { ...old, schemaVersion: 3, contentVersion: "expedition.4", meta: { ...old.meta }, state: { ...s,
    world: { ...s.world, resources: [...s.world.resources,
      ...BASIN_SOURCE_IDS.map(id => ({ id, stock: SOURCES[id].stock, reserve: SOURCES[id].reserve }))] },
    recovery: { ...s.recovery, operation: s.recovery.operation ? { ...s.recovery.operation, routeId: "canopy" } : null },
  } };
}

/** The only schema4 / expedition.5 addition: zero living-shed progress, inserted after
 * resources. Every schema3 field, including depleted stock and reserve, stays compared. */
export function withRenewal(old: Schema3Envelope): SaveEnvelope {
  const { resources, ...world } = structuredClone(old.state.world);
  return { ...old, schemaVersion: 4, contentVersion: "expedition.5", meta: { ...old.meta },
    state: { ...structuredClone(old.state), world: { resources,
      renewal: RENEWABLE_SOURCE_IDS.map(id => ({ id, progress: 0 })), ...world } } };
}
/** Historical name: the exact expected current decode of a schema2 fixture, composing
 * both declared version additions. Carrier landing/notice normalization, when
 * expected, must be explicit in callers. */
export const schema3Expected = (old: Schema2Envelope): SaveEnvelope => withRenewal(historicalSchema3(old));

/** Exercise real schema2 decoding, including the absent route field, and compare
 * the entire envelope before allowing a legacy operation to resume. */
export function migrateSchema2Fixture(state: GameState, meta: SaveMetadata,
  contentVersion: Schema2Envelope["contentVersion"]): GameState {
  const old = schema2Fixture(state, meta, contentVersion), raw = JSON.stringify(old);
  if (old.state.recovery.operation) assert.equal(Object.hasOwn(old.state.recovery.operation, "routeId"), false);
  const decoded = decodeSave(raw);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.error);
  assert.deepEqual(decoded.value, schema3Expected(old));
  assert.equal(JSON.stringify(old), raw, "decoding cannot modify the schema2 input");
  assert.ok(encodeSave(decoded.value).ok, "migrated commands resume from an immediately saveable state");
  return decoded.value.state;
}

/** Current terrain is identical in the old rectangle; historical landing probes
 * must still respect the old capsule and vertical bounds after M2 expansion. */
const world = createWorldQueries();
export const legacyWorld = { ...world, clearance(position, shape) {
  const b = LEGACY_WORLD_BOUNDS;
  return position.x - shape.radius >= b.minX && position.x + shape.radius <= b.maxX &&
    position.z - shape.radius >= b.minZ && position.z + shape.radius <= b.maxZ &&
    position.y >= -200 && position.y <= 100 && world.clearance(position, shape);
} } satisfies ReturnType<typeof createWorldQueries>;
