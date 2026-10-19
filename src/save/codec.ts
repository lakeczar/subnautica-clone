import { CONTENT_VERSION, SOURCES } from "../content/registry.js";
import { BASIN_SOURCE_IDS, LEGACY_WORLD_BOUNDS } from "../content/routes.js";
import type { GameState } from "../sim/types.js";
import { createGame } from "../sim/state.js";
import { completeOpening } from "../sim/progression.js";
import { carrierInteriorSolids } from "../sim/carrier.js";
import { CARRIER_LAYOUT, carrierHull, carrierInteriorEntry,
  carrierInteriorSolids as legacyInteriorSolids, localToWorld } from "./legacy/carrier-entry.js";
import { createWorldQueries } from "../sim/world.js";
import { validFoundationState } from "./foundation.js";
import { record, validState } from "./validation.js";
import { validExpedition2Domain, validState as validLegacyState } from "./legacy/validation.js";
import type { GameState as LegacyGameState } from "./legacy/types.js";
export const SAVE_SCHEMA_VERSION = 3 as const;
export const MAX_SAVE_BYTES = 1_048_576;
export interface SaveMetadata {
  sessionId: string;
  createdAt: string;
  savedAt: string;
}
export interface SaveEnvelope {
  format: "siltwake.save";
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  contentVersion: typeof CONTENT_VERSION;
  meta: SaveMetadata;
  state: GameState;
}
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const date = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v;
const FOUNDATION_RELOCATED = "Foundation progress imported. Revised habitat geometry covered the old position, so you were moved to the valid home-pod deck.";
const CARRIER_RELOCATED = "Carrier compartment geometry now seals the dry berths. Your previous walking position intersected a closed compartment, so you were moved to a clear dry passage. Vessels and cargo were preserved.";
const HISTORICAL_NOTICES = [
  [FOUNDATION_RELOCATED + " The original save remains in the journal backup.", FOUNDATION_RELOCATED],
  ["Carrier compartment geometry now seals the dry berths. Your previous walking position intersected a closed compartment, so you were moved to a clear dry passage. Vessels and cargo were preserved; the original record remains in the journal backup after saving.", CARRIER_RELOCATED],
] as const;
function normalizeHistoricalNotice(s: GameState): void {
  for (const [old, corrected] of HISTORICAL_NOTICES) if (s.migration === old) {
    s.migration = corrected;
    if (s.feedback === old) s.feedback = corrected;
  }
}
function blockedCarrierInterior(s: GameState, legacy = false): boolean {
  return !!s.player.interiorPose && !createWorldQueries(legacy ? legacyInteriorSolids(s as LegacyGameState) : carrierInteriorSolids(s), () => -200)
    .clearance(s.player.interiorPose.position, { radius: 0.34, height: 1.75 });
}
function migrateFoundation(old: GameState): GameState {
  const s = createGame();
  completeOpening(s);
  s.tick = old.tick;
  s.player.pose = structuredClone(old.player.pose);
  s.player.velocity = { ...old.player.velocity };
  s.player.vitals = { ...old.player.vitals };
  s.player.mode = old.player.mode;
  s.metrics.minOxygen = s.player.vitals.oxygen;
  const world = createWorldQueries(),
    p = s.player.pose.position;
  if (
    !world.clearance(p, {
      radius: 0.34,
      height: s.player.mode === "walking" ? 1.75 : 0.95,
    })
  ) {
    s.player.pose.position = { x: 0, y: 0.18, z: 14 };
    s.player.mode = "walking";
    s.player.velocity = { x: 0, y: 0, z: 0 };
    s.migration =
      FOUNDATION_RELOCATED;
  } else
    s.migration =
      "Foundation progress imported. Your prior safe position and vitals were preserved; M1 facilities and source stock were initialized once.";
  s.feedback = s.migration;
  return s;
}
function migrateExpedition(old: LegacyGameState): GameState {
  return { ...old,
    world: { ...old.world, resources: [...old.world.resources, ...BASIN_SOURCE_IDS.map(id =>
      ({ id, stock: SOURCES[id].stock, reserve: SOURCES[id].reserve }))] },
    recovery: { ...old.recovery, operation: old.recovery.operation ?
      { ...old.recovery.operation, routeId: "canopy" } : null },
  };
}
export function decodeSave(text: string): Result<SaveEnvelope> {
  if (new TextEncoder().encode(text).byteLength > MAX_SAVE_BYTES)
    return { ok: false, error: "This save exceeds the 1 MiB import limit." };
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: "This file is not valid JSON. Your current progress is unchanged.",
    };
  }
  if (!record(d) || d.format !== "siltwake.save")
    return { ok: false, error: "This is not a Siltwake save file." };
  if (d.schemaVersion !== 3 && d.schemaVersion !== 2 && d.schemaVersion !== 1)
    return {
      ok: false,
      error: `Save schema ${typeof d.schemaVersion === "number" || typeof d.schemaVersion === "string" ? String(d.schemaVersion).slice(0, 24) : "(unrecognized)"} is unsupported. This build reads schema 3, validated expedition schema 2 and foundation schema 1 only. Keep the original file.`,
    };
  if (d.schemaVersion === 1 ? d.contentVersion !== "foundation.1"
    : d.schemaVersion === 2 ? d.contentVersion !== "expedition.3" && d.contentVersion !== "expedition.2"
      : d.contentVersion !== CONTENT_VERSION)
    return {
      ok: false,
      error:
        "This save belongs to another content version. Keep it for a compatible build; it has not been changed.",
    };
  if (
    Object.keys(d).length !== 5 ||
    !["format", "schemaVersion", "contentVersion", "meta", "state"].every((k) =>
      Object.hasOwn(d, k),
    )
  )
    return {
      ok: false,
      error: "Unrecognized save envelope. Nothing was loaded.",
    };
  const m = d.meta;
  if (
    !record(m) ||
    Object.keys(m).length !== 3 ||
    typeof m.sessionId !== "string" ||
    !/^[a-zA-Z0-9-]{8,64}$/.test(m.sessionId) ||
    !date(m.createdAt) ||
    !date(m.savedAt) ||
    Date.parse(m.savedAt) < Date.parse(m.createdAt)
  )
    return {
      ok: false,
      error: "The save metadata is invalid. Nothing was loaded.",
    };
  if (d.schemaVersion === 1) {
    if (!validFoundationState(d.state))
      return {
        ok: false,
        error: "Malformed foundation data. The original record is unchanged.",
      };
    const state = migrateFoundation(d.state);
    if (!validState(state)) return { ok: false, error: "The migrated foundation state is invalid. The original record is unchanged." };
    return {
      ok: true,
      value: createEnvelope(
        state,
        m as unknown as SaveMetadata,
      ),
    };
  }
  const legacy = d.schemaVersion === 2;
  if (legacy ? ((d.contentVersion === "expedition.2" && !validExpedition2Domain(d.state)) || !validLegacyState(d.state)) : !validState(d.state))
    return {
      ok: false,
      error:
        "Gameplay ownership, capacity, equipment, discovery, facility, recovery or berth data is invalid. Nothing was loaded.",
    };
  const s = legacy ? migrateExpedition(d.state as LegacyGameState) : d.state as GameState;
  // All saved berth transforms remain compatible. Historically sealed
  // room walls can cover an old walking pose; only that pose receives a visible,
  // idempotent safety relocation. Reading never writes or moves a vessel/cargo.
  if (blockedCarrierInterior(s, legacy)) {
    if (!legacy) return { ok: false, error: "The current walking position intersects a sealed carrier compartment. Nothing was loaded." };
    const h = carrierHull(s as LegacyGameState)!;
    const error = "Carrier compartment migration could not find a clear dry passage at this saved vessel position. Keep the original save for a compatible build; nothing was loaded or changed.";
    const world = createWorldQueries(), bounds = LEGACY_WORLD_BOUNDS;
    // Historical entry must not gain a landing merely because M2 enlarged the world.
    const legacyWorld = { ...world, clearance(p: GameState["player"]["pose"]["position"], shape: Parameters<typeof world.clearance>[1]) {
      return p.x - shape.radius >= bounds.minX && p.x + shape.radius <= bounds.maxX &&
        p.z - shape.radius >= bounds.minZ && p.z + shape.radius <= bounds.maxZ &&
        p.y >= -200 && p.y <= 100 && world.clearance(p, shape);
    } };
    const entry = carrierInteriorEntry(s as LegacyGameState, legacyWorld, CARRIER_LAYOUT.helm);
    if (!entry) return { ok: false, error };
    s.player.interiorPose!.position = entry;
    s.player.pose.position = localToWorld(s.player.interiorPose!.position, h);
    s.player.velocity = { x: 0, y: 0, z: 0 };
    s.migration = CARRIER_RELOCATED;
    s.feedback = s.migration;
    if (!validState(s) || blockedCarrierInterior(s)) return { ok: false, error };
  }
  normalizeHistoricalNotice(s);
  if (!validState(s)) return { ok: false, error: "The migrated gameplay state is invalid. The original record is unchanged." };
  return { ok: true, value: createEnvelope(s, m as unknown as SaveMetadata) };
}
export function createEnvelope(
  state: GameState,
  meta: SaveMetadata,
): SaveEnvelope {
  return {
    format: "siltwake.save",
    schemaVersion: SAVE_SCHEMA_VERSION,
    contentVersion: CONTENT_VERSION,
    meta: { ...meta },
    state,
  };
}
export function encodeSave(save: SaveEnvelope): Result<string> {
  if (save.schemaVersion !== SAVE_SCHEMA_VERSION || save.contentVersion !== CONTENT_VERSION)
    return { ok: false, error: "This build writes schema 3 / expedition.4 only. Decode a supported older save before writing it." };
  let text: string;
  try {
    text = JSON.stringify(save, null, 2);
  } catch {
    return { ok: false, error: "The current session could not be serialized." };
  }
  const check = decodeSave(text);
  if (check.ok && blockedCarrierInterior(save.state))
    return { ok: false, error: "The current walking position intersects a sealed carrier compartment. Move to the clear bridge passage before saving." };
  return check.ok ? { ok: true, value: text } : check;
}
