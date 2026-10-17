import { DART_BUILD_POSE, HULLS } from "../content/registry.js";
import type { GameState, VehicleState, WorldQueries } from "./types.js";
import {
  distance,
  facility,
  nearPod,
  nearWorkshop,
  removeQuantity,
} from "./inventory.js";
import { personalLimit } from "./progression.js";
export const hullDepth = (v: VehicleState): number =>
  Math.max(0, -(v.pose.position.y + 0.5));
export function exitRefusal(s: GameState, world: WorldQueries): string | null {
  const v = s.fleet.vehicles.find((v) => v.id === s.player.controlledVehicleId);
  if (!v) return "You are not piloting a craft.";
  if (v.hull === "hearthline")
    return "Engage station keeping, then leave the helm into the dry interior.";
  const exit = {
    x: v.pose.position.x + Math.cos(v.pose.yaw) * 3.1,
    y: v.pose.position.y + 0.2,
    z: v.pose.position.z + Math.sin(v.pose.yaw) * 3.1,
  };
  const depth = Math.max(0, -(exit.y + 0.4));
  if (depth > personalLimit(s))
    return `Exit exposure ${depth.toFixed(0)} m exceeds your ${personalLimit(s)} m personal suit. The ${HULLS[v.hull].initialDepth} m hull does not protect a diver outside.`;
  if (!world.clearance(exit, { radius: 0.34, height: 0.95 }))
    return "Exit side is obstructed. Move the craft to clear water before disembarking.";
  return null;
}
export function board(s: GameState, id: string): string | null {
  const v = s.fleet.vehicles.find((v) => v.id === id);
  if (!v || v.berth || distance(s.player.pose.position, v.pose.position) > 6)
    return "Approach the visible canopy access handle.";
  if (v.disabled || v.charge <= 0)
    return "Craft disabled or out of power. Its hold remains accessible; repair or insert a charged reserve cell locally.";
  if (s.player.controlledVehicleId) return "Exit the current craft first.";
  s.player.controlledVehicleId = id;
  s.player.interiorId = null;
  s.player.interiorPose = null;
  s.player.mode = "piloting";
  s.player.pose.position = { ...v.pose.position };
  s.player.pose.yaw = v.pose.yaw;
  s.player.pose.pitch = v.pose.pitch;
  s.player.velocity = { ...v.velocity };
  s.feedback = `Boarded ${HULLS[v.hull].label}. Hull ${HULLS[v.hull].initialDepth} m; personal suit ${personalLimit(s)} m. WASD steer, Space/C rise/dive, E exit. Quiet throttle avoids acoustic attention.`;
  return null;
}
export function exit(s: GameState, world: WorldQueries): string | null {
  const no = exitRefusal(s, world);
  if (no) return no;
  const v = s.fleet.vehicles.find(
    (v) => v.id === s.player.controlledVehicleId,
  )!;
  s.player.pose.position = {
    x: v.pose.position.x + Math.cos(v.pose.yaw) * 3.1,
    y: v.pose.position.y + 0.2,
    z: v.pose.position.z + Math.sin(v.pose.yaw) * 3.1,
  };
  s.player.controlledVehicleId = null;
  s.player.mode = "swimming";
  s.player.velocity = { x: 0, y: 0, z: 0 };
  v.velocity = { x: 0, y: 0, z: 0 };
  s.feedback =
    "Clear exit. Your personal oxygen and pressure protection now apply.";
  return null;
}
export function service(s: GameState, id: string): string | null {
  const v = s.fleet.vehicles.find((v) => v.id === id);
  if (!v || v.berth || distance(s.player.pose.position, v.pose.position) > 7)
    return "Approach the craft service socket locally.";
  const supported =
    (distance(v.pose.position, DART_BUILD_POSE) < 12 &&
      facility(s, "island_workshop")) ||
    distance(v.pose.position, { x: 0, y: -1, z: 8 }) < 12;
  if (!supported)
    return "Charging and routine repair require the pod or restored workshop cradle. Field recovery uses maintenance patches.";
  if (v.disabled)
    return "Apply a bound recovery patch before routine charging.";
  // Supported service is an active session action; it has no time bypass or raw-material output.
  v.charge = 100;
  v.health = 100;
  v.emergencyAir = 120;
  for (const i of s.inventory.items)
    if (
      i.kind === "reserve_cell" &&
      (i.containerId === "diver" || i.containerId === v.cargoId)
    )
      i.charge = 100;
  s.feedback =
    "Supported service complete: battery, hull and carried reserve cells restored. Cargo and module identities retained.";
  return null;
}
export function reserve(s: GameState, id: string): string | null {
  const v = s.fleet.vehicles.find((v) => v.id === id);
  if (!v || distance(s.player.pose.position, v.pose.position) > 7)
    return "Approach the power socket.";
  const cell = s.inventory.items.find(
    (i) =>
      i.kind === "reserve_cell" &&
      (i.containerId === "diver" || i.containerId === v.cargoId) &&
      (i.charge ?? 0) > 0,
  );
  if (!cell) return "Bring a charged reusable reserve cell.";
  if (v.charge >= 100) return "Battery already full. Cell retained.";
  const amount = Math.min((35 * (cell.charge ?? 0)) / 100, 100 - v.charge);
  v.charge += amount;
  cell.charge = Math.max(0, (cell.charge ?? 0) - (amount / 35) * 100);
  s.feedback = `Transferred ${amount.toFixed(0)}% power. Empty cells can be recharged at a supported refuge.`;
  return null;
}
export function eat(s: GameState): string | null {
  if (s.player.vitals.food >= 99) return "Already fed. Meal retained.";
  const ids = [
    "diver",
    ...(nearPod(s) ? ["pod_locker"] : []),
    ...(nearWorkshop(s) ? ["workshop_locker"] : []),
    ...(s.player.controlledVehicleId
      ? [
          s.fleet.vehicles.find((v) => v.id === s.player.controlledVehicleId)!
            .cargoId,
        ]
      : []),
  ];
  const meal = s.inventory.items.find(
    (i) => i.kind === "meal" && ids.includes(i.containerId),
  );
  if (!meal)
    return "Gather edible reef cups or shore pods by hand. A refuge can issue an emergency meal.";
  removeQuantity(s, meal, 1);
  s.player.vitals.food = Math.min(100, s.player.vitals.food + 70);
  s.player.starvationSeconds = 0;
  s.feedback =
    "Meal eaten. Prepared portions do not spoil; ordinary movement remains available when hungry.";
  return null;
}
