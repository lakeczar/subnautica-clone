import { createGame } from '../src/sim/state.js';
import { createEnvelope, encodeSave } from '../src/save/codec.js';
import type { SaveEnvelope } from '../src/save/codec.js';
import type { StoragePort } from '../src/save/repository.js';
import type { WriterLockPort } from '../src/save/writer-lock.js';

export function deferred<T = void>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
export const sample = (tick = 150): SaveEnvelope => {
  const state = createGame(); state.tick = tick;
  return createEnvelope(state, { sessionId: 'test-session-001', createdAt: '2026-10-17T12:00:00.000Z', savedAt: '2026-10-17T12:05:00.000Z' });
};
export function encoded(save: SaveEnvelope): string {
  const result = encodeSave(save); if (!result.ok) throw new Error(result.error); return result.value;
}
export class MemoryStorage implements StoragePort {
  data = new Map<string, string>();
  failWrite = false;
  failRead = false;
  writes = 0;
  afterRead: (() => void) | null = null;
  getItem(key: string): string | null {
    if (this.failRead) throw new Error('denied');
    const value = this.data.get(key) ?? null;
    const callback = this.afterRead; this.afterRead = null; callback?.();
    return value;
  }
  setItem(key: string, value: string): void {
    this.writes++;
    if (this.failWrite) throw new Error('quota');
    this.data.set(key, value);
  }
}
/** A shared exclusion fixture, not a production fallback. Gate lets tests queue
 * real repository/session operations without timers or scheduler assumptions. */
export class TestWriterLock implements WriterLockPort {
  private tail = Promise.resolve();
  gate: Promise<void> | null = null;
  requests = 0;
  names = new Set<string>();
  async runExclusive<T>(name: string, signal: AbortSignal, action: () => T): Promise<T> {
    this.requests++; this.names.add(name);
    const predecessor = this.tail, release = deferred();
    this.tail = release.promise;
    await predecessor;
    try {
      if (this.gate) await this.gate;
      signal.throwIfAborted();
      return action();
    } finally { release.resolve(); }
  }
}
export async function settled(): Promise<void> { for (let i = 0; i < 15; i++) await Promise.resolve(); }

/** C1's additive schema 5 fields, written independently of production code: an
 * empty story, empty Hearthline sockets, and a carrier's 256 CU hold split into
 * 192 CU stores plus empty 32 CU pantry and fabrication compartments. A save
 * written before them gains exactly these on load, in New Game's key order. */
export const EMPTY_STORY = {
  discoveries: [], hints: {},
  works: { power: false, air: false, gate: "sealed", equalizeSteps: 0, hall: false, food: false, hallPower: false, repairs: [] },
  resolution: { phase: "none", first: null },
} as const;
const SOCKET_IDS = ["hl.socket.bridge.survey", "hl.socket.bridge.launch", "hl.socket.fab.bench.1", "hl.socket.fab.bench.2",
  "hl.socket.stores.floor", "hl.socket.galley.planter", "hl.socket.galley.wall", "hl.socket.cabin.corner",
  "hl.socket.cabin.wall", "hl.socket.vestibule.wall"];
/** S9's additive late-material sources at first stock, appended after every
 * earlier source in New Game order (docs/build/streams/S9.md). */
export const S9_RESOURCES = [
  ["rift_ceramic_lip_north", 12, 8], ["rift_ceramic_lip_south", 12, 8], ["rift_ceramic_deep_seam", 16, 0],
  ["rift_core_shoulder_north", 8, 6], ["rift_core_shoulder_west", 8, 6], ["rift_core_plume_seam", 16, 0],
  ["divide_lattice_ledge_west", 12, 8], ["divide_lattice_ledge_east", 12, 8], ["divide_lattice_fissure", 20, 0],
  ["meridian_cut_ceramic", 16, 0], ["meridian_service_cache", 12, 12],
].map(([id, stock, reserve]) => ({ id: id as string, stock: stock as number, reserve: reserve as number }));
export function withComposedFields<T extends { state: unknown }>(old: T): T {
  const s = structuredClone(old.state) as Record<string, any>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    out[k] = v;
    if (k === "fleet") out.story = structuredClone(EMPTY_STORY);
  }
  const world = out.world as any;
  for (const r of S9_RESOURCES) if (!world.resources.some((n: any) => n.id === r.id)) world.resources.push({ ...r });
  const docking = (out.fleet as any).docking;
  if (docking && !("sockets" in docking)) docking.sockets = Object.fromEntries(SOCKET_IDS.map((id) => [id, null]));
  const inv = out.inventory as any;
  for (const v of (out.fleet as any).vehicles) {
    const hold = v.hull === "hearthline" && inv.containers.find((c: any) => c.id === v.cargoId && c.capacity === 256);
    if (!hold) continue;
    hold.capacity = 192;
    inv.containers.push({ id: `${v.id}_pantry`, kind: "locker", capacity: 32, ownerId: v.id },
      { id: `${v.id}_fabrication`, kind: "locker", capacity: 32, ownerId: v.id });
  }
  return { ...old, state: out };
}
/** Inverse of withComposedFields for a pristine current state, for building
 * genuine pre-composition inputs. */
export function withoutComposedFields(state: any): any {
  const { story, ...rest } = structuredClone(state);
  if (JSON.stringify(story) !== JSON.stringify(EMPTY_STORY)) throw new Error("story is not pristine");
  for (const r of S9_RESOURCES) {
    const n = rest.world.resources.find((x: any) => x.id === r.id);
    if (!n || n.stock !== r.stock || n.reserve !== r.reserve) throw new Error(`${r.id} is not pristine`);
  }
  rest.world.resources = rest.world.resources.filter((x: any) => !S9_RESOURCES.some((r) => r.id === x.id));
  const docking = rest.fleet.docking;
  if (docking) {
    if (Object.values(docking.sockets).some((v) => v !== null)) throw new Error("carrier sockets are not empty");
    delete docking.sockets;
  }
  for (const v of rest.fleet.vehicles) if (v.hull === "hearthline") {
    rest.inventory.containers = rest.inventory.containers.filter((c: any) => c.id !== `${v.id}_pantry` && c.id !== `${v.id}_fabrication`);
    rest.inventory.containers.find((c: any) => c.id === v.cargoId).capacity = 256;
  }
  return rest;
}
