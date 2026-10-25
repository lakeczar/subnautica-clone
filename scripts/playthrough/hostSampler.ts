/** SIM-PERF-1: the host's disturbances on a worker thread, for `stepcost --host`.
 * Every 2 ms it reads each vCPU's steal from /proc/stat (USER_HZ jiffies, 10 ms:
 * the guest kernel has no finer steal clock, and a task's run time includes
 * steal here) and notes when its own 2 ms sleep overran by over 4 ms (a canary:
 * a stall of the whole VM delays this thread too, on another vCPU). Both are
 * kept as sparse lists on the epoch clock and posted back when asked. */
import { readFileSync } from "node:fs";
import { parentPort } from "node:worker_threads";

const PERIOD_MS = 2, LATE_MS = 4;
const steal: { at: number; cpu: number; jiffies: number }[] = [];
const late: { at: number; ms: number }[] = [];
const last: number[] = [];
const epoch = (): number => performance.timeOrigin + performance.now();
function sample(): void {
  let text: string;
  try { text = readFileSync("/proc/stat", "utf8"); } catch { return; }
  for (const line of text.split("\n")) {
    const m = /^cpu(\d+) /.exec(line);
    if (!m) continue;
    const cpu = Number(m[1]), value = Number(line.trim().split(/\s+/)[8]);
    if (last[cpu] !== undefined && value > last[cpu]!) steal.push({ at: epoch(), cpu, jiffies: value - last[cpu]! });
    last[cpu] = value;
  }
}
let stopped = false, previous = epoch();
parentPort!.on("message", (m: string) => {
  if (m === "stop") { stopped = true; parentPort!.postMessage({ steal, late }); }
});
const sleeper = new Int32Array(new SharedArrayBuffer(4));
function loop(): void {
  if (stopped) return;
  sample();
  Atomics.wait(sleeper, 0, 0, PERIOD_MS);
  const now = epoch();
  if (now - previous > PERIOD_MS + LATE_MS) late.push({ at: previous, ms: now - previous });
  previous = now;
  setImmediate(loop);
}
loop();
