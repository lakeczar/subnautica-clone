import type { PlaceId } from '../content/registry.js';

export interface Vec3 { x: number; y: number; z: number }
/** Right-handed world, metres, Y up, water Y=0. yaw=0 faces -Z;
 * positive yaw looks toward +X; positive pitch looks up. Position is capsule base. */
export interface WorldPose {
  frame: 'world';
  position: Vec3;
  yaw: number;
  pitch: number;
}
export type MovementMode = 'walking' | 'swimming';
export interface PlayerState {
  pose: WorldPose;
  velocity: Vec3;
  mode: MovementMode;
  vitals: { health: number; oxygen: number; food: number };
  refugeId: PlaceId;
  controlledVehicleId: null;
  interiorId: null;
}
/** Deliberately empty in schema v1: new systems must define a reviewed schema
 * migration rather than putting unvalidated, silently discarded data here. */
export interface FoundationExtensions {
  inventory: { items: never[]; containers: never[] };
  knowledge: { blueprints: never[]; scans: never[]; evidence: never[]; journals: never[]; markers: never[] };
  world: { resources: never[]; facilities: never[] };
  fleet: { vehicles: never[]; docking: null };
  recovery: { caches: never[] };
}
export interface GameState extends FoundationExtensions {
  tick: number;
  player: PlayerState;
}
export type GameCommand =
  | { type: 'move'; forward: number; right: number; vertical: number; sprint: boolean }
  | { type: 'look'; yawDelta: number; pitchDelta: number };
export type GameEvent =
  | { type: 'movement-mode-changed'; mode: MovementMode }
  | { type: 'foundation-boundary' };
export interface Capsule { radius: number; height: number }
export interface MoveResult { position: Vec3; hitSolid: boolean; hitBoundary: boolean }
/** Queries use the same terrain and collider authority as presentation. */
export interface WorldQueries {
  waterHeight: number;
  groundHeight(x: number, z: number): number;
  supportHeight(x: number, z: number, fromY: number): number;
  moveCapsule(origin: Vec3, delta: Vec3, capsule: Capsule): MoveResult;
}
