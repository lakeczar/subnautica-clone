/** REC-1: what the flight recorder records from the game, kept out of app.ts.
 * Simulation events, timeline milestones and the periodic sample. DOM-free. */
import type { GameCommand, GameEvent, GameState } from "../../sim/types.js";
import type { TimelineEvent } from "../../sim/timeline/report.js";
import { exposure } from "../../sim/survival.js";
import { regionAtPoint } from "../../content/regions/layout.js";
import type { FlightRecorder, FlightSample } from "./recorder.js";
import type { RendererStats } from "../../render/renderer.js";

const r1 = (v: number): number => Math.round(v * 10) / 10;
const where = (s: GameState): [number, number, number] => {
  const p = s.player.pose.position;
  return [r1(p.x), r1(p.y), r1(p.z)];
};

/** One step's (or one command's) events. */
export function recordGameEvents(rec: FlightRecorder, s: GameState | null, events: readonly GameEvent[]): void {
  const tick = s?.tick;
  const stamp = (detail: Record<string, unknown>) => ({ ...(tick !== undefined ? { tick } : {}), detail: s ? { ...detail, at: where(s) } : detail });
  for (const e of events) {
    switch (e.type) {
      case "threat-damage":
        rec.event("damage", `${e.source === "hunter" ? "hunter" : e.species ?? "ecology"} strike on the ${e.target.kind}: -${r1(e.loss)}, health ${r1(e.healthAfter)}`,
          stamp({ source: e.source, ...(e.species ? { species: e.species } : {}), target: e.target.kind, loss: r1(e.loss), healthAfter: r1(e.healthAfter) }));
        break;
      case "impact":
        if (e.hullLoss > 0) rec.event("damage", `impact at ${r1(e.speed)} m/s: hull -${r1(e.hullLoss)}`, stamp({ speed: r1(e.speed), hullLoss: r1(e.hullLoss) }));
        break;
      case "ecology":
        if (e.event.type === "ecology-cue" && (e.event.cue === "alert" || e.event.cue === "investigate" || e.event.cue === "commit"))
          rec.event("threat", `${e.event.species} ${e.event.cue}: ${e.event.caption}`, stamp({ species: e.event.species, cue: e.event.cue, agent: e.event.agentId }));
        else if (e.event.type === "hazard-warning")
          rec.event("threat", `hazard ${e.event.hazard} level ${e.event.level}: ${e.event.caption}`, stamp({ hazard: e.event.hazard, level: e.event.level }));
        break;
      case "sound":
        if (e.source === "threat-call") rec.event("threat", "threat call", stamp({ cue: e.cue }));
        break;
      case "notice":
        if (e.refusal || (e.error && e.channel !== "persistence"))
          rec.event("refusal", `refused: ${e.message}`, stamp({ ...(e.refusal ? { code: e.refusal.code } : {}), ...(e.channel ? { channel: e.channel } : {}) }));
        else rec.event("notice", e.message, { ...stamp({ ...(e.channel ? { channel: e.channel } : {}), ...(e.context ? { context: e.context } : {}) }), snapshot: false });
        break;
      case "foundation-boundary":
        break;
      default:
        break;
    }
  }
}

/** A player command (the pacing sheet's "doing"). */
export function recordCommand(rec: FlightRecorder, s: GameState | null, command: GameCommand): void {
  if (command.type === "move" || command.type === "look") return;
  rec.event("action", command.type, { ...(s ? { tick: s.tick } : {}), detail: { command: command.type }, snapshot: false });
}

const MILESTONE_KINDS = new Set(["new", "death", "recovery", "system"]);
/** New play-timeline entries since `from`: milestones (with a snapshot), the rest for pacing. Returns the new cursor. */
export function recordTimeline(rec: FlightRecorder, events: readonly TimelineEvent[], from: number): number {
  for (let i = from; i < events.length; i++) {
    const e = events[i]!;
    const detail: Record<string, unknown> = { timeline: e };
    if (e.kind === "note") rec.event("note", `note: ${e.text ?? ""}`, { tick: e.tick, detail });
    else if (MILESTONE_KINDS.has(e.kind)) rec.event("milestone", `${e.kind}${e.what ? ` ${e.what}` : ""}${e.id ? ` ${e.id}` : ""}${e.label ? ` (${e.label})` : ""}`, { tick: e.tick, detail });
    else rec.event("action", `${e.kind}${e.what ? ` ${e.what}` : ""}${e.id ? ` ${e.id}` : ""}${e.seconds !== undefined ? ` ${r1(e.seconds)} s` : ""}`, { tick: e.tick, detail, snapshot: false });
  }
  return events.length;
}

/** The periodic sample: where the player is, how they are, what the renderer holds. */
export function gameSample(t: number, s: GameState | null, stats: RendererStats | null, camera: [number, number, number] | null,
  hold: string | null, active: boolean, frames: number): FlightSample {
  const v = s?.player.controlledVehicleId ? s.fleet.vehicles.find((x) => x.id === s.player.controlledVehicleId) ?? null : null;
  const vel = v ? v.velocity : s?.player.velocity;
  const p = s?.player.pose.position;
  const out: FlightSample = {
    t, tick: s?.tick ?? 0, pos: camera ?? (p ? [r1(p.x), r1(p.y), r1(p.z)] : [0, 0, 0]),
    depth: s && s.opening.phase >= 4 ? r1(exposure(s).pressureDepth) : 0,
    region: p ? regionAtPoint(p.x, p.z) : null, cave: stats?.cave ?? null, hold,
    oxygen: s ? r1(s.player.vitals.oxygen) : null, health: s ? r1(s.player.vitals.health) : null, food: s ? r1(s.player.vitals.food) : null,
    speed: vel ? r1(Math.hypot(vel.x, vel.y, vel.z)) : 0, mode: s?.player.mode ?? "menu",
    craft: v ? { id: v.id, hull: v.hull, charge: r1(v.charge), health: r1(v.health) } : null, active, frames,
  };
  if (stats) Object.assign(out, {
    draws: stats.draws, triangles: Math.round(stats.triangles), meshes: stats.meshes, textures: stats.textures, materials: stats.materials,
    geometries: stats.geometries, residentCpuMiB: r1(stats.residentCpu / 1048576), residentGpuMiB: r1(stats.residentGpu / 1048576),
    unsliced: stats.caveStream.sync,
  });
  return out;
}
