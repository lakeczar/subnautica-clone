// CW-1 R3-1 and R4-1: the frame gate never excuses a frame without proof.
//   node --test docs/build/streams/cw1/frame-class.test.mjs
// Negative controls are the reviews' (Sol R3-1's three counterexamples and its
// uncertainty cases; Sol R4-1's three: VM-wide clearance, stale state across an
// observer outage, a futex taken for a GPU dependency) and SIM-PERF-1's two R1
// cases, restated for frames; the r12 boundary arithmetic shows why tours 3 and 7
// were unresolved. Positive cases show what the proof does excuse.
import test from "node:test";
import assert from "node:assert/strict";
import { classifyFrame, classify, observedThroughout, OURS } from "./frame-class.mjs";

/** Rows every `step` ms over [t0, t1] on `ncpu` vCPUs, each read in `acquire` ms. `cpu(t)` /
 * `gpu(t)`: the renderer's and GPU main thread's vCPU at the sample; `tick(t)`: vCPUs whose
 * steal counter gains a jiffy at the sample at t; `run(t)`: renderer CPU ms so far. */
function rows({ t0 = -20, t1, step = 5, acquire = 0, ncpu = 8, cpu = () => 0, gpu = () => 1, tick = () => [], run = () => 0, grun = () => 0 }) {
  const out = [], steal = new Array(ncpu).fill(0);
  for (let t = t0; t <= t1; t += step) {
    for (const c of tick(t)) steal[c]++;
    out.push({ t0: t, t1: t + acquire, run: run(t), grun: grun(t), cpu: cpu(t), gpuCpu: gpu(t), steal: [...steal] });
  }
  return out;
}
/** One thread observed in one state on one vCPU, polled successfully over `cover`. */
const thread = (st, w, cpu, cover = [[-1000, 1000]]) => ({ states: [[-1000, -1000, st, w, cpu]], cover });
const R = (cpu = 0) => ({ renderer: thread("R", "", cpu) });
const IDLE = { renderer: thread("S", "epoll_wait", 0) };
const excused = (v) => v.cause === "host";
const pause = (cpu) => (t) => (t > 0 && t <= 80 && t % 10 === 0 ? [cpu] : []);

test("Sol R3-1 #1: steal on the sleeping GPU thread's vCPU never excuses 60 ms of renderer work", () => {
  // Renderer runnable on vCPU 1 throughout; vCPU 0 (the GPU main thread's) loses 30 ms.
  const v = classifyFrame({ e0: 0, e1: 60 }, rows({ t1: 80, cpu: () => 1, gpu: () => 0, tick: (t) => (t > 0 && t <= 30 && t % 10 === 0 ? [0] : []), run: (t) => t }), [], R(1));
  assert.ok(!excused(v), JSON.stringify(v));
  assert.ok(OURS.has(v.cause));
  assert.equal(v.excusedMs, 0);
});

test("Sol R3-1 #2: a migration inside a delayed sample interval credits nothing to the old vCPU", () => {
  // Samples at 0 and 60 only: the thread moved 0 → 1 just after 0; vCPU 0 lost 40 ms while 1 ran the game.
  const rs = [{ t: -5, run: 0, grun: 0, cpu: 0, gpuCpu: 2, steal: [0, 0, 0] }, { t: 0, run: 0, grun: 0, cpu: 0, gpuCpu: 2, steal: [0, 0, 0] },
    { t: 60, run: 60, grun: 0, cpu: 1, gpuCpu: 2, steal: [4, 0, 0] }, { t: 65, run: 65, grun: 0, cpu: 1, gpuCpu: 2, steal: [4, 0, 0] }];
  const v = classifyFrame({ e0: 2, e1: 62 }, rs, [[2, 60]], R(0));
  assert.ok(!excused(v), JSON.stringify(v));
  assert.equal(v.cause, "mixed");
  assert.equal(v.excusedMs, 0);
});

test("Sol R3-1 #3: a frame inside one long sample bracket, its steal all before it, is never cleared", () => {
  // Samples at 0 and 100 only; frame [30, 80]; 30 ms stolen before 30.
  const rs = [{ t: 0, run: 0, grun: 0, cpu: 0, gpuCpu: 1, steal: [0, 0] }, { t: 100, run: 70, grun: 0, cpu: 0, gpuCpu: 1, steal: [3, 0] }];
  const v = classifyFrame({ e0: 30, e1: 80 }, rs, [[0, 30]], R(0));
  assert.ok(!excused(v));
  assert.equal(v.cause, "unsampled", "edges 30 ms from the samples: not covered");
  // With regular samples, steal before the frame still can't be credited inside it.
  const v2 = classifyFrame({ e0: 30, e1: 80 }, rows({ t0: 0, t1: 100, tick: (t) => (t === 10 || t === 20 || t === 30 ? [0] : []), run: (t) => t }), [[0, 31]], R(0));
  assert.ok(!excused(v2), JSON.stringify(v2));
});

test("SIM-PERF-1 R1 case 1 (for frames): steal only on another vCPU, renderer working, is not proof", () => {
  const v = classifyFrame({ e0: 0, e1: 50 }, rows({ t1: 70, cpu: () => 0, gpu: () => 1, tick: (t) => (t > 0 && t <= 40 && t % 10 === 0 ? [1] : []), run: (t) => t }), [[0, 50]], R(0));
  assert.ok(!excused(v));
  assert.equal(v.excusedMs, 0);
});

test("SIM-PERF-1 R1 case 2 (for frames): a jiffy in the boundary interval before the frame is not proof", () => {
  // Frame [9.8, 48.8]: one jiffy charged at t = 10, in the interval [5, 10] that is almost all outside.
  const v = classifyFrame({ e0: 9.8, e1: 48.8 }, rows({ t1: 70, tick: (t) => (t === 10 ? [0] : []), run: (t) => t }), [[9, 40]], R(0));
  assert.ok(!excused(v));
  assert.equal(v.excusedMs, 0);
});

test("a sleeping thread's last-run vCPU: steal there doesn't delay it, so nothing is credited", () => {
  // Renderer idle in epoll_wait (its last-run vCPU 0 stolen 40 ms), not waiting on the GPU process.
  const v = classifyFrame({ e0: 0, e1: 60 }, rows({ t1: 80, tick: (t) => (t > 0 && t <= 40 && t % 10 === 0 ? [0] : []) }), [[0, 60]], IDLE);
  assert.ok(!excused(v));
  assert.equal(v.cause, "mixed", "steal seen but not attributable: ours");
});

test("an internal sampler gap gives the threads no credit", () => {
  // Regular samples except a 30 ms hole inside the frame, where vCPU 0 gained 3 jiffies.
  const rs = rows({ t1: 90, tick: (t) => (t === 40 ? [0, 0, 0] : []), run: (t) => t }).filter(r => r.t0 <= 10 || r.t0 >= 40);
  const v = classifyFrame({ e0: 0, e1: 60 }, rs, [[0, 60]], R(0));
  assert.ok(!excused(v), JSON.stringify(v));
  assert.equal(v.gaps, 1);
});

test("without thread states nothing is credited (the sampler worker's polls absent)", () => {
  const v = classifyFrame({ e0: 0, e1: 80 }, rows({ t1: 100, tick: pause(0) }), [[0, 80]], {});
  assert.ok(!excused(v));
  assert.ok(v.unknownState > 0);
});

test("positive: a VM pause, the renderer runnable on its stolen vCPU inside the frame, the canary stalled with it: host", () => {
  // 80 ms frame; vCPU 0 gains a jiffy every 10 ms inside it (8 jiffies, 70 ms provable after one off).
  const v = classifyFrame({ e0: 0, e1: 80 }, rows({ t1: 100, tick: pause(0) }), [[-1, 82]], R(0));
  assert.equal(v.cause, "host", JSON.stringify(v));
  assert.ok(v.remainderMs <= 34);
});

test("the canary must agree: the same steal with no canary stall is not excused", () => {
  const v = classifyFrame({ e0: 0, e1: 80 }, rows({ t1: 100, tick: pause(0) }), [], R(0));
  assert.ok(!excused(v));
  assert.equal(v.cause, "mixed");
});

test("r12 tour 3's arithmetic: 40 ms credited over a 71 ms bracket of a 66.7 ms frame is not provable within budget", () => {
  // Four jiffies: two charged in the boundary intervals' outside parts (at the bracket's ends), two inside.
  const e0 = 0, e1 = 66.7;
  const v = classifyFrame({ e0, e1 }, rows({ t0: -2.5, t1: 90, tick: (t) => (t === 2.5 || t === 67.5 || t === 32.5 || t === 42.5 ? [0] : []) }), [[-1, 68]], R(0));
  assert.ok(v.remainderMs > 34, JSON.stringify(v));
  assert.ok(!excused(v), "the legacy rule's host (remainder 26.7) doesn't survive the lower bound");
});

test("r12 tour 7's arithmetic: VM-wide steal over a span with both boundaries in it falls below the host-stopped label's bound", () => {
  // 83.4 ms frame, 8 vCPUs; 45 jiffies in all (the legacy 450 ms), 14 of them in the boundary intervals' outside parts.
  const e0 = 0, e1 = 83.4, inner = [10, 20, 30, 40, 50, 60, 70, 80];
  const tick = (t) => t === -2.5 ? [0, 1, 2, 3, 4, 5, 6] : t === 87.5 ? [0, 1, 2, 3, 4, 5, 6] : inner.includes(t) ? [1, 2, 3, 4] : t === 35 || t === 55 || t === 75 ? [5] : [];
  const v = classifyFrame({ e0, e1 }, rows({ t0: -7.5, t1: 100, tick, cpu: () => 0, gpu: () => 0 }), [[-1, 85]], IDLE);
  assert.notEqual(v.cause, "host-stopped", JSON.stringify(v));
  assert.ok(OURS.has(v.cause));
});

test("Sol R4-1 #1: VM-wide steal, a stalled canary and idle threads give the host-stopped label, which stays ours", () => {
  // Every vCPU gains a jiffy every 10 ms inside an 80 ms frame: 8 × 8 jiffies = 640 ms; minus 8 jiffies = 560 ≥ 0.5 × 80 × 8.
  const tick = (t) => (t > 0 && t <= 80 && t % 10 === 0 ? [0, 1, 2, 3, 4, 5, 6, 7] : []);
  const v = classifyFrame({ e0: 0, e1: 80 }, rows({ t1: 100, tick }), [[-1, 82]], IDLE);
  assert.equal(v.cause, "host-stopped", JSON.stringify(v));
  assert.equal(v.gpu, "unknown");
  assert.ok(OURS.has(v.cause), "a diagnostic label: the gate fails on it");
  assert.equal(v.excusedMs, 0);
  assert.equal(v.remainderMs, 80);
  // Our threads busy for 40 ms, or the GPU known busy: not even the label.
  assert.notEqual(classifyFrame({ e0: 0, e1: 80 }, rows({ t1: 100, tick, run: (t) => Math.max(0, Math.min(40, t)) }), [[-1, 82]], IDLE).cause, "host-stopped");
  assert.notEqual(classifyFrame({ e0: 0, e1: 80 }, rows({ t1: 100, tick }), [[-1, 82]], IDLE, true).cause, "host-stopped");
});

test("Sol R4-1 #2: a renderer last seen runnable before an observer outage gets no credit for the frame", () => {
  // Observed R until -10, then the polls stop (outage) and resume at 81 seeing S: the frame's state is unknown.
  const outage = { renderer: { states: [[-1000, -1000, "R", "", 0], [-10, 81, "S", "epoll_wait", 0]], cover: [[-1000, -10], [81, 1000]] } };
  const v = classifyFrame({ e0: 0, e1: 80 }, rows({ t1: 100, tick: pause(0) }), [[-1, 82]], outage);
  assert.ok(!excused(v), JSON.stringify(v));
  assert.ok(OURS.has(v.cause));
  assert.equal(v.excusedMs, 0);
  // The review's exact shape: change-only states with no coverage at all (as r13 recorded them).
  const r13 = classify({ gap: 80, raw: { window: { e0: 0, e1: 80 }, rows: rows({ t1: 100, tick: pause(0) }).map(({ t0, t1: _t1, ...r }) => ({ t: t0, ...r })),
    canary: [[-1, 82]], states: [[-20, "R", ""], [81, "S", "epoll_wait"]] } }, 8);
  assert.ok(OURS.has(r13.cause), JSON.stringify(r13));
  assert.equal(r13.rule, "provable, states unobserved");
});

test("Sol R4-1 #3: a renderer in an unrelated futex, the GPU thread asleep on its stolen vCPU: no credit", () => {
  const sleepingGpu = { renderer: thread("S", "futex", 0), gpu: thread("S", "epoll_wait", 1) };
  const v = classifyFrame({ e0: 0, e1: 80 }, rows({ t1: 100, tick: pause(1) }), [[-1, 82]], sleepingGpu);
  assert.ok(!excused(v), JSON.stringify(v));
  assert.equal(v.excusedMs, 0);
  // The GPU thread unobserved: no credit either.
  assert.ok(!excused(classifyFrame({ e0: 0, e1: 80 }, rows({ t1: 100, tick: pause(1) }), [[-1, 82]], { renderer: thread("S", "futex", 0) })));
  // The GPU thread runnable on a different vCPU from the one stolen: no credit.
  assert.ok(!excused(classifyFrame({ e0: 0, e1: 80 }, rows({ t1: 100, tick: pause(1) }), [[-1, 82]], { renderer: thread("S", "futex", 0), gpu: thread("R", "", 3) })));
});

test("positive: the renderer waits in a futex while the GPU main thread is runnable on its stolen vCPU, the canary agreeing: host", () => {
  const v = classifyFrame({ e0: 0, e1: 80 }, rows({ t1: 100, tick: pause(1) }), [[-1, 82]], { renderer: thread("S", "futex", 0), gpu: thread("R", "", 1) });
  assert.equal(v.cause, "host", JSON.stringify(v));
});

test("a migration the rows can't see (vCPU 0 → 2 → 0 between rows) shows in the state polls and removes the credit", () => {
  const aba = { renderer: { states: [[-1000, -1000, "R", "", 0], [30, 32, "R", "", 2], [44, 46, "R", "", 0]], cover: [[-1000, 1000]] } };
  const v = classifyFrame({ e0: 0, e1: 80 }, rows({ t1: 100, tick: pause(0) }), [[-1, 82]], aba);
  const whole = classifyFrame({ e0: 0, e1: 80 }, rows({ t1: 100, tick: pause(0) }), [[-1, 82]], R(0));
  assert.ok(v.provableStolenMs < whole.provableStolenMs, `${v.provableStolenMs} < ${whole.provableStolenMs}`);
  assert.ok(v.unknownState === 0, "observed, not unknown: the intervals off vCPU 0 just earn nothing");
});

test("a state-poll error inside the frame splits the coverage: the intervals across it are unknown, ours", () => {
  const broken = { renderer: { states: [[-1000, -1000, "R", "", 0], [24, 60, "R", "", 0]], cover: [[-1000, 20], [60, 1000]] } };
  const v = classifyFrame({ e0: 0, e1: 80 }, rows({ t1: 100, tick: pause(0) }), [[-1, 82]], broken);
  assert.ok(!excused(v), JSON.stringify(v));
  assert.ok(v.unknownState > 0);
});

test("a state change is placed anywhere between its polls: a renderer that may still have slept at the frame's start earns nothing there", () => {
  // Asleep, then seen runnable by the poll at 3 (the poll before it at -2): [-2, 3] is uncertain.
  const late = { renderer: { states: [[-1000, -1000, "S", "epoll_wait", 0], [-2, 3, "R", "", 0]], cover: [[-1000, 1000]] } };
  assert.equal(observedThroughout(late.renderer, 0, 5, ([, , st]) => st === "R"), false);
  assert.equal(observedThroughout(late.renderer, 5, 10, ([, , st]) => st === "R"), true);
  const v = classifyFrame({ e0: 0, e1: 80 }, rows({ t1: 100, tick: pause(0) }), [[-1, 82]], late);
  const whole = classifyFrame({ e0: 0, e1: 80 }, rows({ t1: 100, tick: pause(0) }), [[-1, 82]], R(0));
  assert.ok(v.provableStolenMs <= whole.provableStolenMs);
});

test("rows read slowly are judged at their widest: 8 ms acquisitions make every 5 ms interval a gap, no credit", () => {
  const v = classifyFrame({ e0: 0, e1: 80 }, rows({ t1: 100, acquire: 8, tick: pause(0) }), [[-1, 82]], R(0));
  assert.ok(!excused(v), JSON.stringify(v));
  assert.ok(v.gaps > 0);
});

test("ordinary contention with zero steal, the canary late: ours (a late wake alone is no proof)", () => {
  const v = classifyFrame({ e0: 0, e1: 80 }, rows({ t1: 100, run: (t) => t }), [[-1, 60]], R(0));
  assert.equal(v.excusedMs, 0);
  assert.equal(v.cause, "mixed");
});

test("no steal, no canary stall, full coverage: the game's (clean)", () => {
  const v = classifyFrame({ e0: 0, e1: 50 }, rows({ t1: 70, run: (t) => t }), [], R(0));
  assert.equal(v.cause, "clean");
});

test("recorded frames without raw rows are judged by the labelled legacy rule, never as provable", () => {
  const c = classify({ gap: 66.7, thread: { stolenMs: 40, spanMs: 71.2, stealAllCpusMs: 410, onCpuMs: 0.2, gpuOnCpuMs: 5.6 } }, 8);
  assert.equal(c.rule, "legacy");
  const p = classify({ gap: 50, raw: { window: { e0: 0, e1: 50 }, rows: rows({ t1: 70, run: (t) => t }), canary: [], threads: R(0) } }, 8);
  assert.equal(p.rule, "provable");
  assert.equal(p.cause, "clean");
});
