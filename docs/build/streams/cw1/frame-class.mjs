// CW-1: what decides a long frame (shared by traverse.mjs, summarize.mjs and the
// evidence table, so recorded runs and new ones are judged alike).
//
// Only stolen time that provably fell inside the frame excuses it (CW-1 R3 prep,
// after SIM-PERF-1's R1-F1; the same proof rules as step-class.mjs):
//   - per-vCPU steal from /proc/stat (USER_HZ jiffies, 10 ms), sampled every 5 ms
//     with the vCPU the renderer's and the GPU process's main threads were on;
//   - an interval wholly inside the frame counts in full; a boundary interval
//     counts only what can't fit in its part outside the frame; an interval in
//     which the renderer changed vCPU counts nothing (R3-1: unresolved
//     migration), nor one longer than MAX_GAP_MS (a sampler gap), and samples
//     further than MAX_GAP_MS from either edge leave the frame unsampled;
//   - the renderer's vCPU counts only for time it was runnable throughout (a
//     sleeping thread's last-run vCPU says nothing about delay); the GPU
//     process's vCPU counts only while the renderer was in a futex wait
//     throughout (waiting on the GPU process: critical-path evidence), never
//     against renderer-side work; without thread states neither counts;
//   - one jiffy is taken off the total (steal is charged at the next tick), and
//     it is capped at the time the samples cover;
//   - the canary must agree: what is excused is at most the canary's own stall
//     overlapping the frame (a VM pause stalls it too, on another vCPU).
// Classes (never excused on doubt):
//   host          excused time brings the frame within budget
//   host-stopped  most of the VM provably stopped (per-vCPU inside steal, one
//                 jiffy off each, >= 50% of covered time × vCPUs), the canary
//                 stalled for half the frame or more, our two main threads within
//                 budget on CPU (over the whole sampled span, an over-estimate),
//                 and no evidence the GPU was busy; without GPU busy data it says
//                 "GPU unknown"
//   mixed         steal, a canary stall or a migration, but not enough proof: ours
//   clean         none of those: ours
//   unsampled     the samples don't cover the frame: ours
// Recorded runs from before raw rows were kept (r10, r12) can only be judged by
// `classifyLegacy`: aggregate steal over a span that includes both boundary
// intervals, an upper bound, never proof.
export const BUDGET_MS = 34, JIFFY_MS = 10;
/** Longest sample interval trusted for a thread's attribution (the sampler runs every 5 ms). */
export const MAX_GAP_MS = 12;
const CANARY_PERIOD_MS = 1;
/** Frames judged ours: the gate fails on a streaming frame in one of these. */
export const OURS = new Set(["mixed", "clean", "unsampled"]);

/** True when every state the renderer was in over [a, b] passes `ok` (`states`: [t, state, syscall][] in time order). */
function throughout(states, a, b, ok) {
  let k = -1;
  for (let i = 0; i < states.length && states[i][0] <= a; i++) k = i;
  if (k < 0) return false;
  for (let i = k; i < states.length && states[i][0] < b; i++) if (!ok(states[i])) return false;
  return true;
}
const runnable = ([, st]) => st === "R";
const futexWait = ([, st, w]) => st === "S" && w === "futex";

/**
 * @param frame  { e0, e1 } epoch ms
 * @param rows   sampler rows in time order: { t, run, grun, cpu, gpuCpu, steal: number[] }
 *               (epoch ms; renderer and GPU main-thread CPU ms; their vCPUs; every vCPU's steal in jiffies)
 * @param canary the canary's late wakes: [startEpochMs, gapMs][]
 * @param states the renderer main thread's state changes: [t, state, syscall][]
 * @param gpuBusy true/false when GPU busy time is known for the frame, undefined when not
 */
export function classifyFrame({ e0, e1 }, rows, canary = [], states = [], gpuBusy = undefined) {
  const gap = e1 - e0;
  const first = rows.findIndex((r) => r.t > e0) - 1, lastAfter = rows.findIndex((r) => r.t >= e1);
  if (first < 0 || lastAfter < 0 || e0 - rows[first].t > MAX_GAP_MS || rows[lastAfter].t - e1 > MAX_GAP_MS)
    return { cause: "unsampled", remainderMs: round(gap) };
  const ncpu = rows[first].steal.length;
  let covered = 0, stolen = 0, vmStolen = 0, migrations = 0, gaps = 0, stealSeen = false;
  for (let k = first; k < lastAfter; k++) {
    const a = rows[k], b = rows[k + 1];
    const outside = Math.max(0, e0 - a.t) + Math.max(0, b.t - e1), inside = b.t - a.t - outside, lo = Math.max(a.t, e0), hi = Math.min(b.t, e1);
    covered += inside;
    // The VM as a whole (host-stopped): residency doesn't matter, so a sampler gap still counts, pro-rated.
    for (let c = 0; c < ncpu; c++) vmStolen += Math.max(0, (b.steal[c] - a.steal[c]) * JIFFY_MS - outside);
    if (b.steal[a.cpu] > a.steal[a.cpu] || (b.cpu !== a.cpu && b.steal[b.cpu] > a.steal[b.cpu])) stealSeen = true;
    // Uncertain for the threads: a migration or a sampler gap; no credit.
    if (a.cpu !== b.cpu) { migrations++; continue; }
    if (b.t - a.t > MAX_GAP_MS) { gaps++; continue; }
    let d = 0;
    if (throughout(states, lo, hi, runnable)) d = Math.max(0, (b.steal[a.cpu] - a.steal[a.cpu]) * JIFFY_MS - outside);
    else if (a.gpuCpu >= 0 && a.gpuCpu === b.gpuCpu && a.gpuCpu !== a.cpu && throughout(states, lo, hi, futexWait))
      d = Math.max(0, (b.steal[a.gpuCpu] - a.steal[a.gpuCpu]) * JIFFY_MS - outside);
    stolen += d;
  }
  const provableMs = Math.max(0, Math.min(stolen - JIFFY_MS, covered, gap));
  const canaryMs = canary.reduce((n, [t, g]) => n + Math.max(0, Math.min(e1, t + g) - Math.max(e0, t + CANARY_PERIOD_MS)), 0);
  const excusedMs = Math.min(provableMs, canaryMs), remainderMs = gap - excusedMs;
  const vmProvableMs = Math.max(0, vmStolen - ncpu * JIFFY_MS);
  const ourCpuMs = (rows[lastAfter].run - rows[first].run) + (rows[lastAfter].grun - rows[first].grun);
  const detail = { provableStolenMs: round(provableMs), canaryMs: round(canaryMs), excusedMs: round(excusedMs), remainderMs: round(remainderMs),
    coveredMs: round(covered), vmProvableMs: round(vmProvableMs), ourCpuMs: round(ourCpuMs), migrations, gaps };
  if (excusedMs > 0 && remainderMs <= BUDGET_MS) return { cause: "host", ...detail };
  if (vmProvableMs >= 0.5 * covered * ncpu && canaryMs >= 0.5 * gap && ourCpuMs <= BUDGET_MS && gpuBusy !== true)
    return { cause: "host-stopped", gpu: gpuBusy === false ? "idle" : "unknown", ...detail };
  return { cause: stealSeen || canaryMs > 0 || migrations > 0 || gaps > 0 ? "mixed" : "clean", ...detail };
}

/** A recorded long frame: by its raw rows when it has them, else the legacy rule (labelled). */
export function classify(l, ncpu) {
  if (l.raw) return { ...classifyFrame(l.raw.window, l.raw.rows, l.raw.canary, l.raw.states), rule: "provable" };
  return { ...classifyLegacy(l, ncpu), rule: "legacy" };
}

/** The rule r10 and r12 were judged by: aggregate steal over a span that includes
 * both boundary intervals, so an upper bound (up to about 20 ms over on the
 * threads, about 160 ms over 8 vCPUs). Never proof; kept to report those runs. */
export function classifyLegacy(l, ncpu) {
  const t = l.thread;
  if (!t) return { cause: "unsampled", remainderMs: l.gap };
  const stolen = Math.min(l.gap, t.stolenMs ?? 0), remainderMs = +(l.gap - stolen).toFixed(1);
  if (stolen > 10 && remainderMs <= BUDGET_MS) return { cause: "host", remainderMs };
  const vmStopped = ncpu > 0 && t.stealAllCpusMs >= 0.5 * t.spanMs * ncpu;
  const ourCpu = (t.onCpuMs ?? 0) + (t.gpuOnCpuMs ?? 0);
  if (stolen > 10 && vmStopped && ourCpu <= BUDGET_MS) return { cause: "host-stopped", gpu: "unknown", remainderMs };
  return { cause: stolen > 10 ? "mixed" : "clean", remainderMs };
}
const round = (x) => +x.toFixed(2);
