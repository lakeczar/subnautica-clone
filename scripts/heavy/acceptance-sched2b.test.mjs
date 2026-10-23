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
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { alive, procStart, scopePopulated } from "./state.mjs";
import { blockedBy, context, fakeSandbox, hc, holderOf, killOwned, result, running, sleep, submit, until } from "./acceptance-lib.mjs";

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
  // Waiting for the sandbox's lock (another agent's direct call) is not silence.
  const holder = spawn("flock", [join(c.fake.dir, "lock"), "sleep", "8"], { stdio: "ignore" });
  try {
    await sleep(300);
    const waiting = submit(c, c.repoDir, "--class", "playthrough", "--stall", "4", "--", "sh", "-c", "echo after-the-lock");
    const ww = waitFor(c, waiting);
    assert.equal(ww.code, 0, ww.err);
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
    const q = submit(c, c.repoDir, "--class", "playthrough", "--", "sh", "-c", "touch must-not-exist");
    await running(c, q);
    await sleep(1500);
    hc(c, ["cancel", q]);
    assert.equal(result(c, q).code, 75);
    await sleep(6000); // the lock frees; the sandbox would start it now
    assert.equal(existsSync(marker), false, "cancelled while waiting for the sandbox: the command never ran");
  } finally { holder.kill(); }
});

test("B8: the remote holder SIGKILLed: recovery finishes the ticket (137) and stops its job on the sandbox", async () => {
  const c = await lane("holder-dies");
  const id = submit(c, c.repoDir, "--class", "playthrough", "--", "sh", "-c", "while :; do echo .; sleep 0.5; done");
  await until("started remotely", () => existsSync(join(c.fake.dir, "lane", "jobs", id, "a1", "pid")) && log(c, id).includes("testing"), 30000);
  const [pid, start] = readFileSync(join(c.fake.dir, "lane", "jobs", id, "a1", "pid"), "utf8").trim().split(" ").map(Number);
  const tk = await holderOf(c, id);
  killOwned(tk.holder);
  const w = waitFor(c, id);
  assert.equal(w.code, 137, w.err);
  assert.match(w.err, /killed: its remote holder died; the job on alickers was asked to stop/);
  await until("the sandbox job stopped", () => procStart(pid) !== start, 30000);
  assert.equal(result(c, id).evidence.bound, false);
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
