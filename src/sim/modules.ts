import { HULLS, ITEMS, MODULES, isMountKind } from "../content/registry.js";
import { upgradeId } from "../content/upgrades/catalogue.js";
import type { UpgradeId } from "../content/upgrades/catalogue.js";
import { slotOf } from "./upgrades/fitting.js";
import { applyUpgradePreview, upgradeInstallPreview, upgradeRemovePreview } from "./fittings.js";
import type { ModuleKind, MountKind } from "../content/registry.js";
import type { GameState, ItemStack, VehicleState, WorldQueries } from "./types.js";
import { cabinLockerId, containerAccessible, containerLabel, distance, equipped, hasRoom, supportedServiceSite, usedCapacity } from "./inventory.js";
import { personalLimit } from "./progression.js";
import { fittedMount, holdCapacity, mountLabel } from "./fleet.js";

export const SMALL_CRAFT_SOCKETS = 2;
/** An intact, ordinary module instance. Socket modules are never fitted; a mount
 * package is either stowed (null) or fitted on a Creel's major mount ("mount"). */
export function moduleItem(item: ItemStack): item is ItemStack & { kind: ModuleKind | UpgradeId } {
  return (Object.hasOwn(MODULES, item.kind) || upgradeId(item.kind)) && item.quantity === 1 &&
    item.provenance === "public" && item.charge === null &&
    (item.fitted === null || (item.fitted === "mount" && (isMountKind(item.kind) || upgradeId(item.kind))));
}
/** Socket modules remain capacity-counted hold items; every other slot's module
 * is fitted in that hold, outside cargo (C4: SYS-1's slots). */
export function installedModuleValid(s: GameState, v: VehicleState, itemId: string): boolean {
  const item = s.inventory.items.find((i) => i.id === itemId);
  if (!v.modules.includes(itemId) || !item || !moduleItem(item) || item.containerId !== v.cargoId || !upgradeId(item.kind)) return false;
  const slot = slotOf(v.hull, item.kind);
  return !!slot && slot !== "refit" && (slot === "socket") === (item.fitted === null);
}
/** Socket modules fitted to a hull now. */
export const socketsUsed = (s: GameState, v: VehicleState): number =>
  v.modules.filter((id) => { const k = s.inventory.items.find((i) => i.id === id)?.kind; return !!k && upgradeId(k) && slotOf(v.hull, k) === "socket"; }).length;
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
  const trimId = v.modules.find((id) => s.inventory.items.find((i) => i.id === id)?.kind === "dart_acoustic_trim");
  const acousticTrim = !!trimId && installedModuleValid(s, v, trimId) &&
    s.fleet.vehicles.filter((a) => a.modules.includes(trimId)).length === 1 &&
    s.inventory.items.filter((i) => i.kind === "dart_acoustic_trim").length === 1 &&
    s.knowledge.crafted.includes("dart_acoustic_trim");
  return {
    acousticTrim,
    quietSpeed: acousticTrim ? MODULES.dart_acoustic_trim.quietSpeed : 3,
    normalSpeed: 8,
    boostSpeed: acousticTrim ? MODULES.dart_acoustic_trim.boostSpeed : 11,
    socketsUsed: socketsUsed(s, v),
    sockets: SMALL_CRAFT_SOCKETS,
    cargoCu: acousticTrim ? ITEMS.dart_acoustic_trim.cu : 0,
    description: acousticTrim
      ? "Dart acoustic trim: quiet 4.2 m/s, cruise 8 m/s, boost 9 m/s; 1 of 2 sockets and 2 CU. Noise and power use per second stay the same."
      : "Dart: quiet 3 m/s, cruise 8 m/s, boost 11 m/s. Acoustic trim trades boost speed for faster quiet travel, using 1 socket and 2 CU.",
  };
}
function localModuleAccessRefusal(s: GameState, v: VehicleState): string | null {
  // The carrier's own fittings change from inside it (SYS-1: yard or supported mooring).
  if (v.hull === "hearthline") return s.player.interiorId === v.id ? null : "Change the Hearthline's fittings from inside it.";
  // SYS-1: a berthed hull is fitted from inside its carrier, between berth moves.
  if (v.berth && s.player.interiorId === v.berth.carrierId && !s.fleet.docking?.transaction && !s.recovery.operation) return null;
  if (s.player.controlledVehicleId || s.player.interiorId)
    return "Leave the hull to change its modules.";
  if (v.berth || s.recovery.operation || s.fleet.docking?.transaction)
    return "Finish recovery or berth work and use an unberthed hull before changing modules.";
  if (!containerAccessible(s, v.cargoId) && distance(s.player.pose.position, v.pose.position) >= 7)
    return `Approach this ${HULLS[v.hull].label}'s local cradle or exterior collar.`;
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
  if (next && !containerAccessible(s, next.containerId)) return result("Bring the package here first.");
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
/** SYS-1 path: every upgrade other than the M1 trim and the Creel mount packages. */
function upgradeRefusal(s: GameState, vehicleId: string, itemId: string, replace?: string): string | null {
  const v = s.fleet.vehicles.find((a) => a.id === vehicleId), item = s.inventory.items.find((i) => i.id === itemId);
  if (!v) return "Choose an owned craft.";
  if (!item || !moduleItem(item) || item.fitted !== null || !upgradeId(item.kind)) return "Choose an intact upgrade module.";
  const no = localModuleAccessRefusal(s, v);
  if (no) return no;
  if (!containerAccessible(s, item.containerId)) return "Bring the module into locally accessible cargo first.";
  if (s.fleet.vehicles.some((a) => a.modules.includes(itemId))) return "This module is already installed. Remove it first.";
  if (slotOf(v.hull, item.kind) === "major" && fittedMount(s, v)) return "The major mount holds a rack or cabin. Unfit it first. Nothing changed.";
  if (item.containerId !== v.cargoId && slotOf(v.hull, item.kind) === "socket" && !hasRoom(s, v.cargoId, ITEMS[item.kind].cu))
    return `Make ${ITEMS[item.kind].cu} CU room in the ${HULLS[v.hull].label} hold for the module. Nothing changed.`;
  return upgradeInstallPreview(s, v, item, replace).refusal;
}
const sys1Path = (kind: string): boolean => upgradeId(kind) && kind !== "dart_acoustic_trim" && !isMountKind(kind);
export function installModuleRefusal(s: GameState, vehicleId: string, itemId: string, replace?: string): string | null {
  const candidate = s.inventory.items.find((i) => i.id === itemId);
  if (candidate && isMountKind(candidate.kind)) {
    const v = s.fleet.vehicles.find((a) => a.id === vehicleId);
    if (v && v.modules.some((m) => s.inventory.items.find((i) => i.id === m)?.kind === "creel_service_head"))
      return "The major mount holds the service head. Unfit it first. Nothing changed.";
    return mountChangePreview(s, vehicleId, itemId).refusal;
  }
  if (candidate && sys1Path(candidate.kind)) return upgradeRefusal(s, vehicleId, itemId, replace);
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
  if (socketsUsed(s, v) >= SMALL_CRAFT_SOCKETS) return "Both small-craft sockets are occupied. Remove a module first.";
  if (v.modules.some((id) => s.inventory.items.find((i) => i.id === id)?.kind === item.kind))
    return "This Dart already has acoustic trim. Remove it before installing another.";
  if (item.containerId !== v.cargoId && !hasRoom(s, v.cargoId, ITEMS[item.kind].cu))
    return "Make 2 CU room in the Dart hold before relocating the module. Nothing changed.";
  return null;
}
export function installModule(s: GameState, vehicleId: string, itemId: string, replace?: string): string | null {
  const no = installModuleRefusal(s, vehicleId, itemId, replace);
  if (no) return no;
  const mount = s.inventory.items.find((i) => i.id === itemId)!;
  if (sys1Path(mount.kind)) {
    const v = s.fleet.vehicles.find((a) => a.id === vehicleId)!, preview = upgradeInstallPreview(s, v, mount, replace);
    applyUpgradePreview(s, v, preview);
    s.feedback = `${ITEMS[mount.kind].label} fitted${preview.displaced ? ` · ${ITEMS[s.inventory.items.find((i) => i.id === preview.displaced!.itemId)!.kind].label} returned to the hold` : ""}.${preview.warnings.length ? ` ${preview.warnings.join(" ")}` : ""}`;
    return null;
  }
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
  const fittedKind = s.inventory.items.find((i) => i.id === itemId)?.kind;
  if (v && fittedKind && sys1Path(fittedKind) && v.modules.includes(itemId)) {
    const no = localModuleAccessRefusal(s, v);
    return no ?? upgradeRemovePreview(s, v, itemId).refusal;
  }
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
  const kind = s.inventory.items.find((i) => i.id === itemId)!.kind;
  if (sys1Path(kind)) {
    applyUpgradePreview(s, v, upgradeRemovePreview(s, v, itemId));
    s.feedback = `${ITEMS[kind].label} removed · intact in the ${HULLS[v.hull].label} hold.`;
    return null;
  }
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
