#!/usr/bin/env node
// CA-3 deep caves on a real GPU (run through scripts/heavy-check.sh):
//
//   scripts/heavy-check.sh --deadline 1500 node tools/cave-deep-shots.mjs [port] [outDir]
//
// Serves the repo with Vite on a task-owned loopback port, launches a
// task-owned headless Chrome on ANGLE GL-EGL (the RTX 3090 on factory-worker)
// and, for every Rift, Divide and Meridian cave, opens tools/cave-lab-deep.html
// and captures the approach in daylight with the lamp on, and the main room
// with the lamp off (the exit glow and the cue layer), recording the renderer
// and any page or GL errors. Everything opened here is closed at the end.
// Env: CAVE_GPU_PLAYWRIGHT (playwright-core dir), CAVE_GPU_CHROME (binary).
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "vite";

const port = Number(process.argv[2] ?? 5371), out = process.argv[3] ?? "docs/build/streams/ca-3";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CAVE_GPU_PLAYWRIGHT ?? "/work/tmp/gpu-enable/node_modules/playwright-core");
const chrome = process.env.CAVE_GPU_CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
const only = process.env.CAVES ? process.env.CAVES.split(",") : null;

mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port, strictPort: true, host: "127.0.0.1" }, logLevel: "warn" });
await server.listen();
const browser = await chromium.launch({ executablePath: chrome, headless: true,
  args: ["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist", "--cave-deep-shots"] });
const record = { renderer: null, caves: [], errors: [] };
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", e => record.errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.location()?.url ?? "")) record.errors.push(`${m.text()} ${m.location()?.url ?? ""}`); });
  const { DEEP_CAVES } = await server.ssrLoadModule("/src/content/regions/caves/deep.ts");
  for (const c of DEEP_CAVES) {
    const id = c.source.id;
    if (only && !only.includes(id)) continue;
    const started = Date.now();
    await page.goto(`http://127.0.0.1:${port}/tools/cave-lab-deep.html?cave=${id}&hud=0&loop=message&overlay=cues`);
    await page.waitForFunction(() => window.caveLab && Number(document.querySelector("canvas").dataset.frame) > 8, null, { timeout: 180000 });
    if (!record.renderer) record.renderer = await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2"), info = gl.getExtension("WEBGL_debug_renderer_info");
      return String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    });
    const shots = [];
    const TAGS = (process.env.TAGS ?? "daylight,lamp-off").split(",");
    for (const [view, lamp, tag] of [["approach", true, "daylight"], ["inside", false, "lamp-off"], ["inside", true, "lamp-on"]].filter(([, , tag]) => TAGS.includes(tag))) {
      await page.evaluate(async ([v, l]) => { await window.caveLab.show(v, l); await window.caveLab.settle(6); }, [view, lamp]);
      const file = `${out}/${id}-${tag}.jpg`;
      await page.screenshot({ path: file, type: "jpeg", quality: 82 });
      shots.push(file);
    }
    const frameMs = await page.evaluate(async () => {
      const t = performance.now(), f0 = Number(document.querySelector("canvas").dataset.frame);
      await window.caveLab.settle(30);
      return (performance.now() - t) / (Number(document.querySelector("canvas").dataset.frame) - f0);
    });
    record.caves.push({ id, shots, loadMs: Date.now() - started, frameMs: +frameMs.toFixed(2) });
    process.stdout.write(`${id}: ${shots.length} shots, ${(Date.now() - started) / 1000}s, ${frameMs.toFixed(1)} ms/frame (message loop)\n`);
  }
  await page.close();
  failed = record.errors.length > 0;
} catch (e) {
  record.errors.push(String(e?.stack ?? e)); failed = true;
} finally {
  await browser.close();
  await server.close();
  writeFileSync(`${out}/shots.json`, JSON.stringify(record, null, 2));
  process.stdout.write(`renderer: ${record.renderer}\nerrors: ${record.errors.length}\n`);
  if (failed) { process.stdout.write(record.errors.slice(0, 5).join("\n") + "\n"); process.exitCode = 1; }
}
