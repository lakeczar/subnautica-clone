#!/usr/bin/env node
// REC-1: what recording costs. The same stretch of the same route, from the
// same save, under each recording mode, interleaved (ABCD, then DCBA, …) so
// drift cancels; every mode carries the same small rAF probe (run.mjs), so
// frame gaps and the game's own frame work compare like for like.
//
//   $H --class exclusive -- node scripts/rec/overhead.mjs --dist DIST --save SAVE \
//      --plan PLAN --segment N --seconds 120 --rounds 2 --out DIR [run.mjs options]
//   node scripts/rec/overhead.mjs --collect --out DIR RUNDIR...   (the report from
//      run.mjs runs made one per exclusive ticket, in their order: ABBA pairs them)
//
// The report is descriptive: each mode's figures, and against off the paired
// differences round by round with their range and a paired t 95% interval
// (labelled with n and its assumptions). The owner's budget (1% of a 16.67 ms
// frame) is judged apart: met only when that interval's upper end is below it.
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
const out = arg("out"), rounds = Number(arg("rounds", 2)), collect = args.includes("--collect");
if (!out || (!collect && (!arg("dist") || !arg("save")))) { console.error("usage: overhead.mjs --dist DIST --save SAVE --plan PLAN --segment N --seconds S --rounds R --out DIR | --collect --out DIR RUNDIR..."); process.exit(2); }
mkdirSync(out, { recursive: true });
const MODES = { off: ["--rec", "off"], perf: ["--rec", "on", "--video", "off"], screencast: ["--rec", "on", "--video", "on"], playtest: ["--rec", "playtest"] };
const runOf = (dir, round, mode, extra = {}) => {
  const run = JSON.parse(readFileSync(path.join(dir, "run.json"), "utf8"));
  return { round, mode: mode ?? (run.mode === "on" ? (run.video ? "screencast" : "perf") : run.mode), dir, probe: run.probe,
    recorder: run.header?.recorderOverhead ?? run.recorderOverhead ?? null, video: run.header?.video ?? null, errors: run.errors.length, ...extra };
};
const runs = [];
if (collect) {
  // Runs in the order they were made; the k-th off and the k-th of another mode form round k.
  const seen = {};
  for (const dir of args.filter((a) => !a.startsWith("--") && a !== out)) { const x = runOf(dir, 0); x.round = (seen[x.mode] = (seen[x.mode] ?? 0) + 1); runs.push(x); }
} else {
  // --modes off,playtest: a subset; --no-isolate: serve as a static host does (an owner's playtest page is not cross-origin isolated);
  // --hold S: every run holds the save's pose for S measured seconds instead of travelling (the scene identical across modes).
  const order = arg("modes") ? arg("modes").split(",") : ["off", "perf", "screencast", "playtest"];
  const pass = [];
  for (const name of ["plan", "segment", "seconds", "chrome", "pw", "gpu", "machine", "size", "hold"]) if (arg(name) !== undefined) pass.push(`--${name}`, arg(name));
  if (args.includes("--no-isolate")) pass.push("--no-isolate");
  if (args.includes("--owner-browser")) pass.push("--owner-browser");
  const runner = path.join(path.dirname(fileURLToPath(import.meta.url)), "run.mjs");
  for (let r = 0; r < rounds; r++) {
    for (const mode of r % 2 ? [...order].reverse() : order) {
      const dir = path.join(out, `r${r + 1}-${mode}`);
      const t = Date.now();
      const p = spawnSync(process.execPath, [runner, "--dist", arg("dist"), "--save", arg("save"), "--out", dir, ...MODES[mode], ...pass, "--no-pack"], { stdio: "inherit" });
      runs.push(runOf(dir, r + 1, mode, { exit: p.status, seconds: Math.round((Date.now() - t) / 1000) }));
      console.log(`[overhead] round ${r + 1} ${mode}: ${JSON.stringify(runs.at(-1).probe)}`);
    }
  }
}
// Each mode's figures, pooled across its runs.
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const q = (xs, f) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * f))] : null; };
const fix = (v, d = 3) => (v == null ? null : +v.toFixed(d));
const pooled = {};
for (const x of runs) {
  const p = JSON.parse(readFileSync(path.join(x.dir, "probe.json"), "utf8"));
  const m = (pooled[x.mode] ??= { gaps: [], work: [], runs: [] });
  m.gaps.push(...p.gaps); m.work.push(...p.work); m.runs.push(x);
}
const per = (m, f) => m.runs.map(f).filter((v) => v != null);
const stats = Object.fromEntries(Object.entries(pooled).map(([k, m]) => [k, {
  runs: m.runs.length, frames: m.work.length, gapP50: fix(q(m.gaps, 0.5), 2), gapP99: fix(q(m.gaps, 0.99), 2), over33: m.gaps.filter((g) => g > 33.4).length,
  workP50: fix(q(m.work, 0.5)), workP99: fix(q(m.work, 0.99)), workMean: fix(mean(m.work)),
  taskMsPerFrame: fix(mean(per(m, (x) => x.probe?.mainThread?.taskMsPerFrame))), taskMsPerSecond: fix(mean(per(m, (x) => x.probe?.mainThread?.taskMsPerSecond)), 1),
  rendererCpuMsPerS: fix(mean(per(m, (x) => x.probe?.processCpu?.rendererMsPerS)), 1), gpuCpuMsPerS: fix(mean(per(m, (x) => x.probe?.processCpu?.gpuMsPerS)), 1),
  recorderSelfMs: fix(mean(per(m, (x) => x.recorder?.meanMs)), 4),
  recorderParts: m.runs[0]?.recorder?.parts ? Object.fromEntries(Object.keys(m.runs[0].recorder.parts).map((p) => [p, fix(mean(per(m, (x) => x.recorder?.parts?.[p])), 4)])) : null,
}]));
// Against off, round by round: the paired differences, their range, and a paired t interval (R3-5: descriptive, labelled).
const T95 = [NaN, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131];
const BUDGET_MS = 16.667 / 100;
function paired(mode, f) {
  const d = [];
  for (const x of runs.filter((r) => r.mode === mode)) { const o = runs.find((r) => r.mode === "off" && r.round === x.round); const a = f(o), b = f(x); if (a != null && b != null) d.push(b - a); }
  const n = d.length, m = mean(d), sd = n > 1 ? Math.sqrt(d.reduce((a, v) => a + (v - m) ** 2, 0) / (n - 1)) : null;
  const half = n > 1 ? (T95[n - 1] ?? 1.96) * sd / Math.sqrt(n) : null;
  return { n, diffs: d.map((v) => fix(v)), mean: fix(m), min: fix(n ? Math.min(...d) : null), max: fix(n ? Math.max(...d) : null), sd: fix(sd), lo: fix(half == null ? null : m - half), hi: fix(half == null ? null : m + half) };
}
const deltas = Object.fromEntries(Object.keys(stats).filter((k) => k !== "off").map((k) => {
  const frame = paired(k, (x) => x?.probe?.mainThread?.taskMsPerFrame);
  return [k, { mainThreadMsPerFrame: frame, medianWindowMsPerFrame: paired(k, (x) => x?.probe?.windows?.median), mainThreadMsPerSecond: paired(k, (x) => x?.probe?.mainThread?.taskMsPerSecond),
    rendererCpuMsPerS: paired(k, (x) => x?.probe?.processCpu?.rendererMsPerS), gpuCpuMsPerS: paired(k, (x) => x?.probe?.processCpu?.gpuMsPerS),
    workMs: paired(k, (x) => x?.probe?.work?.mean),
    budget: frame.hi == null ? `not established (n = ${frame.n}: an interval needs two pairs)` : frame.hi < BUDGET_MS ? `met: the interval's upper end ${frame.hi} ms is under ${BUDGET_MS.toFixed(3)} ms` : `not shown: the interval's upper end ${frame.hi} ms is not under ${BUDGET_MS.toFixed(3)} ms` }];
}));
const job = process.env.SILTWAKE_JOB_TICKET ?? "none";
writeFileSync(path.join(out, "overhead.json"), JSON.stringify({ job, collect, runs, stats, deltas }, null, 1));
const iv = (x) => `${x.mean ?? "—"} (range ${x.min ?? "—"} to ${x.max ?? "—"}; 95% CI ${x.lo ?? "—"} to ${x.hi ?? "—"}; n = ${x.n})`;
const md = [
  `# Recorder overhead (${collect ? "collected runs" : `${rounds} rounds, interleaved; ticket ${job}`})`, "",
  "| Mode | Runs | Frames | Gap p50 | Gap p99 | Over 33 ms | Work p50 | Work p99 | Work mean | Main thread ms/frame | Main thread ms/s | Renderer CPU ms/s | GPU process CPU ms/s | Recorder self ms/frame |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ...Object.entries(stats).map(([k, s]) => `| ${k} | ${s.runs} | ${s.frames} | ${s.gapP50} | ${s.gapP99} | ${s.over33} | ${s.workP50} | ${s.workP99} | ${s.workMean} | ${s.taskMsPerFrame ?? "—"} | ${s.taskMsPerSecond ?? "—"} | ${s.rendererCpuMsPerS ?? "—"} | ${s.gpuCpuMsPerS ?? "—"} | ${s.recorderSelfMs ?? "—"} |`), "",
  "Against off, paired by round (each run one unit): mean difference, its range, and a paired t 95% interval. Assumes independent pairs with roughly normal differences; with few pairs the interval is wide by design.", "",
  "| Mode | Main thread Δ ms/frame | Median 10 s window Δ ms/frame (holds) | Main thread Δ ms/s | Renderer CPU Δ ms/s | GPU process CPU Δ ms/s | Budget (1% of a frame) |", "| --- | --- | --- | --- | --- | --- | --- |",
  ...Object.entries(deltas).map(([k, x]) => `| ${k} | ${iv(x.mainThreadMsPerFrame)} | ${iv(x.medianWindowMsPerFrame)} | ${iv(x.mainThreadMsPerSecond)} | ${iv(x.rendererCpuMsPerS)} | ${iv(x.gpuCpuMsPerS)} | ${x.budget} |`), "",
  "Budget: judged on the whole window's paired interval. The median 10 s window is a robust figure for a hold (the recorder's work recurs in every window, the game's occasional bursts do not); it is reported, not substituted.", "",
  "Recorder self-time by part (mean ms per frame): " + Object.entries(stats).filter(([, s]) => s.recorderParts).map(([k, s]) => `${k}: ${Object.entries(s.recorderParts).map(([p, v]) => `${p} ${v}`).join(", ")}`).join(" · "), "",
  "Frames: display frames, one per rAF timestamp. Work: that frame's rAF callbacks together (the game's, with the recorder when on, and the soak's tiny frame recorder). Main thread: CDP TaskDuration over the measured window (every task and collection). Renderer and GPU process CPU: user and system time of all their threads (the page's worker and media threads are in the renderer's). Gap: the rAF interval a player sees.",
];
writeFileSync(path.join(out, "overhead.md"), md.join("\n") + "\n");
console.log(md.join("\n"));
