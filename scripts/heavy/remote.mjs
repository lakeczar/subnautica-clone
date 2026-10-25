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
import { dirname, isAbsolute, join, normalize, relative, resolve } from "node:path";
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

/** A ticket's and an attempt's directories on the sandbox (the job's files),
 * and the attempt's receipt directory (the transport's --receipt DIR: receipt,
 * claim and scope), which the job is never told about. */
export const ticketDir = (r, ticket) => `${r.laneDir}/jobs/${ticket}`;
export const attemptDir = (r, ticket, attempt) => `${r.laneDir}/jobs/${ticket}/a${attempt}`;
export const receiptDir = (r, ticket, attempt) => `${r.laneDir}/receipts/${ticket}/a${attempt}`;

// The receipt's grammar (alickers-job.sh --receipt): every line is
// "<nonce> <phase> ...". `next` lists the phases allowed after each one.
const PHASES = {
  start: ["admitted", "busy", "abandoned"],
  admitted: ["sha", "setup-failed"],
  sha: ["setup-ok", "setup-failed"],
  "setup-ok": ["started"],
  started: ["lane", "after"],
  lane: ["lane", "after"],
  after: ["exit"],
  busy: [], abandoned: [], "setup-failed": [], exit: [],
};
const SHA = /^[0-9a-f]{40}$/;

/**
 * Parses an attempt's receipt against its nonce, strictly: a line with another
 * nonce or none, a phase out of order or repeated, a malformed phase or an
 * unterminated last line makes it invalid (`problem`), and an invalid receipt
 * establishes nothing. A valid one may still be incomplete (the job runs, or
 * the record stops): `complete` means it reached a last phase.
 */
export function parseReceipt(text, nonce) {
  const rc = { valid: true, problem: null, complete: false, admitted: false, busy: false, abandoned: false, sha: null, setup: null, setupFailed: null,
    dirtyAtAdmit: null, started: false, after: null, exit: null, refused: null, staged: [], stageMissing: [], stageFailed: [], stageDone: false };
  const bad = (why) => { rc.valid = false; rc.problem ??= why; return rc; };
  const body = String(text ?? "");
  if (!body) return rc;
  if (!body.endsWith("\n")) return bad("the receipt's last line is unterminated");
  if (!/^[0-9a-f]{32}$/.test(nonce ?? "")) return bad("no nonce for this attempt");
  let at = "start";
  for (const [i, line] of body.slice(0, -1).split("\n").entries()) {
    const [n, k, ...v] = line.split(" ");
    if (n !== nonce) return bad(`line ${i + 1} does not carry this attempt's nonce`);
    let phase = k, ok = true;
    if (k === "admitted") ok = v.length === 1 && /^\d+$/.test(v[0]);
    else if (k === "busy" || k === "abandoned" || k === "started") ok = v.length === 0;
    else if (k === "sha") ok = v.length === 1 && SHA.test(v[0]);
    else if (k === "setup" && v[0] === "ok") { phase = "setup-ok"; ok = v.length === 2 && /^(clean|restored:\d+)$/.test(v[1]); }
    else if (k === "setup" && v[0] === "failed") { phase = "setup-failed"; ok = v.length === 3 && /^[a-z-]+$/.test(v[1]) && /^\d+$/.test(v[2]); }
    else if (k === "lane") ok = v.length >= 1;
    else if (k === "after") ok = v.length === 2 && (SHA.test(v[0]) || v[0] === "none") && /^(clean|changed:\d+)$/.test(v[1]);
    else if (k === "exit") ok = v.length === 1 && /^\d+$/.test(v[0]);
    else ok = false;
    if (!ok) return bad(`line ${i + 1} is not a receipt phase: ${line.slice(33, 120)}`);
    if (!PHASES[at].includes(phase)) return bad(`"${phase}" after "${at}"`);
    at = phase;
    if (phase === "admitted") rc.admitted = true;
    else if (phase === "busy") rc.busy = true;
    else if (phase === "abandoned") rc.abandoned = true;
    else if (phase === "sha") rc.sha = v[0];
    else if (phase === "setup-ok") { rc.setup = "ok"; rc.dirtyAtAdmit = v[1]; }
    else if (phase === "setup-failed") { rc.setup = "failed"; rc.setupFailed = { step: v[1], code: Number(v[2]) }; }
    else if (phase === "started") rc.started = true;
    else if (phase === "after") rc.after = { head: v[0], clean: v[1] === "clean", changed: v[1] === "clean" ? 0 : Number(v[1].split(":")[1]) };
    else if (phase === "exit") rc.exit = Number(v[0]);
    else if (phase === "lane") {
      const [w, ...x] = v;
      if (w === "refused") rc.refused = x.join(" ");
      else if (w === "staged") rc.staged.push(x.join(" "));
      else if (w === "stage-missing") rc.stageMissing.push(x.join(" "));
      else if (w === "stage-failed") rc.stageFailed.push(x.join(" "));
      else if (w === "stage" && x[0] === "done") rc.stageDone = true;
    }
  }
  rc.complete = PHASES[at].length === 0;
  return rc;
}

/**
 * One out-of-band look at an attempt on the sandbox, from outside its cgroup:
 * its receipt (parsed against `nonce`), its wrapper's liveness (PID and start
 * time), its scope's memory.high count and its heartbeat file's mtime. Null if
 * unreachable. `text` is the raw receipt.
 */
export async function remoteRead(r, ticket, attempt, nonce) {
  const d = attemptDir(r, ticket, attempt), c = receiptDir(r, ticket, attempt);
  const res = await ssh(r, `d=${q(d)}; c=${q(c)}; echo "@@receipt"; cat "$c/receipt" 2>/dev/null; echo "@@end";` +
    ` alive=0; if [ -f "$d/pid" ]; then set -- $(cat "$d/pid"); [ "$3" = "$(cat /proc/sys/kernel/random/boot_id)" ] && [ "$(cut -d' ' -f22 /proc/$1/stat 2>/dev/null)" = "$2" ] && alive=1; fi; echo "alive $alive";` +
    ` cg=$(cat "$d/cgroup" 2>/dev/null); echo "high $(sed -n 's/^high //p' "$cg/memory.events" 2>/dev/null)"; echo "beat $(stat -c %Y "$d/heartbeat" 2>/dev/null)"`, { timeoutS: 20 });
  if (res.code !== 0) return null;
  const text = /@@receipt\n([\s\S]*?)@@end/.exec(res.out)?.[1] ?? "";
  const num = (k) => { const v = new RegExp(`^${k} (\\d+)$`, "m").exec(res.out)?.[1]; return v == null ? null : Number(v); };
  return { receipt: parseReceipt(text, nonce), text, alive: num("alive") === 1, high: num("high"), beat: num("beat") };
}

/**
 * Stops an attempt on the sandbox and says whether that is certain (R2-F3).
 * - Not yet admitted: the claim is taken as "abandon", so it can never start.
 * - Admitted: the scope identity the sandbox published before claiming
 *   ("<boot> <cgroup> <inode>", R3-F1) is checked against this boot first
 *   (R3-F2). One from another boot proves its processes are gone, and is never
 *   signalled. In this boot, its wrapper is TERMed (checked by PID, start time
 *   and boot); then, if anything is left in the job scope after graceS, the
 *   scope's cgroup (checked by its inode) is killed whole, detached and
 *   TERM-ignoring processes included.
 * An unreadable boot ID or identity fails closed (not stopped).
 * `cancel: true` also marks the logical ticket cancelled. Returns
 * { reached, stopped, started, detail }: stopped only when the attempt can't
 * start or its scope is provably empty or gone.
 */
export async function remoteStop(cfg, ticket, { attempt = null, cancel = false, r = remoteConfig(cfg), graceS = 10 } = {}) {
  const t = ticketDir(r, ticket);
  if (attempt == null) {
    const res = await ssh(r, `t=${q(t)}; mkdir -p "$t"; ${cancel ? `: > "$t/cancelled";` : ""} echo ok`, { timeoutS: 30 });
    return { reached: res.code === 0, stopped: res.code === 0, started: false };
  }
  const d = attemptDir(r, ticket, attempt), c = receiptDir(r, ticket, attempt);
  const res = await ssh(r, `t=${q(t)} d=${q(d)} c=${q(c)}; mkdir -p "$t" "$d" "$c"; ${cancel ? `: > "$t/cancelled";` : `: > "$d/retired";`}
ln -s abandon "$c/claim" 2>/dev/null
[ "$(readlink "$c/claim")" = abandon ] && { echo "stopped 1 started 0"; exit 0; }
boot=$(cat /proc/sys/kernel/random/boot_id 2>/dev/null)
case "$boot" in ????????-????-????-????-????????????) ;; *) echo "stopped 0 started 1 (this boot's ID is unreadable)"; exit 0 ;; esac
read -r rboot cg ino rest < "$c/scope" 2>/dev/null
case "$rboot:$cg:$ino:$rest" in ????????-????-????-????-????????????:/sys/fs/cgroup/*:[0-9]*:) ;; *) echo "stopped 0 started 1 (no valid scope identity)"; exit 0 ;; esac
case "$ino" in *[!0-9]*) echo "stopped 0 started 1 (no valid scope identity)"; exit 0 ;; esac
[ "$rboot" = "$boot" ] || { echo "stopped 1 started 1 (recorded in another boot: its processes are gone)"; exit 0; }
mine() { [ -d "$cg" ] && [ "$(stat -c %i "$cg" 2>/dev/null)" = "$ino" ]; }
gone() { ! mine || grep -qx 'populated 0' "$cg/cgroup.events" 2>/dev/null; }
gone && { echo "stopped 1 started 1"; exit 0; }
if [ -f "$d/pid" ]; then set -- $(cat "$d/pid"); [ "$3" = "$boot" ] && [ "$(cut -d' ' -f22 /proc/$1/stat 2>/dev/null)" = "$2" ] && kill -TERM "$1"; fi
i=0; while [ $i -lt ${Number(graceS)} ]; do sleep 1; i=$((i+1)); gone && { echo "stopped 1 started 1"; exit 0; }; done
mine && { echo 1 > "$cg/cgroup.kill" 2>/dev/null || find "$cg" -name cgroup.procs -exec cat {} + | xargs -r kill -KILL; }
i=0; while [ $i -lt 10 ]; do sleep 1; i=$((i+1)); gone && { echo "stopped 1 started 1 (killed)"; exit 0; }; done
echo "stopped 0 started 1 (its scope is still populated)"`, { timeoutS: Number(graceS) + 40 });
  return { reached: res.code === 0, stopped: res.code === 0 && /^stopped 1/m.test(res.out), started: !/started 0/.test(res.out), detail: /^stopped .*$/m.exec(res.out)?.[0] ?? null };
}

/**
 * Gives up an attempt the sandbox has not admitted yet (an any or soak job
 * whose admission is late, R2-F4), without touching one it has: the claim is
 * taken as "abandon" only if the sandbox hasn't taken it as "run". Returns
 * { reached, abandoned }: abandoned means it can never start.
 */
export async function remoteAbandon(r, ticket, attempt) {
  const c = receiptDir(r, ticket, attempt);
  const res = await ssh(r, `c=${q(c)}; mkdir -p "$c"; ln -s abandon "$c/claim" 2>/dev/null; echo "claim $(readlink "$c/claim")"`, { timeoutS: 30 });
  return { reached: res.code === 0, abandoned: res.code === 0 && /^claim abandon$/m.test(res.out) };
}

/** Makes `attempt` the ticket's current one on the sandbox (lane-run.sh runs only that one). */
export async function setCurrent(r, ticket, attempt) {
  const t = ticketDir(r, ticket);
  return (await ssh(r, `t=${q(t)}; mkdir -p "$t" && echo ${Number(attempt)} > "$t/current.tmp" && mv "$t/current.tmp" "$t/current"`, { timeoutS: 30 })).code === 0;
}

/** Removes an attempt's directories on the sandbox (its staged outputs and receipt included). */
export async function removeAttempt(r, ticket, attempt) {
  const d = attemptDir(r, ticket, attempt), c = receiptDir(r, ticket, attempt);
  return (await ssh(r, `d=${q(d)}; [ -d "$d" ] && chmod -R u+w "$d"; rm -rf "$d" ${q(c)}; for t in ${q(ticketDir(r, ticket))} ${q(`${r.laneDir}/receipts/${ticket}`)}; do` +
    ` [ -d "$t" ] && [ -z "$(ls -A "$t" | grep -v '^current$')" ] && rm -rf "$t"; done; true`, { timeoutS: 60 })).code === 0;
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

// A command that only builds, and what it builds (SCHED-3 R1-F2).
const BUILDS = [
  [["npm", "run", "build"], "dist"], [["npx", "vite", "build"], "dist"], [["vite", "build"], "dist"],
  [["npm", "run", "test:build"], ".test-build"], [["node", "scripts/test-build.mjs"], ".test-build"],
];
/**
 * A command that only builds, run where its output doesn't come back: its
 * output in this worktree is the point. Returns { command, output } when no
 * --artifact covers the output, else null. A build followed by other work can
 * go. Its output: with no options after the command, the table's (covered by
 * that --artifact, or `.`); with options (`-- --outDir x`, a mode …), the
 * caller's declared --artifact is the output contract, so any declared one
 * will do, and `output` is null (R2-F2). One command line only: `sh -c` with a
 * separator or a newline is more than a build.
 */
export function buildOnly(argv, artifacts = []) {
  let words = argv.map(String);
  if (/^(?:ba)?sh$/.test(words[0] ?? "") && words[1] === "-c" && words.length === 3) {
    if (/[;&|\n`$(]/.test(words[2])) return null;
    words = words[2].trim().split(/\s+/);
  }
  const hit = BUILDS.find(([cmd]) => cmd.every((w, i) => words[i] === w));
  if (!hit) return null;
  const [cmd, output] = hit, options = words.length > cmd.length;
  const declared = options ? artifacts.length > 0 : artifacts.some((a) => !isAbsolute(a) && [".", output].includes(normalize(a).replace(/\/$/, "")));
  return declared ? null : { command: cmd.join(" "), output: options ? null : output };
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
