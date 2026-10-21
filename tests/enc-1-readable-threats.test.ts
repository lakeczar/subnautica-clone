/** ENC-1: threats you can see and read. The Canopy sound hunter warns, makes a
 * silhouette pass across the bow and only then pursues; its first contact is a
 * non-lethal warning bump and later bites ramp; quiet, a dark lamp and retreat
 * always end it. Ecology threats lunge from where they were seen, softer first.
 * Every engaged threat has a directional edge cue beside its caption. */
import test from "node:test";
import assert from "node:assert/strict";
import { HUNTER_ENCOUNTER as E, FIRST_STRIKE_SHARE } from "../src/content/ecology/encounter.js";
import { HUNTER_GEOMETRY as H } from "../src/content/encounterGeometry.js";
import { THREATS } from "../src/content/ecology/species.js";
import { CANOPY_BASIN_ROUTE } from "../src/content/routes.js";
import { THREAT_HOME } from "../src/content/registry.js";
import type { HullId } from "../src/content/registry.js";
import { createGame, makeVehicle } from "../src/sim/state.js";
import { completeOpening } from "../src/sim/progression.js";
import { addItem } from "../src/sim/inventory.js";
import { stepGame } from "../src/sim/step.js";
import { createWorldQueries } from "../src/sim/world.js";
import { hunterStandOff } from "../src/sim/hunter.js";
import { approachCaption, HUNTER_CAPTIONS, hunterBody, updateThreat, viewAngle } from "../src/sim/hunterEncounter.js";
import { homeOf, SEEN_CONE, UNSEEN_COMMIT_DELAY } from "../src/sim/ecology/agents.js";
import { edgePoint, hunterBanner, threatCues, ThreatEdgeView } from "../src/ui/threatCue.js";
import type { GameCommand, GameEvent, GameState, Vec3 } from "../src/sim/types.js";
import { agent, createEcology, cues, offset, run, stimulus, strikes } from "./ecology-support.js";

const world = createWorldQueries(), empty = createWorldQueries([], () => -250);
type Bite = Extract<GameEvent, { type: "threat-damage" }>;
const bites = (events: readonly GameEvent[]): Bite[] => events.filter((e): e is Bite => e.type === "threat-damage");
const health = (s: GameState): number => s.fleet.vehicles.find(v => v.id === s.player.controlledVehicleId)?.health ?? s.player.vitals.health;

/** An actor at the hunter's home in pursuit, the animal at its stand-off. */
function pursuit(hull: HullId | null, hp = 100): GameState {
  const s = createGame(); completeOpening(s); s.tick = 16;
  addItem(s, "suit_150", 1, "equipment", "suit");
  s.player.pose.position = { x: 132, y: -110, z: -112 };
  s.player.mode = hull ? "piloting" : "swimming";
  if (hull) {
    const v = makeVehicle("enc1-hull", hull, s.player.pose.position, "enc1-hold");
    v.health = hp; s.fleet.vehicles.push(v); s.player.controlledVehicleId = v.id;
  } else s.player.vitals.health = hp;
  s.world.threat = { mode: "pursue", position: { x: 147, y: -110, z: -112 }, interest: E.interest.max, modeSeconds: 0, distraction: null, distractionSeconds: 0 };
  s.world.threat.position = hunterStandOff(s);
  return s;
}

/** A craft (or diver) flown along the authored Reef → Canopy route with ordinary commands. */
function fly(hull: HullId, react: (s: GameState) => { quiet?: boolean; lamp?: boolean; retreat?: boolean } = () => ({}), seconds = 60) {
  let s = createGame(); completeOpening(s); addItem(s, "suit_150", 1, "equipment", "suit");
  const pts = CANOPY_BASIN_ROUTE.upper, v = makeVehicle("enc1-craft", hull, { ...pts[0]! }, "enc1-hold");
  s.fleet.vehicles.push(v); s.player.controlledVehicleId = v.id; s.player.mode = "piloting"; s.player.pose.position = { ...pts[0]! };
  let k = 1, retreating = false;
  const log: { tick: number; mode: string; hp: number; view: number; distance: number; events: GameEvent[] }[] = [];
  for (let i = 0; i < seconds * 60; i++) {
    const want = react(s);
    if (want.retreat) retreating = true;
    const target = retreating ? pts[0]! : pts[Math.min(k, pts.length - 1)]!, p = s.player.pose.position;
    const dx = target.x - p.x, dy = target.y - p.y, dz = target.z - p.z, h = Math.hypot(dx, dz);
    if (!retreating && Math.hypot(dx, dy, dz) < 3 && k < pts.length - 1) k++;
    const done = !retreating && k === pts.length - 1 && Math.hypot(dx, dy, dz) < 3;
    const yaw = Math.atan2(dx, -dz), dyaw = Math.atan2(Math.sin(yaw - s.player.pose.yaw), Math.cos(yaw - s.player.pose.yaw));
    const commands: GameCommand[] = [{ type: "look", yawDelta: dyaw, pitchDelta: Math.atan2(dy, h) - s.player.pose.pitch },
      { type: "move", forward: done ? 0 : 1, right: 0, vertical: 0, sprint: retreating, quiet: want.quiet ?? false }];
    if (want.lamp === false && s.player.lamp) commands.push({ type: "lamp" });
    const r = stepGame(s, commands, world); s = r.state;
    const t = s.world.threat;
    log.push({ tick: s.tick, mode: t.mode, hp: health(s), view: viewAngle(s, hunterBody(s)),
      distance: Math.hypot(t.position.x - s.player.pose.position.x, t.position.y - s.player.pose.position.y, t.position.z - s.player.pose.position.z), events: r.events });
  }
  return { state: s, log };
}

test("first contact is a non-lethal warning bump from full hull for every craft and the diver", () => {
  for (const hull of [null, "dart", "creel", "hush", "mantle"] as const) {
    let s = pursuit(hull), first: Bite | undefined, events: GameEvent[] = [];
    for (let i = 0; i < 600 && !first; i++) { const r = stepGame(s, [], empty); s = r.state; events = r.events; first = bites(r.events)[0]; }
    assert.ok(first, `${hull ?? "diver"} is reached`);
    assert.equal(first.loss, (hull ? E.bites.vehicle : E.bites.diver)[0]);
    assert.ok(first.healthAfter > 0 && health(s) === 100 - first.loss, `${hull ?? "diver"} survives`);
    assert.ok(events.some(e => e.type === "notice" && e.message === HUNTER_CAPTIONS.bump), "the bump names the way out");
  }
  // From any hull the bump never takes the last point; nothing is taken from an empty one.
  for (const hp of [0.4, 1, 3]) {
    const s = pursuit("dart", hp), r = stepGame(s, [], empty);
    assert.equal(health(r.state), Math.min(hp, Math.max(1, hp - E.bites.vehicle[0]!)));
    assert.equal(r.state.fleet.vehicles[0]!.disabled, false);
  }
});

test("a loud craft that stays faces a ramp: one bite per contact cycle, harder each time, and real danger", () => {
  for (const hull of ["dart", "creel"] as const) {
    const s = pursuit(hull), losses: number[] = [], at: number[] = [];
    for (let i = 0; i < 60 * 40 && health(s) > 0; i++) {
      s.tick++; const events: GameEvent[] = []; updateThreat(s, 1, events, empty);
      for (const b of bites(events)) { losses.push(b.loss); at.push(i); }
    }
    assert.equal(health(s), 0, `${hull}: staying loud in pursuit still disables`);
    assert.equal(losses[0], E.bites.vehicle[0]);
    assert.ok(losses.slice(0, -1).every((loss, i) => i === 0 || loss > losses[i - 1]! - 1e-9), JSON.stringify(losses));
    assert.ok(losses.length >= 5, JSON.stringify(losses));
    for (let i = 1; i < at.length; i++)
      assert.ok((at[i]! - at[i - 1]!) / 60 >= H.cycleSeconds - H.contactSeconds - 1e-9, "a full withdrawal between bites");
    assert.ok((at.at(-1)! - at[0]!) / 60 >= 8, `${hull}: from the bump to disabled takes seconds, not a moment`);
  }
});

test("disengaging is always possible: quiet and dark, quiet alone, or a retreat ends the pursuit", () => {
  // Quiet and dark from the moment of pursuit, at full interest: at most the bump and one more bite.
  for (const hull of [null, "dart", "creel", "hush", "mantle"] as const) {
    const s = pursuit(hull); s.player.lamp = false;
    let lost = 0, ended = -1;
    for (let i = 0; i < 60 * 20; i++) {
      s.tick++; const events: GameEvent[] = []; updateThreat(s, 0.08, events, empty);
      lost += bites(events).reduce((n, b) => n + b.loss, 0);
      if (s.world.threat.mode === "disengage") { ended = i; break; }
    }
    assert.ok(ended >= 0 && ended / 60 <= E.interest.max / E.interest.dark + 0.1, `${hull ?? "diver"}: quiet and dark ends it in ${ended / 60} s`);
    assert.ok(lost <= E.bites.vehicle[0]! + E.bites.vehicle[1]!, `${hull ?? "diver"}: lost ${lost}`);
  }
  // Quiet with the lamp lit takes longer, but still ends it.
  const lit = pursuit("dart"); let litEnded = -1;
  for (let i = 0; i < 60 * 20; i++) { lit.tick++; updateThreat(lit, 0.08, [], empty); if (lit.world.threat.mode === "disengage") { litEnded = i; break; } }
  assert.ok(litEnded > 0 && litEnded / 60 <= E.interest.max / E.interest.lit + 0.1);
  // In the real Canopy: loud until pursuit, then quiet and dark; or a boosted retreat.
  for (const [label, react] of [
    ["quiet and dark", (s: GameState) => s.world.threat.mode === "pursue" ? { quiet: true, lamp: false } : {}],
    ["retreat", (s: GameState) => s.world.threat.mode === "pursue" ? { retreat: true } : {}],
  ] as const) {
    for (const hull of ["dart", "creel"] as const) {
      const { log } = fly(hull, react, 70);
      assert.ok(log.some(l => l.mode === "pursue"), `${label}/${hull}: the encounter happened`);
      const end = log.findIndex((l, i) => i > 0 && log[i - 1]!.mode === "pursue" && l.mode === "disengage");
      assert.ok(end > 0, `${label}/${hull}: the pursuit ended`);
      assert.ok(Math.min(...log.map(l => l.hp)) >= 100 - E.bites.vehicle[0]! - E.bites.vehicle[1]! - E.bites.vehicle[2]!, `${label}/${hull}: lost little`);
    }
  }
  // Holding Z the whole way, the hunter never notices.
  const quiet = fly("dart", () => ({ quiet: true }), 70);
  assert.ok(quiet.log.every(l => l.mode === "idle"), "quiet running is never noticed");
});

test("the hunter is seen before it harms: a silhouette pass in view, then a pursuit that starts in view", () => {
  for (const hull of ["dart", "creel"] as const) {
    const { log } = fly(hull, () => ({}), 50);
    const firstBite = log.findIndex(l => bites(l.events).length > 0), start = log.findIndex(l => l.mode === "pursue");
    assert.ok(start > 0 && firstBite >= start, `${hull}: no harm before pursuit`);
    const pass = log.slice(0, start).filter(l => l.mode === "investigate" && l.view < 0.4 && l.distance < 25);
    assert.ok(pass.length >= 30, `${hull}: at least half a second of silhouette in the middle of the view (${pass.length} steps)`);
    assert.ok(log[start]!.view < E.pursuit.view + 0.05 && log[start]!.distance < E.pursuit.range + 1, `${hull}: pursuit begins in view`);
  }
});

test("cue events: approach teaching, warn and pursue calls, the investigation caption and each bite's origin", () => {
  // Crossing the approach ring toward the hunter's home teaches quiet, the lamp and the pulse's cell.
  const s = createGame(); completeOpening(s);
  const toward = { x: THREAT_HOME.x - E.approachRing - 0.01, y: THREAT_HOME.y, z: THREAT_HOME.z };
  s.player.pose.position = { ...toward }; s.player.velocity = { x: 3, y: 0, z: 0 };
  s.player.pose.position.x += 3 / 60;
  const events: GameEvent[] = []; updateThreat(s, 0, events, empty);
  const teach = events.find(e => e.type === "notice");
  assert.ok(teach?.type === "notice" && /hold Z/.test(teach.message) && /lamp off \(L\)/.test(teach.message) && /G /.test(teach.message));
  s.player.pose.position.x += 3 / 60;
  const again: GameEvent[] = []; updateThreat(s, 0, again, empty);
  assert.equal(again.filter(e => e.type === "notice").length, 0, "once per entry");
  addItem(s, "reserve_cell", 1, "pod_locker");
  assert.match(approachCaption(s), /pod locker/);
  s.inventory.items.find(i => i.kind === "reserve_cell")!.containerId = "diver";
  assert.match(approachCaption(s), /G spends 25/);
  // The encounter's own transitions.
  const { log } = fly("dart", () => ({}), 50);
  const all = log.flatMap(l => l.events);
  const notice = (re: RegExp) => all.some(e => e.type === "notice" && re.test(e.message));
  assert.ok(notice(/Upper Canopy crowns/), "the route crosses the approach ring");
  assert.ok(notice(/^Paired calls/) && notice(/sweeps across your bow/) && notice(/is pursuing/));
  assert.equal(all.filter(e => e.type === "sound" && e.source === "threat-call").length, 2, "positional calls at warn and pursue only");
  for (const [i, l] of log.entries()) for (const b of bites(l.events)) {
    assert.ok(b.origin && Number.isFinite(b.origin.x), "each bite carries its origin");
    assert.ok(l.events.some(e => e.type === "sound" && e.cue === "damage" && e.origin), `tick ${i}: a positional damage sound`);
  }
});

test("the edge cue points at an engaged threat off screen, flashes toward a bite, and names nothing in a refuge", () => {
  const s = pursuit("dart"); s.world.threat.mode = "warn";
  s.player.pose.yaw = 0; s.world.threat.position = { x: 132, y: -110, z: -112 + 20 };
  const [cue] = threatCues(s);
  assert.ok(cue && cue.id === "sound-hunter" && cue.stage === "warning" && !cue.onScreen && Math.abs(cue.bearing) > 3);
  s.world.threat.position = { x: 132 - 20, y: -110, z: -112 };
  const left = threatCues(s)[0]!; assert.ok(left.bearing < -1.4);
  const at = edgePoint(left); assert.ok(at.x < 10 && at.y > 30 && at.y < 70, JSON.stringify(at));
  assert.ok(edgePoint({ bearing: 0.1, elevation: 1.2 }).y < 15, "above reads at the top edge");
  s.world.threat.position = { x: 132, y: -109, z: -112 - 15 };
  assert.equal(threatCues(s)[0]!.onScreen, true, "dead ahead: the animal is the cue");
  s.world.threat.position = { x: 132, y: -114, z: -112 - 12 };
  assert.equal(threatCues(s)[0]!.onScreen, false, "ahead but under the dash: the edge cue still points");
  assert.ok(edgePoint(threatCues(s)[0]!).y > 85, "at the bottom edge");
  for (const mode of ["warn", "investigate", "pursue"] as const) assert.match(hunterBanner(mode)!, /Z quiet/);
  assert.match(hunterBanner("warn")!, /L lamp off/); assert.equal(hunterBanner("idle"), null);
  // An ecology animal engaged behind the actor.
  const e = pursuit(null); e.world.threat.mode = "idle";
  const stalker = e.world.ecology.agents[0]!; stalker.mode = "investigate"; stalker.position = { ...e.player.pose.position, z: e.player.pose.position.z + 10 };
  assert.deepEqual(threatCues(e).map(c => [c.id, c.stage, c.label]), [[stalker.id, "closing", THREATS.glare_stalker.label]]);
  // The DOM view: marks while off screen, a flash toward a bite, nothing in a refuge.
  const element = { innerHTML: "", hidden: true } as unknown as HTMLElement, view = new ThreatEdgeView(element);
  s.world.threat.position = { x: 132 - 20, y: -110, z: -112 };
  view.update(s); assert.match(element.innerHTML, /data-stage="warning"/); assert.equal(element.hidden, false);
  s.world.threat.position = { x: 132, y: -109, z: -127 }; view.update(s); assert.equal(element.hidden, true);
  view.flash({ x: 132 + 9, y: -110, z: -112 }, s); view.update(s); assert.match(element.innerHTML, /data-stage="attack"/);
  s.tick += 60; view.update(s); assert.equal(element.hidden, true, "the flash fades");
  const refuge = createGame(); completeOpening(refuge); refuge.world.threat.mode = "pursue";
  assert.deepEqual(threatCues(refuge), [], "the pod is a refuge");
});

const STALKER = "rift_stalker_passage" as const;
const facingFrom = (from: Vec3, to: Vec3): Vec3 => {
  const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z }, n = Math.hypot(d.x, d.y, d.z);
  return { x: d.x / n, y: d.y / n, z: d.z / n };
};
const first = (log: ReturnType<typeof run>, cue: string): number => cues(log, STALKER).find(c => c.cue === cue)?.tick ?? -1;

test("ecology threats lunge from where they were seen, softer the first time, and keep their deterrence", () => {
  const p = offset(homeOf(STALKER), 18, 0, 0), lit = { light: 0.9, hull: "dart" as const, radius: 3.6, noise: 0.48 };
  // Facing the animal: the usual timing, a lighter first strike, then a full one.
  const watched = createEcology();
  const seen = run(watched, 60 * 60, (_, st) => stimulus(p, { ...lit, facing: facingFrom(p, agent(st, STALKER).position) }));
  const struck = strikes(seen, STALKER), def = THREATS.glare_stalker;
  assert.ok(struck.length >= 1);
  assert.equal(struck[0]!.loss, def.strike.hull * FIRST_STRIKE_SHARE);
  if (struck[1]) assert.equal(struck[1].loss, def.strike.hull);
  assert.ok(first(seen, "commit") - first(seen, "investigate") < (def.timing.investigate + 1) * 60);
  // Facing away: it holds off past the usual moment, then may lunge anyway.
  const ignored = createEcology();
  const away = run(ignored, 60 * 60, (_, st) => { const f = facingFrom(p, agent(st, STALKER).position); return stimulus(p, { ...lit, facing: { x: -f.x, y: -f.y, z: -f.z } }); });
  const lunge = first(away, "commit");
  assert.ok(first(away, "investigate") > 0 && (lunge < 0 || lunge - first(away, "investigate") >= (def.timing.investigate + UNSEEN_COMMIT_DELAY) * 60 - 1));
  // While investigating, it holds its stand-off toward the actor's view.
  const leaning = createEcology(), facing = { x: 0, y: 0, z: -1 };
  let inCone = 0, investigating = 0;
  run(leaning, 60 * 20, (_, st) => {
    const a = agent(st, STALKER);
    if (a.mode === "investigate") { investigating++; if (Math.acos(Math.max(-1, Math.min(1, facingFrom(p, a.position).z * -1))) < SEEN_CONE + 0.6) inCone++; }
    return stimulus(p, { ...lit, facing });
  });
  assert.ok(investigating > 0 && inCone / investigating > 0.5, `${inCone}/${investigating} investigating steps lean toward the view`);
  // Deterrence is unchanged: dark and quiet is never noticed.
  const dark = createEcology(), log = run(dark, 60 * 40, () => stimulus(offset(homeOf(STALKER), 10, 0, 0), { light: 0, noise: 0.03, facing }));
  assert.equal(strikes(log).length, 0);
});
