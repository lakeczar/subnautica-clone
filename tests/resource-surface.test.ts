import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { createEnvironment } from "../src/render/environment.js";
import { createExpeditionArt } from "../src/render/expedition.js";
import { createCelMaterial, createGlassMaterial } from "../src/render/materials.js";
import { createTerrainSurface, TERRAIN_GRID, WORKSHOP_DECK } from "../src/render/terrainSurface.js";
import { terrainHeight, createWorldQueries } from "../src/sim/world.js";
import { aimRay, aimedInteraction } from "../src/sim/targeting.js";
import { faceTarget, NORMAL_VIEWS, readyState } from "./targeting-support.js";
import { SOURCES } from "../src/content/registry.js";

const corrected = ["island_workshop_scraps", "island_headland_scraps", "island_glass_ledge_west"] as const;

/** Interpolate the submitted triangles, including transition fans, rather
 * than testing a second analytical approximation of the terrain generator. */
function triangleSurface(p: ArrayLike<number>, ix: ArrayLike<number>) {
  p = Float32Array.from(p); // Match the final vertex positions sent to WebGL.
  const bins = new Map<string, number[]>();
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i]! * 3, b = ix[i + 1]! * 3, c = ix[i + 2]! * 3;
    for (let x = Math.floor(Math.min(p[a]!, p[b]!, p[c]!)); x <= Math.floor(Math.max(p[a]!, p[b]!, p[c]!)); x++)
      for (let z = Math.floor(Math.min(p[a + 2]!, p[b + 2]!, p[c + 2]!)); z <= Math.floor(Math.max(p[a + 2]!, p[b + 2]!, p[c + 2]!)); z++) {
        const key = `${x},${z}`;
        if (!bins.has(key)) bins.set(key, []);
        bins.get(key)!.push(i);
      }
  }
  return (x: number, z: number): number | null => {
    for (const i of bins.get(`${Math.floor(x)},${Math.floor(z)}`) ?? []) {
      const a = ix[i]! * 3, b = ix[i + 1]! * 3, c = ix[i + 2]! * 3;
      const ax = p[a]!, az = p[a + 2]!, bx = p[b]!, bz = p[b + 2]!, cx = p[c]!, cz = p[c + 2]!;
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
      const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
      if (u >= -1e-7 && v >= -1e-7 && u + v <= 1 + 1e-7)
        return u * p[a + 1]! + v * p[b + 1]! + (1 - u - v) * p[c + 1]!;
    }
    return null;
  };
}

test("bounded render refinement tracks the physical field and joins without cracks or hidden deck overlap", () => {
  const mesh = createTerrainSurface(), p = mesh.positions, ix = mesh.indices, height = triangleSurface(p, ix);
  // Original recorded ordinary west pose: the old render was .809 m high.
  assert.ok(Math.abs(height(-14.197, -41.736)! - terrainHeight(-14.197, -41.736)) < .02);
  let samples = 0;
  for (let z = -45.8; z < -18.2; z += .17) for (let x = -23.8; x < 39.8; x += .17) {
    if (x > WORKSHOP_DECK.minX && x < WORKSHOP_DECK.maxX && z > WORKSHOP_DECK.minZ && z < WORKSHOP_DECK.maxZ) {
      assert.equal(height(x, z), null, "only the existing opaque deck covers its footprint");
    } else {
      const h = height(x, z);
      assert.notEqual(h, null, "approach has no missing render faces");
      assert.ok(Math.abs(h! - terrainHeight(x, z)) < .05, `render error at ${x},${z}`);
      samples++;
    }
  }
  assert.ok(samples > 50_000);
  assert.ok(ix.length / 3 < 170_000, "refinement remains bounded rather than multiplying the whole world");
  // An unpaired edge anywhere except the outer extent or extracted deck is a
  // crack/T-junction. Test the final topology, not just equal border heights.
  const edges = new Map<string, { a: number; b: number; count: number }>();
  for (let i = 0; i < ix.length; i += 3) for (let j = 0; j < 3; j++) {
    const a = ix[i + j]!, b = ix[i + (j + 1) % 3]!, key = `${Math.min(a, b)},${Math.max(a, b)}`;
    const edge = edges.get(key);
    if (edge) edge.count++; else edges.set(key, { a, b, count: 1 });
  }
  for (const { a, b, count } of edges.values()) {
    assert.ok(count === 1 || count === 2, "no overlapping/nonmanifold faces");
    if (count === 2) continue;
    const same = (axis: 0 | 2, v: number): boolean => Math.abs(p[a * 3 + axis]! - v) < 1e-7 && Math.abs(p[b * 3 + axis]! - v) < 1e-7;
    const within = (axis: 0 | 2, lo: number, hi: number): boolean =>
      [a, b].every(v => p[v * 3 + axis]! >= lo - 1e-7 && p[v * 3 + axis]! <= hi + 1e-7);
    assert.ok(same(0, TERRAIN_GRID.minX) || same(0, TERRAIN_GRID.minX + TERRAIN_GRID.sizeX) ||
      same(2, TERRAIN_GRID.minZ) || same(2, TERRAIN_GRID.minZ + TERRAIN_GRID.sizeZ) ||
      ((same(0, WORKSHOP_DECK.minX) || same(0, WORKSHOP_DECK.maxX)) && within(2, WORKSHOP_DECK.minZ, WORKSHOP_DECK.maxZ)) ||
      ((same(2, WORKSHOP_DECK.minZ) || same(2, WORKSHOP_DECK.maxZ)) && within(0, WORKSHOP_DECK.minX, WORKSHOP_DECK.maxX)), "no interior seam edge");
  }
  // Coarse reef and Canopy control cells retain their exact two triangles.
  for (const [x, z] of [[55, 120], [140, 40]]) {
    const g = TERRAIN_GRID, x0 = g.minX + x! / g.nx * g.sizeX, x1 = g.minX + (x! + 1) / g.nx * g.sizeX;
    const z0 = g.minZ + z! / g.nz * g.sizeZ, z1 = g.minZ + (z! + 1) / g.nz * g.sizeZ;
    const expected = new Set([[x0, z0, x0, z1, x1, z0], [x1, z0, x0, z1, x1, z1]].map(v => v.join(",")));
    for (let i = 0; i < ix.length; i += 3) {
      const coords = ix.slice(i, i + 3).flatMap(v => [p[v * 3]!, p[v * 3 + 2]!]);
      expected.delete(coords.join(","));
    }
    assert.equal(expected.size, 0, "unaffected coarse triangles are unchanged");
  }
});

test("actual source and persistent-host triangles stay supported, visible and stock-driven through replacement", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "OffscreenCanvas");
  class TextCanvas {
    width = 512; height = 128;
    getContext() { return { fillStyle: "", font: "", textAlign: "", textBaseline: "", clearRect() {}, fillRect() {}, fillText() {}, measureText(text: string) { return { width: text.length * 24 }; } }; }
  }
  Object.defineProperty(globalThis, "OffscreenCanvas", { configurable: true, value: TextCanvas });
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    scene.useRightHandedSystem = true;
    const cel = createCelMaterial(scene), glass = createGlassMaterial(scene);
    createEnvironment(scene, cel);
    const art = createExpeditionArt(scene, cel, glass), terrain = scene.getMeshByName("island.terrain")!;
    const renderHeight = triangleSurface(terrain.getVerticesData("position")!, terrain.getIndices()!);
    const height = (x: number, z: number): number => renderHeight(x, z) ?? WORKSHOP_DECK.top;
    for (const id of corrected) for (const prefix of ["source.", "source-host."]) {
      const mesh = scene.getMeshByName(prefix + id)! as Mesh;
      assert.ok(mesh && mesh.isEnabled());
      const p = mesh.getVerticesData("position")!, ix = Array.from(mesh.getIndices()!), matrix = mesh.computeWorldMatrix(true);
      if (id !== "island_glass_ledge_west") {
        const colors = mesh.getVerticesData("color")!, normals = mesh.getVerticesData("normal")!;
        let tagVertices = 0;
        for (let v = 0; v < p.length / 3; v++) if (Math.abs(colors[v * 4]! - 241 / 255) < 1e-5 && Math.abs(colors[v * 4 + 1]! - 240 / 255) < 1e-5) {
          assert.ok(normals[v * 3 + 1]! > 0, "service tags face the light above the surface");
          tagVertices++;
        }
        assert.ok(tagVertices > 0, "stock and depleted hosts retain physical service tags");
      }
      let area = 0, exposed = 0, low = Infinity, high = -Infinity;
      for (let i = 0; i < ix.length; i += 3) {
        const points = ix.slice(i, i + 3).map(v => Vector3.TransformCoordinates(Vector3.FromArray(p, v * 3), matrix));
        const [a, b, c] = points as [Vector3, Vector3, Vector3];
        const triangleArea = Vector3.Cross(b.subtract(a), c.subtract(a)).length() / 2;
        let visible = 0, count = 0;
        for (let u = 0; u < 5; u++) for (let v = 0; v < 5 - u; v++) {
          const ub = (u + 1 / 3) / 5, vb = (v + 1 / 3) / 5;
          const q = a.scale(1 - ub - vb).add(b.scale(ub)).add(c.scale(vb));
          const gap = q.y - height(q.x, q.z);
          low = Math.min(low, gap); high = Math.max(high, gap);
          if (gap > 0) visible++;
          count++;
        }
        area += triangleArea; exposed += triangleArea * visible / count;
      }
      assert.ok(exposed / area > .9, `${prefix}${id}: exposed fraction ${exposed / area}`);
      assert.ok(low > -.045, `${prefix}${id}: no buried faces (${low})`);
      assert.ok(high < .65, `${prefix}${id}: no floating/large obstruction (${high})`);
    }
    const world = createWorldQueries();
    for (const view of NORMAL_VIEWS.filter(v => v.id in SOURCES)) {
      const s = readyState(); s.player.pose.position = { ...view.position }; s.player.mode = view.mode; faceTarget(s, view.id);
      const target = aimedInteraction(s, world), ray = aimRay(s)!;
      assert.equal(target?.id, view.id, "all twenty existing target views remain valid");
      assert.ok(ray.origin.y > height(ray.origin.x, ray.origin.z));
      for (let i = 0; i <= 100; i++) {
        const t = i / 100, h = target!.host.center;
        const x = ray.origin.x * (1 - t) + h.x * t, y = ray.origin.y * (1 - t) + h.y * t, z = ray.origin.z * (1 - t) + h.z * t;
        assert.ok(y >= height(x, z) - .02, `${view.id}: target ray above actual terrain`);
      }
    }
    const s = readyState(), snapshot = structuredClone(s), counts = [scene.meshes.length, scene.materials.length, scene.geometries.length];
    for (let i = 0; i < 100; i++) {
      for (const resource of s.world.resources) if (corrected.some(id => id === resource.id)) resource.stock = i % 2 ? 0 : 1;
      art.update(s);
      for (const id of corrected) {
        assert.equal(scene.getMeshByName("source." + id)!.isEnabled(), i % 2 === 0);
        assert.equal(scene.getMeshByName("source-host." + id)!.isEnabled(), true);
      }
      assert.deepEqual([scene.meshes.length, scene.materials.length, scene.geometries.length], counts);
    }
    art.update(snapshot);
    assert.deepEqual(snapshot, readyState(), "rendering never changes state");
    for (const id of corrected) assert.equal(scene.getMeshByName("source." + id)!.isEnabled(), true);
    const meshes = [...scene.meshes]; scene.dispose();
    assert.ok(meshes.every(m => m.isDisposed()));
    assert.equal(scene.meshes.length, 0); assert.equal(scene.materials.length, 0); assert.equal(scene.geometries.length, 0);
  } finally {
    scene.dispose(); engine.dispose();
    if (previous) Object.defineProperty(globalThis, "OffscreenCanvas", previous); else Reflect.deleteProperty(globalThis, "OffscreenCanvas");
  }
});
