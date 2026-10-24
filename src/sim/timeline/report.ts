/** Play timeline export format and analyser. Local only: nothing here (or in the
 * recorder) touches the network. This file has no runtime imports and uses only
 * erasable TypeScript, so `scripts/timeline-report.mjs` loads it directly with
 * Node's type stripping; keep it that way. */

export const TIMELINE_FORMAT = "siltwake.timeline";
/** The longest note save reference (`TimelineEvent.saveRef`). */
export const SAVE_REF_MAX = 200;
export const validSaveRef = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= SAVE_REF_MAX;
export const TIMELINE_VERSION = 2;
/** Version 1 exports (one capped event list) still parse and analyse. */
export const TIMELINE_VERSIONS: readonly number[] = [1, 2];

export type TimelineKind = "new" | "gather" | "poi" | "travel" | "idle" | "death" | "recovery" | "region" | "system" | "note";
/** What a "new" event unlocked or discovered. */
export type NewKind = "blueprint" | "material" | "record" | "evidence" | "discovery" | "craft" | "hull" | "region" | "decode" | "site" | "other";
export interface TimelineEvent {
  kind: TimelineKind;
  /** Simulation tick (60 per second). For spans, the start. */
  tick: number;
  /** Active play seconds so far; idle waiting never advances it. For spans, the start. */
  play: number;
  what?: string;
  id?: string;
  label?: string;
  quantity?: number;
  at?: [number, number, number];
  region?: string | null;
  /** Span length (travel: seconds in motion; idle: idle seconds) or recovery time. */
  seconds?: number;
  /** Travel only: stationary helm seconds inside the piece, not counted as travel. */
  stationary?: number;
  metres?: number;
  hull?: string;
  /** Idle only: background work that was running (decode, growth, ...). */
  waiting?: string[];
  /** Death: what it left behind (`cache:<id>`, `loss:<vehicleId>`). Recovery: the same keys. */
  keys?: string[];
  /** Recovery only: the tick of the death it closes. */
  of?: number;
  /** Notes only. */
  text?: string;
  wall?: string;
  /** Notes only: a reference to the game state saved with the note (REC-2 owns the
   * save and where it is kept). At most `SAVE_REF_MAX` characters, so a 1,000-event
   * chunk stays bounded. */
  saveRef?: string;
}
/** One death not yet recovered. `losses` are craft still lost (`recovery.losses`
 * vehicle IDs); `cargo` is the specific stacks the death put in its cache (or a
 * salvage canister), by stack ID. A line shrinks only when quantity leaves that
 * stack; deposits never add to it. The death closes when both are empty. */
export interface PendingRecovery {
  tick: number;
  play: number;
  /** Everything ever attributed: `cache:<id>` (death caches and salvage canisters), `loss:<vehicleId>`. */
  keys: string[];
  losses: string[];
  /** `quantity` still owed from stack `item`; `last` is that stack's quantity at the last observation. */
  cargo: { cache: string; item: string; kind: string; quantity: number; last: number }[];
}
/** `pending` is the live recovery ledger at export, so a reload resumes it exactly. */
export interface TimelineSession { id: string; started: string; build?: string; end: { tick: number; play: number; idle: number }; pending?: PendingRecovery[] }
/** Event kinds a rotated chunk keeps in full: feedback notes are never dropped;
 * new things, deaths and recoveries carry the pacing and recovery story; system
 * events (decodes, crops, timelines evicted for room) are rare and say what happened. */
export const KEPT_KINDS: readonly TimelineKind[] = ["note", "new", "death", "recovery", "system"];
/** The listing floors a summary keeps stretches at (the report's defaults). */
const LONG_TRAVEL_SECONDS = 90, LONG_IDLE_SECONDS = 60;
/** One rotated-out chunk of the timeline (SIM-05): its kept events in full and
 * everything else as totals, so a long session's report still counts it all. */
export interface ChunkSummary {
  /** The chunk's number in its session, when the recorder sealed it. */
  n?: number;
  from: { tick: number; play: number };
  to: { tick: number; play: number };
  /** Every event the chunk held, by kind. */
  kinds: Record<string, number>;
  kept: TimelineEvent[];
  gathering: { count: number; byItem: Record<string, number> };
  travel: { count: number; seconds: number; stationary: number; byHull: Record<string, number>;
    /** Empty stretches over 90 s (the report's default threshold). */
    long: { play: number; seconds: number; hull: string; region: string | null }[] };
  idle: { count: number; seconds: number; waitingSeconds: number;
    /** Idle stretches of 60 s or more (the report's default listing). */
    long: { play: number; tick: number; seconds: number; waiting: string[]; region: string | null }[] };
  /** Regions the chunk's region events name, so a resumed recorder knows them. */
  regions: string[];
}
/** `rotated` (version 2) summarises the oldest chunks, oldest first; `events`
 * holds the rest in full. `dropped` counts events a version 1 recorder discarded at its cap. */
export interface TimelineExport { format: typeof TIMELINE_FORMAT; version: number; session: TimelineSession; dropped: number;
  /** Events ever recorded, rotated ones included (version 2; a resumed recorder carries on from it). */
  seq?: number;
  rotated?: ChunkSummary[]; events: TimelineEvent[] }

const bump = (into: Record<string, number>, key: string, n = 1): void => { into[key] = (into[key] ?? 0) + n; };
/** A travel span's empty stretches: between its ends and any point of interest inside it. */
function stretchesOf(tr: TimelineEvent, breaks: readonly number[]): { play: number; seconds: number }[] {
  const seconds = tr.seconds ?? 0, out: { play: number; seconds: number }[] = [];
  // The recorder already ends a piece at each point of interest and counts only
  // motion; older producers' spans are split here instead.
  const inside = tr.stationary !== undefined ? [] : breaks.filter((b) => b > tr.play && b < tr.play + seconds);
  let start = tr.play;
  for (const b of [...inside, tr.play + seconds]) {
    if (b - start > 0) out.push({ play: start, seconds: b - start });
    start = b;
  }
  return out;
}
const breaksOf = (events: readonly TimelineEvent[]): number[] =>
  events.filter((e) => e.kind === "new" || e.kind === "gather" || e.kind === "poi").map((e) => e.play).sort((a, b) => a - b);
/** Folds a chunk of events (oldest first) into its summary. */
export function summarizeChunk(events: readonly TimelineEvent[]): ChunkSummary {
  const first = events[0], last = events.at(-1);
  const s: ChunkSummary = {
    from: { tick: first?.tick ?? 0, play: first?.play ?? 0 }, to: { tick: last?.tick ?? 0, play: last?.play ?? 0 },
    kinds: {}, kept: [], gathering: { count: 0, byItem: {} },
    travel: { count: 0, seconds: 0, stationary: 0, byHull: {}, long: [] }, idle: { count: 0, seconds: 0, waitingSeconds: 0, long: [] }, regions: [],
  };
  const breaks = breaksOf(events);
  for (const e of events) {
    bump(s.kinds, e.kind);
    if (KEPT_KINDS.includes(e.kind)) s.kept.push(e);
    if (e.kind === "gather") { s.gathering.count++; bump(s.gathering.byItem, e.what ?? "unknown", e.quantity ?? 1); }
    if (e.kind === "travel") {
      const hull = e.hull ?? "craft";
      s.travel.count++; s.travel.seconds += e.seconds ?? 0; s.travel.stationary += e.stationary ?? 0; bump(s.travel.byHull, hull, e.seconds ?? 0);
      for (const x of stretchesOf(e, breaks)) if (x.seconds > LONG_TRAVEL_SECONDS) s.travel.long.push({ ...x, hull, region: e.region ?? null });
    }
    if (e.kind === "idle") {
      const seconds = e.seconds ?? 0, waiting = e.waiting ?? [];
      s.idle.count++; s.idle.seconds += seconds; if (waiting.length) s.idle.waitingSeconds += seconds;
      if (seconds >= LONG_IDLE_SECONDS) s.idle.long.push({ play: e.play, tick: e.tick, seconds, waiting, region: e.region ?? null });
    }
    if ((e.kind === "region" || (e.kind === "new" && e.what === "region")) && e.id && !s.regions.includes(e.id)) s.regions.push(e.id);
  }
  return s;
}

/** One event per line inside a JSON document: diffable and easy to skim. */
export function serializeTimeline(t: TimelineExport): string {
  const { events, ...head } = t;
  const body = events.map((e) => `  ${JSON.stringify(e)}`).join(",\n");
  return `${JSON.stringify(head).slice(0, -1)},"events":[\n${body}\n]}\n`;
}

const KINDS: readonly string[] = ["new", "gather", "poi", "travel", "idle", "death", "recovery", "region", "system", "note"];
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export function parseTimeline(text: string): { ok: true; value: TimelineExport } | { ok: false; error: string } {
  let v: unknown;
  try { v = JSON.parse(text); } catch (e) { return { ok: false, error: `Not JSON: ${(e as Error).message}` }; }
  if (!obj(v) || v.format !== TIMELINE_FORMAT) return { ok: false, error: `Not a ${TIMELINE_FORMAT} file.` };
  if (typeof v.version !== "number" || !TIMELINE_VERSIONS.includes(v.version)) return { ok: false, error: `Unsupported timeline version ${String(v.version)}.` };
  const session = v.session;
  if (!obj(session) || typeof session.id !== "string" || typeof session.started !== "string" || !obj(session.end) ||
    !num(session.end.tick) || !num(session.end.play) || !num(session.end.idle)) return { ok: false, error: "Malformed session header." };
  const strings = (a: unknown): boolean => Array.isArray(a) && a.every((x) => typeof x === "string");
  if (session.pending !== undefined && !(Array.isArray(session.pending) && session.pending.every((p) => obj(p) && num(p.tick) && num(p.play) &&
    strings(p.keys) && strings(p.losses) && Array.isArray(p.cargo) &&
    p.cargo.every((c) => obj(c) && typeof c.cache === "string" && typeof c.item === "string" && typeof c.kind === "string" &&
      num(c.quantity) && c.quantity > 0 && num(c.last) && c.last >= 0))))
    return { ok: false, error: "Malformed pending recoveries." };
  if (!Array.isArray(v.events) || !num(v.dropped) || (v.seq !== undefined && !num(v.seq))) return { ok: false, error: "Malformed events." };
  const event = (e: unknown): boolean => obj(e) && typeof e.kind === "string" && KINDS.includes(e.kind) && num(e.tick) && num(e.play) &&
      (e.seconds === undefined || num(e.seconds)) && (e.of === undefined || num(e.of)) &&
      (e.keys === undefined || (Array.isArray(e.keys) && e.keys.every((k) => typeof k === "string"))) && (e.stationary === undefined || num(e.stationary)) && (e.at === undefined || (Array.isArray(e.at) && e.at.length === 3 && e.at.every(num))) &&
      (e.saveRef === undefined || validSaveRef(e.saveRef));
  for (const [n, e] of v.events.entries()) if (!event(e)) return { ok: false, error: `Malformed event ${n}.` };
  const counts = (r: unknown): boolean => obj(r) && Object.values(r).every(num);
  if (v.rotated !== undefined && !(Array.isArray(v.rotated) && v.rotated.every((r) => obj(r) && obj(r.from) && obj(r.to) &&
    (r.n === undefined || num(r.n)) && num(r.from.tick) && num(r.from.play) && num(r.to.tick) && num(r.to.play) && counts(r.kinds) && Array.isArray(r.kept) && r.kept.every(event) &&
    obj(r.gathering) && num(r.gathering.count) && counts(r.gathering.byItem) &&
    obj(r.travel) && num(r.travel.count) && num(r.travel.seconds) && num(r.travel.stationary) && counts(r.travel.byHull) && Array.isArray(r.travel.long) &&
    obj(r.idle) && num(r.idle.count) && num(r.idle.seconds) && num(r.idle.waitingSeconds) && Array.isArray(r.idle.long) &&
    Array.isArray(r.regions) && r.regions.every((x) => typeof x === "string"))))
    return { ok: false, error: "Malformed rotated chunks." };
  return { ok: true, value: v as unknown as TimelineExport };
}

export interface ReportThresholds {
  /** Something new every 15–20 minutes of efficient play. */
  newGapMinutes: number;
  /** Empty travel between points of interest. */
  emptyTravelSeconds: number;
  /** Idle stretches shorter than this are not listed one by one. */
  idleListSeconds: number;
}
export const DEFAULT_THRESHOLDS: ReportThresholds = { newGapMinutes: 20, emptyTravelSeconds: 90, idleListSeconds: 60 };
export interface Gap { fromPlay: number; toPlay: number; minutes: number; before: string; after: string; flagged: boolean }
export interface TravelStretch { play: number; seconds: number; hull: string; region: string | null; flagged: boolean }
export interface IdleStretch { play: number; tick: number; seconds: number; waiting: string[]; region: string | null }
export interface TimelineAnalysis {
  session: TimelineSession;
  playMinutes: number;
  idleMinutes: number;
  newCount: number;
  newByKind: Record<string, number>;
  gaps: Gap[];
  longestGapMinutes: number;
  travel: { count: number; minutes: number; stationaryMinutes: number; byHull: Record<string, number>; emptyStretches: TravelStretch[] };
  idle: { count: number; minutes: number; waitingMinutes: number; longest: IdleStretch | null; listed: IdleStretch[] };
  gathering: { count: number; byItem: Record<string, number> };
  /** `recoverySeconds` covers deaths that left something to recover; `nothingLost` the rest. */
  deaths: { count: number; recoverySeconds: number[]; nothingLost: number; unrecovered: number };
  notes: { play: number; region: string | null; at: [number, number, number] | null; text: string; wall: string | null }[];
  dropped: number;
  /** Chunks rotated into summaries: their events, and the play time they end at. */
  rotated: { chunks: number; events: number; toPlay: number };
}

const describe = (e: TimelineEvent | undefined): string => !e ? "start" : `${e.what ?? e.kind}${e.label ? `: ${e.label}` : e.id ? `: ${e.id}` : ""}`;
/** Gaps between new things, empty travel, idle waiting, deaths and notes. */
export function analyseTimeline(t: TimelineExport, thresholds: ReportThresholds = DEFAULT_THRESHOLDS): TimelineAnalysis {
  const rotated = t.rotated ?? [];
  // A rotated chunk's kept events (notes, new things, deaths, recoveries) count
  // exactly as if never rotated; its other events count through its totals.
  const events = [...rotated.flatMap((r) => r.kept), ...t.events].sort((a, b) => a.tick - b.tick);
  const end = t.session.end.play;
  const fresh = events.filter((e) => e.kind === "new").sort((a, b) => a.play - b.play);
  const gaps: Gap[] = [];
  let prev: TimelineEvent | undefined;
  for (const e of [...fresh, undefined]) {
    const from = prev?.play ?? 0, to = e?.play ?? end;
    if (to > from || e) {
      const minutes = (to - from) / 60;
      gaps.push({ fromPlay: from, toPlay: to, minutes, before: describe(prev), after: e ? describe(e) : "end", flagged: minutes > thresholds.newGapMinutes });
    }
    prev = e;
  }
  const newByKind: Record<string, number> = {};
  for (const e of fresh) newByKind[e.what ?? "other"] = (newByKind[e.what ?? "other"] ?? 0) + 1;

  // A travel span is empty between its ends and any point of interest inside it.
  const breaks = breaksOf(events);
  const travels = events.filter((e) => e.kind === "travel");
  const byHull: Record<string, number> = {};
  const emptyStretches: TravelStretch[] = [];
  for (const tr of travels) {
    const hull = tr.hull ?? "craft";
    byHull[hull] = (byHull[hull] ?? 0) + (tr.seconds ?? 0) / 60;
    for (const x of stretchesOf(tr, breaks)) emptyStretches.push({ ...x, hull, region: tr.region ?? null, flagged: x.seconds > thresholds.emptyTravelSeconds });
  }
  const idles: IdleStretch[] = events.filter((e) => e.kind === "idle").map((e) => ({
    play: e.play, tick: e.tick, seconds: e.seconds ?? 0, waiting: e.waiting ?? [], region: e.region ?? null,
  }));
  const byItem: Record<string, number> = {};
  const gathers = events.filter((e) => e.kind === "gather");
  for (const g of gathers) byItem[g.what ?? "unknown"] = (byItem[g.what ?? "unknown"] ?? 0) + (g.quantity ?? 1);
  // Rotated totals, and the long stretches a summary keeps.
  let travelCount = travels.length, travelSeconds = travels.reduce((n, e) => n + (e.seconds ?? 0), 0);
  let stationarySeconds = travels.reduce((n, e) => n + (e.stationary ?? 0), 0), gatherCount = gathers.length;
  let idleCount = idles.length, idleSeconds = idles.reduce((n, i) => n + i.seconds, 0);
  let waitingSeconds = idles.filter((i) => i.waiting.length).reduce((n, i) => n + i.seconds, 0);
  const longIdles: IdleStretch[] = [];
  for (const r of rotated) {
    travelCount += r.travel.count; travelSeconds += r.travel.seconds; stationarySeconds += r.travel.stationary;
    for (const [h, sec] of Object.entries(r.travel.byHull)) byHull[h] = (byHull[h] ?? 0) + sec / 60;
    for (const x of r.travel.long) emptyStretches.push({ ...x, flagged: x.seconds > thresholds.emptyTravelSeconds });
    gatherCount += r.gathering.count;
    for (const [k, n] of Object.entries(r.gathering.byItem)) byItem[k] = (byItem[k] ?? 0) + n;
    idleCount += r.idle.count; idleSeconds += r.idle.seconds; waitingSeconds += r.idle.waitingSeconds;
    longIdles.push(...r.idle.long);
  }
  const deaths = events.filter((e) => e.kind === "death");
  const recoveryEvents = events.filter((e) => e.kind === "recovery");
  const recoveries = recoveryEvents.filter((e) => e.what !== "nothing-lost").map((e) => e.seconds ?? 0);
  return {
    session: t.session,
    playMinutes: end / 60,
    idleMinutes: t.session.end.idle / 60,
    newCount: fresh.length,
    newByKind,
    gaps,
    longestGapMinutes: Math.max(0, ...gaps.map((g) => g.minutes)),
    travel: { count: travelCount, minutes: travelSeconds / 60, stationaryMinutes: stationarySeconds / 60, byHull,
      emptyStretches: emptyStretches.filter((s) => s.flagged).sort((a, b) => b.seconds - a.seconds) },
    idle: {
      count: idleCount, minutes: idleSeconds / 60, waitingMinutes: waitingSeconds / 60,
      longest: [...longIdles, ...idles].reduce<IdleStretch | null>((m, i) => !m || i.seconds > m.seconds ? i : m, null),
      listed: [...longIdles, ...idles].filter((i) => i.seconds >= thresholds.idleListSeconds),
    },
    gathering: { count: gatherCount, byItem },
    deaths: { count: deaths.length, recoverySeconds: recoveries, nothingLost: recoveryEvents.length - recoveries.length,
      unrecovered: Math.max(0, deaths.length - recoveryEvents.length) },
    notes: events.filter((e) => e.kind === "note").map((e) => ({ play: e.play, region: e.region ?? null, at: e.at ?? null, text: e.text ?? "", wall: e.wall ?? null })),
    dropped: t.dropped,
    rotated: { chunks: rotated.length, events: rotated.reduce((n, r) => n + Object.values(r.kinds).reduce((a, b) => a + b, 0), 0),
      toPlay: rotated.at(-1)?.to.play ?? 0 },
  };
}

const clock = (seconds: number): string => {
  const s = Math.max(0, Math.round(seconds)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
};
/** Plain-text report for the owner's playtests. */
export function formatTimelineReport(a: TimelineAnalysis, thresholds: ReportThresholds = DEFAULT_THRESHOLDS): string {
  const out: string[] = [];
  out.push(`Siltwake play timeline · session ${a.session.id} · started ${a.session.started}${a.session.build ? ` · build ${a.session.build}` : ""}`);
  out.push(`Play ${clock(a.playMinutes * 60)} (idle excluded) · idle ${clock(a.idleMinutes * 60)} · ${a.newCount} new things · ${a.gathering.count} gathers · ${a.deaths.count} deaths`);
  if (a.dropped) out.push(`Warning: ${a.dropped} events were dropped at the recorder's cap.`);
  if (a.rotated.chunks) out.push(`The earliest ${a.rotated.events} events (play to ${clock(a.rotated.toPlay)}) are kept as totals; their feedback notes, new things, deaths and recoveries are kept in full` +
    ` (empty travel and idle stretches there are listed at the default thresholds).`);
  out.push("", `New things by kind: ${Object.entries(a.newByKind).map(([k, n]) => `${k} ${n}`).join(", ") || "none"}`);
  const flagged = a.gaps.filter((g) => g.flagged);
  out.push("", `Gaps between new things (target ≤ ${thresholds.newGapMinutes} min): longest ${a.longestGapMinutes.toFixed(1)} min, ${flagged.length} over target`);
  for (const g of flagged) out.push(`  ${clock(g.fromPlay)} → ${clock(g.toPlay)}  ${g.minutes.toFixed(1)} min  after ${g.before}, before ${g.after}`);
  out.push("", `Travel by craft: ${a.travel.count} stretches, ${a.travel.minutes.toFixed(1)} min in motion, ${a.travel.stationaryMinutes.toFixed(1)} min stationary at the helm (${Object.entries(a.travel.byHull).map(([h, m]) => `${h} ${m.toFixed(1)}`).join(", ") || "none"})`);
  out.push(`Empty travel over ${thresholds.emptyTravelSeconds} s: ${a.travel.emptyStretches.length}`);
  for (const s of a.travel.emptyStretches) out.push(`  ${clock(s.play)}  ${Math.round(s.seconds)} s  ${s.hull}${s.region ? ` · ${s.region}` : ""}`);
  out.push("", `Idle waiting: ${a.idle.count} stretches, ${a.idle.minutes.toFixed(1)} min, ${a.idle.waitingMinutes.toFixed(1)} min with background work running`);
  for (const i of a.idle.listed) out.push(`  at play ${clock(i.play)}  ${Math.round(i.seconds)} s${i.waiting.length ? ` · waiting on ${i.waiting.join(", ")}` : ""}${i.region ? ` · ${i.region}` : ""}`);
  out.push("", `Deaths: ${a.deaths.count} · recovered ${a.deaths.recoverySeconds.length}${a.deaths.recoverySeconds.length ? ` (${a.deaths.recoverySeconds.map((s) => `${Math.round(s)} s`).join(", ")})` : ""} · nothing lost ${a.deaths.nothingLost} · unrecovered ${a.deaths.unrecovered}`);
  out.push(`Gathering: ${Object.entries(a.gathering.byItem).map(([k, n]) => `${k} ${n}`).join(", ") || "none"}`);
  if (a.notes.length) {
    out.push("", `Feedback notes: ${a.notes.length}`);
    for (const n of a.notes) out.push(`  ${clock(n.play)}${n.region ? ` · ${n.region}` : ""}${n.at ? ` · (${n.at.map((v) => Math.round(v)).join(", ")})` : ""}  ${n.text}`);
  }
  return `${out.join("\n")}\n`;
}
