import test from "node:test";
import assert from "node:assert/strict";
import { assertDisjointFootprints, CAVE_SOURCES, EXTERIOR, MIN_ROCK } from "../src/content/regions/caves.js";
import { caveShell, caveVolume } from "../src/content/regions/caveGeometry.js";
import { HUB_CAVE_SOURCES } from "../src/content/regions/hubCaves.js";
import { regionAtPoint } from "../src/content/regions/layout.js";
import { LEGACY_PRESERVE } from "../src/content/regions/terrain.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { CRAFT_PROFILES } from "../src/content/regions/passages.js";
import { caveOwner, createCaveWorldQueries, gameWorld, SOLIDS, surfaceHeight, type Solid } from "../src/sim/world.js";
import type { Vec3 } from "../src/sim/types.js";
import { aperture, DIVER, fineShell, HUB_CAVES, openings, retreat, retreatStarts, rockIndex, roofHoles, roomAt, roomGraph, SMALL,
  vertex } from "./hub-cave-support.js";

// W2: the hub's three small spur caves and the crown shaft, held to the W1
// kit's checks: rock and shell from one source, clear openings and routes in
// the game world, sound roofs, a collar on the heightfield, a lamp-off
// retreat, the medium cave's loop, and no overlap.

const world = gameWorld();
const crown = HUB_CAVES.find(d => d.id === "hub_crown_shaft")!;
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
/** Floor relief within one collar cell (0.75 m) of a point. */
function localRelief(x: number, z: number): number {
  let lo = Infinity, hi = -Infinity;
  for (let i = -3; i <= 3; i++) for (let k = -3; k <= 3; k++) {
    const h = worldFloor(x + i * 0.25, z + k * 0.25);
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  return hi - lo;
}

test("hub caves: registered beside the Fanvault, disjoint, clear of the preserve's collar band, thick rock in their own footprints", () => {
  assert.deepEqual(HUB_CAVE_SOURCES.map(s => s.id), ["hub_apron_hollow", "hub_step_arch", "hub_glimmer_crack", "hub_crown_shaft"]);
  for (const s of HUB_CAVE_SOURCES) assert.ok(CAVE_SOURCES.includes(s), `${s.id} is a cave source`);
  assert.doesNotThrow(() => assertDisjointFootprints(CAVE_SOURCES));
  const band = 2 * 4.5 + 1, P = LEGACY_PRESERVE;
  for (const def of HUB_CAVES) {
    const f = def.replacementFootprints[0]!, src = def.source;
    assert.ok(f.maxX + band <= P.minX || f.minX - band >= P.maxX || f.maxZ + band <= P.minZ || f.minZ - band >= P.maxZ,
      `${def.id}: footprint and collar band reach the legacy preserve`);
    for (const [x, z] of [[f.minX, f.minZ], [f.maxX - 1e-6, f.minZ], [f.minX, f.maxZ - 1e-6], [f.maxX - 1e-6, f.maxZ - 1e-6]] as const)
      assert.equal(regionAtPoint(x, z), def.region, `${def.id} corner ${x}, ${z}`);
    assert.ok(def.rock.length > 0 && def.rock.length < 9000, `${def.id}: ${def.rock.length} solids`);
    for (const s of def.rock) {
      for (const a of ["x", "y", "z"] as const) assert.ok(s.max[a] - s.min[a] >= MIN_ROCK - 1e-9, `${s.id} thinner than ${MIN_ROCK} m on ${a}`);
      assert.ok(s.min.x >= f.minX && s.max.x <= f.maxX && s.min.z >= f.minZ && s.max.z <= f.maxZ && s.min.y >= src.baseY && s.max.y <= src.topY,
        `${s.id} leaves its envelope`);
    }
    assert.ok(def.stats.droppedVoxels <= def.stats.rockVoxels * 0.002, `${def.id}: ${def.stats.droppedVoxels} thin voxels dropped`);
    const rooms = new Set([...def.rooms.map(r => r.id), EXTERIOR]);
    for (const p of def.portals) for (const r of p.between) assert.ok(rooms.has(r), `${p.id} names ${r}`);
    for (const r of def.rooms) assert.ok(r.bounds.max.y > r.bounds.min.y, `${r.id} carved no water`);
  }
});

test("hub caves: the shell never sits more than 0.35 m from its rock, and no cave water is inside rock", () => {
  for (const def of HUB_CAVES) {
    const rock = rockIndex(def), m = fineShell(def), f = def.replacementFootprints[0]!;
    // Within half a metre of the footprint edge the shell is the collar, held
    // to the heightfield itself by the collar test below.
    const collar = (p: Vec3): boolean => Math.min(p.x - f.minX, f.maxX - p.x, p.z - f.minZ, f.maxZ - p.z) < 0.5;
    let worst = 0, buried = 0;
    // Every vertex of a small cave; every second of the crown's large shell.
    const n = m.positions.length / 3, stride = n > 60000 ? 2 : 1;
    for (let i = 0; i < n; i += stride) {
      const p = vertex(m, i), nrm = { x: m.normals[i * 3]!, y: m.normals[i * 3 + 1]!, z: m.normals[i * 3 + 2]! };
      if (!collar(p)) worst = Math.max(worst, rock.distance(p));
      if (rock.inRock({ x: p.x + nrm.x * 0.36, y: p.y + nrm.y * 0.36, z: p.z + nrm.z * 0.36 })) buried++;
    }
    assert.ok(worst <= 0.35, `${def.id}: shell point ${worst.toFixed(3)} m outside its solids`);
    assert.ok(buried <= n / stride * 0.001, `${def.id}: ${buried} of ${n} shell points face rock within 0.36 m`);
    const v = caveVolume(def), g = v.grid;
    let cells = 0;
    for (let k = 0; k < g.nz; k++) for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
      if (!v.room[i + g.nx * (j + g.ny * k)]) continue;
      cells++;
      const p = { x: g.origin.x + (i + 0.5) * g.voxel, y: g.origin.y + (j + 0.5) * g.voxel, z: g.origin.z + (k + 0.5) * g.voxel };
      assert.ok(!rock.inRock(p), `${def.id}: room cell ${JSON.stringify(p)} is inside rock`);
    }
    assert.ok(cells > 1000, `${def.id}: ${cells} room cells`);
  }
});

test("hub caves: every opening keeps its clear size; the spur caves are diver-only, the crown shaft takes a Dart", () => {
  for (const def of HUB_CAVES) {
    const rock = rockIndex(def);
    for (const p of def.portals) for (const q of aperture(p))
      assert.ok(!rock.inRock(q), `${p.id}: rock at ${JSON.stringify(q)} inside its ${p.clear.width} x ${p.clear.height} m opening`);
    for (const m of openings(def)) {
      if (m.admits.includes("small")) { assert.ok(m.clear.width >= SMALL.radius * 2 + 1, `${m.id} is narrower than a Dart`); continue; }
      assert.ok(m.clear.width < SMALL.radius * 2, `${m.id} would admit a small hull`);
      // Diver only: the smallest hull, centred on the opening, cannot pass.
      const keel = { x: m.center.x, y: m.center.y - 1, z: m.center.z };
      const from = { x: keel.x + m.normal.x * 9, y: keel.y, z: keel.z + m.normal.z * 9 };
      assert.ok(world.moveCapsule(from, { x: -m.normal.x * 18, y: 0, z: -m.normal.z * 18 }, SMALL).hitSolid, `${m.id}: a small hull swept through`);
    }
  }
});

test("hub caves: every route sweeps clear through the game world, and a blocked mouth stops the crown's craft loop", () => {
  for (const def of HUB_CAVES) for (const r of def.routes) {
    const shape = CRAFT_PROFILES[r.profile];
    for (const p of r.path) assert.ok(world.clearance(p, shape), `${r.id}: ${r.profile} blocked at ${JSON.stringify(p)}`);
    for (let i = 1; i < r.path.length; i++) {
      const a = r.path[i - 1]!, b = r.path[i]!, move = world.moveCapsule(a, sub(b, a), shape);
      assert.ok(!move.hitSolid && !move.hitBoundary && Math.hypot(move.position.x - b.x, move.position.y - b.y, move.position.z - b.z) < 1e-6,
        `${r.id}: segment ${i} stops at ${JSON.stringify(move.position)}`);
    }
  }
  for (const def of HUB_CAVES) for (const s of def.staging) {
    const shape = CRAFT_PROFILES[s.profiles.at(-1)!], f = def.replacementFootprints[0]!;
    assert.ok(world.clearance(s.position, shape), `${s.id}: no room for a ${s.profiles.at(-1)}`);
    assert.ok(!(s.position.x > f.minX && s.position.x < f.maxX && s.position.z > f.minZ && s.position.z < f.maxZ), `${s.id} parks inside the cave`);
  }
  // Negative control: a block across the flank mouth stops the craft loop.
  const flank = crown.portals.find(p => p.id === "hub_crown_shaft.mouth.flank")!;
  const block: Solid = { id: "test.block", min: { x: flank.center.x - 6, y: flank.center.y - 4, z: flank.center.z - 1 },
    max: { x: flank.center.x + 6, y: flank.center.y + 4, z: flank.center.z + 1 } };
  const blocked = createCaveWorldQueries({ solids: [...SOLIDS, block], floor: surfaceHeight, caves: HUB_CAVES.map(caveOwner) });
  const loop = crown.routes.find(r => r.id === "hub_crown_shaft.route.craft")!.path;
  assert.ok(loop.slice(1).some((b, i) => blocked.moveCapsule(loop[i]!, sub(b, loop[i]!), SMALL).hitSolid), "a blocked mouth must stop the loop");
});

test("hub caves: roofs are sound and the collar meets the heightfield at every footprint edge", () => {
  for (const def of HUB_CAVES) {
    const holes = roofHoles(def);
    assert.equal(holes.length, 0, `${def.id}: roof holes, first ${JSON.stringify(holes[0])}`);
    const f = def.replacementFootprints[0]!, edge: [number, number, number, number][] = [];
    for (let u = f.minX + 0.5; u < f.maxX; u += 1) edge.push([u, f.minZ + 0.25, u, f.minZ - 0.25], [u, f.maxZ - 0.25, u, f.maxZ + 0.25]);
    for (let u = f.minZ + 0.5; u < f.maxZ; u += 1) edge.push([f.minX + 0.25, u, f.minX - 0.25, u], [f.maxX - 0.25, u, f.maxX + 0.25, u]);
    for (const [x, z, ox, oz] of edge) {
      const outside = worldFloor(ox, oz);
      assert.ok(outside >= def.source.baseY, `${def.id}: floor ${outside.toFixed(1)} below baseY at ${ox}, ${oz}`);
      // The spur's flanks fall 3-5 m per metre, and the adapter's collar
      // columns take the highest of nine floor samples per 0.5 m cell (a W1
      // limit), so the step is bounded by the floor's own relief right there.
      const top = world.supportHeight(x, z, 1000), relief = localRelief(x, z);
      assert.ok(Math.abs(top - outside) <= 0.75 + relief, `${def.id}: collar step ${(top - outside).toFixed(2)} m at ${x}, ${z} (relief ${relief.toFixed(2)})`);
    }
    // The art seam: every shell vertex on the footprint edge lies on the floor.
    for (const lod of ["fine", "coarse"] as const) {
      const m = caveShell(def, lod);
      for (let i = 0; i < m.positions.length / 3; i++) {
        const p = vertex(m, i);
        if (Math.abs(p.x - f.minX) > 1e-6 && Math.abs(p.x - f.maxX) > 1e-6 && Math.abs(p.z - f.minZ) > 1e-6 && Math.abs(p.z - f.maxZ) > 1e-6) continue;
        assert.ok(Math.abs(p.y - worldFloor(p.x, p.z)) < 1e-4, `${def.id} ${lod}: collar vertex ${p.y.toFixed(2)} vs floor ${worldFloor(p.x, p.z).toFixed(2)}`);
      }
    }
  }
});

test("the crown shaft is a real loop: two exits, a cycle of rooms, a Dart loop down the spiral and a diver loop up the chimney", () => {
  const graph = roomGraph(crown);
  assert.ok(graph.exits >= 2 && graph.cycle && graph.connected, JSON.stringify(graph));
  assert.deepEqual(crown.rooms.map(r => r.label), ["Crown bowl", "Spiral shaft", "Flank chamber", "Diver chimney"]);
  const craft = crown.routes.find(r => r.profile === "small" && r.role === "loop")!, diver = crown.routes.find(r => r.profile === "diver" && r.role === "loop")!;
  const roomsOn = (path: readonly Vec3[]): Set<string> => {
    const out = new Set<string>();
    for (let i = 1; i < path.length; i++) for (let s = 0; s < 8; s++) {
      const a = path[i - 1]!, b = path[i]!, t = s / 8;
      const r = roomAt(crown, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t + 0.6, z: a.z + (b.z - a.z) * t });
      if (r) out.add(r);
    }
    return out;
  };
  assert.deepEqual([...roomsOn(craft.path)].sort(), ["hub_crown_shaft.bowl", "hub_crown_shaft.flank", "hub_crown_shaft.spiral"]);
  assert.deepEqual([...roomsOn(diver.path)].sort(), ["hub_crown_shaft.bowl", "hub_crown_shaft.chimney", "hub_crown_shaft.flank"]);
  // In at the summit (48 m), out on the balcony at about 120 m.
  assert.ok(craft.path[0]!.y > -48 && craft.path.at(-1)!.y < -110, "the spiral takes a Dart from the summit down to the flank mouth");
  const flank = crown.portals.find(p => p.id === "hub_crown_shaft.mouth.flank")!;
  assert.ok(Math.abs(flank.center.y + 115) < 6, `flank mouth at ${flank.center.y}`);
  // Small and medium hulls cannot use the diver chimney.
  for (const p of crown.portals.filter(p => p.between.includes("hub_crown_shaft.chimney")))
    assert.deepEqual(p.admits, ["diver"], p.id);
});

test("ADVERSE: lamp off, a diver anywhere on a hub cave's routes swims the glow out through a mouth", () => {
  for (const def of HUB_CAVES) {
    const starts = retreatStarts(def, def.id === "hub_crown_shaft" ? 2 : 1);
    assert.ok(starts.length >= 8, `${def.id}: ${starts.length} starts`);
    const { failures, exits, hops } = retreat(def, world, starts);
    assert.deepEqual(failures.slice(0, 5), [], `${def.id}: ${failures.length} of ${starts.length} starts lost`);
    assert.ok(hops >= starts.length, `${def.id}: the retreat is a swim, not a jump`);
    if (openings(def).length >= 2) assert.ok(Object.keys(exits).length >= 2, `${def.id}: exits used ${JSON.stringify(exits)}`);
  }
});

test("negative control: with the crown shaft's mouths plugged the same retreat fails", () => {
  const plugs: Solid[] = openings(crown).map((o, i) => {
    const w = o.clear.width / 2 + 3, h = o.clear.height / 2 + 3, t = 1.5;
    const half = o.normal.y !== 0 ? { x: w, y: t, z: h } : o.normal.z !== 0 ? { x: w, y: h, z: t } : { x: t, y: h, z: w };
    return { id: `test.plug.${i}`, min: { x: o.center.x - half.x, y: o.center.y - half.y, z: o.center.z - half.z },
      max: { x: o.center.x + half.x, y: o.center.y + half.y, z: o.center.z + half.z } };
  });
  const sealed = createCaveWorldQueries({ solids: [...SOLIDS, ...plugs], floor: surfaceHeight, caves: HUB_CAVES.map(caveOwner) });
  const starts = retreatStarts(crown, 8);
  const { failures } = retreat(crown, sealed, starts);
  assert.ok(failures.length >= starts.length * 0.9, `${failures.length} of ${starts.length} still escaped a sealed cave`);
});

test("diver poses: a diver dropped in each hub cave's rooms lands on rock, never in it", () => {
  for (const def of HUB_CAVES) for (const r of def.rooms) {
    const c = { x: (r.bounds.min.x + r.bounds.max.x) / 2, z: (r.bounds.min.z + r.bounds.max.z) / 2 };
    const top = Math.min(r.bounds.max.y - 1.2, r.bounds.min.y + 3);
    if (roomAt(def, { x: c.x, y: top, z: c.z }) === "") continue; // a ring or a slanted room: its centre is rock or open water
    const floor = world.supportHeight(c.x, c.z, top);
    const drop = world.moveCapsule({ x: c.x, y: top, z: c.z }, { x: 0, y: -6, z: 0 }, DIVER);
    assert.ok(drop.hitSolid && drop.position.y >= floor - 1e-6 && floor > def.source.baseY,
      `${r.id}: the drop from ${top} ends at ${JSON.stringify(drop.position)} over support ${floor}`);
  }
});
