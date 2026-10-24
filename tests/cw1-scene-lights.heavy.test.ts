// CW-1 R2-3 and R2-5 through the real SceneLights (NullEngine): the lights
// sent for a settled pose depend only on the pose and the resident emissive
// meshes, never on the order or history in which they arrived; and the
// scanned-cluster cache is owned by live meshes, so streamed geometry that
// comes and goes leaves nothing behind.
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createSceneLights } from "../src/render/lighting/sceneLights.js";
import { createCaveCelMaterial } from "../src/render/caves/caveMaterial.js";

/** Thirteen single-vertex emissive meshes at equal distance from the origin: every score ties. */
const POINTS = [[10, 0, 0], [-10, 0, 0], [0, 10, 0], [0, -10, 0], [0, 0, 10], [0, 0, -10], [6, 8, 0], [-6, 8, 0], [6, -8, 0], [-6, -8, 0], [8, 0, 6], [-8, 0, 6], [8, 0, -6]] as const;

function world() {
  const engine = new NullEngine(), scene = new Scene(engine), cel = createCaveCelMaterial(scene);
  let sent: number[] = [];
  const target = { setArray4: (name: string, value: number[]) => { if (name === "localLightPos") sent = value.slice(); }, setFloat() {} };
  const lights = createSceneLights(scene, cel, [target as never]);
  const meshes = new Map<number, Mesh>();
  return {
    lights,
    add(i: number) {
      const m = new Mesh(`tie-${i}-${Math.random()}`, scene), [x, y, z] = POINTS[i]!;
      m.material = cel; m.setVerticesData("position", [x, y, z]); m.setVerticesData("color", [0.5, 0.2, 1, -1]); m.setIndices([0, 0, 0]); m.freezeWorldMatrix();
      meshes.set(i, m);
    },
    remove(i: number) { meshes.get(i)?.dispose(); meshes.delete(i); },
    /** Settle at `eye` and return the chosen light positions, in uniform order. */
    settle(eye: Vector3, frames = 60): string[] {
      for (let f = 0; f < frames; f++) lights.update(null, eye, 1, 0);
      const n = Math.floor(sent.length / 4), out: string[] = [];
      for (let i = 0; i < n; i++) if (sent[i * 4 + 3]! > 0) out.push(sent.slice(i * 4, i * 4 + 3).join(","));
      return out;
    },
    dispose() { lights.dispose(); scene.dispose(); engine.dispose(); },
  };
}
const ORIGIN = new Vector3(0, 0, 0);
/** Babylon announces new meshes asynchronously: let the announcements land. */
const announced = async (): Promise<void> => { for (let i = 0; i < 3; i++) await new Promise(r => setTimeout(r, 5)); };

test("R2-3: the same tied meshes announced forward, reversed or shuffled send the same lights in the same order", async () => {
  const orders = [POINTS.map((_, i) => i), POINTS.map((_, i) => POINTS.length - 1 - i), [5, 0, 12, 3, 8, 1, 10, 6, 2, 11, 4, 9, 7]];
  const results: string[][] = [];
  for (const order of orders) { const w = world(); for (const i of order) w.add(i); await announced(); results.push(w.settle(ORIGIN)); w.dispose(); }
  assert.equal(results[0]!.length, 12, "twelve of thirteen tied lights are sent");
  assert.deepEqual(results[1], results[0]);
  assert.deepEqual(results[2], results[0]);
});

test("R2-3: eviction and reconstruction, and two histories ending at the same settled pose, send the same lights", async () => {
  const fresh = world();
  for (let i = 0; i < POINTS.length; i++) fresh.add(i);
  await announced();
  const want = fresh.settle(ORIGIN);
  fresh.dispose();
  // History A: settled elsewhere, five meshes evicted and rebuilt (new geometry), back at the origin.
  const a = world();
  for (let i = 0; i < POINTS.length; i++) a.add(i);
  await announced();
  a.settle(new Vector3(30, 0, 0));
  for (const i of [0, 4, 6, 9, 12]) a.remove(i);
  a.settle(new Vector3(-30, 5, 0));
  for (const i of [12, 9, 6, 4, 0]) a.add(i);
  await announced();
  assert.deepEqual(a.settle(ORIGIN), want, "after eviction and reconstruction");
  a.dispose();
  // History B: a different path to the same pose.
  const b = world();
  for (const i of [7, 3, 11]) b.add(i);
  await announced();
  b.settle(new Vector3(0, 40, 0));
  for (let i = 0; i < POINTS.length; i++) if (![7, 3, 11].includes(i)) b.add(i);
  await announced();
  b.settle(new Vector3(0, 0, -25));
  assert.deepEqual(b.settle(ORIGIN), want, "after another history");
  b.dispose();
});

test("R2-5: the scanned-cluster cache is owned by live meshes: repeated geometry replacement leaves nothing behind, and dispose clears it", async () => {
  const w = world();
  for (let round = 0; round < 5; round++) {
    for (let i = 0; i < POINTS.length; i++) w.add(i);
    await announced();
    w.settle(ORIGIN, 30);
    assert.ok(w.lights.stats.cache.geometries >= POINTS.length, `round ${round}: ${w.lights.stats.cache.geometries} geometries cached while live`);
    for (let i = 0; i < POINTS.length; i++) w.remove(i);
    w.settle(ORIGIN, 2);
    assert.equal(w.lights.stats.known, 0);
    assert.equal(w.lights.stats.cache.geometries, 0, `round ${round}: no geometry outlives its meshes`);
    assert.equal(w.lights.stats.cache.bytes, 0);
  }
  for (let i = 0; i < 3; i++) w.add(i);
  await announced();
  w.settle(ORIGIN, 30);
  assert.ok(w.lights.stats.cache.geometries > 0);
  w.lights.dispose();
  assert.equal(w.lights.stats.cache.geometries, 0, "dispose clears the cache");
  w.dispose();
});

test("CW-1: moving meshes share one frame budget for their lights: a frame moves at most 2,048 plus 32 per moving mesh, and every light is still sent", async () => {
  const engine = new NullEngine(), scene = new Scene(engine), cel = createCaveCelMaterial(scene);
  const lights = createSceneLights(scene, cel, [{ setArray4() {}, setFloat() {} } as never]);
  // 60 moving (unfrozen) meshes of 100 emissive vertices each, one cluster per vertex: 6,000 moving lights.
  const MESHES = 60, PER = 100, meshes: Mesh[] = [];
  for (let m = 0; m < MESHES; m++) {
    const mesh = new Mesh(`mover-${m}`, scene), pos: number[] = [], col: number[] = [], idx: number[] = [];
    for (let v = 0; v < PER; v++) { pos.push(m * 4, -20, v * 8); col.push(0.4, 0.6, 1, -1); idx.push(v, v, v); }
    mesh.material = cel; mesh.setVerticesData("position", pos); mesh.setVerticesData("color", col); mesh.setIndices(idx);
    meshes.push(mesh);
  }
  await announced();
  const eye = new Vector3(120, -20, 400);
  let made = 0;
  for (let f = 0; f < 40; f++) {
    for (const m of meshes) m.position.x = f * 0.1; // they move every frame
    lights.update(null, eye, 1, 0);
    const p = lights.stats.placing;
    assert.ok(p.moved <= 2048 + 32 * p.moving, `frame ${f}: ${p.moved} lights moved for ${p.moving} moving meshes`);
    made = lights.stats.considered;
  }
  assert.equal(made, MESHES * PER, "every moving light is made and sent within a few frames");
  lights.dispose(); scene.dispose(); engine.dispose();
});

test("CW-1: moving lights refresh nearest first: a moving mesh beside the eye never lags and what is sent is current; far meshes absorb the lag", async () => {
  const engine = new NullEngine(), scene = new Scene(engine), cel = createCaveCelMaterial(scene);
  const lights = createSceneLights(scene, cel, [{ setArray4() {}, setFloat() {} } as never]);
  const mover = (name: string, x: number, z0: number, count: number): Mesh => {
    const mesh = new Mesh(name, scene), pos: number[] = [], col: number[] = [], idx: number[] = [];
    for (let v = 0; v < count; v++) { pos.push(x, -20, z0 + v * 8); col.push(0.4, 0.6, 1, -1); idx.push(v, v, v); }
    mesh.material = cel; mesh.setVerticesData("position", pos); mesh.setVerticesData("color", col); mesh.setIndices(idx);
    return mesh;
  };
  // Near: 40 lights within 6 m of the eye's line. Far: 60 meshes, 6,000 lights, 120-190 m off.
  const near = mover("near-mover", 0, 0, 40), far: Mesh[] = [];
  for (let m = 0; m < 60; m++) far.push(mover(`far-mover-${m}`, 120 + m, 0, 100));
  await announced();
  const eye = new Vector3(2, -20, 150);
  let worstNearLag = 0, sawFarLag = false;
  for (let f = 0; f < 60; f++) {
    near.position.x = Math.sin(f / 5); for (const m of far) m.position.x = f * 0.05;
    lights.update(null, eye, 1, 0);
    const p = lights.stats.placing;
    if (f > 5) {
      assert.equal(p.sentLag, 0, `frame ${f}: a sent light lagged ${p.sentLag} frames`);
      if (p.lagWorst > 0) { sawFarLag = true; assert.ok(p.lagNearest >= 110, `frame ${f}: lag at ${p.lagNearest} m (only the far meshes may lag)`); }
    }
    worstNearLag = Math.max(worstNearLag, p.lagNearest <= 6 ? p.lagWorst : 0);
  }
  assert.equal(worstNearLag, 0);
  assert.ok(sawFarLag, "the budget was exceeded, so someone had to lag: the far meshes");
  lights.dispose(); scene.dispose(); engine.dispose();
});
