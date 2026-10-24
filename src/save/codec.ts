import { CONTENT_VERSION } from "../content/registry.js";
import type { GameState } from "../sim/types.js";
import { carrierInteriorSolids } from "../sim/carrier.js";
import { createWorldQueries } from "../sim/world.js";
import { record, validState } from "./validation.js";
import { addNewContent } from "./content.js";
import { bridgeSchema7 } from "./bridge7.js";
export const SAVE_SCHEMA_VERSION = 8 as const;
/** The one previous schema this build converts (DIRECTION: the immediately previous only). */
export const BRIDGED_SCHEMA_VERSION = 7 as const;
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
const OLDER_BUILD_SCHEMAS = [1, 2, 3, 4, 5, 6];
function blockedCarrierInterior(s: GameState): boolean {
  return s.player.interiorPose?.frame === "carrier-local" && !createWorldQueries(carrierInteriorSolids(s), () => -200)
    .clearance(s.player.interiorPose.position, { radius: 0.34, height: 1.75 });
}
/** Whether `text` is over `limit` bytes as UTF-8; it encodes only when the length can't tell
 * (a UTF-16 code unit is at most 3 UTF-8 bytes). */
export const utf8Over = (text: string, limit: number): boolean =>
  text.length > limit || (text.length * 3 > limit && new TextEncoder().encode(text).byteLength > limit);

export function decodeSave(text: string): Result<SaveEnvelope> {
  if (utf8Over(text, MAX_SAVE_BYTES))
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
      error: `This save was made by an older development build (schema ${String(d.schemaVersion)}). This build loads schema 8 saves and converts schema 7 saves only. Keep the original file; it has not been changed.`,
    };
  if (d.schemaVersion !== SAVE_SCHEMA_VERSION && d.schemaVersion !== BRIDGED_SCHEMA_VERSION)
    return {
      ok: false,
      error: `Save schema ${typeof d.schemaVersion === "number" || typeof d.schemaVersion === "string" ? String(d.schemaVersion).slice(0, 24) : "(unrecognized)"} is unsupported. This build reads schema 8 and converts schema 7 only. Keep the original file.`,
    };
  if (d.contentVersion !== CONTENT_VERSION)
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
  const invalid = {
    ok: false as const,
    error: "Gameplay ownership, capacity, equipment, discovery, facility, recovery or berth data is invalid. Nothing was loaded.",
  };
  // Content added since the save was written starts at New Game's first state;
  // everything else, including the completed rosters, is then validated strictly.
  const bridged = d.schemaVersion === SAVE_SCHEMA_VERSION ? { ok: true as const, value: d.state as GameState } : bridgeSchema7(d.state);
  if (!bridged.ok) return bridged;
  const added = addNewContent(bridged.value);
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
    return { ok: false, error: "This build writes schema 8 / expedition.7 only. Decode an older save before writing it." };
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
