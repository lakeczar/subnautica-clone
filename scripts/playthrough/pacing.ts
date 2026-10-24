/** LS-1: the play timeline of every playthrough run, and its pacing acceptance.
 * One recorder per driver, attached through `driverHooks`, fed exactly as the app
 * feeds its own (`observe` after each step, `recordSystemsEvents` for background
 * results), plus the bot's declared wait cause. A branch resumes the recorder from
 * its parent's milestone export, so its timeline carries the shared history. The
 * code under test is the only code used: no comparison build. */
import fs from "node:fs";
import path from "node:path";
import { regionAtPoint } from "../../src/content/regions/layout.js";
import { pacingAcceptance } from "../../src/sim/timeline/acceptance.js";
import { createRecorder, exportTimeline, observe, recordSystemsEvents, resumeRecorder } from "../../src/sim/timeline/recorder.js";
import type { TimelineRecorder } from "../../src/sim/timeline/recorder.js";
import { analyseTimeline, serializeTimeline } from "../../src/sim/timeline/report.js";
import type { TimelineAnalysis, TimelineExport } from "../../src/sim/timeline/report.js";
import type { GameCommand, GameEvent } from "../../src/sim/types.js";
import type { Driver, DriverObserver } from "./driver.js";
import type { RunRecord } from "./timeline.js";
import { PACING_DEBT } from "./pacing-debt.js";
import type { PacingDebt } from "./pacing-debt.js";

const OPTIONS = { regionAt: regionAtPoint };
/** Fixed, so two runs of the same build give the same timeline. */
const STARTED = "2026-10-24T00:00:00.000Z";
const systemsOf = (events: readonly GameEvent[]) => events.flatMap((e) => e.type === "systems" ? [e.event] : []);
/** Held controls that do something (the all-zero move and a zero look are no input). */
const active = (c: GameCommand): boolean =>
  c.type === "move" ? c.forward !== 0 || c.right !== 0 || c.vertical !== 0 || c.sprint
    : c.type === "look" ? c.yawDelta !== 0 || c.pitchDelta !== 0 : true;

export class PacingTimelines {
  private readonly recorders = new Map<string, { rec: TimelineRecorder; d: Driver }>();
  private readonly branchPoints = new Map<string, TimelineExport>();
  private readonly pendingBranch = new Map<string, string>();
  private readonly unjudged = new Set<string>();

  /** Before a branch's driver is made: resume from `parent@milestone`'s timeline. */
  branch(scenario: string, parent: string, milestone: string): void { this.pendingBranch.set(scenario, `${parent}@${milestone}`); }
  /** A branch started from the save library has no parent history to resume. */
  noHistory(scenario: string): void { this.unjudged.add(scenario); }

  attach(d: Driver): DriverObserver {
    const scenario = d.run.scenario, from = this.pendingBranch.get(scenario);
    const parent = from ? this.branchPoints.get(from) : undefined;
    const rec = parent ? resumeRecorder(parent, OPTIONS) : createRecorder({ id: `playthrough-${scenario}`, started: STARTED }, OPTIONS);
    this.recorders.set(scenario, { rec, d });
    d.milestones.push((x, label) => this.branchPoints.set(`${scenario}@${label}`, exportTimeline(rec, x.state)));
    let commanded = false;
    return {
      tick: (x, controls, events) => {
        const cause = x.waitCause;
        observe(rec, x.state, { input: commanded || controls.some(active), ...(cause ? { cause } : {}) });
        commanded = false;
        const systems = systemsOf(events);
        if (systems.length) recordSystemsEvents(rec, x.state, systems);
      },
      command: (_x, _command, result) => {
        commanded = true;
        const systems = systemsOf(result.events);
        if (systems.length) recordSystemsEvents(rec, result.state, systems);
      },
    };
  }

  /** The scenario's timeline now, with open spans closed in a copy. */
  timeline(scenario: string): TimelineExport | null {
    const r = this.recorders.get(scenario);
    return r ? exportTimeline(r.rec, r.d.state) : null;
  }
  /** The acceptance check for one finished run. */
  accept(run: RunRecord): { name: string; ok: boolean; detail: string } {
    const name = "pacing acceptance (LS-1: new-content gap, empty travel, no decode waits)";
    if (this.unjudged.has(run.scenario)) return { name, ok: true, detail: "not judged: branched from the save library, no parent history" };
    const t = this.timeline(run.scenario);
    if (!t) return { name, ok: false, detail: "no timeline recorded" };
    return { name, ...judgePacing(run.scenario, analyseTimeline(t)) };
  }
  /** Writes each recorded scenario's timeline export to `dir`. */
  write(dir: string, scenarios: readonly string[]): void {
    fs.mkdirSync(dir, { recursive: true });
    for (const id of scenarios) {
      const t = this.timeline(id);
      if (t) fs.writeFileSync(path.join(dir, `${id}.timeline.json`), serializeTimeline(t));
    }
  }
}

/** The acceptance verdict for one route, judged against its recorded debt
 * (`pacing-debt.ts`): decode waits never pass; other figures pass while no worse
 * than recorded. A route with no entry is judged strictly. */
export function judgePacing(scenario: string, a: TimelineAnalysis, debts: Readonly<Record<string, PacingDebt>> = PACING_DEBT): { ok: boolean; detail: string } {
  const v = pacingAcceptance(a);
  const longest = a.travel.emptyStretches[0]?.seconds ?? 0;
  const figures = `longest gap ${v.longestGapMinutes.toFixed(1)} min, ${v.emptyStretches} empty stretches over 90 s (longest ${longest.toFixed(0)} s), ${v.decodeWaitSeconds.toFixed(0)} s waiting on decodes`;
  if (v.ok) return { ok: true, detail: figures };
  const debt = debts[scenario];
  if (!debt || v.decodeWaitSeconds > 0) return { ok: false, detail: `${v.failures.join("; ")} (${figures})` };
  const worse = [
    ...(v.longestGapMinutes > debt.gapMinutes ? [`gap ${v.longestGapMinutes.toFixed(1)} > recorded ${debt.gapMinutes} min`] : []),
    ...(v.emptyStretches > debt.emptyStretches ? [`${v.emptyStretches} empty stretches > recorded ${debt.emptyStretches}`] : []),
    ...(longest > debt.longestEmptySeconds ? [`longest empty ${longest.toFixed(0)} s > recorded ${debt.longestEmptySeconds} s`] : []),
  ];
  if (worse.length) return { ok: false, detail: `worse than the recorded pacing debt: ${worse.join("; ")} (${figures})` };
  const better = v.longestGapMinutes < debt.gapMinutes - 1 || v.emptyStretches < debt.emptyStretches || longest < debt.longestEmptySeconds - 1;
  return { ok: true, detail: `within the recorded pacing debt (pacing-debt.ts)${better ? "; better than recorded: tighten the entry" : ""}: ${figures}` };
}
