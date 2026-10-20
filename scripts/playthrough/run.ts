/** npm run playthrough [-- --scenario creel,carrier,...] [--json out.json] [--quiet]
 * Plays the scenarios through real simulation commands and prints the timeline.
 * Exit 0 when nothing is blocked and every check holds (pending C3 phases are
 * expected today); exit 1 on a blocker or a failed check. No Babylon. */
import fs from "node:fs";
import { loadCampaign } from "./content.js";
import { formatRun } from "./report.js";
import { playScenarios, SCENARIOS } from "./scenarios.js";

const args = process.argv.slice(2);
const value = (flag: string): string | undefined => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const ids = (value("--scenario")?.split(",") ?? SCENARIOS.map((s) => s.id));
for (const id of ids) if (!SCENARIOS.some((s) => s.id === id)) { console.error(`unknown scenario ${id}; known: ${SCENARIOS.map((s) => s.id).join(", ")}`); process.exit(2); }
const quiet = args.includes("--quiet");

await loadCampaign();
const runs = await playScenarios(ids, !quiet);
console.log("");
for (const run of runs) console.log(formatRun(run) + "\n");
const json = value("--json");
if (json) fs.writeFileSync(json, JSON.stringify({ generated: new Date().toISOString(), runs }, null, 2) + "\n");
const bad = runs.filter((r) => r.outcome === "blocked" || r.checks.some((c) => !c.ok));
console.log(bad.length ? `BLOCKED or failed: ${bad.map((r) => r.scenario).join(", ")}` :
  `No blockers. ${runs.filter((r) => r.outcome === "pending-c3").length} of ${runs.length} scenarios wait on C3 content.`);
process.exit(bad.length ? 1 : 0);
