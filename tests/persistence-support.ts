import { C4_SOURCES } from "../src/content/c4Sources.js";
import { BERTH_LOCAL, localToWorld } from "../src/sim/carrier.js";
import { createEcology } from "../src/sim/ecology/ecology.js";
import { WORLD_SOURCES } from "../src/content/worldSources.js";
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
  removeItem(key: string): void { this.data.delete(key); }
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
  // C4 (CB tier rule): the shoulders are scan-only and the flushed ledges one-crystal samples.
  ["rift_core_shoulder_north", 0, 0], ["rift_core_shoulder_west", 0, 0], ["rift_core_plume_seam", 16, 0],
  ["divide_lattice_ledge_west", 1, 0], ["divide_lattice_ledge_east", 1, 0], ["divide_lattice_fissure", 20, 0],
  ["meridian_cut_ceramic", 16, 0], ["meridian_service_cache", 12, 12],
].map(([id, stock, reserve]) => ({ id: id as string, stock: stock as number, reserve: reserve as number }));
/** C3's additive content: S2's remaining sources, the two restorable stops and
 * the yard and stop lockers, each at New Game's first state and position. */
export const C3_RESOURCES = [...Object.entries(WORLD_SOURCES), ...Object.entries(C4_SOURCES)]
  .map(([id, d]) => ({ id, stock: d.stock as number, reserve: d.reserve as number }));
export const C3_FACILITIES = [{ id: "rift_station", repaired: false }, { id: "divide_dock", repaired: false },
  // HUB-2: the crown station's stages, additive since schema 5.
  { id: "crown_power", repaired: false }, { id: "crown_dock", repaired: false }, { id: "crown_survey", repaired: false }];
export const C3_LOCKERS = [
  { id: "stack_yard_locker", kind: "locker", capacity: 48, ownerId: "stack_yard" },
  { id: "rift_station_locker", kind: "locker", capacity: 48, ownerId: "rift_station" },
  { id: "divide_dock_locker", kind: "locker", capacity: 48, ownerId: "divide_dock" },
  { id: "crown_station_locker", kind: "locker", capacity: 48, ownerId: "crown_station" },
  { id: "crown_station_store_a", kind: "locker", capacity: 48, ownerId: "crown_station" },
  { id: "crown_station_store_b", kind: "locker", capacity: 48, ownerId: "crown_station" },
];
export function withComposedFields<T extends { state: unknown }>(old: T): T {
  const s = structuredClone(old.state) as Record<string, any>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    out[k] = v;
    if (k === "fleet") out.story = structuredClone(EMPTY_STORY);
  }
  const world = out.world as any;
  if (!("ecology" in world)) out.world = Object.fromEntries(Object.entries(world).flatMap(([k, v]) =>
    k === "maintenance" ? [[k, v], ["ecology", createEcology()]] : [[k, v]]));
  if (!("lamp" in (out.player as any))) out.player = { ...(out.player as any), lamp: true };
  const composedWorld = out.world as any;
  for (const r of [...S9_RESOURCES, ...C3_RESOURCES]) if (!composedWorld.resources.some((n: any) => n.id === r.id)) composedWorld.resources.push({ ...r });
  // Added content takes New Game's place in the roster (CR-1's grounds come after these).
  const order = createGame().world.resources.map((r) => r.id);
  composedWorld.resources.sort((a: any, b: any) => order.indexOf(a.id) - order.indexOf(b.id));
  for (const f of C3_FACILITIES) if (!composedWorld.facilities.some((n: any) => n.id === f.id)) composedWorld.facilities.push({ ...f });
  const containers = (out.inventory as any).containers;
  let at = containers.findIndex((c: any) => c.id === "canopy_stop_locker");
  for (const l of C3_LOCKERS) if (!containers.some((c: any) => c.id === l.id)) containers.splice(++at, 0, { ...l });
  const docking = (out.fleet as any).docking;
  if (docking && !("sockets" in docking)) docking.sockets = Object.fromEntries(SOCKET_IDS.map((id) => [id, null]));
  // C3 moved the starboard berth datum from x 3; a berth saved there moves with it.
  const carrierHull = (out.fleet as any).vehicles.find((v: any) => v.id === docking?.vehicleId);
  for (const v of (out.fleet as any).vehicles) if (carrierHull && v.berth?.slot === 1 && v.berth.pose.position.x === 3) {
    v.berth.pose.position = { ...BERTH_LOCAL[1]! };
    v.pose.position = localToWorld(BERTH_LOCAL[1]!, carrierHull);
  }
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
  if (JSON.stringify(rest.world.ecology) !== JSON.stringify(createEcology())) throw new Error("ecology is not pristine");
  if (rest.player.lamp !== true) throw new Error("lamp is not at its first state");
  delete rest.world.ecology; delete rest.player.lamp;
  for (const r of [...S9_RESOURCES, ...C3_RESOURCES]) {
    const n = rest.world.resources.find((x: any) => x.id === r.id);
    if (!n || n.stock !== r.stock || n.reserve !== r.reserve) throw new Error(`${r.id} is not pristine`);
  }
  rest.world.resources = rest.world.resources.filter((x: any) => ![...S9_RESOURCES, ...C3_RESOURCES].some((r) => r.id === x.id));
  for (const f of C3_FACILITIES) if (rest.world.facilities.find((x: any) => x.id === f.id)?.repaired !== false) throw new Error(`${f.id} is not pristine`);
  rest.world.facilities = rest.world.facilities.filter((x: any) => !C3_FACILITIES.some((f) => f.id === x.id));
  if (rest.inventory.items.some((i: any) => C3_LOCKERS.some((l) => l.id === i.containerId))) throw new Error("stop lockers are not empty");
  rest.inventory.containers = rest.inventory.containers.filter((c: any) => !C3_LOCKERS.some((l) => l.id === c.id));
  const docking = rest.fleet.docking;
  // Before C3 the starboard berth datum was x 3.
  const carrier = rest.fleet.vehicles.find((v: any) => v.id === docking?.vehicleId);
  for (const v of rest.fleet.vehicles) if (carrier && v.berth?.slot === 1) {
    v.berth.pose.position = { ...v.berth.pose.position, x: 3 };
    v.pose.position = localToWorld(v.berth.pose.position, carrier);
  }
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
