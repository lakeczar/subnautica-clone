import type { MaterialId, RegionId } from "../registry.js";

/** S2 world sites: every authored place other streams map onto.
 *
 * IDs are stable saved-reference candidates. Non-source sites use
 * `<area>.<name>`. Sources use the registry's snake_case `SourceId` style so
 * the coordinator can lift them into `SOURCES` unchanged. Story stream S5
 * maps evidence onto `story` sites; ecology stream S4 maps habitats and
 * encounters onto sites and `hazards.ts` volumes. Coordinates are datums in
 * metres (+Y up, water at 0). A site with a `pad` shapes the shared floor to
 * `at.y - pad.drop` within `pad.radius`, so its datum is physically true. */
export type SiteRole =
  | "source" | "landmark" | "refuge" | "mooring" | "story" | "entrance" | "rescue_stage" | "volume";

export interface SitePad {
  readonly radius: number;
  /** Floor sits this far below the datum. Sources use 0.8 like the legacy
   * ledges; moorings use the carrier keel clearance. Default 0. */
  readonly drop?: number;
  /** Fraction of the radius held exactly flat. Default 0.55. */
  readonly flat?: number;
}

export interface SiteDef {
  readonly id: string;
  readonly region: RegionId;
  readonly role: SiteRole;
  readonly label: string;
  /** Datum. `y: "floor"` rests on the shared floor plus `lift`. */
  readonly at: { readonly x: number; readonly y: number | "floor"; readonly z: number };
  readonly lift?: number;
  readonly pad?: SitePad;
  /** Half extents of the spatial box around the datum. Default 1.5 m cube. */
  readonly half?: { readonly x: number; readonly y: number; readonly z: number };
  readonly material?: MaterialId | "meal";
  /** Mandatory first-access stock: reachable without what it unlocks. */
  readonly firstAccess?: boolean;
  /** Observable condition a player learns to read (no colour-only cues). */
  readonly condition?: string;
  /** Proposed stock / bundle / finite reserve, for the composed registry. */
  readonly stock?: readonly [stock: number, bundle: number, reserve: number];
  /** One of the area's composed vista viewpoints or subjects. */
  readonly vista?: boolean;
  /** Entrance to a protected interior (not built by S2). */
  readonly interior?: boolean;
  /** Short design note for S4/S5/coordinator. Not player text. */
  readonly note?: string;
}

const src = (id: string, region: RegionId, label: string, material: MaterialId | "meal",
  x: number, y: number | "floor", z: number, condition: string, stock: readonly [number, number, number],
  extra: Partial<SiteDef> & { noPad?: boolean } = {}): SiteDef => {
  const { noPad, ...rest } = extra;
  return {
    id, region, role: "source", label, material, at: { x, y, z }, condition, stock,
    half: { x: 2.2, y: 1.6, z: 2.2 },
    ...(typeof y === "number" && !noPad ? { pad: { radius: 7, drop: 0.8 } } : {}),
    ...rest,
  };
};

export const SITES: readonly SiteDef[] = [
  // ---------------------------------------------------------------- Splitspine Isles
  { id: "isles.stack", region: "island_chain", role: "landmark", label: "Split sea stack", vista: true,
    at: { x: 470, y: 24, z: 95 }, half: { x: 48, y: 26, z: 46 },
    note: "Twin basalt halves either side of a navigable water cleft; west half carries the mast." },
  { id: "isles.stack_mast", region: "island_chain", role: "story", label: "Damaged relay mast", vista: true,
    at: { x: 452, y: 46, z: 102 }, pad: { radius: 9 }, half: { x: 3, y: 14, z: 3 },
    note: "Summit relay with a torn antenna; log cabinet at its base. Reached by the south-west ramp." },
  { id: "isles.stack_landing", region: "island_chain", role: "entrance", label: "Stack south landing",
    at: { x: 449, y: "floor", z: 62 }, half: { x: 4, y: 2, z: 4 } },
  { id: "isles.stack_cleft", region: "island_chain", role: "landmark", label: "The split",
    at: { x: 470, y: -5, z: 95 }, half: { x: 7, y: 5, z: 70 },
    note: "Small-craft-only passage, 12 m wide at the waterline, floor 9.5 m." },
  { id: "isles.stack_yard", region: "island_chain", role: "mooring", label: "Splitspine yard berth",
    at: { x: 470, y: -12, z: -6 }, half: { x: 26, y: 12, z: 26 },
    note: "PROPOSAL: Hearthline construction berth in the stack's dredged southern lee (floor -34)." },
  src("isles_stack_glass_east", "island_chain", "Stack surf ledge glass", "silica_glass", 538, -1.5, 100,
    "Grazers scrape the wave-washed east ledge; clear nodules sit in the fresh scars.", [8, 2, 8]),
  src("isles_stack_resin_cove", "island_chain", "Stack lee drift", "buoyant_resin", 408, -3.5, 48,
    "Cured resin drifting north off the Canopy fetches up in this sheltered cove.", [6, 2, 4]),

  { id: "isles.headland", region: "island_chain", role: "landmark", label: "Storm-cut headland", vista: true,
    at: { x: 1040, y: 40, z: 50 }, half: { x: 110, y: 48, z: 80 } },
  { id: "isles.headland_summit", region: "island_chain", role: "landmark", label: "Headland summit", vista: true,
    at: { x: 1112, y: "floor", z: 106 }, half: { x: 4, y: 3, z: 4 },
    note: "Highest land in the basin (+88 m); looks down the north and east storm cliffs." },
  { id: "isles.headland_shelter", region: "island_chain", role: "refuge", label: "Headland field shelter",
    at: { x: 983.5, y: 10, z: -5.6 }, pad: { radius: 11 }, half: { x: 4, y: 2.5, z: 3.5 },
    note: "Rest locker, meal issue and a charging point. Interior record site for the revisit lead." },
  { id: "isles.headland_records", region: "island_chain", role: "story", label: "Field shelter records",
    at: { x: 984.5, y: 11, z: -6.4 }, half: { x: 0.8, y: 0.6, z: 0.8 } },
  { id: "isles.headland_landing", region: "island_chain", role: "entrance", label: "Headland south beach",
    at: { x: 946, y: "floor", z: -14 }, half: { x: 5, y: 2, z: 5 } },
  src("isles_headland_crops", "island_chain", "Headland shore pods", "meal", 1002.3, "floor", -4.7,
    "Low pod plants grow in the shelter's lee; cut stems regrow without waiting at the plot.", [8, 2, 0],
    { lift: 0.2 }),
  src("isles_headland_resin_cove", "island_chain", "Headland cove drift", "buoyant_resin", 964.4, -3, -37.9,
    "The south cove's eddy holds cured resin washed up from the Canopy lee.", [6, 2, 4]),
  src("isles_headland_glass_ledge", "island_chain", "Cliff-foot glass", "silica_glass", 1120.3, -1.5, 117,
    "Surf below the storm cliff keeps glass nodules scoured clean.", [8, 2, 8]),

  // ---------------------------------------------------------------- Lantern Canopy (east shelf)
  { id: "canopy.east_mooring", region: "suspended_garden", role: "mooring", label: "East Canopy mooring bowl",
    at: { x: 620, y: -160, z: -200 }, pad: { radius: 62, drop: 6, flat: 0.62 }, half: { x: 30, y: 10, z: 30 },
    note: "Hearthline mooring (160 m). Ribs part around a clear turning bowl." },
  { id: "canopy.east_crowns", region: "suspended_garden", role: "landmark", label: "Lantern crowns", vista: true,
    at: { x: 700, y: -105, z: -150 }, half: { x: 70, y: 40, z: 60 },
    note: "Tall tethered crowns rising from the ribs east of the mooring." },
  { id: "canopy.east_marker", region: "suspended_garden", role: "story", label: "Mooring survey plaque",
    at: { x: 646, y: "floor", z: -178 }, lift: 0.5, half: { x: 1, y: 1, z: 1 } },
  src("canopy_east_resin_lee", "suspended_garden", "Mooring lee resin", "buoyant_resin", 668, -168, -232,
    "Mature float bladders above shed cured nodules into the still pocket behind the rib.", [8, 2, 4]),
  src("canopy_east_fins", "suspended_garden", "Mooring rib fins", "conductive_crust", 588, -164, -168,
    "Grounding fins under the holdfasts crust over where the rib stands clear of drifting silt.", [8, 2, 4]),
  { id: "canopy.escarpment_head", region: "suspended_garden", role: "entrance", label: "Escarpment head",
    at: { x: 1300, y: "floor", z: -300 }, lift: 8, half: { x: 20, y: 10, z: 20 } },

  // ---------------------------------------------------------------- Pale Basin
  { id: "basin.anchorage", region: "silt_basin", role: "mooring", label: "Pale Basin anchorage",
    at: { x: 360, y: -240, z: -430 }, pad: { radius: 62, drop: 6, flat: 0.62 }, half: { x: 30, y: 10, z: 30 },
    note: "Hearthline anchorage (240 m) on the north-west terrace, outside every plume lane." },
  { id: "basin.dish_field", region: "silt_basin", role: "landmark", label: "Dish field", vista: true,
    at: { x: 505, y: -262, z: -568 }, half: { x: 110, y: 40, z: 80 },
    note: "Three fallen survey dishes on a low ridge, face-up, rims catching what light reaches." },
  { id: "basin.dish_north", region: "silt_basin", role: "landmark", label: "North dish",
    at: { x: 440, y: "floor", z: -526 }, half: { x: 22, y: 14, z: 22 } },
  { id: "basin.dish_centre", region: "silt_basin", role: "landmark", label: "Great dish",
    at: { x: 508, y: "floor", z: -572 }, half: { x: 30, y: 20, z: 30 } },
  { id: "basin.dish_south", region: "silt_basin", role: "landmark", label: "South dish",
    at: { x: 578, y: "floor", z: -612 }, half: { x: 18, y: 12, z: 18 } },
  { id: "basin.dish_shelter", region: "silt_basin", role: "refuge", label: "Dish lee pocket",
    at: { x: 492, y: -268, z: -600 }, pad: { radius: 12 }, half: { x: 6, y: 3, z: 6 },
    note: "Quiet preparation pocket under the great dish rim; plume lanes pass well east." },
  { id: "basin.dish_hut", region: "silt_basin", role: "story", label: "Dish control hut",
    at: { x: 532, y: -270, z: -548 }, pad: { radius: 10 }, half: { x: 3, y: 2, z: 3 } },
  src("basin_dish_fins", "silt_basin", "Dish frame fins", "conductive_crust", 462, -268, -544,
    "Crust grows on grounding fins of the dish frames that stand above the silt line.", [10, 2, 6]),
  { id: "basin.wreck_ridge", region: "silt_basin", role: "landmark", label: "Wreck ridge", vista: true,
    at: { x: 782, y: -252, z: -520 }, half: { x: 40, y: 20, z: 130 },
    note: "Tagged maintenance wreckage strung along a stable ridge; scavengers den in the frames." },
  src("basin_wreck_frames_north", "silt_basin", "Bulk wreck frames", "structural_alloy", 780, -254, -444,
    "Scavengers emerge beside frames that stay clear of the silt; heavy frames reward powered handling.", [30, 6, 12],
    { half: { x: 6, y: 3, z: 8 }, pad: { radius: 12, drop: 0.8 } }),
  src("basin_wreck_panels_south", "silt_basin", "Ridge loose panels", "structural_alloy", 783, -256, -612,
    "Loose tagged panels lie where the ridge shields them from sediment surges.", [20, 4, 8]),
  { id: "basin.wreck_tagboard", region: "silt_basin", role: "story", label: "Ridge tag board",
    at: { x: 791, y: "floor", z: -500 }, lift: 0.6, half: { x: 1.5, y: 1.2, z: 0.6 } },
  { id: "basin.pale_floor", region: "silt_basin", role: "landmark", label: "Pale floor", vista: true,
    at: { x: 620, y: "floor", z: -760 }, half: { x: 60, y: 8, z: 60 },
    note: "Deepest bowl (380 m); bright rippled sediment and sinking-grain curtains." },
  { id: "basin.deep_marker", region: "silt_basin", role: "story", label: "Sounding marker",
    at: { x: 612, y: "floor", z: -752 }, lift: 1, half: { x: 1, y: 2, z: 1 } },
  { id: "basin.west_gate", region: "silt_basin", role: "entrance", label: "Hearth drop foot",
    at: { x: -228, y: -160, z: -318 }, half: { x: 16, y: 10, z: 16 },
    note: "Bottom of the reef gully: the Basin and Rift return shortcut to the pod." },

  // ---------------------------------------------------------------- Ember Rift
  { id: "rift.head", region: "thermal_rift", role: "entrance", label: "Rift head",
    at: { x: 172, y: -256, z: -606 }, half: { x: 25, y: 12, z: 25 } },
  { id: "rift.cool_mooring", region: "thermal_rift", role: "mooring", label: "Cool flank mooring",
    at: { x: 91.4, y: -300, z: -887.5 }, pad: { radius: 46, drop: 6, flat: 0.58 }, half: { x: 24, y: 10, z: 24 },
    note: "Hearthline mooring (300 m) on the cooled south-east lower ledge." },
  { id: "rift.materials_station", region: "thermal_rift", role: "refuge", label: "Materials station",
    at: { x: 135.6, y: -262, z: -920 }, pad: { radius: 16 }, half: { x: 7, y: 4, z: 5 }, interior: true,
    note: "Compact pressure station on the cool flank. Rest locker, charging, ceramic test racks." },
  { id: "rift.station_log", region: "thermal_rift", role: "story", label: "Station test racks",
    at: { x: 137, y: -261, z: -921.5 }, half: { x: 1, y: 0.8, z: 0.8 } },
  { id: "rift.cool_chimneys", region: "thermal_rift", role: "landmark", label: "Cool chimneys",
    at: { x: 40, y: -250, z: -1030 }, half: { x: 70, y: 18, z: 70 },
    note: "Extinct pale chimney stubs on the upper ledge; their lips carry ceramic layers." },
  src("rift_ceramic_lip_north", "thermal_rift", "Cool chimney lip layers", "pressure_ceramic", 95.6, -258, -965.9,
    "Pale fans stay open on cooled chimney lips; the pale ceramic layers sit where they open.", [12, 2, 8],
    { firstAccess: true }),
  src("rift_ceramic_lip_south", "thermal_rift", "Southern lip layers", "pressure_ceramic", -6.8, -266, -1090.2,
    "A second cooled stub, its lip ringed with open fans and exposed pale layers.", [12, 2, 8],
    { firstAccess: true }),
  src("rift_core_shoulder_north", "thermal_rift", "Inactive shoulder inclusions", "thermal_core", -97.6, -295, -747.7,
    "On the quiet north-west shoulder no shimmer rises; stable core inclusions show as dark nodes in the rock.", [8, 1, 6],
    { firstAccess: true }),
  src("rift_core_shoulder_west", "thermal_rift", "West shoulder inclusions", "thermal_core", -307.1, -305, -1043.2,
    "A second inactive shoulder; fans open and the water is still, so the inclusions are safe to work.", [8, 1, 6],
    { firstAccess: true }),
  src("rift_core_plume_seam", "thermal_rift", "Plume-side seam", "thermal_core", -126, -430, -1084,
    "Richer core beside the active chimney. Work it between plume pulses or with thermal protection.", [16, 2, 0],
    { note: "Optional richer seam; never the first core." }),
  src("rift_ceramic_deep_seam", "thermal_rift", "Deep wall seam", "pressure_ceramic", -232, -398, -1150,
    "Thick pale strata in the trench wall below the shoulders. Better yield, not first access.", [16, 2, 0],
    { note: "Optional deeper seam." }),
  { id: "rift.split_chimney", region: "thermal_rift", role: "landmark", label: "Split chimney", vista: true,
    at: { x: -165, y: -420, z: -1065 }, half: { x: 30, y: 125, z: 30 },
    note: "Active twin-column chimney rising 240 m from the trench floor; warm glow in the split." },
  { id: "rift.chimney_gauge", region: "thermal_rift", role: "story", label: "Chimney gauge post",
    at: { x: -102, y: -305, z: -1114.4 }, pad: { radius: 9 }, half: { x: 1, y: 2, z: 1 } },
  { id: "rift.shoulder_post", region: "thermal_rift", role: "story", label: "Shoulder survey post",
    at: { x: -120, y: "floor", z: -770 }, lift: 1, half: { x: 1, y: 2, z: 1 } },
  { id: "rift.flank_gate", region: "thermal_rift", role: "entrance", label: "Flank reconnect",
    at: { x: 150, y: -320, z: -1170 }, half: { x: 25, y: 15, z: 25 },
    note: "Cooled flank exit toward the Divide's western ridge." },

  // ---------------------------------------------------------------- Mirror Divide
  { id: "divide.lee_mooring", region: "brine_divide", role: "mooring", label: "Divide lee mooring",
    at: { x: 560, y: -390, z: -1120 }, pad: { radius: 60, drop: 6, flat: 0.6 }, half: { x: 30, y: 10, z: 30 },
    note: "Hearthline mooring (390 m) in the ridge's northern lee, above any brine." },
  { id: "divide.gateworks", region: "brine_divide", role: "landmark", label: "Gateworks", vista: true,
    at: { x: 600, y: -365, z: -1262 }, half: { x: 45, y: 50, z: 14 },
    note: "Two tall towers and a lintel across the ridge's central notch." },
  { id: "divide.service_dock", region: "brine_divide", role: "refuge", label: "Upper service dock",
    at: { x: 632, y: -365, z: -1238 }, half: { x: 8, y: 3, z: 6 }, interior: true,
    note: "Restored service stop: charging, rest locker, docking collar for small craft." },
  { id: "divide.gate_control", region: "brine_divide", role: "story", label: "Gate control room",
    at: { x: 570, y: "floor", z: -1262 }, lift: 1.5, half: { x: 4, y: 3, z: 4 }, interior: true },
  { id: "divide.mirror_overlook", region: "brine_divide", role: "landmark", label: "Mirror overlook", vista: true,
    at: { x: 470, y: "floor", z: -1268 }, lift: 1, half: { x: 12, y: 6, z: 12 },
    note: "Crest viewpoint over the shimmering brine interface 80 m below." },
  src("divide_lattice_ledge_west", "brine_divide", "West flushed ledge", "brine_lattice", 336.5, -366, -1188.5,
    "Rinsed crystals line the north ledges where the water stays clear above the dense layer.", [12, 2, 8],
    { firstAccess: true }),
  src("divide_lattice_ledge_east", "brine_divide", "East flushed ledge", "brine_lattice", 749, -375, -1191,
    "Sail animals trace the clear lane over this ledge; crystals grow where the flow is steady.", [12, 2, 8],
    { firstAccess: true }),
  src("divide_lattice_fissure", "brine_divide", "Protected fissure", "brine_lattice", 520, -480, -1360,
    "Richer crystals deep in a fissure below the mirror. Needs chemical protection; never first access.", [20, 2, 0],
    { note: "Optional richer stock inside brine." }),
  { id: "divide.ledge_sampler", region: "brine_divide", role: "story", label: "Ledge sampler",
    at: { x: 344, y: "floor", z: -1182 }, lift: 0.8, half: { x: 1, y: 1.5, z: 1 } },
  { id: "divide.service_ledge", region: "brine_divide", role: "entrance", label: "Service ledge west end",
    at: { x: 620, y: -412, z: -1324 }, half: { x: 12, y: 6, z: 12 },
    note: "Narrow cut bench above the mirror: small craft only, toward Meridian's lower terraces." },

  // ---------------------------------------------------------------- Meridian District (exterior)
  { id: "meridian.staging_shelf", region: "deep_district", role: "mooring", label: "District staging shelf",
    at: { x: 1080, y: -520, z: -1160 }, pad: { radius: 60, drop: 6, flat: 0.6 }, half: { x: 30, y: 10, z: 30 },
    note: "Upgraded Hearthline stops here (520 m) and sends smaller craft down." },
  { id: "meridian.staging_office", region: "deep_district", role: "refuge", label: "Staging office",
    at: { x: 1132, y: -520, z: -1118 }, half: { x: 9, y: 5, z: 6 }, interior: true,
    note: "Exterior service stop: air lock, charging, rest locker. Interior not built by S2." },
  { id: "meridian.spire", region: "deep_district", role: "landmark", label: "Meridian spire", vista: true,
    at: { x: 1215, y: -535, z: -1319 }, half: { x: 9, y: 65, z: 9 },
    note: "Signal spire on the second terrace; its lit crown clears the shelf edge." },
  { id: "meridian.gallery_north", region: "deep_district", role: "story", label: "North service gallery",
    at: { x: 1298, y: -597, z: -1135 }, half: { x: 4, y: 3, z: 4 }, interior: true },
  { id: "meridian.gallery_south", region: "deep_district", role: "story", label: "South service gallery",
    at: { x: 1000, y: -597, z: -1406 }, half: { x: 4, y: 3, z: 4 }, interior: true },
  { id: "meridian.archive_terrace", region: "deep_district", role: "story", label: "Archive terrace",
    at: { x: 1279, y: -679, z: -1396 }, half: { x: 6, y: 4, z: 6 }, interior: true },
  { id: "meridian.deep_works", region: "deep_district", role: "landmark", label: "Deep works", vista: true,
    at: { x: 1400, y: -770, z: -1530 }, half: { x: 50, y: 20, z: 50 } },
  { id: "meridian.works_hatch", region: "deep_district", role: "story", label: "Works hatch",
    at: { x: 1430, y: -769, z: -1560 }, half: { x: 3, y: 2, z: 3 }, interior: true },
  { id: "meridian.machinery_boundary", region: "deep_district", role: "volume", label: "Machinery boundary",
    at: { x: 1445, y: -755, z: -1585 }, half: { x: 30, y: 25, z: 30 },
    note: "Placeholder volume for the story's internal machinery boundary; exterior routes stop outside it." },
  src("meridian_cut_ceramic", "deep_district", "Terrace cut strata", "pressure_ceramic", 1170, -604, -1396,
    "Terrace cuts expose pale ceramic strata wherever the old work lamps still burn.", [16, 2, 0],
    { note: "Secondary repair stock; the finale needs no new resource." }),
  src("meridian_service_cache", "deep_district", "Staging service cache", "structural_alloy", 1150, -520, -1104,
    "A sealed maintenance cage beside the office; tagged for terrace repairs.", [12, 4, 12],
    { note: "Finite authored cache with a declared repair purpose.", noPad: true }),
  { id: "meridian.escarpment_survey", region: "deep_district", role: "story", label: "Escarpment survey post",
    at: { x: 1330, y: -462, z: -700 }, half: { x: 1, y: 2, z: 1 } },
  { id: "meridian.escarpment_foot", region: "deep_district", role: "entrance", label: "Escarpment south end",
    at: { x: 1364, y: -505, z: -1000 }, half: { x: 20, y: 10, z: 20 } },

  // ---------------------------------------------------------------- Hearth Reef (route expansion only)
  { id: "reef.hearth_drop", region: "refuge_reef", role: "landmark", label: "Hearth drop", vista: true,
    at: { x: -236, y: -40, z: -100 }, half: { x: 18, y: 12, z: 18 },
    note: "Marker posts at the head of the gully down to the Basin's west lobe." },
];

/** Surface rescue stages are breathable and reachable without any craft. */
export const RESCUE_STAGE_IDS = [
  "rescue.canopy_east", "rescue.basin", "rescue.basin_east", "rescue.rift", "rescue.rift_west",
  "rescue.divide", "rescue.meridian", "rescue.meridian_works", "rescue.escarpment",
] as const;

export interface FloorPad { readonly id: string; readonly x: number; readonly z: number; readonly y: number; readonly radius: number; readonly flat?: number }
export const FLOOR_PADS: readonly FloorPad[] = SITES.flatMap(s => {
  if (!s.pad || typeof s.at.y !== "number") return [];
  return [{ id: s.id, x: s.at.x, z: s.at.z, y: s.at.y - (s.pad.drop ?? 0), radius: s.pad.radius,
    ...(s.pad.flat === undefined ? {} : { flat: s.pad.flat }) }];
});
