/** Restored bases with a bunk: where you rest, and so where you wake after
 * being incapacitated (owner, GAME-DIRECTION "Central hub": you wake at the last
 * restored base you rested at). Resting is being in the base's refuge while it
 * works; the pod is the guaranteed fallback and never needs restoring.
 *
 * W2's crown station joins this table as one more row when it is built.
 * Stable IDs are saved in `player.refugeId`. */
import { WORKING_STOPS } from "./stops.js";
import { PLACES } from "./registry.js";

interface Point { readonly x: number; readonly y: number; readonly z: number }
export interface RestBase {
  readonly label: string;
  /** Facility that must be restored for its bunk to work; null works from New Game. */
  readonly facility: string | null;
  /** Where you wake: feet on the bunk room floor or the stop's air pocket. */
  readonly wake: Point;
}

export const REST_BASES = {
  home_pod: { label: PLACES.home_pod.label, facility: null, wake: PLACES.home_pod.position },
  island_workshop: { label: PLACES.island_workshop.label, facility: "island_workshop", wake: { x: 10, y: 1.2, z: -34 } },
  rift_station: { label: WORKING_STOPS.rift_station.label, facility: "rift_station", wake: WORKING_STOPS.rift_station.work },
  divide_dock: { label: WORKING_STOPS.divide_dock.label, facility: "divide_dock", wake: WORKING_STOPS.divide_dock.work },
  meridian_office: { label: WORKING_STOPS.meridian_office.label, facility: null, wake: WORKING_STOPS.meridian_office.work },
} as const satisfies Record<string, RestBase>;
export type RestBaseId = keyof typeof REST_BASES;
export const REST_BASE_IDS = Object.keys(REST_BASES) as RestBaseId[];
export const isRestBase = (id: unknown): id is RestBaseId => typeof id === "string" && Object.hasOwn(REST_BASES, id);
