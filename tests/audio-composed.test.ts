import test from "node:test";
import assert from "node:assert/strict";
import { PLACES, REGIONS } from "../src/content/registry.js";
import type { RegionId } from "../src/content/registry.js";
import { regionAtPoint, regionAtPosition } from "../src/content/regions/layout.js";
import { legacyArtRegionAt } from "../src/render/regions.js";
import { sceneFromState } from "../src/audio/scene.js";
import { REGION_AMBIENCE } from "../src/audio/profiles.js";
import { SiltwakeAudio } from "../src/audio/director.js";
import { completeOpening } from "../src/sim/progression.js";
import { createGame } from "../src/sim/state.js";
import type { GameState, Vec3 } from "../src/sim/types.js";

// STEW-1, F11: audio's region is the semantic region map's (`regionAtPoint`), the
// answer optics, the timeline and the HUD use; the legacy art map is art residency only.

/** One point inside each region, away from its edges, including the three the legacy art map never named. */
const INSIDE: Readonly<Record<RegionId, Vec3>> = {
  refuge_reef: { x: 0, y: -2, z: 10 },
  island_chain: { x: 450, y: -4, z: 50 },
  suspended_garden: { x: 300, y: -60, z: -150 },
  silt_basin: { x: 500, y: -200, z: -600 },
  thermal_rift: { x: -200, y: -300, z: -1000 },
  brine_divide: { x: 300, y: -400, z: -1200 },
  deep_district: { x: 1200, y: -700, z: -1300 },
};
const swimmer = (p: Vec3): GameState => {
  const s = createGame(); completeOpening(s);
  s.player.mode = "swimming";
  s.player.pose.position = { ...p };
  return s;
};

test("every region plays its own ambience, the Rift, the Divide and the Deep District included", () => {
  assert.deepEqual(Object.keys(INSIDE).sort(), Object.keys(REGIONS).sort(), "one point per region");
  for (const [id, p] of Object.entries(INSIDE) as [RegionId, Vec3][]) {
    assert.equal(regionAtPoint(p.x, p.z), id, `${id}: the point is inside its footprint`);
    const scene = sceneFromState(swimmer(p), true, regionAtPosition);
    assert.equal(scene.region, id, `${id}: the audio scene's region`);
    assert.ok(REGION_AMBIENCE[scene.region].label.startsWith(REGIONS[id].label.split(" ")[0]!), `${id}: ${REGION_AMBIENCE[scene.region].label}`);
  }
  // The defect fixed: the legacy art map put these three inside the Reef and the Basin.
  assert.equal(legacyArtRegionAt(INSIDE.thermal_rift), "refuge_reef");
  assert.equal(legacyArtRegionAt(INSIDE.brine_divide), "silt_basin");
  assert.equal(legacyArtRegionAt(INSIDE.deep_district), "silt_basin");
});

test("the director resolves regions with the semantic map by default", () => {
  const audio = new SiltwakeAudio({ createContext: () => null, clock: () => 0 });
  for (const [id, p] of Object.entries(INSIDE) as [RegionId, Vec3][]) {
    audio.update(swimmer(p), true);
    assert.equal(audio.region, id, id);
  }
});

test("a point exactly on a region boundary takes the earlier footprint, the same answer everywhere", () => {
  // x = 64 is both the Reef's east edge and the Canopy's west edge (z −230..160); the
  // footprint order puts the Canopy first.
  const edge = { x: 64, y: -10, z: 0 };
  assert.equal(regionAtPoint(edge.x, edge.z), "suspended_garden");
  assert.equal(sceneFromState(swimmer(edge), true, regionAtPosition).region, "suspended_garden");
  // z = −1000 is the Rift–Divide line east of x 180 (the Divide), and the Basin–Divide line.
  assert.equal(regionAtPoint(300, -1000), "silt_basin");
  assert.equal(sceneFromState(swimmer({ x: 300, y: -300, z: -1000 }), true, regionAtPosition).region, "silt_basin");
});

test("outside every footprint the last region holds (S6's nullable policy)", () => {
  const s = swimmer({ ...PLACES.basin_dormitory.position });
  const basin = sceneFromState(s, true, regionAtPosition);
  assert.equal(basin.region, "silt_basin");
  s.player.pose.position = { x: 5000, y: -10, z: 5000 };
  assert.equal(regionAtPosition(s.player.pose.position), null, "outside the authored world");
  assert.equal(sceneFromState(s, true, regionAtPosition, basin.region).region, "silt_basin", "keeps the previous region");
  s.player.pose.position = { ...INSIDE.thermal_rift };
  const rift = sceneFromState(s, true, regionAtPosition, basin.region);
  s.player.pose.position = { x: -5000, y: -10, z: -5000 };
  assert.equal(sceneFromState(s, true, regionAtPosition, rift.region).region, "thermal_rift");
});
