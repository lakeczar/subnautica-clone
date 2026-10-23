import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// An exclusive job's contention (TST-16, scripts/heavy/contention.mjs): judged
// on the job's own cgroup pressure and the host's steal, never on host-wide
// PSI, with every observed value recorded.
const C = await import(pathToFileURL(resolve("scripts/heavy/contention.mjs")).href);
const S = await import(pathToFileURL(resolve("scripts/heavy/state.mjs")).href);

const dir = mkdtempSync(join(tmpdir(), "contention-"));
test.after(() => rmSync(dir, { recursive: true, force: true }));

/** A fake job cgroup and host whose counters advance per 5 s window as given. */
function world(windows: { cpuWait?: number; memStall?: number; steal?: number; otherBusy?: number; jobCpu?: number; hostMemFull?: number; jobMajflt?: number; jobSwapIns?: number; hostSwapIn?: number }[], nproc = 8) {
  const cg = mkdtempSync(join(dir, "cg-"));
  let at = 0, cpuSome = 0, memSome = 0, memFull = 0, busy = 0, steal = 0, total = 0, jobUsec = 0, hostMemFull = 0, majflt = 0, swapIns = 0, pswpin = 0;
  const write = () => {
    writeFileSync(join(cg, "memory.stat"), `anon 1\npgmajfault ${majflt}\nworkingset_refault_anon ${swapIns}\n`);
    writeFileSync(join(cg, "cpu.pressure"), `some avg10=0.00 avg60=0.00 avg300=0.00 total=${cpuSome}\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0\n`);
    writeFileSync(join(cg, "memory.pressure"), `some avg10=0.00 avg60=0.00 avg300=0.00 total=${memSome}\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=${memFull}\n`);
    writeFileSync(join(cg, "cpu.stat"), `usage_usec ${jobUsec}\n`);
  };
  write();
  const s = C.contentionSampler({ jobCgroup: () => cg, nproc, now: () => at, host: { cpu: () => ({ busy, steal, total }), vm: () => ({ pswpin, pswpout: 0, pgmajfault: 0 }), observed: () => ({ load1: 2.5, cpuSomeAvg10: 0.5, memFullAvg10: hostMemFull }) } });
  s.sample();
  for (const w of windows) {
    const us = 5e6, jiffies = 5 * 100 * nproc; // 5 s, all CPUs
    at += 5000; cpuSome += (w.cpuWait ?? 0) / 100 * us; memSome += (w.memStall ?? 0) / 100 * us; memFull += (w.memStall ?? 0) / 200 * us;
    const jobJ = ((w.jobCpu ?? 1) * us) / 1e4; jobUsec += (w.jobCpu ?? 1) * us; // jobCpu: CPUs busy in the job
    busy += jobJ + ((w.otherBusy ?? 0) / 100) * jiffies; steal += ((w.steal ?? 0) / 100) * jiffies; total += jiffies;
    hostMemFull = w.hostMemFull ?? 0; majflt += w.jobMajflt ?? 0; swapIns += w.jobSwapIns ?? 0; pswpin += w.hostSwapIn ?? 0;
    write(); s.sample();
  }
  return s;
}

test("the CW-1 case: host memory 'full' high from another slice's throttling, the job itself unstalled: not disturbed, all of it recorded", () => {
  const r = world([{ cpuWait: 0.3, hostMemFull: 32 }, { cpuWait: 0.5, hostMemFull: 29 }, { cpuWait: 0.2 }]).finish();
  assert.equal(r.disturbed, false, JSON.stringify(r.reasons));
  assert.deepEqual(r.reasons, []);
  assert.deepEqual([r.job.cpuSomeWorstPct, r.job.memSomeWorstPct, r.host.memFullAvg10Max, r.memFullMax], [0.5, 0, 32, 32]);
  assert.equal(r.measuredS, 15);
});

test("the job waiting for a CPU, stalling on memory, hypervisor steal or a shared GPU: disturbed, each with its reason and value", () => {
  const cpu = world([{ cpuWait: 1 }, { cpuWait: 12 }, { cpuWait: 1 }]).finish();
  assert.equal(cpu.disturbed, true);
  assert.match(cpu.reasons.join(), /the job waited for a CPU 12% of its worst 5 s \(≥ 5%\)/);
  assert.equal(cpu.job.cpuSomePct, 4.67); // the whole run, recorded beside the worst window
  const mem = world([{ memStall: 3 }]).finish();
  assert.match(mem.reasons.join(), /stalled on memory 3% of its worst 5 s/);
  const steal = world([{ steal: 8 }]).finish();
  assert.match(steal.reasons.join(), /the hypervisor took 8% of the machine's CPU/);
  const gpu = world([{}]).finish({ gpuShared: [{ pid: 42, cmd: "chrome" }] });
  assert.match(gpu.reasons.join(), /GPU was shared outside the lease \(pid 42\)/);
});

test("CPU used outside the job is measured; just under each threshold is clean; thresholds come from config", () => {
  const r = world([{ otherBusy: 50, jobCpu: 2, cpuWait: 4.9, memStall: 0.9, steal: 4.9 }]).finish();
  assert.equal(r.disturbed, false, JSON.stringify(r.reasons));
  assert.equal(r.host.otherCpuPct, 50);
  const s = world([{ cpuWait: 3 }]);
  assert.equal(s.finish().disturbed, false);
  const cg = mkdtempSync(join(dir, "cg-"));
  writeFileSync(join(cg, "cpu.pressure"), "some avg10=0 avg60=0 avg300=0 total=0\n");
  writeFileSync(join(cg, "memory.pressure"), "some avg10=0 avg60=0 avg300=0 total=0\nfull avg10=0 avg60=0 avg300=0 total=0\n");
  let at = 0;
  const t = C.contentionSampler({ jobCgroup: () => cg, nproc: 8, thresholds: { jobCpuSomePct: 2 }, now: () => at, host: { cpu: () => ({ busy: 0, steal: 0, total: at }), observed: () => ({ load1: 0, cpuSomeAvg10: 0, memFullAvg10: 0 }) } });
  t.sample(); at = 5000; writeFileSync(join(cg, "cpu.pressure"), "some avg10=0 avg60=0 avg300=0 total=150000\n"); t.sample();
  assert.equal(t.finish().disturbed, true, "3% ≥ a configured 2%");
});

test("swap (fleet's audit): the job's own major faults or swap-ins in a window disturb it; host swap alone is recorded", () => {
  const maj = world([{}, { jobMajflt: 3 }, {}]).finish();
  assert.equal(maj.disturbed, true);
  assert.match(maj.reasons.join(), /the job took 3 major faults and 0 swap-ins in its worst 5 s/);
  assert.deepEqual([maj.job.majorFaults, maj.job.majorFaultsWorst], [3, 3]);
  const sw = world([{ jobSwapIns: 40 }]).finish();
  assert.match(sw.reasons.join(), /0 major faults and 40 swap-ins/);
  const host = world([{ hostSwapIn: 500 }, { hostSwapIn: 20 }]).finish();
  assert.equal(host.disturbed, false, JSON.stringify(host.reasons));
  assert.deepEqual([host.host.swapInPages, host.host.swapInWorst], [520, 500]);
});

test("unmeasured is never clean: no job cgroup, or one read once only, is disturbed with that reason", () => {
  const none = C.contentionSampler({ jobCgroup: () => null, nproc: 8 });
  none.sample(); none.sample();
  const r = none.finish();
  assert.deepEqual([r.disturbed, r.job, r.measuredS], [true, null, 0]);
  assert.match(r.reasons[0], /could not be measured/);
});

test("the light slice: production clamps siltwake-light.slice; private state only a slice it names", () => {
  assert.equal(S.loadConfig({ SILTWAKE_SCHED_DIR: "/work/tmp/siltwake-sched" }).lightSlice, "siltwake-light.slice");
  assert.equal(S.loadConfig({ SILTWAKE_SCHED_DIR: join(dir, "private") }).lightSlice, null);
  assert.equal(S.loadConfig({ SILTWAKE_SCHED_DIR: join(dir, "private"), SILTWAKE_SCHED_LIGHT_SLICE: "x-light.slice" }).lightSlice, "x-light.slice");
});
