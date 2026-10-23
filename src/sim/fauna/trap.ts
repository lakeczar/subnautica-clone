/** CR-1: the fish trap, a SYS-2 socket module. Socketed at a host in water it
 * catches one small fish every TRAP.seconds of active play near a fish ground
 * or trap spot (CB-2), half as fast elsewhere, up to TRAP.cap held; a full
 * trap simply waits. Its catch is keyed by the module, so it
 * travels with it like a crop. Emptying it is one interaction at the host. */
import { TRAP } from "../../content/fauna/items.js";
import { FAUNA_SOURCES, GROUNDS, TRAP_SPOTS } from "../../content/fauna/grounds.js";
import type { Vec3 } from "../types.js";
import { containerLabel } from "../inventory.js";
import type { GameState } from "../types.js";
import { accessible, hostById, hostLocal, listHosts } from "../systems/hosts.js";
import type { SocketHost } from "../systems/hosts.js";
import { accepts, addStack, cuOf, freeCu } from "../systems/ledger.js";
import type { SystemsState, TrapState } from "../systems/state.js";

export const TRAP_ITEM = "mod_fish_trap";
/** A host whose sockets sit in water: every outpost and stop; the pod's ramp
 * dips into the reef; the island workshop stands on dry land. */
export const wetHost = (host: Pick<SocketHost, "position" | "kind">): boolean =>
  host.kind !== "carrier" && host.position.y <= TRAP.wetBelow;

/** Fish run past a host near a fish ground or a trap spot: full rate there. */
const FISHY: readonly Vec3[] = [
  ...Object.entries(FAUNA_SOURCES).filter(([id]) => GROUNDS[id as keyof typeof GROUNDS].kind === "fish").map(([, g]) => g.position),
  ...Object.values(TRAP_SPOTS).map((t) => t.position),
];
/** 1 near fish, 1 / farFactor elsewhere. Progress is in full-rate seconds. */
export const trapRate = (at: Vec3): number =>
  FISHY.some((p) => Math.hypot(p.x - at.x, p.y - at.y, p.z - at.z) <= TRAP.nearRange) ? 1 : 1 / TRAP.farFactor;

function trapState(sys: SystemsState, moduleId: string): TrapState {
  let t = sys.traps.find((x) => x.moduleId === moduleId);
  if (!t) sys.traps.push(t = { moduleId, progress: 0, held: 0 });
  return t;
}

/** Background catch for `seconds` of active play. Returns the number of fish
 * caught this call, for notices. */
export function advanceTraps(s: GameState, sys: SystemsState, seconds: number): number {
  let caught = 0;
  for (const e of sys.sockets) {
    if (e.kind !== TRAP_ITEM) continue;
    const host = hostById(s, sys, e.hostId);
    if (!host || !host.available || !wetHost(host)) continue;
    const t = trapState(sys, e.itemId);
    if (t.held >= TRAP.cap) { t.progress = 0; continue; }
    t.progress += seconds * trapRate(host.position);
    if (t.progress >= TRAP.seconds) {
      t.progress = Math.max(0, t.progress - TRAP.seconds);
      if (t.progress >= TRAP.seconds) t.progress = 0;
      t.held++;
      caught++;
      if (t.held >= TRAP.cap) t.progress = 0;
    }
  }
  return caught;
}

export interface TrapView {
  hostId: string; socket: string; moduleId: string; hostLabel: string;
  held: number; cap: number; wet: boolean;
  /** Seconds to the next fish, null when full or dry. */
  nextIn: number | null;
  /** Fish run past here: full rate. */
  near: boolean;
}
export function trapViews(s: GameState, sys: SystemsState): TrapView[] {
  const out: TrapView[] = [];
  for (const host of listHosts(s, sys)) for (const slot of host.sockets) {
    if (slot.occupant?.module !== "trap" || !slot.occupant.itemId) continue;
    const t = sys.traps.find((x) => x.moduleId === slot.occupant!.itemId), held = t?.held ?? 0, wet = wetHost(host) && host.available;
    const rate = trapRate(host.position);
    out.push({ hostId: host.id, socket: slot.id, moduleId: slot.occupant.itemId, hostLabel: host.label, held, cap: TRAP.cap, wet,
      nextIn: !wet || held >= TRAP.cap ? null : Math.max(0, TRAP.seconds - (t?.progress ?? 0)) / rate, near: rate === 1 });
  }
  return out;
}

export interface EmptyTrapPreview { refusal: string | null; quantity: number; to: string | null }
/** The catch goes to `to`, else the first host locker with room, else the diver hold. */
export function emptyTrapPreview(s: GameState, sys: SystemsState, hostId: string, socketId: string, to?: string): EmptyTrapPreview {
  const none = (refusal: string): EmptyTrapPreview => ({ refusal, quantity: 0, to: null });
  const host = hostById(s, sys, hostId);
  if (!host) return none("That host doesn't exist.");
  if (!hostLocal(s, host)) return none(`Empty the trap at ${host.label}.`);
  const slot = host.sockets.find((k) => k.id === socketId);
  if (slot?.occupant?.module !== "trap" || !slot.occupant.itemId) return none("That socket holds no fish trap.");
  const held = sys.traps.find((t) => t.moduleId === slot.occupant!.itemId)?.held ?? 0;
  if (held <= 0) return none(wetHost(host) ? "The trap is empty. It catches a fish every few minutes." : `${host.label} is on dry land: the trap catches nothing here.`);
  const need = cuOf("small_fish") * held;
  const fits = (c: string): boolean => s.inventory.containers.some((k) => k.id === c) && accessible(s, sys, c) &&
    accepts(s, c, "small_fish") && freeCu(s, c) >= need;
  const dest = to !== undefined ? (fits(to) ? to : null) : [...host.lockers, "diver"].find(fits) ?? null;
  if (!dest) return { refusal: `The catch needs ${need} CU free${to ? ` in ${containerLabel(s, to)}` : " in a locker here or your hold"}. Nothing moved.`, quantity: held, to: null };
  return { refusal: null, quantity: held, to: dest };
}
export function emptyTrap(s: GameState, sys: SystemsState, hostId: string, socketId: string, to?: string): string | null {
  const p = emptyTrapPreview(s, sys, hostId, socketId, to);
  if (p.refusal) return p.refusal;
  const host = hostById(s, sys, hostId)!, moduleId = host.sockets.find((k) => k.id === socketId)!.occupant!.itemId!;
  const t = sys.traps.find((x) => x.moduleId === moduleId)!;
  addStack(s, "small_fish", p.quantity, p.to!);
  t.held = 0;
  s.feedback = `Emptied the fish trap · ${p.quantity} × Small fish → ${containerLabel(s, p.to!)}.`;
  return null;
}
