import assert from "node:assert/strict";
import test from "node:test";
import { CAVE_SOURCES, caveDef } from "../src/content/regions/caves.js";
import { caveShell, caveVolume } from "../src/content/regions/caveGeometry.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import type { Vec3 } from "../src/sim/types.js";
import { meshComponents, orientationProblems } from "../src/world/collision/bake.js";
import { KIT_SHELL_ORIENTATION, kitShellShapes } from "../src/world/collision/caveShapes.js";
import { createStaticCollider } from "../src/world/collision/collider.js";
import { probeComponents } from "./col1-support.js";

/** COL-1 stage A, Sol R4 (`docs/build/reviews/COL-1A-SOL-XHIGH-R4.md`): the
 * shipped Apron hollow bakes. Since R5 its orientation is the mesher's,
 * by construction (`KIT_SHELL_ORIENTATION`), certified per component;
 * probing is only this test's cross-check. */

test("R4-1: the shipped Apron hollow's shell bakes, oriented by provenance and cross-checked by its own occupancy", () => {
  assert.ok(CAVE_SOURCES.some(s => s.id === "hub_apron_hollow"), "the cave is in the game's list");
  const def = caveDef("hub_apron_hollow", worldFloor), sh = caveShell(def, "fine");
  const mesh = { positions: sh.positions, indices: Uint32Array.from(sh.indices) };
  assert.equal(mesh.indices.length / 3, 10728);
  assert.deepEqual(orientationProblems(def.id, mesh, false), []);
  const shapes = kitShellShapes(def);
  assert.ok(shapes.length >= 1 && shapes.every(s => s.facing === KIT_SHELL_ORIENTATION.facing && s.interior === "solid"));
  assert.equal(createStaticCollider("apron", shapes).triangles, 10728);
  // Cross-check, never the decider: the opened voxel volume agrees with every component.
  const vol = caveVolume(def), g = vol.grid;
  const inside = (p: Vec3): boolean | null => {
    const i = Math.floor((p.x - g.origin.x) / g.voxel), j = Math.floor((p.y - g.origin.y) / g.voxel), k = Math.floor((p.z - g.origin.z) / g.voxel);
    return i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz ? null : vol.solid[i + g.nx * (j + g.ny * k)] === 1;
  };
  const { of, count } = meshComponents(mesh);
  for (const row of probeComponents(mesh, of, new Int8Array(count).fill(1), inside))
    assert.ok(row.contrary <= Math.max(1, (row.agree + row.contrary) * 0.05), JSON.stringify(row));
});
