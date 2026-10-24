import test from "node:test";
import assert from "node:assert/strict";
import type { Scene } from "@babylonjs/core/scene.js";
import { CaveLighting, UPLOAD_BYTES_PER_FRAME, type CaveTexturePort } from "../src/render/caves/caveMaterial.js";
import type { CaveLightField } from "../src/render/caves/lightField.js";

// CW-1 R2-1: a cave's light textures are filled a slab at a time under one
// byte budget per frame, and a field is bound only once complete: activation
// never uploads synchronously, whether the field is untouched, part-filled or
// was evicted. A byte-counting port stands in for the GPU.

interface Tex { id: number; nx: number; ny: number; nz: number; channels: number; written: number; complete: boolean; disposed: boolean }
function countingPort() {
  let next = 0, frameBytes = 0, restored: (() => void) | null = null;
  const textures: Tex[] = [];
  const port: CaveTexturePort<Tex> = {
    create(nx, ny, nz, channels) { const t = { id: next++, nx, ny, nz, channels, written: 0, complete: false, disposed: false }; textures.push(t); return t; },
    write(t, _data, nx, ny, _z, dz, channels) { const b = nx * ny * dz * channels; t.written += b; frameBytes += b; },
    complete(t) { t.complete = true; },
    dispose(t) { t.disposed = true; },
    onRestored(listener) { restored = listener; },
  };
  return { port, textures, takeFrame: () => { const b = frameBytes; frameBytes = 0; return b; }, restore: () => restored?.() };
}
/** A field of n³ voxels (RGBA light, R rock): 64³ is 1 MiB of light. */
function field(id: string, n = 64): CaveLightField {
  return { caveId: id, nx: n, ny: n, nz: n, data: new Uint8Array(n * n * n * 4), min: { x: 0, y: 0, z: 0 }, size: { x: n, y: n, z: n },
    rock: { nx: n, ny: n, nz: n, data: new Uint8Array(n * n * n), min: { x: 0, y: 0, z: 0 }, voxel: 1 } } as unknown as CaveLightField;
}
const setup = () => {
  const c = countingPort();
  const lighting = new CaveLighting<Tex>({} as Scene, [], undefined, 4, c.port);
  c.takeFrame();
  return { ...c, lighting };
};
/** One frame as the cave view runs it: activation continues the fill, binds only if complete. */
const frame = (l: CaveLighting<Tex>, f: CaveLightField) => { if (!l.has(f)) l.prepare(f); l.setField(f); l.beginFrame(); };

test("activating an untouched field binds nothing that frame and writes no more than the frame budget; it binds once complete", () => {
  const { lighting, takeFrame } = setup(), f = field("a");
  lighting.beginFrame();
  frame(lighting, f);
  assert.equal(lighting.bound, null, "drawn as open water, not uploaded at once");
  assert.ok(takeFrame() <= UPLOAD_BYTES_PER_FRAME);
  let frames = 1;
  while (lighting.bound !== f && frames < 100) { frame(lighting, f); assert.ok(takeFrame() <= UPLOAD_BYTES_PER_FRAME, "one budget a frame"); frames++; }
  assert.equal(lighting.bound, f);
  const total = f.data.byteLength + f.rock.data.byteLength;
  assert.ok(frames >= Math.ceil(total / UPLOAD_BYTES_PER_FRAME), `${frames} frames for ${total} bytes`);
});

test("activating a part-filled field continues it under the budget, never the rest at once (R2-1's 1,179,648-byte case)", () => {
  const { lighting, takeFrame } = setup(), f = field("b");
  lighting.beginFrame();
  lighting.prepare(f); // the streamer's prefetch: one budget's worth
  assert.ok(takeFrame() <= UPLOAD_BYTES_PER_FRAME);
  lighting.setField(f); // activation in the same frame
  assert.equal(lighting.bound, null);
  assert.equal(takeFrame(), 0, "binding wrote nothing");
  lighting.beginFrame();
  for (let i = 0; i < 100 && lighting.bound !== f; i++) { frame(lighting, f); assert.ok(takeFrame() <= UPLOAD_BYTES_PER_FRAME); }
  assert.equal(lighting.bound, f);
});

test("a field evicted from the four-field cache refills under the budget when it is activated again", () => {
  const { lighting, takeFrame, textures } = setup();
  const fields = ["c0", "c1", "c2", "c3", "c4"].map(id => field(id, 16));
  lighting.beginFrame(Infinity);
  for (const f of fields) assert.ok(lighting.prepare(f));
  assert.ok(!lighting.has(fields[0]!), "the least recently bound is evicted");
  assert.ok(textures.filter(t => t.disposed).length >= 2);
  takeFrame();
  const big = field("d");
  lighting.beginFrame();
  frame(lighting, big);
  assert.ok(takeFrame() <= UPLOAD_BYTES_PER_FRAME);
  assert.equal(lighting.bound, null);
  lighting.beginFrame(Infinity);
  lighting.prepare(big);
  takeFrame();
  lighting.beginFrame();
  frame(lighting, fields[0]!);
  assert.ok(takeFrame() <= UPLOAD_BYTES_PER_FRAME, "the evicted field refills a budget at a time");
});

test("a context restore during a fill starts that fill over; a completed field keeps its whole data for the restore", () => {
  const { lighting, textures, restore } = setup(), f = field("e");
  lighting.beginFrame();
  lighting.prepare(f);
  restore();
  assert.equal(lighting.stats.restarts, 1);
  for (let i = 0; i < 100 && !lighting.has(f); i++) { lighting.beginFrame(); lighting.prepare(f); }
  assert.ok(lighting.has(f));
  const pair = textures.filter(t => !t.disposed && t.nx === 64);
  assert.ok(pair.every(t => t.complete), "marked complete: Babylon re-uploads it whole on a later restore");
  assert.ok(pair.some(t => t.written > 64 * 64 * 64 * 4), "the light texture was written past one full pass (restarted)");
});
