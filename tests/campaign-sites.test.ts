import test from "node:test";
import assert from "node:assert/strict";
import { HULL_BUILD, HULL_COLLIDERS, RECIPES, SOURCES, TECH_RECORDS, type ItemKind, type RecipeId } from "../src/content/registry.js";
import { STOP_IDS, WORKING_STOPS, YARD_BUILD } from "../src/content/stops.js";
import { SITES } from "../src/content/regions/sites.js";
import { workPose, parkPose } from "../src/content/regions/access.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { atCarrierSupport } from "../src/sim/carrier.js";
import { addItem, containerAccessible, facility, fabricationContainers, supportedServiceSite } from "../src/sim/inventory.js";
import { craft, craftingBlock, readTechRecord } from "../src/sim/progression.js";
import { executeCommand } from "../src/sim/step.js";
import { exposure } from "../src/sim/survival.js";
import { recordStory } from "../src/sim/storyLink.js";
import { hullClearance } from "../src/sim/world.js";
import { validState } from "../src/save/validation.js";
import type { GameState } from "../src/sim/types.js";
import { at, creelFirst, creelOf, fund, parkCreel, saveable, world } from "./b1-support.js";

/** Rule-staged: the Creel route's plans through C05 and C07, the 450 m suit, and
 * the specialist plates read. Materials are placed in the diver hold or a stop
 * locker; every build and restoration is the real `craft`. */
function campaignReady(): GameState {
  const s = creelFirst(["creel_350"]);
  for (const id of ["C03", "C07"] as const) recordStory(s, id);
  fund(s, "suit_450");
  readTechRecord(s, "canopy_glider_log"); readTechRecord(s, "yard_tender_plate");
  saveable(s);
  return s;
}
function stock(s: GameState, id: RecipeId, container = "diver"): void {
  for (const [k, q] of Object.entries(RECIPES[id].cost)) addItem(s, k as ItemKind, q, container);
}

test("every stop stands on S2's own work and park poses, clear for a diver and a medium hull", () => {
  for (const id of STOP_IDS) {
    const stop = WORKING_STOPS[id], site = SITES.find((x) => x.id === stop.s2)!;
    assert.ok(site, id);
    assert.deepEqual(stop.mooring, parkPose(site, worldFloor), id);
    if (id !== "stack_yard") assert.deepEqual(stop.work, workPose(site, worldFloor), id);
    assert.ok(world.clearance(stop.work, { radius: 0.34, height: id === "stack_yard" ? 1.75 : 0.95 }), `${id} diver`);
    assert.ok(hullClearance(world, stop.mooring, HULL_COLLIDERS.creel), `${id} mooring`);
  }
  // Yard slips: each pose clears the floor, S2's cradles and pier, and every other slip.
  for (const [hull, b] of Object.entries(YARD_BUILD)) {
    assert.ok(hullClearance(world, b.pose, HULL_COLLIDERS[hull as keyof typeof YARD_BUILD]), hull);
    for (const [other, o] of Object.entries(YARD_BUILD)) if (other !== hull)
      assert.ok(Math.hypot(b.pose.x - o.pose.x, b.pose.z - o.pose.z) > HULL_COLLIDERS[hull as keyof typeof YARD_BUILD].radius +
        HULL_COLLIDERS[other as keyof typeof YARD_BUILD].radius, `${hull} clear of ${other}`);
    assert.ok(Math.hypot(b.pose.x - WORKING_STOPS.stack_yard.work.x, b.pose.z - WORKING_STOPS.stack_yard.work.z) >
      HULL_COLLIDERS[hull as keyof typeof YARD_BUILD].radius + 1, `${hull} clear of the pier work pose`);
  }
});

test("the Rift station is dark until restored by a carried diver load; then it is air, rest, service and a locker", () => {
  const s = campaignReady(), stop = WORKING_STOPS.rift_station;
  at(s, stop.work);
  assert.equal(exposure(s).refuge, false, "dark station");
  assert.equal(containerAccessible(s, "rift_station_locker"), false, "locked until restored");
  assert.equal(craftingBlock(s, "restore_rift_station", world)?.code, "materials");
  stock(s, "restore_rift_station");
  const before = structuredClone(s);
  at(s, { ...stop.work, x: stop.work.x + 10 });
  assert.equal(craftingBlock(s, "restore_rift_station", world)?.code, "site", "only at the station");
  at(s, stop.work);
  assert.equal(craft(s, "restore_rift_station", world), null);
  assert.ok(facility(s, "rift_station") && !facility(before, "rift_station"));
  assert.equal(exposure(s).refuge, true, "restored air");
  assert.ok(containerAccessible(s, "rift_station_locker"));
  assert.match(s.feedback, /materials station restored/i);
  saveable(s);
  // A Creel moored at S2's park pose is serviced there and lends its hold.
  parkCreel(s, stop.mooring);
  creelOf(s).charge = 12;
  assert.equal(supportedServiceSite(s, creelOf(s)), "rift_station");
  assert.ok(fabricationContainers(s, "rift_station").includes(creelOf(s).cargoId));
  // The diver swims the few metres from the station door to the craft's service socket.
  at(s, { ...stop.mooring, x: stop.mooring.x + 3 });
  const served = executeCommand(s, { type: "service", vehicleId: creelOf(s).id }, world);
  assert.ok(!served.events.some((e) => e.type === "notice" && e.error), JSON.stringify(served.events));
  assert.equal(creelOf(served.state).charge, 100);
  saveable(served.state);
  // Tampering with the facility without its paid restoration is refused.
  const forged = structuredClone(before); forged.world.facilities.find((f) => f.id === "rift_station")!.repaired = true;
  assert.equal(validState(forged), false);
});

test("the Divide dock needs the 450 m suit and lattice; the Meridian office works from New Game", () => {
  const s = campaignReady(), dock = WORKING_STOPS.divide_dock;
  at(s, dock.work); stock(s, "restore_divide_stop");
  assert.equal(craft(s, "restore_divide_stop", world), null);
  assert.ok(facility(s, "divide_dock") && exposure(s).refuge);
  saveable(s);
  const office = WORKING_STOPS.meridian_office;
  at(s, office.work);
  assert.equal(exposure(s).refuge, true, "office air without restoration");
  parkCreel(s, office.mooring);
  assert.equal(supportedServiceSite(s, creelOf(s)), "meridian_office");
});

test("the yard builds the Hush, Spindle and Mantle on their slips, and the Hearthline in two stages, all saveable", () => {
  let s = campaignReady();
  const yard = WORKING_STOPS.stack_yard;
  at(s, yard.work);
  for (const id of ["hush_base", "spindle_base"] as const) {
    stock(s, id, "stack_yard_locker");
    assert.equal(craft(s, id, world), null, id);
    const hull = id === "hush_base" ? "hush" : "spindle", v = s.fleet.vehicles.find((x) => x.hull === hull)!;
    assert.deepEqual(v.pose.position, HULL_BUILD[hull].pose);
    assert.deepEqual(v.investment, RECIPES[id].cost);
    saveable(s);
    assert.equal(craftingBlock(s, id, world)?.code, "duplicate-hull");
  }
  // The Mantle's 450 m suit gate and its late materials.
  stock(s, "mantle_base", "stack_yard_locker");
  assert.equal(craft(s, "mantle_base", world), null);
  saveable(s);
  // Carrier: the keel is a recorded stage, the fit-out launches the hull with its docking interface.
  for (const v of s.fleet.vehicles.filter((x) => x.hull !== "creel")) v.pose.position = { x: 520, y: -6, z: -40 - s.fleet.vehicles.indexOf(v) * 12 };
  stock(s, "hearthline_keel", "stack_yard_locker");
  // The diver hold and locker cannot hold the whole keel; a Creel at the berth lends its hold.
  parkCreel(s, yard.mooring);
  const hold = creelOf(s).cargoId;
  for (const item of s.inventory.items.filter((i) => i.containerId === "stack_yard_locker")) item.containerId = hold;
  assert.equal(craft(s, "hearthline_keel", world), null);
  assert.equal(s.fleet.docking, null);
  saveable(s);
  assert.equal(craftingBlock(s, "hearthline_keel", world)?.code, "duplicate-hull", "one keel at a time");
  stock(s, "hearthline_base", hold);
  creelOf(s).pose.position = { x: 520, y: -6, z: -10 };
  for (const item of s.inventory.items.filter((i) => i.containerId === hold)) item.containerId = "stack_yard_locker";
  // The fit-out stock exceeds the 48 CU store; the rest rides in the diver hold.
  const store = s.inventory.items.filter((i) => i.containerId === "stack_yard_locker");
  let used = 0;
  for (const item of store) { used += item.quantity; if (used > 40) item.containerId = "diver"; }
  assert.equal(craft(s, "hearthline_base", world), null, s.feedback);
  const h = s.fleet.vehicles.find((x) => x.hull === "hearthline")!, dock = s.fleet.docking as GameState["fleet"]["docking"];
  assert.ok(dock && dock.vehicleId === h.id && dock.stationKeeping);
  assert.ok(atCarrierSupport(h) && dock.supportedDock, "the yard berth is a supported dock");
  assert.deepEqual(h.investment, Object.fromEntries(Object.entries({ ...RECIPES.hearthline_keel.cost }).map(([k, q]) =>
    [k, q + ((RECIPES.hearthline_base.cost as Record<string, number>)[k] ?? 0)]).concat(
    Object.entries(RECIPES.hearthline_base.cost).filter(([k]) => !(k in RECIPES.hearthline_keel.cost)))));
  saveable(s);
  // A campaign save names at most one of each hull, and a carrier implies its docking interface.
  const second = structuredClone(s); second.fleet.vehicles.push({ ...structuredClone(h), id: "hearthline_99" });
  assert.equal(validState(second), false);
  const orphan = structuredClone(s); orphan.fleet.docking = null;
  assert.equal(validState(orphan), false);
});

test("a save that has scanned every source, record and the filter flow validates (S9's 48-scan cap lifted)", () => {
  const s = campaignReady();
  s.knowledge.scans = [...new Set([...s.knowledge.scans, "filter_flow", ...Object.keys(SOURCES), ...Object.keys(TECH_RECORDS)])] as never;
  // Reading every technical record grants its plans, as validation derives them.
  for (const id of Object.keys(TECH_RECORDS) as (keyof typeof TECH_RECORDS)[]) for (const bp of TECH_RECORDS[id].blueprints)
    if (!s.knowledge.blueprints.includes(bp)) s.knowledge.blueprints.push(bp);
  assert.ok(s.knowledge.scans.length > 48);
  saveable(s);
  const dup = structuredClone(s); dup.knowledge.scans.push(dup.knowledge.scans[0]!);
  assert.equal(validState(dup), false, "duplicates still refused");
});
