/** Play timeline export format and analyser. Local only: nothing here (or in the
 * recorder) touches the network. This file has no runtime imports and uses only
 * erasable TypeScript, so `scripts/timeline-report.mjs` loads it directly with
 * Node's type stripping; keep it that way. */

export const TIMELINE_FORMAT = "siltwake.timeline";
export const TIMELINE_VERSION = 1;

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
  /** Notes only. */
  text?: string;
  wall?: string;
}
export interface TimelineSession { id: string; started: string; build?: string; end: { tick: number; play: number; idle: number } }
export interface TimelineExport { format: typeof TIMELINE_FORMAT; version: typeof TIMELINE_VERSION; session: TimelineSession; dropped: number; events: TimelineEvent[] }

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
  if (v.version !== TIMELINE_VERSION) return { ok: false, error: `Unsupported timeline version ${String(v.version)}.` };
  const session = v.session;
  if (!obj(session) || typeof session.id !== "string" || typeof session.started !== "string" || !obj(session.end) ||
    !num(session.end.tick) || !num(session.end.play) || !num(session.end.idle)) return { ok: false, error: "Malformed session header." };
  if (!Array.isArray(v.events) || !num(v.dropped)) return { ok: false, error: "Malformed events." };
  for (const [n, e] of v.events.entries())
    if (!obj(e) || typeof e.kind !== "string" || !KINDS.includes(e.kind) || !num(e.tick) || !num(e.play) ||
      (e.seconds !== undefined && !num(e.seconds)) || (e.stationary !== undefined && !num(e.stationary)) || (e.at !== undefined && !(Array.isArray(e.at) && e.at.length === 3 && e.at.every(num))))
      return { ok: false, error: `Malformed event ${n}.` };
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
  deaths: { count: number; recoverySeconds: number[]; unrecovered: number };
  notes: { play: number; region: string | null; at: [number, number, number] | null; text: string; wall: string | null }[];
  dropped: number;
}

const describe = (e: TimelineEvent | undefined): string => !e ? "start" : `${e.what ?? e.kind}${e.label ? `: ${e.label}` : e.id ? `: ${e.id}` : ""}`;
/** Gaps between new things, empty travel, idle waiting, deaths and notes. */
export function analyseTimeline(t: TimelineExport, thresholds: ReportThresholds = DEFAULT_THRESHOLDS): TimelineAnalysis {
  const events = [...t.events].sort((a, b) => a.tick - b.tick);
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
  const breaks = events.filter((e) => e.kind === "new" || e.kind === "gather" || e.kind === "poi").map((e) => e.play).sort((a, b) => a - b);
  const travels = events.filter((e) => e.kind === "travel");
  const byHull: Record<string, number> = {};
  const emptyStretches: TravelStretch[] = [];
  for (const tr of travels) {
    const seconds = tr.seconds ?? 0, hull = tr.hull ?? "craft";
    byHull[hull] = (byHull[hull] ?? 0) + seconds / 60;
    // The recorder already ends a piece at each point of interest and counts only
    // motion; older producers' spans are split here instead.
    const inside = tr.stationary !== undefined ? [] : breaks.filter((b) => b > tr.play && b < tr.play + seconds);
    let start = tr.play;
    for (const b of [...inside, tr.play + seconds]) {
      if (b - start > 0) emptyStretches.push({ play: start, seconds: b - start, hull, region: tr.region ?? null, flagged: b - start > thresholds.emptyTravelSeconds });
      start = b;
    }
  }
  const idles: IdleStretch[] = events.filter((e) => e.kind === "idle").map((e) => ({
    play: e.play, tick: e.tick, seconds: e.seconds ?? 0, waiting: e.waiting ?? [], region: e.region ?? null,
  }));
  const byItem: Record<string, number> = {};
  const gathers = events.filter((e) => e.kind === "gather");
  for (const g of gathers) byItem[g.what ?? "unknown"] = (byItem[g.what ?? "unknown"] ?? 0) + (g.quantity ?? 1);
  const deaths = events.filter((e) => e.kind === "death");
  const recoveries = events.filter((e) => e.kind === "recovery").map((e) => e.seconds ?? 0);
  return {
    session: t.session,
    playMinutes: end / 60,
    idleMinutes: t.session.end.idle / 60,
    newCount: fresh.length,
    newByKind,
    gaps,
    longestGapMinutes: Math.max(0, ...gaps.map((g) => g.minutes)),
    travel: { count: travels.length, minutes: travels.reduce((n, e) => n + (e.seconds ?? 0), 0) / 60,
      stationaryMinutes: travels.reduce((n, e) => n + (e.stationary ?? 0), 0) / 60, byHull,
      emptyStretches: emptyStretches.filter((s) => s.flagged).sort((a, b) => b.seconds - a.seconds) },
    idle: {
      count: idles.length, minutes: idles.reduce((n, i) => n + i.seconds, 0) / 60,
      waitingMinutes: idles.filter((i) => i.waiting.length).reduce((n, i) => n + i.seconds, 0) / 60,
      longest: idles.reduce<IdleStretch | null>((m, i) => !m || i.seconds > m.seconds ? i : m, null),
      listed: idles.filter((i) => i.seconds >= thresholds.idleListSeconds),
    },
    gathering: { count: gathers.length, byItem },
    deaths: { count: deaths.length, recoverySeconds: recoveries, unrecovered: Math.max(0, deaths.length - recoveries.length) },
    notes: events.filter((e) => e.kind === "note").map((e) => ({ play: e.play, region: e.region ?? null, at: e.at ?? null, text: e.text ?? "", wall: e.wall ?? null })),
    dropped: t.dropped,
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
  out.push("", `New things by kind: ${Object.entries(a.newByKind).map(([k, n]) => `${k} ${n}`).join(", ") || "none"}`);
  const flagged = a.gaps.filter((g) => g.flagged);
  out.push("", `Gaps between new things (target ≤ ${thresholds.newGapMinutes} min): longest ${a.longestGapMinutes.toFixed(1)} min, ${flagged.length} over target`);
  for (const g of flagged) out.push(`  ${clock(g.fromPlay)} → ${clock(g.toPlay)}  ${g.minutes.toFixed(1)} min  after ${g.before}, before ${g.after}`);
  out.push("", `Travel by craft: ${a.travel.count} stretches, ${a.travel.minutes.toFixed(1)} min in motion, ${a.travel.stationaryMinutes.toFixed(1)} min stationary at the helm (${Object.entries(a.travel.byHull).map(([h, m]) => `${h} ${m.toFixed(1)}`).join(", ") || "none"})`);
  out.push(`Empty travel over ${thresholds.emptyTravelSeconds} s: ${a.travel.emptyStretches.length}`);
  for (const s of a.travel.emptyStretches) out.push(`  ${clock(s.play)}  ${Math.round(s.seconds)} s  ${s.hull}${s.region ? ` · ${s.region}` : ""}`);
  out.push("", `Idle waiting: ${a.idle.count} stretches, ${a.idle.minutes.toFixed(1)} min, ${a.idle.waitingMinutes.toFixed(1)} min with background work running`);
  for (const i of a.idle.listed) out.push(`  at play ${clock(i.play)}  ${Math.round(i.seconds)} s${i.waiting.length ? ` · waiting on ${i.waiting.join(", ")}` : ""}${i.region ? ` · ${i.region}` : ""}`);
  out.push("", `Deaths: ${a.deaths.count} · recovered ${a.deaths.recoverySeconds.length}${a.deaths.recoverySeconds.length ? ` (${a.deaths.recoverySeconds.map((s) => `${Math.round(s)} s`).join(", ")})` : ""} · unrecovered ${a.deaths.unrecovered}`);
  out.push(`Gathering: ${Object.entries(a.gathering.byItem).map(([k, n]) => `${k} ${n}`).join(", ") || "none"}`);
  if (a.notes.length) {
    out.push("", `Feedback notes: ${a.notes.length}`);
    for (const n of a.notes) out.push(`  ${clock(n.play)}${n.region ? ` · ${n.region}` : ""}${n.at ? ` · (${n.at.map((v) => Math.round(v)).join(", ")})` : ""}  ${n.text}`);
  }
  return `${out.join("\n")}\n`;
}
