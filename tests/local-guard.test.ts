// test-tier: allow-escape spawns scripts/local-guard.mjs and guarded scripts against private queue state roots; none of them loads Babylon, and each is refused before it compiles anything.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// The local-run guard (STEW-2): ordinary local commands on factory-worker must not
// run beside a 3090 exclusive measurement, running or queued, unless they are inside
// a heavy-check job or explicitly overridden (logged). It reads the queue's state
// only, and fails open when that state can't be read.
interface Exclusives { queue: string; why?: string; running: string[]; queued: string[]; unknownShape: number }
interface Job { inside: boolean; ticket?: string; why?: string }
interface Decision { verdict: "run" | "refuse" | "override"; why: string; lease: boolean; warn?: string }
interface Guard {
  readExclusives(text: string | null, isAlive?: (p: { pid: number; start: number }) => boolean): Exclusives;
  insideJob(env: Record<string, string | undefined>, cgroup: string, grant: { unit?: string } | null): Job;
  decide(input: { exclusives: Exclusives; job: Job; override?: string; coveredBy?: number | null }): Decision;
  procStart(pid: number): number | null;
  REFUSED_EXIT: number;
}
const G = await import(pathToFileURL(resolve("scripts/local-guard.mjs")).href) as Guard;

type Ticket = { state: string; req?: { class: string }; supervisor?: { pid: number; start: number | null }; remote?: boolean };
const state = (tickets: Record<string, Ticket>) => JSON.stringify({ protocol: 1, seq: 1, tickets });
const me = { pid: process.pid, start: G.procStart(process.pid) };
const gone = { pid: 4_194_000, start: 1 };
const exclusive = (s: "running" | "queued", supervisor = me): Ticket => ({ state: s, req: { class: "exclusive" }, supervisor });
const outside: Job = { inside: false };

test("the decision: exclusives running or queued refuse local work; other work, none or a dead queued ticket don't", () => {
  const cases: [string, string | null, Decision["verdict"], RegExp][] = [
    ["running exclusive", state({ a: exclusive("running") }), "refuse", /3090 exclusive a is running/],
    ["queued exclusive", state({ q: exclusive("queued") }), "refuse", /3090 exclusive q is queued and can start at any moment/],
    ["queued exclusive whose supervisor died (never admitted)", state({ q: exclusive("queued", gone) }), "run", /no 3090 exclusive/],
    ["running exclusive whose supervisor died (its job may outlive it)", state({ a: exclusive("running", gone) }), "refuse", /is running/],
    ["other classes only", state({ s: { state: "running", req: { class: "standard" } }, g: { state: "queued", req: { class: "gpu" }, supervisor: me } }), "run", /no 3090 exclusive/],
    ["an empty queue", state({}), "run", /no 3090 exclusive/],
    ["no queue on this machine (alickers)", null, "run", /no heavy-check queue on this machine/],
  ];
  for (const [name, text, verdict, why] of cases) {
    const d = G.decide({ exclusives: G.readExclusives(text), job: outside });
    assert.equal(d.verdict, verdict, name);
    assert.match(d.why, why, name);
  }
  const several = G.decide({ exclusives: G.readExclusives(state({ a: exclusive("running"), b: exclusive("queued"), c: exclusive("queued") })), job: outside });
  assert.match(several.why, /a is running \(2 more running or queued\)/);
});

test("a run the guard lets through takes a lease, unless the queue is absent or a parent's lease covers it", () => {
  assert.equal(G.decide({ exclusives: G.readExclusives(state({})), job: outside }).lease, true);
  assert.equal(G.decide({ exclusives: G.readExclusives(null), job: outside }).lease, false);
  const covered = G.decide({ exclusives: G.readExclusives(state({ q: exclusive("queued") })), job: outside, coveredBy: 1234 });
  assert.deepEqual([covered.verdict, covered.lease], ["run", false], "a later step of a run in progress: its lease holds the queued exclusive back");
  assert.match(covered.why, /covered by the lease of pid 1234/);
  const running = G.decide({ exclusives: G.readExclusives(state({ a: exclusive("running") })), job: outside, coveredBy: 1234 });
  assert.equal(running.verdict, "refuse", "but never beside a running one");
});

test("inside a heavy-check job it runs: the ticket's variable alone is no proof, the scope must match", () => {
  const grant = { unit: "siltwake-heavy-wt-261024-000000-abcd" };
  const scope = "0::/user.slice/user-1000.slice/user@1000.service/siltwake.slice/siltwake-heavy.slice/siltwake-heavy-wt-261024-000000-abcd.scope\n";
  const busy = G.readExclusives(state({ a: exclusive("running") }));
  const job = G.insideJob({ SILTWAKE_JOB_TICKET: "261024-000000-abcd" }, scope, grant);
  assert.equal(job.inside, true);
  assert.equal(G.decide({ exclusives: busy, job }).verdict, "run");
  const nested = G.insideJob({ SILTWAKE_JOB_TICKET: "261024-000000-abcd" }, scope.replace(".scope", ".scope/tt1-runner"), grant);
  assert.equal(nested.inside, true, "a heavy file's own child cgroup is still inside the job");
  const forged = G.insideJob({ SILTWAKE_JOB_TICKET: "261024-000000-abcd" }, "0::/user.slice/app.slice/agent.scope\n", grant);
  assert.equal(forged.inside, false);
  assert.match(forged.why!, /not inside that ticket's scope/);
  assert.equal(G.decide({ exclusives: busy, job: forged }).verdict, "refuse");
  assert.equal(G.insideJob({ SILTWAKE_JOB_TICKET: "x" }, scope, null).inside, false, "no grant, no proof");
  assert.equal(G.insideJob({ SILTWAKE_HEAVY_LOCK_HELD: "1" }, "0::/user.slice/siltwake-heavy-wt-42.scope\n", null).inside, true, "v1's lock");
  assert.equal(G.insideJob({ SILTWAKE_HEAVY_LOCK_HELD: "1" }, "0::/user.slice/app.slice/agent.scope\n", null).inside, false);
});

test("an override with a reason runs (and is logged by the caller); an empty one doesn't count", () => {
  const busy = G.readExclusives(state({ a: exclusive("running") }));
  const d = G.decide({ exclusives: busy, job: outside, override: "bisecting a compile error, 3 s" });
  assert.deepEqual([d.verdict, d.lease], ["override", true]);
  assert.equal(G.decide({ exclusives: busy, job: outside, override: "   " }).verdict, "refuse");
});

test("unreadable or unknown queue state fails open, with a warning", () => {
  for (const text of ["{not json", JSON.stringify({ protocol: 9 })]) {
    const d = G.decide({ exclusives: G.readExclusives(text), job: outside });
    assert.deepEqual([d.verdict, d.lease], ["run", false]);
    assert.match(d.warn!, /running unguarded \(fail open\)/);
  }
  const shape = G.decide({ exclusives: G.readExclusives(state({ odd: { state: "running" } })), job: outside });
  assert.equal(shape.verdict, "run");
  assert.match(shape.warn!, /1 queue ticket\(s\) have a shape this guard doesn't know/);
});

// End to end: the CLI and the guarded scripts against a private state root.
const roots: string[] = [];
after(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });
function privateRoot(text: string | null): string {
  const dir = fs.mkdtempSync(join(tmpdir(), "siltwake-guard-"));
  roots.push(dir);
  if (text != null) fs.writeFileSync(join(dir, "state.json"), text);
  return dir;
}
/** The environment of an agent's shell: not in a job, no override, not under npm. */
function agentEnv(dir: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, SILTWAKE_SCHED_DIR: dir, ...extra };
  for (const k of ["SILTWAKE_JOB_TICKET", "SILTWAKE_HEAVY_LOCK_HELD", "SILTWAKE_LOCAL_OVERRIDE", "npm_lifecycle_event", "NODE_TEST_CONTEXT"]) if (!(k in extra)) delete env[k];
  return env;
}
const guard = (env: NodeJS.ProcessEnv, ...args: string[]) => spawnSync(process.execPath, ["scripts/local-guard.mjs", ...args], { encoding: "utf8", env });
const log = (dir: string) => fs.existsSync(join(dir, "local-runs.jsonl"))
  ? fs.readFileSync(join(dir, "local-runs.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>) : [];

test("refused: one line naming the ticket and the queued form of the command, exit 75, logged", () => {
  const dir = privateRoot(state({ "261024-161316-84bc": exclusive("running") }));
  const r = guard(agentEnv(dir), "npm run build");
  assert.equal(r.status, G.REFUSED_EXIT);
  assert.equal(r.stderr.trim().split("\n").length, 1, r.stderr);
  assert.match(r.stderr, /npm run build refused here: 3090 exclusive 261024-161316-84bc is running\. Queue it instead: scripts\/heavy-check\.sh --machine any -- npm run build /);
  assert.match(r.stderr, /SILTWAKE_LOCAL_OVERRIDE="<why>"/);
  const underNpm = guard(agentEnv(dir, { npm_lifecycle_event: "test:fast" }), "--lease-parent", "npm run test:fast");
  assert.match(underNpm.stderr, /--machine any -- npm run test:fast /, "under npm it names the package script");
  assert.deepEqual(log(dir).map((e) => [e.event, e.running]), [["refused", ["261024-161316-84bc"]], ["refused", ["261024-161316-84bc"]]]);
  assert.ok(!fs.existsSync(join(dir, "local-runs")) || fs.readdirSync(join(dir, "local-runs")).length === 0, "a refused run takes no lease");
});

test("the guarded entry points refuse before they compile or run anything", () => {
  const dir = privateRoot(state({ q: exclusive("queued") }));
  for (const argv of [["node", "scripts/test-build.mjs", "--typecheck"], ["node", "scripts/test-tier.mjs", "fast"], ["bash", "scripts/saves-build-at.sh", "HEAD", join(dir, "never")]]) {
    const t0 = Date.now(), r = spawnSync(argv[0], argv.slice(1), { encoding: "utf8", env: agentEnv(dir) });
    assert.equal(r.status, G.REFUSED_EXIT, `${argv.join(" ")}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /refused here: 3090 exclusive q is queued/, argv.join(" "));
    assert.ok(Date.now() - t0 < 5000, `${argv.join(" ")} refused at once`);
  }
  assert.ok(!fs.existsSync(join(dir, "never")), "saves-build-at.sh made nothing");
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
  for (const name of ["build", "typecheck", "test:fast", "playthrough"])
    assert.match(pkg.scripts[name]!, new RegExp(`^node scripts/local-guard\\.mjs --lease-parent npm run ${name} && `), `npm run ${name} asks the guard first`);
  assert.match(pkg.scripts.check!, /npm run test:heavy && node scripts\/local-guard\.mjs --lease-parent npm run check && /, "check leases only its local tail, never the queue wait");
});

test("an override runs, says so, and logs the reason and the exclusives it may disturb", () => {
  const dir = privateRoot(state({ a: exclusive("running") }));
  const r = guard(agentEnv(dir, { SILTWAKE_LOCAL_OVERRIDE: "one-off tsc to read an error" }), "npx tsc --noEmit");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /OVERRIDE \(one-off tsc to read an error\): running npx tsc --noEmit here although 3090 exclusive a is running/);
  assert.match(r.stderr, /Tell the coordinator/);
  const [entry] = log(dir);
  assert.deepEqual([entry!.event, entry!.reason, entry!.running], ["override", "one-off tsc to read an error", ["a"]]);
});

test("inside a job, on a machine with no queue, or with unreadable state it runs", () => {
  const busy = state({ a: exclusive("running") });
  const own = fs.readFileSync("/proc/self/cgroup", "utf8").trim().split("/").pop()!;
  if (own.endsWith(".scope")) {
    const dir = privateRoot(busy);
    fs.mkdirSync(join(dir, "jobs", "261024-000000-test"), { recursive: true });
    fs.writeFileSync(join(dir, "jobs", "261024-000000-test", "grant.json"), JSON.stringify({ unit: own.replace(/\.scope$/, "") }));
    const r = guard(agentEnv(dir, { SILTWAKE_JOB_TICKET: "261024-000000-test" }), "npm test");
    assert.equal(r.status, 0, r.stderr);
  }
  const absent = join(tmpdir(), `siltwake-no-queue-${process.pid}`);
  const none = guard(agentEnv(absent), "npm test");
  assert.deepEqual([none.status, none.stderr], [0, ""]);
  assert.ok(!fs.existsSync(absent), "no queue: nothing written");
  const broken = guard(agentEnv(privateRoot("{\"protocol\": 1, \"tickets\": ")), "npm test");
  assert.equal(broken.status, 0);
  assert.match(broken.stderr, /fail open/);
});

test("leases: a parent's lease covers its later steps, is listed by --status, and an in-process lease ends with its process", () => {
  const dir = privateRoot(state({}));
  // The test process is the parent here, as a package script's shell is.
  assert.equal(guard(agentEnv(dir), "--lease-parent", "npm run build").status, 0);
  const lease = JSON.parse(fs.readFileSync(join(dir, "local-runs", `${process.pid}.json`), "utf8")) as { pid: number; start: number; what: string };
  assert.deepEqual([lease.pid, lease.start, lease.what], [process.pid, me.start, "npm run build"]);
  const status = JSON.parse(guard(agentEnv(dir), "--status", "--json").stdout) as { leases: { pid: number }[] };
  assert.deepEqual(status.leases.map((l) => l.pid), [process.pid]);
  // An exclusive is submitted meanwhile: the next step of the same run continues (its lease holds it back)…
  fs.writeFileSync(join(dir, "state.json"), state({ q: exclusive("queued") }));
  const next = guard(agentEnv(dir), "node scripts/test-tier.mjs fast");
  assert.equal(next.status, 0, next.stderr);
  // …but not once it is running.
  fs.writeFileSync(join(dir, "state.json"), state({ q: exclusive("running") }));
  assert.equal(guard(agentEnv(dir), "node scripts/test-tier.mjs fast").status, G.REFUSED_EXIT);
  fs.rmSync(join(dir, "local-runs", `${process.pid}.json`));

  const fresh = privateRoot(state({}));
  const probe = spawnSync(process.execPath, ["--input-type=module", "-e",
    `const g = await import(${JSON.stringify(pathToFileURL(resolve("scripts/local-guard.mjs")).href)});
     g.guardLocalRun("probe");
     const fs = await import("node:fs");
     console.log(fs.existsSync(${JSON.stringify(join(fresh, "local-runs"))} + "/" + process.pid + ".json"), process.pid);`],
  { encoding: "utf8", env: agentEnv(fresh) });
  const [held, pid] = probe.stdout.trim().split(" ");
  assert.equal(held, "true", probe.stderr);
  assert.ok(!fs.existsSync(join(fresh, "local-runs", `${pid}.json`)), "removed when the process exited");
});
