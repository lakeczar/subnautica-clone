#!/usr/bin/env node
// W1 cave lamp check on a real GPU (run through scripts/heavy-check.sh).
//
//   scripts/heavy-check.sh --deadline 600 node tools/cave-gpu-check.mjs [port] [out.json]
//
// Serves the repo with Vite on a task-owned loopback port, launches a
// task-owned headless Chrome on ANGLE GL-EGL (the RTX 3090 on factory-worker),
// opens tools/cave-lab.html and:
// 1. runs the production `lampVisible` GLSL (`caveLab.lampProbe`) on the R1
//    blocked rays, the clear mouth/skylight rays and ~3,000 shell rays, and
//    requires every answer to equal the CPU walk (`lampVisible` in
//    lightField.ts), with blocked controls blocked and clear controls lit;
// 2. renders the vault through the spliced cel material with the lamp on and
//    off, requiring no page or GL errors and a visibly lit lamp frame.
// Env: CAVE_GPU_PLAYWRIGHT (playwright-core dir), CAVE_GPU_CHROME (binary).
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { createServer } from "vite";

const port = Number(process.argv[2] ?? 5243), out = process.argv[3];
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CAVE_GPU_PLAYWRIGHT ?? "/work/tmp/gpu-enable/node_modules/playwright-core");
const chrome = process.env.CAVE_GPU_CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;

const server = await createServer({ server: { port, strictPort: true, host: "127.0.0.1" }, logLevel: "warn" });
await server.listen();
const browser = await chromium.launch({ executablePath: chrome, headless: true,
  args: ["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist", "--cave-gpu-check"] });
let result, failed = true;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.location()?.url ?? "")) errors.push(`${m.text()} ${m.location()?.url ?? ""}`); });
  await page.goto(`http://127.0.0.1:${port}/tools/cave-lab.html?view=vault&lamp=1&hud=0`);
  await page.waitForFunction(() => window.caveLab && Number(document.querySelector("canvas").dataset.frame) > 10, null, { timeout: 120000 });
  result = await page.evaluate(async () => {
    const lab = window.caveLab, field = lab.field, def = lab.def;
    const { lampVisible } = await import("/src/render/caves/lightField.ts");
    const { caveShell } = await import("/src/content/regions/caveGeometry.ts");
    const { CLEAR, R1_LEAKS } = await import("/tests/cave-light-controls.ts");
    const P = a => ({ x: a[0], y: a[1], z: a[2] });
    const rays = [], kinds = [];
    for (const [p, lamp] of R1_LEAKS) { rays.push({ p: P(p), lamp: P(lamp) }); kinds.push("blocked"); }
    for (const [lamp, targets] of CLEAR) for (const t of targets) { rays.push({ p: t, lamp }); kinds.push("clear"); }
    const shell = caveShell(def, "fine"), lamps = def.routes.flatMap(r => r.path).map(p => ({ ...p, y: p.y + 0.6 }));
    for (let v = 0; v < shell.positions.length / 3 && rays.length < 3200; v += 37) {
      const n = [0, 1, 2].map(k => shell.normals[v * 3 + k]);
      const p = { x: shell.positions[v * 3] + n[0] * 0.3, y: shell.positions[v * 3 + 1] + n[1] * 0.3, z: shell.positions[v * 3 + 2] + n[2] * 0.3 };
      for (const lamp of lamps) {
        const d = [lamp.x - p.x, lamp.y - p.y, lamp.z - p.z], len = Math.hypot(...d);
        if (len < 0.5 || len > 22 || d[0] * n[0] + d[1] * n[1] + d[2] * n[2] <= 0) continue;
        rays.push({ p, lamp }); kinds.push("shell");
      }
    }
    const gpu = lab.lampProbe(rays);
    const cpu = rays.map(r => lampVisible(field.rock, r.p, r.lamp) ? 1 : 0);
    const mismatches = [];
    rays.forEach((r, i) => { if (gpu.values[i] !== cpu[i]) mismatches.push({ ...r, kind: kinds[i], gpu: gpu.values[i], cpu: cpu[i] }); });
    const controls = {
      blocked: kinds.map((k, i) => k === "blocked" ? gpu.values[i] : null).filter(v => v !== null),
      clear: kinds.map((k, i) => k === "clear" ? gpu.values[i] : null).filter(v => v !== null),
    };
    // The real material path: the vault, lamp on and off.
    const engine = lab.scene.getEngine(), frame = async () => { await lab.settle(6); return new Uint8Array(await engine.readPixels(0, 0, engine.getRenderWidth(), engine.getRenderHeight())); };
    const mean = px => { let s = 0; for (let i = 0; i < px.length; i += 4) s += px[i] + px[i + 1] + px[i + 2]; return s / (px.length / 4) / 3; };
    await lab.show("vault", true); const on = mean(await frame());
    await lab.show("vault", false); const off = mean(await frame());
    return { renderer: gpu.renderer, glError: gpu.error, rays: rays.length, shellRays: kinds.filter(k => k === "shell").length,
      blockedByGpu: gpu.values.filter(v => v === 0).length, mismatches: mismatches.slice(0, 20), mismatchCount: mismatches.length,
      controls, vaultMean: { lampOn: on, lampOff: off } };
  });
  result.pageErrors = errors;
  failed = result.mismatchCount > 0 || result.glError !== 0 || errors.length > 0 || !/NVIDIA|RTX/i.test(result.renderer) ||
    result.controls.blocked.some(v => v !== 0) || result.controls.clear.some(v => v !== 1) || !(result.vaultMean.lampOn > result.vaultMean.lampOff * 1.15);
} finally {
  await browser.close();
  await server.close();
}
result.ok = !failed;
const text = JSON.stringify(result, null, 2);
if (out) writeFileSync(out, text);
console.log(text);
process.exit(failed ? 1 : 0);
