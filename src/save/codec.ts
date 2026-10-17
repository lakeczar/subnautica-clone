import { CONTENT_VERSION } from '../content/registry.js';
import { WORLD_BOUNDS } from '../sim/world.js';
import type { GameState } from '../sim/types.js';

export const SAVE_SCHEMA_VERSION = 1 as const;
export const MAX_SAVE_BYTES = 1_048_576;
export interface SaveMetadata { sessionId: string; createdAt: string; savedAt: string }
export interface SaveEnvelope {
  format: 'siltwake.save';
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  contentVersion: typeof CONTENT_VERSION;
  meta: SaveMetadata;
  state: GameState;
}
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const number = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const empty = (value: unknown): boolean => Array.isArray(value) && value.length === 0;
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

function validState(value: unknown): value is GameState {
  if (!exact(value, ['tick', 'player', 'inventory', 'knowledge', 'world', 'fleet', 'recovery']) || !number(value.tick, 0, 2_147_483_647) || !Number.isInteger(value.tick)) return false;
  const player = value.player;
  if (!exact(player, ['pose', 'velocity', 'mode', 'vitals', 'refugeId', 'controlledVehicleId', 'interiorId'])) return false;
  const pose = player.pose;
  if (!exact(pose, ['frame', 'position', 'yaw', 'pitch']) || pose.frame !== 'world' || !number(pose.yaw, 0, Math.PI * 2) || !number(pose.pitch, -1.35, 1.35)) return false;
  const p = pose.position;
  if (!exact(p, ['x', 'y', 'z']) || !number(p.x, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX) || !number(p.y, -15, 80) || !number(p.z, WORLD_BOUNDS.minZ, WORLD_BOUNDS.maxZ)) return false;
  const velocity = player.velocity;
  if (!exact(velocity, ['x', 'y', 'z']) || !['x', 'y', 'z'].every(axis => number(velocity[axis], -30, 30))) return false;
  const vitals = player.vitals;
  if (!exact(vitals, ['health', 'oxygen', 'food']) || !['health', 'oxygen', 'food'].every(key => number(vitals[key], 0, 100))) return false;
  if ((player.mode !== 'walking' && player.mode !== 'swimming') || player.refugeId !== 'home_pod' || player.controlledVehicleId !== null || player.interiorId !== null) return false;
  const inventory = value.inventory, knowledge = value.knowledge, world = value.world, fleet = value.fleet, recovery = value.recovery;
  return exact(inventory, ['items', 'containers']) && empty(inventory.items) && empty(inventory.containers)
    && exact(knowledge, ['blueprints', 'scans', 'evidence', 'journals', 'markers']) && Object.values(knowledge).every(empty)
    && exact(world, ['resources', 'facilities']) && empty(world.resources) && empty(world.facilities)
    && exact(fleet, ['vehicles', 'docking']) && empty(fleet.vehicles) && fleet.docking === null
    && exact(recovery, ['caches']) && empty(recovery.caches);
}

export function decodeSave(text: string): Result<SaveEnvelope> {
  if (new TextEncoder().encode(text).byteLength > MAX_SAVE_BYTES) return { ok: false, error: 'This save exceeds the 1 MiB import limit.' };
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { ok: false, error: 'This file is not valid JSON. Your current progress is unchanged.' }; }
  if (!record(data) || data.format !== 'siltwake.save') return { ok: false, error: 'This is not a Siltwake save file.' };
  if (data.schemaVersion !== SAVE_SCHEMA_VERSION) {
    const version = typeof data.schemaVersion === 'number' || typeof data.schemaVersion === 'string' ? String(data.schemaVersion).slice(0, 24) : '(unrecognized)';
    return { ok: false, error: `Save schema ${version} is unsupported. This build reads schema 1 only. Keep the original file for a compatible build.` };
  }
  if (data.contentVersion !== CONTENT_VERSION) return { ok: false, error: 'This save belongs to another content version. Keep it for a compatible build; it has not been changed.' };
  if (!exact(data, ['format', 'schemaVersion', 'contentVersion', 'meta', 'state'])) return { ok: false, error: 'This save contains an unrecognized envelope. No data was loaded.' };
  const meta = data.meta;
  if (!exact(meta, ['sessionId', 'createdAt', 'savedAt']) || typeof meta.sessionId !== 'string' || !/^[a-zA-Z0-9-]{8,64}$/.test(meta.sessionId) || !date(meta.createdAt) || !date(meta.savedAt) || Date.parse(meta.savedAt) < Date.parse(meta.createdAt)) return { ok: false, error: 'The save metadata is invalid. No data was loaded.' };
  if (!validState(data.state)) return { ok: false, error: 'The gameplay data is invalid or contains systems this foundation cannot load. No data was loaded.' };
  return { ok: true, value: data as unknown as SaveEnvelope };
}

export function createEnvelope(state: GameState, meta: SaveMetadata): SaveEnvelope {
  return { format: 'siltwake.save', schemaVersion: SAVE_SCHEMA_VERSION, contentVersion: CONTENT_VERSION, meta: { ...meta }, state };
}

/** Validation also applies to writes, so a broken runtime never destroys a valid slot. */
export function encodeSave(save: SaveEnvelope): Result<string> {
  let text: string;
  try { text = JSON.stringify(save, null, 2); } catch { return { ok: false, error: 'The current session could not be serialized.' }; }
  const check = decodeSave(text);
  return check.ok ? { ok: true, value: text } : check;
}
