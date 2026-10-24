import test from "node:test";
import assert from "node:assert/strict";
import { tessellate } from "../src/render/biomes/tessellate.js";
import { terrainOptions } from "../src/render/biomes/terrain.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { WORLD_ENVELOPE, CHUNK_SIZE } from "../src/world/frame.js";
import { createSpatialIndex } from "../src/world/spatialIndex.js";
import type { SpatialKind } from "../src/world/types.js";
import { LIGHT_RANGE, MAX_LIGHTS, lightOrder, lightScore, selectLights, type PointLight } from "../src/render/lighting/localLights.js";

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

test("light selection keeps the best slots without a score object per light, choosing and ordering exactly as a sort of every candidate by score, then by the light itself", () => {
  // The previous algorithm, as the reference.
  const reference = (lights: readonly PointLight[], eye: { x: number; y: number; z: number }, slots = MAX_LIGHTS): PointLight[] => {
    const reserved: PointLight[] = [], scored: { l: PointLight; s: number }[] = [];
    for (const l of lights) {
      if (l.reserved) { reserved.push(l); continue; }
      const d = Math.hypot(l.x - eye.x, l.y - eye.y, l.z - eye.z);
      if (d - l.radius > LIGHT_RANGE) continue;
      scored.push({ l, s: lightScore(l, eye) });
    }
    scored.sort((a, b) => b.s - a.s || lightOrder(a.l, b.l));
    reserved.sort(lightOrder);
    const kept = reserved.slice(0, slots);
    return [...kept, ...scored.slice(0, Math.max(0, slots - kept.length)).map(x => x.l)];
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

test("light selection is a pure function of the eye and the candidate set: any order of the same lights chooses and orders the same lights", () => {
  // REC-1: the same pose on the same build drew a different light set (88% of
  // a cave view's pixels), because equal scores went by mesh arrival order.
  let seed = 11;
  const rand = (): number => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const key = (l: PointLight): string => `${l.x},${l.y},${l.z},${l.radius},${l.strength}`;
  for (let round = 0; round < 30; round++) {
    // A lattice of equal lights round the eye: nearly every score ties.
    const lights: PointLight[] = [];
    for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++)
      lights.push({ x: i * 6, y: -20, z: j * 6, radius: 6, strength: 0.5, r: 1, g: 0.8, b: 0.6 });
    const eye = { x: 0, y: -20, z: 0 };
    const want = selectLights(lights, eye).map(key);
    for (let shuffle = 0; shuffle < 5; shuffle++) {
      const order = [...lights];
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j]!, order[i]!]; }
      assert.deepEqual(selectLights(order, eye).map(key), want, `round ${round}, shuffle ${shuffle}`);
    }
  }
});
