/** The one inventory authority (SIG-1 stage 0, steward F12): item sizes and
 * labels, container capacity, stacking, adding, removing and spending.
 * - **Spending** is a detached plan (`planSpend`) applied whole or not at all
 *   (`applySpend`), so a preview and its command share one rule. Spend priority
 *   is explicit (`SpendPriority`).
 * - **Removing:** `removeQuantity` takes part of a stack; `takeInstance` lifts
 *   one chosen item out whole, keeping its ID and charge (a cell fed to a hull,
 *   a module socketed, a kit deployed); `restoreInstance` puts one back.
 * - **Capacity:** `usedCapacity`, `freeCapacity` and `hasRoom` are the only CU
 *   totals; everything else reads them or the size primitives (`cuOf`, `itemCu`). */
import { CREEL_BUILD_POSE, DART_BUILD_POSE, HULLS, ITEMS, MATERIALS } from "../content/registry.js";
import type { FabricationSite, ItemKind, MaterialId } from "../content/registry.js";
import { CANOPY_STOP } from "../content/routes.js";
import { MOORING_SERVICE_RADIUS, SERVICE_MOORINGS, STOP_IDS, stopForSite, WORKING_STOPS, type WorkingStop, type WorkingStopId } from "../content/stops.js";
import { HEARTHLINE_CONTAINERS } from "../content/fleet/hearthlineInterior.js";
import type { Fitting, GameState, ItemStack, Vec3, VehicleState } from "./types.js";
import { FIXED_HOSTS, HOST_REACH, moduleOfItem } from "../content/systems/hosts.js";
import { stackable } from "../content/systems/items.js";
import { LOST_SITE_CACHES } from "../content/systems/lostSites.js";
import { SITE_CACHE_REACH, siteCacheOf } from "./systems/siteCaches.js";
/** A beached Spindle's ramp reaches this far up the shore (C4). */
export const SHORE_RAMP_REACH = 10;
export const distance = (a: Vec3, b: Vec3): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const nextId = (s: GameState, prefix: string): string =>
  `${prefix}_${++s.sequence}`;
/** Hearthline's hold beside its stores (the hull's own cargo container): named
 * compartments, each a locker owned by the carrier that accepts one class of item. */
export const CARRIER_COMPARTMENTS = HEARTHLINE_CONTAINERS.filter((c) => c.accepts !== "any")
  .map((c) => ({ suffix: c.id.slice(c.id.indexOf(".") + 1), capacity: c.capacityCu, accepts: c.accepts as "food" | "fabrication" }));
export const compartmentId = (carrierId: string, suffix: string): string => `${carrierId}_${suffix}`;
export function carrierCompartment(s: GameState, id: string): { host: VehicleState; accepts: "food" | "fabrication" } | null {
  const c = s.inventory.containers.find((c) => c.id === id && c.kind === "locker");
  const host = c && s.fleet.vehicles.find((v) => v.id === c.ownerId && v.hull === "hearthline");
  const spec = host && CARRIER_COMPARTMENTS.find((k) => compartmentId(host.id, k.suffix) === id);
  return host && spec ? { host, accepts: spec.accepts } : null;
}
/** Pantry: meals. Fabrication: materials and tagged frames. Every other container takes anything. */
export function containerAccepts(s: GameState, id: string, kind: string): boolean {
  const c = carrierCompartment(s, id);
  return !c || (c.accepts === "food" ? kind === "meal" : Object.hasOwn(MATERIALS, kind) || kind === "tagged_frame");
}
/** Carried size of one unit. An unknown kind weighs Infinity, so any room check fails closed. */
export const cuOf = (kind: string): number => Object.hasOwn(ITEMS, kind) ? ITEMS[kind as ItemKind].cu : Infinity;
export const labelOf = (kind: string): string => Object.hasOwn(ITEMS, kind) ? ITEMS[kind as ItemKind].label : kind;
export const itemCu = (i: Pick<ItemStack, "kind" | "quantity">): number => cuOf(i.kind) * i.quantity;
export function usedCapacity(s: GameState, containerId: string): number {
  let n = 0;
  for (const i of s.inventory.items) if (i.containerId === containerId && !i.fitted) n += itemCu(i);
  return n;
}
/** Room left in a container; a missing container has none. */
export function freeCapacity(s: GameState, containerId: string): number {
  const c = s.inventory.containers.find((c) => c.id === containerId);
  return c ? c.capacity - usedCapacity(s, containerId) : 0;
}
export function hasRoom(
  s: GameState,
  containerId: string,
  cu: number,
): boolean {
  const c = s.inventory.containers.find((c) => c.id === containerId);
  return !!c && usedCapacity(s, containerId) + cu <= c.capacity;
}
/** Adds to a matching stack for stackable kinds (same container, fitting and
 * provenance, uncharged), otherwise a new instance. Cells start charged. */
export function addItem(
  s: GameState,
  kind: ItemKind,
  quantity: number,
  containerId: string,
  fitted: Fitting = null,
  provenance: ItemStack["provenance"] = "public",
): ItemStack {
  const stack = stackable(kind, MATERIALS) && s.inventory.items.find(
    (i) =>
      i.kind === kind &&
      i.containerId === containerId &&
      i.fitted === fitted &&
      i.provenance === provenance &&
      i.charge === null,
  );
  if (stack) {
    stack.quantity += quantity;
    return stack;
  }
  const item: ItemStack = {
    id: nextId(s, "item"),
    kind,
    quantity,
    containerId,
    fitted,
    charge: kind === "reserve_cell" || kind === "bio_cell" ? 100 : null,
    provenance,
  };
  s.inventory.items.push(item);
  return item;
}
export function removeQuantity(s: GameState, item: ItemStack, n: number): void {
  item.quantity -= n;
  if (item.quantity <= 0)
    s.inventory.items = s.inventory.items.filter((i) => i.id !== item.id);
}
/** Lifts one chosen item out of the inventory whole, keeping its ID, charge and
 * provenance for its new owner (a hull's bio feed, a socket, a deployed outpost).
 * Null when no such item exists; nothing changes then. */
export function takeInstance(s: GameState, itemId: string): ItemStack | null {
  const item = s.inventory.items.find((i) => i.id === itemId);
  if (!item) return null;
  s.inventory.items = s.inventory.items.filter((i) => i !== item);
  return item;
}
/** Puts back one single-instance item (a module or kit) under its original ID. */
export function restoreInstance(s: GameState, itemId: string, kind: string, containerId: string): ItemStack {
  const item: ItemStack = { id: itemId, kind: kind as ItemKind, quantity: 1, containerId, fitted: null, charge: null, provenance: "public" };
  s.inventory.items.push(item);
  return item;
}
export const equipped = (s: GameState, kind: ItemKind): boolean =>
  s.inventory.items.some((i) => i.kind === kind && i.fitted !== null);
export function nearPod(s: GameState): boolean {
  const p = s.player.pose.position;
  return (
    p.x > -3 &&
    p.x < 3 &&
    p.z > 10 &&
    p.z < 24.1 &&
    p.y >= 0.1 &&
    p.y < 3.7 &&
    !s.player.controlledVehicleId &&
    !s.player.interiorId
  );
}
export function nearWorkshop(s: GameState): boolean {
  const p = s.player.pose.position;
  return (
    p.x > 2 &&
    p.x < 17 &&
    p.z > -41 &&
    p.z < -30 &&
    p.y >= 1 &&
    p.y < 5 &&
    !s.player.controlledVehicleId
  );
}
export function inCanopyAir(s: GameState): boolean {
  const p = s.player.pose.position;
  return (
    p.x > 111.4 &&
    p.x < 120.6 &&
    p.z > -129.6 &&
    p.z < -122.4 &&
    p.y >= -118.1 &&
    p.y < -114.5 &&
    !s.player.controlledVehicleId
  );
}
/** Diver at the outer-crown mooring's deck work face (restored or not). */
export function nearCanopyStop(s: GameState): boolean {
  return distance(s.player.pose.position, CANOPY_STOP.work) < 3.5 &&
    !s.player.controlledVehicleId && !s.player.interiorId;
}
export function facility(s: GameState, id: string): boolean {
  return s.world.facilities.some((f) => f.id === id && f.repaired);
}
export type ServiceSite = "home_pod" | "island_workshop" | "canopy_stop" | WorkingStopId | `mooring:${string}`;
/** A working stop is usable: it needs no restoration, or it has been restored. */
export function stopWorks(s: GameState, id: WorkingStopId): boolean {
  const f = WORKING_STOPS[id].facility;
  return f === null || facility(s, f);
}
/** A working stop serves moored craft: it works and, for a staged stop, its
 * dock stage is restored too (HUB-2, Sol W2-03: the crown's power-and-air
 * stage must not open service, mounts, refits or moored holds). */
export function stopServes(s: GameState, id: WorkingStopId): boolean {
  const dock = (WORKING_STOPS[id] as WorkingStop).dock;
  return stopWorks(s, id) && (dock === undefined || facility(s, dock));
}
/** The diver is at a working stop's work pose, on foot or swimming. */
export function nearStop(s: GameState, id: WorkingStopId): boolean {
  const stop = WORKING_STOPS[id];
  return distance(s.player.pose.position, stop.work) < stop.workRadius &&
    !s.player.controlledVehicleId && !s.player.interiorId;
}
/** A working stop with air the diver is breathing at (a refuge). */
export function atAirStop(s: GameState): WorkingStopId | null {
  return STOP_IDS.find((id) => WORKING_STOPS[id].air && nearStop(s, id) && stopWorks(s, id)) ?? null;
}
/** Cradle/mooring positions and service restoration rules, without player access grants.
 * The workshop serves both its scout cradle and the medium slip. */
export function supportedServiceSite(s: GameState, v: VehicleState): ServiceSite | null {
  if (v.berth || s.fleet.docking?.transaction?.vehicleId === v.id) return null;
  if ((distance(v.pose.position, DART_BUILD_POSE) < 12 || distance(v.pose.position, CREEL_BUILD_POSE) < 12) &&
      facility(s, "island_workshop"))
    return "island_workshop";
  if (distance(v.pose.position, { x: 0, y: -1, z: 8 }) < 12)
    return "home_pod";
  if (distance(v.pose.position, CANOPY_STOP.mooring) < CANOPY_STOP.serviceRadius && facility(s, "canopy_stop"))
    return "canopy_stop";
  const stop = STOP_IDS.find((id) => stopServes(s, id) && distance(v.pose.position, WORKING_STOPS[id].mooring) < WORKING_STOPS[id].serviceRadius);
  if (stop) return stop;
  const mooring = SERVICE_MOORINGS.find((m) => distance(v.pose.position, m.position) < MOORING_SERVICE_RADIUS);
  return mooring ? `mooring:${mooring.id}` : null;
}
/** A restored bench the diver is actually using, not a nearby/remote craft. */
export function localBenchSite(s: GameState): Exclude<ServiceSite, `mooring:${string}`> | null {
  if (s.player.interiorId || s.player.controlledVehicleId) return null;
  if (nearPod(s) && facility(s, "pod_fabricator")) return "home_pod";
  if (nearWorkshop(s) && facility(s, "island_workshop")) return "island_workshop";
  if (nearCanopyStop(s) && facility(s, "canopy_stop")) return "canopy_stop";
  return STOP_IDS.find((id) => nearStop(s, id) && stopWorks(s, id)) ?? null;
}
/** The cabin locker container belongs to its cabin item, wherever that item is. */
export const cabinLockerId = (cabinItemId: string): string => `${cabinItemId}_locker`;
/** SIG-1: the Creel cargo pod's own container belongs to its pod item, as the cabin's locker does. */
export const podContainerId = (podItemId: string): string => `${podItemId}_pod`;
/** The pod item a container belongs to, if it is a pod's. */
const podOf = (s: GameState, id: string): ItemStack | undefined => id.endsWith("_pod")
  ? s.inventory.items.find((i) => i.kind === "creel_drop_pod" && podContainerId(i.id) === id) : undefined;
/** A pod is reached aboard its Creel like the hold, or within this reach once dropped. */
const POD_REACH = 8;
function podAccessible(s: GameState, pod: ItemStack): boolean {
  const creel = s.fleet.vehicles.find((v) => v.modules.includes(pod.id));
  if (!creel) return false; // A pod off its socket is folded shut; its contents wait inside.
  const out = creel.upgrades.pod;
  if (!out) return containerAccessible(s, creel.cargoId);
  const at = s.player.controlledVehicleId ? s.fleet.vehicles.find((v) => v.id === s.player.controlledVehicleId)?.pose.position : s.player.pose.position;
  return !s.player.interiorId && !!at && distance(at, out.position) <= POD_REACH;
}
export function containerAccessible(s: GameState, id: string): boolean {
  if (id === "diver" || id === "equipment") return true;
  if (id === "pod_locker") return nearPod(s);
  if (id === "workshop_locker")
    return localBenchSite(s) === "island_workshop";
  if (id === "canopy_stop_locker")
    return localBenchSite(s) === "canopy_stop";
  const stopLocker = STOP_IDS.find((stop) => WORKING_STOPS[stop].locker === id);
  if (stopLocker) return localBenchSite(s) === stopLocker;
  // A staged stop's extra stores open with its dock stage, at its door.
  const storeOf = STOP_IDS.find((stop) => (WORKING_STOPS[stop] as WorkingStop).stores?.includes(id));
  if (storeOf) return localBenchSite(s) === storeOf && stopServes(s, storeOf);
  const compartment = carrierCompartment(s, id);
  if (compartment) return s.player.interiorId === compartment.host.id && !compartment.host.disabled;
  const pod = podOf(s, id);
  if (pod) return podAccessible(s, pod);
  // C4 (SYS-2): an outpost's locker at that outpost; a locker module's container
  // only where the module is installed and its host works.
  const onFoot = !s.player.controlledVehicleId && !s.player.interiorId;
  const outpost = s.systems.outposts.find((o) => `${o.id}_locker` === id);
  if (outpost) return onFoot && distance(s.player.pose.position, outpost.position) <= HOST_REACH;
  const moduleOwner = s.inventory.containers.find((c) => c.id === id && c.kind === "locker" && moduleOfItem(
    s.inventory.items.find((i) => i.id === c.ownerId)?.kind ?? "") === "locker");
  if (moduleOwner || s.systems.sockets.some((e) => `${e.itemId}_locker` === id)) {
    const entry = s.systems.sockets.find((e) => `${e.itemId}_locker` === id);
    if (!entry) return false;
    if (entry.hostId.startsWith("carrier:")) return s.player.interiorId === entry.hostId.slice(8);
    const fixed = FIXED_HOSTS[entry.hostId as keyof typeof FIXED_HOSTS];
    if (fixed) return onFoot && (fixed.facility === null || facility(s, fixed.facility)) && distance(s.player.pose.position, fixed.position) <= 8;
    const host = s.systems.outposts.find((o) => o.id === entry.hostId);
    return !!host && onFoot && distance(s.player.pose.position, host.position) <= HOST_REACH;
  }
  const locker = s.inventory.containers.find((c) => c.id === id && c.kind === "locker" && c.ownerId !== "home_pod" &&
    c.ownerId !== "island_workshop" && c.ownerId !== "canopy_stop" && !(STOP_IDS as readonly string[]).includes(c.ownerId));
  if (locker) {
    // A cabin locker opens only while its cabin is fitted: inside it, or at its hatch.
    const host = s.fleet.vehicles.find((v) => v.modules.includes(locker.ownerId));
    return !!host && !host.berth && (s.player.interiorId === host.id ||
      (!s.player.controlledVehicleId && !s.player.interiorId && distance(s.player.pose.position, host.pose.position) < 6));
  }
  if (id === "buoy_hold")
    return (
      s.inventory.buoy.deployed &&
      distance(s.player.pose.position, s.inventory.buoy.position) < 6
    );
  const cache = s.recovery.caches.find((c) => c.containerId === id);
  if (cache) return distance(s.player.pose.position, cache.position) < 4;
  // LS-1: a lost site's finite cache opens within reach of its point.
  const site = siteCacheOf(id);
  if (site) return distance(s.player.pose.position, LOST_SITE_CACHES[site].position) < SITE_CACHE_REACH;
  const v = s.fleet.vehicles.find((v) => v.cargoId === id);
  // A berthed craft's hold opens from inside its carrier (the dry berth room).
  if (v?.berth && s.player.interiorId === v.berth.carrierId && s.fleet.docking?.transaction?.vehicleId !== v.id) return true;
  const bench = localBenchSite(s);
  // C4: a beached Spindle with a shore ramp loads from the shore itself.
  if (v?.hull === "spindle" && !v.berth && onFoot && s.player.pose.position.y > 0 &&
      v.modules.some((m) => s.inventory.items.find((i) => i.id === m)?.kind === "spindle_shore_ramp") &&
      distance(s.player.pose.position, v.pose.position) < SHORE_RAMP_REACH) return true;
  return (
    !!v && !v.berth && s.fleet.docking?.transaction?.vehicleId !== v.id &&
    (v.id === s.player.controlledVehicleId || v.id === s.player.interiorId ||
      distance(s.player.pose.position, v.pose.position) < 6 ||
      (bench !== null && bench === supportedServiceSite(s, v)))
  );
}
export function containerLabel(s: GameState, id: string): string {
  const v = s.fleet.vehicles.find((v) => v.cargoId === id);
  if (v) return `${HULLS[v.hull].label} ${v.hull === "hearthline" ? "stores" : "hold"}`;
  const compartment = carrierCompartment(s, id);
  if (compartment) return `${HULLS.hearthline.label} ${compartment.accepts === "food" ? "pantry" : "fabrication locker"}`;
  if (id === "diver") return "diver hold";
  if (id === "canopy_stop_locker") return "mooring locker";
  const stopLocker = STOP_IDS.find((stop) => WORKING_STOPS[stop].locker === id);
  if (stopLocker) return stopLocker === "stack_yard" ? "yard store" : `${WORKING_STOPS[stopLocker].label} locker`;
  const storeOf = STOP_IDS.find((stop) => (WORKING_STOPS[stop] as WorkingStop).stores?.includes(id));
  if (storeOf) return `${WORKING_STOPS[storeOf].label} store ${((WORKING_STOPS[storeOf] as WorkingStop).stores!.indexOf(id) + 1)}`;
  if (s.inventory.items.some((i) => i.kind === "creel_cabin" && cabinLockerId(i.id) === id)) return "cabin locker";
  if (podOf(s, id)) return "cargo pod";
  const outpost = s.systems.outposts.find((o) => `${o.id}_locker` === id);
  if (outpost) return `${outpost.name} locker`;
  if (s.systems.sockets.some((e) => `${e.itemId}_locker` === id) ||
      s.inventory.items.some((i) => i.kind === "mod_locker" && `${i.id}_locker` === id)) return "locker module";
  const site = siteCacheOf(id);
  if (site) return LOST_SITE_CACHES[site].label.toLowerCase();
  if (s.inventory.containers.find((c) => c.id === id)?.kind === "cache") return "cargo cache";
  return id.replaceAll("_", " ");
}
export interface MaterialStoragePreview {
  from: string;
  to: string;
  destination: string;
  items: { id: string; kind: MaterialId; quantity: number }[];
  quantities: Partial<Record<MaterialId, number>>;
  totalCu: number;
  refusal: string | null;
}
/** Detached read-only transaction description; the command uses this exact set and refusal. */
export function materialStoragePreview(s: GameState, from: string, to: string): MaterialStoragePreview {
  const installed = new Set(s.fleet.vehicles.flatMap((v) => v.modules));
  const items = s.inventory.items.filter((i) =>
    i.containerId === from && !i.fitted && i.provenance === "public" &&
    Object.hasOwn(MATERIALS, i.kind) && !installed.has(i.id),
  ).map((i) => ({ id: i.id, kind: i.kind as MaterialId, quantity: i.quantity }));
  const quantities: MaterialStoragePreview["quantities"] = {};
  for (const i of items) quantities[i.kind] = (quantities[i.kind] ?? 0) + i.quantity;
  const totalCu = items.reduce((n, i) => n + ITEMS[i.kind].cu * i.quantity, 0);
  const source = s.inventory.containers.find((c) => c.id === from);
  const destination = s.inventory.containers.find((c) => c.id === to);
  const refusal = !source || !destination || from === to ||
      source.kind === "equipment" || destination.kind === "equipment" ||
      !containerAccessible(s, from) || !containerAccessible(s, to)
    ? "Choose two distinct, locally accessible cargo containers. Equipment cannot be stored."
    : !items.length
      ? "No public material stacks in the source. Meals, cells, tools and modules stay with their container."
      : !containerAccepts(s, to, items[0]!.kind)
        ? `${containerLabel(s, to)} holds meals only.`
      : !hasRoom(s, to, totalCu)
        ? `The destination needs ${totalCu} CU for all these materials. Nothing moved.`
        : null;
  return { from, to, destination: containerLabel(s, to), items, quantities, totalCu, refusal };
}
export function storeMaterials(s: GameState, from: string, to: string): string | null {
  const preview = materialStoragePreview(s, from, to);
  if (preview.refusal) return preview.refusal;
  const ids = new Set(preview.items.map((i) => i.id));
  for (const i of s.inventory.items) if (ids.has(i.id)) i.containerId = to;
  s.feedback = `Stored ${Object.entries(preview.quantities).map(([k, n]) =>
    `${n} × ${ITEMS[k as MaterialId].label}`).join(", ")} in ${preview.destination} (${preview.totalCu} CU).`;
  return null;
}
export function transfer(
  s: GameState,
  itemId: string,
  to: string,
  quantity: number,
): string | null {
  const i = s.inventory.items.find((i) => i.id === itemId);
  if (i && s.fleet.vehicles.some((v) => v.modules.includes(i.id)))
    return "Remove this installed module at a supported cradle or eligible local disabled-hull collar before transferring it.";
  if (
    !i ||
    i.fitted ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > i.quantity
  )
    return "Choose an ordinary carried item and a valid quantity.";
  if (
    i.containerId === to ||
    to === "equipment" ||
    !containerAccessible(s, i.containerId) ||
    !containerAccessible(s, to)
  )
    return "Both containers must be present and accessible.";
  if (!containerAccepts(s, to, i.kind))
    return `${containerLabel(s, to)} does not take ${ITEMS[i.kind].label.toLowerCase()}.`;
  if (!hasRoom(s, to, ITEMS[i.kind].cu * quantity))
    return "The destination is full. Nothing moved.";
  if (quantity === i.quantity) i.containerId = to;
  else {
    removeQuantity(s, i, quantity);
    addItem(s, i.kind, quantity, to, null, i.provenance);
  }
  return null;
}
/** One stack's share of a spend. */
export interface SpendLine { itemId: string; kind: string; quantity: number; from: string }
export interface SpendPlan { lines: SpendLine[]; missing: Record<string, number> }
/** Which stacks a spend draws first, among the public, unfitted stacks in `containers`:
 * - `listed`: container by container in the order given (systems, outposts, fauna:
 *   each caller lists its own priority, such as the diver before a locker);
 * - `oldest`: the oldest stack first, wherever it sits among the containers (the
 *   fabricator benches and story repairs, B1's accepted bench rule). */
export type SpendPriority = "listed" | "oldest";
const spendable = (i: ItemStack, kind: string): boolean => i.kind === kind && !i.fitted && i.provenance === "public";
/** A detached plan to pay `cost` from `containers`; `missing` lists any shortfall.
 * Nothing changes until `applySpend`, so previews and refusals read the same plan. */
export function planSpend(s: Readonly<GameState>, cost: Readonly<Record<string, number | undefined>>,
  containers: readonly string[], priority: SpendPriority = "listed"): SpendPlan {
  const lines: SpendLine[] = [], missing: Record<string, number> = {};
  const take = (i: ItemStack, left: number): number => {
    const use = Math.min(left, i.quantity);
    lines.push({ itemId: i.id, kind: i.kind, quantity: use, from: i.containerId });
    return left - use;
  };
  for (const [kind, need] of Object.entries(cost)) {
    let left = need ?? 0;
    if (priority === "oldest") {
      for (const i of s.inventory.items)
        if (left > 0 && spendable(i, kind) && containers.includes(i.containerId)) left = take(i, left);
    } else
      for (const c of containers)
        for (const i of s.inventory.items)
          if (left > 0 && spendable(i, kind) && i.containerId === c) left = take(i, left);
    if (left > 0) missing[kind] = left;
  }
  return { lines, missing };
}
/** A plan that cannot be applied: a shortfall, or lines that no longer match the inventory. */
export class SpendRefused extends Error {
  constructor(readonly reason: "missing" | "stale", readonly detail: Readonly<Record<string, number>> | string) {
    super(`spend refused (${reason}): ${typeof detail === "string" ? detail : costText(detail)}`);
  }
}
/** Applies a complete plan, all or nothing. An incomplete plan (any `missing`)
 * or a stale one (a line whose stack is gone, changed, or short) is refused
 * before anything is written. Callers refuse a shortfall themselves first, so a
 * `SpendRefused` here is a logic error, never a partial payment. */
export function applySpend(s: GameState, plan: Readonly<SpendPlan>): void {
  if (Object.keys(plan.missing).length) throw new SpendRefused("missing", plan.missing);
  const left = new Map<string, number>();
  for (const l of plan.lines) {
    const i = s.inventory.items.find((x) => x.id === l.itemId);
    const have = left.get(l.itemId) ?? i?.quantity ?? 0;
    if (!i || i.kind !== l.kind || i.containerId !== l.from || !spendable(i, l.kind) || !(l.quantity > 0) || have < l.quantity)
      throw new SpendRefused("stale", l.itemId);
    left.set(l.itemId, have - l.quantity);
  }
  for (const l of plan.lines) removeQuantity(s, s.inventory.items.find((i) => i.id === l.itemId)!, l.quantity);
}
/** CU a plan frees in one container. */
export const freedBy = (plan: Pick<SpendPlan, "lines">, containerId: string): number =>
  plan.lines.reduce((n, l) => l.from === containerId ? n + cuOf(l.kind) * l.quantity : n, 0);
/** `hasRoom` as it will be once `plan` is applied. */
export const hasRoomAfter = (s: GameState, plan: Pick<SpendPlan, "lines">, containerId: string, cu: number): boolean =>
  hasRoom(s, containerId, cu - freedBy(plan, containerId));
export const costText = (cost: Readonly<Record<string, number | undefined>>): string =>
  Object.entries(cost).map(([k, n]) => `${n} × ${labelOf(k)}`).join(", ");
export function available(
  s: GameState,
  kind: ItemKind,
  containers: readonly string[],
): number {
  return s.inventory.items
    .filter(
      (i) =>
        i.kind === kind &&
        !i.fitted &&
        i.provenance === "public" &&
        containers.includes(i.containerId),
    )
    .reduce((n, i) => n + i.quantity, 0);
}
export function fabricationContainers(
  s: GameState,
  site: FabricationSite | WorkingStopId,
): string[] {
  const stop = stopForSite(site);
  if (stop) {
    if (!nearStop(s, stop)) return [];
    const locker = WORKING_STOPS[stop].locker, stores = (WORKING_STOPS[stop] as WorkingStop).stores ?? [];
    return [
      "diver",
      ...(locker && containerAccessible(s, locker) ? [locker] : []),
      ...stores.filter((c) => containerAccessible(s, c)),
      ...(containerAccessible(s, "buoy_hold") ? ["buoy_hold"] : []),
      ...s.fleet.vehicles.filter((v) => supportedServiceSite(s, v) === stop && containerAccessible(s, v.cargoId)).map((v) => v.cargoId),
    ];
  }
  const atSite = site === "island_workshop"
    ? nearWorkshop(s) && !s.player.interiorId
    : site === "canopy_stop" ? nearCanopyStop(s) : nearPod(s);
  if (!atSite) return [];
  const serviceSite: ServiceSite = site === "island_workshop" || site === "canopy_stop" ? site : "home_pod";
  return [
    "diver",
    ...(site === "island_workshop"
      ? (containerAccessible(s, "workshop_locker") ? ["workshop_locker"] : [])
      : site === "canopy_stop"
        ? (containerAccessible(s, "canopy_stop_locker") ? ["canopy_stop_locker"] : [])
        : ["pod_locker"]),
    ...(containerAccessible(s, "buoy_hold") ? ["buoy_hold"] : []),
    ...s.fleet.vehicles.filter((v) => supportedServiceSite(s, v) === serviceSite &&
      containerAccessible(s, v.cargoId)).map((v) => v.cargoId),
  ];
}
