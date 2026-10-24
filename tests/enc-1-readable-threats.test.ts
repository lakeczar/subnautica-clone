/** ENC-1: threats you can see and read. The Canopy sound hunter warns, makes a
 * silhouette pass across the bow and only then pursues; its first contact is a
 * non-lethal warning bump and later bites ramp; quiet, a dark lamp and retreat
 * always end it. Ecology threats lunge from where they were seen, softer first.
 * Every engaged threat has a directional edge cue beside its caption. */
import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { HUNTER_ENCOUNTER as E, FIRST_STRIKE_SHARE } from "../src/content/ecology/encounter.js";
import { HUNTER_GEOMETRY as H } from "../src/content/encounterGeometry.js";
import { THREATS } from "../src/content/ecology/species.js";
import { HULL_COLLIDERS } from "../src/content/registry.js";
import { createGame } from "../src/sim/state.js";
import { completeOpening } from "../src/sim/progression.js";
import { stepGame } from "../src/sim/step.js";
import { gameWorld } from "../src/sim/world.js";
import { createEnvelope, decodeSave, encodeSave } from "../src/save/codec.js";
import { hunterStandOff } from "../src/sim/hunter.js";
import { HUNTER_CAPTIONS, hunterBody, updateThreat, viewAngle } from "../src/sim/hunterEncounter.js";
import { homeOf, SEEN_CONE, UNSEEN_COMMIT_DELAY } from "../src/sim/ecology/agents.js";
import { edgePoint, hunterBanner, threatCues, ThreatEdgeView } from "../src/ui/threatCue.js";
import type { GameEvent, GameState, Vec3 } from "../src/sim/types.js";
import { agent, createEcology, cues, offset, run, stimulus, strikes } from "./ecology-support.js";
import { bites, empty, fly, health, pursuit, still, stillPursuit, type Bite } from "./enc-1-support.js";

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

// ---------------------------------------------------------------- Sol R1 regressions

test("R1 ENC-1-02: a validated save at the old interest maximum still loses the hunter when quiet and dark", () => {
  for (const interest of [E.interest.max, 12]) {
    const fixture = decodeSave(readFileSync("tests/fixtures/earned-c06.json", "utf8"));
    assert.ok(fixture.ok, fixture.ok ? "" : fixture.error);
    let s = fixture.value.state;
    const v = s.fleet.vehicles.find(v => v.hull === "dart")!;
    v.pose = { ...v.pose, position: { x: 132, y: -110, z: -112 }, yaw: 0, pitch: 0 }; v.velocity = { x: 0, y: 0, z: 0 }; v.health = 3;
    s.player.controlledVehicleId = v.id; s.player.mode = "piloting"; s.player.pose = structuredClone(v.pose);
    s.player.velocity = { x: 0, y: 0, z: 0 }; s.player.lamp = false;
    s.world.threat = { mode: "pursue", position: { x: 147, y: -110, z: -112 }, interest, modeSeconds: 0, distraction: null, distractionSeconds: 0 };
    s.world.threat.position = hunterStandOff(s);
    const encoded = encodeSave(createEnvelope(s, fixture.value.meta));
    assert.ok(encoded.ok, encoded.ok ? "" : encoded.error);
    const loaded = decodeSave(encoded.value);
    assert.ok(loaded.ok, loaded.ok ? "" : loaded.error);
    s = loaded.value.state; assert.equal(s.world.threat.interest, interest, "the schema accepts it");
    let ended = -1;
    for (let i = 0; i < 60 * 10 && ended < 0; i++) {
      s = stepGame(s, [still], gameWorld()).state;
      assert.ok(s.world.threat.interest <= E.interest.max, "normalised on every update");
      if (s.world.threat.mode === "disengage") ended = i;
    }
    const after = s.fleet.vehicles.find(x => x.id === v.id)!;
    assert.ok(ended >= 0 && ended / 60 <= E.interest.max / E.interest.dark + 0.1, `interest ${interest}: ended at ${ended / 60} s`);
    assert.equal(after.disabled, false, `interest ${interest}`); assert.ok(after.health >= 1 - 1e-9, `interest ${interest}: ${after.health}`);
  }
});

test("R1 view gate: an investigation off the view waits for the view or the timeout before it pursues", () => {
  const setup = (): GameState => {
    const s = pursuit("dart"); s.world.threat.mode = "investigate"; s.world.threat.modeSeconds = E.pursuit.earliest + 0.1;
    return s;
  };
  // Turned away from the animal on every step: no pursuit until the latest moment, then pursuit.
  const away = setup(); let pursuedAt = -1;
  for (let i = 0; i < 60 * 8 && pursuedAt < 0; i++) {
    const t = away.world.threat.position, p = away.player.pose.position;
    away.player.pose.yaw = Math.atan2(-(t.x - p.x), (t.z - p.z));
    away.player.pose.pitch = 0;
    away.tick++; updateThreat(away, 1, [], empty);
    assert.ok(away.world.threat.mode === "investigate" || away.world.threat.mode === "pursue");
    if (away.world.threat.mode === "pursue") pursuedAt = away.world.threat.modeSeconds;
    else assert.ok(viewAngle(away, hunterBody(away)) > E.pursuit.view || away.world.threat.modeSeconds > E.pursuit.latest ||
      Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z) >= E.pursuit.range, "only a seen animal pursues early");
  }
  assert.ok(pursuedAt >= 0, "the timeout keeps the threat real");
  const log: string[] = [];
  const timedOut = setup(); for (let i = 0; i < 60 * 8; i++) {
    const t = timedOut.world.threat.position, p = timedOut.player.pose.position;
    timedOut.player.pose.yaw = Math.atan2(-(t.x - p.x), (t.z - p.z)); timedOut.tick++;
    const before = timedOut.world.threat.modeSeconds; updateThreat(timedOut, 1, [], empty);
    if (timedOut.world.threat.mode === "pursue") { log.push(`pursue after ${before.toFixed(2)} s`); assert.ok(before + 1 / 60 >= E.pursuit.latest - 1e-9, log.join()); break; }
  }
  assert.equal(log.length, 1, "turned away, it pursues only at the timeout");
  // Facing it, inside range: it pursues as soon as it is seen, before the timeout.
  const seen = setup(); let seenAt = -1;
  for (let i = 0; i < 60 * 8 && seenAt < 0; i++) {
    const t = hunterBody(seen), p = seen.player.pose.position;
    seen.player.pose.yaw = Math.atan2(t.x - p.x, -(t.z - p.z));
    seen.player.pose.pitch = Math.atan2(t.y - p.y - 1.05, Math.hypot(t.x - p.x, t.z - p.z));
    seen.tick++; const before = seen.world.threat.modeSeconds; updateThreat(seen, 1, [], empty);
    if (seen.world.threat.mode === "pursue") seenAt = before;
  }
  assert.ok(seenAt >= 0 && seenAt < E.pursuit.latest - 0.5, `seen: pursued after ${seenAt} s`);
});

test("R1 cadence: a loud craft that stays is bitten about every 4 s, and disabled about 20 s after the bump", () => {
  // Loudness 1 throughout: a craft that keeps its engine loud and stays put.
  for (const hull of ["dart", "creel"] as const) {
    const s = pursuit(hull), at: number[] = [], losses: number[] = [];
    for (let i = 0; i < 60 * 40 && health(s) > 0; i++) {
      s.tick++; const events: GameEvent[] = []; updateThreat(s, 1, events, empty);
      for (const b of bites(events)) { at.push(i / 60); losses.push(b.loss); }
    }
    assert.equal(health(s), 0, `${hull}: still disabled`);
    const gaps = at.slice(1).map((t, i) => t - at[i]!);
    assert.ok(gaps.length >= 4 && gaps.every(g => g >= 3.5 && g <= 4.5), `${hull}: gaps ${JSON.stringify(gaps)}`);
    const total = at.at(-1)! - at[0]!;
    assert.ok(total >= 16 && total <= 24, `${hull}: bump to disabled in ${total} s`);
    assert.deepEqual(losses.slice(0, 5), [...E.bites.vehicle]);
  }
});

// --- Fast smokes (TT-1). The full route flights and the every-hull sweep
// beside real rock are in tests/enc-1-readable-threats.heavy.test.ts.

test("smoke: quiet and dark ends a pursuit for every hull, and quiet with the lamp lit ends it later", () => {
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
  const lit = pursuit("dart"); let litEnded = -1;
  for (let i = 0; i < 60 * 20; i++) { lit.tick++; updateThreat(lit, 0.08, [], empty); if (lit.world.threat.mode === "disengage") { litEnded = i; break; } }
  assert.ok(litEnded > 0 && litEnded / 60 <= E.interest.max / E.interest.lit + 0.1);
});

test("smoke: a loud Dart on the real route sees the silhouette pass before pursuit, takes no harm before it, and hears two calls", () => {
  // 24 s reaches the pursuit (about 18 s in) and its first bite; the heavy file flies the whole route.
  const { log } = fly("dart", () => ({}), 24);
  const firstBite = log.findIndex(l => bites(l.events).length > 0), start = log.findIndex(l => l.mode === "pursue");
  assert.ok(start > 0 && firstBite >= start, "no harm before pursuit");
  assert.ok(log.slice(0, start).filter(l => l.mode === "investigate" && l.view < 0.4 && l.distance < 25).length >= 30, "a silhouette pass in view");
  assert.ok(log[start]!.view < E.pursuit.view + 0.05 && log[start]!.distance < E.pursuit.range + 1, "pursuit begins in view");
  const all = log.flatMap(l => l.events);
  assert.equal(all.filter(e => e.type === "sound" && e.source === "threat-call").length, 2, "positional calls at warn and pursue only");
});

test("smoke: a Dart's warning bump beside the canopy cover never becomes collision damage; powered collision still damages", () => {
  const rock = gameWorld(), r0 = HULL_COLLIDERS.dart.radius + 0.03, at = { x: 103 - r0, y: -100, z: -118.5 };
  assert.ok(rock.clearance(at, HULL_COLLIDERS.dart), "starts clear");
  let s = stillPursuit("dart", at, 0.6, { ...at, x: at.x - 15 });
  const events: GameEvent[] = [];
  for (let i = 0; i < 180; i++) { const r = stepGame(s, [still], rock); s = r.state; events.push(...r.events); }
  const v = s.fleet.vehicles[0]!;
  assert.ok(rock.clearance(v.pose.position, HULL_COLLIDERS.dart), "never pushed into rock");
  assert.equal(events.filter(e => e.type === "impact").length, 0, "the push is never an impact");
  assert.ok(!v.disabled && v.health >= 0.6 - 1e-9, `kept ${v.health}`);
  let d = stillPursuit("dart", { x: 99.38, y: -100, z: -118.5 }, 100, { x: 84.38, y: -100, z: -118.5 });
  d.world.threat.mode = "idle"; d.player.pose.yaw = Math.PI / 2; d.fleet.vehicles[0]!.pose.yaw = Math.PI / 2;
  d.fleet.vehicles[0]!.velocity = { x: 8, y: 0, z: 0 };
  let hit = 0;
  for (let i = 0; i < 60; i++) {
    const r = stepGame(d, [{ type: "move", forward: 1, right: 0, vertical: 0, sprint: true }], rock); d = r.state;
    hit += r.events.filter(e => e.type === "impact").length;
  }
  assert.ok(hit > 0 && d.fleet.vehicles[0]!.health < 100, "powered collisions keep their damage");
});
