/** Runs a sequence of phases on one driver: requirement check, play, milestone
 * save and reload, then the phase record. The first phase that cannot be played
 * stops the run; every later phase still reports what it is missing. */
import { Blocked, Driver } from "./driver.js";
import type { Phase, PlayOptions } from "./live.js";
import { SaveSlot } from "./persistence.js";
import { addCounts, freshMinima } from "./timeline.js";
import type { PhaseRecord, RunRecord } from "./timeline.js";

export interface RunOptions extends PlayOptions {
  /** Print one line per phase as it finishes. */
  verbose?: boolean;
}

export async function runPhases(d: Driver, phases: readonly Phase[], o: RunOptions, slot = new SaveSlot(d.run.scenario)): Promise<RunRecord> {
  const t0 = performance.now();
  let stopped: PhaseRecord["status"] | null = null;
  for (const phase of phases) {
    const record: PhaseRecord = {
      id: phase.id, title: phase.title, status: "pass", startTick: d.state.tick, ticks: 0,
      gathered: {}, spent: {}, crafted: [], discoveries: [], minima: freshMinima(),
    };
    const missing = phase.missing(d);
    if (stopped) {
      record.status = missing.length ? "pending-c3" : "skipped";
      if (missing.length) record.detail = missing;
      d.run.phases.push(record);
      continue;
    }
    if (missing.length) {
      record.status = "pending-c3";
      record.detail = missing;
      d.run.phases.push(record);
      stopped = "pending-c3";
      continue;
    }
    d.beginPhase(phase.id);
    const crafted = new Set(d.state.knowledge.crafted);
    const discoveries = d.run.discoveries.length, deferred = d.deferred.length;
    d.onGather = (k, n) => addCounts(record.gathered, { [k]: n });
    d.onSpend = (cost) => addCounts(record.spent, cost as Record<string, number>);
    try {
      phase.play(d, o);
      await slot.milestone(d, phase.id);
    } catch (error) {
      if (!(error instanceof Blocked)) throw error;
      record.status = "blocked";
      record.detail = [error.message];
      stopped = "blocked";
    }
    record.ticks = d.state.tick - record.startTick;
    record.crafted = d.state.knowledge.crafted.filter((id) => !crafted.has(id));
    record.discoveries = d.run.discoveries.slice(discoveries).map((r) => r.id);
    record.minima = d.phaseMinimaSoFar();
    if (d.deferred.length > deferred) record.deferred = d.deferred.slice(deferred);
    d.run.phases.push(record);
    if (o.verbose) console.log(`  ${phase.id.padEnd(16)} ${record.status.padEnd(10)} ${String(record.ticks).padStart(7)} ticks` +
      `${record.detail ? `  ${record.detail.join("; ")}` : ""}`);
  }
  d.run.outcome = stopped === "blocked" ? "blocked" : stopped === "pending-c3" || d.deferred.length ? "pending-c3" : "complete";
  d.run.ticks = d.state.tick;
  d.run.minutes = Math.round(d.state.tick / 60 / 6) / 10;
  d.run.wallMs += Math.round(performance.now() - t0);
  return d.run;
}
