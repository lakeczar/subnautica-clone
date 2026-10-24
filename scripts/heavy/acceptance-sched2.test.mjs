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
import { copyFileSync, existsSync, mkdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { heavyJobGuard } from "./build-guard.mjs";
import { sliceLimits } from "./policy.mjs";
import { alive, loadConfig, machineCpus, scopePopulated } from "./state.mjs";
import { V1_REPO, blockedBy, context, exclusiveSlice, hc, here, holderOf, killOwned, read, result, running, sleep, submit, until } from "./acceptance-lib.mjs";

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

test("S4b (R1-F8): a soak yields to a job queued in its own worktree; the job starts once the soak's cgroup is empty", async () => {
  const c = context("soak-same-tree", { config: fast });
  const w = c.wt("s");
  const soak = submit(c, w, "--class", "soak", "--", "sh", "-c", "while :; do echo tick; sleep 0.5; done");
  await running(c, soak);
  const review = submit(c, w, "--class", "quick", "--review", "--", "sh", "-c", "echo reviewed");
  assert.equal(blockedBy(c, review), "worktree");
  const ws = waitFor(c, soak);
  assert.equal(ws.code, 75, ws.err);
  assert.match(ws.err, /preempted: the soak yielded to .* after a 3s notice/);
  const wr = waitFor(c, review);
  assert.equal(wr.code, 0, wr.err);
  assert.ok(result(c, review).admittedAt >= result(c, soak).endedAt - 50, "one job per worktree still holds");
});

test("S15 (R1-F4): a job built into a sibling directory protects that directory, also after its holder dies", async () => {
  const c = context("sibling-build", { config: fast });
  const w = c.wt("r");
  writeFileSync(join(w, "package.json"), "{}");
  const env = { SILTWAKE_TEST_BUILD: ".test-build-review" };
  const bad = hc(c, ["submit", "--class", "quick", "--", "true"], { cwd: w, env: { SILTWAKE_TEST_BUILD: "../elsewhere" } });
  assert.equal(bad.code, 2);
  const r = hc(c, ["submit", "--class", "quick", "--", "python3", "-c", "import signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); open('ready','w').close(); time.sleep(60)"], { cwd: w, env });
  assert.equal(r.code, 0, r.err);
  const id = r.out.trim();
  await until("ready", () => existsSync(join(w, "ready")));
  const tk = await holderOf(c, id);
  assert.equal(existsSync(join(w, ".test-build-review", ".heavy-job")), true);
  assert.equal(existsSync(join(w, ".test-build", ".heavy-job")), false);
  assert.match(heavyJobGuard(w, c.env, ".test-build-review") ?? "", new RegExp(`ticket ${id}`));
  assert.equal(heavyJobGuard(w, c.env, ".test-build"), null, "the default directory is free");
  assert.equal(heavyJobGuard(w, c.env, ".test-build-other"), null, "so is any other sibling");
  killOwned(tk.holder); // BindsTo stops the job; it ignores TERM, so it lingers for the stop grace
  await sleep(500);
  assert.equal(scopePopulated(tk.unit), true);
  assert.match(heavyJobGuard(w, c.env, ".test-build-review") ?? "", /is running/, "holder gone, job alive: still protected");
  const wr = waitFor(c, id);
  assert.equal(wr.code, 137, wr.err);
  assert.equal(heavyJobGuard(w, c.env, ".test-build-review"), null);
  assert.equal(existsSync(join(w, ".test-build-review", ".heavy-job")), false, "recovery removed the sibling's marker");
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
  // R1-F1: a snapshot is writable. A job that edits a tracked file, or moves
  // HEAD, in its snapshot no longer tests the submitted commit.
  gitIn(repo, "checkout", "-q", "--", "file.txt"); // the worktree is clean again: bound case below
  const edits = submit(c, repo, "--class", "quick", "--snapshot", "--", "sh", "-c", `echo different-source > file.txt; cat file.txt > ${out}`);
  const we = waitFor(c, edits);
  assert.equal(readFileSync(out, "utf8"), "different-source\n");
  const re = result(c, edits);
  assert.deepEqual([re.evidence.bound, re.changedDuringRun, re.snapshot.kept], [false, true, true]);
  assert.match(we.err, /NOT evidence for a commit: the job changed its snapshot's tracked files or HEAD/);
  const moves = submit(c, repo, "--class", "quick", "--snapshot", "--", "sh", "-c", "git -c user.name=t -c user.email=t@t commit -q --allow-empty -m moved");
  waitFor(c, moves);
  assert.equal(result(c, moves).evidence.bound, false, "a moved HEAD unbinds it too");
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
  // R1 P3: recovery keeps what was submitted, and never binds evidence it did not check.
  assert.equal(r.head, null, "submitted outside git: no commit to keep");
  assert.deepEqual(r.evidence, { commit: null, bound: false, why: "recovered: no observer checked the tree at the end", snapshot: false });
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
  // R1-F5: the guard does not depend on the scheduler's install. Re-wrap,
  // then roll the scheduler back to SCHED-1 (its real installer), uninstall it,
  // and finally lose the checker: a GPU launch without a lease is refused every
  // time, a leased one still works after the rollback, software always passes.
  const envH = { ...c.env, SILTWAKE_SCHED_HOME: home, SILTWAKE_PLAYWRIGHT_DIR: pw };
  assert.equal(spawnSync("bash", [join(here, "install.sh"), "--gpu-guard"], { env: envH }).status, 0);
  const old = join(c.dir, "sched1");
  mkdirSync(old);
  assert.equal(spawnSync("sh", ["-c", `git -C ${here} archive 1f31c87 -- :/scripts/heavy | tar -x -C ${old}`]).status, 0);
  const launch = (args) => spawnSync(bin, args, { env: c.env, encoding: "utf8" });
  assert.equal(spawnSync("bash", [join(old, "install.sh")], { env: envH, encoding: "utf8" }).status, 0);
  assert.match(readFileSync(join(home, "current", "heavy-check.mjs"), "utf8"), /heavy-check v2/);
  assert.equal(existsSync(join(home, "current", "chrome-guard.sh")), false, "the rolled-back scheduler has no guard of its own");
  assert.equal(launch(["--use-angle=gl-egl", "x"]).status, 2, "rolled back: still refused");
  assert.equal(launch(["--headless=new", "sw"]).status, 0);
  const leased = submit(c, c.wt("g2"), "--class", "gpu", "--", bin, "--use-angle=gl-egl", "leased-after-rollback");
  assert.equal(waitFor(c, leased).code, 0);
  assert.match(log(c, leased), /leased-after-rollback/);
  spawnSync("rm", ["-f", join(home, "current")]);
  assert.equal(launch(["--use-angle=gl-egl", "x"]).status, 2, "scheduler uninstalled: still refused");
  spawnSync("rm", ["-f", join(home, "guard", "current")]);
  const lost = launch(["--use-angle=gl-egl", "x"]);
  assert.equal(lost.status, 2);
  assert.match(lost.stderr, /GPU lease enforcement is unavailable/);
  assert.equal(launch(["--headless=new", "sw"]).status, 0);
  spawnSync("bash", [join(here, "install.sh"), "--gpu-guard-remove"], { env: envH });
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

test("S14: the .test-build guard: a queued ticket never blocks; a running one names itself and the ways around it; --no-test-build writes no marker", async () => {
  const c = context("guard", { config: fast });
  const wt = (n) => { const p = c.wt(n); writeFileSync(join(p, "package.json"), "{}"); return p; };
  const A = wt("a"), B = wt("b"), N = wt("n");
  const env = { ...c.env };
  const blocker = submit(c, A, "--class", "gpu", "--", "sleep", "5");
  await running(c, blocker);
  const queued = submit(c, B, "--class", "gpu", "--", "sleep", "3");
  await sleep(800);
  assert.equal(hc(c, ["status"]).out.split("\n").find((l) => l.startsWith(queued))?.split(/\s{2,}/)[4], "queued");
  assert.equal(heavyJobGuard(B, env), null, "a queued ticket does not block");
  await until("A's marker", () => existsSync(join(A, ".test-build", ".heavy-job")));
  const msg = heavyJobGuard(A, env);
  assert.match(msg, new RegExp(`ticket ${blocker} \\(gpu, running: sleep 5\\) is running from this worktree's \\.test-build`));
  assert.match(msg, /SILTWAKE_TEST_BUILD=\.test-build-2 npm test/);
  assert.match(msg, /--no-test-build, or --snapshot/);
  assert.equal(heavyJobGuard(A, env, ".test-build-2"), null, "a sibling build directory is free meanwhile");
  const free = submit(c, N, "--class", "quick", "--no-test-build", "--", "sleep", "2");
  await until("started", () => existsSync(join(c.sched, "jobs", free, "started")));
  assert.equal(existsSync(join(N, ".test-build", ".heavy-job")), false);
  for (const id of [blocker, queued, free]) assert.equal(waitFor(c, id).code, 0);
  assert.equal(heavyJobGuard(A, env), null);
});

// TST-16: exclusive jobs run in their own top-level slice with a fixed CPU weight
// (nothing is set at runtime), and their contention is judged on their own cgroup.
const sliceProp = (name, prop) => spawnSync("systemctl", ["--user", "show", "-p", prop, "--value", name], { encoding: "utf8" }).stdout.trim();
/** Whether a slice holds no process (a slice stays active once started; its cgroup says whether anything is in it). */
const sliceEmpty = (name) => { const cg = sliceProp(name, "ControlGroup"); return !cg || !/^populated 1$/m.test(readFileSync(`/sys/fs/cgroup${cg}/cgroup.events`, "utf8")); };
const ranIn = (c, id) => readFileSync(join(c.sched, "jobs", id, "cgroup"), "utf8");
const stateOf = (c) => read(join(c.sched, "state.json")) ?? {};
const noRuntimeState = (c) => { const st = stateOf(c); assert.deepEqual([st.boost, st.frozen], [undefined, undefined], "no runtime boost state exists"); };

test("S17 (TST-16): an exclusive job runs in the exclusive slice, whose fixed weight is its CPU priority; its contention is measured from before its payload to after it", async () => {
  const c = context("excl", { config: fast });
  const slice = await exclusiveSlice(c);
  const x = submit(c, c.wt("x"), "--class", "exclusive", "--", "sh", "-c", "cut -d' ' -f1 /proc/uptime > payload-start; sleep 6");
  await running(c, x);
  await until("started", () => existsSync(join(c.sched, "jobs", x, "cgroup")), 15000);
  assert.ok(ranIn(c, x).includes(`/${slice}/`), ranIn(c, x));
  assert.equal(sliceEmpty(slice), false);
  const w = waitFor(c, x);
  assert.equal(w.code, 0);
  const ctx = result(c, x).context, dir = join(c.sched, "jobs", x);
  assert.deepEqual(ctx.boost, { slice, weight: 10000, status: "applied", throttled: { periods: 0, usec: 0 } });
  assert.equal(ctx.reasons.some((r) => /boosted slice/.test(r)), false);
  assert.match(w.err, new RegExp(`CPU priority in ${slice.replace(/\./g, "\\.")} \\(weight 10000\\)`));
  assert.deepEqual([ctx.v, ctx.measured, ctx.missing], [2, true, []], JSON.stringify(ctx));
  assert.ok(ctx.measuredS >= 5.5 && ctx.points >= 5 && ctx.windows.length >= 1);
  const start = Number(readFileSync(join(dir, "counters-start"), "utf8").match(/^uptime ([\d.]+)/m)[1]);
  const end = Number(readFileSync(join(dir, "counters-end"), "utf8").match(/^uptime ([\d.]+)/m)[1]);
  const payload = Number(readFileSync(join(c.wt("x"), "payload-start"), "utf8"));
  assert.ok(start <= payload && payload + 6 <= end + 0.05, `${start} ≤ ${payload}, ${payload + 6} ≤ ${end}`);
  assert.ok(readFileSync(join(dir, "contention.jsonl"), "utf8").trim().split("\n").length >= 4, "raw points kept for audit");
  // Nothing was changed at runtime: the slice keeps its weight, and holds nothing once the job is gone.
  await until("the slice is empty", () => sliceEmpty(slice), 15000);
  assert.equal(sliceProp(slice, "CPUWeight"), "10000");
  noRuntimeState(c);
});

test("S18 (TST-16): an exclusive slice that is missing or not as configured gives no priority, and the run says so: DISTURBED, not boosted evidence", async () => {
  const c = context("excl-missing", { config: fast });
  const x = submit(c, c.wt("x"), "--class", "exclusive", "--", "sleep", "2");
  const w = waitFor(c, x);
  assert.equal(w.code, 0);
  const ctx = result(c, x).context;
  assert.equal(ranIn(c, x).includes(`/${c.env.SILTWAKE_SCHED_EXCLUSIVE_SLICE}/`), false, "ran in the lane's slice");
  assert.equal(ctx.boost.status, "unavailable");
  assert.equal(ctx.disturbed, true);
  assert.match(ctx.reasons.join(), /the job didn't run in the boosted slice .* \(.*(is not installed|has CPUWeight \[not set\]).*\): not boosted evidence/);
  assert.match(w.err, /no CPU priority \(unavailable\).*DISTURBED/);
  await exclusiveSlice(c, { weight: 100 });
  const y = submit(c, c.wt("y"), "--class", "exclusive", "--", "true");
  assert.equal(waitFor(c, y).code, 0);
  assert.match(result(c, y).context.boost.why, /has CPUWeight 100, not 10000/);
  assert.equal(result(c, y).context.disturbed, true);
});

test("S19 (TST-16): private state without a named exclusive slice uses none", async () => {
  const c = context("no-excl", { config: fast });
  delete c.env.SILTWAKE_SCHED_EXCLUSIVE_SLICE;
  const x = submit(c, c.wt("x"), "--class", "exclusive", "--", "true");
  assert.equal(waitFor(c, x).code, 0);
  assert.equal(result(c, x).context.boost, null);
  noRuntimeState(c);
});

test("S20 (TST-16 R1-F5): a GPU client that starts after admission and outlives the job is caught by the final scan", async () => {
  const c = context("gpu-late", { config: { ...fast, disturbed: { jobCpuSomePct: 100, jobMemSomePct: 100, jobMajorFaults: 1e9, jobSwapIns: 1e9, stealPct: 100 } } });
  await exclusiveSlice(c);
  const x = submit(c, c.wt("x"), "--class", "exclusive", "--", "sleep", "5");
  await running(c, x);
  await sleep(1500); // after the first scan
  const client = spawn("bash", ["-c", "exec 3</dev/nvidia0; exec sleep 30"], { stdio: "ignore" });
  try {
    assert.equal(waitFor(c, x).code, 0);
    const r = result(c, x);
    assert.ok(r.gpuShared?.some((u) => u.pid === client.pid), JSON.stringify(r.gpuShared));
    assert.match(r.context.reasons.join(), new RegExp(`GPU was shared outside the lease \\(pid [^)]*${client.pid}`));
  } finally { client.kill(); }
});

test("S21 (TST-16): a holder killed while its exclusive job runs leaves nothing to clean: the job stops with it, the slice empties, the result is unmeasured", async () => {
  const c = context("excl-crash", { config: fast });
  const slice = await exclusiveSlice(c);
  const x = submit(c, c.wt("x"), "--class", "exclusive", "--", "sleep", "60");
  await until("started in the slice", () => existsSync(join(c.sched, "jobs", x, "cgroup")) && ranIn(c, x).includes(`/${slice}/`), 30000);
  killOwned((await holderOf(c, x)).holder);
  await until("recovered", () => { hc(c, ["status"]); return result(c, x); }, 60000);
  assert.deepEqual([result(c, x).context.measured, result(c, x).context.disturbed], [false, true]);
  await until("the slice is empty", () => sliceEmpty(slice), 30000);
  assert.equal(sliceProp(slice, "CPUWeight"), "10000", "unchanged");
  noRuntimeState(c);
});

test("S22 (TST-16): install writes the exclusive slice's unit once; a rollback to the real live version while an exclusive job runs needs no cleanup; uninstall keeps the unit while it's in use", async () => {
  const c = context("excl-rollback", { config: fast });
  const home = join(c.dir, "home"), env = { ...c.env, SILTWAKE_SCHED_HOME: home }, slice = c.env.SILTWAKE_SCHED_EXCLUSIVE_SLICE;
  const unitFile = join(process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid()}`, "systemd", "user", slice);
  const bash = (script, args = []) => spawnSync("bash", [script, ...args], { env, encoding: "utf8" });
  const current = () => readlinkSync(join(home, "current"));
  // The live version before TST-16 (root 91dc1ab's scheduler), from its own tree.
  const oldTree = join(c.dir, "old-tree");
  mkdirSync(join(oldTree, "scripts"), { recursive: true });
  // From the repository's top level: run in a subdirectory, git archive takes only that subdirectory.
  spawnSync("sh", ["-c", `cd "$(git -C ${V1_REPO} rev-parse --show-toplevel)" && git archive 91dc1ab:scripts | tar -x -C ${join(oldTree, "scripts")}`]);
  assert.equal(bash(join(oldTree, "scripts", "heavy", "install.sh")).status, 0);
  const old = current();
  assert.equal(old, "95f340380c25", "the exact live version");
  assert.equal(existsSync(unitFile), false, "the old version writes no exclusive slice");
  const oldHc = (args) => { const r = spawnSync(process.execPath, [join(home, old, "heavy-check.mjs"), ...args], { cwd: c.wt("old-cwd"), env, encoding: "utf8", timeout: 120000 }); return { code: r.status, out: r.stdout, err: r.stderr }; };
  // Upgrading writes the unit (a runtime unit for this private state), with the heavy slice's caps.
  let r = bash(join(here, "install.sh"));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`installed ${slice.replace(/\./g, "\\.")}`));
  assert.match(readFileSync(unitFile, "utf8"), /CPUWeight=10000\nCPUQuota=\d+%\nMemoryAccounting=yes\nMemoryMax=\d+M\nMemorySwapMax=0/);
  assert.deepEqual([sliceProp(slice, "LoadState"), sliceProp(slice, "CPUWeight"), sliceProp(slice, "MemorySwapMax")], ["loaded", "10000", "0"]);
  assert.doesNotMatch(bash(join(here, "install.sh")).stdout, new RegExp(`installed ${slice.replace(/\./g, "\\.")}`), "written once");
  // An exclusive job runs in it; rolling back with the old tree's own installer meanwhile needs nothing.
  const x = submit(c, c.wt("x"), "--class", "exclusive", "--", "sleep", "8");
  await until("started in the slice", () => existsSync(join(c.sched, "jobs", x, "cgroup")) && ranIn(c, x).includes(`/${slice}/`), 30000);
  assert.equal(bash(join(oldTree, "scripts", "heavy", "install.sh")).status, 0);
  assert.equal(current(), old);
  assert.equal(waitFor(c, x).code, 0);
  assert.deepEqual(result(c, x).context.boost, { slice, weight: 10000, status: "applied", throttled: { periods: 0, usec: 0 } }, "it kept its priority to its end");
  await until("the slice is empty", () => sliceEmpty(slice), 15000);
  // The old version then runs its own exclusive job, in the lane's slice as before; nothing is left over.
  const o = oldHc(["submit", "--class", "exclusive", "--", "true"]).out.trim();
  assert.equal(oldHc(["wait", o]).code, 0);
  assert.equal(ranIn(c, o).includes(`/${slice}/`), false);
  assert.equal(oldHc(["status"]).code, 0);
  noRuntimeState(c);
  // Uninstall leaves the inert unit; removing it is a separate step that refuses while a ticket runs.
  assert.equal(bash(join(here, "install.sh")).status, 0);
  const y = submit(c, c.wt("y"), "--class", "exclusive", "--", "sleep", "6");
  await until("started in the slice", () => existsSync(join(c.sched, "jobs", y, "cgroup")) && ranIn(c, y).includes(`/${slice}/`), 30000);
  r = bash(join(here, "install.sh"), ["--uninstall"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /stays \(inert without jobs\)/);
  assert.ok(existsSync(unitFile));
  r = bash(join(here, "install.sh"), ["--remove-exclusive-slice"]);
  assert.equal(r.status, 3);
  assert.match(r.stderr, new RegExp(`not removed: .* while (tickets ${y} are running|.* holds processes)`));
  assert.ok(existsSync(unitFile));
  assert.equal(waitFor(c, y).code, 0);
  assert.equal(result(c, y).context.boost.status, "applied");
  r = bash(join(here, "install.sh"), ["--remove-exclusive-slice"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`removed ${slice.replace(/\./g, "\\.")}`));
  assert.equal(existsSync(unitFile), false);
});

test("S23 (TST-16 R5-F1): priority is judged on the slice the kernel ran the job in: a unit removed between the readiness check and the launch (a default slice) and a slice with the wrong memory cap are no priority, DISTURBED", async () => {
  const c = context("excl-live", { config: fast });
  const home = join(c.dir, "home"), slice = c.env.SILTWAKE_SCHED_EXCLUSIVE_SLICE;
  const unitFile = join(process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid()}`, "systemd", "user", slice);
  assert.equal(spawnSync("bash", [join(here, "install.sh")], { env: { ...c.env, SILTWAKE_SCHED_HOME: home }, encoding: "utf8" }).status, 0);
  assert.ok(existsSync(unitFile));
  // The reviewer's interleaving: readiness passes, then the unit goes before the scope launches.
  const d = join(c.dir, "shim");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "systemctl"), `#!/bin/bash
out=$(/usr/bin/systemctl "$@"); rc=$?; printf '%s\n' "$out"
if [[ "$*" == *"-p LoadState -p CPUWeight"*"${slice}"* && -e "${d}/arm" ]]; then
  rm -f "${d}/arm" "${unitFile}"; /usr/bin/systemctl --user stop "${slice}"; /usr/bin/systemctl --user daemon-reload
fi
exit $rc
`, { mode: 0o755 });
  writeFileSync(join(d, "arm"), "");
  c.env.PATH = `${d}:${process.env.PATH}`;
  const x = submit(c, c.wt("x"), "--class", "exclusive", "--", "sleep", "2");
  const wx = waitFor(c, x);
  assert.equal(wx.code, 0);
  assert.equal(existsSync(join(d, "arm")), false, "the interleaving happened");
  assert.ok(ranIn(c, x).includes(`/${slice}/`), "the path still names the slice");
  const bx = result(c, x).context.boost;
  assert.equal(bx.status, "unavailable");
  assert.match(bx.why, /at the start: cpu\.weight 100 \(wants 10000\)/);
  assert.match(bx.why, /memory\.swap\.max max \(wants 0\)/);
  assert.equal(result(c, x).context.disturbed, true);
  assert.match(wx.err, /no CPU priority \(unavailable\).*DISTURBED: .*didn't run in the boosted slice/);
  // A slice with every readiness property right but the wrong memory cap.
  await sleep(500);
  await exclusiveSlice(c, { memoryMiB: 4096 });
  const y = submit(c, c.wt("y"), "--class", "exclusive", "--", "true");
  assert.equal(waitFor(c, y).code, 0);
  assert.match(result(c, y).context.boost.why, /memory\.max 4294967296 \(wants \d+\)/);
  assert.equal(result(c, y).context.disturbed, true);
});


test("S24 (TST-16 R6, R7, R10): the exclusive slice's unit is never removed or rewritten while the slice holds processes, also when systemd can't be asked or there's no unit file: maintenance stays until a rerun; a running ticket refuses an install before anything pauses", async () => {
  const c = context("excl-inuse", { config: fast });
  const home = join(c.dir, "home"), slice = c.env.SILTWAKE_SCHED_EXCLUSIVE_SLICE, esc = slice.replace(/\./g, "\\.");
  const unitFile = join(process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid()}`, "systemd", "user", slice);
  const install = (args = [], extra = {}) => spawnSync("bash", [join(here, "install.sh"), ...args], { env: { ...c.env, SILTWAKE_SCHED_HOME: home, ...extra }, encoding: "utf8" });
  assert.equal(install().status, 0);
  const before = readFileSync(unitFile, "utf8");
  // A process in the slice (as an exclusive job's would be), with no ticket running.
  const unit = `sched1test-inuse-${c.n}`;
  const p = spawn("systemd-run", ["--user", "--scope", "--quiet", "--collect", `--slice=${slice}`, `--unit=${unit}`, "sleep", "60"], { stdio: "ignore" });
  try {
    await until("in the slice", () => !sliceEmpty(slice), 10000);
    // Removal: refused once the queue is paused; the pause stays, with the reason (R10-F1).
    let r = install(["--remove-exclusive-slice"]);
    assert.equal(r.status, 4, r.stderr);
    assert.match(r.stderr, new RegExp(`not removed: ${esc} holds processes\\. The queue admits nothing until this is done`));
    assert.match(stateOf(c).maintenance.reason, /unit update incomplete: .* holds processes/);
    // A failing query is not an empty slice (fail closed).
    const d = join(c.dir, "shim");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "systemctl"), `#!/bin/bash\nif [[ "$*" == *" show "*"${slice}"* ]]; then echo "Failed to connect to bus" >&2; exit 1; fi\nexec /usr/bin/systemctl "$@"\n`, { mode: 0o755 });
    r = install(["--remove-exclusive-slice"], { PATH: `${d}:${process.env.PATH}` });
    assert.equal(r.status, 4);
    assert.match(r.stderr, /systemd could not be asked/);
    assert.ok(existsSync(unitFile));
    // A reinstall that would change the unit (another pool size): the same; the file is untouched.
    writeFileSync(join(c.sched, "config.json"), JSON.stringify({ ...fast, poolMiB: 4096 }));
    r = install();
    assert.equal(r.status, 4);
    assert.match(r.stderr, new RegExp(`not installed: ${esc} holds processes`));
    assert.equal(readFileSync(unitFile, "utf8"), before);
    // With no unit file at all (the slice made implicitly), the population check still applies (R7-F1).
    rmSync(unitFile); spawnSync("systemctl", ["--user", "daemon-reload"]);
    r = install();
    assert.equal(r.status, 4, r.stdout);
    assert.equal(existsSync(unitFile), false);
    assert.ok(stateOf(c).maintenance, "still paused");
  } finally { spawnSync("systemctl", ["--user", "stop", `${unit}.scope`], { stdio: "ignore" }); p.kill(); }
  await until("empty", () => sliceEmpty(slice), 10000);
  // Once empty, the rerun recovers: the unit is written and admission resumes.
  let r = install();
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(readFileSync(unitFile, "utf8"), before, "rewritten once idle");
  assert.equal(stateOf(c).maintenance, undefined);
  // A running ticket refuses an install before anything is paused (R7-F1).
  const q = submit(c, c.wt("q"), "--class", "quick", "--", "sleep", "5");
  await running(c, q);
  r = install(["--remove-exclusive-slice"]);
  assert.equal(r.status, 3);
  assert.match(r.stderr, new RegExp(`would change while tickets ${q} are running`));
  assert.deepEqual([existsSync(unitFile), stateOf(c).maintenance], [true, undefined], "nothing paused or changed");
  assert.equal(waitFor(c, q).code, 0);
  r = install(["--remove-exclusive-slice"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(existsSync(unitFile), false);
});


test("S25 (TST-16 R8, R9): the exclusive unit changes under maintenance: admission pauses (queued work waits, none fails), systemd's own view is verified, a failure leaves maintenance and a rerun recovers; an equal file with a stale manager, an unreadable file, and removal", async () => {
  const c = context("excl-maint", { config: fast });
  const home = join(c.dir, "home"), slice = c.env.SILTWAKE_SCHED_EXCLUSIVE_SLICE;
  const unitFile = join(process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid()}`, "systemd", "user", slice);
  const d = join(c.dir, "shim");
  mkdirSync(d, { recursive: true });
  // daemon-reload held well past the 30 s lock wait once, or failing until the mode is cleared; everything else is the real systemctl.
  writeFileSync(join(d, "systemctl"), `#!/bin/bash
m=$(cat "${d}/mode" 2>/dev/null)
if [[ " $* " == *" daemon-reload "* ]]; then
  case "$m" in
    hold-once) : > "${d}/mode"; sleep 40; exec /usr/bin/systemctl "$@" ;;
    fail) echo "Failed to reload daemon: injected" >&2; exit 1 ;;
  esac
fi
exec /usr/bin/systemctl "$@"
`, { mode: 0o755 });
  const shimmed = { PATH: `${d}:${process.env.PATH}` };
  const env = (extra = {}) => ({ ...c.env, SILTWAKE_SCHED_HOME: home, ...extra });
  const install = (args = [], extra = {}) => spawnSync("bash", [join(here, "install.sh"), ...args], { env: env(extra), encoding: "utf8", timeout: 120000 });
  const mode = () => readFileSync(join(c.sched, "mode"), "utf8").trim();
  const memMax = () => sliceProp(slice, "MemoryMax"), fileMem = () => String(Number(readFileSync(unitFile, "utf8").match(/MemoryMax=(\d+)M/)[1]) * 1048576);
  assert.equal(install().status, 0);
  assert.equal(memMax(), fileMem());
  const pool = (mib) => writeFileSync(join(c.sched, "config.json"), JSON.stringify({ ...fast, poolMiB: mib }));

  // 1. A reload held 40 s: admission pauses; a submission meanwhile queues (no failure) and runs once the update is verified.
  pool(4096);
  writeFileSync(join(d, "mode"), "hold-once");
  const inst = spawn("bash", [join(here, "install.sh"), "--mode", "serial"], { env: env(shimmed), stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; inst.stdout.on("data", (x) => { out += x; });
  const instDone = new Promise((res) => inst.on("exit", res));
  await until("maintenance", () => stateOf(c).maintenance, 15000);
  const q = submit(c, c.wt("q"), "--class", "quick", "--", "true");
  await sleep(3000);
  assert.equal(stateOf(c).tickets[q]?.state, "queued", "nothing is admitted during maintenance");
  const st = hc(c, ["status"]).out;
  assert.match(st, /MAINTENANCE for \d+s: exclusive unit update \(write\).*Recover: rerun scripts\/heavy\/install\.sh/);
  assert.match(st, new RegExp(`${q}.*maintenance`));
  assert.equal(await instDone, 0, out);
  assert.equal(stateOf(c).maintenance, undefined);
  assert.deepEqual([memMax(), mode()], [fileMem(), "serial"], "systemd has the new unit, then the mode switched");
  assert.equal(waitFor(c, q).code, 0, "the queued job ran after maintenance");
  install(["--mode", "normal"]);

  // 2. A failed reload: maintenance stays with the reason, nothing else switches, queued work waits; a rerun recovers.
  pool(2048);
  writeFileSync(join(d, "mode"), "fail");
  let r = install(["--mode", "serial"], shimmed);
  assert.equal(r.status, 4, r.stderr);
  assert.match(r.stderr, /not installed: systemd's reload failed \(.*injected.*\)\. The queue admits nothing until this is done/);
  assert.match(stateOf(c).maintenance.reason, /^unit update incomplete: systemd's reload failed/);
  assert.equal(mode(), "normal");
  const q2 = submit(c, c.wt("q2"), "--class", "quick", "--", "true");
  await sleep(2000);
  assert.equal(stateOf(c).tickets[q2]?.state, "queued");
  r = install(["--mode", "serial"]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual([stateOf(c).maintenance, memMax(), mode()], [undefined, fileMem(), "serial"]);
  assert.equal(waitFor(c, q2).code, 0);
  install(["--mode", "normal"]);

  // 3. An equal file with a stale manager (the file written, never reloaded): the rerun verifies systemd, not the file.
  pool(3072);
  const stale = memMax();
  const wantMiB = sliceLimits(machineCpus(loadConfig(c.env)), loadConfig(c.env)).memoryMaxMiB;
  writeFileSync(unitFile, readFileSync(unitFile, "utf8").replace(/MemoryMax=\d+M/, `MemoryMax=${wantMiB}M`));
  assert.equal(memMax(), stale, "systemd hasn't seen it");
  r = install();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(memMax(), String(wantMiB * 1048576));

  // 4. The previous file unreadable: nothing is changed; maintenance records why; a rerun once readable recovers.
  spawnSync("chmod", ["000", unitFile]);
  r = install();
  assert.equal(r.status, 4);
  assert.match(r.stderr, /could not read .* \(EACCES\)/);
  assert.match(stateOf(c).maintenance.reason, /could not read/);
  spawnSync("chmod", ["644", unitFile]);
  assert.equal(install().status, 0);
  assert.equal(stateOf(c).maintenance, undefined);

  // 5. Removal: the same shape.
  writeFileSync(join(d, "mode"), "fail");
  r = install(["--remove-exclusive-slice"], shimmed);
  assert.equal(r.status, 4, r.stderr);
  assert.ok(stateOf(c).maintenance);
  r = install(["--remove-exclusive-slice"]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual([existsSync(unitFile), stateOf(c).maintenance, sliceProp(slice, "CPUWeight")], [false, undefined, "[not set]"]);
});

test("S26 (TST-16 R10): installers are serialized (one never adopts, overwrites or clears another's mark; admission resumes only on the owner's verified finish), a dead installer's mark is taken over by the rerun, and the reload has a hard deadline (KILL after TERM)", async () => {
  const c = context("excl-serial", { config: fast });
  const home = join(c.dir, "home"), slice = c.env.SILTWAKE_SCHED_EXCLUSIVE_SLICE;
  const unitFile = join(process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid()}`, "systemd", "user", slice);
  const d = join(c.dir, "shim");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "systemctl"), `#!/bin/bash
m=$(cat "${d}/mode" 2>/dev/null)
if [[ " $* " == *" daemon-reload "* ]]; then
  case "$m" in
    hold:*) : > "${d}/mode"; sleep "\${m#hold:}"; exec /usr/bin/systemctl "$@" ;;
    ignore-term) trap '' TERM; while :; do sleep 0.2; done ;;
  esac
fi
exec /usr/bin/systemctl "$@"
`, { mode: 0o755 });
  const env = (extra = {}) => ({ ...c.env, SILTWAKE_SCHED_HOME: home, ...extra }), shimmed = { PATH: `${d}:${process.env.PATH}` };
  const start = (args = [], extra = {}) => { const p = spawn("bash", [join(here, "install.sh"), ...args], { env: env(extra), stdio: ["ignore", "pipe", "pipe"] }); p.out = ""; p.stdout.on("data", (x) => { p.out += x; }); p.stderr.on("data", (x) => { p.out += x; }); p.done = new Promise((res) => p.on("exit", res)); return p; };
  const install = (args = [], extra = {}) => spawnSync("bash", [join(here, "install.sh"), ...args], { env: env(extra), encoding: "utf8", timeout: 120000 });
  const pool = (mib) => writeFileSync(join(c.sched, "config.json"), JSON.stringify({ ...fast, poolMiB: mib }));
  assert.equal(install().status, 0);

  // 1. Two installers: B waits for A's whole operation; A's mark stays A's; nothing is admitted until A's verified finish.
  pool(4096);
  writeFileSync(join(d, "mode"), "hold:8");
  const A = start([], shimmed);
  await until("A paused the queue", () => stateOf(c).maintenance, 15000);
  const opA = stateOf(c).maintenance.op;
  const B = start(); // wants the same unit: a matching snapshot once A is done
  for (let i = 0; i < 10 && A.exitCode == null; i++) {
    assert.equal(stateOf(c).maintenance?.op, opA, "B never adopts, overwrites or clears A's mark");
    assert.equal(B.exitCode, null, "B waits for the installer lock");
    await sleep(500);
  }
  assert.equal(await A.done, 0, A.out);
  assert.equal(await B.done, 0, B.out);
  assert.equal(stateOf(c).maintenance, undefined);
  const q = submit(c, c.wt("q"), "--class", "quick", "--", "true");
  assert.equal(waitFor(c, q).code, 0);
  assert.equal(sliceProp(slice, "MemoryMax"), String(Number(readFileSync(unitFile, "utf8").match(/MemoryMax=(\d+)M/)[1]) * 1048576));

  // 2. An installer killed mid-reload: its mark stays (dead owner); the rerun takes it over and recovers.
  pool(3072);
  writeFileSync(join(d, "mode"), "hold:30");
  const K = start([], shimmed);
  await until("K paused the queue", () => stateOf(c).maintenance, 15000);
  const k = stateOf(c).maintenance;
  await sleep(1000);
  killOwned(k.by);
  await K.done;
  // Its orphaned reload shim (ours, in the private dir) and the shim's sleep still hold the installer lock's fd: stop them.
  for (const pid of spawnSync("pgrep", ["-f", join(d, "systemctl")], { encoding: "utf8" }).stdout.split("\n").filter(Boolean)) { spawnSync("pkill", ["-KILL", "-P", pid]); spawnSync("kill", ["-KILL", pid]); }
  assert.equal(stateOf(c).maintenance?.op, k.op, "a killed installer's mark stays");
  assert.match(hc(c, ["status"]).out, /MAINTENANCE .*ended.*Recover: rerun scripts\/heavy\/install\.sh/);
  const r = install();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(stateOf(c).maintenance, undefined, "taken over and cleared");

  // 3. A reload that ignores TERM: killed after the grace; maintenance stays; no shim left; a rerun recovers.
  pool(2048);
  writeFileSync(join(d, "mode"), "ignore-term");
  const t0 = Date.now();
  const x = install([], { ...shimmed, SILTWAKE_EXCLUSIVE_RELOAD_MS: "1500" });
  assert.equal(x.status, 4, x.stderr);
  assert.ok(Date.now() - t0 < 15000, `bounded: ${Date.now() - t0} ms`);
  assert.match(x.stderr, /systemd's reload overran 1\.5 s and was stopped \(killed\)/);
  assert.ok(stateOf(c).maintenance);
  await sleep(500);
  assert.equal(spawnSync("pgrep", ["-f", join(d, "systemctl")]).status, 1, "the reload was really stopped");
  writeFileSync(join(d, "mode"), "");
  assert.equal(install().status, 0);
  assert.equal(stateOf(c).maintenance, undefined);
});

test("S27 (TST-16b): one installer lock covers the whole install, publication included: a second install.sh waits while the first copies its version; the unit helper runs only under that lock", async () => {
  const c = context("install-tail", { config: fast });
  const home = join(c.dir, "home"), d = join(c.dir, "shim"), held = join(d, "held"), go = join(d, "go");
  mkdirSync(d, { recursive: true });
  // cp held at publication (after the exclusive unit is done) until released.
  writeFileSync(join(d, "cp"), `#!/bin/bash\n: > '${held}'\nwhile [[ ! -e '${go}' ]]; do sleep 0.05; done\nexec /usr/bin/cp "$@"\n`, { mode: 0o755 });
  const env = (extra = {}) => ({ ...c.env, SILTWAKE_SCHED_HOME: home, ...extra });
  const start = (extra = {}) => { const p = spawn("bash", [join(here, "install.sh")], { env: env(extra), stdio: ["ignore", "pipe", "pipe"] }); p.out = ""; p.stdout.on("data", (x) => { p.out += x; }); p.stderr.on("data", (x) => { p.out += x; }); p.done = new Promise((res) => p.on("exit", res)); return p; };
  const A = start({ PATH: `${d}:${process.env.PATH}` });
  try {
    await until("A publishing", () => existsSync(held), 30000);
    assert.equal(stateOf(c).maintenance, undefined, "the unit step is done");
    assert.equal(spawnSync("flock", ["-n", join(c.sched, "install.lock"), "true"]).status, 1, "the installer lock is still held through publication");
    const B = start();
    await sleep(2000);
    assert.equal(B.exitCode, null, "B waits for A's whole run");
    assert.equal(existsSync(join(home, "current")), false, "nothing published yet");
    writeFileSync(go, "");
    assert.equal(await A.done, 0, A.out);
    assert.equal(await B.done, 0, B.out);
    assert.ok(existsSync(join(home, "current", "heavy-check.mjs")));
    assert.equal(spawnSync("bash", ["-c", `cd '${join(home, "current")}' && for f in *; do cmp -s "$f" '${here}/'"$f" || [[ $f == alickers-job.sh ]] || { [[ $f == cgroup-scope.mjs ]] && cmp -s "$f" '${here}/../cgroup-scope.mjs'; } || echo "$f"; done`], { encoding: "utf8" }).stdout, "", "a complete version (the real cgroup-scope.mjs, where the repository re-exports it)");
  } finally { writeFileSync(go, ""); await A.done; }
  // The unit helper outside install.sh (no lock fd, or a fd that isn't the lock): refused, nothing paused.
  const slice = c.env.SILTWAKE_SCHED_EXCLUSIVE_SLICE, unitDir = join(process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid()}`, "systemd", "user");
  for (const extra of [{}, { SILTWAKE_INSTALL_LOCK_FD: "0" }]) {
    const r = spawnSync(process.execPath, [join(here, "exclusive-unit.mjs"), "write", slice, unitDir], { env: env(extra), encoding: "utf8", timeout: 30000 });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /runs only under install\.sh's installer lock/);
    assert.equal(stateOf(c).maintenance, undefined);
  }
});
