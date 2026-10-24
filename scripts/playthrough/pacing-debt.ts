/** LS-1: recorded pacing debt. The first run of the pacing acceptance (LS-1 stage 1a,
 * root a38b951e plus LS-1) found the main path's late game already over the
 * GAME-DIRECTION limits on every judged route. That is campaign structure LS-1 did not
 * cause and cannot fix in its scope. This list holds today's measured figures per
 * route so the gate fails on anything new or worse, while the debt stays visible
 * with its root fix and owner. Decode waits have no allowance anywhere.
 *
 * The playthrough is deterministic: a figure moves only when content or the bot's
 * route changes. A worse figure fails; a better one is reported so this list is
 * tightened in the same merge. An entry is deleted when its root fix lands. */
export interface PacingDebt {
  /** Longest gap between counted new-content beats, play minutes (ceiling). */
  gapMinutes: number;
  /** Empty-travel stretches over the threshold (ceiling). */
  emptyStretches: number;
  /** Longest empty-travel stretch, seconds (ceiling). */
  longestEmptySeconds: number;
  /** Where it comes from, the root fix and its owner. */
  why: string;
}

const LATE_GAME = "The works phase: after the service air assembly the bot hauls works materials between the district and the "
  + "island workshop until the pod buffer, with nothing new on the way (51 min Creel, 87–95 min carrier; the carrier also has a "
  + "51 min stretch from the Hearthline to the Divide). Root fix: the late-game logistics (a forward fabrication point or a "
  + "shorter material path for the works) and the measure itself: the recorder does not yet count lit landmarks passed, so long "
  + "deep legs read as empty where POI-1's measure finds them under 60 s. Owner: the coordinator assigns (late-game content; "
  + "REC-2 for the measure).";

export const PACING_DEBT: Readonly<Record<string, PacingDebt>> = {
  creel: { gapMinutes: 51, emptyStretches: 31, longestEmptySeconds: 850, why: LATE_GAME },
  carrier: { gapMinutes: 95, emptyStretches: 55, longestEmptySeconds: 754, why: LATE_GAME },
  "no-optional": { gapMinutes: 52, emptyStretches: 31, longestEmptySeconds: 850, why: LATE_GAME },
  "no-optional-carrier": { gapMinutes: 88, emptyStretches: 55, longestEmptySeconds: 754, why: LATE_GAME },
};
