// LS-1 1b R3 F4 sensitivity: each work regression must fail the bounded-work test; the
// baseline must pass. Mutates the compiled .test-build only, restoring it after each run.
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process";
const root = path.resolve(".test-build"), out = process.argv[2], summary = [];
const LOOKUP = "return (p) => byCell.get(cellKey(Math.floor(p.x / CHART_CELL), Math.floor(p.z / CHART_CELL))) ?? none;";
const STEP = "hostPowered: hostPowerAnswers(s, hosts)";
const PER_CROP = "hostPowered: (hostId) => { const h = hosts.find((x) => x.id === hostId); return !!h && hostPower(h, s); }";
const LINEAR = "return (p) => points.filter(([, q]) => Math.floor(p.x / CHART_CELL) >= Math.floor((q.x - SITE_CACHE_REACH) / CHART_CELL) && Math.floor(p.x / CHART_CELL) <= Math.floor((q.x + SITE_CACHE_REACH) / CHART_CELL) && Math.floor(p.z / CHART_CELL) >= Math.floor((q.z - SITE_CACHE_REACH) / CHART_CELL) && Math.floor(p.z / CHART_CELL) <= Math.floor((q.z + SITE_CACHE_REACH) / CHART_CELL)).map(([id]) => id);";
const SCAN = "return () => points.map(([id]) => id);"; // discovery checks every cache again
// A harmless rewrite of the distance predicate (more coordinate reads, still constant work): must pass.
const HYPOT = "Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)";
const SQRT = "Math.sqrt((p.x - q.x) * (p.x - q.x) + (p.y - q.y) * (p.y - q.y) + (p.z - q.z) * (p.z - q.z))";
const runs = {
  baseline: [],
  "harmless-distance-refactor": [["src/sim/systems/siteCaches.js", HYPOT, SQRT]],
  "all-cache-scan": [["src/sim/systems/siteCaches.js", LOOKUP, SCAN]],
  "linear-index-lookup": [["src/sim/systems/siteCaches.js", LOOKUP, LINEAR]],
  "per-crop-power": [["src/sim/systemsLink.js", STEP, PER_CROP]],
  "both-production-regressions": [["src/sim/systems/siteCaches.js", LOOKUP, SCAN], ["src/sim/systemsLink.js", STEP, PER_CROP]],
};
const PASSES = new Set(["baseline", "harmless-distance-refactor"]);
for (const [label, changes] of Object.entries(runs)) {
  const originals = [];
  try {
    for (const [file, from, to] of changes) {
      const p = path.join(root, file), text = fs.readFileSync(p, "utf8");
      if (text.split(from).length !== 2) throw new Error(`${label}: ${from} is not unique in ${file}`);
      originals.push([p, text]); fs.writeFileSync(p, text.replace(from, to));
    }
    const r = spawnSync(process.execPath, ["--test", "--test-name-pattern", "R3 F4", path.join(root, "tests/ls1-rewards.test.js")], { encoding: "utf8" });
    fs.writeFileSync(path.join(out, `mutation-${label}.log`), (r.stdout ?? "") + (r.stderr ?? ""));
    const failed = /ℹ fail [1-9]/.test(r.stdout ?? ""), ran = /ℹ pass (\d+)/.exec(r.stdout ?? "");
    summary.push({ label, exit: r.status, failed, expected: PASSES.has(label) ? "pass" : "fail", ok: PASSES.has(label) ? r.status === 0 && !failed && !!ran && ran[1] !== "0" : r.status !== 0 && failed });
  } finally { for (const [p, text] of originals) fs.writeFileSync(p, text); }
}
fs.writeFileSync(path.join(out, "mutation-results.json"), JSON.stringify(summary, null, 2));
for (const x of summary) console.log("MUTATION", x.label, x.expected, x.ok ? "ok" : "WRONG");
process.exitCode = summary.every((x) => x.ok) ? 0 : 1;
