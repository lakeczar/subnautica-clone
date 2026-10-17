import { ITEMS } from "../content/registry.js";
import type { ItemKind } from "../content/registry.js";
import type { Fitting, GameState, ItemStack, Vec3 } from "./types.js";
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
export function containerAccessible(s: GameState, id: string): boolean {
  if (id === "diver" || id === "equipment") return true;
  if (id === "pod_locker") return nearPod(s);
  if (id === "workshop_locker")
    return nearWorkshop(s) && facility(s, "island_workshop");
  if (id === "buoy_hold")
    return (
      s.inventory.buoy.deployed &&
      distance(s.player.pose.position, s.inventory.buoy.position) < 6
    );
  const cache = s.recovery.caches.find((c) => c.containerId === id);
  if (cache) return distance(s.player.pose.position, cache.position) < 4;
  const v = s.fleet.vehicles.find((v) => v.cargoId === id);
  return (
    !!v &&
    (v.id === s.player.controlledVehicleId ||
      (distance(s.player.pose.position, v.pose.position) < 6 && !v.berth))
  );
}
export function transfer(
  s: GameState,
  itemId: string,
  to: string,
  quantity: number,
): string | null {
  const i = s.inventory.items.find((i) => i.id === itemId);
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
  return [
    "diver",
    site === "island_workshop" ? "workshop_locker" : "pod_locker",
    ...(containerAccessible(s, "buoy_hold") ? ["buoy_hold"] : []),
  ];
}
