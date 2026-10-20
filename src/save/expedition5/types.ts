/** Frozen schema4 expedition.5 gameplay state shape at 7bd259c395542e2d58724417be66a1864c58c005.
 * Decode-only; the current shape lives in src/sim/types.ts. Commands/events are omitted. */
import type { BLUEPRINTS, EVIDENCE, HULLS, ITEMS, PLACES, RECIPES, SOURCES, SOURCE_RENEWAL } from "./domain.js";
type PlaceId = keyof typeof PLACES;
type ItemKind = keyof typeof ITEMS;
type EvidenceId = keyof typeof EVIDENCE;
type HullId = keyof typeof HULLS;
type MaterialId = "structural_alloy" | "silica_glass" | "flex_membrane" | "conductive_crust" |
  "buoyant_resin" | "pressure_ceramic" | "thermal_core" | "brine_lattice";
type BlueprintId = (typeof BLUEPRINTS)[number];
type RecipeId = keyof typeof RECIPES;
type SourceId = keyof typeof SOURCES;
type RenewableSourceId = keyof typeof SOURCE_RENEWAL;
type FacilityId = "home_pod" | "pod_fabricator" | "island_workshop" | "canopy_lab";
type RecoveryRouteId = "canopy" | "basin";
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
/** Metres, RH world, Y up, water Y=0; yaw=0 faces -Z. Diver pose is capsule base.
 * Hull poses are keel references; berth poses explicitly use the carrier-local frame. */
export interface WorldPose {
  frame: "world";
  position: Vec3;
  yaw: number;
  pitch: number;
}
export type MovementMode = "walking" | "swimming" | "piloting" | "interior";
export interface PlayerState {
  pose: WorldPose;
  velocity: Vec3;
  mode: MovementMode;
  vitals: { health: number; oxygen: number; food: number };
  refugeId: PlaceId;
  controlledVehicleId: string | null;
  interiorId: string | null;
  starvationSeconds: number;
  graceSeconds: number;
  interiorPose: { frame: "carrier-local"; position: Vec3 } | null;
}
export type Fitting = "tools" | "suit" | "recovery" | "buoy" | null;
export interface ItemStack {
  id: string;
  kind: ItemKind;
  quantity: number;
  containerId: string;
  fitted: Fitting;
  charge: number | null;
  provenance: "public" | "maintenance";
}
export interface ContainerState {
  id: string;
  kind: "diver" | "locker" | "buoy" | "vehicle" | "cache" | "equipment";
  capacity: number;
  ownerId: string;
}
export interface Finding {
  id: EvidenceId;
  tick: number;
  provenance: string;
}
export interface VehicleState {
  id: string;
  hull: HullId;
  pose: WorldPose;
  velocity: Vec3;
  charge: number;
  health: number;
  disabled: boolean;
  emergencyAir: number;
  cargoId: string;
  /** Installed ordinary cargo item instance IDs, still counted in cargo capacity. */
  modules: string[];
  investment: Partial<Record<MaterialId, number>>;
  boundRepairs: number;
  berth: {
    carrierId: string;
    slot: 0 | 1;
    pose: { frame: "carrier-local"; position: Vec3; yaw: number };
  } | null;
}
export interface BerthTransaction {
  id: string;
  type: "capture" | "launch";
  vehicleId: string;
  slot: 0 | 1;
  phase: "prepared" | "lock";
  ticks: number;
}
export interface CarrierState {
  vehicleId: string;
  configuration: "compact" | "medium";
  stationKeeping: boolean;
  supportedDock: boolean;
  transaction: BerthTransaction | null;
  sequence: number;
  completed: string[];
  launchBlocked: boolean;
}
export interface GameState {
  tick: number;
  sequence: number;
  scenario: "expedition" | "carrier-fixture";
  player: PlayerState;
  opening: { phase: 0 | 1 | 2 | 3 | 4; phaseTicks: number };
  inventory: {
    items: ItemStack[];
    containers: ContainerState[];
    buoy: { itemId: string | null; deployed: boolean; position: Vec3 };
  };
  knowledge: {
    blueprints: BlueprintId[];
    scans: string[];
    evidence: Finding[];
    journals: string[];
    markers: PlaceId[];
    crafted: RecipeId[];
    hintLevel: number;
  };
  world: {
    resources: { id: SourceId; stock: number; reserve: number }[];
    /** One entry per living shed, in SOURCE_RENEWAL order. Integer active expedition
     * steps since its stock was last below the cap; zero whenever at or above it. */
    renewal: { id: RenewableSourceId; progress: number }[];
    facilities: { id: FacilityId; repaired: boolean }[];
    maintenance: { alloy: number; glass: number; membrane: number };
    threat: {
      mode: "idle" | "warn" | "investigate" | "pursue" | "disengage";
      position: Vec3;
      interest: number;
      modeSeconds: number;
      distraction: Vec3 | null;
      distractionSeconds: number;
    };
    action: {
      sourceId: SourceId;
      seconds: number;
      kind: "sort" | "food" | "maintenance";
    } | null;
  };
  fleet: { vehicles: VehicleState[]; docking: CarrierState | null };
  recovery: {
    operation: {
      vehicleId: string;
      routeId: RecoveryRouteId;
      method: "tow" | "repair" | "salvage";
      phase: "approach" | "ready" | "tow";
      position: Vec3;
      waypoint: number;
    } | null;
    caches: { id: string; position: Vec3; containerId: string }[];
    losses: { vehicleId: string; position: Vec3; visited: boolean }[];
  };
  metrics: {
    swimMetres: number;
    pilotMetres: number;
    oxygenUsed: number;
    powerUsed: number;
    collections: number;
    failures: number;
    rescues: number;
    minOxygen: number;
    minPower: number;
  };
  feedback: string;
  migration: string | null;
}
