/** SIM-1 differential: every scenario's real command stream through the new
 * in-place step and, side by side, through a base commit's own compiled
 * simulation (its cloning `stepGame` and `executeCommand`, its own module
 * instances and world). States must match at every `--every` ticks, after
 * every command and at every save reload; each step's events must match.
 *
 *   node .test-build/scripts/playthrough/differential.js --base DIR [--scenario a,b] [--every 60] [--json out.json] [--verbose]
 *
 * DIR is a compiled tree of the base commit (its `.test-build`; see
 * `scripts/sim-differential.sh`). Exit 0 only with no mismatch and every
 * scenario played. The scenarios' own checks (milestone reloads and the rest)
 * run as usual, and their results are reported alongside. */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { firstDifference } from "../../src/sim/stateDiff.js";
import type { GameCommand, GameEvent, GameState, WorldQueries } from "../../src/sim/types.js";
import { loadCampaign } from "./content.js";
import { driverHooks } from "./driver.js";
import type { Driver } from "./driver.js";
import { playScenarios, SCENARIOS } from "./scenarios.js";

const args = process.argv.slice(2);
const value = (flag: string): string | undefined => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const base = value("--base");
if (!base) { console.error("usage: differential.js --base DIR [--scenario a,b] [--every N] [--json out.json]"); process.exit(2); }
const ids = value("--scenario")?.split(",") ?? SCENARIOS.map((s) => s.id);
const every = Math.max(1, Number(value("--every") ?? 60));

type Step = (s: GameState, c: readonly GameCommand[], w: WorldQueries) => { state: GameState; events: GameEvent[] };
type Exec = (s: GameState, c: GameCommand, w: WorldQueries) => { state: GameState; events: GameEvent[] };
const load = async <T>(file: string): Promise<T> => await import(pathToFileURL(path.resolve(base, file)).href) as T;
const old = {
  ...await load<{ stepGame: Step; executeCommand: Exec }>("src/sim/step.js"),
  world: (await load<{ gameWorld(): WorldQueries }>("src/sim/world.js")).gameWorld(),
};

interface Tally { scenario: string; ticks: number; commands: number; stateChecks: number; mismatch: string | null }
const tallies: Tally[] = [];
/** Thrown into the scenario: a harness error, never a game Blocked finding. */
class Divergence extends Error { override name = "Divergence"; }

driverHooks.attach = (d: Driver) => {
  const tally: Tally = { scenario: d.run.scenario, ticks: 0, commands: 0, stateChecks: 0, mismatch: null };
  tallies.push(tally);
  // The base simulation's own copy, from the same starting state.
  let shadow = structuredClone(d.state), seen = d.state;
  const fail = (what: string): never => { tally.mismatch ??= what; throw new Divergence(`SIM-1 differential: ${what}`); };
  const compare = (label: string): void => {
    tally.stateChecks++;
    const difference = firstDifference(shadow, d.state);
    if (difference) fail(`${label}: base ≠ new at ${difference}`);
  };
  const events = (label: string, a: readonly GameEvent[], b: readonly GameEvent[]): void => {
    const x = JSON.stringify(a), y = JSON.stringify(b);
    if (x !== y) fail(`${label}: events differ\n  base ${x.slice(0, 400)}\n  new  ${y.slice(0, 400)}`);
  };
  return {
    // Called after the live step: the shadow takes the same step, then they compare.
    tick(_d, controls, live) {
      // A save reload (or any replacement) handed the driver a new object: check the step taken from it.
      const reloaded = d.state !== seen;
      seen = d.state;
      const r = old.stepGame(shadow, controls, old.world);
      shadow = r.state;
      tally.ticks++;
      events(`tick ${d.state.tick}`, r.events, live);
      if (reloaded || d.state.tick % every === 0) compare(`tick ${d.state.tick}${reloaded ? " (first after a reload)" : ""}`);
    },
    command(_d, command, result) {
      // The driver already holds the command's result as its state.
      const r = old.executeCommand(shadow, command, old.world);
      shadow = r.state;
      seen = result.state;
      tally.commands++;
      events(`command ${JSON.stringify(command)} at tick ${d.state.tick}`, r.events, result.events);
      compare(`command ${command.type} at tick ${d.state.tick}`);
    },
  };
};

await loadCampaign();
const t0 = performance.now();
const runs = await playScenarios(ids, args.includes("--verbose"));
const seconds = (performance.now() - t0) / 1000;
for (const t of tallies)
  console.log(`${t.scenario.padEnd(12)} ${String(t.ticks).padStart(9)} ticks  ${String(t.commands).padStart(6)} commands  ` +
    `${String(t.stateChecks).padStart(7)} state checks  ${t.mismatch ? `MISMATCH ${t.mismatch}` : "identical"}`);
const failed = runs.filter((r) => r.outcome === "blocked" || r.checks.some((c) => !c.ok));
for (const r of runs) {
  const blocked = r.phases.filter((p) => p.status === "blocked").map((p) => `${p.id}: ${(p.detail ?? []).join("; ")}`);
  console.log(`${r.scenario}: ${r.outcome}, ${r.ticks} ticks, ${r.saves.length} milestone saves` +
    `${r.saves.every((s) => s.equal) ? " (every reload matched)" : " (A RELOAD DIFFERED)"}${blocked.length ? `\n  ${blocked.join("\n  ")}` : ""}`);
}
const mismatched = tallies.filter((t) => t.mismatch);
const json = value("--json");
if (json) fs.writeFileSync(json, JSON.stringify({ generated: new Date().toISOString(), base, every, seconds, tallies,
  runs: runs.map((r) => ({ scenario: r.scenario, outcome: r.outcome, ticks: r.ticks, saves: r.saves })) }, null, 2) + "\n");
console.log(`${mismatched.length ? `DIVERGED in ${mismatched.map((t) => t.scenario).join(", ")}` : "No divergence"}; ` +
  `${failed.length ? `scenario failures: ${failed.map((r) => r.scenario).join(", ")}` : "every scenario passed"} (${seconds.toFixed(0)} s).`);
process.exit(mismatched.length || failed.length || runs.length !== ids.length ? 1 : 0);
