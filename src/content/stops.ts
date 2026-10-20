/** C3: S9's working sites and service stops placed at S2's sites.
 *
 * Every pose comes from S2: the diver `work` pose and the craft `mooring` (S2's
 * park pose) via `workPose`/`parkPose`, so a stop's services sit exactly where
 * S2 proved first access and rescue. A stop with a `facility` works once its
 * restoration recipe is paid; one without works from New Game. Services:
 * - `air`: the diver at the work pose breathes and rests (a refuge);
 * - `service`: an unberthed craft within `serviceRadius` of the mooring can be
 *   charged and repaired (`service` command), change modules and lend its hold
 *   to fabrication at this site;
 * - `locker`: a fixed 48 CU locker opened at the work pose;
 * - `fabrication`: S9's recipes whose `site` is this stop run here. */
import type { CampaignSiteId } from "./campaign/sites.js";
import { STOP_LOCKER_CU } from "./campaign/sites.js";
import { parkPose, workPose } from "./regions/access.js";
import { SITES } from "./regions/sites.js";
import { worldFloor } from "./regions/worldFloor.js";
import type { RegionId } from "./registry.js";

interface Point { readonly x: number; readonly y: number; readonly z: number }
export type StopFacilityId = "rift_station" | "divide_dock";
export interface WorkingStop {
  readonly label: string;
  readonly s2: string;
  readonly region: RegionId;
  readonly facility: StopFacilityId | null;
  /** Diver work pose (feet), from S2. */
  readonly work: Point;
  readonly workRadius: number;
  /** Craft keel pose, from S2's park pose. */
  readonly mooring: Point;
  readonly serviceRadius: number;
  readonly air: boolean;
  readonly locker: string | null;
  readonly fabrication: CampaignSiteId | null;
  /** Shown when a diver asks what the stop offers. */
  readonly offers: string;
}
const site = (id: string) => {
  const s = SITES.find((x) => x.id === id);
  if (!s) throw new Error(`S2 site ${id} is missing`);
  return s;
};
const stop = (s2: string, extra: Omit<WorkingStop, "s2" | "region" | "work" | "mooring" | "label"> & { label: string }): WorkingStop => {
  const s = site(s2);
  return { s2, region: s.region, work: workPose(s, worldFloor), mooring: parkPose(s, worldFloor), ...extra };
};

export const WORKING_STOPS = {
  /** The carrier's construction berth: hull builds, shore power, a yard store. */
  stack_yard: { ...stop("isles.stack_yard", {
    label: "Splitspine yard berth", facility: null, workRadius: 4, serviceRadius: 50, air: false,
    locker: "stack_yard_locker", fabrication: "stack_yard",
    offers: "Hull construction slips · shore power and repair · 48 CU yard store",
  }),
  // The yard is worked from the dry pier deck, clear of the carrier's berth. Its
  // supply mooring lies east of the pier, outside every build slip (P1 found S2's
  // berth datum inside the carrier's build clearance); the 50 m service radius
  // still reaches every slip, the carrier's berth included.
  work: { x: 470, y: 1.4, z: 21 }, mooring: { x: 484, y: -4, z: 24 } },
  rift_station: stop("rift.materials_station", {
    label: "Ember Rift materials station", facility: "rift_station", workRadius: 4, serviceRadius: 14, air: true,
    locker: "rift_station_locker", fabrication: "rift_station",
    offers: "Air and rest · hull service and cell charging · 48 CU locker",
  }),
  divide_dock: stop("divide.service_dock", {
    label: "Mirror Divide upper service dock", facility: "divide_dock", workRadius: 4, serviceRadius: 14, air: true,
    locker: "divide_dock_locker", fabrication: "divide_dock",
    offers: "Air and rest · hull service, cell charging and mount changes · 48 CU locker",
  }),
  /** S2's working exterior stop on the district shelf: no restoration needed. */
  meridian_office: stop("meridian.staging_office", {
    label: "District staging office", facility: null, workRadius: 4, serviceRadius: 14, air: true,
    locker: null, fabrication: null,
    offers: "Air and rest · hull service and cell charging",
  }),
} as const satisfies Record<string, WorkingStop>;
export type WorkingStopId = keyof typeof WORKING_STOPS;
export const STOP_IDS = Object.keys(WORKING_STOPS) as WorkingStopId[];
export { STOP_LOCKER_CU };
/** The stop with this ID or fabrication site, if any. */
export const stopForSite = (siteId: string): WorkingStopId | null =>
  STOP_IDS.find((id) => id === siteId || WORKING_STOPS[id].fabrication === siteId) ?? null;
/** Restoration recipe output → facility. */
export const STOP_RESTORATIONS = { restore_rift_station: "rift_station", restore_divide_stop: "divide_dock" } as const;

export { YARD_BUILD } from "./yard.js";

/** S2's moorings that list charging (S2 `services`): a craft moored within
 * MOORING_SERVICE_RADIUS of one is charged and repaired there, the carrier
 * included. The yard berth has its own stop above. (P1: the carrier route
 * stranded because the lee mooring refused the service S2 lists.) */
export const MOORING_SERVICE_RADIUS = 30;
export const SERVICE_MOORINGS = SITES.filter((x) => x.role === "mooring" && x.services?.includes("charge") && x.id !== "isles.stack_yard")
  .map((x) => ({ id: x.id, label: x.label, position: parkPose(x, worldFloor) }));
