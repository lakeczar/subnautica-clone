/** Regional leads: a region, a landmark and an observable condition, never a
 * coordinate. A lead opens when any `offeredBy` item is known and closes when any
 * target is found. Several leads can open the same target from different evidence.
 * Hint tiers: 1 restates what is known, 2 sharpens the region or landmark,
 * 3 names the approach and preparation. No tier names a conclusion. */
import type { RegionId } from "../registry.js";
import type { DiscoveryId, StorySiteId } from "./evidence.js";

export interface LeadDefinition {
  offeredBy: readonly DiscoveryId[];
  targets: readonly DiscoveryId[];
  site: StorySiteId;
  region: RegionId;
  /** Main-route priority for hints; lower is earlier. */
  order: number;
  text: string;
  hints: readonly [string, string, string];
}

export const LEADS = {
  L01: {
    offeredBy: ["C01"],
    targets: ["C02"],
    site: "reef_ribs",
    region: "refuge_reef",
    order: 10,
    text: "The abandoned intake below the twin reef ribs may explain the pod's damaged filters.",
    hints: [
      "The regulator's filters are fouled. Something on this reef once drew water for people.",
      "The intake lies beneath the twin curved ribs, northwest of the pod. Open fans grow beside its pipes.",
      "Face north from the pod ramp; the ribs are on your left. The intake is shallow enough for starter gear.",
    ],
  },
  L02: {
    offeredBy: ["C01", "C02"],
    targets: ["C03"],
    site: "island_workshop",
    region: "island_chain",
    order: 11,
    text: "The workshop above the Splitspine landing holds shore supplies and fabrication plans.",
    hints: [
      "The island's split ridge is visible from the pod. People worked there.",
      "The workshop is a low platform at the southern foot of the split ridge, above the landing.",
      "Swim to the landing and walk up. The ledger sits on the bench beside unused panels.",
    ],
  },
  L03: {
    offeredBy: ["C02", "C03"],
    targets: ["C04"],
    site: "canopy_lab",
    region: "suspended_garden",
    order: 20,
    text: "Buoyant crowns rise east of Splitspine. A small laboratory hangs beside the tall rib on their clear upper flank.",
    hints: [
      "The intake and the workshop stopped at the same time. Someone else was measuring the water.",
      "East of the island, buoyant crowns rise off the shelf. The laboratory hangs on their clear upper flank, against the tall rib.",
      "Stay on the open upper crowns, above 150 m. Move quietly near the tall rib; the territorial caller warns before it commits.",
    ],
  },
  L04: {
    offeredBy: ["C04", "C06"],
    targets: ["C05"],
    site: "basin_dormitory",
    region: "silt_basin",
    order: 30,
    text: "Beyond the lower Canopy crowns, fallen survey dishes mark Pale Basin. A dormitory lies on the first shelf.",
    hints: [
      "The water records point down into Pale Basin, where people lived on the first shelf.",
      "Follow the lower crowns until fallen dishes rise out of pale sediment. The dormitory sits on the first shelf, facing inward.",
      "The first shelf is deeper than 150 m: a 350 m suit protects the exit and the Dart's hull reaches the shelf. Pack a meal and a charged cell.",
    ],
  },
  L05: {
    offeredBy: ["C04", "C05"],
    targets: ["C06"],
    site: "basin_boundary_station",
    region: "silt_basin",
    order: 31,
    text: "A boundary station stands beside the southern survey dish, where the sediment record was kept.",
    hints: [
      "Something changed in the Basin water before people moved. A station measured that boundary.",
      "Look for the southern fallen dish. The station's console stands beside it, above the sediment pockets.",
      "Same shelf as the dormitory; the clear ridge fins mark firm ground. Watch for silt surges and wait them out.",
    ],
  },
  L06: {
    offeredBy: ["C06", "C11"],
    targets: ["rift_station_ledger"],
    site: "rift_materials_station",
    region: "thermal_rift",
    order: 40,
    text: "Cool-flank research points southwest to Ember Rift: pale open fans on the shoulder, and a materials station on the split chimney.",
    hints: [
      "The Basin records point southwest, to where its ceramics and quota minerals were processed.",
      "Southwest of the Basin a split chimney rises from Ember Rift. The materials station sits on its pale, cool shoulder.",
      "Keep to the cool flank where fans still open; warm passages are optional. The ledger is on the processing floor, near 300 m: a 350 m hull and suit.",
    ],
  },
  L07: {
    offeredBy: ["rift_station_ledger", "C06", "C11"],
    targets: ["C07"],
    site: "divide_upper_dock",
    region: "brine_divide",
    order: 50,
    text: "South of the Basin, Mirror Divide shimmers where dense water meets clear. An upper service dock stands above its brine.",
    hints: [
      "What you have found points south of the Basin, toward the Divide.",
      "Find the shimmering layers south of the Basin. The upper service dock stands on the fractured ridge above them, beside tall gateworks.",
      "The dock is near 420 m, above the dense layer: a 450 m refit, or a carrier moored in the Divide lee with a 450 m suit. Approach on the flushed outer ledges.",
    ],
  },
  L08: {
    offeredBy: ["C06", "rift_station_ledger"],
    targets: ["C11"],
    site: "splitspine_field_shelter",
    region: "island_chain",
    order: 45,
    text: "Mara Sen's name is on the Basin's sediment records. Her field shelter stands high on Splitspine's storm-cut headland.",
    hints: [
      "Mara Sen measured the Basin ridge for years. Her working records were kept on land.",
      "The shelter is on the storm-cut headland, the easternmost of the three islands, above the damaged mast.",
      "Walk up from the sheltered cove, or climb from the landing. No suit needed.",
    ],
  },
  L09: {
    offeredBy: ["C05", "C07", "rift_station_ledger"],
    targets: ["C08"],
    site: "meridian_transfer_hall",
    region: "deep_district",
    order: 60,
    text: "Past the Divide's gateworks, broad terraces descend to the Meridian District. Its transfer hall received the tagged bundles.",
    hints: [
      "What you have found points past the Divide: deeper, and inward.",
      "Cross the Divide by its broad exterior approach or the narrow service ledge. The transfer hall heads the first Meridian terrace.",
      "Near 600 m: an 800 m hull and suit. Stage from a restored Divide lee stop, or moor the carrier on the district shelf and send a deep craft on.",
    ],
  },
  L10: {
    offeredBy: ["C08", "C09"],
    targets: ["C10"],
    site: "meridian_medical_annex",
    region: "deep_district",
    order: 62,
    text: "A medical annex opens off the transfer hall's eastern side, its door still marked with a pressure tag.",
    hints: [
      "Meridian kept careful records of its people. A medical annex would hold the rest.",
      "Leave the transfer hall eastward along the terrace. The annex door carries a pressure tag.",
      "Same terrace, a little deeper, near 640 m. The 800 m suit covers it.",
    ],
  },
  L11: {
    offeredBy: ["C08", "C07"],
    targets: ["C09", "gate_panel"],
    site: "meridian_gate_hall",
    region: "deep_district",
    order: 61,
    text: "The return gate's control hall lies down the gallery, below Meridian's transfer hall.",
    hints: [
      "The records tie my name to the return gate. Its controls are further in.",
      "Follow the gallery down from the transfer hall. The gate hall is where the service galleries converge.",
      "Near 700 m, inside the works. The 800 m suit protects the exit; leave reserve air for the climb back.",
    ],
  },
  L12: {
    offeredBy: ["C09", "gate_panel"],
    targets: ["C12"],
    site: "divide_turbine_hall",
    region: "brine_divide",
    order: 70,
    text: "The gate schematic routes its backup recorder to the turbine hall in the Divide gateworks.",
    hints: [
      "The gate log has a backup copy. The schematic says where it was sent.",
      "The turbine hall is the deep end of the Divide gateworks, below the upper service dock.",
      "Near 600 m on the Divide side. The same 800 m hull and suit; approach on the lee of the gateworks.",
    ],
  },
  L13: {
    offeredBy: ["C08", "C09", "C10", "gate_panel"],
    targets: ["C13", "district_controller"],
    site: "meridian_service_window",
    region: "deep_district",
    order: 63,
    text: "A monitoring line runs to a service window at the bottom of the district, below the gate hall.",
    hints: [
      "Something sealed below the gate hall still reports to the panels.",
      "The service window is at the lowest point of the district, beneath the gate hall's galleries.",
      "Near 740 m, the deepest dive yet. Go with full air and the 800 m suit, and keep a reserve.",
    ],
  },
  L14: {
    offeredBy: ["C07"],
    targets: ["C14"],
    site: "home_pod",
    region: "refuge_reef",
    order: 55,
    text: "The empty cradle's spare dispatch buffer fits the pod's damaged navigation unit.",
    hints: [
      "The cradle at the Divide was made for this pod. Its spare buffer should fit.",
      "Fabricate the dispatch buffer at the pod's repair bench.",
      "It needs two silica glass and two conductive crust. Fit it at the pod and the record will play.",
    ],
  },
} as const satisfies Record<string, LeadDefinition>;
export type LeadId = keyof typeof LEADS;
export const LEAD_IDS = Object.keys(LEADS) as LeadId[];
