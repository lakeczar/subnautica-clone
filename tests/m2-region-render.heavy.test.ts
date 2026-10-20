import test from "node:test";
import assert from "node:assert/strict";
import { same } from "./render-assert.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createRegionalArt } from "../src/render/renderer.js";
import { createCelMaterial, createGlassMaterial } from "../src/render/materials.js";
import { createRegionResidency, pinnedVehicleIds, RESIDENT_REGION_LIMIT } from "../src/render/regions.js";
import { createGame, makeVehicle } from "../src/sim/state.js";
import { completeOpening } from "../src/sim/progression.js";
import { fixtureGame } from "../src/sim/carrier.js";
import { BASIN_SOURCE_IDS, CANOPY_BASIN_ROUTE } from "../src/content/routes.js";
import { protectedReadyState } from "./targeting-support.js";
import { createEnvelope, decodeSave, encodeSave } from "../src/save/codec.js";
import type { Vec3 } from "../src/sim/types.js";

function sceneTest(run: (scene: Scene) => void): void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "OffscreenCanvas");
  class TextCanvas {
    width = 512; height = 128;
    getContext() { return { fillStyle: "", font: "", textAlign: "", textBaseline: "", clearRect() {}, fillRect() {}, fillText() {}, measureText(t: string) { return { width: t.length * 24 }; } }; }
  }
  Object.defineProperty(globalThis, "OffscreenCanvas", { configurable: true, value: TextCanvas });
  const engine = new NullEngine(), scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  try { run(scene); } finally {
    scene.dispose(); engine.dispose();
    if (previous) Object.defineProperty(globalThis, "OffscreenCanvas", previous); else Reflect.deleteProperty(globalThis, "OffscreenCanvas");
  }
}

function counts(scene: Scene): number[] {
  return [scene.meshes.length, scene.geometries.length, scene.materials.length, scene.textures.length,
    scene.meshes.reduce((n, m) => n + m.getTotalVertices(), 0), scene.meshes.reduce((n, m) => n + m.getTotalIndices() / 3, 0)];
}

test("production regional owners survive three return traversals, depletion, replacement and reconstruction without state writes or resource growth", () => sceneTest(scene => {
  const cel = createCelMaterial(scene), glass = createGlassMaterial(scene);
  let sharedDisposed = false;
  cel.onDisposeObservable.add(() => { sharedDisposed = true; });
  glass.onDisposeObservable.add(() => { sharedDisposed = true; });
  let art = createRegionalArt(scene, cel, glass);
  const state = protectedReadyState(350);
  state.world.resources.find(r => r.id === BASIN_SOURCE_IDS[0])!.stock = 0;
  const stops: readonly Vec3[] = [{ x: 0, y: .18, z: 22 }, { x: 10, y: 1.2, z: -34 },
    CANOPY_BASIN_ROUTE.labParking, { x: 178, y: -160, z: -208 }, { x: 216, y: -166, z: -232 },
    { x: 228, y: -80, z: -170 }, { x: 57, y: -10, z: -65 }, { x: 0, y: .18, z: 22 }];
  const retained = new Map<string, number[]>();
  let warmCache: { entries: number; bytes: number } | null = null;
  // Traversal 0 builds, 1 warms in the other quality, 2 must match both exactly.
  for (let traversal = 0; traversal < 3; traversal++) for (const [index, p] of stops.entries()) {
    state.player.pose.position = { ...p };
    const before = structuredClone(state);
    art.setQuality?.(traversal % 2 ? "light" : "rich");
    art.update(state);
    assert.deepEqual(state, before, "activation/deactivation never changes inventory, knowledge, pursuit or recovery");
    assert.equal(art.active.length, 2);
    const { entries, bytes, maxBytes, maxEntries } = art.cacheStats;
    assert.ok(entries <= maxEntries && bytes <= maxBytes, "immutable recipes have explicit renderer-owned bounds");
    if (traversal === 0 && index === stops.length - 1) warmCache = { entries, bytes };
    if (traversal > 0) assert.deepEqual({ entries, bytes }, warmCache, "quality/state/route revisits do not grow the warmed cache");
    const groups = new Set(scene.meshes.map(m => m.metadata?.detailRegion).filter(Boolean));
    assert.deepEqual(groups, new Set(art.active), "only the two current detailed owners are in the scene");
    assert.ok(art.active.length + art.retained.length <= RESIDENT_REGION_LIMIT, "retention stays within its resident limit");
    assert.ok(art.retained.every(id => !art.active.includes(id)));
    // After the first traversal every region is resident; counts then stabilize.
    const current = counts(scene), key = `${index}:${art.active.join(",")}`;
    if (traversal > 1) assert.deepEqual(current, retained.get(key), "live geometry/material/texture counts stabilize on every return");
    else retained.set(key, current);
    assert.ok(current[4]! <= 400_000 && current[5]! <= 650_000 && current[2]! <= 24, "provisional active scene budgets");
    if (art.active.includes("silt_basin")) {
      same(scene.getMeshByName("source." + BASIN_SOURCE_IDS[0])!.isEnabled(), false);
      assert.ok(scene.getMeshByName("source-host." + BASIN_SOURCE_IDS[0])!.isEnabled(), "empty patch stays recognizable");
    }
  }
  state.player.pose.position = { x: 178, y: -160, z: -208 };
  art.update(state);
  const depleted = scene.getMeshByName("source." + BASIN_SOURCE_IDS[0])!;
  const replacement = structuredClone(state);
  replacement.world.resources.find(r => r.id === BASIN_SOURCE_IDS[0])!.stock = 1;
  const copy = structuredClone(replacement);
  art.update(replacement);
  same(scene.getMeshByName(depleted.name), depleted);
  assert.ok(depleted.isEnabled(), "same-ID replacement reads actual stock instead of cached depletion");
  art.update(null);
  assert.ok(!scene.meshes.includes(depleted), "menu/null detaches remote regional geometry from drawing");
  replacement.world.resources.find(r => r.id === BASIN_SOURCE_IDS[0])!.stock = 0;
  art.update(replacement);
  same(scene.getMeshByName(depleted.name), depleted, "a retained Basin owner re-attaches");
  assert.ok(!depleted.isEnabled(), "re-attachment reads the replacement's actual depletion");
  art.update(null);
  replacement.world.resources.find(r => r.id === BASIN_SOURCE_IDS[0])!.stock = 1;
  art.update(replacement);
  assert.ok(scene.getMeshByName(depleted.name)!.isEnabled(), "and its actual restored stock");
  assert.deepEqual(replacement, copy);
  const baseline = counts(scene);
  for (let i = 0; i < 2; i++) {
    art.dispose(); art.dispose(); art.update(replacement);
    assert.equal(scene.meshes.length, 0); assert.equal(scene.geometries.length, 0); assert.equal(scene.textures.length, 0);
    assert.equal(art.cacheStats.bytes, 0); assert.equal(art.cacheStats.entries, 0);
    assert.deepEqual(art.labelStats, { entries: 0, references: 0 });
    assert.equal(sharedDisposed, false);
    art = createRegionalArt(scene, cel, glass);
    assert.equal(art.cacheStats.entries, 0, "graphics reconstruction starts with a new geometry owner");
    art.update(replacement);
    // Retained owners keep their sign materials; drawn geometry must match exactly.
    const drawn = (c: number[]): number[] => [c[0]!, c[1]!, c[4]!, c[5]!];
    assert.deepEqual(drawn(counts(scene)), drawn(baseline), "graphics reconstruction re-reads the replacement state exactly");
  }
  art.dispose();
}));

test("remote parked hulls hide while unpinned, recovery and transferred assemblies remain pinned with their true identities", () => sceneTest(scene => {
  const cel = createCelMaterial(scene), glass = createGlassMaterial(scene), art = createRegionalArt(scene, cel, glass);
  const s = createGame(); completeOpening(s);
  const v = makeVehicle("remote-wreck", "dart", { x: 216, y: -166, z: -232 }, "remote-hold");
  v.health = 0; v.disabled = true; s.fleet.vehicles.push(v);
  art.update(s);
  same(scene.getMeshByName(v.id), null, "a remote parked wreck has no retained detailed actor");
  s.recovery.operation = { vehicleId: v.id, routeId: "basin", method: "tow", phase: "approach", waypoint: 0, position: { x: 46, y: -12, z: -54 } };
  const before = structuredClone(s); art.update(s);
  const pinned = scene.getMeshByName(v.id)!;
  assert.ok(pinned && pinned.isEnabled());
  assert.deepEqual(pinned.position.asArray(), [216, -166, -232]);
  assert.deepEqual(s, before);
  const admitted = art.cacheStats;
  assert.equal(admitted.maxEntries, 256); assert.equal(admitted.maxBytes, 32 * 1024 * 1024);
  assert.ok(admitted.entries > 4 && admitted.bytes <= admitted.maxBytes,
    "regional and Dart geometry share the same aggregate owner and limits");
  s.recovery.operation = null; art.update(s);
  assert.ok(!pinned.isDisposed() && !pinned.isEnabled(), "an unpinned remote wreck is hidden, not drawn");
  s.player.pose.position = { x: 216, y: -166, z: -232 }; art.update(s);
  const reentered = scene.getMeshByName(v.id)!;
  same(reentered, pinned, "re-entry re-shows the retained hull instead of rebuilding it");
  assert.ok(reentered.isEnabled());
  assert.deepEqual(reentered.position.asArray(), [216, -166, -232]);
  assert.equal(art.cacheStats.hits - admitted.hits, 0, "a re-shown Dart reads no recipes");
  assert.equal(s.fleet.vehicles[0]!.health, 0); assert.equal(s.fleet.vehicles[0]!.disabled, true);
  s.player.pose.position = { x: 0, y: .18, z: 22 }; s.player.controlledVehicleId = v.id; art.update(s);
  same(scene.getMeshByName(v.id), reentered, "occupied actor remains pinned across a regional boundary");
  art.update(null); assert.ok(reentered.isDisposed());
  art.dispose();
  assert.equal(art.cacheStats.entries, 0); assert.equal(art.cacheStats.bytes, 0);

  const fixture = fixtureGame(), dock = fixture.fleet.docking!;
  const carrier = fixture.fleet.vehicles.find(v => v.id === dock.vehicleId)!;
  const child = fixture.fleet.vehicles.find(v => v.berth?.carrierId === carrier.id)!;
  fixture.player.controlledVehicleId = child.id;
  const pins = pinnedVehicleIds(fixture);
  assert.ok(pins.has(carrier.id) && pins.has(child.id));
  assert.ok(fixture.fleet.vehicles.filter(v => v.berth?.carrierId === carrier.id).every(v => pins.has(v.id)));
  const assembly = createRegionalArt(scene, cel, glass);
  fixture.player.pose.position = { x: 216, y: -166, z: -232 };
  const snapshot = structuredClone(fixture);
  assembly.update(fixture);
  for (const id of pins) assert.ok(scene.getMeshByName(id), "actual remote pinned hulls are submitted, not merely listed");
  assert.ok(scene.getMeshByName("carrier.physical-compartments"), "the carrier's shell stays with its pinned assembly");
  assert.deepEqual(fixture, snapshot);
  assembly.update(null);
  for (const id of pins) same(scene.getMeshByName(id), null);
  assembly.dispose();
}));

test("rendering a current export, imported replacement, Continue and fresh state keeps codec and authoritative state intact", () => sceneTest(scene => {
  const cel = createCelMaterial(scene), glass = createGlassMaterial(scene), art = createRegionalArt(scene, cel, glass);
  const earned = protectedReadyState(350);
  const encoded = encodeSave(createEnvelope(earned, { sessionId: "regional-reload", createdAt: "2026-10-18T12:00:00.000Z", savedAt: "2026-10-18T12:00:00.000Z" }));
  assert.ok(encoded.ok, encoded.ok ? "" : encoded.error);
  const imported = decodeSave(encoded.value), continued = decodeSave(encoded.value);
  assert.ok(imported.ok && continued.ok);
  for (const state of [null, createGame(), imported.value.state, continued.value.state, null]) {
    const before = structuredClone(state); art.update(state); assert.deepEqual(state, before);
  }
  assert.equal(encodeSave(imported.value).ok, true);
  art.dispose();
}));

test("eight-metre regional hysteresis prevents boundary thrash and disposal is terminal", () => {
  const calls: string[] = [];
  const art = createRegionResidency(region => ({ update() {}, dispose() { calls.push(region); } }));
  const s = createGame(); s.player.pose.position = { x: 160, y: -140, z: -180 }; art.update(s);
  for (const z of [-185, -182, -189, -179, -191]) { s.player.pose.position.z = z; art.update(s); }
  assert.equal(calls.length, 0);
  s.player.pose.position.z = -200; art.update(s);
  assert.deepEqual(new Set(art.active), new Set(["silt_basin", "suspended_garden"]));
  art.dispose(); art.dispose(); art.update(s);
  assert.equal(art.active.length, 0); assert.equal(calls.length, 2);
});

test("retention re-attaches before eviction, prepares by adjacency within its limit and falls back to disposal", () => {
  const log: string[] = [];
  const owner = (region: string, retainable = true) => ({
    update() {}, dispose() { log.push(`dispose:${region}`); },
    ...(retainable ? { suspend() { log.push(`suspend:${region}`); }, resume() { log.push(`resume:${region}`); } } : {}),
  });
  const built: string[] = [];
  const art = createRegionResidency(region => { built.push(region); return owner(region); }, 3);
  const s = createGame();
  const at = (x: number, y: number, z: number): void => { s.player.pose.position = { x, y, z }; art.update(s); };
  at(0, .18, 22);
  assert.deepEqual(new Set(art.active), new Set(["refuge_reef", "island_chain"]));
  assert.equal(art.prepare(), "suspended_garden", "nearest non-resident neighbour first");
  assert.equal(art.prepare(), null, "the resident limit stops further preparation");
  assert.deepEqual(art.retained, ["suspended_garden"]);
  log.length = 0; built.length = 0;
  at(57, -10, -65);
  assert.deepEqual(built, [], "a prepared owner becomes detailed without construction");
  assert.deepEqual(log, ["suspend:refuge_reef", "resume:suspended_garden"]);
  log.length = 0;
  at(178, -160, -208);
  assert.deepEqual(built, ["silt_basin"]);
  assert.ok(log.includes("dispose:refuge_reef"), "least recently retained owner is evicted at the limit");
  assert.deepEqual(art.retained, ["island_chain"]);
  log.length = 0; built.length = 0;
  at(57, -10, -65);
  assert.deepEqual(built, [], "the retained owner is resumed before any eviction for construction");
  art.discardRetained();
  assert.equal(art.retained.length, 0);
  art.dispose();
  assert.equal(art.prepare(), null);

  const plain = createRegionResidency(region => owner(region, false));
  log.length = 0; s.player.pose.position = { x: 0, y: .18, z: 22 }; plain.update(s);
  assert.equal(plain.prepare(), null, "owners that cannot be retained are never prepared");
  s.player.pose.position = { x: 178, y: -160, z: -208 }; plain.update(s);
  assert.ok(log.includes("dispose:refuge_reef") && log.includes("dispose:island_chain"));
  assert.equal(plain.retained.length, 0);
  plain.dispose();
});

test("prepared and retained production regions draw exactly what a cold construction draws", async () => {
  // Babylon defers mesh-added notifications; yield so temporary primitives from
  // each cold construction can be collected, as a browser frame boundary does.
  const settle = (): Promise<void> => new Promise(resolve => setImmediate(resolve));
  const previous = Object.getOwnPropertyDescriptor(globalThis, "OffscreenCanvas");
  class TextCanvas {
    width = 512; height = 128;
    getContext() { return { fillStyle: "", font: "", textAlign: "", textBaseline: "", clearRect() {}, fillRect() {}, fillText() {}, measureText(t: string) { return { width: t.length * 24 }; } }; }
  }
  Object.defineProperty(globalThis, "OffscreenCanvas", { configurable: true, value: TextCanvas });
  const engine = new NullEngine(), scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  try {
  const cel = createCelMaterial(scene), glass = createGlassMaterial(scene);
  const state = protectedReadyState(350);
  const stops: readonly Vec3[] = [{ x: 0, y: .18, z: 22 }, { x: 57, y: -10, z: -65 }, { x: 178, y: -160, z: -208 }];
  const drawn = (): unknown => scene.meshes.filter(m => m.metadata?.detailRegion).map(m => ({
    name: m.name, region: m.metadata.detailRegion, enabled: m.isEnabled(), position: m.position.asArray(),
    vertices: m.getTotalVertices(), indices: m.getTotalIndices(),
  })).sort((a, b) => `${a.region}:${a.name}`.localeCompare(`${b.region}:${b.name}`));
  const expected: unknown[] = [];
  for (const p of stops) {
    const cold = createRegionalArt(scene, cel, glass);
    state.player.pose.position = { ...p }; cold.setQuality?.("light"); cold.update(state);
    expected.push(drawn()); cold.dispose();
    await settle();
  }
  const art = createRegionalArt(scene, cel, glass);
  state.player.pose.position = { ...stops[0]! }; art.update(state);
  art.setQuality?.("light");
  while (art.prepare()) await settle();
  assert.equal(art.active.length + art.retained.length, 4, "the current four-region benchmark is fully prepared");
  let created = 0;
  const addMesh = scene.addMesh;
  for (let pass = 0; pass < 2; pass++) for (const [i, p] of stops.entries()) {
    state.player.pose.position = { ...p };
    const before = structuredClone(state);
    scene.addMesh = function (...args) { if (!args[0].metadata?.detailRegion) created++; return addMesh.apply(this, args); };
    art.update(state);
    scene.addMesh = addMesh;
    assert.deepEqual(drawn(), expected[i], `stop ${i} pass ${pass}: retained output, quality and depletion match cold construction`);
    assert.deepEqual(state, before);
  }
  assert.equal(created, 0, "no regional mesh is constructed during prepared traversal");
  art.dispose();
  assert.equal(scene.meshes.length, 0); assert.equal(scene.geometries.length, 0); assert.equal(scene.textures.length, 0);
  } finally {
    scene.dispose(); engine.dispose();
    if (previous) Object.defineProperty(globalThis, "OffscreenCanvas", previous); else Reflect.deleteProperty(globalThis, "OffscreenCanvas");
  }
});
