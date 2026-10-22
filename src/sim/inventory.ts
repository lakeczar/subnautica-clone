import { CREEL_BUILD_POSE, DART_BUILD_POSE, HULLS, ITEMS, MATERIALS } from "../content/registry.js";
import type { FabricationSite, ItemKind, MaterialId } from "../content/registry.js";
import { CANOPY_STOP } from "../content/routes.js";
import { MOORING_SERVICE_RADIUS, SERVICE_MOORINGS, STOP_IDS, stopForSite, WORKING_STOPS, type WorkingStopId } from "../content/stops.js";
import { HEARTHLINE_CONTAINERS } from "../content/fleet/hearthlineInterior.js";
import type { Fitting, GameState, ItemStack, Vec3, VehicleState } from "./types.js";
import { FIXED_HOSTS, HOST_REACH, moduleOfItem } from "../content/systems/hosts.js";
import { isSys2Item, SYS2_ITEMS } from "../content/systems/items.js";
import { FAUNA_STACKABLE } from "../content/fauna/items.js";
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
export function containerAccepts(s: GameState, id: string, kind: ItemKind): boolean {
  const c = carrierCompartment(s, id);
  return !c || (c.accepts === "food" ? kind === "meal" : Object.hasOwn(MATERIALS, kind) || kind === "tagged_frame");
}
export function usedCapacity(s: GameState, containerId: string): number {
  return s.inventory.items
    .filter((i) => i.containerId === containerId && !i.fitted)
    .reduce((n, i) => n + ITEMS[i.kind].cu * i.quantity, 0);
}
export function hasRoom(
  s: GameState,
  containerId: string,
  cu: number,
): boolean {
  const c = s.inventory.containers.find((c) => c.id === containerId);
  return !!c && usedCapacity(s, containerId) + cu <= c.capacity;
}
export function addItem(
  s: GameState,
  kind: ItemKind,
  quantity: number,
  containerId: string,
  fitted: Fitting = null,
  provenance: ItemStack["provenance"] = "public",
): ItemStack {
  const stack = s.inventory.items.find(
    (i) =>
      i.kind === kind &&
      i.containerId === containerId &&
      i.fitted === fitted &&
      i.provenance === provenance &&
      i.charge === null,
  );
  if (
    stack && ([
      "structural_alloy",
      "silica_glass",
      "flex_membrane",
      "conductive_crust",
      "buoyant_resin",
      "pressure_ceramic",
      "thermal_core",
      "brine_lattice",
      "meal",
      "tagged_frame",
    ].includes(kind) || (isSys2Item(kind) && SYS2_ITEMS[kind].stack) || (FAUNA_STACKABLE as readonly string[]).includes(kind))
  ) {
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
  if (item.quantity === 0)
    s.inventory.items = s.inventory.items.filter((i) => i.id !== item.id);
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
  const stop = STOP_IDS.find((id) => stopWorks(s, id) && distance(v.pose.position, WORKING_STOPS[id].mooring) < WORKING_STOPS[id].serviceRadius);
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
export function containerAccessible(s: GameState, id: string): boolean {
  if (id === "diver" || id === "equipment") return true;
  if (id === "pod_locker") return nearPod(s);
  if (id === "workshop_locker")
    return localBenchSite(s) === "island_workshop";
  if (id === "canopy_stop_locker")
    return localBenchSite(s) === "canopy_stop";
  const stopLocker = STOP_IDS.find((stop) => WORKING_STOPS[stop].locker === id);
  if (stopLocker) return localBenchSite(s) === stopLocker;
  const compartment = carrierCompartment(s, id);
  if (compartment) return s.player.interiorId === compartment.host.id && !compartment.host.disabled;
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
  if (s.inventory.items.some((i) => i.kind === "creel_cabin" && cabinLockerId(i.id) === id)) return "cabin locker";
  const outpost = s.systems.outposts.find((o) => `${o.id}_locker` === id);
  if (outpost) return `${outpost.name} locker`;
  if (s.systems.sockets.some((e) => `${e.itemId}_locker` === id) ||
      s.inventory.items.some((i) => i.kind === "mod_locker" && `${i.id}_locker` === id)) return "locker module";
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
export function spend(
  s: GameState,
  cost: Readonly<Partial<Record<ItemKind, number>>>,
  containers: readonly string[],
): void {
  for (const [kind, n] of Object.entries(cost)) {
    let left = n;
    for (const i of [...s.inventory.items])
      if (
        i.kind === kind &&
        !i.fitted &&
        i.provenance === "public" &&
        containers.includes(i.containerId)
      ) {
        const use = Math.min(left, i.quantity);
        removeQuantity(s, i, use);
        left -= use;
        if (!left) break;
      }
  }
}
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
    const locker = WORKING_STOPS[stop].locker;
    return [
      "diver",
      ...(locker && containerAccessible(s, locker) ? [locker] : []),
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
