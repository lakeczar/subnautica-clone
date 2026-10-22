// LC heavy tier (TT-1): the every-chunk exhaustive sampling comparison and 120 random
// mouth trials on the synthetic vault. tests/large-cave.test.ts keeps the rest and fast
// smokes (prefixes of both).
import test from "node:test";
import assert from "node:assert/strict";
import { actorBox } from "../src/sim/ribCollision.js";
import { buildChunkMesh } from "../src/world/caves/large/mesh.js";
import { COLLISION_BAND } from "../src/world/caves/large/build.js";
import { CREEL, DART, DIVER, VAULT, boxSamples, random, seek, vaultFloor } from "./large-cave-support.js";
import { VAULT_OWNED, buried, cave, solidAt, world } from "./large-cave-vault-support.js";

test("LC sampling: skipping bricks no primitive reaches changes no vertex", () => {
  for (const c of cave.chunks) for (const lod of ["fine", "coarse"] as const) {
    const fast = cave.mesh(c, lod), full = buildChunkMesh(cave.field, cave.lattice, c, lod, { band: lod === "fine" ? COLLISION_BAND : 0, exhaustive: true });
    assert.deepEqual([...full.positions], [...fast.positions], `chunk ${fast.key} ${lod}`);
    assert.deepEqual([...full.indices], [...fast.indices], `chunk ${fast.key} ${lod}`);
    assert.ok(fast.stats.skipped > 0 || lod === "coarse", "the fixture exercises skipping");
  }
});

test("LC mouth: a craft straddling the collar edge never buries a corner in either owner", () => {
  // From open water above the seabed, down the shaft and back out, and
  // sliding along the seabed across the collar edge, through the composed world.
  const rnd = random(11);
  for (let trial = 0; trial < 120; trial++) {
    const shape = trial % 3 === 0 ? DIVER : trial % 3 === 1 ? DART : CREEL;
    let p = { x: 12 + rnd() * 40, y: -38 - rnd() * 4, z: 20 + rnd() * 40 };
    if (!world.clearance(p, shape)) continue;
    for (let i = 0; i < 90; i++) {
      const d = { x: (rnd() - 0.5) * 0.6, y: -0.2 - rnd() * 0.3, z: (rnd() - 0.5) * 0.6 };
      p = world.moveCapsule(p, d, shape).position;
      // Shapes the exterior answers keep its policy (centre-sampled, unswept
      // floor, lifted by the caller): only cave-answered poses are checked
      // against both owners; cave rock is checked always.
      const cave = world.caveAt(actorBox(p, shape));
      if (!cave) {
        // As `hullFloor`: the highest seabed under the footprint's nine points.
        let g = -Infinity;
        for (const q of boxSamples(p, shape)) g = Math.max(g, vaultFloor(q.x, q.z));
        p = { ...p, y: Math.max(p.y, g - (shape.bottom ?? 0)) };
      }
      const b = cave ? buried(p, shape) : boxSamples(p, shape).find(q => cave !== null && solidAt(q)) ??
        boxSamples(p, shape).find(q => VAULT_OWNED(q) && solidAt(q));
      assert.equal(b, undefined, `trial ${trial}: ${JSON.stringify(shape)} buried at ${JSON.stringify(b)} near ${JSON.stringify(p)}`);
    }
  }
  // Down the shaft into the chamber with ordinary seeking.
  const down = seek(world, VAULT.routes[0]!.path, DIVER, 4);
  assert.ok(down.reached && down.poses.every(q => !buried(q, DIVER)), "down the shaft");
});
