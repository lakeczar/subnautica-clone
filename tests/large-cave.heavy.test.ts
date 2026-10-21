// HEAVY TIER: the whole Canopy root caves (about 30 s to build, ~0.5 GB) and
// a real NullEngine scene. Run through scripts/heavy-check.sh with
// --test-concurrency=1. Assertions compare names, counts and numbers only.
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { CANOPY_ROOT_CAVES as S } from "../src/content/caves/canopyRootCaves.js";
import { CRAFT_PROFILES } from "../src/content/regions/passages.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import type { Capsule, Vec3 } from "../src/sim/types.js";
import { actorBox } from "../src/sim/ribCollision.js";
import { encodeCave, loadCaveBake, prepareCave } from "../src/render/caves/large/pipeline.js";
import { createLargeCaveMaterial } from "../src/render/caves/large/caveMaterial.js";
import { artBytes, createCaveLoader } from "../src/render/caves/large/loader.js";
import { boxOverlapsTriangle, buildCollider, caveRockAt, chunkIndex, createCandidates, createCollision, gatherTriangles } from "../src/world/caves/large/collision.js";
import { caveWorldMap, CavePins } from "../src/world/caves/large/streaming.js";
import { chunkKey } from "../src/world/caves/large/mesh.js";
import { createResidency } from "../src/world/residency.js";
import { boxSamples, composedWith, random, seek } from "./large-cave-support.js";

const prepared = prepareCave(S, worldFloor);
const cave = prepared.cave;
const OFFSET = { x: -690, y: 0, z: 0 };
const world = composedWith(cave, worldFloor, OFFSET);
const inRock = (q: Vec3): boolean => caveRockAt(cave.collision, q);

test("Canopy craft routes: real sweeps take each admitted hull through, never into rock", () => {
  const runs: [string, Capsule, number][] = [
    ["canopy_roots.route.craft_loop", CRAFT_PROFILES.medium, 7], ["canopy_roots.route.craft_loop", CRAFT_PROFILES.small, 11],
    ["canopy_roots.route.west_loop", CRAFT_PROFILES.small, 11], ["canopy_roots.route.pool_spur", CRAFT_PROFILES.medium, 7],
  ];
  for (const [id, shape, speed] of runs) {
    const r = S.routes.find(x => x.id === id)!, run = seek(world, r.path, shape, speed, 12000);
    assert.ok(run.reached, `${id} with a ${shape.radius} m hull did not finish`);
    const bad = run.poses.flatMap(p => boxSamples(p, shape)).find(inRock);
    assert.equal(bad, undefined, `${id}: hull inside rock at ${JSON.stringify(bad)}`);
  }
});

test("Canopy coarse LOD never crosses any route's profile box", () => {
  // The coarse meshes as a collision store of their own.
  const coarse = createCollision("coarse", cave.field.ownership, S.chunk, 0, []);
  for (const c of cave.chunks) {
    const i = chunkIndex(coarse, c.cx, c.cy, c.cz), m = cave.mesh(c, "coarse");
    coarse.colliders[i] = buildCollider(chunkKey(c), i, m, null);
  }
  const cand = createCandidates();
  for (const r of S.routes) {
    const s = CRAFT_PROFILES[r.profile];
    for (let i = 1; i < r.path.length; i++) {
      const a = r.path[i - 1]!, b = r.path[i]!, n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 0.5);
      for (let k = 0; k <= n; k++) {
        const p = { x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n, z: a.z + (b.z - a.z) * k / n }, box = actorBox(p, s);
        gatherTriangles(coarse, box, cand);
        const c = { x: p.x, y: (box.min.y + box.max.y) / 2, z: p.z }, e = { x: s.radius, y: (box.max.y - box.min.y) / 2, z: s.radius };
        for (let t = 0; t < cand.count; t++)
          assert.ok(!boxOverlapsTriangle(c.x, c.y, c.z, e.x, e.y, e.z, cand.v, t * 9, 0), `${r.id}: coarse rock crosses the route near ${JSON.stringify(p)}`);
      }
    }
  }
});

test("Canopy agreement: 40,000 independent probes round every route agree with collision", () => {
  const rnd = random(23), anchors = S.routes.flatMap(r => r.path);
  let checked = 0;
  const wrong: string[] = [];
  for (let i = 0; i < 40000; i++) {
    // Uniform in a 16 m cube round a random route point: walls, floors,
    // roofs, pillars and blocks all fall inside these.
    const a = anchors[Math.floor(rnd() * anchors.length)]!;
    const p = { x: a.x + (rnd() - 0.5) * 16, y: a.y + (rnd() - 0.5) * 16, z: a.z + (rnd() - 0.5) * 16 };
    if (!cave.field.owned(p.x, p.y, p.z)) continue;
    const f = cave.field.rock(p.x, p.y, p.z);
    if (Math.abs(f) < 0.35) continue;
    checked++;
    if ((f < 0) !== inRock(p)) wrong.push(`(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) field ${f.toFixed(2)}`);
  }
  assert.ok(checked > 20000, `only ${checked} probes near the cave`);
  assert.deepEqual(wrong.slice(0, 5), []);
});

test("Canopy bake: every decoded collider equals the live one; collision never depends on art", () => {
  const loaded = loadCaveBake(S, encodeCave(prepared));
  for (const c of cave.chunks) {
    const i = chunkIndex(cave.collision, c.cx, c.cy, c.cz), live = cave.collision.colliders[i]!, baked = loaded.collision.colliders[i]!;
    assert.deepEqual([...baked.positions], [...live.positions], `chunk ${chunkKey(c)} positions`);
    assert.deepEqual([...baked.tris], [...live.tris], `chunk ${chunkKey(c)} triangles`);
  }
  // A residency over the cave map with a real NullEngine scene: build, show,
  // evict and dispose every chunk's art; sample queries answer identically.
  const engine = new NullEngine(), scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  try {
    const material = createLargeCaveMaterial(scene), cm = caveWorldMap(cave), pins = new CavePins(cm);
    const loader = createCaveLoader({ scene, material, source: { art(chunk, lod) {
      const ref = cm.byId(chunk.id)!, b = loaded.chunk(loaded.index.get(chunkKey(ref.coord))!);
      return { rock: b[lod], life: lod === "fine" ? b.life : null };
    } } });
    let t = 0;
    const residency = createResidency({ map: pins.view, loader, now: () => t, budget: { cpuBytes: 64 * 1048576, gpuBytes: 64 * 1048576 } });
    const probes: Vec3[] = S.routes.flatMap(r => r.path);
    const answer = (): string => JSON.stringify(probes.map(p => [world.supportHeight(p.x, p.z, p.y), world.clearance(p, CRAFT_PROFILES.diver),
      world.moveCapsule(p, { x: 0.7, y: -0.4, z: 0.3 }, CRAFT_PROFILES.diver).position]));
    const before = answer();
    for (const p of [...S.routes[0]!.path, ...S.routes[1]!.path]) for (let f = 0; f < 40; f++) { t += 16.7; pins.update(p); residency.update(p); }
    const stats = residency.stats!;
    assert.ok(stats.shown > 20, `only ${stats.shown} chunks shown`);
    assert.ok(stats.cpuBytes <= 64 * 1048576 && stats.gpuBytes <= 64 * 1048576, "within the byte budget");
    // Accounted bytes equal the arrays uploaded for shown and hidden units.
    const units = residency.units().filter(u => u.state === "shown" || u.state === "hidden");
    const expected = units.reduce((n, u) => {
      const b = loaded.chunk(loaded.index.get(chunkKey(cm.byId(u.chunk)!.coord))!);
      return n + artBytes(b[u.lod]) + (u.lod === "fine" && b.life ? artBytes(b.life) : 0);
    }, 0);
    assert.equal(units.reduce((n, u) => n + u.gpuBytes, 0), expected);
    assert.ok(scene.meshes.length >= stats.shown, "meshes exist for shown chunks");
    residency.dispose();
    assert.equal(scene.meshes.filter(m => m.name.startsWith("chunk:")).length, 0, "every chunk mesh disposed");
    assert.equal(answer(), before, "collision answers changed with art residency");
  } finally { scene.dispose(); engine.dispose(); }
});
