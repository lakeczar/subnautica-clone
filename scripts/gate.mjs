#!/usr/bin/env node
// The merge gate (STEW-1, F28): `npm run gate`. GATE below *is* the gate. Nothing
// else is: no handoff, memory or brief keeps its own list, and "all five economy
// scripts" means nothing. Run it on root after each merge, from a clean checkout.
//
//   npm run gate                 every step, in order; exit 1 if any failed
//   npm run gate -- --list       print the manifest
//   npm run gate -- --only ID,…  just these steps (a partial gate, labelled so)
//   npm run gate -- --no-playthrough   everything but the queued playthrough
//   npm run gate -- --allow-dirty      run on uncommitted changes (never a pass)
//   npm run gate -- --machine 4070     send every queued step to that machine (for example
//                                      while the 3090 is booked; receipts must still bind)
//
// The gate pins the commit it starts on. Steps run one after another and the gate
// reports every one, so a failure early doesn't hide the rest. A queued step (heavy
// work) is submitted to the queue with `--review` and judged on its structured
// receipt (`wait --json`), never on an exit code alone: it must have exited 0 with
// no stop reason, not be DISTURBED, and be evidence bound to the pinned commit. The
// tree must not change while the gate runs. After the gate, POST_MERGE lists what the
// coordinator runs once the merge is pushed.
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const H = process.env.SILTWAKE_HEAVY_CHECK ?? "/home/worker/.t3/projects/subnautica-clone/scripts/heavy-check.sh";

/** Each economy script, and why it is a current invariant (not a historical receipt). */
const ECONOMY = [
  ["campaign", "check-campaign-economy.mjs", "both fleet strategies' finite-stock ledger from the composed planner, and real refit commands"],
  ["m1", "check-m1-economy.mjs", "the opening is solvent from starter stock, played through real transactions (its adoption receipt is retired)"],
  ["m2-a", "check-m2-a-economy.mjs", "the 350 m suit and trim are payable from predecessor patches; the Basin is reachable"],
  ["m2-b1", "check-m2-b1-economy.mjs", "the Creel's runtime economy: prices, yields and capacities through real commands"],
  ["progression", "check-progression-curve.mjs", "the implemented acquisition curve is solvent with zero renewal"],
  ["upgrade", "upgrade-economy.mjs", "every upgrade is payable from ordinary sources at its tier, nothing cave-only"],
];

/** A step runs `run` here, or, with `queue`, is submitted as `heavy-check submit <queue> --review -- <run>`. */
export const GATE = [
  { id: "fast", what: "fast tier: unit, simulation and save tests, the architecture guard and the headless typecheck", run: ["npm", "run", "test:fast"] },
  // A cold terrain bake is heavy work, so it goes through the queue (it restores from the
  // shared store when nothing changed); the build's own bake then finds it current.
  { id: "bake", what: "terrain bake, queued (restored from the shared store when its sources are unchanged)", queue: ["--class", "bake"], run: ["node", "scripts/bake-terrain.mjs"] },
  { id: "build", what: "typecheck and production build", run: ["npm", "run", "build"] },
  // The fast tier compiles .test-build, which these read.
  ...ECONOMY.map(([id, file, why]) => ({ id: `economy:${id}`, what: why, run: ["node", `scripts/${file}`] })),
  { id: "playthrough", what: "every playthrough scenario, both fleet routes included (queued, any machine)",
    queue: ["--class", "playthrough", "--machine", "any"], run: ["npm", "run", "playthrough", "--", "--jobs", "3", "--quiet"] },
];
/** After the merge is pushed, not part of pass/fail. */
export const POST_MERGE = [
  { id: "saves-export", what: "export the shared save library at the merged commit (SAVE-1)", run: ["scripts/saves-export.sh"] },
];
/** `--machine` replaces each queued step's own machine tag. */
let machineOverride = null;
const queueOptions = (s) => {
  if (!machineOverride) return s.queue;
  const out = [];
  for (let i = 0; i < s.queue.length; i++) { if (s.queue[i] === "--machine") { i++; continue; } out.push(s.queue[i]); }
  return [...out, "--machine", machineOverride];
};
const command = (s) => s.queue ? [H, "submit", ...queueOptions(s), "--review", "--", ...s.run] : s.run;

/** Why a queued step's terminal receipt can't count for the gate at `commit` (empty: it counts). */
export function receiptProblems(receipt, commit) {
  if (!receipt || typeof receipt !== "object") return ["no structured result from the queue"];
  if (receipt.pending) return ["still pending: the queue gave no terminal result"];
  const problems = [];
  if (receipt.code !== 0) problems.push(`exit ${receipt.code}${receipt.label ? ` (${receipt.label})` : ""}`);
  if (receipt.stopReason) problems.push(`stopped: ${receipt.stopReason}`);
  if (receipt.context?.disturbed) problems.push("DISTURBED: the machine was busy beyond the job's share");
  if (!receipt.evidence?.bound) problems.push(`not evidence for a commit${receipt.evidence?.why ? `: ${receipt.evidence.why}` : ""}`);
  else if (receipt.evidence.commit !== commit) problems.push(`tested ${String(receipt.evidence.commit).slice(0, 12)}, not the gate's ${commit.slice(0, 12)}`);
  return problems;
}

const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" }).stdout.trim();

/** Submit a queued step and wait for its receipt; the job's output is printed as it ends. */
function queued(step, head) {
  const argv = command(step), sub = spawnSync(argv[0], argv.slice(1), { cwd: root, encoding: "utf8" });
  const ticket = (sub.stdout ?? "").trim().split("\n").at(-1) ?? "";
  if (sub.status !== 0 || !/^\d{6}-\d{6}-[a-z0-9]{4}$/.test(ticket))
    return [`submit failed (exit ${sub.status}): ${(sub.stderr || sub.stdout || "").trim().slice(0, 400)}`];
  console.log(`gate: ${step.id} queued as ${ticket}`);
  const w = spawnSync(H, ["wait", ticket, "--json"], { cwd: root, encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
  const lines = (w.stdout ?? "").trimEnd().split("\n");
  let receipt = null;
  try { receipt = JSON.parse(lines.at(-1) ?? ""); lines.pop(); } catch { /* reported by receiptProblems */ }
  process.stdout.write(`${lines.join("\n")}\n`);
  if (w.stderr) process.stderr.write(w.stderr);
  // The waiter itself must finish cleanly too: a good receipt from a waiter that then
  // failed or was killed is no result.
  const waiter = w.error ? [`the queue waiter failed: ${w.error.message}`] : w.signal ? [`the queue waiter was killed (${w.signal})`]
    : w.status !== 0 ? [`the queue waiter exited ${w.status}`] : [];
  return [...waiter, ...receiptProblems(receipt, head)];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  machineOverride = value("--machine") ?? null;
  if (machineOverride && !["any", "3090", "4070", "soak"].includes(machineOverride)) { console.error(`gate: --machine ${machineOverride}: one of any, 3090, 4070`); process.exit(2); }
  if (args.includes("--list")) {
    for (const s of GATE) console.log(`${s.id.padEnd(20)} ${s.what}\n${"".padEnd(20)} $ ${command(s).join(" ")}`);
    console.log("\nafter the merge is pushed:");
    for (const s of POST_MERGE) console.log(`${s.id.padEnd(20)} ${s.what}\n${"".padEnd(20)} $ ${s.run.join(" ")}`);
    process.exit(0);
  }
  const only = value("--only")?.split(",");
  for (const id of only ?? []) if (!GATE.some((s) => s.id === id)) { console.error(`gate: no step ${id}; see --list`); process.exit(2); }
  const steps = GATE.filter((s) => (!only || only.includes(s.id)) && !(args.includes("--no-playthrough") && s.id === "playthrough"));
  const head = git("rev-parse", "HEAD"), dirty = git("status", "--porcelain", "--untracked-files=no");
  const tree = () => `${git("rev-parse", "HEAD")}\n${git("status", "--porcelain", "--untracked-files=no")}`, start = tree();
  if (dirty && !args.includes("--allow-dirty")) {
    console.error(`gate: the tree has uncommitted changes; commit first (or --allow-dirty, which never passes)\n${dirty}`);
    process.exit(2);
  }
  const results = [];
  for (const step of steps) {
    console.log(`\n── gate: ${step.id} · ${step.what}\n$ ${command(step).join(" ")}`);
    const t0 = Date.now();
    let problems;
    if (step.queue) problems = queued(step, head);
    else {
      const r = spawnSync(step.run[0], step.run.slice(1), { cwd: root, stdio: "inherit" });
      problems = r.status === 0 ? [] : [r.error ? `error: ${r.error.message}` : r.signal ? `signal ${r.signal}` : `exit ${r.status}`];
    }
    if (tree() !== start) problems.push("the tree or HEAD changed while this step ran: the gate's results are void");
    results.push({ id: step.id, problems, s: Math.round((Date.now() - t0) / 1000) });
  }
  console.log(`\ngate at ${head.slice(0, 12)}${dirty ? " (dirty: not evidence)" : ""}:`);
  for (const r of results) console.log(`  ${r.problems.length ? "FAIL" : "pass"}  ${r.id.padEnd(20)} ${String(r.s).padStart(5)} s${r.problems.length ? `  ${r.problems.join("; ")}` : ""}`);
  const skipped = GATE.filter((s) => !steps.includes(s));
  if (skipped.length) console.log(`  not run: ${skipped.map((s) => s.id).join(", ")}: this is a partial gate`);
  const failed = results.filter((r) => r.problems.length);
  console.log(failed.length ? `gate FAILED: ${failed.map((r) => r.id).join(", ")}`
    : dirty ? "gate FAILED: it ran on uncommitted changes, so nothing here is evidence"
    : skipped.length ? `partial gate passed at ${head.slice(0, 12)}` : `gate passed at ${head.slice(0, 12)}`);
  if (!failed.length && !dirty) for (const s of POST_MERGE) console.log(`after pushing the merge: ${s.what}: ${s.run.join(" ")}`);
  process.exit(failed.length || dirty ? 1 : 0);
}
