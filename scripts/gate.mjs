#!/usr/bin/env node
// The merge gate (STEW-1, F28): `npm run gate`. GATE below *is* the gate. Nothing
// else is: no handoff, memory or brief keeps its own list, and "all five economy
// scripts" means nothing. Run it on root after each merge, from a clean checkout.
//
//   npm run gate                 every step, in order; exit 1 if any failed
//   npm run gate -- --list       print the manifest
//   npm run gate -- --only ID,…  just these steps (for a focused rerun)
//   npm run gate -- --no-playthrough   everything but the queued playthrough
//
// Steps run one after another and the gate reports every one, so a failure early
// doesn't hide the rest. The playthrough is a heavy job: it goes through the
// queue with `--machine any` (the second worker when it is up). After the gate,
// POST_MERGE lists what the coordinator runs once the merge is pushed.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
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

export const GATE = [
  { id: "fast", what: "fast tier: unit, simulation and save tests, with the architecture guard", run: ["npm", "run", "test:fast"] },
  { id: "build", what: "typecheck, terrain bake and production build", run: ["npm", "run", "build"] },
  // The fast tier compiles .test-build, which these read.
  ...ECONOMY.map(([id, file, why]) => ({ id: `economy:${id}`, what: why, run: ["node", `scripts/${file}`] })),
  { id: "playthrough", what: "every playthrough scenario, both fleet routes included (queued, any machine)",
    run: [H, "--class", "playthrough", "--machine", "any", "--", "npm", "run", "playthrough", "--", "--jobs", "3", "--quiet"] },
];
/** After the merge is pushed, not part of pass/fail. */
export const POST_MERGE = [
  { id: "saves-export", what: "export the shared save library at the merged commit (SAVE-1)", run: ["scripts/saves-export.sh"] },
];

const args = process.argv.slice(2);
const value = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
if (args.includes("--list")) {
  for (const s of GATE) console.log(`${s.id.padEnd(20)} ${s.what}\n${"".padEnd(20)} $ ${s.run.join(" ")}`);
  console.log("\nafter the merge is pushed:");
  for (const s of POST_MERGE) console.log(`${s.id.padEnd(20)} ${s.what}\n${"".padEnd(20)} $ ${s.run.join(" ")}`);
  process.exit(0);
}
const only = value("--only")?.split(",");
for (const id of only ?? []) if (!GATE.some((s) => s.id === id)) { console.error(`gate: no step ${id}; see --list`); process.exit(2); }
const steps = GATE.filter((s) => (!only || only.includes(s.id)) && !(args.includes("--no-playthrough") && s.id === "playthrough"));

const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" }).stdout.trim();
const head = git("rev-parse", "HEAD"), dirty = git("status", "--porcelain", "--untracked-files=no");
if (dirty) console.log(`gate: the tree has uncommitted changes; results are NOT evidence for ${head.slice(0, 12)}\n${dirty}\n`);
const results = [];
for (const step of steps) {
  console.log(`\n── gate: ${step.id} · ${step.what}\n$ ${step.run.join(" ")}`);
  const t0 = Date.now(), r = spawnSync(step.run[0], step.run.slice(1), { cwd: root, stdio: "inherit" });
  results.push({ id: step.id, code: r.status ?? (r.error ? `error: ${r.error.message}` : `signal ${r.signal}`), s: Math.round((Date.now() - t0) / 1000) });
}
console.log(`\ngate at ${head.slice(0, 12)}${dirty ? " (dirty: not evidence)" : ""}:`);
for (const r of results) console.log(`  ${r.code === 0 ? "pass" : "FAIL"}  ${r.id.padEnd(20)} ${String(r.s).padStart(5)} s${r.code === 0 ? "" : `  (exit ${r.code})`}`);
const skipped = GATE.filter((s) => !steps.includes(s));
if (skipped.length) console.log(`  not run: ${skipped.map((s) => s.id).join(", ")}: this is a partial gate`);
const failed = results.filter((r) => r.code !== 0);
console.log(failed.length ? `gate FAILED: ${failed.map((r) => r.id).join(", ")}` : skipped.length ? "partial gate passed" : "gate passed");
if (!failed.length) for (const s of POST_MERGE) console.log(`after pushing the merge: ${s.what}: ${s.run.join(" ")}`);
process.exit(failed.length ? 1 : 0);
