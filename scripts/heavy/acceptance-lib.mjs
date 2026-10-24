// Shared helpers for the heavy-check acceptance tests (acceptance.test.mjs,
// SCHED-1; acceptance-sched2.test.mjs, SCHED-2). Every test gets its own state
// directory, legacy lock file, test slice and unit prefixes under
// $SCHED1_TEST_ROOT (default /work/tmp/sched1-test), and injected host values,
// so production state and the live v1 lock are never touched.
import { after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { alive, machineCpus } from "./state.mjs";

export const here = dirname(fileURLToPath(import.meta.url));
export const CLI = join(here, "heavy-check.mjs");
// The real v1 script comes from this repository's history (1ccce66); point
// SCHED1_V1_REPO at a checkout when running a copy of this file elsewhere.
export const V1_REPO = process.env.SCHED1_V1_REPO ?? here;
export const ROOT = join(process.env.SCHED1_TEST_ROOT ?? "/work/tmp/sched1-test", `acceptance-${process.pid}`);
export const SLICE = "sched1test.slice";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const contexts = [];

after(() => {
  for (const c of contexts) for (const id of Object.keys(state(c).tickets ?? {})) hc(c, ["cancel", id]);
  spawnSync("systemctl", ["--user", "stop", SLICE], { stdio: "ignore" });
  let reload = false;
  for (const c of contexts) if (c.env.SILTWAKE_SCHED_EXCLUSIVE_SLICE) {
    const name = c.env.SILTWAKE_SCHED_EXCLUSIVE_SLICE, unit = join(process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid()}`, "systemd", "user", name);
    spawnSync("systemctl", ["--user", "revert", name], { stdio: "ignore" });
    spawnSync("systemctl", ["--user", "stop", name], { stdio: "ignore" });
    if (existsSync(unit)) { rmSync(unit, { force: true }); reload = true; } // a runtime unit a private install.sh wrote
  }
  if (reload) spawnSync("systemctl", ["--user", "daemon-reload"], { stdio: "ignore" });
  if (!process.env.SCHED_KEEP) { spawnSync("chmod", ["-R", "u+w", ROOT]); rmSync(ROOT, { recursive: true, force: true }); } // staged outputs are read-only // SCHED_KEEP=1 keeps the evidence
});

export function context(name, { mode = "normal", host = {}, config = null, slice = SLICE } = {}) {
  const dir = join(ROOT, `${++n}-${name}`);
  const sched = join(dir, "sched");
  mkdirSync(join(sched, "jobs"), { recursive: true });
  writeFileSync(join(sched, "mode"), `${mode}\n`);
  writeFileSync(join(sched, "host-override.json"), JSON.stringify({ nproc: 6, memAvailableMiB: 12000, memFullAvg10: 0, ...host }));
  if (config) writeFileSync(join(sched, "config.json"), JSON.stringify(config));
  const env = { ...process.env, SILTWAKE_SCHED_DIR: sched, SILTWAKE_SCHED_LEGACY_LOCK: join(dir, "legacy.lock"),
    SILTWAKE_SCHED_SLICE: slice, SILTWAKE_SCHED_UNIT_PREFIX: `sched1test-heavy-${n}`, SILTWAKE_SCHED_SUPERVISOR_PREFIX: `sched1test-sched-${n}`,
    SILTWAKE_SCHED_EXCLUSIVE_SLICE: `sched1testexcl${process.pid}x${n}.slice` }; // a private top-level exclusive slice (TST-16; set up by exclusiveSlice())
  // Nothing of an enclosing queue job leaks in (the suites run inside one, SCHED-3 R2-F4): its ticket, lease, reservation and heartbeat.
  for (const k of Object.keys(env)) if (/^(SILTWAKE_JOB_|SILTWAKE_HEAVY_)/.test(k) || ["SILTWAKE_GPU_LEASE", "SILTWAKE_TEST_BUILD", "BAKE_WORKERS", "HEAVY_MEMORY_MAX", "HEAVY_LOCK_WAIT"].includes(k)) delete env[k];
  const c = { dir, sched, env, legacy: join(dir, "legacy.lock"), n };
  c.wt = (w) => { const p = join(dir, `wt-${w}`); mkdirSync(p, { recursive: true }); return p; };
  /** A git worktree with one committed file, file.txt = "v1". */
  c.repo = (w) => {
    const p = c.wt(w), git = (...args) => spawnSync("git", ["-C", p, ...args], { encoding: "utf8" });
    git("init", "-q"); writeFileSync(join(p, "file.txt"), "v1\n");
    git("add", "file.txt"); git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "v1");
    return p;
  };
  contexts.push(c);
  return c;
}
export const host = (c, values) => writeFileSync(join(c.sched, "host-override.json"), JSON.stringify({ nproc: 6, memAvailableMiB: 12000, memFullAvg10: 0, ...values }));
export const hc = (c, args, { cwd = c.dir, env = {} } = {}) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, env: { ...c.env, ...env }, encoding: "utf8", timeout: 180000 });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
export function submit(c, cwd, ...args) {
  const r = hc(c, ["submit", ...args], { cwd });
  assert.equal(r.code, 0, r.err);
  return r.out.trim();
}
export const read = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
export const state = (c) => read(join(c.sched, "state.json")) ?? { tickets: {} };
export const grant = (c, id) => read(join(c.sched, "jobs", id, "grant.json"));
export const result = (c, id) => read(join(c.sched, "jobs", id, "exit.json"));
export const ticketState = (c, id) => state(c).tickets[id]?.state ?? (result(c, id) ? "done" : "none");
export async function until(what, fn, ms = 30000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(100);
  }
}
export const running = (c, id) => until(`${id} running`, () => ticketState(c, id) === "running", 30000);
export const done = (c, id, ms = 60000) => until(`${id} done`, () => result(c, id), ms);
export const blockedBy = (c, id) => hc(c, ["status"]).out.split("\n").find((l) => l.startsWith(id))?.split(/\s{2,}/)[6];
export const scopeActive = (unit) => spawnSync("systemctl", ["--user", "is-active", "--quiet", `${unit}.scope`]).status === 0;
export const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
/** SIGKILLs a scheduler process only if it is still the same process (PID plus start time). */
export const killOwned = (p) => { assert.ok(alive(p), "the process to kill is still ours"); process.kill(p.pid, "SIGKILL"); };
/** The running ticket once its holder has claimed it; the supervisor has exited by then. */
export const holderOf = async (c, id) => {
  const t = await until(`${id} claimed`, () => state(c).tickets[id]?.holder && state(c).tickets[id]);
  await until("supervisor exits after the handoff", () => !alive(t.supervisor));
  return t;
};
/** The real v1 script from 1ccce66, pointed at the context's private lock and unit names. */
export function v1Script(c) {
  const v1 = join(c.dir, "heavy-check-v1.sh");
  const src = spawnSync("git", ["-C", V1_REPO, "show", "1ccce66:scripts/heavy-check.sh"], { encoding: "utf8" }).stdout;
  assert.match(src, /flock/, "the v1 script source is available (set SCHED1_V1_REPO)");
  writeFileSync(v1, src.replace("/work/tmp/siltwake-heavy-check.lock", c.legacy).replace('unit="siltwake-heavy-', `unit="sched1test-v1-${c.n}-`), { mode: 0o755 });
  return (cmd) => {
    const p = spawn("bash", [v1, "--deadline", "60", "sh", "-c", cmd], { cwd: c.dir, env: c.env, stdio: "ignore" });
    p.exited = new Promise((r) => p.on("exit", r));
    return p;
  };
}


/**
 * A fake second worker for the remote lane's tests (SCHED-2b), entirely in the
 * context's directory, driven by the REAL transport (scripts/alickers-job.sh)
 * through its test seams: ALICKERS_SSH is an ssh stand-in (runs the command
 * here, with the sandbox's PATH and HOME, or exits 255 while FAKE/unreachable
 * exists), ALICKERS_REPO the sandbox checkout (a clone of the test worktree,
 * so the transport's own `git fetch origin` finds the commit) and ALICKERS_TMP
 * its scratch directory, ALICKERS_LOCK its job lock (all with ALICKERS_TEST_MODE=1
 * and this private state, R2-F5). `siltwake-job` is a copy of the sandbox's (its one-job
 * lock, the owner's pause flag giving 75, its own user scope with MemoryHigh
 * at 85% of MemoryMax, or FAKE_MEMORY_HIGH, and no swap). FAKE/npm, if written,
 * replaces npm on the sandbox. Returns the remote config for config.json.
 */
export function fakeSandbox(c, extra = {}) {
  const f = join(c.dir, "fake-alickers");
  mkdirSync(join(f, "home", ".local", "state", "siltwake"), { recursive: true });
  mkdirSync(join(f, "bin"), { recursive: true });
  mkdirSync(join(f, "tmp"), { recursive: true });
  const w = (name, body) => { writeFileSync(join(f, name), body, { mode: 0o755 }); return join(f, name); };
  const ssh = w("ssh", [
    "#!/bin/bash",
    "# fake ssh: the last argument is the remote command",
    "cmd=\"${@: -1}\"",
    "[ -e \"$FAKE/unreachable\" ] && { echo \"ssh: connect to host siltwake-alickers: Connection refused\" >&2; exit 255; }",
    "if [ -e \"$FAKE/slow-probe\" ] && [[ \"$cmd\" == *\"then echo paused\"* ]]; then sleep \"${FAKE_SSH_DELAY:-4}\"; fi",
    "if [ -e \"$FAKE/stall-fetch\" ] && [[ \"$cmd\" == *\"tar -cf\"* ]]; then sleep 3600; fi",
    "if [ -e \"$FAKE/slow-fetch\" ] && [[ \"$cmd\" == *\"tar -cf\"* ]]; then sleep 1.5; fi",
    "# The transport's connection fails before admission (the probe still works).",
    "if [ -e \"$FAKE/transport-down\" ] && [[ \"$cmd\" == *\"git fetch\"* ]]; then echo \"ssh: connection reset\" >&2; exit 255; fi",
    "# The session drops once, just after the job is handed to the sandbox, which carries on.",
    "if [ -e \"$FAKE/drop-once\" ] && [[ \"$cmd\" == *\"siltwake-job\"* ]]; then rm -f \"$FAKE/drop-once\"; cat > \"$FAKE/drop-stdin\"; HOME=\"$FAKE/home\" PATH=\"$FAKE/bin:$PATH\" FAKE_START_DELAY=3 setsid bash -c \"$cmd\" >/dev/null 2>&1 < \"$FAKE/drop-stdin\" & sleep 1; echo \"ssh: connection lost\" >&2; exit 255; fi",
    "# The session drops once the job has started on the sandbox (which carries on, its scope included).",
    "if [ -e \"$FAKE/drop-midrun\" ] && [[ \"$cmd\" == *\"siltwake-job\"* ]]; then rm -f \"$FAKE/drop-midrun\"; cat > \"$FAKE/drop-stdin\"; HOME=\"$FAKE/home\" PATH=\"$FAKE/bin:$PATH\" setsid bash -c \"$cmd\" >/dev/null 2>&1 < \"$FAKE/drop-stdin\" & for i in $(seq 1 200); do [ -e \"$FAKE/repo/midrun-started\" ] && break; sleep 0.05; done; sleep 0.5; echo \"ssh: connection lost\" >&2; exit 255; fi",
    "# The transport's ssh exits 0 whatever the job command did (a transport that can't be trusted).",
    "if [ -e \"$FAKE/exit-zero\" ] && [[ \"$cmd\" == *\"siltwake-job\"* ]]; then HOME=\"$FAKE/home\" PATH=\"$FAKE/bin:$PATH\" bash -c \"$cmd\"; exit 0; fi",
    "# The sandbox side outlives this ssh process, as a real sandbox's command outlives a lost session.",
    "if [ -e \"$FAKE/detach-job\" ] && [[ \"$cmd\" == *\"siltwake-job\"* ]]; then HOME=\"$FAKE/home\" PATH=\"$FAKE/bin:$PATH\" setsid bash -c \"$cmd\" 0<&0 >>\"$FAKE/detached.log\" 2>&1 & wait $!; exit $?; fi",
    "HOME=\"$FAKE/home\" PATH=\"$FAKE/bin:$PATH\" exec bash -c \"$cmd\"",
    "",
  ].join("\n"));
  // The claim boundary (R3-F1): the sandbox's shell dies just before or just after claiming "run".
  w("bin/ln", `#!/bin/bash
if [ "$1" = -s ] && [ "$2" = run ]; then
  if [ -e "$FAKE/crash-before-claim" ]; then rm -f "$FAKE/crash-before-claim"; kill -9 $PPID; exit 1; fi
  if [ -e "$FAKE/crash-after-claim" ]; then rm -f "$FAKE/crash-after-claim"; /usr/bin/ln "$@"; s=$?; kill -9 $PPID; exit $s; fi
fi
exec /usr/bin/ln "$@"
`);
  w("bin/siltwake-job", `#!/usr/bin/env bash
# siltwake-job, as on the sandbox, with private paths and unit names
set -euo pipefail
memory=8G deadline=1800
while [[ $# -gt 0 ]]; do case "$1" in --memory) memory="$2"; shift 2;; --deadline) deadline="$2"; shift 2;; --) shift; break;; *) break;; esac; done
# race-lock: another agent's direct call takes the lock between the transport's no-wait check and this flock.
if [[ -e "$FAKE/race-lock" ]]; then rm -f "$FAKE/race-lock"; setsid flock "$FAKE/lock" sleep "\${FAKE_RACE_HOLD:-8}" </dev/null >/dev/null 2>&1 & sleep 0.5; fi
exec 9>"$FAKE/lock"
flock -w "\${FAKE_LOCK_WAIT:-3600}" 9 || exit 75
if [[ -e "$FAKE/home/.local/state/siltwake/paused" ]]; then echo 'Sandbox paused by owner' >&2; exit 75; fi
sleep "\${FAKE_START_DELAY:-0}"
unit="sched2bfake-${c.n}-job-$$"
cleanup() { [[ -e "$FAKE/slow-cleanup" ]] && sleep 4; systemctl --user stop "$unit.scope" >/dev/null 2>&1 || true; }
trap cleanup EXIT
trap 'exit 143' TERM HUP
status=0
systemd-run --user --scope --quiet --unit="$unit" -p MemoryHigh="\${FAKE_MEMORY_HIGH:-$(( \${memory%G} * 850 ))M}" -p MemoryMax="$memory" \\
  -p MemorySwapMax=0 -p CPUQuota=600% -p Delegate=yes timeout --kill-after=10s "\${deadline}s" "$@" || status=$?
exit "$status"
`);
  const repo = join(f, "repo");
  const remote = { ssh: [ssh], repo, laneDir: join(f, "lane"), lock: join(f, "lock"), artifactsDir: join(c.dir, "artifacts"),
    tickS: 1, throttleNoticeS: 3, fetchInactivityS: 3, admitGraceS: 3, retryBaseS: 1, retryMaxS: 2, recheckS: { up: 2, paused: 2, unreachable: 2, unreachableMax: 4 }, ...extra };
  // The transport's test seams, honoured only in test mode with this private state (R2-F5).
  Object.assign(c.env, { FAKE: f, ALICKERS_TEST_MODE: "1", ALICKERS_SSH: ssh, ALICKERS_REPO: repo, ALICKERS_TMP: join(f, "tmp"), ALICKERS_LOCK: join(f, "lock") });
  c.fake = { dir: f, repo,
    /** The sandbox's checkout, cloned from a worktree (its origin), as the real sandbox's is from GitHub. */
    clone: (from) => { if (!existsSync(join(repo, ".git"))) spawnSync("git", ["clone", "-q", from, repo]); },
    pause: (on) => (on ? writeFileSync(join(f, "home", ".local", "state", "siltwake", "paused"), "") : rmSync(join(f, "home", ".local", "state", "siltwake", "paused"), { force: true })),
    unreachable: (on) => (on ? writeFileSync(join(f, "unreachable"), "") : rmSync(join(f, "unreachable"), { force: true })),
    flag: (name, on) => (on ? writeFileSync(join(f, name), "") : rmSync(join(f, name), { force: true })),
    npm: (body) => (body == null ? rmSync(join(f, "bin", "npm"), { force: true }) : w("bin/npm", `#!/bin/bash\n${body}\n`)),
    /** A direct caller: siltwake-job run by hand in the sandbox checkout, as another agent's alickers-job.sh would. */
    direct: (script) => spawn("bash", ["-c", `cd ${repo} && siltwake-job --deadline 120 bash -c ${JSON.stringify(script)}`], { env: { ...c.env, HOME: join(f, "home"), PATH: `${join(f, "bin")}:${process.env.PATH}` }, stdio: "ignore" }),
  };
  return remote;
}

/**
 * Sets up the context's private exclusive slice as install.sh's unit file
 * would (TST-16): a fixed CPUWeight, no swap, a memory cap. Test setup only;
 * the scheduler itself never sets a property on it.
 */
export async function exclusiveSlice(c, { weight = 10000, memoryMiB = null } = {}) {
  const name = c.env.SILTWAKE_SCHED_EXCLUSIVE_SLICE;
  const { sliceLimits } = await import("./policy.mjs");
  const { loadConfig } = await import("./state.mjs");
  const cfg = loadConfig(c.env), w = sliceLimits(machineCpus(cfg), cfg); // as install.sh writes the unit
  const r = spawnSync("systemctl", ["--user", "set-property", "--runtime", name, `CPUWeight=${weight}`, `CPUQuota=${w.cpuQuotaPct}%`, `MemoryMax=${memoryMiB ?? w.memoryMaxMiB}M`, "MemorySwapMax=0"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return name;
}
