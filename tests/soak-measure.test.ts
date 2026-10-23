import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// The soak's measurement contract (scripts/soak/measure.mjs, SCHED-2a R3):
// every measurement type against every kind of bad value, then the same
// through normalize(), which every provider's output passes before the soak
// logic sees it.
const M = await import(pathToFileURL(resolve("scripts/soak/measure.mjs")).href);

const VALUES: [string, unknown][] = [
  ["valid", 12], ["valid fraction", 12.5], ["zero", 0], ["negative", -1], ["NaN", NaN], ["+Infinity", Infinity], ["-Infinity", -Infinity],
  ["absent", undefined], ["null", null], ["wrong type: string", "12"], ["wrong type: boolean", true], ["wrong type: object", { v: 12 }],
];
// What each domain accepts, by the names above.
const ACCEPTS: Record<string, string[]> = {
  memoryMiB: ["valid", "valid fraction"],
  sizeMiB: ["valid", "valid fraction", "zero"],
  count: ["valid", "zero"],
  frameMs: ["valid", "valid fraction"],
  splitMs: ["valid", "valid fraction", "zero"],
  gapMs: ["valid", "valid fraction", "zero"],
  seconds: ["valid", "valid fraction", "zero"],
};

test("the contract: every measurement type × {valid, 0, negative, NaN, ±Infinity, absent, null, wrong type}", () => {
  assert.deepEqual(Object.keys(M.DOMAINS).sort(), Object.keys(ACCEPTS).sort());
  for (const [type, accepts] of Object.entries(ACCEPTS)) {
    for (const [name, v] of VALUES) assert.equal(M.valid(type, v), accepts.includes(name), `${type} × ${name}`);
  }
});

test("normalize: an out-of-domain memory or count is dropped with a diagnostic; an absent one is just not measured", () => {
  for (const [name, v] of VALUES) {
    const n = M.normalize("p", { memory: { rendererRssMiB: v, residentCpuMiB: v }, graphics: { meshes: v } });
    const ok = (type: string) => ACCEPTS[type]!.includes(name);
    assert.equal("rendererRssMiB" in n.memory, ok("memoryMiB"), `memory × ${name}`);
    assert.equal("residentCpuMiB" in n.memory, ok("sizeMiB"), `resident × ${name}`);
    assert.equal("meshes" in n.graphics, ok("count"), `count × ${name}`);
    const silent = v === undefined || v === null;
    if (!ok("memoryMiB") && !silent) assert.match(n.unavailable.join("\n"), /p: memory\.rendererRssMiB .* is outside memoryMiB/, name);
    if (silent) assert.deepEqual(n.unavailable, [], `${name} is not a diagnostic`);
  }
  assert.equal("meshes" in M.normalize("p", { graphics: { meshes: 1.5 } }).graphics, false, "counts are integers");
});

const rec = (total: unknown, parts: Record<string, unknown> | undefined = { chunks: 0, caves: 0, regions: 0, lights: 0 }, hold: unknown = false) => ({ total, parts, hold });

test("normalize frames: maxima over valid gaps only; a known violation survives invalid companions", () => {
  const f = M.normalize("frames", { frames: { overMs: 33, gaps: [16, 70, NaN, -3, "9"], records: [rec(16), rec(70)] } }).frames;
  assert.deepEqual([f.count, f.invalidGaps, f.worstMs, f.over], [2, 3, 70, [70]]);
  assert.equal(f.complete, false);
  assert.equal(f.attributed, true);
});

test("normalize frames: attribution needs a valid total and a valid split for every streaming part", () => {
  for (const [name, total] of VALUES) {
    const f = M.normalize("frames", { frames: { overMs: 33, gaps: [16], records: [rec(total)] } }).frames;
    assert.equal(f.attributed, ACCEPTS.frameMs!.includes(name), `total × ${name}`);
  }
  for (const part of M.STREAMING_PARTS) for (const [name, v] of VALUES) {
    const parts: Record<string, unknown> = { chunks: 0, caves: 0, regions: 0, lights: 0, [part]: v };
    const f = M.normalize("frames", { frames: { overMs: 33, gaps: [16], records: [rec(16, parts)] } }).frames;
    assert.equal(f.attributed, ACCEPTS.splitMs!.includes(name), `${part} × ${name}`);
  }
  const missing = M.normalize("frames", { frames: { overMs: 33, gaps: [70], records: [{ total: 70, hold: false }] } });
  assert.equal(missing.frames.attributed, false, "a missing split is unavailable, never zero streaming work");
  assert.deepEqual(missing.frames.streaming, []);
  assert.match(missing.unavailable.join("\n"), /splitMs for each of chunks, caves, regions, lights/);
  const empty = M.normalize("frames", { frames: { overMs: 33, gaps: [16], records: [] } }).frames;
  assert.equal(empty.attributed, false);
  const none = M.normalize("frames", { frames: { overMs: 33, gaps: [16], records: null } }).frames;
  assert.deepEqual([none.attributed, none.attributionIssue], [false, "this build keeps no per-frame record"]);
  const streaming = M.normalize("frames", { frames: { overMs: 33, gaps: [60], records: [rec(60, { chunks: 20, caves: 15, regions: 0, lights: 0 }), rec(NaN)] } }).frames;
  assert.deepEqual(streaming.streaming, [60], "a valid streaming violation is kept beside a broken record");
});

test("normalize frames: holds are booleans per record; anything else leaves the interval uncovered", () => {
  const seen = M.normalize("frames", { frames: { overMs: 33, gaps: [16], records: [rec(16, undefined, true), rec(16)] } }).frames;
  assert.equal(seen.holdFrames, 1);
  for (const v of ["yes", 1, NaN]) assert.equal(M.normalize("frames", { frames: { overMs: 33, gaps: [16], records: [rec(16, undefined, v)] } }).frames.holdsCovered, false, String(v));
  assert.equal(M.normalize("frames", { frames: { overMs: 33, gaps: [16], records: [rec(16)] } }).frames.holdsCovered, true);
});

test("times: monotonic, finite, nonnegative and in order", () => {
  assert.equal(M.validTimes([{ at: 0 }, { at: 60 }, { at: 60 }, { at: 120 }]), true);
  for (const bad of [[{ at: 60 }, { at: 30 }], [{ at: Infinity }], [{ at: -1 }], [{ at: NaN }], [{ at: "60" }]]) assert.equal(M.validTimes(bad), false, JSON.stringify(bad));
});

test("R4-F1: the canonical hold observation over CW-1's real states, booleans, absent, null and wrong types", () => {
  const cases: [unknown, string][] = [
    [true, "holding"], [false, "clear"], ["clear", "clear"], ["admitted", "clear"], ["away", "clear"],
    ["loading", "holding"], ["rescue", "holding"], ["refuge", "holding"], ["waiting", "holding"],
    [null, "unknown"], [undefined, "unknown"], ["bogus", "unknown"], [1, "unknown"], [{}, "unknown"], [NaN, "unknown"],
  ];
  for (const [v, obs] of cases) assert.equal(M.holdObservation(v).obs, obs, String(v));
  // CW-1's per-frame record as app.ts pushes it.
  const cw1 = (hold: unknown) => ({ at: 1, total: 16, sim: 2, steps: 1, save: 0, present: 10, hud: 1, parts: { chunks: 0, caves: 0, regions: 0, lights: 0, render: 9 }, hold });
  const f = (holds: unknown[]) => M.normalize("frames", { frames: { overMs: 33, gaps: holds.map(() => 16), records: holds.map(cw1) } });
  assert.deepEqual([f(["clear", "clear"]).frames.holdFrames, f(["clear", "clear"]).frames.holdsCovered], [0, true]);
  assert.deepEqual([f(["clear", "loading"]).frames.holdFrames, f(["clear", "loading"]).frames.holdsCovered], [1, true]);
  for (const bad of [null, undefined, "bogus", 3]) {
    const n = f(["clear", bad]);
    assert.equal(n.frames.holdsCovered, false, String(bad));
    assert.match(n.frames.holdIssue, /1 of 2 per-frame records have no known hold state/);
  }
  assert.match(f(["bogus"]).unavailable.join("\n"), /frames\.records\[\]\.hold/, "a wrong state is a diagnostic");
  assert.deepEqual(f([null]).unavailable, [], "null is CW-1's 'admission not evaluated': unknown, not malformed");
  // The polled #ocean state, the same way.
  const poll = (state: unknown) => M.normalize("ocean", { holds: { state } }).holds;
  assert.deepEqual(poll("loading"), { available: true, held: true, state: "loading" });
  assert.deepEqual(poll("clear"), { available: true, held: false, state: "clear" });
  for (const v of [undefined, null, "bogus", 7]) assert.deepEqual(poll(v), { available: false }, String(v));
});

test("R4-F3: gaps are excluded by interval: tagged gaps never count as timing, untagged ones do", () => {
  const n = M.normalize("frames", { frames: { overMs: 33, gaps: [{ ms: 16, excluded: false }, { ms: 90, excluded: true }, { ms: 16, excluded: true }, 70], records: null } }).frames;
  assert.deepEqual([n.count, n.excluded, n.worstMs, n.over], [2, 2, 70, [70]]);
  assert.equal(M.normalize("frames", { frames: { overMs: 33, gaps: [{ ms: 16, excluded: "yes" }], records: null } }).frames.invalidGaps, 1);
});
