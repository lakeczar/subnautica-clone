import { CANOPY_BASIN_ROUTE } from "../routes.js";
import type { RegionId } from "../registry.js";
import type { RegionLinkKind, Vec3 } from "../../world/types.js";
import { SEA_STACK } from "./terrain.js";

/** Access tiers: the configuration a player has when they first need a place.
 * `depth` is the conservative working depth for both the craft and the
 * suited diver at that stage (EXPEDITION_INTEGRATION "Reachability before
 * protection"). `protections` lists hazard protections the tier provides. */
export const ACCESS_TIERS = {
  starter: { depth: 60, protections: [], label: "Unprotected diver, no craft" },
  early: { depth: 150, protections: [], label: "150 m suit and Dart (180 m)" },
  reinforced: { depth: 350, protections: [], label: "Canopy reinforcement: 350 m suit, Dart/Creel 350" },
  service: { depth: 450, protections: [], label: "Ceramic/core refit: Creel 450, Hush, 450 m suit" },
  deep: { depth: 800, protections: ["thermal", "chemical"], label: "Deep service package: Creel 800 / Mantle, 800 m suit" },
  carrier: { depth: 400, protections: [], label: "Hearthline" },
  carrier_upgraded: { depth: 550, protections: [], label: "Hearthline 550 refit" },
} as const satisfies Record<string, { depth: number; protections: readonly Protection[]; label: string }>;
export type AccessTierId = keyof typeof ACCESS_TIERS;
export type Protection = "thermal" | "chemical";

/** Swept clearance profiles, matching HULL_COLLIDERS (keel datum, metres). */
export const CRAFT_PROFILES = {
  carrier: { radius: 17, height: 9.2, bottom: -0.5 },
  medium: { radius: 4.5, height: 4, bottom: 0 },
  small: { radius: 3.6, height: 2.1, bottom: 0 },
  diver: { radius: 0.34, height: 0.95, bottom: 0 },
} as const;
export type CraftProfileId = keyof typeof CRAFT_PROFILES;

export type RouteRole = "first_loop" | "primary" | "alternate" | "shortcut" | "service" | "carrier" | "walk" | "surface";
export interface RouteDef {
  readonly id: string;
  readonly from: RegionId;
  readonly to: RegionId;
  readonly kind: RegionLinkKind;
  readonly role: RouteRole;
  /** The Hearthline can make this crossing (broad, deep enough, turning room). */
  readonly carrier: boolean;
  /** Narrowest lateral half-width the art must keep open, metres. */
  readonly minHalfWidth: number;
  /** Hull class the clearance test sweeps along the path. */
  readonly profile: CraftProfileId;
  /** Least configuration that can use it with margin. */
  readonly tier: AccessTierId;
  /** Keel (or diver/walker) centre line. Surface legs sit at y -0.5. */
  readonly path: readonly Readonly<Vec3>[];
  /** Pre-S2 route kept unchanged; clearance owned by existing tests. */
  readonly legacy?: boolean;
  readonly note?: string;
}

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/** The stack ramp, sampled on the same arc the floor carves (terrain.ts). */
function stackRamp(): Vec3[] {
  const out: Vec3[] = [v(449, 4.2, 62)];
  for (let i = 0; i <= 24; i++) {
    const phi = i * 5, theta = (-116 - phi) * Math.PI / 180, r = 37;
    const x = SEA_STACK.x + r * Math.cos(theta), z = SEA_STACK.z + r * Math.sin(theta) / 1.08;
    out.push(v(x, 3.4 + (46 - 3.4) * phi / 120 + 0.9, z));
  }
  out.push(v(452, 46.9, 102));
  return out;
}
/** Headland crest walk: beach, shelter, meadow, summit. */
function headlandWalk(): Vec3[] {
  const a = [955, -8], b = [1125, 108], len = Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!);
  const ux = (b[0]! - a[0]!) / len, uz = (b[1]! - a[1]!) / len;
  const out: Vec3[] = [];
  for (let u = -114; u <= 92; u += 6) {
    const s = u + len / 2, vv = -8;
    out.push(v(a[0]! + s * ux - vv * uz, NaN, a[1]! + s * uz + vv * ux));
  }
  return out;
}

export const ROUTES: readonly RouteDef[] = [
  // Existing first loop, unchanged.
  { id: "route.legacy.reef_canopy", from: "refuge_reef", to: "suspended_garden", kind: "open", role: "first_loop",
    carrier: false, minHalfWidth: CANOPY_BASIN_ROUTE.minimumHalfWidth, profile: "small", tier: "early",
    path: CANOPY_BASIN_ROUTE.upper, legacy: true },
  { id: "route.legacy.canopy_basin", from: "suspended_garden", to: "silt_basin", kind: "open", role: "first_loop",
    carrier: false, minHalfWidth: CANOPY_BASIN_ROUTE.minimumHalfWidth, profile: "small", tier: "early",
    path: CANOPY_BASIN_ROUTE.basin, legacy: true },
  { id: "route.legacy.basin_return", from: "silt_basin", to: "refuge_reef", kind: "open", role: "first_loop",
    carrier: false, minHalfWidth: CANOPY_BASIN_ROUTE.minimumHalfWidth, profile: "small", tier: "early",
    path: CANOPY_BASIN_ROUTE.returnLoop, legacy: true },
  { id: "route.legacy.reef_isles", from: "refuge_reef", to: "island_chain", kind: "land", role: "first_loop",
    carrier: false, minHalfWidth: 2, profile: "diver", tier: "starter",
    path: [v(0, -0.5, 6), v(10, -0.5, -20), v(10, 0.6, -31)], legacy: true },

  // Splitspine Isles.
  { id: "route.isles.workshop_stack", from: "island_chain", to: "island_chain", kind: "open", role: "surface",
    carrier: false, minHalfWidth: 6, profile: "small", tier: "starter",
    path: [v(48, -0.5, -66), v(200, -0.5, -40), v(380, -0.5, 10), v(449, -0.5, 30)],
    note: "Surface crossing: swim, Dart or Spindle. Breathable throughout." },
  { id: "route.isles.stack_headland", from: "island_chain", to: "island_chain", kind: "open", role: "surface",
    carrier: false, minHalfWidth: 6, profile: "small", tier: "starter",
    path: [v(470, -0.5, -40), v(700, -0.5, -50), v(900, -0.5, -45), v(944, -0.5, -22)] },
  { id: "route.isles.stack_cleft", from: "island_chain", to: "island_chain", kind: "passage", role: "shortcut",
    carrier: false, minHalfWidth: 5.5, profile: "small", tier: "early",
    path: [v(467, -4, 20), v(468, -4, 60), v(470, -4, 95), v(472, -4, 130), v(472, -4, 152)],
    note: "The split: small craft only. Shortcut from the yard to the north rim." },
  { id: "walk.isles.stack_ramp", from: "island_chain", to: "island_chain", kind: "land", role: "walk",
    carrier: false, minHalfWidth: 3, profile: "diver", tier: "starter", path: stackRamp() },
  { id: "walk.isles.headland_crest", from: "island_chain", to: "island_chain", kind: "land", role: "walk",
    carrier: false, minHalfWidth: 3, profile: "diver", tier: "starter", path: headlandWalk(),
    note: "Path y is resolved on the floor (NaN here); the test checks walkable gradient." },

  // Isles -> Canopy east -> Basin: the carrier's early working line.
  { id: "route.isles.canopy_east", from: "island_chain", to: "suspended_garden", kind: "open", role: "carrier",
    carrier: true, minHalfWidth: 30, profile: "carrier", tier: "carrier",
    path: [v(470, -12, -6), v(500, -30, -60), v(560, -80, -120), v(600, -130, -170), v(620, -160, -200)] },
  { id: "route.isles.headland_canopy", from: "island_chain", to: "suspended_garden", kind: "open", role: "primary",
    carrier: false, minHalfWidth: 8, profile: "medium", tier: "early",
    path: [v(944, -2, -22), v(920, -40, -90), v(840, -100, -150), v(720, -140, -190), v(640, -156, -200)] },
  { id: "route.canopy_east.basin", from: "suspended_garden", to: "silt_basin", kind: "open", role: "carrier",
    carrier: true, minHalfWidth: 30, profile: "carrier", tier: "carrier",
    path: [v(620, -160, -200), v(560, -188, -290), v(460, -222, -380), v(360, -240, -430)] },

  // Pale Basin internal.
  { id: "route.basin.dish_field", from: "silt_basin", to: "silt_basin", kind: "open", role: "primary",
    carrier: false, minHalfWidth: 8, profile: "medium", tier: "reinforced",
    path: [v(360, -240, -430), v(420, -248, -490), v(470, -258, -560), v(492, -262, -600)] },
  { id: "route.basin.wreck_ridge", from: "silt_basin", to: "silt_basin", kind: "open", role: "primary",
    carrier: false, minHalfWidth: 8, profile: "medium", tier: "reinforced",
    path: [v(360, -240, -430), v(520, -246, -440), v(700, -244, -446), v(780, -248, -444)] },
  { id: "route.basin.wreck_south", from: "silt_basin", to: "silt_basin", kind: "open", role: "primary",
    carrier: false, minHalfWidth: 8, profile: "medium", tier: "reinforced",
    path: [v(780, -248, -444), v(786, -246, -530), v(783, -250, -612)] },

  // Basin -> Rift: carrier anchorage to cool-flank mooring, then deposits.
  { id: "route.basin.rift", from: "silt_basin", to: "thermal_rift", kind: "open", role: "carrier",
    carrier: true, minHalfWidth: 30, profile: "carrier", tier: "carrier",
    path: [v(360, -240, -430), v(290, -246, -520), v(205, -252, -590), v(140, -262, -680),
      v(105, -282, -800), v(91.4, -300, -887.5)] },
  { id: "route.rift.ceramic", from: "thermal_rift", to: "thermal_rift", kind: "ledge", role: "primary",
    carrier: false, minHalfWidth: 8, profile: "medium", tier: "reinforced",
    path: [v(91.4, -300, -887.5), v(118, -256, -940), v(95.6, -256, -966), v(42, -256, -1022), v(-6.8, -264, -1090)],
    note: "First ceramic: both lips on the cooled upper ledge, never deeper than 300 m." },
  { id: "route.rift.core", from: "thermal_rift", to: "thermal_rift", kind: "ledge", role: "primary",
    carrier: false, minHalfWidth: 8, profile: "medium", tier: "reinforced",
    path: [v(91.4, -300, -887.5), v(20, -282, -830), v(-60, -284, -770), v(-97.6, -292, -747.7),
      v(-200, -284, -880), v(-270, -292, -980), v(-307.1, -302, -1043.2)],
    note: "First core: crosses high over the cool trench head, then the quiet north-west shoulder." },
  { id: "route.rift.west_return", from: "thermal_rift", to: "silt_basin", kind: "open", role: "shortcut",
    carrier: false, minHalfWidth: 8, profile: "medium", tier: "reinforced",
    path: [v(-97.6, -292, -747.7), v(-180, -250, -650), v(-232, -215, -480), v(-228, -165, -330)] },
  { id: "route.basin.reef_west", from: "silt_basin", to: "refuge_reef", kind: "passage", role: "shortcut",
    carrier: false, minHalfWidth: 8, profile: "medium", tier: "reinforced",
    path: [v(-228, -165, -330), v(-240, -126, -262), v(-246, -84, -172), v(-236, -30, -100),
      v(-150, -10, -40), v(-60, -5, 0), v(-8, -2.5, 4)],
    note: "The Hearth drop: Rift and Basin return to the pod without the Canopy loop." },

  // Rift -> Divide: the independent (Creel) line.
  { id: "route.rift.divide_flank", from: "thermal_rift", to: "brine_divide", kind: "ledge", role: "alternate",
    carrier: false, minHalfWidth: 8, profile: "medium", tier: "service",
    path: [v(-6.8, -264, -1090), v(60, -276, -1130), v(150, -310, -1170), v(230, -345, -1195), v(336.5, -360, -1188.5)],
    note: "The cooled flank reconnects to the Divide's western ridge; also the first-lattice line." },

  // Basin -> Divide: carrier line to the lee mooring.
  { id: "route.basin.divide", from: "silt_basin", to: "brine_divide", kind: "open", role: "carrier",
    carrier: true, minHalfWidth: 30, profile: "carrier", tier: "carrier",
    path: [v(360, -240, -430), v(300, -290, -600), v(330, -330, -760), v(430, -360, -900),
      v(520, -378, -1020), v(560, -390, -1120)] },
  { id: "route.divide.lattice_east", from: "brine_divide", to: "brine_divide", kind: "ledge", role: "primary",
    carrier: false, minHalfWidth: 8, profile: "medium", tier: "service",
    path: [v(560, -390, -1120), v(660, -380, -1160), v(749, -370, -1191)] },
  { id: "route.divide.lattice_west", from: "brine_divide", to: "brine_divide", kind: "ledge", role: "primary",
    carrier: false, minHalfWidth: 8, profile: "medium", tier: "service",
    path: [v(560, -390, -1120), v(450, -376, -1160), v(336.5, -360, -1188.5)] },

  // Divide -> Meridian: broad exterior approach (carrier) and the narrow ledge.
  { id: "route.divide.meridian_broad", from: "brine_divide", to: "deep_district", kind: "open", role: "carrier",
    carrier: true, minHalfWidth: 30, profile: "carrier", tier: "carrier_upgraded",
    path: [v(560, -390, -1120), v(760, -378, -1128), v(900, -370, -1136), v(980, -440, -1150), v(1080, -520, -1160)] },
  { id: "route.divide.service_ledge", from: "brine_divide", to: "deep_district", kind: "ledge", role: "service",
    carrier: false, minHalfWidth: 8, profile: "medium", tier: "deep",
    path: [v(632, -366, -1230), v(600, -400, -1250), v(600, -405, -1285), v(620, -411, -1323),
      v(700, -411, -1318), v(771, -411, -1311), v(874, -411, -1293), v(977, -411, -1270),
      v(1000, -450, -1300), v(1005, -520, -1360), v(1000, -592, -1400)],
    note: "Small craft only: a 16 m bench 30 m above the mirror. Shortcut to the lower terraces." },

  // Meridian exterior and the escarpment return.
  { id: "route.meridian.terraces", from: "deep_district", to: "deep_district", kind: "open", role: "primary",
    carrier: false, minHalfWidth: 8, profile: "medium", tier: "deep",
    path: [v(1080, -520, -1160), v(1150, -512, -1240), v(1190, -590, -1300), v(1279, -672, -1396), v(1400, -762, -1530)] },
  { id: "route.meridian.escarpment", from: "deep_district", to: "suspended_garden", kind: "ledge", role: "shortcut",
    carrier: false, minHalfWidth: 8, profile: "medium", tier: "deep",
    path: [v(1080, -520, -1160), v(1220, -512, -1080), v(1370, -505, -1000), v(1371, -497, -900),
      v(1330, -474, -760), v(1365, -444, -620), v(1348, -396, -500), v(1345, -324, -420),
      v(1350, -240, -340), v(1300, -214, -300), v(1150, -196, -270), v(900, -172, -232), v(620, -160, -200)],
    note: "Surveyed outer escarpment: deep exposure most of the way, a return line to the Canopy mooring." },
];
