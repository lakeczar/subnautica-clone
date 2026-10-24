// REC-1 R3b: which video encoders this machine's Chrome really offers WebCodecs
// (BROWSER-HW-VIDEO-ENCODE-SOL §10, probes 1 and 3).
//
//   node scripts/rec/encoder-probe.mjs --out DIR [--launch NAME=FLAGS ...] [--env K=V ...] [--chrome BIN] [--pw DIR]   (a gpu job)
//
// For each launch (by default the run's own GPU flags; more with --launch, e.g.
// "vaapi=--enable-features=AcceleratedVideoEncoder"):
// - Chrome's version, the launch's flags, chrome://gpu's video-encode lines;
// - isConfigSupported, asked inside a Worker as the recorder does, for AV1,
//   VP9, VP8, HEVC and H.264 baseline/main/high, at 1280x720 and 960x540,
//   12 fps, VBR and CBR, with prefer-hardware, no-preference and prefer-software;
// - every hardware positive (and one software control) gets a real trial: 60
//   pictures from a WebGL canvas, outputs counted against inputs, a first key
//   frame, one final flush, and Chrome's own media log for the encoder that
//   ran (kVideoEncoderName, kIsPlatformVideoEncoder) where it shows them.
// Writes DIR/encoder-probe.json.
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { composer } from "./imaging.mjs";

const args = process.argv.slice(2), arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const out = arg("out");
if (!out) { console.error("usage: encoder-probe.mjs --out DIR [--launch NAME=FLAGS ...]"); process.exit(2); }
mkdirSync(out, { recursive: true });
const CODECS = { "AV1": "av01.0.05M.08", "VP9": "vp09.00.31.08", "VP8": "vp8", "HEVC main": "hvc1.1.6.L93.B0",
  "H.264 baseline": "avc1.42001f", "H.264 main": "avc1.4d401f", "H.264 high": "avc1.64001f" };
const SIZES = [[1280, 720], [960, 540]];
const LAUNCHES = [{ name: "the run's flags", args: [] }];
for (let i = 0; i < args.length; i++) if (args[i] === "--launch") { const [name, ...flags] = args[i + 1].split("="); LAUNCHES.push({ name, args: [flags.join("=")].filter(Boolean) }); }
// --env K=V (repeatable): environment for every launch (e.g. LIBVA_DRIVER_NAME=d3d12 on WSL).
const ENV = Object.fromEntries(args.flatMap((a, i) => (a === "--env" ? [args[i + 1].split(/=(.*)/s).slice(0, 2)] : [])));

const WORKER = `onmessage = async ({ data: { codecs, sizes } }) => {
  const rows = [];
  const extra = (codec) => codec.startsWith("avc1") ? { avc: { format: "avc" } } : codec.startsWith("hvc1") ? { hevc: { format: "hevc" } } : {};
  for (const [name, codec] of Object.entries(codecs)) for (const [width, height] of sizes) for (const bitrateMode of ["variable", "constant"]) {
    const row = { codec: name, string: codec, size: width + "x" + height, bitrateMode };
    for (const hardwareAcceleration of ["prefer-hardware", "no-preference", "prefer-software"]) {
      try { row[hardwareAcceleration] = (await VideoEncoder.isConfigSupported({ codec, width, height, bitrate: 900000, framerate: 12, latencyMode: "realtime", bitrateMode, hardwareAcceleration, ...extra(codec) })).supported === true; }
      catch (e) { row[hardwareAcceleration] = "error: " + e.message; }
    }
    rows.push(row);
  }
  postMessage(rows);
};`;
const PAGE = `<!doctype html><canvas id=c width=1280 height=720></canvas><script>
window.trial = async (cfg) => {
  const gl = document.getElementById("c").getContext("webgl2", { preserveDrawingBuffer: false });
  let outputs = 0, firstKey = null, bytes = 0, error = null;
  const enc = new VideoEncoder({ output: (chunk) => { outputs++; bytes += chunk.byteLength; if (firstKey === null) firstKey = chunk.type === "key"; }, error: (e) => { error = e.message; } });
  try { enc.configure(cfg); } catch (e) { return { error: "configure: " + e.message }; }
  const t0 = performance.now();
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    gl.clearColor((i % 12) / 12, 0.4, 1 - (i % 7) / 7, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    const f = new VideoFrame(gl.canvas, { timestamp: i * 83333, alpha: "discard" });
    try { enc.encode(f, { keyFrame: i % 24 === 0 }); } catch (e) { error = "encode: " + e.message; } finally { f.close(); }
  }
  try { await enc.flush(); } catch (e) { error = error ?? "flush: " + e.message; }
  try { enc.close(); } catch {}
  return { inputs: 60, outputs, firstKey, bytes, error, ms: Math.round(performance.now() - t0) };
};
</script>`;
const server = createServer((req, res) => {
  if (req.url.startsWith("/w.js")) { res.setHeader("Content-Type", "text/javascript"); res.end(WORKER); return; }
  res.setHeader("Content-Type", "text/html"); res.end(PAGE);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}/`;
const result = { launches: [] };
try {
  for (const launch of LAUNCHES) {
    const c = await composer({ gpu: true, args: launch.args, env: Object.keys(ENV).length ? ENV : undefined, chrome: arg("chrome"), pw: arg("pw") });
    try {
      const cdp = await c.page.context().newCDPSession(c.page);
      const version = await cdp.send("Browser.getVersion");
      await c.page.goto(origin);
      const support = await c.page.evaluate(({ codecs, sizes }) => new Promise((resolve) => { const w = new Worker("/w.js"); w.onmessage = (e) => resolve(e.data); w.postMessage({ codecs, sizes }); }), { codecs: CODECS, sizes: SIZES });
      // Trials: every hardware positive at 720p (first rate mode that works), and one software control.
      const media = [];
      await cdp.send("Media.enable").catch(() => {});
      cdp.on("Media.playerPropertiesChanged", (e) => media.push(...(e.properties ?? []).map((p) => ({ player: e.playerId, name: p.name, value: p.value }))));
      cdp.on("Media.playerEventsAdded", (e) => media.push(...(e.events ?? []).map((x) => ({ player: e.playerId, event: x.value }))));
      const trials = [];
      const seen = new Set();
      const extra = (codec) => (codec.startsWith("avc1") ? { avc: { format: "avc" } } : codec.startsWith("hvc1") ? { hevc: { format: "hevc" } } : {});
      const picks = support.filter((r) => r["prefer-hardware"] === true && r.size === "1280x720");
      const control = support.find((r) => r.codec === "VP9" && r.size === "960x540" && r["prefer-software"] === true);
      for (const [row, pref] of [...picks.map((r) => [r, "prefer-hardware"]), ...(control ? [[control, "prefer-software"]] : [])]) {
        const key = `${row.codec}|${row.size}|${pref}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const [width, height] = row.size.split("x").map(Number);
        const before = media.length;
        const cfg = { codec: row.string, width, height, bitrate: 900000, framerate: 12, latencyMode: "realtime", bitrateMode: row.bitrateMode, hardwareAcceleration: pref, ...extra(row.string) };
        const t = await c.page.evaluate((cfg) => window.trial(cfg), cfg).catch((e) => ({ error: e.message }));
        await c.page.waitForTimeout(300);
        const log = media.slice(before).filter((m) => /Encoder|encoder|Platform|hardware/i.test(`${m.name ?? ""} ${JSON.stringify(m.value ?? m.event ?? "")}`)).slice(0, 12);
        const named = log.find((m) => m.name === "kVideoEncoderName")?.value ?? null, platform = log.find((m) => m.name === "kIsPlatformVideoEncoder")?.value ?? null;
        trials.push({ codec: row.codec, size: row.size, bitrateMode: row.bitrateMode, preference: pref, ...t, encoderName: named, platformEncoder: platform,
          identity: platform === true || platform === "true" ? "hardware-confirmed" : pref === "prefer-hardware" && t.outputs > 0 ? "hardware-request-succeeded, diagnostics unavailable" : pref === "prefer-hardware" ? "failed" : "software control", log });
      }
      // chrome://gpu's video-encode lines (the page keeps its text in shadow roots).
      let gpuPage = null;
      try {
        await c.page.goto("chrome://gpu");
        await c.page.waitForTimeout(1500);
        const text = await c.page.evaluate(() => { const walk = (n) => [...(n.shadowRoot ? walk(n.shadowRoot) : []), ...[...n.childNodes].flatMap((k) => (k.nodeType === 3 ? [k.textContent] : walk(k)))]; return walk(document.body).join("\n"); });
        const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
        const at = lines.findIndex((l) => /^Video Acceleration Information/i.test(l));
        gpuPage = { encodeLines: lines.filter((l) => /video ?encode|accelerated video encode/i.test(l)).slice(0, 12), videoAcceleration: at >= 0 ? lines.slice(at, at + 40).filter((l) => /encode|profile/i.test(l)) : null,
          glRenderer: lines.find((l) => /^GL_RENDERER/.test(l)) ?? null };
      } catch (e) { gpuPage = { error: e.message }; }
      result.launches.push({ name: launch.name, args: launch.args, env: ENV, chrome: version.product, revision: version.revision, userAgent: version.userAgent, support, trials, gpuPage });
      console.log(JSON.stringify({ launch: launch.name, chrome: version.product, hardware: support.filter((r) => r["prefer-hardware"] === true).map((r) => `${r.codec} ${r.size} ${r.bitrateMode}`),
        trials: trials.map((t) => `${t.codec} ${t.preference}: ${t.outputs ?? 0}/60 ${t.identity}${t.error ? ` (${t.error})` : ""}`) }));
    } finally { await c.close(); }
  }
} finally {
  writeFileSync(path.join(out, "encoder-probe.json"), JSON.stringify(result, null, 1));
  server.close();
}
