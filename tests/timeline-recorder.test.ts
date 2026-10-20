import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { completeOpening } from "../src/sim/progression.js";
import { createGame, makeVehicle } from "../src/sim/state.js";
import type { GameState } from "../src/sim/types.js";
import { addNote, createRecorder, exportTimeline, exportTimelineText, NOTE_MAX, observe, recordSystemsEvents, resumeRecorder, TIMELINE_EVENT_CAP } from "../src/sim/timeline/recorder.js";
import type { TimelineRecorder } from "../src/sim/timeline/recorder.js";
import { analyseTimeline, parseTimeline } from "../src/sim/timeline/report.js";

const SESSION = { id: "test-session", started: "2026-10-20T10:00:00.000Z", build: "test" };
const regionAt = (x: number) => x > 100 ? "suspended_garden" : "refuge_reef";
function setup(): { s: GameState; rec: TimelineRecorder; step: (n?: number, input?: boolean, waiting?: string[]) => void } {
  const s = createGame();
  completeOpening(s);
  const rec = createRecorder(SESSION, { regionAt });
  const step = (n = 1, input = true, waiting: string[] = []) => {
    for (let i = 0; i < n; i++) { s.tick++; observe(rec, s, { input, waiting }); }
  };
  step();
  return { s, rec, step };
}
const kinds = (rec: TimelineRecorder) => rec.events.map((e) => `${e.kind}${e.what ? `:${e.what}` : ""}`);

test("the first observation is a baseline; later unlocks and discoveries are new things", () => {
  const { s, rec, step } = setup();
  assert.deepEqual(kinds(rec), ["region"], "a loaded save's existing knowledge isn't new; the start region is noted");
  rec.events.length = 0;
  s.knowledge.blueprints.push("bp_reef_recovery");
  s.knowledge.crafted.push("pod_repair");
  s.knowledge.evidence.push({ id: "C02", tick: s.tick, provenance: "x" });
  s.knowledge.scans.push("basin_keel_plate");
  step();
  assert.deepEqual(kinds(rec), ["new:blueprint", "new:record", "new:evidence", "new:craft"]);
  const e = rec.events[0]!;
  assert.equal(e.id, "bp_reef_recovery");
  assert.equal(e.region, "refuge_reef");
  assert.deepEqual(e.at, [0, 0.2, 21.2]);
});

test("a first scan of a material is new; another source of a known material is a point of interest", () => {
  const { s, rec, step } = setup();
  rec.events.length = 0;
  s.knowledge.scans.push("reef_service_scraps_east");
  step();
  s.knowledge.scans.push("reef_service_scraps_west");
  step();
  assert.deepEqual(kinds(rec), ["new:material", "poi:source"]);
  assert.equal(rec.events[0]!.id, "structural_alloy");
});

test("gathering records the source, item and quantity", () => {
  const { s, rec, step } = setup();
  rec.events.length = 0;
  s.world.resources.find((r) => r.id === "reef_glass_ridge_north")!.stock -= 2;
  s.metrics.collections++;
  step();
  assert.deepEqual(rec.events.map((e) => [e.kind, e.id, e.what, e.quantity]), [["gather", "reef_glass_ridge_north", "silica_glass", 2]]);
});

test("craft travel is one span with seconds and metres; idle waiting is excluded from play time", () => {
  const { s, rec, step } = setup();
  const dart = makeVehicle("dart_1", "dart", { x: 0, y: -5, z: 0 }, "dart_1_hold");
  s.fleet.vehicles.push(dart);
  step();
  assert.deepEqual(kinds(rec), ["region", "new:hull"]);
  s.player.controlledVehicleId = dart.id;
  for (let i = 0; i < 600; i++) { dart.pose.position.z -= 0.1; step(); }
  s.player.controlledVehicleId = null;
  step();
  const travel = rec.events.find((e) => e.kind === "travel")!;
  assert.equal(travel.hull, "dart");
  assert.ok(Math.abs(travel.seconds! - 10) < 0.05, `${travel.seconds}`);
  assert.equal(travel.metres, 60);
  const playBefore = rec.playTicks;
  step(60 * 15, false);
  assert.equal(rec.idle, null, "the first 15 s without input still count as play");
  step(60 * 45, false, ["decode"]);
  assert.ok(rec.idle);
  step(1, true);
  const idle = rec.events.find((e) => e.kind === "idle")!;
  assert.ok(Math.abs(idle.seconds! - 45) < 0.1, `${idle.seconds}`);
  assert.deepEqual(idle.waiting, ["decode"]);
  assert.ok(Math.abs((rec.playTicks - playBefore) / 60 - 15) < 0.1, "idle time never advances play");
});

test("idle closes an open travel span; a death and its recovery are recorded with the recovery time", () => {
  const { s, rec, step } = setup();
  const dart = makeVehicle("dart_1", "dart", { x: 0, y: -5, z: 0 }, "dart_1_hold");
  s.fleet.vehicles.push(dart);
  step();
  s.player.controlledVehicleId = dart.id;
  for (let i = 0; i < 120; i++) { dart.pose.position.x += 0.1; step(); }
  step(60 * 20, false);
  assert.equal(rec.travel, null);
  assert.ok(rec.events.some((e) => e.kind === "travel"));
  s.player.controlledVehicleId = null;
  s.metrics.failures++;
  s.recovery.losses.push({ vehicleId: dart.id, position: { x: 0, y: -5, z: 0 }, visited: true });
  step();
  step(600);
  s.recovery.losses = [];
  step();
  const recovery = rec.events.find((e) => e.kind === "recovery")!;
  assert.ok(Math.abs(recovery.seconds! - 601 / 60) < 0.05);
  assert.ok(rec.events.some((e) => e.kind === "death"));
});

test("first entry to a region is new; returning is a plain region change", () => {
  const { s, rec, step } = setup();
  s.player.pose.position.x = 150;
  step(30);
  s.player.pose.position.x = 0;
  step(30);
  s.player.pose.position.x = 150;
  step(30);
  assert.deepEqual(kinds(rec), ["region", "new:region", "region", "region"]);
});

test("feedback notes carry time and location; decodes from SYS-2 are new things", () => {
  const { s, rec, step } = setup();
  step(120);
  assert.match(addNote(rec, s, "   ") ?? "", /Write something/);
  assert.equal(addNote(rec, s, "  The ledge  is hard to find ", "2026-10-20T10:02:00.000Z"), null);
  const note = rec.events.at(-1)!;
  assert.deepEqual([note.kind, note.text, note.region, note.wall], ["note", "The ledge is hard to find", "refuge_reef", "2026-10-20T10:02:00.000Z"]);
  assert.ok(Math.abs(note.play - 121 / 60) < 0.02);
  addNote(rec, s, "x".repeat(NOTE_MAX + 50));
  assert.equal(rec.events.at(-1)!.text!.length, NOTE_MAX);
  recordSystemsEvents(rec, s, [{ type: "decoded", completion: { decodable: "demo_hut_fragment", blueprints: [], readable: [], beacons: [] } },
    { type: "crop-ready", seed: "seed_staple_cup" }, { type: "chart-explored", cells: ["0:0"] }]);
  assert.deepEqual(kinds(rec).slice(-2), ["new:decode", "system:crop-ready"]);
});

test("export round-trips, closes open spans in a copy, and resumes after a reload", () => {
  const { s, rec, step } = setup();
  s.knowledge.blueprints.push("bp_reef_recovery");
  step(60);
  step(60 * 30, false);
  const text = exportTimelineText(rec, s);
  assert.ok(rec.idle, "exporting leaves the live recorder alone");
  const parsed = parseTimeline(text);
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.equal(parsed.value.session.id, "test-session");
  assert.ok(parsed.value.events.some((e) => e.kind === "idle"));
  assert.ok(Math.abs(parsed.value.session.end.play - (61 + 15 * 60) / 60) < 0.1);
  const resumed = resumeRecorder(parsed.value, { regionAt });
  assert.equal(resumed.playTicks, rec.playTicks);
  assert.deepEqual(resumed.regions, rec.regions);
  assert.equal(exportTimeline(resumed, s).events.length, parsed.value.events.length);
});

test("the recorder caps events and counts what it dropped", () => {
  const { s, rec } = setup();
  rec.events.length = 0;
  for (let i = 0; i < TIMELINE_EVENT_CAP + 5; i++) addNote(rec, s, `n${i}`);
  assert.equal(rec.events.length, TIMELINE_EVENT_CAP);
  assert.equal(rec.dropped, 5);
});

test("local only: the timeline modules never reach the network", () => {
  for (const file of ["src/sim/timeline/recorder.ts", "src/sim/timeline/report.ts", "src/sim/timeline/index.ts"]) {
    const text = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(text, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|navigator\./, file);
  }
});

/** Pilots the Dart for `n` steps moving `perStep` metres along X each step. */
function pilot(s: GameState, step: (n?: number, input?: boolean) => void, n: number, perStep: number): void {
  const v = s.fleet.vehicles.find((x) => x.id === s.player.controlledVehicleId)!;
  for (let i = 0; i < n; i++) { v.pose.position.x += perStep; step(); }
}
function withDart(): ReturnType<typeof setup> {
  const t = setup();
  t.s.fleet.vehicles.push(makeVehicle("dart_1", "dart", { x: 0, y: -5, z: 0 }, "dart_1_hold"));
  t.step();
  t.rec.events.length = 0;
  t.s.player.controlledVehicleId = "dart_1";
  return t;
}

test("time at a stationary helm is active play, never travel", () => {
  const { s, rec, step } = withDart();
  pilot(s, step, 7201, 0);
  s.player.controlledVehicleId = null;
  step();
  const t = exportTimeline(rec, s);
  assert.deepEqual(t.events.filter((e) => e.kind === "travel"), []);
  assert.deepEqual(analyseTimeline(t).travel.emptyStretches, []);
  assert.ok(t.session.end.play > 120, "the time still counts as play");
});

test("a leg with a stop counts only the motion; the stop is reported as stationary helm time", () => {
  const { s, rec, step } = withDart();
  pilot(s, step, 60 * 50, 0.1);
  pilot(s, step, 60 * 70, 0);
  pilot(s, step, 60 * 50, 0.1);
  s.player.controlledVehicleId = null;
  step();
  const travel = rec.events.filter((e) => e.kind === "travel");
  assert.equal(travel.length, 1);
  assert.ok(Math.abs(travel[0]!.seconds! - 100) < 0.05, `${travel[0]!.seconds}`);
  assert.ok(Math.abs(travel[0]!.stationary! - 70) < 0.05);
  assert.equal(travel[0]!.metres, 600);
  const a = analyseTimeline(exportTimeline(rec, s));
  assert.equal(a.travel.emptyStretches.length, 1);
  assert.ok(Math.abs(a.travel.emptyStretches[0]!.seconds - 100) < 0.05);
  assert.ok(Math.abs(a.travel.stationaryMinutes - 70 / 60) < 0.01);
});

test("a point of interest during a moving leg splits it into two stretches", () => {
  const { s, rec, step } = withDart();
  pilot(s, step, 60 * 60, 0.2);
  s.knowledge.scans.push("reef_service_scraps_east");
  pilot(s, step, 60 * 40, 0.2);
  s.player.controlledVehicleId = null;
  step();
  assert.deepEqual(kinds(rec), ["travel", "new:material", "travel"]);
  const [first, , second] = rec.events;
  assert.ok(Math.abs(first!.seconds! - 60) < 0.05 && Math.abs(second!.seconds! - 40) < 0.05, `${first!.seconds} ${second!.seconds}`);
  const flagged = analyseTimeline(exportTimeline(rec, s)).travel.emptyStretches;
  assert.equal(flagged.length, 0, "neither stretch passes 90 s");
});

test("an open death survives export and reload; the recovery time excludes idle waiting", () => {
  const { s, rec, step } = setup();
  s.metrics.failures++;
  step();
  step(60 * 10);
  const resumed = resumeRecorder(parseOk(exportTimelineText(rec, s)), { regionAt });
  assert.equal(resumed.deathPlay, rec.deathPlay);
  const tick = () => { s.tick++; };
  const go = (n: number, input: boolean) => { for (let i = 0; i < n; i++) { tick(); observe(resumed, s, { input }); } };
  go(1, true);
  go(60 * 50, false);
  go(60 * 5, true);
  s.metrics.rescues++;
  go(1, true);
  const recovery = resumed.events.find((e) => e.kind === "recovery")!;
  // 10 s before the reload, then 1 + 15 (grace) + 5×60 + 1 steps of play; 35 idle seconds excluded.
  assert.ok(Math.abs(recovery.seconds! - (601 + 1 + 900 + 300 + 1) / 60) < 0.05, `${recovery.seconds}`);
  assert.deepEqual(analyseTimeline(exportTimeline(resumed, s)).deaths, { count: 1, recoverySeconds: [recovery.seconds!], unrecovered: 0 });
  // A recovered death is not reopened by a later reload.
  assert.equal(resumeRecorder(exportTimeline(resumed, s)).deathPlay, null);
});
function parseOk(text: string) {
  const r = parseTimeline(text);
  assert.ok(r.ok);
  return r.value;
}
