import assert from "node:assert/strict";
import test from "node:test";
import { CAVE_SOURCES } from "../src/content/regions/caves.js";
import { legacyCoverage, worldLayout } from "../src/content/regions/layout.js";
import { seededStream } from "../src/content/regions/noise.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { liveTerrain } from "../src/render/biomes/terrain.js";
import type { MeshRecipe } from "../src/render/kit/types.js";
import type { ChunkDescriptor, LodLevel } from "../src/world/types.js";
import { drain, rectOf } from "./shared-support.js";

// W2-01 (Sol R1, after CA-1's border-cuts patch): a cave footprint's edges and
// the legacy terrain extent's edges are lattice lines across the chunk that
// holds them, so the chunk across each border must cut there too. Every chunk
// a cave or the legacy extent cuts shares an identical terrain edge with all
// four neighbours, at every LOD pairing (the reviewer's border probe). The
// bake verify cannot see this: it reproduces both sides' recipes faithfully.

const layout = worldLayout();
const ctx = { floor: worldFloor, random: seededStream, due: () => false };
const touches = (f: { minX: number; maxX: number; minZ: number; maxZ: number }, r: ReturnType<typeof rectOf>): boolean =>
  f.minX <= r.maxX && f.maxX >= r.minX && f.minZ <= r.maxZ && f.maxZ >= r.minZ;
const cutChunks = layout.chunks.filter(c => CAVE_SOURCES.some(s => touches(s.footprint, rectOf(c))) || legacyCoverage(rectOf(c)) === "partial");
const memo = new Map<string, MeshRecipe[]>();
const live = (c: ChunkDescriptor, lod: LodLevel): MeshRecipe[] => {
  const k = `${c.id}|${lod}`;
  let m = memo.get(k);
  if (!m) memo.set(k, m = drain(liveTerrain(ctx, c, lod)).meshes as MeshRecipe[]);
  return m;
};
/** Along a border that is itself a pit's edge, the pit's side has no terrain
 * over the pit's span (the cave's collar meets the other side there). */
const inPitSpan = (axis: 0 | 2, at: number, u: number): boolean => CAVE_SOURCES.some(({ footprint: f }) => axis === 0
  ? (Math.abs(f.minX - at) < 1e-6 || Math.abs(f.maxX - at) < 1e-6) && u >= f.minZ - 1e-6 && u <= f.maxZ + 1e-6
  : (Math.abs(f.minZ - at) < 1e-6 || Math.abs(f.maxZ - at) < 1e-6) && u >= f.minX - 1e-6 && u <= f.maxX + 1e-6);
const edge = (meshes: readonly MeshRecipe[], axis: 0 | 2, at: number): string[] => {
  const out: string[] = [];
  for (const mesh of meshes) if (mesh.name.endsWith(".terrain"))
    for (let i = 0; i < mesh.positions.length; i += 3)
      if (Math.abs(mesh.positions[i + axis]! - at) < 1e-6 && !inPitSpan(axis, at, mesh.positions[i + (2 - axis)]!))
        out.push(`${mesh.positions[i + (2 - axis)]},${mesh.positions[i + 1]}`);
  return [...new Set(out)].sort();
};

test("every chunk a cave or the legacy extent cuts shares identical terrain edges with all four neighbours, every LOD pair", () => {
  assert.ok(cutChunks.length >= 12, `${cutChunks.length} cut chunks`);
  for (const id of CAVE_SOURCES.map(s => s.id)) assert.ok(cutChunks.some(c => touches(CAVE_SOURCES.find(s => s.id === id)!.footprint, rectOf(c))), id);
  const problems: string[] = [];
  let compared = 0;
  for (const home of cutChunks) {
    const b = home.bounds;
    const sides = [
      { n: layout.chunks.find(c => c.bounds.max.x === b.min.x && c.bounds.min.z === b.min.z), axis: 0 as const, at: b.min.x },
      { n: layout.chunks.find(c => c.bounds.min.x === b.max.x && c.bounds.min.z === b.min.z), axis: 0 as const, at: b.max.x },
      { n: layout.chunks.find(c => c.bounds.max.z === b.min.z && c.bounds.min.x === b.min.x), axis: 2 as const, at: b.min.z },
      { n: layout.chunks.find(c => c.bounds.min.z === b.max.z && c.bounds.min.x === b.min.x), axis: 2 as const, at: b.max.z },
    ];
    for (const { n, axis, at } of sides) {
      if (!n) continue;
      for (const la of ["fine", "coarse"] as const) for (const lb of ["fine", "coarse"] as const) {
        const a = edge(live(home, la), axis, at), e = edge(live(n, lb), axis, at);
        compared++;
        // A border wholly inside the legacy mesh has no S2 terrain on either side.
        if (!a.length && !e.length) continue;
        if (a.join(";") !== e.join(";"))
          problems.push(`${home.id} ${la} / ${n.id} ${lb} (${axis ? "z" : "x"} = ${at}): only here ${a.filter(v => !e.includes(v)).slice(0, 3).join(" ")}; only there ${e.filter(v => !a.includes(v)).slice(0, 3).join(" ")}`);
      }
    }
  }
  assert.ok(compared >= cutChunks.length * 8, `${compared} border pairings compared`);
  assert.deepEqual(problems.slice(0, 12), [], `${problems.length} mismatched border pairings`);
});
