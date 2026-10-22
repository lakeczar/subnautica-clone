// heavy-check v2 acceptance tests (DECISION-OPUS §5), against real systemd
// scopes and processes, with sleep and allocation payloads only:
//
//   node --test --test-concurrency=1 scripts/heavy/acceptance.test.mjs
//
// Every test gets its own state directory, legacy lock file, test slice and
// unit prefixes under $SCHED1_TEST_ROOT (default /work/tmp/sched1-test), and
// injected host values, so production state and the live v1 lock are never
// touched. Takes about four minutes, mostly sleeping. Test 4 (no starvation)
// needs an injected clock and lives in tests/heavy-sched-policy.test.ts.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { heavyJobGuard } from "./build-guard.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "heavy-check.mjs");
const ROOT = join(process.env.SCHED1_TEST_ROOT ?? "/work/tmp/sched1-test", `acceptance-${process.pid}`);
const SLICE = "sched1test.slice";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const contexts = [];

after(() => {
  for (const c of contexts) for (const id of Object.keys(state(c).tickets ?? {})) hc(c, ["cancel", id]);
  spawnSync("systemctl", ["--user", "stop", SLICE], { stdio: "ignore" });
  rmSync(ROOT, { recursive: true, force: true });
});

function context(name, { mode = "normal", host = {} } = {}) {
  const dir = join(ROOT, `${++n}-${name}`);
  const sched = join(dir, "sched");
  mkdirSync(join(sched, "jobs"), { recursive: true });
  writeFileSync(join(sched, "mode"), `${mode}\n`);
  writeFileSync(join(sched, "host-override.json"), JSON.stringify({ nproc: 6, memAvailableMiB: 12000, memFullAvg10: 0, ...host }));
  const env = { ...process.env, SILTWAKE_SCHED_DIR: sched, SILTWAKE_SCHED_LEGACY_LOCK: join(dir, "legacy.lock"),
    SILTWAKE_SCHED_SLICE: SLICE, SILTWAKE_SCHED_UNIT_PREFIX: `sched1test-heavy-${n}`, SILTWAKE_SCHED_SUPERVISOR_PREFIX: `sched1test-sched-${n}` };
  for (const k of ["SILTWAKE_JOB_TICKET", "SILTWAKE_HEAVY_LOCK_HELD", "SILTWAKE_GPU_LEASE", "HEAVY_MEMORY_MAX", "HEAVY_LOCK_WAIT"]) delete env[k];
  const c = { dir, sched, env, legacy: join(dir, "legacy.lock"), n };
  c.wt = (w) => { const p = join(dir, `wt-${w}`); mkdirSync(p, { recursive: true }); return p; };
  contexts.push(c);
  return c;
}
const host = (c, values) => writeFileSync(join(c.sched, "host-override.json"), JSON.stringify({ nproc: 6, memAvailableMiB: 12000, memFullAvg10: 0, ...values }));
const hc = (c, args, { cwd = c.dir, env = {} } = {}) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, env: { ...c.env, ...env }, encoding: "utf8", timeout: 180000 });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
function submit(c, cwd, ...args) {
  const r = hc(c, ["submit", ...args], { cwd });
  assert.equal(r.code, 0, r.err);
  return r.out.trim();
}
const read = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const state = (c) => read(join(c.sched, "state.json")) ?? { tickets: {} };
const grant = (c, id) => read(join(c.sched, "jobs", id, "grant.json"));
const result = (c, id) => read(join(c.sched, "jobs", id, "exit.json"));
const ticketState = (c, id) => state(c).tickets[id]?.state ?? (result(c, id) ? "done" : "none");
async function until(what, fn, ms = 30000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(100);
  }
}
const running = (c, id) => until(`${id} running`, () => ticketState(c, id) === "running", 30000);
const done = (c, id, ms = 60000) => until(`${id} done`, () => result(c, id), ms);
const blockedBy = (c, id) => hc(c, ["status"]).out.split("\n").find((l) => l.startsWith(id))?.split(/\s{2,}/)[5];
const scopeActive = (unit) => spawnSync("systemctl", ["--user", "is-active", "--quiet", `${unit}.scope`]).status === 0;

test("1: two CPU jobs run at once", async () => {
  const c = context("two-cpu");
  const a = submit(c, c.wt("a"), "--class", "quick", "--", "sleep", "5");
  const b = submit(c, c.wt("b"), "--class", "quick", "--", "sleep", "5");
  const [ra, rb] = [await done(c, a), await done(c, b)];
  for (const r of [ra, rb]) {
    assert.equal(r.code, 0);
    assert.ok(r.admittedAt - r.submittedAt < 1000, `admitted after ${r.admittedAt - r.submittedAt} ms`);
  }
  assert.ok(ra.admittedAt < rb.endedAt && rb.admittedAt < ra.endedAt, "ledger intervals overlap");
  const ledger = readFileSync(join(c.sched, "ledger.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(ledger.filter((l) => l.event === "job").length, 2);
});

test("2: a GPU job doesn't block a CPU job; a second GPU job waits for the GPU", async () => {
  const c = context("gpu");
  const g = submit(c, c.wt("g"), "--class", "gpu", "--", "sh", "-c", "echo lease=$SILTWAKE_GPU_LEASE; sleep 8");
  await running(c, g);
  const p = submit(c, c.wt("p"), "--class", "playthrough", "--", "sleep", "1");
  const g2 = submit(c, c.wt("g2"), "--class", "gpu", "--", "sleep", "1");
  const rp = await done(c, p);
  assert.ok(rp.admittedAt - rp.submittedAt < 1500, "the playthrough started at once beside the GPU job");
  assert.equal(ticketState(c, g2), "queued");
  assert.equal(blockedBy(c, g2), "gpu");
  const [rg, rg2] = [await done(c, g), await done(c, g2)];
  assert.ok(rg2.admittedAt >= rg.endedAt - 50, "the second GPU job started after the first released the lease");
  assert.match(readFileSync(join(c.sched, "jobs", g, "output.log"), "utf8"), new RegExp(`lease=${g}`));
});

test("3: a review jumps a queued playthrough; with the pool full it takes the express slot at once", async () => {
  const c = context("review");
  // Part 1: pool and express slot full; when 2 tokens free, R starts before P.
  const short = submit(c, c.wt("s1"), "--class", "standard", "--", "sleep", "6");
  const long = submit(c, c.wt("s2"), "--class", "standard", "--", "sleep", "20");
  const ex = submit(c, c.wt("x"), "--class", "quick", "--", "sleep", "20");
  await running(c, short); await running(c, long); await running(c, ex);
  assert.equal(grant(c, ex).express, true);
  const P = submit(c, c.wt("p"), "--class", "playthrough", "--", "sleep", "1");
  await sleep(300);
  const R = submit(c, c.wt("r"), "--class", "quick", "--review", "--", "sleep", "1");
  const rr = await done(c, R);
  const rs = result(c, short);
  assert.ok(rr.admittedAt >= rs.endedAt - 50, "R waited for tokens");
  const rp = state(c).tickets[P];
  assert.ok(!rp || rp.state === "queued" || rp.admittedAt > rr.admittedAt, "R started before P");
  for (const id of [P, long, ex]) hc(c, ["cancel", id]);
  await done(c, long); await done(c, ex);
  // Part 2: pool full, express free: R starts at once in the express slot.
  const f1 = submit(c, c.wt("f1"), "--class", "standard", "--", "sleep", "10");
  const f2 = submit(c, c.wt("f2"), "--class", "standard", "--", "sleep", "10");
  await running(c, f1); await running(c, f2);
  const R2 = submit(c, c.wt("r2"), "--class", "quick", "--review", "--", "sleep", "1");
  const rr2 = await done(c, R2);
  assert.ok(rr2.admittedAt - rr2.submittedAt < 1500);
  assert.equal(rr2.express, true);
  hc(c, ["cancel", f1]); hc(c, ["cancel", f2]);
});

test("5: memory refuses overcommit; impossible requests exit 2; the host brake holds", async () => {
  const c = context("memory");
  const a = submit(c, c.wt("a"), "--class", "standard", "--cpus", "1", "--", "sleep", "15");
  const b = submit(c, c.wt("b"), "--class", "playthrough", "--cpus", "1", "--", "sleep", "15");
  await running(c, a); await running(c, b);
  const m = submit(c, c.wt("m"), "--class", "standard", "--cpus", "1", "--mem", "2G", "--", "true");
  await sleep(1500);
  assert.equal(ticketState(c, m), "queued");
  assert.equal(blockedBy(c, m), "memory");
  const huge = hc(c, ["submit", "--class", "standard", "--mem", "9G", "--", "true"], { cwd: c.wt("h") });
  assert.equal(huge.code, 2);
  assert.match(huge.err, /refused/);
  for (const id of [a, b, m]) hc(c, ["cancel", id]);
  await done(c, a); await done(c, b);
  host(c, { memAvailableMiB: 3072 });
  const low = submit(c, c.wt("l"), "--class", "quick", "--", "true");
  await sleep(1500);
  assert.equal(ticketState(c, low), "queued");
  assert.equal(blockedBy(c, low), "host-memory");
  host(c, {});
  await done(c, low, 30000); // re-planned within the 15 s host re-check
});

test("6: a grandchild over the reservation is OOM-killed and reported from memory.events; its neighbour is unaffected", async () => {
  const c = context("oom");
  const neighbour = submit(c, c.wt("n"), "--class", "quick", "--", "sleep", "6");
  const hog = submit(c, c.wt("h"), "--class", "standard", "--mem", "512M", "--", "sh", "-c",
    `node -e 'const a=[];for(;;)a.push(Buffer.alloc(32<<20,1))'; echo grandchild-exit=$?; exit 1`);
  const r = await done(c, hog, 60000);
  assert.equal(r.code, 137);
  assert.match(r.label, /^oom: class standard reservation 512 MiB; rerun with --class exclusive or --mem/);
  assert.ok(r.oomKills >= 1);
  assert.ok(r.peakMiB >= 400 && r.peakMiB <= 513, `peak ${r.peakMiB}`);
  assert.equal(state(c).tickets[hog], undefined, "reservation released");
  assert.equal((await done(c, neighbour)).code, 0);
});

test("7: an exclusive job drains the lane and runs alone, express included", async () => {
  const c = context("exclusive");
  const r1 = submit(c, c.wt("r1"), "--class", "standard", "--", "sleep", "4");
  const r2 = submit(c, c.wt("r2"), "--class", "quick", "--", "sleep", "4");
  await running(c, r1); await running(c, r2);
  // A review measurement (priority 2) ahead of a later standard job (priority 2, later).
  const X = submit(c, c.wt("x"), "--class", "exclusive", "--review", "--", "sh", "-c", "echo cpus=${SILTWAKE_JOB_CPUS} lease=${SILTWAKE_GPU_LEASE:+yes}; sleep 4");
  const S = submit(c, c.wt("s"), "--class", "standard", "--", "true");
  await sleep(1200);
  assert.equal(blockedBy(c, X), "lane");
  assert.equal(blockedBy(c, S), "exclusive");
  await running(c, X);
  const Q = submit(c, c.wt("q"), "--class", "quick", "--", "true"); // the express slot stays shut too
  await sleep(1500);
  assert.equal(ticketState(c, Q), "queued");
  assert.equal(blockedBy(c, Q), "exclusive");
  const rx = await done(c, X);
  const [rs, rq] = [await done(c, S), await done(c, Q)];
  for (const r of [r1, r2]) assert.ok(rx.admittedAt >= result(c, r).endedAt - 50, "X started once the lane was empty");
  for (const r of [rs, rq]) assert.ok(r.admittedAt >= rx.endedAt - 50, "nothing ran beside X");
  assert.equal(rx.tokens, 4); assert.equal(rx.memMiB, 6144); assert.equal(rx.gpu, true);
  assert.ok(rx.context && rx.context.samples >= 1, "load and PSI recorded for the measurement");
  assert.match(readFileSync(join(c.sched, "jobs", X, "output.log"), "utf8"), /cpus=4 lease=yes/);
});

test("8: the job survives its caller; a fresh wait returns its code; resubmitting joins the same ticket", async () => {
  const c = context("detach");
  const wt = c.wt("d");
  const caller = spawn(process.execPath, [CLI, "--class", "quick", "--", "sh", "-c", "sleep 5; exit 7"], { cwd: wt, env: c.env, detached: true, stdio: "ignore" });
  const id = await until("ticket", () => Object.keys(state(c).tickets)[0]);
  await running(c, id);
  process.kill(-caller.pid, "SIGKILL");
  const again = submit(c, wt, "--class", "quick", "--", "sh", "-c", "sleep 5; exit 7");
  assert.equal(again, id, "same command, worktree and tree: same ticket");
  const w = hc(c, ["wait", id]);
  assert.equal(w.code, 7);
  assert.match(w.err, new RegExp(`${id} exit 7`));
});

test("9: a killed supervisor's reservation is freed by the next transaction; a reused PID is not alive", async () => {
  const c = context("reconcile");
  const id = submit(c, c.wt("a"), "--class", "standard", "--", "sleep", "60");
  await running(c, id);
  const t = state(c).tickets[id];
  assert.ok(scopeActive(t.unit));
  process.kill(t.supervisor.pid, "SIGKILL");
  const next = submit(c, c.wt("b"), "--class", "quick", "--", "true"); // its enqueue reconciles
  await done(c, next);
  assert.equal(state(c).tickets[id], undefined);
  const r = result(c, id);
  assert.equal(r.code, 137);
  assert.match(r.label, /supervisor died/);
  assert.equal(scopeActive(t.unit), false, "the orphaned scope was stopped");
  const S = await import("./state.mjs");
  const me = S.self();
  assert.equal(S.alive(me), true);
  assert.equal(S.alive({ pid: me.pid, start: me.start + 1 }), false, "same PID, different start time");
});

test("10: cancel removes a queued ticket, stops only a running one's scope, and the queue limit exits 75", async () => {
  const c = context("cancel");
  const wt = c.wt("a");
  const first = submit(c, wt, "--class", "quick", "--", "sleep", "30");
  const neighbour = submit(c, c.wt("n"), "--class", "quick", "--", "sleep", "4");
  await running(c, first);
  const queued = submit(c, wt, "--class", "quick", "--", "true"); // same worktree: waits
  await sleep(500);
  assert.equal(ticketState(c, queued), "queued");
  assert.equal(hc(c, ["cancel", queued]).code, 0);
  assert.equal(state(c).tickets[queued], undefined);
  assert.equal(result(c, queued).code, 75);
  const unit = state(c).tickets[first].unit;
  assert.equal(hc(c, ["cancel", first]).code, 0);
  const rf = await done(c, first);
  assert.equal(rf.code, 75);
  assert.equal(rf.label, "cancelled");
  assert.ok(rf.ranS < 20);
  assert.equal(scopeActive(unit), false);
  assert.equal((await done(c, neighbour)).code, 0, "the neighbour ran to the end");
  // Queue limit.
  const blocker = submit(c, wt, "--class", "quick", "--", "sleep", "40");
  await running(c, blocker);
  const exp = submit(c, wt, "--class", "quick", "--queue-timeout", "2", "--", "true");
  const w = hc(c, ["wait", exp, "--max", "40"]);
  assert.equal(w.code, 75);
  assert.match(result(c, exp).label, /expired/);
  hc(c, ["cancel", blocker]);
});

test("11: wait --max exits 99 with a position line, then the job's code; 124 and 0 pass through", async () => {
  const c = context("wait");
  const id = submit(c, c.wt("a"), "--class", "quick", "--", "sh", "-c", "sleep 12; exit 1");
  const pending = hc(c, ["wait", id, "--max", "3"]);
  assert.equal(pending.code, 99);
  assert.match(pending.err, /still pending/);
  assert.match(pending.err, /running for/);
  const w = hc(c, ["wait", id]);
  assert.equal(w.code, 1);
  const q = submit(c, c.wt("b"), "--class", "standard", "--cpus", "4", "--", "sleep", "6");
  const behind = submit(c, c.wt("c"), "--class", "standard", "--", "true");
  const pos = hc(c, ["wait", behind, "--max", "1"]);
  assert.equal(pos.code, 99);
  assert.match(pos.err, /queued, position 1 of 1, blocked by cpu/);
  hc(c, ["cancel", q]);
  assert.equal(hc(c, ["wait", behind]).code, 0);
  const late = submit(c, c.wt("d"), "--class", "quick", "--deadline", "2", "--", "sleep", "30");
  const rl = hc(c, ["wait", late]);
  assert.equal(rl.code, 124);
  assert.match(rl.err, /deadline 2s exceeded/);
});

test("12: legacy bridge: a v1 holder blocks v2; a v1 waiter pauses v2 until it runs; the lock inode never changes", async () => {
  const c = context("legacy");
  writeFileSync(c.legacy, "");
  const inode = statSync(c.legacy).ino;
  // The real v1 script, pointed at the private lock and unit names.
  const v1 = join(c.dir, "heavy-check-v1.sh");
  const v1src = spawnSync("git", ["-C", here, "show", "1ccce66:scripts/heavy-check.sh"], { encoding: "utf8" }).stdout;
  writeFileSync(v1, v1src.replace("/work/tmp/siltwake-heavy-check.lock", c.legacy).replace('unit="siltwake-heavy-', `unit="sched1test-v1-${c.n}-`), { mode: 0o755 });
  const v1run = (cmd) => spawn("bash", [v1, "--deadline", "60", "sh", "-c", cmd], { cwd: c.dir, env: c.env, stdio: "ignore" });
  // (a) v1 holds the lock: v2 waits.
  const holder = v1run(`date +%s%3N > ${c.dir}/v1a.start; sleep 4; date +%s%3N > ${c.dir}/v1a.end`);
  await until("v1 holder", () => existsSync(join(c.dir, "v1a.start")));
  const a = submit(c, c.wt("a"), "--class", "quick", "--", "true");
  await sleep(800);
  assert.equal(blockedBy(c, a), "legacy");
  const ra = await done(c, a);
  assert.ok(ra.admittedAt >= Number(readFileSync(join(c.dir, "v1a.end"), "utf8")), "v2 ran after the v1 holder");
  await new Promise((r) => holder.on("exit", r));
  // (b) v2 running (shared); a v1 waiter arrives; a later v2 job waits until the v1 job has run.
  const b = submit(c, c.wt("b"), "--class", "quick", "--", "sleep", "4");
  await running(c, b);
  const waiter = v1run(`date +%s%3N > ${c.dir}/v1b.start; sleep 2`);
  await sleep(800);
  const d = submit(c, c.wt("d"), "--class", "quick", "--", "true");
  await sleep(800);
  assert.equal(blockedBy(c, d), "legacy");
  const rd = await done(c, d, 60000);
  const rb = result(c, b);
  const v1start = Number(readFileSync(join(c.dir, "v1b.start"), "utf8"));
  assert.ok(v1start >= rb.endedAt - 50, "v1 never overlapped the v2 job");
  assert.ok(rd.admittedAt >= v1start, "the paused v2 job ran after the v1 waiter acquired");
  await new Promise((r) => waiter.on("exit", r));
  assert.equal(statSync(c.legacy).ino, inode);
  const events = readFileSync(join(c.sched, "ledger.jsonl"), "utf8");
  assert.match(events, /"event":"legacy-holder"/, "v1 acquisitions are recorded");
});

test("13: nested calls run inline; a nested GPU call from a CPU job and a forged ticket are refused", async () => {
  const c = context("nested");
  const inner = `${process.execPath} ${CLI}`;
  const id = submit(c, c.wt("a"), "--class", "standard", "--", "sh", "-c",
    `${inner} -- sh -c 'echo inner-cgroup=$(cat /proc/self/cgroup)'; ` +
    `${inner} --class gpu -- true; echo gpu-rc=$?; ${inner} --class exclusive -- true; echo excl-rc=$?`);
  const r = await done(c, id);
  assert.equal(r.code, 0);
  const out = readFileSync(join(c.sched, "jobs", id, "output.log"), "utf8");
  assert.match(out, new RegExp(`inner-cgroup=0::.*/${grant(c, id).unit}\\.scope`));
  assert.match(out, /gpu-rc=2/);
  assert.match(out, /has no GPU lease/);
  assert.match(out, /excl-rc=2/);
  assert.equal(Object.keys(state(c).tickets).length, 0, "the nested calls queued nothing");
  const forged = hc(c, ["--", "true"], { env: { SILTWAKE_JOB_TICKET: id } });
  assert.equal(forged.code, 2);
  assert.match(forged.err, /not inside that ticket's scope/);
  const legacyForged = hc(c, ["--", "true"], { env: { SILTWAKE_HEAVY_LOCK_HELD: "1" } });
  assert.equal(legacyForged.code, 2);
});

test("14: one running job per worktree, and the .test-build guard", async () => {
  const c = context("worktree");
  const wt = c.wt("repo");
  writeFileSync(join(wt, "package.json"), "{}");
  const a = submit(c, wt, "--class", "quick", "--", "sh", "-c",
    `node -e 'import("${join(here, "build-guard.mjs")}").then(m => console.log("inside=" + m.heavyJobGuard(process.cwd())))'; sleep 4`);
  await running(c, a);
  const b = submit(c, wt, "--class", "quick", "--", "true");
  await sleep(800);
  assert.equal(blockedBy(c, b), "worktree");
  await until("marker", () => existsSync(join(wt, ".test-build", ".heavy-job")));
  assert.match(heavyJobGuard(wt, {}), new RegExp(`ticket ${a} is running`));
  await done(c, a);
  assert.match(readFileSync(join(c.sched, "jobs", a, "output.log"), "utf8"), /inside=null/, "the job itself may rebuild");
  await done(c, b);
  assert.equal(heavyJobGuard(wt, {}), null, "marker removed after the job");
});

test("15: mode=serial makes every request exclusive (v1 behaviour) with no redeploy", async () => {
  const c = context("serial", { mode: "serial" });
  const a = submit(c, c.wt("a"), "--class", "quick", "--", "sh", "-c", "echo cpus=${SILTWAKE_JOB_CPUS:-unset} held=$SILTWAKE_HEAVY_LOCK_HELD; sleep 3");
  const b = submit(c, c.wt("b"), "--class", "quick", "--", "sleep", "1");
  const [ra, rb] = [await done(c, a), await done(c, b)];
  assert.ok(rb.admittedAt >= ra.endedAt - 50, "one at a time");
  assert.equal(ra.exclusive, true);
  assert.equal(ra.memMiB, 6144);
  assert.match(readFileSync(join(c.sched, "jobs", a, "output.log"), "utf8"), /cpus=unset held=1/);
  // Flip to normal while tickets wait: they are re-resolved without a restart,
  // and run side by side once the serial job ends (a running job keeps its grant).
  const x = submit(c, c.wt("x"), "--class", "quick", "--", "sleep", "4");
  await running(c, x);
  const y = submit(c, c.wt("y"), "--class", "quick", "--", "sleep", "3");
  const z = submit(c, c.wt("z"), "--class", "quick", "--", "sleep", "3");
  await sleep(800);
  assert.equal(blockedBy(c, y), "exclusive");
  writeFileSync(join(c.sched, "mode"), "normal\n");
  const [ry, rz] = [await done(c, y, 30000), await done(c, z, 30000)];
  assert.ok(ry.admittedAt >= result(c, x).endedAt - 50);
  assert.ok(ry.admittedAt < rz.endedAt && rz.admittedAt < ry.endedAt, "y and z overlap in normal mode");
  assert.equal(ry.exclusive, false);
  assert.equal(ry.memMiB, 2048);
});
