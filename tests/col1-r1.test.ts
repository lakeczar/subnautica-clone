import assert from "node:assert/strict";
import test from "node:test";
import { WORLD_VERTICAL_BOUNDS } from "../src/content/routes.js";
import type { Capsule, Vec3 } from "../src/sim/types.js";
import { createWorldQueries, WORLD_BOUNDS, type Solid } from "../src/sim/world.js";
import { boxCaveCollider } from "../src/world/caves/large/boxCollider.js";
import { composeCaveWorld } from "../src/world/caves/large/compose.js";
import { collarHeightfield, meshShapes } from "../src/world/collision/bake.js";
import { createHit, sweepBoxBox } from "../src/world/collision/boxTriangle.js";
import { buildBoxes, createStaticCollider, type StaticMember } from "../src/world/collision/collider.js";
import { heightAt, sampleHeightfield } from "../src/world/collision/heightfield.js";
import { buildShape } from "../src/world/collision/shape.js";
import { composeStaticWorld, staticCaveCollider } from "../src/world/collision/world.js";
import { gridBoxMesh, random } from "./col1-support.js";

/** COL-1 stage A, Sol R1 (`docs/build/reviews/COL-1A-SOL-XHIGH-R1.md`): each
 * finding's reproduction, its adverse cases, and the heightfield-lift
 * mutation the earlier collar tests let survive. */

const DIVER = { x: 0.34, y: 0.475, z: 0.34 };
const DIVER_SHAPE: Capsule = { radius: 0.34, height: 0.95 };
const solidBox = (id: string, lo: Vec3, hi: Vec3, n = 1) => { const m = gridBoxMesh(lo, hi, n); return buildShape(id, m.positions, m.indices, { interior: "solid", facing: 1 }); };
const wallB = { id: "wall.b", min: { x: -0.2, y: -3, z: -3 }, max: { x: -0.1, y: 3, z: 3 } };

// --- R1: recovery from inside a solid sweeps its whole way out -----------------------

test("R1 ADVERSE: a diver inside rock never escapes through a separate wall (collider and composed world)", () => {
  const a = solidBox("a", { x: -2, y: -2, z: -2 }, { x: 0, y: 2, z: 2 }), c = { x: -0.6, y: 0, z: 0 };
  const col = createStaticCollider("r1", [a, buildBoxes("b", [wallB])]);
  // Control: the straight way out east, which the old recovery took, crosses wall B.
  const hit = createHit();
  assert.ok(sweepBoxBox(c.x, c.y, c.z, DIVER.x, DIVER.y, DIVER.z, 0.944, 0, 0, wallB.min.x, wallB.min.y, wallB.min.z, wallB.max.x, wallB.max.y, wallB.max.z, 0, hit));
  assert.equal(col.depenetrate(c, DIVER, 1), null, "within 1 m every way out crosses B or stays in A");
  // With room, it leaves A by its west face (1.744 m), away from B and never through it.
  const out = col.depenetrate(c, DIVER, 3)!;
  assert.ok(out && Math.abs(out.x - (-2 - DIVER.x - 0.004)) < 1e-6 && Math.abs(out.distance - 1.744) < 1e-6, JSON.stringify(out));
  assert.equal(sweepBoxBox(c.x, c.y, c.z, DIVER.x, DIVER.y, DIVER.z, out.x - c.x, out.y - c.y, out.z - c.z, wallB.min.x, wallB.min.y, wallB.min.z, wallB.max.x, wallB.max.y, wallB.max.z, 0, hit), false);
  // Without B the short way east is legal.
  const free = createStaticCollider("r1.free", [a]).depenetrate(c, DIVER, 1)!;
  assert.ok(free && Math.abs(free.x - (0 + DIVER.x + 0.004)) < 1e-6 && Math.abs(free.distance - 0.944) < 1e-6, JSON.stringify(free));
  // The composed world, with B as an exterior solid.
  const floor = (): number => -400;
  const world = composeStaticWorld({ exterior: createWorldQueries([wallB], floor), solids: [wallB], collider: createStaticCollider("r1.a", [a]) });
  const feet = { x: c.x, y: c.y - DIVER.y, z: c.z };
  assert.equal(world.depenetrate(feet, DIVER_SHAPE, 1), null);
  const w = world.depenetrate(feet, DIVER_SHAPE, 3)!;
  assert.ok(w && Math.abs(w.x - (-2 - DIVER.x - 0.004)) < 1e-6 && world.clearance(w, DIVER_SHAPE), JSON.stringify(w));
});

test("R1: a box caught across a wall it overlaps backs out the way it came, never deepening", () => {
  // Overlapping wall B by 6 cm from the west, with A's rock wholly east of B.
  const a = solidBox("a", { x: 0.5, y: -2, z: -2 }, { x: 3, y: 2, z: 2 });
  const col = createStaticCollider("r1.b", [a, buildBoxes("b", [wallB])]), c = { x: -0.5, y: 0, z: 0 };
  assert.ok(col.overlaps(c, DIVER));
  const out = col.depenetrate(c, DIVER, 2)!;
  assert.ok(out && out.x < c.x && out.x <= -0.2 - DIVER.x + 1e-9 && !col.overlaps(out, DIVER), JSON.stringify(out));
});

// --- R2: watertight parity at edges and vertices ---------------------------------------

const BOX_LO = { x: 0, y: 0, z: 0 }, BOX_HI = { x: 4, y: 4, z: 4 };
/** Points on the 4 x 4 grid's own lines, vertices and diagonals, and the review's jittered diagonal. */
const LATTICE: readonly [number, number][] = [
  [1, 1], [2, 2], [3, 1], [1, 1.5], [1.5, 1], [1.5, 1.5], [0.5, 0.5], [2.5, 3.5], [1 - 1.37e-7, 1 - 2.91e-7], [3, 3],
];
function parityCases(col: ReturnType<typeof createStaticCollider>, label: string): void {
  for (const [x, z] of LATTICE) for (const y of [1, 2.5]) {
    const p = { x, y, z };
    assert.ok(col.solidAt(p), `${label}: ${JSON.stringify(p)} called water`);
    assert.ok(col.overlaps(p, { x: 0.1, y: 0.1, z: 0.1 }), `${label}: ${JSON.stringify(p)} clear`);
    assert.equal(col.segmentClear(p, { x, y: y + 0.5, z }), false, `${label}: sight inside rock at ${JSON.stringify(p)}`);
    assert.equal(col.containing(p).length, 1, `${label}: parts holding ${JSON.stringify(p)}`);
    // Below the box: every vertical line through its grid crosses exactly two surfaces.
    assert.equal(col.crossings(x, -1, z, 10), 2, `${label}: crossings under ${x}, ${z}`);
    assert.equal(col.solidAt({ x, y: -1, z }), null, `${label}: below the box at ${x}, ${z}`);
  }
}

test("R2: parity is watertight on a mesh's edges, vertices and diagonals, whichever way it winds", () => {
  const m = gridBoxMesh(BOX_LO, BOX_HI, 4);
  parityCases(createStaticCollider("grid", [buildShape("grid", m.positions, m.indices, { interior: "solid", facing: 1 })]), "outward");
  const reversed = new Uint32Array(m.indices.length);
  for (let t = 0; t < m.indices.length; t += 3) { reversed[t] = m.indices[t]!; reversed[t + 1] = m.indices[t + 2]!; reversed[t + 2] = m.indices[t + 1]!; }
  parityCases(createStaticCollider("grid.rev", [buildShape("grid.rev", m.positions, reversed, { interior: "solid", facing: -1 })]), "reversed");
  // Every vertex and edge midpoint of the top face. A point on the box's own
  // side faces resolves by the half-open rule (as if nudged towards +X, +Z).
  const col = createStaticCollider("grid", [buildShape("grid", m.positions, m.indices, { interior: "solid", facing: 1 })]);
  for (let i = 0; i <= 8; i++) for (let k = 0; k <= 8; k++) {
    const x = i / 2, z = k / 2, inside = x >= 0 && x < 4 && z >= 0 && z < 4;
    assert.equal(col.solidAt({ x, y: 2, z }) !== null, inside, `(${x}, 2, ${z})`);
  }
});

test("R2: parity holds per part of overlapping solids, and across a split group's seams", () => {
  const a = gridBoxMesh({ x: 0, y: 0, z: 0 }, { x: 4, y: 4, z: 4 }, 4), b = gridBoxMesh({ x: 2, y: 1, z: 2 }, { x: 6, y: 3, z: 6 }, 4);
  const pos = new Float32Array([...a.positions, ...b.positions]), idx = [...a.indices, ...Array.from(b.indices, i => i + a.positions.length / 3)];
  const parts = [...Array(a.indices.length / 3).fill(0), ...Array(b.indices.length / 3).fill(1)];
  const col = createStaticCollider("parts", [buildShape("parts", pos, idx, { interior: "solid", facing: 1, parts })]);
  for (const p of [{ x: 3, y: 2, z: 3 }, { x: 2, y: 2, z: 2 }, { x: 3, y: 2, z: 3.5 }]) assert.equal(col.containing(p).length, 2, JSON.stringify(p));
  for (const p of [{ x: 1, y: 2, z: 1 }, { x: 5, y: 2, z: 5 }, { x: 4.5, y: 2, z: 3 }]) assert.equal(col.containing(p).length, 1, JSON.stringify(p));
  // A mesh split for Uint16 indices: points at its own vertices' X/Z, including the split seams.
  const big = gridBoxMesh({ x: 0, y: 0, z: 0 }, { x: 40, y: 10, z: 40 }, 106);
  const split = createStaticCollider("split", meshShapes("big", big, { interior: "solid", facing: 1, shared: true }) as StaticMember[]);
  const rnd = random(41);
  for (let i = 0; i < 400; i++) {
    const v = Math.floor(rnd() * big.positions.length / 3), x = big.positions[v * 3]!, z = big.positions[v * 3 + 2]!;
    const inside = x >= 0 && x < 40 && z >= 0 && z < 40;
    assert.equal(split.solidAt({ x, y: 5, z }) !== null, inside, `split at vertex (${x}, ${z})`);
    if (inside) assert.equal(split.crossings(x, -1, z, 20), 2, `split crossings at (${x}, ${z})`);
  }
});

// --- R3: the heightfield is a volume: no way in from a hole or the outside ---------------

const flat = (): number => 0;
const volume = () => sampleHeightfield("volume", { minX: 0, maxX: 4, minZ: 0, maxZ: 4 }, 0.5, flat, { hole: (x, z) => x > 1 && x < 3 && z > 1 && z < 3 });

test("R3 ADVERSE: a sweep cannot enter heightfield solid from a hole or the outside, and stops at its wall", () => {
  const col = createStaticCollider("volume", [volume()]), e = { x: 0.1, y: 0.1, z: 0.1 };
  for (const [start, d, wall] of [
    [{ x: -1, y: -2, z: 2 }, { x: 2, y: 0, z: 0 }, 0],       // outside into the lattice's west edge
    [{ x: -1, y: -2, z: 2 }, { x: 6, y: 0, z: 0 }, 0],       // through and beyond
    [{ x: 2, y: -2, z: 2 }, { x: 2, y: 0, z: 0 }, 3],        // from the hole into its east rim
    [{ x: 2, y: -2, z: 2 }, { x: -2, y: 0, z: 0 }, 1],       // and its west rim
    [{ x: 2, y: -2, z: 2 }, { x: 0, y: 0, z: 1.5 }, 3],      // its north rim (wall at z = 3)
  ] as const) {
    assert.equal(col.overlaps(start, e), false, `start ${JSON.stringify(start)}`);
    const m = col.move(start, e, d);
    assert.ok(m.hit && !col.overlaps(m, e), `${JSON.stringify(start)} + ${JSON.stringify(d)} -> ${JSON.stringify(m)}`);
    const reached = d.z ? m.z + e.z : d.x > 0 ? m.x + e.x : m.x - e.x;
    assert.ok(Math.abs(reached - wall) < 0.005, `stopped at ${reached}, wall ${wall}`);
    assert.equal(col.segmentClear(start, { x: start.x + d.x, y: start.y + d.y, z: start.z + d.z }), false, `sight into solid from ${JSON.stringify(start)}`);
  }
  // Above the surface the same moves and sight lines are free.
  assert.equal(col.move({ x: -1, y: 0.5, z: 2 }, e, { x: 6, y: 0, z: 0 }).hit, false);
  assert.equal(col.segmentClear({ x: -1, y: 0.5, z: 2 }, { x: 5, y: 0.5, z: 2 }), true);
});

test("R3: a buried actor rises or leaves through a wall, never sinks; top slides stay smooth", () => {
  const col = createStaticCollider("volume", [volume()]), e = { x: 0.1, y: 0.1, z: 0.1 };
  const buried = { x: 0.5, y: -2, z: 2 };
  assert.ok(col.overlaps(buried, e));
  assert.equal(col.move(buried, e, { x: -2, y: 0, z: 0 }).hit, false, "out through the west wall");
  assert.equal(col.move(buried, e, { x: 0, y: 3, z: 0 }).hit, false, "up through the surface");
  const down = col.move(buried, e, { x: 0, y: -1, z: 0 });
  assert.ok(down.hit && down.y >= buried.y, "sinking is refused");
  // Partly buried: may rise, may not go deeper.
  const half = { x: 0.5, y: 0.05, z: 2 };
  assert.ok(col.move(half, e, { x: 0, y: -1, z: 0 }).hit);
  assert.equal(col.move(half, e, { x: 0, y: 1, z: 0 }).hit, false);
  // Resting on the top and sliding over the hole's edge: one smooth glide.
  const glide = col.move({ x: 0.5, y: 0.1 + 0.004, z: 2 }, e, { x: 2, y: -0.05, z: 0 });
  assert.ok(Math.abs(glide.x - 2.5) < 1e-6 && glide.y >= 0.1, JSON.stringify(glide));
});

test("R3 ADVERSE through LC's composer: a diver in a cave's footprint stops at the collar's rim, as the columns did", () => {
  const footprint = { minX: 1, maxX: 3, minZ: 1, maxZ: 3 }, baseY = -4, band = 1, rock: Solid[] = [];
  const exterior = createWorldQueries([], flat);
  const columns = composeCaveWorld({ exterior, solids: [], floor: flat, caves: [boxCaveCollider({ id: "c", footprint, baseY, rock }, flat, band)] });
  const field = composeCaveWorld({ exterior, solids: [], floor: flat, caves: [staticCaveCollider({ id: "c", footprint, baseY,
    collider: createStaticCollider("c", [collarHeightfield("c.collar", footprint, band, flat, [footprint])]) })] });
  const feet = { x: 2, y: -2, z: 2 };
  for (const w of [columns, field]) assert.ok(w.clearance(feet, DIVER_SHAPE));
  const a = columns.moveCapsule(feet, { x: 2, y: 0, z: 0 }, DIVER_SHAPE).position, b = field.moveCapsule(feet, { x: 2, y: 0, z: 0 }, DIVER_SHAPE).position;
  assert.ok(Math.abs(a.x - 2.656) < 0.001 && Math.abs(b.x - a.x) < 0.001, `columns ${a.x}, heightfield ${b.x}`);
  assert.ok(field.clearance(b, DIVER_SHAPE));
  assert.equal(field.lineOfSight({ x: 2, y: -2, z: 2 }, { x: 3.5, y: -2, z: 2 }), false);
});

// --- R4: the shortest validated escape -------------------------------------------------

test("R4: recovery takes the shortest valid face, not the face nearest the centre", () => {
  const col = createStaticCollider("box", [solidBox("box", BOX_LO, BOX_HI, 4)]);
  // Down is nearer the centre (0.2 m), but west clears the diver sooner (0.644 against 0.679).
  const a = col.depenetrate({ x: 0.3, y: 0.2, z: 2 }, DIVER, 0.65)!;
  assert.ok(a && Math.abs(a.distance - 0.644) < 1e-6 && a.x < 0 && !col.overlaps(a, DIVER), JSON.stringify(a));
  // A wide, short actor: through the floor, 0.404 m, not 1.204 m through the side.
  const wide = { x: 1, y: 0.1, z: 0.1 };
  const b = col.depenetrate({ x: 0.2, y: 0.3, z: 2 }, wide, 0.5)!;
  assert.ok(b && Math.abs(b.distance - 0.404) < 1e-6 && b.y < 0 && !col.overlaps(b, wide), JSON.stringify(b));
});

// --- R5: a static move keeps the exterior's boundaries -----------------------------------

test("R5: a static-envelope move that misses the art keeps the exterior's vertical bounds and boundary hit", () => {
  const exterior = createWorldQueries([], () => -1000);
  const art = createStaticCollider("art", [solidBox("art", { x: 10, y: -10, z: 0 }, { x: 12, y: -8, z: 2 })]);
  const bounds = { ...WORLD_BOUNDS, minY: WORLD_VERTICAL_BOUNDS.minY, maxY: WORLD_VERTICAL_BOUNDS.maxY };
  const world = composeStaticWorld({ exterior, solids: [], collider: art, bounds });
  const pose = { x: 0, y: -5, z: 1 }, d = { x: 0, y: -2000, z: 0 };
  // The same answer as the exterior's (positions to a nanometre: the static
  // path goes through the box centre and back).
  const same = (a: ReturnType<typeof exterior.moveCapsule>, b: typeof a, what: string): void => {
    assert.ok(a.hitSolid === b.hitSolid && a.hitBoundary === b.hitBoundary &&
      Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y, a.position.z - b.position.z) < 1e-9, `${what}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  };
  const got = world.moveCapsule(pose, d, DIVER_SHAPE), want = exterior.moveCapsule(pose, d, DIVER_SHAPE);
  assert.ok(world.counters.staticSweeps === 1, "the conservative envelope took the static path");
  same(got, want, "down");
  assert.ok(Math.abs(got.position.y - WORLD_VERTICAL_BOUNDS.minY) < 1e-9 && got.hitBoundary);
  // With separateBoxOverlaps the exterior clips the requested travel instead; so does the static path.
  const opts = { separateBoxOverlaps: true };
  same(world.moveCapsule(pose, d, DIVER_SHAPE, opts), exterior.moveCapsule(pose, d, DIVER_SHAPE, opts), "separated");
  // And upward, and across X.
  for (const dd of [{ x: 0, y: 3000, z: 0 }, { x: -5000, y: 0, z: 0 }])
    same(world.moveCapsule({ x: 5, y: -9, z: 1 }, dd, DIVER_SHAPE), exterior.moveCapsule({ x: 5, y: -9, z: 1 }, dd, DIVER_SHAPE), JSON.stringify(dd));
});

// --- The conservative lift --------------------------------------------------------------

/** A floor curving enough that a 0.5 m chord sags about 3 cm under it, beyond the exterior's 2 cm tolerance. */
const curved = (x: number, z: number): number => -20 + 0.6 * Math.sin(1.3 * x) + 0.3 * Math.cos(0.9 * z);

test("lift: the collar is on or above the floor at every cell's nine points, and a diver resting on it is never called buried", () => {
  const footprint = { minX: 10, maxX: 20, minZ: 10, maxZ: 20 }, band = 6;
  const h = collarHeightfield("curved", footprint, band, curved, [footprint]);
  assert.ok(h.lift > 0.02 && h.residual < 0.005, `lift ${h.lift}, residual ${h.residual}`);
  for (let k = 0; k < h.nz; k++) for (let i = 0; i < h.nx; i++) for (const [u, w] of [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [0.5, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]]) {
    const x = h.x0 + (i + u!) * h.cell, z = h.z0 + (k + w!) * h.cell, y = heightAt(h, x, z);
    if (Number.isNaN(y)) continue;
    assert.ok(y >= curved(x, z) - 1e-6, `cell ${i}, ${k} at (${x}, ${z}): lattice ${y}, floor ${curved(x, z)}`);
  }
  // Through LC's composer, whose clearance tests the floor itself (2 cm): drops
  // onto the collar beside the footprint come to rest on legal poses.
  const exterior = createWorldQueries([], curved);
  const world = composeCaveWorld({ exterior, solids: [], floor: curved, caves: [staticCaveCollider({ id: "c", footprint, baseY: -40,
    collider: createStaticCollider("c", [h]) })] });
  const rnd = random(8);
  let rested = 0;
  for (let i = 0; i < 300; i++) {
    // Straddling the east edge: the diver touches the footprint, so the composer's floor check runs.
    const x = footprint.maxX + 0.05 + 0.25 * rnd(), z = footprint.minZ + 10 * rnd(), start = { x, y: curved(x, z) + 1.5, z };
    if (!world.clearance(start, DIVER_SHAPE)) continue;
    const end = world.moveCapsule(start, { x: 0, y: -3, z: 0 }, DIVER_SHAPE);
    if (!end.hitSolid) continue;
    rested++;
    assert.ok(world.clearance(end.position, DIVER_SHAPE), `drop ${i} rests at ${JSON.stringify(end.position)}, called buried`);
  }
  assert.ok(rested > 100, `only ${rested} drops rested`);
});

test("ADVERSE lift: a floor that curves within a cell is measured and refused, not hidden", () => {
  // 10 cm bumps a quarter of a 0.5 m cell wide: the nine points all sit in the troughs.
  const bumpy = (x: number): number => 0.1 * Math.sin(4 * Math.PI * x) ** 2;
  const h = sampleHeightfield("bumps", { minX: 0, maxX: 2, minZ: 0, maxZ: 2 }, 0.5, bumpy, { conservative: true, measure: true });
  assert.equal(h.lift, 0);
  assert.ok(h.residual > 0.04, `residual ${h.residual}`);
  assert.throws(() => collarHeightfield("bumps", { minX: 1, maxX: 2, minZ: 1, maxZ: 2 }, 1, bumpy, []), /stands \d+\.\d mm above/);
});
