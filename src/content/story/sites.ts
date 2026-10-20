/** Placement proposals for the region author (S2), keyed by site ID and grouped
 * by region in SITES_BY_REGION. Depths are proposals inside WORLD_PROGRESSION's
 * envelopes. `depth` is where a craft must work; `exit` is the diver's exposure
 * (null on land or in a dry interior). Notes describe what must be physically
 * visible; story meaning stays in the story data. */
import type { RegionId } from "../registry.js";
import type { DiscoveryId, StorySiteId } from "./evidence.js";

export interface StorySite {
  region: RegionId;
  depth: number;
  exit: number | null;
  /** "meridian" sites need deep staging: a Divide lee stop or the carrier's district shelf. */
  zone: "near" | "meridian";
  /** Dry interior that opens only once the return gate is open. */
  afterGate?: true;
  /** Already placed by the registry; S2 keeps the current placement. */
  existing?: true;
  landmark: string;
  cue: string;
  approach: string;
  visible: string;
}

export const STORY_SITES = {
  home_pod: {
    region: "refuge_reef", depth: 0, exit: 0, zone: "near", existing: true,
    landmark: "The pod on its reef ramp.", cue: "Damaged regulator; navigation unit dark.",
    approach: "Start position.", visible: "C14 needs a fitted buffer socket beside the regulator.",
  },
  reef_ribs: {
    region: "refuge_reef", depth: 7, exit: 7, zone: "near", existing: true,
    landmark: "Twin curved reef ribs.", cue: "Open fans beside intake pipes.", approach: "Short swim from the pod.", visible: "Unchanged.",
  },
  island_workshop: {
    region: "island_chain", depth: 0, exit: null, zone: "near", existing: true,
    landmark: "Low workshop below the split stack.", cue: "Unused panels by the bench.", approach: "Landing.", visible: "Unchanged.",
  },
  splitspine_shore: {
    region: "island_chain", depth: 0, exit: null, zone: "near", existing: true,
    landmark: "Splitspine landing.", cue: "Shore crops and the workshop above.", approach: "Short swim from the pod.", visible: "Unchanged; no story items.",
  },
  canopy_lab: {
    region: "suspended_garden", depth: 117, exit: 117, zone: "near", existing: true,
    landmark: "Suspended laboratory by the tall rib.", cue: "Fauna school in clear upper water, not the dense channel.",
    approach: "Open upper crowns; quiet lower roots.", visible: "Add a specimen tray for the optional Mara journal.",
  },
  basin_dormitory: {
    region: "silt_basin", depth: 166, exit: 166, zone: "near", existing: true,
    landmark: "Flooded dormitory below the first fallen dish.", cue: "Bundles face inward.", approach: "First Basin shelf.", visible: "Unchanged.",
  },
  basin_boundary_station: {
    region: "silt_basin", depth: 172, exit: 172, zone: "near", existing: true,
    landmark: "Station beside the southern dish.", cue: "Fractured slope; clear ridge fins above silt.", approach: "First Basin shelf.", visible: "Unchanged.",
  },
  rift_materials_station: {
    region: "thermal_rift", depth: 300, exit: 300, zone: "near",
    landmark: "Compact processing station on the split chimney's pale cool shoulder.",
    cue: "Pale fans still open on the cool flank; warm passages glow below.",
    approach: "Cool flank from the Basin's southwest rim. A warm timed crossing is an optional shortcut.",
    visible: "Processing floor with a lit ledger console; ceramic racks; crated service rings labelled for shipment south.",
  },
  divide_upper_dock: {
    region: "brine_divide", depth: 420, exit: 420, zone: "near",
    landmark: "Upper service dock on the fractured ridge beside the tall gateworks, above the shimmering dense layer.",
    cue: "Flushed outer ledges; sail animals follow the clear lane above the brine.",
    approach: "Broad flank from the Basin, or the cooled Rift flank. Carrier mooring in the Divide lee at 390 m.",
    visible: "An empty cradle shaped exactly to the pod's hull, at the foot of a launch rail climbing toward the surface; guide shoes scored upward. Staff register board. Deep-service drawing rack. Optional: an access log terminal.",
  },
  divide_turbine_hall: {
    region: "brine_divide", depth: 600, exit: 600, zone: "near",
    landmark: "The deep end of the gateworks: a turbine hall behind the saddle.",
    cue: "Turbines still turning in the diverted flow; brine shimmer against the hall's lee.",
    approach: "Down the gateworks' lee face from the upper dock. Interior is flooded and swimmable.",
    visible: "A backup recorder cabinet with a live trace screen. Turbines visibly turning.",
  },
  splitspine_field_shelter: {
    region: "island_chain", depth: 0, exit: null, zone: "near",
    landmark: "Elevated field shelter on the storm-cut headland, above the damaged mast.",
    cue: "Survey stakes running down to the outer escarpment.",
    approach: "Walk from the sheltered cove or climb from the landing. Reachable early; its reading adapts.",
    visible: "Map table with ridge surveys and pinned prediction sheets; a notebook on the cot for the optional journal.",
  },
  meridian_shelf: {
    region: "deep_district", depth: 520, exit: null, zone: "meridian",
    landmark: "Broad district shelf with a turning bowl: the carrier's staging mooring.",
    cue: "Terraces visible below; clear-water lane overhead.",
    approach: "Broad exterior approach from the Divide. Carrier-sized clearance throughout.",
    visible: "Mooring fittings sized for the carrier; no story items.",
  },
  meridian_upper_hall: {
    region: "deep_district", depth: 560, exit: 560, zone: "meridian",
    landmark: "Dormant upper hall at the top terrace, with a long viewing gallery.",
    cue: "Dark windows; sealed but dry-capable frame.",
    approach: "From the district shelf or the narrow service ledge.",
    visible: "Two restoration work faces (hall frame, food module bay) with visible before/after states; terrace lights that come on when powered.",
  },
  meridian_transfer_hall: {
    region: "deep_district", depth: 600, exit: 600, zone: "meridian",
    landmark: "Transfer hall heading the first terrace.",
    cue: "Tagged bundles stacked along the inward wall.",
    approach: "First terrace below the upper hall.",
    visible: "A large count board; a gate actuator locked under a stamped seal beside it.",
  },
  meridian_medical_annex: {
    region: "deep_district", depth: 640, exit: 640, zone: "meridian",
    landmark: "Annex east of the transfer hall, door marked with a pressure tag.",
    cue: "Clean, ordered room; protocol binders.",
    approach: "Along the terrace from the transfer hall.",
    visible: "Ledger stand and protocol wall; Iona's revised estimates on a board. Optional journal at a desk.",
  },
  meridian_gate_hall: {
    region: "deep_district", depth: 700, exit: 700, zone: "meridian",
    landmark: "Gate hall where the service galleries converge; the return gate's heavy leaf.",
    cue: "Panel indicators lit; the diversion's flow audible in the pipes.",
    approach: "Down the gallery from the transfer hall. The interior machinery route is separate from the exterior ledges.",
    visible: "Live gate panel with readable pressure and supply indicators; the gallery schematic; two coupling sockets for portable assemblies; a hydraulic pipe valve too narrow for a person; the crushed outer lock visible through a viewport.",
  },
  meridian_service_window: {
    region: "deep_district", depth: 740, exit: 740, zone: "meridian",
    landmark: "Lowest point of the district: a thick service window in a sealed bulkhead.",
    cue: "Steady cool light behind the glass.",
    approach: "Beneath the gate hall's galleries.",
    visible: "The window, its addressed telemetry panel and the controller console. The interior seen through the glass is a story-owned prop set supplied with S5's art notes to the coordinator.",
  },
  meridian_inner_hall: {
    region: "deep_district", depth: 740, exit: null, zone: "meridian", afterGate: true,
    landmark: "Dry hall behind the return gate.",
    cue: "Opens only once the return gate is open.",
    approach: "Through the drained return gallery from the gate hall.",
    visible: "Story-owned interior set (coordinator-authored). S2 provides the shell, the inner door and floor access.",
  },
} as const satisfies Record<StorySiteId, StorySite>;

export const SITES_BY_REGION = Object.entries(STORY_SITES).reduce(
  (by, [id, site]) => ((by[site.region] ??= []).push(id as StorySiteId), by),
  {} as Partial<Record<RegionId, StorySiteId[]>>,
);
/** Story items held at each site, for S2's placement checklist. */
export const holds = (site: StorySiteId, ids: readonly DiscoveryId[], siteOf: (id: DiscoveryId) => StorySiteId): DiscoveryId[] =>
  ids.filter((id) => siteOf(id) === site);
