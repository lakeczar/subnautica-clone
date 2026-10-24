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

// CW-1 R3-2: one upload scheduler. The active field is filled first, prefetch
// wishes after it, and every partial fill keeps its progress: prefetch and
// activation never cancel each other (the review's probe: 120/120 pending
// frames, 0 uploads, 15.7 MB of abandoned work).
/** A field with non-cubic dimensions (as shipped fields are). */
function box(id: string, nx: number, ny: number, nz: number): CaveLightField {
  return { caveId: id, nx, ny, nz, data: new Uint8Array(nx * ny * nz * 4), min: { x: 0, y: 0, z: 0 }, size: { x: nx, y: ny, z: nz },
    rock: { nx, ny, nz, data: new Uint8Array(nx * ny * nz), min: { x: 0, y: 0, z: 0 }, voxel: 1 } } as unknown as CaveLightField;
}
const bytesOf = (f: CaveLightField) => f.data.byteLength + f.rock.data.byteLength;

test("R3-2: a cold active field binds while a different first prefetch wish keeps its progress, through a heading change; no frame over budget", () => {
  const { lighting, takeFrame, textures } = setup();
  const active = box("active", 40, 24, 56), first = box("wish-a", 36, 30, 20), turned = box("wish-b", 28, 44, 18);
  lighting.beginFrame();
  let frames = 0;
  // Before the turn the first wish is `first`; after it, `turned` (a heading change).
  for (; lighting.bound !== active && frames < 200; frames++) {
    const order = frames < 6 ? [active, first] : [active, turned, first];
    lighting.fill(order); lighting.setField(active); lighting.beginFrame();
    assert.ok(takeFrame() <= UPLOAD_BYTES_PER_FRAME, `frame ${frames}`);
  }
  assert.equal(lighting.bound, active);
  assert.ok(frames <= Math.ceil(bytesOf(active) / UPLOAD_BYTES_PER_FRAME) + 1, `${frames} frames for ${bytesOf(active)} bytes`);
  assert.equal(textures.filter(t => t.disposed && t.nx === 40).length, 0, "the active fill was never abandoned");
  // The wishes go on from where they were, then complete.
  for (let i = 0; i < 200 && !(lighting.has(first) && lighting.has(turned)); i++) { lighting.fill([active, turned, first]); lighting.beginFrame(); takeFrame(); }
  assert.ok(lighting.has(first) && lighting.has(turned));
  assert.equal(textures.filter(t => t.disposed && (t.nx === 36 || t.nx === 28)).length, 0, "no partial wish was restarted");
});

test("R3-2: through the real cave view, a camera in hub_step_arch binds its cave while the streamer's first wish is another cave", async () => {
  const { createCaveView } = await import("../src/render/caves/caveView.js");
  const { CAVE_SOURCES } = await import("../src/content/regions/caves.js");
  const { Vector3 } = await import("@babylonjs/core/Maths/math.vector.js");
  const c = countingPort();
  const fields = new Map<string, CaveLightField>([["hub_apron_hollow", box("hub_apron_hollow", 52, 26, 40)], ["hub_step_arch", box("hub_step_arch", 44, 22, 58)], ["hub_glimmer_crack", box("hub_glimmer_crack", 30, 20, 34)]]);
  const view = createCaveView({} as Scene, [], { field: (id: string) => fields.get(id) ?? null, settled: () => true } as never, c.port as never);
  const s = CAVE_SOURCES.find(x => x.id === "hub_step_arch")!, r = s.footprint;
  const camera = new Vector3((r.minX + r.maxX) / 2, -40, (r.minZ + r.maxZ) / 2);
  const wishes = ["hub_apron_hollow", "hub_step_arch", "hub_glimmer_crack"];
  let frames = 0;
  for (; view.lightPending !== false || frames === 0; frames++) {
    if (frames > 120) break;
    view.stream(wishes, wishes); view.update(camera, new Vector3(-1, 0, 0), true);
    assert.ok(c.takeFrame() <= UPLOAD_BYTES_PER_FRAME, `frame ${frames}`);
  }
  assert.equal(view.active, "hub_step_arch");
  assert.equal(view.lightPending, false, `bound after ${frames} frames`);
  assert.ok(frames <= Math.ceil(bytesOf(fields.get("hub_step_arch")!) / UPLOAD_BYTES_PER_FRAME) + 2, `${frames} frames`);
  view.dispose();
});

test("R3-2: the byte cap holds; a plane larger than the whole budget is written alone as a frame's first write", () => {
  const { lighting, takeFrame } = setup();
  const wide = box("wide", 256, 160, 3); // a 163,840-byte light plane: over the 131,072-byte budget
  const small = box("small", 30, 30, 30);
  lighting.beginFrame();
  for (let i = 0; i < 20 && !lighting.has(wide); i++) {
    lighting.fill([wide, small]); lighting.beginFrame();
    const b = takeFrame();
    assert.ok(b <= UPLOAD_BYTES_PER_FRAME || b === 256 * 160 * 4, `frame ${i}: ${b} bytes: only one oversized plane, alone`);
  }
  assert.ok(lighting.has(wide), "an oversized plane still progresses");
  for (let i = 0; i < 100 && !lighting.has(small); i++) { lighting.fill([small]); lighting.beginFrame(); assert.ok(takeFrame() <= UPLOAD_BYTES_PER_FRAME); }
  assert.ok(lighting.has(small));
});

test("R3-3: a jump from a cached, bound cave to an uncached one reads pending for the new pose in the same update", async () => {
  const { createCaveView } = await import("../src/render/caves/caveView.js");
  const { CAVE_SOURCES } = await import("../src/content/regions/caves.js");
  const { Vector3 } = await import("@babylonjs/core/Maths/math.vector.js");
  const c = countingPort();
  // B larger than one frame's budget (60 × 40 × 30 × 5 bytes = 360,000), so it can't bind in the jump frame.
  const a = box("reef_archlet", 24, 20, 30), b = box("hub_glimmer_crack", 60, 40, 30);
  const fields = new Map([["reef_archlet", a], ["hub_glimmer_crack", b]]);
  const view = createCaveView({} as Scene, [], { field: (id: string) => fields.get(id) ?? null, settled: () => true } as never, c.port as never);
  const centre = (id: string) => { const r = CAVE_SOURCES.find(x => x.id === id)!.footprint; return new Vector3((r.minX + r.maxX) / 2, -30, (r.minZ + r.maxZ) / 2); };
  const atA = centre("reef_archlet"), atB = centre("hub_glimmer_crack"), fwd = new Vector3(0, 0, 1);
  for (let i = 0; i < 100 && (view.active !== "reef_archlet" || view.lightPending); i++) { view.stream([], []); view.update(atA, fwd, true); }
  assert.equal(view.active, "reef_archlet");
  assert.equal(view.lightPending, false, "A is lit");
  view.stream([], []); view.update(atB, fwd, true);
  assert.equal(view.active, "hub_glimmer_crack");
  assert.equal(view.lightPending, true, "the new pose's cave is cold: pending at once, not A's readiness");
  for (let i = 0; i < 100 && view.lightPending; i++) { view.stream([], []); view.update(atB, fwd, true); }
  assert.equal(view.lightPending, false);
  view.stream([], []); view.update(atA, fwd, true);
  assert.equal(view.lightPending, false, "back to A: still cached, lit at once");
  view.dispose();
});

test("R3-3: settling ends only with this pose's cave lit; at the bound an unlit cave stays dark and reports failure", async () => {
  const { settleStep } = await import("../src/render/renderer.js");
  assert.deepEqual(settleStep(0, 100, true, false), { settleSince: -1, failed: false }, "world drawn, cave lit: settled");
  assert.deepEqual(settleStep(0, 100, true, true), { settleSince: 0, failed: false }, "cave unlit: still settling");
  assert.deepEqual(settleStep(0, 5001, false, false), { settleSince: -1, failed: false }, "bound reached, world still building, no unlit cave: shown (as before)");
  assert.deepEqual(settleStep(0, 5001, true, true), { settleSince: 0, failed: true }, "bound reached with the cave unlit: dark, and failed (never shown unlit)");
});
