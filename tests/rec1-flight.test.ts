import test from "node:test";
import assert from "node:assert/strict";
import { crc32 as nodeCrc32 } from "node:zlib";
import { FlightRecorder, FRAME_COLUMNS, frameObject, HOLD_CODES, longFrameCause } from "../src/runtime/flight/recorder.js";
import { crc32, zipBlob } from "../src/runtime/flight/zip.js";
import { flightMode } from "../src/runtime/flight/capture.js";
import { recordCommand, recordGameEvents, recordTimeline, timelineHead, timelineSince, TimelineReader } from "../src/runtime/flight/game.js";
import { addNote, createRecorder, exportTimeline, recordEvent, resumeRecorder } from "../src/sim/timeline/recorder.js";
import { createGame } from "../src/sim/state.js";

const frame = (t: number, extra: Record<string, number | string | null> = {}) => ({ t, gap: 16.7, work: 4, sim: 1, steps: 1, chunks: 0.5, caves: 0.2, render: 2, ...extra });

test("each consumer reads every frame row through its own cursor; overwritten rows are counted as lost", () => {
  const r = new FlightRecorder({ frameCapacity: 8 });
  for (let i = 0; i < 5; i++) r.frame(frame(1000 + i * 16.7));
  const a = r.frames.since(0), b = r.frames.since(0);
  assert.equal(a.rows.length, 5);
  assert.deepEqual(a.rows, b.rows, "a second reader sees the same rows");
  assert.equal(a.rows[0]!.length, FRAME_COLUMNS.length);
  assert.equal(frameObject(a.rows[2]!).t, 1033.4, "t keeps its precision past Float32");
  for (let i = 5; i < 20; i++) r.frame(frame(1000 + i * 16.7));
  const c = r.frames.since(a.next);
  assert.equal(c.lost, 7, "rows 5..11 were overwritten before this reader came back");
  assert.equal(c.rows.length, 8);
  assert.equal(c.next, 20);
  assert.deepEqual(r.frames.since(20), { next: 20, lost: 0, rows: [] });
});

test("R1-F1: an interval and the callback that ran in it are separate observations; a streaming overrun cannot pass", () => {
  const r = new FlightRecorder({ snapshotSpacingMs: 250 });
  r.frame(frame(950));
  // The review's two rows: a 44 ms streaming callback, then the 50 ms interval it caused.
  r.frame(frame(1000, { gap: 16.7, work: 44, chunks: 36, caves: 0.2, sim: 2, render: 4 }));
  r.frame(frame(1050, { gap: 50, work: 4, chunks: 0.2 }));
  const long = r.events.since(0).items.filter((x) => x.kind === "long-frame");
  assert.deepEqual(long.map((x) => [x.t, x.detail!.observation, x.detail!.cause]), [[1000, "callback", "streaming"], [1050, "interval", "streaming"]]);
  assert.equal(long[1]!.detail!.callbackAt, 1000, "the interval names the callback that owns it");
  assert.equal(long[1]!.detail!.chunks, 36, "with that callback's split, not the next one's");
  assert.equal(long[0]!.detail!.ms, 44);
  const want = r.wantSnapshot(1060)!;
  assert.deepEqual(want.reasons, [long[0]!.seq], "one picture per long-frame burst");
  const snap = r.snapshotTaken(want, 1060);
  assert.equal(r.events.since(0).items.find((x) => x.seq === long[0]!.seq)!.snap, snap.seq, "the event names its picture");
});

test("R1-F1: a GPU-only delay and an outside-task delay are named as such, never as the game's work", () => {
  const gpu = new FlightRecorder();
  gpu.frame(frame(0, { gpu: 30 }));
  gpu.frame(frame(16.7, { gap: 16.7, work: 4, gpu: 32 }));
  gpu.frame(frame(66.7, { gap: 50, work: 4 }));
  assert.deepEqual(gpu.events.since(0).items.filter((x) => x.kind === "long-frame").map((x) => [x.detail!.observation, x.detail!.cause]), [["interval", "GPU"]]);
  const outside = new FlightRecorder();
  outside.frame(frame(0));
  outside.frame(frame(16.7, { gap: 16.7, work: 4, gpu: 4 }));
  outside.frame(frame(66.7, { gap: 50, work: 4, gpu: 4 }));
  const e = outside.events.since(0).items.filter((x) => x.kind === "long-frame");
  assert.deepEqual(e.map((x) => [x.detail!.observation, x.detail!.cause]), [["interval", "outside the game's frame"]]);
  assert.equal(e[0]!.detail!.outside, 46);
});

test("R1-S3: a GPU result for a row that is no longer waiting is discarded", () => {
  const r = new FlightRecorder();
  for (let i = 0; i < 40; i++) r.frame(frame(i * 16, { gpuTag: i + 1 }));
  for (let i = 0; i < 40; i++) r.gpuResolved(i + 1, 3);
  assert.ok(r.gpuPending <= 7, `bounded by the waiting rows: ${r.gpuPending}`);
  r.settle();
  r.gpuResolved(5, 3);
  assert.equal(r.gpuPending, 0, "nothing waits after a settle, so nothing is kept");
});

test("long-frame causes follow CW-1's rule: a part that is half the frame's own work owns it", () => {
  assert.equal(longFrameCause(50, 10, 1, 1, 7, -1), "outside the game's frame");
  assert.equal(longFrameCause(50, 10, 1, 1, 7, 6), "outside the game's frame: a collection");
  assert.equal(longFrameCause(40, 38, 20, 5, 5, -1), "simulation");
  assert.equal(longFrameCause(40, 38, 2, 5, 25, -1), "render");
  assert.equal(longFrameCause(40, 38, 10, 10, 10, -1), "mixed");
});

test("events in a burst share one snapshot, spaced apart; exempt kinds take none", () => {
  const r = new FlightRecorder({ snapshotSpacingMs: 250 });
  const a = r.event("damage", "bite", { t: 100 }), b = r.event("threat", "alert", { t: 101 });
  r.event("action", "scan", { t: 102 });
  const first = r.wantSnapshot(110)!;
  assert.deepEqual(first.reasons, [a, b]);
  r.snapshotTaken(first, 110);
  const c = r.event("refusal", "refused", { t: 120 });
  assert.equal(r.wantSnapshot(200), null, "inside the spacing");
  assert.deepEqual(r.wantSnapshot(400)!.reasons, [c]);
  r.snapshotsOn = false;
  r.event("error", "x", { t: 500 });
  assert.equal(r.wantSnapshot(900), null, "snapshots off");
});

test("cave holds become events on entry, state change and release, with the hold's length", () => {
  const r = new FlightRecorder();
  r.frame(frame(0, { hold: "clear" }));
  r.frame(frame(16, { hold: null }), 0); // not evaluated: no change
  r.frame(frame(32, { hold: "loading" }));
  r.frame(frame(48, { hold: "loading" }));
  r.frame(frame(64, { hold: "rescue" }));
  r.frame(frame(4064, { hold: "admitted" }));
  const holds = r.events.since(0).items.filter((x) => x.kind === "hold").map((x) => x.text);
  assert.deepEqual(holds, ["cave hold: loading", "cave hold: rescue", "cave hold ended after 4.0 s (admitted)"]);
  const rows = r.frames.since(0).rows.map((x) => HOLD_CODES[frameObject(x).hold]);
  assert.deepEqual(rows, ["clear", null, "loading", "loading", "rescue", "admitted"]);
});

test("the recorder accounts its own time per frame", () => {
  const r = new FlightRecorder();
  r.charge(0.05);
  r.frame(frame(0), 0.02);
  r.frame(frame(16), 0.01);
  const o = r.overhead();
  assert.equal(o.frames, 2);
  assert.ok(Math.abs(o.meanMs - 0.04) < 1e-9);
  assert.ok(Math.abs(o.worstMs - 0.07) < 1e-9);
  assert.ok(Math.abs(frameObject(r.frames.since(0).rows[0]!).rec - 0.07) < 0.01);
});

test("game events map to damage, threat, refusal and notice; commands to actions; timeline to milestones", () => {
  const r = new FlightRecorder(), s = createGame();
  recordGameEvents(r, s, [
    { type: "threat-damage", source: "hunter", target: { kind: "diver" }, loss: 12.34, healthAfter: 70 },
    { type: "impact", speed: 4, hullLoss: 0, origin: { x: 0, y: 0, z: 0 } },
    { type: "notice", message: "Cannot exit here", error: true, channel: "action", refusal: { kind: "exit", vehicleId: "dart-1", code: "depth" } },
    { type: "notice", message: "Saved locally", channel: "persistence" },
    { type: "sound", cue: "warning", source: "threat-call", origin: { x: 1, y: 2, z: 3 } },
    // R1-F9: an oxygen hazard notice is a warning, never a refusal.
    { type: "notice", message: "Oxygen low", error: true, channel: "hazard", context: "oxygen" },
  ]);
  recordCommand(r, s, { type: "scan" });
  const timeline = createRecorder({ id: "t", started: "" });
  recordEvent(timeline, s, { kind: "new", what: "blueprint", id: "dart" });
  recordEvent(timeline, s, { kind: "gather", id: "x" });
  addNote(timeline, s, "too dark here");
  const next = recordTimeline(r, timeline, 0);
  assert.equal(next, 3);
  assert.equal(recordTimeline(r, timeline, next), 3, "nothing new: the cursor stays");
  const kinds = r.events.since(0).items.map((x) => `${x.kind}:${x.text}`);
  assert.deepEqual(kinds, [
    "damage:hunter strike on the diver: -12.3, health 70", "refusal:refused: Cannot exit here", "notice:Saved locally", "threat:threat call", "threat:warning: Oxygen low",
    "action:scan", "milestone:new blueprint dart", "action:gather x", "note:note: too dark here",
  ]);
});

test("the recorder's mode: on by default for play, off or driver by URL, video by setting or URL", () => {
  assert.deepEqual(flightMode({ enabled: true, video: true }, "", false), { mode: "playtest", video: true });
  assert.deepEqual(flightMode({ enabled: true, video: false }, "", false), { mode: "playtest", video: false });
  assert.deepEqual(flightMode({ enabled: false, video: true }, "", false), { mode: "off", video: false });
  assert.deepEqual(flightMode({ enabled: true, video: true }, "?rec=off"), { mode: "off", video: false });
  assert.deepEqual(flightMode({ enabled: false, video: true }, "?rec=driver"), { mode: "driver", video: false });
  assert.deepEqual(flightMode({ enabled: true, video: true }, "?rec=driver&recvideo=1"), { mode: "driver", video: true });
  assert.deepEqual(flightMode({ enabled: true, video: true }, "", true), { mode: "driver", video: false }, "an automated browser records cheaply unless told otherwise");
  assert.deepEqual(flightMode({ enabled: true, video: true }, "?rec=playtest", true), { mode: "playtest", video: true });
});

test("the ZIP is a valid store-only archive with correct CRCs", async () => {
  const hello = new TextEncoder().encode("hello flight");
  assert.equal(crc32(hello), nodeCrc32(hello));
  const big = new Uint8Array(70000).map((_, i) => i * 7);
  const zip = new Uint8Array(await (await zipBlob([
    { name: "header.json", data: new Blob(["{}"]) },
    { name: "snapshots/00001.jpg", data: new Blob([big]) },
  ], new Date(2026, 9, 23, 12, 0, 0))).arrayBuffer());
  const dv = new DataView(zip.buffer);
  const eocd = zip.length - 22;
  assert.equal(dv.getUint32(eocd, true), 0x06054b50);
  assert.equal(dv.getUint16(eocd + 10, true), 2, "two entries");
  let at = dv.getUint32(eocd + 16, true);
  const names: string[] = [];
  for (let i = 0; i < 2; i++) {
    assert.equal(dv.getUint32(at, true), 0x02014b50);
    const crc = dv.getUint32(at + 16, true), size = dv.getUint32(at + 24, true), n = dv.getUint16(at + 28, true), local = dv.getUint32(at + 42, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + n));
    names.push(name);
    const ln = dv.getUint16(local + 26, true), lx = dv.getUint16(local + 28, true), data = zip.subarray(local + 30 + ln + lx, local + 30 + ln + lx + size);
    assert.equal(nodeCrc32(data), crc, `${name} CRC`);
    at += 46 + n + dv.getUint16(at + 30, true) + dv.getUint16(at + 32, true);
  }
  assert.deepEqual(names, ["header.json", "snapshots/00001.jpg"]);
});

test("a staged fixed view puts the diver alone at the pose, still, with the craft left where it was", async () => {
  const { stageView } = await import("../src/runtime/flight/game.js");
  const { makeVehicle } = await import("../src/sim/state.js");
  const s = createGame();
  const dart = makeVehicle("dart-1", "dart", { x: 5, y: -10, z: 5 }, "cargo-dart-1");
  s.fleet.vehicles.push(dart);
  s.player.controlledVehicleId = "dart-1";
  s.player.mode = "piloting";
  const out = stageView(s, { position: { x: 100, y: -40, z: -200 }, yaw: 90, pitch: -10, lamp: false, tick: 777 });
  assert.equal(out.player.controlledVehicleId, null);
  assert.equal(out.player.mode, "swimming");
  assert.deepEqual(out.player.pose.position, { x: 100, y: -40, z: -200 });
  assert.ok(Math.abs(out.player.pose.yaw - Math.PI / 2) < 1e-9 && Math.abs(out.player.pose.pitch + Math.PI / 18) < 1e-9);
  assert.equal(out.player.lamp, false);
  assert.equal(out.tick, 777);
  assert.deepEqual(out.fleet.vehicles.find((v) => v.id === "dart-1")!.pose.position, { x: 5, y: -10, z: 5 });
  assert.equal(s.player.controlledVehicleId, "dart-1", "the original state is untouched");
});

test("a frame's GPU time lands on that frame's own row, rows stay in order, and an unresolved query is written without one", async () => {
  const { GPU_WAIT_FRAMES } = await import("../src/runtime/flight/recorder.js");
  const r = new FlightRecorder();
  r.frame(frame(0, { gpuTag: 1 }));
  r.frame(frame(16, { gpuTag: 2 }));
  assert.equal(r.frames.written, 0, "rows wait for their GPU time");
  r.gpuResolved(2, 5.5);
  r.frame(frame(33, { gpuTag: 3 }));
  assert.equal(r.frames.written, 0, "row 2 is known, but row 1 is still waiting: order is kept");
  r.gpuResolved(1, 4.25);
  r.gpuResolved(3, 6);
  r.frame(frame(50, { gpuTag: -1 }));
  const rows = r.frames.since(0).rows.map((x) => frameObject(x));
  assert.deepEqual(rows.map((x) => [x.t, x.gpu]), [[0, 4.25], [16, 5.5], [33, 6], [50, -1]]);
  for (let i = 0; i <= GPU_WAIT_FRAMES; i++) r.frame(frame(66 + i * 16, { gpuTag: 100 + i }));
  assert.equal(frameObject(r.frames.since(4).rows[0]!).gpu, -1, "a query that never resolves: written without a GPU time after the wait");
  r.settle();
  assert.equal(r.frames.written, 4 + GPU_WAIT_FRAMES + 1);
});

test("R1-F4: why admission was not evaluated is recorded, and never breaks a hold's transitions", async () => {
  const { HOLD_CODES } = await import("../src/runtime/flight/recorder.js");
  const r = new FlightRecorder();
  r.frame(frame(0, { hold: "loading" }));
  r.frame(frame(16, { hold: "inactive" }));
  r.frame(frame(32, { hold: "loading" }));
  r.frame(frame(48, { hold: "clear" }));
  assert.deepEqual(r.frames.since(0).rows.map((x) => HOLD_CODES[frameObject(x).hold]), ["loading", "inactive", "loading", "clear"]);
  assert.deepEqual(r.events.since(0).items.filter((x) => x.kind === "hold").map((x) => x.text), ["cave hold: loading", "cave hold ended after 0.0 s (clear)"]);
});

test("R1-F9: survival injury becomes a damage episode: onset with a picture, an end with its total; strikes are not counted twice", async () => {
  const { SurvivalWatch } = await import("../src/runtime/flight/game.js");
  const r = new FlightRecorder(), w = new SurvivalWatch();
  let s = createGame();
  s.opening.phase = 4;
  const step = (fn: (x: typeof s) => void, events: Parameters<typeof w.observe>[3] = []) => {
    const next = structuredClone(s); next.tick++; fn(next); w.observe(r, s, next, events, next.tick * 16.7); s = next;
  };
  for (let i = 0; i < 30; i++) step((x) => { x.player.vitals.oxygen = 0; x.player.vitals.health -= 0.2; });
  // A strike in the same step is the strike's, not survival's.
  step((x) => { x.player.vitals.health -= 10; }, [{ type: "threat-damage", source: "hunter", target: { kind: "diver" }, loss: 10, healthAfter: 0 }]);
  for (let i = 0; i < 130; i++) step((x) => { x.player.vitals.oxygen = 50; });
  const damage = r.events.since(0).items.filter((x) => x.kind === "damage");
  assert.equal(damage.length, 2);
  assert.equal(damage[0]!.text, "oxygen damage to the diver");
  assert.match(damage[1]!.text, /oxygen damage to the diver ended: -6 over 0\.5 s/);
  assert.equal(r.wantSnapshot(1e9)!.reasons[0], damage[0]!.seq, "the onset asks for a picture");
});

// SIM-1 composition: the recorder reads the play timeline through a cursor that
// counts entries ever recorded, never an index into the open chunk, so it
// survives SIM-1 sealing a full chunk and resetting `events`. Whoever wires
// SIM-1's `timelineSince` into the seam adds a burst-across-seal case here.
test("the timeline cursor: a burst of notes is read once and whole; a new recording starts at the head", () => {
  const r = new FlightRecorder(), s = createGame(), timeline = createRecorder({ id: "t", started: "" });
  addNote(timeline, s, "before the recording");
  let cursor = timelineHead(timeline);
  assert.equal(timelineSince(timeline, cursor).events.length, 0);
  for (let i = 0; i < 1001; i++) addNote(timeline, s, `n${i}`);
  cursor = recordTimeline(r, timeline, cursor);
  const notes = r.events.since(0).items.filter((e) => e.kind === "note").map((e) => e.text);
  assert.equal(notes.length, 1001, "every note in the burst, the 1,000th included");
  assert.equal(notes[999], "note: n999");
  assert.ok(!notes.includes("note: before the recording"), "entries before the head are not replayed");
  assert.equal(recordTimeline(r, timeline, cursor), cursor);
  assert.equal(r.events.since(0).items.filter((e) => e.kind === "note").length, 1001, "read once");
});

// SIM-1 R2-C1: a cursor belongs to one timeline. App entry and replacement go
// through TimelineReader.start, which takes the head of the timeline it is given.
const notesIn = (r: FlightRecorder) => r.events.since(0).items.filter((e) => e.kind === "note").map((e) => e.text);

test("re-entering a reloaded timeline past 1,000 entries replays none of them; the next note is read once", () => {
  const s = createGame(), a = createRecorder({ id: "a", started: "" });
  for (let i = 0; i < 2500; i++) addNote(a, s, `old ${i}`);
  const reloaded = resumeRecorder(exportTimeline(a, s));
  const r = new FlightRecorder(), reader = new TimelineReader();
  reader.start(reloaded);
  reader.read(r, reloaded);
  assert.equal(notesIn(r).length, 0, "the reloaded history is not replayed");
  addNote(reloaded, s, "after the reload");
  reader.read(r, reloaded);
  assert.deepEqual(notesIn(r), ["note: after the reload"]);
});

test("a timeline replaced by a shorter session: the new one's notes are all read, none hidden by the old count", () => {
  const s = createGame(), a = createRecorder({ id: "a", started: "" }), r = new FlightRecorder(), reader = new TimelineReader();
  reader.start(a);
  for (let i = 0; i < 2500; i++) addNote(a, s, `a ${i}`);
  reader.read(r, a);
  assert.equal(notesIn(r).length, 2500);
  const b = createRecorder({ id: "b", started: "" });
  reader.start(b);
  for (let i = 0; i < 3; i++) addNote(b, s, `b ${i}`);
  reader.read(r, b);
  assert.deepEqual(notesIn(r).slice(2500), ["note: b 0", "note: b 1", "note: b 2"]);
});

test("a timeline nobody started is read from its present, never with another timeline's cursor", () => {
  const s = createGame(), a = createRecorder({ id: "a", started: "" }), r = new FlightRecorder(), reader = new TimelineReader();
  reader.start(a);
  for (let i = 0; i < 2500; i++) addNote(a, s, `a ${i}`);
  reader.read(r, a);
  const b = createRecorder({ id: "b", started: "" });
  addNote(b, s, "before anyone read b");
  reader.read(r, b);
  addNote(b, s, "b after");
  reader.read(r, b);
  assert.deepEqual(notesIn(r).slice(2500), ["note: b after"]);
});
