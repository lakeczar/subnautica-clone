/** The playthrough scenarios: both fleet strategies from New Game, and the adverse
 * runs. Branching scenarios load a milestone save of the run they branch from and
 * report that run's phases up to the branch as shared. */
import { isOptional } from "../../src/content/story/evidence.js";
import type { DiscoveryId } from "../../src/content/story/evidence.js";
import { regionAtPoint } from "../../src/content/regions/layout.js";
import { creelLoss } from "./adverse.js";
import { Driver } from "./driver.js";
import { DAMAGED_HULL_PERCENT, GEAR_REGION } from "./kinds.js";
import { airReturn, depleted, lostAndSurfaced, lowAir, overGeared, powerRecovery, tourFit } from "./libraryplay.js";
import { CARRIER_LATER, CREEL_LATER } from "./later.js";
import { LIVE_PHASES, REFITS_PHASE } from "./live.js";
import type { Phase, PlayOptions } from "./live.js";
import { loadSnapshot, SaveSlot } from "./persistence.js";
import { runPhases } from "./runner.js";
import type { PacingTimelines } from "./pacing.js";
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
  /** Mid-phase saves (SAVE-1): the first tick each condition holds, the state is captured. */
  captures?: readonly Capture[];
  /** LS-1: one of the four runs the pacing acceptance judges (both strategies, with
   * and without optional rewards). */
  pacing?: boolean;
}
export interface Capture { label: string; when: (d: Driver) => boolean }

const inGearRegion = (d: Driver): boolean => d.state.tick % 30 === 0 &&
  regionAtPoint(d.state.player.pose.position.x, d.state.player.pose.position.z) === GEAR_REGION;

const MAIN: PlayOptions = { readOptional: true, reverse: false, decodes: true };
/** LS-1: no optional log, no decode, no cache: the main path on its own. */
const BARE: PlayOptions = { readOptional: false, reverse: false, decodes: false };
const noOptionalRead = (run: RunRecord) => {
  const optional = run.discoveries.filter((x) => isOptional(x.id as DiscoveryId)).map((x) => x.id);
  return { name: "no optional log read", ok: optional.length === 0, detail: optional.join(", ") || "none" };
};
const order = (run: RunRecord, a: string, b: string): boolean => {
  const i = run.discoveries.findIndex((x) => x.id === a), j = run.discoveries.findIndex((x) => x.id === b);
  return i >= 0 && j >= 0 && i < j;
};

export const SCENARIOS: readonly Scenario[] = [
  {
    id: "creel", strategy: "creel", description: "Creel route: the Creel with restored service stops",
    phases: [...LIVE_PHASES, ...CREEL_LATER], options: MAIN, pacing: true,
    captures: [{ label: "canopy-entry", when: inGearRegion }],
  },
  {
    id: "carrier", strategy: "carrier", description: "Carrier route: the Hearthline carrying a Mantle",
    from: { scenario: "creel", milestone: "refits" },
    phases: CARRIER_LATER, options: MAIN, pacing: true,
  },
  {
    id: "creel-loss", strategy: "creel", description: "Adverse: lose the Creel at a deep site, recover it with Bobbin, carry on",
    from: { scenario: "creel", milestone: "basin-frames" },
    phases: [creelLoss, REFITS_PHASE, ...CREEL_LATER], options: MAIN,
    check: (run) => [{ name: "a rescue was recorded", ok: run.checks.some((c) => c.name === "Bobbin tow home"), detail: "" }],
    captures: [
      { label: "hull-damaged", when: (d) => { const v = d.vehicle("creel"); return !!v && !v.disabled && v.health <= DAMAGED_HULL_PERCENT && d.state.player.controlledVehicleId === v.id; } },
      { label: "craft-lost", when: lostAndSurfaced },
    ],
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
    id: "no-optional", strategy: "creel", description: "Adverse: every optional log skipped and no decode started (LS-1: decode-free)",
    phases: [...LIVE_PHASES, ...CREEL_LATER], options: BARE, pacing: true,
    check: (run) => [noOptionalRead(run)],
  },
  {
    id: "no-optional-carrier", strategy: "carrier", description: "Adverse: the carrier route with no optional log and no decode (LS-1: decode-free)",
    from: { scenario: "no-optional", milestone: "refits" },
    phases: CARRIER_LATER, options: BARE, pacing: true,
    check: (run) => [noOptionalRead(run)],
  },
  // SAVE-1's library scenarios: short branches that earn its adverse, gear and tour kinds.
  {
    id: "low-air", strategy: "creel", description: "Adverse: the diver overstays on suit air at the reef, then surfaces",
    from: { scenario: "creel", milestone: "reef" }, phases: [lowAir, airReturn], options: MAIN,
  },
  {
    id: "tour", strategy: "creel", description: "The tour Dart fitted for range, flown until its battery dies (TST-23), home on its cells",
    from: { scenario: "creel", milestone: "deep-records" }, phases: [tourFit, depleted, powerRecovery], options: MAIN,
  },
  {
    id: "over-geared", strategy: "creel", description: "Late gear in an early region: the 800 m Creel back to the Canopy",
    from: { scenario: "creel", milestone: "deep-records" }, phases: [overGeared], options: MAIN,
    captures: [{ label: "canopy-entry", when: inGearRegion }],
  },
];

export interface PlayHooks {
  /** LS-1: the play timeline of each run, and the pacing acceptance on `pacing` scenarios. */
  pacing?: PacingTimelines | undefined;
  /** Receives every save a scenario itself made (milestones and captures), as written. */
  sink?: ((scenario: string, label: string, text: string) => void) | undefined;
  /** Branch start from the shared save library instead of replaying the parent (TST-21). */
  fromLibrary?: ((scenario: string, milestone: string) => { text: string; commands: number; detail: string }) | undefined;
}

/** Play the selected scenarios in order; branches reuse their parent's saves, or,
 * with `fromLibrary`, load the parent's milestone from the save library when the
 * parent itself is not requested. */
export async function playScenarios(ids: readonly string[], verbose: boolean, hooks: PlayHooks = {}): Promise<RunRecord[]> {
  const runs = new Map<string, { run: RunRecord; slot: SaveSlot }>();
  const out: RunRecord[] = [];
  const wanted = SCENARIOS.filter((s) => ids.includes(s.id));
  const library = (s: Scenario): boolean => !!s.from && !!hooks.fromLibrary && !ids.includes(s.from.scenario);
  // Parents first, so a branch always finds its milestone.
  const needed = new Set(wanted.flatMap((s) => s.from && !library(s) ? [s.from.scenario, s.id] : [s.id]));
  for (const scenario of SCENARIOS.filter((s) => needed.has(s.id))) {
    if (verbose) console.log(`\n${scenario.id}: ${scenario.description}`);
    const slot = new SaveSlot(scenario.id);
    let d: Driver;
    if (scenario.from && library(scenario)) {
      const from = scenario.from;
      try {
        const got = hooks.fromLibrary!(from.scenario, from.milestone);
        hooks.pacing?.noHistory(scenario.id);
        d = new Driver(scenario.id, scenario.strategy, loadSnapshot(got.text), got.commands);
        d.run.checks.push({ name: `branch save ${from.scenario}@${from.milestone} from the save library`, ok: true, detail: got.detail });
      } catch (e) {
        d = new Driver(scenario.id, scenario.strategy);
        d.run.checks.push({ name: `branch save ${from.scenario}@${from.milestone} from the save library`, ok: false, detail: e instanceof Error ? e.message : String(e) });
        d.run.outcome = "blocked";
        runs.set(scenario.id, { run: d.run, slot });
        out.push(d.run);
        continue;
      }
    } else if (scenario.from) {
      const parent = runs.get(scenario.from.scenario)!;
      hooks.pacing?.branch(scenario.id, scenario.from.scenario, scenario.from.milestone);
      const text = parent.slot.snapshots.get(scenario.from.milestone);
      const at = parent.run.saves.find((r) => r.label === scenario.from!.milestone && !r.capture);
      d = new Driver(scenario.id, scenario.strategy, text ? loadSnapshot(text) : undefined, at?.commands ?? 0);
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
    for (const c of scenario.captures ?? []) {
      let done = false;
      d.watchers.push((x) => { if (!done && c.when(x)) { done = true; slot.capture(x, c.label); } });
    }
    // A parent played only for its branches stops at the last milestone they need,
    // so a branch can run on its own inside one short job. Requested scenarios play in full.
    const until = ids.includes(scenario.id) ? -1 : Math.max(...wanted.filter((w) => w.from?.scenario === scenario.id)
      .map((w) => scenario.phases.findIndex((p) => p.id === w.from!.milestone)));
    const run = await runPhases(d, until >= 0 ? scenario.phases.slice(0, until + 1) : scenario.phases, { ...scenario.options, verbose }, slot);
    for (const c of scenario.check?.(run) ?? []) run.checks.push(c);
    // LS-1: a decode-free run ends with nothing decoding or decoded.
    if (scenario.options.decodes === false)
      run.checks.push({ name: "decode-free: no decode running or done", ok: d.state.systems.decodes.length === 0 && d.state.systems.decoded.length === 0,
        detail: [...d.state.systems.decodes.map((j) => j.decodable), ...d.state.systems.decoded].join(", ") || "none" });
    if (scenario.pacing && hooks.pacing && ids.includes(scenario.id)) run.checks.push(hooks.pacing.accept(run));
    run.checks.push({ name: "every milestone reload matched", ok: run.saves.every((s) => s.equal), detail: `${run.saves.length} saves` });
    for (const c of scenario.captures ?? [])
      if (!slot.snapshots.has(c.label) && run.outcome === "complete")
        run.checks.push({ name: `capture ${c.label} taken`, ok: false, detail: "its condition never held" });
    if (ids.includes(scenario.id)) for (const [label, text] of slot.snapshots) hooks.sink?.(scenario.id, label, text);
    runs.set(scenario.id, { run, slot });
    if (ids.includes(scenario.id)) out.push(run);
  }
  return out;
}
