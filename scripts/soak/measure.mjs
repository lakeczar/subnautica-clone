// The soak's measurement contract (SCHED-2a R3). Every provider's output
// passes through normalize() before anything else sees it, and the evaluator
// (goals.mjs) re-checks the same domains as defence in depth.
//
// Each measurement type declares its domain. A value outside it never becomes
// a number: it is dropped and reported as `unavailable`, with a diagnostic.
// A value that is absent (null or undefined) is simply not measured: the rule
// that needs it finds nothing and is unavailable.
//
//   memoryMiB  memory a process or scope holds         finite, > 0
//   sizeMiB    an amount that may be empty (residency)  finite, ≥ 0
//   count      graphics objects                         a nonnegative integer (0 is valid)
//   frameMs    a frame's total time                     finite, > 0
//   splitMs    one part of a frame's split              finite, ≥ 0
//   gapMs      an rAF or autosave gap                   finite, ≥ 0
//   seconds    monotonic elapsed time                   finite, ≥ 0
//
// Frames: a provider reports raw observations, never conclusions. normalize()
// derives from the valid ones only: the worst gap (a maximum over valid gaps),
// the gaps over the limit, attribution (true only when every per-frame record
// has a valid total and a valid split for every part the streaming rule
// needs), streaming frames, hold frames, and whether the interval's evidence
// is complete. A known violation is kept even when other observations in the
// same interval are invalid; an invalid one only makes the interval incomplete.

export const DOMAINS = Object.freeze({
  memoryMiB: (v) => typeof v === "number" && Number.isFinite(v) && v > 0,
  sizeMiB: (v) => typeof v === "number" && Number.isFinite(v) && v >= 0,
  count: (v) => Number.isInteger(v) && v >= 0,
  frameMs: (v) => typeof v === "number" && Number.isFinite(v) && v > 0,
  splitMs: (v) => typeof v === "number" && Number.isFinite(v) && v >= 0,
  gapMs: (v) => typeof v === "number" && Number.isFinite(v) && v >= 0,
  seconds: (v) => typeof v === "number" && Number.isFinite(v) && v >= 0,
});
export const valid = (type, v) => DOMAINS[type](v);

/**
 * The canonical hold observation (R4-F1): "holding", "clear" or "unknown".
 * Producers: CW-1's per-frame record and #ocean dataset carry the cave
 * admission's state (src/world/caves/admission.ts CaveHold.state: clear,
 * loading, rescue, refuge); a frame where admission was not evaluated records
 * null. Other providers may report a boolean. Absent, null, an unknown state or
 * a wrong type is "unknown": never evidence that nothing held.
 */
export const HOLD_STATES = Object.freeze({
  clear: "clear", admitted: "clear", away: "clear", // admitted or no cave in reach: nothing holds
  loading: "holding", waiting: "holding", rescue: "holding", refuge: "holding",
});
export function holdObservation(v) {
  if (v === true) return { obs: "holding" };
  if (v === false) return { obs: "clear" };
  if (v == null) return { obs: "unknown", why: v === null ? "null (admission not evaluated)" : "absent" };
  if (typeof v === "string" && HOLD_STATES[v]) return { obs: HOLD_STATES[v], state: v };
  return { obs: "unknown", why: `${typeof v === "string" ? "an unknown state" : "a wrong type"} ${JSON.stringify(v)?.slice(0, 30)}`, invalid: true };
}

/** Memory keys that may legitimately be empty; every other memory key is memoryMiB. */
const SIZE_KEYS = new Set(["residentCpuMiB", "residentGpuMiB"]);
const memoryType = (k) => (SIZE_KEYS.has(k) ? "sizeMiB" : "memoryMiB");
/** The parts of a frame's split that decide whether it was streaming's (CW-1's rule). */
export const STREAMING_PARTS = ["chunks", "caves", "regions", "lights"];

const describe = (v) => (typeof v === "number" ? String(v) : `${typeof v} ${JSON.stringify(v)?.slice(0, 40)}`);

/**
 * One provider's raw sample → its validated form, plus diagnostics.
 * Returns the part with every invalid value removed and `unavailable` listing why.
 */
export function normalize(name, part) {
  if (!part || typeof part !== "object") return { unavailable: [`${name}: returned no sample`] };
  const out = { ...part, unavailable: [...(part.unavailable ?? [])] };
  const bad = (what, v, domain) => out.unavailable.push(`${name}: ${what} ${describe(v)} is outside ${domain}`);
  for (const [group, typeOf] of [["memory", memoryType], ["graphics", () => "count"]]) {
    if (!part[group]) continue;
    out[group] = {};
    for (const [k, v] of Object.entries(part[group])) {
      if (v == null) continue; // not measured
      if (valid(typeOf(k), v)) out[group][k] = v; else bad(`${group}.${k}`, v, typeOf(k));
    }
  }
  if (part.frames) out.frames = frames(name, part.frames, bad);
  if (part.lastSave) {
    const { savedAt, tick } = part.lastSave;
    out.lastSave = typeof savedAt === "string" && savedAt && valid("count", tick) ? { savedAt, tick } : null;
    if (!out.lastSave) out.unavailable.push(`${name}: the newest save has no valid savedAt and tick`);
  }
  // A polled hold state (R4-F1): canonical observation; "unknown" is no state at all.
  if (part.holds && "state" in part.holds) {
    const h = holdObservation(part.holds.state);
    if (h.invalid) out.unavailable.push(`${name}: hold state ${h.why}`);
    out.holds = h.obs === "unknown" ? { available: false } : { available: true, held: h.obs === "holding", state: h.state ?? String(part.holds.state) };
  }
  return out;
}

/**
 * Raw frame observations → validated facts.
 * raw: { overMs, gaps: [ms | { ms, excluded }…] (rAF gaps; `excluded` when the gap
 *   overlapped a GC or save-check window, tagged in the page), records: [{ total,
 *   parts: {…}, hold }…] | null (null: this build keeps no per-frame record) }
 * → { overMs, count, excluded, invalidGaps, worstMs, over: [ms], attributed,
 *     attributionIssue, streaming: [ms], holdFrames, holdsCovered, complete }
 */
function frames(name, raw, bad) {
  const overMs = valid("frameMs", raw.overMs) ? raw.overMs : 33;
  // Gaps that overlapped an excluded window (GC, save check) are that work's,
  // not the game's: kept out of timing, by interval (R4-F3).
  const all = (Array.isArray(raw.gaps) ? raw.gaps : []).map((g) => (g && typeof g === "object" ? g : { ms: g, excluded: false }));
  const wellTagged = (g) => typeof g.excluded === "boolean";
  const usableGap = (g) => valid("gapMs", g.ms) && wellTagged(g);
  const invalidGaps = all.filter((g) => !usableGap(g)).length;
  if (invalidGaps) bad("frames.gaps", all.find((g) => !usableGap(g))?.ms, `gapMs with a boolean excluded tag (${invalidGaps} of ${all.length})`);
  const good = all.filter((g) => usableGap(g) && !g.excluded).map((g) => g.ms);
  const f = {
    overMs, count: good.length, excluded: all.filter((g) => usableGap(g) && g.excluded).length, invalidGaps,
    worstMs: good.length ? Math.max(...good) : null, // over valid gaps only
    over: good.filter((g) => g > overMs),
    attributed: null, attributionIssue: null, streaming: [], holdFrames: null, holdsCovered: false,
  };
  if (raw.records == null) { f.attributed = false; f.attributionIssue = "this build keeps no per-frame record"; }
  else if (!Array.isArray(raw.records)) { f.attributed = false; f.attributionIssue = "the per-frame record is not a list"; bad("frames.records", raw.records, "a list"); }
  else {
    const recs = raw.records;
    const usable = (r) => r && valid("frameMs", r.total) && r.parts && STREAMING_PARTS.every((p) => valid("splitMs", r.parts[p]));
    const ok = recs.filter(usable), broken = recs.length - ok.length;
    // Streaming violations from valid records only; a broken record never counts as no streaming work.
    f.streaming = ok.filter((r) => r.total > overMs && STREAMING_PARTS.reduce((a, p) => a + r.parts[p], 0) >= r.total / 2).map((r) => r.total);
    if (broken) {
      const r = recs.find((x) => !usable(x));
      bad("frames.records", r?.total, `frameMs with a splitMs for each of ${STREAMING_PARTS.join(", ")} (${broken} of ${recs.length} records)`);
    }
    if (good.length && !recs.length) { f.attributed = false; f.attributionIssue = "frames ran, but the per-frame record stayed empty"; }
    else if (broken) { f.attributed = false; f.attributionIssue = `${broken} of ${recs.length} per-frame records lack a valid total or split`; }
    else f.attributed = recs.length > 0 ? true : null;
    // Holds: the canonical observation per record (R4-F1). Holding frames are
    // violations; covered only when every record says clear or holding.
    const holds = recs.map((r) => holdObservation(r?.hold));
    f.holdFrames = holds.filter((h) => h.obs === "holding").length;
    const unknown = holds.filter((h) => h.obs === "unknown");
    f.holdsCovered = recs.length > 0 && unknown.length === 0;
    if (unknown.length) {
      f.holdIssue = `${unknown.length} of ${recs.length} per-frame records have no known hold state (${unknown[0].why})`;
      if (unknown.some((h) => h.invalid)) bad("frames.records[].hold", recs[holds.findIndex((h) => h.invalid)]?.hold, "a hold state (clear, loading, rescue, refuge) or a boolean");
    }
  }
  f.complete = invalidGaps === 0 && f.attributed !== false;
  return f;
}

/** Validates a series of { at } observations: finite, nonnegative, nondecreasing seconds. */
export function validTimes(xs) {
  return xs.every((x, i) => valid("seconds", x.at) && (i === 0 || x.at >= xs[i - 1].at));
}
