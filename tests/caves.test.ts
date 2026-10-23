import test from "node:test";
import assert from "node:assert/strict";
import { assertDisjointFootprints, CAVE_SOURCES, EXTERIOR, MIN_ROCK, type CaveSource } from "../src/content/regions/caves.js";
import { buildCave, caveSampler, caveShellByColumn, caveVolume, clipMeshToRect } from "../src/content/regions/caveGeometry.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { withoutBuildCache } from "../src/content/buildCache.js";
import { LEGACY_PRESERVE } from "../src/content/regions/terrain.js";
import { regionAtPoint } from "../src/content/regions/layout.js";
import { ROUTES, CRAFT_PROFILES } from "../src/content/regions/passages.js";
import { SITES } from "../src/content/regions/sites.js";
import { STRUCTURE_SOLIDS } from "../src/content/regions/structures.js";
import type { Capsule, Vec3 } from "../src/sim/types.js";
import { columnAt, columnRect, chunkId } from "../src/world/frame.js";
import type { MeshRecipe } from "../src/render/kit/types.js";
import { decodeTerrain, encodeTerrain } from "../src/render/biomes/terrainCodec.js";
import { aperture, area, coarse, cross, def, DIVER, fine, grids, inRock, insideFootprint, loop, pointTriangleDistance, probes,
  rockDistance, roofHoles, segmentHitsTriangle, shells, shift, SHIFT, SMALL, source, sub, vertex, world, worldWith } from "./cave-support.js";

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

test("overlapping cave footprints are rejected until a union policy exists", () => {
  const at = (id: string, minX: number): CaveSource => ({ ...source, id, footprint: { ...source.footprint, minX, maxX: minX + 52 } });
  assert.doesNotThrow(() => assertDisjointFootprints([at("a", 0), at("b", 52)]), "sharing an edge is fine");
  assert.throws(() => assertDisjointFootprints([at("a", 0), at("b", 51.5)]), /no union policy/);
  assert.doesNotThrow(() => assertDisjointFootprints(CAVE_SOURCES));
});

test("Fanvault: generation is deterministic", () => {
  // A fresh build, never the test build cache: `def` may come from the cache, so this also checks the cached data.
  const again = withoutBuildCache(() => buildCave(source, worldFloor));
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
  const blocked = worldWith([{ id: "test.block", min: { x: north.center.x - 3, y: north.center.y - 2.4, z: north.center.z - 1 },
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
  // No roof hole anywhere: cave water meets open water straight above it
  // only in the skylight shaft's own water and at the mouth lintels.
  const holes = roofHoles(def);
  assert.equal(holes.length, 0, `roof holes, first ${JSON.stringify(holes[0])}`);
});

test("negative control: a vault dome raised through its roof is caught as roof holes", () => {
  // R1's mutation: the vault's upper radius 6 -> 9.5 thins and breaks the cap
  // beside the skylight; the opening drops the thin rock and the dome opens.
  const thin = buildCave({ ...source, carves: source.carves.map(c =>
    c.kind === "chamber" && c.room === "fanvault.vault" ? { ...c, radii: { ...c.radii, up: 9.5 } } : c) }, worldFloor);
  const holes = roofHoles(thin);
  assert.ok(holes.length > 0, "the thinned roof passed as sound");
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

