// SIM-PERF-1 R1-F1: the step classifier never clears a step without proof.
//   node --test step-class.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { classifyStep } from "./step-class.mjs";

// Rows every 5 ms on two vCPUs: cpu is the renderer thread's vCPU, steal[] jiffies per vCPU.
const rows = (spec) => spec.map(([t, cpu, s0, s1]) => ({ t, cpu, steal: [s0, s1] }));

test("Sol R1 case 1: steal only on another vCPU (the GPU process's) never excuses renderer work", () => {
  const v = classifyStep({ e0: 10, e1: 22 }, rows([[10, 0, 0, 0], [15, 0, 0, 1], [20, 0, 0, 1], [25, 0, 0, 1]]));
  assert.equal(v.cause, "ours");
  assert.equal(v.excusedMs, 0);
});

test("Sol R1 case 2: a jiffy in the boundary interval before the step is not proof", () => {
  const v = classifyStep({ e0: 9.8, e1: 18.8 }, rows([[5, 0, 0, 0], [10, 0, 1, 0], [15, 0, 1, 0], [20, 0, 1, 0]]));
  assert.notEqual(v.cause, "host");
  assert.equal(v.cause, "unresolved");
  assert.equal(v.excusedMs, 0);
});

// A VM pause that began before a 70 ms step: the thread's vCPU charged a jiffy every 10 ms
// inside it, plus one in the first interval for the pause's earlier part (charged at the next
// tick, inside the step); 8 jiffies, so 70 ms is provable. The canary stalled with it.
const paused = () => { const spec = []; for (let t = 95, j = 0; t <= 175; t += 5) { spec.push([t, 0, j, 0]); if (t >= 100 && t < 170 && (t % 10 === 5 || t === 100)) j++; } return rows(spec); };

test("a VM pause: steal provably inside the step on the thread's vCPU, and the canary stalled with it", () => {
  const v = classifyStep({ e0: 100, e1: 170 }, paused(), [[99, 72]]);
  assert.equal(v.cause, "host", JSON.stringify(v));
  assert.equal(v.excusedMs, 70);
  assert.equal(v.remainderMs, 0);
});

test("the instrument's limit: a 10 ms jiffy margin means a wholly stolen step keeps about 10 ms unproven", () => {
  // Six jiffies inside a 60 ms step: at most 50 ms is provable, so it stays unresolved.
  const spec = []; for (let t = 95, j = 0; t <= 165; t += 5) { spec.push([t, 0, j, 0]); if (t >= 100 && t < 155 && t % 10 === 0) j++; }
  const v = classifyStep({ e0: 100, e1: 160 }, rows(spec), [[101, 59]]);
  assert.equal(v.provableStolenMs, 50);
  assert.equal(v.cause, "unresolved");
});

test("the same steal without the canary stalling stays unresolved", () => {
  const spec = []; for (let t = 95, j = 0; t <= 165; t += 5) { spec.push([t, 0, j, 0]); if (t >= 100 && t < 155 && t % 10 === 0) j++; }
  const v = classifyStep({ e0: 100, e1: 160 }, rows(spec), []);
  assert.equal(v.cause, "unresolved");
  assert.equal(v.excusedMs, 0);
});

test("a canary stall bounds what steal can excuse", () => {
  const spec = []; for (let t = 95, j = 0; t <= 165; t += 5) { spec.push([t, 0, j, 0]); if (t >= 100 && t < 155 && t % 10 === 0) j++; }
  const v = classifyStep({ e0: 100, e1: 160 }, rows(spec), [[120, 9]]);
  assert.equal(v.cause, "unresolved");
  assert.equal(v.excusedMs, 8);
});

test("a thread that changed vCPU inside the step can't be cleared by that interval", () => {
  const v = classifyStep({ e0: 10, e1: 30 }, rows([[5, 0, 0, 0], [10, 0, 0, 0], [15, 1, 0, 2], [20, 1, 0, 2], [25, 1, 0, 2], [30, 1, 0, 2], [35, 1, 0, 2]]), [[10, 20]]);
  assert.equal(v.cause, "unresolved");
  assert.equal(v.migrations, 1);
});

test("no steal and no canary stall over full coverage: the game's", () => {
  const v = classifyStep({ e0: 12, e1: 31 }, rows([[10, 0, 3, 3], [15, 0, 3, 3], [20, 0, 3, 3], [25, 0, 3, 3], [30, 0, 3, 3], [35, 0, 3, 3]]));
  assert.equal(v.cause, "ours");
  assert.equal(v.remainderMs, 19);
});

test("samples that don't reach both ends: unsampled, never cleared", () => {
  assert.equal(classifyStep({ e0: 10, e1: 30 }, rows([[12, 0, 0, 0], [40, 0, 5, 0]]), [[10, 20]]).cause, "unsampled");
  assert.equal(classifyStep({ e0: 10, e1: 30 }, rows([[5, 0, 0, 0], [20, 0, 5, 0]]), [[10, 20]]).cause, "unsampled");
});
