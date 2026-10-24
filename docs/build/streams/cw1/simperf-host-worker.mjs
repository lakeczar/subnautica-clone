// SIM-PERF-1 (probe only): beside a traversal, on its own thread, in epoch ms: a 1 ms
// CLOCK_MONOTONIC canary (a gap: this whole process, on another vCPU, did not run). It only
// sleeps, timestamps and appends (CW-1 R4: the thread states it also polled moved to
// sampler-worker.mjs, so the canary's wakes no longer include /proc reads).
import { parentPort } from "node:worker_threads";

const late = [], sleeper = new Int32Array(new SharedArrayBuffer(4));
let stop = false;
const epoch = () => performance.timeOrigin + performance.now();
let prev = epoch();
parentPort.on("message", (m) => { if (m === "stop") stop = true; });
function tick() {
  if (stop) { parentPort.postMessage({ late }); return; }
  Atomics.wait(sleeper, 0, 0, 1);
  const now = epoch();
  if (now - prev > 3) late.push([prev, +(now - prev).toFixed(2)]);
  prev = now;
  setImmediate(tick);
}
tick();
