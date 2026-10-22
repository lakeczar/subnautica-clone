// CA-3 geometry, heavy: every Rift, Divide and Meridian cave built from its
// one source and held, cave by cave, to the W1 checks (shell and rock agree,
// clearance, roof support, coarse LOD keeps openings, the collar) in the world
// as it will be once registered: root's caves plus these, on the 8 m index.
import test from "node:test";
import assert from "node:assert/strict";
import { DEEP_CAVES } from "../src/content/regions/caves/deep.js";
import { CRAFT_PROFILES, ROUTES } from "../src/content/regions/passages.js";
import { gameWorld, SOLIDS, surfaceHeight, caveOwner, createCaveWorldQueries } from "../src/sim/world.js";
import {
  apertureProblems, collarProblems, deepWorld, defOf, envelopeProblems, hasCycle, lodProblems, roofProblems, roomGraph, routeProblems,
  shellProblems, stagingProblems, worldWith,
} from "./caves-deep-support.js";

for (const c of DEEP_CAVES) {
  const id = c.source.id;
  test(`${id}: thick rock, an envelope that holds the floor, and shell and rock that agree`, () => {
    assert.deepEqual([...envelopeProblems(c), ...shellProblems(c)], []);
  });
  test(`${id}: every opening keeps its clear size in rock and both shells; every route sweeps its own profile`, () => {
    assert.deepEqual([...apertureProblems(c, deepWorld()), ...routeProblems(c, deepWorld())], []);
  });
  test(`${id}: the roof carries a diver over every probe column, with no roof holes`, () => {
    assert.deepEqual(roofProblems(c, deepWorld()), []);
  });
  test(`${id}: coarse LOD keeps every opening and route; the collar meets the floor; craft park outside`, () => {
    assert.deepEqual([...lodProblems(c), ...collarProblems(c, deepWorld()), ...stagingProblems(c, deepWorld())], []);
  });
  if (c.size === "medium") test(`${id}: the chambers form a real loop in the generated water, and no room is sealed`, () => {
    const g = roomGraph(defOf(c)), chambers = new Set([...Object.values(c.graph!.chambers).flat(), ...c.graph!.loopCloser.rooms]);
    assert.ok(hasCycle(g, chambers), `no cycle among ${[...chambers].join(", ")}`);
    const seen = new Set<string>(), stack = [c.source.portals.find(p => p.kind === "mouth")!.between[0]];
    while (stack.length) { const r = stack.pop()!; if (seen.has(r)) continue; seen.add(r); for (const n of g.get(r) ?? []) stack.push(n); }
    assert.deepEqual(c.source.rooms.map(r => r.id).filter(r => !seen.has(r)), []);
  });
}

test("negative control: a 2 m block in the kiln tube's plateau mouth stops its own craft loop", () => {
  const kiln = DEEP_CAVES.find(c => c.source.id === "rift_kiln_tube")!;
  const m = kiln.source.portals.find(p => p.id === "kiln.mouth.plateau")!;
  const plug = { id: "test.plug", min: { x: m.center.x - 1, y: m.center.y - 3, z: m.center.z - 5 }, max: { x: m.center.x + 1, y: m.center.y + 3, z: m.center.z + 5 } };
  assert.ok(routeProblems(kiln, worldWith(kiln, [plug])).some(p => p.startsWith("kiln.route.loop")), "a plugged mouth must stop the loop");
});

test("composition: with these caves registered, every craft and diver route near them sweeps exactly as before", () => {
  const composed = deepWorld(), before = gameWorld();
  let segments = 0;
  for (const r of ROUTES) {
    if (r.profile === "carrier") continue; // refused at caves by contract; carrier lanes are held by footprint distance (fast test)
    const near = DEEP_CAVES.some(c => r.path.some(p => {
      const f = c.source.footprint;
      return Math.hypot(Math.max(f.minX - p.x, 0, p.x - f.maxX), Math.max(f.minZ - p.z, 0, p.z - f.maxZ)) < r.minHalfWidth + 20;
    }));
    if (!near) continue;
    const shape = CRAFT_PROFILES[r.profile];
    for (let i = 1; i < r.path.length; i++) {
      const a = r.path[i - 1]!, b = r.path[i]!, d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
      const x = before.moveCapsule(a, d, shape), y = composed.moveCapsule(a, d, shape);
      segments++;
      assert.equal(y.hitSolid, x.hitSolid, `${r.id} segment ${i}: hit changed`);
      assert.ok(Math.hypot(y.position.x - x.position.x, y.position.y - x.position.y, y.position.z - x.position.z) < 0.01, `${r.id} segment ${i} ends elsewhere`);
    }
  }
  assert.ok(segments > 50, `${segments} route segments compared`);
});

test("composition: the deep caves alone build one world without a legacy-guard or overlap throw", () => {
  assert.doesNotThrow(() => createCaveWorldQueries({ solids: SOLIDS, floor: surfaceHeight, caves: DEEP_CAVES.map(c => caveOwner(defOf(c))) }));
});
