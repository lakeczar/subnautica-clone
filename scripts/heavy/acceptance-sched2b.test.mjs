// SCHED-2b acceptance tests: the remote lane and machine tags, against a fake
// second worker (acceptance-lib.mjs fakeSandbox: the transport's protocol,
// siltwake-job's lock, pause flag, user scope and MemoryHigh) with real
// systemd scopes and private state. The real sandbox is never touched here;
// one real canary runs at handoff (SCHED-2.md).
//
//   node --test --test-concurrency=1 scripts/heavy/acceptance-sched2b.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { alive, procStart, scopePopulated } from "./state.mjs";
import { blockedBy, context, fakeSandbox, hc, here, holderOf, killOwned, result, running, scopeActive, sleep, submit, until } from "./acceptance-lib.mjs";

const fast = { minStallS: 1, soakYieldS: 3 };
const log = (c, id) => readFileSync(join(c.sched, "jobs", id, "output.log"), "utf8");
const waitFor = (c, id) => hc(c, ["wait", id]);
const git = (dir, ...args) => spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
const REMOTE = "RTX 4070 Laptop (alickers, shared desktop host)";

/** One health probe of the context's (fake) sandbox, as a waiting supervisor makes. */
async function probeNow(c) {
  const { loadConfig } = await import("./state.mjs");
  const { probe } = await import("./remote.mjs");
  return probe(loadConfig(c.env));
}
/** A context with a fake second worker and a committed worktree. */
async function lane(name, extra = {}) {
  const c = context(name);
  const remote = fakeSandbox(c, extra);
  writeFileSync(join(c.sched, "config.json"), JSON.stringify({ ...fast, remote }));
  c.repoDir = c.repo("r");
  c.fake.clone(c.repoDir);
  c.head = git(c.repoDir, "rev-parse", "HEAD").stdout.trim();
  await probeNow(c); // a running queue has a health reading; any never waits for one (R1-F6)
  return c;
}
const commit = (dir, file, text) => { writeFileSync(join(dir, file), text); git(dir, "add", file); git(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", file); return git(dir, "rev-parse", "HEAD").stdout.trim(); };

test("B1: an any job runs on alickers at its commit; the worktree stays free; an evidence pack comes back whole", async () => {
  const c = await lane("any-remote");
  const head = commit(c.repoDir, "make-pack.sh", "mkdir -p pack/shots; echo one > pack/shots/a.png; echo summary > pack/summary.md; echo result > single.json\n");
  const id = submit(c, c.repoDir, "--class", "playthrough", "--artifact", "pack", "--artifact", "single.json", "--", "sh", "-c", "sh make-pack.sh; echo ran-on-$(hostname)-in-$(git rev-parse HEAD); sleep 2");
  await running(c, id);
  // A remote job takes nothing here, not even the worktree.
  const local = submit(c, c.repoDir, "--class", "quick", "--", "true");
  assert.equal(waitFor(c, local).code, 0);
  const w = waitFor(c, id);
  assert.equal(w.code, 0, w.err);
  const r = result(c, id);
  assert.deepEqual([r.remote, r.machine, r.machineTag, r.evidence.commit, r.evidence.bound], [true, REMOTE, "any", head, true]);
  assert.match(log(c, id), new RegExp(`alickers-job: testing ${head} on \\S+\\n(.*\\n)*ran-on-.*-in-${head}`));
  assert.ok(result(c, local).admittedAt < r.endedAt, "the local job ran while the remote one did");
  const pack = join(c.dir, "artifacts", id, "pack");
  assert.equal(readFileSync(join(pack, "shots", "a.png"), "utf8"), "one\n");
  assert.equal(readFileSync(join(pack, "summary.md"), "utf8"), "summary\n");
  assert.equal(readFileSync(join(c.dir, "artifacts", id, "single.json"), "utf8"), "result\n");
  assert.deepEqual(r.artifacts.map((a) => a.local), [pack, join(c.dir, "artifacts", id, "single.json")]);
  assert.ok(r.artifacts[0].bytes > 0);
  const led = readFileSync(join(c.sched, "ledger.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).find((l) => l.event === "job" && l.ticket === id);
  assert.equal(led.machine, REMOTE);
  assert.equal(led.artifacts[0].local, pack);
  assert.match(w.err, new RegExp(`on ${REMOTE.replace(/[()]/g, "\\$&")}; artifacts: ${pack}`));
  // The sandbox's shared checkout is left clean, and the lane's files are gone.
  assert.equal(git(join(c.fake.dir, "repo"), "status", "--porcelain").stdout, "");
  assert.equal(existsSync(join(c.fake.dir, "lane", "jobs", id)), false);
});

test("B2: paused alickers: a 4070 job waits (remote-paused) and runs when it resumes; an any job runs here at once", async () => {
  const c = await lane("paused");
  c.fake.pause(true);
  const g = submit(c, c.repoDir, "--class", "gpu", "--machine", "4070", "--", "sh", "-c", "echo on-the-4070");
  const a = submit(c, c.wt("other"), "--class", "playthrough", "--", "sh", "-c", "echo here");
  await until("paused seen", () => blockedBy(c, g) === "remote-paused", 20000);
  assert.equal(waitFor(c, a).code, 0);
  assert.equal(result(c, a).remote, undefined);
  assert.equal(result(c, a).machine, "RTX 3090 (factory-worker)");
  // An --artifact of a job that ran here is where it wrote it, relative to its own directory.
  const here = submit(c, c.repoDir, "--class", "playthrough", "--machine", "any", "--artifact", "out.txt", "--", "sh", "-c", "echo x > out.txt");
  assert.equal(waitFor(c, here).code, 0);
  assert.deepEqual(result(c, here).artifacts, [{ path: "out.txt", local: join(c.repoDir, "out.txt") }]);
  assert.match(hc(c, ["status"]).out, /alickers \(second worker\): paused/);
  c.fake.pause(false);
  const w = waitFor(c, g);
  assert.equal(w.code, 0, w.err);
  assert.equal(result(c, g).remote, true);
  assert.match(log(c, g), /on-the-4070/);
});

test("B3: paused after dispatch (its 75 comes before 'testing'): an any job falls back here keeping its place; a 4070 job waits again", async () => {
  const c = await lane("fallback");
  // The health says up, but the owner paused between the probe and the dispatch.
  const healthUp = () => writeFileSync(join(c.sched, "remote.json"), JSON.stringify({ state: "up", at: Date.now() + 3600000, failures: 0 }));
  healthUp();
  c.fake.pause(true);
  const a = submit(c, c.repoDir, "--class", "playthrough", "--", "sh", "-c", "echo ran-somewhere; exit 75");
  const w = waitFor(c, a);
  assert.equal(w.code, 75, "the job's own 75, after it ran here, is the job's");
  const r = result(c, a);
  assert.equal(r.machine, "RTX 3090 (factory-worker)");
  assert.match(r.fellBack.reason, /paused/);
  assert.match(log(c, a), /alickers is paused.*: queued again to run here/);
  const led = readFileSync(join(c.sched, "ledger.jsonl"), "utf8");
  assert.match(led, /"event":"remote-fallback".*"to":"here"/);
  healthUp();
  const g = submit(c, c.repoDir, "--class", "gpu", "--machine", "4070", "--", "true");
  await until("4070 waits again", () => /remote-paused|remote/.test(blockedBy(c, g) ?? "") && result(c, g) == null && readFileSync(join(c.sched, "ledger.jsonl"), "utf8").includes(`"ticket":"${g}"`), 30000);
  assert.equal(result(c, g), null, "a 4070 job never runs here");
  c.fake.pause(false);
  assert.equal(waitFor(c, g).code, 0);
  assert.equal(result(c, g).remote, true);
});

test("B4: unreachable: a 4070 job waits (remote-down), any runs here; dirty trees and local paths stay here; a 4070 job is refused for them", async () => {
  const c = await lane("down");
  c.fake.unreachable(true);
  const g = submit(c, c.repoDir, "--class", "gpu", "--machine", "4070", "--", "true");
  await until("down seen", () => blockedBy(c, g) === "remote-down", 30000);
  const a = submit(c, c.wt("a"), "--class", "playthrough", "--", "true");
  assert.equal(waitFor(c, a).code, 0);
  assert.equal(result(c, a).remote, undefined);
  hc(c, ["cancel", g]);
  c.fake.unreachable(false);
  writeFileSync(join(c.repoDir, "file.txt"), "dirty\n");
  const dirty = hc(c, ["submit", "--class", "gpu", "--machine", "4070", "--", "true"], { cwd: c.repoDir });
  assert.equal(dirty.code, 2);
  assert.match(dirty.err, /--machine 4070 runs on alickers, but uncommitted changes/);
  git(c.repoDir, "checkout", "-q", "--", "file.txt");
  const ext = hc(c, ["submit", "--class", "gpu", "--machine", "4070", "--", "node", "/work/tmp/some-local-input.mjs"], { cwd: c.repoDir });
  assert.equal(ext.code, 2);
  assert.match(ext.err, /names local paths alickers lacks: \/work\/tmp\/some-local-input\.mjs/);
  const extAny = hc(c, ["submit", "--class", "playthrough", "--machine", "any", "--", "sh", "-c", "echo /work/tmp/x"], { cwd: c.repoDir });
  assert.match(extAny.err, /runs here \(factory-worker\), not on alickers: it names local paths/);
  assert.equal(waitFor(c, extAny.out.trim()).code, 0);
  assert.equal(result(c, extAny.out.trim()).remote, undefined);
});

test("B5: stall detection on alickers: silence stops it (123) once it has started; relayed heartbeats keep a quiet job alive", async () => {
  const c = await lane("stall");
  const s = submit(c, c.repoDir, "--class", "playthrough", "--stall", "4", "--", "sh", "-c", "echo started; sleep 60");
  const w = waitFor(c, s);
  assert.equal(w.code, 123, w.err);
  assert.equal(result(c, s).stopReason, "stalled");
  assert.match(log(c, s), /stalled: no output and no heartbeat from the sandbox/);
  const beat = submit(c, c.repoDir, "--class", "playthrough", "--stall", "4", "--", "sh", "-c", "for i in 1 2 3 4 5 6 7 8; do touch \"$SILTWAKE_JOB_HEARTBEAT\"; sleep 1; done; echo done");
  const wb = waitFor(c, beat);
  assert.equal(wb.code, 0, wb.err);
  assert.doesNotMatch(log(c, beat), /stalled/);
  // Waiting for the sandbox's lock (another agent's direct call) is not silence (a 4070 job waits for it).
  const holder = spawn("flock", [join(c.fake.dir, "lock"), "sleep", "8"], { stdio: "ignore" });
  try {
    await sleep(300);
    const waiting = submit(c, c.repoDir, "--class", "playthrough", "--machine", "4070", "--stall", "4", "--", "sh", "-c", "echo after-the-lock");
    const ww = waitFor(c, waiting);
    assert.equal(ww.code, 0, ww.err);
    assert.equal(result(c, waiting).remote, true);
    assert.match(log(c, waiting), /after-the-lock/);
  } finally { holder.kill(); }
});

test("B6: memory.high throttling on alickers is reported after the notice window and stopped at the stall window ('throttled')", async (t) => {
  if (spawnSync("python3", ["-c", "1"]).status !== 0) { t.skip("no python3"); return; }
  const c = await lane("throttle");
  c.env.FAKE_MEMORY_HIGH = "96M";
  const id = submit(c, c.repoDir, "--class", "playthrough", "--stall", "10", "--", "python3", "-c",
    "import time\nkeep=bytearray(140<<20)\nwhile True:\n  b=bytearray(8<<20); print('working', flush=True); time.sleep(0.2)");
  const w = waitFor(c, id);
  assert.equal(w.code, 123, w.err);
  const r = result(c, id);
  assert.equal(r.stopReason, "throttled");
  assert.match(r.label, /throttled: held at the sandbox's MemoryHigh/);
  assert.match(log(c, id), /throttled: the sandbox's MemoryHigh .* has been throttling this job for \d+s/);
});

test("B7: cancel stops a running remote job on the sandbox; a cancel while it waits for the sandbox's lock means it never runs", async () => {
  const c = await lane("cancel");
  const id = submit(c, c.repoDir, "--class", "playthrough", "--", "sh", "-c", "while :; do echo .; sleep 0.5; done");
  await until("started remotely", () => existsSync(join(c.fake.dir, "lane", "jobs", id, "a1", "pid")) && log(c, id).includes("alickers-job: testing"), 30000);
  const [pid, start] = readFileSync(join(c.fake.dir, "lane", "jobs", id, "a1", "pid"), "utf8").trim().split(" ").map(Number);
  hc(c, ["cancel", id]);
  assert.equal(result(c, id).code, 75);
  assert.equal(result(c, id).stopReason, "cancelled");
  assert.ok(procStart(pid) !== start, "the wrapper on the sandbox is gone");
  const units = spawnSync("systemctl", ["--user", "list-units", `sched2bfake-${c.n}-job-*`, "--no-legend"], { encoding: "utf8" }).stdout.trim();
  assert.equal(units, "", "its siltwake-job scope is gone");
  const holder = spawn("flock", [join(c.fake.dir, "lock"), "sleep", "6"], { stdio: "ignore" });
  try {
    await sleep(300);
    const marker = join(c.fake.dir, "repo", "must-not-exist"); // where the job would write it, on the sandbox
    const q = submit(c, c.repoDir, "--class", "playthrough", "--machine", "4070", "--", "sh", "-c", "touch must-not-exist"); // 4070 waits for the lock
    await running(c, q);
    await sleep(1500);
    hc(c, ["cancel", q]);
    assert.equal(result(c, q).code, 75);
    await sleep(6000); // the lock frees; the sandbox would start it now
    assert.equal(existsSync(marker), false, "cancelled while waiting for the sandbox: the command never ran");
  } finally { holder.kill(); }
});

test("B8 (R1-F3): the remote holder SIGKILLed while a quiet job runs (and a quiet detached descendant): recovery stops it there, keeping the slot until then", async () => {
  const c = await lane("holder-dies");
  const id = submit(c, c.repoDir, "--class", "playthrough", "--", "sh", "-c", "(sleep 120 &); sleep 120");
  await until("started remotely", () => existsSync(join(c.fake.dir, "lane", "jobs", id, "a1", "pid")) && log(c, id).includes("testing"), 30000);
  const [pid, start] = readFileSync(join(c.fake.dir, "lane", "jobs", id, "a1", "pid"), "utf8").trim().split(" ").map(Number);
  const tk = await holderOf(c, id);
  killOwned(tk.holder); // its transport, in the same scope, lives on and says nothing
  const w = waitFor(c, id);
  assert.equal(procStart(pid) === start, false, "the job on the sandbox was stopped before the ticket ended");
  assert.equal(w.code, 137, w.err);
  assert.match(w.err, /killed: its remote holder died; the job on alickers was stopped/);
  assert.equal(result(c, id).evidence.bound, false);
  await until("no fake sandbox scope left", () => spawnSync("systemctl", ["--user", "list-units", `sched2bfake-${c.n}-job-*`, "--no-legend"], { encoding: "utf8" }).stdout.trim() === "", 30000);
});

test("B9: a soak takes alickers first and yields it to a waiting 4070 job; while alickers is paused a soak runs here", async () => {
  const c = await lane("soak");
  const s = submit(c, c.repoDir, "--class", "soak", "--", "sh", "-c", "while :; do echo tick; [ -e \"$SILTWAKE_JOB_YIELD\" ] && { echo saw-yield; exit 0; }; sleep 0.5; done");
  await running(c, s);
  await until("on alickers", () => log(c, s).includes("alickers-job: testing"), 30000);
  const g = submit(c, c.repoDir, "--class", "gpu", "--machine", "4070", "--", "sh", "-c", "echo 4070-ran");
  const ws = waitFor(c, s);
  assert.equal(ws.code, 0, ws.err); // it saw the notice and finished on its own
  assert.match(log(c, s), /yield notice: a 4070 job is waiting for alickers/);
  assert.match(log(c, s), /saw-yield/);
  assert.equal(waitFor(c, g).code, 0);
  assert.equal(result(c, g).remote, true);
  c.fake.pause(true);
  writeFileSync(join(c.sched, "remote.json"), JSON.stringify({ state: "paused", at: Date.now() + 3600000, failures: 0 }));
  const local = submit(c, c.wt("l"), "--class", "soak", "--", "sh", "-c", "echo local-soak");
  assert.equal(waitFor(c, local).code, 0);
  assert.equal(result(c, local).remote, undefined);
});

test("B10: a remote job's own exit codes pass through after 'testing'; units and leftovers are clean", async () => {
  const c = await lane("codes");
  const a = submit(c, c.repoDir, "--class", "playthrough", "--", "sh", "-c", "exit 7");
  assert.equal(waitFor(c, a).code, 7);
  const b = submit(c, c.repoDir, "--class", "playthrough", "--", "sh", "-c", "exit 255");
  const wb = waitFor(c, b);
  assert.equal(wb.code, 255, `a 255 after testing with the tested line is the job's: ${JSON.stringify(result(c, b))} ${log(c, b)}`);
  assert.equal(result(c, b).fellBack, undefined);
  // The sandbox's own timeout at an explicit deadline: 124 there, a deadline result, never a rerun.
  const d = submit(c, c.repoDir, "--class", "gpu", "--machine", "4070", "--deadline", "3", "--", "sh", "-c", "echo started; sleep 30");
  const wd = waitFor(c, d);
  assert.equal(wd.code, 124, wd.err);
  assert.deepEqual([result(c, d).stopReason, result(c, d).attempts, result(c, d).remote], ["deadline", 1, true]);
  const left = spawnSync("systemctl", ["--user", "list-units", `sched2bfake-${c.n}-job-*`, "--no-legend"], { encoding: "utf8" }).stdout.trim();
  assert.equal(left, "");
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(c.sched, "state.json"), "utf8")).tickets), []);
  void alive; void scopePopulated; void readdirSync;
});

test("B11: private state without a remote never reaches a sandbox; a recovery stop needs the lane the job was sent to", async () => {
  const c = context("no-remote");
  const { loadConfig } = await import("./state.mjs");
  const { readHealth, remoteConfig } = await import("./remote.mjs");
  const cfg = loadConfig(c.env);
  assert.equal(remoteConfig(cfg).enabled, false);
  assert.match(readHealth(cfg).detail, /private state without a remote/);
  const a = submit(c, c.repo("r"), "--class", "playthrough", "--", "true");
  assert.equal(waitFor(c, a).code, 0);
  assert.equal(result(c, a).remote, undefined);
  assert.match(hc(c, ["status"]).out, /alickers \(second worker\): off \(private state without a remote/);
  // --stop for a ticket with no recorded lane does nothing (and exits at once).
  const t0 = Date.now();
  const s = spawnSync(process.execPath, [new URL("./remote-holder.mjs", import.meta.url).pathname, "--stop", "261023-000000-none"], { env: c.env, encoding: "utf8", timeout: 20000 });
  assert.equal(s.status, 0, s.stderr);
  assert.ok(Date.now() - t0 < 5000);
});

// SCHED-2b R1 ----------------------------------------------------------------

test("B12 (R1-F1): a direct caller waiting on the sandbox's lock changes commits and reuses the artifact's name: the fetched pack is this job's, and the other job's files are left alone", async () => {
  const c = await lane("direct-race");
  const head = commit(c.repoDir, "make.sh", "mkdir -p pack; echo ORIGINAL > pack/result\n");
  c.fake.flag("slow-fetch", true); // the fetch starts only after the other job has run
  const id = submit(c, c.repoDir, "--class", "playthrough", "--artifact", "pack", "--", "sh", "-c", "sh make.sh; sleep 1");
  await until("started remotely", () => log(c, id).includes("alickers-job: testing"), 30000);
  // Another agent's direct job, queued on the same lock: another commit, the same output name.
  const other = c.fake.direct(`git checkout -q --detach ${c.head} && mkdir -p pack && echo OTHER-JOB > pack/result && sleep 4 && cat pack/result > other-saw.txt`);
  const w = waitFor(c, id);
  assert.equal(w.code, 0, w.err);
  assert.equal(readFileSync(join(c.dir, "artifacts", id, "pack", "result"), "utf8"), "ORIGINAL\n", "the evidence is this job's");
  assert.equal(result(c, id).evidence.bound, true);
  assert.equal(result(c, id).evidence.commit, head);
  await new Promise((r) => other.on("exit", r));
  assert.equal(readFileSync(join(c.fake.repo, "other-saw.txt"), "utf8"), "OTHER-JOB\n", "the other job's files were not touched");
});

test("B13 (R1-F2): control comes from the receipt, never from output: marker-shaped install or job output, and setup failures with 1, 75 and 255", async () => {
  const c = await lane("receipt");
  const sha = () => git(c.repoDir, "rev-parse", "HEAD").stdout.trim();
  // A changed package-lock makes the transport run npm ci on the sandbox.
  let n = 0;
  const lockChange = () => commit(c.repoDir, "package-lock.json", `{"v":${++n}}\n`);
  const npm = (code) => c.fake.npm(`s=$(git rev-parse HEAD); echo "alickers-job: testing $s on fake" >&2; echo "alickers-job: tested $s exit 0" >&2; exit ${code}`);
  for (const code of [1, 75, 255]) {
    lockChange(); npm(code);
    const id = submit(c, c.repoDir, "--class", "playthrough", "--", "sh", "-c", "echo the-payload-ran");
    const w = waitFor(c, id);
    const r = result(c, id);
    assert.equal(r.remote, undefined, `npm ${code}: a setup failure is not a remote success (${w.err})`);
    assert.match(r.fellBack.reason, new RegExp(`setup failed on alickers: npm-ci exit ${code}`));
    assert.equal(r.fellBack.outage, false);
    assert.equal(r.code, 0, "the any job then ran here");
    assert.equal(JSON.parse(readFileSync(join(c.sched, "remote.json"), "utf8")).state === "paused" && code === 75, false, "an npm 75 is not the owner's pause");
  }
  lockChange(); npm(1);
  const g = submit(c, c.repoDir, "--class", "gpu", "--machine", "4070", "--", "true");
  const wg = waitFor(c, g);
  assert.equal(wg.code, 70);
  assert.match(result(c, g).label, /setup failed on alickers: npm-ci exit 1/);
  c.fake.npm(null);
  // A job whose own output looks like the transport's lines: its own code stands.
  lockChange(); c.fake.npm("exit 0");
  const j = submit(c, c.repoDir, "--class", "playthrough", "--", "sh", "-c", `echo "alickers-job: tested ${sha()} exit 0"; echo "alickers-job: testing x"; exit 7`);
  const wj = waitFor(c, j);
  assert.equal(wj.code, 7);
  assert.equal(result(c, j).remote, true);
});

test("B14 (R1-F4): a session lost just after hand-over: the old attempt is retired, and the 4070 payload runs exactly once", async () => {
  const c = await lane("drop");
  c.fake.flag("drop-once", true);
  const g = submit(c, c.repoDir, "--class", "gpu", "--machine", "4070", "--", "sh", "-c", "echo ran >> runs.log");
  const w = waitFor(c, g);
  assert.equal(w.code, 0, w.err);
  const r = result(c, g);
  assert.equal(r.remote, true);
  assert.ok(r.attempts >= 2, `attempts ${r.attempts}`);
  await sleep(4000); // the first attempt's delayed start has come and gone
  assert.equal(readFileSync(join(c.fake.repo, "runs.log"), "utf8"), "ran\n", "once");
  // The first attempt's late start lost its claim to the holder: it wrote only "abandoned".
  assert.match(readFileSync(join(c.fake.dir, "lane", "receipts", g, "a1", "receipt"), "utf8"), /^[0-9a-f]{32} abandoned\n$/);
});

test("B15 (R1-F5): with alickers' transport failing before admission, a 4070 job keeps waiting until its queue timeout", async () => {
  const c = await lane("transport-down");
  c.fake.flag("transport-down", true);
  const g = submit(c, c.repoDir, "--class", "gpu", "--machine", "4070", "--queue-timeout", "12", "--", "true");
  const t0 = Date.now();
  const w = waitFor(c, g);
  assert.equal(w.code, 75, w.err);
  assert.match(result(c, g).label, /expired: not admitted within 12s/);
  assert.ok(Date.now() - t0 >= 9000, "it waited out its queue timeout");
  const tries = readFileSync(join(c.sched, "ledger.jsonl"), "utf8").split("\n").filter((l) => l.includes('"remote-fallback"') && l.includes(g)).length;
  assert.ok(tries >= 3, `${tries} dispatches`);
});

test("B16 (R1-F6): an any job is admitted here at once while the health probe is slow, whatever the cached reading", async () => {
  const c = await lane("slow-probe");
  c.fake.flag("slow-probe", true);
  for (const reading of [null, { state: "up", at: 0, failures: 0 }, { state: "unreachable", at: 0, failures: 1 }]) {
    const f = join(c.sched, "remote.json");
    if (reading) writeFileSync(f, JSON.stringify(reading)); else spawnSync("rm", ["-f", f]);
    const holder = spawn("flock", [join(c.fake.dir, "lock"), "sleep", "10"], { stdio: "ignore" }); // alickers busy: any must run here
    try {
      await sleep(200);
      const a = submit(c, c.wt(`a${Math.random().toString(16).slice(2, 6)}`), "--class", "playthrough", "--machine", "any", "--", "true");
      const w = waitFor(c, a);
      const r = result(c, a);
      assert.equal(w.code, 0, w.err);
      assert.equal(r.remote, undefined, `${JSON.stringify(reading)}: ran here`);
      assert.ok(r.admittedAt - r.submittedAt < 2500, `${JSON.stringify(reading)}: admitted after ${r.admittedAt - r.submittedAt} ms`);
    } finally { holder.kill(); }
  }
});

test("B17 (R1-F7): a stalled artifact transfer is bounded and cancellable; the staged pack is kept on the sandbox", async () => {
  const c = await lane("stall-fetch");
  commit(c.repoDir, "make.sh", "mkdir -p pack; echo data > pack/a\n");
  c.fake.flag("stall-fetch", true);
  const id = submit(c, c.repoDir, "--class", "playthrough", "--artifact", "pack", "--", "sh", "make.sh");
  const t0 = Date.now();
  const w = waitFor(c, id);
  assert.ok(Date.now() - t0 < 30000, "bounded");
  assert.equal(w.code, 0, w.err);
  assert.match(result(c, id).artifacts[0].error, /transfer aborted: no data for 3 s; staged copy kept at .*\/a1\/stage\/pack/);
  assert.equal(readFileSync(join(c.fake.dir, "lane", "jobs", id, "a1", "stage", "pack", "a"), "utf8"), "data\n");
  // Cancelled while the transfer hangs: it ends promptly, with the transfer aborted.
  const id2 = submit(c, c.repoDir, "--class", "playthrough", "--artifact", "pack", "--", "sh", "make.sh");
  await until("fetching", () => log(c, id2).includes("alickers-job: tested") , 30000);
  await sleep(500);
  const t1 = Date.now();
  hc(c, ["cancel", id2]);
  assert.ok(Date.now() - t1 < 10000, "cancel returned promptly");
  assert.match(result(c, id2).artifacts[0].error, /transfer aborted: (cancelled|no data)/);
  c.fake.flag("stall-fetch", false);
});

// SCHED-2b R2 ---------------------------------------------------------------------

const receiptOf = (c, id, a = 1) => readFileSync(join(c.fake.dir, "lane", "receipts", id, `a${a}`, "receipt"), "utf8");

test("B18 (R2-F1): setup that rewrites the receipt is not bound; a job writing beside its heartbeat can't reach it", async () => {
  const c = await lane("receipt-forge");
  // The reviewer's setup fixture: npm finds the receipt from its parent's command line,
  // overwrites it with a successful record and fails. Those lines lack the attempt's nonce.
  const forge = (code) => c.fake.npm(`r=$(tr '\\0' '\\n' < /proc/$PPID/cmdline | grep '/receipts/' | head -1)/receipt
[ -f "$r" ] || exit 9
s=$(git rev-parse HEAD)
printf 'admitted 1\\nsha %s\\nsetup ok clean\\nstarted\\nafter %s clean\\nexit 0\\n' "$s" "$s" > "$r"
exit ${code}`);
  commit(c.repoDir, "package-lock.json", '{"v":1}\n'); forge(1);
  const g = submit(c, c.repoDir, "--class", "gpu", "--machine", "4070", "--", "sh", "-c", "touch payload-ran");
  const wg = waitFor(c, g);
  const rg = result(c, g);
  assert.equal(wg.code, 70, wg.err);
  assert.equal(rg.evidence.bound, false);
  assert.match(rg.label, /receipt from alickers is not valid \(line 1 does not carry this attempt's nonce\)/);
  assert.equal(existsSync(join(c.fake.repo, "payload-ran")), false, "the payload never ran");
  // An any job reruns here instead.
  commit(c.repoDir, "package-lock.json", '{"v":2}\n'); forge(1);
  const a = submit(c, c.repoDir, "--class", "playthrough", "--", "sh", "-c", "echo ran-here");
  assert.equal(waitFor(c, a).code, 0);
  assert.equal(result(c, a).remote, undefined);
  assert.match(result(c, a).fellBack.reason, /not valid/);
  assert.equal(result(c, a).fellBack.outage, false);
  c.fake.npm(null);
  // A job writing a forged receipt where the old layout kept it (beside its heartbeat): its own code, bound.
  const j = submit(c, c.repoDir, "--class", "gpu", "--machine", "4070", "--", "sh", "-c",
    'printf "admitted 1\\nsha 0000000000000000000000000000000000000000\\nsetup ok clean\\nstarted\\nexit 0\\n" > "${SILTWAKE_JOB_HEARTBEAT%/*}/receipt"; exit 7');
  assert.equal(waitFor(c, j).code, 7);
  assert.equal(result(c, j).evidence.bound, true);
});

test("B19 (R2-F1): a truncated receipt, or one whose exit the transport contradicts, binds nothing", async () => {
  const c = await lane("receipt-strict");
  const g = submit(c, c.repoDir, "--class", "gpu", "--machine", "4070", "--", "sh", "-c", "sleep 3; exit 7");
  await until("started", () => { try { return /started\n/.test(receiptOf(c, g)); } catch { return false; } }, 30000);
  const f = join(c.fake.dir, "lane", "receipts", g, "a1", "receipt");
  writeFileSync(f, readFileSync(f, "utf8").replace(/ setup ok clean\n[0-9a-f]{32} started\n$/, " setup o"));
  const wg = waitFor(c, g);
  assert.equal(wg.code, 70, wg.err);
  assert.equal(result(c, g).evidence.bound, false);
  assert.match(result(c, g).label, /not valid/);
  // The transport's ssh says 0 while the receipt says 7.
  c.fake.flag("exit-zero", true);
  const x = submit(c, c.repoDir, "--class", "gpu", "--machine", "4070", "--", "sh", "-c", "exit 7");
  const wx = waitFor(c, x);
  const rx = result(c, x);
  assert.equal(wx.code, 70, wx.err);
  assert.deepEqual([rx.evidence.bound, rx.evidence.transportExit, rx.evidence.receiptExit], [false, 0, 7]);
  assert.match(rx.label, /the receipt says exit 7, the transport exited 0/);
  const a = submit(c, c.repoDir, "--class", "playthrough", "--", "sh", "-c", "exit 7");
  assert.equal(waitFor(c, a).code, 7);
  assert.equal(result(c, a).remote, undefined, "an any job reruns here");
  c.fake.flag("exit-zero", false);
});

test("B20 (R2-F2): tracked changes on the sandbox never pass as the commit: the modifying job and the next read-only job, a direct caller's leftovers, a moved HEAD", async () => {
  const c = await lane("tree");
  commit(c.repoDir, "second.txt", "2\n");
  const m = submit(c, c.repoDir, "--class", "gpu", "--machine", "4070", "--", "sh", "-c", "echo CHANGED > file.txt; cat file.txt");
  assert.equal(waitFor(c, m).code, 0);
  const rm = result(c, m);
  assert.deepEqual([rm.evidence.bound, rm.changedDuringRun, rm.dirtyAtAdmit], [false, true, "clean"]);
  assert.match(rm.evidence.why, /the job changed the checkout \(HEAD \w+, 1 tracked files; restored afterwards\)/);
  assert.equal(readFileSync(join(c.fake.repo, "file.txt"), "utf8"), "v1\n", "restored before the lock was released");
  const n = submit(c, c.repoDir, "--class", "gpu", "--machine", "4070", "--", "cat", "file.txt");
  assert.equal(waitFor(c, n).code, 0);
  assert.match(log(c, n), /^v1$/m);
  assert.doesNotMatch(log(c, n), /CHANGED/);
  assert.deepEqual([result(c, n).evidence.bound, result(c, n).changedDuringRun, result(c, n).dirtyAtAdmit], [true, false, "clean"]);
  // Another agent's direct call (no lane, an older transport) leaves an edit behind.
  const d = c.fake.direct("echo LEFT > file.txt");
  await new Promise((r) => d.on("exit", r));
  assert.equal(readFileSync(join(c.fake.repo, "file.txt"), "utf8"), "LEFT\n");
  const o = submit(c, c.repoDir, "--class", "gpu", "--machine", "4070", "--", "cat", "file.txt");
  assert.equal(waitFor(c, o).code, 0);
  assert.match(log(c, o), /^v1$/m);
  assert.match(log(c, o), /1 tracked files in the sandbox checkout were changed; restored/);
  assert.deepEqual([result(c, o).evidence.bound, result(c, o).dirtyAtAdmit], [true, "restored:1"]);
  // The job moves HEAD.
  const h = submit(c, c.repoDir, "--class", "gpu", "--machine", "4070", "--", "git", "checkout", "-q", "--detach", "HEAD~1");
  assert.equal(waitFor(c, h).code, 0);
  assert.equal(result(c, h).evidence.bound, false);
  assert.equal(result(c, h).changedDuringRun, true);
  assert.equal(git(c.fake.repo, "status", "--porcelain", "--untracked-files=no").stdout, "");
});

/** A payload that, on the sandbox, leaves a TERM-ignoring foreground process and a detached one; here it says LOCAL-RAN. */
function resistantPayload(c) {
  commit(c.repoDir, "resist.py", [
    "import os, signal, sys, time",
    "signal.signal(signal.SIGTERM, signal.SIG_IGN)",
    "name = sys.argv[1]",
    "open('pid-' + name, 'w').write('%d %s' % (os.getpid(), open('/proc/self/stat').read().split()[21]))",
    "if name == 'fg':",
    "    while not os.path.exists('pid-detached'): time.sleep(0.05)",
    "    open('midrun-started', 'w').write('1')",
    "time.sleep(120)",
    "",
  ].join("\n"));
  return ["sh", "-c", 'case "$SILTWAKE_GPU_LEASE" in alickers-*) setsid python3 resist.py detached & python3 resist.py fg ;; *) echo LOCAL-RAN ;; esac'];
}
const remoteAlive = (c) => ["fg", "detached"].filter((n) => {
  try { const [pid, start] = readFileSync(join(c.fake.repo, `pid-${n}`), "utf8").split(" ").map(Number); return procStart(pid) === start; } catch { return false; }
});

test("B21 (R2-F3): the session lost mid-run: nothing runs here until the sandbox confirms the attempt stopped, TERM-ignoring and detached processes included", async () => {
  const c = await lane("midrun-drop");
  const argv = resistantPayload(c);
  c.fake.flag("drop-midrun", true);
  const id = submit(c, c.repoDir, "--class", "playthrough", "--machine", "any", "--", ...argv);
  await until("running on the sandbox", () => remoteAlive(c).length === 2, 30000);
  let overlap = null;
  while (!result(c, id)) {
    if (log(c, id).includes("LOCAL-RAN") && remoteAlive(c).length) overlap = remoteAlive(c);
    await sleep(100);
  }
  assert.equal(overlap, null, `ran here while ${overlap} still ran on the sandbox`);
  const r = result(c, id);
  assert.equal(r.code, 0);
  assert.match(log(c, id), /LOCAL-RAN/);
  assert.match(r.fellBack.reason, /connection to alickers was lost (while|as) the job/);
  assert.deepEqual(remoteAlive(c), []);
  await until("no fake sandbox scope left", () => spawnSync("systemctl", ["--user", "list-units", `sched2bfake-${c.n}-job-*`, "--no-legend"], { encoding: "utf8" }).stdout.trim() === "", 30000);
});

test("B22 (R2-F3): lost mid-run and then unreachable: the ticket keeps its place on alickers; it runs here only once a stop is confirmed", async () => {
  const c = await lane("midrun-unreachable");
  const argv = resistantPayload(c);
  c.fake.flag("drop-midrun", true);
  const id = submit(c, c.repoDir, "--class", "playthrough", "--machine", "any", "--", ...argv);
  await until("running on the sandbox", () => existsSync(join(c.fake.repo, "midrun-started")), 30000);
  c.fake.unreachable(true);
  await sleep(6000);
  const tk = JSON.parse(readFileSync(join(c.sched, "state.json"), "utf8")).tickets[id];
  assert.deepEqual([tk?.state, tk?.remote], ["running", true], "still held on alickers");
  assert.doesNotMatch(log(c, id), /LOCAL-RAN/);
  assert.match(log(c, id), /waiting until alickers confirms this attempt has stopped \(unreachable\)/);
  assert.equal(remoteAlive(c).length, 2, "the sandbox side ran on meanwhile");
  c.fake.unreachable(false);
  const w = waitFor(c, id);
  assert.equal(w.code, 0, w.err);
  assert.match(log(c, id), /LOCAL-RAN/);
  assert.deepEqual(remoteAlive(c), []);
});

test("B23 (R2-F4): an any job never waits for alickers: a direct caller's lock after a fresh probe, or one taken just before siltwake-job's own flock", async () => {
  // A long-lived "up" reading: the dispatch races the direct caller, as after a fresh probe.
  const c = await lane("busy", { recheckS: { up: 120, paused: 2, unreachable: 2, unreachableMax: 4 } });
  await probeNow(c);
  const holder = spawn("flock", ["--no-fork", join(c.fake.dir, "lock"), "sleep", "8"], { stdio: "ignore" });
  try {
    await sleep(250);
    const a = submit(c, c.repoDir, "--class", "playthrough", "--machine", "any", "--", "sh", "-c", "echo ran-here");
    assert.equal(waitFor(c, a).code, 0);
    const r = result(c, a);
    assert.equal(r.remote, undefined);
    assert.match(r.fellBack.reason, /alickers was busy/);
    assert.equal(r.fellBack.outage, false);
    assert.ok(r.admittedAt - r.submittedAt < 3000, `admitted here after ${r.admittedAt - r.submittedAt} ms`);
    assert.match(receiptOf(c, a), /^[0-9a-f]{32} busy\n$/);
  } finally { holder.kill(); }
  // The race: the no-wait check passes, then the lock is taken before siltwake-job's flock.
  await until("alickers free again", async () => (await probeNow(c)).state === "up", 15000);
  c.fake.flag("detach-job", true); c.fake.flag("race-lock", true);
  const q = submit(c, c.repoDir, "--class", "playthrough", "--machine", "any", "--", "sh", "-c", "touch raced-ran");
  assert.equal(waitFor(c, q).code, 0);
  const rq = result(c, q);
  assert.equal(rq.remote, undefined);
  assert.match(rq.fellBack.reason, /did not admit the job within 3s/);
  assert.ok(rq.admittedAt - rq.submittedAt < 7000, `admitted here after ${rq.admittedAt - rq.submittedAt} ms`);
  await until("the late start on the sandbox gave up", () => { try { return /abandoned\n$/.test(receiptOf(c, q)); } catch { return false; } }, 20000);
  assert.equal(existsSync(join(c.fake.repo, "raced-ran")), false, "it never ran on the sandbox");
  c.fake.flag("detach-job", false);
});

test("B24 (R2-F5): the transport's test seams work only in test mode with private state; direct callers keep their exit codes", async () => {
  const c = await lane("seams");
  const transport = join(here, "..", "alickers-job.sh");
  const seamLog = join(c.dir, "seam.log"), stub = join(c.dir, "leaked-ssh"), home = join(c.dir, "empty-home");
  writeFileSync(stub, `#!/bin/sh\necho "$*" >> ${seamLog}\nexit 255\n`, { mode: 0o755 });
  mkdirSync(home, { recursive: true }); // no ~/.ssh/siltwake.conf: the real ssh fails at once, reaching nothing
  const leaked = { ALICKERS_SSH: stub, ALICKERS_REPO: "/some/leaked/repo", ALICKERS_TMP: "/some/leaked/tmp", ALICKERS_LOCK: "/some/leaked/lock" };
  const run = (env) => spawnSync(transport, ["--sha", c.head, "--", "true"], { cwd: c.repoDir, env: { PATH: process.env.PATH, HOME: home, ...env }, encoding: "utf8", timeout: 30000 });
  for (const env of [leaked, { ...leaked, ALICKERS_TEST_MODE: "1" }, { ...leaked, SILTWAKE_SCHED_DIR: c.sched },
    { ...leaked, ALICKERS_TEST_MODE: "1", SILTWAKE_SCHED_DIR: "/work/tmp/siltwake-sched" }]) {
    const x = run(env);
    assert.equal(x.status, 255, x.stderr);
    assert.match(x.stderr, /ignoring ALICKERS_\* test overrides/);
    assert.equal(existsSync(seamLog), false, `${JSON.stringify(Object.keys(env))}: the leaked ssh was not used`);
  }
  run({ ...leaked, ALICKERS_TEST_MODE: "1", SILTWAKE_SCHED_DIR: c.sched });
  assert.match(readFileSync(seamLog, "utf8"), /\/some\/leaked\/repo/, "a private test scope uses them");
  // Direct callers (no --receipt) keep their payload's exit codes.
  for (const code of [0, 7, 75, 255]) {
    const x = spawnSync(transport, ["--sha", c.head, "--deadline", "20", "--memory", "1G", "--", "sh", "-c", `exit ${code}`], { cwd: c.repoDir, env: c.env, encoding: "utf8", timeout: 30000 });
    assert.equal(x.status, code, x.stderr);
    assert.match(x.stdout, new RegExp(`alickers-job: tested ${c.head} exit ${code}`));
  }
});

// SCHED-2b R3 ---------------------------------------------------------------------

const claimOf = (c, id, a = 1) => { try { return readlinkSync(join(c.fake.dir, "lane", "receipts", id, `a${a}`, "claim")); } catch { return null; } };
const scopeOf = (c, id, a = 1) => { try { return readFileSync(join(c.fake.dir, "lane", "receipts", id, `a${a}`, "scope"), "utf8").trim().split(" "); } catch { return null; } };
const BOOT = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();

test("B25 (R3-F1): the sandbox's shell dies at the claim: before it, the holder abandons; after it, the published identity proves the end; a holder death or a cancel there resolves too", async () => {
  const c = await lane("claim-crash");
  // Before the claim: nothing claimed, so the holder takes it as abandon; the any job runs here.
  c.fake.flag("crash-before-claim", true);
  const a = submit(c, c.repoDir, "--class", "playthrough", "--machine", "any", "--", "sh", "-c", 'case "$SILTWAKE_GPU_LEASE" in alickers-*) touch ran-a ;; esac; echo ran'); // a marker only on the sandbox: the worktree stays clean
  assert.equal(waitFor(c, a).code, 0);
  assert.deepEqual([result(c, a).remote, claimOf(c, a)], [undefined, "abandon"]);
  assert.equal(existsSync(join(c.fake.repo, "ran-a")), false);
  // After the claim: "run" with the identity published first (this boot, an empty or gone scope).
  c.fake.flag("crash-after-claim", true);
  await probeNow(c); // a fresh reading: an any job doesn't wait for a stale one
  const b = submit(c, c.repoDir, "--class", "playthrough", "--machine", "any", "--", "sh", "-c", 'case "$SILTWAKE_GPU_LEASE" in alickers-*) touch ran-b ;; esac; echo ran');
  assert.equal(waitFor(c, b).code, 0);
  assert.equal(result(c, b).remote, undefined, "settled, then run here");
  assert.equal(claimOf(c, b), "run");
  assert.equal(scopeOf(c, b)?.[0], BOOT);
  assert.equal(existsSync(join(c.fake.repo, "ran-b")), false, "the payload never ran on the sandbox");
  // A 4070 job crashed after its claim waits for alickers again and then runs there: the slot isn't stranded.
  c.fake.flag("crash-after-claim", true);
  const g = submit(c, c.repoDir, "--class", "gpu", "--machine", "4070", "--", "sh", "-c", "echo gpu-ran");
  const wg = waitFor(c, g);
  assert.equal(wg.code, 0, wg.err);
  assert.deepEqual([result(c, g).remote, result(c, g).attempts >= 2, result(c, g).evidence.bound], [true, true, true]);
  // Holder death in that state (the sandbox's cleanup is slow): recovery proves the end and frees the slot.
  c.fake.flag("slow-cleanup", true);
  c.fake.flag("crash-after-claim", true);
  const h = submit(c, c.repoDir, "--class", "gpu", "--machine", "4070", "--", "sh", "-c", "echo never");
  await until("claimed run", () => claimOf(c, h) === "run", 30000);
  const tk = await holderOf(c, h);
  killOwned(tk.holder);
  const wh = waitFor(c, h);
  assert.equal(wh.code, 137, wh.err);
  assert.match(result(c, h).label, /its remote holder died; the job on alickers was stopped/);
  // Cancel in that state.
  c.fake.flag("crash-after-claim", true);
  const k = submit(c, c.repoDir, "--class", "gpu", "--machine", "4070", "--", "sh", "-c", "echo never");
  await until("claimed run", () => claimOf(c, k) === "run", 30000);
  hc(c, ["cancel", k]);
  assert.deepEqual([result(c, k).code, result(c, k).stopReason], [75, "cancelled"]);
  c.fake.flag("slow-cleanup", false);
  const after = submit(c, c.repoDir, "--class", "gpu", "--machine", "4070", "--", "true");
  assert.equal(waitFor(c, after).code, 0, "the slot is free");
  assert.equal(result(c, after).remote, true);
});

test("B26 (R3-F2): a scope identity from another boot never authorises a signal; an unreadable identity fails closed; this boot's own identity is stopped", async () => {
  const c = await lane("boot-identity");
  const { loadConfig } = await import("./state.mjs");
  const { remoteStop } = await import("./remote.mjs");
  const cfg = loadConfig(c.env);
  // A replacement scope that now owns the old record's path and inode (as after a reboot).
  const unit = `sched2bfake-${c.n}-replacement`;
  const repl = spawn("systemd-run", ["--user", "--scope", "--quiet", "--collect", `--unit=${unit}`, "sleep", "120"], { stdio: "ignore" });
  try {
    await until("replacement running", () => scopeActive(unit) && procStart(repl.pid) != null, 10000);
    const cg = `/sys/fs/cgroup${readFileSync(`/proc/${repl.pid}/cgroup`, "utf8").trim().replace(/^0::/, "")}`;
    const ino = String(statSync(cg).ino), start = String(procStart(repl.pid));
    const record = (id, scope, pidLine) => {
      const rd = join(c.fake.dir, "lane", "receipts", id, "a1"), jd = join(c.fake.dir, "lane", "jobs", id, "a1");
      mkdirSync(rd, { recursive: true }); mkdirSync(jd, { recursive: true });
      symlinkSync("run", join(rd, "claim"));
      if (scope != null) writeFileSync(join(rd, "scope"), scope);
      writeFileSync(join(jd, "pid"), pidLine);
    };
    const other = "00000000-1111-2222-3333-444444444444";
    record("T-oldboot", `${other} ${cg} ${ino}\n`, `${repl.pid} ${start} ${other}\n`);
    const s1 = await remoteStop(cfg, "T-oldboot", { attempt: 1, graceS: 1 });
    assert.deepEqual([s1.stopped, s1.started], [true, true]);
    assert.match(s1.detail, /recorded in another boot: its processes are gone/);
    assert.ok(scopeActive(unit) && procStart(repl.pid) != null, "the replacement scope was not signalled");
    for (const [id, scope] of [["T-noboot", `${cg} ${ino}\n`], ["T-garbled", "garbled\n"], ["T-missing", null]]) {
      record(id, scope, `${repl.pid} ${start} ${BOOT}\n`);
      const s = await remoteStop(cfg, id, { attempt: 1, graceS: 1 });
      assert.equal(s.stopped, false, `${id}: fails closed`);
      assert.match(s.detail, /no valid scope identity/);
    }
    assert.ok(procStart(repl.pid) != null, "still not signalled");
    record("T-otherino", `${BOOT} ${cg} ${Number(ino) + 1}\n`, `${repl.pid} ${start} ${BOOT}\n`);
    assert.equal((await remoteStop(cfg, "T-otherino", { attempt: 1, graceS: 1 })).stopped, true, "another inode at the path: the old scope is gone");
    assert.ok(procStart(repl.pid) != null, "and the new one untouched");
    // Positive control: this boot's identity of a live scope is stopped, the whole scope.
    record("T-mine", `${BOOT} ${cg} ${ino}\n`, `${repl.pid} ${start} ${BOOT}\n`);
    const s2 = await remoteStop(cfg, "T-mine", { attempt: 1, graceS: 1 });
    assert.equal(s2.stopped, true, s2.detail);
    await until("stopped", () => procStart(repl.pid) == null, 10000);
  } finally { spawnSync("systemctl", ["--user", "stop", `${unit}.scope`], { stdio: "ignore" }); }
});

test("B27 (R3): release-remote frees a ticket held by a sandbox that's gone: recorded, unbound, never retried here; refused without a reason or for local tickets", async () => {
  const c = await lane("release");
  const argv = resistantPayload(c);
  c.fake.flag("drop-midrun", true);
  const id = submit(c, c.repoDir, "--class", "playthrough", "--machine", "any", "--", ...argv);
  try {
    await until("running on the sandbox", () => existsSync(join(c.fake.repo, "midrun-started")), 30000);
    c.fake.unreachable(true);
    await until("held", () => log(c, id).includes("waiting until alickers confirms"), 30000);
    const tk = JSON.parse(readFileSync(join(c.sched, "state.json"), "utf8")).tickets[id];
    assert.equal(hc(c, ["release-remote", id]).code, 2, "a reason is required");
    assert.equal(hc(c, ["release-remote", id, "--reason", " "]).code, 2);
    const rel = hc(c, ["release-remote", id, "--reason", "owner confirmed the sandbox is gone"]);
    assert.equal(rel.code, 0, rel.err);
    assert.match(rel.err, /released: owner confirmed the sandbox is gone/);
    const r = result(c, id);
    assert.deepEqual([r.code, r.stopReason, r.evidence.bound, r.released.reason], [75, "released", false, "owner confirmed the sandbox is gone"]);
    assert.equal(JSON.parse(readFileSync(join(c.sched, "state.json"), "utf8")).tickets[id], undefined, "the reservation is free");
    assert.ok(readFileSync(join(c.sched, "ledger.jsonl"), "utf8").includes('"event":"remote-released"'));
    await until("its holder ended", () => !alive(tk.holder), 10000);
    await sleep(3000);
    assert.doesNotMatch(log(c, id), /LOCAL-RAN/, "never retried here");
    assert.equal(waitFor(c, id).code, 75);
    // A local ticket is refused.
    const l = submit(c, c.wt("local"), "--class", "quick", "--machine", "3090", "--", "sleep", "5");
    await running(c, l);
    assert.equal(hc(c, ["release-remote", l, "--reason", "x"]).code, 2);
    hc(c, ["cancel", l]);
  } finally {
    c.fake.unreachable(false);
    // The detached, TERM-ignoring payload on the fake sandbox: only this context's own scopes.
    for (const u of spawnSync("systemctl", ["--user", "list-units", `sched2bfake-${c.n}-job-*`, "--plain", "--no-legend"], { encoding: "utf8" }).stdout.trim().split("\n").map((x) => x.trim().split(/\s+/)[0]).filter(Boolean))
      spawnSync("systemctl", ["--user", "kill", "--signal=SIGKILL", u], { stdio: "ignore" });
  }
});
