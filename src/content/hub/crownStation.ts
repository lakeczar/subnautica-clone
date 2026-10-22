/** PROPOSAL, DEFERRED (coordinator, after Sol R1): not imported by the game.
 * The crown station becomes its own composition task against C4 stage B's
 * accepted interfaces, which fixes Sol R1's W2-02 (these rows cannot execute
 * through C4's restoration path), W2-03 (stage 1 enables the generic stop
 * service before the dock) and W2-04 (the bench predicate's site list). Do not
 * wire these rows as they stand. */
/** W2 phase 2: the crown station, as data in the shapes of C4 stage B's
 * interfaces (`content/bases.ts` REST_BASES, `content/systems/hosts.ts`
 * FIXED_HOSTS, `content/stops.ts` WORKING_STOPS and the campaign recipe rows).
 * Nothing here is wired: C4 stage B owns those roots while it is in review,
 * so the coordinator composes these rows (docs/build/streams/W2.md, phase 2).
 *
 * Owner direction (GAME-DIRECTION "Central hub"): deliberately better than the
 * pod, restored in three stages with mid-game materials starting around the
 * Creel; once restored it has a fast-heal bunk, a full fabricator with a refit
 * and upgrade bench, a dock that charges and repairs moored craft, large
 * lockers, six module sockets, a built-in survey station covering the Basin,
 * the Rift head and the Canopy edge, and the beacon. You wake here once you
 * have rested here; the pod stays the guaranteed fallback and never depends on
 * the crown's power.
 *
 * Metres, +Y up, water at Y = 0. Poses sit on the W2 summit (tests check them
 * against the composed game world). */
import type { MaterialId } from "../registry.js";

interface Point { readonly x: number; readonly y: number; readonly z: number }

/** The three restoration stages, in order. Each is one facility (a stable ID
 * saved in `world.facilities`) restored by one recipe paid at the station. */
export const CROWN_STAGE_IDS = ["crown_power", "crown_dock", "crown_survey"] as const;
export type CrownStageId = (typeof CROWN_STAGE_IDS)[number];

/** What a stage switches on. Later stages keep every earlier service. */
export type CrownService =
  | "air" | "rest" | "fast_heal" | "beacon" | "locker"
  | "dock" | "fabricator" | "refit_bench" | "large_lockers"
  | "sockets" | "survey";

export interface CrownStage {
  readonly id: CrownStageId;
  readonly recipe: string;
  readonly label: string;
  /** One diver load (16 CU at most), as the other stops. */
  readonly cost: Readonly<Partial<Record<MaterialId, number>>>;
  readonly bp: string;
  readonly needs: readonly string[];
  readonly services: readonly CrownService[];
  /** Shown when a diver asks what this stage will restore. */
  readonly offers: string;
}

/** Costs start where the Creel does: alloy, glass, membrane and crust (the
 * Creel's own bill) for power and air; the Canopy's resin for the dock and
 * fabricator; the Rift's first ceramic for the sockets and survey array. */
export const CROWN_STAGES: readonly CrownStage[] = [
  { id: "crown_power", recipe: "restore_crown_power", label: "Restore crown station power and air",
    cost: { structural_alloy: 4, conductive_crust: 3, silica_glass: 2, flex_membrane: 2 },
    bp: "bp_creel_service", needs: ["essential_tools", "creel_base"],
    services: ["air", "rest", "fast_heal", "beacon", "locker"],
    offers: "Air and a fast-heal bunk · the summit beacon relit · 48 CU locker" },
  { id: "crown_dock", recipe: "restore_crown_dock", label: "Restore the crown dock and fabricator",
    cost: { structural_alloy: 4, conductive_crust: 3, buoyant_resin: 3, silica_glass: 2 },
    bp: "bp_canopy_reinforcement", needs: ["restore_crown_power", "suit_350"],
    services: ["dock", "fabricator", "refit_bench", "large_lockers"],
    offers: "Dock: moored craft charge and are repaired · full fabricator with refit and upgrade bench · 144 CU of lockers" },
  { id: "crown_survey", recipe: "restore_crown_survey", label: "Restore crown sockets and survey array",
    cost: { structural_alloy: 3, conductive_crust: 4, pressure_ceramic: 2, silica_glass: 2 },
    bp: "bp_rift_pressure", needs: ["restore_crown_dock", "suit_450"],
    services: ["sockets", "survey"],
    offers: "Six module sockets · survey array over the Basin, the Rift head and the Canopy edge" },
];

/** The station's fixed numbers. */
export const CROWN_STATION = {
  label: "Crown station",
  /** S2 site (W2 phase 1). */
  s2: "hub.crown_station",
  /** Diver pose at the door on the hull's north face (feet). */
  work: { x: 319, y: -56.4, z: -542.4 } satisfies Point,
  workRadius: 4,
  /** Keel pose at the dock: the summit's west lee, beside the spur's end. */
  dock: { x: 304, y: -45, z: -552 } satisfies Point,
  /** A craft within this of the dock is charged and repaired (stops use 14). */
  dockRadius: 14,
  /** Health per second on the bunk; the pod and every other refuge heal 1.8. */
  bunkHealRate: 5.4,
  refugeHealRate: 1.8,
  /** Lockers: one 48 CU locker at stage 1, three once the dock is restored. */
  lockerCu: 48,
  largeLockerCu: 144,
  sockets: 6,
  /** Survey range from the station (SYS-2 SURVEY_TIERS "Canopy survey"). */
  surveyRange: 300,
  /** What the survey array must reach (tests hold the range to these). */
  surveyCovers: { basin_anchorage: { x: 360, z: -430 }, dish_field: { x: 505, z: -568 }, rift_head: { x: 172, z: -606 },
    canopy_edge: { x: 470, z: -345 } },
  /** Its one service an outpost can't offer (SYS-2 FIXED_HOSTS `unique`). */
  unique: "Refits and upgrades at the map's centre, a dock that repairs, and the fastest bunk",
} as const;

// --- Rows for C4 stage B's tables (compose at integration) -------------------------

/** `content/bases.ts` REST_BASES row: you wake here once you have rested here
 * while power and air work. */
export const CROWN_REST_BASE = {
  crown_station: { label: CROWN_STATION.label, facility: "crown_power", wake: CROWN_STATION.work },
} as const;

/** `content/systems/hosts.ts` FIXED_HOSTS row. `facility` is the stage that
 * makes the sockets work; locker IDs follow FIXED_LOCKERS' pattern. */
export const CROWN_FIXED_HOST = {
  crown_station: { kind: "stop", label: CROWN_STATION.label, position: CROWN_STATION.work, facility: "crown_survey",
    sockets: CROWN_STATION.sockets, unique: CROWN_STATION.unique },
} as const;
export const CROWN_LOCKERS = ["crown_station_locker", "crown_station_store_a", "crown_station_store_b"] as const;

/** `content/stops.ts` WORKING_STOPS row (`facility` is the first stage; the
 * dock and fabrication need the second, see `crownServices`). */
export const CROWN_WORKING_STOP = {
  crown_station: { label: CROWN_STATION.label, s2: CROWN_STATION.s2, region: "silt_basin", facility: "crown_power",
    work: CROWN_STATION.work, workRadius: CROWN_STATION.workRadius, mooring: CROWN_STATION.dock,
    serviceRadius: CROWN_STATION.dockRadius, air: true, locker: CROWN_LOCKERS[0], fabrication: "crown_station",
    offers: CROWN_STAGES.map(s => s.offers).join(" · ") },
} as const;

/** Campaign recipe rows (`content/campaign/recipes.ts` shape), one per stage. */
export const CROWN_RECIPES = Object.fromEntries(CROWN_STAGES.map(s => [s.recipe, {
  label: s.label, cost: { ...s.cost }, bp: s.bp, needs: [...s.needs], site: "crown_station",
  output: s.recipe, quantity: 1, once: true, maintenance: false,
}])) as Readonly<Record<string, {
  label: string; cost: Partial<Record<MaterialId, number>>; bp: string; needs: string[]; site: "crown_station";
  output: string; quantity: 1; once: true; maintenance: false;
}>>;
/** Restoration recipe output → facility (as `STOP_RESTORATIONS`). */
export const CROWN_RESTORATIONS = Object.fromEntries(CROWN_STAGES.map(s => [s.recipe, s.id])) as Readonly<Record<string, CrownStageId>>;
/** Recipe sites the crown's bench also serves once the dock stage is restored:
 * the workshop's refits and upgrades (the M2 audit's issue 3, one bench for
 * every refit) and the pod's basic fabrication. The yard's hull builds stay at
 * the yard. */
export const CROWN_BENCH_SITES = ["island_workshop", "home_pod"] as const;
