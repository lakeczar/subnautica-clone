// SIM-PERF-1 (review R1-F1): what decides a slow simulation step in the browser.
//
// A step runs synchronously on the renderer's main thread, so only time stolen from the
// vCPU that thread was on can excuse it, and only time that provably fell inside the step.
// What counts as provable:
//   - per-vCPU steal from /proc/stat (USER_HZ jiffies, 10 ms each), sampled every 5 ms with
//     the vCPU the renderer's main thread was on; a row read between t0 and t1 (CW-1 R4's
//     sampler worker) is taken at its widest for what lies outside and its narrowest for cover;
//   - an interval wholly inside the step counts its steal on that vCPU in full; a boundary
//     interval counts only what can't fit in its part outside the step; an interval in
//     which the thread changed vCPU counts nothing (uncertain);
//   - one jiffy is then taken off for accounting lag and quantisation (steal is charged at
//     the next tick, so a jiffy seen inside may belong to before the step), and the total
//     is capped at the time the samples cover;
//   - the canary is required: a VM pause also stalls the canary thread on another vCPU, so
//     the excused time is at most the canary's own stall overlapping the step.
// Verdicts (never "host" on doubt):
//   host        excused time brings the step within budget
//   unresolved  some steal, canary stall or migration, but not enough proof: neither cleared nor ours
//   ours        full coverage, no steal on the thread's vCPU in or around it, no canary stall
//   unsampled   the samples don't cover the step
export const STEP_BUDGET_MS = 8;
export const JIFFY_MS = 10;
/** The canary sleeps 1 ms between wakes: a recorded gap of g ms is g − 1 ms of stall. */
const CANARY_PERIOD_MS = 1;

/**
 * @param step   { e0, e1 } epoch ms (the step's start and end)
 * @param rows   sampler rows in time order: { t0, t1, cpu, steal: number[] } (epoch ms acquisition
 *               start and end, or one `t` for rows recorded before CW-1 R4; the renderer
 *               main thread's vCPU at the sample, every vCPU's steal in jiffies)
 * @param canary the canary's late wakes: [startEpochMs, gapMs][]
 */
export function classifyStep({ e0, e1 }, rows, canary = []) {
  const ms = e1 - e0;
  const first = rows.findIndex((r) => t0Of(r) > e0) - 1, lastAfter = rows.findIndex((r) => t1Of(r) >= e1);
  if (first < 0 || lastAfter <= first) return { cause: "unsampled", ms: round(ms), remainderMs: round(ms) };
  let covered = 0, stolen = 0, migrations = 0, stealSeen = false;
  for (let k = first; k < lastAfter; k++) {
    const a = rows[k], b = rows[k + 1];
    if (a.cpu !== b.cpu) {
      migrations++;
      if ((b.steal[a.cpu] - a.steal[a.cpu]) > 0 || (b.steal[b.cpu] - a.steal[b.cpu]) > 0) stealSeen = true;
      continue;
    }
    const d = (b.steal[a.cpu] - a.steal[a.cpu]) * JIFFY_MS;
    if (d > 0) stealSeen = true;
    const outside = Math.max(0, e0 - t0Of(a)) + Math.max(0, t1Of(b) - e1);
    covered += Math.max(0, Math.min(t0Of(b), e1) - Math.max(t1Of(a), e0));
    stolen += Math.max(0, d - outside);
  }
  // Steal on the thread's vCPU in the intervals just around the step also argues against "ours".
  for (const k of [first - 1, lastAfter]) {
    const a = rows[k], b = rows[k + 1];
    if (a && b && a.cpu === rows[first].cpu && (b.steal[a.cpu] - a.steal[a.cpu]) > 0) stealSeen = true;
  }
  const provableMs = Math.max(0, Math.min(stolen - JIFFY_MS, covered, ms));
  const canaryMs = canary.reduce((n, [t, g]) => n + Math.max(0, Math.min(e1, t + g) - Math.max(e0, t + CANARY_PERIOD_MS)), 0);
  const excusedMs = Math.min(provableMs, canaryMs), remainderMs = ms - excusedMs;
  const cause = remainderMs <= STEP_BUDGET_MS && excusedMs > 0 ? "host"
    : stealSeen || canaryMs > 0 || migrations > 0 ? "unresolved" : "ours";
  return { cause, ms: round(ms), provableStolenMs: round(provableMs), canaryMs: round(canaryMs), excusedMs: round(excusedMs),
    remainderMs: round(remainderMs), coveredMs: round(covered), migrations };
}
const round = (x) => +x.toFixed(2);
const t0Of = (r) => r.t0 ?? r.t, t1Of = (r) => r.t1 ?? r.t;
