/** Facts are what the player has actually learned, each with every source that
 * establishes it. Facts are derived from discoveries and never saved. A critical
 * fact answers a central question or carries a practical procedure; it has at least
 * two independent non-optional sources. */
import type { DiscoveryId } from "./evidence.js";

export type FactId =
  | "F01" | "F02" | "F03" | "F04" | "F05" | "F06" | "F07" | "F08" | "F09" | "F10" | "F11"
  | "F12" | "F13" | "F14" | "F15" | "F16" | "F17" | "F18" | "F19" | "F20" | "F21";

export interface FactDefinition {
  /** The learned line, stated as observation, not inference. */
  text: string;
  sources: readonly DiscoveryId[];
  critical: boolean;
}

export const FACTS = {
  F01: { text: "The pod has been under deep pressure, and ballast residue marks an ascent.", sources: ["C01"], critical: false },
  F02: { text: "The reef intake was abandoned while its filter colonies kept living.", sources: ["C02"], critical: false },
  F03: { text: "Departure supplies were never loaded; no outbound entry exists.", sources: ["C03"], critical: false },
  F04: { text: "Fauna left the dense lower water before the instruments failed.", sources: ["C04"], critical: false },
  F05: { text: "Belongings were tagged and moved inward at disaster day +04:20.", sources: ["C05"], critical: false },
  F06: { text: "A witness says Ren held sole control of the return gate while others were outside.", sources: ["C05"], critical: false },
  F07: {
    text: "On disaster day a storm brought down a weakened slope and dense water rose through the fractures.",
    sources: ["C06", "district_controller"],
    critical: true,
  },
  F08: { text: "The pod's cradle and launch rail are at the Divide's upper dock; the rail runs upward.", sources: ["C07", "C14"], critical: false },
  F09: { text: "Ren was the settlement's access engineer: gates and pressure service.", sources: ["C07", "district_controller"], critical: true },
  F10: { text: "198 people arrived at the transfer hall; six were on outside assignments; 192 beds were reserved.", sources: ["C08", "district_controller"], critical: true },
  F11: { text: "The return gate's actuator carries Ren's stamped override seal.", sources: ["C08"], critical: false },
  F12: { text: "Ren gave the authenticated order: “Close the return.”", sources: ["C09", "C12", "district_controller"], critical: true },
  F13: {
    text: "The outer lock is crushed. The hydraulic pipe can equalize the gallery but cannot carry a person. The gate needs independent power and air before the diversion is isolated.",
    sources: ["C09", "C12", "gate_panel"],
    critical: true,
  },
  F14: { text: "The annex ran a consented long-suspension protocol with very low vital thresholds.", sources: ["C10", "district_controller"], critical: false },
  F15: {
    text: "Extraction thinned the Basin's supporting ridge; the warnings were measured and written off.",
    sources: ["C11", "rift_station_ledger"],
    critical: true,
  },
  F16: {
    text: "The order was Ren's own, given at the documented pressure threshold after the service-pipe option was rejected.",
    sources: ["C12", "district_controller"],
    critical: true,
  },
  F17: { text: "191 sealed beds report living occupants. Ren's slot is the empty one.", sources: ["C13", "district_controller", "inner_roster"], critical: true },
  F18: {
    text: "After seven years and four months the controller sent Ren up alone; the regulator failed on the ascent.",
    sources: ["C14", "district_controller"],
    critical: true,
  },
  F19: { text: "Tavi would not forgive Ren, and corrected the settings that kept Ren alive.", sources: ["C15"], critical: false },
  F20: { text: "Voices in the return gallery asked for two more minutes.", sources: ["C12"], critical: false },
  F21: { text: "The six on outside assignments did not come back.", sources: ["C12", "district_controller"], critical: true },
} as const satisfies Record<FactId, FactDefinition>;

export const FACT_IDS = Object.keys(FACTS) as FactId[];
