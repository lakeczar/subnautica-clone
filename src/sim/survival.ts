import { CANOPY_COVER, HULLS, THREAT_HOME } from "../content/registry.js";
import type { GameEvent, GameState, Vec3, WorldQueries } from "./types.js";
import { createWorldQueries, moveHull } from "./world.js";
import {
  distance,
  facility,
  inCanopyAir,
  nearPod,
  nearWorkshop,
} from "./inventory.js";
import { personalLimit } from "./progression.js";
import { hullDepth } from "./vehicles.js";
import { disableVehicle, incapacitate } from "./recovery.js";
const DT = 1 / 60;
/** These are fixed simulation reference points. Renderer eye interpolation is never read. */
export function exposure(s: GameState): {
  pressureDepth: number;
  airwayY: number;
  waterContact: boolean;
  breathable: boolean;
  refuge: boolean;
} {
  const p = s.player.pose.position;
  const refuge =
    nearPod(s) ||
    (nearWorkshop(s) && facility(s, "island_workshop")) ||
    inCanopyAir(s) ||
    (s.player.mode === "interior" &&
      !!s.player.interiorId &&
      s.fleet.docking?.stationKeeping === true);
  const v = s.fleet.vehicles.find((v) => v.id === s.player.controlledVehicleId);
  const airwayY = p.y + (s.player.mode === "swimming" ? 0.85 : 1.55),
    pressureDepth = Math.max(0, -(p.y + 0.4));
  return {
    pressureDepth,
    airwayY,
    waterContact: p.y + 0.4 < 0 && !refuge && !v,
    breathable:
      refuge ||
      airwayY >= 0 ||
      (!!v && ((v.charge > 0 && !v.disabled) || v.emergencyAir > 0)),
    refuge,
  };
}
export function updateSurvival(s: GameState, events: GameEvent[]): void {
  if (s.opening.phase < 4) return;
  const p = s.player,
    v = s.fleet.vehicles.find((v) => v.id === p.controlledVehicleId),
    e = exposure(s),
    before = p.vitals.oxygen,
    foodBefore = p.vitals.food;
  if (e.breathable) p.vitals.oxygen = Math.min(100, p.vitals.oxygen + 20 * DT);
  else p.vitals.oxygen = Math.max(0, p.vitals.oxygen - (100 / 180) * DT);
  s.metrics.oxygenUsed += Math.max(0, before - p.vitals.oxygen);
  s.metrics.minOxygen = Math.min(s.metrics.minOxygen, p.vitals.oxygen);
  if (p.vitals.oxygen === 0) p.vitals.health -= 12 * DT;
  if (!v && !e.refuge && e.pressureDepth > personalLimit(s))
    p.vitals.health -= (5 + (e.pressureDepth - personalLimit(s)) * 0.22) * DT;
  if (v) {
    const depth = hullDepth(v);
    if (v.hull !== "spindle" && depth > HULLS[v.hull].initialDepth)
      v.health -= (3 + (depth - HULLS[v.hull].initialDepth) * 0.1) * DT;
    if (v.hull === "spindle" && depth > 1) v.health -= 20 * DT;
    if (v.charge === 0 || v.disabled)
      v.emergencyAir = Math.max(0, v.emergencyAir - DT);
    if (v.health <= 0 && !v.disabled) {
      disableVehicle(s, v.id);
      events.push({
        type: "notice",
        message:
          "Hull disabled. Emergency air is limited. Use a protected exit and return with the reusable rescue collar.",
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
            message: `${label} ${limit}%. Return to air; the pod ramp and established refuges are safe.`,
            error: true,
          },
          { type: "sound", cue: "warning" },
        );
      }
  for (const limit of [20, 10])
    if (foodBefore > limit && p.vitals.food <= limit)
      events.push({ type: "notice", message: `Food ${limit}%. Hand-gather shallow staples or use an emergency refuge portion; ordinary swimming remains available.`, error: true }, { type: "sound", cue: "warning" });
  if (s.tick % 300 === 0) {
    if (e.pressureDepth > personalLimit(s) && !v)
      events.push({ type: "sound", cue: "warning" });
    if (v && v.charge < 25) events.push({ type: "sound", cue: "warning" });
    if (v && v.hull !== "spindle" && hullDepth(v) > HULLS[v.hull].initialDepth * 0.85)
      events.push({ type: "sound", cue: "warning" });
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
      { type: "notice", message: s.feedback, error: true },
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
  world: WorldQueries = createWorldQueries(),
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
          message:
            mode === "warn"
              ? "A low paired call. The sound hunter turns toward your machinery. Slow down, use the tall rib as cover, or release a distraction."
              : "The hunter commits. Break its line of sight or retreat toward the upper clear flank.",
          error: true,
        },
        { type: "sound", cue: "warning", origin: { ...t.position } },
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
  let target: Vec3 = THREAT_HOME,
    speed = 2;
  if (t.distraction) target = t.distraction;
  else if (t.mode === "investigate" || t.mode === "pursue") {
    target = p;
    speed = t.mode === "pursue" ? 7 : 3;
  }
  if (t.mode === "idle" || t.mode === "warn") speed = 0;
  const dist = distance(t.position, target),
    scale = Math.min(1, (speed * DT) / Math.max(0.01, dist));
  t.position = moveHull(world, t.position, {
    x: (target.x - t.position.x) * scale,
    y: (target.y - t.position.y) * scale,
    z: (target.z - t.position.z) * scale,
  }, { radius: 1.2, height: 1.8 }).position;
  if (t.mode === "pursue" && d < 5.3 && !cover) {
    const v = s.fleet.vehicles.find(
      (v) => v.id === s.player.controlledVehicleId,
    );
    if (v) v.health -= 12 * DT;
    else s.player.vitals.health -= 10 * DT;
    if (s.tick % 60 === 0) events.push({ type: "sound", cue: "damage", origin: { ...t.position } });
  }
}
