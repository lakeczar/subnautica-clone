// CA-3 cost, heavy: build time, rock boxes, collar columns and the per-step
// query cost of a diver inside these caves with root's caves loaded on the
// 8 m cave index. Loose bounds; the numbers go to the handoff.
import test from "node:test";
import assert from "node:assert/strict";
import { AUTHORED_CAVE_SOURCES, caveDef } from "../src/content/regions/caves.js";
import { CANOPY_BASIN_GROUPS, groupDef } from "../src/content/regions/caves/index.js";
import { buildCave } from "../src/content/regions/caveGeometry.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { DEEP_CAVES } from "../src/content/regions/caves/deep.js";
import { CAVE_SUB_SWEEP, caveOwner, createCaveWorldQueries, SOLIDS, surfaceHeight } from "../src/sim/world.js";
import type { WorldQueries } from "../src/sim/types.js";
import { DIVER, deepWorld, defOf } from "./caves-deep-support.js";

/** The adapter's collar band: 2 x the largest admitted half-extent (4.5) +
 * one sub-sweep + 0.5 m, in 0.5 m columns round each footprint. */
const BAND = 2 * 4.5 + CAVE_SUB_SWEEP + 0.5;
const collarColumns = (f: { minX: number; maxX: number; minZ: number; maxZ: number }): number =>
  ((f.maxX - f.minX + 2 * BAND) * (f.maxZ - f.minZ + 2 * BAND) - (f.maxX - f.minX) * (f.maxZ - f.minZ)) / 0.25;

/** Mean microseconds for one diver step (a 1/60 s swim at 3.4 m/s along the
 * route, then support under the new pose), over every pose on these routes. */
function stepCost(world: WorldQueries, routes: readonly { path: readonly { x: number; y: number; z: number }[] }[]): { us: number; steps: number } {
  const poses: { x: number; y: number; z: number; dx: number; dz: number }[] = [];
  for (const r of routes) for (let i = 1; i < r.path.length; i++) {
    const a = r.path[i - 1]!, b = r.path[i]!, len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    for (let s = 0; s < 1; s += 0.1) poses.push({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s, z: a.z + (b.z - a.z) * s,
      dx: (b.x - a.x) / len * 3.4 / 60, dz: (b.z - a.z) / len * 3.4 / 60 });
  }
  for (const p of poses.slice(0, 50)) world.moveCapsule(p, { x: p.dx, y: 0, z: p.dz }, DIVER); // warm-up
  const t0 = process.hrtime.bigint();
  for (let rep = 0; rep < 5; rep++) for (const p of poses) {
    const m = world.moveCapsule(p, { x: p.dx, y: 0, z: p.dz }, DIVER);
    world.supportHeight(m.position.x, m.position.z, m.position.y + 0.01);
  }
  return { us: Number(process.hrtime.bigint() - t0) / 1000 / (poses.length * 5), steps: poses.length * 5 };
}

test("cost: build, rock boxes, collar columns and per-step diver queries with root's caves loaded", t => {
  let voxels = 0, rock = 0, collar = 0, ms = 0;
  const rows: string[] = [];
  for (const c of DEEP_CAVES) {
    const started = performance.now(), def = buildCave(c.source, worldFloor), took = performance.now() - started;
    defOf(c); // the shared copy the world uses
    voxels += def.stats.voxels; rock += def.rock.length; collar += collarColumns(c.source.footprint); ms += took;
    rows.push(`${c.source.id}: ${def.rock.length} rock boxes, ${(def.stats.voxels / 1e6).toFixed(2)} M voxels, ${took.toFixed(0)} ms`);
    assert.ok(def.rock.length < 5000, `${c.source.id}: ${def.rock.length} boxes`);
  }
  const root = [...AUTHORED_CAVE_SOURCES.map(s => caveDef(s.id, worldFloor)), ...CANOPY_BASIN_GROUPS.map(g => groupDef(g, worldFloor))];
  const rootRock = root.reduce((n, d) => n + d.rock.length, 0), rootCollar = [...AUTHORED_CAVE_SOURCES, ...CANOPY_BASIN_GROUPS.map(g => g.source)].reduce((n, s) => n + collarColumns(s.footprint), 0);
  for (const r of rows) t.diagnostic(r);
  t.diagnostic(`deep caves: ${DEEP_CAVES.length}, ${rock} rock boxes + ~${Math.round(collar)} collar columns, ${(voxels / 1e6).toFixed(1)} M voxels, build ${(ms / 1000).toFixed(1)} s`);
  t.diagnostic(`root caves: ${root.length}, ${rootRock} rock boxes + ~${Math.round(rootCollar)} collar columns`);
  const composed = deepWorld();
  const deep = stepCost(composed, DEEP_CAVES.flatMap(c => c.source.routes.filter(r => r.profile === "diver")));
  const rootWorld = createCaveWorldQueries({ solids: SOLIDS, floor: surfaceHeight, caves: root.map(caveOwner) });
  const base = stepCost(rootWorld, root.flatMap(d => d.routes.filter(r => r.profile === "diver")));
  t.diagnostic(`diver step (move + support) inside the deep caves, composed world: ${deep.us.toFixed(1)} µs over ${deep.steps} steps`);
  t.diagnostic(`same step inside root's authored caves (Fanvault, hub, Reef, Isles) and CA-2's, root world: ${base.us.toFixed(1)} µs over ${base.steps} steps`);
  assert.ok(deep.us < 400, `${deep.us.toFixed(1)} µs per diver step`);
  assert.ok(ms < 60000, `${(ms / 1000).toFixed(1)} s to build`);
});
