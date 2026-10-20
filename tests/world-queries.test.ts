import test from "node:test";
import assert from "node:assert/strict";
import { HULL_COLLIDERS } from "../src/content/registry.js";
import { createWorldQueries, SOLIDS, surfaceHeight, type Solid } from "../src/sim/world.js";
import type { Capsule, Vec3 } from "../src/sim/types.js";

const full = createWorldQueries(SOLIDS, surfaceHeight, { broadPhase: false });
const indexed = createWorldQueries();
const random = (seed: number) => () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
const shapes: Capsule[] = [
  { radius: 0.34, height: 0.95 }, { radius: 0, height: 0 }, { radius: 0.34, height: 1.7, bottom: -0.2 },
  ...Object.values(HULL_COLLIDERS).map(c => c as Capsule),
];
// Sample where solids are dense: pod, workshop, reef ribs, Canopy lab, Basin works.
const hotspots: Vec3[] = [
  { x: 0, y: 0.5, z: 20 }, { x: 10, y: 1.5, z: -36 }, { x: -18, y: -6, z: -10 },
  { x: 116, y: -117, z: -126 }, { x: 178, y: -164, z: -218 }, { x: 216, y: -170, z: -240 }, { x: 197, y: -165, z: -219 },
];

test("indexed movement, clearance, support and sight equal the full roster scan", () => {
  const next = random(23);
  let checks = 0;
  for (const spot of hotspots) for (let i = 0; i < 120; i++) {
    const p = { x: spot.x + (next() - 0.5) * 16, y: spot.y + (next() - 0.5) * 8, z: spot.z + (next() - 0.5) * 16 };
    const d = { x: (next() - 0.5) * 6, y: (next() - 0.5) * 4, z: (next() - 0.5) * 6 };
    const shape = shapes[Math.floor(next() * shapes.length)]!;
    const options = next() < 0.3 ? { separateBoxOverlaps: true } : undefined;
    assert.deepEqual(indexed.moveCapsule(p, d, shape, options), full.moveCapsule(p, d, shape, options));
    assert.equal(indexed.clearance(p, shape), full.clearance(p, shape));
    assert.equal(indexed.supportHeight(p.x, p.z, p.y), full.supportHeight(p.x, p.z, p.y));
    const q = { x: p.x + (next() - 0.5) * 60, y: p.y + (next() - 0.5) * 20, z: p.z + (next() - 0.5) * 60 };
    assert.equal(indexed.lineOfSight(p, q), full.lineOfSight(p, q));
    assert.equal(indexed.lineOfSight(p, q, ["pod.back"]), full.lineOfSight(p, q, ["pod.back"]));
    checks++;
  }
  assert.equal(checks, hotspots.length * 120);
});

test("long and degenerate requests keep the full scan's answers", () => {
  const swimmer = shapes[0]!;
  const p = { x: 0, y: -2, z: 12 };
  for (const d of [{ x: 0, y: 0, z: 400 }, { x: 300, y: -150, z: -300 }, { x: Infinity, y: 0, z: 0 }, { x: NaN, y: 0, z: 0 }])
    assert.deepEqual(indexed.moveCapsule(p, d, swimmer), full.moveCapsule(p, d, swimmer));
  assert.throws(() => indexed.moveCapsule({ x: NaN, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, swimmer), RangeError);
  assert.equal(indexed.clearance({ x: NaN, y: 0, z: 0 }, swimmer), false);
  assert.equal(indexed.lineOfSight({ x: -70, y: -5, z: 60 }, { x: 240, y: -160, z: -300 }),
    full.lineOfSight({ x: -70, y: -5, z: 60 }, { x: 240, y: -160, z: -300 }));
  assert.ok(SOLIDS.length > 40, "the comparison covers a real roster");
});

test("the production roster really uses the broad phase: a far solid is never visited", () => {
  // A trap solid whose box is read only by a full scan. The indexed query at
  // the pod must not touch it; the forced full scan must.
  let reads = 0;
  const far = { id: "far.trap", min: { x: 240, y: -170, z: -318 }, max: { x: 241, y: -169, z: -317 } };
  const trap: Solid = { id: far.id, get min() { reads++; return far.min; }, get max() { reads++; return far.max; } };
  const roster = [...SOLIDS, trap];
  const swimmer = shapes[0]!, p = { x: 0, y: -2, z: 12 };
  createWorldQueries(roster); // the index reads every box once
  reads = 0;
  const indexedQueries = createWorldQueries(roster);
  indexedQueries.moveCapsule(p, { x: 0.5, y: 0, z: 0 }, swimmer);
  indexedQueries.clearance(p, swimmer);
  indexedQueries.supportHeight(p.x, p.z, p.y);
  indexedQueries.lineOfSight(p, { x: 4, y: -2, z: 12 });
  assert.equal(reads, 0, "nearby queries never read the far solid");
  createWorldQueries(roster, surfaceHeight, { broadPhase: false }).clearance(p, swimmer);
  assert.ok(reads > 0, "the full scan does");
  assert.ok(createWorldQueries([trap]).clearance(p, swimmer), "a short roster still scans");
});
