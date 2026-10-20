import test from "node:test";
import assert from "node:assert/strict";
import { EVIDENCE, HULLS, HULL_COLLIDERS, ITEMS, PLACES, RECIPES, SOURCES, FUTURE_BLUEPRINTS } from "../src/content/registry.js";
import type { MaterialId, RecipeId } from "../src/content/registry.js";
import { BASIN_GEOMETRY, BASIN_SOURCE_IDS, CANOPY_BASIN_ROUTE, LEGACY_TERRAIN_SOURCE_IDS, LEGACY_WORLD_BOUNDS, WORLD_VERTICAL_BOUNDS } from "../src/content/routes.js";
import { createGame } from "../src/sim/state.js";
import { addItem, available, fabricationContainers, transfer } from "../src/sim/inventory.js";
import { collect, completeOpening, craft, discover, pendingCampaignWork, personalLimit } from "../src/sim/progression.js";
import { personalLimit as capabilityLimit, personalDepth } from "../src/sim/capabilities.js";
import { aimedInteraction, interactionHost } from "../src/sim/targeting.js";
import { interactions } from "../src/sim/progression.js";
import { executeCommand } from "../src/sim/step.js";
import { exitBlock, exit } from "../src/sim/vehicles.js";
import { createWorldQueries, hullFloor, legacyTerrainHeight, SOLIDS, sweptHullClearance, terrainHeight, WORLD_BOUNDS } from "../src/sim/world.js";
import { createEnvelope, decodeSave, encodeSave } from "../src/save/codec.js";
import { validState } from "../src/save/validation.js";
import type { GameState } from "../src/sim/types.js";
const world = createWorldQueries();
const meta = { sessionId: "m2-route-diagnostic", createdAt: "2026-10-18T00:00:00.000Z", savedAt: "2026-10-18T01:00:00.000Z" };
function saveable(s: GameState): void {
  assert.ok(validState(s));
  const encoded = encodeSave(createEnvelope(s, meta)); assert.ok(encoded.ok, encoded.ok ? "" : encoded.error);
  const decoded = decodeSave(encoded.value); assert.ok(decoded.ok); assert.deepEqual(decoded.value.state, s);
}
// Paid rule fixture with explicitly seeded inputs; no earned travel/source claim.
function prepared(): GameState {
  const s = createGame(); completeOpening(s); for (const id of ["C02", "C03", "C04"] as const) discover(s, id);
  for (const id of ["pod_repair", "essential_tools", "suit_150", "salvage_buoy", "reserve_cells", "bobbin_kit", "restore_workshop", "dart_base"] as RecipeId[]) {
    const r = RECIPES[id]; s.player.pose.position = { ...PLACES[r.site === "island_workshop" ? "island_workshop" : "home_pod"].position };
    if (!r.maintenance) for (const [kind, q] of Object.entries(r.cost)) addItem(s, kind as MaterialId, q, "diver");
    assert.equal(craft(s, id, world), null, id);
  }
  saveable(s); return s;
}
function payRefit(s: GameState): void {
  for (const [kind, q] of Object.entries(RECIPES.suit_350.cost)) addItem(s, kind as MaterialId, q, "workshop_locker");
}
function aimAt(s: GameState, id: string): void {
  const t = interactions(s).find(t => t.id === id)!;
  const h = interactionHost(s, t), p = s.player.pose.position;
  const dx = h.center.x - p.x, dy = h.center.y - p.y - 0.65, dz = h.center.z - p.z;
  s.player.pose.yaw = (Math.atan2(dx, -dz) + Math.PI * 2) % (Math.PI * 2);
  s.player.pose.pitch = Math.atan2(dy, Math.hypot(dx, dz));
}

// Frozen expedition.3 terrain-shaping sources: id, position and whether it is a food school.
const OLD_SOURCES: [string, number, number, number, boolean][] = [
  ["reef_service_scraps_east", -9, -12, -6, false],
  ["reef_service_scraps_west", -32, -28, -17, false],
  ["reef_glass_ridge_north", -6, -8, 0, false],
  ["reef_glass_ridge_south", -25, -22, -22, false],
  ["reef_ribbon_catch_north", -15, -10, 1, false],
  ["reef_ribbon_catch_south", -33, -25, -24, false],
  ["island_workshop_scraps", 8, 1.2, -35, false],
  ["island_headland_scraps", 32, -20, -36, false],
  ["island_glass_ledge_east", 28, -10, -25, false],
  ["island_glass_ledge_west", -15, -25, -40, false],
  ["island_resin_cove_east", 35, -10, -32, false],
  ["island_resin_cove_west", -18, -20, -36, false],
  ["canopy_grounding_fins_upper", 93, -90, -96, false],
  ["canopy_grounding_fins_lower", 136, -130, -135, false],
  ["canopy_resin_lee_upper", 101, -100, -102, false],
  ["canopy_resin_lee_lower", 144, -140, -143, false],
  ["reef_edible_school_north", 4, -2, 3, true],
  ["reef_edible_school_south", -4, -3, 6, true],
  ["island_shore_crop_east", 13, 1.2, -35, true],
  ["island_shore_crop_west", 5, 1.2, -38, true],
];
const OLD_POSITIONS = OLD_SOURCES.map(([, x, y, z]) => ({ x, y, z }));

test("old terrain domain retains exact source order and equality on a half-metre grid and sensitive datums", () => {
  assert.deepEqual(LEGACY_TERRAIN_SOURCE_IDS, OLD_SOURCES.map(([id]) => id));
  // Independent accepted formula, using only frozen old definitions and original iteration order.
  function oldHeight(x: number, z: number): number {
    let h = -8.8 + Math.sin(x * .105) * .52 + Math.cos(z * .12) * .42 +
      16.8 * Math.exp(-((x - 9) ** 2 / 620 + (z + 57) ** 2 / 680)) +
      13 * Math.exp(-((x + 1) ** 2 / 78 + (z + 62) ** 2 / 115)) +
      18 * Math.exp(-((x - 19) ** 2 / 65 + (z + 64) ** 2 / 90)) -
      155 * Math.max(0, Math.min(1, (x - 42) / 60)) -
      22 * Math.exp(-((x + 32) ** 2 / 190 + (z + 24) ** 2 / 190));
    for (const [, px, py, pz, meal] of OLD_SOURCES) {
      if (py > 0 || meal) continue;
      const w = Math.exp(-((x - px) ** 2 + (z - pz) ** 2) / 18);
      h = h * (1 - w) + (py - .8) * w;
    }
    const smooth = (a: number, b: number, v: number): number => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    const apron = smooth(1, 3, x) * (1 - smooth(16, 18, x)) * smooth(-44, -40, z) * (1 - smooth(-22, -18, z));
    h = h * (1 - apron) + (1.2 - Math.max(0, z + 31) * .55) * apron;
    return x >= 38 && x <= 54 && z >= -60 && z <= -48 ? -13 : h;
  }
  for (let x = -76; x <= 188; x += .5) for (let z = -184; z <= 66; z += .5)
    assert.equal(terrainHeight(x, z), oldHeight(x, z), `${x},${z}`);
  for (const p of [...OLD_POSITIONS,
    { x: 15.6, z: -17.3 }, { x: -13.4, z: -17.98 }, { x: 20, z: -22 },
    { x: 103, z: -122 }, { x: 109, z: -115 }, { x: 116, z: -126 }])
    for (const dx of [-.34, 0, .34, 3.6]) for (const dz of [-.34, 0, .34, 3.6])
      assert.equal(terrainHeight(p.x + dx, p.z + dz), oldHeight(p.x + dx, p.z + dz));
  assert.equal(legacyTerrainHeight(116, -126), oldHeight(116, -126));
  for (const solid of BASIN_GEOMETRY.solids) assert.ok(solid.max.z < LEGACY_WORLD_BOUNDS.minZ - 20,
    "new solids cannot cover any legacy diver, Dart, rib or carrier pose");
});

test("both Canopy approaches, Basin leg and alternate return sweep the actual Dart footprint", () => {
  for (const path of [CANOPY_BASIN_ROUTE.upper, CANOPY_BASIN_ROUTE.quiet, CANOPY_BASIN_ROUTE.basin, CANOPY_BASIN_ROUTE.returnLoop]) {
    assert.ok(sweptHullClearance(world, path, HULL_COLLIDERS.dart), JSON.stringify(path));
    for (const p of path) {
      assert.ok(personalDepth(p) < HULLS.dart.initialDepth);
      assert.ok(p.y - hullFloor(world, p, HULL_COLLIDERS.dart) > .4, "keel terrain reserve");
    }
  }
  assert.ok(WORLD_BOUNDS.minZ < LEGACY_WORLD_BOUNDS.minZ && WORLD_BOUNDS.maxX > LEGACY_WORLD_BOUNDS.maxX);
  assert.ok(!world.clearance({ x: 230, y: WORLD_VERTICAL_BOUNDS.minY - .1, z: -250 }, { radius: .34, height: .95 }));
  assert.equal(world.moveCapsule({ x: 230, y: WORLD_VERTICAL_BOUNDS.minY + 1, z: -250 }, { x: 0, y: -5, z: 0 }, { radius: .34, height: .95 }).position.y, WORLD_VERTICAL_BOUNDS.minY);
  for (const pad of BASIN_GEOMETRY.terrainPads) for (const [x, z] of [[pad.minX, pad.minZ], [pad.maxX, pad.maxZ], [(pad.minX + pad.maxX) / 2, (pad.minZ + pad.maxZ) / 2]])
    assert.ok(terrainHeight(x!, z!) >= pad.y, "no accessible hollow beneath a new recovery obstruction");
});

test("paid refit preserves the single fitted instance, receipts, atomic money/material/capacity semantics and compatible authority", () => {
  let s = prepared(); const suit = structuredClone(s.inventory.items.find(i => i.kind === "suit_150")!);
  assert.equal(personalLimit(s), 150); assert.equal(capabilityLimit(s), 150);
  const before = structuredClone(s); assert.match(craft(s, "suit_350", world)!, /Missing materials at this bench/); assert.deepEqual(s, before);
  payRefit(s);
  const funds = Object.fromEntries(Object.keys(RECIPES.suit_350.cost).map(k => [k, available(s, k as MaterialId, fabricationContainers(s, "island_workshop"))]));
  const paid = executeCommand(s, { type: "craft", recipeId: "suit_350" }, world); s = paid.state;
  assert.ok(!paid.events.some(e => e.type === "notice" && e.error));
  assert.deepEqual(s.inventory.items.find(i => i.id === suit.id), { ...suit, kind: "suit_350" });
  assert.equal(s.inventory.items.filter(i => i.fitted === "suit").length, 1);
  assert.ok(s.knowledge.crafted.includes("suit_150") && s.knowledge.crafted.includes("suit_350"));
  assert.equal(personalLimit(s), 350); assert.equal(capabilityLimit(s), 350); assert.equal(HULLS.dart.initialDepth, 180);
  for (const [k, q] of Object.entries(RECIPES.suit_350.cost)) assert.equal(available(s, k as MaterialId, fabricationContainers(s, "island_workshop")), funds[k]! - q);
  saveable(s);
  const duplicate = structuredClone(s); assert.match(craft(s, "suit_350", world)!, /Already completed/); assert.deepEqual(s, duplicate);
  for (const mutate of [
    (s: GameState) => { s.inventory.items.find(i => i.kind === "suit_350")!.kind = "suit_150"; },
    (s: GameState) => { s.knowledge.crafted = s.knowledge.crafted.filter(id => id !== "suit_150"); },
    (s: GameState) => { addItem(s, "suit_150", 1, "equipment", "suit"); },
    (s: GameState) => { s.inventory.items.find(i => i.kind === "suit_350")!.quantity = 2; },
  ]) { const bad = structuredClone(s); mutate(bad); assert.equal(validState(bad), false); }
});

test("350 protection controls both the Basin exit and source work; all four patches yield useful, saveable cargo", () => {
  let s = prepared(), v = s.fleet.vehicles[0]!;
  v.pose.position = { x: 160, y: -159, z: -199 }; s.player.controlledVehicleId = v.id;
  s.player.mode = "piloting"; s.player.pose = structuredClone(v.pose);
  const before = structuredClone(s); assert.equal(exitBlock(s, world)?.code, "depth"); assert.ok(exit(s, world)); assert.deepEqual(s, before);
  s.player.controlledVehicleId = null; s.player.mode = "swimming"; s.player.pose.position = { ...SOURCES.basin_ridge_salvage_north.position };
  const unsafe = structuredClone(s); assert.match(collect(s, "basin_ridge_salvage_north")!, /personal suit/); assert.deepEqual(s, unsafe);
  s.player.pose.position = { ...PLACES.island_workshop.position }; payRefit(s); assert.equal(craft(s, "suit_350", world), null);
  s.player.controlledVehicleId = v.id; s.player.mode = "piloting"; s.player.pose = structuredClone(v.pose);
  assert.equal(exitBlock(s, world), null); assert.equal(exit(s, world), null); saveable(s);
  let alloy = 0, crust = 0;
  for (const id of BASIN_SOURCE_IDS) {
    const d = SOURCES[id]; assert.ok(-d.position.y >= 160 && -d.position.y <= 175);
    assert.ok(-d.position.y < HULLS.dart.initialDepth && -d.position.y > 150);
    v.pose.position = { ...d.position, y: d.position.y + 4 };
    s.player.pose.position = { ...d.position, z: d.position.z + 2.5 };
    assert.ok(world.clearance(s.player.pose.position, { radius: .34, height: .95 }));
    aimAt(s, id); assert.equal(aimedInteraction(s, world)?.id, id, "a real clear normal view reaches the authored host");
    const pickup = executeCommand(s, { type: "interact", target: id }, world);
    assert.ok(!pickup.events.some(e => e.type === "notice" && e.error), JSON.stringify(pickup.events));
    s = pickup.state; v = s.fleet.vehicles[0]!;
    const item = s.inventory.items.find(i => i.kind === d.item && i.containerId === "diver")!, q = item.quantity;
    if (d.item === "structural_alloy") alloy += q; else crust += q;
    saveable(s); assert.ok(ITEMS[d.item].cu * q >= 2);
    assert.equal(transfer(s, item.id, v.cargoId, q), null); saveable(s);
  }
  assert.equal(alloy, 8); assert.equal(crust, 4);
});

test("real flooded hosts are aimable from clear work poses, retain either evidence order, and do not fabricate future hulls", () => {
  for (const order of [["C05", "C06"], ["C06", "C05"]] as const) {
    let s = prepared(); payRefit(s); assert.equal(craft(s, "suit_350", world), null); s.player.mode = "swimming";
    for (const id of order) {
      s.player.pose.position = { ...BASIN_GEOMETRY[id === "C05" ? "dormitory" : "station"].workPose };
      assert.ok(world.clearance(s.player.pose.position, { radius: .34, height: .95 }));
      aimAt(s, id); assert.equal(aimedInteraction(s, world)?.id, id);
      s = executeCommand(s, { type: "interact", target: id }, world).state;
      assert.ok(s.knowledge.evidence.some(e => e.id === id && e.provenance === EVIDENCE[id].provenance));
      saveable(s);
    }
    assert.deepEqual(s.knowledge.evidence.slice(-2).map(e => e.id), order);
    assert.equal(s.knowledge.journals.length, 0); assert.ok(!s.knowledge.markers.includes("home_pod") || s.knowledge.markers.length <= Object.keys(PLACES).length);
    for (const bp of ["bp_creel_service", "bp_carrier_basin", "bp_rift_pressure"] as const) assert.ok(s.knowledge.blueprints.includes(bp));
    // M2-B1: C05's service plans now build the Creel. S9 registers the carrier keel, but it
    // is done at the stack-yard berth, which the simulation refuses until C3 places it.
    for (const id of ["hearthline_keel", "hearthline_base"] as const) assert.ok(pendingCampaignWork(id), id);
    assert.equal(RECIPES.creel_base.bp, "bp_creel_service");
    assert.ok(Object.hasOwn(FUTURE_BLUEPRINTS, "bp_carrier_basin"));
    assert.equal(BASIN_GEOMETRY.airVolumes.length, 0); assert.ok(SOLIDS.some(s => s.id === "basin.station.console"));
  }
});
