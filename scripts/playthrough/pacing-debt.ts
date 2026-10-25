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

export const PACING_DEBT: Readonly<Record<string, RouteDebt>> = {
  // Measured at LS-1 stage 1b (code 24eddb36; playthrough ticket 261024-235145-1fa4): the keeper's
  // racks run moved one Dart leg into the reef and changed the works hauls' order (the carrier's last gap, +0.55 min).
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
      "hull: hearthline → region: brine_divide": { bounds: [50.788], owner: PACE_1 },
      "discovery: C12 → blueprint: bp_service_air": { bounds: [29.756], owner: PACE_1 },
      "discovery: district_controller → craft: service_power_assembly": { bounds: [26.541], owner: PACE_1 },
      "craft: service_air_assembly → craft: pod_buffer": { bounds: [94.732], owner: PACE_1 },
    },
    legs: {
      "hearthline in deep_district": { bounds: [753.35, 753.35, 753.35], owner: REC_2 },
      "hearthline in island_chain": { bounds: [752.9, 752.9, 591.45, 545.9], owner: REC_2 },
      "hearthline in brine_divide": { bounds: [546.017, 499.4, 210.483, 181.667, 142.9, 91.867], owner: REC_2 },
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
      "hull: hearthline → region: brine_divide": { bounds: [50.794], owner: PACE_1 },
      "discovery: C12 → blueprint: bp_service_air": { bounds: [29.761], owner: PACE_1 },
      "discovery: district_controller → craft: service_power_assembly": { bounds: [24.133], owner: PACE_1 },
      "craft: service_air_assembly → craft: pod_buffer": { bounds: [86.234], owner: PACE_1 },
    },
    legs: {
      "hearthline in deep_district": { bounds: [753.35, 753.35, 753.35], owner: REC_2 },
      "hearthline in island_chain": { bounds: [752.9, 752.9, 591.45, 545.9], owner: REC_2 },
      "hearthline in brine_divide": { bounds: [546.017, 499.767, 210.517, 181.667, 142.533, 91.867], owner: REC_2 },
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
