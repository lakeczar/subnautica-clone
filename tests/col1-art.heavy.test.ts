import assert from "node:assert/strict";
import test from "node:test";
import { CANOPY_ROOT_CAVES } from "../src/content/caves/canopyRootCaves.js";
import { AUTHORED_CAVE_SOURCES, caveDef } from "../src/content/regions/caves.js";
import { STRUCTURES } from "../src/content/regions/structures.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { VISTA_SETS } from "../src/content/vistas.js";
import { createLargeCave } from "../src/world/caves/large/build.js";
import { artMembers, insideOf, meshFacing, orientationProblems } from "../src/world/collision/bake.js";
import { kitShellShapes } from "../src/world/collision/caveShapes.js";

/** COL-1 R4: every shipped shape bakes, with its own occupancy deciding
 * winding: every authored kit cave's fine shell, every vista, POI and dish
 * set, and every Canopy chunk. Heavy only for its size (no Babylon). */

test("every authored kit cave's fine shell is coherent and oriented outward by the voxel occupancy it was meshed from", () => {
  const failures: string[] = [];
  for (const s of AUTHORED_CAVE_SOURCES) {
    try {
      const shapes = kitShellShapes(caveDef(s.id, worldFloor), worldFloor);
      if (!shapes.every(x => x.facing === 1)) failures.push(`${s.id}: facing ${shapes.map(x => x.facing)}`);
    } catch (e) { failures.push(`${s.id}: ${(e as Error).message.split("\n")[0]}`); }
  }
  console.log(JSON.stringify({ kitShells: AUTHORED_CAVE_SOURCES.length, failures }));
  assert.deepEqual(failures, []);
});

test("every vista, POI and dish set bakes: closed pieces closed and coherent", () => {
  const failures: string[] = [];
  let sets = 0;
  for (const s of VISTA_SETS) { sets++; try { artMembers(`vista.${s.id}`, s.blocks, s.pieces); } catch (e) { failures.push((e as Error).message.split("\n")[0]!); } }
  for (const d of STRUCTURES.filter(x => x.dish)) { sets++; try { artMembers(d.id, d.dish!.blocks, d.dish!.pieces, d.dish!.bowl); } catch (e) { failures.push((e as Error).message.split("\n")[0]!); } }
  console.log(JSON.stringify({ sets, failures }));
  assert.ok(sets >= 30);
  assert.deepEqual(failures, []);
});

test("every Canopy chunk: art and band coherent; art oriented out of rock by the biome's field", () => {
  const cave = createLargeCave(CANOPY_ROOT_CAVES, worldFloor), failures: string[] = [];
  let art = 0, band = 0;
  for (const c of cave.chunks) {
    const m = cave.mesh(c, "fine");
    if (m.indices.length) {
      art++;
      const mesh = { positions: m.positions, indices: m.indices };
      try { if (meshFacing(m.key, mesh, insideOf((x, y, z) => cave.field.rock(x, y, z))) !== 1) failures.push(`${m.key}: faces into rock`); }
      catch (e) { failures.push((e as Error).message.split("\n")[0]!); }
    }
    if (m.band?.indices.length) { band++; failures.push(...orientationProblems(`${m.key}.band`, m.band, false)); }
  }
  console.log(JSON.stringify({ chunks: cave.chunks.length, art, band, failures }));
  assert.equal(cave.chunks.length, 90);
  assert.deepEqual(failures, []);
});
