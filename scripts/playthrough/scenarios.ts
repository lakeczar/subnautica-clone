/** The playthrough scenarios: both fleet strategies from New Game, and the adverse
 * runs. Branching scenarios load a milestone save of the run they branch from and
 * report that run's phases up to the branch as shared. */
import { isOptional } from "../../src/content/story/evidence.js";
import type { DiscoveryId } from "../../src/content/story/evidence.js";
import { creelLoss } from "./adverse.js";
import { Driver } from "./driver.js";
import { CARRIER_LATER, CREEL_LATER } from "./later.js";
import { LIVE_PHASES, REFITS_PHASE } from "./live.js";
import type { Phase, PlayOptions } from "./live.js";
import { loadSnapshot, SaveSlot } from "./persistence.js";
import { runPhases } from "./runner.js";
import type { RunRecord } from "./timeline.js";

export interface Scenario {
  id: string;
  strategy: "creel" | "carrier";
  description: string;
  /** Branch from this scenario's milestone save instead of New Game. */
  from?: { scenario: string; milestone: string };
  phases: readonly Phase[];
  options: PlayOptions;
  check?: (run: RunRecord) => { name: string; ok: boolean; detail: string }[];
}

const MAIN: PlayOptions = { readOptional: true, reverse: false };
const order = (run: RunRecord, a: string, b: string): boolean => {
  const i = run.discoveries.findIndex((x) => x.id === a), j = run.discoveries.findIndex((x) => x.id === b);
  return i >= 0 && j >= 0 && i < j;
};

export const SCENARIOS: readonly Scenario[] = [
  {
    id: "creel", strategy: "creel", description: "Creel route: the Creel with restored service stops",
    phases: [...LIVE_PHASES, ...CREEL_LATER], options: MAIN,
  },
  {
    id: "carrier", strategy: "carrier", description: "Carrier route: the Hearthline carrying a Mantle",
    from: { scenario: "creel", milestone: "refits" },
    phases: CARRIER_LATER, options: MAIN,
  },
  {
    id: "creel-loss", strategy: "creel", description: "Adverse: lose the Creel at a deep site, recover it with Bobbin, carry on",
    from: { scenario: "creel", milestone: "basin-frames" },
    phases: [creelLoss, REFITS_PHASE, ...CREEL_LATER], options: MAIN,
    check: (run) => [{ name: "a rescue was recorded", ok: run.checks.some((c) => c.name === "Bobbin tow home"), detail: "" }],
  },
  {
    id: "reverse", strategy: "creel", description: "Adverse: the story found in reverse order wherever capability allows",
    phases: [...LIVE_PHASES, ...CREEL_LATER], options: { readOptional: true, reverse: true },
    check: (run) => [
      { name: "C03 before C02", ok: order(run, "C03", "C02"), detail: run.discoveries.map((x) => x.id).join(" ") },
      { name: "C06 before C05", ok: order(run, "C06", "C05"), detail: "" },
    ],
  },
  {
    id: "no-optional", strategy: "creel", description: "Adverse: every optional log skipped",
    phases: [...LIVE_PHASES, ...CREEL_LATER], options: { readOptional: false, reverse: false },
    check: (run) => {
      const optional = run.discoveries.filter((x) => isOptional(x.id as DiscoveryId)).map((x) => x.id);
      return [{ name: "no optional log read", ok: optional.length === 0, detail: optional.join(", ") || "none" }];
    },
  },
];

/** Play the selected scenarios in order; branches reuse their parent's saves. */
export async function playScenarios(ids: readonly string[], verbose: boolean): Promise<RunRecord[]> {
  const runs = new Map<string, { run: RunRecord; slot: SaveSlot }>();
  const out: RunRecord[] = [];
  const wanted = SCENARIOS.filter((s) => ids.includes(s.id));
  // Parents first, so a branch always finds its milestone.
  const needed = new Set(wanted.flatMap((s) => s.from ? [s.from.scenario, s.id] : [s.id]));
  for (const scenario of SCENARIOS.filter((s) => needed.has(s.id))) {
    if (verbose) console.log(`\n${scenario.id}: ${scenario.description}`);
    const slot = new SaveSlot(scenario.id);
    let d: Driver;
    if (scenario.from) {
      const parent = runs.get(scenario.from.scenario)!;
      const text = parent.slot.snapshots.get(scenario.from.milestone);
      d = new Driver(scenario.id, scenario.strategy, text ? loadSnapshot(text) : undefined);
      if (!text) d.run.checks.push({ name: `branch save ${scenario.from.scenario}@${scenario.from.milestone}`, ok: false, detail: "milestone not reached" });
      else {
        const shared = parent.run.phases.slice(0, parent.run.phases.findIndex((p) => p.id === scenario.from!.milestone) + 1);
        d.run.phases.push(...shared.map((p) => ({ ...p, title: `${p.title} (shared with ${scenario.from!.scenario})` })));
        d.run.legs.push(...parent.run.legs.filter((l) => shared.some((p) => p.id === l.phase)));
        d.run.discoveries.push(...parent.run.discoveries.filter((r) => shared.some((p) => p.id === r.phase)));
        d.run.saves.push(...parent.run.saves.filter((r) => shared.some((p) => p.id === r.phase)));
      }
      if (!text) { d.run.outcome = "blocked"; runs.set(scenario.id, { run: d.run, slot }); out.push(d.run); continue; }
    } else d = new Driver(scenario.id, scenario.strategy);
    // A parent played only for its branches stops at the last milestone they need,
    // so a branch can run on its own inside one short job. Requested scenarios play in full.
    const until = ids.includes(scenario.id) ? -1 : Math.max(...wanted.filter((w) => w.from?.scenario === scenario.id)
      .map((w) => scenario.phases.findIndex((p) => p.id === w.from!.milestone)));
    const run = await runPhases(d, until >= 0 ? scenario.phases.slice(0, until + 1) : scenario.phases, { ...scenario.options, verbose }, slot);
    for (const c of scenario.check?.(run) ?? []) run.checks.push(c);
    run.checks.push({ name: "every milestone reload matched", ok: run.saves.every((s) => s.equal), detail: `${run.saves.length} saves` });
    runs.set(scenario.id, { run, slot });
    if (ids.includes(scenario.id)) out.push(run);
  }
  return out;
}
