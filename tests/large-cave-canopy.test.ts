import test from "node:test";
import assert from "node:assert/strict";
import { CANOPY_ROOT_CAVES as S } from "../src/content/caves/canopyRootCaves.js";
import { CRAFT_PROFILES } from "../src/content/regions/passages.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import type { Vec3 } from "../src/sim/types.js";
import { buildCollision, chunksNear, createLargeCave } from "../src/world/caves/large/build.js";
import { caveRockAt } from "../src/world/caves/large/collision.js";
import { validateOwnership } from "../src/world/caves/large/field.js";
import { DIVER, boxSamples, composedWith, random, seek } from "./large-cave-support.js";

// LC: the Canopy root caves' authored guarantees, read from the field (fast),
// plus real sweeps along the diver-only spurs.
const cave = createLargeCave(S, worldFloor);
const field = cave.field;
const water = (p: Vec3): boolean => field.rock(p.x, p.y, p.z) > 0;

test("Canopy: ownership holds, the biome is about 250 m with 4-5 main zones and 3 openings", () => {
  assert.deepEqual(validateOwnership(field), []);
  const d = S.domain;
  assert.ok(d.max.x - d.min.x >= 240 && d.max.z - d.min.z >= 150);
  const main = S.zones.filter(z => z.role !== "passage");
  assert.ok(main.length >= 4 && main.length <= 5);
  const open = S.portals.filter(p => p.between.includes("exterior"));
  assert.deepEqual(open.map(p => p.kind).sort(), ["back_entrance", "mouth", "mouth"]);
  assert.deepEqual(open.find(p => p.kind === "back_entrance")!.admits, ["diver"]);
  // Story-neutral blockout: no registry items are claimed.
  assert.ok(S.sockets.every(s => !/[A-Z]/.test(s.kind)));
});

test("Canopy portals: each clear rectangle is open water and admits exactly its profiles", () => {
  for (const p of S.portals) {
    const n = p.normal, nl = Math.hypot(n.x, n.y, n.z), u = Math.abs(n.y / nl) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: -n.z / Math.hypot(n.x, n.z), y: 0, z: n.x / Math.hypot(n.x, n.z) };
    const v = Math.abs(n.y / nl) > 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
    for (let a = -0.5; a <= 0.5; a += 0.125) for (let b = -0.5; b <= 0.5; b += 0.125) {
      const q = { x: p.center.x + u.x * a * p.clear.width + v.x * b * p.clear.height, y: p.center.y + u.y * a * p.clear.width + v.y * b * p.clear.height,
        z: p.center.z + u.z * a * p.clear.width + v.z * b * p.clear.height };
      assert.ok(water(q), `${p.id}: rock at (${q.x.toFixed(1)}, ${q.y.toFixed(1)}, ${q.z.toFixed(1)}) inside its clear rectangle`);
    }
    // Admitted profiles fit with a metre to spare; diver-only ones are narrower than any hull.
    for (const id of p.admits) {
      const s = CRAFT_PROFILES[id];
      assert.ok(p.clear.width >= 2 * s.radius + 1 && p.clear.height >= s.height + 1, `${p.id} admits ${id} without margin`);
    }
    if (p.admits.length === 1) assert.ok(p.clear.width < 2 * CRAFT_PROFILES.small.radius, `${p.id}: a diver-only throat a hull could pass`);
  }
});

test("Canopy routes: every route's profile box is in open water along its whole length", () => {
  for (const r of S.routes) {
    const s = CRAFT_PROFILES[r.profile];
    for (let i = 1; i < r.path.length; i++) {
      const a = r.path[i - 1]!, b = r.path[i]!, n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 0.5);
      for (let k = 0; k <= n; k++) {
        const p = { x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n, z: a.z + (b.z - a.z) * k / n };
        const bad = boxSamples(p, s).find(q => !water(q));
        assert.equal(bad, undefined, `${r.id} (${r.profile}) hits rock at ${JSON.stringify(bad)} near (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`);
      }
    }
  }
});

test("Canopy diver spurs: real sweeps thread the squeeze, the crawl, the tangle and the grotto", () => {
  const spurs = S.routes.filter(r => r.profile === "diver");
  buildCollision(cave, chunksNear(cave, spurs.flatMap(r => r.path), 14));
  const world = composedWith(cave, worldFloor, { x: -690, y: 0, z: 0 });
  for (const r of spurs) {
    const run = seek(world, r.path, DIVER, 3.4);
    assert.ok(run.reached, `${r.id}: the diver did not get through`);
    const buried = run.poses.flatMap(p => boxSamples(p, DIVER)).find(q => caveRockAt(cave.collision, q));
    assert.equal(buried, undefined, `${r.id}: diver inside rock at ${JSON.stringify(buried)}`);
  }
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
