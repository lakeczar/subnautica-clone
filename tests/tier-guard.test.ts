import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// The fast tier must never run Babylon. Probes are tiny compiled test files beside
// the compiled sources, run through the real tier runner. A probe that slips past
// a guard would load Babylon in a fast process, so failures here matter.
const root = resolve(".");
const probes = mkdtempSync(join(root, ".test-build", "tier-probes-"));
after(() => rmSync(probes, { recursive: true, force: true }));
const probe = (name: string, body: string): string => {
  const file = join(probes, `${name}.test.js`);
  writeFileSync(file, `import test from "node:test";\n${body}\ntest("${name}", () => {});\n`);
  return file;
};
// A nested `node --test` that inherits NODE_TEST_CONTEXT reports to this runner
// and exits 0 even when its tests fail, so each probe runs as a top-level run.
const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
const fast = (file: string) => spawnSync(process.execPath, ["scripts/test-tier.mjs", "fast", file], { cwd: root, encoding: "utf8", env });
const guarded = (file: string) => spawnSync(process.execPath,
  ["--import", pathToFileURL(join(root, "scripts", "fast-guard.mjs")).href, "--test", file], { cwd: root, encoding: "utf8", env });

test("a literal Babylon import is refused statically with its chain and the rename", () => {
  const out = fast(probe("literal", `import "@babylonjs/core/Maths/math.vector.js";`));
  assert.notEqual(out.status, 0);
  assert.match(out.stderr, /reaches Babylon \(.*literal\.test\.js -> @babylonjs\/core\/Maths\/math\.vector\.js\)/);
  assert.match(out.stderr, /heavy\.test\.ts/);
});

test("an unmocked app import is refused statically and, if it slipped through, at runtime", () => {
  const file = probe("unmocked-app", `import "../src/runtime/app.js";`);
  const out = fast(file);
  assert.notEqual(out.status, 0);
  assert.match(out.stderr, /unmocked-app\.test\.js reaches Babylon \(.*src\/runtime\/app\.js -> src\/render\/renderer\.js/);
  const runtime = guarded(file);
  assert.notEqual(runtime.status, 0);
  assert.match(runtime.stdout + runtime.stderr, /test:fast refused Babylon: @babylonjs\/core\/.* imported by .*src\/render\//);
});

test("a computed dynamic Babylon import passes the scan but fails at runtime", () => {
  const out = fast(probe("computed", `const name = ["@babylonjs", "core", "Maths", "math.vector.js"].join("/");
test("loads", async () => { await import(name); });`));
  assert.notEqual(out.status, 0);
  assert.doesNotMatch(out.stderr, /reaches Babylon/);
  assert.match(out.stdout + out.stderr, /test:fast refused Babylon: @babylonjs\/core\/Maths\/math\.vector\.js/);
});

test("an app test that registers the mocking loader stays fast and runs", () => {
  const out = fast(probe("mocked-app", `import assert from "node:assert/strict";
import { register } from "node:module";
register("../tests/app-loader.js", import.meta.url);
const { SiltwakeApp } = await import("../src/runtime/app.js");
test("app module loads with the mocked renderer", () => { assert.equal(typeof SiltwakeApp, "function"); });`));
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assert.match(out.stdout, /ℹ pass 2\b/, "both probe tests ran");
});

test("heavy files are refused by the fast tier, and the heavy tier refuses to run outside the lock", () => {
  const heavy = join(root, ".test-build", "tests", "render-lifecycle.heavy.test.js");
  const out = fast(heavy);
  assert.equal(out.status, 2); assert.match(out.stderr, /heavy files run only in the heavy tier/);
  const unlockedEnv = { ...env }; delete unlockedEnv.SILTWAKE_HEAVY_LOCK_HELD;
  const unlocked = spawnSync(process.execPath, ["scripts/test-tier.mjs", "heavy", heavy], { cwd: root, encoding: "utf8", env: unlockedEnv });
  assert.equal(unlocked.status, 2); assert.match(unlocked.stderr, /npm run test:heavy/);
});
