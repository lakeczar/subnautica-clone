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
import { coldStoreHill, fixtureState, flatExterior, realExterior } from "./interiors-support.js";


test("the Basin dormitory passes on the shelf's terrain and solids, from the Dart above the landing", () => {
  const state = fixtureState("suit_350", "dart");
  assert.deepEqual(validateInterior({ def: BASIN_DORMITORY, exterior: realExterior(BASIN_DORMITORY), scenarios: BASIN_DORMITORY.firstAccess.map((access) => ({ access, state })) }), []);
});

test("the pump house is refused, honestly, until stage 2: the reef's undercut cave owns the ground beside it", () => {
  // CA-1's reef_pumphouse_undercut starts 1.35 m east of the building. The exterior
  // contract (terrain and box solids) can't represent a cave, so the validator
  // says so rather than prove it without the cave. Everything else passes.
  const swimmer = fixtureState("suit_150"), withDart = fixtureState("suit_350", "dart");
  const scenarios = PUMP_HOUSE.firstAccess.map((access) => ({ access, state: access.craft ? withDart : swimmer }));
  assert.deepEqual(validateInterior({ def: PUMP_HOUSE, exterior: realExterior(PUMP_HOUSE), scenarios }).map((p) => p.code), ["exterior"]);
});

test("the field station and the cold store pass walked on a flat stand-in for the island", () => {
  const walker = fixtureState("suit_150");
  assert.deepEqual(validateInterior({ def: FIELD_STATION, exterior: flatExterior(28), scenarios: FIELD_STATION.firstAccess.map((access) => ({ access, state: walker })) }), []);
  assert.deepEqual(validateInterior({ def: COLD_STORE, exterior: coldStoreHill, scenarios: COLD_STORE.firstAccess.map((access) => ({ access, state: walker })) }), []);
});

test("terrain under the real-terrain interiors: at most 0.3 m above the floor (stage 2 masks it, as caves' footprints do)", () => {
  // Known gap, filed in the stage 1 handoff: the pump house's shoulder rises up to
  // ~0.29 m above its floor (laid on the lowest terrain so LS-1's logger point
  // stays on it). Stage 2 makes interior footprints replace terrain in the bake.
  for (const def of [BASIN_DORMITORY, PUMP_HOUSE]) {
    let worst = -Infinity;
    for (const r of def.rooms) for (let x = r.bounds.min.x; x <= r.bounds.max.x; x += 0.25) for (let z = r.bounds.min.z; z <= r.bounds.max.z; z += 0.25)
      worst = Math.max(worst, worldFloor(def.anchor.x + x, def.anchor.z + z) - def.anchor.y);
    assert.ok(worst <= 0.3, `${def.id}: terrain ${worst.toFixed(2)} m above the floor`);
  }
});
