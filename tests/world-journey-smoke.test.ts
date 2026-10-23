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
import { drive, leg } from "./journey-support.js";

// Fast smokes of the deep journeys (TT-1): the same preparation and commands
// without the long drives, which run in full in tests/world-journey.heavy.test.ts.

function deepFleet(): GameState {
  const s = creelFirst(["creel_350"]);
  recordStory(s, "C07");
  for (const id of ["suit_450", "creel_450", "suit_800", "creel_800"] as const) fund(s, id);
  assert.equal(creelOf(s).rating, 800);
  saveable(s);
  return s;
}
const BASIN_STATION_MOORING: Vec3 = { x: 216, y: -166, z: -232 };

test("smoke: a piloted 800 m Creel leaves the Basin station mooring along the first leg; the Meridian staging office services it from the helm", () => {
  let s = deepFleet();
  parkCreel(s, BASIN_STATION_MOORING);
  const creel = pilotCreel(s);
  const first = drive(s, leg("route.basin.legacy_anchorage").slice(0, 3), { reach: 6 });
  s = first.state;
  assert.equal(regionAtPoint(creelOf(s).pose.position.x, creelOf(s).pose.position.z), "silt_basin");
  assert.equal(first.events.filter((e) => e.type === "foundation-boundary").length, 0, "no world-edge stop");
  saveable(s);
  const office = WORKING_STOPS.meridian_office.mooring;
  parkCreel(s, office); pilotCreel(s);
  creelOf(s).charge = 20;
  const serviced = executeCommand(s, { type: "service", vehicleId: creel.id }, world);
  assert.ok(!serviced.events.some((e) => e.type === "notice" && e.error), JSON.stringify(serviced.events));
  assert.equal(creelOf(serviced.state).charge, 100);
  saveable(serviced.state);
});

test("smoke: a diver at the dark Rift materials station restores it, then breathes to full in its air", () => {
  let s = deepFleet();
  for (const [k, q] of Object.entries(RECIPES.restore_rift_station.cost)) addItem(s, k as ItemKind, q, "diver");
  const station = WORKING_STOPS.rift_station;
  at(s, { ...station.work });
  s.player.vitals.oxygen = 40;
  assert.equal(exposure(s).refuge, false, "a dark station gives no air");
  const restored = executeCommand(s, { type: "craft", recipeId: "restore_rift_station" }, world);
  assert.ok(!restored.events.some((e) => e.type === "notice" && e.error), JSON.stringify(restored.events));
  s = restored.state;
  assert.ok(facility(s, "rift_station") && exposure(s).refuge, "restored station air");
  for (let i = 0; i < 10 * 60 && s.player.vitals.oxygen < 100; i++) s = stepGame(s, [], world).state;
  assert.equal(s.player.vitals.oxygen, 100);
  saveable(s);
});
