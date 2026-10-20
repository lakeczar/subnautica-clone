/** The cycles lab's simulation, Babylon-free so tests run the very loop the
 * lab shows. It is also the reference for composition: the movement mirrors
 * step.ts (diver velocity set directly and swept in 0.12 m `moveCapsule`
 * slices; hulls ease toward a target velocity and move with `moveHull`), and
 * the current enters exactly where the CY handoff proposes for step.ts:
 * drift is added to the drive velocity before the sweep, impact damage reads
 * the drive alone, and "moving" for drain is the drive, not displacement.
 *
 * State is plain JSON and every cycle is a function of `tick`, so a snapshot
 * restored mid-run continues identically. */
import { ACTORS } from "../../content/currents/actors.js";
import type { ActorId } from "../../content/currents/actors.js";
import { CYCLE_BY_ID } from "../../content/currents/cycles.js";
import { BLOOM, CANDIDATES, candidateOpen, LAB_FLOOR_Y, LAB_SOLIDS, LAB_START, LAB_VOLUMES, VENT_COLUMN, WARDEN } from "../../content/currents/lab.js";
import type { CandidateId } from "../../content/currents/lab.js";
import { FIXED_SECONDS as DT } from "../clock.js";
import { sampleCycleAt } from "../cycles/cycle.js";
import type { CycleSample } from "../cycles/cycle.js";
import { observeCycle } from "../cycles/observe.js";
import type { CycleObservation, ObservationEvent } from "../cycles/observe.js";
import type { Vec3, WorldQueries } from "../types.js";
import { createWorldQueries, moveHull } from "../world.js";
import { createCurrentField } from "./flow.js";
import type { CurrentField } from "./flow.js";
import { respondToFlow } from "./motion.js";
import type { FlowResponse } from "./motion.js";
import { turbineRate } from "./turbine.js";
import type { HoldMode } from "./types.js";

export interface SandboxState {
  tick: number;
  actor: ActorId;
  position: Vec3;
  /** Drive velocity only; drift is never stored in it. */
  velocity: Vec3;
  /** Hull battery percent (unused for the diver). */
  charge: number;
  /** Hull health, or diver health. */
  health: number;
  /** Diver suit oxygen percent. */
  oxygen: number;
  /** Lab heat gauge 0..100 (S4 rates); S4 owns real exposure and harm. */
  heat: number;
  grapple: { anchor: Vec3; length: number } | null;
  turbine: boolean;
  /** Picks taken this round, per bed. */
  picks: { bloomRound: number; bloom: number; ordinary: number; wardenRound: number; node: number; flat: number };
  gathered: number;
  powerUsed: number;
  observations: Record<string, CycleObservation>;
}
export interface SandboxInput {
  forward?: number;
  right?: number;
  vertical?: number;
  yaw?: number;
  pitch?: number;
  sprint?: boolean;
  quiet?: boolean;
  /** Hull hold while stopped: thrusters, nothing, or the attached line/anchor. */
  hold?: "station" | "off";
  /** Edge-triggered: fire the grapple at the nearest rock ahead, or release it. */
  grapple?: boolean;
  /** Edge-triggered: one pick at a bed in reach. */
  pick?: boolean;
}
export interface SandboxReadout {
  flow: Vec3;
  flowSpeed: number;
  response: FlowResponse;
  hold: HoldMode;
  /** Total drain this step, percent per second. */
  drain: number;
  turbine: number;
  hitSolid: boolean;
  impact: number;
  cycles: Record<string, CycleSample>;
  open: Record<CandidateId, boolean>;
  ventHeat: number;
  warden: Vec3;
  wardenShove: boolean;
  bloomLeft: number;
  /** Picks left at the warden's rich node this round (2 units each). */
  nodeLeft: number;
  events: (ObservationEvent | { type: "pick"; bed: "bloom" | "ordinary" | "node"; units: number } | { type: "grapple"; message: string })[];
}

export interface Sandbox {
  readonly world: WorldQueries;
  readonly field: CurrentField;
}
export const createSandbox = (): Sandbox => ({
  world: createWorldQueries(LAB_SOLIDS, () => LAB_FLOOR_Y),
  field: createCurrentField(LAB_VOLUMES, CYCLE_BY_ID),
});

export function initialSandbox(actor: ActorId = "diver", position: Vec3 = LAB_START): SandboxState {
  return {
    tick: 0, actor, position: { ...position }, velocity: { x: 0, y: 0, z: 0 }, charge: 100, health: 100, oxygen: 100, heat: 0,
    grapple: null, turbine: false, picks: { bloomRound: 0, bloom: 0, ordinary: 0, wardenRound: 0, node: 0, flat: 0 }, gathered: 0, powerUsed: 0,
    observations: {},
  };
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);
const dist = (a: Vec3, b: Vec3): number => len(sub(a, b));
const cycle = (id: string) => CYCLE_BY_ID.get(id)!;

/** Heat at a point from the lab's vent column, 0..1 (S4's baseline mapping). */
export function ventHeat(p: Vec3, tick: number): number {
  const c = VENT_COLUMN, ins = Math.min(p.x - c.min.x, c.max.x - p.x, p.y - c.min.y, c.max.y - p.y, p.z - c.min.z, c.max.z - p.z);
  if (ins <= 0) return 0;
  const w = Math.min(1, ins / c.edge), level = sampleCycleAt(cycle(c.cycle), tick).level;
  return w * (c.baseline + (1 - c.baseline) * level);
}
/** The warden's position along its path at the cycle's level (0 den, 1 flat). */
export function wardenAt(tick: number): Vec3 {
  const path = WARDEN.path, level = sampleCycleAt(cycle(WARDEN.cycle), tick).level;
  const lengths = path.slice(1).map((p, i) => dist(path[i]!, p)), total = lengths.reduce((a, b) => a + b, 0);
  let left = level * total;
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i]! || i === lengths.length - 1) {
      const t = Math.min(1, left / lengths[i]!), a = path[i]!, b = path[i + 1]!;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
    }
    left -= lengths[i]!;
  }
  return { ...path[path.length - 1]! };
}
const inPocket = (p: Vec3): boolean => dist(p, WARDEN.den) <= WARDEN.territory;

/** Picks the bloom bed offers this round at this level. */
export const bloomCapacity = (level: number): number => BLOOM.base + Math.floor(BLOOM.bonus * level);
/** Picks per warden round at the rich node (2 units each) and at the open flat bed (1 each). */
export const NODE_PICKS = 6;

/** Advance one fixed step. Mutates `s`. */
export function stepSandbox(s: SandboxState, input: SandboxInput, lab: Sandbox): SandboxReadout {
  const a = ACTORS[s.actor], diver = s.actor === "diver", events: SandboxReadout["events"] = [];
  const yaw = input.yaw ?? 0, pitch = input.pitch ?? 0;
  let forward = input.forward ?? 0, right = input.right ?? 0, vertical = input.vertical ?? 0;
  const powered = diver || (s.charge > 0 && s.health > 0);
  const speed = !powered ? 0 : input.quiet ? a.quiet : input.sprint ? a.boost : a.cruise;

  // ---- drive (step.ts shapes)
  const previous = len(s.velocity);
  if (diver) {
    const n = Math.max(1, Math.hypot(forward, right));
    forward /= n; right /= n;
    let vx = (Math.sin(yaw) * forward * Math.cos(pitch) + Math.cos(yaw) * right) * speed;
    let vz = (-Math.cos(yaw) * forward * Math.cos(pitch) + Math.sin(yaw) * right) * speed;
    let vy = vertical * 2.8 + Math.sin(pitch) * forward * speed;
    const m = Math.hypot(vx, vy, vz);
    if (m > speed && m > 0) { vx *= speed / m; vy *= speed / m; vz *= speed / m; }
    s.velocity = { x: vx, y: vy, z: vz };
  } else {
    const n = Math.max(1, Math.hypot(forward, right, vertical));
    forward /= n; right /= n; vertical /= n;
    const target = {
      x: (Math.sin(yaw) * forward * Math.cos(pitch) + Math.cos(yaw) * right) * speed,
      y: (vertical + Math.sin(pitch) * forward) * speed * 0.75,
      z: (-Math.cos(yaw) * forward * Math.cos(pitch) + Math.sin(yaw) * right) * speed,
    };
    const k = Math.min(1, DT * a.response);
    s.velocity = { x: s.velocity.x + (target.x - s.velocity.x) * k, y: s.velocity.y + (target.y - s.velocity.y) * k,
      z: s.velocity.z + (target.z - s.velocity.z) * k };
  }

  // ---- grapple (stand-in for SYS-1's anchor-and-reel line, Creel only)
  if (input.grapple && s.actor === "creel") {
    if (s.grapple) { s.grapple = null; events.push({ type: "grapple", message: "Line released." }); }
    else {
      const anchor = grappleTarget(lab.world, s.position, yaw);
      if (anchor) {
        s.grapple = { anchor, length: dist(anchor, s.position) };
        events.push({ type: "grapple", message: `Line fast at ${s.grapple.length.toFixed(1)} m.` });
      } else events.push({ type: "grapple", message: "No rock within 30 m ahead." });
    }
  }
  if (s.grapple && !lab.world.lineOfSight(s.position, s.grapple.anchor, [])) {
    s.grapple = null; events.push({ type: "grapple", message: "Something crossed the line; the grapple released." });
  }

  // ---- the current
  const sample = lab.field.sample(s.position, s.tick);
  const hold: HoldMode = diver || !powered ? "none"
    : s.grapple ? "grapple"
    : s.actor === "hearthline" && input.hold !== "off" ? "anchor"
    : input.hold === "off" ? "none" : "station";
  const response = respondToFlow(sample.flow, a, s.velocity, hold, powered);

  // ---- the warden shoos a trespasser out of its pocket (no harm)
  const warden = wardenAt(s.tick), shove = inPocket(s.position) && dist(warden, WARDEN.den) < WARDEN.territory + 4;
  const away = sub(s.position, WARDEN.den), awayN = Math.max(1e-6, Math.hypot(away.x, away.z));
  const push = shove ? { x: (away.x / awayN) * WARDEN.shove, y: 0, z: (away.z / awayN) * WARDEN.shove } : { x: 0, y: 0, z: 0 };

  // ---- one swept move of drive + drift (+ shove)
  const total = { x: s.velocity.x + response.drift.x + push.x, y: s.velocity.y + response.drift.y + push.y,
    z: s.velocity.z + response.drift.z + push.z };
  const delta = { x: total.x * DT, y: total.y * DT, z: total.z * DT };
  const top = diver ? -0.5 : -0.9;
  if (s.position.y + delta.y > top) delta.y = Math.min(delta.y, Math.max(0, top - s.position.y));
  let hitSolid = false;
  const from = { ...s.position };
  if (diver) {
    const slices = Math.max(1, Math.ceil(len(delta) / 0.12));
    for (let i = 0; i < slices; i++) {
      const moved = lab.world.moveCapsule(s.position, { x: delta.x / slices, y: delta.y / slices, z: delta.z / slices }, a.shape);
      s.position = moved.position; hitSolid ||= moved.hitSolid;
    }
  } else {
    const moved = moveHull(lab.world, s.position, delta, a.shape);
    s.position = moved.position; hitSolid = moved.hitSolid;
  }
  if (s.grapple) {
    // SYS-1 grappleStep: a hull past the line's length is pulled back onto it,
    // here through a sweep so the line can never pull it into rock.
    const d = dist(s.position, s.grapple.anchor);
    if (d > s.grapple.length) {
      const k = s.grapple.length / d, g = s.grapple.anchor;
      const onLine = { x: g.x + (s.position.x - g.x) * k, y: g.y + (s.position.y - g.y) * k, z: g.z + (s.position.z - g.z) * k };
      s.position = moveHull(lab.world, s.position, sub(onLine, s.position), a.shape).position;
    }
  }

  // ---- impact (drive only, step.ts's rule) and contact damping
  let impact = 0;
  if (!diver && hitSolid) {
    if (previous > 4) { impact = Math.min(s.health, (previous - 4) * DT * 10); s.health -= impact; }
    // Damp only the drive pushing into the face (the travel the sweep refused),
    // and keep the slide. step.ts halves all horizontal drive on any contact,
    // which lets a current pressing a hull onto rock stall it along the face;
    // the CY handoff proposes this rule instead.
    const lost = sub(delta, sub(s.position, from)), n = len(lost);
    if (n > 1e-9) {
      const into = (s.velocity.x * lost.x + s.velocity.y * lost.y + s.velocity.z * lost.z) / n;
      if (into > 0) s.velocity = { x: s.velocity.x - lost.x / n * into * 0.5, y: s.velocity.y - lost.y / n * into * 0.5,
        z: s.velocity.z - lost.z / n * into * 0.5 };
    }
  }
  // ---- drain: "driving" is the drive, never displacement, so drifting is not cruising
  let drain = 0, turbine = 0;
  if (!diver && powered) {
    const driving = len(s.velocity) > 0.05;
    const mode = input.sprint ? 1.7 : input.quiet ? 0.65 : 1;
    drain = (driving ? a.drain * mode : 0.015) + response.extraDrain;
    turbine = turbineRate({ fitted: s.turbine, hold, speed: len(s.velocity), flow: sample.flow, charge: s.charge, capacity: 1 });
    s.charge = Math.max(0, Math.min(100, s.charge - drain * DT + turbine * DT));
    s.powerUsed += drain * DT;
  }

  // ---- diver air (survival.ts rates) and the lab heat gauge (S4 rates)
  if (diver) {
    if (s.position.y > -1) s.oxygen = Math.min(100, s.oxygen + 20 * DT);
    else s.oxygen = Math.max(0, s.oxygen - (100 / 180) * DT);
    if (s.oxygen === 0) s.health = Math.max(0, s.health - 12 * DT);
  }
  const heat = ventHeat(s.position, s.tick), over = heat - a.heat;
  s.heat = over > 0 ? Math.min(100, s.heat + over * 20 * DT) : Math.max(0, s.heat - 12 * DT);

  // ---- cycles, gates and the journal log
  const cycles: Record<string, CycleSample> = {};
  for (const [id, c] of CYCLE_BY_ID) cycles[id] = sampleCycleAt(c, s.tick);
  const open = {} as Record<CandidateId, boolean>;
  for (const c of CANDIDATES) {
    open[c.id] = candidateOpen(c, cycles[c.cycle]!.level);
    const before = s.observations[c.cycle] ?? null;
    const seen = observeCycle(cycle(c.cycle), before, s.tick, dist(s.position, c.site) <= c.watchRange);
    if (seen.record && seen.record !== before) s.observations[c.cycle] = seen.record;
    if (seen.event) events.push(seen.event);
  }

  // ---- beds
  const bloom = cycles[BLOOM.cycle]!, round = cycle(WARDEN.cycle);
  if (s.picks.bloomRound !== bloom.round) s.picks = { ...s.picks, bloomRound: bloom.round, bloom: 0, ordinary: 0 };
  const wardenRound = sampleCycleAt(round, s.tick).round;
  if (s.picks.wardenRound !== wardenRound) s.picks = { ...s.picks, wardenRound, node: 0, flat: 0 };
  const bloomLeft = Math.max(0, bloomCapacity(bloom.level) - s.picks.bloom);
  if (input.pick) {
    if (dist(s.position, BLOOM.bed) <= BLOOM.reach && bloomLeft > 0) {
      s.picks.bloom++; s.gathered++; events.push({ type: "pick", bed: "bloom", units: 1 });
    } else if (dist(s.position, BLOOM.ordinary) <= BLOOM.reach && s.picks.ordinary < BLOOM.ordinaryPicks) {
      s.picks.ordinary++; s.gathered++; events.push({ type: "pick", bed: "ordinary", units: 1 });
    } else if (dist(s.position, WARDEN.node) <= BLOOM.reach && !shove && s.picks.node < NODE_PICKS) {
      s.picks.node++; s.gathered += 2; events.push({ type: "pick", bed: "node", units: 2 });
    } else if (dist(s.position, WARDEN.ordinary) <= BLOOM.reach && s.picks.flat < NODE_PICKS) {
      s.picks.flat++; s.gathered++; events.push({ type: "pick", bed: "ordinary", units: 1 });
    }
  }

  s.tick++;
  return { flow: sample.flow, flowSpeed: sample.speed, response, hold, drain, turbine, hitSolid, impact, cycles, open,
    ventHeat: heat, warden, wardenShove: shove, bloomLeft,
    nodeLeft: NODE_PICKS - s.picks.node, events };
}

/** First rock straight ahead within 30 m (SYS-1's line length). */
function grappleTarget(world: WorldQueries, from: Vec3, yaw: number): Vec3 | null {
  const dir = { x: Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
  let last: Vec3 | null = null;
  for (let r = 1; r <= 30; r += 0.5) {
    const p = { x: from.x + dir.x * r, y: from.y + 1, z: from.z + dir.z * r };
    if (!world.lineOfSight(from, p, [])) return last;
    last = p;
  }
  return null;
}
