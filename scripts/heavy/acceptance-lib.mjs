// Shared helpers for the heavy-check acceptance tests (acceptance.test.mjs,
// SCHED-1; acceptance-sched2.test.mjs, SCHED-2). Every test gets its own state
// directory, legacy lock file, test slice and unit prefixes under
// $SCHED1_TEST_ROOT (default /work/tmp/sched1-test), and injected host values,
// so production state and the live v1 lock are never touched.
import { after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { alive } from "./state.mjs";

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
  rmSync(ROOT, { recursive: true, force: true });
});

export function context(name, { mode = "normal", host = {}, config = null, slice = SLICE } = {}) {
  const dir = join(ROOT, `${++n}-${name}`);
  const sched = join(dir, "sched");
  mkdirSync(join(sched, "jobs"), { recursive: true });
  writeFileSync(join(sched, "mode"), `${mode}\n`);
  writeFileSync(join(sched, "host-override.json"), JSON.stringify({ nproc: 6, memAvailableMiB: 12000, memFullAvg10: 0, ...host }));
  if (config) writeFileSync(join(sched, "config.json"), JSON.stringify(config));
  const env = { ...process.env, SILTWAKE_SCHED_DIR: sched, SILTWAKE_SCHED_LEGACY_LOCK: join(dir, "legacy.lock"),
    SILTWAKE_SCHED_SLICE: slice, SILTWAKE_SCHED_UNIT_PREFIX: `sched1test-heavy-${n}`, SILTWAKE_SCHED_SUPERVISOR_PREFIX: `sched1test-sched-${n}` };
  for (const k of ["SILTWAKE_JOB_TICKET", "SILTWAKE_HEAVY_LOCK_HELD", "SILTWAKE_GPU_LEASE", "HEAVY_MEMORY_MAX", "HEAVY_LOCK_WAIT"]) delete env[k];
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
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(100);
  }
}
export const running = (c, id) => until(`${id} running`, () => ticketState(c, id) === "running", 30000);
export const done = (c, id, ms = 60000) => until(`${id} done`, () => result(c, id), ms);
export const blockedBy = (c, id) => hc(c, ["status"]).out.split("\n").find((l) => l.startsWith(id))?.split(/\s{2,}/)[5];
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

