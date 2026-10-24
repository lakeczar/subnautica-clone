/** LS-1: recorded pacing debt, a ratchet both ways (coordinator ruling 2026-10-24).
 * The first runs of the pacing acceptance found the main path's late game already over
 * the GAME-DIRECTION limits on every judged route: campaign structure LS-1 did not cause.
 * Each row is one identified violation, and its bounds are the measured values
 * (largest first, compared one to one):
 * - gaps between counted new-content beats, keyed `before → after`, in play minutes;
 * - empty-travel legs over 90 s, keyed `hull in region`, in seconds.
 * Anything new or worse fails; anything better also fails until the row is lowered
 * (the failure prints the figures to write); a decode wait is never debt. A row is
 * deleted when its root fix lands. Every row names its root-fix owner. */
export interface DebtRow { readonly bounds: readonly number[]; readonly owner: string }
export interface RouteDebt { readonly gaps: Readonly<Record<string, DebtRow>>; readonly legs: Readonly<Record<string, DebtRow>> }

/** Late-game logistics: the works phase's hauls and the carrier's Hearthline → Divide stretch. */
export const PACE_1 = "PACE-1 (late-game logistics)";
/** Long legs that read as empty partly because the recorder does not yet count lit
 * landmarks passed (POI-1's measure); the remainder is logistics. */
export const REC_2 = "REC-2 (landmark passes) with PACE-1 (logistics)";

export const PACING_DEBT: Readonly<Record<string, RouteDebt>> = {
};
