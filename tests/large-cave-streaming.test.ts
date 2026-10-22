import test from "node:test";
import assert from "node:assert/strict";
import { CANOPY_ROOT_CAVES as S } from "../src/content/caves/canopyRootCaves.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { createLargeCave } from "../src/world/caves/large/build.js";
import { CaveAdmission, CaveArbiter, caveFineShare, caveSafetyBytes, caveWorldMap, CaveGate, CavePins, touchedChunks } from "../src/world/caves/large/streaming.js";
import { actorBox } from "../src/sim/ribCollision.js";
import type { GameEvent, Vec3 } from "../src/sim/types.js";
import { createGame } from "../src/sim/state.js";
import { completeOpening } from "../src/sim/progression.js";
import { updateSurvival } from "../src/sim/survival.js";
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

// --- R3: reload inside a biome, loading state, rescue, shared remainder ---

const HALL: Vec3 = { x: 742, y: -126, z: -100 };
const DIVER_SHAPE = { radius: 0.34, height: 0.95 };
/** A ready diver with a fitted 150 m suit (the hall is at 126 m). */
function diverAt(p: Vec3) {
  const s = createGame();
  completeOpening(s);
  s.inventory.items.push({ id: "lc.suit", kind: "suit_150", quantity: 1, containerId: "equipment", fitted: "suit", charge: null, provenance: "public" });
  s.player.controlledVehicleId = null;
  s.player.pose.position = { ...p };
  s.player.vitals.oxygen = 100; s.player.vitals.health = 100;
  return s;
}
const instantLoader = { *build() { yield; return { cpuBytes: 1, gpuBytes: 1, discard() {}, upload: () => ({ cpuBytes: 1, gpuBytes: 1, setVisible() {}, dispose() {} }) }; } };

/** Run a reload at `start` for `seconds`: admission each frame; while it
 * holds, the simulation clock is paused (no survival tick); on rescue the
 * diver is relocated, then swims straight up through the gate; real
 * `updateSurvival` runs on every unpaused frame. */
function reloadRun(budget: number, seconds: number, rescueAfterMs: number, other?: number) {
  const arbiter = new CaveArbiter({ cpu: budget, gpu: budget });
  if (other) arbiter.request("exterior.art", { cpu: other, gpu: other });
  const admission = new CaveAdmission(cm, arbiter, instantLoader, { id: "canopy", fixed: { cpu: FIXED, gpu: 0 }, safety: SAFETY, rescueAfterMs });
  const gate = new CaveGate(cm), s = diverAt(HALL), events: GameEvent[] = [];
  let paused = 0, ticked = 0, rescued: Vec3 | null = null, minOxygen = 100, message = "";
  for (let f = 0; f < seconds * 60; f++) {
    const p = s.player.pose.position, now = f * 1000 / 60;
    const u = admission.update(actorBox(p, DIVER_SHAPE), { x: p.x, y: p.y + 0.8, z: p.z }, now);
    if (u.rescue) { s.player.pose.position = { ...u.rescue }; rescued = { ...u.rescue }; message = u.message; continue; }
    if (u.holding) { paused++; message ||= u.message; continue; }
    // Unpaused: swim up 3.4 m/s through the gate (stays at the surface once there).
    const next = { ...p, y: Math.min(-0.5, p.y + 3.4 / 60) };
    if (gate.allows(admission.safety ? admission.safety.drawn(new Map()) : new Map(), actorBox(next, DIVER_SHAPE), admission.admitted)) s.player.pose.position = next;
    s.tick++; updateSurvival(s, events); ticked++;
    minOxygen = Math.min(minOxygen, s.player.vitals.oxygen);
  }
  return { s, paused, ticked, rescued, minOxygen, message, admission, arbiter, events };
}

test("LC-02 (R3) reload inside a biome the budget cannot admit: the clock is paused while loading, then the diver is moved outside the nearest mouth and lives", () => {
  // Fixed fits, fixed + safety does not (the R3 38 MiB case).
  const budget = FIXED + SAFETY - 1048576;
  const r = reloadRun(budget, 240, 4000);
  assert.ok(r.paused >= 239 && r.paused <= 242, `loaded (paused) for ${r.paused} frames, about 4 s`);
  assert.ok(r.rescued && outside(cm, r.rescued, DIVER_SHAPE), `rescued to ${JSON.stringify(r.rescued)}`);
  assert.ok(r.rescued!.y > worldFloor(r.rescued!.x, r.rescued!.z), "the rescue point is water above the seabed");
  assert.match(r.message, /moved to the water outside its nearest mouth/);
  assert.ok(r.ticked > 180 * 60, `survival ran ${r.ticked / 60} s, past a full air supply`);
  assert.ok(!r.events.some(e => e.type === "sound" && e.cue === "recovery") && r.s.player.vitals.health > 0, "the diver was never incapacitated");
  assert.ok(r.minOxygen > 0, `oxygen fell to ${r.minOxygen}`);
  assert.ok(r.s.player.pose.position.y >= -0.6, "the diver surfaced");
  // Without a rescue the hold is a paused load: survival never ticks, oxygen is untouched.
  const held = reloadRun(budget, 240, Infinity);
  assert.ok(held.paused === 240 * 60 && held.ticked === 0 && held.s.player.vitals.oxygen === 100 && held.message === "Loading cave…");
});

test("LC-02 (R3) reload inside while other owners hold the budget: the occupied biome's reservation takes priority before the clock resumes", () => {
  const budget = FIXED + SAFETY + 4 * 1048576;
  // Another owner holds every free byte before the reload.
  const res = reloadRun(budget, 30, 4000, budget);
  assert.ok(res.admission.admitted && !res.rescued, "admitted in place, no rescue");
  assert.ok(res.paused <= 3, `paused ${res.paused} frames`);
  assert.ok(res.arbiter.granted("exterior.art").cpu <= 4 * 1048576, "the other owner's grant was shrunk");
  assert.ok(res.minOxygen > 0 && res.ticked > 25 * 60, "the clock resumed at once and the diver is fine");
  // And with real streaming: from the hall back out to exterior water under the same pressure.
  const back = simulate({ cm, cost: syntheticCost, budgetBytes: budget, fixedBytes: FIXED, speed: 11, shape: DART, gate: true,
    path: [r("canopy_roots.route.craft_loop")[5]!, ...r("canopy_roots.route.craft_loop").slice(1, 5).reverse(), OUTSIDE], shareEvents: [{ frame: 1, otherBytes: budget }] });
  assert.ok(back.finished && back.unsafeMetres === 0 && back.rescues === 0 && outside(cm, back.final, DART), JSON.stringify(back));
});

test("LC-05 two biomes' fine residencies active at once split one remainder: their art together never exceeds it", () => {
  const free = 8 * 1048576, total = 2 * (FIXED + SAFETY) + free;
  const arbiter = new CaveArbiter({ cpu: total, gpu: total });
  const base = { cm, cost: syntheticCost, budgetBytes: 0, fixedBytes: FIXED, speed: 11, shape: DART, gate: true, arbiter };
  const a = createSim({ ...base, id: "a", path: tour }), b = createSim({ ...base, id: "b", path: tour });
  let worst = 0, frames = 0, both = 0;
  while ((!a.done || !b.done) && frames < 4000) {
    if (!a.done) a.step();
    if (!b.done) b.step();
    frames++;
    const sum = a.fineBytes + b.fineBytes;
    worst = Math.max(worst, sum);
    if (a.fineBytes > 0 && b.fineBytes > 0) both++;
  }
  assert.ok(a.result().admittedFrame > 0 && b.result().admittedFrame > 0, "both biomes admitted");
  assert.ok(both > 500, `both fine residencies active together for ${both} frames`);
  assert.ok(worst <= free, `fine art together ${(worst / 1048576).toFixed(2)} MiB > the ${(free / 1048576).toFixed(0)} MiB remainder`);
  assert.ok(arbiter.committed().cpu <= total);
});
