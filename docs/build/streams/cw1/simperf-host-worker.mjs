// SIM-PERF-1 (probe only): the host's view beside a traversal, on its own thread, in epoch ms.
// Every 1 ms a CLOCK_MONOTONIC canary (a gap: this whole process, on another vCPU, did not run);
// every 2 ms the renderer main thread's state and the syscall it is in; every 10 ms each
// vCPU's steal from /proc/stat and the vCPU the renderer's main thread is on.
import { parentPort } from "node:worker_threads";
import { readFileSync } from "node:fs";

const SYSCALLS = { 0: "read", 1: "write", 7: "poll", 16: "ioctl", 46: "sendmsg", 47: "recvmsg", 202: "futex", 230: "nanosleep",
  232: "epoll_wait", 270: "pselect", 271: "ppoll", 281: "epoll_pwait" };
const late = [], steal = [], where = [], states = [], last = [], sleeper = new Int32Array(new SharedArrayBuffer(4));
let pid = null, stop = false, n = 0, cpuWas = -1, stateWas = "";
const epoch = () => performance.timeOrigin + performance.now();
let prev = epoch();
parentPort.on("message", (m) => { if (m === "stop") stop = true; else pid = m; });
function tick() {
  if (stop) { parentPort.postMessage({ late, steal, where, states }); return; }
  Atomics.wait(sleeper, 0, 0, 1);
  const now = epoch();
  if (now - prev > 3) late.push([prev, +(now - prev).toFixed(2)]);
  prev = now;
  if (pid && n % 2 === 0) try {
    const f = readFileSync(`/proc/${pid}/task/${pid}/stat`, "utf8"), st = f[f.lastIndexOf(")") + 2];
    const sc = st === "R" ? "" : readFileSync(`/proc/${pid}/task/${pid}/syscall`, "utf8").split(" ")[0].trim();
    const w = SYSCALLS[sc] ?? sc, key = `${st} ${w}`;
    if (key !== stateWas) { states.push([now, st, w]); stateWas = key; }
  } catch {}
  if (++n % 10 === 0) {
    try {
      for (const line of readFileSync("/proc/stat", "utf8").split("\n")) {
        const m = /^cpu(\d+) /.exec(line);
        if (!m) continue;
        const c = Number(m[1]), v = Number(line.trim().split(/\s+/)[8]);
        if (last[c] !== undefined && v > last[c]) steal.push([now, c, v - last[c]]);
        last[c] = v;
      }
    } catch {}
    if (pid) try {
      const f = readFileSync(`/proc/${pid}/task/${pid}/stat`, "utf8"), c = Number(f.slice(f.lastIndexOf(")") + 2).split(" ")[36]);
      if (c !== cpuWas) { where.push([now, c]); cpuWas = c; }
    } catch {}
  }
  setImmediate(tick);
}
tick();
