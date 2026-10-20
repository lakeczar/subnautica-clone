// FAST TIER: kit factories are Babylon-free recipe builders.
import test from "node:test";
import assert from "node:assert/strict";
import { defaultContext, KIT_FACTORIES, terrainFactory } from "../src/render/kit/factories.js";
import { meshBytes, splitMesh } from "../src/render/kit/recipe.js";
import { createWorldMap } from "../src/world/map.js";
import { createSliceLayout, sliceFloor } from "../src/world/sliceLayout.js";
import type { ChunkDescriptor, LodLevel } from "../src/world/types.js";
import type { MeshRecipe } from "../src/render/kit/types.js";

const layout = createSliceLayout({ setPieces: 1, parts: 120 });
const map = createWorldMap(layout);
const biomeAt = (x: number, z: number): string => {
  const r = map.regionAt({ x, y: 0, z });
  return r ? map.region(r)!.biomes[0]! : "reef_shelf";
};
const drain = <T>(g: Generator<void, T>, ctx: { startStep(): void }): T => {
  for (;;) { ctx.startStep(); const r = g.next(); if (r.done) return r.value; }
};
const cache = new Map<string, MeshRecipe>();
function terrain(chunk: ChunkDescriptor, lod: LodLevel): MeshRecipe {
  const k = `${chunk.id}@${lod}`;
  let mesh = cache.get(k);
  if (!mesh) {
    const ctx = defaultContext(sliceFloor, Infinity, () => 0, biomeAt);
    mesh = drain(terrainFactory.build(ctx, chunk, { factory: "terrain" }, lod), ctx).meshes[0]!;
    cache.set(k, mesh);
  }
  return mesh;
}
const chunk = (ix: number, iz: number): ChunkDescriptor => layout.chunks.find(c => c.cell.ix === ix && c.cell.iz === iz)!;

/** The mesh's boundary on the line `axis = value`: every triangle edge with
 * both ends on the line, which must chain into one polyline over the line's
 * vertices in order. Returns "along,y,normal,colour" per vertex. */
function boundary(m: MeshRecipe, axis: 0 | 2, value: number): string[] {
  const along = axis === 0 ? 2 : 0;
  const on = (v: number): boolean => m.positions[v * 3 + axis] === value;
  const segments = new Set<string>();
  for (let t = 0; t < m.indices.length; t += 3) {
    const tri = [m.indices[t]!, m.indices[t + 1]!, m.indices[t + 2]!];
    for (let e = 0; e < 3; e++) {
      const a = tri[e]!, b = tri[(e + 1) % 3]!;
      if (on(a) && on(b)) {
        const [lo, hi] = [m.positions[a * 3 + along]!, m.positions[b * 3 + along]!].sort((x, y) => x - y);
        segments.add(`${lo}:${hi}`);
      }
    }
  }
  const points = new Map<number, string>();
  for (let v = 0; v < m.positions.length / 3; v++) if (on(v)) {
    const p = m.positions[v * 3 + along]!;
    const desc = [p, m.positions[v * 3 + 1], ...[0, 1, 2].map(c => m.normals[v * 3 + c]!.toFixed(5)),
      ...[0, 1, 2].map(c => m.colors[v * 4 + c]!.toFixed(5))].join(",");
    assert.ok(!points.has(p) || points.get(p) === desc, `duplicate boundary vertex at ${p} disagrees`);
    points.set(p, desc);
  }
  const sorted = [...points.keys()].sort((x, y) => x - y);
  // Consecutive points are joined by exactly the boundary segments: no gap, no skip.
  assert.equal(segments.size, sorted.length - 1, "boundary is one chain");
  for (let i = 1; i < sorted.length; i++) assert.ok(segments.has(`${sorted[i - 1]}:${sorted[i]}`), `segment ${sorted[i - 1]}..${sorted[i]}`);
  return sorted.map(p => points.get(p)!);
}
const LODS: [LodLevel, LodLevel][] = [["fine", "fine"], ["fine", "coarse"], ["coarse", "fine"], ["coarse", "coarse"]];

test("REVIEW S1-02: chunk:13:7:0 (fine) and chunk:14:7:0 (coarse) share an identical edge at X=1216", () => {
  const a = chunk(13, 7), b = chunk(14, 7), x = a.bounds.max.x;
  assert.equal(x, 1216);
  for (const [la, lb] of LODS) assert.deepEqual(boundary(terrain(a, la), 0, x), boundary(terrain(b, lb), 0, x), `${la}/${lb}`);
  // The reviewer's point: the coarse edge passes through the fine samples.
  const edge = boundary(terrain(b, "coarse"), 0, x).map(d => d.split(",").map(Number));
  const at674 = edge.find(([z]) => z === -674)!;
  assert.equal(at674[1], Math.fround(sliceFloor(1216, -674)));
});

test("REVIEW S1-02: the legacy-area edge near X=92, Z=-96 is closed at every LOD pairing", () => {
  const a = chunk(5, 11), b = chunk(5, 12), z = a.bounds.max.z;
  assert.equal(z, -96);
  for (const [la, lb] of LODS) assert.deepEqual(boundary(terrain(a, la), 2, z), boundary(terrain(b, lb), 2, z), `${la}/${lb}`);
});

test("every adjacent pair of a steep band agrees on both axes for all LOD pairings", () => {
  // Rows through the rift, divide and Meridian terraces plus the legacy area.
  let pairs = 0;
  for (const c of layout.chunks.filter(c => [5, 7, 11, 12].includes(c.cell.iz) && c.cell.ix % 3 === 1)) {
    for (const [dx, dz, axis] of [[1, 0, 0], [0, 1, 2]] as const) {
      const d = layout.chunks.find(o => o.cell.ix === c.cell.ix + dx && o.cell.iz === c.cell.iz + dz);
      if (!d) continue;
      const value = axis === 0 ? c.bounds.max.x : c.bounds.max.z;
      for (const [la, lb] of LODS)
        assert.deepEqual(boundary(terrain(c, la), axis, value), boundary(terrain(d, lb), axis, value), `${c.id}|${d.id} ${la}/${lb}`);
      pairs++;
    }
  }
  assert.ok(pairs >= 20, `checked ${pairs} pairs`);
});

test("zipped coarse terrain tiles its cell exactly, with no gap or overlap", () => {
  for (const c of [chunk(13, 7), chunk(5, 11), chunk(0, 0)]) for (const lod of ["fine", "coarse"] as const) {
    const m = terrain(c, lod);
    let area = 0;
    for (let t = 0; t < m.indices.length; t += 3) {
      const [a, b, d] = [m.indices[t]!, m.indices[t + 1]!, m.indices[t + 2]!].map(v => [m.positions[v * 3]!, m.positions[v * 3 + 2]!]);
      area += Math.abs((b![0]! - a![0]!) * (d![1]! - a![1]!) - (d![0]! - a![0]!) * (b![1]! - a![1]!)) / 2;
    }
    assert.ok(Math.abs(area - 128 * 128) < 1e-6, `${c.id}@${lod} projected area ${area}`);
  }
  assert.ok(meshBytes(terrain(chunk(13, 7), "coarse")) < meshBytes(terrain(chunk(13, 7), "fine")) / 4, "coarse stays cheap");
});

test("splitMesh keeps every part under the cap and every triangle exactly once", () => {
  const m = terrain(chunk(13, 7), "fine");
  const parts = splitMesh(m, 64 * 1024);
  assert.ok(parts.length > 2);
  const tris = (r: MeshRecipe): string[] => Array.from({ length: r.indices.length / 3 }, (_, t) =>
    [0, 1, 2].map(k => { const v = r.indices[t * 3 + k]!; return `${r.positions[v * 3]},${r.positions[v * 3 + 1]},${r.positions[v * 3 + 2]}`; }).join("|"));
  for (const p of parts) assert.ok(meshBytes(p) <= 64 * 1024, `${p.name} ${meshBytes(p)} B`);
  assert.deepEqual(parts.flatMap(tris).sort(), tris(m).sort());
  assert.equal(splitMesh(m, Infinity)[0], m, "a mesh within the cap is not copied");
});

test("every kit factory keeps its steps short when the floor is expensive", () => {
  // Fake clock: each floor sample costs 0.01 ms, so a 64-row loop would take
  // tens of milliseconds without yields.
  let clock = 0;
  const floor = (x: number, z: number): number => { clock += 0.01; return sliceFloor(x, z); };
  const ctx = defaultContext(floor, 0.75, () => clock, biomeAt);
  const c = map.chunkAt({ x: 0, y: -10, z: 14 })!;
  const refs = [...c.art, { factory: "setpiece", params: { parts: 240 } }];
  for (const ref of refs) for (const lod of ["fine", "coarse"] as const) {
    const factory = KIT_FACTORIES.find(f => f.id === ref.factory)!;
    const g = factory.build(ctx, c, ref, lod);
    let worst = 0, steps = 0;
    for (;;) {
      ctx.startStep();
      const before = clock, r = g.next();
      worst = Math.max(worst, clock - before); steps++;
      if (r.done) break;
    }
    // One row of fine samples is the largest unit between checks.
    assert.ok(worst <= 0.75 + 0.7, `${ref.factory}.${lod}: worst step ${worst.toFixed(2)} fake-ms over ${steps} steps`);
  }
});

test("REVIEW R2: shared polylines stay closed across 210/330 m steps and jagged bands, both axes, every LOD pair", () => {
  const jagged = (x: number, z: number): number => -350 + .9 * x - 1.4 * z + (x >= 128 ? -210 : 0) + (z >= 128 ? 330 : 0)
    + (Math.floor(z / 7) % 2 ? 90 : -90) + (Math.floor(x / 11) % 2 ? 120 : -120);
  const built = new Map<string, MeshRecipe>();
  const get = (ix: number, iz: number, lod: LodLevel): MeshRecipe => {
    const k = `${ix}:${iz}:${lod}`;
    if (!built.has(k)) {
      const c = { id: k, cell: { ix, iz, layer: 0 }, region: "refuge_reef", biome: "reef_shelf",
        lod: { fine: 112, coarse: 400, hysteresis: 16 }, art: [],
        bounds: { min: { x: ix * 128, y: -1000, z: iz * 128 }, max: { x: (ix + 1) * 128, y: 500, z: (iz + 1) * 128 } } } as ChunkDescriptor;
      const ctx = defaultContext(jagged, Infinity, () => 0);
      built.set(k, drain(terrainFactory.build(ctx, c, { factory: "terrain" }, lod), ctx).meshes[0]!);
    }
    return built.get(k)!;
  };
  for (const [[ax, az], [bx, bz], axis] of [[[0, 0], [1, 0], 0], [[0, 0], [0, 1], 2]] as const)
    for (const [la, lb] of LODS) {
      const ea = boundary(get(ax, az, la), axis, 128), eb = boundary(get(bx, bz, lb), axis, 128);
      assert.equal(ea.length, 65);
      assert.deepEqual(ea, eb, `${axis === 0 ? "x" : "z"} edge ${la}/${lb}`);
    }
});
