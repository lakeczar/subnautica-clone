import assert from "node:assert/strict";
import { BERTH_LOCAL, carrierTravelBounds, fixtureGame, localToWorld, updateBerth } from "../src/sim/carrier.js";
import { executeCommand } from "../src/sim/step.js";
import { createEnvelope, decodeSave, encodeSave } from "../src/save/codec.js";
import { createWorldQueries } from "../src/sim/world.js";
import type { GameCommand, GameState, Vec3 } from "../src/sim/types.js";

// Shared by carrier-boundary.test.ts and its heavy edge/corner sweep.
export const world = createWorldQueries();
export const meta = { sessionId: "carrier-boundary", createdAt: "2026-10-17T00:00:00.000Z", savedAt: "2026-10-17T00:00:00.000Z" };
export function roundTrip(s: GameState): GameState {
  const encoded = encodeSave(createEnvelope(s, meta));
  assert.equal(encoded.ok, true, `tick ${s.tick}: ${encoded.ok ? "" : encoded.error}`);
  const decoded = decodeSave(encoded.value);
  assert.equal(decoded.ok, true);
  // JSON's signed-zero normalization is the codec's only representational change.
  assert.deepEqual(decoded.value.state, JSON.parse(JSON.stringify(s)));
  return decoded.value.state;
}
export function coherent(s: GameState): void {
  const h = s.fleet.vehicles[0]!;
  for (const v of s.fleet.vehicles) if (v.berth) {
    assert.deepEqual(v.pose.position, localToWorld(v.berth.pose.position, h));
    assert.equal(v.pose.yaw, h.pose.yaw + v.berth.pose.yaw);
  }
  if (s.player.controlledVehicleId === h.id) assert.deepEqual(s.player.pose.position, h.pose.position);
  if (s.player.interiorPose) assert.deepEqual(s.player.pose.position, localToWorld(s.player.interiorPose.position, h));
  roundTrip(s);
}
export const move = (forward = 0, right = 0, vertical = 0): GameCommand => ({ type: "move", forward, right, vertical, sprint: false });

export function staged(configuration: "compact" | "medium", position: Vec3, yaw: number): GameState {
  const s = fixtureGame(), h = s.fleet.vehicles[0]!;
  if (configuration === "medium") {
    for (const [i, v] of s.fleet.vehicles.entries()) if (v.berth) {
      v.berth = null;
      v.pose.position = { x: 100 + i * 10, y: -1, z: -60 };
    }
    s.fleet.docking!.configuration = "medium";
    s.fleet.vehicles[3]!.berth = { carrierId: h.id, slot: 0,
      pose: { frame: "carrier-local", position: { ...BERTH_LOCAL[0]! }, yaw: 0 } };
  }
  h.pose.position = { ...position };
  h.pose.yaw = yaw;
  h.pose.pitch = 0;
  s.player.pose.pitch = 0;
  s.player.pose.yaw = yaw;
  updateBerth(s, world);
  return roundTrip(executeCommand(s, { type: "carrier", action: "helm" }, world).state);
}
export function worldMove(s: GameState, x: number, z: number): GameCommand {
  const yaw = s.player.pose.yaw;
  return move(Math.sin(yaw) * x - Math.cos(yaw) * z, Math.cos(yaw) * x + Math.sin(yaw) * z);
}
export function command(s: GameState, action: Extract<GameCommand, { type: "carrier" }>["action"], vehicleId?: string): GameState {
  const result = executeCommand(s, { type: "carrier", action, ...(vehicleId ? { vehicleId } : {}) }, world);
  assert.equal(result.events.some((e) => e.type === "notice" && e.error), false, JSON.stringify(result.events));
  coherent(result.state);
  return result.state;
}
export const bounds = carrierTravelBounds();
export const edges = [
  { x: bounds.minX, z: 0, dx: -1, dz: 0 }, { x: bounds.maxX, z: 0, dx: 1, dz: 0 },
  { x: 65, z: bounds.minZ, dx: 0, dz: -1 }, { x: 65, z: bounds.maxZ, dx: 0, dz: 1 },
  ...[-1, 1].flatMap((dx) => [-1, 1].map((dz) => ({ x: dx < 0 ? bounds.minX : bounds.maxX,
    z: dz < 0 ? bounds.minZ : bounds.maxZ, dx, dz }))),
];
