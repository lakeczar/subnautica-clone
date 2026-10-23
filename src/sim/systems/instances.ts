/** Identity-bearing SYS-2 items. Socket modules and outpost kits carry work and
 * layouts by item ID (decode jobs, crops, packed layouts), so nothing may
 * re-create them under a new ID. The one existing path that does is incapacity:
 * recovery.ts rebuilds dropped diver cargo through addItem. The rule: like the
 * Dart trim and the Creel mounts, these items stay with the diver through
 * incapacity. Composed form: add `!retainsIdentity(i.kind)` to the cargo filter
 * in recovery.ts `incapacitate`; until then `incapacitateKeepingInstances` wraps it. */
import { tierOfKit, moduleOfItem } from "../../content/systems/hosts.js";
import { isDecoderItem } from "./decoder.js";
import { carrierOccupants, hostById } from "./hosts.js";
import { incapacitate } from "../recovery.js";
import type { GameState, WorldQueries } from "../types.js";
import type { SystemsState } from "./state.js";

export const retainsIdentity = (kind: string): boolean => moduleOfItem(kind) !== null || tierOfKit(kind) !== null;

/** The real incapacity rule with SYS-2 identity items held back from the cache. */
export function incapacitateKeepingInstances(s: GameState, reason: string, world?: WorldQueries): void {
  const kept = s.inventory.items.filter((i) => i.containerId === "diver" && retainsIdentity(i.kind));
  for (const i of kept) i.containerId = "sys2:retained-through-incapacity";
  try {
    if (world) incapacitate(s, reason, world);
    else incapacitate(s, reason);
  } finally {
    for (const i of kept) i.containerId = "diver";
  }
}

/** Every installed entry must be serviceable where it sits: its host exists (a
 * disabled carrier still counts; availability is not existence), the socket is
 * one that host exposes to modules, the item is a module the socket accepts,
 * and a Hearthline slot carries the matching CarrierState occupant. Otherwise
 * the module would be stranded: out of the inventory and unremovable. */
export function socketProblems(s: GameState, sys: SystemsState): string[] {
  const problems: string[] = [];
  for (const e of sys.sockets) {
    const at = `module ${e.itemId} in ${e.hostId}/${e.socket}`;
    const module = moduleOfItem(e.kind);
    if (!module) { problems.push(`${at}: ${e.kind} is not a socket module`); continue; }
    const host = hostById(s, sys, e.hostId);
    if (!host) { problems.push(`${at}: the host doesn't exist`); continue; }
    const slot = host.sockets.find((k) => k.id === e.socket);
    if (!slot) { problems.push(`${at}: ${host.label} has no module socket ${e.socket}`); continue; }
    if (!slot.accepts.includes(module)) { problems.push(`${at}: the socket doesn't take the ${module}`); continue; }
    if (host.kind === "carrier") {
      const vehicleId = host.id.slice("carrier:".length), d = s.fleet.docking;
      const expected = carrierOccupants(sys, vehicleId)[e.socket];
      if (d?.vehicleId === vehicleId && d.sockets[e.socket] !== expected)
        problems.push(`${at}: the carrier records ${d.sockets[e.socket] ?? "nothing"} there, not ${expected}`);
    }
  }
  return problems;
}

/** Cross-checks between SYS-2 rows and the inventory, for the composed save
 * validator and tests. Empty when every reference resolves exactly once. */
export function instanceProblems(s: GameState, sys: SystemsState): string[] {
  const problems: string[] = [];
  const items = new Map<string, number>();
  for (const i of s.inventory.items) items.set(i.id, (items.get(i.id) ?? 0) + 1);
  for (const [id, n] of items) if (n > 1) problems.push(`item ${id} appears ${n} times`);
  for (const e of sys.sockets) if (items.has(e.itemId)) problems.push(`installed module ${e.itemId} is also in the inventory`);
  problems.push(...socketProblems(s, sys));
  for (const o of sys.outposts) if (items.has(o.id)) problems.push(`deployed outpost ${o.id} is also a kit item`);
  for (const p of sys.packed) {
    const kit = s.inventory.items.find((i) => i.id === p.itemId);
    if (!kit || tierOfKit(kit.kind) !== p.tier) problems.push(`packed kit ${p.itemId} has no matching ${p.tier} kit item`);
  }
  const where = (id: string): string | null => sys.sockets.find((e) => e.itemId === id)?.kind ?? s.inventory.items.find((i) => i.id === id)?.kind ?? null;
  for (const j of sys.decodes) {
    const kind = where(j.moduleId);
    if (!kind || !isDecoderItem(kind)) problems.push(`decode ${j.decodable} references missing decoder ${j.moduleId}`);
  }
  for (const p of sys.planters) {
    const kind = where(p.moduleId);
    if (!kind || moduleOfItem(kind) !== "planter") problems.push(`crop ${p.seed} references missing planter ${p.moduleId}`);
  }
  for (const t of sys.traps) {
    const kind = where(t.moduleId);
    if (!kind || moduleOfItem(kind) !== "trap") problems.push(`trap catch references missing fish trap ${t.moduleId}`);
  }
  return problems;
}
