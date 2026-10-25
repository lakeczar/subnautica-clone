/** HUB-2: the crown station on W2's summit, composed into C4's stops, hosts,
 * rest bases and recipes (`content/stops.ts`, `content/systems/hosts.ts`,
 * `content/bases.ts`, `content/campaign/recipes.ts`).
 *
 * Owner direction (GAME-DIRECTION "Central hub"): deliberately better than the
 * pod, restored in three stages with mid-game materials starting around the
 * Creel. Restored, it has a fast-heal bunk, a full fabricator with a refit and
 * upgrade bench, a dock that charges and repairs moored craft, large lockers,
 * six module sockets, a built-in survey station over the Basin, the Rift head
 * and the Canopy edge, and the beacon (lit from New Game; coordinator call).
 * You wake here once you have rested here while its power works; the pod stays
 * the guaranteed fallback.
 *
 * No imports from stops or hosts: they read this module. Metres, +Y up. */

/** The three facilities, in restoration order (saved in `world.facilities`). */
export const CROWN_FACILITIES = ["crown_power", "crown_dock", "crown_survey"] as const;
export type CrownFacilityId = (typeof CROWN_FACILITIES)[number];
/** Restoration recipe → facility, in order. */
export const CROWN_RESTORATIONS = {
  restore_crown_power: "crown_power",
  restore_crown_dock: "crown_dock",
  restore_crown_survey: "crown_survey",
} as const satisfies Record<string, CrownFacilityId>;
export type CrownRestorationId = keyof typeof CROWN_RESTORATIONS;

export const CROWN_STATION = {
  label: "Crown station",
  /** S2 site (W2 phase 1). */
  s2: "hub.crown_station",
  /** Diver pose at the door on the hull's north face (feet), and its reach. */
  work: { x: 319, y: -56.4, z: -542.4 },
  workRadius: 4,
  /** Keel pose at the dock: the summit's west lee, beside the spur's end. */
  dock: { x: 304, y: -45, z: -552 },
  /** A small or medium craft within this of the dock is serviced (stops use 14). */
  dockRadius: 14,
  /** Health per second on the bunk; every other refuge heals 1.8. */
  bunkHealRate: 5.4,
  /** The station locker (stage 1) and the two stores the dock stage opens. */
  locker: "crown_station_locker",
  stores: ["crown_station_store_a", "crown_station_store_b"],
  lockerCu: 48,
  sockets: 6,
  /** SYS-2 survey tier of the built-in array: 300 m, "Canopy survey". */
  surveyTier: 1,
  unique: "Refits and upgrades at the map's centre, a dock that repairs, the fastest bunk and a built-in survey array",
  offers: "Air and a fast-heal bunk (power and air) · dock service, full fabricator with refit and upgrade bench and 144 CU of lockers (dock) · six sockets and the survey array (survey)",
} as const;

/** The crown's surface mast (owner, OPENING-DESIGN "Dependencies"): a slim
 * tower from the summit's south lee to above the waterline, its slow lamp at
 * the surface, so the starting island's lookout (about 765 m away, bearing
 * 134°) sees the hub above water. Clear of the crown mouth, the beacon house,
 * the station, the dock and every route end on the summit. */
export const CROWN_MAST = {
  x: 326, z: -571,
  /** Half-width of its square collider, metres. */
  half: 0.9,
  /** Top of the mast above the waterline, and its lamp just below it. */
  top: 8,
  lamp: { x: 326, y: 7, z: -571 },
} as const;
/** Where the owner's starting island lookout will stand (OPENING-DESIGN):
 * about 765 m from the mast at bearing 134° (+Z north). */
export const ISLAND_LOOKOUT = { x: -217, z: -32 } as const;

/** Recipes the crown's bench runs once the dock stage is restored, besides its
 * own restorations: every recipe of the pod fabricator, and the workshop's
 * except its own restoration, the hull builds and the frame strip (which fills
 * the workshop locker). The yard's work stays at the yard: the carrier cannot
 * moor on the summit. `progression.ts` classifies hull builds itself. */
export const CROWN_BENCH_FROM = ["pod_fabricator", "island_workshop"] as const;
export const CROWN_BENCH_EXCLUDES = ["restore_workshop", "strip_frame"] as const;
