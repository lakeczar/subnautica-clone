/** CB-2: where creatures leave things, as typed placements. Fish grounds,
 * spawning grounds, moult and shed grounds, carcass falls, protected spawning
 * sites and good fish-trap spots, per region.
 *
 * The mechanics belong to CR-1 (`t3/natural-threat-windows`). Its interface
 * note (`docs/build/streams/CR-1.md`, `50642f5`) fixes the item, ground, fall
 * and cycle IDs, snapshotted in `CR1_INTERFACE` below; the test compares the
 * snapshot with the composed registry whenever CR-1's rows are present. For
 * CR-1's IDs this file proposes only a position (`owner: "CR-1"`); CR-1's
 * final positions win; these follow CR-1's working-tree draft of 2026-10-22
 * (`src/content/fauna/grounds.ts`, uncommitted), except where noted in
 * docs/content/FIELD-GUIDE.md. `owner: "CB-2"` rows are new grounds proposed for CR-1
 * to adopt under these IDs.
 *
 * Every ground regrows to a cap (CR-1's rule): never a timed wait. Required
 * materials keep their exterior registry sources; nothing here is required. */
import type { MaterialId, RegionId } from "../registry.js";
import { p, place, prop, site } from "./refs.js";
import type { Anchor, AreaId, Point, Ref, SpeciesId } from "./types.js";

/** CR-1's published IDs, as of its interface note. */
export const CR1_INTERFACE = {
  provenance: "CR-1 50642f5 docs/build/streams/CR-1.md (t3/natural-threat-windows)",
  items: ["small_fish", "roe_cluster", "planter_feed", "hand_net", "mod_fish_trap"],
  deterrent: "bait",
  grounds: {
    reef_fish_ribs: { region: "refuge_reef", item: "small_fish" },
    isles_fish_split: { region: "island_chain", item: "small_fish" },
    basin_fish_ridge: { region: "silt_basin", item: "small_fish" },
    reef_roe_nursery: { region: "refuge_reef", item: "roe_cluster" },
    isles_roe_cove: { region: "island_chain", item: "roe_cluster" },
    canopy_roe_crowns: { region: "suspended_garden", item: "roe_cluster" },
    reef_shed_moults: { region: "refuge_reef", item: "flex_membrane" },
    isles_shed_shells: { region: "island_chain", item: "planter_feed" },
    canopy_weaver_resin: { region: "suspended_garden", item: "buoyant_resin" },
    rift_mite_grit: { region: "thermal_rift", item: "conductive_crust" },
    basin_scavenger_casts: { region: "silt_basin", item: "planter_feed" },
  },
  protectedGrounds: { divide_skate_eggcases: { region: "brine_divide" } },
  falls: {
    fall_basin_west: { region: "silt_basin", salvage: { fall_basin_west_hide: "flex_membrane", fall_basin_west_bone: "planter_feed" } },
    fall_basin_east: { region: "silt_basin", salvage: { fall_basin_east_hide: "flex_membrane" } },
    fall_divide_lee: { region: "brine_divide", salvage: { fall_divide_lee_crust: "conductive_crust", fall_divide_lee_bone: "planter_feed" } },
  },
  cycles: {
    "cycle.canopy.hunter_feeding": "canopy_sound_hunter",
    "cycle.rift.stalker_feeding": "glare_stalker",
    "cycle.divide.skate_rest": "layer_skate",
    "cycle.meridian.choir_rest": "hollow_choir",
  },
} as const satisfies {
  provenance: string; items: readonly string[]; deterrent: string;
  grounds: Readonly<Record<string, { region: RegionId; item: MaterialId | string }>>;
  protectedGrounds: Readonly<Record<string, { region: RegionId }>>;
  falls: Readonly<Record<string, { region: RegionId; salvage: Readonly<Record<string, MaterialId | string>> }>>;
  cycles: Readonly<Record<string, SpeciesId>>;
};
export type FaunaItem = MaterialId | (typeof CR1_INTERFACE.items)[number];

export type FaunaSiteKind =
  /** Small fish to catch by hand or net (`small_fish`). */
  | "fish"
  /** A spawning ground whose roe regrows to a cap (`roe_cluster`). */
  | "spawning"
  /** Moulted skins or shed shells. */
  | "moult"
  /** Other leavings: weaver resin, mite grit, scavenger casts. */
  | "shed"
  /** A static carcass fall with scavengers; salvage is CR-1's sources. */
  | "carcass_fall"
  /** Eggs or egg cases of a protected animal: scan only, never taken. */
  | "protected_spawn"
  /** A ledge where a fish-trap outpost does well: fish run past it. No item. */
  | "trap_spot";

export interface FaunaSite {
  readonly id: string;
  readonly area: AreaId;
  readonly kind: FaunaSiteKind;
  /** `CR-1`: CR-1's ID, CB-2's proposed position. `CB-2`: a new ground for CR-1 to adopt. */
  readonly owner: "CR-1" | "CB-2";
  /** The animals that leave it, or whose fall it is. */
  readonly species: readonly SpeciesId[];
  /** What a player may take. Null for falls (see `salvage`), protected spawn and trap spots. */
  readonly item: FaunaItem | null;
  readonly salvage?: Readonly<Record<string, FaunaItem>>;
  readonly at: Point;
  readonly anchor: Anchor;
  /** The cave it lies in, when underground. */
  readonly inCave?: string;
  /** What you see there; never colour alone. Design text, not player text. */
  readonly read: string;
  readonly near: readonly Ref[];
}

export const FAUNA_SITES: readonly FaunaSite[] = [
  // ---------------------------------------------------------------- Hearth Reef
  { id: "reef_fish_ribs", area: "refuge_reef", kind: "fish", owner: "CR-1", species: ["reef_school"], item: "small_fish",
    at: p(-24, -8.1, -2), anchor: "water", read: "Small silver fish turning over the intake apron beside the ribs, pausing in their shade.",
    near: [place("reef_ribs"), place("home_pod")] },
  { id: "reef_roe_nursery", area: "refuge_reef", kind: "spawning", owner: "CR-1", species: ["reef_school"], item: "roe_cluster",
    at: p(-196, -15.8, 44), anchor: "floor", read: "Amber roe clusters stuck among the thickest staple cups on the nursery flats; the school circles low over them.",
    near: [prop("reef.nursery_flats")] },
  { id: "reef_shed_moults", area: "refuge_reef", kind: "moult", owner: "CR-1", species: ["ledge_grazer"], item: "flex_membrane",
    at: p(-158, -13.1, -18), anchor: "floor", read: "Papery grazer moults caught in the lee of the lookout ridge, below the line of fresh scars.",
    near: [prop("reef.grazer_lookout")] },
  { id: "reef_trap_ribs_lee", area: "refuge_reef", kind: "trap_spot", owner: "CB-2", species: ["reef_school"], item: null,
    at: p(-40, -8.7, 20), anchor: "floor", read: "A flat sand patch west of the ribs where the school's loop narrows on its way back from the pod.",
    near: [place("reef_ribs")] },
  // ---------------------------------------------------------------- Splitspine Isles
  { id: "isles_fish_split", area: "island_chain", kind: "fish", owner: "CR-1", species: ["reef_school"], item: "small_fish",
    at: p(470, -3.5, 88), anchor: "water", read: "Small fish hang in the sheltered water of the split, out of the swell.",
    near: [site("isles.stack_cleft")] },
  { id: "isles_roe_cove", area: "island_chain", kind: "spawning", owner: "CR-1", species: ["reef_school"], item: "roe_cluster",
    at: p(950, -10.2, -30), anchor: "floor", read: "Roe strung along the cove's eddy line, where drift settles and the water is warmest.",
    near: [site("isles_headland_resin_cove"), site("isles.headland_landing")] },
  { id: "isles_shed_shells", area: "island_chain", kind: "moult", owner: "CR-1", species: ["tide_clapper", "shore_buttons"], item: "planter_feed",
    at: p(1125, -13.2, 20), anchor: "floor", read: "Empty clapper valves and button plates rolled into a gully below the button ledges.",
    near: [prop("isles.button_ledges")] },
  { id: "isles_trap_stack_east", area: "island_chain", kind: "trap_spot", owner: "CB-2", species: ["reef_school"], item: null,
    at: p(520, -9.6, 40), anchor: "floor", read: "A ledge off the split's south-east mouth where the fish leave the channel at the turn of the tide.",
    near: [site("isles.stack_cleft")] },
  // ---------------------------------------------------------------- Lantern Canopy
  { id: "canopy_roe_crowns", area: "suspended_garden", kind: "spawning", owner: "CR-1", species: ["canopy_school"], item: "roe_cluster",
    at: p(126, -104, -96), anchor: "water", read: "Roe strings in the fronds of the crowns above the laboratory, the school thick around them. This is the hunter's home water.",
    near: [place("canopy_lab")] },
  { id: "canopy_weaver_resin", area: "suspended_garden", kind: "shed", owner: "CR-1", species: ["resin_weaver"], item: "buoyant_resin",
    at: p(690, -123.2, -128), anchor: "floor", read: "Empty weaver nests on a holdfast rim of the east crowns: cured resin with no weaver at the door.",
    near: [site("canopy.east_crowns")] },
  // ---------------------------------------------------------------- Central hub spur
  { id: "hub_fish_crown", area: "hub_spur", kind: "fish", owner: "CB-2", species: ["reef_school"], item: "small_fish",
    at: p(294, -60, -560), anchor: "water", read: "A reef school sheltering on the crown's west flank, out of the rays' circle.",
    near: [site("hub.crown")] },
  { id: "hub_ray_eggcases", area: "hub_spur", kind: "protected_spawn", owner: "CB-2", species: ["crown_rays"], item: null,
    at: p(330, -74.2, -596), anchor: "floor", read: "Leathery egg cases wedged in the crown's south crevices, each the size of a diver.",
    near: [site("hub.crown")] },
  // ---------------------------------------------------------------- Pale Basin
  { id: "basin_fish_ridge", area: "silt_basin", kind: "fish", owner: "CR-1", species: ["reef_school"], item: "small_fish",
    at: p(770, -255.4, -530), anchor: "water", read: "A small group of fish over the wreck ridge, above the silt line.",
    near: [site("basin.wreck_ridge")] },
  { id: "basin_scavenger_casts", area: "silt_basin", kind: "shed", owner: "CR-1", species: ["basin_scavengers"], item: "planter_feed",
    at: p(800, -255.7, -600), anchor: "floor", read: "Coiled casts outside the scavengers' burrows on the wreck ridge's south end.",
    near: [site("basin_wreck_panels_south")] },
  { id: "basin_trap_ridge_north", area: "silt_basin", kind: "trap_spot", owner: "CB-2", species: ["reef_school"], item: null,
    at: p(770, -253.2, -470), anchor: "floor", read: "Firm ground at the wreck ridge's north end, by the big frames, where the ridge fish turn.",
    near: [site("basin_wreck_frames_north")] },
  { id: "fall_basin_west", area: "silt_basin", kind: "carcass_fall", owner: "CR-1", species: ["pale_drifter"], item: null,
    salvage: { fall_basin_west_hide: "flex_membrane", fall_basin_west_bone: "planter_feed" },
    at: p(520, -296.7, -480), anchor: "floor", read: "A great curved ribcage on the dish field, north of the great dish, scavengers working it, hide hanging in sheets.",
    near: [site("basin.dish_centre")] },
  { id: "fall_basin_east", area: "silt_basin", kind: "carcass_fall", owner: "CR-1", species: ["pale_drifter"], item: null,
    salvage: { fall_basin_east_hide: "flex_membrane" },
    at: p(700, -242.4, -380), anchor: "floor", read: "An older fall on the terrace north-west of the wreck ridge, half silted, its hide gone leathery.",
    near: [site("basin_wreck_frames_north")] },
  // ---------------------------------------------------------------- Ember Rift
  { id: "rift_mite_grit", area: "thermal_rift", kind: "shed", owner: "CR-1", species: ["ember_mites"], item: "conductive_crust",
    at: p(-62, -305.3, -1046), anchor: "floor", read: "Dark mineral grit drifted onto the cool shoulder balcony that faces the split, below the mites' lip.",
    near: [prop("rift.balcony")] },
  { id: "rift_crawler_moults", area: "thermal_rift", kind: "moult", owner: "CB-2", species: ["kiln_crawler"], item: "planter_feed",
    at: p(130, -306, -800), anchor: "reshape", inCave: "rift_kiln_tube", read: "Pale crawler moults packed into the cracks of the kiln tube's upper wall.",
    near: [prop("rift_kiln_tube")] },
  // ---------------------------------------------------------------- Mirror Divide
  { id: "divide_picker_moults", area: "brine_divide", kind: "moult", owner: "CB-2", species: ["seam_pickers"], item: "planter_feed",
    at: p(426, -359.6, -1200), anchor: "floor", read: "Three-lobed picker shells collected in the boulder gaps of the picker rocks.",
    near: [prop("divide.picker_rocks")] },
  { id: "fall_divide_lee", area: "brine_divide", kind: "carcass_fall", owner: "CR-1", species: ["pale_drifter"], item: null,
    salvage: { fall_divide_lee_crust: "conductive_crust", fall_divide_lee_bone: "planter_feed" },
    at: p(420, -388.1, -1130), anchor: "floor", read: "Bones crusted over on the lee shelf west of the mooring, sails passing high above.",
    near: [site("divide.lee_mooring")] },
  { id: "divide_skate_eggcases", area: "brine_divide", kind: "protected_spawn", owner: "CR-1", species: ["layer_skate"], item: null,
    at: p(424, -386.5, -1146), anchor: "floor", read: "Leathery egg cases tethered to the rock of the clear lee shelf, shadows moving inside.",
    near: [site("divide_lattice_ledge_west")] },
  // ---------------------------------------------------------------- Meridian
  { id: "meridian_scavenger_casts", area: "deep_district", kind: "shed", owner: "CB-2", species: ["basin_scavengers"], item: "planter_feed",
    at: p(1170, -527, -1080), anchor: "floor", read: "Casts on the stable service ledge east of the staging office, scavengers in the frame racks.",
    near: [site("meridian.staging_office")] },
];

/** Stories the falls tell, for the decode logs and the bible (not player text). */
export const FALL_NOTES: Readonly<Record<string, string>> = {
  fall_basin_west: "The newest fall, on the dish field. Its scavengers are thick and its hide still hangs in sheets.",
  fall_basin_east: "Older and half silted; fewer scavengers, more combs.",
  fall_divide_lee: "Bone only, crusted over where the dense water's minerals settle.",
};

