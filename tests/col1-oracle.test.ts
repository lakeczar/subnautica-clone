import assert from "node:assert/strict";
import test from "node:test";
import { dishScene, probe, vistaScene } from "./col1-oracle-support.js";

/** COL-1 oracle, fast smoke: a few hundred probes per structure scene.
 * The exhaustive sweeps are `col1-oracle.heavy.test.ts`. */

const SMOKE = { poses: 300, moves: 200, columns: 300, sights: 150, seed: 2 };

test("oracle smoke: the dishes and A1's set pieces as art agree with their box covers, or are more faithful", () => {
  for (const scene of [dishScene(), vistaScene()]) {
    const r = probe(scene, SMOKE);
    assert.ok(scene.after.triangles > 0 && scene.before.boxes > scene.after.boxCount, scene.id);
    assert.equal(r.clearance.spurious, 0, `${scene.id}: ${JSON.stringify(r.examples.slice(0, 3))}`);
    assert.equal(r.sight.newOnlyBlockedOutsideArt, 0, scene.id);
    assert.equal(r.moves.spurious, 0, `${scene.id}: ${JSON.stringify(r.examples.slice(0, 3))}`);
    assert.deepEqual(r.protected.newlyBlocked, [], scene.id);
    assert.ok(r.clearance.agree > r.clearance.tried * 0.8, `${scene.id}: ${JSON.stringify(r.clearance)}`);
  }
});
