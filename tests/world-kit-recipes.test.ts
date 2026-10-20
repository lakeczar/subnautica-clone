// FAST TIER: kit factories are Babylon-free recipe builders.
import test from "node:test";
import assert from "node:assert/strict";
import { defaultContext, KIT_FACTORIES, terrainFactory } from "../src/render/kit/factories.js";
import { createWorldMap } from "../src/world/map.js";
import { createSliceLayout, sliceFloor } from "../src/world/sliceLayout.js";
import type { ChunkDescriptor } from "../src/world/types.js";
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

/** Top-surface vertices keyed by their exact X/Z. */
function surface(chunk: ChunkDescriptor, lod: "fine" | "coarse"): Map<string, { y: number; rgb: string }> {
  const ctx = defaultContext(sliceFloor, Infinity, () => 0, biomeAt);
  const m: MeshRecipe = drain(terrainFactory.build(ctx, chunk, { factory: "terrain" }, lod), ctx).meshes[0]!;
  const out = new Map<string, { y: number; rgb: string }>();
  const n = lod === "fine" ? 65 : 17;
  for (let v = 0; v < n * n; v++) out.set(`${m.positions[v * 3]},${m.positions[v * 3 + 2]}`, {
    y: m.positions[v * 3 + 1]!, rgb: [0, 1, 2].map(c => m.colors[v * 4 + c]!.toFixed(4)).join(","),
  });
  return out;
}

test("adjacent chunks of different biomes agree on edge heights and ground colour", () => {
  let pairs = 0;
  for (const a of layout.chunks) {
    const b = layout.chunks.find(c => c.cell.ix === a.cell.ix + 1 && c.cell.iz === a.cell.iz);
    if (!b || a.biome === b.biome) continue;
    for (const lod of ["fine", "coarse"] as const) {
      const sa = surface(a, lod), sb = surface(b, lod);
      let shared = 0;
      for (const [k, va] of sa) {
        const vb = sb.get(k);
        if (!vb) continue;
        shared++;
        assert.equal(va.y, vb.y, `${a.id}|${b.id} ${lod} height at ${k}`);
        assert.equal(va.rgb, vb.rgb, `${a.id}|${b.id} ${lod} colour at ${k}`);
      }
      assert.equal(shared, lod === "fine" ? 65 : 17, "one full shared edge");
    }
    if (++pairs >= 4) break;
  }
  assert.equal(pairs, 4, "found biome borders to check");
});

test("every kit factory keeps its steps short when the floor is expensive", () => {
  // Fake clock: each floor sample costs 0.01 ms, so a 64-row loop would take
  // tens of milliseconds without yields.
  let clock = 0;
  const floor = (x: number, z: number): number => { clock += 0.01; return sliceFloor(x, z); };
  const ctx = defaultContext(floor, 0.75, () => clock, biomeAt);
  const chunk = map.chunkAt({ x: 0, y: -10, z: 14 })!;
  const refs = [...chunk.art, { factory: "setpiece", params: { parts: 240 } }];
  for (const ref of refs) for (const lod of ["fine", "coarse"] as const) {
    const factory = KIT_FACTORIES.find(f => f.id === ref.factory)!;
    const g = factory.build(ctx, chunk, ref, lod);
    let worst = 0, steps = 0;
    for (;;) {
      ctx.startStep();
      const before = clock, r = g.next();
      worst = Math.max(worst, clock - before); steps++;
      if (r.done) break;
    }
    // One row of 67 samples is the largest unit between checks.
    assert.ok(worst <= 0.75 + 0.7, `${ref.factory}.${lod}: worst step ${worst.toFixed(2)} fake-ms over ${steps} steps`);
  }
});
