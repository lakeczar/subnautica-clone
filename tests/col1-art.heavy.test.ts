import assert from "node:assert/strict";
import test from "node:test";
import { CANOPY_ROOT_CAVES } from "../src/content/caves/canopyRootCaves.js";
import { AUTHORED_CAVE_SOURCES, caveDef, type CaveDef } from "../src/content/regions/caves.js";
import { buildCave, caveNeighbours, caveShell, caveVolume, sharedSpans, shellSeamProblems } from "../src/content/regions/caveGeometry.js";
import { CANOPY_BASIN_GROUPS, groupDef } from "../src/content/regions/caves/index.js";
import { DEEP_CAVES } from "../src/content/regions/caves/deep.js";
import { STRUCTURES } from "../src/content/regions/structures.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { VISTA_SETS } from "../src/content/vistas.js";
import type { Vec3 } from "../src/sim/types.js";
import { createLargeCave } from "../src/world/caves/large/build.js";
import { compactBiome, LC_ORIENTATION } from "../src/world/collision/biome.js";
import { artMembers, certifyOrientation, meshComponents } from "../src/world/collision/bake.js";
import { KIT_SHELL_ORIENTATION, kitShellShapes } from "../src/world/collision/caveShapes.js";
import { caveScenes, probe } from "./col1-oracle-support.js";
import { parityContradictions, probeComponents, seamGaps } from "./col1-support.js";

/** COL-1 R4/R5: every shipped and authored shape bakes, oriented by its
 * producer's provenance and certified per connected component:
 * - every kit cave in all three registries, each with its own builder
 *   (`caveDef` for `AUTHORED_CAVE_SOURCES`, `groupDef` for the Canopy and
 *   Basin groups, `buildCave` for the deep caves): 55 fine shells;
 * - every vista, POI and dish set;
 * - every Canopy chunk.
 * Probing is a cross-check here only: the occupancy the shell was meshed
 * from, per component, flags a component whose provenance is wrong at every
 * scale. Heavy only for its size (no Babylon). */

/** Every kit cave definition, by registry and builder. */
function kitDefs(): { id: string; registry: string; def: () => CaveDef }[] {
  return [
    ...AUTHORED_CAVE_SOURCES.map(s => ({ id: s.id, registry: "authored", def: () => caveDef(s.id, worldFloor) })),
    ...CANOPY_BASIN_GROUPS.map(g => ({ id: g.source.id, registry: "canopy-basin", def: () => groupDef(g, worldFloor) })),
    ...DEEP_CAVES.map(c => ({ id: c.source.id, registry: "deep", def: () => buildCave(c.source, worldFloor) })),
  ];
}
const voxelInside = (def: CaveDef) => {
  const vol = caveVolume(def), g = vol.grid;
  return (p: Vec3): boolean | null => {
    const i = Math.floor((p.x - g.origin.x) / g.voxel), j = Math.floor((p.y - g.origin.y) / g.voxel), k = Math.floor((p.z - g.origin.z) / g.voxel);
    return i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz ? null : vol.solid[i + g.nx * (j + g.ny * k)] === 1;
  };
};

test("every kit cave's fine shell, in all three registries, bakes by provenance, has no fold or flip, meets the floor (and so does its coarse shell); the cross-check agrees per component", () => {
  const list = kitDefs(), failures: string[] = [], notes: string[] = [];
  assert.equal(new Set(list.map(k => k.id)).size, 55, "55 distinct kit sources");
  let components = 0, contrary = 0, sampled = 0;
  for (const k of list) {
    try {
      const def = k.def(), shapes = kitShellShapes(def);
      if (!shapes.every(s => s.facing === KIT_SHELL_ORIENTATION.facing)) failures.push(`${k.id}: facing ${shapes.map(s => s.facing)}`);
      const sh = caveShell(def, "fine"), mesh = { positions: sh.positions, indices: Uint32Array.from(sh.indices) };
      // R6: the final mesh's own parity (no folds or flips, exact) and its seam with the floor.
      const folds = parityContradictions(mesh, 1500, 3);
      if (folds.length) failures.push(`${k.id}: ${folds.length} columns contradict the volume's parity, e.g. ${JSON.stringify(folds[0])}`);
      const f = def.replacementFootprints[0]!, spans = sharedSpans(f, caveNeighbours(def));
      const shared = (x: number, z: number): boolean => spans.some(s => s.axis === "x" ? x === s.at && z >= s.lo && z <= s.hi : z === s.at && x >= s.lo && x <= s.hi);
      const gaps = seamGaps(mesh, f, shared, worldFloor);
      if (gaps.length) failures.push(`${k.id}: ${gaps.length} seam vertices off the floor, e.g. ${JSON.stringify(gaps[0])}`);
      // The coarse shell's seam and the band lifted onto the floor (art only; no collision).
      const co = caveShell(def, "coarse"), band = def.surfaces.find(s => s.lod === "coarse")!.voxel * 1.5;
      const coarseGaps = seamGaps({ positions: co.positions, indices: Uint32Array.from(co.indices) }, f, shared, worldFloor, band);
      if (coarseGaps.length) failures.push(`${k.id} coarse: ${coarseGaps.length} seam vertices off or below the floor, e.g. ${JSON.stringify(coarseGaps[0])}`);
      for (const lod of ["fine", "coarse"] as const) failures.push(...shellSeamProblems(def, lod, worldFloor).slice(0, 1));
      const { of, count } = meshComponents(mesh);
      components += count;
      for (const row of probeComponents(mesh, of, new Int8Array(count).fill(1), voxelInside(def))) {
        sampled += row.agree + row.contrary; contrary += row.contrary;
        // A wrongly wound component is contrary at every scale on most of its probes.
        if (row.contrary > Math.max(1, (row.agree + row.contrary) * 0.05))
          failures.push(`${k.id} component ${row.component}: ${row.contrary} contrary of ${row.agree + row.contrary} (triangles ${row.examples.join(", ")})`);
        else if (row.contrary) notes.push(`${k.id} c${row.component}: ${row.contrary} of ${row.agree + row.contrary}`);
      }
    } catch (e) { failures.push(`${k.registry} ${k.id}: ${(e as Error).message.split("\n")[0]}`); }
  }
  console.log(JSON.stringify({ kitShells: list.length, components, sampled, contrary, isolatedContrary: notes, failures }));
  assert.deepEqual(failures, []);
});

test("R5-1: the three shells the probe vote refused bake, with the hub controls", () => {
  const ids = ["basin_dish_lee_vault", "divide_lintel_galleries", "meridian_terrace_crack", "hub_apron_hollow", "hub_crown_shaft"];
  for (const id of ids) {
    const k = kitDefs().find(x => x.id === id)!, def = k.def(), shapes = kitShellShapes(def);
    const sh = caveShell(def, "fine"), n = sh.indices.length / 3;
    assert.equal(shapes.reduce((t, s) => t + s.triangles, 0), n, id);
    assert.deepEqual(Array.from(new Set(certifyOrientation(id, { positions: sh.positions, indices: Uint32Array.from(sh.indices), orientation: KIT_SHELL_ORIENTATION }, false))), [1], id);
  }
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

test("every Canopy chunk bakes by LC's provenance; the field cross-checks each art component", () => {
  const cave = createLargeCave(CANOPY_ROOT_CAVES, worldFloor), failures: string[] = [];
  const chunks = cave.chunks.map(c => { const m = cave.mesh(c, "fine"); return { key: m.key, art: { positions: m.positions, indices: m.indices }, band: m.band }; });
  assert.equal(chunks.length, 90);
  // Certifies every chunk's art and band coherent with LC's provenance (throws, naming it).
  compactBiome(cave.id, cave.collision.ownership, chunks);
  const inside = (p: Vec3): boolean | null => { const d = cave.field.rock(p.x, p.y, p.z); return Number.isFinite(d) ? d < 0 : null; };
  let art = 0, components = 0;
  for (const c of chunks) {
    if (!c.art.indices.length) continue;
    art++;
    const { of, count } = meshComponents(c.art);
    components += count;
    for (const row of probeComponents(c.art, of, new Int8Array(count).fill(LC_ORIENTATION.facing), inside, 200))
      if (row.contrary > Math.max(1, (row.agree + row.contrary) * 0.05)) failures.push(`${c.key} component ${row.component}: ${row.contrary} contrary of ${row.agree + row.contrary}`);
  }
  console.log(JSON.stringify({ chunks: chunks.length, art, components, failures }));
  assert.deepEqual(failures, []);
});

test("P3-C: the Apron hollow's whole oracle scene builds (shell, validated collar) and, through LC's composer, blocks nothing the columns allow", () => {
  const { variants } = caveScenes(["hub_apron_hollow"]);
  const columns = probe(variants.columns, { poses: 3000, moves: 1000, columns: 600, sights: 400, seed: 3 });
  for (const v of ["heightfield", "shell"] as const) {
    const r = probe(variants[v], { poses: 3000, moves: 1000, columns: 600, sights: 400, seed: 3 });
    console.log(v, JSON.stringify({ clearance: r.clearance, moves: r.moves, protected: r.protected }));
    assert.equal(r.clearance.spurious, 0, `${v}: blocked without art`);
    assert.equal(r.moves.spurious, 0, `${v}: stops without art`);
    assert.equal(r.moves.endIllegal, 0, `${v}: ${JSON.stringify(r.examples.filter(e => e.kind.startsWith("new move ends")).slice(0, 3))}`);
    assert.deepEqual(r.protected.newlyBlocked.filter(id => !columns.protected.newlyBlocked.includes(id)), [], `${v}: newly blocked protected`);
    if (v === "heightfield") assert.ok(r.clearance.oldClearNewBlocked <= columns.clearance.oldClearNewBlocked, `${r.clearance.oldClearNewBlocked} vs ${columns.clearance.oldClearNewBlocked}`);
  }
});
