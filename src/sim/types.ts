import type { CycleObservation } from "./cycles/observe.js";
import type { RosterId, WorksAction } from "../content/story/works.js";
import type { EcologyEvent, EcologyState, ThreatSpeciesId } from "./ecology/types.js";
import type {
  BlueprintId,
  EvidenceId,
  FacilityId,
  HullId,
  ItemKind,
  MaterialId,
  PlaceId,
  RecipeId,
  RenewableSourceId,
  SourceId,
} from "../content/registry.js";
import type { StoryState } from "./story/state.js";
import type { RecoveryRouteId } from "../content/recoveryRoutes.js";
import type { RestBaseId } from "../content/bases.js";
import type { SystemsState } from "./systems/state.js";
import type { SystemsEvent } from "./systems/step.js";
import type { SignatureAction, SignatureEvent } from "./signatures.js";
import type { HostUpgradeId } from "../content/upgrades/hosts.js";
import type { FlareState, UpgradeRuntime } from "./upgrades/tools.js";
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
  /** The last restored base with a bunk the diver rested at: where they wake (C4). */
  refugeId: RestBaseId;
  controlledVehicleId: string | null;
  interiorId: string | null;
  starvationSeconds: number;
  graceSeconds: number;
  interiorPose: { frame: "carrier-local" | "hull-local"; position: Vec3 } | null;
  /** Deliberately registered mobile refuge: one Creel and its fitted cabin item.
   * Incapacity uses it only if it is still safe; otherwise the home pod. */
  mobileRefuge: { vehicleId: string; moduleId: string } | null;
  /** S4 lamp switch (C3): the diver's or controlled craft's lamp. Default on. */
  lamp: boolean;
}
/** `mount` marks a Creel major-mount package fitted in that hull's own hold
 * container; it is outside cargo capacity. Every other fitting lives in equipment. */
/** `protection`: an S4 suit fitting (heat shroud, brine seals) worn in equipment. */
export type Fitting = "tools" | "suit" | "recovery" | "buoy" | "mount" | "protection" | null;
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
  /** Installed item instance IDs. Socket modules still count in cargo capacity;
   * a fitted major-mount package (`fitted: "mount"`) does not. */
  modules: string[];
  /** Frame materials paid into this hull, including any paid refit. */
  investment: Partial<Record<MaterialId | "tagged_frame", number>>;
  /** Current hull pressure rating in metres: the initial rating or a paid refit. */
  rating: number;
  boundRepairs: number;
  berth: {
    carrierId: string;
    slot: 0 | 1;
    pose: { frame: "carrier-local"; position: Vec3; yaw: number };
  } | null;
  /** SYS-1 upgrade runtime (C4): flares, ballast, overdrive, anchor. */
  upgrades: UpgradeRuntime;
  /** A bio-cell feeding this hull: stock-battery percent still to come. */
  bioFeed: { remaining: number } | null;
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
  /** SIG-1: "mixed" (one medium and one compact berth) needs the berth extension. */
  configuration: "compact" | "medium" | "mixed";
  stationKeeping: boolean;
  supportedDock: boolean;
  transaction: BerthTransaction | null;
  sequence: number;
  completed: string[];
  launchBlocked: boolean;
  /** Hearthline interior sockets (HEARTHLINE_SOCKETS ids) and the occupant kind
   * each holds, or null. Occupied footprints are walking solids. */
  sockets: Record<string, string | null>;
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
    /** C4: what the player has watched of each world cycle (CY's observer). */
    cycles: CycleObservation[];
  };
  world: {
    resources: { id: SourceId; stock: number; reserve: number }[];
    /** One entry per living shed, in SOURCE_RENEWAL order. Integer active expedition
     * steps since its stock was last below the cap; zero whenever at or above it. */
    renewal: { id: RenewableSourceId; progress: number }[];
    facilities: { id: FacilityId; repaired: boolean }[];
    maintenance: { alloy: number; glass: number; membrane: number };
    /** S4 ecology (C3): agents, deterrents and hazard exposures. */
    ecology: EcologyState;
    threat: {
      mode: "idle" | "warn" | "investigate" | "pursue" | "disengage";
      position: Vec3;
      interest: number;
      modeSeconds: number;
      distraction: Vec3 | null;
      distractionSeconds: number;
    };
    /** Burning flares fired by craft launchers (C4). */
    flares: FlareState[];
    action: {
      sourceId: SourceId;
      seconds: number;
      /** lift: diver frees one tagged frame (10 s). arm: the piloted Creel's tool arms load a host directly. */
      kind: "sort" | "food" | "maintenance" | "lift" | "arm";
    } | null;
  };
  fleet: { vehicles: VehicleState[]; docking: CarrierState | null };
  /** SYS-2 bases and knowledge (C4): outposts, sockets, decodes, planters, beacons, chart. */
  systems: SystemsState;
  /** S5 story record. C01–C06 stay in knowledge.evidence and the reef journal in
   * knowledge.journals, with their original ticks; this holds every later
   * discovery, hint tiers, the works and the resolution. See sim/storyLink.ts. */
  story: StoryState;
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
  | { type: "store-materials"; from: string; to: string }
  | { type: "sort"; sourceId: SourceId; maintenance?: boolean }
  | { type: "eat" }
  | { type: "buoy" }
  | { type: "exit" }
  | { type: "service"; vehicleId: string }
  | { type: "recharge-cells" }
  | { type: "install-module"; vehicleId: string; itemId: string; replace?: string }
  /** Leave the helm into the fitted Creel cabin (station held), or take the helm from it. */
  | { type: "cabin"; action: "enter" | "helm" | "hatch" | "cook" }
  /** Register (vehicleId) or clear (null) the mobile refuge at a cabin bunk. */
  | { type: "register-refuge"; vehicleId: string | null }
  /** Piloted Creel tool arms on the aimed salvage host ahead of the bow. */
  | { type: "arm-lift" }
  | { type: "remove-module"; vehicleId: string; itemId: string }
  | { type: "reserve"; vehicleId: string }
  | { type: "recover"; vehicleId: string; method: "tow" | "repair" | "salvage" }
  | { type: "emergency-meal" }
  | { type: "hint" }
  | { type: "distraction" }
  | { type: "works"; action: WorksAction }
  | { type: "resolution"; action: "begin" | "complete"; roster?: RosterId }
  | { type: "lamp" }
  | { type: "deploy-lure" }
  | { type: "release-ink" }
  | { type: "mark"; placeId: PlaceId }
  // C4: SYS-1 upgrade actions and fitting.
  | { type: "upgrade"; action: "overdrive" | "flare" | "ballast" | "anchor" | "listen" | "sample" | "rearm" | "bio-cell" | SignatureAction; vehicleId?: string; itemId?: string }
  // C4: SYS-2 bases and knowledge.
  | { type: "deploy-outpost"; itemId: string; name?: string }
  | { type: "pack-outpost"; outpostId: string; to?: string }
  | { type: "upgrade-outpost"; outpostId: string }
  /** SIG-1: fit a decoder lattice or survey array to the module in one host socket. */
  | { type: "upgrade-host-module"; hostId: string; socket: string; upgrade: HostUpgradeId }
  | { type: "install-host-module"; hostId: string; socket: string; itemId: string }
  | { type: "remove-host-module"; hostId: string; socket: string; to?: string }
  | { type: "start-decode"; hostId: string; socket: string; decodable: string }
  | { type: "plant"; hostId: string; socket: string; seed: string }
  | { type: "harvest"; hostId: string; socket: string; to?: string; replant?: boolean }
  | { type: "place-beacon"; name: string }
  | { type: "collect-beacon"; beaconId: string }
  | { type: "beacon-switch"; beaconId?: string; category?: string; on: boolean }
  | { type: "ping" }
  | { type: "survey"; hostId: string }
  | { type: "rest" }
  /** C4B-02: the carrier's charger module charges every berthed craft from the carrier. */
  | { type: "charge-berths"; carrierId: string }
  // CR-1: creatures as resources (sim/fauna/link.ts).
  | { type: "cook-catch"; portions: number }
  | { type: "release-bait" }
  | { type: "feed-planter"; hostId: string; socket: string }
  | { type: "empty-trap"; hostId: string; socket: string; to?: string }
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
export type NoticeChannel = "action" | "hazard" | "system" | "persistence";
/** `timeline`: the local play timeline's storage (SIM-1b), apart from the game save's. */
export type NoticeContext = "threat" | "oxygen" | "food" | "hull" | "recovery" | "ecology" | "timeline";
export type ExitRefusalCode = "not-piloting" | "carrier" | "depth" | "obstructed";
export interface NoticeOptions {
  channel?: NoticeChannel;
  context?: NoticeContext;
  /** Optional transient action receipt; the full message remains available. Never saved. */
  summary?: string;
  /** Identity of an actual refused exit attempt. Event metadata only; never saved. */
  refusal?: { kind: "exit"; vehicleId: string; code: ExitRefusalCode };
}
export type GameEvent =
  | { type: "movement-mode-changed"; mode: MovementMode }
  | { type: "foundation-boundary" }
  | { type: "impact"; speed: number; hullLoss: number; origin: Vec3 }
  /** Actual positive hunter bite loss, before disable/incapacity. Transient, never saved. */
  /** S4 encounter or hazard event, for audio mapping by its own fields. Transient. */
  | { type: "ecology"; event: EcologyEvent }
  | { type: "threat-damage"; source: "hunter" | "ecology";
      /** Ecology strikes carry their animal's position and species. */
      origin?: Vec3; species?: ThreatSpeciesId;
      target: { kind: "vehicle"; vehicleId: string } | { kind: "diver" };
      loss: number; healthAfter: number }
  /** One commanded upward attempt, in metres this step. Absence resets presentation. Never saved. */
  | { type: "ascent-sample"; actorId: string | null; requestedRise: number; actualRise: number;
      solidLimitedRise: number; surfaceLimitedRise: number }
  /** Horizontal metres from this step's commanded Dart movement. Never saved. */
  | { type: "thrust-sample"; actorId: string; requested: number; actual: number; solidLimited: number; supportLimited: number }
  /** SYS-2 background work for the local play timeline (C4). Transient, never saved. */
  | { type: "systems"; event: SystemsEvent }
  /** SIG-1 signature actions and their per-step work (typed outcomes, F17). Transient, never saved. */
  | { type: "signature"; event: SignatureEvent }
  | { type: "interaction-panel"; panel: "inventory" | "craft" | "notebook" | "systems" | "journal" | "carrier"; targetId: string }
  | ({ type: "notice"; message: string; error?: boolean } & NoticeOptions)
  | {
      type: "sound";
      /** Transient world-space source at emission. Omit for body/equipment alarms. Never saved. */
      origin?: Vec3;
      /** Only a positional warning call at an actual warn/pursue transition. */
      source?: "threat-call";
      /** Why a centred warning sounds, set where it is emitted. Transient, never saved. */
      cause?: "oxygen" | "food" | "pressure" | "power" | "hull-depth";
      cue:
        | "collect"
        | "craft"
        | "warning"
        | "refuge"
        | "damage"
        | "impact"
        | "scan"
        | "opening"
        | "recovery";
    };
export interface Capsule {
  radius: number;
  /** Top above the pose datum; bottom defaults to zero. */
  height: number;
  bottom?: number;
  /** Optional fixed-axis box footprint for guided hull transfer. Radius remains the default. */
  halfWidth?: number;
  halfLength?: number;
}
export interface MoveResult {
  position: Vec3;
  hitSolid: boolean;
  hitBoundary: boolean;
}
export interface MovementOptions {
  readonly separateBoxOverlaps?: boolean;
}
export interface WorldQueries {
  waterHeight: number;
  groundHeight(x: number, z: number): number;
  supportHeight(x: number, z: number, fromY: number): number;
  moveCapsule(origin: Vec3, delta: Vec3, capsule: Capsule, options?: MovementOptions): MoveResult;
  clearance(origin: Vec3, capsule: Capsule): boolean;
  lineOfSight(a: Vec3, b: Vec3, ignore?: readonly string[]): boolean;
}
