// Contention around an exclusive job (TST-16): whether something disturbed
// the measurement, judged on the job's own cgroup, and the light-work clamp.
//
// The old label used the host's /proc/pressure (cpu "some", memory "full"),
// the maximum of avg10 sampled every 15 s. Those count any task on the
// machine: a builder's test held at its own slice's MemoryHigh stalls on
// memory while the game idles between frames, and memory "full" rises with no
// effect on the game at all. That is how a quiet run got labelled DISTURBED.
//
// Now the run is judged from the job scope's own cpu.pressure and
// memory.pressure: the cumulative stall counters (microseconds), read every
// windowS, so nothing between samples is missed. The worst window and the
// whole run are both recorded. Also measured, from /proc/stat: hypervisor
// steal (a VM's vCPU taken away underneath the guest, invisible to PSI) and
// the CPU used outside the job. Host load and PSI stay as observations only.
//
// Swap (fleet's audit: the guest swaps, and a swap-in stalls 50–100 ms without
// showing as steal): /proc/vmstat pswpin, pswpout and pgmajfault, and the
// job cgroup's own memory.stat pgmajfault and workingset_refault_anon (its
// swap-ins: anonymous pages it had to read back; the kernel keeps no
// per-cgroup pswpin). A job with a warm page cache takes no major faults, so
// any is a sign its memory or cache was evicted under pressure.
//
// DISTURBED, each with its reason in `reasons`:
//   job CPU wait   the job's tasks waited for a CPU ≥ jobCpuSomePct of a window
//   job memory     the job's tasks stalled on memory ≥ jobMemSomePct of a window
//   job swap       the job's cgroup took ≥ jobMajorFaults major faults or
//                  ≥ jobSwapIns swap-ins in a window
//   steal          the hypervisor took ≥ stealPct of the machine's CPU in a window
//   GPU            a GPU client outside the lease shared the GPU (holder.mjs)
//   unmeasured     the job's own counters could not be read (never taken as clean)
// Thresholds: config.json `disturbed` over DISTURBED_DEFAULTS.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

export const DISTURBED_DEFAULTS = Object.freeze({ jobCpuSomePct: 5, jobMemSomePct: 1, jobMajorFaults: 1, jobSwapIns: 1, stealPct: 5 });
const HZ = 100; // USER_HZ: /proc/stat's unit is 10 ms on Linux

const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } };
/** A pressure file's cumulative stall totals in µs: { some, full }, or null. */
export function pressureTotals(cgroup, resource) {
  const text = cgroup ? read(`${cgroup}/${resource}.pressure`) : read(`/proc/pressure/${resource}`);
  if (!text) return null;
  const total = (kind) => Number(new RegExp(`^${kind} .*total=(\\d+)`, "m").exec(text)?.[1] ?? NaN);
  const some = total("some"), full = total("full");
  return Number.isFinite(some) ? { some, full: Number.isFinite(full) ? full : 0 } : null;
}
/** The host's avg10, as the old label read it (kept as an observation). */
function avg10(resource, kind) {
  return Number(new RegExp(`^${kind} avg10=([\\d.]+)`, "m").exec(read(`/proc/pressure/${resource}`) ?? "")?.[1] ?? 0);
}
/** /proc/stat's aggregate line, in jiffies: { busy, steal, total }. */
export function hostCpu() {
  const f = (read("/proc/stat") ?? "").split("\n")[0].trim().split(/\s+/).slice(1).map(Number);
  const [user = 0, nice = 0, system = 0, idle = 0, iowait = 0, irq = 0, softirq = 0, steal = 0] = f;
  return { busy: user + nice + system + irq + softirq, steal, total: user + nice + system + idle + iowait + irq + softirq + steal };
}
/** /proc/vmstat's swap and major-fault counters (pages, faults). */
export function hostVm() {
  const text = read("/proc/vmstat") ?? "", n = (k) => Number(new RegExp(`^${k} (\\d+)`, "m").exec(text)?.[1] ?? 0);
  return { pswpin: n("pswpin"), pswpout: n("pswpout"), pgmajfault: n("pgmajfault") };
}
/** A cgroup's major faults and swap-ins (memory.stat, its subtree included), or null. */
export function cgroupFaults(cgroup) {
  const text = cgroup ? read(`${cgroup}/memory.stat`) : null;
  if (!text) return null;
  const n = (k) => Number(new RegExp(`^${k} (\\d+)`, "m").exec(text)?.[1] ?? NaN);
  const majflt = n("pgmajfault"), swapIns = n("workingset_refault_anon");
  return Number.isFinite(majflt) ? { majflt, swapIns: Number.isFinite(swapIns) ? swapIns : 0 } : null;
}
/** A cgroup's CPU time in µs (cpu.stat usage_usec), or null. */
export function cgroupCpuUsec(cgroup) {
  const v = /^usage_usec (\d+)/m.exec((cgroup && read(`${cgroup}/cpu.stat`)) ?? "")?.[1];
  return v == null ? null : Number(v);
}

/** The host's readings (tests inject their own): /proc/stat, and the old label's observations. */
const defaultHost = {
  cpu: hostCpu,
  vm: hostVm,
  observed: () => ({ load1: Number((read("/proc/loadavg") ?? "0").split(" ")[0]), cpuSomeAvg10: avg10("cpu", "some"), memFullAvg10: avg10("memory", "full") }),
};
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 10000) / 100 : 0);

/**
 * The exclusive job's contention: call sample() every second from launch;
 * windows of windowS are judged from the moment the job's cgroup is known. jobCgroup(): the job scope's cgroup path or null (written
 * by scope-run.sh once the scope runs). lightCgroup: the light slice's.
 * finish({ gpuShared }) returns the context recorded in the result.
 */
export function contentionSampler({ jobCgroup, lightCgroup = null, nproc, thresholds = {}, windowS = 5, now = () => Date.now(), host: hostRead = defaultHost }) {
  const t = { ...DISTURBED_DEFAULTS, ...thresholds };
  let base = null, prev = null, last = null, samples = 0;
  const worst = { cpuSome: 0, memSome: 0, memFull: 0, steal: 0, other: 0, jobMajflt: 0, jobSwapIns: 0, swapIn: 0, swapOut: 0, majflt: 0 };
  const host = { load1Max: 0, cpuSomeAvg10Max: 0, memFullAvg10Max: 0 };
  const take = () => {
    const cg = jobCgroup();
    const cpu = pressureTotals(cg, "cpu"), mem = pressureTotals(cg, "memory"), h = hostRead.cpu();
    if (!cg || !cpu || !mem) return null;
    return { at: now(), cpu, mem, h, vm: (hostRead.vm ?? hostVm)(), faults: cgroupFaults(cg) ?? { majflt: 0, swapIns: 0 }, jobUsec: cgroupCpuUsec(cg) ?? 0, lightUsec: cgroupCpuUsec(lightCgroup) };
  };
  const between = (a, b) => {
    const dtUs = (b.at - a.at) * 1000, dJ = b.h.total - a.h.total;
    return {
      cpuSome: pct(b.cpu.some - a.cpu.some, dtUs), memSome: pct(b.mem.some - a.mem.some, dtUs), memFull: pct(b.mem.full - a.mem.full, dtUs),
      steal: pct(b.h.steal - a.h.steal, dJ),
      // CPU busy outside the job, as a share of the whole machine.
      other: pct(Math.max(0, (b.h.busy - a.h.busy) * (1e6 / HZ) - (b.jobUsec - a.jobUsec)), dtUs * nproc),
      // Counts (faults, pages), not shares.
      jobMajflt: b.faults.majflt - a.faults.majflt, jobSwapIns: b.faults.swapIns - a.faults.swapIns,
      swapIn: b.vm.pswpin - a.vm.pswpin, swapOut: b.vm.pswpout - a.vm.pswpout, majflt: b.vm.pgmajfault - a.vm.pgmajfault,
    };
  };
  function sample() {
    const o = hostRead.observed();
    host.load1Max = Math.max(host.load1Max, o.load1);
    host.cpuSomeAvg10Max = Math.max(host.cpuSomeAvg10Max, o.cpuSomeAvg10);
    host.memFullAvg10Max = Math.max(host.memFullAvg10Max, o.memFullAvg10);
    const s = take();
    if (!s) return;
    samples++;
    last = s;
    if (!base) { base = prev = s; return; }
    if (s.at - prev.at >= windowS * 1000) window(s);
  }
  const window = (s) => {
    const w = between(prev, s);
    for (const k of Object.keys(worst)) worst[k] = Math.max(worst[k], w[k]);
    prev = s;
  };
  function finish({ gpuShared = [], light = null } = {}) {
    sample();
    // The last, partial window counts if it is at least a second long (a short job is one window).
    if (last && last !== prev && last.at - prev.at >= 1000) window(last);
    const whole = base && prev !== base ? between(base, prev) : null;
    const reasons = [];
    // Unmeasured is never clean: without the job's own counters the run can't be shown undisturbed.
    if (!whole) reasons.push("the job's own contention could not be measured (its cgroup's pressure was not read twice a second apart)");
    else {
      if (worst.cpuSome >= t.jobCpuSomePct) reasons.push(`the job waited for a CPU ${worst.cpuSome}% of its worst ${windowS} s (≥ ${t.jobCpuSomePct}%)`);
      if (worst.memSome >= t.jobMemSomePct) reasons.push(`the job stalled on memory ${worst.memSome}% of its worst ${windowS} s (≥ ${t.jobMemSomePct}%)`);
      if (worst.jobMajflt >= t.jobMajorFaults || worst.jobSwapIns >= t.jobSwapIns)
        reasons.push(`the job took ${worst.jobMajflt} major faults and ${worst.jobSwapIns} swap-ins in its worst ${windowS} s (≥ ${t.jobMajorFaults} or ≥ ${t.jobSwapIns}): its memory or cache was read back from disk`);
      if (worst.steal >= t.stealPct) reasons.push(`the hypervisor took ${worst.steal}% of the machine's CPU in the worst ${windowS} s (≥ ${t.stealPct}%)`);
    }
    if (gpuShared.length) reasons.push(`the GPU was shared outside the lease (pid ${gpuShared.map((u) => u.pid).join(", ")})`);
    const lightS = base?.lightUsec != null && prev?.lightUsec != null ? Math.round((prev.lightUsec - base.lightUsec) / 1e4) / 100 : null;
    return {
      v: 2, samples, windowS, measuredS: whole ? Math.round((prev.at - base.at) / 100) / 10 : 0,
      job: whole ? { cpuSomePct: whole.cpuSome, cpuSomeWorstPct: worst.cpuSome, memSomePct: whole.memSome, memSomeWorstPct: worst.memSome, memFullPct: whole.memFull, memFullWorstPct: worst.memFull,
        majorFaults: whole.jobMajflt, majorFaultsWorst: worst.jobMajflt, swapIns: whole.jobSwapIns, swapInsWorst: worst.jobSwapIns } : null,
      host: { ...host, stealPct: whole?.steal ?? null, stealWorstPct: whole ? worst.steal : null, otherCpuPct: whole?.other ?? null, otherCpuWorstPct: whole ? worst.other : null,
        swapInPages: whole?.swapIn ?? null, swapInWorst: whole ? worst.swapIn : null, swapOutPages: whole?.swapOut ?? null, swapOutWorst: whole ? worst.swapOut : null,
        majorFaults: whole?.majflt ?? null, majorFaultsWorst: whole ? worst.majflt : null },
      light: light ? { ...light, cpuS: lightS } : null,
      thresholds: t, disturbed: reasons.length > 0, reasons,
      // SCHED-1's fields (host values), for older readers.
      load1Max: host.load1Max, cpuSomeMax: host.cpuSomeAvg10Max, memFullMax: host.memFullAvg10Max,
    };
  }
  return { sample, finish };
}

/**
 * Clamps (or releases) the light-work slice: `siltwake-light.slice`, where
 * scripts/light-run.sh puts builders' npm test, typecheck and build. While an
 * exclusive job runs, that slice gets cpuQuotaPct of one CPU and idle weight
 * (cgroup cpu.idle), so outside light work can't take the exclusive job's CPU.
 * Runtime properties only. Returns { slice, clamped, cpuQuotaPct, ok, error }.
 */
export function lightClamp(cfg, on) {
  const quota = cfg.lightClampCpuPct ?? 100;
  const props = on ? [`CPUQuota=${quota}%`, "CPUWeight=idle"] : ["CPUQuota=", "CPUWeight="];
  const r = spawnSync("systemctl", ["--user", "set-property", "--runtime", cfg.lightSlice, ...props], { encoding: "utf8", timeout: 15000 });
  return { slice: cfg.lightSlice, clamped: on, cpuQuotaPct: on ? quota : null, ok: r.status === 0, error: r.status === 0 ? null : (r.stderr || r.error?.message || `exit ${r.status}`).trim().slice(0, 200) };
}
