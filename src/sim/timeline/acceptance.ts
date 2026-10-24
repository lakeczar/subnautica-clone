/** LS-1 pacing acceptance: a pass/fail rule set over the one analyser
 * (`analyseTimeline`). It adds no model of its own; REC-2 reuses or absorbs it.
 * Rules (GAME-DIRECTION, through `DEFAULT_THRESHOLDS`):
 * - the longest gap between counted new-content beats is within `newGapMinutes`;
 * - no empty-travel stretch is over `emptyTravelSeconds`;
 * - no idle span has a decode as its declared cause: decodes run in the
 *   background, so waiting on one is never pacing.
 * A pass is structural evidence only: a bot's gaps are a lower bound on a human's. */
import { DEFAULT_THRESHOLDS } from "./report.js";
import type { ReportThresholds, TimelineAnalysis } from "./report.js";

export interface PacingVerdict {
  ok: boolean;
  /** One line per broken rule, naming the figure. */
  failures: string[];
  longestGapMinutes: number;
  emptyStretches: number;
  decodeWaitSeconds: number;
}
/** A declared wait cause that is a decode (`decode` or `decode:<id>`). */
export const isDecodeCause = (cause: string): boolean => cause === "decode" || cause.startsWith("decode:");

export function pacingAcceptance(a: TimelineAnalysis, thresholds: ReportThresholds = DEFAULT_THRESHOLDS): PacingVerdict {
  const failures: string[] = [];
  const gap = a.gaps.reduce((m, g) => (g.minutes > m.minutes ? g : m), { minutes: 0, before: "start", after: "end" } as { minutes: number; before: string; after: string });
  if (gap.minutes > thresholds.newGapMinutes)
    failures.push(`longest gap between new things ${gap.minutes.toFixed(1)} min > ${thresholds.newGapMinutes} (after ${gap.before}, before ${gap.after})`);
  const empty = a.travel.emptyStretches.filter((x) => x.seconds > thresholds.emptyTravelSeconds);
  if (empty.length)
    failures.push(`${empty.length} empty-travel stretch${empty.length === 1 ? "" : "es"} over ${thresholds.emptyTravelSeconds} s (longest ${empty[0]!.seconds.toFixed(0)} s by ${empty[0]!.hull})`);
  const decodeWaits = Object.entries(a.idle.byCause).filter(([cause]) => isDecodeCause(cause));
  const decodeWaitSeconds = decodeWaits.reduce((n, [, c]) => n + c.seconds, 0);
  if (decodeWaits.length)
    failures.push(`idle waiting on a decode: ${decodeWaits.map(([cause, c]) => `${cause} ${c.count}× ${c.seconds.toFixed(0)} s`).join(", ")}`);
  return { ok: failures.length === 0, failures, longestGapMinutes: gap.minutes, emptyStretches: empty.length, decodeWaitSeconds };
}
