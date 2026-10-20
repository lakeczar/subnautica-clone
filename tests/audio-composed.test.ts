import test from "node:test";
import assert from "node:assert/strict";
import { PLACES } from "../src/content/registry.js";
import { legacyRegionMap, worldRegionAt } from "../src/render/regions.js";
import { sceneFromState } from "../src/audio/scene.js";
import { completeOpening } from "../src/sim/progression.js";
import { createGame } from "../src/sim/state.js";

test("audio regions come from C2's WorldMap; outside every footprint the last region holds (S6's nullable policy)", () => {
  for (const place of ["home_pod", "island_workshop", "canopy_lab", "basin_dormitory"] as const) {
    const p = PLACES[place].position;
    assert.equal(worldRegionAt(p), legacyRegionMap().regionAt(p), place);
    assert.equal(worldRegionAt(p), PLACES[place].region, `${place} resolves to its own region`);
  }
  const s = createGame(); completeOpening(s); s.player.mode = "swimming";
  s.player.pose.position = { ...PLACES.basin_dormitory.position };
  const basin = sceneFromState(s, true, worldRegionAt);
  assert.equal(basin.region, "silt_basin");
  s.player.pose.position = { x: 5000, y: -10, z: 5000 };
  assert.equal(worldRegionAt(s.player.pose.position), null, "outside the authored world");
  assert.equal(sceneFromState(s, true, worldRegionAt, basin.region).region, "silt_basin", "keeps the previous region");
});
