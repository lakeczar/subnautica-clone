import test from "node:test";
import assert from "node:assert/strict";
import { tessellate } from "../src/render/biomes/tessellate.js";
import { terrainOptions } from "../src/render/biomes/terrain.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { WORLD_ENVELOPE, CHUNK_SIZE } from "../src/world/frame.js";
import { createSpatialIndex } from "../src/world/spatialIndex.js";
import type { SpatialKind } from "../src/world/types.js";
import { LIGHT_RANGE, MAX_LIGHTS, lightScore, selectLights, type PointLight } from "../src/render/lighting/localLights.js";

// CW-1 R1 frame audit: a chunk build step overran its 2 ms slice by 37 ms
// inside one cell's error estimate (a fan of many triangles, each probing
// the floor, as one unit of work). The estimate now yields per triangle, and
// yielding never changes the result.

test("tessellation yields within a cell's error estimate: one step probes at most one triangle's worth of floor, and slicing changes nothing", () => {
  const ix = 8, iz = 14, minX = WORLD_ENVELOPE.min.x + ix * CHUNK_SIZE, minZ = WORLD_ENVELOPE.min.z + iz * CHUNK_SIZE;
  const rect = { minX, maxX: minX + CHUNK_SIZE, minZ, maxZ: minZ + CHUNK_SIZE };
  let samples = 0, most = 0;
  const counted = (x: number, z: number): number => { samples++; return worldFloor(x, z); };
  const sliced = tessellate(counted, rect, { ...terrainOptions(rect, "fine"), due: () => true });
  let r = sliced.next();
  for (; !r.done; r = sliced.next()) { most = Math.max(most, samples); samples = 0; }
  most = Math.max(most, samples);
  // A triangle: 3 corners and the probes; the previous per-cell unit reached 75 here.
  assert.ok(most <= 40, `${most} floor samples in one step`);
  const whole = tessellate(worldFloor, rect, { ...terrainOptions(rect, "fine"), due: () => false });
  let w = whole.next();
  while (!w.done) w = whole.next();
  assert.deepEqual(r.value, w.value);
});

test("light selection keeps the best slots without a score object per light, choosing and ordering exactly as a stable sort of every candidate", () => {
  // The previous algorithm, as the reference.
  const reference = (lights: readonly PointLight[], eye: { x: number; y: number; z: number }, slots = MAX_LIGHTS): PointLight[] => {
    const reserved: PointLight[] = [], scored: { l: PointLight; s: number }[] = [];
    for (const l of lights) {
      if (l.reserved) { if (reserved.length < slots) reserved.push(l); continue; }
      const d = Math.hypot(l.x - eye.x, l.y - eye.y, l.z - eye.z);
      if (d - l.radius > LIGHT_RANGE) continue;
      scored.push({ l, s: lightScore(l, eye) });
    }
    scored.sort((a, b) => b.s - a.s);
    return [...reserved, ...scored.slice(0, Math.max(0, slots - reserved.length)).map(x => x.l)];
  };
  let seed = 7;
  const rand = (): number => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let round = 0; round < 40; round++) {
    const lights: PointLight[] = Array.from({ length: 400 + round * 50 }, (_, i) => ({
      // Coarse values make exact score ties common.
      x: Math.round(rand() * 20) * 20 - 200, y: -Math.round(rand() * 5) * 10, z: Math.round(rand() * 20) * 20 - 200,
      radius: 2 + Math.round(rand() * 4) * 4, strength: 0.25 + Math.round(rand() * 3) * 0.25, r: 1, g: 1, b: 1,
      ...(i % 97 === 0 ? { reserved: true } : {}),
    }));
    const eye = { x: Math.round(rand() * 10) * 10, y: -20, z: Math.round(rand() * 10) * 10 };
    const got = selectLights(lights, eye), want = reference(lights, eye);
    // Faded copies keep position; compare by identity of the source light.
    const key = (l: PointLight): string => `${l.x},${l.y},${l.z},${l.radius},${l.reserved ? 1 : 0}`;
    assert.deepEqual(got.map(key), want.map(key), `round ${round}`);
  }
});

test("the allocation-free box query writes exactly inBox's solids, in its order, into the front of the caller's array", () => {
  const entries = Array.from({ length: 900 }, (_, i) => {
    const x = (i * 37) % 600 - 300, z = (i * 53) % 600 - 300, w = 1 + (i % 7) * 3, big = i % 150 === 0 ? 400 : 0;
    return { id: `e${i}`, kind: (i % 5 === 0 ? "light" : "solid") as SpatialKind, data: i,
      bounds: { min: { x: x - big, y: -50 + (i % 9), z: z - big }, max: { x: x + w + big, y: -40 + (i % 11), z: z + w + big } } };
  });
  const index = createSpatialIndex(entries, 16), out: number[] = [99];
  let seed = 3;
  const rand = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let q = 0; q < 300; q++) {
    const x = rand() * 700 - 350, z = rand() * 700 - 350, s = 1 + rand() * (q % 10 === 0 ? 900 : 40), y = -60 + rand() * 30;
    const box = { min: { x, y, z }, max: { x: x + s, y: y + rand() * 20, z: z + s } };
    const count = index.dataInBox(box, "solid", out);
    assert.deepEqual(out.slice(0, count), index.inBox(box, ["solid"]).map(e => e.data));
  }
});
