import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// REC-1 R2: the real FlightCapture against a fake spool worker that records
// every message, answers in order (as the worker does) and can refuse writes.
// Off during an encoding (R2-3), the loss ledger (R2-2), the budget at
// exhaustion and the export copy (R2-1), retiring a superseded recording (R2-5).

type Msg = { op: string; id?: number; dir?: string; file?: string | null; data?: ArrayBuffer; out?: string };
class FakeWorker {
  static alive = new Set<FakeWorker>();
  static refuse: ((m: Msg) => { quota: boolean } | null) | null = null;
  /** A removal the "browser" refuses (another tab holds the file). */
  static refuseRemove: ((m: Msg) => boolean) | null = null;
  /** The encoder's answer to each video frame: kept, or refused with why; "throw" fails the operation. */
  static videoAnswer: ((m: Msg & { t?: number }) => "kept" | "throw" | string) | null = null;
  readonly posted: Msg[] = [];
  readonly files = new Map<string, string>();
  readonly exports: Map<string, string>[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  private origin = false;
  private chain = Promise.resolve();
  constructor() { FakeWorker.alive.add(this); }
  terminate(): void { FakeWorker.alive.delete(this); }
  postMessage(m: Msg): void {
    this.posted.push(m);
    this.chain = this.chain.then(() => new Promise<void>((done) => setTimeout(async () => { await this.handle(m); done(); }, 0)));
  }
  private reply(data: unknown): void { this.onmessage?.({ data }); }
  private async handle(m: Msg): Promise<void> {
    if (m.op === "append" || m.op === "put") {
      const text = new TextDecoder().decode(m.data!), bytes = m.data!.byteLength;
      const refused = FakeWorker.refuse?.(m);
      if (refused) { this.reply({ failed: m.file, bytes, quota: refused.quota, error: "refused by the test" }); return; }
      this.files.set(m.file!, (m.op === "put" ? "" : this.files.get(m.file!) ?? "") + text);
      this.reply({ ack: bytes, file: m.file });
    } else if (m.op === "snapshot") {
      // The picture is encoded in the worker: the test finishes (or fails) the encoding when it chooses.
      try {
        const blob = await new Promise<Blob>((resolve, reject) => encodings.push({ resolve, reject }));
        const text = await blob.text();
        this.files.set(m.file!, text);
        this.reply({ snapshotWritten: m.id, bytes: text.length });
      } catch (e) { this.reply({ snapshotWritten: m.id, error: e instanceof Error ? e.message : String(e) }); }
    } else if (m.op === "remove") this.reply(FakeWorker.refuseRemove?.(m) ? { removed: m.id, refused: "NoModificationAllowedError", error: "in use" } : { removed: m.id });
    else if (m.op === "release") this.reply({ released: m.id });
    else if (m.op === "video-open") {
      // The worker opens the first rung it is offered (the page planned it).
      const key = (m as Msg & { rungs: string[] }).rungs[0] ?? "vp9";
      const id = key.startsWith("h264") ? "V_MPEG4/ISO/AVC" : key.startsWith("hevc") ? "V_MPEGH/ISO/HEVC" : key.startsWith("av1") ? "V_AV1" : key.startsWith("vp8") ? "V_VP8" : "V_VP9";
      this.reply({ videoOpened: m.file, codec: id, hardware: key.endsWith("-hw"), rung: key });
    }
    else if (m.op === "video-frame") {
      const t = (m as Msg & { t: number }).t, answer = FakeWorker.videoAnswer?.(m as Msg & { t: number }) ?? "kept";
      if (answer === "throw") { this.reply({ videoError: "OperationError: the encoder threw" }); this.reply({ opFailed: "video-frame", error: "the encoder threw" }); }
      else if (answer === "kept") { if (!this.origin) { this.origin = true; this.reply({ videoOrigin: "video/000.webm", t }); } this.reply({ videoFrame: 1, kept: true, t }); }
      else this.reply({ videoFrame: 1, kept: false, t, why: answer });
    }
    else if (m.op === "barrier") this.reply({ barrier: m.id });
    else if (m.op === "export") { this.exports.push(new Map(this.files)); this.reply({ exported: m.id, bytes: [...this.files.values()].reduce((a, x) => a + x.length, 0) }); }
    else if (m.op === "video-flush") this.reply({ videoFlushed: m.id });
    else if (m.op === "video-close") this.reply({ videoClosed: m.id });
  }
}

/** Pictures whose encoding the test finishes (or fails) when it chooses. */
const encodings: { resolve: (b: Blob) => void; reject: (e: Error) => void }[] = [];
let older: { name: string; size: number }[] = [];
/** The fake browser's platform (software encoding is allowed only on Linux). */
let fakePlatform = "Linux x86_64";
/** The fake browser's hardware encoders, by codec family. */
let hardwareEncoders = new Set<string>();

function browser(search = ""): void {
  const g = globalThis as Record<string, unknown>;
  const fileDir = (names: { name: string; size: number }[]) => ({
    async *entries() { for (const f of names) yield [f.name, { kind: "file", getFile: async () => ({ size: f.size }) }]; },
    getDirectoryHandle: async () => fileDir([]),
    getFileHandle: async () => ({ getFile: async () => new Blob(["zip"]) }),
  });
  const nested = (base: string) => {
    // flight/<session>/<file>: the older recordings the survey finds.
    const sessions = new Map<string, { name: string; size: number }[]>();
    for (const f of older) { const [s, ...rest] = f.name.split("/"); if (base === "flight") sessions.set(s!, [...(sessions.get(s!) ?? []), { name: rest.join("/"), size: f.size }]); }
    return { async *entries() { for (const [s, fs] of sessions) yield [s, { kind: "directory", ...fileDir(fs) }]; }, getDirectoryHandle: async () => fileDir([]), getFileHandle: async () => ({ getFile: async () => new Blob(["zip"]) }) };
  };
  // Defined, not assigned: newer Node has a getter-only `navigator`.
  const install = (values: Record<string, unknown>) => { for (const [k, v] of Object.entries(values)) Object.defineProperty(g, k, { value: v, configurable: true, writable: true }); };
  install({
    location: { search },
    document: { querySelector: () => null },
    navigator: { userAgent: "test", platform: fakePlatform, webdriver: false, storage: { estimate: async () => ({ quota: 100 * 1024 ** 3 }), getDirectory: async () => ({ getDirectoryHandle: async (n: string) => nested(n) }) } },
    screen: { width: 1280, height: 720 }, devicePixelRatio: 1, crossOriginIsolated: false,
    addEventListener: () => {}, Worker: FakeWorker,
    createImageBitmap: async () => ({ width: 480, height: 270, close() {} }),
    VideoEncoder: class { static async isConfigSupported(c: { codec: string; hardwareAcceleration?: string }) { return { supported: c.hardwareAcceleration !== "prefer-hardware" || hardwareEncoders.has(c.codec.split(".")[0]!) }; } },
    VideoFrame: class {},
    OffscreenCanvas: class { getContext() { return { transferFromImageBitmap() {} }; } convertToBlob() { return new Promise<Blob>((resolve, reject) => encodings.push({ resolve, reject })); } },
  });
}
const canvas = { width: 1280, height: 720, getContext: () => null } as unknown as HTMLCanvasElement;
const build = { content: "test", bake: "", commit: "test" };
const settle = () => new Promise((r) => setTimeout(r, 20));
async function capture(search = "", video = false) {
  browser(search);
  FakeWorker.refuse = null; FakeWorker.refuseRemove = null; FakeWorker.videoAnswer = null;
  const { FlightCapture } = await import("../src/runtime/flight/capture.js");
  const c = new FlightCapture(canvas, "playtest", video, build);
  await settle();
  const worker = [...FakeWorker.alive].at(-1)!;
  return { c, worker };
}
const lines = (text = "") => text.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

test("R2-3: Off during a picture's encoding waits for it; the picture is written, then the export has it", async () => {
  const { c, worker } = await capture();
  c.recorder.event("note", "note: Off while encoding", { t: 1 });
  c.afterRender(2);
  await settle();
  assert.equal(encodings.length, 1, "the picture is encoding");
  c.stop();
  await settle();
  encodings.shift()!.resolve(new Blob(["the picture"]));
  await c.exportZip();
  const index = lines(worker.files.get("snapshots.ndjson"));
  assert.equal(index.length, 1);
  assert.equal(index[0].missing, undefined, "not declared missing");
  assert.equal(worker.files.get(index[0].file), "the picture", "the JPEG was written");
});

test("R2-3: a picture whose encoding fails during Off is declared missing with why; the recording still finishes", async () => {
  const { c, worker } = await capture();
  c.recorder.event("note", "note: a failing picture", { t: 1 });
  c.afterRender(2);
  await settle();
  c.stop();
  encodings.shift()!.reject(new Error("no GPU"));
  await c.exportZip();
  const index = lines(worker.files.get("snapshots.ndjson"));
  assert.match(index[0].missing, /encoding failed: no GPU/);
});

test("R2-2: every ring's overwritten entries are in the ledger and the header, and integrity reports them", async () => {
  const { c, worker } = await capture();
  for (let i = 0; i < c.recorder.events.capacity + 3; i++) c.recorder.event("action", `action ${i}`, { snapshot: false });
  c.flush(1000);
  await c.exportZip();
  const header = JSON.parse(worker.exports.at(-1)!.get("header.json")!);
  assert.ok(header.retention.ringLost.events >= 3, `events overwritten: ${header.retention.ringLost.events}`);
  const { integrityOf } = await import(pathToFileURL(path.resolve("scripts/rec/analyse.mjs")).href);
  const events = lines(worker.exports.at(-1)!.get("events.ndjson"));
  const integrity = integrityOf({ header, events, snapshots: [], rec: tmpdir() }, events);
  assert.equal(integrity.known, true);
  assert.ok(integrity.problems.some((p: string) => /events overwritten in memory/.test(p)), integrity.problems.join("; "));
});

test("R2-2: no private storage: the memory export carries what the rings overwrote", async () => {
  browser();
  const g = globalThis as Record<string, unknown>, worker = g.Worker;
  Object.defineProperty(g, "Worker", { value: undefined, configurable: true, writable: true });
  const { FlightCapture } = await import("../src/runtime/flight/capture.js");
  const c = new FlightCapture(canvas, "playtest", false, build);
  Object.defineProperty(g, "Worker", { value: worker, configurable: true, writable: true });
  for (let i = 0; i < c.recorder.events.capacity + 5; i++) c.recorder.event("action", `action ${i}`, { snapshot: false });
  await c.exportZip();
  assert.ok((c.header.retention as { ringLost: { events: number } }).ringLost.events >= 5);
});

test("R2-2: bytes are counted as UTF-8; a refused write is in the ledger and the backlog returns to zero", async () => {
  const { c } = await capture();
  const internals = c as unknown as { post(f: string, d: string): void; stored: Map<string, { bytes: number }>; spool: { backlog: number }; ledger: { lost: { file: string }[] } };
  internals.post("events.ndjson", "汉字💧\n");
  assert.equal(internals.stored.get("events.ndjson")!.bytes, Buffer.byteLength("汉字💧\n", "utf8"));
  FakeWorker.refuse = (m) => (m.file === "samples.ndjson" ? { quota: false } : null);
  internals.post("samples.ndjson", "ünïcødé\n");
  // The fake worker answers in order, a task per message: wait for its answers (a loaded machine is slower).
  for (let i = 0; i < 100 && internals.spool.backlog !== 0; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(internals.spool.backlog, 0, "acknowledged and refused writes both leave the backlog");
  assert.ok(internals.ledger.lost.some((l) => l.file === "samples.ndjson"));
});

test("R2-2: a refused write before an export is in that export's header (the barrier comes first)", async () => {
  const { c, worker } = await capture();
  c.recorder.frame({ t: 1, gap: 16.7, work: 3, hold: "clear" } as never);
  FakeWorker.refuse = (m) => (m.file === "frames.ndjson" ? { quota: false } : null);
  await c.exportZip();
  const header = JSON.parse(worker.exports.at(-1)!.get("header.json")!);
  assert.ok(header.retention.lost.some((l: { file: string }) => l.file === "frames.ndjson"), "the refused frames append is in the exported ledger");
});

test("R2-2: an older recording's removal is recorded with its session, file, bytes and reason", async () => {
  older = [{ name: "2026-01-01/video/000.webm", size: 5 * 1048576 }, { name: "2026-01-01/frames.ndjson", size: 1000 }];
  try {
    const { c } = await capture("?recbudget=1");
    const ledger = c.header.retention as { removedOlder: { session: string; file: string | null; bytes: number; why: string }[] };
    assert.ok(ledger.removedOlder.some((r) => r.session === "2026-01-01" && r.file === "video/000.webm" && r.bytes === 5 * 1048576 && /older recording/.test(r.why)), JSON.stringify(ledger.removedOlder));
  } finally { older = []; }
});

test("R2-1: telemetry alone over the budget, video already off: the recording stops with a durable fact, and stays exportable", async () => {
  const { c, worker } = await capture("?recbudget=1");
  for (let i = 0; i < 3000; i++) c.recorder.sample({ t: i, note: "x".repeat(400) } as never);
  c.flush(1000);
  await settle();
  assert.equal(c.stopped, true, "stopped rather than growing past the budget");
  const ledger = c.header.retention as { stopped: { why: string } | null; lost: { why: string }[] };
  assert.match(ledger.stopped!.why, /telemetry fills the storage budget/);
  assert.ok(ledger.lost.some((l) => /nothing after this moment was recorded/.test(l.why)));
  await c.exportZip();
  const header = JSON.parse(worker.exports.at(-1)!.get("header.json")!);
  assert.ok(header.retention.stopped, "the stop is in the exported header");
});

test("R2-1: an export copy over the budget is recorded with how far over", async () => {
  const { c, worker } = await capture("?recbudget=1");
  // About 0.65 MiB of telemetry: within the 1 MiB budget, but not twice over.
  for (let i = 0; i < 1600; i++) c.recorder.sample({ t: i, note: "y".repeat(400) } as never);
  c.flush(1000);
  await settle();
  assert.equal(c.stopped, false);
  await c.exportZip();
  const ledger = c.header.retention as { exportOver: { bytes: number }[] };
  assert.equal(ledger.exportOver.length, 1, "the copy's overage is recorded");
  assert.ok(ledger.exportOver[0]!.bytes > 0);
  const header = JSON.parse(worker.exports.at(-1)!.get("header.json")!);
  assert.equal(header.retention.exportOver.length, 1, "and is in the exported header");
});

test("R2-5: retiring a superseded recording terminates its worker after its export; four Off/on cycles keep at most two alive", async () => {
  FakeWorker.alive.clear();
  browser();
  const { FlightCapture } = await import("../src/runtime/flight/capture.js");
  let done: InstanceType<typeof FlightCapture> | null = null;
  const retiring: Promise<void>[] = [];
  for (let i = 0; i < 4; i++) {
    const c = new FlightCapture(canvas, "playtest", false, build);
    await settle();
    c.stop();
    const superseded = done;
    done = c;
    if (superseded) retiring.push(superseded.retire());
  }
  await Promise.all(retiring);
  assert.equal(FakeWorker.alive.size, 1, "only the latest completed recording keeps its worker");
  const exported = await done!.exportZip();
  assert.equal(exported.name.endsWith(".zip"), true, "the latest completed recording still exports");
});

test("R2-4: a campaign-length timeline page is bounded and draws without spreading its data", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "rec1-timeline-"));
  try {
    mkdirSync(dir, { recursive: true });
    const { timelineHtml } = await import(pathToFileURL(path.resolve("scripts/rec/timeline.mjs")).href);
    const frames = Array.from({ length: 360_000 }, (_, i) => ({ t: i * 100, gap: i === 123_456 ? 180 : 16.7 }));
    const mem = Array.from({ length: 144_000 }, (_, i) => ({ t: i * 250, v: 200 + (i % 7) }));
    const html: string = timelineHtml({ header: { build: { commit: "test" } }, frames, events: [], rec: dir },
      { t0: 0, durationS: 36_000, attention: [], series: { tab: [], heap: mem, vram: [], gpuUsed: [], resident: mem }, pacing: { spans: [] }, verdict: { status: "partial" } });
    writeFileSync(path.join(dir, "t.html"), html);
    const data = JSON.parse(html.slice(html.indexOf("const D=") + 8, html.indexOf(";\nconst V=")));
    assert.ok(data.fr.length <= 31_000, `frame points ${data.fr.length}`);
    assert.ok(data.mem.every((m: { pts: unknown[] }) => m.pts.length <= 3_100), "memory points bounded");
    assert.ok(data.fr.some((p: [number, number]) => p[1] === 180), "the one long frame survives the reduction");
    assert.doesNotMatch(html, /Math\.max\(\.\.\./, "no spread of a series into arguments");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("R2 (4070 run): a picture still encoding through a long stall is never expired, and is written when it lands, across an export", async () => {
  const { c, worker } = await capture();
  c.recorder.event("note", "note: before a 21 s stall", { t: 1 });
  c.afterRender(2);
  await settle();
  c.flush(30_000);
  assert.equal(worker.files.get("snapshots.ndjson") ?? "", "", "nothing written for it yet, and no missing entry");
  c.recorder.event("action", "after the stall", { t: 30_001, snapshot: false });
  const exporting = c.exportZip();
  await new Promise((r) => setTimeout(r, 50));
  encodings.shift()!.resolve(new Blob(["late picture"]));
  await exporting;
  c.flush(40_000);
  await settle();
  const { latestPictures } = await import(pathToFileURL(path.resolve("scripts/rec/analyse.mjs")).href);
  const index = latestPictures(lines(worker.files.get("snapshots.ndjson")));
  assert.equal(index.length, 1);
  assert.equal(index[0].missing, undefined, "the picture's own entry is its state");
  assert.equal(worker.files.get(index[0].file), "late picture");
});


// --- R3 ---------------------------------------------------------------------

/** Drives the video for `frames` frames of 1/12 s from page time `from`. */
async function play(c: { afterRender(now: number): void }, from: number, frames: number) {
  for (let i = 0; i < frames; i++) { c.afterRender(from + i * (1000 / 12) + 1); await new Promise((r) => setTimeout(r, 2)); }
  await settle();
}

test("R3-3: pictures the encoder refused are kept as a timestamped gap, survive Off, and completeness reports them", async () => {
  const { c, worker } = await capture("", true);
  FakeWorker.videoAnswer = (m) => (m.t! > 1000 && m.t! < 2000 ? "the encoder was behind" : "kept");
  await play(c, 0, 30);
  c.stop();
  await c.exportZip();
  const header = JSON.parse(worker.exports.at(-1)!.get("header.json")!);
  const gaps = header.retention.videoGaps.filter((g: { kind: string }) => g.kind === "lost");
  assert.equal(gaps.length, 1, JSON.stringify(header.retention.videoGaps));
  // The software path captures 6 fps: about six pictures in that second.
  assert.ok(gaps[0].from > 1000 && gaps[0].to < 2000 && gaps[0].pictures >= 5, JSON.stringify(gaps[0]));
  assert.ok(gaps[0].heldFrom < gaps[0].from, "it names the picture the video holds");
  assert.ok(header.retention.videoDrops.refused >= 5, "the count survives Off");
  const { integrityOf, videoCoverage } = await import(pathToFileURL(path.resolve("scripts/rec/analyse.mjs")).href);
  const integrity = integrityOf({ header, events: [], snapshots: [], rec: tmpdir() }, []);
  assert.ok(integrity.problems.some((p: string) => /video pictures not captured/.test(p)), integrity.problems.join("; "));
  const cover = videoCoverage([{ file: "video/000.webm", start: 0 }], { "video/000.webm": 2.5 }, 0, 2500, header.retention.videoGaps);
  assert.equal(cover.status, "partial", "a lost stretch is not coverage");
  const { heldNote } = await import(pathToFileURL(path.resolve("scripts/rec/pack.mjs")).href);
  assert.match(heldNote(header, 1500, 0), /NO PICTURE \(not captured\) · held from/);
  assert.equal(heldNote(header, 500, 0), null);
});

test("R3-1: an encoder failure ends the video with a loss fact; telemetry, the barrier and the export still work", async () => {
  const { c, worker } = await capture("", true);
  FakeWorker.videoAnswer = (m) => (m.t! > 500 ? "throw" : "kept");
  await play(c, 0, 12);
  c.recorder.event("action", "after the failure", { snapshot: false });
  c.flush(5000);
  await c.exportZip();
  const header = JSON.parse(worker.exports.at(-1)!.get("header.json")!);
  assert.ok(header.retention.lost.some((l: { why: string }) => /video encoder failed/.test(l.why)), JSON.stringify(header.retention.lost));
  assert.ok(lines(worker.exports.at(-1)!.get("events.ndjson")).some((e) => e.text === "after the failure"), "telemetry after the failure is in the export");
});

test("R3-2: a refused removal is not credited: the ledger says refused, the space is still counted, and the recording stops honestly", async () => {
  older = [{ name: "2026-01-01/video/000.webm", size: 3 * 1048576 }];
  try {
    browser("?recbudget=1");
    FakeWorker.refuse = null; FakeWorker.videoAnswer = null;
    FakeWorker.refuseRemove = (m) => m.dir === "flight/2026-01-01";
    const { FlightCapture } = await import("../src/runtime/flight/capture.js");
    const c = new FlightCapture(canvas, "playtest", false, build);
    await new Promise((r) => setTimeout(r, 60));
    const ledger = c.header.retention as { removedOlder: unknown[]; removalRefused: { session: string; why: string }[]; stopped: { why: string } | null };
    assert.equal(ledger.removedOlder.length, 0, "nothing credited as removed");
    assert.ok(ledger.removalRefused.some((r) => r.session === "2026-01-01" && /refused/.test(r.why)), JSON.stringify(ledger.removalRefused));
    assert.match(ledger.stopped?.why ?? "", /could not be removed/, "with the older recording's space still counted, the budget is full: an honest stop");
  } finally { older = []; }
});

test("R3-2: a recording this page still holds (the latest completed, exportable) is never removed by another's budget", async () => {
  browser();
  FakeWorker.refuse = null; FakeWorker.refuseRemove = null; FakeWorker.videoAnswer = null;
  const { FlightCapture } = await import("../src/runtime/flight/capture.js");
  const a = new FlightCapture(canvas, "playtest", false, build);
  await settle();
  a.stop();
  await new Promise((r) => setTimeout(r, 5));
  older = [{ name: `${a.session}/samples.ndjson`, size: 3 * 1048576 }];
  try {
    browser("?recbudget=1");
    const b = new FlightCapture(canvas, "playtest", false, build);
    await new Promise((r) => setTimeout(r, 60));
    const ledger = b.header.retention as { removedOlder: { session: string }[] };
    assert.ok(!ledger.removedOlder.some((r) => r.session === a.session), "A is pinned while it is exportable");
    const exported = await a.exportZip();
    assert.ok(exported.name.endsWith(".zip"), "and A still exports");
    await a.retire();
    await b.retire();
  } finally { older = []; }
});


// --- R3b ----------------------------------------------------------------------

const opens = (w: FakeWorker) => (w.posted.filter((m) => m.op === "video-open") as (Msg & { width: number; height: number; rungs: string[] })[])
  .map((m) => Object.assign(m, { hardware: m.rungs[0]!.endsWith("-hw") }));

test("R3b: a hardware encoder is preferred at 1280x720 (AV1, VP9, then H.264 in Matroska); without one, software at 960x540; the summary says which", async () => {
  hardwareEncoders = new Set(["av01", "vp09", "avc1"]);
  try {
    const { c, worker } = await capture("", true);
    await play(c, 0, 6);
    assert.deepEqual(opens(worker).map((m) => [m.width, m.hardware]), [[1280, true]]);
    const video = c.header.video as { hardware: boolean; codec: string };
    assert.equal(video.hardware, true);
    const { videoSource } = await import(pathToFileURL(path.resolve("scripts/rec/analyse.mjs")).href);
    assert.match(videoSource(c.header), /^in-game hardware AV1 1280x720 12 fps$/);
  } finally { hardwareEncoders = new Set(); }
  hardwareEncoders = new Set(["avc1"]);
  try {
    const { c, worker } = await capture("", true);
    await play(c, 0, 6);
    assert.deepEqual(opens(worker).map((m) => [m.file, m.width, m.hardware]), [["video/000.mkv", 1280, true]], "H.264 goes in Matroska");
    const { videoSource } = await import(pathToFileURL(path.resolve("scripts/rec/analyse.mjs")).href);
    assert.match(videoSource(c.header), /^in-game hardware H.264 1280x720 12 fps$/);
  } finally { hardwareEncoders = new Set(); }
  const { c, worker } = await capture("", true);
  await play(c, 0, 6);
  assert.deepEqual(opens(worker).map((m) => [m.width, m.height, m.hardware]), [[960, 540, false]]);
  const { videoSource } = await import(pathToFileURL(path.resolve("scripts/rec/analyse.mjs")).href);
  assert.match(videoSource(c.header), /^in-game software VP9 960x540 6 fps \(test-machine fallback; the owner's hardware path is 12 fps\)$/);
  assert.equal((c.header.video as { fps: number }).fps, 6, "the software rung records 6 fps (R3b decision)");
  assert.match((c.header.video as { fpsNote?: string }).fpsNote ?? "", /Linux test machines only.*12 fps/);
});

test("R3b: the measurement pause is off in place: the segment ends and its encoder closes, nothing is spooled; resuming starts a new segment", async () => {
  const { c, worker } = await capture("", true);
  await play(c, 0, 12);
  c.pauseForMeasurement(true);
  await settle();
  const closes = worker.posted.filter((m) => m.op === "video-close").length;
  assert.equal(closes, 1, "the segment ended (its encoder flushed and closed)");
  const before = worker.posted.length;
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(worker.posted.length, before, "nothing posted while paused (the app also skips the recorder's frame work)");
  c.pauseForMeasurement(false);
  await play(c, 2000, 6);
  assert.equal(opens(worker).length, 2, "a new segment after the pause");
});


test("R3b (owner policy): off Linux, no hardware encoder means no video, recorded in the ledger; never CPU encoding", async () => {
  fakePlatform = "Win32";
  try {
    const { c, worker } = await capture("", true);
    await play(c, 0, 6);
    assert.equal(opens(worker).length, 0, "no segment opened");
    const ledger = c.header.retention as { lost: { why: string }[] };
    assert.ok(ledger.lost.some((l) => /no video in this recording: no hardware video encoder.*owner policy/.test(l.why)), JSON.stringify(ledger.lost));
  } finally { fakePlatform = "Linux x86_64"; }
  hardwareEncoders = new Set(["avc1"]);
  fakePlatform = "Win32";
  try {
    const { c, worker } = await capture("", true);
    await play(c, 0, 6);
    assert.deepEqual(opens(worker).map((m) => [m.file, m.rungs[0]]), [["video/000.mkv", "h264-hw"]], "Windows with a hardware H.264 encoder records it");
  } finally { fakePlatform = "Linux x86_64"; hardwareEncoders = new Set(); }
});

test("R3b owner-PC check: the recorder paused on/off/off/on every 10 s, paired windows, one report at the end", async () => {
  const { OwnerCheck } = await import("../src/runtime/flight/ownercheck.js");
  const paused: boolean[] = [];
  type Report = { pairs: number; meanMs: number; ci95: [number, number]; windows: { on: boolean }[] };
  const got: { report?: Report } = {};
  const check = new OwnerCheck(80, (on) => paused.push(on), (r) => { got.report = r as Report; });
  // 80 s at 60 fps: frames cost 2.0 ms with the recorder on, 1.8 ms paused.
  let t = 0;
  for (let i = 0; i < 80 * 60 + 120 && !got.report; i++, t += 1000 / 60) check.frame(t, paused.at(-1) ? 1.8 : 2.0);
  const report = got.report;
  assert.ok(report, "the report came at the end");
  assert.deepEqual(report.windows.map((w) => w.on), [true, false, false, true, true, false, false, true]);
  assert.equal(report.pairs, 4);
  assert.ok(Math.abs(report.meanMs - 0.2) < 1e-6, String(report.meanMs));
  assert.equal(paused.at(-1), false, "the recorder is left running");
});
