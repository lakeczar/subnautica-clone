import { THREAT_AGENT_IDS } from "../../content/ecology/species.js";
import type { CueAgentId, Deterrent, ThreatAgentId, ThreatSpeciesId } from "../../content/ecology/species.js";
import type { HazardFieldId } from "../../content/ecology/hazards.js";
import { HAZARD_FIELDS } from "../../content/ecology/hazards.js";
import type { Vec3 } from "../types.js";
import { activeThreats, dormantReset, restingAgent, speciesOf, stepAgent } from "./agents.js";
import { cueEvents, miteScatter, sailPositions, scavengerRetreat, schoolScattered } from "./cues.js";
import { driftFrom, emptyExposure, fieldLevel, recoverExposure, sampleHazards, stepExposure } from "./hazards.js";
import { DIVER_ACTOR, ECOLOGY_DT, NO_ACTOR } from "./types.js";
import type { AgentMode, EcologyEvent, EcologyInput, EcologyState, EcologyStepResult, EcologyWorld, Exposure, Sense } from "./types.js";
import { finite } from "./vector.js";

export const DETERRENT_SECONDS: Readonly<Record<Deterrent, number>> = { acoustic: 12, lure: 20, ink: 10 };
export const MAX_DETERRENTS = 6;
/** A drifting glow lure rises slowly, so it leads an animal up and away. */
export const LURE_RISE = 0.15;

/** The fleet save contract's vehicle ID (src/save/validation.ts `id`). */
export const VEHICLE_ID = /^[a-zA-Z0-9_-]{1,80}$/;
/** Six craft plus Bobbin-era margin; recovered entries leave the list at zero. */
export const MAX_HULL_EXPOSURES = 8;

export function createEcology(): EcologyState {
  return { agents: THREAT_AGENT_IDS.map(restingAgent), deterrents: [], diver: emptyExposure(), hulls: [], controlled: NO_ACTOR };
}
/** Call once after a save is loaded, before the first step. Saved warning
 * ages are kept (a delivered episode gets no fresh grace); the first step
 * re-shows the controlled actor's current hazard caption, and a warning that
 * was never delivered is delivered then, with grace starting from it. */
export function resumeEcology(state: EcologyState): void {
  state.controlled = NO_ACTOR;
}
function hullExposure(state: EcologyState, id: string): Exposure | null {
  if (!VEHICLE_ID.test(id)) return null;
  let h = state.hulls.find(h => h.id === id);
  if (!h) {
    if (state.hulls.length >= MAX_HULL_EXPOSURES) state.hulls.shift();
    h = { id, ...emptyExposure() };
    state.hulls.push(h);
  }
  return h;
}

/** Advance ecology by one fixed step. Mutates `state` like the other step
 * updates; returns presentation events and losses for the caller to apply. */
export function stepEcology(state: EcologyState, input: EcologyInput, world: EcologyWorld): EcologyStepResult {
  const { tick, stimulus: s } = input, events: EcologyEvent[] = [];
  for (const c of input.commands ?? []) {
    if (c.type !== "deploy" || !finite(c.position)) continue;
    if (state.deterrents.length >= MAX_DETERRENTS) state.deterrents.shift();
    state.deterrents.push({ kind: c.kind, position: { ...c.position }, seconds: DETERRENT_SECONDS[c.kind] });
  }
  for (const d of state.deterrents) {
    d.seconds = Math.max(0, d.seconds - ECOLOGY_DT);
    if (d.kind === "lure" && d.position.y < world.waterY - 1) d.position.y += LURE_RISE * ECOLOGY_DT;
  }
  state.deterrents = state.deterrents.filter(d => d.seconds > 0);

  const sample = sampleHazards(s.position, tick);
  let diverHealth = 0, vehicleHealth = 0;
  // The controlled actor takes field exposure; everyone else recovers.
  // An ID outside the fleet contract takes no hull exposure rather than
  // touching any other entry.
  const load: Exposure | null = input.vehicleId === null ? state.diver : hullExposure(state, input.vehicleId);
  const actor = input.vehicleId ?? DIVER_ACTOR, remind = state.controlled !== actor;
  state.controlled = load ? actor : NO_ACTOR;
  if (load) {
    const exposed = stepExposure(load, sample, input.protection, !input.vehicleId, s.inRefuge, remind);
    events.push(...exposed.events);
    if (input.vehicleId) vehicleHealth += exposed.harm; else diverHealth += exposed.harm;
  }
  // Uncontrolled actors recover silently; a delivered episode keeps ageing.
  if (input.vehicleId !== null) recoverExposure(state.diver);
  for (const hull of state.hulls) if (hull !== load) recoverExposure(hull);
  state.hulls = state.hulls.filter(h => h === load || h.heat > 0 || h.brine > 0);

  const active = new Set(activeThreats(s.position));
  for (const agent of state.agents) {
    if (active.has(agent.id)) {
      const lunging = state.agents.some(other => other !== agent && other.mode === "commit");
      const out = stepAgent(agent, s, world, tick, state.deterrents, !lunging);
      events.push(...out.events);
      diverHealth += out.diverLoss;
      vehicleHealth += out.hullLoss;
    } else if (dormantReset(agent, s.position)) {
      if (agent.mode !== "rest" || agent.awareness > 0 || agent.refractory > 0) Object.assign(agent, restingAgent(agent.id));
    } else agent.refractory = Math.max(0, agent.refractory - ECOLOGY_DT);
  }
  for (const c of cueEvents(tick, s)) events.push({
    type: "hazard-warning", hazard: c.cue === "rift_mites_lip" ? "heat" : "sediment", level: 0, caption: c.caption, protection: [],
  });
  return { events, effects: { diverHealth, vehicleHealth, drift: driftFrom(sample, input.protection), visibility: sample.visibility } };
}

/** Everything a renderer, audio mixer or HUD may read. Derived, never saved. */
export interface EcologyView {
  threats: { id: ThreatAgentId; species: ThreatSpeciesId; mode: AgentMode; position: Vec3; yaw: number;
    /** 0..1 strength of the visible warning display. */ warning: number; cue: Sense | null; modeSeconds: number }[];
  mites: { id: CueAgentId; scatter: number; secondsToVent: number };
  scavengers: { id: CueAgentId; retreat: number };
  sails: Vec3[];
  schoolScattered: boolean;
  fields: { id: HazardFieldId; level: number }[];
  deterrents: { kind: Deterrent; position: Vec3; seconds: number }[];
}
const WARNING: Readonly<Record<AgentMode, number>> = { rest: 0, alert: 0.55, investigate: 0.85, commit: 1, withdraw: 0.2 };
export function ecologyView(state: EcologyState, tick: number, s: EcologyInput["stimulus"] | null): EcologyView {
  return {
    threats: state.agents.map(a => ({ id: a.id, species: speciesOf(a.id), mode: a.mode, position: { ...a.position }, yaw: a.yaw,
      warning: WARNING[a.mode], cue: a.cue, modeSeconds: a.modeSeconds })),
    mites: { id: "rift_mites_lip", ...miteScatter(tick) },
    scavengers: { id: "basin_scavengers_ridge", retreat: scavengerRetreat(tick, s).retreat },
    sails: sailPositions(tick),
    schoolScattered: schoolScattered(s),
    fields: (Object.keys(HAZARD_FIELDS) as HazardFieldId[]).map(id => ({ id, level: fieldLevel(id, tick) })),
    deterrents: state.deterrents.map(d => ({ kind: d.kind, position: { ...d.position }, seconds: d.seconds })),
  };
}
