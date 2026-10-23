/** REC-1: what the flight recorder records from the game, kept out of app.ts.
 * Simulation events, timeline milestones and the periodic sample. DOM-free. */
import type { GameCommand, GameEvent, GameState, Vec3 } from "../../sim/types.js";
import type { TimelineEvent } from "../../sim/timeline/report.js";
import type { TimelineRecorder } from "../../sim/timeline/recorder.js";
import { exposure } from "../../sim/survival.js";
import { personalLimit } from "../../sim/capabilities.js";
import { hullDepth } from "../../sim/vehicles.js";
import { effectiveRating } from "../../sim/fittings.js";
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
        // A refusal is a command the game turned down (R1-F9): an exit refusal, or an
        // action-channel error. Hazard warnings are threats; persistence problems
        // are the save events' (the session reports them).
        if (e.refusal || (e.error && (e.channel === "action" || e.channel === undefined)))
          rec.event("refusal", `refused: ${e.message}`, stamp({ ...(e.refusal ? { code: e.refusal.code } : {}), ...(e.channel ? { channel: e.channel } : {}) }));
        else if (e.channel === "hazard")
          rec.event("threat", `warning: ${e.message}`, stamp({ channel: "hazard", ...(e.context ? { context: e.context } : {}) }));
        else if (e.channel !== "persistence" || !e.error)
          rec.event("notice", e.message, { ...stamp({ ...(e.channel ? { channel: e.channel } : {}), ...(e.context ? { context: e.context } : {}) }), snapshot: false });
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

// The seam: the only code that knows the timeline's layout. A cursor counts
// entries ever recorded, never an index into `events`, so it survives a
// timeline that seals and resets its open chunk (SIM-1). SIM-1 replaces the two
// bodies with its `seq` and `timelineSince`.
/** The cursor at the timeline's present. Root's timeline only appends (past its
 * cap it drops the new entry), so its length counts every entry it kept. */
export const timelineHead = (t: TimelineRecorder): number => t.events.length;
/** The entries after `cursor`, the cursor to pass next, and how many went before they were read. */
export function timelineSince(t: TimelineRecorder, cursor: number): { events: readonly TimelineEvent[]; cursor: number; missed: number } {
  return { events: t.events.slice(cursor), cursor: t.events.length, missed: 0 };
}

/** The flight recorder's place in the play timeline. A cursor belongs to one
 * timeline: `start` takes the head of each timeline as it arrives (a new
 * recording, a reload, a new expedition), so a reloaded history is not replayed
 * and a stale count from another session never hides the new one's entries. */
export class TimelineReader {
  private of: TimelineRecorder | null = null;
  private at = 0;
  /** Reads `t` from now on. */
  start(t: TimelineRecorder | null): void { this.of = t; this.at = t ? timelineHead(t) : 0; }
  /** Records what `t` gained since the last read. A timeline nobody started is read from its present, never from another's count. */
  read(rec: FlightRecorder, t: TimelineRecorder): void {
    if (t !== this.of) this.start(t);
    this.at = recordTimeline(rec, t, this.at);
  }
}

const MILESTONE_KINDS = new Set(["new", "death", "recovery", "system"]);
/** New play-timeline entries since `cursor`: milestones (with a snapshot), the rest for pacing. Returns the new cursor. */
export function recordTimeline(rec: FlightRecorder, t: TimelineRecorder, cursor: number): number {
  // Most calls find nothing new: answered from the head, allocating nothing.
  if (timelineHead(t) <= cursor) return cursor;
  const read = timelineSince(t, cursor);
  if (read.missed > 0) rec.event("warning", `play timeline: ${read.missed} entries went before the recorder read them`, { detail: { missed: read.missed }, snapshot: false });
  for (const e of read.events) {
    const detail: Record<string, unknown> = { timeline: e };
    if (e.kind === "note") rec.event("note", `note: ${e.text ?? ""}`, { tick: e.tick, detail });
    else if (MILESTONE_KINDS.has(e.kind)) rec.event("milestone", `${e.kind}${e.what ? ` ${e.what}` : ""}${e.id ? ` ${e.id}` : ""}${e.label ? ` (${e.label})` : ""}`, { tick: e.tick, detail });
    else rec.event("action", `${e.kind}${e.what ? ` ${e.what}` : ""}${e.id ? ` ${e.id}` : ""}${e.seconds !== undefined ? ` ${r1(e.seconds)} s` : ""}`, { tick: e.tick, detail, snapshot: false });
  }
  return read.cursor;
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

/** A fixed view (REC-1's visual regression): the diver alone at a pose, out of
 * any craft (which waits where it was), still. Degrees, as the HUD shows them.
 * Drivers only (`?rec=driver`); the clock is frozen around it. */
export interface StagedView { position: Vec3; yaw: number; pitch: number; tick?: number; lamp?: boolean }
export function stageView(state: GameState, v: StagedView): GameState {
  const s = structuredClone(state), p = s.player;
  p.controlledVehicleId = null; p.interiorId = null; p.interiorPose = null;
  p.pose = { frame: "world", position: { ...v.position }, yaw: (v.yaw * Math.PI) / 180, pitch: (v.pitch * Math.PI) / 180 };
  p.velocity = { x: 0, y: 0, z: 0 };
  p.mode = v.position.y < -0.5 ? "swimming" : "walking";
  if (v.lamp !== undefined) p.lamp = v.lamp;
  if (v.tick !== undefined) s.tick = v.tick;
  s.world.action = null;
  return s;
}

/** Survival injury (R1-F9): oxygen, pressure, starvation and hull-depth damage
 * change health directly, with no event of their own. Each step's loss not
 * explained by an impact or a strike is put to its cause from the state, and
 * gathered into episodes: one event (with a picture) when it starts, one when
 * it has stopped for EPISODE_GAP_TICKS, with the total and the time. */
const EPISODE_GAP_TICKS = 120;
export class SurvivalWatch {
  private readonly open = new Map<string, { tick: number; last: number; loss: number; t: number }>();
  observe(rec: FlightRecorder, before: GameState, after: GameState, events: readonly GameEvent[], t: number): void {
    const explained = { diver: 0, vehicle: 0 };
    for (const e of events) {
      if (e.type === "threat-damage") explained[e.target.kind === "diver" ? "diver" : "vehicle"] += e.loss;
      if (e.type === "impact") explained.vehicle += e.hullLoss;
    }
    const causes: { key: string; target: string; loss: number }[] = [];
    const diverLoss = before.player.vitals.health - after.player.vitals.health - explained.diver;
    if (diverLoss > 1e-6) {
      const p = after.player, v = after.fleet.vehicles.find((x) => x.id === p.controlledVehicleId);
      const why = [
        ...(p.vitals.oxygen === 0 ? ["oxygen"] : []),
        ...(!v && after.opening.phase >= 4 && !exposure(after).refuge && exposure(after).pressureDepth > personalLimit(after) ? ["pressure"] : []),
        ...(p.starvationSeconds > 180 ? ["starvation"] : []),
      ];
      causes.push({ key: `diver:${why.join("+") || "other"}`, target: "diver", loss: diverLoss });
    }
    const id = after.player.controlledVehicleId, vb = before.fleet.vehicles.find((x) => x.id === id), va = after.fleet.vehicles.find((x) => x.id === id);
    if (vb && va) {
      const hullLoss = vb.health - va.health - explained.vehicle;
      if (hullLoss > 1e-6) {
        const crushed = va.hull === "spindle" ? hullDepth(va) > 1 : hullDepth(va) > effectiveRating(after, va);
        causes.push({ key: `${va.hull}:${crushed ? "hull-depth" : "other"}`, target: va.hull, loss: hullLoss });
      }
    }
    for (const c of causes) {
      const ep = this.open.get(c.key);
      if (ep) { ep.last = after.tick; ep.loss += c.loss; continue; }
      this.open.set(c.key, { tick: after.tick, last: after.tick, loss: c.loss, t });
      const [target, cause] = c.key.split(":");
      rec.event("damage", `${cause} damage to the ${target}`, { t, tick: after.tick, detail: { source: "survival", cause, target, at: where(after) } });
    }
    for (const [key, ep] of this.open) if (after.tick - ep.last > EPISODE_GAP_TICKS) {
      this.open.delete(key);
      const [target, cause] = key.split(":");
      rec.event("damage", `${cause} damage to the ${target} ended: -${r1(ep.loss)} over ${r1((ep.last - ep.tick) / 60)} s`,
        { t, tick: after.tick, snapshot: false, detail: { source: "survival", cause, target, loss: r1(ep.loss), seconds: r1((ep.last - ep.tick) / 60), ended: true } });
    }
  }
}
