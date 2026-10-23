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
    retryBaseS: 15, retryMaxS: 300, // a 4070 ticket's backoff after a failed dispatch: 15 s, doubling, at most 5 min; it waits until its queue timeout
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

/** A ticket's and an attempt's directories on the sandbox. */
export const ticketDir = (r, ticket) => `${r.laneDir}/jobs/${ticket}`;
export const attemptDir = (r, ticket, attempt) => `${r.laneDir}/jobs/${ticket}/a${attempt}`;

/** Parses a receipt (alickers-job.sh --receipt, plus lane-run.sh's lines). */
export function parseReceipt(text) {
  const rc = { admitted: false, sha: null, setup: null, setupFailed: null, started: false, exit: null, refused: null, staged: [], stageMissing: [], stageFailed: [], stageDone: false };
  for (const line of String(text ?? "").split("\n")) {
    const [k, ...v] = line.trim().split(/\s+/);
    if (k === "admitted") rc.admitted = true;
    else if (k === "sha" && /^[0-9a-f]{40}$/.test(v[0] ?? "")) rc.sha = v[0];
    else if (k === "setup" && v[0] === "ok") rc.setup = "ok";
    else if (k === "setup" && v[0] === "failed") { rc.setup = "failed"; rc.setupFailed = { step: v[1] ?? "?", code: Number(v[2]) }; }
    else if (k === "started") rc.started = true;
    else if (k === "exit" && /^\d+$/.test(v[0] ?? "")) rc.exit = Number(v[0]);
    else if (k === "refused") rc.refused = v.join(" ");
    else if (k === "staged") rc.staged.push(v.join(" "));
    else if (k === "stage-missing") rc.stageMissing.push(v.join(" "));
    else if (k === "stage-failed") rc.stageFailed.push(v.join(" "));
    else if (k === "stage" && v[0] === "done") rc.stageDone = true;
  }
  return rc;
}

/**
 * One out-of-band look at an attempt on the sandbox, from outside its cgroup:
 * its receipt, its wrapper's liveness (PID and start time), its scope's
 * memory.high count and its heartbeat file's mtime. Null if unreachable.
 */
export async function remoteRead(r, ticket, attempt) {
  const d = attemptDir(r, ticket, attempt);
  const res = await ssh(r, `d=${q(d)}; echo "@@receipt"; cat "$d/receipt" 2>/dev/null; echo "@@end";` +
    ` alive=0; if [ -f "$d/pid" ]; then set -- $(cat "$d/pid"); [ "$(cut -d' ' -f22 /proc/$1/stat 2>/dev/null)" = "$2" ] && alive=1; fi; echo "alive $alive";` +
    ` cg=$(cat "$d/cgroup" 2>/dev/null); echo "high $(sed -n 's/^high //p' "$cg/memory.events" 2>/dev/null)"; echo "beat $(stat -c %Y "$d/heartbeat" 2>/dev/null)"`, { timeoutS: 20 });
  if (res.code !== 0) return null;
  const receipt = parseReceipt(/@@receipt\n([\s\S]*?)@@end/.exec(res.out)?.[1] ?? "");
  const num = (k) => { const v = new RegExp(`^${k} (\\d+)$`, "m").exec(res.out)?.[1]; return v == null ? null : Number(v); };
  return { receipt, alive: num("alive") === 1, high: num("high"), beat: num("beat") };
}

/**
 * Stops work on the sandbox, checked by PID and start time.
 * - `cancel: true`: the logical ticket is cancelled (a not-yet-started attempt never starts).
 * - otherwise only `attempt` is retired: a later attempt is unaffected (R1-F4).
 * Returns { reached, alive } (alive: the attempt's wrapper still runs after the TERM).
 */
export async function remoteStop(cfg, ticket, { attempt = null, cancel = false, r = remoteConfig(cfg) } = {}) {
  const t = ticketDir(r, ticket), d = attempt == null ? null : attemptDir(r, ticket, attempt);
  const res = await ssh(r, `t=${q(t)}; mkdir -p "$t"; ${cancel ? `: > "$t/cancelled";` : ""}` +
    (d ? ` d=${q(d)}; mkdir -p "$d"; ${cancel ? "" : `: > "$d/retired";`} if [ -f "$d/pid" ]; then set -- $(cat "$d/pid");` +
      ` if [ "$(cut -d' ' -f22 /proc/$1/stat 2>/dev/null)" = "$2" ]; then kill -TERM "$1"; for i in 1 2 3 4 5 6 7 8 9 10; do sleep 1;` +
      ` [ "$(cut -d' ' -f22 /proc/$1/stat 2>/dev/null)" = "$2" ] || { echo "alive 0"; exit 0; }; done; echo "alive 1"; exit 0; fi; fi; echo "alive 0"` : ` echo "alive 0"`), { timeoutS: 40 });
  return { reached: res.code === 0, alive: /alive 1/.test(res.out) };
}

/** Makes `attempt` the ticket's current one on the sandbox (lane-run.sh runs only that one). */
export async function setCurrent(r, ticket, attempt) {
  const t = ticketDir(r, ticket);
  return (await ssh(r, `t=${q(t)}; mkdir -p "$t" && echo ${Number(attempt)} > "$t/current.tmp" && mv "$t/current.tmp" "$t/current"`, { timeoutS: 30 })).code === 0;
}

/** Removes an attempt's directory on the sandbox (its staged outputs included). */
export async function removeAttempt(r, ticket, attempt) {
  const d = attemptDir(r, ticket, attempt);
  return (await ssh(r, `d=${q(d)}; [ -d "$d" ] && chmod -R u+w "$d"; rm -rf "$d"; t=${q(ticketDir(r, ticket))}; [ -z "$(ls -A "$t" | grep -v '^current$')" ] && rm -rf "$t"; true`, { timeoutS: 60 })).code === 0;
}

/** Asks a running soak attempt to yield ($SILTWAKE_JOB_YIELD appears on the sandbox). */
export async function remoteYield(r, ticket, attempt, on) {
  const f = `${attemptDir(r, ticket, attempt)}/yield`;
  return (await ssh(r, on ? `: > ${q(f)}` : `rm -f ${q(f)}`, { timeoutS: 30 })).code === 0;
}

/**
 * Fetches an attempt's staged outputs (lane-run.sh stage/, immutable, written
 * inside the sandbox's lock) into <dest>, each whole. Bounded (R1-F7): the
 * transfer is aborted, both ends killed, when no bytes arrived for
 * inactivityS, after ceilingS, or as soon as cancelled() says so. Returns
 * { ok, bytes, error }; on failure the staged outputs stay on the sandbox.
 */
export function fetchStage(r, ticket, attempt, dest, { inactivityS = 60, ceilingS = 1800, cancelled = () => false } = {}) {
  mkdirSync(dest, { recursive: true });
  const stage = `${attemptDir(r, ticket, attempt)}/stage`;
  return new Promise((done) => {
    const s = spawn(r.ssh[0], [...r.ssh.slice(1), `cd ${q(stage)} && tar -cf - .`], { stdio: ["ignore", "pipe", "pipe"], detached: true });
    const t = spawn("tar", ["-xf", "-", "-C", dest], { stdio: ["pipe", "ignore", "pipe"], detached: true });
    let err = "", bytes = 0, last = Date.now(), aborted = null, sc = null, tc = null;
    const kill = () => { for (const p of [s, t]) { try { process.kill(-p.pid, "SIGKILL"); } catch { /* gone */ } } };
    s.stdout.on("data", (d) => { bytes += d.length; last = Date.now(); if (!t.stdin.write(d)) s.stdout.pause(); });
    t.stdin.on("drain", () => s.stdout.resume());
    t.stdin.on("error", () => {});
    s.stdout.on("end", () => t.stdin.end());
    s.stderr.on("data", (d) => { err += d; });
    t.stderr.on("data", (d) => { err += d; });
    const started = Date.now();
    const watch = setInterval(() => {
      const why = cancelled() ? "cancelled" : Date.now() - last > inactivityS * 1000 ? `no data for ${inactivityS} s` : Date.now() - started > ceilingS * 1000 ? `over ${ceilingS} s` : null;
      if (why && !aborted) { aborted = why; kill(); }
    }, 500);
    const end = () => {
      if (sc == null || tc == null) return;
      clearInterval(watch);
      const ok = !aborted && sc === 0 && tc === 0;
      // The stage is read-only on the sandbox; the copy here is the caller's to use.
      if (ok) spawnSync("chmod", ["-R", "u+w", dest]);
      done({ ok, bytes, error: ok ? null : aborted ? `transfer aborted: ${aborted}` : (err.trim() || `exit ${sc || tc}`).slice(0, 200) });
    };
    s.on("close", (c) => { sc = c ?? 255; end(); });
    t.on("close", (c) => { tc = c ?? 1; end(); });
  });
}

/** Build outputs a command reads that a commit doesn't carry: `.test-build*`
 * (the transport clears it when the commit changes) and `dist`. Such a
 * command must compile inside the job to run on alickers (npm run playthrough,
 * npm run build && …). */
export function builtOutputs(argv) {
  return [...new Set(argv.flatMap((t) => [...String(t).matchAll(/(?:^|[\s=:'"(/])(\.test-build[^\s/'";)]*|dist)(?=\/|$|[\s'";)])/g)].map((m) => m[1])))];
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
