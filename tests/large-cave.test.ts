import test from "node:test";
import assert from "node:assert/strict";
import type { Vec3 } from "../src/sim/types.js";
import { actorBox } from "../src/sim/ribCollision.js";
import { lampVisible } from "../src/render/caves/lightField.js";
import { buildChunkMesh } from "../src/world/caves/large/mesh.js";
import { COLLISION_BAND } from "../src/world/caves/large/build.js";
import { bakeChunk, encodeBake, readBake } from "../src/world/caves/large/bake.js";
import { buildCollider, caveRockAt, caveSegmentClear, chunkIndex, createCandidates, gatherTriangles, boxOverlapsTriangle } from "../src/world/caves/large/collision.js";
import { compileField, validateOwnership } from "../src/world/caves/large/field.js";
import { buildWindow } from "../src/world/caves/large/lampWindow.js";
import { placeLife } from "../src/world/caves/large/life.js";
import { buildLightGrid, vertexLight } from "../src/world/caves/large/light.js";
import { CREEL, DART, DIVER, VAULT, VAULT_OFFSET, boxSamples, composedWith, random, seek, vault, vaultFloor } from "./large-cave-support.js";

// LC: the large-cave technology on a small synthetic biome (2 x 2 x 2 chunks).
const cave = vault();
const world = composedWith(cave, vaultFloor, VAULT_OFFSET);
const centre: Vec3 = { x: 28, y: -73, z: 24 };

/** In cave rock or under the exterior seabed where no cave owns the point. */
function solidAt(p: Vec3): boolean {
  if (cave.field.owned(p.x, p.y, p.z)) return caveRockAt(cave.collision, p);
  return p.y < vaultFloor(p.x, p.z) - 0.02;
}
const buried = (p: Vec3, s: typeof DIVER): Vec3 | undefined => boxSamples(p, s).find(solidAt);
const VAULT_OWNED = (p: Vec3): boolean => cave.field.owned(p.x, p.y, p.z);

test("LC fixture: ownership validates; carved water above the cap is rejected", () => {
  assert.deepEqual(validateOwnership(cave.field), []);
  const bad = { ...VAULT, carves: [...VAULT.carves, { kind: "chamber" as const, id: "bad", zone: "vault.main", wobble: 0, center: { x: 8, y: -48, z: 56 }, radii: { x: 3, z: 3, up: 2, down: 2 }, yaw: 0, floor: -50 }] };
  const problems = validateOwnership(compileField(bad, vaultFloor));
  assert.equal(problems.length, 1);
  assert.match(problems[0]!, /carve bad: \d+ water points reach unowned space/);
});

test("LC mesh: deterministic, and chunk seams share their border vertices exactly", () => {
  const c = cave.chunks[0]!, a = buildChunkMesh(cave.field, cave.lattice, c, "fine"), b = cave.mesh(c, "fine");
  assert.deepEqual([...a.positions], [...b.positions]);
  assert.deepEqual([...a.indices], [...b.indices]);
  // The union of every fine mesh is closed except where ownership clips it
  // (the collar edge on the seabed) or the domain ends: every edge has an
  // even number of uses (surface nets makes a few 4-use edges where two
  // sheets touch; an odd count is a hole).
  const key = (P: Float32Array, v: number): string => `${P[v * 3]},${P[v * 3 + 1]},${P[v * 3 + 2]}`;
  const uses = new Map<string, number>(), at = new Map<string, Vec3>();
  for (const ch of cave.chunks) {
    const m = cave.mesh(ch, "fine"), P = m.positions, I = m.indices;
    for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) {
      const u = key(P, I[t + e]!), w = key(P, I[t + (e + 1) % 3]!), k = u < w ? `${u}|${w}` : `${w}|${u}`;
      uses.set(k, (uses.get(k) ?? 0) + 1);
      const v = I[t + e]!; at.set(k, { x: P[v * 3]!, y: P[v * 3 + 1]!, z: P[v * 3 + 2]! });
    }
  }
  const r = VAULT.collars[0]!, d = VAULT.domain;
  const open = [...uses].filter(([k, n]) => {
    if (n % 2 === 0) return false;
    const p = at.get(k)!, onCollar = [r.minX, r.maxX].some(x => Math.abs(p.x - x) < 0.6) || [r.minZ, r.maxZ].some(z => Math.abs(p.z - z) < 0.6);
    const onDomain = p.y > d.max.y - 1 || [d.min.x, d.max.x].some(x => Math.abs(p.x - x) < 1) || [d.min.z, d.max.z].some(z => Math.abs(p.z - z) < 1);
    return !onCollar && !onDomain;
  });
  assert.equal(open.length, 0, `open edges inside the cave: ${open.slice(0, 5).map(([k, n]) => `${k} x${n}`).join("; ")}`);
});

test("LC sampling: skipping bricks no primitive reaches changes no vertex", () => {
  for (const c of cave.chunks) for (const lod of ["fine", "coarse"] as const) {
    const fast = cave.mesh(c, lod), full = buildChunkMesh(cave.field, cave.lattice, c, lod, { band: lod === "fine" ? COLLISION_BAND : 0, exhaustive: true });
    assert.deepEqual([...full.positions], [...fast.positions], `chunk ${fast.key} ${lod}`);
    assert.deepEqual([...full.indices], [...fast.indices], `chunk ${fast.key} ${lod}`);
    assert.ok(fast.stats.skipped > 0 || lod === "coarse", "the fixture exercises skipping");
  }
});

test("LC agreement: art is the collision mesh; independent dense probes agree within 0.35 m", () => {
  for (const c of cave.chunks) {
    const m = cave.mesh(c, "fine"), k = cave.collision.colliders[chunkIndex(cave.collision, c.cx, c.cy, c.cz)]!;
    // The collider holds the art's own vertices (then the band) and the same triangles.
    assert.deepEqual([...k.positions.subarray(0, m.positions.length)], [...m.positions]);
    const tris = (I: ArrayLike<number>, n: number): string[] => { const out: string[] = []; for (let t = 0; t < n * 3; t += 3) out.push([I[t], I[t + 1], I[t + 2]].join()); return out.sort(); };
    const art = tris(m.indices, m.indices.length / 3), col = new Set(tris(k.tris, k.tris.length / 3));
    assert.ok(art.every(t => col.has(t)), `chunk ${m.key}: an art triangle is missing from collision`);
    assert.equal(col.size, art.length + (m.band ? m.band.indices.length / 3 : 0), `chunk ${m.key}: collision has triangles the art and band do not`);
  }
  // Probes from the authored field, not the lattice: clearly rock or clearly
  // water must read the same through the collision mesh.
  const rnd = random(7), d = VAULT.domain;
  let checked = 0, wrong: string[] = [];
  for (let i = 0; i < 20000; i++) {
    const p = { x: d.min.x + 2 + rnd() * 60, y: -82 + rnd() * 40, z: d.min.z + 2 + rnd() * 60 };
    if (!cave.field.owned(p.x, p.y, p.z)) continue;
    const f = cave.field.rock(p.x, p.y, p.z);
    if (Math.abs(f) < 0.35) continue;
    checked++;
    if ((f < 0) !== caveRockAt(cave.collision, p)) wrong.push(`(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) field ${f.toFixed(2)}`);
  }
  assert.ok(checked > 5000, `only ${checked} probes`);
  assert.deepEqual(wrong.slice(0, 5), []);
});

test("LC coarse: never closes or narrows a passage; its walls stay in fine rock", () => {
  const cand = createCandidates();
  for (const r of VAULT.routes) for (let s = 1; s < r.path.length; s++) {
    const a = r.path[s - 1]!, b = r.path[s]!, n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 0.25);
    for (let i = 0; i <= n; i++) {
      const p = { x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n, z: a.z + (b.z - a.z) * i / n };
      const c = { x: p.x, y: p.y + DIVER.height / 2, z: p.z }, e = { x: DIVER.radius, y: DIVER.height / 2, z: DIVER.radius };
      // Coarse triangles near the diver box on the route.
      const coarse = cave.chunks.map(ch => cave.mesh(ch, "coarse"));
      for (const m of coarse) for (let t = 0; t < m.indices.length; t += 3) {
        const v = [m.indices[t]!, m.indices[t + 1]!, m.indices[t + 2]!];
        if (v.every(q => Math.abs(m.positions[q * 3]! - c.x) > 3 || Math.abs(m.positions[q * 3 + 1]! - c.y) > 3 || Math.abs(m.positions[q * 3 + 2]! - c.z) > 3)) continue;
        cand.v.set(v.flatMap(q => [m.positions[q * 3]!, m.positions[q * 3 + 1]!, m.positions[q * 3 + 2]!]), 0);
        assert.ok(!boxOverlapsTriangle(c.x, c.y, c.z, e.x, e.y, e.z, cand.v, 0, 0), `${r.id}: coarse rock crosses the route at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`);
      }
    }
  }
  // Coarse cave vertices sit in fine rock or on the surface, never in water.
  let worst = -Infinity;
  for (const ch of cave.chunks) {
    const m = cave.mesh(ch, "coarse");
    for (let v = 0; v < m.positions.length / 3; v++) if (m.zones[v]) worst = Math.max(worst, cave.field.rock(m.positions[v * 3]!, m.positions[v * 3 + 1]!, m.positions[v * 3 + 2]!));
  }
  assert.ok(worst < 0.2, `a coarse wall stands ${worst.toFixed(2)} m into fine water`);
});

test("LC sweeps: walls, roofs and floors stop a diver at any speed; never inside rock", () => {
  assert.ok(world.clearance(centre, DIVER));
  for (const [dir, speed] of [[{ x: 1, y: 0, z: 0 }, 2], [{ x: -1, y: 0, z: 0.2 }, 30], [{ x: 0, y: 1, z: 0 }, 11], [{ x: 0, y: -1, z: 0 }, 11], [{ x: 0.6, y: 0.5, z: -0.6 }, 60]] as const) {
    let p = { ...centre }, hit = false;
    for (let i = 0; i < 600; i++) {
      const r = world.moveCapsule(p, { x: dir.x * speed / 60, y: dir.y * speed / 60, z: dir.z * speed / 60 }, DIVER);
      hit ||= r.hitSolid; p = r.position;
      const b = buried(p, DIVER);
      assert.equal(b, undefined, `diver buried at ${JSON.stringify(b)} moving ${JSON.stringify(dir)} at ${speed} m/s`);
    }
    assert.ok(hit, `no contact moving ${JSON.stringify(dir)}`);
    assert.ok(world.clearance(p, DIVER), "stopped pose is clear");
  }
  // One huge step (a dropped frame) cannot tunnel the pillar or a wall.
  const r = world.moveCapsule({ x: 30, y: -73, z: 20 }, { x: 40, y: 0, z: 0 }, DIVER);
  assert.ok(r.hitSolid && r.position.x < 34 - 1.4, `tunnelled to x ${r.position.x}`);
});

test("LC sweeps: grazing slides keep moving; a crease slides along it; the squeeze takes a diver, not a craft", () => {
  // 15 degrees into the chamber's south wall: most of the travel survives.
  let p = { x: 24, y: -73, z: 18 }, along = 0;
  for (let i = 0; i < 300; i++) { const r = world.moveCapsule(p, { x: 0.1 * Math.cos(0.26), y: 0, z: -0.1 * Math.sin(0.26) }, DIVER); along += r.position.x - p.x; p = r.position; }
  assert.ok(along > 0.5 * 300 * 0.1 * Math.cos(0.26), `grazing slide kept only ${along.toFixed(1)} m`);
  // Into the floor-wall crease: slides along it.
  p = { x: 40, y: -73.5, z: 24 };
  const before = p.z;
  for (let i = 0; i < 200; i++) p = world.moveCapsule(p, { x: 0.08, y: -0.08, z: 0.05 }, DIVER).position;
  assert.ok(p.z - before > 3, `stuck in the crease (z moved ${(p.z - before).toFixed(2)})`);
  const route = VAULT.routes.find(r => r.id === "vault.route.squeeze")!.path;
  const diver = seek(world, route, DIVER, 3);
  assert.ok(diver.reached, "diver threads the squeeze");
  assert.ok(diver.poses.every(q => !buried(q, DIVER)));
  const creel = seek(world, route, CREEL, 4, 900);
  assert.ok(!creel.reached && creel.poses.every(q => q.x > 17), "a craft cannot enter the squeeze");
});

test("LC mouth: a craft straddling the collar edge never buries a corner in either owner", () => {
  // From open water above the seabed, down the shaft and back out, and
  // sliding along the seabed across the collar edge, through the composed world.
  const rnd = random(11);
  for (let trial = 0; trial < 120; trial++) {
    const shape = trial % 3 === 0 ? DIVER : trial % 3 === 1 ? DART : CREEL;
    let p = { x: 12 + rnd() * 40, y: -38 - rnd() * 4, z: 20 + rnd() * 40 };
    if (!world.clearance(p, shape)) continue;
    for (let i = 0; i < 90; i++) {
      const d = { x: (rnd() - 0.5) * 0.6, y: -0.2 - rnd() * 0.3, z: (rnd() - 0.5) * 0.6 };
      p = world.moveCapsule(p, d, shape).position;
      // Shapes the exterior answers keep its policy (centre-sampled, unswept
      // floor, lifted by the caller): only cave-answered poses are checked
      // against both owners; cave rock is checked always.
      const cave = world.caveAt(actorBox(p, shape));
      if (!cave) {
        // As `hullFloor`: the highest seabed under the footprint's nine points.
        let g = -Infinity;
        for (const q of boxSamples(p, shape)) g = Math.max(g, vaultFloor(q.x, q.z));
        p = { ...p, y: Math.max(p.y, g - (shape.bottom ?? 0)) };
      }
      const b = cave ? buried(p, shape) : boxSamples(p, shape).find(q => cave !== null && solidAt(q)) ??
        boxSamples(p, shape).find(q => VAULT_OWNED(q) && solidAt(q));
      assert.equal(b, undefined, `trial ${trial}: ${JSON.stringify(shape)} buried at ${JSON.stringify(b)} near ${JSON.stringify(p)}`);
    }
  }
  // Down the shaft into the chamber with ordinary seeking.
  const down = seek(world, VAULT.routes[0]!.path, DIVER, 4);
  assert.ok(down.reached && down.poses.every(q => !buried(q, DIVER)), "down the shaft");
});

test("LC sight and support: rock blocks sight; support reads the floor below, never the roof", () => {
  assert.equal(world.lineOfSight({ x: 24, y: -71, z: 24 }, { x: 40, y: -71, z: 28 }), true);
  assert.equal(world.lineOfSight({ x: 30, y: -70, z: 20 }, { x: 38, y: -70, z: 20 }), false, "the pillar blocks sight");
  assert.equal(world.lineOfSight({ x: 40, y: -70, z: 24 }, { x: 53.5, y: -70, z: 24 }), false, "the sealed pocket is behind rock");
  assert.equal(world.lineOfSight({ x: 28, y: -70, z: 24 }, { x: 28, y: -40, z: 24 }), false, "the roof blocks sight to open water");
  assert.equal(caveSegmentClear(cave.collision, { x: 32, y: -60, z: 33 }, { x: 32, y: -42, z: 39.5 }), true, "up the shaft");
  const floor = world.supportHeight(28, 24, -72);
  assert.ok(floor > -74.6 && floor < -73.2, `floor ${floor}`);
  assert.ok(Math.abs(world.supportHeight(28, 24, -64.5) - floor) < 1e-9, "from under the roof, support is still the floor");
  assert.ok(world.supportHeight(10, 55, -40) > -46, "outside, the seabed");
  // groundHeight steps aside only in the collar.
  assert.equal(world.groundHeight(32, 40), VAULT.domain.min.y - 1);
  assert.equal(world.groundHeight(10, 55), vaultFloor(10, 55));
});

test("LC light: dark with path length through water; glow and lamp never cross rock", () => {
  const life = placeLife(cave), grid = buildLightGrid(cave, life);
  const light = (p: Vec3): number[] => [...vertexLight(grid, new Float32Array([p.x, p.y, p.z]), new Float32Array([0, 0, 0]), 0)];
  const shaft = light({ x: 32, y: -50, z: 37.5 })[0]!, chamber = light({ x: 28, y: -72, z: 22 })[0]!, side = light({ x: 9, y: -72.5, z: 11 })[0]!;
  assert.ok(shaft > chamber && chamber > side, `daylight shaft ${shaft} > chamber ${chamber} > side room ${side}`);
  assert.equal(light({ x: 53.5, y: -70, z: 24 })[0], 0, "the sealed pocket gets no daylight");
  // The glow by the east wall lights the chamber, not the sealed pocket behind it.
  const glow = (p: Vec3): number => light(p).slice(1).reduce((a, b) => a + b, 0);
  assert.ok(glow({ x: 42, y: -70, z: 24 }) > 0.2);
  assert.equal(glow({ x: 51, y: -70, z: 24 }), 0, "glow leaked through rock");
  // Lamp: the exact window walk blocks rays through rock and lights clear ones.
  const src = { collision: cave.collision, cells: cave.lattice.cells, occupancy: (i: number) => cave.collision.colliders[i] ? cave.mesh(cave.chunks.find(c => chunkIndex(cave.collision, c.cx, c.cy, c.cz) === i)!, "fine").occupancy : null };
  const win = buildWindow(src, { x: 36, y: -70, z: 24 });
  const lamp = { x: 40, y: -70, z: 24 };
  assert.equal(lampVisible(win, { x: 52, y: -70, z: 24 }, lamp), false, "lamp through the wall into the pocket");
  assert.equal(lampVisible(win, { x: 30, y: -69, z: 18 }, lamp), false, "lamp through the pillar");
  assert.equal(lampVisible(win, { x: 26, y: -70, z: 26 }, lamp), true, "lamp across open water");
  const rnd = random(3);
  let clear = 0, lit = 0, rock = 0, blocked = 0;
  for (let i = 0; i < 3000; i++) {
    const p = { x: lamp.x - 18 + rnd() * 36, y: lamp.y - 10 + rnd() * 20, z: lamp.z - 18 + rnd() * 36 };
    if (Math.hypot(p.x - lamp.x, p.y - lamp.y, p.z - lamp.z) > 22 || solidAt(p)) continue;
    // Thick rock on the segment (sampled every 0.25 m past the skin).
    let thick = 0, run = 0;
    const n = Math.ceil(Math.hypot(p.x - lamp.x, p.y - lamp.y, p.z - lamp.z) / 0.25);
    for (let s = 2; s < n; s++) { const q = { x: p.x + (lamp.x - p.x) * s / n, y: p.y + (lamp.y - p.y) * s / n, z: p.z + (lamp.z - p.z) * s / n }; run = cave.field.rock(q.x, q.y, q.z) < -0.4 ? run + 1 : 0; thick = Math.max(thick, run); }
    const visible = lampVisible(win, p, lamp);
    if (thick >= 3) { rock++; if (!visible) blocked++; }
    else if (caveSegmentClear(cave.collision, p, lamp)) { clear++; if (visible) lit++; }
  }
  assert.ok(rock > 40 && blocked === rock, `lamp through rock: ${blocked}/${rock} blocked`);
  assert.ok(clear > 300 && lit / clear > 0.95, `clear rays lit ${lit}/${clear}`);
});

test("LC bake: a decoded collider equals the live one bit for bit", () => {
  const c = cave.chunks[cave.chunks.length - 1]!, m = cave.mesh(c, "fine"), coarse = cave.mesh(c, "coarse");
  const art = (x: typeof m) => ({ positions: x.positions, normals: x.normals, colors: new Float32Array(x.positions.length / 3 * 4), light: new Float32Array(x.positions.length / 3 * 4), indices: x.indices });
  const own = cave.field.ownership;
  const buf = encodeBake({ cave: VAULT.id, sourceHash: "x", domain: VAULT.domain, chunk: 32, ground: { gx: own.gx, gz: own.gz, voxel: own.voxel, data: own.ground },
    chunks: [{ coord: c, fine: art(m), coarse: art(coarse), life: null, band: m.band, occupancy: m.occupancy! }] });
  const back = bakeChunk(readBake(buf), 0);
  const live = buildCollider("live", 0, m, m.band), baked = buildCollider("baked", 0, { positions: back.fine.positions, indices: new Uint32Array(back.fine.indices) }, back.band);
  assert.deepEqual([...baked.positions], [...live.positions]);
  assert.deepEqual([...baked.tris], [...live.tris]);
  assert.deepEqual([...back.occupancy], [...m.occupancy!]);
  void gatherTriangles;
});
