// POI-1, heavy tier (TT-1): every fifth vertex of each dish band against the drawn rim.
// tests/poi.test.ts keeps the rest and a sparser smoke.
import assert from "node:assert/strict";
import test from "node:test";
import { STRUCTURES } from "../src/content/regions/structures.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import type { Vec3 } from "../src/world/types.js";
import { RecipeBuilder } from "../src/render/biomes/recipe.js";
import { type VistaPart } from "../src/render/biomes/vistas.js";
import { LANDMARK_LIGHTS } from "../src/render/poi/landmarks.js";

type Mesh = { positions: readonly number[] | Float32Array; colors: readonly number[] | Float32Array };
const points = (m: Mesh): Vec3[] => Array.from({ length: m.positions.length / 3 }, (_, i) => ({ x: m.positions[i * 3]!, y: m.positions[i * 3 + 1]!, z: m.positions[i * 3 + 2]! }));
const drawPart = (p: VistaPart, fine: boolean): RecipeBuilder => { const b = new RecipeBuilder(); p.draw(b, worldFloor, fine); return b; };
/** Distance from `p` to a mesh's nearest triangle (closest point by sampling
 * each triangle on a 0.1 m lattice; triangles further than 3 m are skipped). */
function meshDistance(p: Vec3, m: Mesh & { indices: ArrayLike<number> }): number {
  const at = (i: number): Vec3 => ({ x: m.positions[i * 3]!, y: m.positions[i * 3 + 1]!, z: m.positions[i * 3 + 2]! });
  let best = Infinity;
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = at(m.indices[t]!), b = at(m.indices[t + 1]!), c = at(m.indices[t + 2]!);
    const span = Math.max(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), Math.hypot(b.x - c.x, b.y - c.y, b.z - c.z), Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z));
    if (Math.hypot(a.x - p.x, a.y - p.y, a.z - p.z) > span + 3) continue;
    const n = Math.max(1, Math.ceil(span / 0.15));
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
      const u = i / n, v = j / n, w = 1 - u - v;
      best = Math.min(best, Math.hypot(a.x * w + b.x * u + c.x * v - p.x, a.y * w + b.y * u + c.y * v - p.y, a.z * w + b.z * u + c.z * v - p.z));
    }
  }
  return best;
}

test("the dish bands wrap the drawn rim", async () => {
  const { structureMesh } = await import("../src/render/biomes/structures.js");
  for (const d of STRUCTURES.filter(s => s.kind === "dish")) {
    const dish = structureMesh([d], d.id, true)!, band = points(drawPart(LANDMARK_LIGHTS.find(p => p.id === `landmark.basin.${d.id}`)!, true));
    assert.ok(band.length > 0, `${d.id} has a band`);
    // Every fifth vertex of the band's tubes (0.5 m round the rim's centre line) is on the drawn rim tube.
    for (let k = 0; k < band.length; k += 5) {
      const d0 = meshDistance(band[k]!, dish);
      assert.ok(d0 < 0.6, `${d.id} band at ${band[k]!.x.toFixed(1)}, ${band[k]!.y.toFixed(1)}, ${band[k]!.z.toFixed(1)} is ${d0.toFixed(2)} m off the drawn dish`);
    }
  }
});
