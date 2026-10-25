/** LS-1: recorded pacing debt (coordinator rulings and owner direction, 2026-10-24).
 * The first runs of the pacing acceptance found the main path's late game already over
 * the GAME-DIRECTION limits on every judged route: campaign structure LS-1 did not cause.
 * Each row is one identified figure, and its bounds are the measured values (largest
 * first, compared one to one). Every row names its root-fix owner.
 * - `gaps` between counted new-content beats, keyed `before → after`, in play minutes:
 *   a ratchet both ways. New or worse fails; better also fails until the row is
 *   lowered (the failure prints the figures to write). A row goes when its fix lands.
 * - `legs`, empty travel over 90 s, keyed `hull in region`, in seconds: the record PACE-1
 *   and the playtests judge. The 90 s rule is a spacing guide that grows with
 *   progression and journey length, so a leg is never failed; any difference from this
 *   record is reported with the figures now.
 * A decode wait is never debt. */
export interface DebtRow {
  readonly bounds: readonly number[];
  readonly owner: string;
  /** A coordinator's named exception: the row sits above its accepted ceiling, with the
   * cause. It is not a pass. Whichever stream merges second re-runs and ratchets it down
   * from a fresh run; it may never rise again. */
  readonly exception?: string;
}
export interface RouteDebt { readonly gaps: Readonly<Record<string, DebtRow>>; readonly legs: Readonly<Record<string, DebtRow>> }

/** Late-game logistics: the works phase's hauls and the carrier's Hearthline → Divide stretch. */
export const PACE_1 = "PACE-1 (late-game logistics)";
/** Long legs that read as empty partly because the recorder does not yet count lit
 * landmarks passed (POI-1's measure); the remainder is logistics. */
export const REC_2 = "REC-2 (landmark passes) with PACE-1 (logistics)";
/** The owner of LS-1 1b R1's two excepted rows (coordinator, 2026-10-25). */
export const PACE_1_STAGE_1 = "PACE-1 stage 1 (works logistics, later.ts/stock.ts)";

export const PACING_DEBT: Readonly<Record<string, RouteDebt>> = {
  // Measured at LS-1 stage 1b R1 (code 3aeac541; playthrough ticket 261025-040148-9ce1), after procure's
  // surplus rule (actions.ts). Two no-optional-carrier rows are a coordinator's named exception, not a pass.
  "creel": {
    gaps: {
      "craft: service_air_assembly → craft: pod_buffer": { bounds: [49.985], owner: PACE_1 },
    },
    legs: {
      "creel in deep_district": { bounds: [849.817, 848.933, 609.383, 298.55, 233.283, 231.717, 145.133], owner: REC_2 },
      "creel in island_chain": { bounds: [755.9, 755.017, 447.133, 219.767, 153.3], owner: REC_2 },
      "creel in brine_divide": { bounds: [445.95, 167.783, 100.95], owner: REC_2 },
      "creel in silt_basin": { bounds: [315.4, 220.617, 166.4, 128.183], owner: REC_2 },
      "dart in island_chain": { bounds: [161, 137.117, 109.783, 108.017, 100.85, 92.633], owner: REC_2 },
      "dart in suspended_garden": { bounds: [148.333, 102.45], owner: REC_2 },
      "dart in refuge_reef": { bounds: [136.95], owner: REC_2 },
      "creel in thermal_rift": { bounds: [115.15, 102.333], owner: REC_2 },
      "dart in silt_basin": { bounds: [93.5], owner: REC_2 },
    },
  },
  "carrier": {
    gaps: {
      "hull: hearthline → region: brine_divide": { bounds: [50.786], owner: PACE_1 },
      "discovery: C12 → blueprint: bp_service_air": { bounds: [29.761], owner: PACE_1 },
      "discovery: district_controller → craft: service_power_assembly": { bounds: [26.541], owner: PACE_1 },
      "craft: service_air_assembly → craft: pod_buffer": { bounds: [84.644], owner: PACE_1 },
    },
    legs: {
      "hearthline in deep_district": { bounds: [753.35, 753.35, 753.35], owner: REC_2 },
      "hearthline in island_chain": { bounds: [752.9, 752.9, 591.333, 545.9], owner: REC_2 },
      "hearthline in brine_divide": { bounds: [546.017, 499.333, 210.6, 181.667, 142.967, 91.867], owner: REC_2 },
      "creel in island_chain": { bounds: [479.65, 288.967, 153.3, 135.367, 134.917, 128.917, 128.917, 128.917, 128.467, 128.467, 128.467, 128.467, 123.2, 123.2, 122.267, 122.267], owner: REC_2 },
      "creel in thermal_rift": { bounds: [478.95, 115.417, 115.15, 102.35], owner: REC_2 },
      "creel in silt_basin": { bounds: [290.767, 198.183, 166.4], owner: REC_2 },
      "mantle in deep_district": { bounds: [274.783, 216.333, 199.167, 199.167, 194.35, 193.3, 98.233, 94.833, 90.25], owner: REC_2 },
      "dart in island_chain": { bounds: [161, 137.117, 136.95, 109.783, 108.017, 100.85, 92.633], owner: REC_2 },
      "dart in suspended_garden": { bounds: [148.333, 102.45], owner: REC_2 },
      "dart in silt_basin": { bounds: [93.5], owner: REC_2 },
    },
  },
  "no-optional": {
    gaps: {
      "craft: service_air_assembly → craft: pod_buffer": { bounds: [50.777], owner: PACE_1 },
    },
    legs: {
      "creel in deep_district": { bounds: [849.817, 848.933, 609.35, 298.55, 233.283, 231.717, 144.767], owner: REC_2 },
      "creel in island_chain": { bounds: [755.9, 755.1, 447.133, 219.767, 174.65], owner: REC_2 },
      "creel in brine_divide": { bounds: [445.867, 167.917, 100.95], owner: REC_2 },
      "creel in silt_basin": { bounds: [315.4, 220.617, 166.4, 128.183], owner: REC_2 },
      "dart in island_chain": { bounds: [161, 137.117, 136.95, 109.783, 108.017, 100.85, 92.633], owner: REC_2 },
      "dart in suspended_garden": { bounds: [148.333, 102.45], owner: REC_2 },
      "creel in thermal_rift": { bounds: [115.15, 102.2], owner: REC_2 },
      "dart in silt_basin": { bounds: [93.533], owner: REC_2 },
    },
  },
  "no-optional-carrier": {
    gaps: {
      "hull: hearthline → region: brine_divide": { bounds: [50.061], owner: PACE_1 },
      "discovery: C12 → blueprint: bp_service_air": { bounds: [29.761], owner: PACE_1_STAGE_1, exception: "over the accepted 1a ceiling (29.756): from plain 1b, the Mantle's return leg to the carrier after C12 takes 0.23 s longer from a shifted starting pose (deterministic)" },
      "discovery: district_controller → craft: service_power_assembly": { bounds: [24.133], owner: PACE_1 },
      "craft: service_air_assembly → craft: pod_buffer": { bounds: [87.631], owner: PACE_1_STAGE_1, exception: "over the accepted 1a ceiling (87.12): procure's surplus rule reorders this route's first works trip and adds a later Canopy dive" },
    },
    legs: {
      "hearthline in deep_district": { bounds: [753.35, 753.35, 753.35], owner: REC_2 },
      "hearthline in island_chain": { bounds: [752.9, 752.9, 591.4, 545.9], owner: REC_2 },
      "hearthline in brine_divide": { bounds: [546.017, 499.65, 210.617, 181.667, 142.65, 91.867], owner: REC_2 },
      "creel in island_chain": { bounds: [479.65, 288.967, 174.65, 135.367, 134.917, 128.917, 128.917, 128.917, 128.467, 128.467, 128.467, 128.467, 123.2, 123.2, 122.267, 122.267], owner: REC_2 },
      "creel in thermal_rift": { bounds: [478.95, 115.783, 115.15, 101.983], owner: REC_2 },
      "creel in silt_basin": { bounds: [290.767, 198.183, 166.4], owner: REC_2 },
      "mantle in deep_district": { bounds: [274.783, 216.333, 199.167, 199.167, 194.35, 193.3, 98.233, 94.833, 90.25], owner: REC_2 },
      "dart in island_chain": { bounds: [161, 137.117, 136.95, 109.783, 108.017, 100.85, 92.633], owner: REC_2 },
      "dart in suspended_garden": { bounds: [148.333, 102.45], owner: REC_2 },
      "dart in silt_basin": { bounds: [93.533], owner: REC_2 },
    },
  },
};
