import assert from "node:assert/strict";
import test from "node:test";
import { worldLayout } from "../src/content/regions/layout.js";
import { STRUCTURES } from "../src/content/regions/structures.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { seededStream } from "../src/content/regions/noise.js";
import { S2_FACTORIES, S2_TEMPLATE_LIBRARY } from "../src/render/biomes/index.js";
import { structureMesh } from "../src/render/biomes/structures.js";
import { TERRAIN_EXTENT } from "../src/render/terrainSurface.js";
import { COARSE, FINE, planeDistance } from "../src/render/biomes/tessellate.js";
import { ROUTES } from "../src/content/regions/passages.js";
import { samplePath } from "../src/content/regions/access.js";
import type { ChunkBuildContext, ChunkRecipe, MeshRecipe } from "../src/render/kit/types.js";
import type { ChunkDescriptor, LodLevel } from "../src/world/types.js";

/** Babylon-free checks over S2 chunk recipes (fast tier). A representative
 * chunk per biome plus the legacy seam, Meridian walls and the Rift chimney. */
const layout = worldLayout();
const factories = new Map(S2_FACTORIES.map(f => [f.id, f] as const));
const templates = new Set(S2_TEMPLATE_LIBRARY.map(t => t.id));
const pick = (x: number, z: number): ChunkDescriptor =>
  layout.chunks.find(c => x >= c.bounds.min.x && x < c.bounds.max.x && z >= c.bounds.min.z && z < c.bounds.max.z)!;
const SAMPLE = [
  pick(470, 95), pick(1040, 48), pick(620, -200), pick(508, -572), pick(782, -520), pick(-165, -1065), pick(60, -1000),
  pick(600, -1262), pick(560, -1450), pick(1215, -1319), pick(1400, -1530), pick(1350, -700), pick(-236, -100),
  pick(300, -120), pick(-100, 0),
];

function run(chunk: ChunkDescriptor, lod: LodLevel, everyCall = false): { recipe: ChunkRecipe; yields: number } {
  let calls = 0, yields = 0;
  const ctx: ChunkBuildContext = { floor: worldFloor, random: seededStream, due: () => everyCall || ++calls % 400 === 0 };
  const meshes: MeshRecipe[] = [], instances: ChunkRecipe["instances"][number][] = [];
  for (const ref of chunk.art) {
    const g = factories.get(ref.factory)!.build(ctx, chunk, ref, lod);
    for (let r = g.next(); ; r = g.next()) { if (r.done) { meshes.push(...r.value.meshes); instances.push(...r.value.instances); break; } yields++; }
  }
  return { recipe: { meshes, instances }, yields };
}
const inLegacy = (x: number, z: number): boolean =>
  x > TERRAIN_EXTENT.minX + 1e-3 && x < TERRAIN_EXTENT.maxX - 1e-3 && z > TERRAIN_EXTENT.minZ + 1e-3 && z < TERRAIN_EXTENT.maxZ - 1e-3;

test("every chunk references registered S2 factories; full-legacy chunks carry no S2 art", () => {
  for (const c of layout.chunks) for (const ref of c.art) assert.ok(factories.has(ref.factory), `${c.id}: ${ref.factory}`);
  assert.ok(layout.chunks.some(c => c.art.length === 0), "the legacy-only columns are left to the existing renderer");
});

test("recipes are deterministic, well formed, on the floor and outside today's terrain mesh", () => {
  for (const chunk of SAMPLE) for (const lod of ["fine", "coarse"] as const) {
    const a = run(chunk, lod).recipe, b = run(chunk, lod).recipe;
    assert.equal(a.meshes.length, b.meshes.length, chunk.id);
    a.meshes.forEach((m, i) => {
      const n = b.meshes[i]!;
      assert.equal(m.name, n.name);
      assert.ok(m.positions.every((v, k) => v === n.positions[k]) && m.colors.every((v, k) => v === n.colors[k]), `${m.name} differs between builds`);
      const verts = m.positions.length / 3;
      assert.equal(m.normals.length, m.positions.length, m.name);
      assert.equal(m.colors.length, verts * 4, m.name);
      assert.ok(m.positions.every(Number.isFinite) && m.normals.every(Number.isFinite) && m.colors.every(Number.isFinite), `${m.name} finite`);
      assert.ok(m.indices.length % 3 === 0 && m.indices.every(i => i < verts), `${m.name} indices`);
      if (m.name.endsWith(".terrain")) {
        for (let v = 0; v < verts; v++) {
          const x = m.positions[v * 3]!, y = m.positions[v * 3 + 1]!, z = m.positions[v * 3 + 2]!;
          // Terrain vertices are the floor (skirt vertices sit 1.5 m below it).
          const d = worldFloor(x, z) - y;
          assert.ok(Math.abs(d) < 1e-3 || Math.abs(d - 1.5) < 1e-3, `${m.name} vertex off the floor by ${d}`);
        }
        for (let t = 0; t < m.indices.length; t += 3) {
          const cx = (m.positions[m.indices[t]! * 3]! + m.positions[m.indices[t + 1]! * 3]! + m.positions[m.indices[t + 2]! * 3]!) / 3;
          const cz = (m.positions[m.indices[t]! * 3 + 2]! + m.positions[m.indices[t + 1]! * 3 + 2]! + m.positions[m.indices[t + 2]! * 3 + 2]!) / 3;
          assert.ok(!inLegacy(cx, cz), `${m.name} draws inside the legacy terrain mesh at ${cx}, ${cz}`);
        }
        assert.ok(verts <= (lod === "fine" ? 30000 : 2000), `${m.name}: ${verts} vertices`);
      }
    });
    for (const inst of a.instances) {
      assert.ok(templates.has(inst.template), `${chunk.id}: unknown template ${inst.template}`);
      assert.equal(inst.matrices.length % 16, 0);
      if (inst.tints) assert.equal(inst.tints.length / 4, inst.matrices.length / 16);
      for (let k = 0; k < inst.matrices.length; k += 16) {
        const x = inst.matrices[k + 12]!, z = inst.matrices[k + 14]!;
        assert.ok(x >= chunk.bounds.min.x && x <= chunk.bounds.max.x && z >= chunk.bounds.min.z && z <= chunk.bounds.max.z, `${inst.template} outside ${chunk.id}`);
      }
    }
    if (lod === "coarse") {
      const fine = run(chunk, "fine").recipe;
      const count = (r: ChunkRecipe): number => r.instances.reduce((n, i) => n + i.matrices.length / 16, 0);
      assert.ok(count(a) <= count(fine), `${chunk.id}: coarse has more instances than fine`);
    }
  }
});

test("factories yield whenever due() is true", () => {
  for (const chunk of SAMPLE.slice(0, 6)) {
    const { yields } = run(chunk, "fine", true);
    assert.ok(yields >= 50, `${chunk.id}: only ${yields} yields with due() always true`);
  }
});

test("structure art stays within its colliders (plus small trim)", () => {
  for (const s of STRUCTURES) {
    if (s.kind === "dish" || s.kind === "split_chimney" || s.kind === "pier") continue; // open shells and seams, checked below
    const m = structureMesh([s], s.id, true)!;
    const lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (let i = 0; i < m.positions.length; i += 3) {
      lo.x = Math.min(lo.x, m.positions[i]!); hi.x = Math.max(hi.x, m.positions[i]!);
      lo.y = Math.min(lo.y, m.positions[i + 1]!); hi.y = Math.max(hi.y, m.positions[i + 1]!);
      lo.z = Math.min(lo.z, m.positions[i + 2]!); hi.z = Math.max(hi.z, m.positions[i + 2]!);
    }
    const sl = { x: Math.min(...s.solids.map(b => b.min.x)), y: Math.min(...s.solids.map(b => b.min.y)), z: Math.min(...s.solids.map(b => b.min.z)) };
    const sh = { x: Math.max(...s.solids.map(b => b.max.x)), y: Math.max(...s.solids.map(b => b.max.y)), z: Math.max(...s.solids.map(b => b.max.z)) };
    const trim = 1.3;
    for (const k of ["x", "y", "z"] as const)
      assert.ok(lo[k] >= sl[k] - trim && hi[k] <= sh[k] + trim, `${s.id}: art ${k} ${lo[k].toFixed(1)}..${hi[k].toFixed(1)} vs solids ${sl[k].toFixed(1)}..${sh[k].toFixed(1)}`);
  }
  // Chimney: the lit seam and rims stay within the two columns' envelope.
  const chimney = STRUCTURES.find(s => s.kind === "split_chimney")!, m = structureMesh([chimney], "c", true)!;
  for (let i = 0; i < m.positions.length; i += 3)
    assert.ok(m.positions[i]! >= -197 && m.positions[i]! <= -133 && m.positions[i + 1]! <= -299, "chimney art leaves its columns");
});

/** Terrain mesh of a chunk at a LOD, cached across tests. */
const terrainCache = new Map<string, MeshRecipe>();
function terrain(chunk: ChunkDescriptor, lod: LodLevel): MeshRecipe {
  const k = `${chunk.id}@${lod}`;
  let m = terrainCache.get(k);
  if (!m) {
    const g = factories.get("s2.terrain")!.build({ floor: worldFloor, random: seededStream, due: () => false }, chunk, { factory: "s2.terrain" }, lod);
    let r = g.next();
    while (!r.done) r = g.next();
    m = r.value.meshes.find(x => x.name.endsWith(".terrain"))!;
    terrainCache.set(k, m);
  }
  return m;
}
/** Triangles of the terrain surface, skipping the vertical legacy-seam skirts. */
function* surfaceTriangles(m: MeshRecipe): Generator<[number, number, number]> {
  const P = m.positions;
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = m.indices[i]! * 3, b = m.indices[i + 1]! * 3, c = m.indices[i + 2]! * 3;
    const flatX = Math.abs(P[a]! - P[b]!) < 1e-4 && Math.abs(P[b]! - P[c]!) < 1e-4;
    const flatZ = Math.abs(P[a + 2]! - P[b + 2]!) < 1e-4 && Math.abs(P[b + 2]! - P[c + 2]!) < 1e-4;
    if (!flatX && !flatZ) yield [a, b, c];
  }
}
/** Mesh height at (x, z), or null where the chunk has no surface there. */
function meshY(m: MeshRecipe, x: number, z: number): number | null {
  const P = m.positions;
  for (const [a, b, c] of surfaceTriangles(m)) {
    const den = (P[b + 2]! - P[c + 2]!) * (P[a]! - P[c]!) + (P[c]! - P[b]!) * (P[a + 2]! - P[c + 2]!);
    if (Math.abs(den) < 1e-10) continue;
    const u = ((P[b + 2]! - P[c + 2]!) * (x - P[c]!) + (P[c]! - P[b]!) * (z - P[c + 2]!)) / den;
    const v = ((P[c + 2]! - P[a + 2]!) * (x - P[c]!) + (P[a]! - P[c]!) * (z - P[c + 2]!)) / den;
    if (u >= -1e-6 && v >= -1e-6 && 1 - u - v >= -1e-6) return u * P[a + 1]! + v * P[b + 1]! + (1 - u - v) * P[c + 1]!;
  }
  return null;
}
// Includes the reviewer's repro chunks: the stack ramp, Meridian terraces,
// the Divide crest and brine wall, the Rift ledges and the legacy seam.
const CONFORM = [pick(453, 64), pick(470, 95), pick(1004, -1400), pick(1004, -1360), pick(1215, -1319), pick(1140, -733),
  pick(600, -1262), pick(325, -1388), pick(-165, -1065), pick(60, -1000), pick(300, -120), pick(1350, -700), pick(-236, -100)];
// Independent probes (not the tessellator's own), so between-probe misses count.
const CHECK = [[0.45, 0.45, 0.1], [0.1, 0.45, 0.45], [0.45, 0.1, 0.45], [0.8, 0.1, 0.1], [0.1, 0.8, 0.1], [0.1, 0.1, 0.8], [0.3, 0.3, 0.4]] as const;

test("terrain triangle interiors follow the shared floor within the LOD bound", () => {
  for (const chunk of CONFORM) for (const lod of ["fine", "coarse"] as const) {
    const m = terrain(chunk, lod), P = m.positions, bound = (lod === "fine" ? FINE : COARSE).tolerance * 1.5;
    let worst = 0, where = "", walkable = 0;
    for (const [a, b, c] of surfaceTriangles(m)) {
      const ux = P[b]! - P[a]!, uy = P[b + 1]! - P[a + 1]!, uz = P[b + 2]! - P[a + 2]!, vx = P[c]! - P[a]!, vy = P[c + 1]! - P[a + 1]!, vz = P[c + 2]! - P[a + 2]!;
      const ny = uz * vx - ux * vz, slope = Math.hypot(uy * vz - uz * vy, ux * vy - uy * vx) / Math.abs(ny || 1e-12);
      for (const [wa, wb, wc] of CHECK) {
        const x = P[a]! * wa + P[b]! * wb + P[c]! * wc, z = P[a + 2]! * wa + P[b + 2]! * wb + P[c + 2]! * wc;
        const y = P[a + 1]! * wa + P[b + 1]! * wb + P[c + 1]! * wc, f = worldFloor(x, z);
        const e = planeDistance(P[a]!, P[a + 1]!, P[a + 2]!, P[b]!, P[b + 1]!, P[b + 2]!, P[c]!, P[c + 1]!, P[c + 2]!, x, f, z);
        if (e > worst) { worst = e; where = `${x.toFixed(2)},${z.toFixed(2)}`; }
        // Where a walker can stand (the sim refuses steeper than 1.15), bound the vertical miss too.
        if (lod === "fine" && slope <= 1.15) walkable = Math.max(walkable, Math.abs(y - f));
      }
    }
    assert.ok(worst <= bound, `${chunk.id} ${lod}: ${worst.toFixed(3)} m from the floor at ${where} (bound ${bound})`);
    if (lod === "fine") assert.ok(walkable <= 0.4, `${chunk.id}: walkable vertical miss ${walkable.toFixed(3)} m`);
  }
});

test("the visible ground under the island walk lines is the walking surface", () => {
  for (const id of ["walk.isles.stack_ramp", "walk.isles.headland_crest"]) {
    const route = ROUTES.find(r => r.id === id)!;
    let worst = 0, count = 0;
    for (const p of samplePath(route.path.map(q => ({ ...q, y: 0 })), 0.2)) {
      const y = meshY(terrain(pick(p.x, p.z), "fine"), p.x, p.z);
      assert.ok(y !== null, `${id}: no terrain under ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
      worst = Math.max(worst, Math.abs(y - worldFloor(p.x, p.z))); count++;
    }
    assert.ok(count > 100 && worst <= 0.3, `${id}: mesh differs from the walking surface by ${worst.toFixed(3)} m`);
  }
});

test("neighbouring chunks emit identical edges at every LOD pairing", () => {
  // The reviewer's pair plus steep-band neighbours across both axes.
  const pairs: [ChunkDescriptor, ChunkDescriptor][] = [];
  for (const c of [pick(1000, -1400), pick(470, 95), pick(600, -1262), pick(-165, -1065), pick(1140, -733), pick(1215, -1319)]) {
    const east = layout.chunks.find(q => q.bounds.min.x === c.bounds.max.x && q.bounds.min.z === c.bounds.min.z);
    const north = layout.chunks.find(q => q.bounds.min.z === c.bounds.max.z && q.bounds.min.x === c.bounds.min.x);
    for (const q of [east, north]) if (q?.art.length && c.art.length) pairs.push([c, q]);
  }
  assert.ok(pairs.some(([a, b]) => a.id === "chunk:12:1:0" && b.id === "chunk:12:2:0"), "covers chunk:12:1:0 / chunk:12:2:0");
  const edge = (m: MeshRecipe, axis: "x" | "z", at: number): string[] => {
    const out: string[] = [];
    for (let i = 0; i < m.positions.length; i += 3) {
      if (Math.abs(m.positions[axis === "x" ? i : i + 2]! - at) > 1e-4) continue;
      // Skirt vertices sit 1.5 m under a surface vertex; the surface one is the edge.
      out.push(`${m.positions[i]},${m.positions[i + 1]},${m.positions[i + 2]}`);
    }
    return [...new Set(out)].sort();
  };
  for (const [a, b] of pairs) {
    const axis = b.bounds.min.x === a.bounds.max.x ? "x" : "z", at = axis === "x" ? a.bounds.max.x : a.bounds.max.z;
    for (const la of ["fine", "coarse"] as const) for (const lb of ["fine", "coarse"] as const) {
      const ea = edge(terrain(a, la), axis, at), eb = edge(terrain(b, lb), axis, at);
      assert.ok(ea.length > 1, `${a.id}: empty edge`);
      assert.deepEqual(ea, eb, `${a.id} ${la} / ${b.id} ${lb}: edge polylines differ`);
    }
  }
});
