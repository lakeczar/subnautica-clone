import test from "node:test";
import assert from "node:assert/strict";
import { terrainHeight } from "../src/sim/world.js";
import { ROUTE_WORLD_BOUNDS } from "../src/content/routes.js";
import { boxDistance, boxesIntersect, chunkId, columnAt, GRID_COLUMNS, GRID_ROWS, parseChunkId } from "../src/world/frame.js";
import { createWorldMap, validateLayout } from "../src/world/map.js";
import { createSpatialIndex, segmentTouches } from "../src/world/spatialIndex.js";
import { createSliceLayout, sliceEntries, sliceFloor } from "../src/world/sliceLayout.js";
import type { SpatialEntry, Vec3, WorldLayout } from "../src/world/types.js";

const layout = createSliceLayout();
const entries = sliceEntries();
const map = createWorldMap(layout, entries);
const random = (seed: number) => () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
const ids = (list: readonly SpatialEntry[]): string[] => list.map(e => e.id);

test("the slice layout is valid and covers every column of the envelope once", () => {
  assert.deepEqual(validateLayout(layout), []);
  assert.equal(layout.chunks.length, GRID_COLUMNS * GRID_ROWS);
  assert.equal(new Set(layout.chunks.map(c => c.id)).size, layout.chunks.length);
  for (const c of layout.chunks) assert.deepEqual(parseChunkId(c.id), c.cell);
  assert.equal(chunkId({ ix: 3, iz: 4, layer: 0 }), "chunk:3:4:0");
  assert.deepEqual(columnAt(1472, 160), { ix: GRID_COLUMNS - 1, iz: GRID_ROWS - 1 }, "far edges belong to the last cell");
  assert.equal(columnAt(1472.01, 0), null);
});

test("regions resolve at today's places and at each provisional deep region", () => {
  const at: [Vec3, string][] = [
    [{ x: 0, y: 0, z: 20 }, "refuge_reef"],
    [{ x: 10, y: 0, z: -40 }, "island_chain"],
    [{ x: 116, y: -118, z: -125 }, "suspended_garden"],
    [{ x: 200, y: -160, z: -220 }, "silt_basin"],
    [{ x: -260, y: -430, z: -880 }, "thermal_rift"],
    [{ x: 380, y: -560, z: -1240 }, "brine_divide"],
    [{ x: 1060, y: -700, z: -1180 }, "deep_district"],
  ];
  for (const [p, region] of at) assert.equal(map.regionAt(p), region, `${p.x},${p.z}`);
  assert.equal(map.regionAt({ x: 5000, y: 0, z: 0 }), null);
  assert.equal(new Set(layout.chunks.map(c => c.region)).size, 7);
});

test("the slice floor is the accepted terrain inside today's bounds and continuous outside", () => {
  const next = random(7), b = ROUTE_WORLD_BOUNDS;
  for (let i = 0; i < 400; i++) {
    const x = b.minX + next() * (b.maxX - b.minX), z = b.minZ + next() * (b.maxZ - b.minZ);
    assert.equal(sliceFloor(x, z), terrainHeight(x, z));
  }
  let worst = 0;
  for (let z = b.minZ - 80; z <= b.maxZ + 80; z += 4) for (const x of [b.minX - 1, b.minX + 1, b.maxX - 1, b.maxX + 1])
    worst = Math.max(worst, Math.abs(sliceFloor(x + 1, z) - sliceFloor(x, z)));
  assert.ok(worst < 6, `largest 1 m step across the seam is ${worst.toFixed(2)} m`);
  let deepest = 0;
  for (let x = -576; x <= 1472; x += 16) for (let z = -1632; z <= 160; z += 16) deepest = Math.min(deepest, sliceFloor(x, z));
  assert.ok(deepest < -720 && deepest >= -790, `deepest floor ${deepest.toFixed(1)}`);
});

test("index queries equal a brute-force scan, in insertion order", () => {
  const index = createSpatialIndex(entries, 16);
  const next = random(11);
  const point = (): Vec3 => ({ x: -100 + next() * 380, y: -200 + next() * 220, z: -330 + next() * 420 });
  for (let i = 0; i < 300; i++) {
    const p = point(), q = point(), r = next() * 30;
    const box = { min: { x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), z: Math.min(p.z, q.z) },
      max: { x: Math.min(p.x, q.x) + next() * 40, y: Math.min(p.y, q.y) + next() * 40, z: Math.min(p.z, q.z) + next() * 40 } };
    assert.deepEqual(ids(index.inBox(box)), ids(entries.filter(e => boxesIntersect(e.bounds, box))));
    assert.deepEqual(ids(index.near(p, r, ["solid"])),
      ids(entries.filter(e => e.kind === "solid" && boxDistance(e.bounds, p) <= r)));
    assert.deepEqual(ids(index.alongSegment(p, q, 0.5)), ids(entries.filter(e => segmentTouches(p, q, e.bounds, 0.5))));
    const nearest = index.nearest(p, ["source"]);
    const sources = entries.filter(e => e.kind === "source");
    const best = Math.min(...sources.map(e => boxDistance(e.bounds, p)));
    assert.equal(nearest && boxDistance(nearest.bounds, p), best);
    assert.equal(nearest?.id, sources.find(e => boxDistance(e.bounds, p) === best)?.id, "ties go to the earlier entry");
  }
  assert.equal(index.nearest({ x: 0, y: 0, z: 0 }, ["landmark"], 5), null);
  assert.equal(index.get("pod.deck")?.kind, "solid");
});

test("the index rejects duplicate ids and invalid boxes", () => {
  const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } };
  assert.throws(() => createSpatialIndex([{ id: "a", kind: "solid", bounds: box }, { id: "a", kind: "solid", bounds: box }]), /Duplicate/);
  assert.throws(() => createSpatialIndex([{ id: "b", kind: "solid", bounds: { min: box.max, max: box.min } }]), /Invalid bounds/);
  const huge = createSpatialIndex([{ id: "sea", kind: "volume", bounds: { min: { x: -1e4, y: -1, z: -1e4 }, max: { x: 1e4, y: 0, z: 1e4 } } }]);
  assert.deepEqual(ids(huge.near({ x: 500, y: 0, z: 500 }, 1)), ["sea"], "oversized entries are always tested");
});

test("chunksWithin matches a scan and sorts nearest first", () => {
  const next = random(5);
  for (let i = 0; i < 40; i++) {
    const p = { x: -576 + next() * 2048, y: -800 + next() * 900, z: -1632 + next() * 1792 }, r = next() * 500;
    const got = map.chunksWithin(p, r);
    const want = layout.chunks.filter(c => boxDistance(c.bounds, p) <= r);
    assert.deepEqual(new Set(got.map(g => g.chunk.id)), new Set(want.map(c => c.id)));
    for (let k = 1; k < got.length; k++) assert.ok(got[k - 1]!.distance <= got[k]!.distance);
  }
});

test("validation names broken links, cells, layers and biomes", () => {
  const [first, second] = layout.chunks;
  const broken: WorldLayout = {
    ...layout,
    regions: layout.regions.map(r => r.id === "thermal_rift" ? { ...r, adjacency: r.adjacency.filter(l => l.to !== "silt_basin") } : r),
    chunks: [
      { ...first!, biome: "kelp_forest" },
      { ...second!, bounds: { ...second!.bounds, min: { ...second!.bounds.min, x: second!.bounds.min.x + 1 } } },
      { ...first!, id: chunkId({ ...first!.cell, layer: 1 }), cell: { ...first!.cell, layer: 1 } },
    ],
  };
  const problems = validateLayout(broken).join("\n");
  assert.match(problems, /silt_basin: link to thermal_rift is not reciprocated/);
  assert.match(problems, /unknown biome kelp_forest/);
  assert.match(problems, /X\/Z bounds differ from its grid cell/);
  assert.match(problems, /overlap in Y/);
  assert.throws(() => createWorldMap(broken), /Invalid world layout/);
});
