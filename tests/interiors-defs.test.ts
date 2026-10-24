/** ENV-1 stage 1: the real definitions through the whole validator, on today's
 * terrain (the dormitory and the pump house) or a flat stand-in for OP-1's
 * unbuilt island (the field station and the cold store). The states here are
 * stand-ins with the craft and suit each first visit names; the library check
 * (`interiors-scenarios.heavy.test.ts`) plays the same proof from the route's
 * real SAVE-1 saves. */
import test from "node:test";
import assert from "node:assert/strict";
import { BASIN_DORMITORY, COLD_STORE, FIELD_STATION, PUMP_HOUSE } from "../src/content/interiors/index.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { validateInterior } from "../src/sim/interiors/validate.js";
import { createWorldQueries } from "../src/sim/world.js";
import { fixtureState, flatWorld } from "./interiors-support.js";

const terrain = createWorldQueries([], worldFloor);

test("the Basin dormitory passes on the shelf's terrain, from the Dart above the landing", () => {
  const state = fixtureState("suit_350", "dart");
  assert.deepEqual(validateInterior({ def: BASIN_DORMITORY, exterior: terrain, scenarios: BASIN_DORMITORY.firstAccess.map((access) => ({ access, state })) }), []);
});

test("the pump house passes on the reef's terrain, swimming from the surface and from a parked Dart", () => {
  const swimmer = fixtureState("suit_150"), withDart = fixtureState("suit_350", "dart");
  const scenarios = PUMP_HOUSE.firstAccess.map((access) => ({ access, state: access.craft ? withDart : swimmer }));
  assert.deepEqual(validateInterior({ def: PUMP_HOUSE, exterior: terrain, scenarios }), []);
});

test("the field station and the cold store pass walked on a flat stand-in for the island", () => {
  const walker = fixtureState("suit_150");
  assert.deepEqual(validateInterior({ def: FIELD_STATION, exterior: flatWorld(28), scenarios: FIELD_STATION.firstAccess.map((access) => ({ access, state: walker })) }), []);
  // The store is cut into the hill: ground at its floor, and the shaft open below.
  const hill = createWorldQueries([], (x, z) => Math.abs(x + 232) < 0.6 && z > 3 + 7.6 && z < 3 + 8.8 ? 0 : 24);
  assert.deepEqual(validateInterior({ def: COLD_STORE, exterior: hill, scenarios: COLD_STORE.firstAccess.map((access) => ({ access, state: walker })) }), []);
});
