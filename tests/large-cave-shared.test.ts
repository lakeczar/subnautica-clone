import test from "node:test";
import assert from "node:assert/strict";
import { CRAFT_PROFILES } from "../src/content/regions/passages.js";
import type { Capsule, Vec3 } from "../src/sim/types.js";
import { actorBox } from "../src/sim/ribCollision.js";
import { createWorldQueries, SOLIDS, surfaceHeight } from "../src/sim/world.js";
import { caveOwner } from "../src/sim/caveWorld.js";
import { boxCaveCollider } from "../src/world/caves/large/boxCollider.js";
import { CAVE_SUB_SWEEP, composeCaveWorld, largeCaveCollider, translatedWorld } from "../src/world/caves/large/compose.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import type { Solid } from "../src/sim/world.js";
import { def, inRock } from "./cave-support.js";
import { DIVER, random, vault, vaultFloor, VAULT_OFFSET, boxSamples } from "./large-cave-support.js";
import { caveRockAt } from "../src/world/caves/large/collision.js";

// LC: one world-query interface for small and large caves. The W1 Fanvault
// (thick boxes) and a cave biome (a triangle mesh) are both `CaveCollider`s
// and compose through `composeCaveWorld`, with per-sub-sweep ownership.
const BAND = 2 * 4.5 + CAVE_SUB_SWEEP + 0.5;
// The Fanvault runs in a frame of its own here, inside the baseline
// WORLD_BOUNDS and clear of the vault fixture (which sits at X/Z 0..64).
const SHIFT = { x: 300, y: 0, z: -100 };
const shift = (p: Readonly<Vec3>): Vec3 => ({ x: p.x + SHIFT.x, y: p.y, z: p.z + SHIFT.z });
const shiftSolid = (s: Solid): Solid => ({ id: s.id, min: shift(s.min), max: shift(s.max) });
const shiftedFloor = (x: number, z: number): number => worldFloor(x - SHIFT.x, z - SHIFT.z);
const owner = caveOwner(def), f = owner.footprint;
const fanvault = boxCaveCollider({ ...owner, footprint: { minX: f.minX + SHIFT.x, maxX: f.maxX + SHIFT.x, minZ: f.minZ + SHIFT.z, maxZ: f.maxZ + SHIFT.z },
  rock: owner.rock.map(shiftSolid) }, shiftedFloor, BAND);
const big = vault();
// Both caves in one composed world: the Fanvault at Z -192..-140, the vault
// fixture at Z 0..64; the exterior is the real `createWorldQueries`.
const floor = (x: number, z: number): number => z > -60 ? vaultFloor(x, z) : shiftedFloor(x, z);
const exterior = createWorldQueries([], floor);
const world = composeCaveWorld({ exterior, solids: [], floor, caves: [fanvault, largeCaveCollider(big.collision)] });
void translatedWorld; void VAULT_OFFSET;

const owned = (x: number, z: number): boolean => x >= f.minX && x < f.maxX && z >= f.minZ && z < f.maxZ;
/** Deepest burial of a pose's base in exterior ground the cave does not own (world frame). */
function buried(p: Vec3, shape: Capsule): number {
  const b = actorBox(p, shape);
  let worst = -Infinity;
  for (let i = 0; i <= 4; i++) for (let k = 0; k <= 4; k++) {
    const x = b.min.x + (b.max.x - b.min.x) * i / 4, z = b.min.z + (b.max.z - b.min.z) * k / 4;
    if (!owned(x, z)) worst = Math.max(worst, shiftedFloor(x + SHIFT.x, z + SHIFT.z) - b.min.y);
  }
  return worst;
}
const touches = (p: Vec3, shape: Capsule): boolean => {
  const b = actorBox(p, shape);
  return b.min.x < f.maxX && b.max.x > f.minX && b.min.z < f.maxZ && b.max.z > f.minZ;
};
const unshift = (p: Vec3): Vec3 => ({ x: p.x - SHIFT.x, y: p.y, z: p.z - SHIFT.z });

test("shared interface: the W1 straddle pose is rejected through the composer", () => {
  const feet = { x: -283.36, y: -18.99, z: -40.05 };
  assert.ok(buried(feet, DIVER) > 0.3, "fixture: the outer corner is 0.33 m inside the exterior ground");
  assert.equal(world.clearance(shift(feet), DIVER), false);
});

test("shared interface: Fanvault poses and moves through the composer never bury a corner or enter rock", () => {
  const next = random(41), shapes: Capsule[] = [DIVER, CRAFT_PROFILES.small];
  let clear = 0, moved = 0;
  for (let n = 0; n < 1500; n++) {
    const shape = shapes[n % shapes.length]!;
    const edge = n % 4, u = next(), across = (next() - 0.5) * 3;
    const x = edge === 0 ? f.minX + across : edge === 1 ? f.maxX + across : f.minX + u * (f.maxX - f.minX);
    const z = edge === 2 ? f.minZ + across : edge === 3 ? f.maxZ + across : f.minZ + u * (f.maxZ - f.minZ);
    const ground = Math.max(shiftedFloor(x + SHIFT.x, z + SHIFT.z), world.supportHeight(x + SHIFT.x, z + SHIFT.z, 0));
    const p = { x, y: ground - 0.3 + next() * 2.5, z };
    if (!touches(p, shape) || !world.clearance(shift(p), shape)) continue;
    clear++;
    assert.ok(buried(p, shape) <= 0.025, `clear pose buried ${buried(p, shape).toFixed(3)} m at ${JSON.stringify(p)}`);
    const d = { x: (next() - 0.5) * 3, y: (next() - 0.7) * 2, z: (next() - 0.5) * 3 };
    const end = unshift(world.moveCapsule(shift(p), d, shape).position);
    if (!touches(end, shape)) continue;
    moved++;
    assert.ok(buried(end, shape) <= 0.025, `move from ${JSON.stringify(p)} by ${JSON.stringify(d)} buried ${buried(end, shape).toFixed(3)} m`);
    assert.ok(!boxSamples(end, shape).some(q => inRock(q)), `move from ${JSON.stringify(p)} ended in Fanvault rock`);
  }
  assert.ok(clear > 300 && moved > 250, `${clear} clear straddling poses, ${moved} moves`);
});

test("shared interface: away from every cave the composer is the exterior world, legacy guards included", () => {
  const legacy = createWorldQueries(SOLIDS, surfaceHeight);
  const composed = composeCaveWorld({ exterior: legacy, solids: SOLIDS, floor: surfaceHeight, caves: [fanvault] });
  // R1's bench case: the bench cut walls stop the legacy world at 37.66.
  const a = { x: 35, y: -13, z: -54 }, d = { x: 10, y: 0, z: 0 };
  assert.deepEqual(composed.moveCapsule(a, d, DIVER), legacy.moveCapsule(a, d, DIVER));
  const next = random(7);
  for (let i = 0; i < 300; i++) {
    const p = { x: 40 + (next() - 0.5) * 60, y: -10 - next() * 30, z: -60 + (next() - 0.5) * 60 };
    const q = { x: p.x + (next() - 0.5) * 6, y: p.y + (next() - 0.5) * 4, z: p.z + (next() - 0.5) * 6 };
    assert.deepEqual(composed.moveCapsule(p, { x: q.x - p.x, y: q.y - p.y, z: q.z - p.z }, DIVER), legacy.moveCapsule(p, { x: q.x - p.x, y: q.y - p.y, z: q.z - p.z }, DIVER));
    assert.equal(composed.clearance(p, DIVER), legacy.clearance(p, DIVER));
    assert.equal(composed.supportHeight(p.x, p.z, p.y), legacy.supportHeight(p.x, p.z, p.y));
    assert.equal(composed.lineOfSight(p, q), legacy.lineOfSight(p, q));
  }
});

test("shared interface: a small cave and a cave biome answer in one composed world", () => {
  const inVault = { x: 28, y: -73, z: 20 };
  assert.ok(world.clearance(inVault, DIVER));
  let p = { ...inVault };
  for (let i = 0; i < 200; i++) p = world.moveCapsule(p, { x: 0.2, y: 0, z: 0 }, DIVER).position;
  assert.ok(p.x < 33 && !boxSamples(p, DIVER).some(q => caveRockAt(big.collision, q)), `the vault's pillar stops the diver (x ${p.x.toFixed(2)})`);
  // In the Fanvault vault, support comes from its rock boxes below.
  const vaultRoom = def.rooms.find(r => r.id === "fanvault.vault")!;
  const q = { x: (vaultRoom.bounds.min.x + vaultRoom.bounds.max.x) / 2 + 0.25, y: vaultRoom.bounds.min.y + 1, z: vaultRoom.bounds.min.z + 4.25 };
  const below = world.supportHeight(q.x + SHIFT.x, q.z + SHIFT.z, q.y);
  assert.ok(below <= q.y && below > q.y - 2, `support ${below} below ${q.y}`);
  assert.ok(world.caveAt(actorBox(shift(q), DIVER))?.id === "fanvault" && world.caveAt(actorBox(inVault, DIVER))?.id === "test_vault");
});

test("LC-04: exterior walls still stop a move and block sight, inside a cave sub-sweep's reach and after it", () => {
  const flat = (): number => -100;
  for (const wallX of [4.5, 14]) {
    const wall = { id: `r1.wall.${wallX}`, min: { x: wallX, y: -80, z: -10 }, max: { x: wallX + 0.05, y: -40, z: -3 } };
    const box = boxCaveCollider({ id: "r1.owner", footprint: { minX: 0, maxX: 4, minZ: -10, maxZ: -4 }, baseY: -100, rock: [] }, flat, 10);
    const shared = composeCaveWorld({ exterior: createWorldQueries([wall], flat), solids: [wall], floor: flat, caves: [box] });
    const a = { x: 3, y: -60, z: -7 };
    const r = shared.moveCapsule(a, { x: 30, y: 0, z: 0 }, DIVER);
    assert.ok(r.hitSolid && r.position.x < wallX - DIVER.radius + 1e-3 && r.position.x > wallX - DIVER.radius - 0.01, `wall at ${wallX}: stopped at ${r.position.x}`);
    assert.equal(shared.lineOfSight(a, { x: 33, y: -60, z: -7 }), false, `wall at ${wallX} blocks sight`);
  }
});
