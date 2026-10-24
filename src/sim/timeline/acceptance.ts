/** LS-1 pacing acceptance: a rule set over the one analyser (`analyseTimeline`). It
 * adds no model of its own; REC-2 reuses or absorbs it. GAME-DIRECTION (owner,
 * 2026-10-24):
 * - **hard:** the longest gap between counted new-content beats is within
 *   `newGapMinutes`, and no idle span has a decode as its declared cause (decodes run
 *   in the background, so waiting on one is never pacing);
 * - **reported for judgement, never auto-failed:** empty travel over
 *   `emptyTravelSeconds`. The 90 s rule is a spacing guide whose limit grows with
 *   progression and journey length, so a long leg is listed for PACE-1 and the
 *   playtests to judge.
 * A pass is structural evidence only: a bot's gaps are a lower bound on a human's. */
import { DEFAULT_THRESHOLDS } from "./report.js";
import type { ReportThresholds, TimelineAnalysis } from "./report.js";

export interface PacingVerdict {
  ok: boolean;
  /** One line per broken hard rule, naming the figure. */
  failures: string[];
  /** Figures listed for judgement, not failures (long empty-travel legs). */
  reported: string[];
  longestGapMinutes: number;
  emptyStretches: number;
  decodeWaitSeconds: number;
  /** Idle spans with a decode as their declared cause, however short (a one-tick wait counts). */
  decodeWaitSpans: number;
}
/** A declared wait cause that is a decode (`decode` or `decode:<id>`). */
export const isDecodeCause = (cause: string): boolean => cause === "decode" || cause.startsWith("decode:");

export function pacingAcceptance(a: TimelineAnalysis, thresholds: ReportThresholds = DEFAULT_THRESHOLDS): PacingVerdict {
  const failures: string[] = [], reported: string[] = [];
  const gap = a.gaps.reduce((m, g) => (g.minutes > m.minutes ? g : m), { minutes: 0, before: "start", after: "end" } as { minutes: number; before: string; after: string });
  if (gap.minutes > thresholds.newGapMinutes)
    failures.push(`longest gap between new things ${gap.minutes.toFixed(1)} min > ${thresholds.newGapMinutes} (after ${gap.before}, before ${gap.after})`);
  const empty = a.travel.emptyStretches.filter((x) => x.seconds > thresholds.emptyTravelSeconds);
  if (empty.length)
    reported.push(`${empty.length} empty-travel stretch${empty.length === 1 ? "" : "es"} over ${thresholds.emptyTravelSeconds} s, for judgement (longest ${empty[0]!.seconds.toFixed(0)} s by ${empty[0]!.hull})`);
  const decodeWaits = Object.entries(a.idle.byCause).filter(([cause]) => isDecodeCause(cause));
  const decodeWaitSeconds = decodeWaits.reduce((n, [, c]) => n + c.seconds, 0);
  const decodeWaitSpans = decodeWaits.reduce((n, [, c]) => n + c.count, 0);
  if (decodeWaits.length)
    failures.push(`idle waiting on a decode: ${decodeWaits.map(([cause, c]) => `${cause} ${c.count}× ${c.seconds.toFixed(0)} s`).join(", ")}`);
  return { ok: failures.length === 0, failures, reported, longestGapMinutes: gap.minutes, emptyStretches: empty.length, decodeWaitSeconds, decodeWaitSpans };
}
