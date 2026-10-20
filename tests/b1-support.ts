import assert from "node:assert/strict";
import { CREEL_BUILD_POSE, RECIPES, type ItemKind, type RecipeId } from "../src/content/registry.js";
import { CANOPY_STOP } from "../src/content/routes.js";
import { createEnvelope, decodeSave, encodeSave } from "../src/save/codec.js";
import { validState } from "../src/save/validation.js";
import { addItem } from "../src/sim/inventory.js";
import { completeOpening, craft, discover } from "../src/sim/progression.js";
import { createGame } from "../src/sim/state.js";
import type { GameState, Vec3, VehicleState } from "../src/sim/types.js";
import { createWorldQueries } from "../src/sim/world.js";

export const world = createWorldQueries();
export const meta = { sessionId: "m2-b1-creel-tests", createdAt: "2026-10-19T00:00:00.000Z", savedAt: "2026-10-19T01:00:00.000Z" };
export const WORKSHOP_BENCH = { x: 10, y: 1.2, z: -34 } as const;
export const POD_BENCH = { x: 0, y: 0.18, z: 21.2 } as const;

/** Every successful command must leave a strict, codec-stable state. */
export function saveable(s: GameState): void {
  assert.ok(validState(s), "strict state");
  const encoded = encodeSave(createEnvelope(s, meta));
  assert.ok(encoded.ok, encoded.ok ? "" : encoded.error);
  const decoded = decodeSave(encoded.value);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.error);
  assert.deepEqual(decoded.value.state, s);
}
export function at(s: GameState, p: Vec3, mode: GameState["player"]["mode"] = p.y < 0 ? "swimming" : "walking"): void {
  s.player.pose.position = { ...p }; s.player.mode = mode; s.player.velocity = { x: 0, y: 0, z: 0 };
  s.player.controlledVehicleId = null; s.player.interiorId = null; s.player.interiorPose = null;
}
/** Rule-staged diagnostic: paid recipes with materials placed at the bench.
 * Not earned traversal; ordinary-control evidence lives in the browser report. */
export function fund(s: GameState, id: RecipeId): void {
  const r = RECIPES[id];
  const bench = r.site === "island_workshop" ? WORKSHOP_BENCH : r.site === "canopy_stop" ? CANOPY_STOP.work : POD_BENCH;
  at(s, bench);
  if (!r.maintenance) for (const [kind, q] of Object.entries(r.cost))
    addItem(s, kind as ItemKind, q, r.site === "island_workshop" && id !== "restore_workshop" ? "workshop_locker" : "diver");
  assert.equal(craft(s, id, world), null, id);
}
/** Staged Creel-first preparation: no Dart is ever built. */
export function creelFirst(extra: readonly RecipeId[] = []): GameState {
  const s = createGame(); completeOpening(s);
  for (const id of ["C02", "C03", "C04", "C05", "C06"] as const) discover(s, id);
  for (const id of ["pod_repair", "essential_tools", "suit_150", "bobbin_kit", "salvage_buoy", "reserve_cells",
    "restore_workshop", "suit_350", "creel_base", ...extra] as RecipeId[]) fund(s, id);
  assert.ok(!s.fleet.vehicles.some((v) => v.hull === "dart"));
  return s;
}
export const creelOf = (s: GameState): VehicleState => s.fleet.vehicles.find((v) => v.hull === "creel")!;
export function parkCreel(s: GameState, p: Vec3, yaw = Math.PI): VehicleState {
  const v = creelOf(s);
  v.pose.position = { ...p }; v.pose.yaw = yaw; v.velocity = { x: 0, y: 0, z: 0 };
  return v;
}
export function pilotCreel(s: GameState): VehicleState {
  const v = creelOf(s);
  s.player.controlledVehicleId = v.id; s.player.interiorId = null; s.player.interiorPose = null;
  s.player.mode = "piloting"; s.player.pose = structuredClone(v.pose); s.player.velocity = { ...v.velocity };
  return v;
}
export { CREEL_BUILD_POSE };
