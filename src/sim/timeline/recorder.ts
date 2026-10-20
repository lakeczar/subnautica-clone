/** Local-only play timeline. The runtime calls `observe` once per active fixed
 * step with whether the player gave any input; the recorder diffs a few counters
 * and records new things, gathering, craft travel, idle waiting, death and
 * recovery. It never saves into the game save and never sends anything. */
import { SOURCES, techRecord } from "../../content/registry.js";
import type { GameState } from "../types.js";
import type { SystemsEvent } from "../systems/step.js";
import { serializeTimeline, TIMELINE_FORMAT, TIMELINE_VERSION } from "./report.js";
import type { TimelineEvent, TimelineExport } from "./report.js";

/** The runtime's localStorage key, separate from saves. */
export const TIMELINE_STORAGE_KEY = "siltwake.timeline.v1";
export const TIMELINE_EVENT_CAP = 20_000;
export const NOTE_MAX = 500;
const STEPS = 60;
/** A craft moving slower than this (m/s) is stationary at the helm, not travelling. */
export const TRAVEL_MIN_SPEED = 0.5;
const BREAKS: readonly string[] = ["new", "gather", "poi"];

export interface RecorderOptions {
  /** No input for this long makes the rest idle waiting. Reading and looking
   * around inside that window still counts as play. */
  idleAfterSeconds?: number;
  regionAt?: (x: number, z: number) => string | null;
}
export interface ObserveContext {
  /** Any command or UI action this step beyond an all-zero move. */
  input: boolean;
  /** Background work running now (e.g. "decode", "growth"), tagged onto idle spans. */
  waiting?: readonly string[];
}
interface Snapshot {
  blueprints: number; scans: number; evidence: number; discoveries: number; crafted: number;
  vehicles: string[]; collections: number; failures: number;
  /** Visited caches and the item quantity left in each. */
  caches: Map<string, number>;
  stocks: Map<string, number>;
}
export interface PendingRecovery { tick: number; play: number; keys: string[] }
export interface TimelineRecorder {
  session: { id: string; started: string; build?: string };
  events: TimelineEvent[];
  dropped: number;
  playTicks: number;
  idleTicks: number;
  lastInputTick: number;
  idle: { tick: number; play: number; waiting: Set<string> } | null;
  /** One piloting session. Its open `piece` is motion since the last point of
   * interest; stationary helm time is kept apart and never counts as travel. */
  travel: {
    hull: string; vehicleId: string; last: { x: number; y: number; z: number };
    piece: { tick: number; play: number; movingTicks: number; stationaryTicks: number; metres: number } | null;
  } | null;
  /** Every death not yet recovered: what it left behind (`cache:<id>`,
   * `loss:<vehicleId>`) and its play timestamp. One closes when all its keys resolve. */
  pending: PendingRecovery[];
  region: string | null;
  regions: string[];
  last: Snapshot | null;
  options: Required<Pick<RecorderOptions, "idleAfterSeconds">> & Pick<RecorderOptions, "regionAt">;
}

export function createRecorder(session: { id: string; started: string; build?: string }, options: RecorderOptions = {}): TimelineRecorder {
  return {
    session: { ...session }, events: [], dropped: 0, playTicks: 0, idleTicks: 0, lastInputTick: -Infinity, idle: null, travel: null,
    pending: [], region: null, regions: [], last: null,
    options: { idleAfterSeconds: options.idleAfterSeconds ?? 15, ...(options.regionAt ? { regionAt: options.regionAt } : {}) },
  };
}
/** Continues a stored timeline after a reload: play time and history carry on. */
export function resumeRecorder(t: TimelineExport, options: RecorderOptions = {}): TimelineRecorder {
  const rec = createRecorder({ id: t.session.id, started: t.session.started, ...(t.session.build ? { build: t.session.build } : {}) }, options);
  rec.events = [...t.events];
  rec.dropped = t.dropped;
  rec.playTicks = Math.round(t.session.end.play * STEPS);
  rec.idleTicks = Math.round(t.session.end.idle * STEPS);
  // Every unrecovered death keeps its timing across the reload. Whether its caches
  // and losses are resolved is read from the game state at the next observation.
  const closed = new Set(t.events.filter((e) => e.kind === "recovery" && e.of !== undefined).map((e) => e.of));
  rec.pending = t.events.filter((e) => e.kind === "death" && e.keys && !closed.has(e.tick))
    .map((e) => ({ tick: e.tick, play: e.play, keys: [...e.keys!] }));
  rec.regions = [...new Set(t.events.filter((e) => (e.kind === "new" && e.what === "region") || e.kind === "region").map((e) => e.id ?? ""))];
  return rec;
}

const play = (rec: TimelineRecorder): number => rec.playTicks / STEPS;
const at = (s: GameState): [number, number, number] => {
  const p = s.player.pose.position;
  return [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, Math.round(p.z * 10) / 10];
};
function push(rec: TimelineRecorder, e: TimelineEvent): void {
  // A point of interest ends the current stretch of travel.
  if (BREAKS.includes(e.kind)) closePiece(rec);
  if (rec.events.length >= TIMELINE_EVENT_CAP) { rec.dropped++; return; }
  rec.events.push(e);
}
function snapshot(s: GameState): Snapshot {
  return {
    blueprints: s.knowledge.blueprints.length, scans: s.knowledge.scans.length, evidence: s.knowledge.evidence.length,
    discoveries: s.story.discoveries.length, crafted: s.knowledge.crafted.length, vehicles: s.fleet.vehicles.map((v) => v.id),
    collections: s.metrics.collections, failures: s.metrics.failures,
    caches: new Map(s.recovery.caches.map((c) => [c.id, s.inventory.items.filter((i) => i.containerId === c.containerId).reduce((n, i) => n + i.quantity, 0)])),
    stocks: new Map(s.world.resources.map((r) => [r.id, r.stock])),
  };
}

/** Records one generic event stamped with the current tick, play time and place. */
export function recordEvent(rec: TimelineRecorder, s: GameState, e: Omit<TimelineEvent, "tick" | "play">): void {
  push(rec, { tick: s.tick, play: play(rec), at: at(s), region: rec.region, ...e });
}
/** A feedback note from the feedback key, stamped with time and location. */
export function addNote(rec: TimelineRecorder, s: GameState, text: string, wall?: string): string | null {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, NOTE_MAX);
  if (!clean) return "Write something first.";
  const region = rec.options.regionAt?.(s.player.pose.position.x, s.player.pose.position.z) ?? rec.region;
  push(rec, { kind: "note", tick: s.tick, play: play(rec), at: at(s), region, text: clean, ...(wall ? { wall } : {}) });
  return null;
}

function closePiece(rec: TimelineRecorder): void {
  const t = rec.travel, p = t?.piece;
  if (!t || !p) return;
  t.piece = null;
  const seconds = p.movingTicks / STEPS;
  if (seconds >= 0.5) push(rec, { kind: "travel", tick: p.tick, play: p.play, seconds, stationary: p.stationaryTicks / STEPS,
    metres: Math.round(p.metres), hull: t.hull, id: t.vehicleId, region: rec.region });
}
function closeTravel(rec: TimelineRecorder): void {
  closePiece(rec);
  rec.travel = null;
}
function closeIdle(rec: TimelineRecorder, s: GameState): void {
  const i = rec.idle;
  rec.idle = null;
  if (!i) return;
  push(rec, { kind: "idle", tick: i.tick, play: i.play, seconds: (s.tick - i.tick) / STEPS, waiting: [...i.waiting].sort(), region: rec.region });
}

/** Call once per active fixed step, after the step. */
export function observe(rec: TimelineRecorder, s: GameState, ctx: ObserveContext): void {
  // Idle: past the grace window without input, time stops counting as play.
  if (ctx.input) {
    rec.lastInputTick = s.tick;
    closeIdle(rec, s);
  } else if (!rec.idle && s.tick - rec.lastInputTick > rec.options.idleAfterSeconds * STEPS && rec.last) {
    closeTravel(rec);
    rec.idle = { tick: s.tick, play: play(rec), waiting: new Set() };
  }
  if (rec.idle) {
    for (const w of ctx.waiting ?? []) rec.idle.waiting.add(w);
    rec.idleTicks++;
  } else rec.playTicks++;

  if (rec.options.regionAt && (s.tick % 30 === 0 || !rec.last)) {
    const r = rec.options.regionAt(s.player.pose.position.x, s.player.pose.position.z);
    if (r && r !== rec.region) {
      const first = !rec.regions.includes(r);
      if (first) rec.regions.push(r);
      rec.region = r;
      // The baseline region is a plain region event so a resumed recorder knows it.
      push(rec, first && rec.last ? { kind: "new", what: "region", id: r, tick: s.tick, play: play(rec), at: at(s), region: r }
        : { kind: "region", id: r, tick: s.tick, play: play(rec), at: at(s), region: r });
    }
  }

  // Craft travel: only steps where the piloted craft actually moves count.
  const v = s.player.controlledVehicleId ? s.fleet.vehicles.find((x) => x.id === s.player.controlledVehicleId) : null;
  if (rec.travel && (!v || v.id !== rec.travel.vehicleId || rec.idle)) closeTravel(rec);
  if (v && !rec.idle) {
    const p = v.pose.position;
    if (!rec.travel) rec.travel = { hull: v.hull, vehicleId: v.id, last: { ...p }, piece: null };
    else {
      const t = rec.travel, d = Math.hypot(p.x - t.last.x, p.y - t.last.y, p.z - t.last.z);
      t.last = { ...p };
      if (d >= TRAVEL_MIN_SPEED / STEPS) {
        t.piece ??= { tick: s.tick, play: play(rec), movingTicks: 0, stationaryTicks: 0, metres: 0 };
        t.piece.movingTicks++;
        t.piece.metres += d;
      } else if (t.piece) t.piece.stationaryTicks++;
    }
  }

  const now = snapshot(s), was = rec.last;
  rec.last = now;
  if (!was) return;
  const stamp = { tick: s.tick, play: play(rec), at: at(s), region: rec.region };
  const fresh = (what: string, id: string): void => push(rec, { kind: "new", what, id, ...stamp });
  for (const bp of s.knowledge.blueprints.slice(was.blueprints)) fresh("blueprint", bp);
  const before = new Set(s.knowledge.scans.slice(0, was.scans).flatMap((id) => Object.hasOwn(SOURCES, id) ? [SOURCES[id as keyof typeof SOURCES].item] : []));
  for (const id of s.knowledge.scans.slice(was.scans)) {
    if (Object.hasOwn(SOURCES, id)) {
      const item = SOURCES[id as keyof typeof SOURCES].item;
      if (!before.has(item)) { push(rec, { kind: "new", what: "material", id: item, label: id, ...stamp }); before.add(item); }
      else push(rec, { kind: "poi", what: "source", id, ...stamp });
    } else fresh(techRecord(id) ? "record" : "discovery", id);
  }
  for (const e of s.knowledge.evidence.slice(was.evidence)) fresh("evidence", e.id);
  for (const d of s.story.discoveries.slice(was.discoveries)) fresh("discovery", d.id);
  for (const r of s.knowledge.crafted.slice(was.crafted)) fresh("craft", r);
  for (const id of now.vehicles.filter((id) => !was.vehicles.includes(id)))
    push(rec, { kind: "new", what: "hull", id, label: s.fleet.vehicles.find((x) => x.id === id)!.hull, ...stamp });
  if (now.collections > was.collections) {
    const drops = [...now.stocks].filter(([id, n]) => n < (was.stocks.get(id) ?? n));
    if (!drops.length) push(rec, { kind: "gather", ...stamp });
    for (const [id, n] of drops) {
      const item = SOURCES[id as keyof typeof SOURCES].item;
      push(rec, { kind: "gather", id, what: item, quantity: (was.stocks.get(id) ?? n) - n, ...stamp });
    }
  }
  if (now.failures > was.failures) {
    // What this death left behind: the caches it created, and any loss no other
    // open death already waits on.
    const claimed = new Set(rec.pending.flatMap((p) => p.keys));
    const keys = [...[...now.caches.keys()].filter((id) => !was.caches.has(id)).map((id) => `cache:${id}`),
      ...s.recovery.losses.map((l) => `loss:${l.vehicleId}`)].filter((k) => !claimed.has(k));
    push(rec, { kind: "death", keys, ...stamp });
    rec.pending.push({ tick: s.tick, play: play(rec), keys });
  }
  closeRecoveries(rec, s, now, stamp);
}

/** A key resolves when its cache is empty or gone, or its loss entry is gone. */
function resolved(s: GameState, now: Snapshot, key: string): boolean {
  const [kind, id] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
  return kind === "cache" ? !now.caches.get(id) : !s.recovery.losses.some((l) => l.vehicleId === id);
}
/** Each open death closes once everything it left is recovered; one with nothing
 * left closes at once as `nothing-lost`. Recovery time is play time, so idle
 * waiting is excluded. */
function closeRecoveries(rec: TimelineRecorder, s: GameState, now: Snapshot, stamp: Omit<TimelineEvent, "kind">): void {
  for (const p of [...rec.pending]) {
    if (!p.keys.every((k) => resolved(s, now, k))) continue;
    rec.pending = rec.pending.filter((x) => x !== p);
    push(rec, { kind: "recovery", of: p.tick, keys: p.keys, seconds: play(rec) - p.play, ...(p.keys.length ? {} : { what: "nothing-lost" }), ...stamp });
  }
}

/** SYS-2 background results: a decode is a new thing; a ripe crop is a point of interest. */
export function recordSystemsEvents(rec: TimelineRecorder, s: GameState, events: readonly SystemsEvent[]): void {
  for (const e of events)
    if (e.type === "decoded") recordEvent(rec, s, { kind: "new", what: "decode", id: e.completion.decodable });
    else if (e.type === "crop-ready") recordEvent(rec, s, { kind: "system", what: "crop-ready", id: e.seed });
}

/** A detached export with any open travel or idle span closed as of now. */
export function exportTimeline(rec: TimelineRecorder, s: GameState): TimelineExport {
  const copy: TimelineRecorder = { ...rec, events: [...rec.events], pending: rec.pending.map((p) => ({ ...p, keys: [...p.keys] })), travel: rec.travel && { ...rec.travel, piece: rec.travel.piece && { ...rec.travel.piece } }, idle: rec.idle && { ...rec.idle, waiting: new Set(rec.idle.waiting) } };
  closeTravel(copy);
  closeIdle(copy, s);
  return {
    format: TIMELINE_FORMAT, version: TIMELINE_VERSION,
    session: { ...copy.session, end: { tick: s.tick, play: copy.playTicks / STEPS, idle: copy.idleTicks / STEPS } },
    dropped: copy.dropped, events: copy.events,
  };
}
export const exportTimelineText = (rec: TimelineRecorder, s: GameState): string => serializeTimeline(exportTimeline(rec, s));
