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
import { caveArtMinimum, caveWorldMap, CavePins } from "../src/world/caves/large/streaming.js";
import { createLargeCave } from "../src/world/caves/large/build.js";
import { WINDOW_BYTES } from "../src/world/caves/large/lampWindow.js";
import { simulate } from "./large-cave-stream-support.js";
import { chunkKey } from "../src/world/caves/large/mesh.js";
import { createResidency } from "../src/world/residency.js";
import { boxSamples, productionWorld, random, seek } from "./large-cave-support.js";

const prepared = prepareCave(S, worldFloor);
const cave = prepared.cave;
const world = productionWorld(cave);
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

/** Every distinct ArrayBuffer reachable through an object graph's own
 * properties, arrays, Maps and Sets (functions are not entered). */
function reachableBuffers(roots: readonly unknown[]): Map<ArrayBufferLike, string> {
  const seen = new Set<unknown>(), found = new Map<ArrayBufferLike, string>(), stack: [unknown, string][] = roots.map((r, i) => [r, `root${i}`]);
  while (stack.length) {
    const [v, path] = stack.pop()!;
    if (v === null || typeof v !== "object" || seen.has(v)) continue;
    seen.add(v);
    if (ArrayBuffer.isView(v)) { if (!found.has(v.buffer)) found.set(v.buffer, path); continue; }
    if (v instanceof ArrayBuffer) { if (!found.has(v)) found.set(v, path); continue; }
    if (v instanceof Map) { for (const [k, x] of v) { stack.push([k, `${path}.key`], [x, `${path}.value`]); } continue; }
    if (v instanceof Set) { for (const x of v) stack.push([x, `${path}.item`]); continue; }
    if (Array.isArray(v)) { if (v.length && typeof v[0] === "number") continue; v.forEach((x, i) => stack.push([x, `${path}[${i}]`])); continue; }
    for (const [k, x] of Object.entries(v)) stack.push([x, `${path}.${k}`]);
  }
  return found;
}

test("LC-03: every buffer a loaded cave keeps is in its accounted fixed bytes (independent enumeration)", () => {
  const loaded = loadCaveBake(S, encodeCave(prepared)), runtime = createLargeCave(S, worldFloor, loaded.layout);
  const buffers = reachableBuffers([loaded, runtime, caveWorldMap(runtime)]);
  const total = [...buffers.keys()].reduce((n, b) => n + b.byteLength, 0);
  assert.equal(total, loaded.retainedBytes, `enumerated ${total} bytes in ${buffers.size} buffers, accounted ${loaded.retainedBytes}: ` +
    JSON.stringify(loaded.retained));
  // The runtime map shares the bake's seabed lattice instead of sampling another.
  assert.equal(runtime.field.ownership.ground, loaded.collision.ownership.ground);
  assert.ok(loaded.retained.some(r => r.name === "bake" && r.bytes >= 12e6), "the decompressed bake is counted");
});

test("LC-02 with the Canopy's real chunk costs and fixed bytes: the minimum share tours clean; a 16 MiB cut after entry holds, never moves uncovered", () => {
  const loaded = loadCaveBake(S, encodeCave(prepared)), runtime = createLargeCave(S, worldFloor, loaded.layout), cm = caveWorldMap(runtime);
  const cost = (id: string) => loaded.artCost[loaded.index.get(chunkKey(cm.byId(id)!.coord))!]!;
  const fixedBytes = loaded.retainedBytes + 2 * WINDOW_BYTES, minimum = caveArtMinimum(cm, cost);
  const r = (id: string) => S.routes.find(x => x.id === id)!.path;
  const tour = [...r("canopy_roots.route.craft_loop").slice(0, 9), ...r("canopy_roots.route.pool_spur"), ...[...r("canopy_roots.route.pool_spur")].reverse(),
    ...r("canopy_roots.route.west_loop")];
  const run = (o: Partial<Parameters<typeof simulate>[0]>) => simulate({ cm, cost, budgetBytes: fixedBytes + minimum, fixedBytes, path: tour, speed: 16,
    shape: CRAFT_PROFILES.small, gate: true, ...o });
  const clean = run({});
  assert.ok(clean.finished && clean.unsafeMetres === 0 && clean.heldAfterEntry === 0 && clean.cutFrames === 0, JSON.stringify(clean));
  const squeezed = run({ shareEvents: [{ frame: clean.readyFrame + 400, otherBytes: 16 * 1048576 }, { frame: clean.readyFrame + 900, otherBytes: 0 }] });
  assert.equal(squeezed.unsafeMetres, 0, squeezed.firstUnsafe);
  assert.ok(squeezed.finished && squeezed.heldAfterEntry > 0, JSON.stringify(squeezed));
  const control = run({ shareEvents: [{ frame: clean.readyFrame + 400, otherBytes: 16 * 1048576 }, { frame: clean.readyFrame + 900, otherBytes: 0 }], gate: false });
  assert.ok(control.unsafeMetres > 1, `control moved ${control.unsafeMetres.toFixed(1)} m uncovered`);
  if (process.env.LC_VERBOSE) console.log(JSON.stringify({ fixedMiB: fixedBytes / 1048576, minimumMiB: minimum / 1048576, clean, squeezed, control: control.unsafeMetres }));
});
