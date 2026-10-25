/** Facts are what the player has actually learned. Each fact is a short list of
 * clauses, and every source names, clause by clause, the words in its own player
 * text that state it; any one source must establish the whole fact on its own.
 * Facts are derived from discoveries and never saved. A critical fact answers a
 * central question or carries a practical procedure, and has at least two
 * independent non-optional sources. */
import type { DiscoveryId } from "./evidence.js";

export type FactId =
  | "F01" | "F02" | "F03" | "F04" | "F05" | "F06" | "F07" | "F08" | "F09" | "F10" | "F11" | "F12"
  | "F13" | "F14" | "F15" | "F16" | "F17" | "F18" | "F19" | "F20" | "F21" | "F22" | "F23" | "F24" | "F25";

export interface FactDefinition {
  /** The learned line, stated as observation, not inference. */
  text: string;
  critical: boolean;
  clauses: readonly string[];
  /** Per source, one verbatim excerpt of its observation or provenance per clause. */
  support: Readonly<Partial<Record<DiscoveryId, readonly string[]>>>;
  sources: readonly DiscoveryId[];
}

const fact = (
  text: string, critical: boolean, clauses: readonly string[],
  support: Readonly<Partial<Record<DiscoveryId, readonly string[]>>>,
): FactDefinition => ({ text, critical, clauses, support, sources: Object.keys(support) as DiscoveryId[] });

export const FACTS: Readonly<Record<FactId, FactDefinition>> = {
  F01: fact("The pod has been under deep pressure, and ballast residue marks an ascent.", false,
    ["deep pressure", "ascent"],
    { C01: ["scored by deep pressure", "Ballast residue points to an ascent"] }),
  F02: fact("The reef intake was abandoned while its filter colonies kept living.", false,
    ["intake abandoned", "colonies alive"],
    { C02: ["an abandoned intake", "Open filter colonies thrive"] }),
  F03: fact("Departure supplies were never used; the ledger has no outbound entry.", false,
    ["supplies unused", "no outbound entry"],
    { C03: ["Departure supplies remain unused", "no outbound entry"] }),
  F04: fact("Fauna left the dense lower water before the equipment failed.", false,
    ["fauna avoid dense water", "before equipment faults"],
    { C04: ["avoid the dense lower channel", "records that change before equipment faults"] }),
  F05: fact("Belongings were tagged and moved inward at disaster day +04:20.", false,
    ["moved inward", "time"],
    { C05: ["tagged bundles moved inward", "disaster day +04:20"] }),
  F06: fact("A witness says Ren held sole control of the return gate while others were outside.", false,
    ["sole gate control", "someone outside"],
    { C05: ["Ren held sole return-gate control", "partner remained outside"] }),
  F07: fact("On disaster day the slope fractured and dense water rose.", true,
    ["slope failed", "dense water rose"],
    { C06: ["fresh slope fractures", "dense water rising"], district_controller: ["slope collapse", "dense, oxygen-poor water"] }),
  F08: fact("A cradle shaped to the pod's hull sits at the foot of an upward launch rail at the Divide's upper dock.", false,
    ["cradle fits the pod", "rail runs upward", "Divide upper dock"],
    { C07: ["cradle shaped to the pod's hull", "scored upward", "Mirror Divide upper service dock"] }),
  F09: fact("Ren was the settlement's access engineer.", true,
    ["access engineer"],
    { C07: ["access engineer for gates and pressure service: Ren"], district_controller: ["access engineer Ren"] }),
  F10: fact("198 people were consolidated; six were on outside assignments; 192 beds were reserved.", true,
    ["198", "six outside", "192 beds"],
    { C08: ["198 arrivals", "six outside assignments", "192 bed reservations"],
      district_controller: ["198 consolidated", "six outside assignments", "192 beds reserved"] }),
  F11: fact("The return gate's actuator carries Ren's stamped override seal.", false,
    ["actuator seal"],
    { C08: ["gate actuator is locked under a stamped override seal: REN · ACCESS"] }),
  F12: fact("Ren ordered the return gate closed.", true,
    ["Ren's order to close"],
    { C09: ["authenticated order in Ren's voice: “Close the return.”"], C12: ["Then Ren: “Close the return.”"],
      district_controller: ["Return gate closed by access engineer Ren"] }),
  F13: fact("The outer lock is crushed, and the hydraulic pipe cannot carry a person.", true,
    ["outer lock crushed", "pipe not for people"],
    { C09: ["outer lock crushed", "far too narrow for a person"], gate_panel: ["outer lock reads crushed", "rated for water only"],
      district_controller: ["Outer lock crushed", "hydraulic pipe not person-rated"] }),
  F14: fact("The annex ran a consented long-suspension protocol with very low vital thresholds.", false,
    ["consent", "long-suspension protocol", "low thresholds"],
    { C10: ["consent ledger, signed name by name", "long-suspension protocol", "far below waking norms"] }),
  F15: fact("Extraction had been loading the Basin's supporting ridge for two years.", true,
    ["extraction on the ridge", "two years"],
    { C11: ["sediment ridge thinning under the extraction quota lines", "D−730 to D−6"],
      rift_station_ledger: ["brine quota: tripled in two years along the Basin's supporting ridge", "tripled in two years"],
      district_controller: ["extraction load on the supporting ridge", "in two years"] }),
  F16: fact("The order came at the documented pressure threshold, after the service-pipe option was refused.", true,
    ["documented threshold", "pipe option refused"],
    { C12: ["Pressure falls to the documented threshold", "asks for the service-pipe option and is refused"],
      district_controller: ["at the documented threshold", "service-pipe option rejected"] }),
  F17: fact("191 sealed beds report living occupants. Ren's slot is the empty one.", true,
    ["191 living", "Ren's slot empty"],
    { C13: ["191 report living occupants", "One slot is empty. Its tag reads REN · ACCESS"],
      district_controller: ["191 occupants within thresholds", "Bed 192, access engineer Ren: vacated at dispatch"],
      inner_roster: ["191 occupied, sealed and within thresholds", "open and empty, tagged REN · ACCESS"] }),
  F18: fact("On day 2,678, seven years and four months later, one repair specialist was sent up, and the regulator failed on the ascent.", true,
    ["day 2,678", "one specialist dispatched", "regulator fault on ascent"],
    { C14: ["on day 2,678", "one repair specialist cleared to wake", "Then a regulator fault, and nineteen minutes of thin air on the way up"],
      district_controller: ["Day 2,678", "repair specialist dispatched", "regulator fault logged on ascent"] }),
  F19: fact("Tavi would not forgive Ren, and corrected the settings that kept Ren alive.", false,
    ["no forgiveness", "corrected settings"],
    { C15: ["I will not forgive you.", "corrected by hand where the default would have failed"] }),
  F20: fact("Voices in the return gallery asked for two more minutes.", false,
    ["more time asked"],
    { C12: ["ask for two more minutes"] }),
  F21: fact("The six on outside assignments did not come back.", true,
    ["six not returned"],
    { C12: ["Six transponders go quiet"], district_controller: ["six outside assignments did not return"],
      inner_roster: ["outside assignments, not returned"] }),
  F22: fact("Fracture warnings from the ridge were closed as instrument faults.", true,
    ["warnings dismissed"],
    { rift_station_ledger: ["signed the fracture reports off as instrument faults"],
      district_controller: ["14 fracture alarms in two years, each closed as an instrument fault"] }),
  F23: fact("The gate procedure: stage independent power and air, isolate the diversion, equalize through the pipe, then open.", true,
    ["power and air before isolation", "equalize before opening"],
    { C09: ["independent power and air, isolate the diversion", "equalize through the pipe, then open"],
      gate_panel: ["stage independent power and air, isolate the diversion", "equalize the gallery through the hydraulic pipe, then open"],
      district_controller: ["isolating the diversion requires independent power and air", "equalize through the pipe before opening"] }),
  F24: fact("A storm loaded the slope before it collapsed.", false,
    ["storm load"],
    { district_controller: ["storm load; slope collapse"] }),
  F25: fact("Nobody else gave an order on the gate channel; the decision was Ren's.", false,
    ["no other order"],
    { C12: ["Nobody else gives an order on the channel"] }),
};

export const FACT_IDS = Object.keys(FACTS) as FactId[];
