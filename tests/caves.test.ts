import test from "node:test";
import assert from "node:assert/strict";
import { CAVE_SOURCES, caveDef, EXTERIOR, MIN_ROCK, withCaveFloors, type CavePortal } from "../src/content/regions/caves.js";
import { buildCave, caveSampler, caveShell, caveShellByColumn, caveVolume, clipMeshToRect } from "../src/content/regions/caveGeometry.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { LEGACY_PRESERVE } from "../src/content/regions/terrain.js";
import { regionAtPoint } from "../src/content/regions/layout.js";
import { ROUTES, CRAFT_PROFILES } from "../src/content/regions/passages.js";
import { SITES } from "../src/content/regions/sites.js";
import { STRUCTURE_SOLIDS } from "../src/content/regions/structures.js";
import { createWorldQueries, type Solid } from "../src/sim/world.js";
import type { Capsule, Vec3 } from "../src/sim/types.js";
import { boxDistance, columnAt, columnRect, chunkId } from "../src/world/frame.js";
import type { MeshRecipe } from "../src/render/kit/types.js";
import { decodeTerrain, encodeTerrain } from "../src/render/biomes/terrainCodec.js";
import { caveDaylight, caveLightField, sampleLightField, type CaveLightField } from "../src/render/caves/lightField.js";
import { CAVE_ANCHORS, injectCaveLight } from "../src/render/caves/caveLight.js";

const def = caveDef("fanvault", worldFloor);
const source = def.source;
const DIVER: Capsule = CRAFT_PROFILES.diver;
const SMALL: Capsule = CRAFT_PROFILES.small;
const fine = caveShell(def, "fine"), coarse = caveShell(def, "coarse");
// The baseline's WORLD_BOUNDS still ends at the legacy route rectangle; C3
// widens it to the S1 envelope. Until then the physical checks run in a frame
// shifted into it. Sweeps, support and clearance are translation-invariant.
const SHIFT = { x: 300, y: 0, z: 90 };
const shift = (p: Readonly<Vec3>): Vec3 => ({ x: p.x + SHIFT.x, y: p.y, z: p.z + SHIFT.z });
const shiftSolid = (s: Solid): Solid => ({ id: s.id, min: shift(s.min), max: shift(s.max) });
const caveFloor = withCaveFloors(worldFloor);
function worldWith(solids: readonly Solid[]) {
  return createWorldQueries(solids.map(shiftSolid), (x, z) => caveFloor(x - SHIFT.x, z - SHIFT.z));
}
const world = worldWith(def.rock);

// The rock on a 2 m X/Z bucket grid, for the many point queries below.
const BUCKET = 2, buckets = new Map<number, Solid[]>();
const bucketKey = (i: number, k: number): number => (i + 10000) * 20000 + (k + 10000);
for (const s of def.rock)
  for (let i = Math.floor(s.min.x / BUCKET); i <= Math.floor(s.max.x / BUCKET); i++)
    for (let k = Math.floor(s.min.z / BUCKET); k <= Math.floor(s.max.z / BUCKET); k++)
      (buckets.get(bucketKey(i, k)) ?? buckets.set(bucketKey(i, k), []).get(bucketKey(i, k))!).push(s);
function nearRock(p: Readonly<Vec3>, reach: number, visit: (s: Solid) => boolean | void): void {
  const seen = new Set<Solid>();
  for (let i = Math.floor((p.x - reach) / BUCKET); i <= Math.floor((p.x + reach) / BUCKET); i++)
    for (let k = Math.floor((p.z - reach) / BUCKET); k <= Math.floor((p.z + reach) / BUCKET); k++)
      for (const s of buckets.get(bucketKey(i, k)) ?? []) if (!seen.has(s)) { seen.add(s); if (visit(s)) return; }
}

const inside = (p: Readonly<Vec3>, s: Solid, margin = 1e-9): boolean =>
  p.x > s.min.x + margin && p.x < s.max.x - margin && p.y > s.min.y + margin && p.y < s.max.y - margin &&
  p.z > s.min.z + margin && p.z < s.max.z - margin;
const inRock = (p: Readonly<Vec3>): boolean => { let hit = false; nearRock(p, 0, s => (hit = inside(p, s))); return hit; };
const rockDistance = (p: Readonly<Vec3>, reach = 1): number => {
  let best = Infinity;
  nearRock(p, reach, s => { best = Math.min(best, boxDistance(s, p)); return best === 0; });
  return best;
};
const vertex = (m: MeshRecipe, v: number): Vec3 => ({ x: m.positions[v * 3]!, y: m.positions[v * 3 + 1]!, z: m.positions[v * 3 + 2]! });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const area = (m: MeshRecipe): number => {
  let total = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = vertex(m, m.indices[t]!), n = cross(sub(vertex(m, m.indices[t + 1]!), a), sub(vertex(m, m.indices[t + 2]!), a));
    total += Math.hypot(n.x, n.y, n.z) / 2;
  }
  return total;
};
/** Segment p→q against a triangle (Möller–Trumbore), inclusive. */
function segmentHitsTriangle(p: Vec3, q: Vec3, a: Vec3, b: Vec3, c: Vec3): boolean {
  const d = sub(q, p), e1 = sub(b, a), e2 = sub(c, a), h = cross(d, e2), det = dot(e1, h);
  if (Math.abs(det) < 1e-12) return false;
  const s = sub(p, a), u = dot(s, h) / det;
  if (u < 0 || u > 1) return false;
  const r = cross(s, e1), v = dot(d, r) / det;
  if (v < 0 || u + v > 1) return false;
  const t = dot(e2, r) / det;
  return t >= 0 && t <= 1;
}
/** Closest distance from a point to a triangle (Ericson, Real-Time Collision Detection 5.1.5). */
function pointTriangleDistance(p: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  const at = (u: number, v: number): number => {
    const x = { x: a.x + ab.x * u + ac.x * v, y: a.y + ab.y * u + ac.y * v, z: a.z + ab.z * u + ac.z * v };
    return Math.hypot(p.x - x.x, p.y - x.y, p.z - x.z);
  };
  if (d1 <= 0 && d2 <= 0) return at(0, 0);
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return at(1, 0);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(d1 / (d1 - d3), 0);
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return at(0, 1);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(0, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return at(1 - w, w); }
  const denom = 1 / (va + vb + vc);
  return at(vb * denom, vc * denom);
}
/** Triangles bucketed on a 2 m grid, for local queries against a whole shell. */
function triangleGrid(m: MeshRecipe): (p: Vec3, reach: number) => [Vec3, Vec3, Vec3][] {
  const cell = 2, buckets = new Map<string, number[]>();
  for (let t = 0; t < m.indices.length; t += 3) {
    const vs = [0, 1, 2].map(k => vertex(m, m.indices[t + k]!));
    const lo = (a: "x" | "y" | "z"): number => Math.floor(Math.min(...vs.map(v => v[a])) / cell);
    const hi = (a: "x" | "y" | "z"): number => Math.floor(Math.max(...vs.map(v => v[a])) / cell);
    for (let i = lo("x"); i <= hi("x"); i++) for (let j = lo("y"); j <= hi("y"); j++) for (let k = lo("z"); k <= hi("z"); k++) {
      const key = `${i},${j},${k}`;
      (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(t);
    }
  }
  return (p, reach) => {
    const seen = new Set<number>(), out: [Vec3, Vec3, Vec3][] = [];
    for (let i = Math.floor((p.x - reach) / cell); i <= Math.floor((p.x + reach) / cell); i++)
      for (let j = Math.floor((p.y - reach) / cell); j <= Math.floor((p.y + reach) / cell); j++)
        for (let k = Math.floor((p.z - reach) / cell); k <= Math.floor((p.z + reach) / cell); k++)
          for (const t of buckets.get(`${i},${j},${k}`) ?? []) if (!seen.has(t)) {
            seen.add(t); out.push([vertex(m, m.indices[t]!), vertex(m, m.indices[t + 1]!), vertex(m, m.indices[t + 2]!)]);
          }
    return out;
  };
}
const shells = { fine, coarse };
const grids = { fine: triangleGrid(fine), coarse: triangleGrid(coarse) };
/** Points over a portal's clear rectangle, inset by `inset`, every 0.25 m. */
function aperture(p: CavePortal, inset = 0): Vec3[] {
  const out: Vec3[] = [], w = p.clear.width / 2 - inset, h = p.clear.height / 2 - inset;
  for (let a = -w; a <= w + 1e-9; a += 0.25) for (let b = -h; b <= h + 1e-9; b += 0.25)
    out.push(p.normal.y !== 0 ? { x: p.center.x + a, y: p.center.y, z: p.center.z + b }
      : p.normal.z !== 0 ? { x: p.center.x + a, y: p.center.y + b, z: p.center.z } : { x: p.center.x, y: p.center.y + b, z: p.center.z + a });
  return out;
}
const loop = def.routes.find(r => r.role === "loop")!;
const insideFootprint = (p: Vec3): boolean => {
  const f = def.replacementFootprints[0]!;
  return p.x > f.minX && p.x < f.maxX && p.z > f.minZ && p.z < f.maxZ;
};
const skylight = source.carves.find(c => c.kind === "shaft")!;
/** Within 2.5 m of a mouth's plane: the lintel and sill zone, open by design. */
const nearMouth = (p: Vec3): boolean => def.portals.some(m => m.kind === "mouth" &&
  Math.abs((p.z - m.center.z) * m.normal.z + (p.x - m.center.x) * m.normal.x) < 2.5);
const underSkylight = (p: Vec3, margin = 1.5): boolean =>
  skylight.kind === "shaft" && Math.hypot(p.x - skylight.center[0], p.z - skylight.center[1]) <= skylight.radius + skylight.flare + margin;
/** The room holding a point, from the generated voxels ("" outside the cave). */
function roomAt(p: Vec3): string {
  const v = caveVolume(def), g = v.grid;
  const i = Math.floor((p.x - g.origin.x) / g.voxel), j = Math.floor((p.y - g.origin.y) / g.voxel), k = Math.floor((p.z - g.origin.z) / g.voxel);
  if (i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz) return "";
  const r = v.room[i + g.nx * (j + g.ny * k)]!;
  return r ? v.roomIds[r - 1]! : "";
}
/** Probe columns over the cave: the loop's inside points and every room's centre. */
const probes: Vec3[] = [
  ...def.routes.flatMap(r => r.path).filter(insideFootprint),
  ...def.rooms.filter(r => r.role !== "shaft").map(r => ({ x: (r.bounds.min.x + r.bounds.max.x) / 2,
    y: r.bounds.min.y + 1.2, z: (r.bounds.min.z + r.bounds.max.z) / 2 })),
].map(p => ({ ...p, x: Math.floor(p.x * 2) / 2 + 0.25, z: Math.floor(p.z * 2) / 2 + 0.25 })) // voxel column centres, off the box lattice
  .filter(p => roomAt({ ...p, y: p.y + 0.5 }) !== "" && !underSkylight(p) && !nearMouth(p) && world.clearance(shift(p), DIVER));

test("Fanvault: stable ids, thick rock in the owned footprint, outside the legacy preserve and routes", () => {
  assert.equal(CAVE_SOURCES.length, new Set(CAVE_SOURCES.map(s => s.id)).size);
  const f = def.replacementFootprints[0]!;
  assert.ok(f.maxX <= LEGACY_PRESERVE.minX || f.minX >= LEGACY_PRESERVE.maxX || f.maxZ <= LEGACY_PRESERVE.minZ || f.minZ >= LEGACY_PRESERVE.maxZ,
    "footprint must not touch the legacy preserve");
  for (const [x, z] of [[f.minX, f.minZ], [f.maxX, f.minZ], [f.minX, f.maxZ], [f.maxX, f.maxZ]] as const)
    assert.equal(regionAtPoint(x, z), def.region);
  assert.ok(def.rock.length > 0 && def.rock.length < 2000, `${def.rock.length} solids`);
  assert.equal(new Set(def.rock.map(s => s.id)).size, def.rock.length);
  for (const s of def.rock) {
    for (const a of ["x", "y", "z"] as const) assert.ok(s.max[a] - s.min[a] >= MIN_ROCK - 1e-9, `${s.id} is thinner than ${MIN_ROCK} m on ${a}`);
    assert.ok(s.min.x >= f.minX && s.max.x <= f.maxX && s.min.z >= f.minZ && s.max.z <= f.maxZ, `${s.id} leaves the footprint`);
    assert.ok(s.min.y >= source.baseY && s.max.y <= source.topY, `${s.id} leaves the envelope`);
  }
  assert.ok(def.stats.droppedVoxels <= def.stats.rockVoxels * 0.002, `${def.stats.droppedVoxels} thin voxels dropped`);
  // Clear of every authored route corridor, site and structure.
  for (const r of ROUTES) for (const p of r.path) {
    const d = Math.hypot(Math.max(f.minX - p.x, 0, p.x - f.maxX), Math.max(f.minZ - p.z, 0, p.z - f.maxZ));
    assert.ok(d > r.minHalfWidth + 4, `${r.id} passes ${d.toFixed(1)} m from the footprint`);
  }
  for (const s of SITES) assert.ok(!(s.at.x >= f.minX && s.at.x <= f.maxX && s.at.z >= f.minZ && s.at.z <= f.maxZ), `${s.id} is inside`);
  for (const { id, bounds: b } of STRUCTURE_SOLIDS)
    assert.ok(b.max.x < f.minX || b.min.x > f.maxX || b.max.z < f.minZ || b.min.z > f.maxZ, `${id} overlaps`);
  // Every room, portal and route names something real.
  const rooms = new Set([...def.rooms.map(r => r.id), EXTERIOR]);
  for (const p of def.portals) for (const r of p.between) assert.ok(rooms.has(r), `${p.id} names ${r}`);
});

test("Fanvault: generation is deterministic", () => {
  const again = buildCave(source, worldFloor);
  assert.deepEqual(again.rock, def.rock);
  assert.deepEqual(again.rooms, def.rooms);
});

test("Fanvault: the shell never sits more than 0.35 m from its rock, and no cave water is inside rock", () => {
  // Every shell vertex and triangle centroid lies within 0.35 m of a solid,
  // and within 0.35 m of open water (no invisible wall in front of the art).
  let worst = 0, buried = 0, points = 0;
  const check = (p: Vec3, n: Vec3): void => {
    points++;
    worst = Math.max(worst, rockDistance(p));
    if (inRock({ x: p.x + n.x * 0.36, y: p.y + n.y * 0.36, z: p.z + n.z * 0.36 })) buried++;
  };
  const m = fine;
  for (let v = 0; v < m.positions.length / 3; v++)
    check(vertex(m, v), { x: m.normals[v * 3]!, y: m.normals[v * 3 + 1]!, z: m.normals[v * 3 + 2]! });
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map(k => vertex(m, m.indices[t + k]!)) as [Vec3, Vec3, Vec3];
    const n = cross(sub(b, a), sub(c, a)), l = Math.hypot(n.x, n.y, n.z) || 1;
    check({ x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3, z: (a.z + b.z + c.z) / 3 }, { x: n.x / l, y: n.y / l, z: n.z / l });
  }
  assert.ok(worst <= 0.35, `shell point ${worst.toFixed(3)} m outside its solids`);
  assert.ok(buried <= points * 0.001, `${buried} of ${points} shell points face rock within 0.36 m`);
  // Cave water, voxel by voxel: no room cell centre is inside a solid.
  const v = caveVolume(def), g = v.grid;
  let cells = 0;
  for (let k = 0; k < g.nz; k++) for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    if (!v.room[i + g.nx * (j + g.ny * k)]) continue;
    cells++;
    const p = { x: g.origin.x + (i + 0.5) * g.voxel, y: g.origin.y + (j + 0.5) * g.voxel, z: g.origin.z + (k + 0.5) * g.voxel };
    assert.ok(!inRock(p), `room cell ${JSON.stringify(p)} is inside rock`);
  }
  assert.ok(cells > 5000, `${cells} room cells`);
  // Independently of the voxels: points the source calls clearly carved are
  // never inside rock; points it calls clearly rock almost always are.
  const sampler = caveSampler(source, worldFloor), f = def.replacementFootprints[0]!;
  let water = 0, rock = 0, covered = 0;
  for (let x = f.minX + 0.3; x < f.maxX; x += 0.9) for (let z = f.minZ + 0.3; z < f.maxZ; z += 0.9)
    for (let y = source.baseY + 0.3; y < source.topY; y += 0.9) {
      const e = sampler.exterior(x, y, z), w = sampler.water(x, y, z).distance;
      if (e < -0.6 && w < -0.6) { water++; assert.ok(!inRock({ x, y, z }), `carved water at ${x}, ${y}, ${z} is inside rock`); }
      if (e < -0.6 && w > 0.6) { rock++; if (inRock({ x, y, z })) covered++; }
    }
  assert.ok(water > 1500, `${water} carved samples`);
  assert.ok(covered >= rock * 0.995, `${rock - covered} of ${rock} rock samples uncovered`);
});

test("Fanvault: both mouths keep their clear size, a diver clears the loop and no hull fits", () => {
  const mouths = def.portals.filter(p => p.kind === "mouth");
  assert.equal(mouths.length, 2);
  for (const p of [...mouths, ...def.portals.filter(p => p.kind !== "mouth")]) {
    for (const q of aperture(p)) assert.ok(!inRock(q), `${p.id}: rock at ${JSON.stringify(q)} inside its ${p.clear.width} x ${p.clear.height} m opening`);
    for (const lod of ["fine", "coarse"] as const) for (const q of aperture(p, 0.45)) {
      const a = { x: q.x - p.normal.x * 0.3, y: q.y - p.normal.y * 0.3, z: q.z - p.normal.z * 0.3 };
      const b = { x: q.x + p.normal.x * 0.3, y: q.y + p.normal.y * 0.3, z: q.z + p.normal.z * 0.3 };
      assert.ok(!grids[lod](q, 0.5).some(([u, v, w]) => segmentHitsTriangle(a, b, u, v, w)), `${p.id}: ${lod} shell crosses the opening`);
    }
  }
  for (const m of mouths) {
    assert.ok(m.clear.width >= 4.5 && m.clear.height >= 3.5, `${m.id} is below the diver mouth target`);
    assert.ok(m.clear.width < SMALL.radius * 2, `${m.id} would admit a small hull`);
    // Diver only: the smallest hull, centred and level with the sill, cannot pass.
    const keel = { x: m.center.x, y: m.center.y - m.clear.height / 2 + 0.1, z: m.center.z };
    const from = { x: keel.x + m.normal.x * 8, y: keel.y, z: keel.z + m.normal.z * 8 };
    const move = world.moveCapsule(shift(from), { x: -m.normal.x * 16, y: 0, z: -m.normal.z * 16 }, SMALL);
    assert.ok(move.hitSolid, `${m.id}: a small hull swept through`);
  }
  // The diver sweeps the whole loop, segment by segment, without touching rock.
  for (const r of def.routes) {
    const path = r.path.map(shift);
    for (const p of path) assert.ok(world.clearance(p, DIVER), `${r.id}: diver blocked at ${JSON.stringify(p)}`);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!, b = path[i]!;
      const move = world.moveCapsule(a, sub(b, a), DIVER);
      assert.ok(!move.hitSolid && !move.hitBoundary && Math.hypot(move.position.x - b.x, move.position.y - b.y, move.position.z - b.z) < 1e-6,
        `${r.id}: segment ${i} stops at ${JSON.stringify(move.position)}`);
    }
  }
  // Negative control: a 2 m block in the north mouth stops the same loop.
  const north = mouths.find(m => m.normal.z > 0)!;
  const blocked = worldWith([...def.rock, { id: "test.block", min: { x: north.center.x - 3, y: north.center.y - 2.4, z: north.center.z - 1 },
    max: { x: north.center.x + 3, y: north.center.y + 2.4, z: north.center.z + 1 } }]);
  const path = loop.path.map(shift);
  assert.ok(path.slice(1).some((b, i) => blocked.moveCapsule(path[i]!, sub(b, path[i]!), DIVER).hitSolid), "a blocked mouth must stop the loop");
});

test("Fanvault: the roof carries a diver above while one fits below at the same X/Z, and the shell keeps it", () => {
  assert.ok(probes.length >= 10, `${probes.length} probe columns`);
  for (const p of probes) {
    const top = world.supportHeight(p.x + SHIFT.x, p.z + SHIFT.z, 1000);
    // The roof top under the whole diver footprint (a terrace riser may rise beside it).
    const stand = Math.max(...[-1, 1].flatMap(a => [-1, 1].map(b =>
      world.supportHeight(p.x + SHIFT.x + a * DIVER.radius, p.z + SHIFT.z + b * DIVER.radius, 1000))));
    // Below: clear, supported by the cave floor, not the roof.
    assert.ok(world.clearance(shift(p), DIVER), `no room below at ${JSON.stringify(p)}`);
    assert.ok(world.supportHeight(p.x + SHIFT.x, p.z + SHIFT.z, p.y) <= p.y + 1e-9, `support below ${JSON.stringify(p)} is the roof`);
    // The roof is real rock, at least MIN_ROCK thick above the diver's head.
    const over = def.rock.filter(s => p.x > s.min.x && p.x < s.max.x && p.z > s.min.z && p.z < s.max.z && s.min.y >= p.y + DIVER.height);
    const ceiling = Math.min(...over.map(s => s.min.y));
    assert.ok(Number.isFinite(ceiling) && top - ceiling >= MIN_ROCK - 1e-9, `roof over ${JSON.stringify(p)} is ${(top - ceiling).toFixed(2)} m`);
    // Above: a diver stands on the roof and cannot sink through it.
    const above = { x: p.x + SHIFT.x, y: stand + 0.01, z: p.z + SHIFT.z };
    assert.ok(world.clearance(above, DIVER), `no room on the roof over ${JSON.stringify(p)}`);
    const sink = world.moveCapsule({ ...above, y: stand + 1 }, { x: 0, y: -3, z: 0 }, DIVER);
    assert.ok(sink.hitSolid && sink.position.y >= stand - 1e-6, `a diver sinks through the roof over ${JSON.stringify(p)}`);
    // The footprint did not delete the roof from the art: both LODs draw a
    // surface across this column at the roof top.
    for (const lod of ["fine", "coarse"] as const) {
      const a = { x: p.x, y: top + 0.6, z: p.z }, b = { x: p.x, y: top - (lod === "fine" ? 0.8 : 1.6), z: p.z };
      assert.ok(grids[lod]({ x: p.x, y: top, z: p.z }, 1.8).some(([u, v, w]) => segmentHitsTriangle(a, b, u, v, w)),
        `${lod} shell has no roof top over ${JSON.stringify(p)}`);
    }
  }
  // No roof hole anywhere: from every cave water cell, straight up meets rock
  // before open water, except under the skylight and at the mouth lintels.
  const v = caveVolume(def), g = v.grid;
  let holes = 0;
  for (let k = 0; k < g.nz; k++) for (let i = 0; i < g.nx; i++) for (let j = 0; j < g.ny; j++) {
    if (!v.room[i + g.nx * (j + g.ny * k)]) continue;
    const p = { x: g.origin.x + (i + 0.5) * g.voxel, y: g.origin.y + (j + 0.5) * g.voxel, z: g.origin.z + (k + 0.5) * g.voxel };
    if (underSkylight(p) || nearMouth(p)) continue;
    for (let up = j + 1; up < g.ny && !v.solid[i + g.nx * (up + g.ny * k)]; up++)
      if (!v.room[i + g.nx * (up + g.ny * k)]) { holes++; assert.ok(holes < 5, `roof hole above ${JSON.stringify(p)}`); break; }
  }
  assert.equal(holes, 0, "roof holes");
});

test("Fanvault: coarse keeps every opening and never bridges a tunnel", () => {
  for (const r of def.routes) for (let i = 1; i < r.path.length; i++) {
    const a = r.path[i - 1]!, b = r.path[i]!, steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 0.25);
    for (let s = 0; s <= steps; s++) {
      const p = { x: a.x + (b.x - a.x) * s / steps, y: a.y + 0.45 + (b.y - a.y) * s / steps, z: a.z + (b.z - a.z) * s / steps };
      for (const lod of ["fine", "coarse"] as const) for (const [u, v, w] of grids[lod](p, 0.8))
        assert.ok(pointTriangleDistance(p, u, v, w) >= 0.6, `${lod} shell within 0.6 m of ${r.id} at ${JSON.stringify(p)}`);
    }
  }
  // Coarse rock is a subset of fine rock voxel by voxel, so its water holds all
  // fine water; it is also a real simplification.
  assert.ok(coarse.positions.length < fine.positions.length / 3, "coarse is not coarser");
});

test("Fanvault: shells clip to columns and survive the terrain codec", () => {
  for (const m of [fine, coarse]) for (let a = 3; a < m.colors.length; a += 4) assert.ok(Number.isInteger(m.colors[a]), "cel alpha must be an integer");
  // A synthetic seam through the vault: the halves add back to the whole.
  const f = def.replacementFootprints[0]!;
  const west = clipMeshToRect(fine, { ...f, maxX: -290 })!, east = clipMeshToRect(fine, { ...f, minX: -290 })!;
  assert.ok(Math.abs(area(west) + area(east) - area(fine)) < area(fine) * 1e-6, "clipped halves lose area");
  for (let v = 0; v < west.positions.length / 3; v++) assert.ok(vertex(west, v).x <= -290 + 1e-6);
  for (let v = 0; v < east.positions.length / 3; v++) assert.ok(vertex(east, v).x >= -290 - 1e-6);
  for (const m of [west, east]) for (let a = 3; a < m.colors.length; a += 4) assert.ok(Number.isInteger(m.colors[a]));
  // The real 128 m columns, then encode and decode one layer-0 recipe.
  const cells = new Map<string, { id: string; rect: ReturnType<typeof columnRect> }>();
  for (const [x, z] of [[f.minX, f.minZ], [f.maxX - 1e-6, f.minZ], [f.minX, f.maxZ - 1e-6], [f.maxX - 1e-6, f.maxZ - 1e-6]] as const) {
    const c = columnAt(x, z)!;
    cells.set(chunkId({ ...c, layer: 0 }), { id: chunkId({ ...c, layer: 0 }), rect: columnRect(c.ix, c.iz) });
  }
  const parts = { fine: caveShellByColumn(def, "fine", [...cells.values()]), coarse: caveShellByColumn(def, "coarse", [...cells.values()]) };
  for (const lod of ["fine", "coarse"] as const)
    assert.ok(Math.abs([...parts[lod].values()].reduce((t, m) => t + area(m), 0) - area(shells[lod])) < area(shells[lod]) * 1e-6);
  for (const cell of cells.values()) {
    const lods = { fine: [parts.fine.get(cell.id)].filter(m => !!m) as MeshRecipe[], coarse: [parts.coarse.get(cell.id)].filter(m => !!m) as MeshRecipe[] };
    if (!lods.fine.length) continue;
    const bytes = encodeTerrain(cell.rect, lods);
    const run = decodeTerrain(bytes, cell.rect, cell.id, "fine");
    let r = run.next();
    while (!r.done) r = run.next();
    const decoded = r.value[0]!, original = lods.fine[0]!;
    assert.equal(decoded.name, `${cell.id}.fanvault`);
    for (let v = 0; v < original.positions.length / 3; v++) {
      const a = vertex(original, v), b = vertex(decoded, v);
      assert.ok(Math.abs(a.x - b.x) < 0.002 && Math.abs(a.z - b.z) < 0.002 && Math.abs(a.y - b.y) < 0.009, "codec moved a vertex");
      assert.equal(decoded.colors[v * 4 + 3], original.colors[v * 4 + 3]);
    }
  }
});

test("Fanvault: the collar meets the heightfield at the footprint edge", () => {
  const f = def.replacementFootprints[0]!;
  const edge: [number, number, number, number][] = [];
  for (let u = f.minX + 0.5; u < f.maxX; u += 1) edge.push([u, f.minZ + 0.25, u, f.minZ - 0.25], [u, f.maxZ - 0.25, u, f.maxZ + 0.25]);
  for (let u = f.minZ + 0.5; u < f.maxZ; u += 1) edge.push([f.minX + 0.25, u, f.minX - 0.25, u], [f.maxX - 0.25, u, f.maxX + 0.25, u]);
  for (const [x, z, ox, oz] of edge) {
    const top = world.supportHeight(x + SHIFT.x, z + SHIFT.z, 1000), outside = worldFloor(ox, oz);
    assert.ok(Math.abs(top - outside) <= 0.75, `collar step ${(top - outside).toFixed(2)} m at ${x}, ${z}`);
  }
  for (const m of [fine, coarse]) for (let v = 0; v < m.positions.length / 3; v++) {
    const p = vertex(m, v);
    if (Math.abs(p.x - f.minX) > 1e-6 && Math.abs(p.x - f.maxX) > 1e-6 && Math.abs(p.z - f.minZ) > 1e-6 && Math.abs(p.z - f.maxZ) > 1e-6) continue;
    assert.ok(Math.abs(p.y - worldFloor(p.x, p.z)) < 1e-4, `collar vertex ${p.y.toFixed(2)} vs floor ${worldFloor(p.x, p.z).toFixed(2)}`);
  }
});

test("Fanvault: craft park on the open shelf beside the north mouth", () => {
  const north = def.portals.find(p => p.id === "fanvault.mouth.north")!;
  for (const s of def.staging) {
    assert.ok(!insideFootprint(s.position));
    assert.ok(Math.hypot(s.position.x - north.center.x, s.position.z - north.center.z) < 45, `${s.id} is far from the mouth`);
    const shape: Capsule = CRAFT_PROFILES.medium;
    assert.ok(world.clearance(shift(s.position), shape) && s.position.y >= worldFloor(s.position.x, s.position.z) + 0.5, `${s.id} has no room`);
  }
});

// --- Light ------------------------------------------------------------------

const field: CaveLightField = caveLightField(def, worldFloor);
const seen = (p: Vec3): number => { const c = sampleLightField(field, p); return caveDaylight(c.r, c.g, c.a); };
/** Open water between two points: the fine voxels along it are not rock. */
function clearSight(a: Vec3, b: Vec3): boolean {
  const v = caveVolume(def), g = v.grid, steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 0.25);
  for (let s = 1; s < steps; s++) {
    const t = s / steps, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
    const i = Math.floor((x - g.origin.x) / g.voxel), j = Math.floor((y - g.origin.y) / g.voxel), k = Math.floor((z - g.origin.z) / g.voxel);
    if (i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz) continue;
    if (v.solid[i + g.nx * (j + g.ny * k)]) return false;
  }
  return true;
}

test("cave light: dark inside by path length from the openings, lit at the mouths and in the skylight beam", () => {
  const vault = def.rooms.find(r => r.id === "fanvault.vault")!, pocket = def.rooms.find(r => r.role === "pocket")!;
  const middle = (r: typeof vault): Vec3 => ({ x: (r.bounds.min.x + r.bounds.max.x) / 2, y: r.bounds.min.y + 1.5, z: (r.bounds.min.z + r.bounds.max.z) / 2 });
  assert.equal(seen({ x: -270, y: -15, z: -30 }), 1, "open water is fully lit");
  for (const m of def.portals.filter(p => p.kind === "mouth"))
    assert.ok(seen({ x: m.center.x - m.normal.x, y: m.center.y, z: m.center.z - m.normal.z }) > 0.6, `${m.id} is dark`);
  const deep = seen({ x: pocket.bounds.min.x + 2, y: pocket.bounds.min.y + 1.2, z: (pocket.bounds.min.z + pocket.bounds.max.z) / 2 });
  assert.ok(deep < 0.25, `the pocket is lit at ${deep.toFixed(2)}`);
  // The skylight's beam reaches the vault floor: a pool of full daylight.
  let beam = 0;
  for (let x = vault.bounds.min.x; x < vault.bounds.max.x; x += 0.5) for (let z = vault.bounds.min.z; z < vault.bounds.max.z; z += 0.5) {
    const c = sampleLightField(field, { x, y: vault.bounds.min.y + 0.6, z });
    if (c.a > 0.5 && c.g > 0.6) beam++;
  }
  assert.ok(beam >= 8, `${beam} beam cells on the vault floor`);
  assert.ok(seen(middle(vault)) < 0.8, "the vault is not darker than open water");
});

test("adverse: with the lamp off, a diver anywhere on the routes can see and follow light to an exit", () => {
  // From each inside pose, look for the brightest water visible within 24 m
  // and swim to it; repeat. Every start must reach open water in a few hops,
  // each hop strictly brighter. Unlit wayfinding colonies only help further.
  const v = caveVolume(def), g = v.grid, candidates: { p: Vec3; light: number }[] = [];
  for (let k = 0; k < g.nz; k += 2) for (let j = 0; j < g.ny; j += 2) for (let i = 0; i < g.nx; i += 2) {
    if (v.solid[i + g.nx * (j + g.ny * k)]) continue;
    const p = { x: g.origin.x + (i + 0.5) * g.voxel, y: g.origin.y + (j + 0.5) * g.voxel, z: g.origin.z + (k + 0.5) * g.voxel };
    const light = seen(p);
    if (light >= 0.3) candidates.push({ p, light });
  }
  const starts = def.routes.flatMap(r => r.path).filter(p => seen({ ...p, y: p.y + 0.5 }) < 1);
  assert.ok(starts.length >= 8);
  for (const start of starts) {
    let at = { ...start, y: start.y + 0.5 }, light = seen(at), hops = 0;
    while (light < 1) {
      assert.ok(hops++ < 6, `lost from ${JSON.stringify(start)}`);
      let best: { p: Vec3; light: number } | null = null;
      for (const c of candidates) {
        if (c.light <= light || Math.hypot(c.p.x - at.x, c.p.y - at.y, c.p.z - at.z) > 24) continue;
        if ((!best || c.light > best.light) && clearSight(at, c.p)) best = c;
      }
      assert.ok(best, `no brighter water in sight from ${JSON.stringify(at)} (light ${light.toFixed(2)})`);
      at = best.p; light = best.light;
    }
  }
});

test("cave light splice: anchors are required once each", () => {
  const fragment = `void main(){\n  vec3 n=normalize(vNormal); float d=dot(n,normalize(lightDirection));\n` +
    `  float sky=smoothstep(.3,.9,n.y)*(1.0-smoothstep(-.8,-.1,vWorld.y))*underwater;\n` +
    `  shade=mix(shade,vColor.rgb*1.12,step(vColor.a,-.5));\n  gl_FragColor=vec4(opticalFog(shade,vWorld),1.0);\n}`;
  const out = injectCaveLight(fragment);
  assert.match(out, /caveFog\(shade,vWorld,cave\)/);
  assert.match(out, /shade=caveShade\(shade,n,cave\);\s*shade=mix/);
  assert.ok(out.indexOf("vec4 cave=caveFace") < out.indexOf("sky*=mix"));
  for (const anchor of CAVE_ANCHORS) assert.throws(() => injectCaveLight(fragment.replace(anchor, "")), /anchor missing/);
  assert.throws(() => injectCaveLight(fragment + "\nvoid main(){"), /anchor repeated/);
});

