import assert from "node:assert/strict";
import test from "node:test";
import { createWorldQueries, type Solid } from "../src/sim/world.js";
import type { Capsule, Vec3 } from "../src/sim/types.js";
import { boxCaveCollider } from "../src/world/caves/large/boxCollider.js";
import { composeCaveWorld } from "../src/world/caves/large/compose.js";
import { collarHeightfield } from "../src/world/collision/bake.js";
import { createHit, segmentTriangle } from "../src/world/collision/boxTriangle.js";
import { buildBoxes, createStaticCollider } from "../src/world/collision/collider.js";
import { heightAt, sampleHeightfield, type StaticHeightfield } from "../src/world/collision/heightfield.js";
import { buildShape } from "../src/world/collision/shape.js";
import { composeStaticWorld, staticCaveCollider } from "../src/world/collision/world.js";
import { boxMesh, random } from "./col1-support.js";

/** COL-1 stage A: heightfield, depenetration and the world adapters. */

const DIVER = { x: 0.34, y: 0.475, z: 0.34 };
const DIVER_SHAPE: Capsule = { radius: 0.34, height: 0.95 };
const plane = (x: number, z: number): number => -10 + 0.3 * x - 0.1 * z;
const hilly = (x: number, z: number): number => -20 + 1.6 * Math.sin(x * 0.37) * Math.cos(z * 0.29) + 0.12 * x;

/** The heightfield's own triangles as a skin shape: the same surface, by the shape path. */
function asShape(h: StaticHeightfield) {
  const pos: number[] = [], idx: number[] = [], r = h.nx + 1;
  for (let k = 0; k <= h.nz; k++) for (let i = 0; i <= h.nx; i++) pos.push(h.x0 + i * h.cell, h.heights[i + r * k]!, h.z0 + k * h.cell);
  for (let k = 0; k < h.nz; k++) for (let i = 0; i < h.nx; i++) {
    const a = i + r * k, b = a + 1, c = a + r, d = c + 1;
    idx.push(a, d, b, a, c, d);
  }
  return buildShape(`${h.id}.tri`, new Float32Array(pos), idx, { facing: 1 });
}

test("heightfield: the lattice surface is the floor where the floor is planar", () => {
  const h = sampleHeightfield("p", { minX: 0, maxX: 20, minZ: 0, maxZ: 16 }, 0.5, plane), rnd = random(2);
  for (let i = 0; i < 500; i++) {
    const x = 20 * rnd(), z = 16 * rnd();
    assert.ok(Math.abs(heightAt(h, x, z) - plane(x, z)) < 1e-5);
  }
  assert.ok(Number.isNaN(heightAt(h, -0.1, 3)) && Number.isNaN(heightAt(h, 3, 16.1)));
});

test("heightfield: sweeps match the same triangles swept as a shape; boxes never end below the surface", () => {
  const h = sampleHeightfield("h", { minX: 0, maxX: 24, minZ: 0, maxZ: 24 }, 0.5, hilly);
  const hf = createStaticCollider("hf", [h]), tri = createStaticCollider("tri", [asShape(h)]);
  const rnd = random(9), a = createHit(), b = createHit();
  let hits = 0;
  for (let i = 0; i < 600; i++) {
    const c = { x: 3 + 18 * rnd(), y: 0, z: 3 + 18 * rnd() };
    c.y = hilly(c.x, c.z) + 0.5 + 3 * rnd();
    const d = { x: -4 + 8 * rnd(), y: -6 * rnd(), z: -4 + 8 * rnd() };
    if (hf.overlaps(c, DIVER)) continue;
    const ha = hf.sweep(c, DIVER, d, 0.004, a), hb = tri.sweep(c, DIVER, d, 0.004, b);
    assert.equal(ha, hb, `case ${i}`);
    if (ha) { hits++; assert.ok(Math.abs(a.t - b.t) < 1e-12, `case ${i}: ${a.t} vs ${b.t}`); }
    const end = hf.move(c, DIVER, d);
    assert.ok(!hf.overlaps(end, DIVER), `case ${i}: ended in the seabed at ${JSON.stringify(end)}`);
  }
  assert.ok(hits > 200, `only ${hits} sweeps met the seabed`);
});

test("heightfield: buried boxes are blocked, may rise, may not sink; holes answer nothing", () => {
  const h = sampleHeightfield("b", { minX: 0, maxX: 20, minZ: 0, maxZ: 20 }, 0.5, plane, { hole: (x, z) => x > 10 && x < 14 && z > 10 && z < 14 });
  const col = createStaticCollider("b", [h]), hit = createHit();
  const buried = { x: 5, y: plane(5, 5) - 2, z: 5 };
  assert.ok(col.overlaps(buried, DIVER));
  assert.ok(col.sweep(buried, DIVER, { x: 0, y: -1, z: 0 }, 0.004, hit) && hit.start && hit.ny === 1);
  assert.equal(col.sweep(buried, DIVER, { x: 0, y: 0.5, z: 0 }, 0.004, hit), false);
  // Wholly over the hole and below where the surface would be: not the heightfield's.
  const inHole = { x: 12, y: plane(12, 12) - 2, z: 12 };
  assert.equal(col.overlaps(inHole, DIVER), false);
  assert.ok(Number.isNaN(heightAt(h, 12, 12)));
  assert.equal(col.support(12, 12, 0), -Infinity);
  // Straddling the hole's edge, the ring cell beside it still holds.
  assert.ok(col.overlaps({ x: 10, y: plane(10, 12) - 1, z: 12 }, DIVER));
});

test("heightfield: sight lines by DDA equal a brute-force test against the solid's every top and wall triangle", () => {
  const h = sampleHeightfield("s", { minX: 0, maxX: 30, minZ: 0, maxZ: 30 }, 0.5, hilly, { hole: (x, z) => (x - 15) ** 2 + (z - 15) ** 2 < 9 });
  const col = createStaticCollider("s", [h]), rnd = random(4), r = h.nx + 1;
  const T = new Float64Array(9);
  // Independent: the solid's boundary as plain triangles (every solid cell's
  // top, and a wall on every edge it shares with a hole or the outside, down
  // to the bounds' bottom); a segment is clear when it starts outside the
  // solid and crosses none of them.
  const solid = (i: number, k: number): boolean => i >= 0 && k >= 0 && i < h.nx && k < h.nz &&
    !Number.isNaN(heightAt(h, h.x0 + (i + 0.5) * h.cell, h.z0 + (k + 0.5) * h.cell));
  const tris: number[][] = [], H = h.heights, bottom = h.bounds.min.y;
  for (let k = 0; k < h.nz; k++) for (let i = 0; i < h.nx; i++) {
    if (!solid(i, k)) continue;
    const x = h.x0 + i * h.cell, z = h.z0 + k * h.cell, X = x + h.cell, Z = z + h.cell;
    const p00 = [x, H[i + r * k]!, z], p10 = [X, H[i + 1 + r * k]!, z], p01 = [x, H[i + r * (k + 1)]!, Z], p11 = [X, H[i + 1 + r * (k + 1)]!, Z];
    tris.push([...p00, ...p11, ...p10], [...p00, ...p01, ...p11]);
    for (const [di, dk, q0, q1] of [[-1, 0, p00, p01], [1, 0, p10, p11], [0, -1, p00, p10], [0, 1, p01, p11]] as const) {
      if (solid(i + di, k + dk)) continue;
      tris.push([q0[0]!, bottom, q0[2]!, q1[0]!, bottom, q1[2]!, ...q1], [q0[0]!, bottom, q0[2]!, ...q1, ...q0]);
    }
  }
  const brute = (a: Vec3, b: Vec3): boolean => {
    if (heightAt(h, a.x, a.z) > a.y) return false;
    for (const t of tris) { T.set(t); if (segmentTriangle(a.x, a.y, a.z, b.x - a.x, b.y - a.y, b.z - a.z, T, 0, 3, 6) >= 0) return false; }
    return true;
  };
  let blocked = 0;
  for (let i = 0; i < 300; i++) {
    const a = { x: -5 + 40 * rnd(), y: -24 + 8 * rnd(), z: -5 + 40 * rnd() }, b = { x: -5 + 40 * rnd(), y: -24 + 8 * rnd(), z: -5 + 40 * rnd() };
    const want = brute(a, b);
    assert.equal(col.segmentClear(a, b), want, `segment ${i}: ${JSON.stringify([a, b])}`);
    if (!want) blocked++;
  }
  assert.ok(blocked > 50 && blocked < 280, `${blocked} of 300 blocked: a poor mix`);
});

test("collar: the heightfield never blocks a pose the old 0.5 m collar columns leave clear, and sits within 2 cm + slope of them", () => {
  const footprint = { minX: 20, maxX: 40, minZ: 20, maxZ: 36 }, band = 10, baseY = -40;
  const rock: Solid[] = [{ id: "rock.0", min: { x: 22, y: -40, z: 22 }, max: { x: 30, y: -24, z: 30 } }];
  const old = boxCaveCollider({ id: "cave", footprint, baseY, rock }, hilly, band);
  const hf = collarHeightfield("cave.collar", footprint, band, hilly, [footprint]);
  const neo = staticCaveCollider({ id: "cave", footprint, baseY, collider: createStaticCollider("cave", [buildBoxes("cave.rock", rock), hf]) });
  const rnd = random(13);
  let clearOld = 0, freed = 0;
  for (let i = 0; i < 4000; i++) {
    const x = footprint.minX - band + (footprint.maxX - footprint.minX + 2 * band) * rnd(), z = footprint.minZ - band + (footprint.maxZ - footprint.minZ + 2 * band) * rnd();
    const c = { x, y: hilly(x, z) + DIVER.y - 0.3 + 0.8 * rnd(), z };
    const o = old.blocked(c, DIVER), n = neo.blocked(c, DIVER);
    if (!o) { clearOld++; assert.equal(n, false, `old clear, new blocked at ${JSON.stringify(c)}`); }
    if (o && !n) freed++;
  }
  assert.ok(clearOld > 1000 && freed > 100, `${clearOld} clear before, ${freed} freed`);
  // Support: the column tops stand at most 2 cm plus the slope across a cell above the surface.
  for (let i = 0; i < 2000; i++) {
    const x = footprint.maxX + 0.25 + 9.5 * rnd(), z = footprint.minZ + 16 * rnd();
    const a = old.support(x, z, 0), b = neo.support(x, z, 0), slope = 0.6 + 0.12;
    assert.ok(a >= b - 1e-5 && a - b <= 0.02 + slope * 0.5 + 1e-5, `(${x.toFixed(2)}, ${z.toFixed(2)}): columns ${a}, heightfield ${b}`);
  }
});

test("collar through LC's composer: the heightfield cave answers where the box cave did, never tighter", () => {
  const footprint = { minX: 20, maxX: 40, minZ: 20, maxZ: 36 }, band = 10, baseY = -40;
  const rock: Solid[] = [{ id: "rock.0", min: { x: 22, y: -40, z: 22 }, max: { x: 30, y: -24, z: 30 } }];
  const exterior = createWorldQueries([], hilly);
  const before = composeCaveWorld({ exterior, solids: [], floor: hilly, caves: [boxCaveCollider({ id: "cave", footprint, baseY, rock }, hilly, band)] });
  const after = composeCaveWorld({ exterior, solids: [], floor: hilly, caves: [staticCaveCollider({ id: "cave", footprint, baseY,
    collider: createStaticCollider("cave", [buildBoxes("cave.rock", rock), collarHeightfield("cave.collar", footprint, band, hilly, [footprint])]) })] });
  const rnd = random(21);
  let free = 0;
  for (let i = 0; i < 400; i++) {
    const x = footprint.minX - 4 + 28 * rnd(), z = footprint.minZ - 4 + 24 * rnd();
    const p = { x, y: hilly(x, z) + 0.2 + 2 * rnd(), z };
    if (!before.clearance(p, DIVER_SHAPE)) continue;
    assert.ok(after.clearance(p, DIVER_SHAPE), `clear before, not after at ${JSON.stringify(p)}`);
    // A move the columns let through untouched, the heightfield (never
    // above them) lets through too. Slides differ: a tilted triangle
    // redirects travel that a flat column top would not.
    const d = { x: -3 + 6 * rnd(), y: -2 + 3 * rnd(), z: -3 + 6 * rnd() };
    const a = before.moveCapsule(p, d, DIVER_SHAPE), b = after.moveCapsule(p, d, DIVER_SHAPE);
    if (a.hitSolid) continue;
    free++;
    assert.ok(!b.hitSolid && Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y, b.position.z - a.position.z) < 1e-9,
      `move ${i}: clear past the columns, blocked by the heightfield at ${JSON.stringify(b.position)}`);
  }
  assert.ok(free > 40, `only ${free} untouched moves`);
});

// --- Depenetration -------------------------------------------------------------------

const solidBox = (id: string, lo: Vec3, hi: Vec3) => { const m = boxMesh(lo, hi); return buildShape(id, m.positions, m.indices, { interior: "solid", facing: 1 }); };

test("depenetration: a diver sunk into a floor rises by its depth; one inside rock leaves by the nearest face", () => {
  const col = createStaticCollider("d", [solidBox("floor", { x: -10, y: -5, z: -10 }, { x: 10, y: 0, z: 10 })]);
  const sunk = col.depenetrate({ x: 0, y: DIVER.y - 0.2, z: 0 }, DIVER, 1);
  assert.ok(sunk && sunk.distance > 0.2 - 1e-9 && sunk.distance < 0.21 && Math.abs(sunk.x) < 1e-9 && sunk.y >= DIVER.y - 1e-9, JSON.stringify(sunk));
  assert.ok(!col.overlaps(sunk!, DIVER));
  // Deep inside, 1.2 m under the top: leaves upward, 1.2 m + half height + skin.
  const deep = col.depenetrate({ x: 3, y: -1.2, z: 2 }, DIVER, 3);
  assert.ok(deep && Math.abs(deep.y - (DIVER.y + 0.004)) < 0.03 && deep.distance < 1.8, JSON.stringify(deep));
  assert.equal(col.depenetrate({ x: 3, y: -1.2, z: 2 }, DIVER, 1), null, "within 1 m there is no way out");
  // Already clear: unchanged.
  assert.deepEqual(col.depenetrate({ x: 0, y: 2, z: 0 }, DIVER, 1), { x: 0, y: 2, z: 0, distance: 0 });
});

test("ADVERSE depenetration: no escape through a wall; a wedged box is left for rescue", () => {
  // A room 0.65 m wide (the diver is 0.68), floor and ceiling hugging the
  // diver. Through the east wall is open water: the nearest clear pose, and
  // never a legal escape.
  const room = [
    solidBox("west", { x: -0.6, y: -2, z: -3 }, { x: -0.4, y: 2, z: 3 }),
    solidBox("east", { x: 0.25, y: -2, z: -3 }, { x: 0.45, y: 2, z: 3 }),
    solidBox("floor", { x: -0.6, y: -2.2, z: -3 }, { x: 0.45, y: -0.48, z: 3 }),
    solidBox("ceiling", { x: -0.6, y: 0.48, z: -3 }, { x: 0.45, y: 2.2, z: 3 }),
    solidBox("south", { x: -0.6, y: -2.2, z: -3.2 }, { x: 0.45, y: 2.2, z: -3 }),
    solidBox("north", { x: -0.6, y: -2.2, z: 3 }, { x: 0.45, y: 2.2, z: 3.2 }),
  ];
  const col = createStaticCollider("room", room), c = { x: 0, y: 0, z: 0 };
  assert.ok(col.overlaps(c, DIVER));
  const through = { x: 0.45 + DIVER.x + 0.01, y: 0, z: 0 };
  assert.equal(col.overlaps(through, DIVER), false, "control: the far side is open water");
  assert.equal(col.depenetrate(c, DIVER, 3), null);
  // The same box with the west wall gone backs out of the east wall by its overlap.
  const open = createStaticCollider("open", room.filter(s => s.id !== "west"));
  const out = open.depenetrate(c, DIVER, 3);
  assert.ok(out && out.x < -0.09 && out.distance < 0.2 && !open.overlaps(out, DIVER), JSON.stringify(out));
});

// --- Structures over the exterior world ------------------------------------------------

test("composeStaticWorld: away from the collider every answer is the exterior's; near it the art blocks", () => {
  const floor = (x: number, _z: number): number => -30 + 0.01 * x;
  const crate: Solid = { id: "crate", min: { x: 40, y: -30, z: 0 }, max: { x: 42, y: -28, z: 2 } };
  const exterior = createWorldQueries([crate], floor);
  const plate = new Float32Array([10, -25, -5, 20, -25, -5, 20, -25, 5, 10, -25, 5]);
  const hull = solidBox("hull", { x: 10, y: -24, z: -5 }, { x: 20, y: -20, z: 5 });
  const collider = createStaticCollider("wreck", [hull, buildShape("deck", plate, [0, 1, 2, 0, 2, 3])]);
  const world = composeStaticWorld({ exterior, solids: [crate], collider });
  const rnd = random(31);
  for (let i = 0; i < 100; i++) {
    const p = { x: 60 + 30 * rnd(), y: -28 + 10 * rnd(), z: -20 + 40 * rnd() }, d = { x: -2 + 4 * rnd(), y: -1 + 2 * rnd(), z: -2 + 4 * rnd() };
    assert.deepEqual(world.moveCapsule(p, d, DIVER_SHAPE), exterior.moveCapsule(p, d, DIVER_SHAPE));
    assert.equal(world.clearance(p, DIVER_SHAPE), exterior.clearance(p, DIVER_SHAPE));
    assert.equal(world.supportHeight(p.x, p.z, p.y), exterior.supportHeight(p.x, p.z, p.y));
  }
  // Swimming at the hull stops at its face; through the deck plate from below stops under it.
  const atHull = world.moveCapsule({ x: 5, y: -22.5, z: 0 }, { x: 10, y: 0, z: 0 }, DIVER_SHAPE).position;
  assert.ok(atHull.x <= 10 - 0.34 && atHull.x > 10 - 0.34 - 0.01, JSON.stringify(atHull));
  const underDeck = world.moveCapsule({ x: 12, y: -27, z: 0 }, { x: 0, y: 4, z: 0 }, DIVER_SHAPE).position;
  assert.ok(underDeck.y + 0.95 <= -25 && underDeck.y + 0.95 > -25.01, JSON.stringify(underDeck));
  assert.equal(world.supportHeight(15, 0, -19), -20);
  assert.equal(world.supportHeight(15, -4.9, -25), -25);
  assert.equal(world.clearance({ x: 15, y: -22.5, z: 0 }, DIVER_SHAPE), false);
  assert.equal(world.lineOfSight({ x: 5, y: -22, z: 0 }, { x: 25, y: -22, z: 0 }), false);
  assert.equal(world.lineOfSight({ x: 5, y: -18, z: 0 }, { x: 25, y: -18, z: 0 }), true);
  // The exterior's own solids still stop a move that starts near the art.
  const toCrate = world.moveCapsule({ x: 21, y: -29.5, z: 1 }, { x: 25, y: 0, z: 0 }, DIVER_SHAPE).position;
  assert.ok(toCrate.x <= 40 - 0.34 + 1e-9, JSON.stringify(toCrate));
  // A save pose sunk into the hull's top (ART-07) comes out on top, clear.
  const loaded = world.depenetrate({ x: 15, y: -20.3, z: 0 }, DIVER_SHAPE, 2);
  assert.ok(loaded && loaded.y >= -20 && loaded.y < -19.98 && world.clearance(loaded, DIVER_SHAPE), JSON.stringify(loaded));
});

test("composeStaticWorld guards: a member near a guarded region is refused; a long move into one goes there in pieces", () => {
  const exterior = createWorldQueries([], (x: number, _z: number): number => -40 + 0.001 * x);
  const near = createStaticCollider("near", [solidBox("hull", { x: 0, y: -30, z: 0 }, { x: 4, y: -26, z: 4 })]);
  assert.throws(() => composeStaticWorld({ exterior, solids: [], collider: near, guards: [{ minX: 10, maxX: 50, minZ: -10, maxZ: 10 }] }), /guarded region/);
  const world = composeStaticWorld({ exterior, solids: [], collider: near, guards: [{ minX: 40, maxX: 80, minZ: -10, maxZ: 10 }] });
  // From beside the hull, 60 m east into the guard: the hull is not in the way, so the move ends where asked.
  const end = world.moveCapsule({ x: 5, y: -28, z: 2 }, { x: 60, y: 0, z: 0 }, DIVER_SHAPE);
  assert.ok(!end.hitSolid && Math.abs(end.position.x - 65) < 1e-9, JSON.stringify(end));
  assert.ok(world.counters.exteriorSweeps > 0 && world.counters.staticSweeps > 0, JSON.stringify(world.counters));
});
