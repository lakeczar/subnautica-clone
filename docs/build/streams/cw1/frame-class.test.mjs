// CW-1 R3-1: the frame gate never excuses a frame without proof.
//   node --test docs/build/streams/cw1/frame-class.test.mjs
// Negative controls are the review's (Sol R3-1, three counterexamples, and its
// uncertainty cases) and SIM-PERF-1's two R1 cases, restated for frames; the
// r12 boundary arithmetic shows why tours 3 and 7 were unresolved.
import test from "node:test";
import assert from "node:assert/strict";
import { classifyFrame, classify, OURS } from "./frame-class.mjs";

/** Rows every `step` ms over [t0, t1] on `ncpu` vCPUs. `cpu(t)` / `gpu(t)`: the
 * renderer's and GPU main thread's vCPU at the sample; `tick(t)`: vCPUs whose
 * steal counter gains a jiffy at the sample at t; `run(t)`: renderer CPU ms so far. */
function rows({ t0 = -20, t1, step = 5, ncpu = 8, cpu = () => 0, gpu = () => 1, tick = () => [], run = () => 0, grun = () => 0 }) {
  const out = [], steal = new Array(ncpu).fill(0);
  for (let t = t0; t <= t1; t += step) {
    for (const c of tick(t)) steal[c]++;
    out.push({ t, run: run(t), grun: grun(t), cpu: cpu(t), gpuCpu: gpu(t), steal: [...steal] });
  }
  return out;
}
const R = [[-100, "R", ""]], FUTEX = [[-100, "S", "futex"]], IDLE = [[-100, "S", "epoll_wait"]];
const excused = (v) => v.cause === "host" || v.cause === "host-stopped";

test("Sol R3-1 #1: steal on the sleeping GPU thread's vCPU never excuses 60 ms of renderer work", () => {
  // Renderer runnable on vCPU 1 throughout; vCPU 0 (the GPU main thread's) loses 30 ms.
  const v = classifyFrame({ e0: 0, e1: 60 }, rows({ t1: 80, cpu: () => 1, gpu: () => 0, tick: (t) => (t > 0 && t <= 30 && t % 10 === 0 ? [0] : []), run: (t) => t }), [], R);
  assert.ok(!excused(v), JSON.stringify(v));
  assert.ok(OURS.has(v.cause));
  assert.equal(v.excusedMs, 0);
});

test("Sol R3-1 #2: a migration inside a delayed sample interval credits nothing to the old vCPU", () => {
  // Samples at 0 and 60 only: the thread moved 0 → 1 just after 0; vCPU 0 lost 40 ms while 1 ran the game.
  const rs = [{ t: -5, run: 0, grun: 0, cpu: 0, gpuCpu: 2, steal: [0, 0, 0] }, { t: 0, run: 0, grun: 0, cpu: 0, gpuCpu: 2, steal: [0, 0, 0] },
    { t: 60, run: 60, grun: 0, cpu: 1, gpuCpu: 2, steal: [4, 0, 0] }, { t: 65, run: 65, grun: 0, cpu: 1, gpuCpu: 2, steal: [4, 0, 0] }];
  const v = classifyFrame({ e0: 2, e1: 62 }, rs, [[2, 60]], R);
  assert.ok(!excused(v), JSON.stringify(v));
  assert.equal(v.cause, "mixed");
  assert.equal(v.excusedMs, 0);
});

test("Sol R3-1 #3: a frame inside one long sample bracket, its steal all before it, is never cleared", () => {
  // Samples at 0 and 100 only; frame [30, 80]; 30 ms stolen before 30.
  const rs = [{ t: 0, run: 0, grun: 0, cpu: 0, gpuCpu: 1, steal: [0, 0] }, { t: 100, run: 70, grun: 0, cpu: 0, gpuCpu: 1, steal: [3, 0] }];
  const v = classifyFrame({ e0: 30, e1: 80 }, rs, [[0, 30]], R);
  assert.ok(!excused(v));
  assert.equal(v.cause, "unsampled", "edges 30 ms from the samples: not covered");
  // With regular samples, steal before the frame still can't be credited inside it.
  const v2 = classifyFrame({ e0: 30, e1: 80 }, rows({ t0: 0, t1: 100, tick: (t) => (t === 10 || t === 20 || t === 30 ? [0] : []), run: (t) => t }), [[0, 31]], R);
  assert.ok(!excused(v2), JSON.stringify(v2));
});

test("SIM-PERF-1 R1 case 1 (for frames): steal only on another vCPU, renderer working, is not proof", () => {
  const v = classifyFrame({ e0: 0, e1: 50 }, rows({ t1: 70, cpu: () => 0, gpu: () => 1, tick: (t) => (t > 0 && t <= 40 && t % 10 === 0 ? [1] : []), run: (t) => t }), [[0, 50]], R);
  assert.ok(!excused(v));
  assert.equal(v.excusedMs, 0);
});

test("SIM-PERF-1 R1 case 2 (for frames): a jiffy in the boundary interval before the frame is not proof", () => {
  // Frame [9.8, 48.8]: one jiffy charged at t = 10, in the interval [5, 10] that is almost all outside.
  const v = classifyFrame({ e0: 9.8, e1: 48.8 }, rows({ t1: 70, tick: (t) => (t === 10 ? [0] : []), run: (t) => t }), [[9, 40]], R);
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
  const rs = rows({ t1: 90, tick: (t) => (t === 40 ? [0, 0, 0] : []), run: (t) => t }).filter(r => r.t <= 10 || r.t >= 40);
  const v = classifyFrame({ e0: 0, e1: 60 }, rs, [[0, 60]], R);
  assert.ok(!excused(v), JSON.stringify(v));
  assert.equal(v.gaps, 1);
});

test("without thread states nothing is credited (the canary worker absent)", () => {
  const v = classifyFrame({ e0: 0, e1: 80 }, rows({ t1: 100, tick: (t) => (t > 0 && t <= 80 && t % 10 === 0 ? [0] : []) }), [[0, 80]], []);
  assert.ok(!excused(v));
});

test("a VM pause: the runnable renderer's vCPU stolen inside the frame, the canary stalled with it: host", () => {
  // 80 ms frame; vCPU 0 gains a jiffy every 10 ms inside it (8 jiffies, 70 ms provable after one off).
  const v = classifyFrame({ e0: 0, e1: 80 }, rows({ t1: 100, tick: (t) => (t > 0 && t <= 80 && t % 10 === 0 ? [0] : []), run: () => 0 }), [[-1, 82]], R);
  assert.equal(v.cause, "host", JSON.stringify(v));
  assert.ok(v.remainderMs <= 34);
});

test("the canary must agree: the same steal with no canary stall is not excused", () => {
  const v = classifyFrame({ e0: 0, e1: 80 }, rows({ t1: 100, tick: (t) => (t > 0 && t <= 80 && t % 10 === 0 ? [0] : []) }), [], R);
  assert.ok(!excused(v));
  assert.equal(v.cause, "mixed");
});

test("the GPU process's vCPU counts while the renderer waits on it (futex), the canary agreeing", () => {
  const v = classifyFrame({ e0: 0, e1: 80 }, rows({ t1: 100, cpu: () => 0, gpu: () => 1, tick: (t) => (t > 0 && t <= 80 && t % 10 === 0 ? [1] : []) }), [[-1, 82]], FUTEX);
  assert.equal(v.cause, "host", JSON.stringify(v));
});

test("r12 tour 3's arithmetic: 40 ms credited over a 71 ms bracket of a 66.7 ms frame is not provable within budget", () => {
  // Four jiffies: two charged in the boundary intervals' outside parts (at the bracket's ends), two inside.
  const e0 = 0, e1 = 66.7;
  const v = classifyFrame({ e0, e1 }, rows({ t0: -2.5, t1: 90, tick: (t) => (t === 2.5 || t === 67.5 || t === 32.5 || t === 42.5 ? [0] : []), run: () => 0 }), [[-1, 68]], R);
  assert.ok(v.remainderMs > 34, JSON.stringify(v));
  assert.ok(!excused(v), "the legacy rule's host (remainder 26.7) doesn't survive the lower bound");
});

test("r12 tour 7's arithmetic: VM-wide steal over a span with both boundaries in it falls below the host-stopped bound", () => {
  // 83.4 ms frame, 8 vCPUs; 45 jiffies in all (the legacy 450 ms), 14 of them in the boundary intervals' outside parts.
  const e0 = 0, e1 = 83.4, inner = [10, 20, 30, 40, 50, 60, 70, 80];
  const tick = (t) => t === -2.5 ? [0, 1, 2, 3, 4, 5, 6] : t === 87.5 ? [0, 1, 2, 3, 4, 5, 6] : inner.includes(t) ? [1, 2, 3, 4] : t === 35 || t === 55 || t === 75 ? [5] : [];
  const v = classifyFrame({ e0, e1 }, rows({ t0: -7.5, t1: 100, tick, cpu: () => 0, gpu: () => 0 }), [[-1, 85]], IDLE);
  assert.notEqual(v.cause, "host-stopped", JSON.stringify(v));
  assert.ok(OURS.has(v.cause));
});

test("host-stopped needs most of the VM provably stopped, the canary stalled, and our threads idle", () => {
  // Every vCPU gains a jiffy every 10 ms inside an 80 ms frame: 8 × 8 jiffies = 640 ms; minus 8 jiffies = 560 ≥ 0.5 × 80 × 8.
  const tick = (t) => (t > 0 && t <= 80 && t % 10 === 0 ? [0, 1, 2, 3, 4, 5, 6, 7] : []);
  const v = classifyFrame({ e0: 0, e1: 80 }, rows({ t1: 100, tick }), [[-1, 82]], IDLE);
  assert.equal(v.cause, "host-stopped", JSON.stringify(v));
  assert.equal(v.gpu, "unknown");
  // Our threads busy for 40 ms: not host-stopped.
  const busy = classifyFrame({ e0: 0, e1: 80 }, rows({ t1: 100, tick, run: (t) => Math.max(0, Math.min(40, t)) }), [[-1, 82]], IDLE);
  assert.notEqual(busy.cause, "host-stopped");
  // GPU known busy: not host-stopped.
  assert.notEqual(classifyFrame({ e0: 0, e1: 80 }, rows({ t1: 100, tick }), [[-1, 82]], IDLE, true).cause, "host-stopped");
});

test("no steal, no canary stall, full coverage: the game's (clean)", () => {
  const v = classifyFrame({ e0: 0, e1: 50 }, rows({ t1: 70, run: (t) => t }), [], R);
  assert.equal(v.cause, "clean");
});

test("recorded frames without raw rows are judged by the labelled legacy rule, never as provable", () => {
  const c = classify({ gap: 66.7, thread: { stolenMs: 40, spanMs: 71.2, stealAllCpusMs: 410, onCpuMs: 0.2, gpuOnCpuMs: 5.6 } }, 8);
  assert.equal(c.rule, "legacy");
  const p = classify({ gap: 50, raw: { window: { e0: 0, e1: 50 }, rows: rows({ t1: 70, run: (t) => t }), canary: [], states: R } }, 8);
  assert.equal(p.rule, "provable");
  assert.equal(p.cause, "clean");
});
