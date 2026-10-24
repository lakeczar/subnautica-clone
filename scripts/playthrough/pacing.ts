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
import type { DebtRow, RouteDebt } from "./pacing-debt.js";

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

/** Bounds are compared at this precision (the playthrough replays exactly). */
const round = (x: number): number => Math.round(x * 1000) / 1000;
/** A route's violations, identified: gaps by the beats either side, empty legs by hull
 * and region; each identity's measured values, largest first. */
export function measuredDebt(a: TimelineAnalysis): { gaps: Record<string, number[]>; legs: Record<string, number[]> } {
  const gaps: Record<string, number[]> = {}, legs: Record<string, number[]> = {};
  for (const g of a.gaps.filter((x) => x.flagged)) (gaps[`${g.before} → ${g.after}`] ??= []).push(round(g.minutes));
  for (const t of a.travel.emptyStretches.filter((x) => x.flagged)) (legs[`${t.hull} in ${t.region ?? "open water"}`] ??= []).push(round(t.seconds));
  for (const x of [...Object.values(gaps), ...Object.values(legs)]) x.sort((p, q) => q - p);
  return { gaps, legs };
}
/** One kind's comparison: an identity not recorded, more of one, or a larger value is
 * worse; fewer, smaller or gone is better. Matching is conservative: each identity's
 * values are compared largest to largest, so nothing new hides under an old maximum. */
function compare(kind: string, unit: string, measured: Record<string, number[]>, debt: Readonly<Record<string, DebtRow>>): { worse: string[]; better: string[] } {
  const worse: string[] = [], better: string[] = [];
  for (const [id, values] of Object.entries(measured)) {
    const row = debt[id];
    if (!row) { worse.push(`new ${kind} ${id}: ${values.join(", ")} ${unit}`); continue; }
    if (values.length > row.bounds.length) worse.push(`${kind} ${id}: ${values.length} over the limit, ${row.bounds.length} recorded`);
    values.forEach((x, n) => {
      const b = row.bounds[n];
      if (b !== undefined && x > b) worse.push(`${kind} ${id} #${n + 1}: ${x} ${unit} > recorded ${b}`);
      else if (b !== undefined && x < b) better.push(`${kind} ${id} #${n + 1}: ${x} < ${b}`);
    });
    if (values.length < row.bounds.length) better.push(`${kind} ${id}: ${values.length} left of ${row.bounds.length}`);
  }
  for (const id of Object.keys(debt)) if (!measured[id]) better.push(`${kind} ${id}: gone`);
  return { worse, better };
}

/** The acceptance verdict for one route, judged against its recorded debt
 * (`pacing-debt.ts`), a ratchet both ways: a decode-caused idle span fails first,
 * whatever its length; a new or worse gap or leg fails; a better one also fails until
 * the entry is lowered, and the failure prints the figures to write. A route with no
 * entry is judged strictly. */
export function judgePacing(scenario: string, a: TimelineAnalysis, debts: Readonly<Record<string, RouteDebt>> = PACING_DEBT): { ok: boolean; detail: string } {
  const v = pacingAcceptance(a);
  const longest = a.travel.emptyStretches[0]?.seconds ?? 0;
  const figures = `longest gap ${v.longestGapMinutes.toFixed(1)} min, ${v.emptyStretches} empty stretches over 90 s (longest ${longest.toFixed(0)} s), ${v.decodeWaitSpans} decode waits`;
  if (v.decodeWaitSpans > 0) return { ok: false, detail: `decode waits are never debt: ${v.failures.join("; ")} (${figures})` };
  const debt = debts[scenario], m = measuredDebt(a);
  if (!debt) return v.ok ? { ok: true, detail: figures } : { ok: false, detail: `${v.failures.join("; ")} (${figures}); measured: ${debtFigures(a)}` };
  const g = compare("gap", "min", m.gaps, debt.gaps), l = compare("leg", "s", m.legs, debt.legs);
  const worse = [...g.worse, ...l.worse], better = [...g.better, ...l.better];
  if (worse.length) return { ok: false, detail: `worse than the recorded pacing debt: ${worse.join("; ")} (${figures})` };
  if (better.length) {
    const write = (measured: Record<string, number[]>, rows: Readonly<Record<string, DebtRow>>) =>
      Object.fromEntries(Object.entries(measured).map(([id, bounds]) => [id, { bounds, owner: rows[id]!.owner }]));
    return { ok: false, detail: `better than the recorded pacing debt (${better.join("; ")}): lower pacing-debt.ts["${scenario}"] to ` +
      JSON.stringify({ gaps: write(m.gaps, debt.gaps), legs: write(m.legs, debt.legs) }) };
  }
  return { ok: true, detail: `exactly the recorded pacing debt (pacing-debt.ts): ${figures}` };
}
/** The figures a route would record as debt, for a first entry. */
export const debtFigures = (a: TimelineAnalysis): string => JSON.stringify(measuredDebt(a));
