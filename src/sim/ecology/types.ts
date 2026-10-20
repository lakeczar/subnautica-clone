import type { HullId } from "../../content/registry.js";
import type { Deterrent, Sense, ThreatAgentId, ThreatSpeciesId } from "../../content/ecology/species.js";
export type { Deterrent, Sense, ThreatAgentId, ThreatSpeciesId };
import type { HazardKind, ProtectionId } from "../../content/ecology/hazards.js";
import type { Vec3 } from "../types.js";

/** Fixed simulation step, identical to step.ts. */
export const ECOLOGY_DT = 1 / 60;

/** The only world access ecology needs. Today's `sim/world.ts` queries and
 * S1's spatial index both satisfy it through a thin adapter (adapter.ts). */
export interface EcologyWorld {
  readonly waterY: number;
  /** Seabed height at x,z; may be -Infinity outside authored terrain. */
  floor(x: number, z: number): number;
  /** Straight segment free of solids and terrain. */
  clearLine(a: Vec3, b: Vec3): boolean;
  /** Reliable comfort places; no animal approaches them. */
  readonly refuges: readonly { readonly position: Vec3; readonly radius: number }[];
}

/** What the player emits this step, measured by the composing step. */
export interface Stimulus {
  /** Diver capsule base or controlled hull keel reference. */
  readonly position: Vec3;
  readonly velocity: Vec3;
  /** 0..1, the same loudness step.ts passes to the sound hunter. */
  readonly noise: number;
  /** 0..1 lamp output. Zero means running dark. */
  readonly light: number;
  /** 0..1 extraction, sorting or an active scan pulse. */
  readonly disturbance: number;
  readonly hull: HullId | null;
  /** Contact radius of the diver or hull. */
  readonly radius: number;
  readonly inRefuge: boolean;
}

export type AgentMode = "rest" | "alert" | "investigate" | "commit" | "withdraw";
/** Saved per roster entry, in roster order (proposed persisted field). */
export interface AgentState {
  readonly id: ThreatAgentId;
  mode: AgentMode;
  position: Vec3;
  yaw: number;
  awareness: number;
  modeSeconds: number;
  /** Completed commit cycles in this engagement. */
  cycles: number;
  /** Seconds left before it may warn again. */
  refractory: number;
  /** Strongest sense at the last warning, for captions and art. */
  cue: Sense | null;
  /** Commit already struck this cycle. */
  struck: boolean;
}
export interface DeployedDeterrent {
  kind: Deterrent;
  position: Vec3;
  seconds: number;
}
export interface Exposure {
  heat: number;
  brine: number;
}
export interface EcologyState {
  agents: AgentState[];
  deterrents: DeployedDeterrent[];
  /** Diver exposure loads 0..100. Hull loads live beside each craft. */
  diver: Exposure;
  hulls: Record<string, Exposure>;
}

export interface Protection {
  /** Tolerance below which a field causes no load. */
  readonly heat: number;
  readonly brine: number;
  /** 0..1 share of a current the actor can hold against. */
  readonly current: number;
}

export type EcologyCommand =
  | { readonly type: "deploy"; readonly kind: Deterrent; readonly position: Vec3 };

export interface EcologyInput {
  readonly tick: number;
  readonly stimulus: Stimulus;
  /** Diver suit protection, or the controlled hull's. */
  readonly protection: Protection;
  /** Controlled craft ID for hull exposure, null for a diver. */
  readonly vehicleId: string | null;
  readonly commands?: readonly EcologyCommand[];
}

export type EcologyCue = "alert" | "investigate" | "commit" | "withdraw" | "calm" | "leash" | "lure" | "ink";
/** Presentation events. Transient, never saved. Captions are the text
 * equivalent of each visual and audio cue. */
export type EcologyEvent =
  | { readonly type: "ecology-cue"; readonly agentId: ThreatAgentId; readonly species: ThreatSpeciesId; readonly cue: EcologyCue;
      readonly sense: Sense | null; readonly caption: string; readonly origin: Vec3 }
  | { readonly type: "ecology-strike"; readonly agentId: ThreatAgentId; readonly species: ThreatSpeciesId;
      readonly target: "diver" | "vehicle"; readonly loss: number; readonly origin: Vec3 }
  | { readonly type: "hazard-warning"; readonly hazard: HazardKind; readonly level: number; readonly caption: string;
      readonly protection: readonly ProtectionId[] };

/** Losses for the composing step to apply; ecology never edits vitals itself. */
export interface EcologyEffects {
  diverHealth: number;
  vehicleHealth: number;
  /** Metres per second the actor is pushed this step, after its authority. */
  drift: Vec3;
  /** 0..1 visibility at the actor, for render fog and the sight senses. */
  visibility: number;
}
export interface EcologyStepResult {
  readonly events: EcologyEvent[];
  readonly effects: EcologyEffects;
}
