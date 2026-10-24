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
    assert.deepEqual([a.admitted, a.refuse], [false, true], String(cgroup));
    assert.match(a.why, /SILTWAKE_JOB_TICKET=261024-000000-abcd is set, but this process isn't in that job's cgroup/);
  }
  assert.equal(G.admission({ env: inJob, cgroup: scope, job: null, ...factory }).admitted, false, "no grant and no cgroup record: no proof");
});

test("under v1's lock only the exact scope the lock created admits; a claim without proof refuses rather than requeueing (R2-F2)", () => {
  const v1 = (scope: string | undefined, cgroup: string) => G.admission({ env: { SILTWAKE_HEAVY_LOCK_HELD: "1", ...(scope ? { SILTWAKE_HEAVY_SCOPE: scope } : {}) }, cgroup, ...factory });
  assert.deepEqual(v1("siltwake-heavy-wt-x-42", "/user.slice/siltwake-heavy-wt-x-42.scope"), { admitted: true, why: "inside v1 heavy-check scope siltwake-heavy-wt-x-42" });
  assert.equal(v1("siltwake-heavy-wt-x-42", "/user.slice/siltwake-heavy-wt-x-42.scope/tt1-file-0").admitted, true, "below it");
  for (const [scope, cgroup, what] of [
    ["siltwake-heavy-wt-x-42", "/user.slice/siltwake-heavy-wt-x-42.scope-escaped.scope/job", "Sol's escaped sibling"],
    [undefined, "/user.slice/siltwake-heavy-wt-x-42.scope-escaped.scope/job", "the sibling, no scope named"],
    [undefined, "/user.slice/siltwake-heavy-wt-x-42.scope", "a real-looking scope, but none named"],
    ["siltwake-heavy-wt-x-42", "/user.slice/siltwake-heavy-other-7.scope", "another v1 job's scope"],
    ["siltwake-heavy-wt-x-42.scope-escaped", "/user.slice/siltwake-heavy-wt-x-42.scope-escaped.scope", "a name that embeds .scope"],
    ["agent", "/user.slice/agent.scope", "not a heavy-check unit"],
  ] as const) {
    const a = v1(scope, cgroup);
    assert.deepEqual([a.admitted, a.refuse], [false, true], what);
    assert.match(a.why, /a heavy-check job is claimed but not proven/, what);
  }
  assert.equal(G.admission({ env: { SILTWAKE_HEAVY_LOCK_HELD: "1" }, cgroup: "/x.scope", host: G.SANDBOX.host, sandboxTool: true, queueState: false }).admitted, true,
    "alickers' lane sets the flag without a scope: the sandbox admits it");
  const shim = fs.readFileSync("scripts/heavy-check.sh", "utf8");
  assert.match(shim, /SILTWAKE_HEAVY_SCOPE="\$unit" .*systemd-run --user --scope --quiet --unit="\$unit"/, "the shim names the scope it creates");
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
  assert.equal(G.routeArgs(argv, { machine: "any", env: { SILTWAKE_JOB_CPUS: "6", SILTWAKE_LANE_TICKET: "t", SILTWAKE_HEAVY_CONCURRENCY: "4" } }).args[4], "any",
    "nor do those a job sets afresh");
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
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith("SILTWAKE_") || k === "NODE_OPTIONS" || k === "NODE_TEST_CONTEXT") delete env[k];
  return { ...env, SILTWAKE_GUARD_STRICT: "1", SILTWAKE_SCHED_DIR: temp("siltwake-guard-sched-"), ...extra };
}
const run = (argv: string[], env: NodeJS.ProcessEnv, cwd = resolve(".")) => spawnSync(argv[0]!, argv.slice(1), { cwd, encoding: "utf8", env });
const W = ["node", "scripts/local-guard.mjs"];

test("each entry point runs the same command again through the queue, in the foreground, with its exit code", () => {
  const cases: [string[], string[]][] = [
    [["npm", "run", "build"], ["--class", "standard", "--machine", "3090", "--", ...W, "--class", "standard", "--machine", "3090", "--", "npm", "run", "build:direct", "--"]],
    [["npm", "test"], ["--class", "standard", "--machine", "any", "--", ...W, "--class", "standard", "--machine", "any", "--", "npm", "run", "test:fast:direct", "--"]],
    [["npm", "run", "typecheck"], ["--class", "quick", "--machine", "any", "--", ...W, "--class", "quick", "--machine", "any", "--", "npm", "run", "typecheck:direct", "--"]],
    [["npm", "run", "playthrough", "--", "--scenario", "creel"], ["--class", "playthrough", "--machine", "any", "--", ...W, "--class", "playthrough", "--machine", "any", "--", "npm", "run", "playthrough:direct", "--", "--scenario", "creel"]],
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

test("inside a real job it runs directly: its recorded cgroup or one above it admits; a string prefix of it refuses", () => {
  const own = fs.readFileSync("/proc/self/cgroup", "utf8").split("\n").find((l) => l.startsWith("0::"))!.slice(3);
  assert.ok(own.split("/").length > 2, own);
  const parent = own.slice(0, own.lastIndexOf("/"));
  for (const [recorded, direct] of [[own, true], [parent, true], [own.slice(0, -1), false]] as const) {
    const sched = temp("siltwake-guard-job-"), { queue, calls } = standIn();
    fs.mkdirSync(join(sched, "jobs", "261024-000000-test"), { recursive: true });
    fs.writeFileSync(join(sched, "jobs", "261024-000000-test", "cgroup"), `/sys/fs/cgroup${recorded}\n`);
    const r = run([...W, "--", "node", "-e", "process.exit(3)"], agentEnv({ SILTWAKE_HEAVY_CHECK: queue, SILTWAKE_SCHED_DIR: sched, SILTWAKE_JOB_TICKET: "261024-000000-test" }));
    assert.equal(r.status, direct ? 3 : G.REFUSED_EXIT, `${recorded}: ${r.stderr}`);
    assert.equal(calls().length, 0, "admitted, or refused: never queued again");
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

test("an unproven job claim ends at once, even when the queue client would run it inline (v1's nested branch)", () => {
  for (const argv of [["npm", "run", "build"], ["node", "scripts/test-build.mjs"], ["bash", "scripts/saves-build-at.sh", "HEAD", "/work/tmp/never-made"]]) {
    const r = spawnSync(argv[0]!, argv.slice(1), { encoding: "utf8", timeout: 30_000,
      env: agentEnv({ SILTWAKE_HEAVY_CHECK: resolve("scripts/heavy-check.sh"), SILTWAKE_SCHED_V1: "1", SILTWAKE_HEAVY_LOCK_HELD: "1" }) });
    assert.equal(r.status, G.REFUSED_EXIT, `${argv.join(" ")}: ${r.error?.message ?? ""}${r.stderr}`);
    assert.match(r.stderr, /a heavy-check job is claimed but not proven \(SILTWAKE_HEAVY_LOCK_HELD is set without SILTWAKE_HEAVY_SCOPE/);
  }
});

test("the package scripts have one literal shape each: the wrapper SCHED's runner aliases, and a direct body in its closed grammar", () => {
  const scripts = (JSON.parse(fs.readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }).scripts;
  const TSC = "node node_modules/typescript/bin/tsc";
  assert.deepEqual({ build: scripts.build, typecheck: scripts.typecheck, "test:fast": scripts["test:fast"], playthrough: scripts.playthrough }, {
    build: "node scripts/local-guard.mjs --class standard --machine 3090 -- npm run build:direct --",
    typecheck: "node scripts/local-guard.mjs --class quick --machine any -- npm run typecheck:direct --",
    "test:fast": "node scripts/local-guard.mjs --class standard --machine any -- npm run test:fast:direct --",
    playthrough: "node scripts/local-guard.mjs --class playthrough --machine any -- npm run playthrough:direct --",
  });
  assert.deepEqual({ b: scripts["build:direct"], t: scripts["typecheck:direct"], f: scripts["test:fast:direct"], p: scripts["playthrough:direct"] }, {
    b: `node scripts/local-guard.mjs --require npm run build && ${TSC} --noEmit && ${TSC} -p tsconfig.headless.json && node scripts/bake-terrain.mjs && node node_modules/vite/bin/vite.js build`,
    t: `node scripts/local-guard.mjs --require npm run typecheck && ${TSC} --noEmit && ${TSC} -p tsconfig.headless.json`,
    f: "node scripts/local-guard.mjs --require npm run test:fast && node scripts/guard-architecture.mjs --quiet && node scripts/test-build.mjs --typecheck && node scripts/test-tier.mjs fast",
    p: `node scripts/local-guard.mjs --require npm run playthrough && ${TSC} -p scripts/playthrough/tsconfig.json && node .test-build/scripts/playthrough/run.js`,
  });
  // The closed grammar (SCHED-3's portable runner): node steps on repo-relative paths, plain words, joined by " && ".
  for (const name of ["build:direct", "typecheck:direct", "test:fast:direct", "playthrough:direct"])
    for (const step of scripts[name]!.split(" && ")) {
      const w = step.split(" ");
      assert.equal(w[0], "node", `${name}: ${step}`);
      assert.ok(/^[A-Za-z0-9_@%+=:,./-]+$/.test(w[1]!) && !w[1]!.startsWith("/") && !w[1]!.startsWith("-") && !w[1]!.split("/").includes(".."), `${name}: ${step}`);
      assert.ok(w.every((x) => /^[A-Za-z0-9_@%+=:,./-]+$/.test(x)), `${name}: plain words only: ${step}`);
      assert.ok(w[1] === "scripts/local-guard.mjs" || fs.existsSync(w[1]!) || w[1]!.startsWith(".test-build/"), `${name}: ${w[1]} exists`);
    }
  assert.equal(scripts.test, "npm run test:fast");
  assert.equal(scripts.check, "npm run test:fast && npm run test:heavy && npm run build");
});
