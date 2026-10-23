import test from "node:test";
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

// An exclusive job's contention (TST-16, scripts/heavy/contention.mjs): judged
// on the job's own cgroup, steal and swap, never on host-wide PSI; every
// observed delta counts, and missing coverage is never clean (R1-F4).
const C = await import(pathToFileURL(resolve("scripts/heavy/contention.mjs")).href);
const S = await import(pathToFileURL(resolve("scripts/heavy/state.mjs")).href);

type Step = { s?: number; cpuWait?: number; memStall?: number; steal?: number; otherBusy?: number; jobCpu?: number; majflt?: number; swapIns?: number; hostSwapIn?: number; unreadable?: boolean };
/** Cumulative points from per-step deltas (s seconds each, default 1). */
function series(steps: Step[], nproc = 8) {
  let t = 1_000_000, cpu = 0, mem = 0, busy = 0, steal = 0, total = 0, usec = 0, maj = 0, sw = 0, pswpin = 0;
  const point = (unreadable = false) => ({ t, cpu: unreadable ? null : { some: cpu, full: 0 }, mem: unreadable ? null : { some: mem, full: mem / 2 }, jobMajflt: unreadable ? null : maj, jobSwapIns: unreadable ? null : sw,
    jobUsec: usec as number | null, h: { busy, steal, total }, vm: { pswpin, pswpout: 0, pgmajfault: 0 } });
  const pts = [point()];
  for (const w of steps) {
    const sec = w.s ?? 1, us = sec * 1e6, j = sec * 100 * nproc;
    t += sec * 1000; cpu += ((w.cpuWait ?? 0) / 100) * us; mem += ((w.memStall ?? 0) / 100) * us;
    usec += (w.jobCpu ?? 1) * us; busy += ((w.jobCpu ?? 1) * us) / 1e4 + ((w.otherBusy ?? 0) / 100) * j; steal += ((w.steal ?? 0) / 100) * j; total += j;
    maj += w.majflt ?? 0; sw += w.swapIns ?? 0; pswpin += w.hostSwapIn ?? 0;
    pts.push(point(w.unreadable));
  }
  return pts;
}
const judge = (pts: ReturnType<typeof series>, extra = {}) => C.judge({ start: pts[0], end: pts.at(-1), points: pts.slice(1, -1), nproc: 8, ...extra });
const quiet = (n: number, w: Step = {}) => Array.from({ length: n }, () => ({ cpuWait: 0.2, ...w }));

test("the CW-1 case: a quiet job is clean, whatever the host's memory 'full' did; everything is recorded", () => {
  const r = judge(series(quiet(15)), { observed: { load1Max: 2.5, cpuSomeAvg10Max: 0.5, memFullAvg10Max: 32 } });
  assert.deepEqual([r.disturbed, r.measured, r.reasons], [false, true, []]);
  assert.deepEqual([r.job.cpuSomeWorstPct, r.host.memFullAvg10Max, r.memFullMax, r.measuredS, r.windows.length], [0.2, 32, 32, 15, 3]);
});

test("the job waiting for a CPU, stalling on memory, taking major faults or swap-ins, steal, a shared GPU: each disturbs it, with its value", () => {
  const cpu = judge(series([...quiet(5), ...quiet(5, { cpuWait: 12 }), ...quiet(5)]));
  assert.match(cpu.reasons.join(), /the job waited for a CPU 12% of its worst window \(≥ 5%\)/);
  assert.equal(cpu.job.cpuSomePct, 4.13);
  assert.match(judge(series(quiet(5, { memStall: 3 }))).reasons.join(), /stalled on memory 3% of its worst window/);
  assert.match(judge(series([...quiet(5), { majflt: 2 }, ...quiet(4)])).reasons.join(), /took 2 major faults and 0 swap-ins/);
  assert.match(judge(series(quiet(5, { swapIns: 8 }))).reasons.join(), /0 major faults and 40 swap-ins/);
  assert.match(judge(series(quiet(5, { steal: 8 }))).reasons.join(), /the hypervisor took 8% of the machine's CPU/);
  assert.match(judge(series(quiet(5)), { gpuShared: [{ pid: 42, cmd: "chrome" }] }).reasons.join(), /GPU was shared outside the lease \(pid 42\)/);
  const host = judge(series(quiet(10, { hostSwapIn: 50, otherBusy: 50 })));
  assert.equal(host.disturbed, false, "host swap and other CPU are recorded, not judged");
  assert.deepEqual([host.host.swapInPages, host.host.otherCpuPct], [500, 50]);
});

test("R1-F4: every observed delta counts: a short tail with CPU wait is merged into the last window", () => {
  // The reviewer's probe: clean to 5 s, then 900 ms of CPU wait in the 0.9 s tail.
  const r = judge(series([{ s: 5, cpuWait: 0 }, { s: 0.9, cpuWait: 100 }]));
  assert.equal(r.disturbed, true, JSON.stringify(r));
  assert.ok(r.job.cpuSomeWorstPct >= 15, `${r.job.cpuSomeWorstPct}`);
  assert.equal(r.measuredS, 5.9);
});

test("R1-F4: missing coverage is never clean: unreadable counters for a stretch, no baseline, no final counters, recovery", () => {
  // The reviewer's probe: clean to 5 s, then memory pressure unreadable to the end.
  const r = judge(series([...quiet(5), ...quiet(10, { unreadable: true })]));
  assert.equal(r.disturbed, true);
  assert.match(r.reasons.join(), /unmeasured: no final counters from before the scope ended; no readable counters for/);
  const s = series(quiet(5));
  assert.match(C.judge({ start: null, end: s.at(-1), points: s.slice(0, -1), nproc: 8 }).reasons.join(), /no baseline from before the payload started/);
  assert.match(C.judge({ start: s[0], end: null, points: s.slice(1), nproc: 8 }).reasons.join(), /no final counters/);
  assert.match(judge(series([...quiet(3), { s: 6 }, ...quiet(3)])).reasons.join(), /no readable counters for 6 s \(1 gap\(s\) over 3 s\)/);
  const rec = C.unmeasuredContext("recovered");
  assert.deepEqual([rec.disturbed, rec.measured], [true, false]);
});

test("a run that didn't get the exclusive slice's CPU priority is not boosted evidence: DISTURBED with that reason", () => {
  const off = judge(series(quiet(10)), { boost: { slice: "x.slice", status: "unavailable", why: "x.slice is not installed (not-found)" } });
  assert.equal(off.disturbed, true);
  assert.match(off.reasons.join(), /the job didn't run in the boosted slice x\.slice \(x\.slice is not installed \(not-found\)\): not boosted evidence/);
  assert.equal(judge(series(quiet(10)), { boost: { slice: "x.slice", weight: 10000, status: "applied" } }).disturbed, false);
});

test("unavailable counters stay null, never zero", () => {
  const s = series(quiet(5));
  for (const p of s) p.jobUsec = null;
  const r = judge(s);
  assert.equal(r.host.otherCpuPct, null);
  assert.equal(r.disturbed, false);
});

test("scope-run.sh's snapshot format parses; the exclusive slice: production uses siltwake_exclusive.slice, private state only one it names", () => {
  const p = C.parseCounters("uptime 58550.80\ncpu_some 507557988\ncpu_full 223264398\nmem_some 1552\nmem_full 1466\njob_swapins 0\njob_majflt 1350\njob_usec 43540094850\nhost_stat 11321318 4 1539240 33672701 11869 0 678844 128739 0 0\npswpin 123056\npswpout 236994\npgmajfault 102077\n");
  assert.deepEqual([p.t, p.cpu.some, p.mem.full, p.jobMajflt, p.jobSwapIns, p.h.steal, p.vm.pswpin], [58550800, 507557988, 1466, 1350, 0, 128739, 123056]);
  assert.equal(C.parseCounters("garbage"), null);
  assert.equal(S.loadConfig({ SILTWAKE_SCHED_DIR: "/work/tmp/siltwake-sched" }).exclusiveSlice, "siltwake_exclusive.slice");
  assert.equal(S.loadConfig({ SILTWAKE_SCHED_DIR: join(tmpdir(), "private-x") }).exclusiveSlice, null);
  assert.equal(S.loadConfig({ SILTWAKE_SCHED_DIR: join(tmpdir(), "private-x"), SILTWAKE_SCHED_EXCLUSIVE_SLICE: "x.slice" }).exclusiveSlice, "x.slice");
});
