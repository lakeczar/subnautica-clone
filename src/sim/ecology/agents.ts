import { HAZARD_FIELDS } from "../../content/ecology/hazards.js";
import { FIRST_STRIKE_SHARE, VIEW_BIAS } from "../../content/ecology/encounter.js";
import { sitePosition } from "../../content/ecology/sites.js";
import { ACTIVATION_RADIUS, MAX_ACTIVE_THREATS, REFUGE_MARGIN, THREATS, THREAT_AGENT_IDS, THREAT_ROSTER } from "../../content/ecology/species.js";
import type { Deterrent, Sense, ThreatAgentId, ThreatDefinition, ThreatSpeciesId } from "../../content/ecology/species.js";
import type { Vec3 } from "../types.js";
import { sampleHazards } from "./hazards.js";
import { ECOLOGY_DT } from "./types.js";
import type { AgentMode, AgentState, DeployedDeterrent, EcologyCue, EcologyEvent, EcologyWorld, Stimulus } from "./types.js";
import { add, clamp01, distance, finite, length, scale, sub, toward, yawToward } from "./vector.js";

const DT = ECOLOGY_DT;
export const INK_RADIUS = 6;
/** Awareness never exceeds this; it bounds how long a fading interest lasts. */
export const MAX_AWARENESS = 6;
/** Inactive animals farther than this beyond the activation radius rest at home. */
export const ACTIVATION_HYSTERESIS = 30;

export const speciesOf = (id: ThreatAgentId): ThreatSpeciesId => THREAT_ROSTER[id].species;
export const definitionOf = (id: ThreatAgentId): ThreatDefinition => THREATS[speciesOf(id)];
export const homeOf = (id: ThreatAgentId): Vec3 => sitePosition(THREAT_ROSTER[id].home);
/** Centre of the choir's pressure shell, matching the rendered pulse. */
export const pulseOrigin = (id: ThreatAgentId): Vec3 => { const h = homeOf(id); return { x: h.x, y: h.y + 2, z: h.z }; };
export function restingAgent(id: ThreatAgentId): AgentState {
  return { id, mode: "rest", position: homeOf(id), yaw: 0, awareness: 0, modeSeconds: 0, cycles: 0, refractory: 0, cue: null, struck: false };
}
export function layerY(field: "divide_dense_layer"): number {
  const f = HAZARD_FIELDS[field];
  return sitePosition(f.shape.center).y + f.shape.y;
}

/** Can this animal be at `p`? Territory, refuges, water column and habitat. */
export function canOccupy(id: ThreatAgentId, p: Vec3, world: EcologyWorld, tick: number): boolean {
  const def = definitionOf(id);
  if (!finite(p) || distance(p, homeOf(id)) > def.territory) return false;
  if (p.y > world.waterY - 2 || p.y < world.floor(p.x, p.z) + 0.6) return false;
  if (world.refuges.some(r => distance(p, r.position) < r.radius + REFUGE_MARGIN)) return false;
  return inHabitat(def, p, tick);
}
function inHabitat(def: ThreatDefinition, p: Vec3, tick: number): boolean {
  const h = def.habitat;
  if (h.kind === "warm") return sampleHazards(p, tick).heat >= h.minHeat;
  if (h.kind === "below-layer") return p.y <= layerY(h.field) + h.above;
  return true;
}
/** Can the animal's strike reach the player at all from somewhere it may be? */
export function canReach(id: ThreatAgentId, s: Stimulus, world: EcologyWorld, tick: number): boolean {
  const def = definitionOf(id), p = s.position, reach = def.reach + s.radius;
  if (s.inRefuge || world.refuges.some(r => distance(p, r.position) < r.radius + REFUGE_MARGIN * 0.5)) return false;
  if (distance(p, homeOf(id)) > def.territory + reach) return false;
  const h = def.habitat;
  if (h.kind === "warm") return sampleHazards(p, tick).heat >= h.minHeat * 0.5;
  if (h.kind === "below-layer") return p.y <= layerY(h.field) + h.above + reach;
  return true;
}

function inkBlocks(deterrents: readonly DeployedDeterrent[], a: Vec3, b: Vec3): boolean {
  for (const d of deterrents) {
    if (d.kind !== "ink") continue;
    const ab = sub(b, a), n2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;
    const t = n2 < 1e-9 ? 0 : clamp01(((d.position.x - a.x) * ab.x + (d.position.y - a.y) * ab.y + (d.position.z - a.z) * ab.z) / n2);
    if (distance(add(a, scale(ab, t)), d.position) <= INK_RADIUS) return true;
  }
  return false;
}

export interface Perception {
  /** Awareness per second, before decay. */
  rate: number;
  dominant: Sense | null;
  reachable: boolean;
}
/** Pure perception of the player's emitted cues by one animal. */
export function perceive(agent: AgentState, s: Stimulus, world: EcologyWorld, tick: number, deterrents: readonly DeployedDeterrent[]): Perception {
  const def = definitionOf(agent.id), senses = def.senses as Partial<Record<Sense, { range: number; weight: number }>>;
  const d = distance(agent.position, s.position);
  let clear: boolean | undefined;
  const line = (): boolean => clear ??= world.clearLine(agent.position, s.position);
  const cues: [Sense, number][] = [];
  if (senses.noise) {
    const f = clamp01(1 - d / senses.noise.range);
    if (f > 0 && s.noise > 0) cues.push(["noise", senses.noise.weight * s.noise * f * (line() ? 1 : def.coverPass)]);
  }
  if (senses.light) {
    const f = clamp01(1 - d / senses.light.range);
    if (f > 0 && s.light > 0 && line() && !inkBlocks(deterrents, agent.position, s.position)) {
      const dark = 1 - sampleHazards(agent.position, tick).ambient;
      cues.push(["light", senses.light.weight * s.light * f * (0.35 + 0.65 * dark)]);
    }
  }
  if (senses.disturbance) {
    const f = clamp01(1 - distance(homeOf(agent.id), s.position) / senses.disturbance.range);
    if (f > 0 && s.disturbance > 0) cues.push(["disturbance", senses.disturbance.weight * s.disturbance * f]);
  }
  if (senses.layer && def.habitat.kind === "below-layer") {
    const band = clamp01(1 - Math.abs(s.position.y - layerY(def.habitat.field)) / 6);
    const f = clamp01(1 - Math.hypot(agent.position.x - s.position.x, agent.position.z - s.position.z) / senses.layer.range);
    const stir = clamp01(Math.abs(s.velocity.y) * 0.5 + Math.hypot(s.velocity.x, s.velocity.z) * 0.12 + s.noise * 0.5);
    if (band * f * stir > 0) cues.push(["layer", senses.layer.weight * band * f * stir * (line() ? 1 : def.coverPass)]);
  }
  let rate = 0, dominant: Sense | null = null, best = 0;
  for (const [sense, value] of cues) {
    rate += value;
    if (value > best) { best = value; dominant = sense; }
  }
  return { rate, dominant, reachable: canReach(agent.id, s, world, tick) };
}

/** A deterrent this animal chases instead of the player, nearest first. */
function attraction(agent: AgentState, def: ThreatDefinition, deterrents: readonly DeployedDeterrent[]): DeployedDeterrent | null {
  const range = Math.max(...Object.values(def.senses as Record<string, { range: number }>).map(x => x.range));
  let best: DeployedDeterrent | null = null;
  for (const d of deterrents)
    if ((def.attractedBy as readonly Deterrent[]).includes(d.kind) && distance(d.position, agent.position) <= range &&
        (!best || distance(d.position, agent.position) < distance(best.position, agent.position))) best = d;
  return best;
}
const inInk = (deterrents: readonly DeployedDeterrent[], p: Vec3): boolean =>
  deterrents.some(d => d.kind === "ink" && distance(d.position, p) <= INK_RADIUS);

function moveAgent(agent: AgentState, target: Vec3, speed: number, world: EcologyWorld, tick: number): void {
  if (speed <= 0) return;
  const step = speed * DT, start = agent.position, wanted = toward(start, target, step);
  const delta = sub(wanted, start);
  if (length(delta) < 1e-9) return;
  // The full step, then its level and vertical parts: an animal slides along
  // its habitat edge rather than crossing into cool water or above the layer.
  const options = [wanted, add(start, { x: delta.x, y: 0, z: delta.z }), add(start, { x: 0, y: delta.y, z: 0 })];
  for (const next of options)
    if (length(sub(next, start)) > 1e-9 && canOccupy(agent.id, next, world, tick) && world.clearLine(start, next)) {
      agent.position = next;
      return;
    }
}

export interface AgentStepOutput {
  events: EcologyEvent[];
  diverLoss: number;
  hullLoss: number;
}

/** Advance one active threat by one fixed step. Mutates the agent in place. */
export function stepAgent(agent: AgentState, s: Stimulus, world: EcologyWorld, tick: number, deterrents: readonly DeployedDeterrent[],
  /** False while another animal is lunging: one commit at a time stays readable. */
  mayCommit = true): AgentStepOutput {
  const def = definitionOf(agent.id), species = speciesOf(agent.id), home = homeOf(agent.id);
  const out: AgentStepOutput = { events: [], diverLoss: 0, hullLoss: 0 };
  const cue = (kind: EcologyCue, caption: string): void => {
    out.events.push({ type: "ecology-cue", agentId: agent.id, species, cue: kind, sense: agent.cue, caption, origin: { ...agent.position } });
  };
  const change = (mode: AgentMode, kind: EcologyCue | null, caption = ""): void => {
    if (mode === "withdraw" && agent.mode === "commit") agent.cycles++;
    if (mode === "withdraw" && agent.mode !== "withdraw") agent.awareness *= 0.5;
    agent.mode = mode;
    agent.modeSeconds = 0;
    agent.struck = false;
    if (kind) cue(kind, caption);
  };
  agent.modeSeconds += DT;
  agent.refractory = Math.max(0, agent.refractory - DT);
  const lure = attraction(agent, def, deterrents);
  const sensed = perceive(agent, s, world, tick, deterrents);
  const engaged = agent.mode === "investigate" || agent.mode === "commit";
  if (lure) agent.awareness = Math.max(0, agent.awareness - def.awareness.decay * 2 * DT);
  else if (sensed.reachable) agent.awareness += (sensed.rate - def.awareness.decay) * DT;
  else agent.awareness -= def.awareness.decay * 3 * DT;
  agent.awareness = Math.min(MAX_AWARENESS, Math.max(0, agent.awareness));
  if (agent.refractory > 0) agent.awareness = Math.min(agent.awareness, def.awareness.alert * 0.9);
  if (sensed.dominant && (agent.mode === "rest" || agent.mode === "alert")) agent.cue = sensed.dominant;

  const alertCaption = (): string => {
    const captions = def.captions.alert as Partial<Record<Sense, string>>;
    return (agent.cue && captions[agent.cue]) ?? Object.values(captions)[0] ?? "";
  };
  // Deterrents and the habitat edge break any engagement before ordinary rules.
  if (agent.mode !== "rest" && agent.mode !== "withdraw" && (inInk(deterrents, agent.position) || inInk(deterrents, s.position)) &&
      (def.repelledBy as readonly Deterrent[]).includes("ink"))
    change("withdraw", "ink", def.captions.ink);
  else if (lure && agent.mode !== "withdraw") {
    if (def.strike.kind === "pulse") {
      // A sessile chorus answers the decoy and spends itself there.
      agent.cycles = def.maxCycles;
      change("withdraw", "lure", def.captions.lure);
    } else if (agent.mode !== "investigate") change("investigate", "lure", def.captions.lure);
  } else if (engaged && !sensed.reachable) change("withdraw", "leash", def.captions.leash);
  else switch (agent.mode) {
    case "rest":
      if (agent.refractory === 0 && agent.awareness >= def.awareness.alert && sensed.reachable) change("alert", "alert", alertCaption());
      break;
    case "alert":
      if (!sensed.reachable) change("rest", "leash", def.captions.leash);
      else if (agent.modeSeconds >= def.timing.alert && agent.awareness >= def.awareness.investigate) change("investigate", "investigate", def.captions.investigate);
      else if (agent.modeSeconds >= def.timing.alert && agent.awareness < def.awareness.alert * 0.5) change("rest", "calm", def.captions.withdraw);
      break;
    case "investigate":
      if (mayCommit && agent.modeSeconds >= def.timing.investigate && agent.awareness >= def.awareness.commit &&
          (seenBy(agent, def, s) || agent.modeSeconds >= def.timing.investigate + UNSEEN_COMMIT_DELAY)) change("commit", "commit", def.captions.commit);
      else if (agent.awareness < def.awareness.alert * 0.6) change("withdraw", "withdraw", def.captions.withdraw);
      break;
    case "commit": {
      if (def.strike.kind === "pulse") {
        // Cover rule for the pressure pulse: it radiates from the bells and
        // solid cover between them and the player shelters completely.
        if (agent.modeSeconds >= def.timing.commit) {
          if (distance(home, s.position) <= def.reach + s.radius && world.clearLine(pulseOrigin(agent.id), s.position)) strike(agent, def, s, out);
          change("withdraw", "withdraw", def.captions.withdraw);
        }
      } else if (!agent.struck && distance(agent.position, s.position) <= def.reach + s.radius && world.clearLine(agent.position, s.position)) {
        // Contact needs an open path: a lunge never reaches through rock.
        strike(agent, def, s, out);
        change("withdraw", "withdraw", def.captions.withdraw);
      } else if (agent.modeSeconds >= def.timing.commit) change("withdraw", "withdraw", def.captions.withdraw);
      break;
    }
    case "withdraw":
      if (agent.modeSeconds >= def.timing.withdraw) {
        if (agent.cycles >= def.maxCycles) {
          agent.refractory = def.timing.refractory;
          agent.cycles = 0;
          agent.awareness = 0;
          change("rest", "calm", def.captions.withdraw);
        } else if (agent.awareness >= def.awareness.alert && sensed.reachable) change("alert", "alert", alertCaption());
        else { agent.cycles = 0; change("rest", null); }
      }
      break;
  }

  // Movement and facing follow the (possibly new) mode.
  const lureTarget = lure && agent.mode === "investigate" ? lure.position : null;
  let target = home, speed = 0, face = s.position;
  if (lureTarget) { target = lureTarget; speed = def.speed.investigate; face = lureTarget; }
  else if (agent.mode === "investigate") {
    // ENC-1: the stand-off bearing leans toward the actor's view, so the
    // animal that may lunge holds where it can be seen.
    const away = sub(agent.position, s.position), n = length(away);
    const unitAway = n > 1e-6 ? scale(away, 1 / n) : null;
    const lean = unitAway && s.facing ? add(scale(unitAway, 1 - VIEW_BIAS), scale(s.facing, VIEW_BIAS)) : unitAway;
    const m = lean ? length(lean) : 0;
    target = lean && m > 1e-6 ? add(s.position, scale(lean, def.standOff / m)) : agent.position;
    speed = def.speed.investigate;
  } else if (agent.mode === "commit") { target = s.position; speed = def.speed.commit; }
  else if (agent.mode === "withdraw" || agent.mode === "rest") {
    speed = agent.mode === "withdraw" ? def.speed.withdraw : def.speed.withdraw * 0.4;
    face = distance(agent.position, home) > 0.5 ? home : add(home, { x: Math.sin(tick / 600), y: 0, z: -Math.cos(tick / 600) });
  }
  moveAgent(agent, target, speed, world, tick);
  agent.yaw = yawToward(agent.position, face, agent.yaw);
  return out;
}
/** Seconds past its investigation an unseen animal waits before it may lunge anyway. */
export const UNSEEN_COMMIT_DELAY = 6;
/** Half-angle of the view cone in which an investigating animal counts as seen. */
export const SEEN_CONE = 0.75;
/** Is the animal (or a sessile colony's swelling display) inside the actor's
 * view? Without a facing the stimulus carries no view rules. */
export function seenBy(agent: AgentState, def: ThreatDefinition, s: Stimulus): boolean {
  if (!s.facing || def.strike.kind === "pulse") return true;
  const d = sub(agent.position, s.position), n = length(d);
  if (n < 1e-6) return true;
  return (d.x * s.facing.x + d.y * s.facing.y + d.z * s.facing.z) / n >= Math.cos(SEEN_CONE);
}
function strike(agent: AgentState, def: ThreatDefinition, s: Stimulus, out: AgentStepOutput): void {
  agent.struck = true;
  // ENC-1 ramp: the first strike of an engagement is a lighter warning.
  const share = agent.cycles === 0 ? FIRST_STRIKE_SHARE : 1;
  const target = s.hull ? "vehicle" : "diver", loss = (s.hull ? def.strike.hull : def.strike.diver) * share;
  if (s.hull) out.hullLoss += loss; else out.diverLoss += loss;
  out.events.push({ type: "ecology-strike", agentId: agent.id, species: speciesOf(agent.id), target, loss, origin: { ...agent.position } });
}

/** Deterministic bounded selection: nearest homes first, ties by roster order. */
export function activeThreats(player: Vec3): ThreatAgentId[] {
  return THREAT_AGENT_IDS
    .map((id, order) => ({ id, order, d: distance(homeOf(id), player) }))
    .filter(x => x.d <= ACTIVATION_RADIUS)
    .sort((a, b) => a.d - b.d || a.order - b.order)
    .slice(0, MAX_ACTIVE_THREATS)
    .map(x => x.id);
}
export const dormantReset = (agent: AgentState, player: Vec3): boolean =>
  distance(homeOf(agent.id), player) > ACTIVATION_RADIUS + ACTIVATION_HYSTERESIS;
