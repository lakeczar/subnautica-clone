import test from "node:test";
import assert from "node:assert/strict";
import { CANOPY_ROOT_CAVES as S } from "../src/content/caves/canopyRootCaves.js";
import { CRAFT_PROFILES } from "../src/content/regions/passages.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import type { Vec3 } from "../src/sim/types.js";
import { buildCollision, chunksNear, COLLISION_BAND, createLargeCave } from "../src/world/caves/large/build.js";
import { buildChunkMesh } from "../src/world/caves/large/mesh.js";
import { caveRockAt } from "../src/world/caves/large/collision.js";
import { validateOwnership } from "../src/world/caves/large/field.js";
import { DIVER, boxSamples, productionWorld, random } from "./large-cave-support.js";

// LC: the Canopy root caves' authored guarantees, read from the field (fast),
// plus smokes of the real sweeps along the diver-only spurs, which run in full
// in tests/large-cave-canopy.heavy.test.ts.
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

test("Canopy field: continuous round every surface (no primitive culled while it still shapes the rock)", () => {
  // A culled piece shows as a step: two points 0.1 m apart whose values
  // differ by far more than their distance.
  const rnd = random(31), anchors = S.routes.flatMap(r => r.path);
  let worst = 0, at = "";
  for (let i = 0; i < 20000; i++) {
    const a = anchors[Math.floor(rnd() * anchors.length)]!;
    const p = { x: a.x + (rnd() - 0.5) * 24, y: a.y + (rnd() - 0.5) * 24, z: a.z + (rnd() - 0.5) * 24 };
    const d = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], l = Math.hypot(...d) / 0.1;
    const q = { x: p.x + d[0]! / l, y: p.y + d[1]! / l, z: p.z + d[2]! / l };
    // Deep in rock the field may fall back to the seabed distance (still rock):
    // only the band round the surface shapes meshes, light and sweeps.
    const fp = field.rock(p.x, p.y, p.z), fq = field.rock(q.x, q.y, q.z);
    if (Math.min(Math.abs(fp), Math.abs(fq)) > 1) continue;
    const jump = Math.abs(fp - fq);
    if (jump > worst) { worst = jump; at = JSON.stringify(p); }
  }
  assert.ok(worst < 0.3, `field steps ${worst.toFixed(2)} m over 0.1 m near ${at}`);
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

// --- Fast smokes (TT-1). The exhaustive sampling comparison and the full
// collision sweeps are in tests/large-cave-canopy.heavy.test.ts.

test("smoke: at one R1 collar point, buried poses are refused, a pose above the seabed is accepted, and probes agree with collision", () => {
  const [x, z] = [727.8, -60];
  buildCollision(cave, chunksNear(cave, [{ x, y: worldFloor(x, z), z }], 2));
  const world = productionWorld(cave);
  const feet = { x, y: worldFloor(x, z) - 1.3, z };
  assert.equal(world.clearance(feet, DIVER), false, `diver buried at ${JSON.stringify(feet)}`);
  assert.equal(world.clearance({ x: x - 3.5, y: worldFloor(x, z) - 1, z }, CRAFT_PROFILES.medium), false, "hull keel 1 m under the seabed");
  let top = -Infinity;
  for (const q of boxSamples({ x, y: 0, z }, DIVER)) top = Math.max(top, worldFloor(q.x, q.z));
  assert.equal(world.clearance({ x, y: top + 0.5, z }, DIVER), true);
  const rnd = random(19), y = worldFloor(x, z);
  let checked = 0;
  for (let i = 0; i < 400; i++) {
    const p = { x: x - 1.5 + rnd() * 3, y: y - 1.5 + rnd() * 3, z: z - 1.5 + rnd() * 3 };
    if (!field.owned(p.x, p.y, p.z)) continue;
    const f = field.rock(p.x, p.y, p.z);
    if (Math.abs(f) < 0.35) continue;
    checked++;
    assert.equal(caveRockAt(cave.collision, p), f < 0, `probe (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) field ${f.toFixed(2)}`);
  }
  assert.ok(checked > 50, `${checked} probes`);
});

test("smoke: the hall's chunk is identical with no brick skipped", () => {
  const at = { x: 742, y: -126, z: -100 };
  const c = chunksNear(cave, [at], 0).find(k => cave.lattice.origin.y + k.cy * 32 <= at.y && at.y < cave.lattice.origin.y + (k.cy + 1) * 32 &&
    cave.lattice.origin.x + k.cx * 32 <= at.x && at.x < cave.lattice.origin.x + (k.cx + 1) * 32 && cave.lattice.origin.z + k.cz * 32 <= at.z && at.z < cave.lattice.origin.z + (k.cz + 1) * 32)!;
  const fast = cave.mesh(c, "fine"), full = buildChunkMesh(field, cave.lattice, c, "fine", { band: COLLISION_BAND, exhaustive: true });
  assert.ok(fast.stats.skipped > 0, "skipping happened");
  assert.deepEqual([...full.positions], [...fast.positions]);
  assert.deepEqual([...full.indices], [...fast.indices]);
});
