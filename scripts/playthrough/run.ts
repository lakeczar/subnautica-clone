/** npm run playthrough [-- --scenario creel,carrier,...] [--json out.json] [--quiet]
 * Plays the scenarios through real simulation commands and prints the timeline.
 * Exit 0 when nothing is blocked and every check holds (pending C3 phases are
 * expected today); exit 1 on a blocker or a failed check. No Babylon. */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RunRecord } from "./timeline.js";
import { loadCampaign } from "./content.js";
import { formatRun } from "./report.js";
import { playScenarios, SCENARIOS } from "./scenarios.js";

const args = process.argv.slice(2);
const value = (flag: string): string | undefined => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const ids = (value("--scenario")?.split(",") ?? SCENARIOS.map((s) => s.id));
for (const id of ids) if (!SCENARIOS.some((s) => s.id === id)) { console.error(`unknown scenario ${id}; known: ${SCENARIOS.map((s) => s.id).join(", ")}`); process.exit(2); }
const quiet = args.includes("--quiet");

await loadCampaign();
// --jobs N: independent New Game groups (a root and the scenarios branching from it)
// run in separate processes. Light work: no Babylon, a few hundred MiB each.
const jobs = Math.max(1, Number(value("--jobs") ?? 1));
const runs = jobs > 1 ? await parallel(ids, jobs) : await playScenarios(ids, !quiet);
console.log("");
for (const run of runs) console.log(formatRun(run) + "\n");
const json = value("--json");
if (json) fs.writeFileSync(json, JSON.stringify({ generated: new Date().toISOString(), runs }, null, 2) + "\n");
const bad = runs.filter((r) => r.outcome === "blocked" || r.checks.some((c) => !c.ok));
console.log(bad.length ? `BLOCKED or failed: ${bad.map((r) => r.scenario).join(", ")}` :
  `No blockers. ${runs.filter((r) => r.outcome === "pending-c3").length} of ${runs.length} scenarios wait on C3 content.`);
process.exit(bad.length ? 1 : 0);

async function parallel(selected: readonly string[], limit: number): Promise<RunRecord[]> {
  const root = (id: string): string => SCENARIOS.find((s) => s.id === id)!.from?.scenario ?? id;
  const groups = [...new Set(selected.map(root))].map((r) => selected.filter((id) => root(id) === r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "siltwake-playthrough-"));
  const self = fileURLToPath(import.meta.url);
  const results: RunRecord[][] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < groups.length) {
      const i = next++, out = path.join(dir, `${i}.json`);
      await new Promise<void>((resolve) => spawn(process.execPath, [self, "--scenario", groups[i]!.join(","), "--json", out, "--quiet"],
        { stdio: ["ignore", "ignore", "inherit"] }).on("exit", () => resolve()));
      results[i] = fs.existsSync(out) ? (JSON.parse(fs.readFileSync(out, "utf8")) as { runs: RunRecord[] }).runs : [];
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, groups.length) }, worker));
  fs.rmSync(dir, { recursive: true, force: true });
  const all = results.flat();
  return selected.map((id) => all.find((r) => r.scenario === id)!).filter(Boolean);
}
