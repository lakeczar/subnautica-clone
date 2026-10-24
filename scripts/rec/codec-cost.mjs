// REC-1 R3b: what the in-game video's encoder costs in CPU, by codec and size.
// Real game pictures (extracted from a recorded video) are encoded at 12 fps
// for SECONDS in a worker with WebCodecs, as the spool worker does, and the
// browser's renderer process CPU (all threads, /proc) is read before and
// after. A baseline makes and closes the same VideoFrames without encoding.
//
//   node scripts/rec/codec-cost.mjs --video FILE.webm --out DIR [--seconds 30]
//
// Writes DIR/codec-cost.json. Numbers are this machine's, contended by
// whatever else runs: compare configurations within one run.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { composer } from "./imaging.mjs";
import { findFfmpeg } from "./record.mjs";
import { processCpu } from "../soak/probe.mjs";

const args = process.argv.slice(2), arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const video = arg("video"), out = arg("out"), seconds = Number(arg("seconds", 30));
if (!video || !out) { console.error("usage: codec-cost.mjs --video FILE.webm --out DIR [--seconds 30]"); process.exit(2); }
const frames = path.join(out, "frames");
mkdirSync(frames, { recursive: true });
// 72 pictures, 6 s of play at 12 fps: the content an encoder sees.
execFileSync(findFfmpeg(), ["-hide_banner", "-loglevel", "error", "-i", video, "-t", "6", "-vf", "fps=12,scale=1280:720", "-y", path.join(frames, "%03d.png")]);
const files = readdirSync(frames).filter((f) => f.endsWith(".png")).sort();

const CONFIGS = [
  { name: "baseline (no encoding)", codec: null, width: 1280, height: 720 },
  { name: "VP9 1280x720 (current)", codec: "vp09.00.10.08", width: 1280, height: 720 },
  { name: "VP8 1280x720", codec: "vp8", width: 1280, height: 720 },
  { name: "VP9 960x540", codec: "vp09.00.10.08", width: 960, height: 540 },
  { name: "VP8 960x540", codec: "vp8", width: 960, height: 540 },
  { name: "AV1 1280x720", codec: "av01.0.04M.08", width: 1280, height: 720 },
];
const worker = `onmessage = async ({ data: { bitmaps, codec, width, height, seconds } }) => {
  let enc = null, bytes = 0, encoded = 0, supported = true;
  if (codec) {
    const config = { codec, width, height, bitrate: 900000, framerate: 12, latencyMode: "realtime" };
    supported = (await VideoEncoder.isConfigSupported(config)).supported;
    if (supported) { enc = new VideoEncoder({ output: (c) => { bytes += c.byteLength; encoded++; }, error: () => {} }); enc.configure(config); }
  }
  postMessage({ ready: true, supported });
  const t0 = performance.now();
  for (let i = 0; performance.now() - t0 < seconds * 1000; i++) {
    const due = t0 + i * 1000 / 12;
    const wait = due - performance.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const f = new VideoFrame(bitmaps[i % bitmaps.length], { timestamp: Math.round((due - t0) * 1000) });
    if (enc && enc.encodeQueueSize <= 2) enc.encode(f, { keyFrame: i % 24 === 0 });
    f.close();
  }
  if (enc) { await enc.flush(); enc.close(); }
  postMessage({ done: true, bytes, encoded });
};`;
const server = createServer((req, res) => {
  const f = decodeURIComponent(req.url.split("?")[0]);
  if (f.startsWith("/frames/")) { res.setHeader("Content-Type", "image/png"); res.end(readFileSync(path.join(frames, path.basename(f)))); return; }
  if (f === "/worker.js") { res.setHeader("Content-Type", "text/javascript"); res.end(worker); return; }
  res.setHeader("Content-Type", "text/html"); res.end("<!doctype html><body>");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const c = await composer();
const results = [];
try {
  if (!c.browserPid) throw new Error("the composer's browser process was not found");
  for (const cfg of CONFIGS) {
    await c.page.goto(`${origin}/`);
    await c.page.evaluate(async ({ files, width, height }) => {
      window.bitmaps = await Promise.all(files.map(async (f) => createImageBitmap(await (await fetch(`/frames/${f}`)).blob(), { resizeWidth: width, resizeHeight: height })));
      window.w = new Worker("/worker.js");
    }, { files, width: cfg.width, height: cfg.height });
    const ready = await c.page.evaluate(({ codec, width, height, seconds }) => new Promise((r) => {
      window.w.onmessage = (e) => { if (e.data.ready) r(e.data); else window.result = e.data; };
      window.w.postMessage({ bitmaps: window.bitmaps, codec, width, height, seconds });
    }), { codec: cfg.codec, width: cfg.width, height: cfg.height, seconds });
    const cpu0 = processCpu(c.browserPid), t0 = Date.now();
    await c.page.waitForFunction(() => window.result?.done, null, { timeout: (seconds + 60) * 1000, polling: 500 });
    const cpu1 = processCpu(c.browserPid), wall = (Date.now() - t0) / 1000;
    const r = await c.page.evaluate(() => window.result);
    results.push({ ...cfg, supported: ready.supported, rendererMsPerS: +(((cpu1.renderer - cpu0.renderer) * 1000) / wall).toFixed(1),
      treeMsPerS: +(((cpu1.tree - cpu0.tree) * 1000) / wall).toFixed(1), kbps: r.encoded ? Math.round((r.bytes * 8) / seconds / 1000) : null, encoded: r.encoded });
    console.log(JSON.stringify(results.at(-1)));
  }
} finally {
  writeFileSync(path.join(out, "codec-cost.json"), JSON.stringify({ seconds, video: path.basename(video), results }, null, 1));
  await c.close();
  await new Promise((r) => server.close(r));
}
