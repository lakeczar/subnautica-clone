#!/usr/bin/env node
// LC large-cave lab on the RTX 3090 (run through scripts/heavy-check.sh; one
// GPU job at a time):
//
//   scripts/heavy-check.sh --deadline 900 node tools/large-cave-lab.gpu.mjs <port> <outdir> [shots|measure|drive|all]
//
// Serves the repo with Vite on a task-owned loopback port and launches a
// task-owned headless Chrome on ANGLE GL-EGL. Needs a bake
// (tools/large-cave-lab.bake.mjs).
// - shots:   one PNG per lab bookmark (lamp on), plus lamp-off and coarse-only views.
// - measure: cold entry (load, collision, first frame, readiness), then the
//            Dart at boost along the craft loop and the west loop, the Creel
//            along the craft loop, and a diver through the squeeze, with frame,
//            step and residency numbers and the coverage invariant.
// - drive:   one ordinary-control run: real key presses and mouse drags.
// Writes <outdir>/lc-gpu.json. Closes everything it opened.
// Env: LC_PLAYWRIGHT (playwright-core dir), LC_CHROME (binary).
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "vite";

const port = Number(process.argv[2] ?? 5288), out = process.argv[3] ?? "/work/tmp/lc/gpu", what = process.argv[4] ?? "all";
mkdirSync(out, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.LC_PLAYWRIGHT ?? "/work/tmp/gpu-enable/node_modules/playwright-core");
const chrome = process.env.LC_CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
const server = await createServer({ server: { port, strictPort: true, host: "127.0.0.1", hmr: false, watch: null }, logLevel: "warn" });
await server.listen();
const browser = await chromium.launch({ executablePath: chrome, headless: true,
  args: ["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist", "--lc-large-cave-lab"] });
const result = { what, errors: [] };
let failed = false;
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const open = async (query) => {
    const page = await context.newPage();
    page.on("pageerror", e => result.errors.push(String(e)));
    page.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.location()?.url ?? "")) result.errors.push(m.text().slice(0, 300)); });
    await page.goto(`http://127.0.0.1:${port}/tools/large-cave-lab.html?${query}`);
    try {
      await page.waitForFunction(() => window.lcLab && Number(document.querySelector("canvas").dataset.frame) > 5, null, { timeout: 180000 });
    } catch (e) {
      const note = await page.evaluate(() => document.getElementById("note")?.textContent ?? null).catch(() => null);
      throw new Error(`lab did not start: ${e.message}; note: ${note}; errors: ${result.errors.join(" | ")}`);
    }
    return page;
  };
  if (what === "shots" || what === "all") {
    const page = await open("hud=0&mode=free");
    result.renderer = await page.evaluate(() => { const g = document.createElement("canvas").getContext("webgl2"); const e = g.getExtension("WEBGL_debug_renderer_info"); return g.getParameter(e.UNMASKED_RENDERER_WEBGL); });
    const views = await page.evaluate(() => Object.keys(window.lcLab.VIEWS));
    result.shots = [];
    for (const [i, v] of views.entries()) {
      await page.evaluate(v => window.lcLab.show(v, true), v);
      await page.waitForFunction(() => window.lcLab.residency.stats?.settled, null, { timeout: 60000 }).catch(() => {});
      await page.evaluate(() => window.lcLab.settle(20));
      const file = `${String(i + 1).padStart(2, "0")}-${v}.png`;
      await page.screenshot({ path: join(out, file) });
      result.shots.push(file);
    }
    for (const [v, lamp, name] of [["hall", false, "hall-lamp-off"], ["gallery", false, "gallery-lamp-off"], ["garden", false, "garden-lamp-off"]]) {
      await page.evaluate(([v, l]) => window.lcLab.show(v, l), [v, lamp]);
      await page.evaluate(() => window.lcLab.settle(20));
      await page.screenshot({ path: join(out, `${name}.png`) }); result.shots.push(`${name}.png`);
    }
    await page.close();
  }
  if (what === "measure" || what === "all") {
    // Cold entry: a fresh page, the Dart held at the hollow until the cave is drawn.
    const page = await open("hud=0&mode=dart");
    await page.waitForFunction(() => window.lcLab.readyMs !== null, null, { timeout: 120000 });
    result.cold = await page.evaluate(() => ({ ...window.lcLab.load, readyMs: window.lcLab.readyMs }));
    result.runs = [];
    for (const [route, mode, speed] of [["canopy_roots.route.craft_loop", "dart", 11], ["canopy_roots.route.west_loop", "dart", 11],
      ["canopy_roots.route.craft_loop", "creel", 6.5], ["canopy_roots.route.squeeze", "diver", 5.2], ["canopy_roots.route.pool_spur", "dart", 16]]) {
      const start = await page.evaluate(([r, m, s]) => { const lab = window.lcLab; lab.stepCost.calls = 0; lab.stepCost.us = 0; lab.stepCost.maxUs = 0;
        lab.coverage.frames = 0; lab.coverage.failures = 0; lab.coverage.first = ""; lab.autopilot(r, m, s); return lab.frameCount(); }, [route, mode, speed]);
      const t = Date.now();
      await page.waitForFunction(() => window.lcLab.state.autopilot === null, null, { timeout: 240000 }).catch(() => {});
      const report = await page.evaluate(f => window.lcLab.report(f), start);
      const end = await page.evaluate(() => ({ ...window.lcLab.state.position }));
      result.runs.push({ route, mode, speed, seconds: (Date.now() - t) / 1000, finished: await page.evaluate(() => window.lcLab.state.autopilot === null), end, ...report });
    }
    await page.screenshot({ path: join(out, "measure-end.png") });
    await page.close();
  }
  if (what === "drive" || what === "all") {
    // Ordinary control: from the shelf, keys and drags only.
    const page = await open("mode=dart");
    await page.waitForFunction(() => window.lcLab.readyMs !== null, null, { timeout: 120000 });
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    const drag = async (dx, dy) => { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 }); await page.mouse.up(); };
    const log = [];
    const snap = async (label) => log.push({ label, ...(await page.evaluate(() => ({ p: window.lcLab.state.position, held: window.lcLab.state.held, cov: { ...window.lcLab.coverage } }))) });
    await snap("start");
    // Ordinary control, closed loop: every 200 ms read what a player sees
    // (position and heading), then steer with a mouse drag towards the next
    // landmark of the craft loop while holding W and Shift.
    const route = await page.evaluate(() => window.lcLab.cave.source.routes.find(r => r.id === "canopy_roots.route.craft_loop").path);
    await page.keyboard.down("Shift"); await page.keyboard.down("w");
    let wp = 1;
    const started = Date.now();
    while (wp < route.length && Date.now() - started < 90000) {
      const s = await page.evaluate(() => ({ p: window.lcLab.state.position, yaw: window.lcLab.state.yaw, pitch: window.lcLab.state.pitch }));
      const g = route[wp], dx = g.x - s.p.x, dy = g.y - (s.p.y + 1), dz = g.z - s.p.z, l = Math.hypot(dx, dy, dz);
      if (l < 4) { wp++; await snap(`waypoint ${wp - 1}`); continue; }
      let dyaw = Math.atan2(dx, -dz) - s.yaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      const dpitch = Math.atan2(dy, Math.hypot(dx, dz)) - s.pitch;
      if (Math.abs(dyaw) > 0.02 || Math.abs(dpitch) > 0.02) await drag(Math.max(-300, Math.min(300, dyaw / 0.004)), Math.max(-300, Math.min(300, -dpitch / 0.004)));
      await page.waitForTimeout(200);
    }
    await page.keyboard.up("w"); await page.keyboard.up("Shift");
    await snap("end");
    result.drive = { reachedWaypoints: wp - 1, of: route.length - 1, seconds: (Date.now() - started) / 1000 };
    await page.screenshot({ path: join(out, "drive-end.png") });
    result.drive = { ...result.drive, log, report: await page.evaluate(() => window.lcLab.report()) };
    await page.close();
  }
  failed = result.errors.length > 0 || (result.runs ?? []).some(r => r.coverage.failures > 0) || (result.drive?.report.coverage.failures ?? 0) > 0;
} finally {
  await browser.close();
  await server.close();
}
result.ok = !failed;
writeFileSync(join(out, "lc-gpu.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ok: result.ok, errors: result.errors.slice(0, 5), cold: result.cold, runs: result.runs?.map(r => ({ route: r.route, mode: r.mode, finished: r.finished, dt: r.dt, cpu: r.cpu, gpuMs: r.gpuMs, step: r.step, coverage: r.coverage })) }, null, 2));
process.exit(failed ? 1 : 0);
