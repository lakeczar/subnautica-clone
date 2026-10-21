import { CANOPY_COVER, THREAT_HOME } from "../content/registry.js";
import type { GameEvent, GameState, Vec3, WorldQueries } from "./types.js";
import { gameWorld } from "./world.js";
import { moveHunter } from "./hunter.js";
import {
  atAirStop,
  distance,
  facility,
  inCanopyAir,
  nearPod,
  nearWorkshop,
} from "./inventory.js";
import { personalDepth, personalLimit } from "./capabilities.js";
import { hullDepth } from "./vehicles.js";
import { cabinHull, cabinPowered } from "./fleet.js";
import { disableVehicle, incapacitate } from "./recovery.js";
const DT = 1 / 60;
export const SUIT_OXYGEN_DRAIN_PER_SECOND = 100 / 180;
/** These are fixed simulation reference points. Renderer eye interpolation is never read. */
export function exposure(s: GameState): {
  pressureDepth: number;
  airwayY: number;
  waterContact: boolean;
  breathable: boolean;
  refuge: boolean;
} {
  const p = s.player.pose.position;
  const cabin = cabinHull(s);
  const refuge =
    nearPod(s) ||
    (nearWorkshop(s) && facility(s, "island_workshop")) ||
    inCanopyAir(s) ||
    atAirStop(s) !== null ||
    (!!cabin && cabinPowered(cabin)) ||
    (!cabin && s.player.mode === "interior" &&
      !!s.player.interiorId &&
      s.fleet.docking?.stationKeeping === true);
  // An occupied hull keeps its occupant dry: the pilot seat, or a fitted cabin.
  const v = s.fleet.vehicles.find((v) => v.id === s.player.controlledVehicleId) ?? cabin;
  const airwayY = p.y + (s.player.mode === "swimming" ? 0.85 : 1.55),
    pressureDepth = personalDepth(p);
  return {
    pressureDepth,
    airwayY,
    waterContact: p.y + 0.4 < 0 && !refuge && !v,
    // A sealed cabin breathes its own powered or emergency supply, never the airway rule.
    breathable:
      refuge ||
      (airwayY >= 0 && !cabin) ||
      (!!v && ((v.charge > 0 && !v.disabled) || v.emergencyAir > 0)),
    refuge,
  };
}
/** Current air source only; finite supplies are not combined or replenished here. */
export function airSupply(s: GameState): {
  kind: "craft" | "refuge" | "surface" | "emergency" | "suit";
  remainingSeconds: number | null;
} {
  const cabin = cabinHull(s), v = s.fleet.vehicles.find(v => v.id === s.player.controlledVehicleId) ?? cabin,
    e = exposure(s);
  if (v && !cabin && v.charge > 0 && !v.disabled) return { kind: "craft", remainingSeconds: null };
  if (e.refuge) return { kind: "refuge", remainingSeconds: null };
  if (e.airwayY >= 0 && !cabin) return { kind: "surface", remainingSeconds: null };
  if (v && v.emergencyAir > 0) return { kind: "emergency", remainingSeconds: v.emergencyAir };
  return { kind: "suit", remainingSeconds: s.player.vitals.oxygen / SUIT_OXYGEN_DRAIN_PER_SECOND };
}
export function updateSurvival(s: GameState, events: GameEvent[]): void {
  if (s.opening.phase < 4) return;
  const p = s.player,
    v = s.fleet.vehicles.find((v) => v.id === p.controlledVehicleId) ?? cabinHull(s),
    e = exposure(s),
    before = p.vitals.oxygen,
    foodBefore = p.vitals.food;
  if (e.breathable) p.vitals.oxygen = Math.min(100, p.vitals.oxygen + 20 * DT);
  else p.vitals.oxygen = Math.max(0, p.vitals.oxygen - SUIT_OXYGEN_DRAIN_PER_SECOND * DT);
  s.metrics.oxygenUsed += Math.max(0, before - p.vitals.oxygen);
  s.metrics.minOxygen = Math.min(s.metrics.minOxygen, p.vitals.oxygen);
  if (p.vitals.oxygen === 0) p.vitals.health -= 12 * DT;
  if (!v && !e.refuge && e.pressureDepth > personalLimit(s))
    p.vitals.health -= (5 + (e.pressureDepth - personalLimit(s)) * 0.22) * DT;
  if (v) {
    const depth = hullDepth(v);
    if (v.hull !== "spindle" && depth > v.rating)
      v.health = Math.max(
        0,
        v.health - (3 + (depth - v.rating) * 0.1) * DT,
      );
    if (v.hull === "spindle" && depth > 1)
      v.health = Math.max(0, v.health - 20 * DT);
    if (v.charge === 0 || v.disabled)
      v.emergencyAir = Math.max(0, v.emergencyAir - DT);
    if (v.health <= 0 && !v.disabled) {
      disableVehicle(s, v.id);
      events.push({
        type: "notice",
        channel: "hazard", context: "hull",
        message:
          cabinHull(s) ? "Hull disabled. The cabin is on its labelled emergency air. Leave by the hatch with a protected exit and return with the rescue collar."
            : "Hull disabled. Emergency air is limited. Use a protected exit and return with the reusable rescue collar.",
        error: true,
      });
    }
    s.metrics.minPower = Math.min(s.metrics.minPower, v.charge);
  }
  p.graceSeconds = Math.max(0, p.graceSeconds - DT);
  // 70 food per meal lasts 35 active minutes. Grace never removes ordinary movement/gathering.
  if (p.graceSeconds === 0)
    p.vitals.food = Math.max(0, p.vitals.food - (70 / 2100) * DT);
  if (p.vitals.food === 0) {
    p.starvationSeconds += DT;
    if (p.starvationSeconds > 180) p.vitals.health -= 0.35 * DT;
  } else p.starvationSeconds = 0;
  if (e.refuge) {
    if (p.vitals.food > 0)
      p.vitals.health = Math.min(100, p.vitals.health + 1.8 * DT);
    if (nearPod(s)) p.refugeId = "home_pod";
    else if (nearWorkshop(s)) p.refugeId = "island_workshop";
  }
  for (const [old, now, label] of [
    [before, p.vitals.oxygen, "Oxygen"],
  ] as const)
    for (const limit of [35, 20, 10])
      if (old > limit && now <= limit) {
        events.push(
          {
            type: "notice",
            channel: "hazard", context: "oxygen",
            message: `${label} ${limit}%. Return to air; the pod ramp and established refuges are safe.`,
            error: true,
          },
          { type: "sound", cue: "warning", cause: "oxygen" },
        );
      }
  for (const limit of [20, 10])
    if (foodBefore > limit && p.vitals.food <= limit)
      events.push({ type: "notice", channel: "hazard", context: "food", message: `Food ${limit}%. Hand-gather shallow staples or use an emergency refuge portion; ordinary swimming remains available.`, error: true }, { type: "sound", cue: "warning", cause: "food" });
  if (s.tick % 300 === 0) {
    if (e.pressureDepth > personalLimit(s) && !v)
      events.push({ type: "sound", cue: "warning", cause: "pressure" });
    if (v && v.charge < 25) events.push({ type: "sound", cue: "warning", cause: "power" });
    if (v && v.hull !== "spindle" && hullDepth(v) > v.rating * 0.85)
      events.push({ type: "sound", cue: "warning", cause: "hull-depth" });
  }
  if (p.vitals.health <= 0) {
    incapacitate(
      s,
      p.vitals.oxygen === 0
        ? "Oxygen exhausted."
        : p.vitals.food === 0
          ? "Prolonged starvation."
          : "Exposure or injury.",
    );
    events.push(
      { type: "sound", cue: "recovery" },
      { type: "notice", channel: "hazard", context: "recovery", message: s.feedback, error: true },
    );
  }
}
export function behindCover(player: Vec3, hunter: Vec3): boolean {
  const b = CANOPY_COVER;
  let t0 = 0,
    t1 = 1;
  for (const a of ["x", "y", "z"] as const) {
    const d = hunter[a] - player[a];
    if (Math.abs(d) < 1e-7) {
      if (player[a] < b.min[a] || player[a] > b.max[a]) return false;
      continue;
    }
    const a0 = (b.min[a] - player[a]) / d,
      a1 = (b.max[a] - player[a]) / d;
    t0 = Math.max(t0, Math.min(a0, a1));
    t1 = Math.min(t1, Math.max(a0, a1));
    if (t0 > t1) return false;
  }
  return true;
}
export function updateThreat(
  s: GameState,
  loudness: number,
  events: GameEvent[],
  world: WorldQueries = gameWorld(),
): void {
  if (s.opening.phase < 4 || s.scenario !== "expedition") return;
  const t = s.world.threat,
    p = s.player.pose.position;
  const d = distance(t.position, p),
    territory = distance(p, THREAT_HOME) < 72 && !exposure(s).refuge;
  const cover = behindCover(p, t.position);
  t.modeSeconds += DT;
  if (t.distractionSeconds > 0) {
    t.distractionSeconds = Math.max(0, t.distractionSeconds - DT);
    if (!t.distractionSeconds) t.distraction = null;
  }
  if (territory && !cover && loudness > 0.35)
    t.interest = Math.min(12, t.interest + loudness * DT * 2);
  else t.interest = Math.max(0, t.interest - DT * (cover ? 3 : 1.1));
  const change = (mode: typeof t.mode): void => {
    if (mode === t.mode) return;
    t.mode = mode;
    t.modeSeconds = 0;
    if (mode === "warn" || mode === "pursue")
      events.push(
        {
          type: "notice",
          channel: "hazard", context: "threat",
          message:
            mode === "warn"
              ? "Paired warning calls. The hunter turns toward you. Slow down or reach cover."
              : "The hunter is pursuing. Break sight behind the tall rib or retreat to the clear upper flank.",
          error: true,
        },
        { type: "sound", cue: "warning", origin: { ...t.position }, source: "threat-call" },
      );
  };
  if (!territory || (cover && t.modeSeconds > 1) || t.distraction) {
    if (t.mode !== "idle") change("disengage");
  } else if (t.mode === "idle" && t.interest > 0.65) change("warn");
  else if (t.mode === "warn" && t.modeSeconds > 3)
    change(t.interest > 1 ? "investigate" : "disengage");
  else if (t.mode === "investigate" && t.modeSeconds > 4)
    change(t.interest > 3 ? "pursue" : "disengage");
  else if (t.mode === "pursue" && (t.interest < 1 || d > 62))
    change("disengage");
  else if (
    t.mode === "disengage" &&
    t.modeSeconds > 5 &&
    distance(t.position, THREAT_HOME) < 4
  )
    change("idle");
  const motion = moveHunter(s, world);
  t.position = motion.position;
  if (motion.contact.biting && !behindCover(p, t.position) && !exposure(s).refuge && !t.distraction) {
    const v = s.fleet.vehicles.find(
      (v) => v.id === s.player.controlledVehicleId,
    ) ?? cabinHull(s);
    if (v) {
      const before = v.health;
      v.health = Math.max(0, v.health - 12 * DT);
      const loss = before - v.health;
      if (loss > 0) events.push({ type: "threat-damage", source: "hunter",
        target: { kind: "vehicle", vehicleId: v.id }, loss, healthAfter: v.health });
    } else {
      const before = s.player.vitals.health;
      s.player.vitals.health -= 10 * DT;
      const healthAfter = Math.max(0, s.player.vitals.health), loss = Math.max(0, before - healthAfter);
      if (loss > 0) events.push({ type: "threat-damage", source: "hunter", target: { kind: "diver" }, loss, healthAfter });
    }
    if (s.tick % 60 === 0) events.push({ type: "sound", cue: "damage", origin: { ...t.position } });
  }
}
