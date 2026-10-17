const WORLD_BOUNDS = { minX: -76, maxX: 76, minZ: -94, maxZ: 66 };
import type { GameState } from "../sim/types.js";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> =>
  record(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
const number = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;
const empty = (value: unknown): boolean =>
  Array.isArray(value) && value.length === 0;

export function validFoundationState(value: unknown): value is GameState {
  if (
    !exact(value, [
      "tick",
      "player",
      "inventory",
      "knowledge",
      "world",
      "fleet",
      "recovery",
    ]) ||
    !number(value.tick, 0, 2_147_483_647) ||
    !Number.isInteger(value.tick)
  )
    return false;
  const player = value.player;
  if (
    !exact(player, [
      "pose",
      "velocity",
      "mode",
      "vitals",
      "refugeId",
      "controlledVehicleId",
      "interiorId",
    ])
  )
    return false;
  const pose = player.pose;
  if (
    !exact(pose, ["frame", "position", "yaw", "pitch"]) ||
    pose.frame !== "world" ||
    !number(pose.yaw, 0, Math.PI * 2) ||
    !number(pose.pitch, -1.35, 1.35)
  )
    return false;
  const p = pose.position;
  if (
    !exact(p, ["x", "y", "z"]) ||
    !number(p.x, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX) ||
    !number(p.y, -15, 80) ||
    !number(p.z, WORLD_BOUNDS.minZ, WORLD_BOUNDS.maxZ)
  )
    return false;
  const velocity = player.velocity;
  if (
    !exact(velocity, ["x", "y", "z"]) ||
    !["x", "y", "z"].every((axis) => number(velocity[axis], -30, 30))
  )
    return false;
  const vitals = player.vitals;
  if (
    !exact(vitals, ["health", "oxygen", "food"]) ||
    !["health", "oxygen", "food"].every((key) => number(vitals[key], 0, 100))
  )
    return false;
  if (
    (player.mode !== "walking" && player.mode !== "swimming") ||
    player.refugeId !== "home_pod" ||
    player.controlledVehicleId !== null ||
    player.interiorId !== null
  )
    return false;
  const inventory = value.inventory,
    knowledge = value.knowledge,
    world = value.world,
    fleet = value.fleet,
    recovery = value.recovery;
  return (
    exact(inventory, ["items", "containers"]) &&
    empty(inventory.items) &&
    empty(inventory.containers) &&
    exact(knowledge, [
      "blueprints",
      "scans",
      "evidence",
      "journals",
      "markers",
    ]) &&
    Object.values(knowledge).every(empty) &&
    exact(world, ["resources", "facilities"]) &&
    empty(world.resources) &&
    empty(world.facilities) &&
    exact(fleet, ["vehicles", "docking"]) &&
    empty(fleet.vehicles) &&
    fleet.docking === null &&
    exact(recovery, ["caches"]) &&
    empty(recovery.caches)
  );
}
