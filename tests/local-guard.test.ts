// test-tier: allow-escape spawns the guarded entry points against a stand-in queue client (a small node script); each is routed before it compiles or loads anything, and none loads Babylon.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// The local-run guard (STEW-2): on factory-worker the repo's CPU-heavy entry points
// never run outside the heavy-check queue. Admitted (inside a real job, on the
// positively identified alickers sandbox, or with the logged override) they run
// directly; anywhere else they run the same command again through
// `heavy-check run`, and refuse (75) if the queue client can't be run.
interface Facts { env: Record<string, string | undefined>; cgroup: string | null; job?: { cgroup: string | null; unit: string | null } | null;
  host?: string; sandboxTool?: boolean; queueState?: boolean }
interface Admission { admitted: boolean; why: string; override?: string }
interface Guard {
  admission(facts: Facts): Admission;
  routeArgs(argv: string[], spec: { cls?: string; machine?: string; env?: Record<string, string | undefined> }): { args: string[]; note: string };
  SANDBOX: { host: string; tool: string };
  REFUSED_EXIT: number;
}
interface Scope {
  cgroupPathOf(text: string): string | null;
  withinCgroup(path: string | null, scope: string | null): boolean;
  hasScopeComponent(path: string | null, unit: string | null): boolean;
}
const G = await import(pathToFileURL(resolve("scripts/local-guard.mjs")).href) as Guard;
const S = await import(pathToFileURL(resolve("scripts/cgroup-scope.mjs")).href) as Scope;

const scope = "/user.slice/user-1000.slice/user@1000.service/siltwake.slice/siltwake-heavy.slice/siltwake-heavy-wt-261024-000000-abcd.scope";
const job = { cgroup: `/sys/fs/cgroup${scope}`, unit: "siltwake-heavy-wt-261024-000000-abcd" };
const inJob = { SILTWAKE_JOB_TICKET: "261024-000000-abcd" };
const factory = { host: "factory-worker", sandboxTool: false, queueState: true };

test("cgroup membership is by whole path components: the scope or below it, never a name that starts the same", () => {
  assert.equal(S.cgroupPathOf(`12:pids:/x\n0::${scope}\n`), scope);
  assert.equal(S.cgroupPathOf("1:name=systemd:/x\n"), null);
  for (const [path, inside] of [
    [scope, true], [`${scope}/`, true], [`${scope}/tt1-runner`, true], [`${scope}/tt1-file-1/nested`, true], [`/sys/fs/cgroup${scope}`, true],
    [`${scope}-escaped.scope/job`, false], [`${scope}x`, false], [scope.replace(".scope", ""), false], ["/user.slice/app.slice/agent.scope", false], [null, false],
  ] as const) assert.equal(S.withinCgroup(path, job.cgroup), inside, String(path));
  assert.equal(S.withinCgroup(scope, ""), false);
  assert.equal(S.hasScopeComponent(`${scope}/tt1-runner`, job.unit), true);
  assert.equal(S.hasScopeComponent(`${scope}-escaped.scope/job`, job.unit), false, "R1-F4: a prefix-named sibling scope");
  assert.equal(S.hasScopeComponent(`${scope}-escaped.scope/job`, `${job.unit}.scope-escaped`), true);
});

test("admitted: inside the ticket's own cgroup (exact, or below), by its recorded path or else its unit", () => {
  for (const cgroup of [scope, `${scope}/tt1-runner`])
    assert.deepEqual(G.admission({ env: inJob, cgroup, job, ...factory }), { admitted: true, why: "inside heavy-check job 261024-000000-abcd" });
  assert.equal(G.admission({ env: inJob, cgroup: `${scope}/x`, job: { cgroup: null, unit: job.unit }, ...factory }).admitted, true, "no recorded path: by unit");
  for (const cgroup of [`${scope}-escaped.scope/job`, "/user.slice/app.slice/agent.scope", null]) {
    const a = G.admission({ env: inJob, cgroup, job, ...factory });
    assert.equal(a.admitted, false, String(cgroup));
    assert.match(a.why, /SILTWAKE_JOB_TICKET=261024-000000-abcd is set, but this process isn't in that job's cgroup/);
  }
  assert.equal(G.admission({ env: inJob, cgroup: scope, job: null, ...factory }).admitted, false, "no grant and no cgroup record: no proof");
  assert.equal(G.admission({ env: { SILTWAKE_HEAVY_LOCK_HELD: "1" }, cgroup: "/user.slice/siltwake-heavy-wt-42.scope/x", ...factory }).admitted, true, "v1's lock");
  assert.equal(G.admission({ env: { SILTWAKE_HEAVY_LOCK_HELD: "1" }, cgroup: "/user.slice/app.slice/agent.scope", ...factory }).admitted, false);
});

test("admitted on alickers only by positive identity; never because something is missing", () => {
  const sandbox = { host: G.SANDBOX.host, sandboxTool: true, queueState: false };
  assert.deepEqual(G.admission({ env: {}, cgroup: "/system.slice/x.scope", ...sandbox }), { admitted: true, why: "on the alickers sandbox" });
  for (const [what, facts] of [["factory-worker", factory], ["the queue's state is here", { ...sandbox, queueState: true }],
    ["no siltwake-job tool", { ...sandbox, sandboxTool: false }], ["another host", { ...sandbox, host: "laptop" }],
    ["an unknown host with nothing installed", { host: "laptop", sandboxTool: false, queueState: false }]] as const)
    assert.equal(G.admission({ env: {}, cgroup: "/x.scope", ...facts }).admitted, false, what);
  assert.equal(G.admission({ env: { SILTWAKE_GUARD_STRICT: "1" }, cgroup: "/x.scope", ...sandbox }).admitted, false, "strict (tests): no identity admission");
});

test("the override admits with its reason; an empty one doesn't; otherwise it routes", () => {
  const a = G.admission({ env: { SILTWAKE_LOCAL_OVERRIDE: "reading one compile error" }, cgroup: "/x.scope", ...factory });
  assert.deepEqual(a, { admitted: true, why: "override: reading one compile error", override: "reading one compile error" });
  assert.equal(G.admission({ env: { SILTWAKE_LOCAL_OVERRIDE: "  " }, cgroup: "/x.scope", ...factory }).admitted, false);
  assert.deepEqual(G.admission({ env: {}, cgroup: "/x.scope", ...factory }), { admitted: false, why: "not inside a heavy-check job" });
});

test("a routed command keeps settings only a job here would see by running here", () => {
  const argv = ["npm", "test"];
  assert.deepEqual(G.routeArgs(argv, { cls: "standard", machine: "any", env: {} }), { args: ["run", "--class", "standard", "--machine", "any", "--", "npm", "test"], note: "" });
  for (const env of [{ SILTWAKE_TEST_BUILD: ".test-build-2" }, { NODE_OPTIONS: "--max-old-space-size=4096" }]) {
    const r = G.routeArgs(argv, { cls: "standard", machine: "any", env });
    assert.equal(r.args[4], "3090");
    assert.match(r.note, new RegExp(Object.keys(env)[0]!));
  }
  assert.equal(G.routeArgs(argv, { machine: "any", env: { SILTWAKE_GUARD_STRICT: "1", SILTWAKE_HEAVY_CHECK: "/q" } }).args[4], "any", "the guard's own settings don't count");
  assert.equal(G.routeArgs(argv, { machine: "3090", env: {} }).args[4], "3090");
});

// End to end: the real entry points, routed to a stand-in queue client that records
// what it was asked to run (and its cwd) and exits 7.
const dirs: string[] = [];
after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });
const temp = (prefix: string) => { const d = fs.mkdtempSync(join(tmpdir(), prefix)); dirs.push(d); return d; };
function standIn(code = 7): { queue: string; calls: () => { args: string[]; cwd: string }[] } {
  const dir = temp("siltwake-guard-queue-"), queue = join(dir, "heavy-check"), log = join(dir, "calls.jsonl");
  fs.writeFileSync(queue, `#!/usr/bin/env node\nrequire("node:fs").appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }) + "\\n");\nprocess.exit(${code});\n`, { mode: 0o755 });
  return { queue, calls: () => fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { args: string[]; cwd: string }) : [] };
}
/** An agent's shell on factory-worker: not in a job, no override, not on the sandbox. */
function agentEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, SILTWAKE_GUARD_STRICT: "1", SILTWAKE_SCHED_DIR: temp("siltwake-guard-sched-"), ...extra };
  for (const k of ["SILTWAKE_JOB_TICKET", "SILTWAKE_HEAVY_LOCK_HELD", "SILTWAKE_LOCAL_OVERRIDE", "SILTWAKE_LOCAL_OVERRIDE_LOGGED", "NODE_TEST_CONTEXT",
    "SILTWAKE_TEST_BUILD", "NODE_OPTIONS"]) if (!(k in extra)) delete env[k];
  return env;
}
const run = (argv: string[], env: NodeJS.ProcessEnv, cwd = resolve(".")) => spawnSync(argv[0]!, argv.slice(1), { cwd, encoding: "utf8", env });
const W = ["node", "scripts/local-guard.mjs"];

test("each entry point runs the same command again through the queue, in the foreground, with its exit code", () => {
  const cases: [string[], string[]][] = [
    [["npm", "run", "build"], ["--class", "standard", "--machine", "3090", "--", ...W, "--class", "standard", "--machine", "3090", "--", "npm", "run", "build:direct", "--"]],
    [["npm", "test"], ["--class", "standard", "--machine", "any", "--", ...W, "--class", "standard", "--", "npm", "run", "test:fast:direct", "--"]],
    [["npm", "run", "typecheck"], ["--class", "quick", "--machine", "any", "--", ...W, "--class", "quick", "--", "npm", "run", "typecheck:direct", "--"]],
    [["npm", "run", "playthrough", "--", "--scenario", "creel"], ["--class", "playthrough", "--machine", "any", "--", ...W, "--class", "playthrough", "--", "npm", "run", "playthrough:direct", "--", "--scenario", "creel"]],
    [["node", "scripts/test-build.mjs", "--typecheck"], ["--class", "standard", "--machine", "3090", "--", "node", "scripts/test-build.mjs", "--typecheck"]],
    [["node", "scripts/test-build.mjs"], ["--class", "quick", "--machine", "3090", "--", "node", "scripts/test-build.mjs"]],
    [["node", "scripts/test-tier.mjs", "fast"], ["--class", "standard", "--machine", "any", "--", "sh", "-c", "node scripts/test-build.mjs && node scripts/test-tier.mjs fast"]],
    [["node", "scripts/test-tier.mjs", "heavy"], ["--class", "heavy-suite", "--machine", "any", "--", "sh", "-c", "node scripts/test-build.mjs && node scripts/test-tier.mjs heavy"]],
    [["node", "scripts/guard-architecture.mjs", "--quiet"], ["--class", "quick", "--machine", "any", "--", "node", "scripts/guard-architecture.mjs", "--quiet"]],
    [["node", "scripts/bake-terrain.mjs"], ["--class", "bake", "--machine", "3090", "--", "node", "scripts/bake-terrain.mjs"]],
    [["node", "scripts/check-m1-economy.mjs"], ["--class", "quick", "--machine", "any", "--", "sh", "-c", "node scripts/test-build.mjs && node scripts/check-m1-economy.mjs"]],
    [["node", "scripts/sim-bench.mjs", "--states", "/work/tmp/x"], ["--class", "standard", "--machine", "3090", "--", "node", "scripts/sim-bench.mjs", "--states", "/work/tmp/x"]],
    [["bash", "scripts/saves-build-at.sh", "HEAD", "/work/tmp/never-made"], ["--class", "standard", "--machine", "3090", "--", ...W, "--class", "standard", "--machine", "3090", "--", "bash", "scripts/saves-build-at.sh", "HEAD", "/work/tmp/never-made"]],
    [["bash", "scripts/sim-differential.sh", "HEAD"], ["--class", "playthrough", "--machine", "3090", "--", ...W, "--class", "playthrough", "--machine", "3090", "--", "bash", "scripts/sim-differential.sh", "HEAD"]],
  ];
  for (const [argv, expected] of cases) {
    const { queue, calls } = standIn();
    const r = run(argv, agentEnv({ SILTWAKE_HEAVY_CHECK: queue }));
    assert.equal(r.status, 7, `${argv.join(" ")}: the job's exit code\n${r.stderr}`);
    assert.deepEqual(calls().map((c) => c.args), [["run", ...expected]], argv.join(" "));
    assert.equal(calls()[0]!.cwd, resolve("."));
    assert.match(r.stderr, /local-guard: .*: through the queue/, argv.join(" "));
  }
  assert.ok(!fs.existsSync("/work/tmp/never-made"), "saves-build-at.sh made nothing here");
});

test("the direct package scripts refuse outside a job, pointing at the routed one", () => {
  for (const [script, hint] of [["build:direct", "npm run build"], ["test:fast:direct", "npm run test:fast"], ["typecheck:direct", "npm run typecheck"], ["playthrough:direct", "npm run playthrough"]] as const) {
    const { queue, calls } = standIn();
    const r = run(["npm", "run", script], agentEnv({ SILTWAKE_HEAVY_CHECK: queue }));
    assert.equal(r.status, G.REFUSED_EXIT, script);
    assert.match(r.stderr, new RegExp(`runs only inside a heavy-check job .*use \`${hint}\``), script);
    assert.equal(calls().length, 0);
  }
});

test("routed or refused, a script loads none of its compiled modules (or TypeScript, or esbuild), even with no build output", () => {
  const hook = join(temp("siltwake-guard-hook-"), "hook.mjs"), loads = join(tmpdir(), `siltwake-guard-loads-${process.pid}.txt`);
  dirs.push(loads);
  fs.writeFileSync(hook, `import { registerHooks } from "node:module";\nimport { appendFileSync } from "node:fs";\n` +
    `registerHooks({ resolve(s, c, next) { const r = next(s, c); appendFileSync(${JSON.stringify(loads)}, r.url + "\\n"); return r; } });\n`);
  const economy = ["check-campaign-economy", "check-m1-economy", "check-m2-a-economy", "check-m2-b1-economy", "check-progression-curve", "upgrade-economy"];
  // A copy of each script beside the guard only: no .test-build, no node_modules.
  const bare = temp("siltwake-guard-bare-");
  fs.mkdirSync(join(bare, "scripts"));
  for (const f of ["local-guard.mjs", "cgroup-scope.mjs", "guard-architecture.mjs", "bake-terrain.mjs", ...economy.map((e) => `${e}.mjs`)])
    fs.copyFileSync(join("scripts", f), join(bare, "scripts", f));
  for (const cwd of [resolve("."), bare]) for (const script of [...economy, "guard-architecture", "bake-terrain"]) {
    fs.rmSync(loads, { force: true });
    const { queue } = standIn(0);
    const r = run(["node", "--import", pathToFileURL(hook).href, `scripts/${script}.mjs`], agentEnv({ SILTWAKE_HEAVY_CHECK: queue }), cwd);
    assert.equal(r.status, 0, `${script} in ${cwd}: ${r.stderr}`);
    const loaded = fs.readFileSync(loads, "utf8").split("\n").filter((u) => /\.test-build|node_modules|typescript|esbuild/.test(u));
    assert.deepEqual(loaded, [], `${script} in ${cwd}`);
    assert.doesNotMatch(r.stderr, /ERR_MODULE_NOT_FOUND/);
  }
});

test("if the queue client can't be run, it refuses (75) with the reason; it never runs locally", () => {
  const notExecutable = join(temp("siltwake-guard-noexec-"), "heavy-check");
  fs.writeFileSync(notExecutable, "#!/bin/sh\nexit 0\n", { mode: 0o644 });
  const killed = join(temp("siltwake-guard-killed-"), "heavy-check");
  fs.writeFileSync(killed, "#!/bin/sh\nkill -TERM $$\n", { mode: 0o755 });
  for (const [queue, re] of [["/nonexistent/heavy-check", /queue client isn't available \(\/nonexistent\/heavy-check\)/], [notExecutable, /queue client isn't available/],
    [killed, /the queue client was stopped \(SIGTERM\)/]] as const) {
    for (const argv of [["npm", "run", "build"], ["node", "scripts/test-build.mjs"], ["bash", "scripts/saves-build-at.sh", "HEAD", "/work/tmp/never-made"]]) {
      const r = run(argv, agentEnv({ SILTWAKE_HEAVY_CHECK: queue }));
      assert.equal(r.status, G.REFUSED_EXIT, `${argv.join(" ")} with ${queue}: ${r.stderr}`);
      assert.match(r.stderr, re, argv.join(" "));
    }
  }
});

test("inside a real job it runs directly; a prefix-named cgroup is not inside", { skip: !/^0::.*\.scope$/m.test(fs.readFileSync("/proc/self/cgroup", "utf8")) }, () => {
  const own = fs.readFileSync("/proc/self/cgroup", "utf8").split("\n").find((l) => l.startsWith("0::"))!.slice(3);
  for (const [recorded, direct] of [[own, true], [own.replace(/\.scope$/, ""), false]] as const) {
    const sched = temp("siltwake-guard-job-"), { queue, calls } = standIn();
    fs.mkdirSync(join(sched, "jobs", "261024-000000-test"), { recursive: true });
    fs.writeFileSync(join(sched, "jobs", "261024-000000-test", "cgroup"), `/sys/fs/cgroup${recorded}\n`);
    const r = run([...W, "--", "node", "-e", "process.exit(3)"], agentEnv({ SILTWAKE_HEAVY_CHECK: queue, SILTWAKE_SCHED_DIR: sched, SILTWAKE_JOB_TICKET: "261024-000000-test" }));
    assert.equal(r.status, direct ? 3 : 7, `${recorded}: ${r.stderr}`);
    assert.equal(calls().length, direct ? 0 : 1);
  }
});

test("the override runs it here, logs who, what and why once per command tree, and refuses if it can't log", () => {
  const sched = temp("siltwake-guard-override-"), { queue, calls } = standIn();
  const env = agentEnv({ SILTWAKE_HEAVY_CHECK: queue, SILTWAKE_SCHED_DIR: sched, SILTWAKE_LOCAL_OVERRIDE: "reading one compile error" });
  // The wrapper runs a command that is itself guarded: one log line, not two.
  const r = run([...W, "--", "node", "scripts/local-guard.mjs", "--require", "x"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(calls().length, 0);
  assert.match(r.stderr, /OVERRIDE \(reading one compile error\): running node scripts\/local-guard\.mjs --require x here, outside the queue/);
  const lines = fs.readFileSync(join(sched, "local-overrides.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { what: string; reason: string; user: string });
  assert.equal(lines.length, 1);
  assert.deepEqual([lines[0]!.what, lines[0]!.reason], ["node scripts/local-guard.mjs --require x", "reading one compile error"]);
  const unloggable = run([...W, "--", "true"], { ...env, SILTWAKE_SCHED_DIR: "/nonexistent/sched" });
  assert.equal(unloggable.status, G.REFUSED_EXIT);
  assert.match(unloggable.stderr, /the override log can't be written/);
});

test("--status says what happens here", () => {
  const r = run([...W, "--status", "--json"], agentEnv());
  assert.deepEqual(JSON.parse(r.stdout), { admitted: false, why: "not inside a heavy-check job" });
});
