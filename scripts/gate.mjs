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
//
// Local steps (fast, build, economy) run directly only where the local-run guard
// (scripts/local-guard.mjs, STEW-2) admits CPU work: inside a heavy-check job, on
// alickers, or with its logged override. On factory-worker they go to the queue as
// one `--machine any` job (`gate.mjs --batch`, so the economy scripts read that
// job's own .test-build), and each step is reported from that job's per-step results
// and judged on its receipt like any queued step. Queued steps that a batched step
// follows (the bake before the build) run first.
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { admission, localFacts } from "./local-guard.mjs";

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
/** The queued job that runs the local steps where they aren't admitted (factory-worker). */
export const BATCH_QUEUE = ["--class", "standard", "--machine", "any"];
const BATCH_LINE = "gate-batch: ";

/** `--machine` replaces a queued job's own machine tag. */
export function queueOptions(queue, machineOverride = null) {
  if (!machineOverride) return queue;
  const out = [];
  for (let i = 0; i < queue.length; i++) { if (queue[i] === "--machine") { i++; continue; } out.push(queue[i]); }
  return [...out, "--machine", machineOverride];
}
let machineOverride = null;
const command = (s) => s.queue ? [H, "submit", ...queueOptions(s.queue, machineOverride), "--review", "--", ...s.run] : s.run;
const batchCommand = (ids, extra = []) => [H, "submit", ...queueOptions(BATCH_QUEUE, machineOverride), "--review", "--",
  "node", "scripts/gate.mjs", "--batch", ids.join(","), ...extra];

/**
 * The order the gate runs `steps` in, given whether the local steps from `from` on
 * go to the queue as one batch. Returns units: { step } or { batch: [steps] }. A
 * queued step that comes before a batched local step runs before the batch (the
 * bake, which the build expects to find current).
 */
export function routeSteps(steps, batched) {
  if (!batched) return steps.map((step) => ({ step }));
  const lastLocal = steps.findLastIndex((s) => !s.queue);
  if (lastLocal < 0) return steps.map((step) => ({ step }));
  const head = steps.slice(0, lastLocal + 1);
  return [...head.filter((s) => s.queue).map((step) => ({ step })), { batch: head.filter((s) => !s.queue) },
    ...steps.slice(lastLocal + 1).map((step) => ({ step }))];
}

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

/**
 * Each batched step's result: its own verdict from the job's `gate-batch:` line
 * (`inner`, null when the job printed none), plus every problem with the job's
 * receipt. The job exits 1 exactly when one of its steps failed, so that exit is
 * the steps' own verdict, not another problem.
 */
export function batchResults(ids, inner, receipt, commit) {
  const problems = receiptProblems(receipt, commit);
  if (!Array.isArray(inner)) return ids.map((id) => ({ id, problems: ["the queued job reported no per-step results", ...problems], s: 0 }));
  const own = inner.some((r) => r.problems?.length) ? 1 : 0;
  const shared = problems.filter((p) => !(receipt?.code === own && p.startsWith(`exit ${own}`)));
  return ids.map((id) => {
    const r = inner.find((x) => x.id === id);
    return r ? { id, problems: [...(r.problems ?? []), ...shared], s: r.s ?? 0 } : { id, problems: ["the queued job didn't run this step", ...shared], s: 0 };
  });
}

/** The per-step results a batch job printed, or null. */
export function parseBatch(lines) {
  const line = lines.findLast((l) => l.startsWith(BATCH_LINE));
  try { return line ? JSON.parse(line.slice(BATCH_LINE.length)) : null; } catch { return null; }
}

const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" }).stdout.trim();

/** Submits `argv` (`heavy-check submit …`) and waits for its receipt; the job's last lines are printed as it ends. */
function submitAndWait(argv, label) {
  const sub = spawnSync(argv[0], argv.slice(1), { cwd: root, encoding: "utf8" });
  const ticket = (sub.stdout ?? "").trim().split("\n").at(-1) ?? "";
  if (sub.status !== 0 || !/^\d{6}-\d{6}-[a-z0-9]{4}$/.test(ticket))
    return { failure: [`submit failed (exit ${sub.status}): ${(sub.stderr || sub.stdout || "").trim().slice(0, 400)}`], lines: [] };
  console.log(`gate: ${label} queued as ${ticket} (whole output: ${H} log ${ticket})`);
  const w = spawnSync(H, ["wait", ticket, "--json"], { cwd: root, encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
  const lines = (w.stdout ?? "").trimEnd().split("\n");
  let receipt = null;
  try { receipt = JSON.parse(lines.at(-1) ?? ""); lines.pop(); } catch { /* reported by receiptProblems */ }
  process.stdout.write(`${lines.join("\n")}\n`);
  if (w.stderr) process.stderr.write(w.stderr);
  // The waiter itself must finish cleanly too: a good receipt from a waiter that then
  // failed or was killed is no result.
  const waiter = w.error ? [`the queue waiter failed: ${w.error.message}`] : w.signal ? [`the queue waiter was killed (${w.signal})`]
    : w.status !== 0 && !(receipt && !receipt.pending && w.status === receipt.code) ? [`the queue waiter exited ${w.status}`] : [];
  return { receipt, lines, waiter };
}

/** Runs a local step here. */
function local(step) {
  const r = spawnSync(step.run[0], step.run.slice(1), { cwd: root, stdio: "inherit" });
  return r.status === 0 ? [] : [r.error ? `error: ${r.error.message}` : r.signal ? `signal ${r.signal}` : `exit ${r.status}`];
}

/** Inside the batch job: these local steps, then their results as one line. */
function runBatch(ids, allowDirty) {
  const steps = ids.map((id) => GATE.find((s) => s.id === id));
  const bad = ids.filter((id, i) => !steps[i] || steps[i].queue);
  if (bad.length) { console.error(`gate: --batch takes local steps only: ${bad.join(", ")}`); process.exit(2); }
  const dirty = git("status", "--porcelain", "--untracked-files=no");
  if (dirty && !allowDirty) { console.error(`gate: the tree has uncommitted changes\n${dirty}`); process.exit(2); }
  const results = [];
  // The economy scripts read .test-build, which only the fast step compiles here.
  let setup = [];
  if (!ids.includes("fast") && ids.some((id) => id.startsWith("economy:"))) {
    console.log("\n── gate: compiling .test-build for the economy steps\n$ node scripts/test-build.mjs");
    setup = local({ run: ["node", "scripts/test-build.mjs"] }).map((p) => `the test build failed (${p})`);
  }
  for (const step of steps) {
    console.log(`\n── gate: ${step.id} · ${step.what}\n$ ${step.run.join(" ")}`);
    const t0 = Date.now();
    const problems = setup.length && step.id.startsWith("economy:") ? setup : local(step);
    results.push({ id: step.id, problems, s: Math.round((Date.now() - t0) / 1000) });
  }
  console.log("");
  for (const r of results) console.log(`  ${r.problems.length ? "FAIL" : "pass"}  ${r.id.padEnd(20)} ${String(r.s).padStart(5)} s${r.problems.length ? `  ${r.problems.join("; ")}` : ""}`);
  console.log(`${BATCH_LINE}${JSON.stringify(results)}`);
  process.exit(results.some((r) => r.problems.length) ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  if (args.includes("--batch")) runBatch(value("--batch")?.split(",").filter(Boolean) ?? [], args.includes("--allow-dirty"));
  machineOverride = value("--machine") ?? null;
  if (machineOverride && !["any", "3090", "4070", "soak"].includes(machineOverride)) { console.error(`gate: --machine ${machineOverride}: one of any, 3090, 4070`); process.exit(2); }
  if (args.includes("--list")) {
    for (const s of GATE) console.log(`${s.id.padEnd(20)} ${s.what}\n${"".padEnd(20)} $ ${command(s).join(" ")}`);
    console.log(`\nlocal steps, on factory-worker (anywhere the local-run guard doesn't admit them), all in one job:\n${"".padEnd(20)} $ ${batchCommand(["ID", "…"]).join(" ")}`);
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
  const record = (id, problems, s) => {
    if (tree() !== start) problems.push("the tree or HEAD changed while this step ran: the gate's results are void");
    results.push({ id, problems, s });
  };
  const queuedStep = (step) => {
    console.log(`\n── gate: ${step.id} · ${step.what}\n$ ${command(step).join(" ")}`);
    const t0 = Date.now(), r = submitAndWait(command(step), step.id);
    record(step.id, r.failure ?? [...r.waiter, ...receiptProblems(r.receipt, head)], Math.round((Date.now() - t0) / 1000));
  };
  // Admission doesn't change while the gate runs: decided once.
  const here = admission(localFacts());
  for (const unit of routeSteps(steps, !here.admitted)) {
    if (unit.step?.queue) { queuedStep(unit.step); continue; }
    if (unit.step) {
      const step = unit.step;
      console.log(`\n── gate: ${step.id} · ${step.what} (directly: ${here.why})\n$ ${step.run.join(" ")}`);
      const t0 = Date.now();
      record(step.id, local(step), Math.round((Date.now() - t0) / 1000));
      continue;
    }
    const ids = unit.batch.map((s) => s.id), argv = batchCommand(ids, args.includes("--allow-dirty") ? ["--allow-dirty"] : []);
    console.log(`\n── gate: ${ids.join(", ")} · local steps, as one queued job (${here.why})\n$ ${argv.join(" ")}`);
    const t0 = Date.now(), r = submitAndWait(argv, ids.join(","));
    const s = Math.round((Date.now() - t0) / 1000);
    const each = r.failure ? ids.map((id) => ({ id, problems: r.failure, s: 0 })) : batchResults(ids, parseBatch(r.lines), r.receipt, head)
      .map((x) => ({ ...x, problems: [...r.waiter, ...x.problems] }));
    for (const x of each) record(x.id, x.problems, x.s || (ids.length === 1 ? s : 0));
  }
  results.sort((a, b) => GATE.findIndex((s) => s.id === a.id) - GATE.findIndex((s) => s.id === b.id));
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
