// REC-1 pack analysis: a recording directory → the facts every tier is built
// from (verdict, key numbers, the attention list, pacing, the story). Pure:
// no browser, no ffmpeg; tests/rec1-pack.test.ts runs it on a synthetic recording.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const HOLDING = new Set(["loading", "rescue", "refuge", "waiting"]);
/** The recording's own table where it carries one (src/runtime/flight/recorder.ts HOLD_CODES). */
export const HOLD_CODES = [null, "clear", "loading", "rescue", "refuge", "waiting", "away", "admitted", "inactive", "opening", "interior"];
export const NOT_APPLICABLE = new Set(["inactive", "opening", "interior"]);
/** Attention thresholds (the owner's list; tuned from MEM-1 and the soaks). */
export const THRESHOLDS = Object.freeze({
  longFrameMs: 33, memoryJumpMiB: 64, memoryJumpWindowS: 10, drawJumpRatio: 0.5, drawJumpMin: 250,
  /** A strip per attention entry, up to this many; the rest are listed without one. */
  maxStrips: 40, randomStrips: 3,
  /** Long frames closer than this share one attention entry. */
  groupS: 2,
});

const lines = (file) => (existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const q = (sorted, f) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))] : null);
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

export function loadRecording(dir) {
  const rec = path.join(dir, "recording");
  const header = JSON.parse(readFileSync(path.join(rec, "header.json"), "utf8"));
  const cols = header.frameColumns;
  const codes = header.holdCodes ?? HOLD_CODES;
  const frames = lines(path.join(rec, "frames.ndjson")).map((row) => { const f = Object.fromEntries(cols.map((c, i) => [c, row[i]])); f.holdState = codes[f.hold] ?? null; return f; });
  return { dir, rec, header, frames, samples: lines(path.join(rec, "samples.ndjson")), events: lines(path.join(rec, "events.ndjson")),
    snapshots: lines(path.join(rec, "snapshots.ndjson")), system: lines(path.join(rec, "system.ndjson")) };
}

/** Linear fit slope of ys over xs (per unit x). */
function slope(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den ? num / den : null;
}

/** The recording's video files: `segments` (independently decodable files), or one older-style file. */
export function videoSegments(header) {
  const v = header.video;
  if (!v) return [];
  if (Array.isArray(v.segments)) return v.segments.filter((x) => x.file && x.start != null);
  return v.file && v.start != null ? [{ file: v.file, start: v.start, end: null }] : [];
}

/**
 * Every number and judgement the pack shows. `facts` (from pack.mjs, which can
 * read the files): { videoSeconds: { file: seconds | null } }. Without them,
 * video coverage stays unproven rather than passing.
 */
export function analyse(r, t = THRESHOLDS, facts = {}) {
  const { header } = r;
  // A driver run is judged from the moment travel starts (run.pageStart); the
  // load before it is summarised apart. An owner export is judged whole.
  // An owner export has no driver mark: it is judged from the first moment of play after
  // entering the expedition. Entry itself (behind the load screen) admits nearby caves at once,
  // by CW-1's design, and is summarised with the load, not judged.
  const entered = r.events.find((e) => e.kind === "load")?.t;
  const playing = entered == null ? null : r.samples.find((x) => x.t > entered && x.active)?.t ?? null;
  const t0 = header.run?.pageStart ?? playing ?? entered ?? r.frames[0]?.t ?? r.samples[0]?.t ?? 0;
  const inWindow = (x) => x.t >= t0;
  const frames = r.frames.filter(inWindow), samples = r.samples.filter(inWindow), events = r.events.filter(inWindow), system = r.system.filter(inWindow);
  const early = r.frames.filter((f) => f.t < t0 && f.gap > 0);
  const before = early.length ? { frames: early.length, seconds: Math.round((t0 - early[0].t) / 100) / 10, over33: early.filter((f) => f.gap > t.longFrameMs).length,
    errors: r.events.filter((e) => e.t < t0 && e.kind === "error").length } : null;
  const rel = (pt) => Math.round((pt - t0) / 100) / 10; // seconds from the start
  const played = frames.filter((f) => f.gap > 0);
  const gaps = played.map((f) => f.gap).sort((a, b) => a - b), work = played.map((f) => f.work).sort((a, b) => a - b);
  const recMs = played.map((f) => f.rec).sort((a, b) => a - b);
  const domMs = played.filter((f) => f.dom != null).map((f) => f.dom).sort((a, b) => a - b);
  const gpuMs = played.filter((f) => f.gpu != null && f.gpu >= 0).map((f) => f.gpu).sort((a, b) => a - b);
  // Hold coverage from the rows themselves (R1-F4): known holds fail whatever else is missing.
  const holdKinds = { holding: 0, clear: 0, na: 0, unknown: 0 };
  for (const f of frames) {
    const st = f.holdState;
    if (st == null) holdKinds.unknown++; else if (HOLDING.has(st)) holdKinds.holding++; else if (NOT_APPLICABLE.has(st)) holdKinds.na++; else holdKinds.clear++;
  }
  const holdFrames = holdKinds.holding;
  const durationS = frames.length ? (frames.at(-1).t - frames[0].t) / 1000 : 0;
  const tickAt = (pt) => { let best = null; for (const s of samples) { if (s.t > pt + 300) break; best = s; } return best?.tick ?? null; };
  const sampleAt = (pt) => { let best = samples[0] ?? null; for (const s of samples) { if (s.t > pt) break; best = s; } return best; };

  // Memory: the tab (renderer RSS) from the driver where present, else the JS heap the game saw.
  const tab = system.filter((s) => (s.rendererRssMiB ?? s.tabMiB) != null).map((s) => ({ t: s.t, v: s.rendererRssMiB ?? s.tabMiB }));
  const heap = (system.some((s) => s.jsHeapMiB != null) ? system.filter((s) => s.jsHeapMiB != null).map((s) => ({ t: s.t, v: s.jsHeapMiB })) : samples.filter((s) => s.heapMiB != null).map((s) => ({ t: s.t, v: s.heapMiB })));
  const gpuUsed = system.filter((s) => s.gpuUsedMiB != null).map((s) => ({ t: s.t, v: s.gpuUsedMiB }));
  const vram = system.filter((s) => s.browserVramMiB != null).map((s) => ({ t: s.t, v: s.browserVramMiB }));
  const resident = samples.filter((s) => s.residentGpuMiB != null).map((s) => ({ t: s.t, v: s.residentGpuMiB }));
  const trend = (xs) => { const m = slope(xs.map((x) => x.t / 60000), xs.map((x) => x.v)); return m == null ? null : r1(m); };
  const ends = (xs) => (xs.length ? [r1(xs[0].v), r1(xs.at(-1).v)] : null);
  const draws = samples.filter((s) => s.draws != null).map((s) => s.draws).sort((a, b) => a - b);

  // --- the attention list ---------------------------------------------------
  const attention = [];
  const add = (e) => attention.push({ ...e, s: rel(e.t), tick: e.tick ?? tickAt(e.t) });
  const longFrames = events.filter((e) => e.kind === "long-frame");
  for (let i = 0; i < longFrames.length;) {
    let j = i;
    while (j + 1 < longFrames.length && longFrames[j + 1].t - longFrames[j].t < t.groupS * 1000) j++;
    // A group leads with its worst streaming overrun if it has one (that is what fails), else its longest.
    const group = longFrames.slice(i, j + 1), streamingInGroup = group.filter((g) => streamingOver(g, t.longFrameMs));
    const worst = (streamingInGroup.length ? streamingInGroup : group).reduce((a, b) => (longMs(b) > longMs(a) ? b : a));
    add({ kind: "long-frame", t: worst.t, reason: group.length > 1 ? `${group.length} long frames in ${((group.at(-1).t - group[0].t) / 1000).toFixed(1)} s, worst ${worst.text}` : worst.text,
      detail: worst.detail, snap: worst.snap, streaming: group.some((g) => streamingOver(g, t.longFrameMs)) });
    i = j + 1;
  }
  for (const e of events) {
    if (e.kind === "hold" && !/ended/.test(e.text)) add({ kind: "hold", t: e.t, tick: e.tick, reason: e.text, snap: e.snap });
    else if (e.kind === "error") add({ kind: "error", t: e.t, tick: e.tick, reason: e.text, snap: e.snap });
    else if (e.kind === "warning") add({ kind: e.detail?.unsliced ? "unsliced" : "warning", t: e.t, tick: e.tick, reason: e.detail?.unsliced ? `unsliced cave build: ${e.text.replace(/^warning: /, "")}` : e.text, snap: e.snap });
    else if (e.kind === "refusal") add({ kind: "refusal", t: e.t, tick: e.tick, reason: e.text, snap: e.snap });
    else if (e.kind === "milestone") add({ kind: "milestone", t: e.t, tick: e.tick, reason: e.text, snap: e.snap });
    else if (e.kind === "damage") add({ kind: "damage", t: e.t, tick: e.tick, reason: e.text, snap: e.snap });
    else if (e.kind === "note") add({ kind: "note", t: e.t, tick: e.tick, reason: e.text, snap: e.snap });
    else if (e.kind === "save" && e.detail?.ok === false) add({ kind: "error", t: e.t, tick: e.tick, reason: e.text, snap: e.snap });
  }
  // Memory and draw-call jumps between readings.
  const jumps = (xs, what) => {
    for (let i = 1, k = 0; i < xs.length; i++) {
      while (xs[i].t - xs[k].t > t.memoryJumpWindowS * 1000) k++;
      const lo = xs.slice(k, i).reduce((a, b) => (b.v < a.v ? b : a), xs[k]);
      if (xs[i].v - lo.v > t.memoryJumpMiB) { add({ kind: "memory", t: xs[i].t, reason: `${what} rose ${Math.round(xs[i].v - lo.v)} MiB in ${((xs[i].t - lo.t) / 1000).toFixed(0)} s (${Math.round(lo.v)} → ${Math.round(xs[i].v)} MiB)` }); k = i; }
    }
  };
  jumps(tab, "tab memory"); jumps(heap, "JS heap"); jumps(vram.length ? vram : gpuUsed, vram.length ? "this browser's VRAM" : "GPU memory");
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1].draws, b = samples[i].draws;
    if (a != null && b != null && b - a > t.drawJumpMin && b > a * (1 + t.drawJumpRatio)) add({ kind: "draws", t: samples[i].t, tick: samples[i].tick, reason: `draw calls ${a} → ${b}` });
    const ua = samples[i - 1].unsliced, ub = samples[i].unsliced;
    if (ua != null && ub != null && ub > ua) add({ kind: "unsliced", t: samples[i].t, tick: samples[i].tick, reason: `CW-1 unsliced cave build counter ${ua} → ${ub}` });
  }
  attention.sort((a, b) => a.t - b.t);
  // A burst is one entry: memory jumps within 30 s (a region streaming in), damage within 1 s (a hit and its rebound).
  for (const [kind, ms] of [["memory", 30000], ["damage", 1000]]) {
    for (let i = attention.length - 1; i > 0; i--) {
      const a = attention[i], prev = attention.slice(0, i).reverse().find((x) => x.kind === kind);
      if (a.kind !== kind || !prev || a.t - (prev.lastT ?? prev.t) > ms) continue;
      prev.count = (prev.count ?? 1) + (a.count ?? 1);
      prev.lastT = Math.max(a.lastT ?? a.t, prev.lastT ?? prev.t);
      prev.more = [...(prev.more ?? []), a.reason, ...(a.more ?? [])];
      attention.splice(i, 1);
    }
  }
  for (const a of attention) if (a.count > 1) { a.reason = `${a.count} in ${((a.lastT - a.t) / 1000).toFixed(0)} s, first: ${a.reason}; then ${a.more.slice(0, 3).join("; ")}${a.more.length > 3 ? "; …" : ""}`; delete a.more; }
  attention.forEach((a, i) => { a.id = `A${String(i + 1).padStart(2, "0")}`; });

  // --- checks: what was checked, what was missing, what looked wrong --------
  const checks = [];
  const check = (name, status, note) => checks.push({ name, status, note: String(note).replace(/\s*\n\s*/g, " ").slice(0, 240) });
  // R1-F1: a streaming callback over budget, or an interval over budget that a streaming callback owns.
  const streamingLong = longFrames.filter((e) => streamingOver(e, t.longFrameMs));
  const judged = header.run?.judged === true;
  if (!played.length) check("frames recorded", "missing", "no frame rows");
  // Frame times are evidence only from an isolated run; elsewhere they are recorded and flagged, never passed or failed.
  else if (!judged) check("no streaming frame over 33 ms", "unproven", `${streamingLong.length} of ${longFrames.length} long frames were streaming's (recorded; a shared run does not judge frame times)`);
  else check("no streaming frame over 33 ms", streamingLong.length ? "fail" : "pass", `${streamingLong.length} of ${longFrames.length} long frames were streaming's`);
  const holdNote = `${holdKinds.holding} holding, ${holdKinds.clear} clear, ${holdKinds.na} not applicable (no play: menus, opening, interiors), ${holdKinds.unknown} unknown`;
  check("no cave hold", holdKinds.holding ? "fail" : holdKinds.unknown ? "missing" : holdKinds.clear ? "pass" : "missing",
    holdKinds.holding ? holdNote : holdKinds.unknown ? `${holdNote}: not every play frame is known` : holdKinds.clear ? holdNote : "admission never evaluated (no play?)");
  const unslicedN = attention.filter((a) => a.kind === "unsliced").length;
  check("no unsliced cave build", unslicedN ? "fail" : samples.some((s) => s.unsliced != null) ? "pass" : "missing", unslicedN ? `${unslicedN} entries` : "counter read every sample");
  // Errors the page raised that the driver saw but the recorder did not are errors too (R1-F4).
  const errs = events.filter((e) => e.kind === "error"), runErrors = header.run?.pageErrors ?? 0;
  check("no errors", errs.length || runErrors ? "fail" : "pass", errs.length ? errs.slice(0, 2).map((e) => e.text.slice(0, 80)).join("; ")
    : runErrors ? `${runErrors} page errors seen by the driver only (run.json)` : "none recorded");
  // Completeness from explicit facts (R1-F4): what was drained or spooled, what a
  // budget removed, and every picture an event or the index names, against the files.
  const integrity = integrityOf(r, events);
  check("recording complete", integrity.problems.length ? "partial" : integrity.known ? "pass" : "missing",
    integrity.problems.length ? integrity.problems.join("; ") : integrity.known ? integrity.note : "no record of what was drained or spooled");
  const segs = videoSegments(header), v = header.video;
  const video = videoCoverage(segs, facts.videoSeconds, t0, t0 + durationS * 1000);
  check("video", v?.missing || v?.error ? "missing" : !segs.length ? (v ? "missing" : "absent") : video.status, v?.missing ?? v?.error
    ?? (!segs.length ? (v ? "the header names no video with a start" : "off (an exclusive performance run keeps snapshots only)") : video.note));
  check("frame times judged", judged ? "pass" : "unproven", judged ? "exclusive run" : "shared run: frame times are recorded, not performance evidence");
  // Flatness needs enough readings across the window (R1-F5); absent readings never pass.
  const mem = tab.length ? tab : heap, memKind = tab.length ? "renderer RSS" : "JS heap only";
  const span = mem.length ? (mem.at(-1).t - mem[0].t) / 1000 : 0, slopeM = trend(mem);
  const enough = durationS >= 600 && mem.length >= 10 && span >= 0.8 * durationS && slopeM != null;
  check("memory flat", !enough ? "unproven" : slopeM > 5 ? "fail" : "pass",
    !enough ? `not judged: ${durationS < 600 ? "under 10 min" : `${mem.length} readings over ${Math.round(span)} s of ${Math.round(durationS)} s`}` : `${memKind}: ${slopeM} MiB/min over ${Math.round(durationS / 60)} min (${mem.length} readings)`);
  check("tab memory (RSS)", tab.length ? "pass" : "missing", tab.length ? "renderer process RSS" : "the driver read no process memory (in-game export: the browser exposes only the JS heap)");
  check("VRAM", vram.length || gpuUsed.length ? "pass" : "missing", vram.length ? "this browser's own VRAM (nvidia-smi per process); whole-GPU use and the game's estimate of streamed bytes alongside"
    : gpuUsed.length ? `whole-GPU memory in use only (nvidia-smi lists no processes here${header.gpuDevice?.baselineUsedMiB != null ? `; ${header.gpuDevice.baselineUsedMiB} MiB before launch, desktop included` : ""}); the game's own estimate of streamed bytes alongside` : "no GPU memory figure: browsers expose none; only the game's own estimate of streamed bytes");
  const fails = checks.filter((c) => c.status === "fail"), unproven = checks.filter((c) => ["missing", "unproven", "partial"].includes(c.status));
  const verdict = { status: fails.length ? "fail" : unproven.length ? "partial" : "pass", failed: fails.map((c) => c.name), unproven: unproven.map((c) => c.name) };

  // Errors before the window still fail the run (they are the game's, whenever they happen).
  if (before?.errors) {
    const c = checks.find((x) => x.name === "no errors");
    c.status = "fail"; c.note = `${before.errors} during load; ${c.note}`;
    if (!verdict.failed.includes("no errors")) { verdict.failed.push("no errors"); verdict.status = "fail"; verdict.unproven = verdict.unproven.filter((x) => x !== "no errors"); }
  }
  return {
    t0, rel, sampleAt, tickAt, durationS, attention, checks, verdict, before,
    numbers: {
      frames: played.length, gap: { p50: r1(q(gaps, 0.5)), p99: r1(q(gaps, 0.99)), max: r1(gaps.at(-1) ?? null) }, over33: gaps.filter((g) => g > t.longFrameMs).length,
      work: { p50: r1(q(work, 0.5)), p99: r1(q(work, 0.99)) }, rec: { mean: recMs.length ? +(recMs.reduce((a, b) => a + b, 0) / recMs.length).toFixed(3) : null, p99: recMs.length ? +q(recMs, 0.99).toFixed(3) : null },
      dom: domMs.length ? { mean: +(domMs.reduce((a, b) => a + b, 0) / domMs.length).toFixed(3), p99: +q(domMs, 0.99).toFixed(3) } : null,
      gpu: gpuMs.length ? { p50: r1(q(gpuMs, 0.5)), p99: r1(q(gpuMs, 0.99)), frames: gpuMs.length } : null,
      holds: { frames: holdFrames, events: attention.filter((a) => a.kind === "hold").length },
      memory: { tabMiB: ends(tab), heapMiB: ends(heap), vramMiB: ends(vram), gpuUsedMiB: ends(gpuUsed), residentGpuMiB: ends(resident), trendMiBPerMin: trend(tab.length ? tab : heap) },
      errors: errs.length, warnings: events.filter((e) => e.kind === "warning").length, draws: { p50: q(draws, 0.5), max: draws.at(-1) ?? null },
    },
    series: { tab, heap, vram, gpuUsed, resident },
    pacing: pacing({ samples, events }, rel),
    integrity, video,
  };
}

/** A long-frame event's observed time and whether it is a streaming overrun (R1-F1). */
const longMs = (e) => e.detail?.ms ?? e.detail?.gap ?? 0;
export function streamingOver(e, limit) { return e.detail?.cause === "streaming" && longMs(e) > limit; }

/** What the recording says it holds, against what it does hold (R1-F4). */
export function integrityOf(r, events) {
  const problems = [], h = r.header;
  let known = false;
  const lost = h.drained?.lost;
  if (lost) { known = true; for (const [k, n] of Object.entries(lost)) if (n > 0) problems.push(`${n} ${k} lost before the driver read them`); }
  if (h.drained?.snapshotsMissing) problems.push(`${h.drained.snapshotsMissing} pictures missing at drain`);
  if (h.exported || h.retention) known = true;
  for (const l of h.retention?.lost ?? []) problems.push(`${l.file ?? "a recording"} (${Math.round(l.bytes / 1024)} KiB): ${l.why}`);
  const rowsLost = r.events.filter((e) => e.kind === "warning" && /frame rows were lost/.test(e.text));
  if (rowsLost.length) problems.push(rowsLost.map((e) => e.text.replace(/^warning: /, "")).join("; "));
  // Every picture the index names that is not on disk, and every event pointing at a picture not in the index.
  const listed = new Map(r.snapshots.map((s) => [s.seq, s]));
  const absent = r.snapshots.filter((s) => !s.missing && !existsSync(path.join(r.rec, s.file)));
  const declared = r.snapshots.filter((s) => s.missing);
  const dangling = events.filter((e) => e.snap && !listed.has(e.snap));
  if (absent.length) problems.push(`${absent.length} pictures indexed but not in the recording (${absent.slice(0, 3).map((s) => s.file).join(", ")})`);
  if (declared.length) problems.push(`${declared.length} pictures recorded as missing (${[...new Set(declared.map((s) => s.missing))].slice(0, 2).join("; ")})`);
  if (dangling.length) problems.push(`${dangling.length} events name a picture the index lacks`);
  return { known, problems, note: `${r.snapshots.length} pictures indexed, all present; nothing lost` };
}

/** How much of the measured window the video files cover (R1-F4): from their real durations, never the header alone. */
export function videoCoverage(segs, seconds, from, to) {
  if (!segs.length) return { status: "absent", note: "no video", covered: 0 };
  if (!seconds) return { status: "unproven", note: `${segs.length} video file(s) named; their durations were not read`, covered: null };
  let covered = 0;
  const missing = [];
  for (const s of segs) {
    const d = seconds[s.file];
    if (d == null) { missing.push(s.file); continue; }
    const a = Math.max(from, s.start), b = Math.min(to, s.start + d * 1000);
    if (b > a) covered += b - a;
  }
  const share = to > from ? covered / (to - from) : 0;
  if (missing.length) return { status: "missing", note: `${missing.length} of ${segs.length} video files absent or unreadable (${missing.slice(0, 2).join(", ")})`, covered: share };
  return { status: share >= 0.9 ? "pass" : "partial", note: `${segs.length} file(s) cover ${Math.round(share * 100)}% of the measured window`, covered: share };
}

/**
 * Travelling vs doing vs waiting vs menus, the time between milestones and the
 * longest stretch with nothing new per region (R1-F6). Doing is causal: the
 * DOING_S after an action, never before it. Progression is measured on a play
 * clock that only travelling and doing advance (GAME-DIRECTION: idle waiting
 * never counts toward play time or pacing); wall time is kept for the video.
 */
export function pacing(r, rel) {
  const { samples, events } = r;
  const DOING_S = 3;
  const doing = events.filter((e) => e.kind === "action" || e.kind === "milestone" || e.kind === "refusal").map((e) => e.t).sort((a, b) => a - b);
  const holdT = [];
  let holdOpen = null;
  for (const e of events.filter((x) => x.kind === "hold")) { if (/ended/.test(e.text)) { if (holdOpen !== null) holdT.push([holdOpen, e.t]); holdOpen = null; } else holdOpen ??= e.t; }
  const share = { travelling: 0, doing: 0, waiting: 0, menus: 0 };
  const spans = [], clock = [];
  let di = 0, play = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i], dt = i + 1 < samples.length ? Math.min(2000, samples[i + 1].t - s.t) : 250;
    // The latest action at or before this sample, if it was within DOING_S.
    while (di + 1 < doing.length && doing[di + 1] <= s.t) di++;
    const busy = doing.length > 0 && doing[di] <= s.t && s.t - doing[di] <= DOING_S * 1000;
    const held = HOLDING.has(s.hold) || holdT.some(([a, b]) => s.t >= a && s.t <= b);
    const cls = !s.active ? "menus" : held ? "waiting" : busy ? "doing" : s.speed >= 0.5 ? "travelling" : "waiting";
    share[cls] += dt / 1000;
    clock.push({ t: s.t, play });
    if (cls === "travelling" || cls === "doing") play += dt / 1000;
    if (spans.length && spans.at(-1).cls === cls && spans.at(-1).to === s.t) spans.at(-1).to = s.t + dt;
    else spans.push({ cls, from: s.t, to: s.t + dt });
  }
  /** Play seconds at page time pt. */
  const playAt = (pt) => { let p = 0; for (const c of clock) { if (c.t > pt) break; p = c.play; } return p; };
  const milestones = events.filter((e) => e.kind === "milestone").map((e) => ({ s: rel(e.t), play: Math.round(playAt(e.t)), text: e.text, t: e.t }));
  const between = milestones.slice(1).map((m, i) => ({ from: milestones[i].text, to: m.text, s: m.play - milestones[i].play, wall: Math.round(m.s - milestones[i].s) }));
  // Longest stretch of play with nothing new, per region (a "new" milestone resets it; menus and waiting add nothing).
  const regions = {};
  let lastPlay = 0, region = samples[0]?.region ?? null, mi = 0;
  const fresh = events.filter((e) => e.kind === "milestone" && /^new /.test(e.text)).map((e) => e.t);
  for (const [i, s] of samples.entries()) {
    const p = clock[i].play;
    while (mi < fresh.length && fresh[mi] <= s.t) { lastPlay = playAt(fresh[mi++]); }
    if (s.region !== region) { region = s.region; lastPlay = Math.max(lastPlay, p); }
    const k = region ?? "open water", gap = p - lastPlay;
    if (gap > (regions[k]?.s ?? -1)) regions[k] = { s: Math.round(gap), endsAt: rel(s.t) };
  }
  const total = Object.values(share).reduce((a, b) => a + b, 0) || 1;
  return { share: Object.fromEntries(Object.entries(share).map(([k, v]) => [k, { s: Math.round(v), pct: Math.round((v / total) * 100) }])), playSeconds: Math.round(play), milestones, between, regions, spans };
}

/** Tier 0: the one-glance verdict, under 1 KB. */
export function summaryJson(a, header) {
  const n = a.numbers, g = header.gpuDevice ?? {};
  const s = {
    verdict: a.verdict.status, failed: a.verdict.failed, unproven: a.verdict.unproven,
    frame: { ...n.gap, over33: n.over33, frames: n.frames }, work: n.work, rec: n.rec, holds: n.holds.frames,
    memory: { tab: n.memory.tabMiB, heap: n.memory.heapMiB, vram: n.memory.vramMiB ?? n.memory.gpuUsedMiB, trend: n.memory.trendMiBPerMin },
    errors: n.errors, warnings: n.warnings, draws: n.draws, attention: a.attention.length, minutes: r1(a.durationS / 60),
    machine: header.machine?.label ?? null, gpu: g.name ? `${g.name} ${g.driver}` : header.gpu?.renderer?.slice(0, 80) ?? null,
    browser: header.chrome ?? /Chrome\/[\d.]+/.exec(header.browser ?? "")?.[0] ?? null,
    commit: (header.commit ?? header.build?.commit ?? "").slice(0, 12) || null, build: header.build?.bundle ?? null,
  };
  return s;
}
