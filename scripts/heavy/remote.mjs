// heavy-check's remote lane (SCHED-2b): the second worker, siltwake-alickers
// (WSL2 on the owner's PC, RTX 4070 Laptop), reached over ssh. Its own
// `siltwake-job` runs one job at a time under a lock, honours the owner's
// pause flag and exits 75 when paused (WORKER_RESOURCE_LIMITS, "Second
// worker"). The transport is scripts/alickers-job.sh: it pins a commit, moves
// the shared checkout and runs the command inside `siltwake-job`.
//
// This module: the lane's configuration, its cached health (remote.json in
// the state directory), the ssh helpers the remote holder uses (upload the
// in-sandbox wrapper, stop a job, fetch artifacts) and the external-path check
// that decides whether a command can run there at all.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { flockFd, readJson, writeJsonAtomic } from "./state.mjs";

const here = dirname(fileURLToPath(import.meta.url));

/** The lane's settings: config.json `remote` over these defaults. */
export function remoteConfig(cfg) {
  const transport = [join(here, "alickers-job.sh"), join(here, "..", "alickers-job.sh")].find((p) => existsSync(p)) ?? null;
  const r = {
    enabled: true,
    transport,
    ssh: ["/usr/bin/ssh", "-F", join(homedir(), ".ssh", "siltwake.conf"), "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "siltwake-alickers"],
    repo: "/work/repos/subnautica-clone", // the sandbox's shared checkout (alickers-job.sh)
    laneDir: "/work/tmp/siltwake-lane", // on the sandbox: the wrapper and per-ticket files
    lock: "/work/tmp/siltwake-sandbox-job.lock", // siltwake-job's one-job lock
    paused: "$HOME/.local/state/siltwake/paused", // the owner's pause flag
    artifactsDir: "/work/tmp", // here: fetched artifacts go to <artifactsDir>/<ticket>/
    slots: 1,
    memoryG: 8, // siltwake-job's default; --mem above it asks for more (up to 12)
    cpus: 6, // siltwake-job's CPU quota
    tickS: 10, // how often the wrapper reports heartbeats and memory.high
    throttleNoticeS: 120, // continuous memory.high throttling reported after this
    maxAttempts: 3, // transport or connection failures before a 4070 ticket gives up
    recheckS: { up: 30, paused: 60, unreachable: 60, unreachableMax: 300 }, // how long a health reading stays good
    ...(cfg.remote ?? {}),
  };
  if (!r.transport) r.enabled = false;
  // A private state directory (tests) never reaches the real sandbox unless
  // its config.json names a remote.
  if (!cfg.production && cfg.remote === undefined) { r.enabled = false; r.privateOff = true; }
  return r;
}

/** Runs a command on the sandbox: { code, out, err } (255: unreachable). */
export function ssh(r, command, { input, timeoutS = 60 } = {}) {
  return new Promise((done) => {
    const p = spawn(r.ssh[0], [...r.ssh.slice(1), command], { stdio: [input == null ? "ignore" : "pipe", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err += d; });
    const timer = setTimeout(() => p.kill("SIGKILL"), timeoutS * 1000);
    p.on("error", (e) => { clearTimeout(timer); done({ code: 255, out, err: e.message }); });
    p.on("close", (code) => { clearTimeout(timer); done({ code: code ?? 255, out, err }); });
    // The remote side may not read its input (a wrapper already uploaded):
    // an EPIPE here is not an error.
    if (input != null) { p.stdin.on("error", () => {}); p.stdin.end(input); }
  });
}
const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

// Health ----------------------------------------------------------------------

const healthPath = (cfg) => join(cfg.dir, "remote.json");
/** The cached health: { state: up|busy|paused|unreachable|unknown|off, at, failures, detail }. */
export function readHealth(cfg) {
  const r = remoteConfig(cfg);
  if (!r.enabled) return { state: "off", detail: r.privateOff ? "private state without a remote in config.json" : r.transport ? "disabled in config.json" : "no transport (scripts/alickers-job.sh) installed" };
  return readJson(healthPath(cfg)) ?? { state: "unknown", at: 0, failures: 0 };
}
export function writeHealth(cfg, state, detail = null) {
  const prev = readJson(healthPath(cfg)) ?? {};
  const failures = state === "unreachable" ? (prev.state === "unreachable" ? (prev.failures ?? 0) + 1 : 1) : 0;
  const h = { state, at: Date.now(), failures, detail };
  writeJsonAtomic(healthPath(cfg), h);
  return h;
}
/** How long a health reading stays good: up and busy 30 s; paused 60 s;
 * unreachable 1, 2, then 5 minutes. */
export function healthTtlMs(h, s = { up: 30, paused: 60, unreachable: 60, unreachableMax: 300 }) {
  if (h.state === "up" || h.state === "busy") return s.up * 1000;
  if (h.state === "paused") return s.paused * 1000;
  if (h.state === "unreachable") return Math.min(s.unreachableMax, s.unreachable * 2 ** Math.max(0, (h.failures ?? 1) - 1)) * 1000;
  return 0;
}

/**
 * One look at the sandbox: paused (the owner's flag), busy (its job lock is
 * held: a lane job, or another agent's direct alickers-job.sh call), up, or
 * unreachable (ssh 255 or no answer).
 */
export async function probe(cfg) {
  const r = remoteConfig(cfg);
  if (!r.enabled) return readHealth(cfg);
  const res = await ssh(r, `if [ -e "${r.paused}" ]; then echo paused; elif flock -n ${q(r.lock)} true; then echo up; else echo busy; fi`, { timeoutS: 25 });
  const word = /^(paused|up|busy)$/m.exec(res.out)?.[1];
  return writeHealth(cfg, word ?? "unreachable", word ? null : (res.err.trim().split("\n").at(-1) || `ssh exit ${res.code}`).slice(0, 200));
}

/** Probes if the cached reading is stale (or `force`), one prober at a time. */
export async function refreshHealth(cfg, { force = false } = {}) {
  const h = readHealth(cfg);
  if (h.state === "off" || (!force && Date.now() - (h.at ?? 0) < healthTtlMs(h, remoteConfig(cfg).recheckS))) return h;
  const fd = flockFd(join(cfg.dir, "remote.probe.lock"));
  if (fd == null) return h; // someone else is probing
  try { return await probe(cfg); } finally { closeSync(fd); }
}

// The in-sandbox wrapper ------------------------------------------------------------

/** Uploads lane-run.sh to <laneDir>/bin/<hash>/ once; returns its remote path, or null. */
export async function uploadWrapper(cfg) {
  const r = remoteConfig(cfg), body = readFileSync(join(here, "lane-run.sh"));
  const path = `${r.laneDir}/bin/${createHash("sha256").update(body).digest("hex").slice(0, 12)}/lane-run.sh`;
  const res = await ssh(r, `f=${q(path)}; [ -f "$f" ] && { cat >/dev/null; exit 0; }; mkdir -p "$(dirname "$f")" && cat > "$f.tmp" && mv "$f.tmp" "$f"`, { input: body });
  return res.code === 0 ? path : null;
}

/** Stops a ticket's job on the sandbox: marks it cancelled (a job not started
 * yet never starts) and TERMs the wrapper if it runs, checked by PID and start
 * time. `r` is the lane the job was sent to (its remote holder's snapshot).
 * Returns { reached, stopped }. */
export async function remoteStop(cfg, ticket, r = remoteConfig(cfg)) {
  const d = `${r.laneDir}/jobs/${ticket}`;
  const res = await ssh(r, `d=${q(d)}; mkdir -p "$d" && : > "$d/cancelled"; if [ -f "$d/pid" ]; then set -- $(cat "$d/pid"); ` +
    `[ "$(cut -d' ' -f22 /proc/$1/stat 2>/dev/null)" = "$2" ] && kill -TERM "$1" && echo stopped; fi; true`, { timeoutS: 30 });
  return { reached: res.code === 0, stopped: /stopped/.test(res.out) };
}

/** One out-of-band look at a running job on the sandbox, from outside its
 * cgroup: its scope's memory.high count and its heartbeat file's mtime.
 * { high, beat } (null where unreadable), or null if unreachable. */
export async function remoteWatch(cfg, ticket) {
  const r = remoteConfig(cfg), d = `${r.laneDir}/jobs/${ticket}`;
  const res = await ssh(r, `d=${q(d)}; cg=$(cat "$d/cgroup" 2>/dev/null); echo "high $(sed -n 's/^high //p' "$cg/memory.events" 2>/dev/null)"; echo "beat $(stat -c %Y "$d/heartbeat" 2>/dev/null)"`, { timeoutS: 20 });
  if (res.code !== 0) return null;
  const num = (k) => { const v = new RegExp(`^${k} (\\d+)$`, "m").exec(res.out)?.[1]; return v == null ? null : Number(v); };
  return { high: num("high"), beat: num("beat") };
}

/**
 * After the job: its lane directory on the sandbox is removed, and so are
 * artifacts it wrote inside the shared checkout (relative paths), which must
 * not leak into the next job's tree. One that could not be fetched is moved to
 * /work/results/lane-<ticket>/ on the sandbox instead, so nothing is lost.
 */
export async function remoteCleanup(cfg, ticket, fetched) {
  const r = remoteConfig(cfg), parts = [`rm -rf ${q(`${r.laneDir}/jobs/${ticket}`)}`];
  for (const a of fetched) {
    if (!a.remote.startsWith(`${r.repo}/`)) continue; // outside the checkout: the job's own output place
    const rel = a.remote.slice(r.repo.length + 1);
    if (rel.split("/").includes("..")) continue;
    parts.push(a.error ? `[ -e ${q(a.remote)} ] && mkdir -p ${q(`/work/results/lane-${ticket}`)} && mv ${q(a.remote)} ${q(`/work/results/lane-${ticket}/`)}` : `rm -rf ${q(a.remote)}`);
  }
  return (await ssh(r, `${parts.join("; ")}; true`, { timeoutS: 60 })).code === 0;
}

/** Asks a running soak to yield ($SILTWAKE_JOB_YIELD appears on the sandbox). */
export async function remoteYield(cfg, ticket, on) {
  const r = remoteConfig(cfg), f = `${r.laneDir}/jobs/${ticket}/yield`;
  return (await ssh(r, on ? `: > ${q(f)}` : `rm -f ${q(f)}`, { timeoutS: 30 })).code === 0;
}

/**
 * Fetches each artifact whole (a file, or a directory such as an evidence
 * pack) into <artifactsDir>/<ticket>/<name>. Relative paths are the job's cwd
 * in the sandbox checkout. Returns [{ remote, local, bytes }] or
 * [{ remote, error }]: a failed fetch is reported, never dropped.
 */
export async function fetchArtifacts(cfg, ticket, paths, cwdRel) {
  const r = remoteConfig(cfg), dest = join(r.artifactsDir, ticket), out = [];
  for (const p of paths) {
    const remotePath = isAbsolute(p) ? p : `${r.repo}/${cwdRel === "." ? "" : `${cwdRel}/`}${p}`;
    mkdirSync(dest, { recursive: true });
    const res = await new Promise((done) => {
      const s = spawn(r.ssh[0], [...r.ssh.slice(1), `p=${q(remotePath)}; [ -e "$p" ] || { echo "no such file on the sandbox" >&2; exit 3; }; cd "$(dirname "$p")" && tar -cf - "$(basename "$p")"`], { stdio: ["ignore", "pipe", "pipe"] });
      const t = spawn("tar", ["-xf", "-", "-C", dest], { stdio: ["pipe", "ignore", "pipe"] });
      s.stdout.pipe(t.stdin);
      let err = "";
      s.stderr.on("data", (d) => { err += d; });
      t.stderr.on("data", (d) => { err += d; });
      let sc = null, tc = null;
      const end = () => { if (sc != null && tc != null) done({ code: sc || tc, err }); };
      s.on("close", (c) => { sc = c ?? 255; end(); });
      t.on("close", (c) => { tc = c ?? 1; end(); });
    });
    const local = join(dest, p.split("/").filter(Boolean).at(-1));
    if (res.code !== 0 || !existsSync(local)) { out.push({ remote: remotePath, error: (res.err.trim() || `exit ${res.code}`).slice(0, 200) }); continue; }
    const du = spawnSync("du", ["-sb", local], { encoding: "utf8" }).stdout;
    out.push({ remote: remotePath, local, bytes: Number(du.split("\t")[0]) || statSync(local).size });
  }
  return out;
}

/**
 * Absolute paths a command names outside its worktree (/work, /home, /tmp,
 * /mnt). The sandbox has only the commit, so such a command can't run there:
 * an input would be missing and an output left behind. Paths declared with
 * --artifact (outputs to fetch back) don't count.
 */
export function externalPaths(argv, worktree, artifacts = []) {
  const found = new Set();
  for (const token of argv) {
    for (const m of String(token).matchAll(/(?:^|[\s=:'"(])((?:\/work|\/home|\/tmp|\/mnt)\/[^\s'";)]*)/g)) {
      const p = resolve(m[1]);
      const rel = relative(worktree, p);
      if (!rel.startsWith("..") && !isAbsolute(rel)) continue; // inside the tree: the commit has it
      if (artifacts.some((a) => isAbsolute(a) && (p === resolve(a) || p.startsWith(`${resolve(a)}/`)))) continue;
      found.add(p);
    }
  }
  return [...found];
}
