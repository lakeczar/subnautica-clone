import assert from "node:assert/strict";
import test from "node:test";
import { DISH_SEGMENTS, rimLine } from "../src/content/regions/dishGeometry.js";
import { STRUCTURES } from "../src/content/regions/structures.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import type { Vec3 } from "../src/sim/types.js";
import { skinShape } from "../src/world/collision/bake.js";
import { createStaticCollider } from "../src/world/collision/collider.js";
import { DIVER, dishScene, probe, vistaScene } from "./col1-oracle-support.js";

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
    assert.equal(r.moves.endIllegal, 0, `${scene.id}: ${JSON.stringify(r.examples.slice(0, 3))}`);
    assert.deepEqual(r.protected.newlyBlocked, [], scene.id);
    assert.ok(r.clearance.agree > r.clearance.tried * 0.8, `${scene.id}: ${JSON.stringify(r.clearance)}`);
  }
});

test("DISH-1's own checks on the static world: a diver stops at every drawn rim and cannot pass a bowl panel", () => {
  const scene = dishScene(), w = scene.neo, diver = DIVER;
  for (const d of STRUCTURES.filter(s => s.kind === "dish")) {
    const p = { id: d.id, x: d.x, z: d.z, base: d.base, radius: d.p.radius!, tilt: d.p.tilt!, facing: d.p.facing! };
    const ring = rimLine(p), kept = d.dish!.rimKept, through: string[] = [];
    let tried = 0, candidates = 0;
    for (let i = 0; i < DISH_SEGMENTS; i++) for (let k = 0; k < 6; k++) {
      if (!kept[i] || !kept[(i + DISH_SEGMENTS - 1) % DISH_SEGMENTS] || !kept[(i + 1) % DISH_SEGMENTS]) continue;
      const a = ring[i]!, b = ring[i + 1]!, t = (k + 0.5) / 6, rim = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
      const rx = rim.x - d.x, rz = rim.z - d.z, l = Math.hypot(rx, rz), ux = rx / l, uz = rz / l;
      for (const dir of [-1, 1]) {
        const start = { x: rim.x - ux * 2.5 * dir, y: rim.y - diver.height / 2, z: rim.z - uz * 2.5 * dir };
        candidates++;
        if (!w.clearance(start, diver) || worldFloor(start.x, start.z) > start.y - 0.2) continue;
        tried++;
        const end = w.moveCapsule(start, { x: ux * 5 * dir, y: 0, z: uz * 5 * dir }, diver).position;
        if (((end.x - rim.x) * ux + (end.z - rim.z) * uz) * dir > 1) through.push(`${d.id} rim ${i}.${k} ${dir}`);
      }
    }
    // As DISH-1's own test: half the starts clear (inward ones sit near the bowl, outward ones by a fin).
    assert.ok(tried >= candidates * 0.5, `${d.id}: only ${tried} of ${candidates} rim crossings started clear`);
    assert.deepEqual(through, [], `${d.id}: swims through the rim`);
    // Slides on the tilted porcelain carry the diver along the bowl, so the
    // check is that it never ends on the other side: the line from its start
    // centre to its end centre crosses no panel.
    const bowl = createStaticCollider(`${d.id}.bowl`, [skinShape(`${d.id}.bowl`, d.dish!.bowl)!]);
    let panels = 0;
    for (const f of d.dish!.bowl) {
      const [a, b, c] = f.pts as [Vec3, Vec3, Vec3], m = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3, z: (a.z + b.z + c.z) / 3 };
      for (const dir of [-1, 1]) {
        const start = { x: m.x, y: m.y - 3 * dir - (dir > 0 ? diver.height : 0), z: m.z };
        if (!w.clearance(start, diver) || worldFloor(start.x, start.z) > start.y - 0.3) continue;
        panels++;
        const end = w.moveCapsule(start, { x: 0, y: 6 * dir, z: 0 }, diver).position, h = diver.height / 2;
        assert.ok(bowl.segmentClear({ ...start, y: start.y + h }, { ...end, y: end.y + h }),
          `${d.id}: passed a bowl panel ${dir > 0 ? "from below" : "from inside"} at ${JSON.stringify(m)}, ended ${JSON.stringify(end)}`);
      }
    }
    assert.ok(panels > 40, `${d.id}: only ${panels} panel crossings started clear`);
  }
});
