import { ITEMS, MODULES, isMountKind } from "../content/registry.js";
import type { ModuleKind, MountKind } from "../content/registry.js";
import type { GameState, ItemStack, VehicleState, WorldQueries } from "./types.js";
import { cabinLockerId, containerAccessible, containerLabel, distance, equipped, hasRoom, supportedServiceSite, usedCapacity } from "./inventory.js";
import { personalLimit } from "./progression.js";
import { fittedMount, holdCapacity, mountLabel } from "./fleet.js";

export const SMALL_CRAFT_SOCKETS = 2;
/** An intact, ordinary module instance. Socket modules are never fitted; a mount
 * package is either stowed (null) or fitted on a Creel's major mount ("mount"). */
export function moduleItem(item: ItemStack): item is ItemStack & { kind: ModuleKind } {
  return Object.hasOwn(MODULES, item.kind) && item.quantity === 1 &&
    item.provenance === "public" && item.charge === null &&
    (item.fitted === null || (item.fitted === "mount" && isMountKind(item.kind)));
}
/** Socket modules remain capacity-counted hold items; a mount is fitted in that hold. */
export function installedModuleValid(s: GameState, v: VehicleState, itemId: string): boolean {
  const item = s.inventory.items.find((i) => i.id === itemId);
  return v.modules.includes(itemId) && !!item && moduleItem(item) && MODULES[item.kind].hull === v.hull &&
    item.containerId === v.cargoId && (MODULES[item.kind].slot === "mount") === (item.fitted === "mount");
}
export interface DartPerformance {
  acousticTrim: boolean;
  quietSpeed: number;
  normalSpeed: 8;
  boostSpeed: number;
  socketsUsed: number;
  sockets: 2;
  cargoCu: number;
  description: string;
}
/** Speeds when this Dart is piloted. Noise, pressure, acceleration and drain per second are unchanged. */
export function dartPerformance(s: GameState, vehicleId: string): DartPerformance | null {
  const v = s.fleet.vehicles.find((v) => v.id === vehicleId);
  if (!v || v.hull !== "dart") return null;
  const acousticTrim = v.modules.length === 1 && installedModuleValid(s, v, v.modules[0]!) &&
    s.fleet.vehicles.filter((a) => a.modules.includes(v.modules[0]!)).length === 1 &&
    s.inventory.items.filter((i) => i.kind === "dart_acoustic_trim").length === 1 &&
    s.knowledge.crafted.includes("dart_acoustic_trim");
  return {
    acousticTrim,
    quietSpeed: acousticTrim ? MODULES.dart_acoustic_trim.quietSpeed : 3,
    normalSpeed: 8,
    boostSpeed: acousticTrim ? MODULES.dart_acoustic_trim.boostSpeed : 11,
    socketsUsed: v.modules.length,
    sockets: SMALL_CRAFT_SOCKETS,
    cargoCu: acousticTrim ? ITEMS.dart_acoustic_trim.cu : 0,
    description: acousticTrim
      ? "Dart acoustic trim: quiet 4.2 m/s, cruise 8 m/s, boost 9 m/s; 1 of 2 sockets and 2 CU. Noise and power use per second stay the same."
      : "Dart: quiet 3 m/s, cruise 8 m/s, boost 11 m/s. Acoustic trim trades boost speed for faster quiet travel, using 1 socket and 2 CU.",
  };
}
function localModuleAccessRefusal(s: GameState, v: VehicleState): string | null {
  if (s.player.controlledVehicleId || s.player.interiorId)
    return "Exit the occupied hull safely before working on its module collar.";
  if (v.berth || s.recovery.operation || s.fleet.docking?.transaction)
    return "Finish recovery or berth work and use an unberthed hull before changing modules.";
  if (!containerAccessible(s, v.cargoId) && distance(s.player.pose.position, v.pose.position) >= 7)
    return `Approach this ${v.hull === "creel" ? "Creel" : "Dart"}'s local cradle or exterior collar.`;
  return null;
}
/** Exact capacity outcome of fitting `next` (or nothing) to this Creel's mount. */
export interface MountChange {
  vehicleId: string;
  current: (ItemStack & { kind: MountKind }) | null;
  next: (ItemStack & { kind: MountKind }) | null;
  /** Where the replaced package goes: the source of `next`, or this hold. */
  stowTo: string | null;
  capacityAfter: number;
  cargoCu: number;
  refusal: string | null;
}
/** Read-only preview shared by the command and the Cargo panel. Nothing moves
 * unless every container keeps its capacity and no refuge/locker would orphan. */
export function mountChangePreview(s: GameState, vehicleId: string, itemId: string | null): MountChange {
  const v = s.fleet.vehicles.find((a) => a.id === vehicleId);
  const current = v ? fittedMount(s, v) : null;
  const found = itemId ? s.inventory.items.find((i) => i.id === itemId) : undefined;
  const next = found && isMountKind(found.kind) ? found as ItemStack & { kind: MountKind } : null;
  const result = (refusal: string | null, stowTo: string | null = null, capacityAfter = 0, cargoCu = 0): MountChange =>
    ({ vehicleId, current, next, stowTo, capacityAfter, cargoCu, refusal });
  if (!v || v.hull !== "creel") return result("Choose an owned Creel.");
  const access = localModuleAccessRefusal(s, v);
  if (access) return result(access);
  if (!supportedServiceSite(s, v)) return result("Change the major mount at pod waters, the workshop slip or a restored service mooring.");
  if (itemId !== null && (!next || !moduleItem(next) || next.fitted !== null || !s.knowledge.crafted.includes(next.kind)))
    return result("Choose an intact, stowed Creel rack or cabin package.");
  if (next && !containerAccessible(s, next.containerId)) return result("Bring the package into locally accessible cargo first.");
  if (!current && !next) return result("No mount is fitted.");
  const stowTo = next ? next.containerId : v.cargoId;
  const capacityAfter = next ? MODULES[next.kind].holdCu : holdCapacity(s, { ...v, modules: [] });
  // Cargo excludes both packages: the fitted one leaves the mount, the new one is fitted.
  const cargoCu = usedCapacity(s, v.cargoId) - (next && next.containerId === v.cargoId ? ITEMS[next.kind].cu : 0);
  const stowedHere = current && stowTo === v.cargoId ? ITEMS[current.kind].cu : 0;
  if (current?.kind === "creel_cabin") {
    if (s.inventory.items.some((i) => i.containerId === cabinLockerId(current.id)))
      return result("Empty the cabin locker before unfitting the cabin. Nothing changed.");
    if (s.player.interiorId === v.id) return result("Leave the cabin before changing the mount.");
  }
  if (cargoCu + stowedHere > capacityAfter) {
    const need = cargoCu + stowedHere - capacityAfter;
    return result(`The hold would need ${cargoCu + stowedHere} CU but ${next ? mountLabel(next.kind) : "the bare mount"} leaves ${capacityAfter} CU. Store ${need} CU first. Nothing changed.`, stowTo, capacityAfter, cargoCu);
  }
  if (current && stowTo !== v.cargoId && !hasRoom(s, stowTo, ITEMS[current.kind].cu - (next ? ITEMS[next.kind].cu : 0)))
    return result(`${containerLabel(s, stowTo)} needs ${ITEMS[current.kind].cu} CU for the ${mountLabel(current.kind).toLowerCase()}. Nothing changed.`, stowTo, capacityAfter, cargoCu);
  return result(null, stowTo, capacityAfter, cargoCu);
}
function applyMountChange(s: GameState, change: MountChange): void {
  const v = s.fleet.vehicles.find((a) => a.id === change.vehicleId)!;
  if (change.current) {
    const old = s.inventory.items.find((i) => i.id === change.current!.id)!;
    old.fitted = null;
    old.containerId = change.stowTo!;
    v.modules = v.modules.filter((id) => id !== old.id);
    if (s.player.mobileRefuge?.moduleId === old.id) s.player.mobileRefuge = null;
  }
  if (change.next) {
    const item = s.inventory.items.find((i) => i.id === change.next!.id)!;
    item.containerId = v.cargoId;
    item.fitted = "mount";
    v.modules.push(item.id);
  }
  s.inventory.containers.find((c) => c.id === v.cargoId)!.capacity = change.capacityAfter;
}
export function installModuleRefusal(s: GameState, vehicleId: string, itemId: string): string | null {
  const candidate = s.inventory.items.find((i) => i.id === itemId);
  if (candidate && isMountKind(candidate.kind)) return mountChangePreview(s, vehicleId, itemId).refusal;
  const v = s.fleet.vehicles.find((v) => v.id === vehicleId);
  if (!v || v.hull !== "dart") return "Choose an owned Dart for this acoustic trim.";
  const no = localModuleAccessRefusal(s, v);
  if (no) return no;
  if (!supportedServiceSite(s, v)) return "Install modules at the pod or restored workshop cradle.";
  const item = s.inventory.items.find((i) => i.id === itemId);
  if (!item || !moduleItem(item) || !s.knowledge.crafted.includes("dart_acoustic_trim"))
    return "Choose the intact, fabricated Dart acoustic trim item.";
  if (!containerAccessible(s, item.containerId)) return "Bring the module into locally accessible cargo first.";
  if (s.fleet.vehicles.some((a) => a.modules.includes(itemId))) return "This module is already installed. Remove it first.";
  if (v.modules.length >= SMALL_CRAFT_SOCKETS) return "Both small-craft sockets are occupied. Remove a module first.";
  if (v.modules.some((id) => s.inventory.items.find((i) => i.id === id)?.kind === item.kind))
    return "This Dart already has acoustic trim. Remove it before installing another.";
  if (item.containerId !== v.cargoId && !hasRoom(s, v.cargoId, ITEMS[item.kind].cu))
    return "Make 2 CU room in the Dart hold before relocating the module. Nothing changed.";
  return null;
}
export function installModule(s: GameState, vehicleId: string, itemId: string): string | null {
  const no = installModuleRefusal(s, vehicleId, itemId);
  if (no) return no;
  const mount = s.inventory.items.find((i) => i.id === itemId)!;
  if (isMountKind(mount.kind)) {
    const change = mountChangePreview(s, vehicleId, itemId);
    applyMountChange(s, change);
    s.feedback = `${mountLabel(mount.kind)} fitted · hold ${change.capacityAfter} CU${change.current ? ` · ${mountLabel(change.current.kind).toLowerCase()} stowed in ${containerLabel(s, change.stowTo!)}` : ""}.`;
    return null;
  }
  const v = s.fleet.vehicles.find((v) => v.id === vehicleId)!;
  s.inventory.items.find((i) => i.id === itemId)!.containerId = v.cargoId;
  v.modules.push(itemId);
  s.feedback = "Dart acoustic trim fitted.";
  return null;
}
export function removeModuleRefusal(s: GameState, vehicleId: string, itemId: string, world: WorldQueries): string | null {
  const v = s.fleet.vehicles.find((v) => v.id === vehicleId);
  const mount = v?.hull === "creel" ? fittedMount(s, v) : null;
  if (mount && mount.id === itemId) {
    const change = mountChangePreview(s, vehicleId, null);
    if (!change.refusal || !change.refusal.startsWith("Change the major mount")) return change.refusal;
    // Away from support: a disabled hull's exterior collar still releases it.
    if (!v!.disabled || !equipped(s, "essential_tools") || !equipped(s, "bobbin_kit"))
      return "Use a supported mooring, or bring the service tool and Bobbin kit to a disabled Creel's exterior collar.";
    if (distance(s.player.pose.position, v!.pose.position) >= 7 ||
        Math.max(0, -(s.player.pose.position.y + 0.4)) > personalLimit(s) ||
        !world.clearance(s.player.pose.position, { radius: 0.34, height: s.player.mode === "walking" ? 1.75 : 0.95 }))
      return "Reach the disabled Creel's exterior collar with safe personal depth and clearance.";
    return collarMountRefusal(s, v!, mount);
  }
  if (!v || v.hull !== "dart" || !v.modules.includes(itemId) || !installedModuleValid(s, v, itemId))
    return "Choose an installed Dart acoustic trim item.";
  const no = localModuleAccessRefusal(s, v);
  if (no) return no;
  if (supportedServiceSite(s, v)) return null;
  if (!v.disabled || !equipped(s, "essential_tools") || !equipped(s, "bobbin_kit"))
    return "Use a supported cradle, or bring the retained service tool and Bobbin kit to a disabled Dart's exterior collar.";
  if (distance(s.player.pose.position, v.pose.position) >= 7 ||
      Math.max(0, -(s.player.pose.position.y + 0.4)) > personalLimit(s) ||
      !world.clearance(s.player.pose.position, { radius: 0.34, height: s.player.mode === "walking" ? 1.75 : 0.95 }))
    return "Reach the disabled Dart's exterior collar with safe personal depth and clearance; tow it to the shallow bench if needed.";
  return null;
}
/** Collar release away from support uses the same capacity/locker rules. */
function collarMountRefusal(s: GameState, v: VehicleState, mount: ItemStack & { kind: MountKind }): string | null {
  if (mount.kind === "creel_cabin" && s.inventory.items.some((i) => i.containerId === cabinLockerId(mount.id)))
    return "Empty the cabin locker before unfitting the cabin. Nothing changed.";
  const after = holdCapacity(s, { ...v, modules: [] }), cargo = usedCapacity(s, v.cargoId) + ITEMS[mount.kind].cu;
  return cargo > after ? `The hold would need ${cargo} CU but the bare mount leaves ${after} CU. Store ${cargo - after} CU first. Nothing changed.` : null;
}
export function removeModule(s: GameState, vehicleId: string, itemId: string, world: WorldQueries): string | null {
  const no = removeModuleRefusal(s, vehicleId, itemId, world);
  if (no) return no;
  const v = s.fleet.vehicles.find((v) => v.id === vehicleId)!;
  const mount = v.hull === "creel" ? fittedMount(s, v) : null;
  if (mount && mount.id === itemId) {
    applyMountChange(s, { vehicleId, current: mount, next: null, stowTo: v.cargoId,
      capacityAfter: holdCapacity(s, { ...v, modules: [] }), cargoCu: 0, refusal: null });
    s.feedback = `${mountLabel(mount.kind)} unfitted · stowed in the Creel hold · hold ${s.inventory.containers.find((c) => c.id === v.cargoId)!.capacity} CU.`;
    return null;
  }
  v.modules = v.modules.filter((id) => id !== itemId);
  s.feedback = "Dart acoustic trim removed · retained in the Dart hold.";
  return null;
}
