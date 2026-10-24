import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// heavy-check v2's production/private classification (scripts/heavy/state.mjs
// loadConfig, TST-16b): production is a directory identity, not a spelling.
// Private state gets test seams (a shortened reload deadline, host overrides,
// the remote lane off), so an alias of the production directory must never
// count as private. Read-only: nothing here writes to the production state.
const S = await import(pathToFileURL(resolve("scripts/heavy/state.mjs")).href);
const PROD = S.PRODUCTION_DIR;

test("the production state is production however it's spelled (canonical, trailing slash, doubled slash, `.` and `..`)", () => {
  for (const d of [PROD, `${PROD}/`, `${PROD}//`, PROD.replace("/siltwake-sched", "//siltwake-sched"), PROD.replace("/siltwake-sched", "/./siltwake-sched"), PROD.replace("/siltwake-sched", "/x/../siltwake-sched")]) {
    assert.equal(S.loadConfig({ SILTWAKE_SCHED_DIR: d }).production, true, d);
  }
  assert.equal(S.loadConfig({}).production, true, "the default");
});

test("a private directory is private, and a symlink is classified by the directory it names", () => {
  const t = mkdtempSync(join(tmpdir(), "heavy-config-"));
  try {
    const real = join(t, "real"), other = join(t, "other"), alias = join(t, "alias");
    mkdirSync(real); mkdirSync(other); symlinkSync(real, alias);
    assert.equal(S.sameDir(alias, real), true, "an alias is the same directory");
    assert.equal(S.sameDir(`${alias}/`, real), true);
    assert.equal(S.sameDir(other, real), false);
    assert.equal(S.sameDir(join(t, "missing"), real), false);
    assert.equal(S.sameDir(join(t, "missing", "..", "real"), real), true, "a missing path is compared normalized");
    if (existsSync(PROD)) { // this machine's production state, only named
      symlinkSync(PROD, join(t, "prod"));
      assert.equal(S.loadConfig({ SILTWAKE_SCHED_DIR: join(t, "prod") }).production, true, "a symlink to the production state");
    }
    for (const d of [real, alias, `${PROD}-private`, `${PROD}x`, join(PROD, "sub")]) assert.equal(S.loadConfig({ SILTWAKE_SCHED_DIR: d }).production, false, d);
  } finally { rmSync(t, { recursive: true, force: true }); }
});
