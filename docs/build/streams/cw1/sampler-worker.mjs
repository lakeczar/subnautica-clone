// CW-1 R4: the traversal's scheduling sampler, on its own thread (off the orchestration event
// loop, where CDP, tracing and the travel's own awaits delayed it; Sol R4 on tour 1's frame).
// It sleeps with Atomics.wait, so nothing else in this process can hold it up, and keeps:
//   - rows every 5 ms (ROW_MS): acquisition start and end (epoch ms), then the renderer main
//     thread's CPU, run-queue wait and faults, the GPU process main thread's CPU and wait,
//     the vCPU each was last on, and every vCPU's steal (jiffies, /proc/stat);
//   - every 2 ms (STATE_MS), each main thread's state, its vCPU and (renderer, not running)
//     the syscall it is in, as changes [tEarliest, tLatest, state, syscall, vCPU]: a change
//     took effect after the poll before it began and before the poll that saw it ended;
//   - coverage spans per thread: polls that succeeded no more than STATE_GAP_MS apart. A gap
//     or a read error ends a span and the next poll starts one, recording the state afresh,
//     so a state is never carried across an outage (R4-1);
//   - errors, coalesced: [first, last, count, what].
// Messages in: { pid, gpu } to start; "stop" to finish (it posts everything once, the rows'
// buffer transferred).
import { parentPort } from "node:worker_threads";
import { readFileSync } from "node:fs";

const ROW_MS = 5, STATE_MS = 2, STATE_GAP_MS = 6;
const SYSCALLS = { 0: "read", 1: "write", 7: "poll", 16: "ioctl", 46: "sendmsg", 47: "recvmsg", 202: "futex", 230: "nanosleep",
  232: "epoll_wait", 270: "pselect", 271: "ppoll", 281: "epoll_pwait" };
const NCPU = (readFileSync("/proc/stat", "utf8").match(/^cpu\d+ /gm) ?? []).length;
/** t0, t1, run, wait, minor, major, gpu run, gpu wait, renderer vCPU, gpu vCPU, steal per vCPU. */
const COLS = 10 + NCPU;
const sleeper = new Int32Array(new SharedArrayBuffer(4));
const epoch = () => performance.timeOrigin + performance.now();
let data = new Float64Array(COLS * 65536), n = 0, pid = null, gpu = null, stop = false;
const errors = [];
function error(what, e) {
  const t = epoch(), last = errors.at(-1), msg = `${what}: ${e?.code ?? e?.message ?? e}`;
  if (last && last[3] === msg) { last[1] = t; last[2]++; } else errors.push([t, t, 1, msg]);
}
/** One thread's polled states and coverage. */
function observer(name, withSyscall) {
  const o = { name, states: [], cover: [], open: false, last: null, key: "" };
  o.poll = (tid) => {
    const p0 = epoch();
    let st, cpu, w = "";
    try {
      const f = readFileSync(`/proc/${tid}/task/${tid}/stat`, "utf8"), rest = f.slice(f.lastIndexOf(")") + 2).split(" ");
      st = rest[0]; cpu = +rest[36];
      if (withSyscall && st !== "R") { const sc = readFileSync(`/proc/${tid}/task/${tid}/syscall`, "utf8").split(" ")[0].trim(); w = SYSCALLS[sc] ?? sc; }
    } catch (e) { o.close(); error(`${name} state`, e); return; }
    const p1 = epoch();
    if (o.open && p1 - o.last[0] > STATE_GAP_MS) o.close();
    const key = `${st} ${w} ${cpu}`;
    if (!o.open) { o.states.push([p0, p1, st, w, cpu]); o.cover.push([p1, p1]); o.open = true; }
    else if (key !== o.key) o.states.push([o.last[0], p1, st, w, cpu]);
    o.key = key; o.last = [p0, p1];
    o.cover.at(-1)[1] = p0;
  };
  o.close = () => { o.open = false; };
  return o;
}
const renderer = observer("renderer", true), gpuThread = observer("gpu", false);
function row() {
  const t0 = epoch();
  try {
    const [run, wait] = readFileSync(`/proc/${pid}/task/${pid}/schedstat`, "utf8").split(" ").map(Number);
    const f = readFileSync(`/proc/${pid}/task/${pid}/stat`, "utf8"), rest = f.slice(f.lastIndexOf(")") + 2).split(" ");
    const g = gpu ? readFileSync(`/proc/${gpu}/task/${gpu}/schedstat`, "utf8").split(" ").map(Number) : [0, 0];
    const gs = gpu ? readFileSync(`/proc/${gpu}/task/${gpu}/stat`, "utf8") : null, gcpu = gs ? +gs.slice(gs.lastIndexOf(")") + 2).split(" ")[36] : -1;
    const steal = readFileSync("/proc/stat", "utf8").split("\n").filter(l => /^cpu\d+ /.test(l)).map(l => +l.split(/\s+/)[8]);
    const t1 = epoch();
    if ((n + 1) * COLS > data.length) { const grown = new Float64Array(data.length * 2); grown.set(data); data = grown; }
    data.set([t0, t1, run / 1e6, wait / 1e6, +rest[7], +rest[9], g[0] / 1e6, g[1] / 1e6, +rest[36], gcpu, ...steal], n * COLS);
    n++;
  } catch (e) { error("row", e); }
}
parentPort.on("message", (m) => { if (m === "stop") stop = true; else ({ pid, gpu } = m); });
let nextRow = 0, nextState = 0, polls = 0;
function loop() {
  // Sleep to the next due poll (at most 1 ms at a time, so "stop" is seen promptly).
  for (let i = 0; i < 64 && !stop; i++) {
    const now = epoch(), due = Math.min(nextRow, nextState);
    if (now < due) { Atomics.wait(sleeper, 0, 0, Math.min(1, due - now)); continue; }
    if (pid && now >= nextState) { renderer.poll(pid); if (gpu) gpuThread.poll(gpu); polls++; nextState = now + STATE_MS; }
    if (pid && now >= nextRow) { row(); nextRow = now + ROW_MS; }
    if (!pid) { nextRow = nextState = now + 1; }
  }
  if (stop) {
    const pack = (o) => ({ states: o.states, cover: o.cover });
    const rows = data.slice(0, n * COLS);
    parentPort.postMessage({ cols: COLS, ncpu: NCPU, n, rows, renderer: pack(renderer), gpu: gpu ? pack(gpuThread) : null, errors, polls,
      rowMs: ROW_MS, stateMs: STATE_MS, stateGapMs: STATE_GAP_MS }, [rows.buffer]);
    return;
  }
  // Yield to the worker's own event loop (messages) between bursts.
  setImmediate(loop);
}
loop();
