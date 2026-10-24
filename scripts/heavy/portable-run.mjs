#!/usr/bin/env node
// The queue's portable runner (SCHED-3 R3). A registered command (policy.mjs
// PORTABLE) that the queue may place on either machine runs through this
// file, from the commit being tested, so both machines run the same thing by
// construction:
// - the command is this commit's package.json script, its `npm test` and
//   `npm run` steps expanded, so npm and its configuration (.npmrc files,
//   prefixes, script-shell, node-options) are never involved;
// - the environment is rebuilt from a fixed allowlist (portableEnv): PATH with
//   the package's node_modules/.bin first (as npm adds it), the user, home,
//   locale, temp and session variables, and the queue's own job variables.
//   Nothing else of the submitter's or the machine's environment reaches it.
//
//   portable-run.mjs --script NAME [ARGS...]   a package.json script; ARGS appended as npm does
//   portable-run.mjs --sh COMMAND              a command line of ours (the heavy tier's)
//
// It runs at the package root, as npm runs scripts, with `sh -c`, and exits
// with the command's code.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { QUEUE_OWNED } from "./policy.mjs";

const SESSION = ["HOME", "USER", "LOGNAME", "TMPDIR", "TZ", "LANG", "LANGUAGE", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS"];

/** The runner's environment: the allowlist only, PATH with root/node_modules/.bin first. */
export function portableEnv(env, root) {
  const out = {};
  for (const [k, v] of Object.entries(env)) if (v != null && (SESSION.includes(k) || k.startsWith("LC_") || (QUEUE_OWNED(k) && !k.startsWith("SILTWAKE_SCHED_")))) out[k] = v;
  out.PATH = [join(root, "node_modules", ".bin"), env.PATH ?? "/usr/local/bin:/usr/bin:/bin"].join(":");
  return out;
}

const quote = (a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, "'\\''")}'`);

/**
 * The command line a package.json script runs, its `npm test` / `npm run X`
 * steps expanded (their own arguments kept), with `args` appended as npm
 * appends them. { command } or { error }: a script that isn't plain `&&`
 * steps, has pre/post scripts, or still needs npm can't run without npm.
 */
export function resolveScript(scripts, name, args = [], depth = 0) {
  const body = scripts?.[name];
  if (typeof body !== "string") return { error: `package.json has no script ${name}` };
  if (scripts[`pre${name}`] != null || scripts[`post${name}`] != null) return { error: `${name} has pre/post scripts` };
  if (depth > 8 || /['"`$\\;|<>()]|&(?!&)/.test(body.replace(/&&/g, ""))) return { error: `${name} isn't plain && steps` };
  const steps = [];
  for (const step of body.split("&&").map((s) => s.trim().split(/\s+/))) {
    if (step[0] !== "npm") { steps.push(step.join(" ")); continue; }
    const [inner, rest] = step[1] === "test" ? ["test", step.slice(2)] : step[1] === "run" && step[2] ? [step[2], step.slice(3)] : [null, null];
    if (!inner) return { error: `${name} runs \`${step.join(" ")}\`, which needs npm` };
    const r = resolveScript(scripts, inner, rest[0] === "--" ? rest.slice(1) : rest, depth + 1);
    if (r.error) return r;
    steps.push(r.command);
  }
  const command = steps.join(" && ");
  return { command: args.length ? `${command} ${args.map(quote).join(" ")}` : command };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const [mode, first, ...rest] = process.argv.slice(2);
  let command;
  if (mode === "--sh" && first) command = first;
  else if (mode === "--script" && first) {
    const r = resolveScript(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts, first, rest);
    if (r.error) { console.error(`portable-run: ${r.error}`); process.exit(2); }
    command = r.command;
  } else { console.error("usage: portable-run.mjs --script NAME [ARGS...] | --sh COMMAND"); process.exit(2); }
  console.error(`portable-run: ${command}`);
  const child = spawn("sh", ["-c", command], { cwd: root, env: portableEnv(process.env, root), stdio: "inherit" });
  for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(sig, () => child.kill(sig));
  child.on("exit", (code, signal) => process.exit(code ?? 128 + ({ SIGTERM: 15, SIGINT: 2, SIGHUP: 1, SIGKILL: 9 }[signal] ?? 1)));
}
