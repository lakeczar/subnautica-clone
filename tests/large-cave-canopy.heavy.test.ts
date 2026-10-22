import test from "node:test";
import assert from "node:assert/strict";
import { CANOPY_ROOT_CAVES as S } from "../src/content/caves/canopyRootCaves.js";
import { CRAFT_PROFILES } from "../src/content/regions/passages.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { buildCollision, chunksNear, COLLISION_BAND, createLargeCave } from "../src/world/caves/large/build.js";
import { buildChunkMesh } from "../src/world/caves/large/mesh.js";
import { caveRockAt } from "../src/world/caves/large/collision.js";
import { DIVER, boxSamples, productionWorld, random, seek } from "./large-cave-support.js";

// LC: the Canopy root caves' exhaustive sampling check and real collision
// sweeps through the production world (heavy tier, TT-1).
// tests/large-cave-canopy.test.ts keeps the field checks and fast smokes.
const cave = createLargeCave(S, worldFloor);
const field = cave.field;

test("Canopy sampling: the hall's and the Crown hollow's chunks are identical with no brick skipped", () => {
  for (const at of [{ x: 742, y: -126, z: -100 }, { x: 756, y: -100, z: -84 }]) {
    const c = chunksNear(cave, [at], 0).find(k => cave.lattice.origin.y + k.cy * 32 <= at.y && at.y < cave.lattice.origin.y + (k.cy + 1) * 32 &&
      cave.lattice.origin.x + k.cx * 32 <= at.x && at.x < cave.lattice.origin.x + (k.cx + 1) * 32 && cave.lattice.origin.z + k.cz * 32 <= at.z && at.z < cave.lattice.origin.z + (k.cz + 1) * 32)!;
    const fast = cave.mesh(c, "fine"), full = buildChunkMesh(field, cave.lattice, c, "fine", { band: COLLISION_BAND, exhaustive: true });
    assert.ok(fast.stats.skipped > 0, "skipping happened");
    assert.deepEqual([...full.positions], [...fast.positions]);
    assert.deepEqual([...full.indices], [...fast.indices]);
  }
});

test("Canopy LC-01: the R1 buried collar-straddling poses are refused through the production world", () => {
  const points = [[727.8, -60], [727.8, -90], [781.9, -60], [826.2, -190], [833.8, -60]] as const;
  buildCollision(cave, chunksNear(cave, points.map(([x, z]) => ({ x, y: worldFloor(x, z), z })), 12));
  const world = productionWorld(cave), hull = CRAFT_PROFILES.medium;
  for (const [x, z] of points) {
    const feet = { x, y: worldFloor(x, z) - 1.3, z };
    assert.equal(world.clearance(feet, DIVER), false, `diver buried at ${JSON.stringify(feet)}`);
    const keel = { x: x + (x < 760 ? -3.5 : 3.5), y: worldFloor(x, z) - 1, z };
    assert.equal(world.clearance(keel, hull), false, `hull keel 1 m under the seabed at ${JSON.stringify(keel)}`);
  }
  // Control: a pose 0.5 m above the seabed at the first point is accepted.
  const [x, z] = points[0];
  let top = -Infinity;
  for (const q of boxSamples({ x, y: 0, z }, DIVER)) top = Math.max(top, worldFloor(q.x, q.z));
  assert.equal(world.clearance({ x, y: top + 0.5, z }, DIVER), true);
});

test("Canopy diver spurs: real sweeps thread the squeeze, the crawl, the tangle and the grotto", () => {
  const spurs = S.routes.filter(r => r.profile === "diver");
  buildCollision(cave, chunksNear(cave, spurs.flatMap(r => r.path), 14));
  const world = productionWorld(cave);
  for (const r of spurs) {
    const run = seek(world, r.path, DIVER, 3.4);
    assert.ok(run.reached, `${r.id}: the diver did not get through`);
    const buried = run.poses.flatMap(p => boxSamples(p, DIVER)).find(q => caveRockAt(cave.collision, q));
    assert.equal(buried, undefined, `${r.id}: diver inside rock at ${JSON.stringify(buried)}`);
  }
  // Cost guard: the composer must broad-phase the production world's
  // thousands of exterior solids (a linear scan made every move ~0.5 ms).
  const route = S.routes.find(r => r.id === "canopy_roots.route.squeeze")!.path;
  const started = performance.now(), run = seek(world, route, DIVER, 3.4);
  const perMove = (performance.now() - started) / run.poses.length;
  assert.ok(perMove < 0.15, `a diver move costs ${(perMove * 1000).toFixed(0)} µs`);
  // Independent dense probes round the squeeze agree with the collision mesh.
  const rnd = random(19);
  let checked = 0;
  for (let i = 0; i < 6000; i++) {
    const p = { x: 680 + rnd() * 50, y: -146 + rnd() * 20, z: -135 + rnd() * 30 };
    if (!field.owned(p.x, p.y, p.z)) continue;
    const f = field.rock(p.x, p.y, p.z);
    if (Math.abs(f) < 0.35) continue;
    checked++;
    assert.equal(caveRockAt(cave.collision, p), f < 0, `probe (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) field ${f.toFixed(2)}`);
  }
  assert.ok(checked > 3000);
});
