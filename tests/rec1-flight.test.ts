import test from "node:test";
import assert from "node:assert/strict";
import { crc32 as nodeCrc32 } from "node:zlib";
import { FlightRecorder, FRAME_COLUMNS, frameObject, HOLD_CODES, longFrameCause } from "../src/runtime/flight/recorder.js";
import { crc32, zipBlob } from "../src/runtime/flight/zip.js";
import { flightMode } from "../src/runtime/flight/capture.js";
import { recordCommand, recordGameEvents, recordTimeline } from "../src/runtime/flight/game.js";
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

test("a long frame is an event with its split and cause, and asks for one snapshot", () => {
  const r = new FlightRecorder({ snapshotSpacingMs: 250 });
  r.frame(frame(0));
  r.frame(frame(16.7, { gap: 48, work: 44, chunks: 30, caves: 6, render: 5, sim: 2 }));
  const e = r.events.since(0).items.find((x) => x.kind === "long-frame")!;
  assert.match(e.text, /48\.0 ms frame \(streaming\)/);
  assert.equal(e.detail!.chunks, 30);
  assert.equal(e.detail!.outside, 4);
  const want = r.wantSnapshot(20)!;
  assert.deepEqual(want.reasons, [e.seq]);
  const snap = r.snapshotTaken(want, 20);
  assert.equal(r.events.since(0).items.find((x) => x.seq === e.seq)!.snap, snap.seq, "the event names its picture");
  assert.equal(snap.file, "snapshots/00001.jpg");
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
  ]);
  recordCommand(r, s, { type: "scan" });
  const next = recordTimeline(r, [
    { kind: "new", what: "blueprint", id: "dart", tick: 10, play: 1 },
    { kind: "gather", id: "x", tick: 11, play: 1 },
    { kind: "note", text: "too dark here", tick: 12, play: 1 },
  ], 0);
  assert.equal(next, 3);
  const kinds = r.events.since(0).items.map((x) => `${x.kind}:${x.text}`);
  assert.deepEqual(kinds, [
    "damage:hunter strike on the diver: -12.3, health 70", "refusal:refused: Cannot exit here", "notice:Saved locally", "threat:threat call",
    "action:scan", "milestone:new blueprint dart", "action:gather x", "note:note: too dark here",
  ]);
});

test("the recorder's mode: on by default for play, off or driver by URL, video by setting or URL", () => {
  assert.deepEqual(flightMode({ enabled: true, video: true }, ""), { mode: "playtest", video: true });
  assert.deepEqual(flightMode({ enabled: true, video: false }, ""), { mode: "playtest", video: false });
  assert.deepEqual(flightMode({ enabled: false, video: true }, ""), { mode: "off", video: false });
  assert.deepEqual(flightMode({ enabled: true, video: true }, "?rec=off"), { mode: "off", video: false });
  assert.deepEqual(flightMode({ enabled: false, video: true }, "?rec=driver"), { mode: "driver", video: false });
  assert.deepEqual(flightMode({ enabled: true, video: true }, "?rec=driver&recvideo=1"), { mode: "driver", video: true });
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
