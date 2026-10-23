// `--snapshot` (SCHED-2, TST-19): the job runs on a private copy of the tree
// as it was at submit, so the caller can keep editing its worktree while the
// ticket waits and runs, and the result stays bound to what was submitted.
//
// The copy is a shared clone (objects borrowed from the worktree's repository,
// so it is a real git checkout at the same HEAD, made in about a second), plus
// the uncommitted diff and the untracked files. node_modules is linked from
// the worktree. Ignored build outputs (.test-build, baked terrain) are not
// copied: the job compiles inside, and the terrain bake restores from the
// shared store. The copy is deleted when the job ends, unless the job wrote
// files into it; then it is kept with the job's other files (7 days).
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const git = (cwd, args, input) => spawnSync("git", ["-C", cwd, ...args], { input, encoding: "buffer", maxBuffer: 512 * 1024 * 1024 });

/** Makes the copy at `root`; returns { root, cwd } (cwd: the caller's cwd
 * inside the copy), or { error }. */
export function makeSnapshot(worktree, cwd, root, head) {
  mkdirSync(dirname(root), { recursive: true });
  let r = spawnSync("git", ["clone", "--quiet", "--shared", "--no-checkout", worktree, root], { encoding: "utf8" });
  if (r.status !== 0) return { error: `git clone failed: ${r.stderr.trim()}` };
  r = git(root, ["checkout", "--quiet", "--detach", head]);
  if (r.status !== 0) return fail(root, `checkout ${head} failed: ${r.stderr}`);
  const diff = git(worktree, ["diff", "HEAD", "--binary"]).stdout;
  if (diff?.length) {
    r = git(root, ["apply", "--whitespace=nowarn", "-"], diff);
    if (r.status !== 0) return fail(root, `applying the uncommitted diff failed: ${r.stderr}`);
  }
  for (const name of git(worktree, ["ls-files", "-o", "--exclude-standard", "-z"]).stdout.toString().split("\0").filter(Boolean)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    copyFileSync(join(worktree, name), join(root, name));
  }
  const modules = join(worktree, "node_modules");
  if (existsSync(modules)) symlinkSync(realpathSync(modules), join(root, "node_modules"));
  return { root, cwd: join(root, relative(worktree, cwd)) };
}

/** Removes the copy unless the job changed it; returns the kept path or null. */
export function dropSnapshot(root, submittedStatus) {
  if (!existsSync(root)) return null;
  const status = git(root, ["status", "--porcelain", "--untracked-files=all"]).stdout?.toString() ?? "";
  if (status !== submittedStatus) return root;
  rmSync(root, { recursive: true, force: true });
  return null;
}

/** `git status --porcelain` of a fresh copy, to tell later what the job wrote. */
export const snapshotStatus = (root) => git(root, ["status", "--porcelain", "--untracked-files=all"]).stdout?.toString() ?? "";

function fail(root, error) {
  rmSync(root, { recursive: true, force: true });
  return { error: error.toString().trim() };
}
