/** Event-to-cue mapping: the contract the coordinator wires into app.ts.
 * Pure and deterministic given `now`; it only remembers what it needs to turn
 * state changes into one-off cues (mode, evidence count, region visits). */
import type { RegionId } from "../content/registry.js";
import type { GameEvent, GameState, MovementMode, NoticeContext, Vec3 } from "../sim/types.js";
import type { CueId } from "./cues.js";
import { relate, type AudioScene, type Direction, type Shelter, type ThreatMode } from "./scene.js";

export interface CueRequest {
  cue: CueId;
  /** 0..1; 1 plays at the catalog level, 0 at 9 dB below it. */
  intensity: number;
  /** Stereo position for spatial cues; 0 for centred ones. */
  pan: number;
  /** Metres to a spatial source; 0 for centred cues. */
  distance: number;
  dir: Direction | null;
}

/** Moments that have no simulation event yet; story/ending code calls these. */
export type Moment = "ending" | "discovery" | "blueprint" | "arrival" | "homecoming";

/** Hazard notice contexts that name the body alarm emitted right after them. */
const CONTEXT_CUE: Partial<Record<NoticeContext, CueId>> = { oxygen: "alert.oxygen", food: "alert.food" };
/** Proposed `cause` on centred warning events (docs/build/streams/S6.md). */
export type WarningCause = "oxygen" | "food" | "pressure" | "power" | "hull-depth";
const CAUSE_CUE: Record<WarningCause, CueId> = {
  oxygen: "alert.oxygen", food: "alert.food", pressure: "alert.pressure", power: "alert.power", "hull-depth": "alert.hull-stress",
};
/** Away from any refuge this long turns the return chime into the homecoming phrase. */
export const HOMECOMING_AFTER = 180;

const centred = (cue: CueId, intensity = 1): CueRequest => ({ cue, intensity, pan: 0, distance: 0, dir: null });
const finite = (v: Readonly<Vec3> | undefined): v is Vec3 => !!v && [v.x, v.y, v.z].every(Number.isFinite);
const clamp01 = (v: number): number => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

interface Snapshot {
  mode: MovementMode;
  medium: "air" | "water";
  shelter: Shelter;
  region: RegionId;
  evidence: number;
  blueprints: number;
  opening: number;
  threat: ThreatMode;
  disabled: ReadonlySet<string>;
  transaction: { id: string; phase: "prepared" | "lock"; type: "capture" | "launch" } | null;
  completed: number;
}

export class CueMapper {
  private last: Snapshot | null = null;
  private readonly visited = new Set<RegionId>();
  private openSince = 0;
  /** Hazard notice contexts seen since the last observe(), in order. */
  private contexts: CueId[] = [];
  /** Alarm causes already named since the last observe(), by notice or condition. */
  private readonly usedCauses = new Set<CueId>();
  /** An injury has already been mapped since the last observe(). */
  private injured = false;

  /** Forget everything, e.g. on New/Continue. The next observe() is a baseline. */
  reset(): void {
    this.last = null;
    this.visited.clear();
    this.contexts = [];
    this.usedCauses.clear();
    this.injured = false;
  }

  /** Map one step's whole batch. Preferred over event(): duplicate injury
   * events collapse into one hit that keeps any emission origin in the batch. */
  events(batch: readonly GameEvent[], s: GameState | null, scene: AudioScene): CueRequest[] {
    const origin = batch.find((e): e is Extract<GameEvent, { type: "sound" }> => e.type === "sound" && e.cue === "damage" && finite(e.origin))?.origin;
    const out: CueRequest[] = [], heard = this.injured;
    let hurt: CueRequest | null = null;
    for (const e of batch) {
      if (isInjury(e)) {
        if (!hurt) { hurt = this.injury(e, s, scene, origin); if (!heard) out.push(hurt); this.injured = true; }
        else if (e.type === "threat-damage") hurt.intensity = Math.max(hurt.intensity, injuryIntensity(e.loss));
        continue;
      }
      out.push(...this.event(e, s, scene));
    }
    return out;
  }

  /** Map one simulation event. Call for every event of a step batch, in order,
   * then observe() once per frame. Unrelated events return no cues. */
  event(e: GameEvent, s: GameState | null, scene: AudioScene): CueRequest[] {
    switch (e.type) {
      case "notice": {
        const cue = e.channel === "hazard" && e.context ? CONTEXT_CUE[e.context] : undefined;
        if (cue) this.contexts.push(cue);
        // Refusals of a deliberate action get a soft bump; hazards speak through their alarms.
        return e.error && (e.channel === "action" || e.channel === undefined) ? [centred("action.refused")] : [];
      }
      case "interaction-panel": return [centred("action.panel")];
      case "foundation-boundary": return [centred("alert.boundary")];
      case "impact": return e.hullLoss > 0 ? [centred("hit.impact", clamp01(0.4 + e.hullLoss / 20))] : [];
      case "threat-damage": return this.once(this.injury(e, s, scene));
      case "movement-mode-changed": {
        const from = this.last?.mode ?? null;
        if (this.last) this.last.mode = e.mode;
        if (from === null || from === e.mode) return [];
        // Helm to cabin or carrier interior is a door, not a hatch to open water.
        if (e.mode === "interior" || from === "interior") return [centred("transition.interior")];
        if (e.mode === "piloting") return [centred("transition.board")];
        if (from === "piloting") return [centred("transition.disembark")];
        return [];
      }
      case "sound": {
        switch (e.cue) {
          case "collect": return [centred("action.collect")];
          case "craft": return [centred("action.craft")];
          case "scan": return [centred("action.scan")];
          case "refuge": return [centred("refuge.enter")];
          case "opening": return [centred("opening.pod")];
          case "recovery": return [centred("recovery.wake")];
          // Equipment thuds never imply a direction, even with an origin.
          case "impact": return [centred("hit.impact")];
          case "damage": return this.once(this.injury(e, s, scene));
          case "warning":
            if (e.source === "threat-call" || finite(e.origin)) return [this.spatial("alert.threat-call", e.origin, scene)];
            return [centred(this.bodyAlarm(e, scene))];
        }
      }
    }
    return [];
  }

  /** Cues implied by state changes since the previous frame. */
  observe(s: GameState | null, scene: AudioScene, now: number): CueRequest[] {
    this.contexts = [];
    this.usedCauses.clear();
    this.injured = false;
    if (!s) { this.last = null; return []; }
    const dock = s.fleet.docking;
    const next: Snapshot = {
      mode: s.player.mode,
      medium: scene.medium,
      shelter: scene.shelter,
      region: scene.region,
      evidence: s.knowledge.evidence.length,
      blueprints: s.knowledge.blueprints.length,
      opening: s.opening.phase,
      threat: s.world.threat.mode,
      disabled: new Set(s.fleet.vehicles.filter(v => v.disabled).map(v => v.id)),
      transaction: dock?.transaction ? { id: dock.transaction.id, phase: dock.transaction.phase, type: dock.transaction.type } : null,
      completed: dock?.completed.length ?? 0,
    };
    const prev = this.last;
    this.last = next;
    if (!prev) {
      // Baseline: a loaded save does not replay its history.
      this.visited.add(next.region);
      this.openSince = now;
      return [];
    }
    const out: CueRequest[] = [];
    if (next.evidence > prev.evidence) out.push(centred("music.discovery"));
    else if (next.blueprints > prev.blueprints) out.push(centred("music.blueprint"));
    if (prev.opening === 0 && next.opening > 0) out.push(centred("opening.pod"));
    else if (prev.opening < 4 && next.opening === 4) out.push(centred("refuge.enter"));
    for (const id of next.disabled) if (!prev.disabled.has(id)) { out.push(centred("hull.failure")); break; }
    if (next.transaction?.phase === "lock" && prev.transaction?.phase !== "lock") out.push(centred("carrier.lock"));
    if (next.completed > prev.completed && prev.transaction?.type === "capture") out.push(centred("carrier.clamp"));
    if (next.threat === "disengage" && (prev.threat === "investigate" || prev.threat === "pursue")) out.push(centred("threat.disengage"));
    // Crossing the waterline outside a hull or shelter.
    if (next.mode === "swimming" || next.mode === "walking") {
      if (prev.medium === "air" && next.medium === "water") out.push(centred("transition.submerge"));
      else if (prev.medium === "water" && next.medium === "air" && next.shelter === "open") out.push(centred("transition.surface"));
    }
    if (next.shelter !== "open" && prev.shelter === "open")
      out.push(centred(now - this.openSince >= HOMECOMING_AFTER ? "music.homecoming" : "refuge.enter"));
    if (next.shelter === "open" && prev.shelter !== "open") this.openSince = now;
    if (next.region !== prev.region && !this.visited.has(next.region)) {
      this.visited.add(next.region);
      out.push(centred("music.arrival"));
    }
    return out;
  }

  moment(m: Moment): CueRequest {
    return centred(m === "ending" ? "music.ending" : m === "discovery" ? "music.discovery"
      : m === "blueprint" ? "music.blueprint" : m === "arrival" ? "music.arrival" : "music.homecoming");
  }

  private spatial(cue: CueId, origin: Vec3 | undefined, scene: AudioScene): CueRequest {
    if (!finite(origin)) return centred(cue);
    const r = relate(scene.listener, origin);
    return { cue, intensity: 1, pan: r.pan, distance: r.distance, dir: r.dir };
  }

  /** One injury per frame: later copies (the step's legacy sound, app-injected
   * feedback) are already heard, so they map to nothing. */
  private once(r: CueRequest): CueRequest[] {
    if (this.injured) return [];
    this.injured = true;
    return [r];
  }

  /** Hunter injury, panned to the emission origin: the event's own, the batch's,
   * or the hunter's position in the same step. */
  private injury(e: Extract<GameEvent, { type: "threat-damage" | "sound" }>, s: GameState | null, scene: AudioScene, batchOrigin?: Vec3): CueRequest {
    const own = e.type === "sound" ? e.origin : undefined;
    const hunter = e.type === "threat-damage" && e.source === "hunter" ? s?.world.threat.position : undefined;
    const origin = [own, batchOrigin, hunter].find(finite);
    const r = this.spatial("hit.damage", origin, scene);
    r.intensity = e.type === "threat-damage" ? injuryIntensity(e.loss) : 1;
    return r;
  }

  /** A centred warning keeps its real cause: an explicit `cause`, else the
   * oxygen/food notice emitted just before it, else the producer's own
   * pressure → power → hull-depth conditions, each named once per frame.
   * Oxygen and food are never inferred from a live meter. */
  private bodyAlarm(e: Extract<GameEvent, { type: "sound" }>, scene: AudioScene): CueId {
    const explicit = (e as { cause?: WarningCause }).cause;
    const named = explicit && CAUSE_CUE[explicit] ? CAUSE_CUE[explicit] : this.contexts.shift();
    if (named) { this.usedCauses.add(named); return named; }
    const live: CueId[] = [];
    if (scene.overPressure) live.push("alert.pressure");
    if (scene.hull && scene.power < 0.25) live.push("alert.power");
    if (scene.hull && scene.hull !== "spindle" && scene.hullStress > 0.85) live.push("alert.hull-stress");
    const pick = live.find(c => !this.usedCauses.has(c));
    if (!pick) return "alert.body";
    this.usedCauses.add(pick);
    return pick;
  }
}

const isInjury = (e: GameEvent): e is Extract<GameEvent, { type: "threat-damage" | "sound" }> =>
  e.type === "threat-damage" || (e.type === "sound" && e.cue === "damage");
const injuryIntensity = (loss: number): number => clamp01(0.5 + loss);
