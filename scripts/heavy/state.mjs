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
import { spawnSync } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { DEFAULTS, PROTOCOL } from "./policy.mjs";

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
export function cpuContext() {
  const load1 = Number(readFileSync("/proc/loadavg", "utf8").split(" ")[0]);
  return { load1, cpuSomeAvg10: psi("cpu", "some"), memFullAvg10: psi("memory", "full") };
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
    if (t.state === "running") {
      const owner = t.holder ? [t.holderUnit] : [t.supervisorUnit, t.holderUnit];
      if ((!t.holder && alive(t.supervisor)) || owner.some((u) => u && scopePopulated(u))) continue;
      if (t.unit && scopePopulated(t.unit)) {
        stopScope(t.unit, { block: false }); // keep the reservation until the cgroup is empty
        if (!t.orphaned) { t.orphaned = Date.now(); changed = true; ledger(cfg, { event: "orphaned", ticket: t.id, worktree: t.worktree }); }
        continue;
      }
    }
    const dir = jobDir(cfg, t.id);
    const result = t.state === "running" ? orphanResult(dir, t) : { code: 75, label: "lost: supervisor died before admission" };
    const marker = join(t.worktree, ".test-build", ".heavy-job");
    if (readJson(marker)?.ticket === t.id) rmSync(marker, { force: true });
    const exitFile = join(dir, "exit.json");
    if (!existsSync(exitFile)) writeJsonAtomic(exitFile, { ticket: t.id, class: t.req.class, submittedAt: t.submittedAt, admittedAt: t.admittedAt, endedAt: Date.now(), ...result });
    ledger(cfg, { event: "reconciled", ticket: t.id, state: t.state, worktree: t.worktree, class: t.req.class, ...result });
    delete state.tickets[t.id];
    changed = true;
  }
  return changed;
}

/** The result of a job whose supervisor died, from what the in-scope wrapper left. */
function orphanResult(dir, t) {
  if (existsSync(join(dir, "not-started"))) return { code: 75, label: "cancelled before start; the command did not run" };
  if (existsSync(join(dir, "cancelled"))) return { code: 75, label: "cancelled" };
  const stats = Object.fromEntries((readFileSafe(join(dir, "stats")) ?? "").split("\n").filter(Boolean).map((l) => l.split("=")));
  if (stats.rc == null) return { code: 137, label: t.holder ? "killed: its holder died and the job did not finish" : "not started: its supervisor died during the handoff" };
  const code = Number(stats.rc), oom = Number(stats.oom_local ?? 0) > 0 && code !== 0;
  return {
    code: oom ? 137 : code,
    label: oom ? `oom: class ${t.req.class} reservation ${t.req.memMiB} MiB (holder died)` : "its holder died; the command ran to its end",
    peakMiB: stats.peak ? Math.ceil(Number(stats.peak) / 1048576) : null,
  };
}

/** The git worktree root containing cwd, or cwd itself outside git. */
export function worktreeOf(cwd) {
  const r = spawnSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : cwd;
}

/** What the job will test: HEAD plus a hash of uncommitted changes (tracked
 * diff and untracked files), "clean" when there are none. Null outside git. */
export function gitTree(cwd) {
  const git = (...args) => spawnSync("git", ["-C", cwd, ...args], { encoding: "buffer", maxBuffer: 512 * 1024 * 1024 });
  const head = git("rev-parse", "HEAD");
  if (head.status !== 0) return { head: null, dirty: null };
  const diff = git("diff", "HEAD", "--binary");
  const untracked = git("ls-files", "-o", "--exclude-standard", "-z").stdout;
  const hash = createHash("sha256").update(diff.stdout ?? "");
  if (untracked?.length) {
    const names = untracked.toString().split("\0").filter(Boolean);
    const blobs = spawnSync("git", ["-C", cwd, "hash-object", "--stdin-paths"], { input: names.join("\n"), encoding: "utf8" }).stdout;
    hash.update(untracked).update(blobs ?? "");
  }
  const dirty = (diff.stdout?.length || untracked?.length) ? hash.digest("hex").slice(0, 12) : "clean";
  return { head: head.stdout.toString().trim(), dirty };
}
