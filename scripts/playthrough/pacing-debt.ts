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
export interface DebtRow { readonly bounds: readonly number[]; readonly owner: string }
export interface RouteDebt { readonly gaps: Readonly<Record<string, DebtRow>>; readonly legs: Readonly<Record<string, DebtRow>> }

/** Late-game logistics: the works phase's hauls and the carrier's Hearthline → Divide stretch. */
export const PACE_1 = "PACE-1 (late-game logistics)";
/** Long legs that read as empty partly because the recorder does not yet count lit
 * landmarks passed (POI-1's measure); the remainder is logistics. */
export const REC_2 = "REC-2 (landmark passes) with PACE-1 (logistics)";
/** PACE-1 stage 2: the works fabricated and stocked in the district (the staging office's
 * bench, the district's habitat sources), the carrier's own bench, and readable evidence
 * for what must come from behind (core, lattice). */
export const PACE_1_STAGE_2 = "PACE-1 stage 2 (district bench, sources and evidence)";
/** The works' steps and the ending are story beats the recorder does not count yet (F5). */
export const WORKS_BEATS = "REC-2 (works beats, F5) with PACE-1 stage 2";


export const PACING_DEBT: Readonly<Record<string, RouteDebt>> = {
  // Measured at PACE-1 stage 1 on root a3409226 + STEW-2 (playthrough ticket 261025-030847-cef9), every wait declared.
  "creel": {
    gaps: {
      // PACE-1 stage 1 (forced return, scenario A): home from the district for the two assemblies, with the air assembly's lattice from the Divide flank and the power assembly's core from the Rift on the way (their plans read past them).
      "discovery: district_controller → craft: service_power_assembly": { bounds: [21.423], owner: PACE_1_STAGE_2 },
      // The works and the ending after the visit home: their steps are not counted as beats yet.
      "discovery: mara_last_page → end": { bounds: [26.234], owner: WORKS_BEATS },
    },
    legs: {
      "creel in deep_district": { bounds: [849.85, 298.55, 233.283, 231.717, 197.617, 172.317, 150.8], owner: REC_2 },
      "creel in thermal_rift": { bounds: [533.783, 115.15, 102.25], owner: REC_2 },
      "creel in island_chain": { bounds: [342.933, 219.767, 172.617], owner: REC_2 },
      "creel in silt_basin": { bounds: [220.617, 220.617, 166.4, 128.183], owner: REC_2 },
      "creel in brine_divide": { bounds: [168.067, 147.433, 100.95], owner: REC_2 },
      "dart in island_chain": { bounds: [161, 137.117, 136.95, 109.783, 108.017, 100.85, 92.633], owner: REC_2 },
      "dart in suspended_garden": { bounds: [148.333, 102.45], owner: REC_2 },
      "dart in silt_basin": { bounds: [93.5], owner: REC_2 },
    },
  },
  "carrier": {
    gaps: {
      // The yard's stock for the 550 m refit and the Mantle gathered at home by diver from near-home commons the carrier route has spent, then the sail to the Divide (the seam trip is gone: R6).
      "hull: hearthline → region: brine_divide": { bounds: [30.622], owner: PACE_1 },
      // Re-measured, not regressed (coordinator, 2026-10-24): LS-1's 26.5 began with the carrier already home, because the bot pre-budgeted the air assembly's lattice. Now the forced return starts in the district: lattice from the flank, the carrier home by the lanes with a Mantle detour into the Rift for core, then gathering.
      "discovery: district_controller → craft: service_power_assembly": { bounds: [45.105], owner: PACE_1_STAGE_2 },
      // The hall and food stock gathered at home by diver (the near-home glass is spent), the ferry and the sail back, then the works and the ending, whose steps are not counted as beats yet.
      "craft: service_air_assembly → end": { bounds: [61.198], owner: PACE_1_STAGE_2 },
    },
    legs: {
      "hearthline in deep_district": { bounds: [753.35, 207.333], owner: REC_2 },
      "hearthline in thermal_rift": { bounds: [636.933], owner: REC_2 },
      "hearthline in island_chain": { bounds: [591.3, 425.883], owner: REC_2 },
      "hearthline in brine_divide": { bounds: [546.017, 499.517, 210.483, 181.667, 142.783, 91.867], owner: REC_2 },
      "creel in silt_basin": { bounds: [290.767, 198.183, 166.4], owner: REC_2 },
      "creel in island_chain": { bounds: [288.967, 172.617, 135.367, 134.917, 128.917, 128.467, 128.467, 123.2, 123.2, 122.267, 122.267], owner: REC_2 },
      "mantle in deep_district": { bounds: [274.783, 259.683, 199.167, 189.5, 98.233, 94.833, 90.25], owner: REC_2 },
      "dart in island_chain": { bounds: [161, 137.117, 136.95, 109.783, 108.017, 100.85, 92.633], owner: REC_2 },
      "dart in suspended_garden": { bounds: [148.333, 102.45], owner: REC_2 },
      "mantle in thermal_rift": { bounds: [121.583], owner: REC_2 },
      "creel in thermal_rift": { bounds: [115.333, 115.15, 102.433], owner: REC_2 },
      "dart in silt_basin": { bounds: [93.5], owner: REC_2 },
    },
  },
  "no-optional": {
    gaps: {
      // As the Creel route: the forced return home for the assemblies, via the Divide flank and the Rift.
      "discovery: district_controller → craft: service_power_assembly": { bounds: [23.712], owner: PACE_1_STAGE_2 },
      // As the Creel route: the works and the ending, not counted as beats yet.
      "discovery: C11 → end": { bounds: [26.228], owner: WORKS_BEATS },
    },
    legs: {
      "creel in deep_district": { bounds: [849.85, 298.55, 233.283, 231.717, 197.617, 172.083, 149.85], owner: REC_2 },
      "creel in thermal_rift": { bounds: [533.8, 115.15, 102.433], owner: REC_2 },
      "creel in island_chain": { bounds: [342.933, 219.767, 174.65], owner: REC_2 },
      "creel in silt_basin": { bounds: [220.617, 220.617, 166.4, 128.183], owner: REC_2 },
      "creel in brine_divide": { bounds: [168.083, 147.333, 100.95], owner: REC_2 },
      "dart in island_chain": { bounds: [161, 137.117, 136.95, 109.783, 108.017, 100.85, 92.633], owner: REC_2 },
      "dart in suspended_garden": { bounds: [148.333, 102.45], owner: REC_2 },
      "dart in silt_basin": { bounds: [93.533], owner: REC_2 },
    },
  },
  "no-optional-carrier": {
    gaps: {
      // The yard's stock for the 550 m refit and the Mantle gathered at home by diver from near-home commons the carrier route has spent, then the sail to the Divide (the seam trip is gone: R6).
      "hull: hearthline → region: brine_divide": { bounds: [30.62], owner: PACE_1 },
      // Re-measured, not regressed (coordinator, 2026-10-24): LS-1's 26.5 began with the carrier already home, because the bot pre-budgeted the air assembly's lattice. Now the forced return starts in the district: lattice from the flank, the carrier home by the lanes with a Mantle detour into the Rift for core, then gathering.
      "discovery: district_controller → craft: service_power_assembly": { bounds: [40.11], owner: PACE_1_STAGE_2 },
      // The hall and food stock gathered at home by diver (the near-home glass is spent), the ferry and the sail back, then the works and the ending, whose steps are not counted as beats yet.
      "craft: service_air_assembly → end": { bounds: [63.415], owner: PACE_1_STAGE_2 },
    },
    legs: {
      "hearthline in deep_district": { bounds: [753.35, 207.333], owner: REC_2 },
      "hearthline in thermal_rift": { bounds: [636.933], owner: REC_2 },
      "hearthline in island_chain": { bounds: [591.3, 425.883], owner: REC_2 },
      "hearthline in brine_divide": { bounds: [546.017, 499.383, 210.483, 181.667, 142.917, 91.867], owner: REC_2 },
      "creel in silt_basin": { bounds: [290.767, 198.183, 166.4], owner: REC_2 },
      "creel in island_chain": { bounds: [288.967, 174.65, 135.367, 134.917, 128.917, 128.467, 128.467, 123.2, 123.2, 122.267, 122.267], owner: REC_2 },
      "mantle in deep_district": { bounds: [274.783, 259.683, 199.167, 189.5, 98.233, 94.833, 90.25], owner: REC_2 },
      "dart in island_chain": { bounds: [161, 137.117, 136.95, 109.783, 108.017, 100.85, 92.633], owner: REC_2 },
      "dart in suspended_garden": { bounds: [148.333, 102.45], owner: REC_2 },
      "mantle in thermal_rift": { bounds: [121.583], owner: REC_2 },
      "creel in thermal_rift": { bounds: [115.7, 115.15, 102.067], owner: REC_2 },
      "dart in silt_basin": { bounds: [93.533], owner: REC_2 },
    },
  },
};
