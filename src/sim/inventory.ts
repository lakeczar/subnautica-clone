import { DART_BUILD_POSE, HULLS, ITEMS, MATERIALS } from "../content/registry.js";
import type { ItemKind, MaterialId } from "../content/registry.js";
import type { Fitting, GameState, ItemStack, Vec3, VehicleState } from "./types.js";
export const distance = (a: Vec3, b: Vec3): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const nextId = (s: GameState, prefix: string): string =>
  `${prefix}_${++s.sequence}`;
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
    stack &&
    [
      "structural_alloy",
      "silica_glass",
      "flex_membrane",
      "conductive_crust",
      "buoyant_resin",
      "pressure_ceramic",
      "thermal_core",
      "brine_lattice",
      "meal",
    ].includes(kind)
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
    charge: kind === "reserve_cell" ? 100 : null,
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
export function facility(s: GameState, id: string): boolean {
  return s.world.facilities.some((f) => f.id === id && f.repaired);
}
export type ServiceSite = "home_pod" | "island_workshop";
/** Existing cradle positions/radii and service restoration rules, without player access grants. */
export function supportedServiceSite(s: GameState, v: VehicleState): ServiceSite | null {
  if (v.berth || s.fleet.docking?.transaction?.vehicleId === v.id) return null;
  if (distance(v.pose.position, DART_BUILD_POSE) < 12 && facility(s, "island_workshop"))
    return "island_workshop";
  if (distance(v.pose.position, { x: 0, y: -1, z: 8 }) < 12)
    return "home_pod";
  return null;
}
/** A restored bench the diver is actually using, not a nearby/remote craft. */
export function localBenchSite(s: GameState): ServiceSite | null {
  if (s.player.interiorId || s.player.controlledVehicleId) return null;
  if (nearPod(s) && facility(s, "pod_fabricator")) return "home_pod";
  if (nearWorkshop(s) && facility(s, "island_workshop")) return "island_workshop";
  return null;
}
export function containerAccessible(s: GameState, id: string): boolean {
  if (id === "diver" || id === "equipment") return true;
  if (id === "pod_locker") return nearPod(s);
  if (id === "workshop_locker")
    return localBenchSite(s) === "island_workshop";
  if (id === "buoy_hold")
    return (
      s.inventory.buoy.deployed &&
      distance(s.player.pose.position, s.inventory.buoy.position) < 6
    );
  const cache = s.recovery.caches.find((c) => c.containerId === id);
  if (cache) return distance(s.player.pose.position, cache.position) < 4;
  const v = s.fleet.vehicles.find((v) => v.cargoId === id);
  const bench = localBenchSite(s);
  return (
    !!v && !v.berth && s.fleet.docking?.transaction?.vehicleId !== v.id &&
    (v.id === s.player.controlledVehicleId ||
      distance(s.player.pose.position, v.pose.position) < 6 ||
      (bench !== null && bench === supportedServiceSite(s, v)))
  );
}
export function containerLabel(s: GameState, id: string): string {
  const v = s.fleet.vehicles.find((v) => v.cargoId === id);
  if (v) return `${HULLS[v.hull].label} hold`;
  if (id === "diver") return "diver hold";
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
  site: "home_pod" | "pod_fabricator" | "island_workshop",
): string[] {
  const atSite = site === "island_workshop"
    ? nearWorkshop(s) && !s.player.interiorId
    : nearPod(s);
  if (!atSite) return [];
  const serviceSite = site === "island_workshop" ? "island_workshop" : "home_pod";
  return [
    "diver",
    ...(site === "island_workshop"
      ? (containerAccessible(s, "workshop_locker") ? ["workshop_locker"] : [])
      : ["pod_locker"]),
    ...(containerAccessible(s, "buoy_hold") ? ["buoy_hold"] : []),
    ...s.fleet.vehicles.filter((v) => supportedServiceSite(s, v) === serviceSite &&
      containerAccessible(s, v.cargoId)).map((v) => v.cargoId),
  ];
}
