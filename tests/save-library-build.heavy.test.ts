// SAVE-1 R1: the archive builds that exports run from and imports decode with.
// Heavy only because it compiles the playthrough twice (about 1 GiB, a core each).
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createEnvelope, encodeSave } from "../src/save/codec.js";
import { createGame } from "../src/sim/state.js";
import { buildManifest, readLibrary, sha256 } from "../scripts/playthrough/library.js";
import { stateHash } from "../scripts/playthrough/persistence.js";
import { emptyRun } from "../scripts/playthrough/timeline.js";
import type { GameState } from "../src/sim/types.js";
// Compiled into the test build for the spawns below (entry points no test imports).
import type {} from "../scripts/playthrough/saves.js";
import type {} from "../scripts/playthrough/run.js";

const git = (...a: string[]): string => execFileSync("git", a, { encoding: "utf8" }).trim();
const repo = git("rev-parse", "--show-toplevel"), head = git("rev-parse", "HEAD"), parent = git("rev-parse", "HEAD~1");
const scratch = (p: string): string => fs.mkdtempSync(path.join(fs.existsSync("/work/tmp") ? "/work/tmp" : os.tmpdir(), p));

test("saves-build-at builds exactly the commit's source, marked with it, and its export refuses another label", () => {
  const dir = path.join(scratch("siltwake-build-test-"), "build");
  execFileSync("bash", [path.join(repo, "scripts/saves-build-at.sh"), head, dir], { stdio: "ignore" });
  try {
    assert.equal(fs.readFileSync(path.join(dir, ".siltwake-source-commit"), "utf8").trim(), head);
    for (const f of ["scripts/playthrough/run.ts", "scripts/playthrough/library.ts", "src/save/codec.ts"])
      assert.equal(fs.readFileSync(path.join(dir, f), "utf8"), git("show", `${head}:${f}`) + "\n", `${f} is the commit's, not the worktree's`);
    assert.ok(!fs.existsSync(path.join(dir, ".git")));
    const run = path.join(dir, ".test-build/scripts/playthrough/run.js");
    const wrong = spawnSync(process.execPath, [run, "--export", "--commit", parent, "--library-root", scratch("siltwake-lib-"), "--scenario", "low-air"], { encoding: "utf8", cwd: dir });
    assert.equal(wrong.status, 2);
    assert.match(wrong.stderr, new RegExp(`--export --commit ${parent}: this code was built from ${head}`));
  } finally { fs.rmSync(path.dirname(dir), { recursive: true, force: true }); }
});

test("import from a worktree build decodes with a fresh build of the commit before publishing; a bad save leaves nothing public", () => {
  const e = encodeSave(createEnvelope(createGame(), { sessionId: "library-import-test", createdAt: "2026-10-23T00:00:00.000Z", savedAt: "2026-10-23T00:00:00.000Z" }));
  assert.ok(e.ok);
  const incoming = (text: string): string => {
    const src = scratch("siltwake-incoming-");
    const run = emptyRun("creel", "creel"), state = JSON.parse(e.value).state as GameState;
    run.saves.push({ phase: "opening", label: "opening", tick: 0, bytes: 0, hash: stateHash(state), equal: true, commands: 4, journalBytes: 0 });
    const { manifest } = buildManifest(head, [run], [{ scenario: "creel", label: "opening", text: e.value }], () => null);
    // The file the second worker sent, listed with its own SHA-256: only decoding can tell it is bad.
    manifest.saves[0]!.sha256 = sha256(text);
    const dir = path.join(src, head);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "creel@opening.json"), text);
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
    return dir;
  };
  const root = scratch("siltwake-lib-");
  const cli = path.join(repo, ".test-build/scripts/playthrough/saves.js");
  // Its raw state matches its recorded hash, but the build refuses to load it (oxygen over 100%).
  const bad = JSON.parse(e.value) as { state: GameState };
  bad.state.player.vitals.oxygen = 250;
  const badText = JSON.stringify(bad, null, 2), badDir = incoming(badText);
  const m = JSON.parse(fs.readFileSync(path.join(badDir, "manifest.json"), "utf8"));
  m.saves[0].hash = stateHash(bad.state);
  fs.writeFileSync(path.join(badDir, "manifest.json"), JSON.stringify(m));
  const refused = spawnSync(process.execPath, [cli, "import", badDir, "--root", root], { encoding: "utf8", cwd: repo });
  assert.equal(refused.status, 1, refused.stdout + refused.stderr);
  assert.match(refused.stderr, /REFUSED: .*does not decode/);
  assert.match(refused.stderr, new RegExp(`the ${head.slice(0, 12)} build refused`));
  assert.equal(fs.existsSync(path.join(root, head)), false);
  assert.deepEqual(fs.readdirSync(root).filter((f) => !f.startsWith(".")).filter((f) => f !== "index.json"), []);
  assert.equal(readLibrary(root).manifests.length, 0);
  const good = spawnSync(process.execPath, [cli, "import", incoming(e.value), "--root", root], { encoding: "utf8", cwd: repo });
  assert.equal(good.status, 0, good.stdout + good.stderr);
  assert.match(good.stdout, /published .* decoded by a build of/);
  const verify = spawnSync(process.execPath, [cli, "verify", head, "--root", root], { encoding: "utf8", cwd: repo });
  assert.equal(verify.status, 0, verify.stdout + verify.stderr);
});
