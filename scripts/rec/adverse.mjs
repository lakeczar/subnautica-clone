// REC-1 R2 adverse checks in a task-owned Chrome (no game: the flight modules
// themselves, transpiled from src/, fed by a barcoded 2D canvas):
//
//   node scripts/rec/adverse.mjs --out DIR [--chrome BIN] [--pw DIR]
//   node scripts/rec/adverse.mjs --decode DIR   (judge a run's video where a full ffmpeg is)
//
// - R2-7, the video clock: an ordinary segment; a stall before a segment's
//   first picture; a stall right after its first hand-over; a video restart;
//   rotations (2 s segments); a CPU-throttled stretch; a pause (nothing drawn:
//   the recorder repeats its last picture); no frames at all for 2.5 s, as a
//   hidden tab gives the page (headless Chrome never reports a page hidden, so
//   this is the recorder's view of one, not a real hidden tab). The page is
//   "drawn" every frame like the game (afterRender), with a new barcode every
//   83 ms. Every encoded frame is decoded (ffmpeg: its time and the barcode it
//   shows): a frame showing picture k at page time T, the segment's recorded
//   origin plus the frame's time in the file, must satisfy
//   draw(k) − 2 ms ≤ T ≤ draw(k+1) + 2 ms. In a pause, the picture repeated
//   may be the one before the last drawn (a frame drawn after the last capture
//   cannot be captured later): at most one capture interval stale. Any
//   compressed, shifted or misdated interval breaks that.
// - R2-5: spool workers alive after four stop-and-replace cycles that retire
//   the superseded recording (CDP targets, after a forced collection).
// - R2-4: a ten-hour timeline page (360,000 frame points, two 4 Hz memory
//   series): its first draw, a seek and a resize, without page errors; and
//   DPR 2 canvas sizes through resizes.
//
// Writes DIR/adverse.json; exits 1 when a check fails.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { composer, remux } from "./imaging.mjs";
import { findFfmpeg } from "./record.mjs";
import { unzip } from "./unzip.mjs";
import { timelineHtml } from "./timeline.mjs";

const args = process.argv.slice(2), arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };

/** An ffmpeg that decodes VP9 and has the crop/scale/showinfo filters: the system's when it has them (Playwright's build only remuxes). */
function decoder() {
  for (const ff of ["ffmpeg", findFfmpeg()].filter(Boolean)) {
    try { if (/showinfo/.test(execFileSync(ff, ["-hide_banner", "-filters"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })) && /vp9/.test(execFileSync(ff, ["-hide_banner", "-decoders"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }))) return ff; } catch { /* next */ }
  }
  return null;
}
/** Each frame's time in the file and the 16-bit barcode it shows, in one ffmpeg pass. */
function decode(ff, file) {
  const run = spawnSync(ff, ["-hide_banner", "-threads", "1", "-i", file, "-vf", "crop=iw:2:0:40,scale=16:1:flags=neighbor,showinfo",
    "-vsync", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 26 });
  const times = [...String(run.stderr).matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
  const ids = [];
  for (let i = 0; i + 48 <= run.stdout.length; i += 48) { let id = 0; for (let b = 0; b < 16; b++) if (run.stdout[i + b * 3] > 128) id |= 1 << b; ids.push(id); }
  return { times, ids };
}
/** R2-7's verdict from a run's raw facts and recording: every frame dated within its picture's lifetime. */
function judgeClock(raw, rec, failed) {
  // The export's own header (the live one may already name a segment begun after the cutoff).
  const header = JSON.parse(readFileSync(path.join(rec, "header.json"), "utf8"));
  const ff = decoder(), draws = raw.draws, cutoff = header.exported.cutoff, pauses = raw.pauses ?? [];
  const inPause = (T) => pauses.some((p) => T >= p.from && T <= p.to);
  const lastDrawBefore = (T) => { let k = null; for (const d of draws) if (d.t <= T) k = d; return k; };
  if (!ff) { failed.push("clock: no ffmpeg here decodes VP9 with showinfo; judge this run with --decode where one does"); return { undecoded: true }; }
  const byId = new Map(draws.map((d, i) => [d.id, { t: d.t, next: draws[i + 1]?.t ?? Infinity }]));
  const segments = [];
  for (const seg of header.video?.segments ?? []) {
    const file = path.join(rec, seg.file), fixed = `${file}.remux.webm`;
    if (!remux(file, fixed)) { segments.push({ ...seg, error: "remux failed" }); continue; }
    const { times, ids } = decode(ff, fixed);
    const frames = times.map((pt, i) => {
      // Picture 0 is the canvas before the first barcode: dated before the first draw, it is right.
      const d = ids[i] === 0 ? { t: -Infinity, next: draws[0]?.t ?? Infinity } : byId.get(ids[i]), T = seg.start + pt * 1000;
      // In a pause: the last picture drawn, or the one before it if that last one came after the last capture (≤ one interval).
      const last = lastDrawBefore(T), staleOk = inPause(T) && last && last.id === ids[i] + 1 && last.t - d?.t <= 1000 / 12 + 2;
      return { pt, id: ids[i], T: +T.toFixed(1), drawn: d?.t ?? null, ok: !!d && T >= d.t - 2 && (T <= d.next + 2 || !!staleOk) };
    });
    const bad = frames.filter((f) => !f.ok);
    segments.push({ file: seg.file, start: seg.start, end: seg.end, frames: frames.length, barcodes: ids.length, misdated: bad.length, firstBad: bad.slice(0, 3),
      firstT: frames[0]?.T ?? null, lastT: frames.at(-1)?.T ?? null });
  }
  const lastT = Math.max(...segments.map((s) => s.lastT ?? -Infinity));
  if (!segments.length) failed.push("clock: no video segments");
  for (const s of segments) if (s.error || s.misdated || !s.frames || s.frames !== s.barcodes) failed.push(`clock: ${s.file} ${s.error ?? `${s.misdated} of ${s.frames} frames misdated (${s.barcodes} barcodes)`}`);
  if (!(lastT >= cutoff - 1000 / 12 - 2)) failed.push(`clock: the video ends at ${lastT}, before the export cutoff ${cutoff}`);
  return { decoder: ff, segments, cutoff, lastT, reachesCutoff: lastT >= cutoff - 1000 / 12 - 2 };
}

if (arg("decode")) {
  const dir = arg("decode"), raw = JSON.parse(readFileSync(path.join(dir, "raw.json"), "utf8")), result = JSON.parse(readFileSync(path.join(dir, "adverse.json"), "utf8"));
  result.failed = result.failed.filter((f) => !f.startsWith("clock:"));
  result.clock = { ...result.clock, ...judgeClock(raw, path.join(dir, "recording"), result.failed) };
  writeFileSync(path.join(dir, "adverse.json"), JSON.stringify(result, null, 1));
  console.log(JSON.stringify({ failed: result.failed, segments: result.clock.segments?.map((s) => `${s.file}: ${s.frames} frames, ${s.misdated} misdated`), reachesCutoff: result.clock.reachesCutoff }));
  process.exit(result.failed.length ? 1 : 0);
}
const out = arg("out");
if (!out) { console.error("usage: adverse.mjs --out DIR [--chrome BIN] [--pw DIR] | --decode DIR"); process.exit(2); }
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const www = path.join(out, "www"), mods = path.join(www, "modules");
mkdirSync(mods, { recursive: true });
const ts = createRequire(path.join(repo, "package.json"))("typescript");
for (const n of ["capture", "recorder", "retention", "zip", "webm", "spool.worker"]) {
  const src = readFileSync(path.join(repo, "src/runtime/flight", `${n}.ts`), "utf8");
  writeFileSync(path.join(mods, `${n}.js`), ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } })
    .outputText.replace("./spool.worker.ts", "./spool.worker.js"));
}
// Variants for the failure checks (R3): the same modules, with only the browser's
// encoder wrapped in the worker: one throws on its tenth picture (R3-1), one
// reports itself behind from 2 s to 4 s after it starts (R3-3).
const VARIANTS = {
  throw: `{ const encode = VideoEncoder.prototype.encode; let n = 0; VideoEncoder.prototype.encode = function (...a) { if (++n === 10) throw new DOMException("injected encode failure", "OperationError"); return encode.apply(this, a); }; }\n`,
  behind: `{ const d = Object.getOwnPropertyDescriptor(VideoEncoder.prototype, "encodeQueueSize"); const t0 = performance.now(); Object.defineProperty(VideoEncoder.prototype, "encodeQueueSize", { configurable: true, get() { const t = performance.now() - t0; return t > 2000 && t < 4000 ? 9 : d.get.call(this); } }); }\n`,
};
for (const [name, prefix] of Object.entries(VARIANTS)) {
  const dir = path.join(www, `modules-${name}`);
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(mods)) writeFileSync(path.join(dir, f), (f === "spool.worker.js" ? prefix : "") + readFileSync(path.join(mods, f), "utf8"));
}
const server = createServer((req, res) => {
  const file = path.join(www, decodeURIComponent(req.url.split("?")[0]));
  try { res.setHeader("Content-Type", file.endsWith(".js") ? "text/javascript" : file.endsWith(".html") ? "text/html" : "application/octet-stream"); res.end(readFileSync(file)); }
  catch { res.setHeader("Content-Type", "text/html"); res.end("<!doctype html><body style=margin:0><canvas id=c width=640 height=360></canvas>"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const result = { clock: null, workers: null, encodeThrow: null, removals: null, backpressure: null, timeline: null, dpr2: null, errors: [], failed: [] };
/** Draws a barcoded picture every 83 ms for `ms`, the capture told after every frame (as the game does); returns the draws. Runs in the page. */
const DRAW = `async (cap, ms) => {
  const canvas = document.getElementById("c"), x = canvas.getContext("2d"), draws = [], t0 = performance.now();
  let last = -1, id = 0;
  await new Promise((done) => { const f = (now) => {
    if (now - last > 83) { last = now; id++; draws.push({ id, t: now }); x.fillStyle = "#246578"; x.fillRect(0, 0, 640, 360);
      for (let bit = 0; bit < 16; bit++) { x.fillStyle = id & (1 << bit) ? "#fff" : "#000"; x.fillRect(bit * 40, 0, 40, 80); } }
    // A frame row each frame (the game writes one): the pack's measured window is the recording's.
    try { cap.recorder.frame({ t: now, gap: now - (window.lastFrameT ?? now), work: 1, sim: 0, steps: 1, save: 0, hud: 0, hold: "clear", heapDrop: -1, chunks: 0, caves: 0, regions: 0, lights: 0, actors: 0, render: 0, dom: 0, gpuTag: -1 }); window.lastFrameT = now;
      cap.afterRender(now); } catch (e) { (window.drawErrors ??= []).push(String(e?.message ?? e)); }
    if (now - t0 < ms) requestAnimationFrame(f); else done(); }; requestAnimationFrame(f); });
  return draws;
}`;
/** A phase in the page, bounded: a hang is a recorded failure, not a stalled job. */
const phase = async (name, fn) => {
  console.log(`[adverse] ${name}`);
  let timer;
  try { return await Promise.race([fn(), new Promise((_, no) => { timer = setTimeout(() => no(new Error(`${name}: no answer in 120 s`)), 120_000); })]); }
  catch (e) {
    // What the stuck capture last did, and which worker requests are still unanswered.
    const where = await c.page.evaluate(() => window.capR3 && { events: window.capR3.recorder.events.since(0).items.slice(-8).map((x) => x.text),
      waiting: [...(window.capR3.spool?.waiters?.keys() ?? [])], video: !!window.capR3.video, stopped: window.capR3.stopped }).catch(() => null);
    result.failed.push(`${name}: ${e.message}${where ? ` · ${JSON.stringify(where)}` : ""}`);
    return null;
  }
  finally { clearTimeout(timer); }
};
const zipOf = `async (cap) => { const exp = await cap.exportZip(), bytes = new Uint8Array(await exp.blob.arrayBuffer());
  let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }`;
const ndjson = (file) => (existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const c = await composer({ chrome: arg("chrome"), pw: arg("pw") });
c.page.on("pageerror", (e) => result.errors.push(e.message.slice(0, 300)));
c.page.on("console", (m) => { if (/warn|error/.test(m.type())) console.log(`[page ${m.type()}] ${m.text().slice(0, 240)}`); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  // --- R2-7: the video clock ---------------------------------------------------
  await c.page.goto(`${origin}/?recsegment=2000`);
  await c.page.evaluate(async () => {
    const { FlightCapture } = await import("/modules/capture.js");
    const canvas = document.getElementById("c"), x = canvas.getContext("2d");
    Object.assign(window, { draws: [], marks: [], vis: [], pauses: [], stallNext: false, run: true, paused: false, hidden: false, id: 0 });
    document.addEventListener("visibilitychange", () => window.vis.push({ t: performance.now(), state: document.visibilityState }));
    // A stall right after a segment's first hand-over to the encoder.
    const send = FlightCapture.prototype.sendFrame;
    FlightCapture.prototype.sendFrame = function (v, t, bitmap) {
      send.call(this, v, t, bitmap);
      if (window.stallNext && v.frames === 1) { window.stallNext = false; queueMicrotask(() => { const end = performance.now() + 1500; while (performance.now() < end); }); }
    };
    window.cap = new FlightCapture(canvas, "playtest", true, { content: "adverse", bake: "", commit: "adverse" });
    let last = -1;
    // Like the game: a frame that draws calls afterRender, one that draws nothing (a pause) idle; a hidden page gets no frames.
    const frame = (now) => {
      if (!window.run) return;
      if (window.hidden) { requestAnimationFrame(frame); return; }
      if (window.paused) { window.cap.idle(now); requestAnimationFrame(frame); return; }
      if (now - last > 83) {
        last = now;
        const id = ++window.id;
        window.draws.push({ id, t: now });
        x.fillStyle = "#246578"; x.fillRect(0, 0, 640, 360);
        for (let bit = 0; bit < 16; bit++) { x.fillStyle = id & (1 << bit) ? "#fff" : "#000"; x.fillRect(bit * 40, 0, 40, 80); }
        x.fillStyle = "#fff"; x.font = "30px sans-serif"; x.fillText(`${id} ${Math.round(now)}`, 40, 180);
      }
      window.cap.afterRender(now);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  const mark = (what) => c.page.evaluate((w) => window.marks.push({ t: performance.now(), what: w }), what);
  await sleep(2500);
  // A stall before a segment's first picture.
  await c.page.evaluate(() => { window.marks.push({ t: performance.now(), what: "restart, then a 1.5 s stall before the first picture" }); window.cap.setVideo(false); window.cap.setVideo(true); const end = performance.now() + 1500; while (performance.now() < end); });
  await sleep(2500);
  // A stall right after a segment's first hand-over.
  await c.page.evaluate(() => { window.marks.push({ t: performance.now(), what: "restart, then a 1.5 s stall after the first hand-over" }); window.cap.setVideo(false); window.cap.setVideo(true); window.stallNext = true; });
  await sleep(4500);
  // A CPU-throttled stretch.
  const cdp = await c.page.context().newCDPSession(c.page);
  await mark("CPU throttled 6x");
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  await sleep(2500);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await mark("CPU throttle off");
  await sleep(1500);
  // A pause: nothing drawn, the recorder repeats its last picture.
  await c.page.evaluate(() => { window.paused = true; window.pauses.push({ from: performance.now(), to: Infinity }); });
  await sleep(2000);
  await c.page.evaluate(() => { window.paused = false; window.pauses.at(-1).to = performance.now(); });
  await sleep(1500);
  // No frames at all, as a hidden tab gets (headless Chrome never reports a page hidden: the window is minimized too, and whether that hid it is recorded).
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  await c.page.evaluate(() => { window.hidden = true; window.marks.push({ t: performance.now(), what: "no frames (hidden-tab equivalent)" }); });
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } });
  await sleep(2500);
  const hiddenSeen = await c.page.evaluate(() => document.visibilityState);
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
  await c.page.evaluate(() => { window.hidden = false; window.marks.push({ t: performance.now(), what: "frames again" }); });
  await sleep(2000);
  const data = await c.page.evaluate(async () => {
    const exp = await window.cap.exportZip(), bytes = new Uint8Array(await exp.blob.arrayBuffer());
    window.run = false;
    let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { zip: btoa(s), draws: window.draws, marks: window.marks, vis: window.vis, pauses: window.pauses, header: window.cap.header };
  });
  const rec = path.join(out, "recording");
  writeFileSync(path.join(out, "recording.zip"), Buffer.from(data.zip, "base64"));
  unzip(path.join(out, "recording.zip"), rec);
  writeFileSync(path.join(out, "raw.json"), JSON.stringify({ draws: data.draws, marks: data.marks, vis: data.vis, pauses: data.pauses, header: data.header }));
  result.clock = { marks: data.marks, visibility: data.vis, hiddenSeen, codec: data.header.video?.codec ?? null, ...judgeClock(data, rec, result.failed) };

  // --- R2-5: superseded recordings retire their workers ----------------------
  console.log("[adverse] clock judged; workers");
  await phase("workers", () => c.page.evaluate(async () => {
    const { FlightCapture } = await import("/modules/capture.js");
    const canvas = document.getElementById("c");
    window.cap.stop();
    let done = window.cap;
    for (let i = 0; i < 4; i++) {
      const next = new FlightCapture(canvas, "playtest", false, { content: "adverse", bake: "", commit: "adverse" });
      await new Promise((r) => setTimeout(r, 200));
      next.stop();
      const superseded = done;
      done = next;
      await superseded.retire();
    }
    window.cap = done;
    window.lastExport = (await done.exportZip()).blob.size;
  }));
  await cdp.send("HeapProfiler.collectGarbage");
  await sleep(500);
  const browserCdp = await c.page.context().browser().newBrowserCDPSession();
  const workers = (await browserCdp.send("Target.getTargets")).targetInfos.filter((t) => t.type === "worker" && t.url.includes("spool.worker"));
  result.workers = { alive: workers.length, latestExportBytes: await c.page.evaluate(() => window.lastExport) };
  if (workers.length > 1) result.failed.push(`workers: ${workers.length} spool workers alive after four retirements`);
  if (!(result.workers.latestExportBytes > 0)) result.failed.push("workers: the latest completed recording did not export");

  // --- R3-1: an encoder that throws leaves the spool working ------------------
  await c.page.goto(`${origin}/?r3=throw`);
  const thrown = await phase("encoder throws", () => c.page.evaluate(async ({ DRAW, zipOf }) => {
    const { FlightCapture } = await import("/modules-throw/capture.js");
    document.getElementById("c").getContext("2d"); // before the capture asks it for WebGL2: the harness draws in 2D
    const cap = window.capR3 = new FlightCapture(document.getElementById("c"), "playtest", true, { content: "adverse", bake: "", commit: "adverse" });
    await (0, eval)(DRAW)(cap, 3000);
    cap.recorder.event("action", "after the failure", { snapshot: false });
    cap.flush(performance.now());
    const t0 = performance.now(), zip = await (0, eval)(zipOf)(cap);
    return { zip, exportMs: Math.round(performance.now() - t0), lost: cap.header.retention.lost, drawErrors: window.drawErrors ?? [] };
  }, { DRAW, zipOf }));
  if (thrown) {
    const dir = path.join(out, "throw");
    writeFileSync(path.join(out, "throw.zip"), Buffer.from(thrown.zip, "base64"));
    unzip(path.join(out, "throw.zip"), dir);
    const header = JSON.parse(readFileSync(path.join(dir, "header.json"), "utf8"));
    const after = ndjson(path.join(dir, "events.ndjson")).some((e) => e.text === "after the failure");
    result.encodeThrow = { exportMs: thrown.exportMs, drawErrors: thrown.drawErrors, drawErrors: thrown.drawErrors, lossFact: header.retention.lost.some((l) => /video encoder failed/.test(l.why)), telemetryAfter: after,
      lost: header.retention.lost.map((l) => l.why).slice(0, 3) };
    if (!result.encodeThrow.lossFact) result.failed.push("encode throw: no loss fact in the exported ledger");
    if (!after) result.failed.push("encode throw: telemetry after the failure missing from the export");
  }

  // --- R3-2: Off → on keeps the previous recording; a refused removal is not credited ---
  await c.page.goto(`${origin}/?recbudget=1`);
  result.removals = await phase("removals", () => c.page.evaluate(async () => {
    const { FlightCapture } = await import("/modules/capture.js");
    const canvas = document.getElementById("c"), build = { content: "adverse", bake: "", commit: "adverse" };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const bytesOf = async (session) => {
      let total = 0;
      const walk = async (d) => { for await (const [, h] of d.entries()) total += h.kind === "file" ? (await h.getFile()).size : (await walk(h), 0); };
      try { await walk(await (await (await navigator.storage.getDirectory()).getDirectoryHandle("flight")).getDirectoryHandle(session)); } catch { return null; }
      return total;
    };
    // Another context (as another tab would) holds an older recording's file open.
    const lock = new Worker(URL.createObjectURL(new Blob([`onmessage = async () => { const root = await navigator.storage.getDirectory();
      const d = await (await root.getDirectoryHandle("flight", { create: true })).getDirectoryHandle("1999-01-01-held", { create: true });
      const h = await (await d.getFileHandle("samples.ndjson", { create: true })).createSyncAccessHandle();
      h.truncate(0); h.write(new Uint8Array(3 * 1048576)); h.flush(); self.held = h; postMessage("locked"); };`], { type: "text/javascript" })));
    await new Promise((r) => { lock.onmessage = r; lock.postMessage(1); });
    // A: a recording turned off, kept exportable (the app's latest completed recording).
    const a = new FlightCapture(canvas, "playtest", false, build);
    await sleep(300);
    for (let i = 0; i < 1500; i++) a.recorder.sample({ t: i, pad: "a".repeat(400) });
    a.flush(performance.now());
    await sleep(500);
    a.stop();
    await sleep(1500);
    // B: the next recording, with a 1 MiB budget.
    const b = new FlightCapture(canvas, "playtest", false, build);
    await sleep(3000);
    const aBytes = await bytesOf(a.session), heldBytes = await bytesOf("1999-01-01-held");
    const aExport = (await a.exportZip()).blob.size;
    lock.terminate();
    const ledger = b.header.retention;
    return { aSession: a.session, aBytes, aExport, heldBytes, bStopped: b.stopped, bStopWhy: ledger.stopped?.why ?? null,
      removedOlder: ledger.removedOlder.map((r) => r.session), removalRefused: ledger.removalRefused.map((r) => ({ session: r.session, why: r.why })) };
  }));
  if (result.removals) {
    const r = result.removals;
    if (!(r.aBytes > 500_000)) result.failed.push(`removals: the previous recording lost its bytes (${r.aBytes})`);
    if (!(r.aExport > 0)) result.failed.push("removals: the previous recording did not export");
    if (r.removedOlder.includes(r.aSession)) result.failed.push("removals: the previous recording was removed while exportable");
    if (!(r.heldBytes >= 3 * 1048576)) result.failed.push(`removals: the held recording's bytes are not on disk (${r.heldBytes})`);
    if (r.removedOlder.includes("1999-01-01-held")) result.failed.push("removals: a refused removal was credited");
    if (!r.removalRefused.some((x) => x.session === "1999-01-01-held")) result.failed.push("removals: the refused removal is not in the ledger");
  }

  // --- R3-3: encoder backpressure: a recorded gap, an honest pack and held strip tiles ---
  await c.page.goto(`${origin}/?r3=behind`);
  const behind = await phase("backpressure", () => c.page.evaluate(async ({ DRAW, zipOf }) => {
    const { FlightCapture } = await import("/modules-behind/capture.js");
    document.getElementById("c").getContext("2d"); // before the capture asks it for WebGL2: the harness draws in 2D
    const cap = window.capR3 = new FlightCapture(document.getElementById("c"), "playtest", true, { content: "adverse", bake: "", commit: "adverse" });
    const draws = await (0, eval)(DRAW)(cap, 6000);
    return { zip: await (0, eval)(zipOf)(cap), draws, drawErrors: window.drawErrors ?? [] };
  }, { DRAW, zipOf }));
  if (behind) {
    const zip = path.join(out, "behind.zip"), pack = path.join(out, "behind-pack");
    writeFileSync(zip, Buffer.from(behind.zip, "base64"));
    const packed = spawnSync(process.execPath, [path.join(repo, "scripts/rec/pack.mjs"), "--zip", zip, pack], { encoding: "utf8" });
    const header = JSON.parse(readFileSync(path.join(pack, "recording", "header.json"), "utf8"));
    const lost = header.retention.videoGaps.filter((g) => g.kind === "lost");
    const story = existsSync(path.join(pack, "story.md")) ? readFileSync(path.join(pack, "story.md"), "utf8") : "";
    const row = (name) => story.split("\n").find((l) => l.startsWith(`| ${name} |`)) ?? null;
    const { heldNote } = await import(path.join(repo, "scripts/rec/pack.mjs"));
    const { analyse, loadRecording } = await import(path.join(repo, "scripts/rec/analyse.mjs"));
    const t0 = analyse(loadRecording(pack)).t0, mid = lost[0] ? (lost[0].from + lost[0].to) / 2 : null;
    // A strip across the gap, to look at: its tiles must say they hold an earlier picture.
    let stripFile = null;
    if (mid != null) {
      stripFile = path.join(out, "behind-gap-strip.jpg");
      spawnSync(process.execPath, [path.join(repo, "scripts/rec/strip.mjs"), pack, "--at", ((mid - t0) / 1000).toFixed(2), "--out", stripFile], { encoding: "utf8" });
      if (!existsSync(stripFile)) stripFile = null;
    }
    result.backpressure = { packExit: packed.status, gaps: lost.map((g) => ({ from: g.from, to: g.to, pictures: g.pictures, heldFrom: g.heldFrom, why: g.why })),
      drops: header.retention.videoDrops, complete: row("recording complete"), video: row("video"), heldAtMid: mid == null ? null : heldNote(header, mid, t0), stripFile, drawsInGap: mid == null ? null : behind.draws.filter((d) => d.t >= lost[0].from && d.t <= lost[0].to).length };
    if (!lost.length) result.failed.push("backpressure: no gap recorded");
    if (!/partial/.test(result.backpressure.complete ?? "") || !/not captured/.test(result.backpressure.complete ?? "")) result.failed.push(`backpressure: completeness does not report the gap (${result.backpressure.complete})`);
    if (!/partial/.test(result.backpressure.video ?? "")) result.failed.push(`backpressure: video coverage does not report the gap (${result.backpressure.video})`);
    if (mid != null && !/NO PICTURE/.test(result.backpressure.heldAtMid ?? "")) result.failed.push("backpressure: a strip tile in the gap is not marked held");
  }

  // --- R2-4: a campaign-length timeline ---------------------------------------
  console.log("[adverse] timeline");
  const frames = Array.from({ length: 360_000 }, (_, i) => ({ t: i * 100, gap: i % 50_000 === 7 ? 140 : 16.7 }));
  const mem = Array.from({ length: 144_000 }, (_, i) => ({ t: i * 250, v: 200 + (i % 13) }));
  const series = { tab: [], heap: mem, vram: [], gpuUsed: [], resident: mem };
  writeFileSync(path.join(www, "long.html"), timelineHtml({ header: { build: { commit: "adverse" } }, frames, events: [], rec: www },
    { t0: 0, durationS: 36_000, attention: [], series, pacing: { spans: [] }, verdict: { status: "partial" } }));
  const before = result.errors.length;
  const t0 = Date.now();
  await c.page.goto(`${origin}/long.html`);
  await c.page.waitForFunction(() => document.getElementById("cf")?.width > 0);
  const loadMs = Date.now() - t0;
  const box = await c.page.locator("#cf").boundingBox();
  const s0 = Date.now();
  await c.page.mouse.click(box.x + box.width * 0.6, box.y + 50);
  await c.page.mouse.move(box.x + box.width * 0.3, box.y + 60);
  const seekMs = Date.now() - s0;
  await c.page.setViewportSize({ width: 1000, height: 700 });
  await sleep(300);
  result.timeline = { frameRows: frames.length, memoryPoints: 2 * mem.length, bytes: readFileSync(path.join(www, "long.html")).length, loadMs, seekMs, errors: result.errors.slice(before) };
  if (result.timeline.errors.length) result.failed.push(`timeline: ${result.timeline.errors[0]}`);

  // DPR 2: canvas backing sizes stay fixed through resizes and redraws.
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 2, mobile: false });
  await c.page.goto(`${origin}/long.html`);
  await c.page.waitForFunction(() => document.getElementById("cf")?.width > 0);
  result.dpr2 = await c.page.evaluate(() => {
    const rows = [];
    for (let i = 0; i < 8; i++) { dispatchEvent(new Event("resize")); rows.push([...document.querySelectorAll("canvas")].map((cv) => `${cv.width}x${cv.height}`).join(" ")); }
    return { dpr: devicePixelRatio, stable: new Set(rows).size === 1, rows: rows.slice(0, 2) };
  });
  if (!result.dpr2.stable) result.failed.push("dpr2: canvas sizes changed across redraws");
} catch (e) {
  result.failed.push(`harness: ${e.message}`);
} finally {
  writeFileSync(path.join(out, "adverse.json"), JSON.stringify(result, null, 1));
  await c.close();
  await new Promise((r) => server.close(r));
}
console.log(JSON.stringify({ failed: result.failed, clock: result.clock && { codec: result.clock.codec, hiddenSeen: result.clock.hiddenSeen, reachesCutoff: result.clock.reachesCutoff,
  segments: result.clock.segments?.map((s) => `${s.file}: ${s.frames} frames, ${s.misdated} misdated`) }, workers: result.workers,
  encodeThrow: result.encodeThrow, removals: result.removals && { aBytes: result.removals.aBytes, aExport: result.removals.aExport, heldBytes: result.removals.heldBytes, refused: result.removals.removalRefused.length, bStopped: result.removals.bStopped },
  backpressure: result.backpressure && { gaps: result.backpressure.gaps.length, drops: result.backpressure.drops, complete: result.backpressure.complete, video: result.backpressure.video, held: result.backpressure.heldAtMid },
  timeline: result.timeline && { loadMs: result.timeline.loadMs, seekMs: result.timeline.seekMs, errors: result.timeline.errors.length }, dpr2: result.dpr2 }));
process.exit(result.failed.length ? 1 : 0);
