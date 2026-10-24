/** ENC-1 heavy tier (TT-1): the readable-threat checks that fly whole routes
 * or sweep every hull beside real rock. tests/enc-1-readable-threats.test.ts
 * keeps the rest and fast smokes. */
import test from "node:test";
import assert from "node:assert/strict";
import { HUNTER_ENCOUNTER as E } from "../src/content/ecology/encounter.js";
import { HULL_COLLIDERS, THREAT_HOME } from "../src/content/registry.js";
import { createGame } from "../src/sim/state.js";
import { completeOpening } from "../src/sim/progression.js";
import { addItem } from "../src/sim/inventory.js";
import { stepGame } from "../src/sim/step.js";
import { gameWorld } from "../src/sim/world.js";
import { approachCaption, HUNTER_CAPTIONS, updateThreat } from "../src/sim/hunterEncounter.js";
import type { GameEvent, GameState } from "../src/sim/types.js";
import { bites, empty, fly, pursuit, still, stillPursuit } from "./enc-1-support.js";

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

test("R1 ENC-1-01: the warning bump's push never turns into collision damage beside real rock", () => {
  const rock = gameWorld();
  // Each hull just clear of canopy.cover's west face (bitten from the west, pushed east into it)
  // and of canopy.lab.back's outer face (bitten from the south, pushed north into it).
  let ran = 0;
  for (const hull of ["dart", "creel", "mantle"] as const) for (const face of ["cover", "lab"] as const) for (const hp of [0.1, 0.6, 3]) {
    const r0 = HULL_COLLIDERS[hull].radius + 0.03;
    const at = face === "cover" ? { x: 103 - r0, y: -100, z: -118.5 } : { x: 116, y: -116, z: -130 - r0 };
    const from = face === "cover" ? { ...at, x: at.x - 15 } : { ...at, z: at.z - 15 };
    assert.ok(rock.clearance(at, HULL_COLLIDERS[hull]), `${hull} starts clear of ${face}`);
    let s = stillPursuit(hull, at, hp, from);
    ran++;
    const events: GameEvent[] = [];
    for (let i = 0; i < 180; i++) { const r = stepGame(s, [still], rock); s = r.state; events.push(...r.events); }
    const v = s.fleet.vehicles[0]!, label = `${hull} at ${face} from ${hp}`;
    assert.ok(events.some(e => e.type === "notice" && e.message === HUNTER_CAPTIONS.bump) || hp <= 1, `${label}: the bump landed`);
    assert.ok(rock.clearance(v.pose.position, HULL_COLLIDERS[hull]), `${label}: never pushed into rock`);
    assert.equal(events.filter(e => e.type === "impact").length, 0, `${label}: the push is never an impact`);
    assert.equal(v.disabled, false, label);
    assert.ok(v.health >= Math.min(hp, 1) - 1e-9, `${label}: kept ${v.health}`);
    assert.ok(Math.hypot(v.velocity.x, v.velocity.y, v.velocity.z) < 1.5, `${label}: the push adds no propulsion`);
  }
  assert.equal(ran, 18);
  // Ordinary powered collision into the same rock still damages.
  let s = stillPursuit("dart", { x: 99.38, y: -100, z: -118.5 }, 100, { x: 84.38, y: -100, z: -118.5 });
  // canopy.cover is east of this position: face it and drive in.
  s.world.threat.mode = "idle"; s.player.pose.yaw = Math.PI / 2; s.fleet.vehicles[0]!.pose.yaw = Math.PI / 2;
  s.fleet.vehicles[0]!.velocity = { x: 8, y: 0, z: 0 };
  let hit = 0;
  for (let i = 0; i < 60; i++) {
    const r = stepGame(s, [{ type: "move", forward: 1, right: 0, vertical: 0, sprint: true }], rock); s = r.state;
    hit += r.events.filter(e => e.type === "impact").length;
  }
  assert.ok(hit > 0 && s.fleet.vehicles[0]!.health < 100, "powered collisions keep their damage");
  // In open water the bump still pushes the craft away from the mouth, without velocity.
  const open = pursuit("dart"), v0 = { ...open.fleet.vehicles[0]!.pose.position }, mouth = { ...open.world.threat.position };
  const r = stepGame(open, [], empty), v = r.state.fleet.vehicles[0]!;
  assert.equal(bites(r.events).length, 1);
  const away = (v.pose.position.x - v0.x) * (v0.x - mouth.x) + (v.pose.position.z - v0.z) * (v0.z - mouth.z);
  assert.ok(away > 0 && Math.hypot(v.pose.position.x - v0.x, v.pose.position.z - v0.z) <= E.knock.dart + 1e-9);
  assert.deepEqual(r.state.player.pose.position, v.pose.position);
});
