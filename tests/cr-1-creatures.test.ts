/** CR-1: natural threat windows and creatures as resources.
 * A. Every threat has a natural, timed way through (feeding, resting); while an
 *    animal is busy it never harms, it breaks off an encounter, and afterwards
 *    ENC-1's warning ladder applies in full. Crossing inside a window is safe.
 * B. Grounds, catching, cooking, bait, the fish trap and planter feed conserve
 *    items, stay capped and loop-free, never touch protected animals, and load
 *    into older saves as additive content. */
import test from "node:test";
import assert from "node:assert/strict";
import { CHIMNEY_PULSE, CREST_SLACK, CREATURE_CYCLES, WORLD_CYCLES } from "../src/content/currents/cycles.js";
import { FIRST_STRIKE_SHARE } from "../src/content/ecology/encounter.js";
import { sitePosition } from "../src/content/ecology/sites.js";
import { THREATS, THREAT_ROSTER } from "../src/content/ecology/species.js";
import type { ThreatAgentId, ThreatSpeciesId } from "../src/content/ecology/species.js";
import { BAIT, COOKING, FERTILISER, NET_BONUS, TRAP } from "../src/content/fauna/items.js";
import {
  CARCASS_FALLS, FAUNA_IN_CAVE, FAUNA_RENEWAL, FAUNA_SOURCES, GROUNDS, HARVESTABLE_SPECIES, PROTECTED_SPECIES,
} from "../src/content/fauna/grounds.js";
import type { FaunaSourceId } from "../src/content/fauna/grounds.js";
import { HUNTER_FEEDING_SPOT, SKATE_LAYING_SITE, THREAT_WINDOWS, WINDOW_IDS, WINDOW_SPOTS } from "../src/content/fauna/windows.js";
import type { WindowId, WindowSpecies } from "../src/content/fauna/windows.js";
import { AUTHORED_CAVE_SOURCES } from "../src/content/regions/caves.js";
import { ROUTES } from "../src/content/regions/passages.js";
import { PLACES, RECIPES, SOURCES, SOURCE_RENEWAL, THREAT_HOME } from "../src/content/registry.js";
import type { SourceId } from "../src/content/registry.js";
import { SEEDS } from "../src/content/systems/cultivation.js";
import { createEnvelope, decodeSave } from "../src/save/codec.js";
import { sampleCycleAt, windows } from "../src/sim/cycles/cycle.js";
import { ecologyWorldFrom } from "../src/sim/ecology/adapter.js";
import { layerY } from "../src/sim/ecology/agents.js";
import { WARNING_LEAD } from "../src/sim/ecology/types.js";
import type { EcologyState, EcologyWorld, Stimulus } from "../src/sim/ecology/types.js";
import { cookCatch, cookPlan, feedPlanter, releaseBait } from "../src/sim/fauna/catch.js";
import { faunaCommand } from "../src/sim/fauna/link.js";
import { advanceTraps, emptyTrap, trapViews } from "../src/sim/fauna/trap.js";
import { layingSkates, windowBusy, windowOpen, windowSpot } from "../src/sim/fauna/windows.js";
import { updateThreat } from "../src/sim/hunterEncounter.js";
import { addItem } from "../src/sim/inventory.js";
import { collectWithOutcome, completeOpening } from "../src/sim/progression.js";
import { advanceRenewal } from "../src/sim/renewal.js";
import { createGame, makeVehicle } from "../src/sim/state.js";
import { stepGame } from "../src/sim/step.js";
import { installModule } from "../src/sim/systems/hosts.js";
import { plant } from "../src/sim/systems/cultivation.js";
import { validSystems } from "../src/sim/systems/state.js";
import type { GameEvent, GameState, Vec3 } from "../src/sim/types.js";
import { gameWorld } from "../src/sim/world.js";
import { agent, createEcology, cues, homeOf, run, stimulus, strikes } from "./ecology-support.js";
import { encoded } from "./persistence-support.js";

const meta = { sessionId: "cr-1-creatures-01", createdAt: "2026-10-22T00:00:00.000Z", savedAt: "2026-10-22T00:10:00.000Z" };
const opened = (): GameState => { const s = createGame(); completeOpening(s); return s; };
const count = (s: GameState, kind: string, container?: string): number =>
  s.inventory.items.filter((i) => i.kind === kind && (!container || i.containerId === container)).reduce((n, i) => n + i.quantity, 0);
const stock = (s: GameState, id: string): number => s.world.resources.find((r) => r.id === id)!.stock;
const roundTrip = (s: GameState): GameState => {
  const out = decodeSave(encoded(createEnvelope(s, meta)));
  assert.ok(out.ok, out.ok ? "" : out.error);
  return out.value.state;
};
/** First tick at or after `from` at which the window opens, and the tick it shuts. */
function windowAt(species: WindowSpecies, from = 60): { start: number; end: number } {
  let start = from;
  while (!(windowBusy(species, start) && !windowBusy(species, start - 1))) start++;
  let end = start;
  while (windowBusy(species, end)) end++;
  return { start, end };
}
const towards = (from: Vec3, to: Vec3): Vec3 => {
  const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z }, n = Math.hypot(d.x, d.y, d.z) || 1;
  return { x: d.x / n, y: d.y / n, z: d.z / n };
};
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
/** A path of points walked at `speed` m/s, with an optional dwell (seconds) at each. */
function walker(points: readonly { p: Vec3; dwell?: number }[], speed: number): (seconds: number) => Vec3 {
  return (t) => {
    let left = t;
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i]!, b = points[i + 1]!, leg = Math.hypot(b.p.x - a.p.x, b.p.y - a.p.y, b.p.z - a.p.z) / speed;
      if (left <= (a.dwell ?? 0)) return { ...a.p };
      left -= a.dwell ?? 0;
      if (left <= leg) return lerp(a.p, b.p, left / leg);
      left -= leg;
    }
    return { ...points.at(-1)!.p };
  };
}
/** A loud, lit diver looking at the nearest animal of the species: the worst case. */
function loud(p: Vec3, state: EcologyState, species: ThreatSpeciesId): Stimulus {
  const near = state.agents.filter((a) => THREAT_ROSTER[a.id].species === species)
    .sort((a, b) => Math.hypot(a.position.x - p.x, a.position.z - p.z) - Math.hypot(b.position.x - p.x, b.position.z - p.z))[0]!;
  return stimulus(p, { noise: 0.6, light: 0.9, facing: towards(p, near.position), velocity: { x: 0.8, y: 0, z: 0 } });
}

// ============================================================ A. natural windows
test("every threat has a natural window: about a minute's wait at most, long enough to cross, logged as a cycle", () => {
  // The skates' laying visit is a rarer extra window; their slack rest is the frequent one.
  const minOpen: Record<WindowId, number> = { canopy_sound_hunter: 56, glare_stalker: 36, layer_skate: 34, hollow_choir: 26, layer_skate_laying: 90 };
  for (const id of WINDOW_IDS) {
    const w = THREAT_WINDOWS[id], r = windows(w.cycle, (x) => w.busy.includes(x.phase));
    assert.ok(r.longestClosed <= (id === "layer_skate_laying" ? 300 : 62), `${id}: worst wait ${r.longestClosed} s`);
    assert.ok(r.shortestOpen >= minOpen[id], `${id}: window ${r.shortestOpen} s`);
    assert.ok(WORLD_CYCLES.includes(w.cycle), `${id}: its cycle is logged in the journal`);
    assert.ok(w.seenBusy.length < 200 && w.seenIdle.length < 200, `${id}: first-sight captions stay short`);
  }
  assert.equal(CREATURE_CYCLES.length, WINDOW_IDS.length);
  // The stalkers feed through every vent; the skates rest through every slack.
  for (let tick = 0; tick < 200 * 60; tick += 7) {
    if (sampleCycleAt(CHIMNEY_PULSE, tick).phase === "active") assert.ok(windowBusy("glare_stalker", tick), `stalkers feed while it vents (${tick})`);
    if (sampleCycleAt(CREST_SLACK, tick).phase === "quiet") assert.ok(windowBusy("layer_skate", tick), `skates rest in slack water (${tick})`);
  }
});

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

// ============================================================ B. grounds and catching
test("catching conserves fish: one by hand, one more with a net, never more than the school holds; it regathers to its cap", () => {
  const s = opened(), id: SourceId = "reef_fish_ribs";
  s.player.pose.position = { ...SOURCES[id].position }; s.player.mode = "swimming";
  const cap = SOURCES[id].stock;
  assert.equal(collectWithOutcome(s, id).refusal, null);
  assert.equal(count(s, "small_fish"), 1);
  assert.equal(stock(s, id), cap - 1);
  addItem(s, "hand_net", 1, "diver");
  collectWithOutcome(s, id);
  assert.equal(count(s, "small_fish"), 1 + 1 + NET_BONUS);
  assert.equal(stock(s, id), cap - 3);
  collectWithOutcome(s, id);
  assert.equal(count(s, "small_fish"), cap, "a net takes only what is left");
  assert.equal(stock(s, id), 0);
  assert.match(collectWithOutcome(s, id).refusal ?? "", /regathers/);
  assert.equal(count(s, "small_fish") + stock(s, id), cap, "conserved");
  const interval = FAUNA_RENEWAL.reef_fish_ribs.intervalSteps;
  for (let i = 0; i < interval * (cap + 3); i++) advanceRenewal(s);
  assert.equal(stock(s, id), cap, "regathers to its cap, never past it");
});

test("cooking is one interaction with portions: roe first, fish in pairs, totals conserved; refused away from a cooker", () => {
  const s = opened();
  addItem(s, "small_fish", 5, "diver"); addItem(s, "roe_cluster", 1, "diver");
  s.player.pose.position = { x: 40, y: -20, z: -60 }; s.player.mode = "swimming";
  assert.match(cookCatch(s, 1) ?? "", /cooker/);
  assert.equal(count(s, "small_fish"), 5);
  s.player.pose.position = { ...PLACES.home_pod.position };
  assert.equal(cookPlan(s, 99).maxPortions, COOKING.roe_cluster.meals + Math.floor(5 / COOKING.small_fish.raw));
  const meals = count(s, "meal");
  assert.equal(cookCatch(s, 3), null);
  assert.equal(count(s, "roe_cluster"), 0);
  assert.equal(count(s, "small_fish"), 3);
  assert.equal(count(s, "meal") - meals, COOKING.roe_cluster.meals + COOKING.small_fish.meals, "1 roe and 2 fish make 3 meals");
  assert.equal(count(s, "meal", "pod_locker"), 3, "meals land in the pod locker");
  assert.equal(cookCatch(s, 2), null);
  assert.equal(count(s, "small_fish"), 1, "an odd fish stays raw");
  assert.match(cookCatch(s, 1) ?? "", /Nothing to cook/);
  roundTrip(s);
});

test("the fish trap: wet hosts only; one fish per interval, capped; emptied in one interaction; kept through a save", () => {
  let s = opened();
  const trap = addItem(s, "mod_fish_trap", 1, "diver");
  // The island workshop stands on land: refused before SYS-2 sees it.
  assert.match(faunaCommand(s, { type: "install-host-module", hostId: "island_workshop", socket: "s0", itemId: trap.id }) ?? "", /dry land/);
  s.player.pose.position = { ...PLACES.home_pod.position }; s.player.mode = "swimming";
  assert.equal(installModule(s, s.systems, "home_pod", "s0", trap.id), null);
  advanceTraps(s, s.systems, TRAP.seconds - 1);
  assert.equal(trapViews(s, s.systems)[0]!.held, 0);
  advanceTraps(s, s.systems, 1);
  assert.equal(trapViews(s, s.systems)[0]!.held, 1);
  for (let i = 0; i < 3600; i++) advanceTraps(s, s.systems, 1);
  assert.equal(trapViews(s, s.systems)[0]!.held, TRAP.cap, "a full trap waits");
  s = roundTrip(s);
  assert.equal(trapViews(s, s.systems)[0]!.held, TRAP.cap);
  const before = count(s, "small_fish", "pod_locker");
  assert.equal(emptyTrap(s, s.systems, "home_pod", "s0"), null);
  assert.equal(count(s, "small_fish", "pod_locker") - before, TRAP.cap);
  assert.equal(trapViews(s, s.systems)[0]!.held, 0);
  const bad = structuredClone(s.systems); bad.traps[0]!.held = TRAP.cap + 1;
  assert.equal(validSystems(bad), false, "an over-full trap is refused");
});

test("planter feed grows a young crop once, at a cost of one feed", () => {
  const s = opened();
  const planter = addItem(s, "mod_planter", 1, "diver");
  s.player.pose.position = { ...PLACES.home_pod.position }; s.player.mode = "swimming";
  assert.equal(installModule(s, s.systems, "home_pod", "s1", planter.id), null);
  addItem(s, "seed_staple_cup", 1, "diver");
  assert.equal(plant(s, s.systems, "home_pod", "s1", "seed_staple_cup"), null);
  assert.match(feedPlanter(s, s.systems, "home_pod", "s1") ?? "", /Carry/);
  addItem(s, "planter_feed", 2, "diver");
  assert.equal(feedPlanter(s, s.systems, "home_pod", "s1"), null);
  assert.equal(s.systems.planters[0]!.progress, SEEDS.seed_staple_cup.growSeconds * FERTILISER.boost);
  assert.equal(count(s, "planter_feed"), 1);
  assert.match(feedPlanter(s, s.systems, "home_pod", "s1") ?? "", /young crop/, "a crop takes feed once");
  assert.equal(count(s, "planter_feed"), 1);
});

test("protected animals are never harvested; only the two common schools give fish or roe", () => {
  const harvest = new Set<string>(HARVESTABLE_SPECIES), protectedSpecies = new Set<string>(PROTECTED_SPECIES);
  for (const id of Object.keys(FAUNA_SOURCES) as FaunaSourceId[]) {
    const g = GROUNDS[id], def = SOURCES[id];
    if (g.kind === "fish" || g.kind === "roe") assert.ok(harvest.has(g.species), `${id}: ${g.species} is not a common school`);
    if (protectedSpecies.has(g.species)) {
      assert.equal(g.kind, "protected", `${id}: a protected animal's ground can only be looked at`);
      assert.equal(def.stock + def.reserve, 0, `${id} holds nothing`);
      assert.ok(!Object.hasOwn(SOURCE_RENEWAL, id), `${id} never regrows`);
    }
  }
  for (const species of [...Object.keys(THREATS), "canopy_sound_hunter"]) assert.ok(protectedSpecies.has(species), `${species} is protected`);
  const s = opened(), id: SourceId = "divide_skate_eggcases";
  s.player.pose.position = { ...SOURCES[id].position }; s.player.mode = "swimming";
  addItem(s, "suit_800", 1, "equipment", "suit");
  const items = JSON.stringify(s.inventory.items);
  assert.ok(collectWithOutcome(s, id).refusal);
  assert.equal(JSON.stringify(s.inventory.items), items, "nothing taken");
});

test("the creature economy is capped and loop-free", () => {
  // Nothing turns meals, feed or crops back into fish, roe or feed.
  for (const [id, r] of Object.entries(RECIPES))
    assert.ok(r.output !== "small_fish" && r.output !== "roe_cluster" && r.output !== "planter_feed", `${id} makes a creature resource`);
  for (const seed of Object.values(SEEDS)) assert.ok(!["small_fish", "roe_cluster", "planter_feed"].includes(seed.produce));
  // Per source, at its cap and best rate: no ground or trap feeds more than 8 meals an hour.
  const mealsPerHour = (raw: "small_fish" | "roe_cluster", perHour: number): number => perHour / COOKING[raw].raw * COOKING[raw].meals;
  for (const [id, r] of Object.entries(FAUNA_RENEWAL)) {
    const g = GROUNDS[id as FaunaSourceId];
    assert.ok(SOURCES[id as SourceId].stock <= 4 && r.quantity === 1, `${id} cap`);
    if (g.kind === "fish" || g.kind === "roe")
      assert.ok(mealsPerHour(g.kind === "fish" ? "small_fish" : "roe_cluster", 216_000 / r.intervalSteps) <= 8, `${id} feeds too fast`);
  }
  assert.ok(TRAP.cap <= 4 && mealsPerHour("small_fish", 3600 / TRAP.seconds) <= 8, "a trap feeds too fast");
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
    else if (id !== "canopy_roe_crowns") assert.ok(Math.min(above, support) >= 0.5 && Math.min(above, support) <= 2.6 || (support >= 0.5 && support <= 2.6), `${id} is ${above.toFixed(2)} m above the floor`);
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

test("additive content: a save from before CR-1 loads with New Game's grounds and no traps", () => {
  const env = JSON.parse(encoded(createEnvelope(opened(), meta)));
  const fauna = new Set(Object.keys(FAUNA_SOURCES));
  env.state.world.resources = env.state.world.resources.filter((r: { id: string }) => !fauna.has(r.id));
  env.state.world.renewal = env.state.world.renewal.filter((r: { id: string }) => !fauna.has(r.id));
  delete env.state.systems.traps;
  const out = decodeSave(JSON.stringify(env));
  assert.ok(out.ok, out.ok ? "" : out.error);
  for (const id of fauna) assert.equal(out.value.state.world.resources.find((r) => r.id === id)!.stock, SOURCES[id as SourceId].stock);
  assert.deepEqual(out.value.state.systems.traps, []);
});
