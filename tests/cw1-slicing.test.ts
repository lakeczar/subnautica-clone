import test from "node:test";
import assert from "node:assert/strict";
import { tessellate } from "../src/render/biomes/tessellate.js";
import { terrainOptions } from "../src/render/biomes/terrain.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { WORLD_ENVELOPE, CHUNK_SIZE } from "../src/world/frame.js";

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
