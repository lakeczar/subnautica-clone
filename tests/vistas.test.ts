import assert from "node:assert/strict";
import test from "node:test";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { blocked, prewarmScatter } from "../src/render/biomes/scatter.js";
import { RecipeBuilder } from "../src/render/biomes/recipe.js";
import { VISTAS } from "../src/render/biomes/vistas.js";

/** Composed vistas add no collision, so none of their surfaces may stand in
 * the open water that scatter keeps clear: passages (with their craft's
 * height plus headroom), rescue tethers, mooring pads and structures. An
 * overhead arch may span a passage above that headroom. Every triangle is
 * sampled at 1 m or finer. */
prewarmScatter();
const build = (fine: boolean) => VISTAS.map(p => {
  const b = new RecipeBuilder();
  p.draw(b, worldFloor, fine);
  return { id: p.id, mesh: b.finish(p.id, 0.22) };
});

test("vista surfaces stay out of every passage, tether, mooring and structure keep-out", () => {
  for (const fine of [true, false]) for (const { id, mesh } of build(fine)) {
    const P = mesh.positions, I = mesh.indices;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t]! * 3, b = I[t + 1]! * 3, c = I[t + 2]! * 3;
      const len = Math.max(Math.hypot(P[a]! - P[b]!, P[a + 1]! - P[b + 1]!, P[a + 2]! - P[b + 2]!),
        Math.hypot(P[b]! - P[c]!, P[b + 1]! - P[c + 1]!, P[b + 2]! - P[c + 2]!), Math.hypot(P[a]! - P[c]!, P[a + 1]! - P[c + 1]!, P[a + 2]! - P[c + 2]!));
      const n = Math.max(1, Math.ceil(len));
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
        const u = i / n, v = j / n, w = 1 - u - v;
        const x = P[a]! * w + P[b]! * u + P[c]! * v, y = P[a + 1]! * w + P[b + 1]! * u + P[c + 1]! * v, z = P[a + 2]! * w + P[b + 2]! * u + P[c + 2]! * v;
        assert.ok(!blocked(x, z, y, 0, y), `${id} (${fine ? "fine" : "coarse"}) enters a keep-out at ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`);
      }
    }
  }
});

test("vistas are deterministic, finite, cheaper at coarse LOD and use valid cel alpha", () => {
  const a = build(true), b = build(true), coarse = build(false);
  a.forEach(({ id, mesh }, k) => {
    assert.deepEqual(mesh.positions, b[k]!.mesh.positions, `${id} differs between builds`);
    assert.ok(mesh.positions.every(Number.isFinite) && mesh.normals.every(Number.isFinite), `${id} finite`);
    for (let i = 3; i < mesh.colors.length; i += 4) assert.ok(mesh.colors[i] === -1 || mesh.colors[i]! >= 1, `${id} alpha ${mesh.colors[i]}`);
    assert.ok(coarse[k]!.mesh.positions.length <= mesh.positions.length, `${id} coarse is not cheaper`);
  });
});
