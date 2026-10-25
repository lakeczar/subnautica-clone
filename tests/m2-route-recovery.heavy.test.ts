// M2 route recovery, heavy tier (TT-1): every new patch and site loss endpoint towed home.
// tests/m2-route-recovery.test.ts keeps the rest and a two-endpoint smoke.
import test from "node:test";
import assert from "node:assert/strict";
import { BASIN_SOURCE_IDS, RECOVERY_SURFACE_OPERATOR } from "../src/content/routes.js";
import { HULL_COLLIDERS, PLACES, RECIPES, SOURCES } from "../src/content/registry.js";
import type { MaterialId, RecipeId } from "../src/content/registry.js";
import { createGame } from "../src/sim/state.js";
import { completeOpening, craft, discover } from "../src/sim/progression.js";
import { addItem } from "../src/sim/inventory.js";
import { installModule } from "../src/sim/modules.js";
import { BOBBIN_COLLIDER, disableVehicle, RECOVERY_MOORING, recoveryTowPath, rescueWaypoints, updateRecovery } from "../src/sim/recovery.js";
import { executeCommand } from "../src/sim/step.js";
import { createWorldQueries, sweptHullClearance } from "../src/sim/world.js";
import { createEnvelope, decodeSave, encodeSave } from "../src/save/codec.js";
import { validState } from "../src/save/validation.js";
import type { GameCommand, GameState, Vec3, WorldQueries } from "../src/sim/types.js";

const world = createWorldQueries(), meta = { sessionId: "m2-rescue-diagnostic", createdAt: "2026-10-18T00:00:00.000Z", savedAt: "2026-10-18T00:01:00.000Z" };
function roundTrip(s: GameState): GameState {
  assert.ok(validState(s)); const encoded = encodeSave(createEnvelope(s, meta)); assert.ok(encoded.ok, encoded.ok ? "" : encoded.error);
  const decoded = decodeSave(encoded.value); assert.ok(decoded.ok); assert.deepEqual(decoded.value.state, s); return decoded.value.state;
}
// Seed inputs, then pay the production transactions. Travel and losses remain diagnostics.
function prepared(): GameState {
  const s = createGame(); completeOpening(s); for (const id of ["C02", "C03", "C04"] as const) discover(s, id);
  for (const id of ["pod_repair", "essential_tools", "suit_150", "salvage_buoy", "reserve_cells", "bobbin_kit", "restore_workshop", "dart_base", "dart_acoustic_trim"] as RecipeId[]) {
    const r = RECIPES[id]; s.player.pose.position = { ...PLACES[r.site === "island_workshop" ? "island_workshop" : "home_pod"].position };
    if (!r.maintenance) for (const [k, q] of Object.entries(r.cost)) addItem(s, k as MaterialId, q, "diver");
    assert.equal(craft(s, id, world), null, id);
  }
  const v = s.fleet.vehicles[0]!, module = s.inventory.items.find(i => i.kind === "dart_acoustic_trim")!;
  assert.equal(installModule(s, v.id, module.id), null); addItem(s, "meal", 2, v.cargoId); addItem(s, "silica_glass", 3, v.cargoId);
  s.player.mode = "swimming"; s.player.pose.position = { ...RECOVERY_SURFACE_OPERATOR }; return roundTrip(s);
}
function cmd(s: GameState, c: GameCommand, w: WorldQueries = world): GameState {
  const r = executeCommand(s, c, w); assert.ok(!r.events.some(e => e.type === "notice" && e.error), JSON.stringify(r.events)); return roundTrip(r.state);
}
function advance(s: GameState, stopAtReady: boolean): { state: GameState; seen: Set<string>; ticks: number } {
  const seen = new Set<string>(); let ticks = 0;
  while (s.recovery.operation && !(stopAtReady && s.recovery.operation.phase === "ready")) {
    const op = s.recovery.operation; seen.add(`${op.phase}:${op.waypoint}`);
    const oldPhase = op.phase, oldWaypoint = op.waypoint;
    assert.equal(op.routeId, "basin");
    const notice = updateRecovery(s, world); assert.ok(!(notice?.type === "notice" && notice.error), JSON.stringify(notice));
    if (ticks++ % 120 === 0 || oldPhase !== s.recovery.operation?.phase || oldWaypoint !== s.recovery.operation?.waypoint) s = roundTrip(s);
    assert.ok(ticks < 12000, "bounded complete route");
  }
  return { state: roundTrip(s), seen, ticks };
}

test("all new patch/site loss endpoints tow through every guide and turn with save/reload and exact cargo/module/frame retention", () => {
  const sites: Vec3[] = [...BASIN_SOURCE_IDS.map(id => ({ ...SOURCES[id].position, y: SOURCES[id].position.y + 2 })),
    { x: 178, y: -163.5, z: -219 }, { x: 216, y: -169, z: -241 },
    { x: 240, y: -189, z: -252 }, { x: 40, y: -4, z: -250 }];
  for (const site of sites) {
    let s = prepared(), v = s.fleet.vehicles[0]!; v.pose.position = { ...site }; v.charge = 0; disableVehicle(s, v.id);
    assert.ok(sweptHullClearance(world, rescueWaypoints(s, v.id, "basin"), BOBBIN_COLLIDER), JSON.stringify(site));
    assert.ok(sweptHullClearance(world, recoveryTowPath(s, v.id, "basin"), HULL_COLLIDERS.dart));
    const inventory = structuredClone(s.inventory), investment = structuredClone(v.investment), modules = [...v.modules];
    s = cmd(s, { type: "recover", vehicleId: v.id, method: "tow" }); assert.equal(s.recovery.operation!.routeId, "basin");
    let run = advance(s, true); s = run.state; assert.equal(s.recovery.operation!.phase, "ready");
    assert.deepEqual(s.fleet.vehicles[0]!.pose.position, site, "approach never moves a hull");
    for (const i of [1, 2, 3, 4, 5]) assert.ok(run.seen.has(`approach:${i}`));
    s = cmd(s, { type: "recover", vehicleId: v.id, method: "tow" });
    run = advance(s, false); s = run.state; v = s.fleet.vehicles[0]!;
    for (const i of [0, 1, 2, 3, 4]) assert.ok(run.seen.has(`tow:${i}`));
    assert.deepEqual(v.pose.position, RECOVERY_MOORING); assert.deepEqual(s.inventory, inventory);
    assert.deepEqual(v.modules, modules); assert.deepEqual(v.investment, investment); assert.equal(v.charge, 0); assert.equal(v.health, 0);
    assert.equal(s.recovery.losses.length, 1); assert.deepEqual(s.recovery.losses[0]!.position, RECOVERY_MOORING);
    assert.equal(s.metrics.rescues, 1);
  }
});
