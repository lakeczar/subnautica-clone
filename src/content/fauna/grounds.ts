/** CR-1: where creatures are a resource. Every ground is an ordinary source
 * (SourceDefinition), so catching, collecting, regrowth, scans, the survey
 * station and saves all use the existing rules; New Game stock is loaded once
 * into older saves (additive content). Datums sit 0.8–2.5 m above the composed
 * floor, outside every authored cave footprint, and the carcass falls are at
 * least 30 m off S2's routes. Story-neutral by design.
 *
 * - Fish grounds: small common fish, caught by hand or net. A school regathers
 *   one fish at a time to its cap; it never runs dry for good.
 * - Spawning grounds: roe clusters reappear on a slow regrowth timer, never a
 *   timed wait. Rich food: one cluster cooks into two meals.
 * - Shed and byproducts: what residents leave near their homes, taken without
 *   harm. Existing materials where they fit (membrane, resin, crust); shells,
 *   casts and fall bone are planter feed.
 * - Carcass falls: static landmarks with scavengers and finite salvage.
 * - Protected: threats, rare residents and story animals are never sources;
 *   the skates' egg cases are scan-only. */
import type { RegionId, SourceDefinition } from "../registry.js";

/** Animals whose grounds these are. Catching takes only the two common schools. */
export type FaunaSpecies =
  | "reef_school" | "canopy_school" | "ledge_grazer" | "tide_clapper" | "resin_weaver" | "ember_mites"
  | "basin_scavengers" | "kiln_crawler" | "seam_pickers" | "layer_skate" | "crown_rays" | "carcass_fall";
export type GroundKind = "fish" | "roe" | "shed" | "fall" | "protected";
/** Never caught, never collected from: every threat, the rare residents and story animals. */
export const PROTECTED_SPECIES = [
  "canopy_sound_hunter", "glare_stalker", "layer_skate", "hollow_choir", "knot_eel", "crown_rays", "canopy_floaters",
] as const;
/** The only animals whose bodies (fish) or eggs (roe) may be taken. */
export const HARVESTABLE_SPECIES = ["reef_school", "canopy_school"] as const satisfies readonly FaunaSpecies[];

type Ground = SourceDefinition & { readonly region: RegionId };
const ground = (g: Ground): Ground => g;

export const FAUNA_SOURCES = {
  // ------------------------------------------------------------ fish grounds
  reef_fish_ribs: ground({
    label: "Rib school", region: "refuge_reef", position: { x: -28, y: -7, z: 6 },
    item: "small_fish", stock: 4, reserve: 0, bundle: 1, asset: "fish",
    context: "Small silver fish turn over the intake apron beside the ribs; a slow hand closes on one.",
    scan: "Common reef fish. The school regathers a fish every four minutes or so. Cook two into a meal, or release one as bait.",
  }),
  isles_fish_split: ground({
    // CB-2: raised into open water, clear of the Isles tidal caves.
    label: "Split school", region: "island_chain", position: { x: 470, y: -3.5, z: 88 },
    item: "small_fish", stock: 4, reserve: 0, bundle: 1, asset: "fish",
    context: "A school holds in the still water of the split, out of the swell.",
    scan: "Common reef fish sheltering in the cleft. They regather a fish every few minutes.",
  }),
  basin_fish_ridge: ground({
    label: "Ridge group", region: "silt_basin", position: { x: 770, y: -255.4, z: -530 },
    item: "small_fish", stock: 3, reserve: 0, bundle: 1, asset: "fish",
    context: "A small group turns over the clear ridge, never down into the silt.",
    scan: "A few reef fish keep to the clear ridge water. They regather slowly.",
  }),
  // CB-2: a school sheltering on the crown's west flank, out of the rays' circle.
  hub_fish_crown: ground({
    label: "Crown school", region: "silt_basin", position: { x: 294, y: -60, z: -560 },
    item: "small_fish", stock: 4, reserve: 0, bundle: 1, asset: "fish",
    context: "Reef fish hold on the crown's sheltered west flank, below the rays' wide circle.",
    scan: "Common reef fish on the hub crown. They regather a fish every few minutes.",
  }),
  // ------------------------------------------------------------ spawning grounds
  reef_roe_nursery: ground({
    label: "Nursery spawning ground", region: "refuge_reef", position: { x: -196, y: -15.8, z: 44 },
    item: "roe_cluster", stock: 2, reserve: 0, bundle: 1, asset: "roe",
    context: "Pale roe clusters cling to the staple cups where the reef school turns over the flats.",
    scan: "The reef school spawns here. New clusters appear on their own over the next while; take what is laid.",
  }),
  isles_roe_cove: ground({
    label: "Cove spawning ground", region: "island_chain", position: { x: 950, y: -10.2, z: -30 },
    item: "roe_cluster", stock: 2, reserve: 0, bundle: 1, asset: "roe",
    context: "Roe strings sway in the cove's eddy, out of the surf.",
    scan: "Reef fish spawn in the cove's quiet eddy. Clusters reappear slowly.",
  }),
  canopy_roe_crowns: ground({
    label: "Crown spawning ground", region: "suspended_garden", position: { x: 126, y: -104, z: -96 },
    item: "roe_cluster", stock: 2, reserve: 0, bundle: 1, asset: "roe",
    context: "Lantern-school roe glows faintly among the crown fronds, in the sound hunter's own water.",
    scan: "The lantern school spawns on the hunter's home crowns. Come while it is away feeding, or come quiet.",
  }),
  // ------------------------------------------------------------ shed and byproducts
  reef_shed_moults: ground({
    label: "Grazer moults", region: "refuge_reef", position: { x: -158, y: -13.1, z: -18 },
    item: "flex_membrane", stock: 2, reserve: 0, bundle: 1, asset: "shed",
    context: "Ledge grazers shed their soft skins along the lookout ridge; the old skins cure into membrane.",
    scan: "Moulted grazer skins: flexible membrane, taken without harm. More are shed over time.",
  }),
  isles_shed_shells: ground({
    label: "Shed shell drift", region: "island_chain", position: { x: 1125, y: -13.2, z: 20 },
    item: "planter_feed", stock: 3, reserve: 0, bundle: 1, asset: "shells",
    context: "Outgrown clapper and button shells pile below the east ledges; crushed, they feed a planter.",
    scan: "Empty shells, shed as the animals grow. Crushed shell is planter feed. The drift refills.",
  }),
  canopy_weaver_resin: ground({
    label: "Weaver nest rim", region: "suspended_garden", position: { x: 690, y: -123.2, z: -128 },
    item: "buoyant_resin", stock: 2, reserve: 0, bundle: 1, asset: "nest",
    context: "Resin weavers pack shed resin into nests at the hollow's mouth; abandoned nests are cured resin.",
    scan: "Old weaver nests, cured to buoyant resin. The weavers build more; taking an empty one harms nothing.",
  }),
  rift_mite_grit: ground({
    label: "Mite grit ledge", region: "thermal_rift", position: { x: -62, y: -305.3, z: -1046 },
    item: "conductive_crust", stock: 2, reserve: 0, bundle: 1, asset: "grit",
    context: "Ember mites shed mineral grit here between grazing trips to the lip; it packs into crust.",
    scan: "Mite grit on the cool balcony, well away from the plume. It builds up again over time.",
  }),
  basin_scavenger_casts: ground({
    label: "Scavenger casts", region: "silt_basin", position: { x: 800, y: -255.7, z: -600 },
    item: "planter_feed", stock: 3, reserve: 0, bundle: 1, asset: "casts",
    context: "Coiled casts outside the scavengers' burrows: rich in what the silt holds.",
    scan: "Scavenger casts make good planter feed. The scavengers leave more every few minutes.",
  }),
  // CB-2: crawler moults in the kiln tube (CA-3's cave, not yet registered).
  rift_crawler_moults: ground({
    label: "Crawler moults", region: "thermal_rift", position: { x: 130, y: -305.5, z: -800 },
    item: "planter_feed", stock: 3, reserve: 0, bundle: 1, asset: "shells",
    context: "Pale kiln-crawler moults packed into the cracks of the tube's upper wall.",
    scan: "Kiln crawlers moult as they grow; the old shells crush into planter feed. More are shed over time.",
  }),
  // CB-2: picker shells in the boulder gaps of the picker rocks.
  divide_picker_moults: ground({
    label: "Picker shells", region: "brine_divide", position: { x: 426, y: -358.8, z: -1200 },
    item: "planter_feed", stock: 3, reserve: 0, bundle: 1, asset: "shells",
    context: "Three-lobed seam-picker shells collect in the gaps between the rinsed boulders.",
    scan: "Outgrown picker shells: planter feed, taken without harm. The pickers shed more.",
  }),
  // CB-2: casts on Meridian's stable service ledge, outside the choir's reach.
  meridian_scavenger_casts: ground({
    label: "Ledge casts", region: "deep_district", position: { x: 1170, y: -526.2, z: -1080 },
    item: "planter_feed", stock: 3, reserve: 0, bundle: 1, asset: "casts",
    context: "Scavenger casts on the stable ledge east of the staging office.",
    scan: "Scavenger casts make good planter feed. The scavengers leave more every few minutes.",
  }),
  // ------------------------------------------------------------ protected
  divide_skate_eggcases: ground({
    label: "Skate egg cases", region: "brine_divide", position: { x: 424, y: -383.6, z: -1146 },
    item: "roe_cluster", stock: 0, reserve: 0, bundle: 0, asset: "eggcases",
    context: "Leathery egg cases tethered to the rock of the clear lee shelf, above the brine, shadows moving inside.",
    scan: "Layer skate egg cases. The skates leave the dense water only to lay here. They are protected: look, don't take.",
  }),
  // CB-2: crown-ray egg cases in the crown's south crevices. Rare residents: protected.
  hub_ray_eggcases: ground({
    label: "Ray egg cases", region: "silt_basin", position: { x: 330, y: -70.5, z: -596 },
    item: "roe_cluster", stock: 0, reserve: 0, bundle: 0, asset: "eggcases",
    context: "Leathery egg cases wedged in the crown's south crevices, each the size of a diver.",
    scan: "Crown-ray egg cases. The rays are protected: look, don't take.",
  }),
  // ------------------------------------------------------------ carcass falls
  fall_basin_west_hide: ground({
    label: "Fall hide", region: "silt_basin", position: { x: 524, y: -294.4, z: -476 },
    item: "flex_membrane", stock: 3, reserve: 0, bundle: 1, asset: "hide",
    context: "Cured hide peels from the old fall in tough sheets.",
    scan: "Hide from a great fall, cured by the cold. Flexible membrane; what remains does not return.",
  }),
  fall_basin_west_bone: ground({
    label: "Fall bone meal", region: "silt_basin", position: { x: 516, y: -298.4, z: -485 },
    item: "planter_feed", stock: 3, reserve: 0, bundle: 1, asset: "bone",
    context: "Bone crumbles where the scavengers have worked it.",
    scan: "Crumbled bone from the fall: planter feed.",
  }),
  fall_basin_east_hide: ground({
    label: "Fall hide", region: "silt_basin", position: { x: 703, y: -243.9, z: -384 },
    item: "flex_membrane", stock: 3, reserve: 0, bundle: 1, asset: "hide",
    context: "The smaller fall still has hide on its upper side.",
    scan: "Cured hide from a smaller fall. Flexible membrane; it does not return.",
  }),
  fall_divide_lee_crust: ground({
    label: "Mineralised bone", region: "brine_divide", position: { x: 423, y: -388.6, z: -1126 },
    item: "conductive_crust", stock: 2, reserve: 0, bundle: 1, asset: "bone",
    context: "In the brine-washed lee the old bones have turned to crust.",
    scan: "Bone mineralised by the brine: conductive crust. Finite.",
  }),
  fall_divide_lee_bone: ground({
    label: "Fall bone meal", region: "brine_divide", position: { x: 416, y: -387, z: -1134 },
    item: "planter_feed", stock: 2, reserve: 0, bundle: 1, asset: "bone",
    context: "Crumbled bone between the ribs.",
    scan: "Crumbled bone from the fall: planter feed.",
  }),
} as const satisfies Record<string, Ground>;
export type FaunaSourceId = keyof typeof FAUNA_SOURCES;

/** What each ground is and whose it is. */
export const GROUNDS: Readonly<Record<FaunaSourceId, { kind: GroundKind; species: FaunaSpecies }>> = {
  reef_fish_ribs: { kind: "fish", species: "reef_school" },
  isles_fish_split: { kind: "fish", species: "reef_school" },
  basin_fish_ridge: { kind: "fish", species: "reef_school" },
  reef_roe_nursery: { kind: "roe", species: "reef_school" },
  isles_roe_cove: { kind: "roe", species: "reef_school" },
  canopy_roe_crowns: { kind: "roe", species: "canopy_school" },
  reef_shed_moults: { kind: "shed", species: "ledge_grazer" },
  isles_shed_shells: { kind: "shed", species: "tide_clapper" },
  canopy_weaver_resin: { kind: "shed", species: "resin_weaver" },
  rift_mite_grit: { kind: "shed", species: "ember_mites" },
  basin_scavenger_casts: { kind: "shed", species: "basin_scavengers" },
  hub_fish_crown: { kind: "fish", species: "reef_school" },
  rift_crawler_moults: { kind: "shed", species: "kiln_crawler" },
  divide_picker_moults: { kind: "shed", species: "seam_pickers" },
  meridian_scavenger_casts: { kind: "shed", species: "basin_scavengers" },
  hub_ray_eggcases: { kind: "protected", species: "crown_rays" },
  divide_skate_eggcases: { kind: "protected", species: "layer_skate" },
  fall_basin_west_hide: { kind: "fall", species: "carcass_fall" },
  fall_basin_west_bone: { kind: "fall", species: "carcass_fall" },
  fall_basin_east_hide: { kind: "fall", species: "carcass_fall" },
  fall_divide_lee_crust: { kind: "fall", species: "carcass_fall" },
  fall_divide_lee_bone: { kind: "fall", species: "carcass_fall" },
};
export const isFaunaSource = (id: unknown): id is FaunaSourceId => typeof id === "string" && Object.hasOwn(FAUNA_SOURCES, id);

/** Regrowth: one at a time to the ground's cap, only during active play.
 * Falls never regrow; protected grounds hold nothing. 60 steps per second. */
export const FAUNA_RENEWAL = {
  reef_fish_ribs: { quantity: 1, intervalSteps: 14_400 },
  isles_fish_split: { quantity: 1, intervalSteps: 14_400 },
  basin_fish_ridge: { quantity: 1, intervalSteps: 18_000 },
  reef_roe_nursery: { quantity: 1, intervalSteps: 54_000 },
  isles_roe_cove: { quantity: 1, intervalSteps: 54_000 },
  canopy_roe_crowns: { quantity: 1, intervalSteps: 54_000 },
  reef_shed_moults: { quantity: 1, intervalSteps: 36_000 },
  isles_shed_shells: { quantity: 1, intervalSteps: 18_000 },
  canopy_weaver_resin: { quantity: 1, intervalSteps: 36_000 },
  rift_mite_grit: { quantity: 1, intervalSteps: 36_000 },
  basin_scavenger_casts: { quantity: 1, intervalSteps: 18_000 },
  hub_fish_crown: { quantity: 1, intervalSteps: 14_400 },
  rift_crawler_moults: { quantity: 1, intervalSteps: 18_000 },
  divide_picker_moults: { quantity: 1, intervalSteps: 18_000 },
  meridian_scavenger_casts: { quantity: 1, intervalSteps: 18_000 },
} as const satisfies Partial<Record<FaunaSourceId, { quantity: number; intervalSteps: number }>>;

/** Static landmarks: a great animal's remains on the floor, ribs arching up,
 * with scavengers working it. `yaw` turns the spine; `length` in metres. */
export const CARCASS_FALLS = {
  fall_basin_west: {
    label: "West Basin fall", region: "silt_basin", position: { x: 520, y: -295.95, z: -480 }, yaw: 0.6, length: 22,
    salvage: ["fall_basin_west_hide", "fall_basin_west_bone"], scavengers: 9,
  },
  fall_basin_east: {
    label: "East Basin fall", region: "silt_basin", position: { x: 700, y: -241.6, z: -380 }, yaw: 2.1, length: 15,
    salvage: ["fall_basin_east_hide"], scavengers: 6,
  },
  fall_divide_lee: {
    label: "Divide lee fall", region: "brine_divide", position: { x: 420, y: -387.26, z: -1130 }, yaw: -0.9, length: 26,
    salvage: ["fall_divide_lee_crust", "fall_divide_lee_bone"], scavengers: 7,
  },
} as const satisfies Record<string, {
  label: string; region: RegionId; position: { x: number; y: number; z: number }; yaw: number; length: number;
  salvage: readonly FaunaSourceId[]; scavengers: number;
}>;
export type CarcassFallId = keyof typeof CARCASS_FALLS;

/** CB-2: ledges where fish run past, so a trap socketed at a host nearby
 * catches at full rate (TRAP.nearRange). No item: a place, not a source. */
export const TRAP_SPOTS = {
  reef_trap_ribs_lee: { region: "refuge_reef", position: { x: -40, y: -8.7, z: 20 } },
  isles_trap_stack_east: { region: "island_chain", position: { x: 520, y: -9.6, z: 40 } },
  basin_trap_ridge_north: { region: "silt_basin", position: { x: 770, y: -253.2, z: -470 } },
} as const satisfies Record<string, { region: RegionId; position: { x: number; y: number; z: number } }>;
export type TrapSpotId = keyof typeof TRAP_SPOTS;

/** Grounds that lie inside a cave by design (CB-2), by cave ID. The kiln tube is
 * CA-3's and not yet registered; until it is, the moults lie on its floor line. */
export const FAUNA_IN_CAVE: Readonly<Partial<Record<FaunaSourceId, string>>> = { rift_crawler_moults: "rift_kiln_tube" };
