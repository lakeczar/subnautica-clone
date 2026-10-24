/** The shared socket-host model. The pod, restored stops, field outposts and the
 * Hearthline all expose the same `SocketHost` view, and modules install and
 * remove through one rule set. Installed module items leave the inventory and
 * return under the same ID, so the work keyed to them (decodes, crops) follows. */
import { HEARTHLINE_SOCKETS } from "../../content/fleet/hearthlineInterior.js";
import { CARRIER_OCCUPANTS, FIXED_HOSTS, HOST_REACH, MODULES, moduleOfItem, OUTPOST_TIERS } from "../../content/systems/hosts.js";
import type { FixedHostId, ModuleKind } from "../../content/systems/hosts.js";
import { containerAccepts, containerAccessible, containerLabel, cuOf, distance, facility, freeCapacity, labelOf, nearCanopyStop, nearPod, nearWorkshop, restoreInstance, takeInstance, usedCapacity } from "../inventory.js";
import type { GameState, Vec3, VehicleState } from "../types.js";
import type { OutpostState, PowerSource, SocketEntry, SystemsState } from "./state.js";

export type HostKind = "pod" | "stop" | "outpost" | "carrier";
export interface SocketOccupant {
  /** null for an occupant the carrier fixture seeded without an item instance. */
  itemId: string | null;
  module: ModuleKind | null;
  label: string;
}
export interface SocketSlot { id: string; accepts: readonly ModuleKind[]; occupant: SocketOccupant | null }
export interface SocketHost {
  id: string;
  kind: HostKind;
  label: string;
  position: Vec3;
  /** Restored, deployed and not disabled: sockets work. */
  available: boolean;
  power: PowerSource;
  sockets: SocketSlot[];
  /** Services without a socket: every outpost tier has a charger and a locker. */
  builtIn: readonly ModuleKind[];
  /** A restored stop's one service an outpost can't offer. */
  unique: string | null;
  /** Containers a diver uses at this host: harvests and pack payments land here. */
  lockers: string[];
}
/** SYS-1 owns power. This seam answers "does this host have power right now". */
export type HostPower = (host: SocketHost, s: GameState) => boolean;

export const outpostLockerId = (outpostId: string): string => `${outpostId}_locker`;
export const moduleLockerId = (itemId: string): string => `${itemId}_locker`;
export const carrierHostId = (vehicleId: string): string => `carrier:${vehicleId}`;
const ALL_MODULES = Object.keys(MODULES) as ModuleKind[];

function occupant(e: SocketEntry): SocketOccupant {
  return { itemId: e.itemId, module: moduleOfItem(e.kind), label: labelOf(e.kind) };
}
function plainSockets(sys: SystemsState, hostId: string, count: number): SocketSlot[] {
  return Array.from({ length: count }, (_, n) => {
    const e = sys.sockets.find((x) => x.hostId === hostId && x.socket === `s${n}`);
    return { id: `s${n}`, accepts: ALL_MODULES, occupant: e ? occupant(e) : null };
  });
}
const lockerModules = (sys: SystemsState, hostId: string): string[] =>
  sys.sockets.filter((e) => e.hostId === hostId && moduleOfItem(e.kind) === "locker").map((e) => moduleLockerId(e.itemId));

/** Each fixed host's own locker (C4: the restored S9 stops use their stop lockers). */
const FIXED_LOCKERS: Readonly<Record<FixedHostId, string>> = {
  home_pod: "pod_locker", island_workshop: "workshop_locker", canopy_stop: "canopy_stop_locker",
  rift_station: "rift_station_locker", divide_dock: "divide_dock_locker", crown_station: "crown_station_locker",
};
function fixedHost(s: GameState, sys: SystemsState, id: FixedHostId): SocketHost {
  const d = FIXED_HOSTS[id];
  return {
    id, kind: d.kind, label: d.label, position: { ...d.position },
    available: d.facility === null || facility(s, d.facility), power: "plant",
    sockets: plainSockets(sys, id, d.sockets), builtIn: "builtIn" in d ? d.builtIn : [], unique: d.unique,
    lockers: [FIXED_LOCKERS[id], ...lockerModules(sys, id)],
  };
}
export function outpostHost(sys: SystemsState, o: OutpostState): SocketHost {
  const t = OUTPOST_TIERS[o.tier];
  return {
    id: o.id, kind: "outpost", label: o.name, position: { ...o.position }, available: true, power: o.power,
    sockets: plainSockets(sys, o.id, t.sockets), builtIn: ["charger", "locker"], unique: null,
    lockers: [outpostLockerId(o.id), ...lockerModules(sys, o.id)],
  };
}
/** The Hearthline's system sockets, read from HEARTHLINE_SOCKETS. Furniture
 * occupants in CarrierState.sockets keep their slot occupied. */
export function carrierHost(s: GameState, sys: SystemsState, v: VehicleState): SocketHost {
  const id = carrierHostId(v.id);
  const seeded = s.fleet.docking?.vehicleId === v.id ? s.fleet.docking.sockets : {};
  const sockets = HEARTHLINE_SOCKETS.flatMap((k): SocketSlot[] => {
    const takes = [...new Set(k.accepts.map((a) => CARRIER_OCCUPANTS[a]).filter((m): m is ModuleKind => !!m))];
    if (!takes.length) return [];
    const e = sys.sockets.find((x) => x.hostId === id && x.socket === k.id);
    const legacy = seeded[k.id];
    return [{ id: k.id, accepts: takes, occupant: e ? occupant(e)
      : legacy ? { itemId: null, module: CARRIER_OCCUPANTS[legacy] ?? null, label: legacy.replaceAll("_", " ") } : null }];
  });
  return {
    id, kind: "carrier", label: "Hearthline", position: { ...v.pose.position }, available: !v.disabled, power: "plant",
    sockets, builtIn: [], unique: "Berths and a mobile base", lockers: [v.cargoId, ...lockerModules(sys, id)],
  };
}

/** Every host, in one order. `occupied`: only hosts with something in a socket (fixed hosts
 * and outposts with a socket entry, and every carrier, whose seeded fittings also occupy
 * sockets), for per-step readers that skip empty hosts anyway (SIM-PERF-1: the power drain
 * built every host's whole view every step). */
export function listHosts(s: GameState, sys: SystemsState, options: { occupied?: boolean } = {}): SocketHost[] {
  const used = (id: string): boolean => !options.occupied || sys.sockets.some((e) => e.hostId === id);
  return [
    ...(Object.keys(FIXED_HOSTS) as FixedHostId[]).filter(used).map((id) => fixedHost(s, sys, id)),
    ...sys.outposts.filter((o) => used(o.id)).map((o) => outpostHost(sys, o)),
    ...s.fleet.vehicles.filter((v) => v.hull === "hearthline").map((v) => carrierHost(s, sys, v)),
  ];
}
export function hostById(s: GameState, sys: SystemsState, hostId: string): SocketHost | null {
  if (Object.hasOwn(FIXED_HOSTS, hostId)) return fixedHost(s, sys, hostId as FixedHostId);
  const o = sys.outposts.find((o) => o.id === hostId);
  if (o) return outpostHost(sys, o);
  const v = s.fleet.vehicles.find((v) => v.hull === "hearthline" && carrierHostId(v.id) === hostId);
  return v ? carrierHost(s, sys, v) : null;
}
/** Where an installed module item sits, if anywhere. */
export const installedAt = (sys: SystemsState, itemId: string): SocketEntry | null =>
  sys.sockets.find((e) => e.itemId === itemId) ?? null;

/** The diver works this host's sockets: in the carrier, at a fixed host's work
 * area, or within reach of an outpost. Never from a helm. */
export function hostLocal(s: GameState, host: Pick<SocketHost, "id" | "kind" | "position">): boolean {
  if (host.kind === "carrier") return s.player.interiorId === host.id.slice("carrier:".length);
  if (s.player.controlledVehicleId || s.player.interiorId) return false;
  if (host.id === "home_pod") return nearPod(s);
  if (host.id === "island_workshop") return nearWorkshop(s);
  if (host.id === "canopy_stop") return nearCanopyStop(s);
  return distance(s.player.pose.position, host.position) <= HOST_REACH;
}

/** Container access including SYS-2 lockers: an outpost's locker at that outpost,
 * a locker module's container where it is installed. Everything else defers to inventory.ts. */
export function accessible(s: GameState, sys: SystemsState, containerId: string): boolean {
  const outpost = sys.outposts.find((o) => outpostLockerId(o.id) === containerId);
  if (outpost) return hostLocal(s, outpostHost(sys, outpost));
  const mod = sys.sockets.find((e) => moduleLockerId(e.itemId) === containerId);
  if (mod) { const h = hostById(s, sys, mod.hostId); return !!h && h.available && hostLocal(s, h); }
  if (s.inventory.items.some((i) => moduleLockerId(i.id) === containerId)) return false;
  return containerAccessible(s, containerId);
}
/** Diver hold first, then this host's lockers the diver can reach. */
export function workContainers(s: GameState, sys: SystemsState, host: SocketHost): string[] {
  return ["diver", ...host.lockers.filter((c) => s.inventory.containers.some((k) => k.id === c) && accessible(s, sys, c))];
}

/** Default power until SYS-1 composes its model: a host's own plant, solar and
 * thermal always run; a cell-powered outpost runs while a charged reserve or
 * bio-cell sits in one of its lockers (no drain is modelled here). */
export const locationPower: HostPower = (host, s) => host.available && (host.power !== "cells" ||
  s.inventory.items.some((i) => host.lockers.includes(i.containerId) && (i.kind === "reserve_cell" || (i.kind as string) === "bio_cell") && (i.charge ?? 0) > 0));

export interface HostRefusal { refusal: string }
function socketFor(s: GameState, sys: SystemsState, hostId: string, socketId: string): HostRefusal | { host: SocketHost; slot: SocketSlot } {
  const host = hostById(s, sys, hostId);
  if (!host) return { refusal: "That host doesn't exist." };
  if (!host.available) return { refusal: host.kind === "stop" ? `Restore ${host.label} before using its sockets.` : `${host.label} is disabled.` };
  if (!hostLocal(s, host)) return { refusal: `Work at ${host.label} to change its modules.` };
  const slot = host.sockets.find((k) => k.id === socketId);
  if (!slot) return { refusal: `${host.label} has no socket ${socketId}.` };
  return { host, slot };
}

/** Installs one module item from the diver hold or this host's lockers. */
export function installModule(s: GameState, sys: SystemsState, hostId: string, socketId: string, itemId: string): string | null {
  const at = socketFor(s, sys, hostId, socketId);
  if ("refusal" in at) return at.refusal;
  const { host, slot } = at;
  if (slot.occupant) return `That socket already holds the ${slot.occupant.label.toLowerCase()}.`;
  const item = s.inventory.items.find((i) => i.id === itemId);
  const module = item ? moduleOfItem(item.kind) : null;
  if (!item || !module) return "Choose a module item.";
  if (!workContainers(s, sys, host).includes(item.containerId) || item.fitted) return "Carry the module, or keep it in this host's locker.";
  if (!slot.accepts.includes(module)) return `This socket takes ${slot.accepts.map((m) => MODULES[m].label.toLowerCase()).join(", ")}, not the ${MODULES[module].label.toLowerCase()}.`;
  if (item.containerId === moduleLockerId(item.id)) return "A locker module can't hold itself.";
  takeInstance(s, item.id);
  sys.sockets.push({ hostId, socket: socketId, itemId, kind: item.kind });
  forgetRemembered(sys, itemId);
  syncCarrierSocket(s, host, socketId, carrierOccupantName(socketId, module));
  if (module === "locker" && !s.inventory.containers.some((c) => c.id === moduleLockerId(itemId)))
    s.inventory.containers.push({ id: moduleLockerId(itemId), kind: "locker", capacity: MODULES.locker.lockerCu, ownerId: itemId });
  s.feedback = `${MODULES[module].label} installed at ${host.label}.`;
  return null;
}

/** An installed module leaves every packed kit's remembered layout, so no two
 * places can claim it. */
export function forgetRemembered(sys: SystemsState, itemId: string): void {
  for (const p of sys.packed) p.layout = p.layout.filter((l) => l.itemId !== itemId);
}

/** Removes a module to `to` (default the diver hold). Its running work pauses and
 * travels with it. A locker module must be empty first. */
export function removeModule(s: GameState, sys: SystemsState, hostId: string, socketId: string, to = "diver"): string | null {
  const at = socketFor(s, sys, hostId, socketId);
  if ("refusal" in at) return at.refusal;
  const entry = sys.sockets.find((e) => e.hostId === hostId && e.socket === socketId);
  if (!entry) return at.slot.occupant ? "That fitting belongs to the carrier fit-out." : "That socket is empty.";
  if (moduleOfItem(entry.kind) === "locker" && usedCapacity(s, moduleLockerId(entry.itemId)) > 0)
    return `Empty the locker module first (${usedCapacity(s, moduleLockerId(entry.itemId))} CU inside).`;
  if (to === moduleLockerId(entry.itemId) || !accessible(s, sys, to) || !containerAccepts(s, to, entry.kind))
    return "Choose a reachable container for the module.";
  if (freeCapacity(s, to) < cuOf(entry.kind)) return `${containerLabel(s, to)} needs ${cuOf(entry.kind)} CU free for the module. Nothing removed.`;
  sys.sockets = sys.sockets.filter((e) => e !== entry);
  syncCarrierSocket(s, at.host, socketId, null);
  restoreInstance(s, entry.itemId, entry.kind, to);
  s.feedback = `${labelOf(entry.kind)} removed to ${containerLabel(s, to)}.`;
  return null;
}

/** The Hearthline occupant name a module takes in one of its sockets. */
function carrierOccupantName(socketId: string, module: ModuleKind): string | null {
  return HEARTHLINE_SOCKETS.find((k) => k.id === socketId)?.accepts.find((a) => CARRIER_OCCUPANTS[a] === module) ?? null;
}
/** Install and remove write through to CarrierState.sockets, so the interior
 * solids follow at once and a removal clears exactly the slot it filled. Seeded
 * fittings are never touched: a socket they occupy refuses installs. */
function syncCarrierSocket(s: GameState, host: SocketHost, socketId: string, occupant: string | null): void {
  const d = s.fleet.docking;
  if (host.kind === "carrier" && d && carrierHostId(d.vehicleId) === host.id && Object.hasOwn(d.sockets, socketId)) d.sockets[socketId] = occupant;
}
/** CarrierState.sockets entries the installed SYS-2 modules imply. Install and
 * remove already keep `docking.sockets` in step; this view is for validation,
 * and merging it is idempotent. */
export function carrierOccupants(sys: SystemsState, vehicleId: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of sys.sockets.filter((e) => e.hostId === carrierHostId(vehicleId))) {
    const module = moduleOfItem(e.kind), name = module && carrierOccupantName(e.socket, module);
    if (name) out[e.socket] = name;
  }
  return out;
}
/** Services a host offers now: its built-ins plus every installed module. */
export function hostServices(host: SocketHost): ModuleKind[] {
  return [...new Set([...host.builtIn, ...host.sockets.flatMap((k) => k.occupant?.module ? [k.occupant.module] : [])])];
}
