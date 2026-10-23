import assert from "node:assert/strict";
import test from "node:test";
import { parkPose, routeProblems, workPose, type CheckContext } from "../src/content/regions/access.js";
import { BOWL_STANDOFF, DISH_RINGS, DISH_SEGMENTS, rimLine } from "../src/content/regions/dishGeometry.js";
import { HAZARDS } from "../src/content/regions/hazards.js";
import { CRAFT_PROFILES, ROUTES } from "../src/content/regions/passages.js";
import { SITES } from "../src/content/regions/sites.js";
import { STRUCTURES, type StructureDef } from "../src/content/regions/structures.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { createWorldQueries, SOLIDS, surfaceHeight, type Solid } from "../src/sim/world.js";
import type { Vec3 } from "../src/world/types.js";

/** The Basin's survey dishes collide where they are drawn (P2 from the
 * POI-1 review: the drawn rims stood up to 12.9 m above their rim blocks,
 * and a diver swam straight through). Art and collision now come from one
 * source (`dishGeometry.ts`); the dense art/collision probe is
 * `dishes-envelope.heavy.test.ts`. Here: the production world stops a diver
 * at the rim and the bowl, the old blocks did not, the bowl's hollow stays
 * open for the dish sites, and every passage, tether and lane stays clear. */
const DISHES = STRUCTURES.filter(s => s.kind === "dish");
const diver = { radius: CRAFT_PROFILES.diver.radius, height: CRAFT_PROFILES.diver.height };
const medium = { radius: CRAFT_PROFILES.medium.radius, height: CRAFT_PROFILES.medium.height };
const params = (d: StructureDef) => ({ id: d.id, x: d.x, z: d.z, base: d.base, radius: d.p.radius!, tilt: d.p.tilt!, facing: d.p.facing! });
const world = createWorldQueries(SOLIDS, surfaceHeight);
const isDish = (s: Solid): boolean => /\.dish\.\d+$/.test(s.id);

/** Radial sweeps across the drawn rim at rim height, in and out: how many
 * were tried and how many got more than 1 m past the rim. */
function rimCrossings(w: ReturnType<typeof createWorldQueries>, d: StructureDef): { candidates: number; tried: number; through: string[] } {
  const ring = rimLine(params(d)), kept = d.dish!.rimKept, through: string[] = [];
  let tried = 0, candidates = 0;
  for (let i = 0; i < DISH_SEGMENTS; i++) for (let k = 0; k < 6; k++) {
    if (!kept[i] || !kept[(i + DISH_SEGMENTS - 1) % DISH_SEGMENTS] || !kept[(i + 1) % DISH_SEGMENTS]) continue;
    const a = ring[i]!, b = ring[i + 1]!, t = (k + 0.5) / 6, rim = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
    const rx = rim.x - d.x, rz = rim.z - d.z, l = Math.hypot(rx, rz), ux = rx / l, uz = rz / l;
    for (const dir of [-1, 1]) {
      // Start 2.5 m off the rim on one side, sweep 5 m to the other.
      const start = { x: rim.x - ux * 2.5 * dir, y: rim.y - diver.height / 2, z: rim.z - uz * 2.5 * dir };
      candidates++;
      if (!w.clearance(start, diver) || worldFloor(start.x, start.z) > start.y - 0.2) continue;
      tried++;
      const end = w.moveCapsule(start, { x: ux * 5 * dir, y: 0, z: uz * 5 * dir }, diver).position;
      const past = ((end.x - rim.x) * ux + (end.z - rim.z) * uz) * dir;
      if (past > 1) through.push(`${d.id} rim ${i}.${k} ${dir > 0 ? "outward" : "inward"} at ${rim.x.toFixed(1)}, ${rim.y.toFixed(1)}, ${rim.z.toFixed(1)}`);
    }
  }
  return { candidates, tried, through };
}

test("the production world stops a diver at every drawn rim, in and out", () => {
  for (const d of DISHES) {
    // Inward starts sit within the bowl's 1 m stand-off near the rim, and
    // outward ones by a fin, so not every crossing can start clear.
    const { candidates, tried, through } = rimCrossings(world, d);
    assert.ok(tried >= candidates * 0.5, `${d.id}: only ${tried} of ${candidates} rim crossings could start clear`);
    assert.deepEqual(through, [], `${d.id}: swims through the rim`);
  }
});

test("ADVERSE (POI-1-02): the old rim blocks let a diver straight through the drawn rim", () => {
  const old: Solid[] = [...SOLIDS.filter(s => !isDish(s)),
    ...DISHES.flatMap(d => d.keep!.map((b, i) => ({ id: `${d.id}.old${i}`, min: b.min, max: b.max })))];
  const before = createWorldQueries(old, surfaceHeight);
  const through = DISHES.reduce((n, d) => n + rimCrossings(before, d).through.length, 0);
  assert.ok(through > 100, `only ${through} rim crossings got through the old blocks`);
});

test("a diver cannot pass through a bowl panel, from below or from inside", () => {
  for (const d of DISHES) {
    const art = d.dish!;
    let tried = 0;
    for (const f of art.bowl) {
      const [a, b, c] = f.pts as [Vec3, Vec3, Vec3], m = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3, z: (a.z + b.z + c.z) / 3 };
      for (const dir of [-1, 1]) {
        // Up from below (dir 1) or down from inside the bowl (dir -1).
        const start = { x: m.x, y: m.y - 3 * dir - (dir > 0 ? diver.height : 0), z: m.z };
        if (!world.clearance(start, diver) || worldFloor(start.x, start.z) > start.y - 0.3) continue;
        tried++;
        const end = world.moveCapsule(start, { x: 0, y: 6 * dir, z: 0 }, diver).position;
        const past = dir > 0 ? end.y - m.y : m.y - (end.y + diver.height);
        assert.ok(past < 1, `${d.id}: a diver passes ${dir > 0 ? "up" : "down"} through the panel at ${m.x.toFixed(1)}, ${m.y.toFixed(1)}, ${m.z.toFixed(1)}`);
      }
    }
    assert.ok(tried >= art.bowl.length / 2, `${d.id}: only ${tried} panel crossings could start clear`);
  }
});

test("the bowls' hollows stay open: dish sites' work and park poses, and the way down to them", () => {
  for (const s of SITES.filter(s => s.id.startsWith("basin.dish") || s.id === "basin_dish_fins")) {
    const work = workPose(s, worldFloor), park = parkPose(s, worldFloor);
    assert.ok(world.clearance(work, diver), `${s.id}: a diver can stand at the work pose`);
    assert.ok(world.clearance(park, medium), `${s.id}: a medium craft fits at the park pose`);
    const high = { ...park, y: park.y + 30 }, down = world.moveCapsule(high, { x: 0, y: -30, z: 0 }, medium).position;
    assert.ok(Math.abs(down.y - park.y) < 0.05, `${s.id}: a medium craft descends straight to its park pose (stopped ${(down.y - park.y).toFixed(2)} m above)`);
  }
});

test("the dishes are drawn at one resolution, with the bowl's collision held to its stand-off", () => {
  for (const d of DISHES) {
    const art = d.dish!;
    assert.equal(art.rimKept.length, DISH_SEGMENTS);
    assert.ok(art.rimKept.filter(Boolean).length >= DISH_SEGMENTS - 4, `${d.id}: most of the rim stands`);
    // Only the panels under a site's work or park pose are missing.
    assert.ok(art.bowl.length >= (DISH_SEGMENTS * (2 * DISH_RINGS - 1)) * 0.85, `${d.id}: most of the bowl stands (${art.bowl.length})`);
    assert.equal(d.solids.length, art.solids.frame.length + art.solids.bowl.length);
  }
  assert.equal(BOWL_STANDOFF, 1, "the owner's bowl stand-off (2026-10-22)");
});

test("smoke: dish collision leaves every passage and carrier lane clear", () => {
  // With every rescue tether and first access re-checked: tests/dishes.heavy.test.ts (TT-1).
  const ctx: CheckContext = { floor: worldFloor, hazards: HAZARDS, solids: DISHES.flatMap(d => d.solids.map((bounds, i) => ({ id: `${d.id}.${i}`, bounds }))) };
  assert.deepEqual(ROUTES.filter(r => r.role !== "walk").flatMap(r => routeProblems(r, ctx)).filter(p => /dish/.test(p)), []);
});
