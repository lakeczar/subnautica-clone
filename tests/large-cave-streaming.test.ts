import test from "node:test";
import assert from "node:assert/strict";
import { CANOPY_ROOT_CAVES as S } from "../src/content/caves/canopyRootCaves.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { createLargeCave } from "../src/world/caves/large/build.js";
import { CaveArbiter, caveFineShare, caveSafetyBytes, caveWorldMap, CaveGate, CavePins, touchedChunks } from "../src/world/caves/large/streaming.js";
import { actorBox } from "../src/sim/ribCollision.js";
import type { Vec3 } from "../src/sim/types.js";
import { createSim, outside, simulate, syntheticCost } from "./large-cave-stream-support.js";
import { validateLayout } from "../src/world/map.js";
import { DART } from "./large-cave-support.js";

// LC streaming: the Canopy's chunks through S1 residency, and the adverse
// case: a fast craft crossing the biome while chunks are still constructing,
// or after its art share shrinks, must never move while touching rock that
// is not drawn fine or sitting in a zone with an undrawn chunk.
const cave = createLargeCave(S, worldFloor);
const cm = caveWorldMap(cave);

/** Exterior water above the Crown hollow, clear of every owned column. */
const OUTSIDE: Vec3 = { x: 758, y: -56, z: -62 };
const r = (id: string) => S.routes.find(x => x.id === id)!.path;
/** In through the hollow, round the pool and the west loop, back out the hollow. */
const tour: Vec3[] = [OUTSIDE, ...r("canopy_roots.route.craft_loop").slice(1, 9), ...r("canopy_roots.route.pool_spur"),
  ...[...r("canopy_roots.route.pool_spur")].reverse(), ...r("canopy_roots.route.west_loop"), ...[...r("canopy_roots.route.craft_loop")].slice(1, 6).reverse(), OUTSIDE];
/** In to the hub, then straight back out the way it came. */
const inAndOut: Vec3[] = [OUTSIDE, ...r("canopy_roots.route.craft_loop").slice(1, 10), ...r("canopy_roots.route.craft_loop").slice(1, 9).reverse(), OUTSIDE];

test("LC streaming: the cave map is a valid S1 layout with one layer stack per column", () => {
  assert.deepEqual(validateLayout(cm.map.layout), []);
  assert.equal(cm.refs.length, cave.chunks.length);
  const hub = S.zones.findIndex(z => z.id === "canopy_roots.hub");
  assert.deepEqual(cm.neighbours(hub).map(i => S.zones[i]!.id).sort(),
    ["canopy_roots.garden", "canopy_roots.hall", "canopy_roots.passage", "canopy_roots.pool"]);
  assert.ok(outside(cm, OUTSIDE, DART), "the tour starts and ends in exterior water");
});

test("LC-04 pins: neighbour zones are pinned fine, other zones are not; the fine view wants nothing else", () => {
  const pins = new CavePins(cm), at = { x: 742, y: -126, z: -100 };
  const state = pins.update(at);
  const id = (z: string): number => S.zones.findIndex(q => q.id === z);
  const hall = id("canopy_roots.hall"), hub = id("canopy_roots.hub"), pool = id("canopy_roots.pool");
  assert.equal(state.zone, hall);
  for (const q of cm.refs) if (q.zones.includes(hall)) assert.ok(state.fine.has(q.id));
  // Independently of `neighbours`: the hall's portals lead to the hub, the gallery and the passages; not the pool.
  const only = (z: number) => cm.refs.filter(q => q.zones.length === 1 && q.zones[0] === z);
  assert.ok(only(hub).length > 0 && only(hub).every(q => state.fine.has(q.id)), "hub chunks (a neighbour) are pinned fine");
  assert.ok(only(pool).length > 0 && only(pool).every(q => !state.fine.has(q.id)), "pool chunks (two portals away) are not");
  const wanted = pins.view.chunksWithin(at, 10000);
  assert.ok(wanted.length === state.fine.size && wanted.every(w => state.fine.has(w.chunk.id) && w.distance < w.chunk.lod.fine));
  const box = { min: { x: 700, y: -150, z: -150 }, max: { x: 704, y: -148, z: -146 } };
  const withActor = pins.update(at, box, 6);
  for (const t of touchedChunks(cm, box, 8)) assert.ok(withActor.fine.has(t));
  assert.equal(pins.update({ x: 742, y: -60, z: 400 }).fine.size, 0, "far away nothing is pinned");
});

/** Fixed cave bytes (colliders, bake, lamp windows), reserved at load. */
const FIXED = 40 * 1048576;
const SAFETY = caveSafetyBytes(cm, syntheticCost), FINE = caveFineShare(cm, syntheticCost);
const sim = (o: Partial<Parameters<typeof simulate>[0]>) =>
  simulate({ cm, cost: syntheticCost, budgetBytes: FIXED + SAFETY + FINE, fixedBytes: FIXED, path: tour, speed: 16, shape: DART, gate: true, ...o });

test("LC-02 arbiter: reservations are all-or-nothing and no request can take them", () => {
  const a = new CaveArbiter({ cpu: 100, gpu: 100 });
  assert.ok(a.reserve("cave", { cpu: 60, gpu: 60 }));
  assert.deepEqual(a.request("other", { cpu: 100, gpu: 100 }), { cpu: 40, gpu: 40 });
  assert.equal(a.reserve("cave2", { cpu: 10, gpu: 10 }), false, "nothing left to reserve");
  assert.ok(a.holds("cave") && a.committed().cpu === 100);
  a.release("other");
  assert.ok(a.reserve("cave2", { cpu: 10, gpu: 10 }));
});

test("LC-02: admitted with fixed + coarse safety + the recommended fine share, a Dart at boost and overdrive tours the biome, never held, never uncovered", () => {
  for (const speed of [11, 16]) {
    const res = sim({ speed });
    assert.ok(res.finished && res.admittedFrame > 0, `tour unfinished at ${speed} m/s: ${JSON.stringify(res)}`);
    assert.equal(res.unsafeMetres, 0, res.firstUnsafe);
    assert.equal(res.heldInside, 0, res.reason);
    assert.equal(res.insideUnadmitted, 0);
  }
});

test("LC-02 sustained pressure: another owner takes every free byte after entry and keeps it; the craft still goes in and backs out to exterior water", () => {
  // Admit, then the other owner grabs everything not reserved, for good.
  const events = [{ frame: 200, otherBytes: 1e12 }];
  for (const path of [inAndOut, tour]) {
    const res = sim({ path, shareEvents: events });
    assert.ok(res.finished, `stranded at ${JSON.stringify(res.final)}: ${res.reason}`);
    assert.ok(outside(cm, res.final, DART), "ends in exterior water");
    assert.equal(res.unsafeMetres, 0, res.firstUnsafe);
    assert.equal(res.heldInside, 0, `held inside: ${res.reason}`);
    assert.ok(res.coarseFrames > 100, "the pressure really took the fine art: it moved through coarse");
  }
});

test("LC-02 control: without the safety set the same pressure leaves space uncovered; the gate refuses forward into it, and without the gate the craft drives in", () => {
  const events = [{ frame: 200, otherBytes: 1e12 }];
  const gated = sim({ path: inAndOut, shareEvents: events, safety: false, maxFrames: 4000 });
  assert.equal(gated.unsafeMetres, 0, gated.firstUnsafe);
  assert.ok(gated.heldInside > 100 && !gated.finished, "forward into uncovered space is refused");
  const ungated = sim({ path: inAndOut, shareEvents: events, safety: false, gate: false, maxFrames: 4000 });
  assert.ok(ungated.unsafeMetres > 5, `control moved only ${ungated.unsafeMetres.toFixed(1)} m uncovered`);
  // The gate itself: forward into a chunk nothing draws is refused.
  const gate = new CaveGate(cm), deep = r("canopy_roots.route.craft_loop")[6]!;
  assert.equal(gate.allows(new Map(), actorBox(deep, DART), true), false);
});

test("LC-02 admission: below fixed + coarse safety the craft waits outside the mouth, never inside; just above it, it enters and never strands", () => {
  const below = sim({ budgetBytes: FIXED + SAFETY * 0.5, maxFrames: 3000 });
  assert.equal(below.admittedFrame, -1);
  assert.equal(below.insideUnadmitted, 0);
  assert.ok(below.heldOutside > 1000 && outside(cm, below.final, DART), `not held outside: ${JSON.stringify(below.final)}`);
  assert.match(below.reason, /not admitted/);
  // The R2 48 MiB case: enough for fixed + safety, far below the fine share. Coarse, never stranded.
  const tight = sim({ budgetBytes: FIXED + SAFETY + 1048576, shareEvents: [{ frame: 300, otherBytes: 1e12 }] });
  assert.ok(tight.finished && tight.unsafeMetres === 0 && tight.heldInside === 0, JSON.stringify(tight));
});

test("LC-02 two biomes competing for one budget: the second waits outside until the first is released; neither strands", () => {
  const arbiter = new CaveArbiter({ cpu: 2 * FIXED + SAFETY + 2 * 1048576, gpu: 2 * FIXED + SAFETY + 2 * 1048576 });
  const base = { cm, cost: syntheticCost, budgetBytes: 0, fixedBytes: FIXED, speed: 16, shape: DART, gate: true, arbiter };
  const a = createSim({ ...base, id: "a", path: inAndOut, shareEvents: [{ frame: 100, otherBytes: 1e12 }] });
  const b = createSim({ ...base, id: "b", path: tour, maxFrames: 20000 });
  while (!a.done) { a.step(); b.step(); }
  const ra = a.result();
  assert.ok(ra.finished && ra.unsafeMetres === 0 && ra.heldInside === 0, `first biome: ${JSON.stringify(ra)}`);
  assert.equal(b.result().admittedFrame, -1, "the second was not admitted while the first held its reservation");
  assert.equal(b.result().insideUnadmitted, 0);
  a.release(); arbiter.release("other");
  while (!b.done) b.step();
  const rb = b.result();
  assert.ok(rb.finished && rb.admittedFrame > 0 && rb.unsafeMetres === 0 && rb.heldInside === 0, `second biome: ${JSON.stringify(rb)}`);
});
