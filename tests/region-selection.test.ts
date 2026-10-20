import test from "node:test";
import assert from "node:assert/strict";
import { ROUTE_REGIONS } from "../src/content/routes.js";
import { adjoiningRegion, legacyRegionMap, primaryRegion, type RenderRegion } from "../src/render/regions.js";
import type { Vec3 } from "../src/sim/types.js";
import type { RegionId } from "../src/content/registry.js";

/** The renderer's former hardcoded selection, kept verbatim as the reference. */
function oldRegionAt(p: Readonly<Vec3>): RenderRegion {
  const basin = ROUTE_REGIONS.silt_basin.bounds, canopy = ROUTE_REGIONS.suspended_garden.bounds;
  if (p.x >= basin.minX && p.z <= basin.maxZ) return "silt_basin";
  if (p.x >= canopy.minX && p.z <= canopy.maxZ) return "suspended_garden";
  if (p.z < -22 && p.x > -30 && p.x < 70) return "island_chain";
  return "refuge_reef";
}
function oldAdjoining(region: RenderRegion, p: Readonly<Vec3>): RenderRegion {
  switch (region) {
    case "silt_basin": return "suspended_garden";
    case "suspended_garden": return p.z < -154 ? "silt_basin" : "refuge_reef";
    case "island_chain": return p.x > 42 && p.z < -52 ? "suspended_garden" : "refuge_reef";
    case "refuge_reef": return p.x > 48 && p.z < -48 ? "suspended_garden" : "island_chain";
  }
}
function oldPrimary(previous: RenderRegion | null, p: Readonly<Vec3>): RenderRegion {
  let next = oldRegionAt(p);
  const edge = ROUTE_REGIONS.silt_basin.bounds.maxZ;
  if (previous === "suspended_garden" && next === "silt_basin" && p.z > edge - 8) next = previous;
  if (previous === "silt_basin" && next === "suspended_garden" && p.z < edge + 8) next = previous;
  return next;
}
const random = (seed: number) => () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);

test("the map reproduces the former handover lines exactly, including their strict edges", () => {
  const map = legacyRegionMap();
  const next = random(7);
  const lines = [-30, -22, 42, 48, 70, 72, 98, -48, -52, -70, -154, -184];
  for (let i = 0; i < 40_000; i++) {
    // Half the samples sit exactly on, or one ulp beside, a handover line.
    let x = -76 + next() * 324, z = -320 + next() * 386;
    if (i % 2) {
      const line = lines[Math.floor(next() * lines.length)]!, nudge = [0, 1e-12, -1e-12][i % 3]!;
      if (line > -30 && next() < .5) x = line + nudge; else z = line + nudge;
    }
    const p = { x, y: -10, z };
    const region = oldRegionAt(p);
    assert.equal(map.regionAt(p), region, `${x},${z}`);
    assert.equal(adjoiningRegion(map, region, p), oldAdjoining(region, p), `${region} at ${x},${z}`);
  }
});

test("the detailed pair along random swims equals the former selection", () => {
  const map = legacyRegionMap();
  const next = random(11);
  let differences = 0, steps = 0, primaryChanges = 0;
  for (let walk = 0; walk < 400; walk++) {
    let p = { x: -60 + next() * 290, y: -10, z: -300 + next() * 350 };
    let previous: RegionId | null = null, old: RenderRegion | null = null;
    for (let i = 0; i < 300; i++) {
      const heading = next() * Math.PI * 2, stride = 0.5 + next() * 3.5;
      p = { x: Math.max(-76, Math.min(248, p.x + Math.cos(heading) * stride)), y: p.y,
        z: Math.max(-320, Math.min(66, p.z + Math.sin(heading) * stride)) };
      const now = primaryRegion(map, p, previous);
      old = oldPrimary(old, p);
      if (now !== previous) primaryChanges++;
      previous = now;
      const pair = new Set([now, adjoiningRegion(map, now!, p)]);
      const reference = new Set([old, oldAdjoining(old, p)]);
      if (pair.size !== reference.size || [...pair].some(r => !reference.has(r as RenderRegion))) differences++;
      steps++;
    }
  }
  assert.ok(primaryChanges > 500, "the swims cross handover lines often");
  assert.equal(differences, 0, `${differences} of ${steps} steps draw a different detailed pair`);
});
