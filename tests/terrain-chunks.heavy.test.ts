import test from "node:test";
import assert from "node:assert/strict";
import { legacyTerrainFactory, legacyTerrainWhole } from "../src/render/legacyTerrain.js";
import { legacyLayout, legacyTerrainColumn } from "../src/render/legacyWorld.js";
import { createTerrainSurface, terrainGridLines } from "../src/render/terrainSurface.js";
import { defaultContext } from "../src/render/kit/factories.js";
import { createWorldMap } from "../src/world/map.js";
import { columnRect } from "../src/world/frame.js";
import { terrainHeight } from "../src/sim/world.js";
import type { MeshRecipe } from "../src/render/kit/types.js";

/** Conformance sweep (heavy by name, no Babylon): the chunked terrain is the
 * single terrain mesh, cut by triangle centroid, bit for bit. */
function triangles(m: MeshRecipe): string[] {
  const out: string[] = [];
  const vertex = (v: number): string => [...m.positions.subarray(v * 3, v * 3 + 3), ...m.normals.subarray(v * 3, v * 3 + 3),
    ...m.colors.subarray(v * 4, v * 4 + 4)].join(",");
  for (let i = 0; i < m.indices.length; i += 3) out.push([0, 1, 2].map(k => vertex(m.indices[i + k]!)).join("|"));
  return out;
}

test("every chunk of today's terrain is exactly the whole surface's triangles in that cell, with normals and colours", () => {
  const whole = legacyTerrainWhole();
  const map = createWorldMap(legacyLayout());
  const chunks = map.layout.chunks.filter(c => c.art.some(a => a.factory === legacyTerrainFactory.id));
  assert.ok(chunks.length >= 16 && chunks.every(c => legacyTerrainColumn(columnRect(c.cell.ix, c.cell.iz))));
  // Each whole-surface triangle belongs to the chunk holding its centroid;
  // compare all chunks together as one multiset of submitted triangles.
  let total = 0, steps = 0;
  const all: string[] = [];
  for (const chunk of chunks) {
    let n = 0;
    const ctx = { ...defaultContext(terrainHeight), due: () => ++n % 97 === 0 };
    const build = legacyTerrainFactory.build(ctx, chunk, chunk.art[0]!, "fine");
    let r = build.next();
    for (; !r.done; r = build.next()) steps++;
    const meshes = r.value.meshes;
    assert.ok(meshes.length <= 1);
    const list = meshes.length ? triangles(meshes[0]!) : [];
    all.push(...list);
    total += list.length;
  }
  assert.ok(steps > 1000, "chunk builds yield whenever due()");
  const reference = triangles(whole);
  assert.equal(total, reference.length, "every triangle lands in exactly one chunk");
  all.sort(); reference.sort();
  assert.ok(all.every((t, i) => t === reference[i]), "chunk triangles equal the whole surface's, bit for bit");
});

test("neighbouring chunks meet on shared vertices: every chunk-border edge is matched across the border", () => {
  const map = createWorldMap(legacyLayout());
  const edges = new Map<string, number>();
  for (const chunk of map.layout.chunks) {
    const r = legacyTerrainFactory.build({ ...defaultContext(terrainHeight), due: () => false }, chunk, chunk.art[0]!, "fine");
    let step = r.next();
    while (!step.done) step = r.next();
    const m = step.value.meshes[0];
    if (!m) continue;
    for (let i = 0; i < m.indices.length; i += 3) for (let k = 0; k < 3; k++) {
      const a = m.indices[i + k]!, b = m.indices[i + (k + 1) % 3]!;
      const key = [a, b].map(v => [...m.positions.subarray(v * 3, v * 3 + 3)].join(",")).sort().join("/");
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  // An edge used once is an open boundary. Inside the terrain extent, edges
  // are shared by two triangles whichever chunk holds each.
  const open = [...edges].filter(([, n]) => n === 1).map(([k]) => k.split("/").map(p => p.split(",").map(Number)));
  const onBorder = (x: number, z: number): boolean => Math.abs(((x + 576) / 128) - Math.round((x + 576) / 128)) < 1e-6 ||
    Math.abs(((z + 1632) / 128) - Math.round((z + 1632) / 128)) < 1e-6;
  const crack = open.filter(([a, b]) => onBorder(a![0]!, a![2]!) && onBorder(b![0]!, b![2]!) &&
    a![0]! > -94 && a![0]! < 267 && a![2]! > -470 && a![2]! < 87);
  assert.equal(crack.length, 0, `open edges on interior chunk borders: ${JSON.stringify(crack.slice(0, 3))}`);
});

test("a configured extent keeps exactly the whole surface's triangles inside it: no double draw, no gap", () => {
  const { x, z } = terrainGridLines();
  // A grid-aligned extent cutting the Basin, as a region pack might preserve.
  const extent = { minX: x[0]!, maxX: x.find(v => v > 200)!, minZ: z.find(v => v > -290)!, maxZ: z[z.length - 1]! };
  const whole = createTerrainSurface(), p = whole.positions;
  const key = (q: ArrayLike<number>, i: number, ix: ArrayLike<number>): string =>
    [0, 1, 2].map(k => [0, 1, 2].map(a => Math.fround(q[ix[i + k]! * 3 + a]!)).join(",")).join("|");
  const inside: string[] = [];
  let outside = 0;
  for (let i = 0; i < whole.indices.length; i += 3) {
    const v = [0, 1, 2].map(k => whole.indices[i + k]! * 3);
    const cx = v.reduce((n, a) => n + p[a]!, 0) / 3, cz = v.reduce((n, a) => n + p[a + 2]!, 0) / 3;
    if (cx >= extent.minX && cx < extent.maxX && cz >= extent.minZ && cz < extent.maxZ) inside.push(key(p, i, whole.indices));
    else outside++;
  }
  assert.ok(outside > 10_000, "the extent really cuts the surface");
  const got: string[] = [];
  for (const chunk of legacyLayout(extent).chunks) {
    const g = legacyTerrainFactory.build({ ...defaultContext(terrainHeight), due: () => false }, chunk, chunk.art[0]!, "fine");
    let r = g.next();
    while (!r.done) r = g.next();
    const m = r.value.meshes[0];
    if (m) for (let i = 0; i < m.indices.length; i += 3) got.push(key(m.positions, i, m.indices));
  }
  inside.sort(); got.sort();
  assert.equal(got.length, inside.length);
  assert.ok(got.every((t, i) => t === inside[i]));
});
