import { ITEMS, MODULES } from "../content/registry.js";
import type { ModuleKind } from "../content/registry.js";
import type { GameState, ItemStack, VehicleState, WorldQueries } from "./types.js";
import { containerAccessible, distance, equipped, hasRoom, supportedServiceSite } from "./inventory.js";
import { personalLimit } from "./progression.js";

export const SMALL_CRAFT_SOCKETS = 2;
export function moduleItem(item: ItemStack): item is ItemStack & { kind: ModuleKind } {
  return Object.hasOwn(MODULES, item.kind) && item.quantity === 1 &&
    item.provenance === "public" && item.charge === null && item.fitted === null;
}
/** An installed module remains the same ordinary, capacity-counted item in its owner's hold. */
export function installedModuleValid(s: GameState, v: VehicleState, itemId: string): boolean {
  const item = s.inventory.items.find((i) => i.id === itemId);
  return v.modules.includes(itemId) && !!item && moduleItem(item) && MODULES[item.kind].hull === v.hull &&
    item.containerId === v.cargoId;
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
    return "Approach this Dart's local cradle or exterior collar.";
  return null;
}
export function installModuleRefusal(s: GameState, vehicleId: string, itemId: string): string | null {
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
  const v = s.fleet.vehicles.find((v) => v.id === vehicleId)!;
  s.inventory.items.find((i) => i.id === itemId)!.containerId = v.cargoId;
  v.modules.push(itemId);
  s.feedback = `Installed ${dartPerformance(s, vehicleId)!.description}`;
  return null;
}
export function removeModuleRefusal(s: GameState, vehicleId: string, itemId: string, world: WorldQueries): string | null {
  const v = s.fleet.vehicles.find((v) => v.id === vehicleId);
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
export function removeModule(s: GameState, vehicleId: string, itemId: string, world: WorldQueries): string | null {
  const no = removeModuleRefusal(s, vehicleId, itemId, world);
  if (no) return no;
  const v = s.fleet.vehicles.find((v) => v.id === vehicleId)!;
  v.modules = v.modules.filter((id) => id !== itemId);
  s.feedback = "Dart acoustic trim removed from its socket. The same 2 CU item remains in the Dart hold, ready to transfer or reinstall.";
  return null;
}
