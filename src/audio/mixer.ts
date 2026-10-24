/** Voice allocation and ducking policy. Pure: times are seconds supplied by the
 * caller, so the same policy runs live, offline and under node tests. */
import { CUES, type Bus, type CueId, type CueSpec } from "./cues.js";
import type { AudioScene } from "./scene.js";

/** Hard ceilings for one-shot voices. Continuous beds are separate and fixed in number. */
export const VOICE_LIMITS = {
  total: 12,
  bus: { ambience: 4, vehicle: 2, sfx: 5, alert: 3, music: 1 } as Record<Bus, number>,
} as const;

/** Body alarms share one channel: only one sounds at a time and the rest wait
 * their turn (bounded), so simultaneous causes stay distinct instead of stacking. */
export const BODY_GROUP: ReadonlySet<CueId> = new Set<CueId>([
  "alert.oxygen", "alert.food", "alert.pressure", "alert.power", "alert.hull-stress", "alert.body",
]);
export const PENDING_LIMIT = 3;
const inBody = (cue: CueId | "detail"): boolean => cue !== "detail" && BODY_GROUP.has(cue);

export interface Voice {
  id: number;
  cue: CueId | "detail";
  bus: Bus;
  priority: number;
  start: number;
  end: number;
}
export type Admission =
  | { play: true; voice: Voice; steal: Voice[] }
  | { play: false; reason: "cooldown" | "masked" | "full" | "deferred" };

/** Ambient grains use priority 0 on the ambience bus and never steal cues. */
export interface VoiceRequest { cue: CueId | "detail"; bus: Bus; priority: number; cooldown: number; maxInstances: number; duration: number }

export function requestFor(cue: CueId, duration: number): VoiceRequest {
  const s: CueSpec = CUES[cue];
  return { cue, bus: s.bus, priority: s.priority, cooldown: s.cooldown, maxInstances: s.maxInstances, duration };
}

export class VoiceAllocator {
  private next = 1;
  readonly voices: Voice[] = [];
  private readonly lastStart = new Map<string, number>();
  readonly stats = { started: 0, merged: 0, masked: 0, full: 0, deferred: 0, stolen: 0, peak: 0, peakBus: { ambience: 0, vehicle: 0, sfx: 0, alert: 0, music: 0 } as Record<Bus, number> };

  prune(now: number): Voice[] {
    const ended: Voice[] = [];
    for (let i = this.voices.length - 1; i >= 0; i--)
      if (this.voices[i]!.end <= now) ended.push(...this.voices.splice(i, 1));
    return ended;
  }

  /** Remove a voice that was stopped early (stolen or silenced). */
  release(id: number): void {
    const i = this.voices.findIndex(v => v.id === id);
    if (i >= 0) this.voices.splice(i, 1);
  }

  admit(r: VoiceRequest, now: number): Admission {
    this.prune(now);
    const key = r.cue;
    if (now - (this.lastStart.get(key) ?? -Infinity) < r.cooldown) { this.stats.merged++; return { play: false, reason: "cooldown" }; }
    if (inBody(r.cue) && this.voices.some(v => v.cue !== r.cue && inBody(v.cue))) {
      this.stats.deferred++;
      return { play: false, reason: "deferred" };
    }
    // Actions never mask an alarm that is already sounding.
    if (r.priority === 1 && this.voices.some(v => v.priority >= 3)) { this.stats.masked++; return { play: false, reason: "masked" }; }
    const steal = new Set<Voice>();
    // A new alarm clears quieter action feedback so it reads cleanly.
    if (r.priority >= 3) for (const v of this.voices) if (v.priority === 1) steal.add(v);
    const live = (pred: (v: Voice) => boolean): Voice[] => this.voices.filter(v => !steal.has(v) && pred(v));
    const same = live(v => v.cue === r.cue);
    if (same.length >= r.maxInstances) steal.add(same.sort((a, b) => a.start - b.start)[0]!);
    const makeRoom = (pool: Voice[], limit: number): boolean => {
      if (pool.length < limit) return true;
      const victim = pool.filter(v => v.priority <= r.priority).sort((a, b) => a.priority - b.priority || a.start - b.start)[0];
      if (!victim) return false;
      steal.add(victim);
      return true;
    };
    if (!makeRoom(live(v => v.bus === r.bus), VOICE_LIMITS.bus[r.bus]) || !makeRoom(live(() => true), VOICE_LIMITS.total)) {
      this.stats.full++;
      return { play: false, reason: "full" };
    }
    for (const v of steal) this.release(v.id);
    const voice: Voice = { id: this.next++, cue: r.cue, bus: r.bus, priority: r.priority, start: now, end: now + r.duration };
    this.voices.push(voice);
    this.lastStart.set(key, now);
    this.stats.started++;
    this.stats.stolen += steal.size;
    this.stats.peak = Math.max(this.stats.peak, this.voices.length);
    const onBus = this.voices.filter(v => v.bus === r.bus).length;
    this.stats.peakBus[r.bus] = Math.max(this.stats.peakBus[r.bus], onBus);
    return { play: true, voice, steal: [...steal] };
  }

  /** Forget cooldown history, e.g. on New/Continue, so nothing stays suppressed. */
  clearHistory(): void { this.lastStart.clear(); }

  count(bus?: Bus): number { return bus ? this.voices.filter(v => v.bus === bus).length : this.voices.length; }
}

/** Linear duck multipliers per bus. Alarms and contact cut through; the pursuit
 * pulls ambience and music down; music lifts slightly over ambience. */
export function duckLevels(voices: readonly Voice[], scene: Pick<AudioScene, "threat" | "active">): Record<Bus, number> {
  const d: Record<Bus, number> = { ambience: 1, vehicle: 1, sfx: 1, alert: 1, music: 1 };
  if (voices.some(v => v.bus === "alert")) { d.ambience *= 0.5; d.vehicle *= 0.5; d.sfx *= 0.8; d.music *= 0.35; }
  if (voices.some(v => v.bus === "music")) d.ambience *= 0.8;
  if (scene.active && scene.threat.mode === "pursue") { d.ambience *= 0.5; d.music *= 0.25; }
  return d;
}
