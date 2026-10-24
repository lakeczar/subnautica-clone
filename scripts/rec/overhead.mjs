#!/usr/bin/env node
// REC-1: what recording costs. The same stretch of the same route, from the
// same save, under each recording mode, interleaved (ABCD, then DCBA, …) so
// drift cancels; every mode carries the same small rAF probe (run.mjs), so
// frame gaps and the game's own frame work compare like for like.
//
//   $H --class exclusive -- node scripts/rec/overhead.mjs --dist DIST --save SAVE \
//      --plan PLAN --segment N --seconds 120 --rounds 2 --out DIR [run.mjs options]
//
// Modes: off (?rec=off, nothing captured) · perf (recorder on, snapshots, no
// video: an exclusive performance run) · screencast (recorder on + the CDP
// screencast video: functional runs and soaks) · playtest (exactly an owner's
// playtest: spool and the in-game WebCodecs video).
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2), arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const out = arg("out"), rounds = Number(arg("rounds", 2));
if (!out || !arg("dist") || !arg("save")) { console.error("usage: overhead.mjs --dist DIST --save SAVE --plan PLAN --segment N --seconds S --rounds R --out DIR"); process.exit(2); }
mkdirSync(out, { recursive: true });
const MODES = { off: ["--rec", "off"], perf: ["--rec", "on", "--video", "off"], screencast: ["--rec", "on", "--video", "on"], playtest: ["--rec", "playtest"] };
// --modes off,playtest: a subset; --no-isolate: serve as a static host does (an owner's playtest page is not cross-origin isolated);
// --hold S: every run holds the save's pose for S measured seconds instead of travelling (the scene identical across modes).
const order = arg("modes") ? arg("modes").split(",") : ["off", "perf", "screencast", "playtest"];
const pass = [];
for (const name of ["plan", "segment", "seconds", "chrome", "pw", "gpu", "machine", "size", "hold"]) if (arg(name) !== undefined) pass.push(`--${name}`, arg(name));
if (args.includes("--no-isolate")) pass.push("--no-isolate");
const runner = path.join(path.dirname(fileURLToPath(import.meta.url)), "run.mjs");
const runs = [];
for (let r = 0; r < rounds; r++) {
  for (const mode of r % 2 ? [...order].reverse() : order) {
    const dir = path.join(out, `r${r + 1}-${mode}`);
    const t = Date.now();
    const p = spawnSync(process.execPath, [runner, "--dist", arg("dist"), "--save", arg("save"), "--out", dir, ...MODES[mode], ...pass, "--no-pack"], { stdio: "inherit" });
    const run = JSON.parse(readFileSync(path.join(dir, "run.json"), "utf8"));
    runs.push({ round: r + 1, mode, dir, exit: p.status, seconds: Math.round((Date.now() - t) / 1000), probe: run.probe, recorder: run.header?.recorderOverhead ?? run.recorderOverhead ?? null, video: run.header?.video ?? null, errors: run.errors.length });
    console.log(`[overhead] round ${r + 1} ${mode}: ${JSON.stringify(run.probe)}`);
  }
}
// Pool each mode's raw probe samples across rounds, then compare with off.
const pooled = {};
for (const x of runs) {
  const p = JSON.parse(readFileSync(path.join(x.dir, "probe.json"), "utf8"));
  const m = (pooled[x.mode] ??= { gaps: [], work: [], recMean: [] });
  m.gaps.push(...p.gaps); m.work.push(...p.work);
  if (x.probe?.mainThread?.taskMsPerFrame != null) (m.task ??= []).push(x.probe.mainThread.taskMsPerFrame);
  if (x.probe?.mainThread?.taskMsPerSecond != null) (m.taskSec ??= []).push(x.probe.mainThread.taskMsPerSecond);
  if (x.probe?.work?.mean != null) (m.workRuns ??= []).push(x.probe.work.mean);
  if (x.recorder) { m.recMean.push(x.recorder.meanMs); for (const [k, v] of Object.entries(x.recorder.parts ?? {})) (m.parts ??= {})[k] = [...(m.parts?.[k] ?? []), v]; }
}
const q = (xs, f) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * f))] : null; };
const stats = Object.fromEntries(Object.entries(pooled).map(([k, m]) => [k, {
  frames: m.work.length, gapP50: +q(m.gaps, 0.5).toFixed(2), gapP99: +q(m.gaps, 0.99).toFixed(2), over33: m.gaps.filter((g) => g > 33.4).length,
  workP50: +q(m.work, 0.5).toFixed(3), workP99: +q(m.work, 0.99).toFixed(3), workMean: +(m.work.reduce((a, b) => a + b, 0) / m.work.length).toFixed(3),
  recorderSelfMs: m.recMean.length ? +(m.recMean.reduce((a, b) => a + b, 0) / m.recMean.length).toFixed(4) : null,
  // Inclusive (R1-S1): main-thread task time per frame over the window, every task and GC included; its spread across rounds.
  taskMsPerFrame: m.task?.length ? +(m.task.reduce((a, b) => a + b, 0) / m.task.length).toFixed(3) : null,
  taskSpread: m.task?.length > 1 ? +(Math.max(...m.task) - Math.min(...m.task)).toFixed(3) : null,
  taskMsPerSecond: m.taskSec?.length ? +(m.taskSec.reduce((a, b) => a + b, 0) / m.taskSec.length).toFixed(1) : null,
  taskSecSpread: m.taskSec?.length > 1 ? +(Math.max(...m.taskSec) - Math.min(...m.taskSec)).toFixed(1) : null,
  workSpread: m.workRuns?.length > 1 ? +(Math.max(...m.workRuns) - Math.min(...m.workRuns)).toFixed(3) : null,
  recorderParts: m.parts ? Object.fromEntries(Object.entries(m.parts).map(([p, xs]) => [p, +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(4)])) : null,
}]));
const base = stats.off, d = (a, b) => (a == null || b == null ? null : +(a - b).toFixed(3));
const deltas = Object.fromEntries(Object.entries(stats).filter(([k]) => k !== "off").map(([k, s]) => [k, {
  gapP50: d(s.gapP50, base?.gapP50), gapP99: d(s.gapP99, base?.gapP99), workP50: d(s.workP50, base?.workP50), workP99: d(s.workP99, base?.workP99),
  workMean: d(s.workMean, base?.workMean), pctOfFrame: base ? +((100 * (s.workMean - base.workMean)) / 16.667).toFixed(2) : null,
  taskMsPerFrame: d(s.taskMsPerFrame, base?.taskMsPerFrame),
  taskMsPerSecond: d(s.taskMsPerSecond, base?.taskMsPerSecond),
  // Conclusive only when the inclusive difference is larger than either mode's own round-to-round spread.
  inclusive: s.taskMsPerFrame == null || base?.taskMsPerFrame == null ? "not measured"
    : Math.abs(s.taskMsPerFrame - base.taskMsPerFrame) > Math.max(s.taskSpread ?? 0, base.taskSpread ?? 0) ? "conclusive" : "inside the noise",
}]));
const job = process.env.SILTWAKE_JOB_TICKET ?? "none";
writeFileSync(path.join(out, "overhead.json"), JSON.stringify({ job, rounds, runs, stats, deltas }, null, 1));
const md = [
  `# Recorder overhead (${rounds} rounds, interleaved; ticket ${job})`, "",
  "| Mode | Frames | Gap p50 | Gap p99 | Over 33 ms | Work p50 | Work p99 | Work mean (spread) | Main thread ms/frame (spread) | Main thread ms/s (spread) | Recorder self (mean/frame) |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ...Object.entries(stats).map(([k, s]) => `| ${k} | ${s.frames} | ${s.gapP50} | ${s.gapP99} | ${s.over33} | ${s.workP50} | ${s.workP99} | ${s.workMean} (${s.workSpread ?? "—"}) | ${s.taskMsPerFrame ?? "—"} (${s.taskSpread ?? "—"}) | ${s.taskMsPerSecond ?? "—"} (${s.taskSecSpread ?? "—"}) | ${s.recorderSelfMs ?? "—"} |`), "",
  "Deltas against off (ms; % of a 16.67 ms frame from the mean work). Main thread: every task on the page's main thread over the window (CDP TaskDuration), GC and the recorder's later tasks included: the inclusive cost, judged against the rounds' own spread:", "",
  "| Mode | Gap p50 | Gap p99 | Work p50 | Work p99 | Work mean | % of frame | Main thread Δ ms/frame | Main thread Δ ms/s | Inclusive |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ...Object.entries(deltas).map(([k, x]) => `| ${k} | ${x.gapP50} | ${x.gapP99} | ${x.workP50} | ${x.workP99} | ${x.workMean} | ${x.pctOfFrame} | ${x.taskMsPerFrame ?? "—"} | ${x.taskMsPerSecond ?? "—"} | ${x.inclusive} |`), "",
  "Recorder self-time by part (mean ms per frame): " + Object.entries(stats).filter(([, s]) => s.recorderParts).map(([k, s]) => `${k}: ${Object.entries(s.recorderParts).map(([p, v]) => `${p} ${v}`).join(", ")}`).join(" · "), "",
  "Frames: display frames, one per rAF timestamp. Work: that frame's rAF callbacks together (the game's: simulation, streaming, render, HUD and the recorder when on; and the soak's tiny frame recorder), timed by the same wrapper in every mode. Main thread: CDP TaskDuration over the measured window, divided by those frames, and per measured second. Gap: the rAF interval a player sees.",
];
writeFileSync(path.join(out, "overhead.md"), md.join("\n") + "\n");
console.log(md.join("\n"));
