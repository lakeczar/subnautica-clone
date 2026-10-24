/** CR-1 (heavy): the long window simulations, the composed-world checks and
 * placement. Every threat breaks off when its window opens and nothing strikes
 * inside it; afterwards ENC-1's full ladder applies; crossings timed to a window
 * are never struck; the hunter's round, bait, first sight and the laying visit. */
import test from "node:test";
import { HUNTER_GEOMETRY } from "../src/content/encounterGeometry.js";
import { hunterRoundPath, inCameraView, layingPose, windowSample, HUNTER_ROUND_JOIN } from "../src/sim/fauna/windows.js";
import { SOLIDS, createWorldQueries, surfaceHeight, sweptHullClearance } from "../src/sim/world.js";
import type { WorldQueries } from "../src/sim/types.js";
import { secondsAt } from "../src/sim/cycles/cycle.js";
import { HUNTER_ENCOUNTER } from "../src/content/ecology/encounter.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createCelMaterial } from "../src/render/materials.js";
import { createFauna } from "../src/render/creatures/fauna.js";
import { CREATURE_CULL_DISTANCE, createCreatureLayer } from "../src/render/creatures/layer.js";
import { ecologyView } from "../src/sim/ecology/ecology.js";
import assert from "node:assert/strict";
import { FIRST_STRIKE_SHARE } from "../src/content/ecology/encounter.js";
import { sitePosition } from "../src/content/ecology/sites.js";
import { THREATS, THREAT_ROSTER } from "../src/content/ecology/species.js";
import type { ThreatAgentId, ThreatSpeciesId } from "../src/content/ecology/species.js";
import { BAIT } from "../src/content/fauna/items.js";
import {
  CARCASS_FALLS, FAUNA_IN_CAVE, FAUNA_SOURCES, GROUNDS, 
} from "../src/content/fauna/grounds.js";
import type { FaunaSourceId } from "../src/content/fauna/grounds.js";
import { HUNTER_FEEDING_CIRCLE, HUNTER_FEEDING_SPOT, HUNTER_ROUND_SPEED, SKATE_LAYING_SITE, THREAT_WINDOWS, WINDOW_SPOTS } from "../src/content/fauna/windows.js";
import { AUTHORED_CAVE_SOURCES } from "../src/content/regions/caves.js";
import { ROUTES } from "../src/content/regions/passages.js";
import { PLACES, SOURCES, THREAT_HOME } from "../src/content/registry.js";
import { ecologyWorldFrom } from "../src/sim/ecology/adapter.js";
import { layerY } from "../src/sim/ecology/agents.js";
import { WARNING_LEAD } from "../src/sim/ecology/types.js";
import type { EcologyWorld } from "../src/sim/ecology/types.js";
import { releaseBait } from "../src/sim/fauna/catch.js";
import { layingSkates, windowBusy, windowOpen, windowSpot } from "../src/sim/fauna/windows.js";
import { updateThreat } from "../src/sim/hunterEncounter.js";
import { addItem } from "../src/sim/inventory.js";
import { makeVehicle } from "../src/sim/state.js";
import { stepGame } from "../src/sim/step.js";
import type { GameEvent, GameState, Vec3 } from "../src/sim/types.js";
import { gameWorld } from "../src/sim/world.js";
import { agent, createEcology, cues, homeOf, run, stimulus, strikes } from "./ecology-support.js";
import { opened, count, roundTrip, windowAt, walker, loud } from "./cr-1-support.js";

const CASES: readonly { species: ThreatSpeciesId; id: ThreatAgentId; at: () => Vec3 }[] = [
  { species: "glare_stalker", id: "rift_stalker_passage", at: () => { const h = homeOf("rift_stalker_passage"); return { x: h.x, y: h.y, z: h.z + 7 }; } },
  { species: "layer_skate", id: "divide_skate_saddle", at: () => { const h = homeOf("divide_skate_saddle"); return { x: h.x + 4, y: layerY("divide_dense_layer") + 1, z: h.z }; } },
  { species: "hollow_choir", id: "district_choir_gallery", at: () => { const h = homeOf("district_choir_gallery"); return { x: h.x + 8, y: h.y + 1, z: h.z }; } },
];
for (const c of CASES) test(`${c.species}: engaged when its window opens, it breaks off; nothing strikes in the window; the full ladder applies after`, () => {
  const { start, end } = windowAt(c.species, 30 * 60), def = THREATS[c.species], p = c.at();
  // Arrive at whichever lead time leaves the animal engaged as the window opens.
  let found: { log: ReturnType<typeof run>; modes: Map<number, string[]> } | null = null;
  for (const lead of [20, 16, 12, 9, 7, 5, 4, 3]) {
    const state = createEcology(), modes = new Map<number, string[]>(), mine = new Map<number, string>();
    // Long enough after the window for a sated animal's refractory to lapse.
    const log = run(state, end - start + (lead + 50) * 60, (tick, st) => {
      modes.set(tick, st.agents.filter((a) => THREAT_ROSTER[a.id].species === c.species).map((a) => a.mode));
      mine.set(tick, agent(st, c.id).mode);
      return loud(p, st, c.species);
    }, { start: start - lead * 60 });
    if (["alert", "investigate", "commit"].includes(mine.get(start - 1)!)) { found = { log, modes }; break; }
  }
  assert.ok(found, "premise: some arrival leaves it engaged as the window opens");
  const { log, modes } = found;
  const own = cues(log, c.id);
  assert.ok(own.some((e) => e.tick >= start && e.tick < start + 3 && e.cue === "feed"), "breaks off with its window caption");
  assert.equal(strikes(log).filter((x) => x.tick >= start && x.tick < end).length, 0, "nothing strikes inside the window");
  for (let tick = start + 2; tick < end; tick++)
    assert.ok(modes.get(tick)!.every((m) => m === "rest" || m === "withdraw"), `busy at ${tick}: ${modes.get(tick)}`);
  const alert = own.find((e) => e.tick >= end && e.cue === "alert");
  assert.ok(alert, "premise: the animal is real again after its window");
  const strike = strikes(log, c.id).find((x) => x.tick >= end);
  if (strike) {
    assert.ok((strike.tick - alert.tick) / 60 >= WARNING_LEAD, `first harm ${((strike.tick - alert.tick) / 60).toFixed(1)} s after the warning`);
    // A window pauses an encounter without refreshing it: softer only if no strike had landed yet.
    assert.ok(strike.loss <= def.strike.diver + 1e-9 && strike.loss >= def.strike.diver * FIRST_STRIKE_SHARE - 1e-9, "an ordinary strike, never more");
  }
});

/** Each crossing starts as the window opens, at a quiet diver's 2 m/s, loud and lit. */
const CROSSINGS: readonly { species: ThreatSpeciesId; path: () => { p: Vec3; dwell?: number }[] }[] = [
  { species: "glare_stalker", path: () => {
    // Into the warm passage to the stalker's own ground, 6 s of work, and out.
    const c = sitePosition({ site: "rift_split_chimney", offset: { x: 0, y: 0, z: 0 } });
    const mouth = { x: c.x - 52, y: c.y + 8, z: c.z }, work = { x: c.x - 26, y: c.y + 8, z: c.z + 2 };
    return [{ p: mouth }, { p: work, dwell: 6 }, { p: mouth }];
  } },
  { species: "layer_skate", path: () => {
    // A 60 m chord a metre over the mirror above the skate's home, then up and away.
    const h = homeOf("divide_skate_saddle"), y = layerY("divide_dense_layer") + 1;
    return [{ p: { x: h.x - 30, y, z: h.z } }, { p: { x: h.x + 30, y, z: h.z } }, { p: { x: h.x + 30, y: y + 10, z: h.z } }];
  } },
  { species: "hollow_choir", path: () => {
    // Straight through the bells' reach and out the far side.
    const h = homeOf("district_choir_gallery");
    return [{ p: { x: h.x - 26, y: h.y + 1, z: h.z } }, { p: { x: h.x + 26, y: h.y + 1, z: h.z } }, { p: { x: h.x + 44, y: h.y + 1, z: h.z } }];
  } },
];
for (const c of CROSSINGS) test(`${c.species}: timed to its window, a loud lit diver crosses and is never struck`, () => {
  const { start } = windowAt(c.species, 30 * 60), at = walker(c.path(), 2), state = createEcology();
  const log = run(state, 70 * 60, (tick, st) => loud(at((tick - start) / 60), st, c.species), { start });
  assert.deepEqual(strikes(log), [], `${c.species} struck a well-timed crossing`);
});

test("in the composed world each animal reaches its feeding or resting place inside its window", () => {
  const world: EcologyWorld = ecologyWorldFrom(gameWorld(), []);
  for (const species of ["glare_stalker", "layer_skate"] as const) {
    const { start, end } = windowAt(species, 30 * 60), state = createEcology(), mid = start + Math.floor((end - start) * 0.7);
    // Far but within activation, silent and dark: only the window moves them.
    const ids = state.agents.filter((a) => THREAT_ROSTER[a.id].species === species).map((a) => a.id);
    const quiet = { ...homeOf(ids[0]!), y: homeOf(ids[0]!).y + 90 };
    run(state, mid - start + 60, () => stimulus(quiet, { noise: 0, light: 0 }), { start: start - 60, world });
    for (const id of ids) {
      const spot = windowSpot(id, homeOf(id), mid + 59)!, a = agent(state, id);
      const d = Math.hypot(a.position.x - spot.x, a.position.y - spot.y, a.position.z - spot.z);
      assert.ok(d <= 4.5, `${id} is ${d.toFixed(1)} m from its window place`);
    }
  }
  assert.equal(WINDOW_SPOTS.district_choir_gallery, "stay");
});

test("the skates' laying visit: they leave the mirror for the lee shelf, are seen laying there, and the egg cases stay protected", () => {
  let start = 60;
  while (!(windowOpen("layer_skate_laying", start) && !windowOpen("layer_skate_laying", start - 1))) start++;
  assert.ok(windowBusy("layer_skate", start + 30 * 60), "the skates are busy while laying");
  const mid = layingSkates(start + 40 * 60);
  assert.equal(mid.length, 2);
  for (const k of mid) assert.ok(Math.hypot(k.position.x - SKATE_LAYING_SITE.x, k.position.z - SKATE_LAYING_SITE.z) <= 6, "laying at the egg cases");
  assert.deepEqual(layingSkates(start - 60), [], "no laying skates outside the visit");
  const eggs = SOURCES.divide_skate_eggcases.position;
  assert.ok(Math.hypot(eggs.x - SKATE_LAYING_SITE.x, eggs.z - SKATE_LAYING_SITE.z) < 1 && SKATE_LAYING_SITE.y > layerY("divide_dense_layer") + 40, "on the lee shelf, above the brine");
  // A loud lit diver over the saddle's mirror through the visit is never struck.
  const state = createEcology(), h = homeOf("divide_skate_saddle"), y = layerY("divide_dense_layer") + 1;
  const at = walker([{ p: { x: h.x - 40, y, z: h.z } }, { p: { x: h.x + 40, y, z: h.z } }], 1);
  const log = run(state, 85 * 60, (tick, st) => loud(at((tick - start) / 60), st, "layer_skate"), { start });
  assert.deepEqual(strikes(log), []);
});

function hunterGame(tick: number): GameState {
  const s = opened(); s.tick = tick;
  addItem(s, "suit_150", 1, "equipment", "suit");
  const lab = PLACES.canopy_lab.position, at = { x: lab.x + 6, y: lab.y + 4, z: lab.z + 4 };
  const v = makeVehicle("cr1-dart", "dart", at, "cr1-hold");
  s.fleet.vehicles.push(v); s.player.controlledVehicleId = v.id; s.player.mode = "piloting"; s.player.pose.position = { ...at };
  return s;
}
test("the sound hunter's feeding round: no warning or bite all round, it feeds east, and the full ladder resumes after", () => {
  const { start, end } = windowAt("canopy_sound_hunter", 60 * 60), s = hunterGame(start), world = gameWorld(), events: GameEvent[] = [];
  let nearest = Infinity;
  for (; s.tick < end; s.tick++) {
    updateThreat(s, 0.9, events, world);
    nearest = Math.min(nearest, Math.hypot(s.world.threat.position.x - HUNTER_FEEDING_SPOT.x, s.world.threat.position.z - HUNTER_FEEDING_SPOT.z));
    assert.equal(s.world.threat.mode, "idle", `tick ${s.tick}`);
  }
  assert.ok(nearest < 6, `fed at the east shoal (closest ${nearest.toFixed(1)} m)`);
  assert.equal(events.filter((e) => e.type === "threat-damage").length, 0);
  assert.equal(events.filter((e) => e.type === "notice" && e.context === "threat").length, 0, "no warning while it feeds");
  const home = Math.hypot(s.world.threat.position.x - THREAT_HOME.x, s.world.threat.position.z - THREAT_HOME.z);
  assert.ok(home < 4, `home again when the round ends (${home.toFixed(1)} m)`);
  // Still loud at the lab: it warns, passes, then the first contact is the bump.
  const after: GameEvent[] = [];
  let warned = -1, bitten = -1;
  for (let i = 0; i < 40 * 60; i++, s.tick++) {
    const n = after.length;
    updateThreat(s, 0.9, after, world);
    for (const e of after.slice(n)) {
      if (warned < 0 && e.type === "notice" && e.context === "threat") warned = s.tick;
      if (bitten < 0 && e.type === "threat-damage") { bitten = s.tick; assert.equal(e.loss, 6, "the first contact is the warning bump"); }
    }
  }
  assert.ok(warned >= 0, "premise: it hunts again");
  if (bitten >= 0) assert.ok((bitten - warned) / 60 >= WARNING_LEAD, "the ladder gives warning before harm");
});

test("a hunter in pursuit when its round begins breaks off with a caption and never bites during the round", () => {
  const { start, end } = windowAt("canopy_sound_hunter", 60 * 60), s = hunterGame(start - 1), world = gameWorld(), events: GameEvent[] = [];
  const p = s.player.pose.position;
  s.world.threat = { mode: "pursue", position: { x: p.x + 6, y: p.y, z: p.z }, interest: 7, modeSeconds: 2.5, distraction: null, distractionSeconds: 0 };
  for (; s.tick < end; s.tick++) updateThreat(s, 0.9, events, world);
  assert.ok(events.some((e) => e.type === "notice" && e.message === THREAT_WINDOWS.canopy_sound_hunter.breakOff));
  assert.equal(events.filter((e) => e.type === "threat-damage" && e.source === "hunter").length, 0);
});

test("first sight of a window names it once and starts its journal timing", () => {
  let s = opened();
  const { start } = windowAt("glare_stalker", 30 * 60), c = sitePosition({ site: "rift_split_chimney", offset: { x: -60, y: 10, z: 0 } });
  s.player.pose.position = { ...c }; s.player.mode = "swimming"; s.player.lamp = false; s.tick = start + 60;
  const seen: string[] = [];
  for (let i = 0; i < 120; i++) {
    const r = stepGame(s, [{ type: "move", forward: 0, right: 0, vertical: 0, sprint: false }], gameWorld());
    s = r.state;
    for (const e of r.events)
      if (e.type === "notice" && (e.message === THREAT_WINDOWS.glare_stalker.seenBusy || e.message === THREAT_WINDOWS.glare_stalker.seenIdle)) seen.push(e.message);
  }
  assert.deepEqual(seen, [THREAT_WINDOWS.glare_stalker.seenBusy]);
  assert.ok(s.knowledge.cycles.some((r) => r.cycleId === THREAT_WINDOWS.glare_stalker.cycle.id));
});

// ============================================================ bait
test("bait: one fish released ahead sinks; a stalker feeds on it instead of striking; no fish, no change", () => {
  const s = opened();
  s.player.mode = "swimming";
  assert.match(releaseBait(s) ?? "", /No small fish/);
  assert.equal(s.world.ecology.deterrents.length, 0);
  addItem(s, "small_fish", 2, "diver");
  s.player.pose.position = { x: 0, y: -6, z: -10 }; s.player.mode = "swimming"; s.player.pose.yaw = 0;
  assert.equal(releaseBait(s), null);
  assert.equal(count(s, "small_fish"), 1);
  const d = s.world.ecology.deterrents[0]!;
  assert.equal(d.kind, "bait");
  assert.ok(Math.abs(d.position.z - -18) < 1e-9, "eight metres ahead");
  assert.equal(roundTrip(s).world.ecology.deterrents[0]!.kind, "bait", "bait survives a save");
  // In the warm passage, a stalker investigating a loud lit diver turns to bait and never strikes while it feeds.
  const state = createEcology(), h = homeOf("rift_stalker_passage"), p = { x: h.x, y: h.y, z: h.z + 7 };
  const from = windowAt("glare_stalker", 30 * 60).end + 60, drop = from + 8 * 60;
  const bait = { x: h.x - 10, y: h.y, z: h.z - 6 };
  let nearest = Infinity;
  const log = run(state, 30 * 60, (tick, st) => {
    const a = agent(st, "rift_stalker_passage");
    if (tick > drop) nearest = Math.min(nearest, Math.hypot(a.position.x - bait.x, a.position.z - bait.z));
    return loud(p, st, "glare_stalker");
  }, {
    start: from, commands: (tick) => tick === drop ? [{ type: "deploy", kind: "bait", position: bait }] : [],
  });
  assert.equal(strikes(log).filter((x) => x.tick >= drop && x.tick < drop + BAIT.seconds * 60).length, 0, "no strike while it feeds on bait");
  assert.ok(nearest < 6, `it went to feed on the bait (closest ${nearest.toFixed(1)} m)`);
});

test("bait turns a resident sound hunter, but not one already away feeding", () => {
  const { start, end } = windowAt("canopy_sound_hunter", 60 * 60);
  const s = hunterGame(end + 60);
  addItem(s, "small_fish", 2, s.fleet.vehicles[0]!.cargoId);
  assert.equal(releaseBait(s), null);
  assert.ok(s.world.threat.distraction && s.world.threat.distractionSeconds === BAIT.seconds, "a resident hunter goes to feed on it");
  const busy = hunterGame(start + 60);
  addItem(busy, "small_fish", 1, busy.fleet.vehicles[0]!.cargoId);
  assert.equal(releaseBait(busy), null);
  assert.equal(busy.world.threat.distraction, null, "a feeding hunter ignores it");
});

// ============================================================ placement and saves
test("grounds sit on the composed floor outside every cave; carcass falls stand off routes", () => {
  const w = gameWorld();
  for (const [id, g] of Object.entries(FAUNA_SOURCES)) {
    const p = g.position, above = p.y - w.groundHeight(p.x, p.z);
    // Schools hold in open water; the crown roe hangs on crown fronds; the rest lie on the bed
    // (or on a ledge above it: the ray egg cases sit on the crown's rock).
    const support = p.y - w.supportHeight(p.x, p.z, p.y + 0.5);
    if (GROUNDS[id as FaunaSourceId].kind === "fish") assert.ok(above >= 0.5 && above <= 25, `${id} is ${above.toFixed(2)} m above the floor`);
    // The crawler moults lie on the kiln tube's own floor (CA-3), not the terrain.
    else if (id !== "canopy_roe_crowns" && !FAUNA_IN_CAVE[id as FaunaSourceId]) assert.ok(Math.min(above, support) >= 0.5 && Math.min(above, support) <= 2.6 || (support >= 0.5 && support <= 2.6), `${id} is ${above.toFixed(2)} m above the floor`);
    for (const c of AUTHORED_CAVE_SOURCES.filter((c) => (FAUNA_IN_CAVE as Record<string, string | undefined>)[id] !== c.id)) {
      const f = c.footprint;
      assert.ok(!(p.x >= f.minX - 4 && p.x <= f.maxX + 4 && p.z >= f.minZ - 4 && p.z <= f.maxZ + 4), `${id} in or at cave ${c.id}`);
    }
  }
  // Level distance: land walks carry no height, and a fall must be off a route at any depth.
  const seg = (p: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }): number => {
    const ab = { x: b.x - a.x, z: b.z - a.z }, n = ab.x ** 2 + ab.z ** 2;
    const t = n ? Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.z - a.z) * ab.z) / n)) : 0;
    return Math.hypot(p.x - a.x - ab.x * t, p.z - a.z - ab.z * t);
  };
  for (const [id, f] of Object.entries(CARCASS_FALLS)) {
    for (const r of ROUTES) for (let i = 0; i + 1 < r.path.length; i++)
      assert.ok(seg(f.position, r.path[i]!, r.path[i + 1]!) >= 30, `${id} is on route ${r.id}`);
    assert.ok(["silt_basin", "brine_divide"].includes(f.region));
    for (const s of f.salvage) assert.ok(Math.hypot(SOURCES[s].position.x - f.position.x, SOURCES[s].position.z - f.position.z) < 12, `${s} at ${id}`);
  }
});


test("the hunter's authored round is open water: its hull swept along every leg it can take and the whole feeding circle", () => {
  const world = gameWorld(), shape = HUNTER_GEOMETRY.worldEnvelope, r = HUNTER_FEEDING_CIRCLE.radius;
  // The circle's point depends only on its angle, so one turn covers every phase of it.
  const circle = (a: number): Vec3 => ({ x: HUNTER_FEEDING_SPOT.x + Math.cos(a) * r, y: HUNTER_FEEDING_SPOT.y + Math.sin(a * 2) * 0.8, z: HUNTER_FEEDING_SPOT.z + Math.sin(a) * r });
  let away = 0; while (windowSample("canopy_sound_hunter", away).phase !== "away") away++;
  const a0 = (secondsAt(away) / HUNTER_FEEDING_CIRCLE.period) * Math.PI * 2;
  assert.ok(Math.hypot(circle(a0).x - hunterRoundPath(away).x, circle(a0).y - hunterRoundPath(away).y, circle(a0).z - hunterRoundPath(away).z) < 1e-9, "premise: the round's circle");
  const angles = Array.from({ length: 181 }, (_, i) => (i / 180) * Math.PI * 2);
  assert.ok(sweptHullClearance(world, angles.map(circle), shape), "the whole feeding circle");
  // Each leg runs straight between home and wherever the circle is at the phase edge: every such leg, 2° apart.
  for (const a of angles) assert.ok(sweptHullClearance(world, [THREAT_HOME, circle(a)], shape), `the leg to ${(a * 180 / Math.PI).toFixed(0)}°`);
});

test("the round's path never moves farther in a step than the hunter can follow it, over every phase of round and circle", () => {
  // The 101 s round and the 9 s circle line up again after 909 s.
  for (let tick = 1; tick <= 909 * 60; tick++) {
    const a = hunterRoundPath(tick - 1), b = hunterRoundPath(tick), d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    assert.ok(d < HUNTER_ROUND_JOIN, `the path moves ${d.toFixed(3)} m at tick ${tick}`);
  }
});

/** Ticks a pursuing hunter through its round's break-off from tick 2,699 for 57 s,
 * as Sol R1 reproduced it. Returns every step and the tick it joined its round. */
function rejoin(world: WorldQueries, offset: Vec3, near?: { from: number; to: number }) {
  const s = opened(), p = { x: THREAT_HOME.x + offset.x, y: THREAT_HOME.y + offset.y, z: THREAT_HOME.z + offset.z };
  s.player.mode = "swimming"; s.player.pose.position = { ...p }; s.player.lamp = true;
  s.world.threat = { ...s.world.threat, mode: "pursue", position: { x: p.x + 8, y: p.y, z: p.z }, interest: 4, modeSeconds: 2.5, distraction: null, distractionSeconds: 0 };
  s.tick = 45 * 60 - 1;
  const events: GameEvent[] = [], steps: { tick: number; from: Vec3; to: Vec3; mode: string }[] = [];
  let joined = -1;
  for (let i = 0; i < 57 * 60; i++, s.tick++) {
    // Optionally a diver comes within 20 m of the hunter on its round, then leaves again.
    if (near && s.tick === near.from) s.player.pose.position = { ...s.world.threat.position, z: s.world.threat.position.z + 20 };
    if (near && s.tick === near.to) s.player.pose.position = { ...p };
    const from = { ...s.world.threat.position };
    updateThreat(s, 0.9, events, world);
    steps.push({ tick: s.tick, from, to: { ...s.world.threat.position }, mode: s.world.threat.mode });
    const q = hunterRoundPath(s.tick), off = Math.hypot(q.x - s.world.threat.position.x, q.y - s.world.threat.position.y, q.z - s.world.threat.position.z);
    if (joined < 0 && s.world.threat.mode === "idle" && off <= HUNTER_ROUND_JOIN) joined = s.tick;
    // On its round until the round ends; home again, it hears the loud diver as usual.
    if (joined >= 0 && windowBusy("canopy_sound_hunter", s.tick)) assert.ok(off <= HUNTER_ROUND_JOIN + 1e-9, `left its round by ${off.toFixed(3)} m at tick ${s.tick}`);
  }
  return { steps, joined, damage: events.filter((e) => e.type === "threat-damage") };
}
/** The fastest any swept hunter move goes in one step. */
const HUNTER_STEP = Math.max(HUNTER_GEOMETRY.yieldSpeed, HUNTER_GEOMETRY.approachSpeed, HUNTER_ENCOUNTER.pass.closeSpeed, HUNTER_ROUND_SPEED) / 60 + 1e-6;

test("a hunter breaking off as its round begins swims onto the round: never a step longer than its fastest swim, and on it until the round ends", () => {
  const world = gameWorld();
  for (const offset of [{ x: -20, y: 0, z: 0 }, { x: 0, y: 5, z: 30 }, { x: 0, y: 10, z: -30 }]) {
    const r = rejoin(world, offset);
    for (const st of r.steps) {
      const d = Math.hypot(st.to.x - st.from.x, st.to.y - st.from.y, st.to.z - st.from.z);
      assert.ok(d <= HUNTER_STEP, `${JSON.stringify(offset)}: ${st.mode} step of ${d.toFixed(3)} m at tick ${st.tick}`);
    }
    assert.ok(r.steps.some((st) => st.mode === "disengage") && r.joined > 0, `${JSON.stringify(offset)}: broke off, then joined its round`);
    assert.ok(windowSample("canopy_sound_hunter", r.joined).phase !== "returning", "it is on its round while still feeding");
    assert.equal(r.damage.length, 0);
  }
  // A diver crossing within 30 m of the joined hunter and out again: the swept
  // move takes over and hands back, and the hunter never leaves its path.
  const first = rejoin(world, { x: 0, y: 5, z: 30 });
  const near = { from: first.joined + 120, to: first.joined + 240 };
  assert.ok(windowSample("canopy_sound_hunter", near.to).phase === "away", "premise: crossing while it feeds");
  const crossed = rejoin(world, { x: 0, y: 5, z: 30 }, near);
  assert.equal(crossed.joined, first.joined);
});

test("rejoining its round, the hunter is swept: rock across the way stops it rather than being crossed", () => {
  // Rock 1 m thick across the chord from where the hunter turns idle to its round's point then.
  const open = rejoin(gameWorld(), { x: 0, y: 5, z: 30 }), idle = open.steps.find((st) => st.mode === "idle")!;
  const q = hunterRoundPath(idle.tick), m = { x: (idle.from.x + q.x) / 2, y: (idle.from.y + q.y) / 2, z: (idle.from.z + q.z) / 2 };
  const along = Math.abs(q.x - idle.from.x) >= Math.abs(q.z - idle.from.z) ? "x" : "z";
  const half = { x: along === "x" ? 0.5 : 20, y: 20, z: along === "z" ? 0.5 : 20 };
  const wall = { id: "test.rejoin_wall", min: { x: m.x - half.x, y: m.y - half.y, z: m.z - half.z }, max: { x: m.x + half.x, y: m.y + half.y, z: m.z + half.z } };
  assert.ok(Math.hypot(q.x - idle.from.x, q.z - idle.from.z) > 2, "premise: the hunter turns idle off its round");
  const walled = rejoin(createWorldQueries([...SOLIDS, wall], surfaceHeight), { x: 0, y: 5, z: 30 });
  for (const st of walled.steps) {
    const d = Math.hypot(st.to.x - st.from.x, st.to.y - st.from.y, st.to.z - st.from.z);
    assert.ok(d <= HUNTER_STEP, `step of ${d.toFixed(3)} m at tick ${st.tick}`);
    assert.ok(!segmentHitsBox(st.from, st.to, wall), `crossed the rock at tick ${st.tick}`);
  }
});
/** Whether the segment a→b passes through the box (slab test). */
function segmentHitsBox(a: Vec3, b: Vec3, box: { min: Vec3; max: Vec3 }): boolean {
  let t0 = 0, t1 = 1;
  for (const k of ["x", "y", "z"] as const) {
    const d = b[k] - a[k];
    if (Math.abs(d) < 1e-12) { if (a[k] < box.min[k] || a[k] > box.max[k]) return false; continue; }
    let lo = (box.min[k] - a[k]) / d, hi = (box.max[k] - a[k]) / d;
    if (lo > hi) [lo, hi] = [hi, lo];
    t0 = Math.max(t0, lo); t1 = Math.min(t1, hi);
    if (t0 > t1) return false;
  }
  return true;
}

test("laying stand-ins: their real transforms never jump while watched, across the end of a visit and into the next", () => {
  const engine = new NullEngine();
  try {
    const scene = new Scene(engine), cel = createCelMaterial(scene), fauna = createFauna(scene, cel);
    const eye = { x: 424, y: -375, z: -1080 }, cam = new FreeCamera("test.camera", new Vector3(eye.x, eye.y, eye.z), scene);
    scene.activeCamera = cam;
    const look = (dz: number): void => { cam.setTarget(new Vector3(eye.x, eye.y, eye.z + dz)); cam.getViewMatrix(true); };
    const near = (p: Vec3, c: Vec3 | undefined): boolean => !c || Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z) <= CREATURE_CULL_DISTANCE;
    const s = opened(), node = scene.getTransformNodeByName("fauna.laying_skate.0")!;
    let start = 60; while (!(windowOpen("layer_skate_laying", start) && !windowOpen("layer_skate_laying", start - 1))) start++;
    let end = start; while (windowOpen("layer_skate_laying", end)) end++;
    const next = start + 360 * 60;
    const frame = (tick: number) => { s.tick = tick; fauna.update(s, tick / 60, eye, near); return { at: node.position.clone(), on: node.isEnabled() }; };
    // Turned away as the visit begins: the stand-in comes in unseen. Then watch it.
    look(50); assert.equal(frame(start).on, true, "it comes while unseen");
    look(-50);
    const watched = (from: number, to: number, label: string): void => {
      let last = frame(from);
      for (let tick = from + 1; tick <= to; tick++) {
        const now = frame(tick);
        assert.ok(now.on, `${label}: still shown at tick ${tick}`);
        assert.ok(now.at.subtract(last.at).length() < 0.1, `${label}: moves ${now.at.subtract(last.at).length().toFixed(3)} m at tick ${tick}`);
        last = now;
      }
    };
    watched(start, end + 600, "the end of the visit");
    assert.ok(inCameraView(eye, { x: 0, y: 0, z: -1 }, layingPose(end, 0).position), "premise: in view across the end");
    for (let tick = end + 1200; tick < next - 600; tick += 1200) assert.ok(frame(tick).on, "held while in view");
    watched(next - 600, next + 600, "the next visit");
    assert.ok(inCameraView(eye, { x: 0, y: 0, z: -1 }, layingPose(next, 0).position), "premise: in view across the start");
    // Turned away, the held stand-in goes; it never went in view.
    look(50); assert.equal(frame(next + 360 * 60 - 1).on, false, "gone once unseen after its visit");
    fauna.dispose(); scene.dispose();
  } finally { engine.dispose(); }
});

test("creature cues show and hide with their animal: none by the pod, a resting skate's outline on the mirror, gone when culled", () => {
  const engine = new NullEngine();
  try {
    const scene = new Scene(engine), cel = createCelMaterial(scene), layer = createCreatureLayer(scene, cel);
    const s = opened(), pod = PLACES.home_pod.position;
    const animal = (m: { name: string }): boolean => /^(creature\.(layer_skate|hollow_choir|glare_stalker)|fauna\.laying_skate)/.test(m.name);
    const lit = (): string[] => layer.meshes.filter((m) => animal(m) && m.isEnabled()).map((m) => m.name);
    // The pod at tick 0: no animal and no world-space cue anywhere (no laying visit has ever happened).
    s.tick = 0; layer.update(ecologyView(s.world.ecology, 0, null), 0, pod, s);
    assert.deepEqual(lit(), [], "nothing shows by the pod");
    // A skate resting under the mirror, watched from the crest: its outline shows.
    const { start } = windowAt("layer_skate");
    const skate = s.world.ecology.agents.find((a) => a.id === "divide_skate_saddle")!, home = homeOf("divide_skate_saddle");
    skate.position = windowSpot("divide_skate_saddle", home, start + 600)!;
    const crest = { x: home.x - 30, y: layerY("divide_dense_layer") + 12, z: home.z };
    for (let k = 0; k < 60; k++) { s.tick = start + 600 + k; layer.update(ecologyView(s.world.ecology, s.tick, null), s.tick / 60, crest, s); }
    const outline = layer.meshes.find((m) => m.name === "creature.layer_skate.divide_skate_saddle.rest-outline")!;
    assert.ok(outline.isEnabled(), "the resting skate's outline shows");
    // Back at the pod: the culled skate takes its outline with it.
    layer.update(ecologyView(s.world.ecology, s.tick, null), s.tick / 60, pod, s);
    assert.equal(outline.isEnabled(), false, "culled with its animal");
    assert.deepEqual(lit(), []);
    layer.dispose(); scene.dispose();
  } finally { engine.dispose(); }
});
