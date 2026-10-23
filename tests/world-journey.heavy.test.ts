import test from "node:test";
import assert from "node:assert/strict";
import { regionAtPoint } from "../src/content/regions/layout.js";
import { RECIPES, type ItemKind } from "../src/content/registry.js";
import { WORKING_STOPS } from "../src/content/stops.js";
import { addItem, facility } from "../src/sim/inventory.js";
import { executeCommand, stepGame } from "../src/sim/step.js";
import { exposure } from "../src/sim/survival.js";
import { recordStory } from "../src/sim/storyLink.js";
import type { GameState, Vec3 } from "../src/sim/types.js";
import { at, creelFirst, creelOf, fund, parkCreel, pilotCreel, saveable, world } from "./b1-support.js";
import { drive, leg, pathLength } from "./journey-support.js";

/** Rule-staged preparation: an 800 m Creel and suit, earned through the real
 * recipes at the workshop (b1-support `fund`), then parked at the B1 Basin
 * station mooring where the earned route already ends. After that, only
 * ordinary look/move input and real commands (reserve, service, craft). */
function deepFleet(): GameState {
  const s = creelFirst(["creel_350"]);
  recordStory(s, "C07");
  for (const id of ["suit_450", "creel_450", "suit_800", "creel_800"] as const) fund(s, id);
  assert.equal(creelOf(s).rating, 800);
  saveable(s);
  return s;
}
const BASIN_STATION_MOORING: Vec3 = { x: 216, y: -166, z: -232 };
const regionOf = (p: Vec3): string | null => regionAtPoint(p.x, p.z);

test("JOURNEY: a piloted Creel crosses Basin → Rift → Divide → Meridian works, services at the staging office and returns", () => {
  let s = deepFleet();
  parkCreel(s, BASIN_STATION_MOORING);
  const creel = pilotCreel(s);
  const office = WORKING_STOPS.meridian_office.mooring;
  const out = [
    ...leg("route.basin.legacy_anchorage"),
    ...leg("route.basin.rift").slice(1),
    ...leg("route.rift.ceramic").slice(1),
    ...leg("route.rift.divide_flank").slice(1),
    ...leg("route.divide.lattice_west", { reverse: true }).slice(1),
    ...leg("route.divide.meridian_broad").slice(1),
    ...leg("route.meridian.terraces").slice(1),
  ];
  const toOffice = [...leg("route.meridian.terraces", { reverse: true }), { ...office }];
  // Climb clear of the staging office's roof before crossing back to the shelf.
  const home = [
    { ...office }, { ...office, y: office.y + 12 }, { x: 1084, y: office.y + 8, z: -1152 }, ...leg("route.meridian.escarpment"),
    ...leg("route.canopy_east.margin").slice(1),
    ...leg("route.canopy_east.basin").slice(1),
    ...leg("route.basin.legacy_anchorage", { reverse: true }).slice(1),
  ];
  const regions = new Set<string>();
  // Besides look/move, the pilot only tops up from the two carried reserve cells.
  const between = (st: GameState) => {
    const v = st.fleet.vehicles.find((x) => x.id === creel.id)!;
    regions.add(regionOf(v.pose.position) ?? "none");
    return v.charge < 30 && st.inventory.items.some((i) => i.kind === "reserve_cell" && (i.charge ?? 0) > 0)
      ? { type: "reserve" as const, vehicleId: creel.id } : null;
  };
  const first = drive(s, out, { between, reach: 6 });
  s = first.state;
  const works = creelOf(s).pose.position;
  assert.ok(works.y < -740, `reached the works floor (${works.y.toFixed(1)} m)`);
  assert.equal(regionOf(works), "deep_district");
  saveable(s);
  const second = drive(s, toOffice, { between, reach: 3 });
  s = second.state;
  const low = creelOf(s).charge;
  // The staging office works from New Game: service from the helm at its mooring.
  const serviced = executeCommand(s, { type: "service", vehicleId: creel.id }, world);
  assert.ok(!serviced.events.some((e) => e.type === "notice" && e.error), JSON.stringify(serviced.events));
  s = serviced.state;
  assert.equal(creelOf(s).charge, 100);
  saveable(s);
  const third = drive(s, home, { between, reach: 6 });
  s = third.state;
  const end = creelOf(s).pose.position;
  assert.ok(Math.hypot(end.x - BASIN_STATION_MOORING.x, end.z - BASIN_STATION_MOORING.z) < 8, "returned to the Basin station mooring");
  for (const r of ["silt_basin", "thermal_rift", "brine_divide", "deep_district", "suspended_garden"]) assert.ok(regions.has(r), r);
  assert.ok(creelOf(s).health > 50, `hull ${creelOf(s).health.toFixed(1)}`);
  assert.equal([first, second, third].flatMap((d) => d.events).filter((e) => e.type === "foundation-boundary").length, 0, "no world-edge stop");
  saveable(s);
  console.log(`creel journey: out ${pathLength(out).toFixed(0)} m in ${(first.steps / 60).toFixed(0)} s; office ${(second.steps / 60).toFixed(0)} s, ` +
    `serviced from ${low.toFixed(1)}% (reserve uses ${first.extra.length + second.extra.length}); home ${pathLength(home).toFixed(0)} m in ${(third.steps / 60).toFixed(0)} s, charge ${creelOf(s).charge.toFixed(1)}%, hull ${creelOf(s).health.toFixed(1)}`);
});

test("JOURNEY: a diver swims Basin → Rift, restores and breathes at the materials station, then swims on to the Divide", () => {
  let s = deepFleet();
  at(s, { ...BASIN_STATION_MOORING, y: BASIN_STATION_MOORING.y + 2 });
  const startHealth = s.player.vitals.health;
  // The diver carries the station's restoration stock (14 of the hold's 16 CU).
  for (const [k, q] of Object.entries(RECIPES.restore_rift_station.cost)) addItem(s, k as ItemKind, q, "diver");
  const station = WORKING_STOPS.rift_station;
  const toStation = [...leg("route.basin.legacy_anchorage"), ...leg("route.basin.rift").slice(1), { ...station.work }];
  let swim = drive(s, toStation, { reach: 2, sprint: true, stallSeconds: 20 });
  s = swim.state;
  const arrived = s.player.vitals.oxygen, firstLeg = swim.steps / 60;
  assert.ok(arrived > 0, `arrived with ${arrived.toFixed(0)}% oxygen`);
  assert.ok(s.player.vitals.health >= startHealth, "no harm on the way");
  assert.equal(exposure(s).refuge, false, "a dark station gives no air");
  const restored = executeCommand(s, { type: "craft", recipeId: "restore_rift_station" }, world);
  assert.ok(!restored.events.some((e) => e.type === "notice" && e.error), JSON.stringify(restored.events));
  s = restored.state;
  assert.ok(facility(s, "rift_station") && exposure(s).refuge, "restored station air");
  // Hold station and breathe to full (20%/s) before the next leg.
  for (let i = 0; i < 10 * 60 && s.player.vitals.oxygen < 100; i++) s = stepGame(s, [], world).state;
  assert.equal(s.player.vitals.oxygen, 100);
  saveable(s);
  const onward = [{ ...station.work }, ...leg("route.rift.ceramic"), ...leg("route.rift.divide_flank").slice(1)];
  const healthBefore = s.player.vitals.health;
  swim = drive(s, onward, { reach: 3, sprint: true, stallSeconds: 20 });
  const lost = swim.events.filter((e) => e.type === "notice" && e.channel === "hazard").map((e) => (e as { message: string }).message);
  s = swim.state;
  const p = s.player.pose.position;
  assert.equal(regionOf(p), "brine_divide");
  assert.ok(Math.hypot(p.x - 336.5, p.z + 1188.5) < 6, "at the western lattice ledge");
  assert.ok(s.player.vitals.health >= healthBefore, `health ${healthBefore.toFixed(1)} → ${s.player.vitals.health.toFixed(1)}: ${[...new Set(lost)].join(" | ")}`);
  saveable(s);
  console.log(`diver journey: Basin → station ${pathLength(toStation).toFixed(0)} m in ${firstLeg.toFixed(0)} s (${arrived.toFixed(0)}% O2 left); ` +
    `station → Divide ${pathLength(onward).toFixed(0)} m in ${(swim.steps / 60).toFixed(0)} s (${s.player.vitals.oxygen.toFixed(0)}% O2 left)`);
});
