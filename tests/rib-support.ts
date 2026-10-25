import assert from "node:assert/strict";
import { makeVehicle, createGame } from "../src/sim/state.js";
import { actorBox, RIB_CONTACT_TOLERANCE, segmentBoxClosest } from "../src/sim/ribCollision.js";
import { createWorldQueries, RIB_SEGMENTS } from "../src/sim/world.js";
import type { Capsule, GameCommand, GameState, Vec3, VehicleState } from "../src/sim/types.js";

// Shared by rib-surface-trap.test.ts and its heavy surface sweep.
export const world = createWorldQueries(), swimmer = { radius: 0.34, height: 0.95 };
export const input = (forward = 0, right = 0, vertical = 0): Extract<GameCommand, { type: "move" }> =>
  ({ type: "move", forward, right, vertical, sprint: false, quiet: false });
export const directions = [input(1), input(-1), input(0, 1), input(0, -1), input(0, 0, 1), input(0, 0, -1)];
export const distance = (p: Vec3, q: Vec3): number => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
export const gaps = (p: Vec3, shape: Capsule): number[] => RIB_SEGMENTS.map(r =>
  segmentBoxClosest(r.a, r.b, actorBox(p, shape)).distance - r.radius);
export function noDeepening(before: Vec3, after: Vec3, shape: Capsule): void {
  assert.ok(Object.values(after).every(Number.isFinite));
  const old = gaps(before, shape), next = gaps(after, shape);
  for (const [i, g] of old.entries()) assert.ok(
    g < -RIB_CONTACT_TOLERANCE ? next[i]! >= g - 1e-9 : next[i]! >= -RIB_CONTACT_TOLERANCE,
    `rib ${i}: ${g} -> ${next[i]} at ${JSON.stringify({ before, after })}`,
  );
}
export function swim(position: Vec3, yaw = 0, pitch = 0): GameState {
  const s = createGame(); s.opening.phase = 4; s.player.mode = "swimming";
  Object.assign(s.player.pose, { position: { ...position }, yaw, pitch }); return s;
}
export function pilot(hull: VehicleState["hull"], position: Vec3, yaw = 0, pitch = 0): GameState {
  const s = swim(position, yaw, pitch), v = makeVehicle("trap-hull", hull, position, "trap-hold");
  Object.assign(v.pose, { yaw, pitch }); s.fleet.vehicles.push(v);
  s.player.pose = structuredClone(v.pose); s.player.mode = "piloting"; s.player.controlledVehicleId = v.id;
  s.inventory.containers.push({ id: v.cargoId, kind: "vehicle", capacity: 32, ownerId: v.id }); return s;
}
