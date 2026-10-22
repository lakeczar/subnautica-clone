import test from "node:test";
import assert from "node:assert/strict";
import { CROWN_BENCH_SITES, CROWN_FIXED_HOST, CROWN_RECIPES, CROWN_REST_BASE, CROWN_RESTORATIONS, CROWN_STAGES, CROWN_STATION,
  CROWN_WORKING_STOP } from "../src/content/hub/crownStation.js";
import { ITEMS, RECIPES, type FacilityId, type MaterialId } from "../src/content/registry.js";
import { CRAFT_PROFILES, ROUTES } from "../src/content/regions/passages.js";
import { SITES } from "../src/content/regions/sites.js";
import { STRUCTURES } from "../src/content/regions/structures.js";
import { atCrownStation, bunkHealRate, crownBeaconLit, crownBenchServes, crownDockServes, crownLockerCu, crownRefuge, crownServices,
  crownSockets, crownStage, crownSurveyReaches, wakeBase } from "../src/sim/hub/crownStation.js";
import { completeOpening } from "../src/sim/progression.js";
import { createGame } from "../src/sim/state.js";
import type { GameState } from "../src/sim/types.js";
import { gameWorld } from "../src/sim/world.js";
import { creelFirst, parkCreel } from "./b1-support.js";

// W2 phase 2, a deferred PROPOSAL (not imported by the game; see the source
// headers and Sol R1's W2-02..04, fixed at composition). The crown station as
// data and pure rules against C4 stage B's
// interfaces. Composition (tables, survival, fabrication, service) is the
// coordinator's, after C4 stage B; these pin the design it composes.

const world = gameWorld();
const restore = (s: GameState, n: number): GameState => {
  for (const stage of CROWN_STAGES.slice(0, n)) s.world.facilities.push({ id: stage.id as FacilityId, repaired: true });
  return s;
};
const diverAtDoor = (n: number): GameState => {
  const s = restore(createGame(), n); completeOpening(s);
  s.player.pose.position = { ...CROWN_STATION.work }; s.player.mode = "swimming";
  s.player.controlledVehicleId = null; s.player.interiorId = null;
  return s;
};

test("three stages, in order, each one diver load of mid-game materials, starting with the Creel's", () => {
  assert.deepEqual(CROWN_STAGES.map(s => s.id), ["crown_power", "crown_dock", "crown_survey"]);
  const late: MaterialId[] = ["brine_lattice", "thermal_core"];
  CROWN_STAGES.forEach((stage, i) => {
    const cu = Object.entries(stage.cost).reduce((n, [k, q]) => n + ITEMS[k as MaterialId].cu * q!, 0);
    assert.ok(cu >= 12 && cu <= 16, `${stage.id}: ${cu} CU`);
    for (const m of late) assert.ok(!(m in stage.cost), `${stage.id} needs late ${m}`);
    // Each stage needs the one before; the first needs the Creel.
    assert.ok(stage.needs.includes(i === 0 ? "creel_base" : CROWN_STAGES[i - 1]!.recipe), `${stage.id}: needs ${stage.needs}`);
    for (const need of stage.needs) assert.ok(need in RECIPES || need in CROWN_RECIPES, `${stage.id}: unknown need ${need}`);
    assert.equal(CROWN_RESTORATIONS[stage.recipe], stage.id);
    assert.equal(CROWN_RECIPES[stage.recipe]!.site, "crown_station");
  });
  // Stage one's bill is materials a Creel owner already gathers.
  // C4 (CB): the Creel's frame is its frontier material, not part of the crown's bill.
  assert.deepEqual(Object.keys(CROWN_STAGES[0]!.cost).sort(), Object.keys(RECIPES.creel_base.cost).filter(k => k !== "buoyant_resin" && k !== "tagged_frame").sort());
});

test("better than the pod once restored: fast bunk, full bench, a dock, large lockers, six sockets, a survey array, the beacon", () => {
  const none = diverAtDoor(0), all = diverAtDoor(3);
  assert.equal(crownStage(none), 0); assert.equal(crownServices(none).size, 0);
  assert.ok(!crownRefuge(none) && bunkHealRate(none) === CROWN_STATION.refugeHealRate);
  assert.equal(crownStage(all), 3);
  assert.deepEqual([...crownServices(all)].sort(), ["air", "beacon", "dock", "fabricator", "fast_heal", "large_lockers", "locker", "refit_bench",
    "rest", "sockets", "survey"]);
  assert.ok(crownRefuge(all) && atCrownStation(all));
  assert.equal(bunkHealRate(all), CROWN_STATION.refugeHealRate * 3, "three times any other refuge, the pod included");
  assert.ok(crownLockerCu(all) > 48 * 2 && crownSockets(all) === 6 && crownBeaconLit(all));
  // Stage by stage, every service only ever adds.
  let before = new Set<string>();
  for (let n = 1; n <= 3; n++) {
    const now = crownServices(diverAtDoor(n));
    for (const x of before) assert.ok(now.has(x as never), `stage ${n} drops ${x}`);
    assert.ok(now.size > before.size); before = new Set(now);
  }
  // A later stage without the earlier one counts for nothing.
  const skipped = diverAtDoor(0); skipped.world.facilities.push({ id: "crown_survey" as FacilityId, repaired: true });
  assert.equal(crownStage(skipped), 0);
});

test("the bench: its own restorations always; the workshop's refits and the pod's fabrication from the dock stage; never the yard", () => {
  for (const [n, workshop] of [[1, false], [2, true], [3, true]] as const) {
    const s = diverAtDoor(n);
    assert.ok(crownBenchServes(s, "crown_station"));
    for (const site of CROWN_BENCH_SITES) assert.equal(crownBenchServes(s, site), workshop, `stage ${n}: ${site}`);
    assert.equal(crownBenchServes(s, "stack_yard"), false);
  }
  // Only at the door: a diver 10 m away crafts nothing here.
  const away = diverAtDoor(3); away.player.pose.position = { ...CROWN_STATION.work, x: CROWN_STATION.work.x + 10 };
  assert.ok(!crownBenchServes(away, "island_workshop") && !crownRefuge(away));
});

test("the dock charges and repairs a craft moored within its radius once restored; the survey reaches the Basin, the Rift head and the Canopy edge", () => {
  // B1's paid Creel fixture (rule staging, not an earned chain).
  for (const n of [1, 2, 3]) {
    const s = restore(creelFirst(), n), creel = parkCreel(s, { ...CROWN_STATION.dock });
    assert.equal(crownDockServes(s, creel.id), n >= 2, `stage ${n}`);
    parkCreel(s, { ...CROWN_STATION.dock, x: CROWN_STATION.dock.x + CROWN_STATION.dockRadius + 1 });
    assert.equal(crownDockServes(s, creel.id), false, "beyond the dock's radius");
  }
  const s = diverAtDoor(3);
  for (const [name, at] of Object.entries(CROWN_STATION.surveyCovers)) {
    assert.ok(crownSurveyReaches(s, at), `survey misses ${name}`);
    assert.ok(!crownSurveyReaches(diverAtDoor(2), at), `${name}: no survey before stage 3`);
  }
  assert.ok(!crownSurveyReaches(s, { x: 600, z: -1120 }), "the Divide is beyond it");
});

test("waking: at the crown once rested there while it works; the pod whenever the crown has no power", () => {
  assert.equal(wakeBase(diverAtDoor(1), "crown_station"), "crown_station");
  assert.equal(wakeBase(diverAtDoor(0), "crown_station"), "home_pod");
  assert.equal(wakeBase(diverAtDoor(3), "home_pod"), "home_pod");
  assert.deepEqual(Object.keys(CROWN_REST_BASE), ["crown_station"]);
  assert.equal(CROWN_REST_BASE.crown_station.facility, "crown_power");
  assert.equal(CROWN_FIXED_HOST.crown_station.sockets, 6);
  assert.equal(CROWN_FIXED_HOST.crown_station.facility, "crown_survey");
  assert.equal(CROWN_WORKING_STOP.crown_station.facility, "crown_power");
});

test("the station's poses stand in the real world: a diver fits at the door, a medium hull at the dock, both on W2's summit", () => {
  const door = CROWN_STATION.work, dock = CROWN_STATION.dock;
  assert.ok(world.clearance(door, CRAFT_PROFILES.diver), "the diver fits at the door");
  const floor = world.supportHeight(door.x, door.z, door.y + 0.5);
  assert.ok(door.y - floor >= 0 && door.y - floor < 0.6, `door ${(door.y - floor).toFixed(2)} m above its floor`);
  const hull = STRUCTURES.find(x => x.id === "hub.crown_station.hull")!.solids[0]!;
  assert.ok(door.z > hull.max.z && door.x > hull.min.x && door.x < hull.max.x, "the door faces the hull's north side");
  assert.ok(Math.hypot(door.x - (hull.min.x + hull.max.x) / 2, door.z - hull.max.z) < CROWN_STATION.workRadius);
  assert.ok(world.clearance(dock, CRAFT_PROFILES.medium), "a medium hull fits at the dock");
  const site = SITES.find(x => x.id === CROWN_STATION.s2)!;
  assert.ok(Math.hypot(site.at.x - door.x, site.at.z - door.z) < 8);
  // The spur's end and the balcony route's summit end both reach the dock.
  for (const id of ["route.hub.spur", "route.hub.balcony"]) {
    const end = ROUTES.find(r => r.id === id)!.path.at(-1)!;
    assert.ok(Math.hypot(end.x - dock.x, end.y - dock.y, end.z - dock.z) <= CROWN_STATION.dockRadius + 2, `${id} ends ${Math.hypot(end.x - dock.x, end.z - dock.z).toFixed(1)} m from the dock`);
  }
});
