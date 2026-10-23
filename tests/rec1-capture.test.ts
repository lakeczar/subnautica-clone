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
  readonly posted: Msg[] = [];
  readonly files = new Map<string, string>();
  readonly exports: Map<string, string>[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  private chain = Promise.resolve();
  constructor() { FakeWorker.alive.add(this); }
  terminate(): void { FakeWorker.alive.delete(this); }
  postMessage(m: Msg): void {
    this.posted.push(m);
    this.chain = this.chain.then(() => new Promise<void>((done) => setTimeout(() => { this.handle(m); done(); }, 0)));
  }
  private reply(data: unknown): void { this.onmessage?.({ data }); }
  private handle(m: Msg): void {
    if (m.op === "append" || m.op === "put") {
      const text = new TextDecoder().decode(m.data!), bytes = m.data!.byteLength;
      const refused = FakeWorker.refuse?.(m);
      if (refused) { this.reply({ failed: m.file, bytes, quota: refused.quota, error: "refused by the test" }); return; }
      this.files.set(m.file!, (m.op === "put" ? "" : this.files.get(m.file!) ?? "") + text);
      this.reply({ ack: bytes, file: m.file });
    } else if (m.op === "remove") this.reply({ removed: m.id });
    else if (m.op === "barrier") this.reply({ barrier: m.id });
    else if (m.op === "export") { this.exports.push(new Map(this.files)); this.reply({ exported: m.id, bytes: [...this.files.values()].reduce((a, x) => a + x.length, 0) }); }
    else if (m.op === "video-flush") this.reply({ videoFlushed: m.id });
    else if (m.op === "video-close") this.reply({ videoClosed: m.id });
  }
}

/** Pictures whose encoding the test finishes (or fails) when it chooses. */
const encodings: { resolve: (b: Blob) => void; reject: (e: Error) => void }[] = [];
let older: { name: string; size: number }[] = [];

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
    navigator: { userAgent: "test", platform: "test", webdriver: false, storage: { estimate: async () => ({ quota: 100 * 1024 ** 3 }), getDirectory: async () => ({ getDirectoryHandle: async (n: string) => nested(n) }) } },
    screen: { width: 1280, height: 720 }, devicePixelRatio: 1, crossOriginIsolated: false,
    addEventListener: () => {}, Worker: FakeWorker,
    createImageBitmap: async () => ({ width: 480, height: 270, close() {} }),
    OffscreenCanvas: class { getContext() { return { transferFromImageBitmap() {} }; } convertToBlob() { return new Promise<Blob>((resolve, reject) => encodings.push({ resolve, reject })); } },
  });
}
const canvas = { width: 1280, height: 720, getContext: () => null } as unknown as HTMLCanvasElement;
const build = { content: "test", bake: "", commit: "test" };
const settle = () => new Promise((r) => setTimeout(r, 20));
async function capture(search = "") {
  browser(search);
  FakeWorker.refuse = null;
  const { FlightCapture } = await import("../src/runtime/flight/capture.js");
  const c = new FlightCapture(canvas, "playtest", false, build);
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
  await settle();
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
