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
function synthetic(dir: string, opts: { hold?: boolean; error?: boolean } = {}): void {
  const r = new FlightRecorder({ snapshots: false });
  const start = 10_000;
  r.event("load", "expedition entered", { t: start - 5000 });
  for (let i = 0; i < 3600; i++) {
    const t = start + i * 16.67;
    const hitch = i === 1200, held = opts.hold && i >= 2000 && i < 2060;
    r.frame({ t, gap: hitch ? 48 : 16.67, work: hitch ? 44 : 4, sim: 1, steps: 1, chunks: hitch ? 36 : 0.3, caves: 0.1, regions: 0.1, lights: 0.2, render: 2, hold: held ? "loading" : "clear" }, 0.02);
    if (i % 15 === 0) r.sample({ t, tick: 100 + i, pos: [i * 0.2, -20, 0], depth: 20, region: i < 1800 ? "refuge_reef" : "island_chain", cave: null, hold: held ? "loading" : "clear",
      oxygen: 90, health: 100, food: 90, speed: i > 2400 && i < 3000 ? 0 : 6, mode: "piloting", craft: null, active: true, draws: i > 3000 ? 600 : 100, unsliced: 0 });
  }
  r.event("milestone", "new blueprint dart", { t: start + 30_000 });
  for (let k = 0; k < 5; k++) r.event("action", "gather", { t: start + 41_000 + k * 1000 });
  if (opts.error) r.event("error", "error: boom", { t: start + 45_000 });
  const rec = join(dir, "recording");
  mkdirSync(rec, { recursive: true });
  const lines = (xs: unknown[]) => xs.map((x) => JSON.stringify(x)).join("\n") + "\n";
  writeFileSync(join(rec, "header.json"), JSON.stringify({ frameColumns: FRAME_COLUMNS, run: { pageStart: start }, machine: { label: "test" }, video: null, drained: { lost: { frames: 0 } } }));
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
    assert.ok(a.verdict.unproven.includes("frame times judged"), "a shared run never judges frame times");
    assert.ok(a.verdict.unproven.includes("video"), "no video is listed, not passed");
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
    assert.ok(p.share.travelling.pct > 60, JSON.stringify(p.share));
    assert.ok(p.share.doing.s >= 5 && p.share.waiting.s >= 5, JSON.stringify(p.share));
    assert.equal(p.milestones.length, 1);
    assert.ok(p.regions.refuge_reef.s >= 29 && p.regions.island_chain.s >= 29, JSON.stringify(p.regions));
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
