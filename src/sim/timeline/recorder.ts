/** Local-only play timeline. The runtime calls `observe` once per active fixed
 * step with whether the player gave any input; the recorder diffs a few counters
 * and records new things, gathering, craft travel, idle waiting, death and
 * recovery. It never saves into the game save and never sends anything.
 *
 * Events append to an open chunk; a full chunk is sealed, unchanged from then
 * on. The most recent `TIMELINE_RETAINED_CHUNKS` sealed chunks are kept in
 * full; an older one rotates into a summary that keeps its feedback notes, new
 * things, deaths and recoveries verbatim (SIM-05: no note is ever dropped). */
import { SOURCES, techRecord } from "../../content/registry.js";
import type { GameState } from "../types.js";
import type { SystemsEvent } from "../systems/step.js";
import { serializeTimeline, summarizeChunk, TIMELINE_FORMAT, TIMELINE_VERSION } from "./report.js";
import type { ChunkSummary, PendingRecovery, TimelineEvent, TimelineExport } from "./report.js";

/** The runtime's localStorage key, separate from saves. */
export const TIMELINE_STORAGE_KEY = "siltwake.timeline.v1";
/** Events per sealed chunk. */
export const TIMELINE_CHUNK_EVENTS = 1_000;
/** Sealed chunks kept in full (with the open chunk, the last ~20,000 events). */
export const TIMELINE_RETAINED_CHUNKS = 20;
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
/** What the next observation diffs against. Observation is diff-based
 * (SIM-02): exposed stock is copied into a reused buffer, and cache contents
 * are read only when a death or an open recovery needs them. */
interface Snapshot {
  blueprints: number; scans: number; evidence: number; discoveries: number; crafted: number;
  vehicles: string[]; collections: number; failures: number;
  /** Visited caches (death caches and salvage canisters) by ID. */
  caches: readonly string[];
  /** Their stacks by ID, when read this observation. */
  contents: Map<string, Map<string, { kind: string; quantity: number }>> | null;
  /** Exposed stock by index into `roster` (the resources array observed). */
  stocks: number[];
  roster: readonly { id: string }[];
}
export interface TimelineRecorder {
  session: { id: string; started: string; build?: string };
  /** The open chunk, oldest first (the newest events). */
  events: TimelineEvent[];
  /** Sealed chunks kept in full, oldest first; `n` numbers chunks from the session start. */
  sealed: { n: number; events: TimelineEvent[] }[];
  /** The number the open chunk will have when sealed. */
  nextChunk: number;
  /** Chunks rotated out of `sealed`, oldest first. */
  rotated: ChunkSummary[];
  /** Events a version 1 recorder dropped at its old cap (carried by resumed exports). */
  dropped: number;
  /** Events ever recorded this session: the next event's sequence number. It
   * never resets, so a consumer's cursor survives sealing and rotation. */
  seq: number;
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
  /** Every death not yet recovered, with its own ledger of what it left. */
  pending: PendingRecovery[];
  region: string | null;
  regions: string[];
  last: Snapshot | null;
  /** The stock buffer the next observation fills (swapped with `last.stocks`). */
  spare: number[];
  options: Required<Pick<RecorderOptions, "idleAfterSeconds">> & Pick<RecorderOptions, "regionAt">;
}

export function createRecorder(session: { id: string; started: string; build?: string }, options: RecorderOptions = {}): TimelineRecorder {
  return {
    session: { ...session }, events: [], sealed: [], nextChunk: 0, rotated: [], dropped: 0, seq: 0,
    playTicks: 0, idleTicks: 0, lastInputTick: -Infinity, idle: null, travel: null,
    pending: [], region: null, regions: [], last: null, spare: [],
    options: { idleAfterSeconds: options.idleAfterSeconds ?? 15, ...(options.regionAt ? { regionAt: options.regionAt } : {}) },
  };
}
/** Continues a stored timeline after a reload: play time and history carry on. */
export function resumeRecorder(t: TimelineExport, options: RecorderOptions = {}): TimelineRecorder {
  const rec = createRecorder({ id: t.session.id, started: t.session.started, ...(t.session.build ? { build: t.session.build } : {}) }, options);
  const summaries = (t.rotated ?? []).map((r) => structuredClone(r));
  // One numbering (SIM-1 R2): the summaries first, in order, then the chunks re-chunked from the events.
  summaries.forEach((r, i) => { r.n = i; });
  rec.nextChunk = summaries.length;
  for (const e of t.events) push(rec, e);
  // Summaries come ahead of any that re-chunking rotated.
  rec.rotated.unshift(...summaries);
  const kept = retainedEvents(rec);
  rec.seq = t.seq ?? rec.rotated.reduce((n, r) => n + Object.values(r.kinds).reduce((a, b) => a + b, 0), 0) + kept.length;
  rec.dropped = t.dropped;
  rec.playTicks = Math.round(t.session.end.play * STEPS);
  rec.idleTicks = Math.round(t.session.end.idle * STEPS);
  // The export carries the live recovery ledger: every open death, its losses
  // still out and the cargo it left, so a reload resumes it exactly.
  rec.pending = clonePending(t.session.pending ?? []);
  rec.regions = [...new Set([...(t.rotated ?? []).flatMap((r) => r.regions),
    ...kept.filter((e) => (e.kind === "new" && e.what === "region") || e.kind === "region").map((e) => e.id ?? "")])];
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
  rec.events.push(e);
  rec.seq++;
  if (rec.events.length < TIMELINE_CHUNK_EVENTS) return;
  rec.sealed.push({ n: rec.nextChunk++, events: rec.events });
  rec.events = [];
  while (rec.sealed.length > TIMELINE_RETAINED_CHUNKS) rotateOldest(rec);
}
/** Folds the oldest sealed chunk into a summary (its kept events stay whole).
 * Returns false with nothing to rotate. */
function rotateOldest(rec: TimelineRecorder): boolean {
  const oldest = rec.sealed.shift();
  if (!oldest) return false;
  rec.rotated.push({ n: oldest.n, ...summarizeChunk(oldest.events) });
  return true;
}
/** Every event kept in full, oldest first. */
const retainedEvents = (rec: TimelineRecorder): TimelineEvent[] => [...rec.sealed.flatMap((c) => c.events), ...rec.events];
/** Events recorded since `cursor` (an earlier `seq`), oldest first, and the
 * cursor to pass next time. Costs only the new events; `missed` counts any that
 * rotated into summaries before they were read. */
export function timelineSince(rec: TimelineRecorder, cursor: number): { events: TimelineEvent[]; cursor: number; missed: number } {
  let want = Math.max(0, rec.seq - cursor);
  const parts: TimelineEvent[][] = [];
  for (let c = rec.sealed.length; want > 0 && c >= 0; c--) {
    const chunk = c === rec.sealed.length ? rec.events : rec.sealed[c]!.events, take = Math.min(want, chunk.length);
    if (take) parts.unshift(chunk.slice(chunk.length - take));
    want -= take;
  }
  return { events: parts.flat(), cursor: rec.seq, missed: want };
}
const NO_CACHES: readonly string[] = [];
/** Stacks in each visited cache: stack ID → { kind, quantity }. */
function cacheContents(s: GameState): Map<string, Map<string, { kind: string; quantity: number }>> {
  const byContainer = new Map(s.recovery.caches.map((c) => [c.containerId, new Map<string, { kind: string; quantity: number }>()]));
  for (const i of s.inventory.items) byContainer.get(i.containerId)?.set(i.id, { kind: i.kind, quantity: i.quantity });
  return new Map(s.recovery.caches.map((c) => [c.id, byContainer.get(c.containerId)!]));
}
const clonePending = (p: readonly PendingRecovery[]): PendingRecovery[] =>
  p.map((x) => ({ ...x, keys: [...x.keys], losses: [...x.losses], cargo: x.cargo.map((c) => ({ ...c })) }));
/** The stacks a death (or a salvage canister) put in a cache: the death owes exactly these. */
const cargoOf = (contents: NonNullable<Snapshot["contents"]>, cache: string): PendingRecovery["cargo"] =>
  [...(contents.get(cache) ?? [])].filter(([, x]) => x.quantity > 0)
    .map(([item, x]) => ({ cache, item, kind: x.kind, quantity: x.quantity, last: x.quantity }));
function snapshot(rec: TimelineRecorder, s: GameState): Snapshot {
  const roster = s.world.resources, stocks = rec.spare;
  stocks.length = roster.length;
  for (let i = 0; i < roster.length; i++) stocks[i] = roster[i]!.stock;
  rec.spare = rec.last?.stocks ?? [];
  return {
    blueprints: s.knowledge.blueprints.length, scans: s.knowledge.scans.length, evidence: s.knowledge.evidence.length,
    discoveries: s.story.discoveries.length, crafted: s.knowledge.crafted.length, vehicles: s.fleet.vehicles.map((v) => v.id),
    collections: s.metrics.collections, failures: s.metrics.failures,
    caches: s.recovery.caches.length ? s.recovery.caches.map((c) => c.id) : NO_CACHES, contents: null,
    stocks, roster,
  };
}
/** Sources whose exposed stock dropped since `was`, in roster order, with the drop. */
function stockDrops(was: Snapshot, now: Snapshot): [string, number][] {
  const out: [string, number][] = [];
  // In place, the roster is the same array; after a command's copy, the same IDs in order.
  const aligned = was.roster.length === now.roster.length && now.roster.every((r, i) => was.roster[i]!.id === r.id);
  const before = aligned ? null : new Map(was.roster.map((r, i) => [r.id, was.stocks[i]!]));
  for (let i = 0; i < now.roster.length; i++) {
    const id = now.roster[i]!.id, n = now.stocks[i]!, prior = before ? before.get(id) ?? n : was.stocks[i]!;
    if (n < prior) out.push([id, prior - n]);
  }
  return out;
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

/** The travel event closing the open piece would record (null: none, or under half a second). */
function pieceEvent(rec: TimelineRecorder): TimelineEvent | null {
  const t = rec.travel, p = t?.piece;
  if (!t || !p || p.movingTicks / STEPS < 0.5) return null;
  return { kind: "travel", tick: p.tick, play: p.play, seconds: p.movingTicks / STEPS, stationary: p.stationaryTicks / STEPS,
    metres: Math.round(p.metres), hull: t.hull, id: t.vehicleId, region: rec.region };
}
/** The idle event closing the open idle span as of `s` would record. */
function idleEvent(rec: TimelineRecorder, s: GameState): TimelineEvent | null {
  const i = rec.idle;
  return i && { kind: "idle", tick: i.tick, play: i.play, seconds: (s.tick - i.tick) / STEPS, waiting: [...i.waiting].sort(), region: rec.region };
}
/** What closing the open travel piece and idle span now would record, in that
 * order, without recording it: an export ends open spans this way, so it never
 * seals or rotates the live history. */
function closingEvents(rec: TimelineRecorder, s: GameState): TimelineEvent[] {
  return [pieceEvent(rec), idleEvent(rec, s)].filter((e): e is TimelineEvent => e !== null);
}
function closePiece(rec: TimelineRecorder): void {
  const e = pieceEvent(rec);
  if (rec.travel) rec.travel.piece = null;
  if (e) push(rec, e);
}
function closeTravel(rec: TimelineRecorder): void {
  closePiece(rec);
  rec.travel = null;
}
function closeIdle(rec: TimelineRecorder, s: GameState): void {
  const e = idleEvent(rec, s);
  rec.idle = null;
  if (e) push(rec, e);
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

  const now = snapshot(rec, s), was = rec.last;
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
    const drops = stockDrops(was, now);
    if (!drops.length) push(rec, { kind: "gather", ...stamp });
    for (const [id, quantity] of drops) {
      const item = SOURCES[id as keyof typeof SOURCES].item;
      push(rec, { kind: "gather", id, what: item, quantity, ...stamp });
    }
  }
  const newCaches = now.caches.filter((id) => !was.caches.includes(id));
  // Cache contents matter only to a death and to the open recoveries' ledgers.
  if (!(now.failures > was.failures) && !rec.pending.length) return;
  const contents = now.contents = cacheContents(s);
  if (now.failures > was.failures) {
    // What this death left behind: the caches it created (their exact contents),
    // and any craft loss no other open death already waits on.
    const claimed = new Set(rec.pending.flatMap((p) => p.losses));
    const caches = newCaches.splice(0), losses = s.recovery.losses.map((l) => l.vehicleId).filter((v) => !claimed.has(v));
    const keys = [...caches.map((c) => `cache:${c}`), ...losses.map((v) => `loss:${v}`)];
    push(rec, { kind: "death", keys, ...stamp });
    rec.pending.push({ tick: s.tick, play: play(rec), keys, losses, cargo: caches.flatMap((c) => cargoOf(contents, c)) });
  }
  settleRecoveries(rec, s, contents, newCaches, stamp);
}

/** Moves each open death's ledger forward and closes those with nothing left.
 * - A loss that ends while a new canister appears (in-place salvage) hands its
 *   obligation to the canister's contents; a loss that ends otherwise (patch,
 *   salvage into a carried hold) is recovered.
 * - Each cargo line follows one owed stack by ID (inventory.ts keeps a stack's ID
 *   through whole moves and partial transfers out). Only quantity leaving that
 *   stack counts: a drop since the last observation is retrieved, and a stack
 *   moved out of the cache or merged away counts as fully retrieved. Deposits,
 *   even of the same kind, are separate stacks and owe nothing.
 * - A partial deposit can merge into an owed stack and make identity ambiguous.
 *   That settles in the player's favour: the increase adds nothing, and any later
 *   drop counts as retrieval.
 * Recovery time is play time, so idle waiting is excluded. A death that left
 * nothing closes at once as `nothing-lost`, counted apart from recovery times. */
function settleRecoveries(rec: TimelineRecorder, s: GameState, contents: NonNullable<Snapshot["contents"]>, fresh: string[], stamp: Omit<TimelineEvent, "kind">): void {
  const canisters = [...fresh];
  for (const p of [...rec.pending]) {
    for (const v of p.losses.filter((v) => !s.recovery.losses.some((l) => l.vehicleId === v))) {
      p.losses = p.losses.filter((x) => x !== v);
      const canister = canisters.shift();
      if (canister) { p.keys.push(`cache:${canister}`); p.cargo.push(...cargoOf(contents, canister)); }
    }
    for (const line of p.cargo) {
      const q = contents.get(line.cache)?.get(line.item)?.quantity ?? 0;
      if (q < line.last) line.quantity = Math.max(0, line.quantity - (line.last - q));
      // A stack never owes more than it holds (this also clamps an inflated import).
      line.quantity = Math.min(line.quantity, q);
      line.last = q;
    }
    p.cargo = p.cargo.filter((line) => line.quantity > 0);
    if (p.losses.length || p.cargo.length) continue;
    rec.pending = rec.pending.filter((x) => x !== p);
    push(rec, { kind: "recovery", of: p.tick, keys: [...p.keys], seconds: play(rec) - p.play, ...(p.keys.length ? {} : { what: "nothing-lost" }), ...stamp });
  }
}

/** SYS-2 background results: a decode is a new thing; a ripe crop is a point of interest. */
export function recordSystemsEvents(rec: TimelineRecorder, s: GameState, events: readonly SystemsEvent[]): void {
  for (const e of events)
    if (e.type === "decoded") recordEvent(rec, s, { kind: "new", what: "decode", id: e.completion.decodable });
    else if (e.type === "crop-ready") recordEvent(rec, s, { kind: "system", what: "crop-ready", id: e.seed });
}

/** A detached export with any open travel or idle span closed as of now. */
/** `whole`: how many of the newest sealed chunks the export keeps whole; older ones are
 * folded into summaries in the export only (as rotation does), so a timeline can fit
 * a full storage quota. The live recorder keeps its own window. */
export function exportTimeline(rec: TimelineRecorder, s: GameState, whole = Infinity): TimelineExport {
  const closing = closingEvents(rec, s), cut = Math.max(0, rec.sealed.length - whole), head = exportHead(rec, s.tick, closing.length);
  if (!cut) return { ...head, events: [...retainedEvents(rec), ...closing] };
  const folded = rec.sealed.slice(0, cut).map((c) => ({ n: c.n, ...summarizeChunk(c.events) }));
  return { ...head, rotated: [...rec.rotated, ...folded],
    events: [...rec.sealed.slice(cut).flatMap((c) => c.events), ...rec.events, ...closing] };
}
/** An export's head, ending at `tick`: everything but `events`. `closing` events
 * end the export's events; its `seq` counts them, since a resumed recorder holds
 * them as recorded events. */
function exportHead(rec: TimelineRecorder, tick: number, closing: number): Omit<TimelineExport, "events"> {
  return {
    format: TIMELINE_FORMAT, version: TIMELINE_VERSION,
    session: { ...rec.session, end: { tick, play: rec.playTicks / STEPS, idle: rec.idleTicks / STEPS }, pending: clonePending(rec.pending) },
    dropped: rec.dropped, seq: rec.seq + closing, ...(rec.rotated.length ? { rotated: [...rec.rotated] } : {}),
  };
}
export const exportTimelineText = (rec: TimelineRecorder, s: GameState, whole = Infinity): string => serializeTimeline(exportTimeline(rec, s, whole));
/** The fewest sealed chunks an export folded for storage keeps whole (with the open chunk). */
export const TIMELINE_WHOLE_FLOOR = 2;
