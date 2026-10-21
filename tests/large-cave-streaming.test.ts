import test from "node:test";
import assert from "node:assert/strict";
import { CANOPY_ROOT_CAVES as S } from "../src/content/caves/canopyRootCaves.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { createLargeCave } from "../src/world/caves/large/build.js";
import { caveArtMinimum, caveWorldMap, CavePins, touchedChunks } from "../src/world/caves/large/streaming.js";
import { simulate, syntheticCost } from "./large-cave-stream-support.js";
import { validateLayout } from "../src/world/map.js";
import { DART } from "./large-cave-support.js";

// LC streaming: the Canopy's chunks through S1 residency, and the adverse
// case: a fast craft crossing the biome while chunks are still constructing,
// or after its art share shrinks, must never move while touching rock that
// is not drawn fine or sitting in a zone with an undrawn chunk.
const cave = createLargeCave(S, worldFloor);
const cm = caveWorldMap(cave);

/** Fixed cave bytes (collision, occupancy, bake, lamp window), counted as external. */
const FIXED = 40 * 1048576;

/** The craft loop out and back, the west loop and the pool spur, joined. */
const tour = (() => {
  const r = (id: string) => S.routes.find(x => x.id === id)!.path;
  return [...r("canopy_roots.route.craft_loop").slice(0, 9), ...r("canopy_roots.route.pool_spur"), ...[...r("canopy_roots.route.pool_spur")].reverse(),
    ...r("canopy_roots.route.west_loop"), ...[...r("canopy_roots.route.craft_loop")].reverse().slice(0, 5)];
})();

test("LC streaming: the cave map is a valid S1 layout with one layer stack per column", () => {
  assert.deepEqual(validateLayout(cm.map.layout), []);
  assert.equal(cm.refs.length, cave.chunks.length);
  // Every carve-reached chunk knows its zones; the hub links to four zones.
  const hub = S.zones.findIndex(z => z.id === "canopy_roots.hub");
  assert.deepEqual(cm.neighbours(hub).map(i => S.zones[i]!.id).sort(),
    ["canopy_roots.garden", "canopy_roots.hall", "canopy_roots.passage", "canopy_roots.pool"]);
});

test("LC streaming: pins put the viewer's zone and its neighbours fine, and the whole cave at least coarse", () => {
  const pins = new CavePins(cm);
  const inHall = pins.update({ x: 742, y: -126, z: -100 });
  const hall = S.zones.findIndex(z => z.id === "canopy_roots.hall");
  assert.equal(inHall.zone, hall);
  assert.ok(inHall.active);
  for (const r of cm.refs) if (r.zones.includes(hall)) assert.ok(inHall.fine.has(r.id));
  // Through the view, every chunk is wanted within the coarse band.
  const wanted = pins.view.chunksWithin({ x: 742, y: -126, z: -100 }, 10000);
  assert.equal(wanted.length, cm.refs.length);
  assert.ok(wanted.every(w => w.distance < w.chunk.lod.coarse));
  // Far away nothing is pinned.
  const far = pins.update({ x: 742, y: -60, z: 400 });
  assert.ok(!far.active && far.fine.size === 0);
});

test("LC-04 pins: neighbour zones are pinned fine, other zones are not, and unpinned chunks are only ever wanted coarse", () => {
  const pins = new CavePins(cm), at = { x: 742, y: -126, z: -100 };
  const state = pins.update(at);
  const id = (z: string): number => S.zones.findIndex(q => q.id === z);
  const hall = id("canopy_roots.hall"), hub = id("canopy_roots.hub"), pool = id("canopy_roots.pool");
  // Independently of `neighbours`: the hall's portals lead to the hub, the gallery and the passages; not the pool.
  const only = (z: number) => cm.refs.filter(r => r.zones.length === 1 && r.zones[0] === z);
  assert.ok(only(hub).length > 0 && only(hub).every(r => state.fine.has(r.id)), "hub chunks (a neighbour) are pinned fine");
  assert.ok(only(pool).length > 0 && only(pool).every(r => !state.fine.has(r.id)), "pool chunks (two portals away) are not");
  assert.ok(!cm.neighbours(hall).includes(pool));
  for (const w of pins.view.chunksWithin(at, 10000))
    if (!state.fine.has(w.chunk.id)) assert.ok(w.distance >= w.chunk.lod.fine + w.chunk.lod.hysteresis && w.distance < w.chunk.lod.coarse, `${w.chunk.id} wanted fine unpinned`);
  // The actor's look-ahead pins the chunks round its box too.
  const box = { min: { x: 700, y: -150, z: -150 }, max: { x: 704, y: -148, z: -146 } };
  const withActor = pins.update(at, box, 6);
  for (const t of touchedChunks(cm, box, 8)) assert.ok(withActor.fine.has(t));
});

const minimum = caveArtMinimum(cm, syntheticCost);
const sim = (o: Partial<Parameters<typeof simulate>[0]>) =>
  simulate({ cm, cost: syntheticCost, budgetBytes: FIXED + minimum, fixedBytes: FIXED, path: tour, speed: 16, shape: DART, gate: true, ...o });

test("LC-02 adverse: with the minimum share, a Dart at boost and overdrive tours the biome while uneven chunks construct, never held or uncovered", () => {
  for (const speed of [11, 16]) {
    const r = sim({ speed });
    assert.ok(r.finished && r.frames > 2000, `tour unfinished at ${speed} m/s`);
    assert.equal(r.unsafeMetres, 0, r.firstUnsafe);
    assert.equal(r.heldAfterEntry, 0, "the minimum share never needs the gate");
    assert.ok(r.settledFrame > 0 && r.settledFrame < r.frames / 4, `residency settled at frame ${r.settledFrame} of ${r.frames}`);
    assert.equal(r.cutFramesAfterSettle, 0, "once S1 has measured its units, no pinned or coarse-floor chunk is ever cut");
    assert.ok(r.maxAccountedBytes <= FIXED + minimum);
  }
});

test("LC-02 adverse: the share shrinks after entry (another owner reserves bytes): the gate holds, nothing moves uncovered, and the tour resumes", () => {
  const events = [{ frame: 600, otherBytes: Math.round(minimum * 0.6) }, { frame: 1400, otherBytes: 0 }];
  const r = sim({ shareEvents: events });
  assert.equal(r.unsafeMetres, 0, r.firstUnsafe);
  assert.ok(r.heldAfterEntry > 0, "the gate is what kept it safe");
  assert.ok(r.finished, "it resumes once the share returns");
  // Control: the same squeeze without the gate drives into undrawn space.
  const control = sim({ shareEvents: events, gate: false });
  assert.ok(control.unsafeMetres > 5, `control moved only ${control.unsafeMetres.toFixed(1)} m uncovered`);
});

test("LC-02 adverse: a share below the minimum from the start never moves uncovered (the explicit fallback is to hold)", () => {
  const r = sim({ budgetBytes: FIXED + minimum * 0.5, maxFrames: 4000 });
  assert.equal(r.unsafeMetres, 0, r.firstUnsafe);
  assert.ok(r.heldAfterEntry > 0);
  const control = sim({ budgetBytes: FIXED + minimum * 0.5, maxFrames: 4000, gate: false });
  assert.ok(control.unsafeMetres > 5);
});
