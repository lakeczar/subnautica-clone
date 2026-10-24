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
// no long frame attributed to streaming, and no frame inside a cave whose
// light was not ready; the job exits 1 when it fails.
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
import { streamTrace } from "./stream-trace.mjs";
requireGpuLease("CW-1 traversal");
const require = createRequire(process.env.CW1_PW ?? "/work/tmp/gpu-prep/pw/");
const CHROME = process.env.CW1_CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
const GPU = new RegExp(process.env.CW1_GPU ?? "RTX 3090");
const { chromium } = require("playwright-core");
const [dist, planFile, saveFile, segArg, out, port] = process.argv.slice(2);
const segment = Number(segArg), plan = JSON.parse(readFileSync(planFile, "utf8")), points = plan.segments[segment];
// Boost unless the power plan says this segment must cruise.
const SEGMENT_BOOST = plan.power?.segments?.[segment]?.cruise !== true;
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
  reached: [], skipped: [], shots: [], views: [], errors: [], holds: [], long: [], unsliced: [], recoveries: 0, power: [], stalls: [] };
// The power plan (derive.mjs): when to swap a reserve cell in; boost or cruise.
const POWER = plan.power ?? null;
let cellsLeft = POWER?.cells?.filter(c => c > 0).length ?? 0;
let traveling = false;
// Playwright's default SwiftShader fallback flag is refused by a GPU wrapper (and must not apply on the GPU).
// Collections on the main thread, from a Chrome trace of V8's GC events
// (aligned to performance.now by a user-timing mark), so every long frame is
// checked against the pauses that ran in it.
let gcTrace = [];
// The trace is streamed (stream-trace.mjs) and only what the analysis reads is kept: names, the
// alignment mark, GC pauses and, with CW1_TRACE=1 (toplevel, gpu, devtools.timeline), every
// complete slice over 4 ms, so each long gap lists what the renderer and GPU process did in it.
const traced = { threads: new Map(), processes: new Map(), mark: null, gc: [], slices: [], gcNames: new Set() };
const GC_SLICE = /^(MajorGC|MinorGC|V8\.GCFinalizeMC|V8\.GCScavenger|V8\.GCCompactor|V8\.GCIncrementalMarkingFinalize|V8\.GC_MC_.*ATOMIC.*|V8\.GCMinorMS)$/;
function keepTraced(e) {
  if (e.ph === "M" && e.name === "thread_name") traced.threads.set(`${e.pid}:${e.tid}`, e.args?.name);
  else if (e.ph === "M" && e.name === "process_name") traced.processes.set(e.pid, e.args?.name);
  if (e.name === "cw1-align" && !traced.mark) traced.mark = { ts: e.ts, pid: e.pid, tid: e.tid };
  if (traced.gcNames.size < 40 && /GC/.test(e.name ?? "")) traced.gcNames.add(e.name);
  if (e.ph !== "X") return;
  if (GC_SLICE.test(e.name) && e.dur > 0) traced.gc.push({ ts: e.ts, dur: e.dur, name: e.name, tid: e.tid });
  if (process.env.CW1_TRACE && e.dur > 4000) traced.slices.push({ ts: e.ts, dur: e.dur, name: e.name, cat: e.cat, pid: e.pid, tid: e.tid, args: JSON.stringify(e.args ?? {}).slice(0, 160) });
}
let trace = null;
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
      depth: parseFloat(q("#depth")?.textContent ?? "0"), cave: c.cave ?? "", hold: c.caveHold ?? "", vitals: q("#vitals")?.innerText.replace(/\s+/g, " ") ?? "", air: q("#vitals")?.dataset.airSource ?? "",
      notices: [q("#system-status"), q("#notification")].filter(e => e && !e.hidden).map(e => e.textContent.trim()).join(" | ") };
  });
}
const pos = (s) => ({ x: s.cam[0], y: s.cam[1] - eye, z: s.cam[2] });
/** The piloted craft's battery from the HUD ("… 63% power"), or null on foot. */
const charge = (s) => { const m = /(\d+)% power/.exec(s.vitals); return m ? Number(m[1]) : null; };
const where = (s) => s.cam.map(v => v.toFixed(0)).join(",");
/** Open the inventory (Tab), press the named craft button, close it (Escape)
 * and take the controls back: ordinary input for servicing and reserve cells. */
async function panelAction(name, why) {
  await releaseAll();
  const before = await read();
  await page.keyboard.press("Tab");
  const button = page.getByRole("button", { name }).first();
  const pressed = await button.waitFor({ state: "visible", timeout: 4000 }).then(() => button.isEnabled()).catch(() => false);
  if (pressed) await button.click();
  await page.waitForTimeout(400);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.locator("#ocean").click();
  await page.waitForTimeout(500);
  const after = await read();
  const entry = { t: +(performance.now() / 1000).toFixed(1), action: String(name), why, pressed, at: where(after), before: before.vitals, after: after.vitals };
  result.power.push(entry);
  note("power", JSON.stringify(entry));
  return pressed;
}
// Every hold state change and HUD notice, logged as it happens (a relocation must say why).
// The craft's state (air source, O₂, health, charge, hull) every 15 s too, so a stall can be read from it.
let lastHold = "clear", lastNotice = "", lastVitals = -Infinity;
const watch = (s) => {
  if (performance.now() - lastVitals > 15000) { lastVitals = performance.now(); note("vitals", `[${s.air}]`, s.vitals, "at", s.cam.map(v => v.toFixed(0)).join(","), "depth", s.depth); }
  if ((s.hold || "clear") !== lastHold) { note("hold", lastHold, "->", s.hold || "clear", "at", s.cam.map(v => v.toFixed(0)).join(","), s.vitals); lastHold = s.hold || "clear"; }
  if (s.notices && s.notices !== lastNotice) { note("notice", JSON.stringify(s.notices.slice(0, 200)), "at", s.cam.map(v => v.toFixed(0)).join(",")); lastNotice = s.notices; }
};
/** Closed-loop piloting to a point with the ordinary keys; false when it gives up (logged, the tour goes on). */
/** Closed-loop piloting to `t`. Depth follows the planned leg from `from`:
 * the depth the line has reached at the craft's horizontal progress (the
 * line the planner checked for keel clearance), not the endpoint's depth,
 * so a descending leg over a rising floor never dives into it. */
async function goto(t, { tol = 4, label = "", boost = true, timeout = 100, from = null } = {}) {
  const start = performance.now(); let best = Infinity, bestAt = start, recoveries = 0;
  for (;;) {
    const s = await read();
    watch(s);
    if (s.hold && s.hold !== "clear") result.holds.push({ t: +(performance.now() / 1000).toFixed(1), hold: s.hold, label });
    const p = pos(s), dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z, h = Math.hypot(dx, dz), d3 = Math.hypot(h, dy);
    if (d3 <= tol) { await releaseAll(); return true; }
    if (d3 < best - 0.3) { best = d3; bestAt = performance.now(); }
    // Emergency power: a reserve cell before the battery runs out (the craft then supplies air again).
    const c = charge(s);
    if (POWER && c !== null && c < POWER.swapBelow && cellsLeft > 0) { cellsLeft--; await panelAction("Use reserve cell for hull power", `battery ${c}%`); bestAt = performance.now(); continue; }
    if (performance.now() - bestAt > 5000 && recoveries < 3) {
      recoveries++; result.recoveries++;
      // Everything the driver saw at the stall: where, which way, what it held, the craft's state.
      const yaw = s.bearing * Math.PI / 180, want = Math.atan2(dx, -dz);
      const stall = { t: +(performance.now() / 1000).toFixed(1), label, short: +d3.toFixed(1), at: where(s), target: [t.x, t.y, t.z].map(v => +v.toFixed(1)), bearing: s.bearing, pitch: s.pitch,
        headingErr: +wrap(want - yaw).toFixed(2), keys: [...held], hold: s.hold, cave: s.cave, air: s.air, vitals: s.vitals, notices: s.notices };
      result.stalls.push(stall);
      note("recover", JSON.stringify(stall));
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
    await key("ShiftLeft", boost && SEGMENT_BOOST && h > 25 && Math.abs(err) < 0.3);
    let wantY = t.y;
    if (from) {
      const total = Math.hypot(t.x - from.x, t.z - from.z), left = Math.min(total, h);
      wantY = total > 1 ? t.y + (from.y - t.y) * (left / total) : t.y;
    }
    const dyLine = wantY - p.y;
    await key("Space", dyLine > 1); await key("KeyC", dyLine < -1);
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
// Samples as typed-array columns (a 30-minute run takes about 360k of them;
// arrays of arrays had pushed runs past their memory reservation).
// Each vCPU's steal (jiffies, /proc/stat) and the CPU the thread last ran on:
// a long frame inside a host pause of the VM is the host's, not the game's.
const NCPU = (readFileSync("/proc/stat", "utf8").match(/^cpu\d+ /gm) ?? []).length;
const COLS = 9 + NCPU; // time, run, wait, minor, major, gpu run, gpu wait, renderer cpu, gpu cpu, steal per vCPU
const STEAL = 9; // first steal column
const sched = { pid: null, gpu: null, n: 0, data: new Float64Array(COLS * 65536) };
const sample = (i) => sched.data.subarray(i * COLS, i * COLS + COLS);
/** The index of the last sample at or before `t` (or the first at or after, `after`), or -1. */
const indexAt = (t, after) => {
  let lo = 0, hi = sched.n - 1;
  if (hi < 0) return -1;
  while (lo < hi) { const mid = (lo + hi + (after ? 0 : 1)) >> 1; if (after ? sched.data[mid * COLS] < t : sched.data[mid * COLS] > t) { if (after) lo = mid + 1; else hi = mid - 1; } else if (after) hi = mid; else lo = mid; }
  const v = sched.data[lo * COLS];
  return (after ? v >= t : v <= t) ? lo : -1;
};
const sampleAt = (t, after) => { const i = indexAt(t, after); return i < 0 ? null : sample(i); };
/** Time stolen from the frame between samples `a` and `b`: per interval, the
 * steal on the vCPU the renderer's main thread was on, or on the GPU process
 * main thread's vCPU, whichever is larger (overlapping time counted once). ms. */
const stolenBetween = (a, b) => {
  let ms = 0;
  for (let i = a; i < b; i++) {
    const r = sched.data[i * COLS + 7], g = sched.data[i * COLS + 8];
    const dr = sched.data[(i + 1) * COLS + STEAL + r] - sched.data[i * COLS + STEAL + r];
    const dg = g >= 0 ? sched.data[(i + 1) * COLS + STEAL + g] - sched.data[i * COLS + STEAL + g] : 0;
    ms += Math.max(dr, dg) * 10;
  }
  return ms;
};
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
  sched.gpu = procs.find(p => ours.has(p.pid) && p.cmd.includes("--type=gpu-process"))?.pid ?? null;
  return procs.filter(p => ours.has(p.pid) && p.cmd.includes("--type=renderer") && !p.cmd.includes("extension")).sort((a, b) => cpu(b) - cpu(a))[0]?.pid ?? null;
}
function sampleSched() {
  if (!sched.pid) return;
  try {
    const [run, wait] = readFileSync(`/proc/${sched.pid}/task/${sched.pid}/schedstat`, "utf8").split(" ").map(Number);
    const f = readFileSync(`/proc/${sched.pid}/task/${sched.pid}/stat`, "utf8"), rest = f.slice(f.lastIndexOf(")") + 2).split(" ");
    // The GPU process's main thread too: busy while the renderer is blocked means the renderer waits on it.
    const g = sched.gpu ? readFileSync(`/proc/${sched.gpu}/task/${sched.gpu}/schedstat`, "utf8").split(" ").map(Number) : [0, 0];
    const gs = sched.gpu ? readFileSync(`/proc/${sched.gpu}/task/${sched.gpu}/stat`, "utf8") : null, gcpu = gs ? +gs.slice(gs.lastIndexOf(")") + 2).split(" ")[36] : -1;
    if ((sched.n + 1) * COLS > sched.data.length) { const grown = new Float64Array(sched.data.length * 2); grown.set(sched.data); sched.data = grown; }
    const steal = readFileSync("/proc/stat", "utf8").split("\n").filter(l => /^cpu\d+ /.test(l)).map(l => +l.split(/\s+/)[8]);
    sched.data.set([performance.timeOrigin + performance.now(), run / 1e6, wait / 1e6, +rest[7], +rest[9], g[0] / 1e6, g[1] / 1e6, +rest[36], gcpu, ...steal], sched.n * COLS);
    sched.n++;
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
  const records = await page.evaluate(() => (document.querySelector("#ocean").siltwakeCaveStream?.() ?? {}));
  result.coldStart = { titleMs: title, playableMs: playable, collisionPackMs: records.recordsMs, records: records.records };
  note("cold start", JSON.stringify(result.coldStart));
  await page.locator("#ocean").click();
  await page.waitForTimeout(1000);
  let s = await read(); eye = s.cam[1] + s.depth;
  note("loaded", JSON.stringify({ cam: s.cam, depth: s.depth, vitals: s.vitals }));
  // Measured from here: the traversal itself.
  trace = await streamTrace(await browser.newBrowserCDPSession(),
    ["disabled-by-default-v8.gc", "v8", "blink.user_timing", ...(process.env.CW1_TRACE ? ["toplevel", "gpu", "disabled-by-default-devtools.timeline"] : [])],
    keepTraced, { onError: (error) => note("trace rotation failed", String(error)) });
  // CW1_PROFILE=1 (diagnosis): a sampled CPU profile of the page over the travel.
  const cdp = process.env.CW1_PROFILE ? await page.context().newCDPSession(page) : null;
  let profileStartPage = null;
  if (cdp) {
    await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
    // The profile's clock is aligned to the page's at its start (within a round trip).
    const before = await page.evaluate(() => performance.now());
    await cdp.send("Profiler.start");
    profileStartPage = (before + await page.evaluate(() => performance.now())) / 2;
  }
  sched.pid = findRenderer();
  note("renderer main thread", sched.pid ?? "not found");
  const sampler = setInterval(sampleSched, 5);
  const markAt = await page.evaluate(() => { window.__siltwakePerf.length = 0; window.__gaps.length = 0; performance.mark("cw1-align"); return performance.now(); });
  const started = performance.now(), syncAtStart = records.sync ?? 0, pendingAtStart = records.lightPendingFrames ?? 0;
  traveling = true;
  let caveIndex = 0;
  for (const [i, p] of points.entries()) {
    if (i === 0) continue;
    // At least 100 s a leg, more for a long one (3 m/s made good).
    const q = points[i - 1], metres = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
    const ok = await goto(p, { tol: p.tol ?? (p.cave ? 4 : 7), label: p.cave ?? p.view ?? `cruise#${i}`, boost: !(p.view || p.tol), from: q, timeout: Math.max(100, metres / 3) });
    if (p.service) await panelAction(/^(Service|Charge at)/, `call at ${p.service}${ok ? "" : " (not reached)"}`);
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
  {
    // The power ledger at the end: the battery, the cells still aboard, and what
    // the way home (or to the nearest service site) costs at cruise.
    const s1 = await read(), c = charge(s1), e = POWER?.segments?.[segment];
    result.powerEnd = { charge: c, cellsLeft, air: s1.air, vitals: s1.vitals, at: where(s1), planned: e ?? null,
      homeOk: e && c !== null ? c + cellsLeft * 35 / (POWER.capacity ?? 1) >= e.homePercent : null };
    note("power end", JSON.stringify(result.powerEnd));
  }
  traveling = false;
  const profile = cdp ? (await cdp.send("Profiler.stop")).profile : null;
  let profileAt = null;
  {
    result.trace = await trace.stop();
    note("trace", JSON.stringify(result.trace));
    const mark = traced.mark;
    // Profile samples on the page clock, each with its leaf and the nearest frames of our code.
    if (profile) {
      const byId = new Map(profile.nodes.map(n => [n.id, n])), parentOf = new Map();
      for (const n of profile.nodes) for (const c of n.children ?? []) parentOf.set(c, n.id);
      const label = (n) => { const f = n.callFrame; return `${f.functionName || "(anonymous)"}${f.url ? ` ${f.url.split("/").pop()}:${f.lineNumber + 1}:${f.columnNumber + 1}` : ""}${n.deoptReason ? ` [deopt: ${n.deoptReason}]` : ""}`; };
      const stackOf = new Map();
      const stack = (id) => { let s = stackOf.get(id); if (s) return s; const out = []; for (let n = id; n !== undefined && out.length < 6; n = parentOf.get(n)) out.push(label(byId.get(n))); s = out.join(" < "); stackOf.set(id, s); return s; };
      let t = profile.startTime; profileAt = [];
      for (let i = 0; i < profile.samples.length; i++) { t += profile.timeDeltas[i]; profileAt.push([profileStartPage + (t - profile.startTime) / 1000, profile.samples[i]]); }
      profileAt.stack = stack;
    }
    // Top-level main-thread pauses: V8's MajorGC / MinorGC (and their finalizations).
    if (mark) gcTrace = traced.gc.map(e => ({ at: markAt + (e.ts - mark.ts) / 1000, kind: e.name, pauseMs: +(e.dur / 1000).toFixed(2), tid: e.tid }));
    // CW1_TRACE: every complete slice over 4 ms, on the page clock, with its process and thread.
    if (mark && process.env.CW1_TRACE) {
      result.slices = traced.slices.map(e => ({ at: markAt + (e.ts - mark.ts) / 1000, ms: +(e.dur / 1000).toFixed(1), name: e.name, cat: e.cat,
        thread: `${traced.processes.get(e.pid) ?? e.pid}/${traced.threads.get(`${e.pid}:${e.tid}`) ?? e.tid}`, args: e.args }));
      result.mainThread = `${traced.processes.get(mark.pid) ?? mark.pid}/${traced.threads.get(`${mark.pid}:${mark.tid}`) ?? mark.tid}`;
    }
    result.gcTraceAligned = !!mark;
    result.gcTraceNames = [...traced.gcNames];
  }
  const data = await page.evaluate(() => ({ origin: performance.timeOrigin, gaps: window.__gaps, perf: window.__siltwakePerf, stream: (document.querySelector("#ocean").siltwakeCaveStream?.() ?? {}),
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
    const t1 = data.origin + at, t0 = t1 - g, i0 = indexAt(t0, false), i1 = indexAt(t1, true);
    const first = i0 < 0 ? null : sample(i0), last = i1 < 0 ? null : sample(i1);
    const thread = first && last ? { spanMs: +(last[0] - first[0]).toFixed(1), onCpuMs: +(last[1] - first[1]).toFixed(1), waitingMs: +(last[2] - first[2]).toFixed(1),
      minorFaults: last[3] - first[3], majorFaults: last[4] - first[4], gpuOnCpuMs: +(last[5] - first[5]).toFixed(1), gpuWaitingMs: +(last[6] - first[6]).toFixed(1),
      // Steal in the gap (10 ms jiffies): stolen from the renderer or GPU main
      // thread (per 5 ms interval, on the vCPU each was on; the larger of the
      // two), and summed over every vCPU (how much of the VM paused).
      cpus: [first[7], last[7]], gpuCpus: [first[8], last[8]], stolenMs: stolenBetween(i0, i1),
      stealAllCpusMs: Array.from({ length: NCPU }, (_, c) => last[STEAL + c] - first[STEAL + c]).reduce((a, b) => a + b, 0) * 10 } : null;
    let hot = null;
    if (profileAt) {
      const counts = new Map();
      for (const [ts, id] of profileAt) if (ts > at - g && ts <= at) { const k = profileAt.stack(id); counts.set(k, (counts.get(k) ?? 0) + 0.5); }
      const total = [...counts.values()].reduce((a, b) => a + b, 0);
      hot = [`${total} ms sampled`, ...[...counts].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, ms]) => `${ms} ms: ${k}`)];
    }
    // CW1_TRACE: the trace's slices inside the gap, longest first (renderer, GPU process and the rest).
    const inGap = result.slices ? result.slices.filter(x => x.at < at && x.at + x.ms > at - g).sort((a, b) => b.ms - a.ms).slice(0, 10)
      .map(x => `${x.ms} ms ${x.thread} ${x.cat}:${x.name} ${x.args}`) : undefined;
    result.long.push({ at: +at.toFixed(0), gap: +g.toFixed(1), camera, thread, hot, ...(inGap ? { trace: inGap } : {}), gcPauseMs: +gcs.reduce((n, x) => n + x.pauseMs, 0).toFixed(1), gcs: gcs.map(x => `${x.kind} ${x.pauseMs} ms`), heapFreedMiB: +(freed / 1048576).toFixed(1), gc: freed > 2 * 1048576, frame: e ? { total: +e.total.toFixed(1), sim: +e.sim.toFixed(1), steps: e.steps, save: +(e.save ?? 0).toFixed(1), hud: +(e.hud ?? 0).toFixed(1), present: +e.present.toFixed(1), parts: e.parts, hold: e.hold } : null });
  }
  // Attribution: a long frame is streaming's when the streaming work in it
  // (chunk residency, cave streaming, region activation, the lights' scan of
  // new meshes) is at least half of the frame's own work and the work alone
  // overran a vsync. Other long gaps are simulation, rendering, GC or the
  // browser, reported but not streaming's.
  const streamingOf = (f) => (f?.parts ? (f.parts.chunks ?? 0) + (f.parts.caves ?? 0) + (f.parts.regions ?? 0) + (f.parts.lights ?? 0) : 0);
  for (const l of result.long) if (l.frame) l.streaming = l.frame.total > 16.7 && streamingOf(l.frame) >= 0.5 * l.frame.total;
  // Host pauses never excuse a frame by themselves (CW-1 R2 follow-up): the
  // time stolen from the renderer or GPU main thread is subtracted and the
  // remainder judged against the 34 ms budget. Classes: "host" (stolen, and
  // the remainder within budget), "mixed" (stolen, remainder still over:
  // ours), "clean" (no steal above the 10 ms jiffy: ours), "unsampled" (no
  // thread samples: cannot be cleared, ours).
  for (const l of result.long) {
    if (!l.thread) { l.cause = "unsampled"; l.remainderMs = l.gap; continue; }
    const stolen = Math.min(l.gap, l.thread.stolenMs);
    l.remainderMs = +(l.gap - stolen).toFixed(1);
    l.cause = stolen <= 10 ? "clean" : l.remainderMs <= 34 ? "host" : "mixed";
  }
  result.longByCause = {
    over34: result.long.filter(l => l.gap > 34).length,
    streaming: result.long.filter(l => l.streaming).length,
    streamingOver34: result.long.filter(l => l.streaming && l.gap > 34).length,
    // Frames over 34 ms by what remains once stolen time is taken out, all and streaming.
    host: result.long.filter(l => l.gap > 34 && l.cause === "host").length,
    mixed: result.long.filter(l => l.gap > 34 && l.cause === "mixed").length,
    clean: result.long.filter(l => l.gap > 34 && l.cause === "clean").length,
    unsampled: result.long.filter(l => l.gap > 34 && l.cause === "unsampled").length,
    streamingHost: result.long.filter(l => l.streaming && l.gap > 34 && l.cause === "host").length,
    streamingOurs: result.long.filter(l => l.streaming && l.gap > 34 && l.cause !== "host").length,
    simulation: result.long.filter(l => l.frame && !l.streaming && l.frame.sim >= 0.5 * l.frame.total && l.frame.total > 16.7).length,
    noWork: result.long.filter(l => !l.frame || l.frame.total <= 16.7).length,
    // Long gaps in which the heap shrank by over 2 MiB: a collection ran in them (whatever part it landed in).
    gcShaped: result.long.filter(l => l.gc || l.gcPauseMs >= 0.4 * l.gap).length,
    streamingGcShaped: result.long.filter(l => l.streaming && (l.gc || l.gcPauseMs >= 0.4 * l.gap) && l.gap > 34).length,
  };
  // Every streaming sub-part over the travel, separately (p99 and max ms): the
  // wanted list, the builds, eviction and the light lists of the cave streamer,
  // the texture upload, the view, and the lights' scan, placement and selection.
  const PARTS = { chunks: p => p.chunks, regions: p => p.regions, caves: p => p.caves, caveWanted: p => p.cavePasses?.score, caveBuild: p => p.caveBuildMs,
    caveEvict: p => p.cavePasses?.evict, caveLightList: p => p.cavePasses?.light, caveTexture: p => p.caveStream, caveUpload: p => p.caveUpload?.ms, caveView: p => p.caveView,
    chunkUpdates: p => p.chunkWork?.updates, chunkPlan: p => p.chunkWork?.plan, chunkDrop: p => p.chunkWork?.drop, chunkBuild: p => p.chunkWork?.build, chunkUpload: p => p.chunkWork?.upload,
    chunkDisplay: p => p.chunkWork?.display, chunkEvict: p => p.chunkWork?.evict, chunkDispose: p => p.chunkWork?.dispose, chunkDisposeMax: p => p.chunkWork?.maxDispose,
    lights: p => p.lights, optics: p => p.optics, lightScan: p => p.lightScan,
    lightCached: p => p.lightKinds?.cached, lightMoving: p => p.lightKinds?.moving, lightPlacing: p => p.lightKinds?.placing,
    lightSentLag: p => p.lightKinds?.sentLag, lightLagWorst: p => p.lightKinds?.lagWorst, lightPlace: p => p.lightPlace, lightSelect: p => p.lightSelect, render: p => p.render };
  result.parts = {};
  for (const [name, of] of Object.entries(PARTS)) {
    const v = data.perf.map(e => e.parts ? of(e.parts) ?? 0 : 0).sort((a, b) => a - b);
    result.parts[name] = { p99: quant(v, 0.99), max: v.length ? +v.at(-1).toFixed(2) : null };
  }
  // Moving-light lag: the nearest distance at which any moving mesh lagged, and
  // the worst lag of a sent light within 30 m (visible near the player).
  const lagged = data.perf.map(e => e.parts?.lightKinds).filter(k => k && k.lagNearest >= 0);
  result.lightLag = { framesLagging: lagged.length, nearestM: lagged.length ? Math.min(...lagged.map(k => k.lagNearest)) : null,
    worstSentFrames: Math.max(0, ...data.perf.map(e => e.parts?.lightKinds?.sentLag ?? 0)),
    worstSentWithin30m: Math.max(0, ...lagged.filter(k => k.lagNearest <= 30).map(k => k.sentLag)) };
  const sims = data.perf.map(e => e.sim ?? 0).sort((a, b) => a - b);
  result.parts.sim = { p99: quant(sims, 0.99), max: sims.length ? +sims.at(-1).toFixed(2) : null };
  result.streamingMax = data.perf.reduce((m, e) => ({ chunks: Math.max(m.chunks, e.parts?.chunks ?? 0), caves: Math.max(m.caves, e.parts?.caves ?? 0) }), { chunks: 0, caves: 0 });
  result.holdFrames = data.perf.filter(e => e.hold && e.hold !== "clear").length;
  result.stream = data.stream;
  // The page clock's epoch origin: long gaps at origin + at line up with outside samples (PSI, ps).
  result.pageOrigin = data.origin;
  result.thread = { pid: sched.pid, samples: sched.n };
  result.gc = { collections: gcTrace.length, byKind: gcTrace.reduce((m, x) => ({ ...m, [x.kind]: (m[x.kind] ?? 0) + 1 }), {}),
    maxPauseMs: Math.max(0, ...gcTrace.map(x => x.pauseMs)), over16: gcTrace.filter(x => x.pauseMs > 16).map(x => `${x.kind} ${x.pauseMs} ms at ${x.at.toFixed(0)}`) };
  // The gate: the travel's own unsliced builds (the counter, and the logged
  // warnings that say where), holds and streaming-attributed long frames.
  const travelSync = (data.stream.sync ?? 0) - syncAtStart;
  const failures = [];
  if (travelSync > 0 || result.unsliced.some(u => u.traveling)) failures.push(`${Math.max(travelSync, result.unsliced.filter(u => u.traveling).length)} unsliced cave build(s) in travel`);
  if (result.holdFrames > 0) failures.push(`${result.holdFrames} hold frame(s)`);
  // The gate: streaming frames whose remainder, after stolen time, is still over 34 ms.
  const ours = result.longByCause.streamingOurs;
  if (ours > 0) failures.push(`${ours} streaming frame(s) over 34 ms after stolen time (mixed, clean or unsampled)`);
  // R2-2: a cave the craft is in whose light is not yet bound is drawn as open water; ordinary travel must have prefetched it.
  const travelLightPending = (data.stream.lightPendingFrames ?? 0) - pendingAtStart;
  if (travelLightPending > 0) failures.push(`${travelLightPending} frame(s) inside a cave whose light was not ready`);
  result.gate = { pass: failures.length === 0, failures, travelSync, loadSync: syncAtStart, travelLightPending };
  result.memory = { residentCpuMiB: +(data.cpu / 1048576).toFixed(1), residentGpuMiB: +(data.gpu / 1048576).toFixed(1), regionMiB: +(data.regionBytes / 1048576).toFixed(1),
    budgetMiB: 256, heapMiB: data.heap ? +(data.heap.used / 1048576).toFixed(1) : null };
  note("gate", result.gate.pass ? "pass" : `FAIL: ${result.gate.failures.join("; ")}`);
  note("result", JSON.stringify({ frames: result.frames, longByCause: result.longByCause, work: result.work, parts: result.parts, holds: result.holdFrames, memory: result.memory, stream: result.stream }));
} catch (error) {
  result.errors.push(String(error?.stack ?? error)); note("error", String(error));
  result.gate ??= { pass: false, failures: ["the run did not finish"] };
} finally {
  trace?.abandon();
  delete result.slices;
  writeFileSync(path.join(out, `segment-${segment}.json`), JSON.stringify(result, null, 1));
  writeFileSync(path.join(out, `segment-${segment}.log`), log.join("\n"));
  await browser.close().catch(() => {});
  server.close();
  process.exitCode = result.gate?.pass ? 0 : 1;
}
