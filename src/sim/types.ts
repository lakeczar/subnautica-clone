import type {
  BlueprintId,
  EvidenceId,
  FacilityId,
  HullId,
  ItemKind,
  MaterialId,
  PlaceId,
  RecipeId,
  SourceId,
} from "../content/registry.js";
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
export type GameCommand =
  | {
      type: "move";
      forward: number;
      right: number;
      vertical: number;
      sprint: boolean;
      quiet?: boolean;
    }
  | { type: "look"; yawDelta: number; pitchDelta: number }
  | { type: "interact"; target?: string }
  | { type: "scan" }
  | { type: "skip-opening" }
  | { type: "craft"; recipeId: RecipeId }
  | { type: "transfer"; itemId: string; to: string; quantity: number }
  | { type: "sort"; sourceId: SourceId; maintenance?: boolean }
  | { type: "eat" }
  | { type: "buoy" }
  | { type: "exit" }
  | { type: "service"; vehicleId: string }
  | { type: "reserve"; vehicleId: string }
  | { type: "recover"; vehicleId: string; method: "tow" | "repair" | "salvage" }
  | { type: "emergency-meal" }
  | { type: "hint" }
  | { type: "distraction" }
  | { type: "mark"; placeId: PlaceId }
  | {
      type: "carrier";
      action:
        | "station-keep"
        | "helm"
        | "leave-helm"
        | "reconfigure"
        | "block-exit"
        | "interrupt"
        | "launch"
        | "capture"
        | "failure-drill"
        | "leave-interior"
        | "enter-interior";
      vehicleId?: string;
    };
export type GameEvent =
  | { type: "movement-mode-changed"; mode: MovementMode }
  | { type: "foundation-boundary" }
  | { type: "notice"; message: string; error?: boolean }
  | {
      type: "sound";
      /** Transient world-space source at emission. Omit for body/equipment alarms. Never saved. */
      origin?: Vec3;
      cue:
        | "collect"
        | "craft"
        | "warning"
        | "refuge"
        | "damage"
        | "scan"
        | "opening"
        | "recovery";
    };
export interface Capsule {
  radius: number;
  height: number;
  /** Optional fixed-axis box footprint for guided hull transfer. Radius remains the default. */
  halfWidth?: number;
  halfLength?: number;
}
export interface MoveResult {
  position: Vec3;
  hitSolid: boolean;
  hitBoundary: boolean;
}
export interface WorldQueries {
  waterHeight: number;
  groundHeight(x: number, z: number): number;
  supportHeight(x: number, z: number, fromY: number): number;
  moveCapsule(origin: Vec3, delta: Vec3, capsule: Capsule): MoveResult;
  clearance(origin: Vec3, capsule: Capsule): boolean;
}
