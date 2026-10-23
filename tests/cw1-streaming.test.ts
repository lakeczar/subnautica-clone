import test from "node:test";
import assert from "node:assert/strict";
import { CAVE_SOURCES, caveDef } from "../src/content/regions/caves.js";
import { DEEP_CAVE_SOURCES } from "../src/content/regions/caves/deep.js";
import { CANOPY_BASIN_GROUPS } from "../src/content/regions/caves/index.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { CANOPY_ROOT_CAVES as S } from "../src/content/caves/canopyRootCaves.js";
import { REST_BASES } from "../src/content/bases.js";
import { caveLightField, decodeLightField, encodeLightField } from "../src/render/caves/lightField.js";
import { actorBox } from "../src/sim/ribCollision.js";
import { createGame, makeVehicle } from "../src/sim/state.js";
import { completeOpening } from "../src/sim/progression.js";
import { relocateForCave } from "../src/sim/step.js";
import { createCaveWorldQueries, createWorldQueries, gameWorld, kitCaveWorld, surfaceHeight, type Solid } from "../src/sim/world.js";
import type { Vec3 } from "../src/sim/types.js";
import { createCaveRuntime } from "../src/world/caves/admission.js";
import { decodeKitCave, decodeKitCavePack, encodeKitCave, encodeKitCavePack, insideKitCave, liveKitCave, StaleKitCavePack } from "../src/world/caves/kitCollision.js";
import { httpCaveStore } from "../src/render/caves/caveStore.js";
import { deflateSync } from "node:zlib";
import { createKitStreamer } from "../src/world/caves/kitStream.js";
import { createLargeCave } from "../src/world/caves/large/build.js";
import { CaveAdmission, CaveArbiter, caveWorldMap } from "../src/world/caves/large/streaming.js";
import type { Rect } from "../src/world/types.js";

// CW-1: every authored small and medium cave in the game, streamed. These are
// the cheap contracts; tests/cw1-caves.heavy.test.ts holds the whole world.

const DIVER = { radius: 0.34, height: 0.95 };

test("every authored cave is registered once: the Fanvault, the hub, CA-1, CA-2 and CA-3", () => {
  const ids = CAVE_SOURCES.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ["fanvault", "hub_crown_shaft", "reef_drop_cathedral", "isles_storm_arch", ...CANOPY_BASIN_GROUPS.map(g => g.source.id),
    ...DEEP_CAVE_SOURCES.map(s => s.id)]) assert.ok(ids.includes(id), `${id} is in the game`);
  assert.equal(ids.length, 5 + 18 + 12 + DEEP_CAVE_SOURCES.length);
});

test("the vertical test's premise: every cave's ground and terraces stay under its topY", () => {
  for (const s of CAVE_SOURCES) {
    const f = s.footprint;
    let hi = Math.max(-Infinity, ...s.terraces.map(t => t.level));
    for (let x = f.minX; x <= f.maxX; x += 1) for (let z = f.minZ; z <= f.maxZ; z += 1) hi = Math.max(hi, worldFloor(x, z));
    assert.ok(hi <= s.topY - 0.5, `${s.id}: ground or terrace at ${hi.toFixed(2)} against topY ${s.topY}`);
  }
});

const SOURCE_A = "a".repeat(64), SOURCE_B = "b".repeat(64);

test("bake codecs: a cave's collision record and light field decode to exactly what was generated", () => {
  const source = CAVE_SOURCES.find(s => s.id === "reef_pumphouse_undercut")!;
  const live = liveKitCave(source, worldFloor, surfaceHeight);
  const back = decodeKitCave(encodeKitCave(live));
  assert.deepEqual(back, live);
  assert.deepEqual(decodeKitCavePack(encodeKitCavePack([live, live], SOURCE_A), SOURCE_A)[1], live);
  assert.ok(live.rock.length / 6 === caveDef(source.id, worldFloor).rock.length && live.ceiling === source.topY);
  const field = caveLightField(caveDef(source.id, worldFloor), worldFloor);
  assert.deepEqual(decodeLightField(encodeLightField(field)), field);
  // The record's inside water is the cave's carved water: a route waypoint
  // inside is inside, open water above the cave is not.
  const route = source.routes[0]!.path, mid = route[Math.floor(route.length / 2)]!;
  assert.ok(insideKitCave(live, { ...mid, y: mid.y + 0.5 }), "mid-route is cave water");
  assert.ok(!insideKitCave(live, { ...mid, y: source.topY + 2 }), "above the cave is open water");
});

test("a world built from decoded records answers exactly as the game's", () => {
  const ids = ["reef_pumphouse_undercut"], baked = new Map(ids.map(id => [id, decodeKitCave(encodeKitCave(liveKitCave(CAVE_SOURCES.find(s => s.id === id)!, worldFloor, surfaceHeight)))]));
  const entries = CAVE_SOURCES.filter(s => ids.includes(s.id)).map(s => ({ id: s.id, footprint: s.footprint, baseY: s.baseY, ceiling: s.topY }));
  const live = gameWorld();
  const fromBake = kitCaveWorld({ solids: [], floor: surfaceHeight, caves: entries, records: { has: id => baked.has(id), record: id => baked.get(id)! } });
  const f = entries[0]!.footprint;
  let rng = 7;
  const next = (): number => (rng = (rng * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 400; i++) {
    const p = { x: f.minX + next() * (f.maxX - f.minX), y: -26 + next() * 14, z: f.minZ + next() * (f.maxZ - f.minZ) };
    const d = { x: (next() - 0.5) * 3, y: (next() - 0.5) * 2, z: (next() - 0.5) * 3 };
    // No exterior solid stands near the pump house, so the two rosters agree.
    assert.deepEqual(fromBake.moveCapsule(p, d, DIVER), live.moveCapsule(p, d, DIVER));
    assert.equal(fromBake.clearance(p, DIVER), live.clearance(p, DIVER));
    assert.equal(fromBake.supportHeight(p.x, p.z, p.y), live.supportHeight(p.x, p.z, p.y));
  }
});

// --- A small synthetic world for streaming and admission -------------------------

const flat = (): number => -60;
const caveAt = (id: string, x: number, z: number): { id: string; footprint: Rect; baseY: number; rock: Solid[]; ceiling: number } => ({
  id, footprint: { minX: x, maxX: x + 20, minZ: z, maxZ: z + 20 }, baseY: -80, ceiling: -40,
  rock: [{ id: `${id}.rock.0000`, min: { x, y: -80, z }, max: { x: x + 20, y: -62, z: z + 20 } }],
});
function synthetic() {
  const a = caveAt("a", 1000, -1000), b = caveAt("b", 1000, -200);
  const world = createCaveWorldQueries({ solids: [], floor: flat, caves: [a, b] });
  return { world, a, b };
}

test("streaming: clusters build ahead by heading inside 360 m, in slices; behind and far ones are evicted first", () => {
  const { world, a, b } = synthetic();
  let clock = 0;
  const streamer = createKitStreamer(world.kitCaves, new Map([[a.id, a.footprint], [b.id, b.footprint]]), { budgetMs: 1 }, () => (clock += 0.25));
  const ia = world.kitCaves.clusters.findIndex(c => c.caves.includes("a")), ib = world.kitCaves.clusters.findIndex(c => c.caves.includes("b"));
  assert.notEqual(ia, ib, "two clusters 800 m apart");
  // 500 m south of A, standing still: nothing wanted.
  assert.deepEqual(streamer.update({ x: 1010, y: -50, z: -1500 }, { x: 0, y: 0, z: 0 }).wanted, []);
  // Heading north at 16 m/s: 12 s ahead is within 360 m of A, so A is wanted now.
  let f = streamer.update({ x: 1010, y: -50, z: -1500 }, { x: 0, y: 0, z: 16 });
  assert.deepEqual(f.wanted, [ia]);
  let frames = 1;
  for (; frames < 400 && !world.kitCaves.ready(ia); frames++) streamer.update({ x: 1010, y: -50, z: -1500 }, { x: 0, y: 0, z: 16 });
  assert.ok(world.kitCaves.ready(ia) && frames > 1, `A is built before arrival, over ${frames} frames`);
  assert.equal(world.kitCaves.stats.syncBuilds, 0, "no query had to build it");
  // Past A and on toward B: A falls behind and is evicted beyond 520 m.
  f = streamer.update({ x: 1010, y: -50, z: -440 }, { x: 0, y: 0, z: 16 });
  assert.ok(f.wanted.includes(ib) && f.evicted.includes(ia), JSON.stringify(f));
  assert.ok(!world.kitCaves.ready(ia));
  // A query there now rebuilds it on the spot: same answers, counted and logged (STR-10).
  const heard: string[] = [];
  world.kitCaves.onUnsliced = f => heard.push(`${f.cause}:${f.caves.join(",")}`);
  assert.equal(world.supportHeight(1010, -990, -61.5), -62);
  assert.equal(world.kitCaves.stats.syncBuilds, 1);
  assert.deepEqual(heard, ["query:a"]);
  assert.deepEqual(world.kitCaves.unsliced.map(f => [f.cluster, f.cause]), [[ia, "query"]]);
});

test("admission: a player beside a cave whose records have not arrived is held, then admitted at once when they land", () => {
  const { world, a } = synthetic();
  let canGenerate = false;
  const rt = createCaveRuntime({ world, canGenerate: () => canGenerate, clear: () => true });
  const feet = { x: a.footprint.minX - 2, y: -55, z: a.footprint.minZ + 5 };
  const u = rt.update(actorBox(feet, DIVER), feet, feet, 0);
  assert.ok(u.holding && u.state === "loading" && u.message === "Loading cave…");
  canGenerate = true;
  const v = rt.update(actorBox(feet, DIVER), feet, feet, 16);
  assert.ok(!v.holding && v.state === "clear" && rt.stats.admissionBuilds === 1);
  // The safety net is the stream's one unsliced path: counted and logged as admission's.
  assert.deepEqual(world.kitCaves.unsliced.map(f => f.cause), ["admission"]);
  assert.equal(world.kitCaves.stats.syncBuilds, 1);
  assert.ok(world.kitCaves.clusters.some(c => c.caves.includes("a") && world.kitCaves.ready(c.index)));
});

test("LC-07: a hold that never clears relocates to the last safe exterior pose, else to the refuge; never pauses forever", () => {
  const { world, a } = synthetic();
  let safe = true;
  const rt = createCaveRuntime({ world, canGenerate: () => false, clear: () => safe, refugeAfterMs: 12000 });
  const open = { x: 1010, y: -50, z: -1300 }, feet = { x: a.footprint.minX - 2, y: -55, z: a.footprint.minZ + 5 };
  assert.equal(rt.update(actorBox(open, DIVER), open, open, 0).state, "clear");
  assert.deepEqual(rt.lastSafe, open, "open water away from caves is remembered");
  let u = rt.update(actorBox(feet, DIVER), feet, feet, 100);
  for (let t = 116; t < 12000; t += 16) {
    u = rt.update(actorBox(feet, DIVER), feet, feet, t);
    assert.ok(u.holding && !u.relocate, "still loading before the refuge time");
  }
  u = rt.update(actorBox(feet, DIVER), feet, feet, 12200);
  assert.deepEqual(u.relocate, { kind: "point", position: open });
  safe = false;
  u = rt.update(actorBox(feet, DIVER), feet, feet, 13000);
  for (let t = 13016; !u.relocate && t < 40000; t += 16) u = rt.update(actorBox(feet, DIVER), feet, feet, t);
  assert.deepEqual(u.relocate, { kind: "refuge" }, "the remembered pose is no longer clear: the refuge base");
});

test("cave biomes through LC's CaveAdmission: a denied reload pauses, then is rescued; an unrescuable one ends at the refuge", () => {
  const cm = caveWorldMap(createLargeCave(S, worldFloor));
  const instant = { *build() { yield; return { cpuBytes: 1, gpuBytes: 1, discard() {}, upload: () => ({ cpuBytes: 1, gpuBytes: 1, setVisible() {}, dispose() {} }) }; } };
  const FIXED = 32 * 1048576, SAFETY = 4 * 1048576, hall = { x: 742, y: -126, z: -100 };
  const run = (clear: (p: Vec3) => boolean) => {
    const admission = new CaveAdmission(cm, new CaveArbiter({ cpu: FIXED + SAFETY - 1, gpu: FIXED + SAFETY - 1 }), instant,
      { id: "canopy", fixed: { cpu: FIXED, gpu: 0 }, safety: SAFETY, rescueAfterMs: 4000, clear });
    const rt = createCaveRuntime({ world: createCaveWorldQueries({ solids: [], floor: worldFloor, caves: [] }), canGenerate: () => true,
      biomes: [{ id: "canopy", admission }], clear: () => true, refugeAfterMs: 12000 });
    for (let t = 0; t < 30000; t += 16) {
      const u = rt.update(actorBox(hall, DIVER), hall, hall, t);
      if (u.relocate) return { t, u };
      assert.ok(u.holding, "held (clock paused) until relocated");
    }
    return null;
  };
  const rescued = run(() => true)!;
  assert.ok(rescued.u.state === "rescue" && rescued.u.relocate?.kind === "point" && rescued.t >= 4000 && rescued.t < 4100, JSON.stringify(rescued));
  const refuge = run(() => false)!;
  assert.ok(refuge.u.state === "refuge" && refuge.u.relocate?.kind === "refuge" && refuge.t >= 12000, JSON.stringify(refuge));
});

test("relocation: a rescue moves the piloted craft and diver; the refuge wakes the diver at the base and leaves the craft", () => {
  const s = createGame();
  completeOpening(s);
  const dart = makeVehicle("cw1_dart", "dart", { x: 380, y: -70, z: -310 }, "cw1_dart_hold");
  s.fleet.vehicles.push(dart);
  s.player.controlledVehicleId = dart.id; s.player.mode = "piloting";
  const to = { x: 400, y: -80, z: -300 };
  const moved = relocateForCave(s, { kind: "point", position: to });
  assert.deepEqual(moved.fleet.vehicles.at(-1)!.pose.position, to);
  assert.deepEqual(moved.player.pose.position, to);
  assert.equal(moved.player.controlledVehicleId, dart.id);
  const home = relocateForCave(s, { kind: "refuge" });
  assert.equal(home.player.controlledVehicleId, null);
  assert.deepEqual(home.player.pose.position, REST_BASES.home_pod.wake);
  assert.deepEqual(home.fleet.vehicles.at(-1)!.pose.position, dart.pose.position, "the craft waits where it was");
  assert.deepEqual(home.inventory, s.inventory);
  assert.deepEqual(home.player.vitals, s.player.vitals);
});

test("CA-1 ground read: beside a cave, support is the exterior's own, not the collar's 0.5 m steps", () => {
  const exterior = createWorldQueries();
  const world = gameWorld(), f = CAVE_SOURCES.find(s => s.id === "isles_headland_west")!.footprint;
  for (let i = 0; i <= 20; i++) {
    const x = f.minX - 7.2, z = f.minZ + (f.maxZ - f.minZ) * i / 20;
    assert.equal(world.supportHeight(x, z, 10), exterior.supportHeight(x, z, 10));
  }
});

test("STR-13 provenance: a collision pack or manifest baked from other sources is refused; the game stays on its live fallback", async () => {
  const source = CAVE_SOURCES.find(s => s.id === "reef_pumphouse_undercut")!;
  const live = liveKitCave(source, worldFloor, surfaceHeight);
  // The codec: same IDs, same records, other sources: refused before decoding.
  assert.throws(() => decodeKitCavePack(encodeKitCavePack([live], SOURCE_A), SOURCE_B), StaleKitCavePack);
  // The store over HTTP, with a stub fetch serving one bake.
  const serve = (manifestSource: string, packSource: string) => {
    const files: Record<string, Uint8Array> = {
      "manifest.json": new TextEncoder().encode(JSON.stringify({ codec: 1, sourceHash: manifestSource, collision: { file: "collision.bin" }, light: {} })),
      "collision.bin": deflateSync(encodeKitCavePack([live], packSource)),
    };
    return (async (url: URL | string) => {
      const body = files[new URL(String(url)).pathname.split("/caves/")[1]!];
      return new Response(body ? body.slice() : null, { status: body ? 200 : 404 });
    }) as typeof fetch;
  };
  const load = async (manifestSource: string, packSource: string, expected: string | null) => {
    const saved = globalThis.fetch, warn = console.warn, warned: string[] = [];
    globalThis.fetch = serve(manifestSource, packSource); console.warn = (m: string) => { warned.push(m); };
    try {
      const store = httpCaveStore("http://bake.test/caves/", { expectedSource: expected });
      for (let i = 0; i < 200 && !store.settled; i++) await new Promise(r => setTimeout(r, 1));
      assert.ok(store.settled);
      return { store, warned };
    } finally { globalThis.fetch = saved; console.warn = warn; }
  };
  const fresh = await load(SOURCE_A, SOURCE_A, SOURCE_A);
  assert.deepEqual(fresh.store.collision?.get(source.id), live);
  assert.equal(fresh.store.refused, null);
  // A stale pack beside a fresh manifest (a partial copy): the pack's own header refuses it.
  const stalePack = await load(SOURCE_B, SOURCE_A, SOURCE_B);
  assert.equal(stalePack.store.collision, null);
  assert.match(stalePack.store.refused ?? "", /stale/);
  assert.match(stalePack.warned.join("\n"), /cave bake refused, live fallback/);
  // A stale manifest, and a build without a hash, refuse the bake too.
  assert.equal((await load(SOURCE_A, SOURCE_A, SOURCE_B)).store.collision, null);
  assert.match((await load(SOURCE_A, SOURCE_A, null)).store.refused ?? "", /no bake source hash/);
});
