#!/usr/bin/env node
// REC-1 evidence pack: a recording → one directory, tiered so an agent reads
// text first and opens images only where flagged.
//
//   node scripts/rec/pack.mjs DIR                  (DIR/recording/ from a driver run)
//   node scripts/rec/pack.mjs --zip FILE.zip DIR   (an owner playtest's exported recording)
//     [--pw DIR] [--chrome BIN] [--max-strips N]
//
// Tier 0  summary.json        verdict, key numbers, machine (under 1 KB)
// Tier 1  story.md            checks, the attention list (each with its strip), pacing, the event timeline
// Tier 2  strips/*.jpg        frame strips for attention entries, plus 3 random
//         charts/*.png, contact-sheet.jpg
// Tier 3  timeline.html       video + frame time + memory + events, synchronised (for people)
//         recording/          the raw recording, video.webm included
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { analyse, loadRecording, summaryJson, THRESHOLDS, HOLDING } from "./analyse.mjs";
import { composeStrip, composer, extractFrames, remux, renderHtml, dataUrl, esc, ensureDir } from "./imaging.mjs";
import { frameTimeSvg, memorySvg, pacingSvg, fmtTime } from "./charts.mjs";
import { unzip } from "./unzip.mjs";
import { timelineHtml } from "./timeline.mjs";

export const STRIP = { before: 2, after: 2, fps: 12, width: 1280 };

/** Tile geometry for n tiles in a strip about `width` px wide. */
export function grid(n, width = STRIP.width) {
  const cols = n <= 4 ? n : n <= 12 ? 4 : n <= 24 ? 6 : n <= 48 ? 8 : 10;
  const tileW = Math.floor((width - 12 - (cols - 1) * 4) / cols);
  return { cols, tileW, tileH: Math.round((tileW * 9) / 16) };
}

/** Builds one strip around page time `center` (or across [from, to] at `fps`). */
export async function strip(r, a, page, { title, out, center = null, from, to, fps = STRIP.fps }) {
  const v = r.header.video, video = path.join(r.rec, "video.webm");
  const label = (pt) => {
    const s = a.sampleAt(pt), f = nearestFrame(r.frames, pt);
    return [`${((pt - a.t0) / 1000).toFixed(2)}s t${s?.tick ?? "?"}${f && f.gap > THRESHOLDS.longFrameMs ? ` ${f.gap.toFixed(0)}ms` : ""}`,
      `${s ? `${s.depth}m ${s.speed}m/s` : ""} ${s?.hold && s.hold !== "clear" ? s.hold : ""}`.trim()];
  };
  if (v?.file && v.start != null && existsSync(video)) {
    const t0 = from ?? center - STRIP.before * 1000, t1 = to ?? center + STRIP.after * 1000;
    const n = Math.round(((t1 - t0) / 1000) * fps), g = grid(n);
    const x = extractFrames(video, (t0 - v.start) / 1000, (t1 - t0) / 1000, fps, g.tileW * 2, g.tileH * 2);
    try {
      const tiles = x.frames.map((fr) => ({ file: fr.file, pt: v.start + fr.vt * 1000 }));
      if (!tiles.length) return null;
      const mark = center == null ? -1 : tiles.reduce((bi, tl, i) => (Math.abs(tl.pt - center) < Math.abs(tiles[bi].pt - center) ? i : bi), 0);
      await composeStrip(page, { title, cols: g.cols, tileW: g.tileW, tileH: g.tileH, out, tiles: tiles.map((tl, i) => ({ file: tl.file, lines: label(tl.pt), mark: i === mark })) });
      return { source: "video", frames: tiles.length };
    } finally { x.cleanup(); }
  }
  // No video (an exclusive performance run): the snapshots nearest the moment.
  const c = center ?? (from + to) / 2, span = center == null ? (to - from) / 2 : 10000;
  const near = r.snapshots.filter((s) => !s.missing && Math.abs(s.t - c) <= span && existsSync(path.join(r.rec, s.file)))
    .sort((p, q) => Math.abs(p.t - c) - Math.abs(q.t - c)).slice(0, 12).sort((p, q) => p.t - q.t);
  if (!near.length) return null;
  const g = grid(Math.max(4, near.length));
  const best = near.reduce((bi, s, i) => (Math.abs(s.t - c) < Math.abs(near[bi].t - c) ? i : bi), 0);
  await composeStrip(page, { title: `${title} (snapshots: ${v?.file && !v.error ? "the video has no frames here" : "no video in this run"})`, cols: g.cols, tileW: g.tileW, tileH: g.tileH, out,
    tiles: near.map((s, i) => ({ file: path.join(r.rec, s.file), lines: label(s.t), mark: center != null && i === best })) });
  return { source: "snapshots", frames: near.length };
}
function nearestFrame(frames, pt) {
  let lo = 0, hi = frames.length - 1;
  if (hi < 0) return null;
  while (lo < hi) { const m = (lo + hi) >> 1; if (frames[m].t < pt) lo = m + 1; else hi = m; }
  return frames[lo];
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);

/** Deterministic "random" picks (the same pack always samples the same moments). */
function randomMoments(n, a, seed) {
  const out = [];
  let x = seed >>> 0 || 1;
  const rand = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 2 ** 32; };
  const flagged = a.attention.map((e) => e.t);
  for (let tries = 0; out.length < n && tries < 50; tries++) {
    const t = a.t0 + 3000 + rand() * Math.max(0, a.durationS * 1000 - 6000);
    if (flagged.every((f) => Math.abs(f - t) > 5000) && out.every((o) => Math.abs(o - t) > 5000)) out.push(t);
  }
  return out.sort((p, q) => p - q);
}

export async function buildPack(dir, opts = {}) {
  const r = loadRecording(dir), a = analyse(r), h = r.header;
  const S = ensureDir(path.join(dir, "strips")), C = ensureDir(path.join(dir, "charts"));
  // Tier 3 video: a seekable copy (MediaRecorder and piped ffmpeg leave no index).
  const video = path.join(r.rec, "video.webm");
  if (existsSync(video) && remux(video, `${video}.tmp.webm`)) renameSync(`${video}.tmp.webm`, video);
  const c = await composer(opts);
  try {
    // Tier 2: strips for the attention list (up to the cap), then a few random moments.
    const max = opts.maxStrips ?? THRESHOLDS.maxStrips;
    for (const e of a.attention.slice(0, max)) {
      const file = `${e.id}-${e.kind}-${Math.round(e.s)}s.jpg`;
      const made = await strip(r, a, c.page, { title: `${e.id} · ${fmtTime(e.s)} (${e.s.toFixed(1)} s) · tick ${e.tick ?? "?"} · ${e.reason}`, out: path.join(S, file), center: e.t }).catch((err) => ({ error: err.message }));
      e.strip = made && !made.error ? `strips/${file}` : null;
      if (made?.error) e.stripError = made.error;
    }
    a.random = [];
    for (const [i, t] of randomMoments(THRESHOLDS.randomStrips, a, Math.round(a.durationS * 1000) ^ r.frames.length).entries()) {
      const s = (t - a.t0) / 1000, file = `R${i + 1}-random-${Math.round(s)}s.jpg`;
      const made = await strip(r, a, c.page, { title: `R${i + 1} · random sample at ${fmtTime(s)} (${s.toFixed(1)} s): nothing flagged here`, out: path.join(S, file), center: t }).catch(() => null);
      if (made) a.random.push({ id: `R${i + 1}`, s: +s.toFixed(1), tick: a.tickAt(t), strip: `strips/${file}` });
    }
    // Charts.
    const end = a.durationS, holds = holdSpans(r, a);
    await renderHtml(c.page, frameTimeSvg({ frames: r.frames, t0: a.t0, holds, attention: a.attention }), path.join(C, "frame-time.png"));
    const mem = [["tab (renderer RSS)", a.series.tab], ["JS heap", a.series.heap], [a.series.vram.length ? "VRAM (this browser)" : "GPU in use (whole GPU)", a.series.vram.length ? a.series.vram : a.series.gpuUsed], ["streamed world, GPU estimate", a.series.resident]]
      .filter(([, xs]) => xs.length).map(([label, xs]) => ({ label, points: xs.map((p) => ({ s: (p.t - a.t0) / 1000, v: p.v })) }));
    await renderHtml(c.page, memorySvg({ series: mem, end }), path.join(C, "memory.png"));
    await renderHtml(c.page, pacingSvg({ pacing: a.pacing, t0: a.t0, end }), path.join(C, "pacing.png"));
    // Contact sheet: the snapshots (attention moments first), one image.
    await contactSheet(c.page, r, a, path.join(dir, "contact-sheet.jpg"));
  } finally { await c.close(); }

  const summary = summaryJson(a, h);
  writeFileSync(path.join(dir, "summary.json"), JSON.stringify(summary));
  writeFileSync(path.join(dir, "story.md"), storyMd(r, a, summary));
  writeFileSync(path.join(dir, "README.md"), readme(summary));
  writeFileSync(path.join(dir, "timeline.html"), timelineHtml(r, a));
  writeFileSync(path.join(dir, "analysis.json"), JSON.stringify({ attention: a.attention, random: a.random, checks: a.checks, numbers: a.numbers, pacing: { ...a.pacing, spans: undefined } }, null, 1));
  return { verdict: a.verdict, summary, attention: a.attention.length };
}

function holdSpans(r, a) {
  const out = [];
  let open = null;
  for (const f of r.frames) {
    const held = HOLDING.has([null, "clear", "loading", "rescue", "refuge", "waiting", "away", "admitted"][f.hold]);
    if (held && open === null) open = f.t;
    if (!held && open !== null) { out.push([(open - a.t0) / 1000, (f.t - a.t0) / 1000]); open = null; }
  }
  if (open !== null) out.push([(open - a.t0) / 1000, (r.frames.at(-1).t - a.t0) / 1000]);
  return out;
}

async function contactSheet(page, r, a, out) {
  const flagged = new Set(a.attention.map((e) => e.snap).filter(Boolean));
  const avail = r.snapshots.filter((s) => !s.missing && existsSync(path.join(r.rec, s.file)));
  const pick = [...avail.filter((s) => flagged.has(s.seq))];
  const rest = avail.filter((s) => !flagged.has(s.seq)), room = Math.max(0, 48 - pick.length);
  for (let i = 0; i < room && rest.length; i++) pick.push(rest[Math.floor((i * rest.length) / room)]);
  const chosen = [...new Map(pick.slice(0, 48).map((s) => [s.seq, s])).values()].sort((p, q) => p.t - q.t);
  if (!chosen.length) return;
  const byEvent = new Map(r.events.map((e) => [e.seq, e]));
  const g = grid(chosen.length);
  await composeStrip(page, { title: `Contact sheet: ${chosen.length} of ${avail.length} snapshots (flagged first) · ${r.header.machine?.label ?? ""}`, cols: g.cols, tileW: g.tileW, tileH: g.tileH, out,
    tiles: chosen.map((s) => ({ file: path.join(r.rec, s.file), mark: flagged.has(s.seq),
      lines: [`${((s.t - a.t0) / 1000).toFixed(1)}s ${byEvent.get(s.reasons[0])?.kind ?? ""}`, (byEvent.get(s.reasons[0])?.text ?? "").slice(0, 40)] })) });
}

function storyMd(r, a, s) {
  const h = r.header, n = a.numbers, L = [];
  L.push(`# Run story: ${s.verdict.toUpperCase()}`, "");
  L.push(`${h.machine?.label ?? "?"} · ${s.gpu ?? "?"} · ${s.browser ?? "?"} · commit \`${s.commit ?? "?"}\` · build \`${s.build ?? "?"}\` · ${s.minutes} min · ${h.mode ?? ""}${h.run?.segment != null ? ` · segment ${h.run.segment}` : ""}${h.crossOriginIsolated ? " · isolated (5 µs timers)" : ""}`, "");
  L.push(`Frames ${n.frames}: gap p50 ${n.gap.p50} / p99 ${n.gap.p99} / max ${n.gap.max} ms, ${n.over33} over 33 ms. Game's own work p50 ${n.work.p50} / p99 ${n.work.p99} ms. Recorder ${n.rec.mean} ms mean, ${n.rec.p99} ms p99 per frame (self-timed).`);
  if (a.before) L.push(`Before the measured window (load and entry, not judged): ${a.before.frames} frames over ${a.before.seconds} s, ${a.before.over33} over 33 ms, ${a.before.errors} errors.`);
  L.push(`Memory: tab ${fmtPair(n.memory.tabMiB)} MiB, heap ${fmtPair(n.memory.heapMiB)} MiB, ${n.memory.vramMiB ? `VRAM (this browser) ${fmtPair(n.memory.vramMiB)}` : `GPU (whole) ${fmtPair(n.memory.gpuUsedMiB)}`} MiB, trend ${n.memory.trendMiBPerMin ?? "n/a"} MiB/min. Draw calls p50 ${n.draws.p50 ?? "?"}, max ${n.draws.max ?? "?"}. Holds ${n.holds.frames} frames. Errors ${n.errors}, warnings ${n.warnings}.`, "");
  L.push("## Checks", "", "| Check | Result | Note |", "| --- | --- | --- |", ...a.checks.map((c) => `| ${c.name} | ${c.status} | ${c.note.replace(/\|/g, "/")} |`), "");
  L.push(`## Attention (${a.attention.length}${a.attention.length > THRESHOLDS.maxStrips ? `; strips for the first ${THRESHOLDS.maxStrips}` : ""})`, "");
  if (!a.attention.length) L.push("Nothing flagged.");
  for (const e of a.attention) L.push(`- **${e.id}** ${fmtTime(e.s)} (${e.s.toFixed(1)} s) tick ${e.tick ?? "?"} · ${e.kind} · ${e.reason}${e.detail?.cause ? ` · split ${Object.entries(e.detail).filter(([k, v]) => typeof v === "number" && !["gap", "outside"].includes(k)).map(([k, v]) => `${k} ${v}`).join(", ")}, outside ${e.detail.outside}` : ""} → ${e.strip ? `[${e.strip}](${e.strip})` : e.stripError ? `no strip (${e.stripError.slice(0, 60)})` : "no strip"}`);
  L.push("", "Random samples (unflagged moments, to catch visual surprises):", ...(a.random ?? []).map((x) => `- **${x.id}** ${fmtTime(x.s)} tick ${x.tick ?? "?"} → [${x.strip}](${x.strip})`), "");
  const p = a.pacing;
  L.push("## Pacing", "", "| Activity | Time | Share |", "| --- | --- | --- |", ...Object.entries(p.share).map(([k, v]) => `| ${k} | ${fmtTime(v.s)} | ${v.pct}% |`), "");
  L.push("Travelling: moving ≥ 0.5 m/s with no action within 3 s. Doing: a command, gather, craft or milestone within 3 s. Waiting: still, or held by a cave. Menus: paused or in a panel.", "");
  if (p.between.length) L.push("| From | To | Seconds |", "| --- | --- | --- |", ...p.between.slice(0, 40).map((b) => `| ${b.from} | ${b.to} | ${b.s} |`), "");
  L.push("Longest stretch with nothing new, by region:", "", "| Region | Longest (s) | Ends at |", "| --- | --- | --- |",
    ...Object.entries(p.regions).sort((x, y) => y[1].s - x[1].s).map(([k, v]) => `| ${k} | ${v.s} | ${fmtTime(v.endsAt)} |`), "", "Chart: [charts/pacing.png](charts/pacing.png)", "");
  L.push("## Timeline", "");
  const SKIP = new Set(["action", "long-task", "long-frame"]);
  let autosaves = 0, shown = 0, prev = "";
  for (const e of r.events) {
    if (SKIP.has(e.kind)) continue;
    if (e.kind === "save" && e.detail?.ok && !e.detail?.manual) { autosaves++; continue; }
    const line = `${e.kind} · ${e.text}`;
    if (line === prev) continue;
    prev = line;
    if (++shown > 400) continue;
    L.push(`- ${fmtTime((e.t - a.t0) / 1000)}${e.tick != null ? ` t${e.tick}` : ""} ${line.slice(0, 180)}`);
  }
  if (shown > 400) L.push(`- … ${shown - 400} more in recording/events.ndjson`);
  L.push("", `Autosaves that succeeded: ${autosaves}. Long frames: in the attention list. Player actions: counted in pacing (recording/events.ndjson has every one).`);
  return L.join("\n") + "\n";
}
const fmtPair = (p) => (p ? `${p[0]} → ${p[1]}` : "n/a");

function readme(s) {
  return `# Evidence pack (REC-1)

**Verdict: ${s.verdict}.**${s.failed.length ? ` Failed: ${s.failed.join(", ")}.` : ""}${s.unproven.length ? ` Unproven: ${s.unproven.join(", ")}.` : ""}

## Reading order for agents (text first, images only where flagged)
1. \`summary.json\` (under 1 KB): the verdict, key numbers and the machine.
2. \`story.md\`: the checks, the **attention list** (each entry names its strip), the pacing table and the event timeline.
3. Open **only the strips you need** from \`strips/\`: **a budget of about 6–10 strips per review**. Start with failures, holds, errors and streaming long frames; the \`R*\` strips are random unflagged moments.
4. Charts (\`charts/frame-time.png\`, \`charts/memory.png\`, \`charts/pacing.png\`) and \`contact-sheet.jpg\` only if the question needs them.
5. More frames around any moment: \`node scripts/rec/strip.mjs <pack> --event A07\` or \`--at 312.4 [--before 2 --after 2] [--fps 12]\`, \`--from 300 --to 360 --fps 1\` for a minute of travel.

## For people
\`timeline.html\`: the video, frame-time chart, memory curve and event markers, synchronised (open it beside \`recording/video.webm\`).

## Files
- \`recording/\`: the raw recording (header, frames, samples, events, snapshots, system memory, video), the same format from either machine and from an owner playtest export.
- \`analysis.json\`: everything the story is built from.
- Side by side with another pack: \`node scripts/rec/compare.mjs <this> <other> <out>\`.
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), arg = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
  const dir = args.filter((x, i) => !x.startsWith("--") && !args[i - 1]?.startsWith("--")).at(-1);
  if (!dir) { console.error("usage: pack.mjs [--zip FILE] DIR"); process.exit(2); }
  if (arg("zip")) { const rec = path.join(dir, "recording"); if (existsSync(rec)) rmSync(rec, { recursive: true }); mkdirSync(rec, { recursive: true }); unzip(arg("zip"), rec); }
  const s = await buildPack(dir, { pw: arg("pw"), chrome: arg("chrome"), maxStrips: arg("max-strips") ? Number(arg("max-strips")) : undefined });
  console.log(`pack ${s.verdict.status}: ${s.attention} attention entries; ${path.join(dir, "README.md")}`);
}

