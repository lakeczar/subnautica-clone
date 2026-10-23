import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { FlightRecorder, FRAME_COLUMNS } from "../src/runtime/flight/recorder.js";

// REC-1's pack analysis (scripts/rec/analyse.mjs) on a synthetic recording:
// the verdict, the attention list and pacing are what an agent reads first.
const A = await import(pathToFileURL(resolve("scripts/rec/analyse.mjs")).href);
const P = await import(pathToFileURL(resolve("scripts/soak/measure.mjs")).href);

/** A 60 s run: travel, a hold, a streaming hitch, an error, a milestone, gathering. */
function synthetic(dir: string, opts: { hold?: boolean; error?: boolean; judged?: boolean } = {}): void {
  const r = new FlightRecorder({ snapshots: false });
  const start = 10_000;
  r.event("load", "expedition entered", { t: start - 5000 });
  for (let i = 0; i < 3600; i++) {
    const t = start + i * 16.67;
    const hitch = i === 1200, held = opts.hold && i >= 2000 && i < 2060;
    r.frame({ t, gap: hitch ? 48 : 16.67, work: hitch ? 44 : 4, sim: 1, steps: 1, chunks: hitch ? 36 : 0.3, caves: 0.1, regions: 0.1, lights: 0.2, render: 2, hold: held ? "loading" : "clear" }, 0.02);
    if (i % 15 === 0) r.sample({ t, tick: 100 + i, pos: [i * 0.2, -20, 0], depth: 20, region: i < 1800 ? "refuge_reef" : "island_chain", cave: null, hold: held ? "loading" : "clear",
      oxygen: 90, health: 100, food: 90, speed: i > 3000 && i < 3480 ? 0 : 6, mode: "piloting", craft: null, active: true, draws: i > 3000 ? 600 : 100, unsliced: 0 });
  }
  r.event("milestone", "new blueprint dart", { t: start + 30_000 });
  for (let k = 0; k < 5; k++) r.event("action", "gather", { t: start + 41_000 + k * 1000 });
  if (opts.error) r.event("error", "error: boom", { t: start + 45_000 });
  const rec = join(dir, "recording");
  mkdirSync(rec, { recursive: true });
  const lines = (xs: unknown[]) => xs.map((x) => JSON.stringify(x)).join("\n") + "\n";
  writeFileSync(join(rec, "header.json"), JSON.stringify({ frameColumns: FRAME_COLUMNS, run: { pageStart: start, judged: opts.judged ?? true }, machine: { label: "test" }, video: null, drained: { lost: { frames: 0 } } }));
  writeFileSync(join(rec, "frames.ndjson"), lines(r.frames.since(0).rows));
  writeFileSync(join(rec, "samples.ndjson"), lines(r.samples.since(0).items));
  writeFileSync(join(rec, "events.ndjson"), lines(r.events.since(0).items));
  writeFileSync(join(rec, "system.ndjson"), lines(Array.from({ length: 60 }, (_, s) => ({ t: start + s * 1000, tabMiB: s === 50 ? 900 : 500 + s, jsHeapMiB: 100 }))));
}

test("a clean run passes what it can measure and names what it cannot", () => {
  const dir = mkdtempSync(join(tmpdir(), "rec1-"));
  try {
    synthetic(dir);
    const a = A.analyse(A.loadRecording(dir));
    // The streaming hitch is the one frame over 33 ms, and a failure (CW-1's rule).
    assert.equal(a.numbers.over33, 1);
    assert.equal(a.verdict.status, "fail");
    assert.deepEqual(a.verdict.failed, ["no streaming frame over 33 ms"]);
    assert.ok(!a.verdict.unproven.includes("frame times judged"), "an exclusive run judges frame times");
    assert.equal(a.checks.find((c: { name: string }) => c.name === "video").status, "absent", "no video (an exclusive run) is named, never passed");
    const s = A.summaryJson(a, A.loadRecording(dir).header);
    assert.ok(JSON.stringify(s).length < 1024, "Tier 0 stays under 1 KB");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the attention list flags holds, errors, milestones, long frames and memory and draw-call jumps, in time order", () => {
  const dir = mkdtempSync(join(tmpdir(), "rec1-"));
  try {
    synthetic(dir, { hold: true, error: true });
    const a = A.analyse(A.loadRecording(dir));
    const kinds = a.attention.map((e: { kind: string }) => e.kind);
    for (const k of ["long-frame", "hold", "error", "milestone", "memory", "draws"]) assert.ok(kinds.includes(k), `flags ${k}: ${kinds}`);
    assert.deepEqual(a.attention.map((e: { id: string }) => e.id).slice(0, 3), ["A01", "A02", "A03"]);
    assert.ok(a.attention.every((e: { s: number }, i: number, xs: { s: number }[]) => i === 0 || xs[i - 1]!.s <= e.s));
    const lf = a.attention.find((e: { kind: string }) => e.kind === "long-frame");
    assert.match(lf.reason, /streaming/);
    assert.equal(lf.s, 20);
    assert.equal(a.numbers.holds.frames, 60);
    assert.ok(a.verdict.failed.includes("no cave hold") && a.verdict.failed.includes("no errors"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("pacing splits the time into travelling, doing and waiting, and finds the longest stretch with nothing new per region", () => {
  const dir = mkdtempSync(join(tmpdir(), "rec1-"));
  try {
    synthetic(dir);
    const p = A.analyse(A.loadRecording(dir)).pacing;
    assert.ok(p.share.travelling.pct >= 55, JSON.stringify(p.share));
    assert.ok(p.share.doing.s >= 5 && p.share.waiting.s >= 5, JSON.stringify(p.share));
    assert.equal(p.milestones.length, 1);
    // On the play clock: the island stretch excludes its 8 s of waiting.
    assert.ok(p.regions.refuge_reef.s >= 29 && p.regions.island_chain.s >= 20 && p.regions.island_chain.s <= 24, JSON.stringify(p.regions));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the soak provider's records pass the soak's measurement contract", async () => {
  const { flightFrames } = await import(pathToFileURL(resolve("scripts/rec/soak-provider.mjs")).href);
  const r = new FlightRecorder({ snapshots: false });
  r.frame({ t: 0, gap: 16.7, work: 4, chunks: 0.5, caves: 0.1, regions: 0.1, lights: 0.2, hold: "clear" });
  r.frame({ t: 16, gap: 40, work: 36, chunks: 30, caves: 0.1, regions: 0.1, lights: 0.2, hold: "loading" });
  const g = globalThis as { window?: unknown };
  const page = { evaluate: async (fn: (c: unknown) => unknown, arg: unknown) => {
    g.window = { __siltwake: { recorder: { frames: (c: number) => ({ columns: FRAME_COLUMNS, ...r.frames.since(c) }) } } };
    try { return fn(arg); } finally { delete g.window; }
  } };
  const out = P.normalize("flight-frames", await flightFrames(page).sample());
  assert.deepEqual(out.unavailable, []);
  assert.equal(out.frames.attributed, true);
  assert.deepEqual(out.frames.streaming, [36]);
  assert.equal(out.frames.holdFrames, 1);
  assert.equal(out.frames.holdsCovered, true);
});

test("a shared run records a streaming hitch for attention but neither passes nor fails frame times", () => {
  const dir = mkdtempSync(join(tmpdir(), "rec1-"));
  try {
    synthetic(dir, { judged: false });
    const a = A.analyse(A.loadRecording(dir));
    assert.equal(a.checks.find((c: { name: string }) => c.name === "no streaming frame over 33 ms").status, "unproven");
    assert.ok(a.attention.some((e: { kind: string }) => e.kind === "long-frame"));
    assert.equal(a.verdict.status, "partial");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/** A recording written directly: rows (by column name), samples, events, system readings, snapshots and files. */
function recording(dir: string, o: { rows?: Record<string, number | string | null>[]; samples?: object[]; events?: object[]; system?: object[]; snapshots?: object[]; files?: string[]; header?: object }): void {
  const rec = join(dir, "recording");
  mkdirSync(join(rec, "snapshots"), { recursive: true });
  const codes = [null, "clear", "loading", "rescue", "refuge", "waiting", "away", "admitted", "inactive", "opening", "interior"];
  const row = (r: Record<string, number | string | null>) => FRAME_COLUMNS.map((c) => (c === "hold" ? codes.indexOf((r.hold ?? null) as string | null) : c === "gpu" || c === "heapDrop" ? (r[c] ?? -1) : (r[c] ?? 0)));
  const lines = (xs: unknown[] = []) => xs.map((x) => JSON.stringify(x)).join("\n") + (xs.length ? "\n" : "");
  writeFileSync(join(rec, "header.json"), JSON.stringify({ frameColumns: FRAME_COLUMNS, holdCodes: codes, run: { pageStart: 0, judged: true }, video: null, drained: { lost: {} }, ...o.header }));
  writeFileSync(join(rec, "frames.ndjson"), lines((o.rows ?? []).map(row)));
  writeFileSync(join(rec, "samples.ndjson"), lines(o.samples));
  writeFileSync(join(rec, "events.ndjson"), lines(o.events));
  writeFileSync(join(rec, "system.ndjson"), lines(o.system));
  writeFileSync(join(rec, "snapshots.ndjson"), lines(o.snapshots));
  for (const f of o.files ?? []) writeFileSync(join(rec, f), "x");
}
const withDir = (fn: (dir: string) => void) => { const dir = mkdtempSync(join(tmpdir(), "rec1-")); try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); } };

test("R1-F1: the review's two rows fail the streaming check, through the recorder's own events", () => {
  withDir((dir) => {
    const r = new FlightRecorder({ snapshots: false });
    r.frame({ t: 950, gap: 16.7, work: 4 });
    r.frame({ t: 1000, gap: 16.7, work: 44, chunks: 36, caves: 0.2 });
    r.frame({ t: 1050, gap: 50, work: 4, chunks: 0.2 });
    const cols = FRAME_COLUMNS as readonly string[];
    const rows = r.frames.since(0).rows.map((x) => Object.fromEntries(cols.map((c, i) => [c, x[i]!])) as Record<string, number>);
    recording(dir, { rows: rows.map((x) => ({ ...x, hold: "clear" })), events: r.events.since(0).items });
    const a = A.analyse(A.loadRecording(dir));
    const c = a.checks.find((x: { name: string }) => x.name === "no streaming frame over 33 ms");
    assert.equal(c.status, "fail", c.note);
    assert.match(c.note, /2 of 2/);
  });
});

test("R1-F4: hold coverage comes from the rows: a known hold fails amid unknowns; unknowns never pass; not-applicable frames do not count against it", () => {
  withDir((dir) => {
    recording(dir, { rows: [{ t: 0, gap: 16, work: 3, hold: "clear" }, { t: 16, gap: 16, work: 3, hold: null }, { t: 32, gap: 16, work: 3, hold: null }] });
    assert.equal(A.analyse(A.loadRecording(dir)).checks.find((x: { name: string }) => x.name === "no cave hold").status, "missing");
  });
  withDir((dir) => {
    recording(dir, { rows: [{ t: 0, gap: 16, work: 3, hold: "loading" }, { t: 16, gap: 16, work: 3, hold: null }] });
    assert.equal(A.analyse(A.loadRecording(dir)).checks.find((x: { name: string }) => x.name === "no cave hold").status, "fail");
  });
  withDir((dir) => {
    recording(dir, { rows: [{ t: 0, gap: 16, work: 3, hold: "clear" }, { t: 16, gap: 16, work: 3, hold: "inactive" }, { t: 32, gap: 16, work: 3, hold: "opening" }] });
    const c = A.analyse(A.loadRecording(dir)).checks.find((x: { name: string }) => x.name === "no cave hold");
    assert.equal(c.status, "pass");
    assert.match(c.note, /2 not applicable/);
  });
});

test("R1-F4: completeness is checked against the files: a picture the index names but the recording lacks, and a driver-only page error", () => {
  withDir((dir) => {
    recording(dir, { rows: [{ t: 0, gap: 16, work: 3, hold: "clear" }], snapshots: [{ seq: 1, t: 0, reasons: [1], file: "snapshots/00001.jpg" }, { seq: 2, t: 5, reasons: [2], file: "snapshots/00002.jpg" }],
      files: ["snapshots/00001.jpg"], header: { run: { pageStart: 0, judged: true, pageErrors: 2 } } });
    const a = A.analyse(A.loadRecording(dir));
    const complete = a.checks.find((x: { name: string }) => x.name === "recording complete");
    assert.equal(complete.status, "partial");
    assert.match(complete.note, /00002\.jpg/);
    assert.equal(a.checks.find((x: { name: string }) => x.name === "no errors").status, "fail", "errors the driver saw are errors");
  });
});

test("R1-F4: a named video passes only on its real duration over the window", () => {
  const segs = [{ file: "video/000.webm", start: 0 }];
  assert.equal(A.videoCoverage(segs, null, 0, 60000).status, "unproven");
  assert.equal(A.videoCoverage(segs, { "video/000.webm": null }, 0, 60000).status, "missing");
  assert.equal(A.videoCoverage(segs, { "video/000.webm": 30 }, 0, 60000).status, "partial");
  assert.equal(A.videoCoverage(segs, { "video/000.webm": 59 }, 0, 60000).status, "pass");
});

test("R1-F5: memory flatness needs enough readings across the window", () => {
  const rows = Array.from({ length: 700 }, (_, i) => ({ t: i * 1000, gap: 16, work: 3, hold: "clear" }));
  const reading = (n: number, slope: number) => Array.from({ length: n }, (_, i) => ({ t: (i * 699000) / Math.max(1, n - 1), rendererRssMiB: 500 + (slope * i * 699) / Math.max(1, n - 1) / 60 }));
  for (const [n, slope, status] of [[0, 0, "unproven"], [1, 0, "unproven"], [60, 0, "pass"], [60, 30, "fail"]] as const) withDir((dir) => {
    recording(dir, { rows, system: reading(n, slope) });
    assert.equal(A.analyse(A.loadRecording(dir)).checks.find((x: { name: string }) => x.name === "memory flat").status, status, `${n} readings, ${slope} MiB/min`);
  });
});

test("R1-F6: pacing is causal and on a play clock: one action is three seconds of doing; a long menu adds nothing to progression", () => {
  const samples = (from: number, to: number, o: object) => Array.from({ length: (to - from) / 250 }, (_, i) => ({ t: from + i * 250, tick: 0, active: true, speed: 0, region: "refuge_reef", hold: "clear", ...o }));
  const p = A.pacing({
    samples: [...samples(0, 20000, { speed: 6 }), ...samples(20000, 620000, { active: false }), ...samples(620000, 640000, { speed: 6 })],
    events: [{ kind: "action", t: 10000, text: "scan" }, { kind: "milestone", t: 5000, text: "new blueprint a" }, { kind: "milestone", t: 630000, text: "new blueprint b" }],
  }, (t: number) => t / 1000);
  assert.ok(p.share.doing.s >= 8 && p.share.doing.s <= 10, `three causal 3 s windows (milestones at 5 s and 630 s, an action at 10 s), not twice that: ${p.share.doing.s}`);
  assert.equal(p.share.menus.s, 600);
  assert.equal(p.between[0].wall, 625);
  assert.ok(p.between[0].s <= 30, `play seconds between the milestones, the menu excluded: ${p.between[0].s}`);
  assert.ok(p.regions.refuge_reef.s <= 30, `nothing-new stretch on play time: ${p.regions.refuge_reef.s}`);
});

test("R1-F2: running out of tries is unstable, with the last two pictures; a converging view is stable", async () => {
  const { untilStable } = await import(pathToFileURL(resolve("scripts/rec/views/stable.mjs")).href);
  let n = 0;
  const changing = await untilStable(async () => `p${n++}`, async () => {}, 12);
  assert.equal(changing.stable, false);
  assert.equal(changing.image, "p12");
  assert.equal(changing.previous, "p11");
  const seq = ["a", "b", "c", "c"];
  let k = 0;
  const converging = await untilStable(async () => seq[Math.min(k++, 3)]!, async () => {}, 12);
  assert.deepEqual([converging.stable, converging.image, converging.tries], [true, "c", 2]);
});

test("audit F22: re-accepting a different picture for the same view and commit keeps the index and the stored bytes in step", async () => {
  const { spawnSync } = await import("node:child_process");
  const { createHash } = await import("node:crypto");
  const { readFileSync } = await import("node:fs");
  withDir((dir) => {
    const store = join(dir, "store"), index = join(dir, "index.json");
    const capture = (name: string, bytes: string) => {
      const d = join(dir, name);
      mkdirSync(join(d, "views"), { recursive: true });
      writeFileSync(join(d, "views", "v.png"), bytes);
      writeFileSync(join(d, "capture.json"), JSON.stringify({ class: "3090", commit: "c0ffee", viewsVersion: 1, gpu: "test",
        views: [{ id: "place.home_pod", file: "views/v.png", settled: true, stable: true, sha256: createHash("sha256").update(bytes).digest("hex") }] }));
      return d;
    };
    const accept = (d: string) => spawnSync(process.execPath, [resolve("scripts/rec/views/accept.mjs"), d, "--views", "place.home_pod", "--by", "test", "--why", "test", "--store", store, "--index", index], { encoding: "utf8" });
    assert.equal(accept(capture("a", "first picture")).status, 0);
    assert.equal(accept(capture("b", "second, different picture")).status, 0);
    const entry = JSON.parse(readFileSync(index, "utf8")).classes["3090"]["place.home_pod"];
    assert.equal(createHash("sha256").update(readFileSync(join(store, entry.file))).digest("hex"), entry.sha256, "the stored file holds the bytes the index names");
    assert.equal(readFileSync(join(store, entry.file), "utf8"), "second, different picture");
    // A capture whose file was altered after its hash was recorded is refused.
    const c = capture("c", "third"); writeFileSync(join(c, "views", "v.png"), "tampered");
    assert.equal(accept(c).status, 3);
  });
});
