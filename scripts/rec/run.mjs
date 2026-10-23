#!/usr/bin/env node
// REC-1: a recorded traversal in the real game on the GPU, written as one
// evidence-pack directory (scripts/rec/pack.mjs builds the pack from the
// recording at the end).
//
//   node scripts/rec/run.mjs --dist DIST --save SAVE --plan PLAN --segment N --out DIR
//     [--rec on|off|game-video] [--video on|off] [--seconds S] [--machine LABEL]
//     [--chrome BIN] [--pw DIR] [--gpu REGEX] [--port N] [--no-isolate] [--no-pack]
//     [--size 1280x720]
//
// --rec on (default): the game records in driver mode (?rec=driver); the video
//   is the CDP screencast (--video on, default) or none (--video off: an
//   exclusive performance run keeps snapshots only).
// --rec off: the recorder is off (?rec=off) and nothing is captured, the
//   baseline for the recorder's overhead.
// --rec game-video: driver mode plus the in-game MediaRecorder video.
// --rec playtest: exactly an owner's playtest (?rec=playtest: in-game video,
//   spooled to private storage); nothing is drained, its overhead is read at the end.
// Every mode installs the same small probe before the game loads: each rAF
// gap and the game's frame-callback time, so the modes compare like for like.
//
// GPU: run inside `scripts/heavy-check.sh --class gpu` (functional) or
// `--class exclusive` (frame-time numbers). On alickers: --chrome
// /usr/local/bin/siltwake-chrome --pw /work/tmp/pw/ --gpu "RTX 4070".
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { launch, openGame, pilot, read, serve } from "./browser.mjs";
import { gpuInfo, startRecording } from "./record.mjs";

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const flag = (n) => args.includes(`--${n}`);
const dist = arg("dist"), save = arg("save"), out = arg("out");
if (!dist || !save || !out) { console.error("usage: run.mjs --dist DIST --save SAVE --out DIR [--plan PLAN --segment N] [--rec on|off|game-video] [--video on|off] [--seconds S]"); process.exit(2); }
if (process.env.SILTWAKE_GPU_LEASE === undefined && !flag("software")) {
  const { requireGpuLease } = await import("../heavy/gpu-lease.mjs");
  requireGpuLease("REC-1's recorded run");
}
const mode = arg("rec", "on"), videoOn = mode === "on" && arg("video", "on") === "on", seconds = Number(arg("seconds", 0)) || Infinity;
const [width, height] = arg("size", "1280x720").split("x").map(Number);
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
const machine = arg("machine", hostname() === "factory-worker" ? "RTX 3090 (factory-worker)" : hostname());

// The like-for-like probe (every mode): rAF gaps and the game's callback time.
function probeScript() {
  const gaps = [], work = [], raf = window.requestAnimationFrame.bind(window);
  let last = 0;
  window.__recProbe = { gaps, work };
  window.requestAnimationFrame = (cb) => raf((t) => {
    if (last) gaps.push(t - last);
    last = t;
    const s = performance.now();
    try { cb(t); } finally { work.push(performance.now() - s); }
  });
}

const gpu0 = gpuInfo();
const server = await serve(dist, Number(arg("port", 0)), { isolate: !flag("no-isolate") });
const b = await launch({ chrome: arg("chrome"), pw: arg("pw"), label: "rec1", width, height, software: flag("software") });
const result = { mode, video: videoOn, machine, commit, chrome: b.version, segment, errors: [], reached: [], skipped: [] };
let exit = 0;
try {
  b.page.on("pageerror", (e) => result.errors.push(e.message.slice(0, 300)));
  b.page.on("response", (r) => { if (r.status() >= 400) result.errors.push(`HTTP ${r.status()} ${r.url().slice(0, 200)}`); });
  await b.page.addInitScript(probeScript);
  const query = mode === "off" ? "?rec=off" : mode === "game-video" ? "?rec=driver&recvideo=1" : mode === "playtest" ? "?rec=playtest" : "?rec=driver";
  const open = await openGame(b.page, `http://127.0.0.1:${server.port}/${query}`, save, { gpu: arg("gpu") });
  Object.assign(result, open);
  log("renderer", open.renderer, "playable in", open.playableMs, "ms");
  await b.cdp.send("Performance.enable");
  // Measured from here: the travel itself.
  await b.page.evaluate(() => { window.__recProbe.gaps.length = 0; window.__recProbe.work.length = 0; });
  // Off, and an owner's playtest (it records itself, unread by any driver): nothing drains it.
  const rec = mode === "off" || mode === "playtest" ? null : await startRecording({ page: b.page, cdp: b.cdp, pid: b.pid, out, video: videoOn, gpuBaseline: gpu0,
    meta: { machine, commit, chrome: b.version, mode, segment, judged, ticket: process.env.SILTWAKE_JOB_TICKET ?? null, save: path.basename(save), plan: arg("plan") ? path.basename(arg("plan")) : null, isolated: !flag("no-isolate") } });
  await rec?.mark(`travel starts (segment ${segment}, ${points.length} points)`);
  const p = pilot(b.page), deadline = Date.now() + seconds * 1000;
  for (const [i, pt] of points.entries()) {
    if (i === 0) continue;
    if (Date.now() > deadline) break;
    const label = pt.cave ?? pt.view ?? `point ${i}`;
    const ok = await p.goto(pt, { tol: pt.tol ?? (pt.cave ? 4 : 7), label, boost: !(pt.view || pt.tol), stop: () => Date.now() > deadline });
    if (Date.now() > deadline && !ok) break;
    if (pt.cave) { (ok ? result.reached : result.skipped).push(pt.cave); await rec?.mark(`${ok ? "at" : "short of"} ${pt.cave}`, { cave: pt.cave }); }
    if (!ok) log("skipped", label);
  }
  await p.releaseAll();
  result.travelS = Math.round((Date.now() - started) / 1000);
  const probe = await b.page.evaluate(() => window.__recProbe);
  const q = (xs, f) => { const s = [...xs].sort((a, b) => a - b); return s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * f))].toFixed(2) : null; };
  result.probe = { frames: probe.gaps.length, gap: { p50: q(probe.gaps, 0.5), p99: q(probe.gaps, 0.99), max: q(probe.gaps, 1) },
    work: { p50: q(probe.work, 0.5), p99: q(probe.work, 0.99), mean: +(probe.work.reduce((a, b) => a + b, 0) / Math.max(1, probe.work.length)).toFixed(3) },
    over33: probe.gaps.filter((g) => g > 33.4).length };
  writeFileSync(path.join(out, "probe.json"), JSON.stringify({ gaps: probe.gaps.map((g) => +g.toFixed(2)), work: probe.work.map((w) => +w.toFixed(3)) }));
  if (rec) result.header = await rec.stop({ reached: result.reached, skipped: result.skipped, probe: result.probe, pageErrors: result.errors.length });
  else if (mode === "playtest") result.recorderOverhead = await b.page.evaluate(() => window.__siltwake.recorder?.overhead() ?? null);
  const last = await read(b.page);
  result.end = { tick: last?.tick, feet: last?.feet, region: last?.region };
  log("probe", JSON.stringify(result.probe));
} catch (e) {
  result.errors.push(String(e?.stack ?? e).slice(0, 1000));
  log("error", String(e));
  exit = 1;
} finally {
  await b.close();
  await server.close();
}
writeFileSync(path.join(out, "run.json"), JSON.stringify(result, null, 1));
if (!["off", "playtest"].includes(mode) && !flag("no-pack") && !exit) {
  const { buildPack } = await import("./pack.mjs");
  try { const s = await buildPack(out, { pw: arg("pw"), chrome: arg("chrome") }); log("pack", s.verdict.status, path.join(out, "README.md")); }
  catch (e) { log("pack failed", e.message); exit = 1; }
}
process.exit(exit);
