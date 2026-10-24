#!/usr/bin/env node
// REC-1: a recorded traversal in the real game on the GPU, written as one
// evidence-pack directory (scripts/rec/pack.mjs builds the pack from the
// recording at the end).
//
//   node scripts/rec/run.mjs --dist DIST --save SAVE --plan PLAN --segment N --out DIR
//     [--rec on|off|playtest] [--video on|off] [--seconds S] [--machine LABEL]
//     [--chrome BIN] [--pw DIR] [--gpu REGEX] [--port N] [--no-isolate] [--no-pack] [--profile S] [--hold S]
//
// --rec on (default): the game records in driver mode (?rec=driver); the video
//   is the CDP screencast (--video on, default) or none (--video off: an
//   exclusive performance run keeps snapshots only).
// --rec off: the recorder is off (?rec=off) and nothing is captured, the
//   baseline for the recorder's overhead.
// --rec playtest: exactly an owner's playtest (?rec=playtest: in-game video,
//   spooled to private storage); nothing is drained, its overhead is read at the end.
// Every mode installs the same small probe before the game loads: each rAF
// gap and the game's frame-callback time, so the modes compare like for like.
//
// GPU: run inside `scripts/heavy-check.sh --class gpu` (functional) or
// `--class exclusive` (frame-time numbers). The browser session is the soak's
// (scripts/soak/browser.mjs), which finds alickers' own Chrome wrapper itself.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Blocked, goto, openGame, releaseAll } from "../soak/browser.mjs";
import { processCpu } from "../soak/probe.mjs";
import { gpuInfo, startRecording } from "./record.mjs";

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const flag = (n) => args.includes(`--${n}`);
const dist = arg("dist"), save = arg("save"), out = arg("out");
if (!dist || !save || !out) { console.error("usage: run.mjs --dist DIST --save SAVE --out DIR [--plan PLAN --segment N] [--rec on|off|playtest] [--video on|off] [--seconds S]"); process.exit(2); }
if (process.env.SILTWAKE_GPU_LEASE === undefined && !flag("software")) {
  const { requireGpuLease } = await import("../heavy/gpu-lease.mjs");
  requireGpuLease("REC-1's recorded run");
}
const mode = arg("rec", "on"), videoOn = mode === "on" && arg("video", "on") === "on", seconds = Number(arg("seconds", 0)) || Infinity;
const plan = arg("plan") ? JSON.parse(readFileSync(arg("plan"), "utf8")) : null;
const segment = Number(arg("segment", 0)), points = plan ? plan.segments?.[segment] ?? plan.points : [];
mkdirSync(out, { recursive: true });
const started = Date.now(), log = (...a) => console.log(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${a.join(" ")}`);
const commit = (() => { try { return readFileSync(path.join(dist, "COMMIT"), "utf8").trim(); } catch { return spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim() || null; } })();
// Frame times are evidence only from an isolated run: an exclusive grant (SCHED-1), or a host running it alone.
const judged = (() => {
  const t = process.env.SILTWAKE_JOB_TICKET;
  if (process.env.SILTWAKE_SOAK_DEDICATED === "1") return true;
  try { return !!t && JSON.parse(readFileSync(path.join(process.env.SILTWAKE_SCHED_DIR || "/work/tmp/siltwake-sched", "jobs", t, "grant.json"), "utf8")).exclusive === true; } catch { return false; }
})();
/** --hold: the scene's settling time before the measured window. */
const HOLD_SETTLE_MS = 20_000;
const machine = arg("machine", hostname() === "factory-worker" ? "RTX 3090 (factory-worker)" : hostname());

// The like-for-like probe (every mode): rAF gaps and the time of the frame's
// rAF callbacks. One display frame runs every callback registered for it with
// the same timestamp (the game's, and the soak's frame recorder that openGame
// installs), so a frame is counted once per timestamp and its callbacks' time
// summed (R2-6: counting callbacks doubled the frames and halved every
// per-frame figure).
function probeScript() {
  const gaps = [], work = [], raf = window.requestAnimationFrame.bind(window);
  let last = 0;
  const probe = { gaps, work, since: performance.now(), reset() { gaps.length = 0; work.length = 0; probe.since = performance.now(); } };
  window.__recProbe = probe;
  window.requestAnimationFrame = (cb) => raf((t) => {
    if (t !== last || !work.length) {
      if (t !== last && last) gaps.push(t - last);
      last = t;
      work.push(0);
    }
    const s = performance.now();
    try { cb(t); } finally { work[work.length - 1] += performance.now() - s; }
  });
}

const gpu0 = gpuInfo();
const query = mode === "off" ? "?rec=off" : mode === "playtest" ? "?rec=playtest" : "?rec=driver";
const result = { mode, video: videoOn, machine, commit, segment, errors: [], reached: [], skipped: [] };
let exit = 0, g = null;
try {
  // The soak's own browser session (scripts/soak/browser.mjs): one driver for both.
  g = await openGame({ dist, save, port: Number(arg("port", 0)), software: flag("software"), gpu: arg("gpu"), chrome: arg("chrome"), pw: arg("pw"),
    label: "rec1", query, isolate: !flag("no-isolate"), initScripts: [probeScript], log });
  result.renderer = g.renderer; result.chrome = g.chrome;
  log("renderer", g.renderer);
  // --hold S: no travel. The diver stays at the save's pose; after the scene
  // settles, S seconds are measured with nothing moving, so the game's own work
  // is the same in every mode and a recorder's cost is not lost in the scene's.
  const holdS = Number(arg("hold", 0));
  if (holdS > 0) { await releaseAll(g); await g.page.waitForTimeout(HOLD_SETTLE_MS); }
  // Measured from here: the travel itself. Main-thread task time over the window
  // (CDP: every task, GC and the recorder's later tasks included) is the inclusive cost (R1-S1).
  await g.page.evaluate(() => window.__recProbe.reset());
  const metrics = async () => Object.fromEntries((await g.cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  const m0 = await metrics();
  // Beyond the main thread: CPU of this browser's renderer (every thread: the spool worker, the encoder) and GPU processes over the same window.
  const cpu0 = processCpu(g.browserPid);
  // Off, and an owner's playtest (it records itself, unread by any driver): nothing drains it.
  const rec = mode === "off" || mode === "playtest" ? null : await startRecording({ page: g.page, cdp: g.cdp, pid: g.browserPid, out, video: videoOn, gpuBaseline: gpu0,
    meta: { machine, commit, chrome: g.chrome, mode, segment, judged, ticket: process.env.SILTWAKE_JOB_TICKET ?? null, save: path.basename(save), plan: arg("plan") ? path.basename(arg("plan")) : null, isolated: !flag("no-isolate") } });
  await rec?.mark(`travel starts (segment ${segment}, ${points.length} points)`);
  const deadline = Date.now() + seconds * 1000;
  // --profile S: where the page's main-thread time goes over the first S seconds of travel (a CDP sampling profile).
  const profileS = Number(arg("profile", 0));
  if (profileS > 0) { await g.cdp.send("Profiler.enable"); await g.cdp.send("Profiler.setSamplingInterval", { interval: 200 }); await g.cdp.send("Profiler.start"); }
  const profileEnd = profileS > 0 ? Date.now() + profileS * 1000 : 0;
  let profiled = false;
  const stopProfile = async () => {
    if (!profileEnd || profiled) return;
    profiled = true;
    const { profile } = await g.cdp.send("Profiler.stop");
    writeFileSync(path.join(out, "profile.json"), JSON.stringify(profileSummary(profile, profileS)));
  };
  if (holdS > 0) { await g.page.waitForTimeout(holdS * 1000); await stopProfile(); }
  for (const [i, pt] of (holdS > 0 ? [] : points).entries()) {
    if (i === 0) continue;
    if (Date.now() > deadline) break;
    if (profileEnd && Date.now() > profileEnd) await stopProfile();
    const label = pt.cave ?? pt.view ?? `point ${i}`;
    let ok = false;
    try { ok = await goto(g, pt, { tol: pt.tol ?? (pt.cave ? 4 : 7), label, boost: !(pt.view || pt.tol), timeoutS: 100, stop: () => Date.now() > deadline }); }
    catch (e) { if (!(e instanceof Blocked)) throw e; log("skipped", e.message); }
    if (Date.now() > deadline && !ok) break;
    if (pt.cave) { (ok ? result.reached : result.skipped).push(pt.cave); await rec?.mark(`${ok ? "at" : "short of"} ${pt.cave}`, { cave: pt.cave }); }
  }
  await releaseAll(g);
  await stopProfile();
  const m1 = await metrics();
  const cpu1 = processCpu(g.browserPid);
  result.travelS = Math.round((Date.now() - started) / 1000);
  const probe = await g.page.evaluate(() => ({ gaps: window.__recProbe.gaps, work: window.__recProbe.work, seconds: (performance.now() - window.__recProbe.since) / 1000 }));
  const q = (xs, f) => { const s = [...xs].sort((a, b) => a - b); return s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * f))].toFixed(2) : null; };
  // Per display frame (one per rAF timestamp) and per measured second, both stated.
  const per = (k) => (probe.work.length ? +(((m1[k] ?? 0) - (m0[k] ?? 0)) * 1000 / probe.work.length).toFixed(3) : null);
  const perSecond = (k) => (probe.seconds > 0 ? +(((m1[k] ?? 0) - (m0[k] ?? 0)) * 1000 / probe.seconds).toFixed(2) : null);
  result.probe = { frames: probe.work.length, seconds: +probe.seconds.toFixed(1), gap: { p50: q(probe.gaps, 0.5), p99: q(probe.gaps, 0.99), max: q(probe.gaps, 1) },
    work: { p50: q(probe.work, 0.5), p99: q(probe.work, 0.99), mean: +(probe.work.reduce((a, b) => a + b, 0) / Math.max(1, probe.work.length)).toFixed(3) },
    over33: probe.gaps.filter((x) => x > 33.4).length,
    // Inclusive main-thread time per frame: all tasks, and the script share of them.
    mainThread: { taskMsPerFrame: per("TaskDuration"), scriptMsPerFrame: per("ScriptDuration"), taskMsPerSecond: perSecond("TaskDuration"),
      heapMiBEnd: m1.JSHeapUsedSize ? +(m1.JSHeapUsedSize / 1048576).toFixed(1) : null },
    // ms of CPU per measured second, all threads: renderer process (page, workers, media), GPU process, the browser's whole tree.
    processCpu: probe.seconds > 0 ? Object.fromEntries(Object.keys(cpu1).map((k) => [`${k}MsPerS`, +(((cpu1[k] - cpu0[k]) * 1000) / probe.seconds).toFixed(1)])) : null };
  writeFileSync(path.join(out, "probe.json"), JSON.stringify({ gaps: probe.gaps.map((x) => +x.toFixed(2)), work: probe.work.map((w) => +w.toFixed(3)), metrics: { start: m0, end: m1 } }));
  if (rec) result.header = await rec.stop({ reached: result.reached, skipped: result.skipped, probe: result.probe, pageErrors: g.errors.length });
  else if (mode === "playtest") result.recorderOverhead = await g.page.evaluate(() => window.__siltwake.recorder?.overhead() ?? null);
  const last = await g.page.evaluate(() => window.__siltwake.read());
  result.end = { tick: last?.tick, feet: last?.feet, region: last?.region };
  result.errors.push(...g.errors);
  log("probe", JSON.stringify(result.probe));
} catch (e) {
  result.errors.push(String(e?.stack ?? e).slice(0, 1000));
  log("error", String(e));
  exit = 1;
} finally {
  await g?.close();
}
writeFileSync(path.join(out, "run.json"), JSON.stringify(result, null, 1));
if (!["off", "playtest"].includes(mode) && !flag("no-pack") && !exit) {
  const { buildPack } = await import("./pack.mjs");
  try { const s = await buildPack(out, { pw: arg("pw"), chrome: arg("chrome") }); log("pack", s.verdict.status, path.join(out, "README.md")); }
  catch (e) { log("pack failed", e.message); exit = 1; }
}
process.exit(exit);

/** A sampling profile as self time per script file and function, ms per second of profile (GC and the browser's own work as their own rows). */
function profileSummary(profile, seconds) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dt = profile.timeDeltas ?? [];
  for (let i = 0; i < profile.samples.length; i++) {
    const n = byId.get(profile.samples[i]), cf = n?.callFrame ?? {};
    const file = (cf.url ?? "").split("/").pop() || "(native)";
    const key = `${file} ${cf.functionName || "(anonymous)"}`;
    self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0) / 1000);
  }
  const wall = ((profile.endTime - profile.startTime) / 1e6) || seconds;
  const rows = [...self.entries()].map(([k, ms]) => ({ fn: k, msPerS: +(ms / wall).toFixed(3) })).sort((a, b) => b.msPerS - a.msPerS);
  const byFile = new Map();
  for (const r of rows) { const f = r.fn.split(" ")[0]; byFile.set(f, +((byFile.get(f) ?? 0) + r.msPerS).toFixed(3)); }
  return { seconds: +wall.toFixed(1), byFile: [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25), top: rows.slice(0, 60) };
}
