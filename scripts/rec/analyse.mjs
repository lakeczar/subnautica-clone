// REC-1 pack analysis: a recording directory → the facts every tier is built
// from (verdict, key numbers, the attention list, pacing, the story). Pure:
// no browser, no ffmpeg; tests/rec1-pack.test.ts runs it on a synthetic recording.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const HOLDING = new Set(["loading", "rescue", "refuge", "waiting"]);
export const HOLD_CODES = [null, "clear", "loading", "rescue", "refuge", "waiting", "away", "admitted"];
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
  const frames = lines(path.join(rec, "frames.ndjson")).map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
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

/** Every number and judgement the pack shows. */
export function analyse(r, t = THRESHOLDS) {
  const { header } = r;
  // A driver run is judged from the moment travel starts (run.pageStart); the
  // load before it is summarised apart. An owner export is judged whole.
  // An owner export has no driver mark: it is judged from entering the expedition (the load screen before it is not play).
  const t0 = header.run?.pageStart ?? r.events.find((e) => e.kind === "load")?.t ?? r.frames[0]?.t ?? r.samples[0]?.t ?? 0;
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
  const holdFrames = frames.filter((f) => HOLDING.has(HOLD_CODES[f.hold])).length;
  const durationS = frames.length ? (frames.at(-1).t - frames[0].t) / 1000 : 0;
  const tickAt = (pt) => { let best = null; for (const s of samples) { if (s.t > pt + 300) break; best = s; } return best?.tick ?? null; };
  const sampleAt = (pt) => { let best = samples[0] ?? null; for (const s of samples) { if (s.t > pt) break; best = s; } return best; };

  // Memory: the tab (renderer RSS) from the driver where present, else the JS heap the game saw.
  const tab = system.filter((s) => s.tabMiB != null).map((s) => ({ t: s.t, v: s.tabMiB }));
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
    const group = longFrames.slice(i, j + 1), worst = group.reduce((a, b) => ((b.detail?.gap ?? 0) > (a.detail?.gap ?? 0) ? b : a));
    add({ kind: "long-frame", t: worst.t, reason: group.length > 1 ? `${group.length} frames over ${t.longFrameMs} ms in ${((group.at(-1).t - group[0].t) / 1000).toFixed(1)} s, worst ${worst.text.replace(/^[\d.]+ ms frame /, `${worst.detail?.gap} ms `)}` : worst.text,
      detail: worst.detail, snap: worst.snap, streaming: group.some((g) => g.detail?.cause === "streaming") });
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
  const streamingLong = longFrames.filter((e) => e.detail?.cause === "streaming" && e.detail.gap > t.longFrameMs);
  const judged = header.run?.judged === true;
  if (!played.length) check("frames recorded", "missing", "no frame rows");
  // Frame times are evidence only from an isolated run; elsewhere they are recorded and flagged, never passed or failed.
  else if (!judged) check("no streaming frame over 33 ms", "unproven", `${streamingLong.length} of ${longFrames.length} long frames were streaming's (recorded; a shared run does not judge frame times)`);
  else check("no streaming frame over 33 ms", streamingLong.length ? "fail" : "pass", `${streamingLong.length} of ${longFrames.length} long frames were streaming's`);
  check("no cave hold", holdFrames ? "fail" : frames.some((f) => f.hold > 0) ? "pass" : "missing", holdFrames ? `${holdFrames} hold frames` : frames.some((f) => f.hold > 0) ? "admission evaluated every play frame" : "admission never evaluated (no play?)");
  const unslicedN = attention.filter((a) => a.kind === "unsliced").length;
  check("no unsliced cave build", unslicedN ? "fail" : samples.some((s) => s.unsliced != null) ? "pass" : "missing", unslicedN ? `${unslicedN} entries` : "counter read every sample");
  const errs = events.filter((e) => e.kind === "error"), runErrors = header.run?.pageErrors ?? 0;
  check("no errors", errs.length ? "fail" : "pass", errs.length ? errs.slice(0, 2).map((e) => e.text.slice(0, 80)).join("; ") : `${runErrors ? `${runErrors} driver-side page errors; ` : ""}none recorded`);
  const lost = header.drained?.lost ?? {};
  check("recording complete", Object.values(lost).some((v) => v > 0) || header.drained?.snapshotsMissing ? "partial" : "pass",
    `lost ${JSON.stringify(lost)}; snapshots missing ${header.drained?.snapshotsMissing ?? 0}`);
  const v = header.video;
  check("video", v?.missing || v?.error ? "missing" : v?.file ? "pass" : "absent", v?.missing ?? v?.error ?? (v?.file ? `${v.source}, ${v.fps} fps, ${v.size?.width}x${v.size?.height}` : "off (an exclusive performance run keeps snapshots only)"));
  check("frame times judged", judged ? "pass" : "unproven", judged ? "exclusive run" : "shared run: frame times are recorded, not performance evidence");
  check("memory flat", durationS < 600 ? "unproven" : (trend(tab.length ? tab : heap) ?? 0) > 5 ? "fail" : "pass", `trend ${trend(tab.length ? tab : heap) ?? "n/a"} MiB/min over ${Math.round(durationS / 60)} min${durationS < 600 ? " (under 10 min: not judged)" : ""}`);
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
  };
}

/** Travelling vs doing vs waiting vs menus, time between milestones, and the longest stretch with nothing new per region. */
export function pacing(r, rel) {
  const { samples, events } = r;
  const DOING_S = 3;
  const doing = events.filter((e) => e.kind === "action" || e.kind === "milestone" || e.kind === "refusal").map((e) => e.t);
  const holdT = [];
  let holdOpen = null;
  for (const e of events.filter((x) => x.kind === "hold")) { if (/ended/.test(e.text)) { if (holdOpen !== null) holdT.push([holdOpen, e.t]); holdOpen = null; } else holdOpen ??= e.t; }
  const share = { travelling: 0, doing: 0, waiting: 0, menus: 0 };
  const spans = [];
  let di = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i], dt = i + 1 < samples.length ? Math.min(2000, samples[i + 1].t - s.t) : 250;
    while (di < doing.length && doing[di] < s.t - DOING_S * 1000) di++;
    const busy = di < doing.length && Math.abs(doing[di] - s.t) <= DOING_S * 1000;
    const held = HOLDING.has(s.hold) || holdT.some(([a, b]) => s.t >= a && s.t <= b);
    const cls = !s.active ? "menus" : held ? "waiting" : busy ? "doing" : s.speed >= 0.5 ? "travelling" : "waiting";
    share[cls] += dt / 1000;
    if (spans.length && spans.at(-1).cls === cls && spans.at(-1).to === s.t) spans.at(-1).to = s.t + dt;
    else spans.push({ cls, from: s.t, to: s.t + dt });
  }
  const milestones = events.filter((e) => e.kind === "milestone").map((e) => ({ s: rel(e.t), text: e.text, t: e.t }));
  const between = milestones.slice(1).map((m, i) => ({ from: milestones[i].text, to: m.text, s: Math.round(m.s - milestones[i].s) }));
  // Longest stretch with nothing new, per region (region entries reset nothing; a "new" milestone does).
  const regions = {};
  let last = samples[0]?.t ?? 0, region = samples[0]?.region ?? null, mi = 0;
  const fresh = events.filter((e) => e.kind === "milestone" && /^new /.test(e.text)).map((e) => e.t);
  for (const s of samples) {
    while (mi < fresh.length && fresh[mi] <= s.t) { last = fresh[mi++]; }
    if (s.region !== region) { region = s.region; last = Math.max(last, s.t); }
    const k = region ?? "open water", gap = (s.t - last) / 1000;
    if (s.active && gap > (regions[k]?.s ?? -1)) regions[k] = { s: Math.round(gap), endsAt: rel(s.t) };
  }
  const total = Object.values(share).reduce((a, b) => a + b, 0) || 1;
  return { share: Object.fromEntries(Object.entries(share).map(([k, v]) => [k, { s: Math.round(v), pct: Math.round((v / total) * 100) }])), milestones, between, regions, spans };
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
