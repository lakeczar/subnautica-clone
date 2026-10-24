#!/usr/bin/env node
// The queue's portable runner (SCHED-3 R3, R4). A registered command
// (policy.mjs PORTABLE) that the queue may place on either machine runs
// through this file, from the commit being tested, so both machines run the
// same thing by construction:
// - the command is this commit's package.json script, read in a closed
//   grammar (resolveScript) and run as plain node steps: npm and its
//   configuration (.npmrc files, prefixes, script-shell, node-options), a
//   shell, and anything else a script line could name are never involved;
// - the environment is rebuilt from a fixed allowlist (portableEnv): PATH with
//   the package's node_modules/.bin first (as npm adds it), the user, home,
//   locale, temp and session variables, and the queue's own job variables.
//   Nothing else of the submitter's or the machine's environment reaches it.
//
//   portable-run.mjs --script NAME [ARGS...]   a package.json script; ARGS appended as npm does
//
// It runs at the package root, as npm runs scripts, each step after the one
// before succeeded (&&), and exits with the first failing step's code (128 +
// the signal's own number for one a signal ended, as sh reports it). A stop
// it receives (TERM, INT, HUP) is passed to the step running and always ends
// the run with that signal's code, even if the step then exits 0.
// Before each step it checks the step's file stays inside the repository or
// its own node_modules (stepBoundary), so a committed symlink can't run a
// program from elsewhere on the machine.
import { spawn } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from "node:fs";
import { constants } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { QUEUE_OWNED } from "./policy.mjs";

const SESSION = ["HOME", "USER", "LOGNAME", "TMPDIR", "TZ", "LANG", "LANGUAGE", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS"];

/** The runner's environment: the allowlist only, PATH with root/node_modules/.bin first. */
export function portableEnv(env, root) {
  const out = {};
  // Of the queue's configuration, only where its state is: the guard's --require step finds its own job there.
  for (const [k, v] of Object.entries(env)) if (v != null && (SESSION.includes(k) || k.startsWith("LC_") || (QUEUE_OWNED(k) && (!k.startsWith("SILTWAKE_SCHED_") || k === "SILTWAKE_SCHED_DIR")))) out[k] = v;
  out.PATH = [join(root, "node_modules", ".bin"), env.PATH ?? "/usr/local/bin:/usr/bin:/bin"].join(":");
  return out;
}

const GUARD = "scripts/local-guard.mjs";
// The grammar's words: plain, never quoted, expanded or an option of node's own.
const PLAIN = /^[A-Za-z0-9_@%+=:,./-]+$/;
const repoPath = (w) => PLAIN.test(w) && !w.startsWith("/") && !w.startsWith("-") && !w.split("/").includes("..");

/** `p`'s real path, every symlink followed, a dangling one too (its target may exist on the
 * other machine); components that don't exist yet (a build output) are kept as written. */
function realpathLoose(p, depth = 0) {
  try { return realpathSync(p); } catch { /* not all there */ }
  const up = dirname(p);
  if (up === p || depth > 40) return p;
  const here = join(realpathLoose(up, depth + 1), basename(p));
  try { if (lstatSync(here).isSymbolicLink()) return realpathLoose(resolve(dirname(here), readlinkSync(here)), depth + 1); } catch { /* absent */ }
  return here;
}
const inside = (p, dir) => { const r = relative(dir, p); return r === "" || (r !== ".." && !r.startsWith("../") && !isAbsolute(r)); };

/**
 * Whether a node step's file, followed through every symlink, stays inside the
 * repository at `root` or the repository's own node_modules (wherever that
 * links: a worktree's or a snapshot's shared install), R5-F1. Returns null,
 * or the reason it doesn't. No list of programs: the boundary is the rule.
 */
export function stepBoundary(root, path) {
  const realRoot = realpathLoose(root), real = realpathLoose(join(root, path));
  const modules = join(root, "node_modules"), realModules = existsSync(modules) ? realpathLoose(modules) : null;
  if (inside(real, realRoot) || (realModules && inside(real, realModules))) return null;
  return `${path} resolves outside the repository and its node_modules (${real})`;
}

/**
 * A package.json script in a closed grammar (R4-F1). The script is steps
 * joined by ` && `, on one line; each step is one of
 *   node <repo-relative path> [plain args]
 *   npm test [-- plain args]  |  npm run <script> [-- plain args]   (expanded, recursively)
 * and `args` are appended to the last step as npm appends them (to an npm
 * step only after its `--`, where npm forwards them). Anything else (another
 * head, an assignment, env, a path to npm, npx, an npm option, quoting, a
 * newline or any other separator, pre/post scripts) isn't portable:
 * { error }, and the job runs where it was submitted, as typed.
 * STEW-2's local-run guard (scripts/local-guard.mjs) is a node step of a
 * special kind, never run as one when it would route (SCHED-3 R5):
 *   node scripts/local-guard.mjs --class <C> --machine any -- npm run <X>:direct -- [args]
 *     an alias: <X>:direct is expanded under this grammar (inside a job the
 *     guard runs it directly anyway), so neither the guard nor npm runs;
 *   node scripts/local-guard.mjs --require [--quiet] <plain words>
 *     the admission check at the head of a :direct body: a plain node step
 *     (it spawns nothing, and admits a job's own processes);
 *   any other guard step (--machine 3090, a bash script, any other shape)
 *     isn't portable.
 * Returns { steps: [argv, …], command } or { error }.
 */
export function resolveScript(scripts, name, args = [], depth = 0) {
  const body = scripts?.[name];
  if (typeof body !== "string") return { error: `package.json has no script ${name}` };
  if (scripts[`pre${name}`] != null || scripts[`post${name}`] != null) return { error: `${name} has pre/post scripts` };
  if (depth > 8) return { error: `${name} nests too deeply` };
  if (!args.every((a) => PLAIN.test(a))) return { error: "its arguments aren't plain words" };
  const lines = body.split(" && ");
  const steps = [];
  for (const [i, line] of lines.entries()) {
    const w = line.split(" "), last = i === lines.length - 1, extra = last ? args : [];
    if (!line || w.some((x) => !PLAIN.test(x))) return { error: `${name}'s step \`${line}\` isn't plain words` };
    if (w[0] === "node" && w[1] === GUARD && w[2] !== "--require") {
      const alias = w[2] === "--class" && w[3] && w[4] === "--machine" && w[6] === "--" && w[7] === "npm" && w[8] === "run" && /^[\w:.-]+:direct$/.test(w[9] ?? "") && w[10] === "--";
      if (!alias || w[5] !== "any") return { error: `${name}'s step \`${line}\` ${alias ? `is a local-guard wrapper with --machine ${w[5]}, which is work for factory-worker` : "is a local-guard step other than its npm alias"}` };
      const r = resolveScript(scripts, w[9], [...w.slice(11), ...extra], depth + 1);
      if (r.error) return r;
      steps.push(...r.steps);
      continue;
    }
    if (w[0] === "node" && repoPath(w[1] ?? "-")) { steps.push([...w, ...extra]); continue; }
    const npm = w[0] === "npm" && (w[1] === "test" ? { inner: "test", rest: w.slice(2) } : w[1] === "run" && w[2] && !w[2].startsWith("-") ? { inner: w[2], rest: w.slice(3) } : null);
    if (!npm || (npm.rest.length && npm.rest[0] !== "--") || (extra.length && !npm.rest.length)) return { error: `${name}'s step \`${line}\` isn't one the portable runner runs` };
    const r = resolveScript(scripts, npm.inner, [...npm.rest.slice(1), ...extra], depth + 1);
    if (r.error) return r;
    steps.push(...r.steps);
  }
  return { steps, command: steps.map((s) => s.join(" ")).join(" && ") };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const [mode, name, ...rest] = process.argv.slice(2);
  if (mode !== "--script" || !name) { console.error("usage: portable-run.mjs --script NAME [ARGS...]"); process.exit(2); }
  const r = resolveScript(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts, name, rest);
  if (r.error) { console.error(`portable-run: ${r.error}`); process.exit(2); }
  const outside = r.steps.map(([, path]) => stepBoundary(root, path)).find(Boolean);
  if (outside) { console.error(`portable-run: ${outside}`); process.exit(2); }
  console.error(`portable-run: ${r.command}`);
  const env = portableEnv(process.env, root);
  const code = (signal) => 128 + (constants.signals[signal] ?? 0); // the platform's number, as sh reports it
  let child = null, stopped = null;
  for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(sig, () => { stopped ??= sig; child?.kill(sig); });
  for (const [cmd, ...argv] of r.steps) {
    if (stopped) break;
    child = spawn(cmd, argv, { cwd: root, env, stdio: "inherit" });
    const rc = await new Promise((done) => child.on("exit", (c, signal) => done(c ?? code(signal))));
    if (rc !== 0) process.exit(stopped ? code(stopped) : rc);
  }
  process.exit(stopped ? code(stopped) : 0); // a stop received is never a success
}
