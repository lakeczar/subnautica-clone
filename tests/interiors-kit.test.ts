/** ENV-1 stage 1: the kit's recipes and the interiors' draw and byte accounting. */
import test from "node:test";
import assert from "node:assert/strict";
import { INTERIORS } from "../src/content/interiors/index.js";
import { TEMPLATES, type TemplateId } from "../src/content/interiors/templates.js";
import { interiorAccounting, MAX_INTERIOR_DRAWS, MAX_INTERIOR_FINE_BYTES, shellRecipe } from "../src/render/interiors/kit.js";
import { propRecipe } from "../src/render/interiors/props.js";
import type { MeshRecipe } from "../src/render/kit/types.js";

function bounds(m: MeshRecipe): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k]!, m.positions[i + k]!); max[k] = Math.max(max[k]!, m.positions[i + k]!);
  }
  return { min, max };
}

test("every template's fine and coarse recipe stays inside its catalogue size and fills at least 95% of it", () => {
  for (const id of Object.keys(TEMPLATES) as TemplateId[]) {
    const size = TEMPLATES[id].size, r = propRecipe(id);
    for (const [lod, mesh] of [["fine", r.fine], ["coarse", r.coarse]] as const) {
      const b = bounds(mesh), lo = [-size[0] / 2, 0, -size[2] / 2], hi = [size[0] / 2, size[1], size[2] / 2];
      for (let k = 0; k < 3; k++) {
        assert.ok(b.min[k]! >= lo[k]! - 1e-6 && b.max[k]! <= hi[k]! + 1e-6, `${id} ${lod} axis ${k}: [${b.min[k]}, ${b.max[k]}] outside [${lo[k]}, ${hi[k]}]`);
        assert.ok(b.max[k]! - b.min[k]! >= 0.95 * size[k]! - 1e-6, `${id} ${lod} axis ${k}: fills ${(b.max[k]! - b.min[k]!).toFixed(3)} of ${size[k]}`);
      }
    }
  }
});

test("recipes are deterministic: the same template and interior give the same buffers", () => {
  for (const id of Object.keys(TEMPLATES) as TemplateId[]) assert.deepEqual(propRecipe(id).fine.positions, propRecipe(id).fine.positions, id);
  for (const def of INTERIORS) assert.deepEqual(shellRecipe(def, "fine").colors, shellRecipe(def, "fine").colors, def.id);
});

test("the shell draws exactly what collides: every shell vertex lies on its pieces' boxes", () => {
  for (const def of INTERIORS) for (const lod of ["fine", "coarse"] as const) {
    const m = shellRecipe(def, lod);
    for (let i = 0; i < m.positions.length; i += 3) {
      const [x, y, z] = [m.positions[i]!, m.positions[i + 1]!, m.positions[i + 2]!], e = 1e-4;
      assert.ok(def.shell.some((s) => x >= s.min.x - e && x <= s.max.x + e && y >= s.min.y - e && y <= s.max.y + e && z >= s.min.z - e && z <= s.max.z + e),
        `${def.id} ${lod}: vertex (${x}, ${y}, ${z}) outside every piece`);
    }
  }
});

test("each interior stays within the draw and fine-geometry budget under the batching rule", () => {
  for (const def of INTERIORS) {
    const a = interiorAccounting(def);
    assert.ok(a.draws <= MAX_INTERIOR_DRAWS, `${def.id}: ${a.draws} draws (instanced ${a.instanced.join(", ")})`);
    assert.ok(a.fineBytes <= MAX_INTERIOR_FINE_BYTES, `${def.id}: ${a.fineBytes} fine bytes`);
    assert.ok(a.coarseBytes <= 0.4 * 1024 * 1024, `${def.id}: ${a.coarseBytes} coarse bytes`);
  }
  // The dormitory repeats its bunks, picture marks and bundles: each is one instanced draw.
  assert.deepEqual(interiorAccounting(INTERIORS.find((d) => d.id === "basin_dormitory")!).instanced, ["bundle", "bunk_double", "picture_mark"]);
});
