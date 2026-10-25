/** SYS-1 upgrades for SYS-2's bases and knowledge systems. Two scopes:
 * - `module`: improves one SYS-2 module item in place (keyed by its item ID, so
 *   it travels when an outpost is packed); a higher tier replaces the lower.
 * - `knowledge`: crafted once, held like a plan (`knowledge.crafted`).
 * Costs follow the same tier rule as the craft catalogue and are checked by
 * `scripts/upgrade-economy.mjs`. Quantities are tuning proposals. */
import type { CostKind } from "../registry.js";
import type { ReachTier } from "./catalogue.js";

export interface HostUpgradeDefinition {
  readonly label: string;
  readonly line: string;
  readonly tier: ReachTier;
  readonly scope: "module" | "knowledge";
  /** SYS-2 module kind it improves (`module` scope). */
  readonly module?: "decoder" | "survey";
  readonly cost: Partial<Record<CostKind, number>>;
  readonly plan: string;
  /** Decoder work multiplier (SYS-2 `decoderSpeed`). */
  readonly decoderSpeed?: number;
  /** Survey station tier (SYS-2 `SURVEY_TIERS` index: 150/300/500/800 m). */
  readonly surveyTier?: number;
  /** Added active outposts (SYS-2 `limitBonus`). */
  readonly outpostBonus?: number;
  /** Live position on the chart (SYS-2 `chartView(…, { livePosition })`). */
  readonly livePosition?: true;
  readonly benefit: string;
}

export const HOST_UPGRADES = {
  decoder_lattice_1: {
    label: "Decoder core lattice", line: "decoder", tier: 2, scope: "module", module: "decoder",
    // Glass logic plates, crust traces, a thermal-core clock.
    cost: { silica_glass: 2, conductive_crust: 1, structural_alloy: 1, thermal_core: 1 }, plan: "bp_rift_pressure", decoderSpeed: 1.5,
    benefit: "This decoder works half again as fast.",
  },
  decoder_lattice_2: {
    label: "Brine decoder lattice", line: "decoder", tier: 3, scope: "module", module: "decoder",
    cost: { silica_glass: 3, conductive_crust: 2, structural_alloy: 1, brine_lattice: 2 }, plan: "bp_deep_service", decoderSpeed: 2.25,
    benefit: "This decoder works 2.25 times as fast.",
  },
  survey_range_1: {
    label: "Survey array · canopy", line: "survey", tier: 1, scope: "module", module: "survey",
    cost: { structural_alloy: 2, silica_glass: 2, conductive_crust: 1 }, plan: "bp_canopy_reinforcement", surveyTier: 1,
    benefit: "This survey station reaches 300 m.",
  },
  survey_range_2: {
    label: "Survey array · basin", line: "survey", tier: 2, scope: "module", module: "survey",
    cost: { structural_alloy: 2, silica_glass: 2, conductive_crust: 2, pressure_ceramic: 1 }, plan: "bp_rift_pressure", surveyTier: 2,
    benefit: "This survey station reaches 500 m.",
  },
  survey_range_3: {
    label: "Survey array · deep", line: "survey", tier: 3, scope: "module", module: "survey",
    cost: { structural_alloy: 2, silica_glass: 3, conductive_crust: 2, brine_lattice: 2 }, plan: "bp_deep_service", surveyTier: 3,
    benefit: "This survey station reaches 800 m.",
  },
  outpost_network_1: {
    label: "Outpost network relay", line: "outposts", tier: 2, scope: "knowledge",
    // A frame member for the relay mast; alloy and crust fittings.
    cost: { structural_alloy: 4, conductive_crust: 1, tagged_frame: 1 }, plan: "bp_island_workshop", outpostBonus: 1,
    benefit: "Run one more field outpost at once.",
  },
  outpost_network_2: {
    label: "Deep outpost network", line: "outposts", tier: 3, scope: "knowledge",
    cost: { structural_alloy: 5, conductive_crust: 2, brine_lattice: 1 }, plan: "bp_deep_service", outpostBonus: 2,
    benefit: "Run two more field outposts at once.",
  },
  chart_live_position: {
    label: "Chart position fix", line: "chart", tier: 1, scope: "knowledge",
    cost: { silica_glass: 2, conductive_crust: 1, structural_alloy: 1 }, plan: "bp_canopy_reinforcement", livePosition: true,
    benefit: "Your live position shows on the chart.",
  },
} as const satisfies Record<string, HostUpgradeDefinition>;
export type HostUpgradeId = keyof typeof HOST_UPGRADES;
export const HOST_UPGRADE_IDS = Object.keys(HOST_UPGRADES) as HostUpgradeId[];
export const hostUpgradeId = (id: unknown): id is HostUpgradeId => typeof id === "string" && Object.hasOwn(HOST_UPGRADES, id);
export const hostUpgrade = (id: HostUpgradeId): HostUpgradeDefinition => HOST_UPGRADES[id];
