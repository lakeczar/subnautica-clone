// Contention around an exclusive job (TST-16): whether something disturbed
// the measurement, judged on the job's own cgroup, and the CPU priority the
// job gets while it runs.
//
// The old label used the host's /proc/pressure (cpu "some", memory "full"),
// the maximum of avg10 sampled every 15 s. Those count any task on the
// machine: a builder's test held at its own slice's MemoryHigh stalls on
// memory while the game idles between frames, and memory "full" rises with no
// effect on the game at all. That is how a quiet run got labelled DISTURBED.
//
// Measurement (R1-F4). The job's own cgroup counters: cpu.pressure and
// memory.pressure stall totals (µs), memory.stat pgmajfault and
// workingset_refault_anon (its swap-ins), cpu.stat usage; and the host's
// /proc/stat (steal, CPU busy outside the job) and /proc/vmstat (swap,
// major faults). scope-run.sh snapshots them just before the payload starts
// and just after it ends, before the scope goes; the holder reads them every
// second between. Every point carries /proc/uptime's clock (monotonic, the
// same in every process). Windows are judged from windowS apart, the last,
// shorter stretch merged into the window before it, so every observed delta
// counts. A missing baseline or final snapshot, or a gap between points over
// gapS, is missing coverage, and a run with missing coverage is never clean.
// Unreadable counters are null, never zero. Raw points go to
// <jobdir>/contention.jsonl and the windows into the context, for audit.
//
// DISTURBED, each with its reason in `reasons`:
//   job CPU wait   the job's tasks waited for a CPU ≥ jobCpuSomePct of a window
//   job memory     the job's tasks stalled on memory ≥ jobMemSomePct of a window
//   job swap       the job's cgroup took ≥ jobMajorFaults major faults or
//                  ≥ jobSwapIns swap-ins in a window (its memory or cache was
//                  read back from disk; the guest swaps, fleet's audit)
//   steal          the hypervisor took ≥ stealPct of the machine's CPU in a window
//   GPU            a GPU client outside the lease shared the GPU (holder.mjs)
//   unmeasured     coverage was missing (above), or the job was recovered
//   boost          the job didn't run in the boosted exclusive slice (below)
// Thresholds: config.json `disturbed` over DISTURBED_DEFAULTS.
//
// Priority (R4 redesign; nothing is set at runtime). Exclusive jobs run in
// their own top-level slice, siltwake_exclusive.slice, whose CPUWeight is
// fixed in its unit file (install.sh writes it once, with the heavy slice's
// memory, swap and CPU caps). CPU is shared between top-level user groups by
// weight; app.slice, where T3 runs every agent and its tools, has 100.
// Measured (TST-16.md): a probe pinned to one CPU against four app.slice
// threads waited 14–21% at weight 100, 0% at 10000. The priority exists only
// while an exclusive job's processes are in that slice: nothing to apply,
// reset, journal or hand over, and older versions simply never use it. The
// name has no dash, because a dash would nest it under siltwake.slice, where
// its weight would compete only with its siblings. A job that didn't run there
// (the slice missing or not as configured) is DISTURBED: not boosted evidence.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

export const DISTURBED_DEFAULTS = Object.freeze({ jobCpuSomePct: 5, jobMemSomePct: 1, jobMajorFaults: 1, jobSwapIns: 1, stealPct: 5 });
const HZ = 100; // USER_HZ: /proc/stat's unit is 10 ms on Linux

const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } };
const num = (text, re) => { const v = re.exec(text ?? "")?.[1]; return v == null ? null : Number(v); };
/** /proc/uptime in ms: monotonic, and the same clock in every process (scope-run.sh's too). */
export function uptimeMs() { return Math.round(Number((read("/proc/uptime") ?? "0").split(" ")[0]) * 1000); }

/** The host's /proc/stat aggregate line, in jiffies, from its numbers. */
function statLine(fields) {
  const [user = 0, nice = 0, system = 0, idle = 0, iowait = 0, irq = 0, softirq = 0, steal = 0] = fields;
  return { busy: user + nice + system + irq + softirq, steal, total: user + nice + system + idle + iowait + irq + softirq + steal };
}
/** /proc/stat's aggregate line: { busy, steal, total }. */
export function hostCpu() { return statLine((read("/proc/stat") ?? "").split("\n")[0].trim().split(/\s+/).slice(1).map(Number)); }
/** /proc/vmstat's swap and major-fault counters. */
export function hostVm() {
  const t = read("/proc/vmstat");
  return { pswpin: num(t, /^pswpin (\d+)/m), pswpout: num(t, /^pswpout (\d+)/m), pgmajfault: num(t, /^pgmajfault (\d+)/m) };
}
/** A pressure file's cumulative stall totals in µs: { some, full }, or null. */
export function pressureTotals(cgroup, resource) {
  const t = cgroup ? read(`${cgroup}/${resource}.pressure`) : read(`/proc/pressure/${resource}`);
  const some = num(t, /^some .*total=(\d+)/m);
  return some == null ? null : { some, full: num(t, /^full .*total=(\d+)/m) };
}
/** A cgroup's CPU time in µs (cpu.stat usage_usec), or null. */
export function cgroupCpuUsec(cgroup) { return cgroup ? num(read(`${cgroup}/cpu.stat`), /^usage_usec (\d+)/m) : null; }

/** One point: the job cgroup's counters and the host's, now. Unreadable parts are null. */
export function snapshotNow(cgroup, { host = { cpu: hostCpu, vm: hostVm }, now = uptimeMs } = {}) {
  const ms = cgroup ? read(`${cgroup}/memory.stat`) : null;
  return {
    t: now(), cpu: cgroup ? pressureTotals(cgroup, "cpu") : null, mem: cgroup ? pressureTotals(cgroup, "memory") : null,
    jobMajflt: num(ms, /^pgmajfault (\d+)/m), jobSwapIns: num(ms, /^workingset_refault_anon (\d+)/m), jobUsec: cgroupCpuUsec(cgroup),
    h: host.cpu(), vm: host.vm(),
  };
}
/** A snapshot file written by scope-run.sh (`key value` lines), or null. */
export function parseCounters(text) {
  if (!text) return null;
  const v = (k) => num(text, new RegExp(`^${k} ([\\d.]+)`, "m"));
  const line = (k) => new RegExp(`^${k} (.*)$`, "m").exec(text)?.[1]?.trim() ?? null;
  const uptime = v("uptime"), stat = /^host_stat (.*)$/m.exec(text)?.[1];
  if (uptime == null) return null;
  return {
    t: Math.round(uptime * 1000),
    cpu: v("cpu_some") == null ? null : { some: v("cpu_some"), full: v("cpu_full") },
    mem: v("mem_some") == null ? null : { some: v("mem_some"), full: v("mem_full") },
    jobMajflt: v("job_majflt"), jobSwapIns: v("job_swapins"), jobUsec: v("job_usec"),
    h: stat ? statLine(stat.trim().split(/\s+/).map(Number)) : null,
    vm: { pswpin: v("pswpin"), pswpout: v("pswpout"), pgmajfault: v("pgmajfault") },
    slice: { path: line("slice_path"), weight: line("slice_weight"), cpuMax: line("slice_cpu_max"), memoryMax: line("slice_memory_max"), swapMax: line("slice_swap_max") },
  };
}

/**
 * Whether a snapshot's live slice (scope-run.sh read it from the kernel) is
 * the exclusive slice as configured: `want` { path, weight, cpuMax, memoryMax,
 * swapMax } as cgroup file contents. Returns the mismatches, [] when it is.
 */
export function sliceMismatch(snapshot, want) {
  const got = snapshot?.slice;
  if (!got?.path) return ["no reading of the job's slice"];
  const out = [];
  if (!got.path.endsWith(`/${want.slice}`)) out.push(`ran in ${got.path.split("/").pop()}`);
  for (const [k, file] of [["weight", "cpu.weight"], ["cpuMax", "cpu.max"], ["memoryMax", "memory.max"], ["swapMax", "memory.swap.max"]])
    if (got[k] !== want[k]) out.push(`${file} ${got[k] || "unreadable"} (wants ${want[k]})`);
  return out;
}

const round2 = (x) => Math.round(x * 100) / 100;
const pct = (part, whole) => (whole > 0 ? round2((part / whole) * 100) : null);
const d = (a, b) => (a == null || b == null ? null : b - a);
/** The values over [a, b]: shares in %, counts as counts; null where either end lacks the counter. */
function between(a, b, nproc) {
  const dtUs = (b.t - a.t) * 1000, dJ = d(a.h?.total, b.h?.total);
  const busyJ = d(a.h?.busy, b.h?.busy), jobUs = d(a.jobUsec, b.jobUsec);
  return {
    from: a.t, to: b.t,
    cpuSome: d(a.cpu?.some, b.cpu?.some) == null ? null : pct(b.cpu.some - a.cpu.some, dtUs),
    memSome: d(a.mem?.some, b.mem?.some) == null ? null : pct(b.mem.some - a.mem.some, dtUs),
    memFull: d(a.mem?.full, b.mem?.full) == null ? null : pct(b.mem.full - a.mem.full, dtUs),
    steal: dJ == null ? null : pct(b.h.steal - a.h.steal, dJ),
    other: busyJ == null || jobUs == null ? null : pct(Math.max(0, busyJ * (1e6 / HZ) - jobUs), dtUs * nproc),
    jobMajflt: d(a.jobMajflt, b.jobMajflt), jobSwapIns: d(a.jobSwapIns, b.jobSwapIns),
    swapIn: d(a.vm?.pswpin, b.vm?.pswpin), swapOut: d(a.vm?.pswpout, b.vm?.pswpout), majflt: d(a.vm?.pgmajfault, b.vm?.pgmajfault),
  };
}
const complete = (p) => Boolean(p && p.cpu && p.mem && p.jobMajflt != null && p.jobSwapIns != null);

/**
 * The exclusive job's contention judgement from its points: `start` and `end`
 * (scope-run.sh's snapshots, or null), the live points between, the GPU
 * sharing seen, and the host observations (load and PSI maxima).
 */
export function judge({ start, end, points = [], nproc, thresholds = {}, windowS = 5, gapS = 3, gpuShared = [], observed = null, boost = null }) {
  const t = { ...DISTURBED_DEFAULTS, ...thresholds };
  const missing = [];
  if (!complete(start)) missing.push("no baseline from before the payload started");
  if (!complete(end)) missing.push("no final counters from before the scope ended");
  const lo = start?.t ?? -Infinity, hi = end?.t ?? Infinity;
  const live = points.filter((p) => p.t > lo && p.t < hi).sort((a, b) => a.t - b.t);
  const good = [start, ...live, end].filter(complete);
  // Coverage: every stretch between complete points over gapS is a hole.
  const holes = [];
  for (let i = 1; i < good.length; i++) if (good[i].t - good[i - 1].t > gapS * 1000) holes.push([good[i - 1].t, good[i].t]);
  // An unreadable stretch at either end, up to the first or last point seen at all.
  const seen = [start, ...live, end].filter(Boolean).map((p) => p.t);
  if (good.length && seen.length) {
    if (good[0].t - Math.min(...seen) > gapS * 1000) holes.unshift([Math.min(...seen), good[0].t]);
    if (Math.max(...seen) - good.at(-1).t > gapS * 1000) holes.push([good.at(-1).t, Math.max(...seen)]);
  }
  const holeS = holes.reduce((s, [a, b]) => s + (b - a) / 1000, 0);
  if (holes.length) missing.push(`no readable counters for ${round2(holeS)} s (${holes.length} gap(s) over ${gapS} s)`);
  // Windows of windowS between complete points; the last, shorter stretch is merged into the one before.
  const marks = [];
  for (const p of good) if (!marks.length || p.t - marks.at(-1).t >= windowS * 1000) marks.push(p);
  if (good.length > 1 && marks.at(-1) !== good.at(-1)) { if (marks.length > 1) marks[marks.length - 1] = good.at(-1); else marks.push(good.at(-1)); }
  const windows = marks.slice(1).map((b, i) => between(marks[i], b, nproc));
  const whole = good.length > 1 ? between(good[0], good.at(-1), nproc) : null;
  if (!whole) missing.push("fewer than two readable points");
  const worst = (k) => { const xs = windows.map((w) => w[k]).filter((x) => x != null); return xs.length ? Math.max(...xs) : null; };
  const W = Object.fromEntries(["cpuSome", "memSome", "memFull", "steal", "other", "jobMajflt", "jobSwapIns", "swapIn", "swapOut", "majflt"].map((k) => [k, worst(k)]));
  const reasons = [];
  if (W.cpuSome != null && W.cpuSome >= t.jobCpuSomePct) reasons.push(`the job waited for a CPU ${W.cpuSome}% of its worst window (≥ ${t.jobCpuSomePct}%)`);
  if (W.memSome != null && W.memSome >= t.jobMemSomePct) reasons.push(`the job stalled on memory ${W.memSome}% of its worst window (≥ ${t.jobMemSomePct}%)`);
  if ((W.jobMajflt ?? 0) >= t.jobMajorFaults || (W.jobSwapIns ?? 0) >= t.jobSwapIns)
    reasons.push(`the job took ${W.jobMajflt} major faults and ${W.jobSwapIns} swap-ins in its worst window (≥ ${t.jobMajorFaults} or ≥ ${t.jobSwapIns}): its memory or cache was read back from disk`);
  if (W.steal != null && W.steal >= t.stealPct) reasons.push(`the hypervisor took ${W.steal}% of the machine's CPU in the worst window (≥ ${t.stealPct}%)`);
  if (gpuShared.length) reasons.push(`the GPU was shared outside the lease (pid ${gpuShared.map((u) => u.pid).join(", ")})`);
  // A run that should have had the exclusive CPU priority and didn't is not boosted evidence.
  if (boost && boost.status !== "applied") reasons.push(`the job didn't run in the boosted slice ${boost.slice} (${boost.why ?? boost.status}): not boosted evidence`);
  if (missing.length) reasons.push(`unmeasured: ${missing.join("; ")}`);
  return {
    v: 2, measured: missing.length === 0, missing, windowS, points: good.length, measuredS: whole ? round2((whole.to - whole.from) / 1000) : 0,
    job: whole ? { cpuSomePct: whole.cpuSome, cpuSomeWorstPct: W.cpuSome, memSomePct: whole.memSome, memSomeWorstPct: W.memSome, memFullPct: whole.memFull, memFullWorstPct: W.memFull,
      majorFaults: whole.jobMajflt, majorFaultsWorst: W.jobMajflt, swapIns: whole.jobSwapIns, swapInsWorst: W.jobSwapIns } : null,
    host: { ...(observed ?? {}), stealPct: whole?.steal ?? null, stealWorstPct: W.steal, otherCpuPct: whole?.other ?? null, otherCpuWorstPct: W.other,
      swapInPages: whole?.swapIn ?? null, swapInWorst: W.swapIn, swapOutPages: whole?.swapOut ?? null, swapOutWorst: W.swapOut, majorFaults: whole?.majflt ?? null, majorFaultsWorst: W.majflt },
    windows, boost, thresholds: t, disturbed: reasons.length > 0, reasons,
    // SCHED-1's fields (host values), for older readers.
    load1Max: observed?.load1Max ?? null, cpuSomeMax: observed?.cpuSomeAvg10Max ?? null, memFullMax: observed?.memFullAvg10Max ?? null,
  };
}

/** The host's load and PSI avg10, as the old label read them (observations only). */
export function hostObserved() {
  const avg10 = (r, k) => num(read(`/proc/pressure/${r}`), new RegExp(`^${k} avg10=([\\d.]+)`, "m")) ?? 0;
  return { load1: Number((read("/proc/loadavg") ?? "0").split(" ")[0]), cpuSomeAvg10: avg10("cpu", "some"), memFullAvg10: avg10("memory", "full") };
}

/** The context of an exclusive job nobody observed to its end (reconcile's recovery). */
export function unmeasuredContext(why) {
  return { v: 2, measured: false, missing: [why], points: 0, measuredS: 0, job: null, host: null, windows: [], disturbed: true, reasons: [`unmeasured: ${why}`] };
}

/**
 * Whether the exclusive slice is ready to give a job its CPU priority: loaded,
 * with the expected CPUWeight, no swap and a finite memory cap (its unit file,
 * install.sh). Read only; nothing here changes it. Returns { ready, why }.
 */
export function exclusiveSliceReady(slice, weight = 10000) {
  const r = spawnSync("systemctl", ["--user", "show", "-p", "LoadState", "-p", "CPUWeight", "-p", "MemorySwapMax", "-p", "MemoryMax", slice], { encoding: "utf8", timeout: 15000 });
  if (r.status !== 0) return { ready: false, why: `systemd could not be asked about ${slice}` };
  const p = Object.fromEntries(r.stdout.trim().split("\n").map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
  if (p.LoadState !== "loaded") return { ready: false, why: `${slice} is not installed (${p.LoadState || "unknown"})` };
  if (p.CPUWeight !== String(weight)) return { ready: false, why: `${slice} has CPUWeight ${p.CPUWeight}, not ${weight}` };
  if (p.MemorySwapMax !== "0") return { ready: false, why: `${slice} allows swap (${p.MemorySwapMax})` };
  if (!/^\d+$/.test(p.MemoryMax ?? "")) return { ready: false, why: `${slice} has no memory cap (${p.MemoryMax})` };
  return { ready: true, why: null };
}
