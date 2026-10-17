import { CONTENT_VERSION } from "../content/registry.js";
import type { GameState } from "../sim/types.js";
import { createGame } from "../sim/state.js";
import { completeOpening } from "../sim/progression.js";
import { createWorldQueries } from "../sim/world.js";
import { validFoundationState } from "./foundation.js";
import { record, validState } from "./validation.js";
export const SAVE_SCHEMA_VERSION = 2 as const;
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
      "Foundation progress imported. Revised habitat geometry covered the old position, so you were moved to the valid home-pod deck. The original save remains in the journal backup.";
  } else
    s.migration =
      "Foundation progress imported. Your prior safe position and vitals were preserved; M1 facilities and source stock were initialized once.";
  s.feedback = s.migration;
  return s;
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
  if (d.schemaVersion !== 2 && d.schemaVersion !== 1)
    return {
      ok: false,
      error: `Save schema ${typeof d.schemaVersion === "number" || typeof d.schemaVersion === "string" ? String(d.schemaVersion).slice(0, 24) : "(unrecognized)"} is unsupported. This build reads schema 2 and validated foundation schema 1 only. Keep the original file.`,
    };
  if (
    d.contentVersion !==
    (d.schemaVersion === 1 ? "foundation.1" : CONTENT_VERSION)
  )
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
    return {
      ok: true,
      value: createEnvelope(
        migrateFoundation(d.state),
        m as unknown as SaveMetadata,
      ),
    };
  }
  if (!validState(d.state))
    return {
      ok: false,
      error:
        "Gameplay ownership, capacity, equipment, discovery, facility, recovery or berth data is invalid. Nothing was loaded.",
    };
  return { ok: true, value: d as unknown as SaveEnvelope };
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
  let text: string;
  try {
    text = JSON.stringify(save, null, 2);
  } catch {
    return { ok: false, error: "The current session could not be serialized." };
  }
  const check = decodeSave(text);
  return check.ok ? { ok: true, value: text } : check;
}
