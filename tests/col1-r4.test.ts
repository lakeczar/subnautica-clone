import assert from "node:assert/strict";
import test from "node:test";
import { CAVE_SOURCES, caveDef } from "../src/content/regions/caves.js";
import { caveShell } from "../src/content/regions/caveGeometry.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import type { Vec3 } from "../src/sim/types.js";
import { meshFacing, orientationProblems } from "../src/world/collision/bake.js";
import { kitShellShapes } from "../src/world/collision/caveShapes.js";
import { createStaticCollider } from "../src/world/collision/collider.js";

/** COL-1 stage A, Sol R4 (`docs/build/reviews/COL-1A-SOL-XHIGH-R4.md`):
 * winding votes use the shape's own occupancy and abstain where it cannot
 * decide (R4-1), and null triangles have no orientation (P3). The sweep
 * over every shipped shape is `col1-art.heavy.test.ts`. */

test("R4-1: the shipped Apron hollow's shell bakes, oriented by the occupancy it was meshed from", () => {
  assert.ok(CAVE_SOURCES.some(s => s.id === "hub_apron_hollow"), "the cave is in the game's list");
  const def = caveDef("hub_apron_hollow", worldFloor), sh = caveShell(def, "fine");
  const mesh = { positions: sh.positions, indices: Uint32Array.from(sh.indices) };
  assert.equal(mesh.indices.length / 3, 10728);
  assert.deepEqual(orientationProblems(def.id, mesh, false), []);
  // The old proxy, the rock box cover, outvotes nothing now: outside its domain it gives no answer.
  const f = def.replacementFootprints[0]!;
  const cover = (p: Vec3): boolean | null => p.x < f.minX || p.x >= f.maxX || p.z < f.minZ || p.z >= f.maxZ ? null
    : def.rock.some(b => p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z);
  assert.equal(meshFacing(def.id, mesh, cover), 1);
  const shapes = kitShellShapes(def, worldFloor);
  assert.ok(shapes.length >= 1 && shapes.every(s => s.facing === 1 && s.interior === "solid"));
  const col = createStaticCollider("apron", shapes);
  assert.ok(col.triangles === 10728);
});

/** A tetrahedron, outward-wound. */
const TET = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]), indices: new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]) };
const inTet = (p: Vec3): boolean => p.x > 0 && p.y > 0 && p.z > 0 && p.x + p.y + p.z < 1;

test("R4-1: votes abstain where the predicate cannot decide; no decisive vote is a loud failure; a contrary decisive vote still refuses", () => {
  assert.equal(meshFacing("tet", TET, inTet), 1);
  // Unknown outside a half-space: the votes there abstain, the rest decide.
  assert.equal(meshFacing("tet", TET, p => (p.z > 0.5 ? null : inTet(p))), 1);
  assert.throws(() => meshFacing("tet", TET, () => null), /tet: winding votes disagree or are absent \(0 out, 0 in, 4 undecided\)/);
  // A predicate that is wrong for one face (a proxy inverted there) is a disagreement, not a majority.
  // Near the x = 0 face only (its centroid has x = 0; the others' have x = 1/3), rock is claimed on the outside.
  const inverted = (p: Vec3): boolean => (Math.abs(p.x) <= 0.2 && p.y > 0 && p.z > 0 && p.y + p.z < 1 ? p.x < 0 : inTet(p));
  assert.throws(() => meshFacing("tet", TET, inverted), /tet: winding votes disagree or are absent \(3 out, 1 in, 0 undecided\)/);
});

test("P3: a null triangle (a repeated index) has no orientation, and a closed mesh with one stays closed", () => {
  const withNull = { positions: TET.positions, indices: new Uint32Array([...TET.indices, 0, 0, 1]) };
  assert.deepEqual(orientationProblems("tet", withNull, true), []);
  assert.equal(meshFacing("tet", withNull, inTet), 1);
});
