// test-tier: allow-escape runs the bake script (worker threads) as a child process.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

/** Every baked chunk file equals the live recipe bytes (bakes first if the
 * sources changed; the bake is cached by a hash of every bundled source). */
test("baked terrain assets equal the live recipe for every chunk", () => {
  const bake = spawnSync(process.execPath, ["scripts/bake-terrain.mjs"], { encoding: "utf8" });
  assert.equal(bake.status, 0, bake.stdout + bake.stderr);
  const verify = spawnSync(process.execPath, ["scripts/bake-terrain.mjs", "--verify"], { encoding: "utf8" });
  assert.equal(verify.status, 0, verify.stdout + verify.stderr);
  // CW-1: one verify covers the terrain chunks and the caves' collision and light.
  assert.match(verify.stdout, /verified (\d+)\/\1 files equal the live bytes \(\d+ chunks, 1 collision pack, \d+ light fields\)/);
});
