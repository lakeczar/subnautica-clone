import type { RegionId } from "../registry.js";
import type { Vec3 } from "../../world/types.js";
import { drape } from "./drape.js";

/** Local rescue access for every deep, loss-capable S2 site
 * (FLEET_AND_SURVIVAL "Recovery without erasing the expedition").
 *
 * Each plan has a breathable surface stage that starter gear reaches by
 * swimming from the pod (`approach`, all at the surface), and authored Bobbin
 * tether branches from that stage. Branches are guided corridors: they run
 * clear of the floor, every solid and every protective hazard, wide enough to
 * tow a medium hull back up the same line to the plan's repair `mooring`.
 * A site inside a protective hazard is recovered at a nearby `shelf` vertex
 * outside it (the explicit emergency-move rule). */
export interface RescuePlan {
  readonly id: string;
  readonly region: RegionId;
  readonly stage: Readonly<Vec3>;
  /** Surface swim from the pod's ramp to the stage. */
  readonly approach: readonly Readonly<Vec3>[];
  /** Each branch starts at the stage. */
  readonly tethers: readonly (readonly Readonly<Vec3>[])[];
  /** Proposal: tether length the shallow-built kit carries for this plan. */
  readonly maximumTether: number;
  /** Safe repair mooring or refuge site reached along the tethers. */
  readonly mooring: string;
}

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const S = -0.5;
/** Shared surface trunk off the pod, east past the island's rescue bench. */
const TRUNK = [v(0, S, 6), v(40, S, -10), v(60, S, -90)];
const approach = (...rest: Vec3[]): Vec3[] => [...TRUNK, ...rest];
/** Proposed deep kit tether; legacy Basin route uses 650 m. */
export const DEEP_TETHER = 950;

const RAW_PLANS: readonly RescuePlan[] = [
  { id: "rescue.canopy_east", region: "suspended_garden", stage: v(640, S, -210), maximumTether: 400,
    mooring: "canopy.east_mooring", approach: approach(v(640, S, -210)),
    tethers: [
      [v(640, S, -210), v(630, -150, -205), v(620, -158, -200)],
      [v(640, S, -210), v(630, -150, -205), v(646, -160, -182), v(588, -158, -168)],
      [v(640, S, -210), v(630, -150, -205), v(668, -160, -228)],
    ] },
  { id: "rescue.basin", region: "silt_basin", stage: v(440, S, -470), maximumTether: 700, mooring: "basin.anchorage",
    approach: approach(v(440, S, -470)),
    tethers: [
      [v(440, S, -470), v(400, -200, -450), v(360, -232, -430)],
      [v(440, S, -470), v(450, -220, -520), v(462, -260, -546), v(440, -258, -528)],
      [v(440, S, -470), v(450, -220, -520), v(500, -250, -560), v(532, -262, -545)],
      [v(440, S, -470), v(450, -220, -520), v(500, -250, -560), v(492, -262, -600), v(578, -256, -612)],
      [v(440, S, -470), v(560, -300, -680), v(612, -372, -748), v(620, -374, -760)],
    ] },
  { id: "rescue.basin_east", region: "silt_basin", stage: v(760, S, -520), maximumTether: 500, mooring: "basin.anchorage",
    approach: approach(v(760, S, -520)),
    tethers: [
      [v(760, S, -520), v(760, -230, -470), v(780, -248, -444)],
      [v(760, S, -520), v(760, -230, -470), v(786, -244, -500)],
      [v(760, S, -520), v(760, -230, -520), v(783, -250, -612)],
    ] },
  { id: "rescue.basin_west", region: "silt_basin", stage: v(-228, S, -318), maximumTether: 300, mooring: "basin.anchorage",
    approach: approach(v(-120, S, -200), v(-228, S, -318)),
    tethers: [[v(-228, S, -318), v(-228, -156, -318)]] },
  { id: "rescue.rift", region: "thermal_rift", stage: v(100, S, -900), maximumTether: DEEP_TETHER,
    mooring: "rift.cool_mooring", approach: approach(v(100, S, -900)),
    tethers: [
      [v(100, S, -900), v(92, -292, -888)],
      [v(100, S, -900), v(120, -240, -935), v(136, -252, -934)],
      [v(100, S, -900), v(120, -240, -935), v(95.6, -254, -962), v(42, -246, -1030)],
      [v(100, S, -900), v(120, -240, -935), v(42, -246, -1030), v(-6.8, -260, -1092),
        v(-60, -282, -1114), v(-96, -298, -1106), v(-126, -372, -1084), v(-96, -298, -1106), v(-125, -300, -1062)],
      [v(100, S, -900), v(120, -240, -935), v(42, -246, -1030), v(-6.8, -260, -1086), v(80, -280, -1140), v(150, -315, -1170)],
      [v(100, S, -900), v(172, -200, -640), v(172, -250, -606)],
    ] },
  { id: "rescue.rift_west", region: "thermal_rift", stage: v(-200, S, -900), maximumTether: DEEP_TETHER,
    mooring: "rift.cool_mooring", approach: approach(v(-200, S, -900)),
    tethers: [
      [v(-200, S, -900), v(-110, -270, -760), v(-98, -288, -748)],
      [v(-200, S, -900), v(-110, -270, -760), v(-140, -280, -752)],
      [v(-200, S, -900), v(-280, -280, -1010), v(-307, -298, -1043)],
      [v(-200, S, -900), v(-280, -280, -1010), v(-250, -320, -1120), v(-232, -392, -1146)],
    ] },
  { id: "rescue.divide", region: "brine_divide", stage: v(560, S, -1150), maximumTether: DEEP_TETHER,
    mooring: "divide.lee_mooring", approach: approach(v(560, S, -1150)),
    tethers: [
      [v(560, S, -1150), v(560, -384, -1122)],
      [v(560, S, -1150), v(450, -300, -1160), v(344, -358, -1186)],
      [v(560, S, -1150), v(450, -300, -1160), v(470, -350, -1262)],
      [v(560, S, -1150), v(680, -300, -1170), v(749, -368, -1191)],
      [v(560, S, -1150), v(610, -330, -1215), v(632, -372, -1224), v(600, -390, -1240), v(570, -390, -1250)],
      [v(560, S, -1150), v(610, -330, -1215), v(632, -372, -1224), v(600, -400, -1250), v(600, -400, -1262),
        v(600, -405, -1285), v(620, -406, -1324), v(520, -432, -1336)],
    ] },
  { id: "rescue.meridian", region: "deep_district", stage: v(1100, S, -1180), maximumTether: DEEP_TETHER,
    mooring: "meridian.staging_shelf", approach: approach(v(1100, S, -1180)),
    tethers: [
      [v(1100, S, -1180), v(1082, -514, -1162)],
      [v(1100, S, -1180), v(1120, -480, -1110), v(1132, -514, -1110), v(1150, -512, -1093)],
      [v(1100, S, -1180), v(1200, -480, -1300), v(1210, -540, -1306)],
      [v(1100, S, -1180), v(1250, -500, -1150), v(1302, -594, -1143)],
      [v(1100, S, -1180), v(1040, -500, -1300), v(1010.8, -594, -1407.4)],
      [v(1100, S, -1180), v(1150, -480, -1360), v(1172, -598, -1394)],
    ] },
  { id: "rescue.meridian_works", region: "deep_district", stage: v(1360, S, -1470), maximumTether: DEEP_TETHER,
    mooring: "meridian.staging_shelf", approach: approach(v(1360, S, -1470)),
    tethers: [
      [v(1360, S, -1470), v(1300, -640, -1400), v(1268, -674, -1384)],
      [v(1360, S, -1470), v(1400, -740, -1530), v(1430, -764, -1556)],
    ] },
  { id: "rescue.escarpment", region: "deep_district", stage: v(1346, S, -880), maximumTether: DEEP_TETHER,
    mooring: "canopy.east_mooring", approach: approach(v(1346, S, -880)),
    tethers: [
      [v(1346, S, -880), v(1346, -494, -880)],
      [v(1346, S, -880), v(1366, -460, -960), v(1366, -500, -1000)],
      [v(1346, S, -880), v(1330, -200, -420), v(1300, -218, -300)],
    ] },
];

/** Tether branches laid over the shared floor with medium-hull tow clearance. */
export const RESCUE_PLANS: readonly RescuePlan[] = RAW_PLANS.map(p =>
  ({ ...p, tethers: p.tethers.map(b => drape(b, 4.5, 1.5)) }));
