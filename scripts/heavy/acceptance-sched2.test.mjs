// SCHED-2 acceptance tests: goal-based jobs (stall detection, deadlines and
// ceilings), soaks, changed-tree rejection and snapshots, the GPU lease for
// every driver, OOM classification across observer loss and the live slice
// limits. Real systemd scopes and processes with private state, as in
// acceptance.test.mjs (helpers in acceptance-lib.mjs):
//
//   node --test --test-concurrency=1 scripts/heavy/acceptance-sched2.test.mjs
//
// Short windows come from the private config.json (minStallS, ceilings,
// soakYieldS), never from the production one. Takes about three minutes.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sliceLimits } from "./policy.mjs";
import { alive, scopePopulated } from "./state.mjs";
import { context, hc, here, holderOf, killOwned, read, result, running, sleep, submit, until } from "./acceptance-lib.mjs";

const fast = { minStallS: 1, soakYieldS: 3 };
const log = (c, id) => readFileSync(join(c.sched, "jobs", id, "output.log"), "utf8");
const waitFor = (c, id) => hc(c, ["wait", id]);
const gitIn = (dir, ...args) => spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });

test("S1: a job runs to its goal; silence for the stall window stops it as 'stalled' (123), with what its processes were doing", async () => {
  const c = context("stall", { config: fast });
  const id = submit(c, c.wt("a"), "--class", "quick", "--stall", "3", "--", "sh", "-c", "echo started; sleep 60");
  const w = waitFor(c, id);
  assert.equal(w.code, 123, w.err);
  assert.match(w.err, /stalled: no output for \ds/);
  const r = result(c, id);
  assert.equal(r.stopReason, "stalled");
  assert.ok(r.ranS < 15, `stopped after ${r.ranS} s`);
  assert.match(log(c, id), /CPU used meanwhile \d+\.\d s\. Its processes:\n(.*\n)*heavy-check:\s+\d+ S \S+ .*sleep 60/);
});

test("S2: output or a heartbeat touch keeps a long-silent job alive past the stall window", async () => {
  const c = context("heartbeat", { config: fast });
  const beat = submit(c, c.wt("b"), "--class", "quick", "--stall", "2", "--", "sh", "-c",
    "for i in 1 2 3 4 5 6; do touch \"$SILTWAKE_JOB_HEARTBEAT\"; sleep 1; done; echo finished");
  const talk = submit(c, c.wt("t"), "--class", "quick", "--stall", "2", "--", "sh", "-c", "for i in 1 2 3 4 5 6; do echo $i; sleep 1; done");
  for (const id of [beat, talk]) {
    const w = waitFor(c, id);
    assert.equal(w.code, 0, w.err);
    assert.ok(result(c, id).ranS >= 5.5);
  }
  // The holder's own notes are not output: a job silent from the start still stalls.
  assert.match(log(c, beat), /finished/);
});

test("S3: a chosen --deadline and the class's runaway ceiling both stop with 124, labelled apart", async () => {
  const c = context("limits", { config: { ...fast, ceilings: { quick: 3 } } });
  const d = submit(c, c.wt("d"), "--class", "standard", "--deadline", "2", "--", "sh", "-c", "while :; do echo .; sleep 0.5; done");
  const e = submit(c, c.wt("e"), "--class", "quick", "--", "sh", "-c", "while :; do echo .; sleep 0.5; done");
  const [wd, we] = [waitFor(c, d), waitFor(c, e)];
  assert.equal(wd.code, 124, wd.err);
  assert.match(wd.err, /deadline 2s exceeded/);
  assert.equal(result(c, d).stopReason, "deadline");
  assert.equal(we.code, 124, we.err);
  assert.match(we.err, /runaway ceiling: ran 3s, the quick class's ceiling/);
  assert.equal(result(c, e).stopReason, "ceiling");
});

test("S4: a soak runs at idle CPU on leftover capacity, gets a yield notice when its memory blocks a job, and is preempted (75)", async () => {
  const c = context("soak", { config: fast });
  const soak = submit(c, c.wt("s"), "--class", "soak", "--mem", "4G", "--", "sh", "-c",
    "while :; do echo tick; [ -e \"$SILTWAKE_JOB_YIELD\" ] && echo saw-yield-notice; sleep 0.5; done");
  await running(c, soak);
  const t = await holderOf(c, soak);
  await until("job cgroup", () => existsSync(join(c.sched, "jobs", soak, "cgroup")));
  const cg = readFileSync(join(c.sched, "jobs", soak, "cgroup"), "utf8").trim();
  assert.equal(readFileSync(join(cg, "cpu.idle"), "utf8").trim(), "1", "the soak's scope runs at idle CPU weight");
  // 4 GiB soak + 3 GiB standard > 6 GiB pool: the standard waits on the soak's memory.
  const std = submit(c, c.wt("x"), "--class", "standard", "--", "sh", "-c", "echo ran");
  const ws = waitFor(c, soak);
  assert.equal(ws.code, 75, ws.err);
  assert.match(ws.err, /preempted: the soak yielded to .* after a 3s notice/);
  assert.match(log(c, soak), /yield notice: .*\n(.*\n)*saw-yield-notice/);
  assert.equal(result(c, soak).stopReason, "preempted");
  const wx = waitFor(c, std);
  assert.equal(wx.code, 0, wx.err);
  assert.ok(result(c, std).admittedAt >= result(c, soak).endedAt - 50, "the standard started once the soak was gone");
  assert.equal(scopePopulated(t.unit), false);
  // With no one waiting, a soak finishes undisturbed.
  const quiet = submit(c, c.wt("q"), "--class", "soak", "--", "sh", "-c", "sleep 2; echo done");
  assert.equal(waitFor(c, quiet).code, 0);
});

test("S5: a worktree that changed between submit and admission is rejected (3); the command never runs", async () => {
  const c = context("reject", { config: fast });
  const repo = c.repo("r"), out = join(c.dir, "ran");
  const first = submit(c, repo, "--class", "quick", "--", "sleep", "3");
  const second = submit(c, repo, "--class", "quick", "--", "sh", "-c", `touch ${out}`);
  await running(c, first);
  writeFileSync(join(repo, "file.txt"), "v2\n"); // the agent keeps editing while its ticket waits
  const w = waitFor(c, second);
  assert.equal(w.code, 3, w.err);
  assert.match(w.err, /rejected: the worktree changed between submit and admission \(submitted [0-9a-f]{10}, now [0-9a-f]{10}\+[0-9a-f]{12}\)/);
  assert.match(w.err, /--snapshot/);
  assert.equal(existsSync(out), false, "the rejected command did not run");
  assert.equal(result(c, second).stopReason, "rejected");
});

test("S6: --snapshot tests the tree as submitted while the worktree keeps changing; evidence is bound to the commit", async () => {
  const c = context("snapshot", { config: fast });
  const repo = c.repo("r"), out = join(c.dir, "seen");
  const head = gitIn(repo, "rev-parse", "HEAD").stdout.trim();
  const blocker = submit(c, repo, "--class", "quick", "--", "sleep", "3");
  const snap = submit(c, repo, "--class", "quick", "--snapshot", "--", "sh", "-c", `cat file.txt > ${out}; git rev-parse HEAD >> ${out}`);
  await running(c, blocker);
  writeFileSync(join(repo, "file.txt"), "edited later\n");
  const w = waitFor(c, snap);
  assert.equal(w.code, 0, w.err);
  assert.equal(readFileSync(out, "utf8"), `v1\n${head}\n`);
  const r = result(c, snap);
  assert.deepEqual(r.evidence, { commit: head, bound: true, why: null, snapshot: true });
  assert.match(w.err, new RegExp(`evidence for ${head.slice(0, 10)} \\(snapshot\\)`));
  assert.equal(existsSync(r.snapshot.root), false, "an unchanged snapshot is removed");
  assert.equal(existsSync(join(repo, ".test-build", ".heavy-job")), false, "a snapshot job leaves the worktree's .test-build free");
  // Uncommitted changes go into the snapshot, but the result is not evidence for a commit;
  // files the job writes keep the snapshot.
  const dirty = submit(c, repo, "--class", "quick", "--snapshot", "--", "sh", "-c", `cat file.txt > ${out}; echo x > new-output.txt`);
  const wd = waitFor(c, dirty);
  assert.equal(wd.code, 0, wd.err);
  assert.equal(readFileSync(out, "utf8"), "edited later\n");
  const rd = result(c, dirty);
  assert.equal(rd.evidence.bound, false);
  assert.equal(rd.evidence.why, "uncommitted changes");
  assert.match(wd.err, /NOT evidence for a commit: uncommitted changes/);
  assert.equal(existsSync(join(rd.snapshot.root, "new-output.txt")), true);
});

test("S7: a tree that changes while the job runs makes the result unbound, with a warning", async () => {
  const c = context("drift", { config: fast });
  const repo = c.repo("r");
  const id = submit(c, repo, "--class", "quick", "--", "sh", "-c", "echo x > untracked-output.txt; sleep 3");
  await running(c, id);
  await sleep(1000);
  const w0 = waitFor(c, id); // untracked output alone does not unbind it
  assert.equal(result(c, id).evidence.bound, true, w0.err);
  const repo2 = c.repo("r2");
  const id2 = submit(c, repo2, "--class", "quick", "--", "sleep", "3");
  // Admission is not enough: the holder checks the tree just before launch.
  await until("started", () => existsSync(join(c.sched, "jobs", id2, "started")));
  writeFileSync(join(repo2, "file.txt"), "changed mid-run\n");
  const w = waitFor(c, id2);
  assert.equal(w.code, 0);
  assert.equal(result(c, id2).changedDuringRun, true);
  assert.match(w.err, /NOT evidence for a commit: the worktree changed while it ran/);
});

test("S8 (R5 P3): a reservation OOM stays classified when the holder was frozen and then killed", async (t) => {
  if (spawnSync("python3", ["-c", "1"]).status !== 0) { t.skip("no python3"); return; }
  const c = context("oom-observer", { config: fast });
  writeFileSync(c.legacy, "");
  const id = submit(c, c.dir, "--class", "quick", "--mem", "256M", "--", "python3", "-c",
    "import os,time\nopen('ready','w').close()\nwhile not os.path.exists('go'): time.sleep(0.05)\nb=[]\nwhile True: b.append(bytearray(8<<20))");
  await until("ready", () => existsSync(join(c.dir, "ready")));
  const tk = await holderOf(c, id);
  // The wrapper sits outside the job's OOM group, in "ctl".
  const cg = readFileSync(join(c.sched, "jobs", id, "cgroup"), "utf8").trim();
  assert.match(readFileSync(join(cg, "ctl", "cgroup.procs"), "utf8"), /^\d+\s*$/);
  assert.equal(readFileSync(join(cg, "job", "memory.oom.group"), "utf8").trim(), "1");
  assert.ok(alive(tk.holder));
  process.kill(tk.holder.pid, "SIGSTOP"); // no observer outside the scope
  try {
    writeFileSync(join(c.dir, "go"), "");
    await until("job scope empty", () => !scopePopulated(tk.unit), 30000);
  } finally {
    if (alive(tk.holder)) process.kill(tk.holder.pid, "SIGCONT");
  }
  if (alive(tk.holder)) killOwned(tk.holder);
  const w = waitFor(c, id);
  assert.equal(w.code, 137, w.err);
  assert.match(w.err, /oom: class quick reservation 256 MiB/);
  const r = result(c, id);
  assert.equal(r.reservationOom, true);
  assert.equal(r.oomEvidence, "memory.events.local (wrapper)");
  assert.ok(r.oomKills >= 1, `oomKills ${r.oomKills}`);
});

test("S9: after an admission the live slice has the machine's cpu.max and memory.max (nested slice name)", async () => {
  const slice = `sched2test-heavy${process.pid}.slice`;
  const c = context("slice", { config: { ...fast, manageSlice: true }, slice });
  try {
    const id = submit(c, c.wt("a"), "--class", "quick", "--", "sleep", "1");
    assert.equal(waitFor(c, id).code, 0);
    const cgPath = spawnSync("systemctl", ["--user", "show", "-p", "ControlGroup", "--value", slice], { encoding: "utf8" }).stdout.trim();
    assert.match(cgPath, new RegExp(`/sched2test\\.slice/${slice.replace(".", "\\.")}$`), "systemd nests a-b.slice under a.slice");
    const want = sliceLimits(6); // the context's injected 6 vCPU
    assert.equal(readFileSync(`/sys/fs/cgroup${cgPath}/cpu.max`, "utf8").trim(), `${want.cpuQuotaPct * 1000} 100000`);
    assert.equal(readFileSync(`/sys/fs/cgroup${cgPath}/memory.max`, "utf8").trim(), String(want.memoryMaxMiB * 1048576));
    assert.match(hc(c, ["status"]).out, new RegExp(`slice ${slice.replace(".", "\\.")}: cpu.max 500000 100000, memory.max 8589934592 \\(as wanted\\)`));
  } finally {
    spawnSync("systemctl", ["--user", "stop", slice, "sched2test.slice"], { stdio: "ignore" });
  }
});

test("S10: the GPU lease holds only inside a GPU ticket's scope; the Chrome guard refuses GPU launches without it", async () => {
  const c = context("lease", { config: fast });
  const pw = join(c.dir, "pw"), bin = join(pw, "chromium-1", "chrome-linux64", "chrome"), home = join(c.dir, "home");
  mkdirSync(join(pw, "chromium-1", "chrome-linux64"), { recursive: true });
  copyFileSync("/bin/echo", bin);
  const inst = spawnSync("bash", [join(here, "install.sh"), "--gpu-guard"], { encoding: "utf8",
    env: { ...c.env, SILTWAKE_SCHED_HOME: home, SILTWAKE_PLAYWRIGHT_DIR: pw } });
  assert.equal(inst.status, 0, inst.stderr);
  assert.match(readFileSync(bin, "utf8"), /siltwake-real/);
  const check = `node ${join(here, "gpu-lease.mjs")} check probe; echo lease-rc=$?; ${bin} --use-angle=gl-egl gpu-launch; echo chrome-rc=$?; ${bin} --headless=new software-launch`;
  const g = submit(c, c.wt("g"), "--class", "gpu", "--", "sh", "-c", check);
  const q = submit(c, c.wt("q"), "--class", "quick", "--", "sh", "-c", check);
  await running(c, g);
  const forged = submit(c, c.wt("f"), "--class", "quick", "--", "sh", "-c", `SILTWAKE_GPU_LEASE=${g} ${bin} --enable-gpu x; echo chrome-rc=$?`);
  for (const id of [g, q, forged]) assert.equal(waitFor(c, id).code, 0);
  assert.match(log(c, g), /gpu-lease: ok\nlease-rc=0\n--use-angle=gl-egl gpu-launch\nchrome-rc=0\n--headless=new software-launch/);
  assert.match(log(c, q), /no GPU lease .*\nlease-rc=2\n.*no GPU lease.*\nchrome-rc=2\n--headless=new software-launch/);
  assert.match(log(c, forged), /not inside that ticket's scope.*\nchrome-rc=2/);
  // Removing the guard restores the real binary.
  spawnSync("bash", [join(here, "install.sh"), "--gpu-guard-remove"], { env: { ...c.env, SILTWAKE_SCHED_HOME: home, SILTWAKE_PLAYWRIGHT_DIR: pw } });
  assert.equal(readFileSync(bin).subarray(1, 4).toString(), "ELF");
  spawnSync("chmod", ["-R", "u+w", home]);
});

test("S11: a GPU client outside the lease is reported by status and recorded on the GPU job it shared with", async (t) => {
  if (!existsSync("/dev/nvidia0")) { t.skip("no NVIDIA device"); return; }
  const c = context("unleased", { config: fast });
  // Opening the device node is what a GPU client does; this one does nothing with it.
  const probe = spawn("sh", ["-c", "exec 7</dev/nvidia0; exec sleep 20", "sched2-acceptance-unleased-gpu-probe"], { stdio: "ignore" });
  try {
    const line = new RegExp(`GPU in use outside the lease: pid ${probe.pid} \\(sleep 20\\)`);
    await until("status reports the probe", () => line.test(hc(c, ["status"]).out), 10000);
    const g = submit(c, c.wt("g"), "--class", "gpu", "--", "sh", "-c", "exec 7</dev/nvidia0; sleep 1");
    const w = waitFor(c, g);
    assert.equal(w.code, 0, w.err);
    const r = result(c, g);
    assert.deepEqual(r.gpuShared?.map((u) => u.pid), [probe.pid]); // its own leased use is not listed
    assert.match(w.err, new RegExp(`GPU shared outside the lease with pid ${probe.pid}`));
  } finally {
    probe.kill("SIGKILL");
  }
});

test("S12: wait --json ends with a machine-readable record, pending or final", async () => {
  const c = context("json", { config: fast });
  const id = submit(c, c.wt("a"), "--class", "quick", "--", "sh", "-c", "sleep 2; exit 99");
  const pending = hc(c, ["wait", id, "--max", "0", "--json"]);
  assert.equal(pending.code, 99);
  assert.equal(JSON.parse(pending.out.trim().split("\n").at(-1)).pending, true);
  const fin = hc(c, ["wait", id, "--json"]);
  assert.equal(fin.code, 99); // the job's own 99, told apart by the record
  const rec = JSON.parse(fin.out.trim().split("\n").at(-1));
  assert.deepEqual([rec.pending, rec.code, rec.ticket], [false, 99, id]);
});

test("S13 (migration): SCHED-1 code and this code share one queue; neither rewrites the other's limits", async () => {
  const c = context("mixed", { config: fast });
  // The SCHED-1 code as installed at cut-over (1f31c87), against the same private state.
  const old = join(c.dir, "sched1");
  mkdirSync(old);
  const archive = spawnSync("sh", ["-c", `git -C ${here} archive 1f31c87 -- :/scripts/heavy | tar -x -C ${old}`]);
  assert.equal(archive.status, 0, "SCHED-1 source available");
  const oldCli = join(old, "heavy-check.mjs"); // archived from scripts/heavy: paths are relative to it
  const oldSubmit = (cwd, ...args) => {
    const r = spawnSync(process.execPath, [oldCli, "submit", ...args], { cwd, env: c.env, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  // Fill the pool so both wait together; every waiting supervisor (old ones
  // too) re-resolves the queued requests on each plan.
  const blocker = submit(c, c.wt("b"), "--class", "standard", "--cpus", "4", "--", "sleep", "10");
  await running(c, blocker);
  const fresh = submit(c, c.wt("n"), "--class", "standard", "--deadline", "7200", "--", "sh", "-c", "echo new");
  const legacy = oldSubmit(c.wt("o"), "--class", "standard", "--", "sh", "-c", "echo old"); // not quick: no express slot
  await sleep(1500);
  const queued = read(join(c.sched, "state.json")).tickets;
  assert.equal(queued[fresh]?.state, "queued");
  assert.equal(queued[fresh].goal.limitS, 7200, "the goal survives the old supervisor's re-resolve");
  assert.equal(queued[legacy].goal, undefined);
  for (const id of [blocker, fresh, legacy]) assert.equal(waitFor(c, id).code, 0);
  assert.equal(result(c, fresh).goal.limitS, 7200);
  assert.equal(result(c, legacy).goal, undefined, "the SCHED-1 ticket ran on its own holder");
  assert.match(log(c, legacy), /deadline 1200s/);
  // A soak waits until no SCHED-1 ticket is queued (their plans would let a waiting soak hold the pools).
  const b2 = submit(c, c.wt("b2"), "--class", "standard", "--cpus", "4", "--", "sleep", "3");
  await running(c, b2);
  oldSubmit(c.wt("o2"), "--class", "standard", "--", "true");
  const refused = hc(c, ["submit", "--class", "soak", "--", "true"], { cwd: c.wt("s") });
  assert.equal(refused.code, 75);
  assert.match(refused.err, /SCHED-1 tickets are still queued/);
});
