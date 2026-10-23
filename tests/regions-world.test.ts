import assert from "node:assert/strict";
import test from "node:test";
import { C4_SOURCES } from "../src/content/c4Sources.js";
import { REGIONS, SOURCES } from "../src/content/registry.js";
import { SOLIDS, terrainHeight } from "../src/sim/world.js";
import { CHUNK_SIZE, WORLD_ENVELOPE, chunkId, columnRect } from "../src/world/frame.js";
import { createWorldMap, validateLayout } from "../src/world/map.js";
import { corridorProblems, routeProblems, siteDatum, sweepHull, type CheckContext } from "../src/content/regions/access.js";
import { footprintFloor } from "../src/content/regions/drape.js";
import { HAZARDS } from "../src/content/regions/hazards.js";
import { regionAtPoint, S2_TERRAIN_SKIP, worldLayout } from "../src/content/regions/layout.js";
import { BASIN_GEOMETRY, CANOPY_BASIN_ROUTE, CANOPY_STOP, RECOVERY_ROUTES, ROUTE_WORLD_BOUNDS } from "../src/content/routes.js";
import { TERRAIN_EXTENT } from "../src/render/terrainSurface.js";
import { ROUTES } from "../src/content/regions/passages.js";
import { RESCUE_PLANS } from "../src/content/regions/rescue.js";
import { FLOOR_PADS, SITES } from "../src/content/regions/sites.js";
import { spatialEntries } from "../src/content/regions/spatial.js";
import { STRUCTURES, STRUCTURE_SOLIDS } from "../src/content/regions/structures.js";
import { LEGACY_BLEND, LEGACY_PRESERVE } from "../src/content/regions/terrain.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";

/** The simulation roster now includes S2's structures; "today's" solids are the rest. */
const S2_SOLID_IDS = new Set(STRUCTURE_SOLIDS.map(s => s.id));
const LEGACY_SOLIDS = SOLIDS.filter(s => !S2_SOLID_IDS.has(s.id));
const ctx: CheckContext = {
  floor: worldFloor, hazards: HAZARDS,
  solids: [...STRUCTURE_SOLIDS, ...LEGACY_SOLIDS.map(s => ({ id: s.id, bounds: { min: s.min, max: s.max } }))],
};
const none = (problems: readonly string[], what: string): void =>
  assert.equal(problems.length, 0, `${what}:\n- ${problems.slice(0, 20).join("\n- ")}`);

test("the preserve holds accepted B1's whole terrain, routes, sources and datums exactly", () => {
  const p = LEGACY_PRESERVE, skip = S2_TERRAIN_SKIP;
  // The preserve contains B1's rendered mesh (the S2 skip extent) and its route bounds.
  for (const b of [skip, ROUTE_WORLD_BOUNDS])
    assert.ok(b.minX >= p.minX && b.maxX <= p.maxX && b.minZ >= p.minZ && b.maxZ <= p.maxZ, "preserve contains B1 extent");
  assert.deepEqual(skip, { minX: TERRAIN_EXTENT.minX, maxX: TERRAIN_EXTENT.maxX, minZ: TERRAIN_EXTENT.minZ, maxZ: TERRAIN_EXTENT.maxZ });
  // Bit-exact on a 0.5 m lattice over B1's whole terrain extent, including the fracture rows.
  let moved = 0, first = "";
  for (let x: number = skip.minX; x <= skip.maxX; x += 0.5) for (let z: number = skip.minZ; z <= skip.maxZ; z += 0.5)
    if (!Object.is(worldFloor(x, z), terrainHeight(x, z))) { moved++; first ||= `${x}, ${z}`; }
  assert.equal(moved, 0, `B1 floor moved at ${moved} samples, first ${first}`);
  // Every registry source and B1 route/structure datum keeps its accepted floor.
  const datums: [string, number, number][] = [
    // B1's own sources; sources lifted from S2 sites and C4's frontier and seed
    // patches are authored outside the preserve, on the composed floor.
    ...Object.entries(SOURCES).filter(([id]) => !SITES.some(s => s.id === id) && !Object.hasOwn(C4_SOURCES, id))
      .map(([id, s]) => [id, s.position.x, s.position.z] as [string, number, number]),
    ...Object.values(CANOPY_BASIN_ROUTE).flatMap(v => Array.isArray(v) ? v.map((q, i) => [`route.${i}`, q.x, q.z] as [string, number, number]) :
      typeof v === "object" ? [["route.pose", (v as { x: number }).x, (v as { z: number }).z] as [string, number, number]] : []),
    ...BASIN_GEOMETRY.solids.map(s => [s.id, (s.min.x + s.max.x) / 2, (s.min.z + s.max.z) / 2] as [string, number, number]),
    ...Object.values(RECOVERY_ROUTES).flatMap(r => [...r.tow, ...r.approach].map(q => ["recovery", q.x, q.z] as [string, number, number])),
    ["canopy.stop.work", CANOPY_STOP.work.x, CANOPY_STOP.work.z], ["canopy.stop.mooring", CANOPY_STOP.mooring.x, CANOPY_STOP.mooring.z],
  ];
  for (const [id, x, z] of datums) {
    assert.ok(x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ, `${id} inside the preserve`);
    assert.ok(Object.is(worldFloor(x, z), terrainHeight(x, z)), `${id}: floor moved at ${x}, ${z}`);
  }
  assert.ok(datums.some(([id]) => id === "basin_frame_fracture"), "includes B1's fracture frame");
});

test("the shared floor keeps today's terrain exactly and covers the envelope", () => {
  const p = LEGACY_PRESERVE;
  for (let x = p.minX; x <= p.maxX; x += 3.7) for (let z = p.minZ; z <= p.maxZ; z += 3.3)
    assert.ok(Object.is(worldFloor(x, z), terrainHeight(x, z)), `legacy floor moved at ${x}, ${z}`);
  let deepest = 0, highest = -Infinity;
  for (let x = WORLD_ENVELOPE.min.x; x <= WORLD_ENVELOPE.max.x; x += 8) for (let z = WORLD_ENVELOPE.min.z; z <= WORLD_ENVELOPE.max.z; z += 8) {
    const h = worldFloor(x, z);
    assert.ok(Number.isFinite(h), `floor not finite at ${x}, ${z}`);
    deepest = Math.min(deepest, h); highest = Math.max(highest, h);
  }
  assert.ok(deepest >= WORLD_ENVELOPE.min.y && deepest <= -770, `deepest floor ${deepest}`);
  assert.ok(highest <= 95 && highest >= 80, `highest land ${highest}`);
  // Continuous across the preserve edge and its blend band: no seams or cliffs.
  for (let x = p.minX - LEGACY_BLEND; x <= p.maxX + LEGACY_BLEND; x += 4) for (const z of [p.minZ, p.maxZ]) {
    const a = worldFloor(x, z), b = worldFloor(x, z + (z === p.minZ ? -0.25 : 0.25));
    assert.ok(Math.abs(a - b) < 1.5, `step ${Math.abs(a - b).toFixed(2)} at preserve edge ${x}, ${z}`);
  }
  for (const pad of FLOOR_PADS) {
    const inPreserve = pad.x + pad.radius > p.minX && pad.x - pad.radius < p.maxX && pad.z + pad.radius > p.minZ && pad.z - pad.radius < p.maxZ;
    assert.ok(!inPreserve, `${pad.id}: a pad inside the legacy preserve would have no effect`);
  }
});

test("the layout is a valid S1 layout with every region, column and spec adjacency", () => {
  const layout = worldLayout();
  none(validateLayout(layout), "S1 validateLayout");
  const map = createWorldMap(layout, spatialEntries());
  assert.equal(map.regionAt({ x: 0, y: 0, z: 14 }), "refuge_reef", "pod resolves to the Reef by footprint");
  for (const s of SITES) assert.equal(map.regionAt(siteDatum(s, worldFloor)), s.region, `${s.id} regionAt`);
  const cols = (WORLD_ENVELOPE.max.x - WORLD_ENVELOPE.min.x) / CHUNK_SIZE, rows = (WORLD_ENVELOPE.max.z - WORLD_ENVELOPE.min.z) / CHUNK_SIZE;
  assert.equal(layout.chunks.length, cols * rows);
  assert.deepEqual(new Set(layout.regions.map(r => r.id)), new Set(Object.keys(REGIONS)));
  const biomes = new Set(layout.biomes.map(b => b.id)), ids = new Set<string>();
  for (const c of layout.chunks) {
    assert.ok(!ids.has(c.id)); ids.add(c.id);
    assert.equal(c.id, chunkId(c.cell));
    const r = columnRect(c.cell.ix, c.cell.iz);
    assert.deepEqual([c.bounds.min.x, c.bounds.max.x, c.bounds.min.z, c.bounds.max.z], [r.minX, r.maxX, r.minZ, r.maxZ]);
    assert.ok(c.bounds.min.y >= WORLD_ENVELOPE.min.y && c.bounds.max.y <= WORLD_ENVELOPE.max.y && c.bounds.min.y < c.bounds.max.y, c.id);
    assert.ok(biomes.has(c.biome), `${c.id} biome ${c.biome}`);
    assert.ok(c.lod.fine > 0 && c.lod.coarse >= c.lod.fine);
  }
  const regions = new Map(layout.regions.map(r => [r.id, r] as const));
  for (const r of layout.regions) {
    for (const f of r.footprint) assert.ok(f.minX >= r.bounds.min.x && f.maxX <= r.bounds.max.x && f.minZ >= r.bounds.min.z && f.maxZ <= r.bounds.max.z, r.id);
    for (const b of r.biomes) assert.ok(biomes.has(b), `${r.id} biome ${b}`);
    for (const link of r.adjacency) {
      assert.ok(regions.get(link.to)?.adjacency.some(l => l.to === r.id), `${r.id} -> ${link.to} not reciprocated`);
      assert.ok(link.portal.min.x < link.portal.max.x && link.portal.min.y < link.portal.max.y && link.portal.min.z < link.portal.max.z);
    }
    for (const e of r.access.entrances) {
      const b = r.bounds, p = e.position;
      assert.ok(p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y && p.z >= b.min.z && p.z <= b.max.z, `${r.id} entrance ${e.id}`);
    }
    assert.ok(layout.chunks.some(c => c.region === r.id), `${r.id} owns no chunk`);
  }
  const linked = (a: string, b: string, carrier?: boolean): boolean =>
    regions.get(a as never)!.adjacency.some(l => l.to === b && (carrier === undefined || l.carrier === carrier));
  // WORLD_PROGRESSION adjacencies and the first loop.
  for (const [a, b] of [["refuge_reef", "island_chain"], ["refuge_reef", "suspended_garden"], ["island_chain", "suspended_garden"],
    ["suspended_garden", "silt_basin"], ["silt_basin", "refuge_reef"], ["silt_basin", "thermal_rift"], ["silt_basin", "brine_divide"],
    ["thermal_rift", "brine_divide"], ["brine_divide", "deep_district"], ["deep_district", "suspended_garden"]] as const)
    assert.ok(linked(a, b), `missing ${a} <-> ${b}`);
  // Divide -> Meridian: a broad carrier approach AND a narrow small-craft ledge.
  assert.ok(linked("brine_divide", "deep_district", true) && linked("brine_divide", "deep_district", false));
  // Carrier staging line reaches every mooring region; the escarpment and flank are small-craft only.
  for (const [a, b] of [["island_chain", "suspended_garden"], ["suspended_garden", "silt_basin"], ["silt_basin", "thermal_rift"], ["silt_basin", "brine_divide"]] as const)
    assert.ok(linked(a, b, true), `no carrier passage ${a} -> ${b}`);
  assert.ok(!linked("deep_district", "suspended_garden", true) && !linked("thermal_rift", "brine_divide", true));
  for (const r of ROUTES.filter(r => r.carrier)) assert.ok(r.minHalfWidth >= 30 && r.profile === "carrier", r.id);
});

test("every authored passage clears the floor, solids and its tier's limits", () => {
  for (const r of ROUTES) if (!r.legacy) none(routeProblems(r, ctx), r.id);
  // Carrier moorings at the specified staging depths, flat under the whole hull.
  const moorings: Record<string, number> = { "canopy.east_mooring": 160, "basin.anchorage": 240, "rift.cool_mooring": 300,
    "divide.lee_mooring": 390, "meridian.staging_shelf": 520 };
  for (const [id, depth] of Object.entries(moorings)) {
    const s = SITES.find(s => s.id === id)!, at = siteDatum(s, worldFloor);
    assert.equal(-at.y, depth, id);
    assert.ok(at.y - 0.5 >= footprintFloor(worldFloor, at.x, at.z, 17) + 0.05, `${id}: carrier grounds`);
  }
});

test("sites sit in their region and its specified depth band", () => {
  const ids = new Set<string>();
  for (const s of SITES) {
    assert.ok(!ids.has(s.id), `duplicate ${s.id}`); ids.add(s.id);
    assert.match(s.id, s.role === "source" ? /^[a-z]+(_[a-z0-9]+)+$/ : /^[a-z]+\.[a-z0-9_]+$/, s.id);
    assert.equal(regionAtPoint(s.at.x, s.at.z), s.region, `${s.id} lies outside ${s.region}`);
    const [lo, hi] = REGIONS[s.region].depth, depth = -siteDatum(s, worldFloor).y;
    assert.ok(depth >= Math.min(lo, 0) - 100 && depth <= hi + 20, `${s.id} at ${depth.toFixed(0)} m outside ${s.region} ${lo}-${hi}`);
    // W2's hub spur is a Hearth Reef spur inside the Basin footprint: it keeps
    // the reef's shallow band down to its rim balcony, never the Basin's.
    if (s.id.startsWith("hub.")) assert.ok(depth <= 130 || s.role === "landmark", `${s.id} at ${depth.toFixed(0)} m is below the hub band`);
    else if (s.role !== "landmark" && s.role !== "volume" && s.region !== "island_chain")
      assert.ok(depth >= lo - 20, `${s.id} at ${depth.toFixed(0)} m shallower than ${s.region}`);
  }
  const entries = spatialEntries(), entryIds = new Set(entries.map(e => e.id));
  assert.equal(entryIds.size, entries.length, "spatial entry IDs are unique");
  for (const h of HAZARDS) assert.ok(entryIds.has(h.id));
});

test("interaction datums are reachable, never inside a solid; the gate hall hosts evidence and a live panel", () => {
  for (const s of SITES) {
    if (s.role !== "source" && s.role !== "story") continue;
    const p = siteDatum(s, worldFloor);
    for (const b of STRUCTURE_SOLIDS.map(x => x.bounds)) assert.ok(!(p.x > b.min.x + 0.01 && p.x < b.max.x - 0.01 && p.y > b.min.y + 0.01 &&
      p.y < b.max.y - 0.01 && p.z > b.min.z + 0.01 && p.z < b.max.z - 0.01), `${s.id} datum inside a solid`);
  }
  const front = { x: 1396, y: -766.5, z: -1578 };
  for (const id of ["meridian.gate_hall", "meridian.gate_hall_panel"]) {
    const s = SITES.find(x => x.id === id)!, p = siteDatum(s, worldFloor), stand = { x: Math.min(p.x, 1401.8), y: -767.6, z: Math.max(p.z, -1594.8) };
    assert.ok(s.region === "deep_district" && s.role === "story");
    none(corridorProblems(id, [front, stand], ctx, { profile: "diver", margin: 0.1 }), `${id} diver access`);
    assert.ok(Math.hypot(stand.x - p.x, stand.y - p.y, stand.z - p.z) < 1.5, `${id} within reach of a diver standing in the hall`);
  }
});

test("structures rest on the floor and stay clear of today's solids", () => {
  for (const s of STRUCTURES) {
    for (const b of s.solids) {
      assert.ok(b.min.x < b.max.x && b.min.y < b.max.y && b.min.z < b.max.z, s.id);
      for (const l of LEGACY_SOLIDS) assert.ok(!(b.min.x < l.max.x && b.max.x > l.min.x && b.min.y < l.max.y && b.max.y > l.min.y &&
        b.min.z < l.max.z && b.max.z > l.min.z), `${s.id} overlaps ${l.id}`);
    }
    const lowest = Math.min(...s.solids.map(b => b.min.y));
    assert.ok(lowest <= worldFloor(s.x, s.z) + 0.01 || s.kind === "lintel" || s.kind === "dock" || s.kind === "pier" || s.kind === "hut" && s.base > 0,
      `${s.id} floats ${(lowest - worldFloor(s.x, s.z)).toFixed(2)} m`);
  }
});

// --- Fast smoke (TT-1). The whole-world first-access and rescue proofs, and
// their controls, are in tests/regions-world.heavy.test.ts.

test("smoke: the access checkers are not vacuous, rescue stages are breathable, and solid checks are continuous sweeps", () => {
  const flank = ROUTES.find(r => r.id === "route.rift.divide_flank")!;
  assert.ok(corridorProblems("probe", flank.path, ctx, { profile: "medium", maxDepth: 340 }).some(p => p.includes("exceeds")));
  assert.ok(corridorProblems("probe", [{ x: 520, y: -430, z: -1340 }, { x: 520, y: -478, z: -1360 }], ctx,
    { profile: "diver", protections: [] }).some(p => p.includes("hazard.divide.brine_south")), "the brine fissure needs protection");
  for (const p of RESCUE_PLANS) assert.ok(p.stage.y >= -0.5 && p.approach.every(q => q.y >= -0.5), `${p.id}: stage and approach breathable`);
  const stub = STRUCTURE_SOLIDS.find(s => s.id === "rift.cool_chimneys.stub_north")!;
  const a = { x: 92.0267, y: -253.4667, z: -966.5333 }, b = { x: 95.6, y: -254, z: -962 };
  assert.notEqual(sweepHull(a, b, "medium", stub.bounds), null, "the analytic sweep sees the clip");
  assert.ok(corridorProblems("old tow", [a, b], ctx, { profile: "medium", step: 1.5 }).some(p => p.includes(stub.id)));
  const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } };
  assert.notEqual(sweepHull({ x: -10, y: -0.5, z: -5.2 }, { x: 10, y: -0.5, z: 4.8 }, "diver", box), null);
  assert.equal(sweepHull({ x: -10, y: 5, z: 0 }, { x: 10, y: 5, z: 0 }, "diver", box), null);
});
