// CW-1: what decides a long frame (shared by traverse.mjs, summarize.mjs and the
// evidence table, so recorded runs and new ones are judged alike).
//
// Only stolen time that provably fell inside the frame, on a thread that provably
// could be delayed by it, excuses it (CW-1 R3 prep after SIM-PERF-1's R1-F1; R4-1):
//   - per-vCPU steal from /proc/stat (USER_HZ jiffies, 10 ms), sampled every 5 ms by a
//     dedicated worker (sampler-worker.mjs) with the vCPU the renderer's and the GPU
//     process's main threads were on. Each row keeps its acquisition start and end
//     (t0, t1): its counters were read somewhere between them, so an interval is
//     taken at its widest (a.t0 to b.t1) for what lies outside the frame and for the
//     gap bound, and at its narrowest (a.t1 to b.t0) for the time it covers;
//   - an interval wholly inside the frame counts in full; a boundary interval
//     counts only what can't fit in its part outside the frame; an interval in
//     which a thread's row vCPU changed counts nothing for it (R3-1), nor one longer
//     than MAX_GAP_MS (a sampler gap), and rows further than MAX_GAP_MS from either
//     edge leave the frame unsampled;
//   - thread states are evidence only where they were observed (R4-1): each thread's
//     states come with coverage spans of successful polls no more than STATE_GAP_MS
//     apart; an interval outside one span (an observer outage, a read error, the run's
//     end) has unknown state, and unknown is ours. A state change is placed anywhere
//     between the poll before it and the poll that saw it, so a state counts for an
//     interval if it could have held at any time in it. Each state poll also reads the
//     thread's vCPU, so residency is checked at the poll period, not only at the rows;
//   - the renderer's vCPU counts only for time it was runnable on that vCPU throughout
//     (a sleeping thread's last-run vCPU says nothing about delay); the GPU process's
//     vCPU counts only while the renderer was in a futex wait throughout AND the GPU
//     main thread was runnable on that vCPU throughout (a futex alone names no
//     dependency; R4-1), never against renderer-side work; without observed states
//     neither counts;
//   - one jiffy is taken off the total (steal is charged at the next tick), and
//     it is capped at the time the samples cover;
//   - the canary must agree: what is excused is at most the canary's own stall
//     overlapping the frame (a VM pause stalls it too, on another vCPU).
// Classes (never excused on doubt):
//   host          excused time brings the frame within budget: the only excuse
//   host-stopped  a diagnostic label, judged ours (R4-1: VM-wide steal and CPU time
//                 prove no delayed critical-path thread): most of the VM provably
//                 stopped (per-vCPU inside steal, one jiffy off each, >= 50% of
//                 covered time × vCPUs), the canary stalled for half the frame or
//                 more, our two main threads within budget on CPU, and no evidence
//                 the GPU was busy ("GPU unknown" without GPU busy data)
//   mixed         steal, a canary stall, a migration, a gap or unknown state, but not
//                 enough proof: ours
//   clean         none of those: ours
//   unsampled     the rows don't cover the frame: ours
// Recorded runs from before raw rows were kept (r10, r12) can only be judged by
// `classifyLegacy`: aggregate steal over a span that includes both boundary
// intervals, an upper bound, never proof. Raw rows recorded before R4 (r13) carry
// change-only states with no coverage: their states are unknown, so ours.
export const BUDGET_MS = 34, JIFFY_MS = 10;
/** Longest sample interval trusted for a thread's attribution (the sampler runs every 5 ms). */
export const MAX_GAP_MS = 12;
/** Longest gap between a thread's successful state polls inside one coverage span (polled every 2 ms). */
export const STATE_GAP_MS = 6;
const CANARY_PERIOD_MS = 1;
/** Frames judged ours: the gate fails on a streaming frame in one of these. */
export const OURS = new Set(["host-stopped", "mixed", "clean", "unsampled"]);

/**
 * True when the thread's states were observed over all of [a, b] and every state it
 * could have been in then passes `ok`.
 * @param obs { states: [tEarliest, tLatest, state, syscall, vCPU][], cover: [start, end][] }:
 *   a state took effect somewhere in [tEarliest, tLatest] and held until the next took
 *   effect; `cover` spans are where polls succeeded no more than STATE_GAP_MS apart.
 */
export function observedThroughout(obs, a, b, ok) {
  if (!obs?.cover || !obs.states) return false;
  if (!obs.cover.some(([s, e]) => s <= a && b <= e)) return false;
  const st = obs.states;
  let seen = false;
  for (let i = 0; i < st.length; i++) {
    const from = st[i][0], to = i + 1 < st.length ? st[i + 1][1] : Infinity;
    if (from < b && to > a) { seen = true; if (!ok(st[i])) return false; }
  }
  return seen;
}
const runnableOn = (cpu) => ([, , st, , c]) => st === "R" && c === cpu;
const futexWait = ([, , st, w]) => st === "S" && w === "futex";
const t0Of = (r) => r.t0 ?? r.t, t1Of = (r) => r.t1 ?? r.t;

/**
 * @param frame   { e0, e1 } epoch ms
 * @param rows    sampler rows in time order: { t0, t1, run, grun, cpu, gpuCpu, steal: number[] }
 *                (epoch ms acquisition start and end, or one `t` for rows recorded before R4;
 *                renderer and GPU main-thread CPU ms; their vCPUs; every vCPU's steal in jiffies)
 * @param canary  the canary's late wakes: [startEpochMs, gapMs][]
 * @param threads { renderer, gpu }: each thread's observed states and coverage (see `observedThroughout`)
 * @param gpuBusy true/false when GPU busy time is known for the frame, undefined when not
 */
export function classifyFrame({ e0, e1 }, rows, canary = [], threads = {}, gpuBusy = undefined) {
  const gap = e1 - e0;
  const first = rows.findIndex((r) => t0Of(r) > e0) - 1, lastAfter = rows.findIndex((r) => t1Of(r) >= e1);
  if (first < 0 || lastAfter < 0 || lastAfter <= first || e0 - t0Of(rows[first]) > MAX_GAP_MS || t1Of(rows[lastAfter]) - e1 > MAX_GAP_MS)
    return { cause: "unsampled", remainderMs: round(gap) };
  const ncpu = rows[first].steal.length;
  let covered = 0, stolen = 0, vmStolen = 0, migrations = 0, gaps = 0, unknown = 0, stealSeen = false;
  for (let k = first; k < lastAfter; k++) {
    const a = rows[k], b = rows[k + 1];
    const wideA = t0Of(a), wideB = t1Of(b);
    const outside = Math.max(0, e0 - wideA) + Math.max(0, wideB - e1), lo = Math.max(wideA, e0), hi = Math.min(wideB, e1);
    covered += Math.max(0, Math.min(t0Of(b), e1) - Math.max(t1Of(a), e0));
    // The VM as a whole (the host-stopped label): residency doesn't matter, so a gap still counts, pro-rated.
    for (let c = 0; c < ncpu; c++) vmStolen += Math.max(0, (b.steal[c] - a.steal[c]) * JIFFY_MS - outside);
    if (b.steal[a.cpu] > a.steal[a.cpu] || (b.cpu !== a.cpu && b.steal[b.cpu] > a.steal[b.cpu])) stealSeen = true;
    // Uncertain for the threads: a migration or a sampler gap; no credit.
    if (a.cpu !== b.cpu) { migrations++; continue; }
    if (wideB - wideA > MAX_GAP_MS) { gaps++; continue; }
    let d = 0;
    if (observedThroughout(threads.renderer, lo, hi, runnableOn(a.cpu))) d = Math.max(0, (b.steal[a.cpu] - a.steal[a.cpu]) * JIFFY_MS - outside);
    else if (a.gpuCpu >= 0 && a.gpuCpu === b.gpuCpu && a.gpuCpu !== a.cpu && observedThroughout(threads.renderer, lo, hi, futexWait) &&
      observedThroughout(threads.gpu, lo, hi, runnableOn(a.gpuCpu)))
      d = Math.max(0, (b.steal[a.gpuCpu] - a.steal[a.gpuCpu]) * JIFFY_MS - outside);
    else if (!observedThroughout(threads.renderer, lo, hi, () => true)) unknown++;
    stolen += d;
  }
  const provableMs = Math.max(0, Math.min(stolen - JIFFY_MS, covered, gap));
  const canaryMs = canary.reduce((n, [t, g]) => n + Math.max(0, Math.min(e1, t + g) - Math.max(e0, t + CANARY_PERIOD_MS)), 0);
  const excusedMs = Math.min(provableMs, canaryMs), remainderMs = gap - excusedMs;
  const vmProvableMs = Math.max(0, vmStolen - ncpu * JIFFY_MS);
  const ourCpuMs = (rows[lastAfter].run - rows[first].run) + (rows[lastAfter].grun - rows[first].grun);
  const detail = { provableStolenMs: round(provableMs), canaryMs: round(canaryMs), excusedMs: round(excusedMs), remainderMs: round(remainderMs),
    coveredMs: round(covered), vmProvableMs: round(vmProvableMs), ourCpuMs: round(ourCpuMs), migrations, gaps, unknownState: unknown };
  if (excusedMs > 0 && remainderMs <= BUDGET_MS) return { cause: "host", ...detail };
  // A diagnostic label only: it stays ours (R4-1).
  if (vmProvableMs >= 0.5 * covered * ncpu && canaryMs >= 0.5 * gap && ourCpuMs <= BUDGET_MS && gpuBusy !== true)
    return { cause: "host-stopped", gpu: gpuBusy === false ? "idle" : "unknown", ...detail };
  return { cause: stealSeen || canaryMs > 0 || migrations > 0 || gaps > 0 || unknown > 0 ? "mixed" : "clean", ...detail };
}

/** A recorded long frame: by its raw rows when it has them, else the legacy rule (labelled). */
export function classify(l, ncpu) {
  // Raw rows from before R4 keep change-only states without coverage: no thread evidence.
  if (l.raw) return { ...classifyFrame(l.raw.window, l.raw.rows, l.raw.canary, l.raw.threads ?? {}), rule: l.raw.threads ? "provable" : "provable, states unobserved" };
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
  if (stolen > 10 && vmStopped && ourCpu <= BUDGET_MS) return { cause: "host-stopped", gpu: "unknown", remainderMs }; // a label: ours (R4-1)
  return { cause: stolen > 10 ? "mixed" : "clean", remainderMs };
}
const round = (x) => +x.toFixed(2);
