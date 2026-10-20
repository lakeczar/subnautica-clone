/** Readonly physical/route datums, metres in the world frame (Y up, water Y=0).
 * Rendering consumes these; region residency never owns simulation or saved state. */
export const LEGACY_WORLD_BOUNDS = { minX: -76, maxX: 188, minZ: -184, maxZ: 66 } as const;
/** M2-B1 extends only south of the accepted Basin edge (-260) to the boundary
 * fracture terrace. The legacy rectangle and the M2-A extension keep their heights. */
export const ROUTE_WORLD_BOUNDS = { ...LEGACY_WORLD_BOUNDS, maxX: 248, minZ: -320 } as const;
/** The M2-A Basin edge. Terrain north of it is unchanged by the fracture extension. */
export const M2A_BASIN_MIN_Z = -260;
export const WORLD_VERTICAL_BOUNDS = { minY: -300, maxY: 100 } as const;

/** Closed source order of the accepted heightfield. New patches MUST NOT enter it. */
export const LEGACY_TERRAIN_SOURCE_IDS = [
  "reef_service_scraps_east", "reef_service_scraps_west", "reef_glass_ridge_north",
  "reef_glass_ridge_south", "reef_ribbon_catch_north", "reef_ribbon_catch_south",
  "island_workshop_scraps", "island_headland_scraps", "island_glass_ledge_east",
  "island_glass_ledge_west", "island_resin_cove_east", "island_resin_cove_west",
  "canopy_grounding_fins_upper", "canopy_grounding_fins_lower", "canopy_resin_lee_upper",
  "canopy_resin_lee_lower", "reef_edible_school_north", "reef_edible_school_south",
  "island_shore_crop_east", "island_shore_crop_west",
] as const;
export const BASIN_SOURCE_IDS = [
  "basin_ridge_salvage_north", "basin_ridge_salvage_south",
  "basin_survey_fins_east", "basin_survey_fins_west",
] as const;
/** M2-B1 tagged-frame hosts. Each rests on its own local ledge outside the legacy
 * rectangle, exactly like the M2-A Basin sources; nothing joins the legacy order. */
export const FRAME_SOURCE_IDS = ["basin_frame_ridge", "basin_frame_terrace", "basin_frame_fracture"] as const;
/** Every source whose datum shapes the extension terrain, in a closed order. */
export const ROUTE_TERRAIN_SOURCE_IDS = [...BASIN_SOURCE_IDS, ...FRAME_SOURCE_IDS] as const;
/** Boundary fracture: the fresh slope break recorded by C06, below the station.
 * Analytic trench parameters shared by physics and rendering. Metres. */
export const BASIN_FRACTURE = {
  minX: 132, fullMinX: 156, fullMaxX: 232, maxX: 246,
  centerZ: -294, sigma2: 160, depth: 58,
  shelfStartZ: -262, shelfFullZ: -290, shelfDrop: 10,
  lipStartZ: -262, lipFullZ: -276,
} as const;

export const ROUTE_REGIONS = {
  suspended_garden: {
    bounds: { minX: 72, maxX: 188, minZ: -184, maxZ: -70 },
    landmark: { x: 106, y: -73, z: -118.5 },
    safePocket: { x: 116, y: -118, z: -125 },
  },
  silt_basin: {
    bounds: { minX: 98, maxX: 248, minZ: -320, maxZ: -184 },
    landmark: { x: 197, y: -151, z: -219 },
    safePocket: { x: 172, y: -153, z: -196 },
  },
} as const;

/** Dart keel centre lines; diver site work starts from the indicated parking pockets.
 * Width is an authored minimum to verify against triangles in A2, not a render proof. */
export const CANOPY_BASIN_ROUTE = {
  id: "canopy-basin",
  minimumHalfWidth: 4.5,
  upper: [
    { x: 57, y: -10, z: -65 }, { x: 82, y: -50, z: -78 },
    { x: 100, y: -62, z: -97 }, { x: 122, y: -82, z: -104 },
    { x: 126, y: -108, z: -116 }, { x: 126, y: -118, z: -120 },
  ],
  quiet: [
    { x: 57, y: -10, z: -65 }, { x: 80, y: -48, z: -89 },
    { x: 96, y: -88, z: -108 }, { x: 98, y: -100, z: -130 },
    { x: 98, y: -112, z: -140 }, { x: 126, y: -118, z: -140 },
    { x: 126, y: -118, z: -120 },
  ],
  basin: [
    { x: 126, y: -118, z: -120 }, { x: 146, y: -142, z: -166 },
    { x: 162, y: -152, z: -192 }, { x: 172, y: -153, z: -196 },
    { x: 178, y: -160, z: -208 }, { x: 206, y: -156, z: -208 },
    { x: 216, y: -164, z: -226 },
    { x: 216, y: -166, z: -232 },
  ],
  returnLoop: [
    { x: 216, y: -166, z: -232 }, { x: 228, y: -142, z: -196 },
    { x: 228, y: -80, z: -170 }, { x: 170, y: -55, z: -90 },
    { x: 90, y: -18, z: -45 }, { x: 57, y: -10, z: -65 },
  ],
  labParking: { x: 126, y: -118, z: -120 },
  labDiverEntry: { x: 119, y: -118, z: -120.5 },
  labDiverInside: { x: 119, y: -118, z: -125 },
} as const;

/** No Basin air volume: dormitory and boundary station are flooded, open above.
 * The existing lab air remains at X111.4..120.6 / Y-118.1..-114.5 / Z-129.6..-122.4.
 * Keep entrances, host work faces and all opaque triangles consistent with these solids. */
export const BASIN_GEOMETRY = {
  airVolumes: [],
  /** Foundations meet terrain: no accessible pocket under a floor/spine can
   * admit a Dart and then invalidate the open-overhead extraction route. */
  terrainPads: [
    { minX: 169, maxX: 187, minZ: -224, maxZ: -212, y: -166.4 },
    { minX: 208, maxX: 224, minZ: -246, maxZ: -234, y: -172.4 },
    { minX: 195, maxX: 199, minZ: -221, maxZ: -217, y: -181 },
  ],
  dormitory: {
    datum: { x: 178, y: -166, z: -218 },
    entrance: { min: { x: 170, y: -166, z: -212 }, max: { x: 186, y: -161, z: -208 } },
    parking: { x: 178, y: -160, z: -208 },
    workPose: { x: 178, y: -166, z: -219 },
  },
  station: {
    datum: { x: 216, y: -172, z: -240 },
    entrance: { min: { x: 209, y: -172, z: -234 }, max: { x: 223, y: -167, z: -230 } },
    parking: { x: 216, y: -166, z: -232 },
    workPose: { x: 216, y: -172, z: -241 },
  },
  solids: [
    { id: "basin.dormitory.floor", min: { x: 169, y: -166.4, z: -224 }, max: { x: 187, y: -166, z: -212 } },
    { id: "basin.dormitory.back", min: { x: 169, y: -166, z: -224 }, max: { x: 187, y: -161, z: -223.7 } },
    { id: "basin.dormitory.beds.west", min: { x: 170, y: -166, z: -223 }, max: { x: 175, y: -165.4, z: -220.5 } },
    { id: "basin.dormitory.beds.east", min: { x: 181, y: -166, z: -223 }, max: { x: 186, y: -165.4, z: -220.5 } },
    { id: "basin.dormitory.bundles", min: { x: 176.5, y: -166, z: -222.8 }, max: { x: 179.5, y: -165, z: -222 } },
    { id: "basin.station.floor", min: { x: 208, y: -172.4, z: -246 }, max: { x: 224, y: -172, z: -234 } },
    { id: "basin.station.back", min: { x: 208, y: -172, z: -246 }, max: { x: 224, y: -167, z: -245.7 } },
    { id: "basin.station.console", min: { x: 214.5, y: -172, z: -244.6 }, max: { x: 217.5, y: -171, z: -243.6 } },
    // Dish spine: off the work and rescue lanes, a real silhouette/collision datum.
    { id: "basin.dish.spine", min: { x: 195, y: -181, z: -221 }, max: { x: 199, y: -151, z: -217 } },
  ],
} as const;

export const RECOVERY_ROUTES = {
  canopy: {
    stage: { x: 46, y: -12, z: -54 },
    mooring: { x: 51, y: -11, z: -54 },
    // Keel indices 0..2 and attachment index3 retain their schema2 meaning.
    tow: [{ x: 51, y: -11, z: -54 }, { x: 57, y: -10, z: -65 }, { x: 80, y: -48, z: -89 }],
    approach: [{ x: 46, y: -12, z: -54 }, { x: 57, y: -9, z: -65 }, { x: 80, y: -47, z: -89 }],
    attachmentIndex: 3,
    maximumTether: 230,
  },
  basin: {
    stage: { x: 46, y: -12, z: -54 },
    mooring: { x: 51, y: -11, z: -54 },
    // Open overhead extraction: index4 is the vertical lift above the visited hull;
    // attachment index5 is its collar. No closed roof lies on new Basin loss sites.
    tow: [{ x: 51, y: -11, z: -54 }, { x: 57, y: -10, z: -65 },
      { x: 80, y: -4, z: -89 }, { x: 100, y: -4, z: -200 }],
    approach: [{ x: 46, y: -12, z: -54 }, { x: 57, y: -9, z: -65 },
      { x: 80, y: -3, z: -89 }, { x: 100, y: -3, z: -200 }],
    liftY: -4,
    attachmentIndex: 5,
    maximumTether: 650,
  },
} as const;
export type RecoveryRouteId = keyof typeof RECOVERY_ROUTES;
/** The same local staging station can be operated from breathable surface water.
 * The submerged bench/legacy interaction datum does not move or gain an air volume. */
export const RECOVERY_SURFACE_OPERATOR = { x: 46, y: -0.5, z: -54 } as const;
export const STARTER_RESCUE_APPROACH = [
  { x: 0, y: -0.5, z: 6 }, { x: 34, y: -0.5, z: -20 },
  { x: 57, y: -0.5, z: -40 }, RECOVERY_SURFACE_OPERATOR,
  RECOVERY_ROUTES.canopy.stage,
] as const;

/** M2-B1 outer-crown service mooring on the clear eastern Canopy margin, outside
 * the hunter's 72 m territory and below the outer return lane. The diver works on
 * the deck at 138 m (suit 150). Hulls moor in open water south of it. */
export const CANOPY_STOP = {
  work: { x: 204, y: -138, z: -150.2 },
  mooring: { x: 204, y: -140, z: -137 },
  serviceRadius: 12,
  marker: { x: 204, y: -100, z: -151 },
  solids: [
    { id: "canopy.stop.deck", min: { x: 200, y: -138.4, z: -151 }, max: { x: 208, y: -138, z: -145 } },
    { id: "canopy.stop.mast", min: { x: 203.4, y: -164.5, z: -151.8 }, max: { x: 204.6, y: -126, z: -150.6 } },
    { id: "canopy.stop.locker", min: { x: 205.4, y: -138, z: -151 }, max: { x: 207.4, y: -136.4, z: -150 } },
  ],
} as const;
/** Two mineral ribs carry the finite margin ribbon nets. Ledge tops are the work faces. */
export const CANOPY_MARGIN_RIBS = [
  { id: "canopy.margin.rib.north", min: { x: 225, y: -164.5, z: -131.8 }, max: { x: 228.5, y: -98, z: -128.2 } },
  { id: "canopy.margin.ledge.north", min: { x: 222.4, y: -122.6, z: -131.4 }, max: { x: 225, y: -122.2, z: -128.6 } },
  { id: "canopy.margin.rib.south", min: { x: 239, y: -164.5, z: -179.8 }, max: { x: 242.5, y: -104, z: -176.2 } },
  { id: "canopy.margin.ledge.south", min: { x: 236.4, y: -128.6, z: -179.4 }, max: { x: 239, y: -128.2, z: -176.6 } },
] as const;
/** Medium slip rails beside the workshop landing; the hull sits between them. The
 * rails stay submerged so surface swimmers between reef and workshop pass over
 * them; one marker post at the outer (south) end carries the slip sign. */
export const CREEL_SLIP_SOLIDS = [
  { id: "workshop.slip.port", min: { x: -11.4, y: -3.5, z: -31 }, max: { x: -11.1, y: -1.2, z: -21 } },
  { id: "workshop.slip.starboard", min: { x: -0.9, y: -3.5, z: -31 }, max: { x: -0.6, y: -1.2, z: -21 } },
  { id: "workshop.slip.post", min: { x: -11.5, y: -3.5, z: -31.3 }, max: { x: -11.0, y: 1.6, z: -30.8 } },
] as const;
