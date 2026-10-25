// The heavy tier's per-file containment (TT-1 R1-1, R2-1): a file's budget
// covers its whole process tree, and the tree is torn down when the file's
// process exits. Runs the real heavy runner, nested in this heavy job, on probe
// files whose child processes allocate memory or outlive them, under both
// adapters: per-file cgroups (when this job is delegated) and process groups.
// STEW-2: files that assert elapsed time run last, one at a time, in a timing
// phase that reports the CPU wait each saw; a heavy file that reads a clock
// unclassified is refused.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(".");
const probes = mkdtempSync(join(root, ".test-build", "heavy-probes-"));
after(() => rmSync(probes, { recursive: true, force: true }));
const delegated = process.env.SILTWAKE_HEAVY_CGROUP === "delegated";
const modes = [...(delegated ? ["cgroup"] : []), "process group"] as const;

/** A probe test file in the probe directory. */
const write = (name: string, body: string): string => {
  const file = join(probes, `${name}.heavy.test.js`);
  writeFileSync(file, `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { spawn, spawnSync } from "node:child_process";\nimport { writeFileSync } from "node:fs";\n${body}\n`);
  return file;
};
/** A probe test whose child process holds `mib` MiB of touched memory for a moment. */
const allocating = (name: string, mib: number): string => write(name, `test("${name}", () => {
  const r = spawnSync(process.execPath, ["-e", "const a = []; for (let i = 0; i < ${mib}; i++) a.push(Buffer.alloc(1 << 20, 1)); setTimeout(() => {}, 600);"]);
  assert.equal(r.status, 0, "the child finished");
});`);

/** The nested heavy runner over `files` with one adapter, as it ran; `budgets` replaces tests/heavy-budgets.json.
 * `budgetMiB` is applied through the override (not budget evidence) unless `real`, when it is the budgets file's default. */
function runTier(files: readonly string[], mode: (typeof modes)[number], budgetMiB: number, budgets?: object, real = false) {
  const env: NodeJS.ProcessEnv = { ...process.env, SILTWAKE_HEAVY_BUDGET_MIB: String(budgetMiB) };
  if (real) delete env.SILTWAKE_HEAVY_BUDGET_MIB;
  if (budgets || real) {
    env.SILTWAKE_HEAVY_BUDGETS = join(probes, `budgets-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(env.SILTWAKE_HEAVY_BUDGETS, JSON.stringify({ defaultMiB: budgetMiB, ...budgets }));
  }
  if (mode === "process group") env.SILTWAKE_HEAVY_CGROUP = "";
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, ["scripts/test-tier.mjs", "heavy", ...files], { cwd: root, encoding: "utf8", env, timeout: 120_000 });
}
interface Row { file: string; status: string; cpuS: number | null; cpuScope: string | null; peakMiB: number; budgetMiB: number; budgetPct: number | null;
  oomKillsOwn: number | null; oomKillsNested: number | null; cache: { hits: number; misses: number; fills: number } | null; matchKey: string }
interface HeavyRecord { commit: string | null; machine: string; containment: string; jobMemoryMiB: number | null; cache: { state: string }; selection: { kind: string };
  override: number | null; budgetEvidence: boolean; files: Row[] }
/** The run's stored-results record (STEW-3), from its output. */
function recordOf(stdout: string): HeavyRecord {
  const line = stdout.split("\n").filter((l) => l.startsWith("heavy-results: ")).at(-1);
  assert.ok(line, "the run printed its record");
  return JSON.parse(line.slice("heavy-results: ".length)) as HeavyRecord;
}
const rowOf = (rec: HeavyRecord, name: string) => rec.files.find((f) => f.file === `${name}.heavy.test.js`)!;
/** The same, required to have run; its summary rows by probe name. */
function tier(files: readonly string[], mode: (typeof modes)[number], budgetMiB: number, budgets?: object) {
  const started = Date.now();
  const out = runTier(files, mode, budgetMiB, budgets);
  assert.match(out.stdout, new RegExp(`${mode} containment`), `the runner used ${mode} containment`);
  const row = (name: string) => out.stdout.split("\n").find((l) => l.trimStart().startsWith(`${name}.heavy.test.js `)) ?? "";
  return { out, row, seconds: (Date.now() - started) / 1000 };
}

for (const mode of modes) {
  test(`${mode}: a child over the file's budget fails that file only; a file under it passes and is measured with its child`, () => {
    const hog = allocating(`hog-${mode.replace(" ", "-")}`, 400), light = allocating(`light-${mode.replace(" ", "-")}`, 48);
    const { out, row } = tier([hog, light], mode, 192);
    const name = (f: string) => f.split("/").pop()!.replace(".heavy.test.js", "");
    assert.equal(out.status, 1, out.stdout + out.stderr);
    assert.match(row(name(hog)), /KILLED \(over budget\)|FAIL/, out.stdout);
    assert.match(row(name(light)), /\bok$/, out.stdout);
    const peak = Number(/peak\s+(\d+) MiB/.exec(row(name(light)))?.[1]);
    assert.ok(peak >= 48, `the light file's peak (${peak} MiB) includes its child's 48 MiB`);
    // STEW-3: the stored record says what each number was measured under.
    const rec = recordOf(out.stdout);
    assert.deepEqual([rec.override, rec.budgetEvidence, rec.containment, rec.selection.kind], [192, false, mode, "subset"]);
    assert.match(out.stdout, /NOT BUDGET EVIDENCE: SILTWAKE_HEAVY_BUDGET_MIB=192 replaced every file's budget/);
    const h = rowOf(rec, name(hog)), l = rowOf(rec, name(light));
    assert.equal(l.peakMiB, peak);
    assert.equal(l.budgetMiB, 192);
    assert.equal(l.budgetPct, Math.round((l.peakMiB / 192) * 1000) / 10);
    assert.ok(l.cpuS != null && l.cpuS > 0, `the light file's CPU was measured (${l.cpuS})`);
    assert.equal(l.cpuScope, mode === "cgroup" ? "tree" : "process");
    assert.ok(l.cache && l.cache.hits >= 0, "the file reported its build-cache use");
    if (mode === "cgroup") {
      assert.ok((h.oomKillsOwn ?? 0) >= 1, `the hog's own budget OOM-killed its tree (${h.oomKillsOwn})`);
      assert.deepEqual([l.oomKillsOwn, l.oomKillsNested], [0, 0]);
    } else assert.deepEqual([h.oomKillsOwn, l.oomKillsNested], [null, null], "a process group can't count OOM kills: null, never 0");
  });

  test(`${mode}: at real budgets a run is budget evidence, with its commit, machine and limits recorded`, () => {
    const tag = mode.replace(" ", "-"), light = allocating(`real-${tag}`, 32);
    const out = runTier([light], mode, 512, undefined, true);
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assert.doesNotMatch(out.stdout, /NOT BUDGET EVIDENCE/);
    const rec = recordOf(out.stdout), r = rowOf(rec, `real-${tag}`);
    assert.deepEqual([rec.override, rec.budgetEvidence], [null, true]);
    assert.equal(rec.commit, spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim());
    assert.ok(rec.machine && ["cold", "warm", "off"].includes(rec.cache.state), JSON.stringify(rec));
    assert.equal(r.budgetMiB, 512);
    assert.match(r.matchKey, new RegExp(`\\|${mode}\\|512\\|${rec.cache.state}\\|`));
    assert.match(out.stdout, new RegExp(`job memory limit (\\d+|none) MiB, pool \\d+ MiB.*build cache ${rec.cache.state} at the start`));
  });

  test(`${mode}: a child left holding the file's stdout and stderr is removed when the file exits; a sibling's child is untouched`, () => {
    const tag = mode.replace(" ", "-"), pidFile = join(probes, `straggler-${tag}.pid`);
    // The straggler would hold both pipes for 60 s; the sibling's own child must live its 2 s and exit 0.
    const straggler = write(`straggler-${tag}`, `test("leaves a child holding stdout and stderr", () => {
  const c = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "inherit" });
  writeFileSync(${JSON.stringify(pidFile)}, String(c.pid));
  c.unref();
});`);
    const sibling = write(`sibling-${tag}`, `test("its own child runs to the end", async () => {
  const c = spawn(process.execPath, ["-e", "setTimeout(() => {}, 2000)"], { stdio: "ignore" });
  const end = await new Promise((done) => c.on("exit", (code, signal) => done(signal ?? code)));
  assert.equal(end, 0, "the sibling's child was not killed");
});`);
    const { out, row, seconds } = tier([straggler, sibling], mode, 256);
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assert.match(row(`straggler-${tag}`), /\bok$/, out.stdout);
    assert.match(row(`sibling-${tag}`), /\bok$/, out.stdout);
    assert.ok(seconds < 30, `the runner finished in ${seconds.toFixed(1)} s, not after the straggler's 60 s`);
    const pid = readFileSync(pidFile, "utf8").trim();
    assert.ok(!existsSync(`/proc/${pid}`) || /^State:\s+Z/m.test(readFileSync(`/proc/${pid}/status`, "utf8")), `straggler ${pid} was removed`);
  });
}

for (const mode of modes) {
  const tag = mode.replace(" ", "-");
  test(`${mode}: files asserting elapsed time run last, one at a time, and report the CPU wait they saw`, () => {
    const log = join(probes, `timing-${tag}.log`);
    /** A probe that records when it ran: "<name> start|end <ms>". */
    const span = (name: string, ms: number, clock = false) => write(name, `test("${name}", async () => {
  ${clock ? "const t0 = performance.now();" : ""}
  writeFileSync(${JSON.stringify(log)}, "${name} start " + Date.now() + "\\n", { flag: "a" });
  await new Promise((done) => setTimeout(done, ${ms}));
  writeFileSync(${JSON.stringify(log)}, "${name} end " + Date.now() + "\\n", { flag: "a" });
  ${clock ? "assert.ok(performance.now() - t0 < 60000);" : ""}
});`);
    const files = [span(`timed-a-${tag}`, 300, true), span(`pooled-b-${tag}`, 1500), span(`timed-c-${tag}`, 300, true), span(`pooled-d-${tag}`, 1500)];
    // The pooled probes log with Date.now(): reporting only.
    const { out, row } = tier(files, mode, 256, { exclusive: [`timed-a-${tag}.heavy.test.ts`, `timed-c-${tag}.heavy.test.ts`],
      clockWithoutBound: [`pooled-b-${tag}.heavy.test.ts`, `pooled-d-${tag}.heavy.test.ts`] });
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assert.match(out.stdout, /=== timing phase: 2 file\(s\)/);
    const at = new Map(readFileSync(log, "utf8").trim().split("\n").map((l) => { const [n, e, t] = l.split(" "); return [`${n} ${e}`, Number(t)]; }));
    const pooledEnd = Math.max(at.get(`pooled-b-${tag} end`)!, at.get(`pooled-d-${tag} end`)!);
    for (const n of [`timed-a-${tag}`, `timed-c-${tag}`]) {
      assert.ok(at.get(`${n} start`)! >= pooledEnd, `${n} started after every pooled file ended`);
      assert.match(row(n), /ok {2}\[timing; CPU wait: job [\d.?]+%, host [\d.]+%\]$/, out.stdout);
    }
    const span2 = (n: string): [number, number] => [at.get(`${n} start`)!, at.get(`${n} end`)!];
    const [a, c] = [span2(`timed-a-${tag}`), span2(`timed-c-${tag}`)];
    assert.ok(a[1] <= c[0] || c[1] <= a[0], "the two timing files never overlapped");
    assert.match(row(`pooled-b-${tag}`), /\bok$/, "a pooled file's row is unchanged");
  });

  test(`${mode}: a heavy file that reads a clock in any common form, itself or through a helper, is refused unless classified`, () => {
    writeFileSync(join(probes, `clock-helper-${tag}.js`), "export const elapsed = (t0) => Date.now() - t0;\n");
    const forms: [string, string][] = [
      ["date-now", "const t0 = Date.now(); assert.ok(Date.now() - t0 < 1000);"],
      ["date-alias", "const { now } = Date; const t0 = now(); assert.ok(now() - t0 < 1000);"],
      ["date-object", "const t0 = new Date().getTime(); assert.ok(+new Date - t0 < 1000);"],
      ["perf-import", "const { performance: clock } = await import(\"node:perf_hooks\"); const t0 = clock.now(); assert.ok(clock.now() - t0 < 1000);"],
      ["hrtime", "const t0 = process.hrtime.bigint(); assert.ok(process.hrtime.bigint() - t0 < 10n ** 9n);"],
    ];
    const files = forms.map(([form, body]) => write(`unlisted-${form}-${tag}`, `test("times something", async () => { ${body} });`));
    files.push(write(`unlisted-helper-${tag}`, `import { elapsed } from "./clock-helper-${tag}.js";\ntest("times through a helper", () => { assert.ok(elapsed(0) > 0); });`));
    for (const file of files) {
      const name = file.split("/").pop()!.replace(/\.js$/, ".ts");
      const out = runTier([file], mode, 256, { exclusive: [] });
      assert.equal(out.status, 2, `${name}: ${out.stdout}${out.stderr}`);
      assert.match(out.stderr, new RegExp(`${name.replace(/\./g, "\\.")} read a clock.*clockWithoutBound`));
      assert.doesNotMatch(out.stdout, /test:heavy summary/);
    }
    const listed = tier([files[0]!], mode, 256, { clockWithoutBound: [`unlisted-date-now-${tag}.heavy.test.ts`] });
    assert.equal(listed.out.status, 0, listed.out.stdout + listed.out.stderr);
    // Fixed dates aren't clock reads.
    const fixed = write(`fixed-date-${tag}`, `test("a fixed date", () => { assert.equal(new Date(0).getTime(), 0); });`);
    assert.equal(tier([fixed], mode, 256, { exclusive: [] }).out.status, 0);
  });
}
