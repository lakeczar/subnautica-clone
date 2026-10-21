/** S9 fabrication sites and service stops beyond today's pod, workshop and
 * outer-crown mooring. Each is one of S2's sites; `work` is S2's diver work
 * pose (or datum) and stays provisional until C3 composes S2's world. */
import type { RegionId } from "../registry.js";

export const CAMPAIGN_SITES = {
  /** S2 proposal accepted by the coordinator: the carrier's construction berth in
   * the stack's dredged southern lee, with a medium cradle and compact slips. */
  stack_yard: {
    label: "Splitspine yard berth", s2: "isles.stack_yard", region: "island_chain",
    work: { x: 470, y: -12, z: -6 }, depth: 12,
  },
  rift_station: {
    label: "Ember Rift materials station", s2: "rift.materials_station", region: "thermal_rift",
    work: { x: 135.6, y: -261.7, z: -913.5 }, depth: 262,
  },
  divide_dock: {
    label: "Mirror Divide upper service dock", s2: "divide.service_dock", region: "brine_divide",
    work: { x: 632, y: -365, z: -1238 }, depth: 365,
  },
} as const satisfies Record<string, {
  label: string; s2: string; region: RegionId; work: { x: number; y: number; z: number }; depth: number;
}>;
export type CampaignSiteId = keyof typeof CAMPAIGN_SITES;

export type StopService = "air" | "rest" | "charge" | "repair" | "locker" | "mounts";
/** Service stops along both routes. `planner` is S5's capability ID where the
 * story planner gates on the stop; `recipe` is null for a stop that already works. */
export const SERVICE_STOPS = {
  stop_canopy: {
    label: "Outer-crown service mooring", recipe: "restore_canopy_stop", site: "canopy_stop", depth: 138,
    services: ["repair", "charge", "locker", "mounts"], planner: "stop_canopy",
    purpose: "Hull service and charging past the Canopy; no air, the laboratory stays the refuge.",
  },
  stop_rift: {
    label: "Ember Rift materials station", recipe: "restore_rift_station", site: "rift_station", depth: 262,
    services: ["air", "rest", "charge", "repair", "locker"], planner: null,
    purpose: "Air and charge halfway between the Basin and the Divide, beside both first ceramic lips.",
  },
  stop_divide_lee: {
    label: "Mirror Divide upper service dock", recipe: "restore_divide_stop", site: "divide_dock", depth: 365,
    services: ["air", "rest", "charge", "repair", "locker", "mounts"], planner: "stop_divide_lee",
    purpose: "The Creel route's forward base: deep sorties to the district start and end here.",
  },
  stop_meridian: {
    label: "District staging office", recipe: null, site: "meridian.staging_office", depth: 520,
    services: ["air", "rest", "charge"], planner: null,
    purpose: "S2's working exterior stop on the staging shelf; no restoration needed.",
  },
} as const satisfies Record<string, {
  label: string; recipe: string | null; site: string; depth: number; services: readonly StopService[];
  planner: "stop_canopy" | "stop_divide_lee" | null; purpose: string;
}>;
export type ServiceStopId = keyof typeof SERVICE_STOPS;
/** Restored-stop lockers, CU; the Canopy stop's 48 CU locker already exists. */
export const STOP_LOCKER_CU = 48;
