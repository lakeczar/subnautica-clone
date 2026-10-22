// HEAVY TIER (by cost, no Babylon): every Canopy and Basin cave loaded at once
// in the composed world (sim/world.ts createCaveWorldQueries, the C4 adapter
// with its 8 m cave index), as gameWorld() will hold them. Route corridors,
// parking, the box counts and the per-step query cost. Run through
// scripts/heavy-check.sh.
import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { CANOPY_BASIN_GROUPS } from "../src/content/regions/caves/index.js";
import { CRAFT_PROFILES, ROUTES } from "../src/content/regions/passages.js";
import { CAVE_INDEX_CELL, createCaveWorldQueries, createWorldQueries, SOLIDS, surfaceHeight } from "../src/sim/world.js";
import type { Vec3 } from "../src/sim/types.js";
import { allOwners, composedWorld, defOf, dist, DIVER, retreatStarts, sub } from "./caves-canopy-basin-support.js";

const pad = 2 * 4.5 + 1;
const touches = (p: Vec3, half: number): boolean => CANOPY_BASIN_GROUPS.some(g => {
  const f = g.source.footprint;
  return p.x > f.minX - half - pad && p.x < f.maxX + half + pad && p.z > f.minZ - half - pad && p.z < f.maxZ + half + pad;
});

test("the composed world holds every cave, clear of the legacy guards", t => {
  const started = performance.now(), world = composedWorld();
  assert.ok(world);
  const owners = allOwners(), rock = owners.reduce((n, o) => n + o.rock.length, 0);
  t.diagnostic(`${owners.length} caves (${CANOPY_BASIN_GROUPS.length} CA-2 sources + the kit's), ${rock} rock boxes, built in ${(performance.now() - started).toFixed(0)} ms`);
});

test("route corridors near a cave sweep exactly as far in the composed world as over the plain heightfield", () => {
  const plain = createWorldQueries(SOLIDS, surfaceHeight), world = composedWorld();
  let checked = 0;
  for (const r of ROUTES) {
    if (r.legacy) continue;
    const shape = CRAFT_PROFILES[r.profile], path = r.path.filter(p => Number.isFinite(p.y));
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!, b = path[i]!;
      if (!touches(a, shape.radius) && !touches(b, shape.radius)) continue;
      checked++;
      const before = plain.moveCapsule(a, sub(b, a), shape), after = world.moveCapsule(a, sub(b, a), shape);
      const clear = !before.hitSolid && dist(before.position, b) < 1e-6;
      if (clear) assert.ok(!after.hitSolid && dist(after.position, b) < 1e-3, `${r.id} segment ${i}: a cave blocks it at ${JSON.stringify(after.position)}`);
    }
  }
  assert.ok(checked >= 10, `${checked} route segments near caves`);
});

test("craft parking: clear for every listed profile", () => {
  const world = composedWorld();
  for (const g of CANOPY_BASIN_GROUPS) for (const s of g.source.staging) for (const p of s.profiles)
    assert.ok(world.clearance(s.position, CRAFT_PROFILES[p]), `${s.id}: no room for ${p}`);
});

test("per-step cost: a diver step (move plus support) inside every cave, every cave loaded, on the 8 m cave index", t => {
  const world = composedWorld(), exterior = createCaveWorldQueries({ solids: SOLIDS, floor: surfaceHeight, caves: [] });
  const DT = 1 / 60, speed = 3.4, rows: string[] = [];
  let total = 0, steps = 0, worst = 0;
  for (const g of CANOPY_BASIN_GROUPS) {
    const def = defOf(g), poses = retreatStarts(def);
    const moves = poses.map((p, i) => ({ p, d: { x: Math.cos(i) * speed * DT, y: Math.sin(i * 0.7) * speed * DT * 0.5, z: Math.sin(i) * speed * DT } }));
    for (const m of moves) { world.moveCapsule(m.p, m.d, DIVER); world.supportHeight(m.p.x, m.p.z, m.p.y); } // warm
    const rounds = Math.max(1, Math.ceil(4000 / moves.length)), start = performance.now();
    for (let k = 0; k < rounds; k++) for (const m of moves) { world.moveCapsule(m.p, m.d, DIVER); world.supportHeight(m.p.x, m.p.z, m.p.y); }
    const us = (performance.now() - start) * 1000 / (rounds * moves.length);
    total += us * rounds * moves.length; steps += rounds * moves.length; worst = Math.max(worst, us);
    rows.push(`${g.source.id}: ${def.rock.length} rock boxes, ${us.toFixed(1)} µs/step over ${moves.length} poses`);
  }
  // Reference: the same step in open water away from every cave.
  const open = { x: 600, y: -150, z: -600 }, start = performance.now();
  for (let k = 0; k < 4000; k++) { exterior.moveCapsule(open, { x: 0.05, y: 0, z: 0.02 }, DIVER); exterior.supportHeight(open.x, open.z, open.y); }
  const away = (performance.now() - start) * 1000 / 4000;
  for (const r of rows) t.diagnostic(r);
  t.diagnostic(`mean ${(total / steps).toFixed(1)} µs/step inside caves, worst cave ${worst.toFixed(1)} µs; open water ${away.toFixed(1)} µs; cave index cell ${CAVE_INDEX_CELL} m`);
  // A budget a 60 Hz step can afford many times over (one diver plus a few craft).
  assert.ok(worst < 400, `a cave step costs ${worst.toFixed(0)} µs`);
});
