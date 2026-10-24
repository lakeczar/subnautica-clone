/** Cargo moved by identity through physical interfaces. A cargo is a set of item
 * instances (assemblies: one ID each, never stacked) plus material quantities. Every
 * move first checks that the game itself reports both containers locally
 * accessible, so the harness never attempts a remote transfer; a lost item (not
 * where the ledger says) is reported as a harness error at once. */
import { containerAccessible, cuOf, itemCu } from "../../src/sim/inventory.js";
import { reach } from "./actions.js";
import { carrier, enterCarrier, exitCarrier } from "./carrierplay.js";
import { Blocked, Driver, where } from "./driver.js";

export interface Cargo {
  /** Item instance IDs (assemblies). */
  readonly ids: readonly string[];
  /** Material quantities by kind. */
  readonly stock: Readonly<Record<string, number>>;
}
export const cargoCu = (d: Driver, c: Cargo): number =>
  c.ids.reduce((n, id) => n + itemCu(itemOf(d, id)), 0) +
  Object.entries(c.stock).reduce((n, [k, q]) => n + cuOf(k) * q, 0);

function itemOf(d: Driver, id: string) {
  const i = d.state.inventory.items.find((x) => x.id === id);
  if (!i) throw new Error(`harness: cargo item ${id} no longer exists`);
  return i;
}
/** Where a cargo's tracked items are now. */
export const whereIs = (d: Driver, id: string): string => itemOf(d, id).containerId;

function requireInterface(d: Driver, from: string, to: string): void {
  if (!containerAccessible(d.state, from) || !containerAccessible(d.state, to))
    throw new Error(`harness: no physical interface between ${from} and ${to} here (${where(d.state)})`);
}
/** Move a cargo into `to`: tracked items from wherever they are (each must be
 * accessible), materials from `from`. Refusals are game findings. */
export function moveCargo(d: Driver, c: Cargo, from: string, to: string): void {
  for (const id of c.ids) {
    const at = whereIs(d, id);
    if (at === to) continue;
    requireInterface(d, at, to);
    d.command({ type: "transfer", itemId: id, to, quantity: itemOf(d, id).quantity });
    if (whereIs(d, id) !== to) throw new Error(`harness: ${id} did not reach ${to}`);
  }
  for (const [kind, n] of Object.entries(c.stock)) {
    let left = n;
    if (left <= 0) continue;
    requireInterface(d, from, to);
    for (const i of [...d.state.inventory.items].filter((x) => x.containerId === from && x.kind === kind && !x.fitted)) {
      if (left <= 0) break;
      const q = Math.min(left, i.quantity);
      d.command({ type: "transfer", itemId: i.id, to, quantity: q });
      left -= q;
    }
    if (left > 0) throw new Blocked(`${from} lacks ${left} ${kind} for this cargo`, where(d.state));
  }
}

/** Split a cargo into loads of at most `cu`: tracked items whole, materials by unit. */
export function loads(d: Driver, c: Cargo, cu: number): Cargo[] {
  const out: { ids: string[]; stock: Record<string, number> }[] = [];
  let cur = { ids: [] as string[], stock: {} as Record<string, number> }, used = 0;
  const flush = (): void => { if (cur.ids.length || Object.keys(cur.stock).length) out.push(cur); cur = { ids: [], stock: {} }; used = 0; };
  for (const id of c.ids) {
    const size = itemCu(itemOf(d, id));
    if (size > cu) throw new Blocked(`Item ${id} (${size} CU) exceeds a ${cu} CU load`, where(d.state));
    if (used + size > cu) flush();
    cur.ids.push(id); used += size;
  }
  for (const [kind, n] of Object.entries(c.stock)) {
    const unit = cuOf(kind);
    for (let q = 0; q < n; q++) {
      if (used + unit > cu) flush();
      cur.stock[kind] = (cur.stock[kind] ?? 0) + 1; used += unit;
    }
  }
  flush();
  return out;
}

/** From a craft moored near the carrier into its stores, a diver load at a time:
 * beside the craft (its hold is local), through the vestibule, into the stores. */
export function ferryToCarrier(d: Driver, fromVehicleId: string, c: Cargo): void {
  const h = carrier(d);
  for (const load of loads(d, c, d.freeCu("diver"))) {
    const v = d.state.fleet.vehicles.find((x) => x.id === fromVehicleId)!;
    reach(d, v.id);
    moveCargo(d, load, v.cargoId, "diver");
    enterCarrier(d);
    moveCargo(d, load, "diver", h.cargoId);
    exitCarrier(d);
  }
}
/** From the carrier stores to a craft outside (a launched Mantle), a diver load at
 * a time; starts and ends inside the carrier. */
export function ferryFromCarrier(d: Driver, toVehicleId: string, c: Cargo): void {
  const h = carrier(d);
  if (d.state.player.interiorId !== h.id) throw new Error("harness: ferryFromCarrier starts inside the carrier");
  for (const load of loads(d, c, d.freeCu("diver"))) {
    moveCargo(d, load, h.cargoId, "diver");
    exitCarrier(d);
    const v = d.state.fleet.vehicles.find((x) => x.id === toVehicleId)!;
    reach(d, v.id);
    moveCargo(d, load, "diver", v.cargoId);
    enterCarrier(d);
  }
}
