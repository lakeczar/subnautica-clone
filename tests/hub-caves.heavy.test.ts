import test from "node:test";
import assert from "node:assert/strict";
import { caveVolume, shellSeamProblems } from "../src/content/regions/caveGeometry.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { caveOwner, createCaveWorldQueries, gameWorld, SOLIDS, surfaceHeight, type Solid } from "../src/sim/world.js";
import type { Vec3 } from "../src/sim/types.js";
import { fineShell, HUB_CAVES, openings, retreat, retreatStarts, rockIndex, roofHoles, vertex } from "./hub-cave-support.js";

// W2's hub cave checks over every shell point, edge and retreat start (heavy
// tier, TT-1). tests/hub-caves.test.ts keeps the rest and subsampled smokes.

const world = gameWorld();
const crown = HUB_CAVES.find(d => d.id === "hub_crown_shaft")!;
/** Floor relief within one collar cell (0.75 m) of a point. */
function localRelief(x: number, z: number): number {
  let lo = Infinity, hi = -Infinity;
  for (let i = -3; i <= 3; i++) for (let k = -3; k <= 3; k++) {
    const h = worldFloor(x + i * 0.25, z + k * 0.25);
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  return hi - lo;
}

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
    // The art seam meets the floor: no open edge ends off it on a collar side
    // (where the snap must leave a vertex, the seam is closed in the side
    // plane; COL-1 R6/R7).
    for (const lod of ["fine", "coarse"] as const) assert.deepEqual(shellSeamProblems(def, lod, worldFloor), []);
  }
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
