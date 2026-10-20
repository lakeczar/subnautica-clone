import { CONTENT_VERSION, HULLS, SOURCES } from "../content/registry.js";
import type { GameState } from "../sim/types.js";
import { carrierInteriorSolids } from "../sim/carrier.js";
import { createWorldQueries } from "../sim/world.js";
import { record, validState } from "./validation.js";
import { addNewContent } from "./content.js";
import { validExpedition5State } from "./expedition5/validation.js";
import type { GameState as Expedition5State } from "./expedition5/types.js";
import { SOURCES as EXPEDITION5_SOURCES } from "./expedition5/domain.js";
export const SAVE_SCHEMA_VERSION = 5 as const;
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
/** Schemas older than the bridge belong to earlier development builds. Their
 * converters are retired; see docs/build/streams/S7.md. */
const OLDER_BUILD_SCHEMAS = [1, 2, 3];
function blockedCarrierInterior(s: GameState): boolean {
  return s.player.interiorPose?.frame === "carrier-local" && !createWorldQueries(carrierInteriorSolids(s), () => -200)
    .clearance(s.player.interiorPose.position, { radius: 0.34, height: 1.75 });
}
/** expedition.6 (M2-B1). Only genuinely new fields/sources initialize, once:
 * no registered mobile refuge, each hull's own initial rating, the dark (unrestored)
 * outer-crown mooring and its empty locker, and first stock for the new margin
 * nets and frame hosts. A found C04 lists the mooring its sheet names. Old stock,
 * reserves, renewal progress, IDs, investments, poses, notes and losses are kept. */
export function migrateCreel(old: Expedition5State): GameState {
  const known = new Set<string>(Object.keys(EXPEDITION5_SOURCES));
  const added = (Object.keys(SOURCES) as (keyof typeof SOURCES)[]).filter((id) => !known.has(id))
    .map((id) => ({ id, stock: SOURCES[id].stock, reserve: SOURCES[id].reserve }));
  const markers = old.knowledge.evidence.some((e) => e.id === "C04") && !old.knowledge.markers.includes("canopy_stop" as never)
    ? [...old.knowledge.markers, "canopy_stop" as const] : [...old.knowledge.markers];
  return {
    ...old,
    player: { ...old.player, mobileRefuge: null },
    // The mooring locker takes the position New Game gives it, after the buoy hold.
    inventory: { ...old.inventory, containers: old.inventory.containers.flatMap((c) => c.id === "buoy_hold"
      ? [c, { id: "canopy_stop_locker", kind: "locker" as const, capacity: 48, ownerId: "canopy_stop" }] : [c]) },
    knowledge: { ...old.knowledge, markers },
    world: { ...old.world, resources: [...old.world.resources, ...added],
      facilities: [...old.world.facilities, { id: "canopy_stop", repaired: false }] },
    fleet: { ...old.fleet, vehicles: old.fleet.vehicles.map((v) => {
      const { boundRepairs, berth, ...rest } = v;
      return { ...rest, rating: HULLS[v.hull].initialDepth, boundRepairs, berth };
    }) },
  } as GameState;
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
  if (OLDER_BUILD_SCHEMAS.includes(d.schemaVersion as number))
    return {
      ok: false,
      error: `This save was made by an older development build (schema ${String(d.schemaVersion)}). This build loads schema 5 saves and converts schema 4 saves only. Keep the original file; it has not been changed.`,
    };
  if (d.schemaVersion !== 5 && d.schemaVersion !== 4)
    return {
      ok: false,
      error: `Save schema ${typeof d.schemaVersion === "number" || typeof d.schemaVersion === "string" ? String(d.schemaVersion).slice(0, 24) : "(unrecognized)"} is unsupported. This build reads schema 5 and converts schema 4 only. Keep the original file.`,
    };
  if (d.contentVersion !== (d.schemaVersion === 4 ? "expedition.5" : CONTENT_VERSION))
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
  const bridge = d.schemaVersion === 4;
  const invalid = {
    ok: false as const,
    error: "Gameplay ownership, capacity, equipment, discovery, facility, recovery or berth data is invalid. Nothing was loaded.",
  };
  if (bridge && !validExpedition5State(d.state)) return invalid;
  // Content added since the save was written starts at New Game's first state;
  // everything else, including the completed rosters, is then validated strictly.
  const added = addNewContent(bridge ? migrateCreel(d.state as Expedition5State) : d.state as GameState);
  if (!added.ok) return added;
  const s = added.value;
  if (!validState(s)) return invalid;
  if (blockedCarrierInterior(s))
    return { ok: false, error: "The current walking position intersects a sealed carrier compartment. Nothing was loaded." };
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
    return { ok: false, error: "This build writes schema 5 / expedition.6 only. Decode a schema 4 save before writing it." };
  let text: string;
  try {
    text = JSON.stringify(save, null, 2);
  } catch {
    return { ok: false, error: "The current session could not be serialized." };
  }
  // Writing runs the full decode, including the sealed-compartment refusal.
  const check = decodeSave(text);
  return check.ok ? { ok: true, value: text } : check;
}
