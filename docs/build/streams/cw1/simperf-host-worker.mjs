// SIM-PERF-1 (probe only): beside a traversal, on its own thread, in epoch ms: a 1 ms
// CLOCK_MONOTONIC canary (a gap: this whole process, on another vCPU, did not run) and, every
// 2 ms, the renderer main thread's state and the syscall it is in (wchan is hidden on this
// kernel). Steal and vCPUs come from the traversal's own 5 ms sampler (CW-1's rule).
import { parentPort } from "node:worker_threads";
import { readFileSync } from "node:fs";

const SYSCALLS = { 0: "read", 1: "write", 7: "poll", 16: "ioctl", 46: "sendmsg", 47: "recvmsg", 202: "futex", 230: "nanosleep",
  232: "epoll_wait", 270: "pselect", 271: "ppoll", 281: "epoll_pwait" };
const late = [], states = [], sleeper = new Int32Array(new SharedArrayBuffer(4));
let pid = null, stop = false, n = 0, stateWas = "";
const epoch = () => performance.timeOrigin + performance.now();
let prev = epoch();
parentPort.on("message", (m) => { if (m === "stop") stop = true; else pid = m; });
function tick() {
  if (stop) { parentPort.postMessage({ late, states }); return; }
  Atomics.wait(sleeper, 0, 0, 1);
  const now = epoch();
  if (now - prev > 3) late.push([prev, +(now - prev).toFixed(2)]);
  prev = now;
  if (pid && n++ % 2 === 0) try {
    const f = readFileSync(`/proc/${pid}/task/${pid}/stat`, "utf8"), st = f[f.lastIndexOf(")") + 2];
    const sc = st === "R" ? "" : readFileSync(`/proc/${pid}/task/${pid}/syscall`, "utf8").split(" ")[0].trim();
    const w = SYSCALLS[sc] ?? sc, key = `${st} ${w}`;
    if (key !== stateWas) { states.push([now, st, w]); stateWas = key; }
  } catch {}
  setImmediate(tick);
}
tick();
