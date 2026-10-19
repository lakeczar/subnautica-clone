import { HULLS } from "../content/registry.js";
import type { ExitRefusalCode, GameState, Vec3, VehicleState, WorldQueries } from "./types.js";
import {
  distance,
  containerLabel,
  equipped,
  fabricationContainers,
  localBenchSite,
  nearPod,
  nearWorkshop,
  removeQuantity,
  supportedServiceSite,
} from "./inventory.js";
import { personalDepth, personalLimit } from "./capabilities.js";
import { WORLD_BOUNDS } from "./world.js";

export const PULSE_CHARGE_COST = 25;
/** Why a pulse is refused, for compact presentation; `refusal` stays the full text. */
export type DistractionBlock = "tool" | "active" | "facing" | "cell";
export type DistractionPreview =
  | { refusal: string; block: DistractionBlock; cellId: null; target: null; cost: 25; remainingCharge: null }
  | { refusal: null; block: null; cellId: string; target: Vec3; cost: 25; remainingCharge: number };
/** Same eligibility/ray/selection for the command and its future presentation. Never mutates. */
export function distractionPreview(s: GameState): DistractionPreview {
  const refuse = (block: DistractionBlock, refusal: string): DistractionPreview =>
    ({ refusal, block, cellId: null, target: null, cost: PULSE_CHARGE_COST, remainingCharge: null });
  if (!equipped(s, "essential_tools")) return refuse("tool", "The service tool supplies the acoustic distraction; each pulse costs 25 reserve-cell charge points.");
  if (s.world.threat.distractionSeconds > 0) return refuse("active", "Distraction is already active.");
  const p = s.player.pose, dx = Math.sin(p.yaw), dz = -Math.cos(p.yaw);
  let range = 16;
  // Preserve the existing clipped ray, including cardinal-heading residue handling.
  if (Math.abs(dx) > Number.EPSILON)
    range = Math.min(range, ((dx > 0 ? WORLD_BOUNDS.maxX : WORLD_BOUNDS.minX) - p.position.x) / dx);
  if (Math.abs(dz) > Number.EPSILON)
    range = Math.min(range, ((dz > 0 ? WORLD_BOUNDS.maxZ : WORLD_BOUNDS.minZ) - p.position.z) / dz);
  const target = {
    x: Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, p.position.x + dx * range)),
    y: p.position.y,
    z: Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, p.position.z + dz * range)),
  };
  if (range <= 0 || (target.x === p.position.x && target.z === p.position.z))
    return refuse("facing", "Face into the survey area to release a directional pulse.");
  const craft = s.fleet.vehicles.find((v) => v.id === s.player.controlledVehicleId);
  const containers = ["diver", ...(craft && !craft.berth ? [craft.cargoId] : [])];
  for (const id of containers) {
    const cell = s.inventory.items.filter((i) => i.kind === "reserve_cell" &&
      !i.fitted && i.containerId === id && (i.charge ?? 0) >= PULSE_CHARGE_COST)
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)[0];
    if (cell) return { refusal: null, block: null, cellId: cell.id, target, cost: PULSE_CHARGE_COST,
      remainingCharge: cell.charge! - PULSE_CHARGE_COST };
  }
  return refuse("cell", "A pulse costs 25 charge points from one reserve cell in your hold or the controlled craft. Quiet movement, cover and retreat remain available.");
}
export function distraction(s: GameState): string | null {
  const p = distractionPreview(s);
  if (p.refusal !== null) return p.refusal;
  const cell = s.inventory.items.find((i) => i.id === p.cellId)!;
  cell.charge = p.remainingCharge;
  s.world.threat.distraction = p.target;
  s.world.threat.distractionSeconds = 12;
  s.feedback = `Directional pulse released: 25 charge points from a reserve cell in ${containerLabel(s, cell.containerId)}; ${p.remainingCharge.toFixed(2)} remain. Move quietly away from it.`;
  return null;
}
export function cellRechargePreview(s: GameState): { cellIds: string[]; refusal: string | null } {
  const site = localBenchSite(s);
  if (!site) return { cellIds: [], refusal: "Use the restored pod fabricator or restored workshop bench to recharge local reserve cells." };
  const bins = fabricationContainers(s, site);
  const cells = s.inventory.items.filter((i) => i.kind === "reserve_cell" && !i.fitted && bins.includes(i.containerId));
  const cellIds = cells.filter((i) => (i.charge ?? 0) < 100).map((i) => i.id);
  return { cellIds, refusal: !cells.length ? "No reserve cells at this bench or its local cargo containers."
    : !cellIds.length ? "All local reserve cells are already full." : null };
}
export function rechargeCells(s: GameState): string | null {
  const p = cellRechargePreview(s);
  if (p.refusal) return p.refusal;
  for (const i of s.inventory.items) if (p.cellIds.includes(i.id)) i.charge = 100;
  s.feedback = `Recharged ${p.cellIds.length} local reserve ${p.cellIds.length === 1 ? "cell" : "cells"}.`;
  return null;
}
export const hullDepth = (v: VehicleState): number =>
  Math.max(0, -(v.pose.position.y + 0.5));
export function exitBlock(s: GameState, world: WorldQueries): { code: ExitRefusalCode; message: string } | null {
  const v = s.fleet.vehicles.find((v) => v.id === s.player.controlledVehicleId);
  if (!v) return { code: "not-piloting", message: "You are not piloting a craft." };
  if (v.hull === "hearthline")
    return { code: "carrier", message: "Engage station keeping, then leave the helm into the dry interior." };
  const exit = {
    x: v.pose.position.x + Math.cos(v.pose.yaw) * 3.1,
    y: v.pose.position.y + 0.2,
    z: v.pose.position.z + Math.sin(v.pose.yaw) * 3.1,
  };
  const depth = personalDepth(exit);
  if (depth > personalLimit(s))
    return { code: "depth", message: `Exit exposure ${depth.toFixed(0)} m exceeds your ${personalLimit(s)} m personal suit. The ${HULLS[v.hull].initialDepth} m hull does not protect a diver outside.` };
  if (!world.clearance(exit, { radius: 0.34, height: 0.95 }))
    return { code: "obstructed", message: "Exit side is obstructed. Move the craft to clear water before disembarking." };
  return null;
}
export function exitRefusal(s: GameState, world: WorldQueries): string | null {
  return exitBlock(s, world)?.message ?? null;
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
  s.feedback = `${HULLS[v.hull].label} · mouse or arrows steer · W/S thrust · A/D slide.`;
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
type ServiceCheck =
  | { state: "ready"; refusal: null; vehicle: VehicleState }
  | { state: "away" | "unsupported" | "patch"; refusal: string };
/** One authoritative, read-only check in the command's original precedence. */
function checkService(s: GameState, id: string): ServiceCheck {
  const v = s.fleet.vehicles.find((v) => v.id === id);
  if (!v || v.berth || distance(s.player.pose.position, v.pose.position) > 7)
    return { state: "away", refusal: "Approach the craft service socket locally." };
  if (!supportedServiceSite(s, v))
    return { state: "unsupported", refusal: "Use pod waters or the restored workshop cradle for hull charging and routine repair. Field patches use rescue stock." };
  if (v.disabled)
    return { state: "patch", refusal: "Apply a rescue patch before routine charging." };
  return { state: "ready", refusal: null, vehicle: v };
}
export function serviceRefusal(s: GameState, id: string): string | null {
  return checkService(s, id).refusal;
}
export function serviceState(s: GameState, id: string): "ready" | "patch" | "unsupported" | "away" {
  return checkService(s, id).state;
}
/** Deficits only; this does not grant service access or invalidate a full hull. */
export function serviceWouldRestore(s: GameState, v: VehicleState): boolean {
  return v.health < 100 || v.charge < 100 || v.emergencyAir < 120 ||
    s.inventory.items.some(i => i.kind === "reserve_cell" &&
      (i.containerId === "diver" || i.containerId === v.cargoId) && (i.charge ?? 0) < 100);
}
export function service(s: GameState, id: string): string | null {
  const check = checkService(s, id);
  if (check.state !== "ready") return check.refusal;
  const v = check.vehicle;
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
    "Serviced: hull, power and emergency air full. Cells in your hold and this craft charged. Cargo and modules kept.";
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
  s.feedback = `Added ${amount.toFixed(0)}% hull power from a reserve cell. Recharge local cells at a restored pod or workshop bench.`;
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
    `Meal eaten · food ${Math.round(s.player.vitals.food)}`;
  return null;
}
