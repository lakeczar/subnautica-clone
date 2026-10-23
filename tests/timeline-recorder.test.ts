import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { completeOpening } from "../src/sim/progression.js";
import { createGame, makeVehicle } from "../src/sim/state.js";
import { addItem, transfer } from "../src/sim/inventory.js";
import { incapacitate } from "../src/sim/recovery.js";
import type { GameState } from "../src/sim/types.js";
import { addNote, createRecorder, exportTimeline, exportTimelineText, NOTE_MAX, observe, recordEvent, recordSystemsEvents, resumeRecorder,
  TIMELINE_CHUNK_EVENTS, TIMELINE_RETAINED_CHUNKS, timelineSince } from "../src/sim/timeline/recorder.js";
import type { TimelineRecorder } from "../src/sim/timeline/recorder.js";
import { analyseTimeline, parseTimeline } from "../src/sim/timeline/report.js";
import type { TimelineEvent, TimelineExport } from "../src/sim/timeline/report.js";

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

test("a long session rotates old chunks into summaries without losing a note, and analyses as if nothing rotated", () => {
  const { s, rec } = setup();
  rec.events.length = 0;
  const all: TimelineEvent[] = [];
  const items = ["silica_glass", "structural_alloy", "meal"], hulls = ["dart", "creel"], regions = ["refuge_reef", "suspended_garden", "isles"];
  // A deterministic mix of every kind over 26 chunks' worth of events.
  for (let i = 0; i < TIMELINE_CHUNK_EVENTS * (TIMELINE_RETAINED_CHUNKS + 6); i++) {
    s.tick += 37;
    rec.playTicks += 37;
    const k = (i * 7919) % 100;
    if (k < 3) addNote(rec, s, `note ${i}`);
    else if (k < 8) recordEvent(rec, s, { kind: "new", what: "blueprint", id: `bp${i}` });
    else if (k < 40) recordEvent(rec, s, { kind: "gather", what: items[i % 3]!, id: `src${i % 5}`, quantity: 1 + (i % 3) });
    else if (k < 60) recordEvent(rec, s, { kind: "travel", seconds: (i % 13) * 11, stationary: i % 4, metres: i % 200, hull: hulls[i % 2]!, id: "v" });
    else if (k < 70) recordEvent(rec, s, { kind: "idle", seconds: (i % 9) * 15, waiting: i % 2 ? ["decode"] : [] });
    else if (k < 71) recordEvent(rec, s, { kind: "death", keys: [`cache:c${i}`] });
    else if (k < 72) recordEvent(rec, s, { kind: "recovery", of: s.tick - 600, keys: [`cache:c${i}`], seconds: 40 + (i % 50) });
    else if (k < 80) recordEvent(rec, s, { kind: "region", id: regions[i % 3]! });
    else recordEvent(rec, s, { kind: "poi", what: "source", id: `src${i % 5}` });
    all.push(rec.events.at(-1) ?? rec.sealed.at(-1)!.events.at(-1)!);
  }
  assert.equal(rec.sealed.length, TIMELINE_RETAINED_CHUNKS);
  assert.ok(rec.rotated.length >= 5, `${rec.rotated.length} chunks rotated`);
  const exported = exportTimeline(rec, s);
  const notes = (events: readonly TimelineEvent[]) => events.filter((e) => e.kind === "note").map((e) => e.text);
  assert.deepEqual([...exported.rotated!.flatMap((r) => notes(r.kept)), ...notes(exported.events)], notes(all), "every note survives, in order");
  // The same session, never rotated (a version 1 export of every event).
  const whole: TimelineExport = { ...exported, version: 1, rotated: [], events: all };
  const a = analyseTimeline(exported), b = analyseTimeline(whole);
  const sorted = <T extends { play: number }>(xs: readonly T[]) => [...xs].sort((x, y) => x.play - y.play);
  for (const key of ["newCount", "newByKind", "gaps", "longestGapMinutes", "gathering", "deaths", "notes"] as const)
    assert.deepEqual(a[key], b[key], key);
  assert.equal(a.travel.count, b.travel.count);
  assert.ok(Math.abs(a.travel.minutes - b.travel.minutes) < 1e-6 && Math.abs(a.travel.stationaryMinutes - b.travel.stationaryMinutes) < 1e-6);
  for (const h of Object.keys(b.travel.byHull)) assert.ok(Math.abs(a.travel.byHull[h]! - b.travel.byHull[h]!) < 1e-6, h);
  assert.deepEqual(sorted(a.travel.emptyStretches), sorted(b.travel.emptyStretches));
  assert.equal(a.idle.count, b.idle.count);
  assert.ok(Math.abs(a.idle.minutes - b.idle.minutes) < 1e-6 && Math.abs(a.idle.waitingMinutes - b.idle.waitingMinutes) < 1e-6);
  assert.deepEqual(sorted(a.idle.listed), sorted(b.idle.listed));
  assert.equal(a.idle.longest?.seconds, b.idle.longest?.seconds);
  assert.ok(a.rotated.chunks >= 5 && b.rotated.chunks === 0);
  // Export, parse and resume keep the summaries and the kept events exactly.
  const parsed = parseTimeline(exportTimelineText(rec, s));
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.value.rotated, exported.rotated);
  const resumed = resumeRecorder(parsed.value, { regionAt });
  assert.deepEqual(exportTimeline(resumed, s).rotated, exported.rotated);
  assert.deepEqual(exportTimeline(resumed, s).events, exported.events);
  // Regions named only inside rotated chunks still count as visited after a reload.
  assert.deepEqual(new Set(resumed.regions), new Set(regions));
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
  s.recovery.losses.push({ vehicleId: "dart_1", position: { x: 0, y: -5, z: 0 }, visited: true });
  step();
  step(60 * 10);
  const resumed = resumeRecorder(parseOk(exportTimelineText(rec, s)), { regionAt });
  assert.deepEqual(resumed.pending, rec.pending);
  assert.deepEqual(resumed.pending[0]!.keys, ["loss:dart_1"]);
  const tick = () => { s.tick++; };
  const go = (n: number, input: boolean) => { for (let i = 0; i < n; i++) { tick(); observe(resumed, s, { input }); } };
  go(1, true);
  go(60 * 50, false);
  go(60 * 5, true);
  s.recovery.losses = [];
  go(1, true);
  const recovery = resumed.events.find((e) => e.kind === "recovery")!;
  // 10 s before the reload, then 1 + 15 (grace) + 5×60 + 1 steps of play; 35 idle seconds excluded.
  assert.ok(Math.abs(recovery.seconds! - (601 + 1 + 900 + 300 + 1) / 60) < 0.05, `${recovery.seconds}`);
  assert.deepEqual(analyseTimeline(exportTimeline(resumed, s)).deaths, { count: 1, recoverySeconds: [recovery.seconds!], nothingLost: 0, unrecovered: 0 });
  // A recovered death is not reopened by a later reload.
  assert.deepEqual(resumeRecorder(exportTimeline(resumed, s)).pending, []);
});
function parseOk(text: string) {
  const r = parseTimeline(text);
  assert.ok(r.ok);
  return r.value;
}

test("two outstanding deaths: recover the second, reload, recover the first; each keeps its own cache and time", () => {
  const { s, rec } = setup();
  let live = rec;
  const go = (n: number, input = true) => { for (let i = 0; i < n; i++) { s.tick++; observe(live, s, { input }); } };
  const die = (at: { x: number; y: number; z: number }) => {
    s.player.pose.position = { ...at };
    s.player.mode = "swimming";
    addItem(s, "silica_glass", 2, "diver");
    incapacitate(s, "Test.");
    go(1);
    return s.recovery.caches.at(-1)!;
  };
  const retrieve = (cache: { position: { x: number; y: number; z: number }; containerId: string }) => {
    s.player.pose.position = { ...cache.position };
    for (const i of s.inventory.items.filter((x) => x.containerId === cache.containerId)) assert.equal(transfer(s, i.id, "diver", i.quantity), null);
    go(1);
  };
  const first = die({ x: -40, y: -10, z: -20 });
  const firstDeath = live.events.at(-1)!;
  assert.deepEqual([firstDeath.kind, firstDeath.keys], ["death", [`cache:${first.id}`]]);
  go(60);
  const second = die({ x: 30, y: -10, z: -60 });
  go(120);
  retrieve(second);
  let recoveries = live.events.filter((e) => e.kind === "recovery");
  assert.equal(recoveries.length, 1);
  assert.deepEqual(recoveries[0]!.keys, [`cache:${second.id}`]);
  assert.ok(Math.abs(recoveries[0]!.seconds! - 121 / 60) < 0.02, `${recoveries[0]!.seconds}`);
  assert.equal(live.pending.length, 1, "the first death is still open");

  // Reload with the first death outstanding, wait idle a while, then retrieve it.
  live = resumeRecorder(parseOk(exportTimelineText(live, s)), { regionAt });
  assert.deepEqual(live.pending.map((p) => p.keys), [[`cache:${first.id}`]]);
  go(1);
  go(60 * 45, false);
  go(60 * 2);
  retrieve(first);
  recoveries = live.events.filter((e) => e.kind === "recovery");
  assert.equal(recoveries.length, 2);
  assert.equal(recoveries[1]!.of, firstDeath.tick);
  // Play since the first death: 1 + 60 + 1 + 120 + 1 before the reload, 1 + 15 s grace + 120 + 1 after; 30 idle seconds excluded.
  assert.ok(Math.abs(recoveries[1]!.seconds! - (1 + 60 + 1 + 120 + 1 + 1 + 900 + 120 + 1) / 60) < 0.05, `${recoveries[1]!.seconds}`);
  const deaths = analyseTimeline(exportTimeline(live, s)).deaths;
  assert.deepEqual([deaths.count, deaths.recoverySeconds.length, deaths.unrecovered], [2, 2, 0]);
});

test("a partly emptied cache keeps its death open; a death that left nothing closes at once as nothing lost", () => {
  const { s, rec, step } = setup();
  s.player.pose.position = { x: -40, y: -10, z: -20 };
  addItem(s, "silica_glass", 2, "diver");
  addItem(s, "flex_membrane", 2, "diver");
  incapacitate(s, "Test.");
  step();
  const cache = s.recovery.caches.at(-1)!;
  s.player.pose.position = { ...cache.position };
  const glass = s.inventory.items.find((i) => i.containerId === cache.containerId && i.kind === "silica_glass")!;
  assert.equal(transfer(s, glass.id, "diver", 2), null);
  step();
  assert.equal(rec.events.filter((e) => e.kind === "recovery").length, 0);
  // Stow the retrieved glass first, so this death drops nothing.
  s.inventory.items.find((i) => i.kind === "silica_glass" && i.containerId === "diver")!.containerId = "pod_locker";
  incapacitate(s, "Again.");
  step();
  const nothing = rec.events.filter((e) => e.kind === "recovery");
  assert.deepEqual(nothing.map((e) => [e.what, e.seconds]), [["nothing-lost", 0]]);
  const deaths = analyseTimeline(exportTimeline(rec, s)).deaths;
  assert.deepEqual(deaths, { count: 2, recoverySeconds: [], nothingLost: 1, unrecovered: 1 });
});

test("R1-C1: the event cursor never resets, so a reader sees every event once across seals, rotation and a reload", () => {
  const { s, rec } = setup();
  let cursor = timelineSince(rec, 0).cursor;
  const read: string[] = [];
  const take = (r: TimelineRecorder): void => {
    const next = timelineSince(r, cursor);
    assert.equal(next.missed, 0);
    read.push(...next.events.map((e) => e.text ?? e.kind));
    cursor = next.cursor;
  };
  const written: string[] = [];
  // Read after every note (the REC-1 pattern), across the first seal.
  for (let i = 0; i < 1001; i++) { addNote(rec, s, `n${i}`); written.push(`n${i}`); take(rec); }
  // Bursts that each cross a seal between two reads.
  for (let b = 0; b < 3; b++) {
    for (let i = 0; i < 700; i++) { addNote(rec, s, `b${b}.${i}`); written.push(`b${b}.${i}`); }
    take(rec);
  }
  assert.deepEqual(read, written);
  // A reload carries the sequence on: the cursor still fits.
  // An open idle span closes into the export, and is a recorded event after the reload.
  rec.idle = { tick: s.tick - 600, play: 0, waiting: new Set() };
  const parsedIdle = parseTimeline(exportTimelineText(rec, s));
  assert.ok(parsedIdle.ok);
  if (!parsedIdle.ok) return;
  const resumed = resumeRecorder(parsedIdle.value, { regionAt });
  assert.equal(resumed.seq, rec.seq + 1);
  written.push("idle");
  addNote(resumed, s, "after reload"); written.push("after reload");
  take(resumed);
  assert.deepEqual(read, written);
  // A reader that lags past the retained window is told how many it missed.
  const lagging = timelineSince(rec, 0);
  assert.equal(lagging.missed + lagging.events.length, rec.seq);
});

test("R1-C1: an export or a save never seals or rotates the live recorder", () => {
  const { s, rec } = setup();
  for (let i = 0; i < TIMELINE_CHUNK_EVENTS - 1; i++) addNote(rec, s, `n${i}`);
  rec.idle = { tick: s.tick - 600, play: 0, waiting: new Set() };
  const [sealed, open, seq] = [rec.sealed.length, rec.events.length, rec.seq];
  const x = exportTimeline(rec, s);
  assert.deepEqual([rec.sealed.length, rec.events.length, rec.seq], [sealed, open, seq]);
  assert.equal(x.events.at(-1)!.kind, "idle", "the open span closes into the export only");
});

/** Export, parse and resume: what a reload of the stored timeline gives. */
function reload(rec: TimelineRecorder, s: GameState): TimelineRecorder {
  const parsed = parseTimeline(exportTimelineText(rec, s));
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
  return resumeRecorder((parsed as { value: TimelineExport }).value, { regionAt });
}
const allNotes = (rec: TimelineRecorder, s: GameState): string[] => {
  const x = exportTimeline(rec, s);
  return [...(x.rotated ?? []).flatMap((r) => r.kept), ...x.events].filter((e) => e.kind === "note").map((e) => e.text!).sort();
};

test("R1-F1: an export at the full window with 998 or 999 open events and open travel or idle keeps every note once, and reloads whole", () => {
  for (const open of [998, 999]) for (const spans of [["idle"], ["travel"], ["travel", "idle"]]) {
    const label = `${open} open, closing ${spans.join("+")}`;
    const s = createGame(); completeOpening(s);
    const rec = createRecorder(SESSION);
    addNote(rec, s, "old note");
    for (let i = 1; i < TIMELINE_CHUNK_EVENTS * TIMELINE_RETAINED_CHUNKS + open - 1; i++) { s.tick += 3; rec.playTicks += 3; recordEvent(rec, s, { kind: "gather", what: "silica_glass", id: "src", quantity: 1 }); }
    addNote(rec, s, "recent note");
    if (spans.includes("travel")) rec.travel = { hull: "dart", vehicleId: "dart_1", last: { x: 0, y: 0, z: 0 }, piece: { tick: s.tick - 600, play: 1, movingTicks: 600, stationaryTicks: 30, metres: 120 } };
    if (spans.includes("idle")) rec.idle = { tick: s.tick - 900, play: 2, waiting: new Set(["decode"]) };
    const back = reload(rec, s);
    assert.deepEqual([rec.sealed.length, rec.events.length], [TIMELINE_RETAINED_CHUNKS, open], `${label}: the live partition is untouched`);
    assert.deepEqual(allNotes(back, s), ["old note", "recent note"], label);
    const a = analyseTimeline(exportTimeline(back, s)), b = analyseTimeline(exportTimeline(rec, s));
    for (const key of ["newCount", "gathering", "notes", "travel", "idle"] as const) assert.deepEqual(a[key], b[key], `${label}: ${key}`);
  }
});

test("R2-F2: a rotated export round-trips with one numbering, then keeps recording and reloading", () => {
  const s = createGame(), rec = createRecorder(SESSION);
  for (let i = 0; i < 23_000; i++) addNote(rec, s, `note ${i}`);
  const back = reload(rec, s);
  const numbers = [...back.rotated.map((r) => r.n), ...back.sealed.map((c) => c.n)];
  assert.equal(new Set(numbers).size, numbers.length, "unique numbers");
  assert.ok(numbers.every((n) => n! < back.nextChunk), "nextChunk beyond every number");
  assert.equal(allNotes(back, s).length, 23_000);
  for (let i = 0; i < 1500; i++) addNote(back, s, `later ${i}`);
  const again = reload(back, s);
  assert.equal(allNotes(again, s).length, 24_500);
  assert.equal(new Set(allNotes(again, s)).size, 24_500, "every note once");
});

test("an export for a full quota folds its oldest chunks: every note kept, the analysis unchanged, the live recorder untouched", () => {
  const s = createGame(); completeOpening(s);
  const rec = createRecorder(SESSION), items = ["silica_glass", "structural_alloy", "meal"];
  for (let i = 0; i < TIMELINE_CHUNK_EVENTS * 12 + 300; i++) {
    s.tick += 30; rec.playTicks += 30;
    if (i % 41 === 0) addNote(rec, s, `note ${i}`);
    else if (i % 97 === 0) recordEvent(rec, s, { kind: "new", what: "blueprint", id: `bp${i}` });
    else if (i % 13 === 0) recordEvent(rec, s, { kind: "travel", seconds: 100 + (i % 7), stationary: 1, metres: 50, hull: "dart", id: "v" });
    else recordEvent(rec, s, { kind: "gather", what: items[i % 3]!, id: "src", quantity: 1 });
  }
  const sealed = rec.sealed.length, full = exportTimelineText(rec, s), whole = analyseTimeline(exportTimeline(rec, s));
  for (const k of [6, 3, 2]) {
    const text = exportTimelineText(rec, s, k), parsed = parseTimeline(text);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    assert.ok(text.length < full.length, `${k} whole: smaller (${text.length} < ${full.length})`);
    assert.equal(rec.sealed.length, sealed, "the live recorder keeps its window");
    const back = resumeRecorder(parsed.value, { regionAt });
    assert.deepEqual(allNotes(back, s), allNotes(rec, s), `${k} whole: every note`);
    const a = analyseTimeline(parsed.value);
    for (const key of ["newCount", "gaps", "gathering", "notes", "deaths"] as const) assert.deepEqual(a[key], whole[key], `${k} whole: ${key}`);
    assert.deepEqual([a.travel.count, a.travel.minutes, a.idle.count], [whole.travel.count, whole.travel.minutes, whole.idle.count], `${k} whole`);
  }
});
