// CW-1 acceptance on the RTX 3090: a fast Dart traversal of every region and
// every cave mouth, one segment per job (each under 30 minutes). Task-owned
// headless Chrome (ANGLE GL-EGL), the built game served from `dist`, the
// segment's derived save imported through the menu, then ordinary keys only:
// W, Shift (boost), arrows, Space and C, closed loop on the HUD bearing and
// pitch and the canvas camera position (C3's driver).
// Measured: cold start (navigation to playable), every rAF gap, every frame's
// own work (`__siltwakePerf`: simulation, chunk streaming, cave streaming,
// render), cave holds, streaming counters, resident bytes and JS heap.
// Gate (STR-10, STR-11): during the travel itself no unsliced cave build (the
// safety net, logged by the game as "unsliced cave build"), no hold frame and
// no long frame attributed to streaming; the job exits 1 when it fails.
// usage (frame times are performance evidence, so the exclusive class):
//   $H --class exclusive -- node traverse.mjs <dist> <plan.json> <save.json> <segment> <outdir> <port>
// Another GPU (the second worker's RTX 4070): CW1_CHROME (a browser wrapper
// that sets its own GPU flags), CW1_PW (where playwright-core is installed),
// CW1_GPU (the renderer it must report, a regex) and CW1_LABEL (how its
// frame times are labelled).
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, readdirSync, existsSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { requireGpuLease } from "../../../../scripts/heavy/gpu-lease.mjs";
requireGpuLease("CW-1 traversal");
const require = createRequire(process.env.CW1_PW ?? "/work/tmp/gpu-prep/pw/");
const CHROME = process.env.CW1_CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
const GPU = new RegExp(process.env.CW1_GPU ?? "RTX 3090");
const { chromium } = require("playwright-core");
const [dist, planFile, saveFile, segArg, out, port] = process.argv.slice(2);
const segment = Number(segArg), plan = JSON.parse(readFileSync(planFile, "utf8")), points = plan.segments[segment];
mkdirSync(out, { recursive: true });
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".bin": "application/octet-stream" };
const root = path.resolve(dist);
const server = createServer((req, res) => {
  const rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const file = path.resolve(root, "." + (rel.endsWith("/") ? rel + "index.html" : rel));
  if (!file.startsWith(root + path.sep) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(Number(port), "127.0.0.1", r));
const log = [];
const note = (...a) => { const line = `[${(performance.now() / 1000).toFixed(1)}s] ${a.join(" ")}`; log.push(line); console.log(line); };
const result = { commit: readFileSync(path.join(dist, "COMMIT"), "utf8").trim(), label: process.env.CW1_LABEL ?? "RTX 3090 (factory-worker)", segment, caves: points.filter(p => p.cave).map(p => p.cave),
  reached: [], skipped: [], shots: [], views: [], errors: [], holds: [], long: [], unsliced: [], recoveries: 0 };
let traveling = false;
// Playwright's default SwiftShader fallback flag is refused by a GPU wrapper (and must not apply on the GPU).
// Collections on the main thread, from a Chrome trace of V8's GC events
// (aligned to performance.now by a user-timing mark), so every long frame is
// checked against the pauses that ran in it.
let gcTrace = [];
const browser = await chromium.launch({ executablePath: CHROME, headless: true, timeout: 30000,
  ...(process.env.CW1_CHROME ? { ignoreDefaultArgs: ["--enable-unsafe-swiftshader"] } : {}),
  args: [...(process.env.CW1_CHROME ? [] : ["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist"]), "--enable-precise-memory-info", "--cw1-traverse"] });
let page;
const held = new Set();
const key = async (k, on) => { if (on && !held.has(k)) { held.add(k); await page.keyboard.down(k); } else if (!on && held.has(k)) { held.delete(k); await page.keyboard.up(k); } };
const releaseAll = async () => { for (const k of [...held]) await key(k, false); };
const wrap = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
let eye = 0;
async function read() {
  return page.evaluate(() => {
    const c = document.querySelector("#ocean").dataset, q = (s) => document.querySelector(s);
    const pitch = Number(/(-?\d+)/.exec(q("#pitch-cue")?.getAttribute("aria-label") ?? "Pitch 0")?.[1] ?? 0);
    return { cam: (c.cameraPosition ?? "0,0,0").split(",").map(Number), bearing: parseFloat(q("#bearing")?.textContent ?? "0"), pitch,
      depth: parseFloat(q("#depth")?.textContent ?? "0"), cave: c.cave ?? "", hold: c.caveHold ?? "", vitals: q("#vitals")?.innerText.replace(/\s+/g, " ") ?? "" };
  });
}
const pos = (s) => ({ x: s.cam[0], y: s.cam[1] - eye, z: s.cam[2] });
/** Closed-loop piloting to a point with the ordinary keys; false when it gives up (logged, the tour goes on). */
async function goto(t, { tol = 4, label = "", boost = true, timeout = 100 } = {}) {
  const start = performance.now(); let best = Infinity, bestAt = start, recoveries = 0;
  for (;;) {
    const s = await read();
    if (s.hold && s.hold !== "clear") result.holds.push({ t: +(performance.now() / 1000).toFixed(1), hold: s.hold, label });
    const p = pos(s), dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z, h = Math.hypot(dx, dz), d3 = Math.hypot(h, dy);
    if (d3 <= tol) { await releaseAll(); return true; }
    if (d3 < best - 0.3) { best = d3; bestAt = performance.now(); }
    if (performance.now() - bestAt > 5000 && recoveries < 3) {
      recoveries++; result.recoveries++; note("recover", label, `${d3.toFixed(1)} m short`);
      await releaseAll(); await key("KeyS", true); await key("Space", true); await page.waitForTimeout(1200); await releaseAll();
      bestAt = performance.now(); best = Infinity; continue;
    }
    if (performance.now() - bestAt > 10000 || performance.now() - start > timeout * 1000) {
      await releaseAll(); note("skip", label, `${d3.toFixed(1)} m short at ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`); return false;
    }
    const yaw = s.bearing * Math.PI / 180, want = h > 1.5 ? Math.atan2(dx, -dz) : yaw, err = wrap(want - yaw);
    await key("ArrowRight", err > 0.04); await key("ArrowLeft", err < -0.04);
    await key("ArrowUp", s.pitch < -2); await key("ArrowDown", s.pitch > 2);
    await key("KeyW", Math.abs(err) < (h > 12 ? 0.5 : 0.3) && h > tol * 0.5);
    await key("ShiftLeft", boost && h > 25 && Math.abs(err) < 0.3);
    await key("Space", dy > 1); await key("KeyC", dy < -1);
    await page.waitForTimeout(40);
  }
}
/** Turn in place to face `t` (bearing and pitch from the camera), then let it settle. */
async function face(t) {
  const start = performance.now();
  for (;;) {
    const s = await read(), c = { x: s.cam[0], y: s.cam[1], z: s.cam[2] }, dx = t.x - c.x, dz = t.z - c.z;
    const yawErr = wrap(Math.atan2(dx, -dz) - s.bearing * Math.PI / 180), pitch = Math.atan2(t.y - c.y, Math.hypot(dx, dz)) * 180 / Math.PI;
    const done = Math.abs(yawErr) < 0.02 && Math.abs(s.pitch - pitch) < 1.5;
    if (done || performance.now() - start > 12000) { await releaseAll(); await page.waitForTimeout(1500); return done; }
    await key("ArrowRight", yawErr > 0.02); await key("ArrowLeft", yawErr < -0.02);
    await key("ArrowUp", s.pitch < pitch - 1.5); await key("ArrowDown", s.pitch > pitch + 1.5);
    await page.waitForTimeout(30);
  }
}
/** Rise to the surface cap (craft -0.9 m, swimmer -0.5 m) and hold it, so the eye is above water. */
async function rise() {
  const start = performance.now();
  await key("Space", true);
  for (let s = await read(); s.cam[1] < 0.02 && performance.now() - start < 6000; s = await read()) await page.waitForTimeout(50);
  await page.waitForTimeout(600);
}
async function shot(name) {
  const file = path.join(out, `s${segment}-${String(result.shots.length + 1).padStart(2, "0")}-${name}.jpg`);
  await page.screenshot({ path: file, type: "jpeg", quality: 82 }); result.shots.push(path.basename(file)); note("screenshot", file);
}
/** The renderer's main thread, from the kernel (Linux): every 5 ms its time
 * on a CPU, time runnable but waiting for one, and page faults, so a long
 * frame can be told apart: our own work (on CPU), preemption (waiting), or a
 * blocked thread (neither: IPC, a lock, I/O). */
const sched = { pid: null, samples: [] };
function findRenderer() {
  const procs = readdirSync("/proc").filter(d => /^\d+$/.test(d)).map(pid => {
    try { return { pid, cmd: readFileSync(`/proc/${pid}/cmdline`, "utf8"), stat: readFileSync(`/proc/${pid}/stat`, "utf8") }; } catch { return null; }
  }).filter(Boolean);
  const root = procs.find(p => p.cmd.includes("--cw1-traverse") && !p.cmd.includes("--type="));
  if (!root) return null;
  const parent = (p) => p.stat.slice(p.stat.lastIndexOf(")") + 2).split(" ")[1];
  const ours = new Set([root.pid]);
  for (let grew = true; grew;) { grew = false; for (const p of procs) if (!ours.has(p.pid) && ours.has(parent(p))) { ours.add(p.pid); grew = true; } }
  const cpu = (p) => { const f = p.stat.slice(p.stat.lastIndexOf(")") + 2).split(" "); return +f[11] + +f[12]; };
  return procs.filter(p => ours.has(p.pid) && p.cmd.includes("--type=renderer") && !p.cmd.includes("extension")).sort((a, b) => cpu(b) - cpu(a))[0]?.pid ?? null;
}
function sampleSched() {
  if (!sched.pid) return;
  try {
    const [run, wait] = readFileSync(`/proc/${sched.pid}/task/${sched.pid}/schedstat`, "utf8").split(" ").map(Number);
    const f = readFileSync(`/proc/${sched.pid}/task/${sched.pid}/stat`, "utf8"), rest = f.slice(f.lastIndexOf(")") + 2).split(" ");
    sched.samples.push([performance.timeOrigin + performance.now(), run / 1e6, wait / 1e6, +rest[7], +rest[9], rest[0]]);
  } catch { sched.pid = null; }
}
const quant = (s, f) => s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * f))].toFixed(1) : null;
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  page.on("pageerror", (e) => result.errors.push(e.message));
  page.on("response", (r) => { if (r.status() >= 400) result.errors.push(`HTTP ${r.status()} ${r.url()}`); });
  page.on("console", (m) => {
    if (m.type() === "error") result.errors.push(m.text().slice(0, 300));
    if (m.type() === "warning" && m.text().startsWith("unsliced cave build")) { result.unsliced.push({ traveling, text: m.text() }); note(traveling ? "UNSLICED" : "unsliced (load)", m.text()); }
  });
  await page.addInitScript(() => {
    window.__siltwakePerf = []; window.__gaps = [];
    // Each gap with the JS heap at its end: a heap that shrank across a long gap was collected in it (GC).
    // Long gaps also keep where the camera was.
    let last = 0; const loop = (now) => {
      if (last) window.__gaps.push([now, now - last, performance.memory?.usedJSHeapSize ?? 0, now - last > 33.4 ? document.querySelector("#ocean")?.dataset.cameraPosition ?? null : null]);
      last = now; requestAnimationFrame(loop);
    }; requestAnimationFrame(loop);
  });
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load", timeout: 60000 });
  result.renderer = await page.evaluate(() => { const g = document.createElement("canvas").getContext("webgl2"); const e = g.getExtension("WEBGL_debug_renderer_info"); return g.getParameter(e.UNMASKED_RENDERER_WEBGL); });
  note("renderer", result.renderer);
  if (!GPU.test(result.renderer)) throw new Error(`not the expected GPU (${GPU.source}): ${result.renderer}`);
  await page.waitForFunction(() => document.querySelector("#ocean")?.dataset.graphics === "available", null, { timeout: 60000 });
  await page.locator("#new-game").waitFor({ state: "visible", timeout: 60000 });
  const title = Date.now() - t0;
  await page.locator("#import-file").setInputFiles(saveFile);
  await page.waitForTimeout(300);
  if (await page.locator("#confirmation").isVisible().catch(() => false)) await page.locator("#confirm-accept").click();
  await page.waitForFunction(() => !document.querySelector("#hud")?.hidden && document.querySelector("#ocean").dataset.ready === "true", null, { timeout: 120000 });
  const playable = Date.now() - t0;
  const records = await page.evaluate(() => JSON.parse(document.querySelector("#ocean").dataset.caveStream ?? "{}"));
  result.coldStart = { titleMs: title, playableMs: playable, collisionPackMs: records.recordsMs, records: records.records };
  note("cold start", JSON.stringify(result.coldStart));
  await page.locator("#ocean").click();
  await page.waitForTimeout(1000);
  let s = await read(); eye = s.cam[1] + s.depth;
  note("loaded", JSON.stringify({ cam: s.cam, depth: s.depth, vitals: s.vitals }));
  // Measured from here: the traversal itself.
  await browser.startTracing(page, { categories: ["disabled-by-default-v8.gc", "v8", "blink.user_timing"], screenshots: false });
  sched.pid = findRenderer();
  note("renderer main thread", sched.pid ?? "not found");
  const sampler = setInterval(sampleSched, 5);
  const markAt = await page.evaluate(() => { window.__siltwakePerf.length = 0; window.__gaps.length = 0; performance.mark("cw1-align"); return performance.now(); });
  const started = performance.now(), syncAtStart = records.sync ?? 0;
  traveling = true;
  let caveIndex = 0;
  for (const [i, p] of points.entries()) {
    if (i === 0) continue;
    const ok = await goto(p, { tol: p.tol ?? (p.cave ? 4 : 7), label: p.cave ?? p.view ?? `cruise#${i}`, boost: !(p.view || p.tol) });
    if (p.view) {
      if (p.surface) await rise();
      const faced = await face(p.look);
      if (p.surface) await rise();
      const s1 = await read(), far = await page.evaluate(() => Number(document.querySelector("#ocean").dataset.farLandmarks ?? -1));
      const c = { x: s1.cam[0], y: s1.cam[1], z: s1.cam[2] };
      await shot(p.view);
      await releaseAll();
      result.views.push({ aboveWater: s1.cam[1] >= 0, view: p.view, shot: result.shots.at(-1), reached: ok, faced, camera: s1.cam.map(v => +v.toFixed(1)), bearing: s1.bearing, pitch: s1.pitch,
        metresToTarget: +Math.hypot(p.look.x - c.x, p.look.y - c.y, p.look.z - c.z).toFixed(0), activeCaveLight: s1.cave || null, farLandmarksShown: far });
      note("view", JSON.stringify(result.views.at(-1)));
    }
    if (p.cave) {
      const q = pos(await read());
      if (ok) result.reached.push(p.cave); else result.skipped.push({ cave: p.cave, metres: +Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z).toFixed(1) });
      s = await read();
      note(ok ? "at" : "near", p.cave, "active light", s.cave || "-", "depth", s.depth);
      if (caveIndex++ % 4 === 0) await shot(p.cave);
    }
  }
  clearInterval(sampler);
  result.seconds = +((performance.now() - started) / 1000).toFixed(1);
  traveling = false;
  {
    const trace = JSON.parse((await browser.stopTracing()).toString()), events = trace.traceEvents ?? trace;
    const mark = events.find(e => e.name === "cw1-align");
    // Top-level main-thread pauses: V8's MajorGC / MinorGC (and their finalizations).
    const top = events.filter(e => e.ph === "X" && /^(MajorGC|MinorGC|V8\.GCFinalizeMC|V8\.GCScavenger|V8\.GCCompactor|V8\.GCIncrementalMarkingFinalize|V8\.GC_MC_.*ATOMIC.*|V8\.GCMinorMS)$/.test(e.name) && e.dur > 0);
    if (mark) gcTrace = top.map(e => ({ at: markAt + (e.ts - mark.ts) / 1000, kind: e.name, pauseMs: +(e.dur / 1000).toFixed(2), tid: e.tid }));
    result.gcTraceAligned = !!mark;
    result.gcTraceNames = [...new Set(events.filter(e => /GC/.test(e.name ?? "")).map(e => e.name))].slice(0, 40);
  }
  const data = await page.evaluate(() => ({ origin: performance.timeOrigin, gaps: window.__gaps, perf: window.__siltwakePerf, stream: JSON.parse(document.querySelector("#ocean").dataset.caveStream ?? "{}"),
    cpu: Number(document.querySelector("#ocean").dataset.residentCpu ?? 0), gpu: Number(document.querySelector("#ocean").dataset.residentGpu ?? 0),
    regionBytes: Number(document.querySelector("#ocean").dataset.regionBytes ?? 0),
    heap: performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize } : null }));
  const gaps = data.gaps.map(([, g]) => g).sort((a, b) => a - b);
  result.frames = { count: gaps.length, p50: quant(gaps, 0.5), p95: quant(gaps, 0.95), p99: quant(gaps, 0.99), max: gaps.length ? +gaps.at(-1).toFixed(1) : null,
    over33: gaps.filter(g => g > 33.4).length, over50: gaps.filter(g => g > 50).length };
  const work = data.perf.map(e => e.total).sort((a, b) => a - b);
  result.work = { p50: quant(work, 0.5), p95: quant(work, 0.95), p99: quant(work, 0.99), max: work.length ? +work.at(-1).toFixed(1) : null,
    over33: work.filter(w => w > 33.4).length };
  // Every long gap with the work of the frame that ran in it.
  for (const [i, [at, g, heap, camera]] of data.gaps.entries()) if (g > 33.4) {
    const e = data.perf.find(x => x.at >= at - g - 1 && x.at <= at + 1) ?? null;
    const freed = i > 0 && heap && data.gaps[i - 1][2] ? data.gaps[i - 1][2] - heap : 0;
    // Collections whose trace line arrived during the gap (or within 30 ms after it).
    const gcs = gcTrace.filter(x => x.at + x.pauseMs > at - g && x.at < at);
    // The main thread over the gap (epoch ms): on CPU, waiting to run, faults.
    const t1 = data.origin + at, t0 = t1 - g, first = sched.samples.findLast?.(x => x[0] <= t0) ?? null, last = sched.samples.find(x => x[0] >= t1) ?? null;
    const thread = first && last ? { spanMs: +(last[0] - first[0]).toFixed(1), onCpuMs: +(last[1] - first[1]).toFixed(1), waitingMs: +(last[2] - first[2]).toFixed(1),
      minorFaults: last[3] - first[3], majorFaults: last[4] - first[4] } : null;
    result.long.push({ at: +at.toFixed(0), gap: +g.toFixed(1), camera, thread, gcPauseMs: +gcs.reduce((n, x) => n + x.pauseMs, 0).toFixed(1), gcs: gcs.map(x => `${x.kind} ${x.pauseMs} ms`), heapFreedMiB: +(freed / 1048576).toFixed(1), gc: freed > 2 * 1048576, frame: e ? { total: +e.total.toFixed(1), sim: +e.sim.toFixed(1), steps: e.steps, present: +e.present.toFixed(1), parts: e.parts, hold: e.hold } : null });
  }
  // Attribution: a long frame is streaming's when the streaming work in it
  // (chunk residency, cave streaming, region activation, the lights' scan of
  // new meshes) is at least half of the frame's own work and the work alone
  // overran a vsync. Other long gaps are simulation, rendering, GC or the
  // browser, reported but not streaming's.
  const streamingOf = (f) => (f?.parts ? (f.parts.chunks ?? 0) + (f.parts.caves ?? 0) + (f.parts.regions ?? 0) + (f.parts.lights ?? 0) : 0);
  for (const l of result.long) if (l.frame) l.streaming = l.frame.total > 16.7 && streamingOf(l.frame) >= 0.5 * l.frame.total;
  result.longByCause = {
    over34: result.long.filter(l => l.gap > 34).length,
    streaming: result.long.filter(l => l.streaming).length,
    streamingOver34: result.long.filter(l => l.streaming && l.gap > 34).length,
    simulation: result.long.filter(l => l.frame && !l.streaming && l.frame.sim >= 0.5 * l.frame.total && l.frame.total > 16.7).length,
    noWork: result.long.filter(l => !l.frame || l.frame.total <= 16.7).length,
    // Long gaps in which the heap shrank by over 2 MiB: a collection ran in them (whatever part it landed in).
    gcShaped: result.long.filter(l => l.gc || l.gcPauseMs >= 0.4 * l.gap).length,
    streamingGcShaped: result.long.filter(l => l.streaming && (l.gc || l.gcPauseMs >= 0.4 * l.gap) && l.gap > 34).length,
  };
  result.streamingMax = data.perf.reduce((m, e) => ({ chunks: Math.max(m.chunks, e.parts?.chunks ?? 0), caves: Math.max(m.caves, e.parts?.caves ?? 0) }), { chunks: 0, caves: 0 });
  result.holdFrames = data.perf.filter(e => e.hold && e.hold !== "clear").length;
  result.stream = data.stream;
  result.thread = { pid: sched.pid, samples: sched.samples.length };
  result.gc = { collections: gcTrace.length, byKind: gcTrace.reduce((m, x) => ({ ...m, [x.kind]: (m[x.kind] ?? 0) + 1 }), {}),
    maxPauseMs: Math.max(0, ...gcTrace.map(x => x.pauseMs)), over16: gcTrace.filter(x => x.pauseMs > 16).map(x => `${x.kind} ${x.pauseMs} ms at ${x.at.toFixed(0)}`) };
  // The gate: the travel's own unsliced builds (the counter, and the logged
  // warnings that say where), holds and streaming-attributed long frames.
  const travelSync = (data.stream.sync ?? 0) - syncAtStart;
  const failures = [];
  if (travelSync > 0 || result.unsliced.some(u => u.traveling)) failures.push(`${Math.max(travelSync, result.unsliced.filter(u => u.traveling).length)} unsliced cave build(s) in travel`);
  if (result.holdFrames > 0) failures.push(`${result.holdFrames} hold frame(s)`);
  if (result.longByCause.streamingOver34 > 0) failures.push(`${result.longByCause.streamingOver34} streaming frame(s) over 34 ms`);
  result.gate = { pass: failures.length === 0, failures, travelSync, loadSync: syncAtStart };
  result.memory = { residentCpuMiB: +(data.cpu / 1048576).toFixed(1), residentGpuMiB: +(data.gpu / 1048576).toFixed(1), regionMiB: +(data.regionBytes / 1048576).toFixed(1),
    budgetMiB: 256, heapMiB: data.heap ? +(data.heap.used / 1048576).toFixed(1) : null };
  note("gate", result.gate.pass ? "pass" : `FAIL: ${result.gate.failures.join("; ")}`);
  note("result", JSON.stringify({ frames: result.frames, longByCause: result.longByCause, work: result.work, holds: result.holdFrames, memory: result.memory, stream: result.stream }));
} catch (error) {
  result.errors.push(String(error?.stack ?? error)); note("error", String(error));
  result.gate ??= { pass: false, failures: ["the run did not finish"] };
} finally {
  writeFileSync(path.join(out, `segment-${segment}.json`), JSON.stringify(result, null, 1));
  writeFileSync(path.join(out, `segment-${segment}.log`), log.join("\n"));
  await browser.close().catch(() => {});
  server.close();
  process.exitCode = result.gate?.pass ? 0 : 1;
}
