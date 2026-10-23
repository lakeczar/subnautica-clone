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
  if (part.holds) {
    const h = part.holds;
    if (h.available === true && typeof h.held !== "boolean") { out.holds = {}; out.unavailable.push(`${name}: hold state without a boolean "held"`); }
  }
  return out;
}

/**
 * Raw frame observations → validated facts.
 * raw: { overMs, gaps: [ms…] (rAF gaps), records: [{ total, parts: {…}, hold }…] | null
 *   (null: this build keeps no per-frame record) }
 * → { overMs, count, invalidGaps, worstMs, over: [ms], attributed: true|false|null,
 *     attributionIssue, streaming: [ms], holdFrames: n|null, holdsCovered, complete }
 */
function frames(name, raw, bad) {
  const overMs = valid("frameMs", raw.overMs) ? raw.overMs : 33;
  const gaps = Array.isArray(raw.gaps) ? raw.gaps : [];
  const good = gaps.filter((g) => valid("gapMs", g)), invalidGaps = gaps.length - good.length;
  if (invalidGaps) bad("frames.gaps", gaps.find((g) => !valid("gapMs", g)), `gapMs (${invalidGaps} of ${gaps.length})`);
  const f = {
    overMs, count: good.length, invalidGaps,
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
    // Holds: a boolean per record; anything else leaves the interval uncovered.
    const holdKnown = recs.every((r) => typeof r?.hold === "boolean" || r?.hold === undefined);
    f.holdFrames = recs.filter((r) => r?.hold === true).length;
    f.holdsCovered = holdKnown && recs.length > 0 && !(good.length && !recs.length);
    if (!holdKnown) bad("frames.records[].hold", recs.find((r) => r?.hold !== undefined && typeof r?.hold !== "boolean")?.hold, "a boolean");
  }
  f.complete = invalidGaps === 0 && f.attributed !== false;
  return f;
}

/** Validates a series of { at } observations: finite, nonnegative, nondecreasing seconds. */
export function validTimes(xs) {
  return xs.every((x, i) => valid("seconds", x.at) && (i === 0 || x.at >= xs[i - 1].at));
}
