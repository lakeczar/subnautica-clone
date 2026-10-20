/** S9 plans: the two optional specialist hulls, each recovered from an ordinary
 * technical record at one of S2's sites. Every other campaign recipe reuses a plan
 * the evidence chain already grants (see CAMPAIGN_PLAN_SOURCES). */
import type { RegionId } from "../registry.js";

export const CAMPAIGN_BLUEPRINT_LABELS = {
  bp_hush_survey: "Hush survey glider plans",
  bp_spindle_tender: "Spindle island tender plans",
} as const;
export type CampaignBlueprintId = keyof typeof CAMPAIGN_BLUEPRINT_LABELS;

/** Technical records, as registry TECH_RECORDS: inspecting one grants its plans. */
export const CAMPAIGN_TECH_RECORDS = {
  canopy_glider_log: {
    label: "Crown survey marker log",
    region: "suspended_garden",
    // S2 `canopy.east_marker`, 166 m: a Dart reaches it, a 350 m suit exits there.
    position: { x: 646, y: -166, z: -178 },
    text: "Survey log clipped to the crown marker: a quiet crescent glider that coasted the crowns on trim alone, listening for what lived below. Its plans are folded into the case.",
    blueprints: ["bp_hush_survey"],
  },
  yard_tender_plate: {
    label: "Yard tender rig plate",
    region: "island_chain",
    // S2 `isles.stack_landing`: a walk-on landing; no dive needed.
    position: { x: 449, y: 5, z: 62 },
    text: "Rig plate on the landing post: a surface tender with folding outriggers and a ramp, for hauling stores between the islands and the yard berth.",
    blueprints: ["bp_spindle_tender"],
  },
} as const satisfies Record<string, { label: string; region: RegionId; position: { x: number; y: number; z: number };
  text: string; blueprints: readonly CampaignBlueprintId[] }>;
export type CampaignTechRecordId = keyof typeof CAMPAIGN_TECH_RECORDS;

/** Where each campaign plan is found, for the handoff and the planner check. */
export const CAMPAIGN_PLAN_SOURCES = {
  bp_rift_pressure: ["C06", "rift_station_ledger"],
  bp_deep_service: ["C07", "rift_station_ledger"],
  bp_carrier_basin: ["C05", "basin_service_rack"],
  bp_carrier_workshop: ["C03", "gantry_plates"],
  bp_reef_recovery: ["C02"],
  bp_canopy_reinforcement: ["C04", "fin_survey_post"],
  bp_hush_survey: ["canopy_glider_log"],
  bp_spindle_tender: ["yard_tender_plate"],
} as const;
