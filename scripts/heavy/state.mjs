// heavy-check v2 shared state: paths, config, the state transaction, process
// liveness, the legacy-lock bridge and host sampling.
//
// State lives in one JSON file under $SILTWAKE_SCHED_DIR (default
// /work/tmp/siltwake-sched). Every change happens inside a transaction that
// holds a kernel flock on state.lock. Node has no flock, so util-linux flock(1)
// locks an fd this process opened and passed down: the lock belongs to that open
// file description, stays with this process after flock(1) exits, and the kernel
// drops it if this process dies. The legacy bridge holds the v1 lock file the
// same way, for the length of a job.
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readlinkSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { boostWeight, setBoost, unmeasuredContext } from "./contention.mjs";
import { DEFAULTS, PROTOCOL, sliceLimits } from "./policy.mjs";
import { dropSnapshot } from "./snapshot.mjs";

export const PRODUCTION_DIR = "/work/tmp/siltwake-sched";
export const PRODUCTION_LEGACY_LOCK = "/work/tmp/siltwake-heavy-check.lock";

export function loadConfig(env = process.env) {
  const dir = env.SILTWAKE_SCHED_DIR || PRODUCTION_DIR;
  const fileCfg = readJson(join(dir, "config.json")) ?? {};
  const cfg = {
    ...DEFAULTS,
    slice: "siltwake-heavy.slice",
    unitPrefix: "siltwake-heavy",
    supervisorPrefix: "siltwake-sched",
    legacyLock: PRODUCTION_LEGACY_LOCK,
    ...fileCfg,
    dir,
  };
  if (env.SILTWAKE_SCHED_SLICE) cfg.slice = env.SILTWAKE_SCHED_SLICE;
  if (env.SILTWAKE_SCHED_LEGACY_LOCK) cfg.legacyLock = env.SILTWAKE_SCHED_LEGACY_LOCK;
  if (env.SILTWAKE_SCHED_UNIT_PREFIX) cfg.unitPrefix = env.SILTWAKE_SCHED_UNIT_PREFIX;
  if (env.SILTWAKE_SCHED_SUPERVISOR_PREFIX) cfg.supervisorPrefix = env.SILTWAKE_SCHED_SUPERVISOR_PREFIX;
  cfg.production = dir === PRODUCTION_DIR;
  // The slice whose CPU weight an exclusive job raises while it runs (TST-16,
  // contention.mjs): the heavy slice's top-level parent (siltwake.slice). A
  // private state directory (tests) never touches the real one: it boosts only
  // a slice its environment or config.json names.
  cfg.boostSlice = env.SILTWAKE_SCHED_BOOST_SLICE || fileCfg.boostSlice || (cfg.production ? `${cfg.slice.split("-")[0].replace(/\.slice$/, "")}.slice` : null);
  cfg.exclusiveCpuWeight = fileCfg.exclusiveCpuWeight ?? 10000;
  cfg.paths = {
    state: join(dir, "state.json"),
    lock: join(dir, "state.lock"),
    mode: join(dir, "mode"),
    ledger: join(dir, "ledger.jsonl"),
    jobs: join(dir, "jobs"),
    hostOverride: join(dir, "host-override.json"),
  };
  return cfg;
}

export function ensureDirs(cfg) {
  mkdirSync(cfg.paths.jobs, { recursive: true });
  const protocol = join(cfg.dir, "protocol");
  if (!existsSync(protocol)) writeFileSync(protocol, `${PROTOCOL}\n`);
}

/** "normal" or "serial". A missing or unreadable mode file means serial, the safe side. */
export function readMode(cfg) {
  try { return readFileSync(cfg.paths.mode, "utf8").trim() === "normal" ? "normal" : "serial"; } catch { return "serial"; }
}

export function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

export function writeJsonAtomic(path, value) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 1));
  renameSync(tmp, path);
}

export const jobDir = (cfg, id) => join(cfg.paths.jobs, id);

export function readState(cfg) {
  return readJson(cfg.paths.state) ?? { protocol: PROTOCOL, seq: 0, tickets: {} };
}

/** Locks `path` on an fd owned by this process. Returns the fd, or null. */
export function flockFd(path, { shared = false, wait = null } = {}) {
  const fd = openSync(path, "a");
  const args = [shared ? "-s" : "-x", ...(wait == null ? ["-n"] : ["-w", String(wait)]), "3"];
  const r = spawnSync("flock", args, { stdio: ["ignore", "ignore", "inherit", fd] });
  if (r.status === 0) return fd;
  closeSync(fd);
  return null;
}

/**
 * Runs fn(state) under the state lock. fn mutates state and returns
 * { result, changed }; the state is written back only when changed. Holding
 * the lock is a matter of milliseconds.
 */
export function transaction(cfg, fn) {
  ensureDirs(cfg);
  const fd = flockFd(cfg.paths.lock, { wait: 30 });
  if (fd == null) throw new Error(`heavy-check: could not lock ${cfg.paths.lock} within 30 s`);
  try {
    const state = readState(cfg);
    if (state.protocol !== PROTOCOL) throw new Error(`heavy-check: state protocol ${state.protocol}, this code speaks ${PROTOCOL}`);
    const out = fn(state) ?? {};
    if (out.changed) writeJsonAtomic(cfg.paths.state, state);
    return out.result;
  } finally {
    closeSync(fd);
  }
}

export function ledger(cfg, record) {
  appendFileSync(cfg.paths.ledger, `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`);
}

/** Process start time in clock ticks, or null if the PID is gone. PID plus
 * start time tells a live supervisor from a reused PID. */
export function procStart(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19]);
  } catch { return null; }
}
export const alive = (p) => Boolean(p?.pid) && procStart(p.pid) === p.start;
export const self = () => ({ pid: process.pid, start: procStart(process.pid) });

export function systemctl(...args) {
  return spawnSync("systemctl", ["--user", ...args], { encoding: "utf8" });
}

/**
 * Whether a job scope still holds processes. "Empty" means conclusively empty:
 * the unit is gone, or its cgroup reports `populated 0`. A stopping
 * (deactivating) scope is not empty, and any query failure counts as
 * populated, so a reservation is never freed on a guess.
 */
export function scopePopulated(unit) {
  const r = systemctl("show", "-p", "LoadState", "-p", "ActiveState", "-p", "ControlGroup", `${unit}.scope`);
  if (r.status !== 0) return true;
  const p = Object.fromEntries(r.stdout.trim().split("\n").map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
  if (p.LoadState === "not-found") return false;
  if (p.ControlGroup) {
    const events = cgroupRead(`/sys/fs/cgroup${p.ControlGroup}`, "cgroup.events");
    if (events != null) return /^populated 1$/m.test(events);
  }
  return p.ActiveState !== "inactive" && p.ActiveState !== "failed";
}

/** What systemd recorded for a finished job scope (Result, MemoryPeak,
 * CPUUsageNSec), then clears a failed unit. Job scopes are not collected on
 * failure, so an OOM group kill (OOMPolicy=kill) stays visible here after the
 * in-scope wrapper itself was killed. */
export function unitFacts(unit) {
  const r = systemctl("show", "-p", "LoadState", "-p", "ActiveState", "-p", "Result", "-p", "MemoryPeak", "-p", "CPUUsageNSec", `${unit}.scope`);
  const f = r.status === 0 ? Object.fromEntries(r.stdout.trim().split("\n").map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])) : {};
  if (f.ActiveState === "failed") systemctl("reset-failed", `${unit}.scope`);
  const num = (v) => (/^\d+$/.test(v ?? "") ? Number(v) : null);
  return { result: f.LoadState === "loaded" ? f.Result : null, memoryPeak: num(f.MemoryPeak), cpuNs: num(f.CPUUsageNSec) };
}

/** Stops a job scope and waits until it is conclusively empty. Returns true
 * when empty; false if it still is not after `waitS` (the caller keeps the
 * reservation and tries again later). */
export function stopScope(unit, { block = true, waitS = 0 } = {}) {
  if (!scopePopulated(unit)) return true;
  systemctl("stop", ...(block ? [] : ["--no-block"]), `${unit}.scope`);
  for (let i = 0; i <= waitS * 10; i++) {
    if (!scopePopulated(unit)) return true;
    if (i < waitS * 10) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  return false;
}

/** Every process in a job's cgroup subtree (delegated child cgroups
 * included), from the cgroup path its wrapper recorded; null if unreadable. */
export function jobProcs(cfg, id) {
  const root = readFileSafe(join(jobDir(cfg, id), "cgroup"));
  if (!root) return null;
  const pids = [];
  const walk = (dir) => {
    for (const pid of (readFileSync(join(dir, "cgroup.procs"), "utf8").match(/\d+/g) ?? [])) pids.push(Number(pid));
    for (const e of readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) walk(join(dir, e.name));
  };
  try { walk(root); } catch { return null; }
  return pids;
}

const parentOf = (pid) => {
  try { const st = readFileSync(`/proc/${pid}/stat`, "utf8"); return Number(st.slice(st.lastIndexOf(")") + 2).split(" ")[1]); } catch { return null; }
};

/** When the job scope holds nothing but its anchor (and the anchor's sleep),
 * tells the anchor to exit, so the bridge is released as the cgroup empties
 * rather than at the end of a stop grace (anchor.sh). The anchor is signalled
 * only if its recorded PID is in this job's cgroup. Returns true if it did. */
export function releaseAnchorIfAlone(cfg, id) {
  // "PID START" (SCHED-2; R4 P3 4): a PID reused inside the subtree after the
  // anchor's death has another start time. SCHED-1 jobs wrote the PID alone.
  const [anchor, start] = (readFileSafe(join(jobDir(cfg, id), "anchor.pid")) ?? "").split(/\s+/).map(Number);
  const procs = jobProcs(cfg, id);
  if (!anchor || !procs?.includes(anchor)) return false;
  if (start && procStart(anchor) !== start) return false;
  if (!procs.every((pid) => pid === anchor || parentOf(pid) === anchor)) return false;
  try { process.kill(anchor, "SIGUSR1"); return true; } catch { return false; }
}

/** Who holds or waits for the legacy (v1) lock file, from /proc/locks. Blocked
 * waiters show as "->" lines on the file's device:inode. A v1 caller always
 * takes it exclusively (WRITE); v2 jobs hold it shared (READ) and never block. */
export function legacyLockInfo(path) {
  let st;
  try { st = statSync(path); } catch { return { holder: false, waiter: false, readers: 0, holders: [] }; }
  const dev = st.dev;
  const major = ((dev >> 8) & 0xfff) | (Math.floor(dev / 2 ** 32) & ~0xfff);
  const minor = (dev & 0xff) | ((dev >> 12) & ~0xff);
  const id = `${major.toString(16).padStart(2, "0")}:${minor.toString(16).padStart(2, "0")}:${st.ino}`;
  const info = { holder: false, waiter: false, readers: 0, holders: [], inode: st.ino };
  let text = "";
  try { text = readFileSync("/proc/locks", "utf8"); } catch { return info; }
  for (const line of text.split("\n")) {
    const f = line.trim().split(/\s+/);
    const blocked = f[1] === "->";
    // "N: [->] FLOCK ADVISORY READ|WRITE pid maj:min:ino start end"
    const [kind, , mode, pid, where] = f.slice(blocked ? 2 : 1);
    if (kind !== "FLOCK" || where !== id) continue;
    if (blocked) { if (mode === "WRITE") info.waiter = true; continue; }
    if (mode === "WRITE") { info.holder = true; info.holders.push(Number(pid)); } else info.readers++;
  }
  return info;
}

function meminfo() {
  const text = readFileSync("/proc/meminfo", "utf8");
  const kib = (k) => Number(new RegExp(`^${k}:\\s+(\\d+)`, "m").exec(text)?.[1] ?? 0);
  return { memAvailableMiB: Math.floor(kib("MemAvailable") / 1024), memTotalMiB: Math.floor(kib("MemTotal") / 1024) };
}
function psi(resource, kind) {
  try {
    const line = readFileSync(`/proc/pressure/${resource}`, "utf8").split("\n").find((l) => l.startsWith(kind));
    return Number(/avg10=([\d.]+)/.exec(line)?.[1] ?? 0);
  } catch { return 0; }
}
export function cgroupRead(cgroup, file) {
  try { return readFileSync(join(cgroup, file), "utf8").trim(); } catch { return null; }
}

/** Host facts for plan(). In a private (test) state directory,
 * host-override.json may replace nproc, memAvailableMiB and memFullAvg10. */
export function sampleHost(cfg, state) {
  const host = { nproc: availableParallelism(), ...meminfo(), memFullAvg10: psi("memory", "full"), charges: {} };
  for (const t of Object.values(state.tickets)) {
    if (t.state !== "running") continue;
    const cg = readFileSafe(join(jobDir(cfg, t.id), "cgroup"));
    const cur = cg ? Number(cgroupRead(cg, "memory.current")) : NaN;
    if (Number.isFinite(cur)) host.charges[t.id] = Math.ceil(cur / 1048576);
  }
  if (!cfg.production) Object.assign(host, readJson(cfg.paths.hostOverride) ?? {});
  return host;
}
/** The slice's cgroup directory: systemd's ControlGroup when the unit is
 * loaded, else derived ("a-b.slice" nests under "a.slice", so
 * siltwake-heavy.slice lives at siltwake.slice/siltwake-heavy.slice, under the
 * user manager this process runs beneath). Null if neither is known. */
export function sliceCgroup(slice) {
  const shown = systemctl("show", "-p", "ControlGroup", "--value", slice).stdout?.trim();
  if (shown) return `/sys/fs/cgroup${shown}`;
  const own = readFileSafe("/proc/self/cgroup")?.replace(/^0::/, "") ?? "";
  const root = /^(.*\/user@\d+\.service)/.exec(own)?.[1];
  if (!root) return null;
  const parts = slice.replace(/\.slice$/, "").split("-");
  return `/sys/fs/cgroup${root}/${parts.map((_, i) => `${parts.slice(0, i + 1).join("-")}.slice`).join("/")}`;
}

/** The slice's live cpu.max and memory.max against what this machine wants
 * (policy sliceLimits): { cpuMax, memMax, want, ok }. */
export function sliceCheck(cfg, nproc) {
  const want = sliceLimits(nproc, cfg), cg = sliceCgroup(cfg.slice);
  const cpuMax = cg && cgroupRead(cg, "cpu.max"), memMax = cg && cgroupRead(cg, "memory.max");
  return { cg, cpuMax, memMax, want, ok: cpuMax === `${want.cpuQuotaPct * 1000} 100000` && memMax === String(want.memoryMaxMiB * 1048576) };
}

/** sampleHost plus the legacy lock's holders and waiters: what plan() needs. */
export function hostFor(cfg, state) {
  const host = sampleHost(cfg, state);
  host.legacy = legacyLockInfo(cfg.legacyLock);
  host.remote = remoteHealth(cfg);
  return host;
}
/** The second worker's cached health for plan() (remote.mjs keeps it fresh). */
function remoteHealth(cfg) {
  // Off when disabled, and for a private state directory (tests) without a remote.
  if (cfg.remote?.enabled === false || (!cfg.production && cfg.remote === undefined)) return { state: "off" };
  const h = readJson(join(cfg.dir, "remote.json"));
  if (!h) return { state: "unknown" };
  // Routing trusts a fresh reading only (R1-F6): a stale one is unknown, so an
  // any job runs here at once and a 4070 job waits for the refresh. The same
  // freshness as remote.mjs healthTtlMs, plus the slack of one probe.
  const s = { up: 30, paused: 60, unreachable: 60, unreachableMax: 300, ...(cfg.remote?.recheckS ?? {}) };
  const ttlS = h.state === "up" || h.state === "busy" ? s.up : h.state === "paused" ? s.paused
    : h.state === "unreachable" ? Math.min(s.unreachableMax, s.unreachable * 2 ** Math.max(0, (h.failures ?? 1) - 1)) : 0;
  return Date.now() - (h.at ?? 0) <= (ttlS + 30) * 1000 ? h : { ...h, state: "unknown", stale: h.state };
}
export function readFileSafe(path) {
  try { return readFileSync(path, "utf8").trim(); } catch { return null; }
}

/**
 * Recovers tickets whose owner is gone, judging liveness by cgroups, never by
 * which file descriptors a job's processes kept. A queued ticket whose
 * supervisor died was never launched: it is dropped (exit 75, "lost"). An
 * admitted ticket is alive while its holder's scope (holder.mjs) holds
 * processes, or, before the holder has claimed it, while its supervisor or
 * the holder's launcher does. Once the holder is gone, anything left in the
 * job scope is stopped and the reservation kept until that cgroup is
 * conclusively empty; then the ticket is finished, with the command's own exit
 * code if the in-scope wrapper recorded one. A holder that starts after its
 * ticket was finished here never launches (its claim fails). Runs on every
 * transaction, and from wait, status and cancel, so a lone `wait` also reaches
 * a result. Returns true if state changed.
 */
export function reconcile(cfg, state) {
  let changed = false;
  for (const t of Object.values(state.tickets)) {
    if (t.state === "queued" && alive(t.supervisor)) continue;
    if (t.state === "running" && t.remote) {
      // A remote ticket is supervised by its remote holder's process, not by
      // whatever its scope still holds (R1-F3): a surviving transport is no
      // observer. Before the claim its supervisor owns it.
      if (!t.holder ? alive(t.supervisor) || [t.supervisorUnit, t.holderUnit].some((u) => u && scopePopulated(u)) : alive(t.holder)) continue;
      // Holder gone: one recovery process (remote-holder.mjs --recover) stops the
      // job on the sandbox and finishes the ticket; the reservation is kept until then.
      if (alive(t.recovering)) continue;
      const rec = spawn("systemd-run", ["--user", "--scope", "--quiet", "--collect", `--unit=${cfg.supervisorPrefix}-recover-${t.id}-${Date.now() % 100000}`,
        process.execPath, join(dirname(fileURLToPath(import.meta.url)), "remote-holder.mjs"), "--recover", t.id], { detached: true, stdio: "ignore", env: process.env });
      rec.unref();
      // systemd-run execs into the scope: its PID is the recovery process's.
      t.recovering = { pid: rec.pid, start: procStart(rec.pid) };
      if (!t.orphaned) { t.orphaned = Date.now(); ledger(cfg, { event: "orphaned", ticket: t.id, worktree: t.worktree, remote: true }); }
      changed = true;
      continue;
    }
    if (t.state === "running") {
      const owner = t.holder ? [t.holderUnit] : [t.supervisorUnit, t.holderUnit];
      if ((!t.holder && alive(t.supervisor)) || owner.some((u) => u && scopePopulated(u))) continue;
      if (t.unit && scopePopulated(t.unit)) {
        // Keep the reservation until the cgroup is empty. The anchor keeps v1
        // out meanwhile, and is let go once it is the last one left.
        if (!releaseAnchorIfAlone(cfg, t.id)) stopScope(t.unit, { block: false });
        if (!t.orphaned) { t.orphaned = Date.now(); changed = true; ledger(cfg, { event: "orphaned", ticket: t.id, worktree: t.worktree }); }
        continue;
      }
    }
    const dir = jobDir(cfg, t.id);
    const result = t.state === "running" ? orphanResult(dir, t) : { code: 75, label: "lost: supervisor died before admission" };
    // Nobody observed an orphaned exclusive job to its end: its measurement is never clean (TST-16 R1-F4).
    if (t.state === "running" && t.req.exclusive) result.context = unmeasuredContext("recovered: its holder died, so nobody judged the job's contention to its end");
    const marker = join(t.worktree, t.testBuild ?? ".test-build", ".heavy-job");
    if (readJson(marker)?.ticket === t.id) rmSync(marker, { force: true });
    // What was submitted, kept through recovery (R1 P3). Nobody checked the tree
    // at the end, so the result is never evidence for a commit.
    const request = readJson(join(dir, "request.json"));
    const identity = !request?.tree ? {} : {
      head: request.tree.head, dirty: request.tree.dirty,
      evidence: { commit: request.tree.head, bound: false, why: "recovered: no observer checked the tree at the end", snapshot: Boolean(request.snapshot) },
      ...(request.snapshot ? { snapshot: { root: request.snapshot.root, kept: Boolean(dropSnapshot(request.snapshot.root, request.snapshot.status)) } } : {}),
    };
    const exitFile = join(dir, "exit.json");
    if (!existsSync(exitFile)) writeJsonAtomic(exitFile, { ticket: t.id, class: t.req.class, submittedAt: t.submittedAt, admittedAt: t.admittedAt, endedAt: Date.now(), ...identity, ...result });
    ledger(cfg, { event: "reconciled", ticket: t.id, state: t.state, worktree: t.worktree, class: t.req.class, ...result });
    if (t.state === "running" && t.req.exclusive) state.lastExclusiveEnd = Date.now();
    delete state.tickets[t.id];
    changed = true;
  }
  // The exclusive priority boost (TST-16) lasts only while its job runs under
  // its live holder. Its record keeps ownership until a verified reset. It is
  // reset only once the owner can't act any more: the holder dead *and* its
  // scope empty (R2-F1: the same boundary as the ticket's lifetime), so an
  // apply still in flight can never land after the reset.
  if (state.boost) {
    const b = state.boost;
    if (!alive(b.owner) && !(b.ownerUnit && scopePopulated(b.ownerUnit))) {
      const r = setBoost(b.slice, false);
      ledger(cfg, { event: "boost-reset", ticket: b.ticket, slice: b.slice, verified: r.verified, error: r.error, by: "reconcile" });
      if (r.verified) delete state.boost; else Object.assign(b, { state: "releasing", failures: (b.failures ?? 0) + 1 });
      changed = true;
    }
  } else changed = boostBackstop(cfg, state).changed || changed;
  return changed;
}

/**
 * The backstop for our slice's CPU weight (TST-16 R2): with no boost record
 * and no exclusive job that could hold one, the weight is reset whatever
 * happened (a bypassed rollback, a lost record). During a handover
 * (state.frozen) no job may hold a boost, so a running exclusive doesn't
 * protect it. Runs only inside transaction(), so it is serialised with
 * ownership and admission. An idle slice (no cgroup) is checked through
 * systemd at most once a minute, or always with `force` (the handover's
 * certification). Returns { changed, clean }: clean when the weight is
 * verified at its default.
 */
export function boostBackstop(cfg, state, { force = false } = {}) {
  if (!cfg.boostSlice) return { changed: false, clean: true };
  if (state.boost || (!state.frozen && Object.values(state.tickets).some((t) => t.state === "running" && t.req?.exclusive))) return { changed: false, clean: false };
  let changed = false, w = boostWeight(cfg.boostSlice, force ? { force: true } : { cheapOnly: true });
  if (!w.known && !force && Date.now() - (state.boostCheckedAt ?? 0) > 60000) { w = boostWeight(cfg.boostSlice, { force: true }); state.boostCheckedAt = Date.now(); changed = true; }
  if (!w.known) return { changed, clean: false };
  if (w.value === null) return { changed, clean: true };
  const r = setBoost(cfg.boostSlice, false);
  ledger(cfg, { event: "boost-reset", slice: cfg.boostSlice, was: w.value, verified: r.verified, error: r.error, by: "backstop" });
  return { changed: true, clean: r.verified };
}

/** The result of a job whose supervisor died, from what the in-scope wrapper
 * left. Counters nobody could read are null with a reason in `unavailable`,
 * never 0: a missing count is not proof that no OOM happened (R5 P3). */
function orphanResult(dir, t) {
  if (existsSync(join(dir, "not-started"))) return { code: 75, label: "cancelled before start; the command did not run" };
  if (existsSync(join(dir, "cancelled"))) return { code: 75, label: "cancelled", stopReason: "cancelled" };
  const stats = readStats(dir);
  const facts = t.unit ? unitFacts(t.unit) : {};
  const oomLocal = readFileSafe(join(dir, "oom-local")); // what the holder saw before it died
  const peakMiB = stats.peak ? Math.ceil(Number(stats.peak) / 1048576) : facts.memoryPeak != null ? Math.ceil(facts.memoryPeak / 1048576) : null;
  const oomLabel = `oom: class ${t.req.class} reservation ${t.req.memMiB} MiB (holder died)`;
  if (stats.rc == null) {
    const unavailable = { oomKills: "the in-scope wrapper recorded no stats (killed with the job)", ...(oomLocal ? {} : { reservationOom: "no observer saw the scope's memory.events.local" }) };
    if (oomLocal) return { code: 137, label: oomLabel, stopReason: "oom", reservationOom: true, oomEvidence: "memory.events.local (holder watch, before it died)", oomKills: null, peakMiB, unavailable };
    return { code: 137, label: t.holder ? "killed: its holder died and the job did not finish" : "not started: its supervisor died during the handoff",
      stopReason: "killed", reservationOom: null, oomKills: null, peakMiB, unavailable };
  }
  const code = Number(stats.rc), oom = Number(stats.oom_local ?? 0) > 0 && code !== 0;
  // The wrapper records whether the scope was stopped around it (BindsTo= after
  // the holder died, or a manual stop): then the command did not end by itself.
  const stopped = stats.stopped === "1" && !oom;
  return {
    code: oom || stopped ? 137 : code,
    label: oom ? oomLabel : stopped ? `killed: its holder died and the job was stopped (the command exited ${code})` : "its holder died; the command ran to its end",
    stopReason: oom ? "oom" : stopped ? "killed" : null, reservationOom: oom, oomEvidence: oom ? "memory.events.local (wrapper)" : null,
    oomKills: stats.oom_kill != null ? Number(stats.oom_kill) : null, peakMiB,
  };
}

/** The in-scope wrapper's accounting (scope-run.sh), as strings; {} if none. */
export function readStats(dir) {
  return Object.fromEntries((readFileSafe(join(dir, "stats")) ?? "").split("\n").filter(Boolean).map((l) => l.split("=")));
}

/**
 * Processes with an NVIDIA device open (/dev/nvidia0 …), which is what a GPU
 * Chrome (ANGLE GL-EGL) or any other GPU client does; SwiftShader does not.
 * Each is matched to the running ticket whose job scope contains it: `leased`
 * when that ticket holds the GPU. A v1 scope (siltwake-heavy-*) is exclusive,
 * so it counts as leased. Only this user's processes are readable. ~10 ms.
 */
export function gpuUsers(cfg, state) {
  const scopes = Object.values(state?.tickets ?? {}).filter((t) => t.state === "running" && t.unit).map((t) => [`/${t.unit}.scope`, t]);
  const users = [];
  let pids = [];
  try { pids = readdirSync("/proc").filter((p) => /^\d+$/.test(p)); } catch { return users; }
  for (const pid of pids) {
    let fds;
    try { fds = readdirSync(`/proc/${pid}/fd`); } catch { continue; }
    if (!fds.some((fd) => { try { return /^\/dev\/nvidia\d/.test(readlinkSync(`/proc/${pid}/fd/${fd}`)); } catch { return false; } })) continue;
    const cgroup = readFileSafe(`/proc/${pid}/cgroup`) ?? "";
    const owner = scopes.find(([s]) => cgroup.includes(s))?.[1];
    const v1 = !owner && /\/siltwake-heavy-[^/]*\.scope/.test(cgroup) && !scopes.some(([s]) => cgroup.includes(s));
    users.push({ pid: Number(pid), cmd: (readFileSafe(`/proc/${pid}/cmdline`) ?? "").replace(/\0/g, " ").trim().slice(0, 160),
      ticket: owner?.id ?? null, leased: Boolean(owner?.req.gpu) || v1 });
  }
  return users;
}

/** The git worktree root containing cwd, or cwd itself outside git. */
export function worktreeOf(cwd) {
  const r = spawnSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : cwd;
}

/** What the job will test: HEAD plus a hash of uncommitted changes (tracked
 * diff and untracked files), "clean" when there are none, and `tracked`, the
 * same for the tracked diff alone (a job writing new output files does not
 * change it). Null outside git. */
export function gitTree(cwd) {
  const git = (...args) => spawnSync("git", ["-C", cwd, ...args], { encoding: "buffer", maxBuffer: 512 * 1024 * 1024 });
  const head = git("rev-parse", "HEAD");
  if (head.status !== 0) return { head: null, dirty: null, tracked: null };
  const diff = git("diff", "HEAD", "--binary");
  const untracked = git("ls-files", "-o", "--exclude-standard", "-z").stdout;
  const hash = createHash("sha256").update(diff.stdout ?? "");
  const tracked = diff.stdout?.length ? createHash("sha256").update(diff.stdout).digest("hex").slice(0, 12) : "clean";
  if (untracked?.length) {
    const names = untracked.toString().split("\0").filter(Boolean);
    const blobs = spawnSync("git", ["-C", cwd, "hash-object", "--stdin-paths"], { input: names.join("\n"), encoding: "utf8" }).stdout;
    hash.update(untracked).update(blobs ?? "");
  }
  const dirty = (diff.stdout?.length || untracked?.length) ? hash.digest("hex").slice(0, 12) : "clean";
  return { head: head.stdout.toString().trim(), dirty, tracked };
}
