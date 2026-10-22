import { CANOPY_BASIN_ROUTE } from "../routes.js";
import type { RegionId } from "../registry.js";
import type { RegionLinkKind, Vec3 } from "../../world/types.js";
import { drape } from "./drape.js";
import { DIVIDE_RIDGE, SEA_STACK, SERVICE_LEDGE_Y, escarpmentLedgeDepth, escarpmentLedgeX, stackCleftX } from "./terrain.js";

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
  const out: Vec3[] = [v(449, NaN, 62)];
  const at = (phi: number, r: number): Vec3 => {
    const theta = (-116 - phi) * Math.PI / 180;
    return v(SEA_STACK.x + r * Math.cos(theta), NaN, SEA_STACK.z + r * Math.sin(theta) / 1.08);
  };
  for (let phi = 0; phi <= 115; phi += 5) out.push(at(phi, 37));
  out.push(at(115, 30), v(455, NaN, 98));
  return out;
}
/** Headland crest walk: beach, shelter, meadow, summit. */
function headlandWalk(): Vec3[] {
  const a = [955, -8], b = [1125, 108], len = Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!);
  const ux = (b[0]! - a[0]!) / len, uz = (b[1]! - a[1]!) / len;
  const out: Vec3[] = [];
  for (let u = -104; u <= 92; u += 6) {
    const s = u + len / 2, vv = -8;
    out.push(v(a[0]! + s * ux - vv * uz, NaN, a[1]! + s * uz + vv * ux));
  }
  return out;
}

/** The Divide's cut bench: `d` metres south of the crest, gate to Meridian. */
function serviceBench(d = 62): Vec3[] {
  const out: Vec3[] = [];
  for (let x = 620; x <= 980; x += 30) {
    for (let i = 0; i < DIVIDE_RIDGE.length - 1; i++) {
      const [ax, az] = DIVIDE_RIDGE[i]!, [bx, bz] = DIVIDE_RIDGE[i + 1]!;
      if (x < ax || x > bx) continue;
      const t = (x - ax) / (bx - ax), len = Math.hypot(bx - ax, bz - az);
      const sx = (bz - az) / len, sz = -(bx - ax) / len;
      out.push(v(x + sx * d, SERVICE_LEDGE_Y + 1, az + (bz - az) * t + sz * d));
      break;
    }
  }
  return out;
}
/** The escarpment's surveyed ledge, south to north. */
function escarpmentLedge(): Vec3[] {
  const out: Vec3[] = [];
  for (let z = -1000; z <= -340; z += 30) out.push(v(escarpmentLedgeX(z), -escarpmentLedgeDepth(z) + 6, z));
  return out;
}

/** Authored keel lines before `drape` (tests compare the two). */
export const RAW_ROUTES: readonly RouteDef[] = [
  // Existing first loop, unchanged.
  { id: "route.legacy.reef_canopy", from: "refuge_reef", to: "suspended_garden", kind: "open", role: "first_loop",
    carrier: false, minHalfWidth: CANOPY_BASIN_ROUTE.minimumHalfWidth, profile: "small", tier: "early",
    path: CANOPY_BASIN_ROUTE.upper, legacy: true },
  { id: "route.legacy.canopy_basin", from: "suspended_garden", to: "silt_basin", kind: "open", role: "first_loop",
    carrier: false, minHalfWidth: CANOPY_BASIN_ROUTE.minimumHalfWidth, profile: "small", tier: "reinforced",
    path: CANOPY_BASIN_ROUTE.basin, legacy: true },
  { id: "route.legacy.basin_return", from: "silt_basin", to: "refuge_reef", kind: "open", role: "first_loop",
    carrier: false, minHalfWidth: CANOPY_BASIN_ROUTE.minimumHalfWidth, profile: "small", tier: "reinforced",
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
    path: Array.from({ length: 27 }, (_, i) => v(stackCleftX(22 + i * 5), -4, 22 + i * 5)),
    note: "The split: small craft only. Shortcut from the yard to the north rim." },
  { id: "walk.isles.stack_ramp", from: "island_chain", to: "island_chain", kind: "land", role: "walk",
    carrier: false, minHalfWidth: 3, profile: "diver", tier: "starter", path: stackRamp() },
  { id: "walk.isles.headland_crest", from: "island_chain", to: "island_chain", kind: "land", role: "walk",
    carrier: false, minHalfWidth: 3, profile: "diver", tier: "starter", path: headlandWalk(),
    note: "Path y is resolved on the floor (NaN here); the test checks walkable gradient." },

  // Isles -> Canopy east -> Basin: the carrier's early working line.
  { id: "route.isles.canopy_east", from: "island_chain", to: "suspended_garden", kind: "open", role: "carrier",
    carrier: true, minHalfWidth: 30, profile: "carrier", tier: "carrier",
    path: [v(470, -12, -6), v(470, -20, -50), v(520, -60, -110), v(580, -110, -160), v(620, -160, -200)] },
  { id: "route.isles.headland_canopy", from: "island_chain", to: "suspended_garden", kind: "open", role: "primary",
    carrier: false, minHalfWidth: 8, profile: "medium", tier: "reinforced",
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

  // Central hub spur (W2): apron to crown over the stepping stones, the
  // anchorage up the crown's north cliff, and the crown's Canopy leg.
  { id: "route.hub.spur", from: "silt_basin", to: "silt_basin", kind: "open", role: "primary",
    carrier: false, minHalfWidth: 8, profile: "small", tier: "early",
    path: [v(-14, -10, -318), v(18, -12, -342), v(40, -20, -366), v(80, -31, -400), v(133, -34, -432),
      v(186, -36, -464), v(258, -38, -512), v(312, -40, -552)],
    note: "Over the reef heads and both steps: a diver hops it, a Dart runs it at speed." },
  { id: "route.hub.balcony", from: "silt_basin", to: "silt_basin", kind: "open", role: "primary",
    carrier: false, minHalfWidth: 8, profile: "medium", tier: "reinforced",
    path: [v(360, -240, -430), v(356, -200, -468), v(352, -126, -506), v(350, -116, -516), v(350, -100, -518),
      v(346, -68, -532), v(336, -50, -546), v(318, -44, -548)],
    note: "Carrier anchorage up the crown's north cliff to the rim balcony, then the summit." },
  { id: "route.hub.canopy", from: "silt_basin", to: "suspended_garden", kind: "open", role: "shortcut",
    carrier: false, minHalfWidth: 8, profile: "medium", tier: "reinforced",
    path: [v(336, -46, -546), v(370, -52, -500), v(430, -80, -420), v(500, -120, -330), v(560, -150, -255), v(620, -160, -200)],
    note: "The crown and its beacon at your back, the Lantern crowns ahead." },

  { id: "route.basin.legacy_anchorage", from: "silt_basin", to: "silt_basin", kind: "open", role: "primary",
    carrier: false, minHalfWidth: 8, profile: "small", tier: "reinforced",
    path: [v(216, -166, -232), v(216, -150, -228), v(260, -175, -290), v(300, -212, -370), v(360, -240, -430)],
    note: "Joins the existing Basin route end to the full Basin's anchorage." },

  // Basin -> Rift: carrier anchorage to cool-flank mooring, then deposits.
  { id: "route.basin.rift", from: "silt_basin", to: "thermal_rift", kind: "open", role: "carrier",
    carrier: true, minHalfWidth: 30, profile: "carrier", tier: "carrier",
    // W2: west off the anchorage, then between the second step and the crown at depth.
    path: [v(360, -240, -430), v(306, -244, -458), v(250, -249, -505), v(228, -252, -560), v(205, -254, -590), v(140, -262, -680),
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
    // W2: shares the Rift lane through the step-two/crown gap, then south past the crown's west foot.
    path: [v(360, -240, -430), v(306, -244, -458), v(250, -249, -505), v(228, -252, -560), v(242, -262, -620), v(262, -280, -690),
      v(330, -330, -760), v(430, -360, -900), v(520, -378, -1020), v(560, -390, -1120)] },
  { id: "route.divide.lattice_east", from: "brine_divide", to: "brine_divide", kind: "open", role: "primary",
    carrier: false, minHalfWidth: 8, profile: "medium", tier: "service",
    path: [v(560, -390, -1120), v(660, -380, -1160), v(749, -370, -1191)] },
  { id: "route.divide.lattice_west", from: "brine_divide", to: "brine_divide", kind: "open", role: "primary",
    carrier: false, minHalfWidth: 8, profile: "medium", tier: "service",
    path: [v(560, -390, -1120), v(450, -376, -1160), v(336.5, -360, -1188.5)] },

  // Divide -> Meridian: broad exterior approach (carrier) and the narrow ledge.
  { id: "route.divide.meridian_broad", from: "brine_divide", to: "deep_district", kind: "open", role: "carrier",
    carrier: true, minHalfWidth: 30, profile: "carrier", tier: "carrier_upgraded",
    path: [v(560, -390, -1120), v(760, -378, -1128), v(900, -370, -1136), v(980, -440, -1150), v(1080, -520, -1160)] },
  { id: "route.divide.service_ledge", from: "brine_divide", to: "deep_district", kind: "ledge", role: "service",
    carrier: false, minHalfWidth: 8, profile: "medium", tier: "deep",
    path: [v(632, -372, -1224), v(600, -400, -1250), v(600, -405, -1285), ...serviceBench(),
      v(1000, -450, -1300), v(1012, -520, -1370), v(1010.8, -594, -1407.4)],
    note: "Small craft only: a 16 m bench 30 m above the mirror. Shortcut to the lower terraces." },

  // Meridian exterior and the escarpment return.
  { id: "route.meridian.terraces", from: "deep_district", to: "deep_district", kind: "open", role: "primary",
    carrier: false, minHalfWidth: 8, profile: "medium", tier: "deep",
    path: [v(1080, -520, -1160), v(1150, -512, -1240), v(1170, -588, -1300), v(1240, -596, -1360),
      v(1268, -674, -1384), v(1300, -680, -1385), v(1320, -690, -1420), v(1400, -762, -1530)] },
  { id: "route.meridian.escarpment", from: "deep_district", to: "suspended_garden", kind: "ledge", role: "shortcut",
    carrier: false, minHalfWidth: 8, profile: "medium", tier: "deep",
    path: [v(1080, -520, -1160), v(1160, -510, -1160), v(1240, -510, -1090), ...escarpmentLedge(), v(1300, -214, -300)],
    note: "Surveyed outer escarpment: deep exposure most of the way, a return line to the Canopy." },
  { id: "route.canopy_east.margin", from: "suspended_garden", to: "suspended_garden", kind: "open", role: "shortcut",
    carrier: false, minHalfWidth: 8, profile: "medium", tier: "reinforced",
    path: [v(1300, -214, -300), v(1150, -196, -270), v(900, -172, -232), v(620, -160, -200)],
    note: "Escarpment head west along the Canopy's lower margin to the mooring." },
];

/** Authored keel lines laid over the shared floor (see `drape`). Legacy,
 * surface and walking paths are kept exactly as written. */
export const ROUTES: readonly RouteDef[] = RAW_ROUTES.map(r => {
  if (r.legacy || r.role === "walk" || r.role === "surface") return r;
  const c = CRAFT_PROFILES[r.profile];
  const radius = Math.max(c.radius, r.kind === "passage" || r.kind === "ledge" ? c.radius : r.minHalfWidth);
  return { ...r, path: drape(r.path, radius, r.profile === "carrier" ? 3 : 1.5) };
});
