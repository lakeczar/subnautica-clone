// REC-1 R3b: which video encoders this machine's Chrome offers WebCodecs in
// hardware. For each launch (the run's usual GPU flags; then Chrome's Linux
// VA-API encode features, a probe only, never shipped), and for AV1, VP9 and
// H.264 (baseline, main, high) at 1280x720 and 960x540: isConfigSupported with
// prefer-hardware (and prefer-software beside it), plus chrome://gpu's video
// encode list.
//
//   node scripts/rec/encoder-probe.mjs --out DIR [--chrome BIN] [--pw DIR]   (a gpu job: it holds the GPU)
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { composer } from "./imaging.mjs";

const args = process.argv.slice(2), arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const out = arg("out");
if (!out) { console.error("usage: encoder-probe.mjs --out DIR"); process.exit(2); }
mkdirSync(out, { recursive: true });
const CODECS = { "AV1": "av01.0.04M.08", "VP9": "vp09.00.10.08", "H.264 baseline": "avc1.42001f", "H.264 main": "avc1.4d401f", "H.264 high": "avc1.64001f" };
const SIZES = [[1280, 720], [960, 540]];
const LAUNCHES = [
  { name: "the run's flags", args: [] },
  { name: "VA-API encode features (probe only)", args: ["--enable-features=VaapiVideoEncoder,VaapiVideoDecodeLinuxGL,VaapiIgnoreDriverChecks,AcceleratedVideoEncoder"] },
];
// A secure context for WebCodecs: a page on localhost (about:blank is not one).
const server = createServer((req, res) => { res.setHeader("Content-Type", "text/html"); res.end("<!doctype html><body>"); });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}/`;
const result = { launches: [] };
for (const launch of LAUNCHES) {
  const c = await composer({ gpu: true, args: launch.args, chrome: arg("chrome"), pw: arg("pw") });
  try {
    await c.page.goto(origin);
    const support = await c.page.evaluate(async ({ CODECS, SIZES }) => {
      const rows = [];
      for (const [name, codec] of Object.entries(CODECS)) for (const [width, height] of SIZES) {
        const ask = async (hardwareAcceleration) => {
          try { return (await VideoEncoder.isConfigSupported({ codec, width, height, bitrate: 900000, framerate: 12, latencyMode: "realtime", hardwareAcceleration, ...(codec.startsWith("avc1") ? { avc: { format: "avc" } } : {}) })).supported === true; }
          catch (e) { return `error: ${e.message}`; }
        };
        rows.push({ codec: name, size: `${width}x${height}`, hardware: await ask("prefer-hardware"), software: await ask("prefer-software") });
      }
      return rows;
    }, { CODECS, SIZES });
    let gpuPage = null;
    try {
      await c.page.goto("chrome://gpu");
      await c.page.waitForTimeout(1500);
      // The page's text lives in shadow roots: gather it all.
      const text = await c.page.evaluate(() => { const walk = (n) => [...(n.shadowRoot ? walk(n.shadowRoot) : []), ...[...n.childNodes].flatMap((k) => (k.nodeType === 3 ? [k.textContent] : walk(k)))]; return walk(document.body).join("\n"); });
      const at = text.search(/Video Acceleration Information/i);
      gpuPage = { videoSection: at >= 0, video: at >= 0 ? text.slice(at, at + 3000).split("\n").map((l) => l.trim()).filter((l) => /encode|decode|profile|resolution/i.test(l)).slice(0, 40) : null,
        encodeLines: text.split("\n").map((l) => l.trim()).filter((l) => /video ?encode|vaapi|nvenc/i.test(l)).slice(0, 20) };
    } catch (e) { gpuPage = { error: e.message }; }
    result.launches.push({ name: launch.name, args: launch.args, support, gpuPage });
    console.log(JSON.stringify({ launch: launch.name, hardware: support.filter((r) => r.hardware === true).map((r) => `${r.codec} ${r.size}`) }));
  } finally { await c.close(); }
}
writeFileSync(path.join(out, "encoder-probe.json"), JSON.stringify(result, null, 1));
server.close();
