import { HULLS, PLACES, SOURCES, THREAT_HOME } from "../content/registry.js";
import type { GameState, VehicleState, Vec3 } from "./types.js";
import { initialRenewal } from "./renewal.js";
import { createStory } from "./story/state.js";
export function createGame(): GameState {
  return {
    tick: 0,
    sequence: 0,
    scenario: "expedition",
    player: {
      pose: {
        frame: "world",
        position: { x: 0, y: 0.18, z: 21.2 },
        yaw: 0,
        pitch: -0.05,
      },
      velocity: { x: 0, y: 0, z: 0 },
      mode: "walking",
      vitals: { health: 76, oxygen: 100, food: 100 },
      refugeId: "home_pod",
      controlledVehicleId: null,
      interiorId: null,
      starvationSeconds: 0,
      graceSeconds: 180,
      interiorPose: null,
      mobileRefuge: null,
    },
    opening: { phase: 0, phaseTicks: 0 },
    inventory: {
      items: [],
      containers: [
        { id: "diver", kind: "diver", capacity: 16, ownerId: "player" },
        { id: "equipment", kind: "equipment", capacity: 0, ownerId: "player" },
        {
          id: "pod_locker",
          kind: "locker",
          capacity: 160,
          ownerId: "home_pod",
        },
        {
          id: "workshop_locker",
          kind: "locker",
          capacity: 160,
          ownerId: "island_workshop",
        },
        {
          id: "buoy_hold",
          kind: "buoy",
          capacity: 24,
          ownerId: "salvage_buoy",
        },
        {
          id: "canopy_stop_locker",
          kind: "locker",
          capacity: 48,
          ownerId: "canopy_stop",
        },
      ],
      buoy: {
        itemId: null,
        deployed: false,
        position: { ...PLACES.home_pod.position },
      },
    },
    knowledge: {
      blueprints: [],
      scans: [],
      evidence: [],
      journals: [],
      markers: ["home_pod"],
      crafted: [],
      hintLevel: 0,
    },
    world: {
      resources: Object.entries(SOURCES).map(([id, s]) => ({
        id: id as keyof typeof SOURCES,
        stock: s.stock,
        reserve: s.reserve,
      })),
      renewal: initialRenewal(),
      facilities: [
        { id: "home_pod", repaired: true },
        { id: "pod_fabricator", repaired: false },
        { id: "island_workshop", repaired: false },
        { id: "canopy_lab", repaired: false },
        { id: "canopy_stop", repaired: false },
      ],
      maintenance: { alloy: 16, glass: 1, membrane: 10 },
      threat: {
        mode: "idle",
        position: { ...THREAT_HOME },
        interest: 0,
        modeSeconds: 0,
        distraction: null,
        distractionSeconds: 0,
      },
      action: null,
    },
    fleet: { vehicles: [], docking: null },
    story: createStory(),
    recovery: { operation: null, caches: [], losses: [] },
    metrics: {
      swimMetres: 0,
      pilotMetres: 0,
      oxygenUsed: 0,
      powerUsed: 0,
      collections: 0,
      failures: 0,
      rescues: 0,
      minOxygen: 100,
      minPower: 100,
    },
    feedback: "",
    migration: null,
  };
}
export const eyeHeight = (state: GameState): number =>
  state.player.mode === "piloting"
    ? 1.05
    : state.player.mode === "swimming"
      ? 0.65
      : 1.62;
export function makeVehicle(
  id: string,
  hull: VehicleState["hull"],
  position: Vec3,
  cargoId: string,
): VehicleState {
  return {
    id,
    hull,
    pose: { frame: "world", position: { ...position }, yaw: 0, pitch: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    charge: 100,
    health: 100,
    disabled: false,
    emergencyAir: 120,
    cargoId,
    modules: [],
    investment: {},
    rating: HULLS[hull].initialDepth,
    boundRepairs: 0,
    berth: null,
  };
}
