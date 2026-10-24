// CW-1: what decides a long frame (shared by traverse.mjs, summarize.mjs and the
// evidence table, so recorded runs and new ones are judged alike).
//
// The time stolen from the renderer or GPU process main thread (per 5 ms
// interval, on the vCPU each was on, the larger counted once) is subtracted
// from the gap and the remainder judged against the budget. Steal never
// excuses a frame by itself.
//   host          stolen time, and the remainder within budget
//   host-stopped  most of the VM stopped across the frame, our two main threads
//                 within budget on CPU, and no evidence the GPU was busy:
//                 (a) steal over every vCPU >= 50% of span × vCPUs;
//                 (b) renderer + GPU-process main-thread CPU <= budget;
//                 (c) no GPU busy evidence. A frame whose threads are off-CPU
//                 can still be ours (a GPU-bound frame waits in a fence or
//                 futex with little CPU), so without GPU data it is reported
//                 "host-stopped (GPU unknown)", never silently.
//   mixed         stolen time, and the remainder still over budget: ours
//   clean         no steal above the 10 ms jiffy, over budget: ours
//   unsampled     no thread samples: cannot be cleared, ours
export const BUDGET_MS = 34;

/** The frame's class from its recorded thread sample. `ncpu`: the machine's
 * vCPUs. `gpuBusy`: true/false when GPU busy time is known for the frame,
 * undefined when it is not. */
export function classify(l, ncpu, gpuBusy = undefined) {
  const t = l.thread;
  if (!t) return { cause: "unsampled", remainderMs: l.gap };
  const stolen = Math.min(l.gap, t.stolenMs ?? 0), remainderMs = +(l.gap - stolen).toFixed(1);
  if (stolen > 10 && remainderMs <= BUDGET_MS) return { cause: "host", remainderMs };
  const vmStopped = ncpu > 0 && t.stealAllCpusMs >= 0.5 * t.spanMs * ncpu;
  const ourCpu = (t.onCpuMs ?? 0) + (t.gpuOnCpuMs ?? 0);
  if (stolen > 10 && vmStopped && ourCpu <= BUDGET_MS && gpuBusy !== true)
    return { cause: "host-stopped", gpu: gpuBusy === false ? "idle" : "unknown", remainderMs, ourCpuMs: +ourCpu.toFixed(1) };
  return { cause: stolen > 10 ? "mixed" : "clean", remainderMs };
}

/** Frames judged ours: the gate fails on a streaming frame in one of these. */
export const OURS = new Set(["mixed", "clean", "unsampled"]);
