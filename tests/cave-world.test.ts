import test from "node:test";
import assert from "node:assert/strict";
import { CRAFT_PROFILES } from "../src/content/regions/passages.js";
import { createWorldQueries, SOLIDS, surfaceHeight } from "../src/sim/world.js";
import { caveOwner, createCaveWorldQueries } from "../src/sim/caveWorld.js";
import { withCaveFloors } from "../src/content/regions/caves.js";
import type { Capsule, Vec3 } from "../src/sim/types.js";
import { actorBox } from "../src/sim/ribCollision.js";
import { def, DIVER, shift, shiftedFloor, SHIFT, world, wrapperWorld } from "./cave-support.js";

// W1-PRE R1-03: the prototype ownership adapter (`sim/caveWorld.ts`).
const f = def.replacementFootprints[0]!;
const owned = (x: number, z: number): boolean => x >= f.minX && x < f.maxX && z >= f.minZ && z < f.maxZ;
const random = (seed: number) => () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
/** Deepest exterior-owned burial of a pose's base, sampled 5 x 5 (world frame). */
function buried(p: Vec3, shape: Capsule): number {
  const b = actorBox(p, shape);
  let worst = -Infinity;
  for (let i = 0; i <= 4; i++) for (let k = 0; k <= 4; k++) {
    const x = b.min.x + (b.max.x - b.min.x) * i / 4, z = b.min.z + (b.max.z - b.min.z) * k / 4;
    if (!owned(x, z)) worst = Math.max(worst, shiftedFloor(x + SHIFT.x, z + SHIFT.z) - b.min.y);
  }
  return worst;
}
const unshift = (p: Vec3): Vec3 => ({ x: p.x - SHIFT.x, y: p.y, z: p.z - SHIFT.z });
/** The shape's box overlaps the owned footprint: the adapter's ownership case.
 * Shapes wholly outside follow the exterior world's existing floor policy. */
const touches = (p: Vec3, shape: Capsule): boolean => {
  const b = actorBox(p, shape);
  return b.min.x < f.maxX && b.max.x > f.minX && b.min.z < f.maxZ && b.max.z > f.minZ;
};

test("R1 straddle: a diver whose corner is in exterior ground is not clear", () => {
  const feet = { x: -283.36, y: -18.99, z: -40.05 };
  assert.ok(buried(feet, DIVER) > 0.3, "fixture: the outer corner is 0.33 m inside the exterior ground");
  assert.equal(wrapperWorld.clearance(shift(feet), DIVER), true, "the floor wrapper alone samples only the centre");
  assert.equal(world.clearance(shift(feet), DIVER), false, "the adapter tests the whole base against both owners");
});

test("the adapter never accepts a pose or a swept move that buries a corner in exterior ground", () => {
  const next = random(41);
  const shapes: Capsule[] = [DIVER, CRAFT_PROFILES.small];
  let clear = 0, moved = 0;
  for (let n = 0; n < 1500; n++) {
    const shape = shapes[n % shapes.length]!;
    // Poses straddling every footprint edge, from just under to above the ground.
    const edge = n % 4, u = next(), across = (next() - 0.5) * 3;
    const x = edge === 0 ? f.minX + across : edge === 1 ? f.maxX + across : f.minX + u * (f.maxX - f.minX);
    const z = edge === 2 ? f.minZ + across : edge === 3 ? f.maxZ + across : f.minZ + u * (f.maxZ - f.minZ);
    const ground = Math.max(shiftedFloor(x + SHIFT.x, z + SHIFT.z), world.supportHeight(x + SHIFT.x, z + SHIFT.z, 0));
    const p = { x, y: ground - 0.3 + next() * 2.5, z };
    if (!touches(p, shape) || !world.clearance(shift(p), shape)) continue;
    clear++;
    assert.ok(buried(p, shape) <= 0.025, `clear pose buried ${buried(p, shape).toFixed(3)} m at ${JSON.stringify(p)}`);
    const d = { x: (next() - 0.5) * 3, y: (next() - 0.7) * 2, z: (next() - 0.5) * 3 };
    const r = world.moveCapsule(shift(p), d, shape);
    const end = unshift(r.position);
    if (!touches(end, shape)) continue;
    moved++;
    assert.ok(buried(end, shape) <= 0.025, `move from ${JSON.stringify(p)} by ${JSON.stringify(d)} buried ${buried(end, shape).toFixed(3)} m`);
  }
  assert.ok(clear > 300 && moved > 250, `${clear} clear straddling poses, ${moved} moves`);
});

test("legacy terrain guards are untouched: away from caves the adapter is the original world", () => {
  const legacy = createWorldQueries(SOLIDS, surfaceHeight);
  const adapter = createCaveWorldQueries({ solids: SOLIDS, floor: surfaceHeight, caves: [caveOwner(def)] });
  // R1's bench case: the floor wrapper loses the bench cut walls (37.66 -> 45).
  const a = { x: 35, y: -13, z: -54 }, d = { x: 10, y: 0, z: 0 };
  const guarded = legacy.moveCapsule(a, d, DIVER);
  assert.ok(Math.abs(guarded.position.x - 37.659) < 1e-3, "fixture: the bench stops the legacy world");
  assert.deepEqual(adapter.moveCapsule(a, d, DIVER), guarded);
  assert.ok(createWorldQueries(SOLIDS, withCaveFloors(surfaceHeight)).moveCapsule(a, d, DIVER).position.x > 44.9,
    "fixture: the wrapper alone loses the bench guard");
  // Identical answers over the dense legacy hotspots.
  const next = random(7), spots: Vec3[] = [{ x: 0, y: 0.5, z: 20 }, { x: 10, y: 1.5, z: -36 }, { x: 44, y: -12, z: -54 },
    { x: 116, y: -117, z: -126 }, { x: 178, y: -164, z: -218 }, { x: 216, y: -170, z: -240 }];
  const shapes: Capsule[] = [DIVER, CRAFT_PROFILES.small, CRAFT_PROFILES.medium];
  for (const spot of spots) for (let i = 0; i < 80; i++) {
    const p = { x: spot.x + (next() - 0.5) * 16, y: spot.y + (next() - 0.5) * 8, z: spot.z + (next() - 0.5) * 16 };
    const q = { x: p.x + (next() - 0.5) * 6, y: p.y + (next() - 0.5) * 4, z: p.z + (next() - 0.5) * 6 };
    const shape = shapes[i % shapes.length]!;
    assert.deepEqual(adapter.moveCapsule(p, { x: q.x - p.x, y: q.y - p.y, z: q.z - p.z }, shape),
      legacy.moveCapsule(p, { x: q.x - p.x, y: q.y - p.y, z: q.z - p.z }, shape));
    assert.equal(adapter.clearance(p, shape), legacy.clearance(p, shape));
    assert.equal(adapter.supportHeight(p.x, p.z, p.y), legacy.supportHeight(p.x, p.z, p.y));
    assert.equal(adapter.groundHeight(p.x, p.z), legacy.groundHeight(p.x, p.z));
    assert.equal(adapter.lineOfSight(p, q), legacy.lineOfSight(p, q));
  }
});

test("a cave reaching legacy-guarded terrain, or a hull too big for the collar, is refused", () => {
  const inside = { ...caveOwner(def), footprint: { minX: 20, maxX: 72, minZ: -80, maxZ: -28 } };
  assert.throws(() => createCaveWorldQueries({ solids: SOLIDS, floor: surfaceHeight, caves: [inside] }), /legacy-guarded/);
  const carrier: Capsule = CRAFT_PROFILES.carrier;
  const r = world.moveCapsule(shift({ x: f.maxX + 1, y: -5, z: -60 }), { x: -2, y: 0, z: 0 }, carrier);
  assert.ok(r.hitSolid && r.position.x === f.maxX + 1 + SHIFT.x, "a carrier-sized shape at a cave is refused, not half-checked");
});

test("support near a cave reads what is below the actor, never the roof above", () => {
  const vault = def.rooms.find(r => r.id === "fanvault.vault")!;
  const p = { x: (vault.bounds.min.x + vault.bounds.max.x) / 2 + 0.25, y: vault.bounds.min.y + 1, z: vault.bounds.min.z + 4.25 };
  const below = world.supportHeight(p.x + SHIFT.x, p.z + SHIFT.z, p.y), above = world.supportHeight(p.x + SHIFT.x, p.z + SHIFT.z, 1000);
  assert.ok(below <= p.y && below > p.y - 2, `support ${below} below ${p.y}`);
  assert.ok(above > p.y + 5, "the roof top is the support from above");
  assert.ok(world.groundHeight(p.x + SHIFT.x, p.z + SHIFT.z) < def.source.baseY, "the heightfield steps aside inside the footprint");
});
