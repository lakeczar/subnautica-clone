/** ENC-1: the Canopy sound hunter's encounter. It warns, swims a silhouette
 * pass across the actor's bow, and only then pursues; it bites once per
 * contact cycle with a non-lethal warning bump first and a ramp after; quiet
 * running, a dark lamp, cover and retreat always end it. Moved from
 * survival.ts (which re-exports `updateThreat`); geometry stays in hunter.ts. */
import { HUNTER_ENCOUNTER as E } from "../content/ecology/encounter.js";
import { HUNTER_GEOMETRY as H } from "../content/encounterGeometry.js";
import { THREAT_HOME } from "../content/registry.js";
import { lampOn } from "./ecologyLink.js";
import { cabinHull } from "./fleet.js";
import { moveHunter } from "./hunter.js";
import { eyeHeight } from "./state.js";
import { distance } from "./inventory.js";
import { behindCover, exposure } from "./survival.js";
import type { GameEvent, GameState, Vec3, WorldQueries } from "./types.js";
import { PULSE_CHARGE_COST } from "./vehicles.js";
import { gameWorld } from "./world.js";

const DT = 1 / 60;
/** Latest pursuit time before the warning bump: just inside cycle 0's contact phase. */
const FIRST_CONTACT = H.contactSeconds - 1e-6;
/** Radius of the hunter's territory around its home. */
export const HUNTER_TERRITORY = 72;
export type HunterMode = GameState["world"]["threat"]["mode"];

/** Angle between the actor's view (heading and pitch, from its eye) and `point`. */
export function viewAngle(s: GameState, point: Vec3): number {
  const p = s.player.pose.position, yaw = s.player.pose.yaw, pitch = s.player.pose.pitch;
  const dx = point.x - p.x, dy = point.y - p.y - eyeHeight(s), dz = point.z - p.z, n = Math.hypot(dx, dy, dz);
  if (n < 1e-9) return 0;
  const dot = (dx * Math.sin(yaw) * Math.cos(pitch) + dy * Math.sin(pitch) - dz * Math.cos(yaw) * Math.cos(pitch)) / n;
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}
/** Middle of the animal's body, above its keel-level origin. */
export const hunterBody = (s: GameState): Vec3 => ({ ...s.world.threat.position, y: s.world.threat.position.y + 0.7 });
/** The pursuit cycle a bite at this mode time belongs to (0: the warning bump). */
export const biteCycle = (modeSeconds: number): number => Math.max(0, Math.floor(modeSeconds / H.cycleSeconds));
/** Loss of one bite in the given pursuit cycle, before the warning-bump floor. */
export function biteLoss(cycle: number, vehicle: boolean): number {
  const table = vehicle ? E.bites.vehicle : E.bites.diver;
  return table[Math.min(cycle, table.length - 1)]!;
}

/** Captions that name the cue and the way out; the HUD banner shows the short form. */
export const HUNTER_CAPTIONS = {
  warn: "Paired calls: a sound hunter heard your engine and is coming to look. Hold Z to run quiet, switch the lamp off (L), or back away.",
  investigate: "The hunter sweeps across your bow, listening. Quiet (Z) and dark (L) lose it; stay loud and it lunges.",
  pursue: "The hunter is pursuing. Each pass bites harder while you stay loud and lit. Z quiet with the lamp off, break sight behind the tall rib, or retreat.",
  bump: "A warning bump. The next bites come harder while it can hear you. Z quiet, lamp off (L), or back away.",
} as const;

function carriedCell(s: GameState): boolean {
  const v = s.fleet.vehicles.find((v) => v.id === s.player.controlledVehicleId);
  const holds = ["diver", ...(v && !v.berth ? [v.cargoId] : [])];
  return s.inventory.items.some((i) => i.kind === "reserve_cell" && !i.fitted && holds.includes(i.containerId) &&
    (i.charge ?? 0) >= PULSE_CHARGE_COST);
}
/** Teaching caption on entering the approach ring, before any warning. It
 * names quiet and the lamp, and where the pulse's reserve cell is. */
export function approachCaption(s: GameState): string {
  const cell = carriedCell(s), stored = s.inventory.items.some((i) => i.kind === "reserve_cell" && i.containerId === "pod_locker");
  return `Upper Canopy crowns: a sound hunter keeps this water. Near it, hold Z to run quiet and switch the lamp off (L). ${
    cell ? "G spends 25 reserve-cell charge on a decoy pulse."
    : stored ? "Your reserve cells are in the pod locker; carry one in your hold or the craft's for the G decoy pulse."
    : "A charged reserve cell (pod fabricator) in your hold powers the G decoy pulse."}`;
}

export function updateThreat(
  s: GameState,
  loudness: number,
  events: GameEvent[],
  world: WorldQueries = gameWorld(),
): void {
  if (s.opening.phase < 4 || s.scenario !== "expedition") return;
  const t = s.world.threat,
    p = s.player.pose.position,
    refuge = exposure(s).refuge;
  const d = distance(t.position, p),
    territory = distance(p, THREAT_HOME) < HUNTER_TERRITORY && !refuge;
  const cover = behindCover(p, t.position);
  // Crossing the approach ring inward (by this step's own velocity) teaches
  // the counterplay once per entry, before any warning.
  const v0 = s.player.velocity, before = { x: p.x - v0.x * DT, y: p.y - v0.y * DT, z: p.z - v0.z * DT };
  if (!refuge && t.mode === "idle" && distance(p, THREAT_HOME) < E.approachRing && distance(before, THREAT_HOME) >= E.approachRing)
    events.push({ type: "notice", channel: "hazard", message: approachCaption(s) });
  // Pursuit time holds in its first contact phase until the warning bump
  // lands, so the first contact of every pursuit is the bump, however long
  // the approach took; the ramp counts from there.
  t.modeSeconds = t.mode === "pursue" && t.modeSeconds <= FIRST_CONTACT
    ? Math.min(FIRST_CONTACT, t.modeSeconds + DT) : t.modeSeconds + DT;
  if (t.distractionSeconds > 0) {
    t.distractionSeconds = Math.max(0, t.distractionSeconds - DT);
    if (!t.distractionSeconds) t.distraction = null;
  }
  if (territory && !cover && loudness > 0.35)
    t.interest = Math.min(E.interest.max, t.interest + loudness * DT * 2);
  else t.interest = Math.max(0, t.interest - DT * (cover ? E.interest.cover : lampOn(s) ? E.interest.lit : E.interest.dark));
  const change = (mode: HunterMode): void => {
    if (mode === t.mode) return;
    t.mode = mode;
    t.modeSeconds = 0;
    if (mode === "warn" || mode === "pursue")
      events.push(
        { type: "notice", channel: "hazard", context: "threat", message: HUNTER_CAPTIONS[mode], error: true },
        { type: "sound", cue: "warning", origin: { ...t.position }, source: "threat-call" },
      );
    else if (mode === "investigate")
      events.push({ type: "notice", channel: "hazard", context: "threat", message: HUNTER_CAPTIONS.investigate, error: true });
  };
  if (!territory || (cover && t.modeSeconds > 1) || t.distraction) {
    if (t.mode !== "idle") change("disengage");
  } else if (t.mode === "idle" && t.interest > 0.65) change("warn");
  else if (t.mode === "warn" && t.modeSeconds > 3)
    change(t.interest > 1 ? "investigate" : "disengage");
  else if (t.mode === "investigate" && t.modeSeconds > E.pursuit.earliest) {
    // The lunge comes only after the pass: close, and ahead of the view
    // until the latest, so the animal that bites has been seen.
    if (t.interest <= 3) change("disengage");
    else if (d < E.pursuit.range && (t.modeSeconds > E.pursuit.latest || viewAngle(s, hunterBody(s)) < E.pursuit.view))
      change("pursue");
  } else if (t.mode === "pursue" && (t.interest < 1 || d > 62))
    change("disengage");
  else if (
    t.mode === "disengage" &&
    t.modeSeconds > 5 &&
    distance(t.position, THREAT_HOME) < 4
  )
    change("idle");
  const motion = moveHunter(s, world);
  t.position = motion.position;
  if (motion.contact.biting && !behindCover(p, t.position) && !exposure(s).refuge && !t.distraction) bite(s, events);
}

/** One bite, then withdrawal for the rest of this contact cycle. The warning
 * bump (cycle 0) never takes the last point of health. */
function bite(s: GameState, events: GameEvent[]): void {
  const t = s.world.threat, cycle = biteCycle(t.modeSeconds);
  const controlled = s.fleet.vehicles.find((v) => v.id === s.player.controlledVehicleId);
  const v = controlled ?? cabinHull(s);
  const floor = (health: number): number => cycle === 0 ? Math.min(health, 1) : 0;
  let loss: number;
  if (v) {
    const before = v.health;
    v.health = Math.max(floor(before), before - biteLoss(cycle, true));
    loss = before - v.health;
    if (loss > 0) events.push({ type: "threat-damage", source: "hunter", origin: { ...t.position },
      target: { kind: "vehicle", vehicleId: v.id }, loss, healthAfter: v.health });
    const knock = controlled ? E.knock[controlled.hull] : 0, dx = v.pose.position.x - t.position.x, dz = v.pose.position.z - t.position.z;
    const n = Math.hypot(dx, dz);
    // A bite that disables leaves the wreck where it was lost.
    if (knock > 0 && n > 1e-6 && v.health > 0) {
      v.velocity.x += dx / n * knock;
      v.velocity.z += dz / n * knock;
      s.player.velocity = { ...v.velocity };
    }
  } else {
    const before = s.player.vitals.health;
    s.player.vitals.health = Math.max(floor(before), before - biteLoss(cycle, false));
    loss = Math.max(0, before - s.player.vitals.health);
    if (loss > 0) events.push({ type: "threat-damage", source: "hunter", origin: { ...t.position }, target: { kind: "diver" },
      loss, healthAfter: Math.max(0, s.player.vitals.health) });
  }
  if (loss > 0) {
    events.push({ type: "sound", cue: "damage", origin: { ...t.position } });
    if (cycle === 0) events.push({ type: "notice", channel: "hazard", message: HUNTER_CAPTIONS.bump, error: true });
  }
  t.modeSeconds = cycle * H.cycleSeconds + H.contactSeconds;
}
