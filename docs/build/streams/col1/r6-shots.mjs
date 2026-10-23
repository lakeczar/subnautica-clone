// COL-1 before/after (R6, R7): the same camera at each cave's largest surface change, in each tree.
// Run through scripts/heavy-check.sh --class gpu (holds the GPU lease). One task-owned Vite server per
// tree on a loopback port and one task-owned headless Chrome (ANGLE GL-EGL); all closed at the end.
// usage: [TREES=tag:root,...] [LOD=fine|coarse] node r6-shots.mjs <views.json from r6-camera.mjs> <outDir>
// (defaults: before = the pre-R6 tree, after = this worktree; fine). R7's coarse strips: TREES=preR6:...,R6:...,R7:... LOD=coarse.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const REPO = "/home/worker/.t3/worktrees/subnautica-clone/t3-74e12f2f";
const TREES = (process.env.TREES ?? `before:/work/tmp/col1-pre,after:${REPO}`).split(",").map(t => t.split(":"));
const LOD = process.env.LOD ?? "fine";
const [viewsFile, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const req = createRequire(REPO + "/package.json");
const { createServer } = await import(pathToFileURL(req.resolve("vite")).href);
const { requireGpuLease } = await import(pathToFileURL(REPO + "/scripts/heavy/gpu-lease.mjs").href);
const { chromium } = createRequire("/work/tmp/gpu-enable/")("/work/tmp/gpu-enable/node_modules/playwright-core");
requireGpuLease("col1 shots");
const views = JSON.parse(readFileSync(viewsFile, "utf8")).filter(v => v.view);
const LAB = { deep: "cave-lab-deep", authored: "cave-lab", "canopy-basin": "cave-lab-canopy-basin" };
const record = { renderer: null, shots: [], errors: [] };
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`,
  headless: true, args: ["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist", "--col1-shots-r6"] });
let port = 5391;
try {
  for (const [tag, root] of TREES) {
    const server = await createServer({ root, configFile: `${root}/vite.config.ts`, cacheDir: `/work/tmp/col1/vite-cache-${tag}`, server: { port: ++port, strictPort: true, host: "127.0.0.1" }, logLevel: "warn" });
    await server.listen();
    try {
      const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
      page.on("pageerror", e => record.errors.push(`${tag}: ${e.message}`));
      page.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.location()?.url ?? "")) record.errors.push(`${tag}: ${m.text()}`); });
      for (const v of views) {
        await page.goto(`http://127.0.0.1:${port}/tools/${LAB[v.lab]}.html?cave=${v.id}&hud=0&loop=message&collide=0&overlay=none&lod=${LOD}&lamp=1`, { waitUntil: "load", timeout: 180000 });
        await page.waitForFunction(() => window.caveLab && [...document.querySelectorAll("canvas")].some(c => Number(c.dataset.frame ?? 0) > 8), null, { timeout: 180000 });
        record.renderer ??= await page.evaluate(() => { const gl = document.createElement("canvas").getContext("webgl2"), i = gl?.getExtension("WEBGL_debug_renderer_info"); return i ? gl.getParameter(i.UNMASKED_RENDERER_WEBGL) : null; });
        const ok = await page.evaluate(async ({ lab, cam, at, lod }) => {
          const L = window.caveLab, obj = lab === "canopy-basin";
          L.VIEWS.r6 = obj ? { label: "R6", pos: { x: cam[0], y: cam[1], z: cam[2] }, at: { x: at[0], y: at[1], z: at[2] } } : { label: "R6", pos: cam, at };
          await L.show("r6", true, lod);
          if (L.settle) await L.settle(8); else await new Promise(r => setTimeout(r, 800));
          const p = L.camera.position;
          return [p.x, p.y, p.z].map(x => +x.toFixed(2));
        }, { lab: v.lab, cam: v.view.cam, at: v.at, lod: LOD });
        const file = `${out}/${v.id}-${tag}.png`;
        await page.screenshot({ path: file });
        record.shots.push({ id: v.id, tag, file, camera: ok });
      }
      await page.close();
    } finally { await server.close(); }
  }
} catch (e) { record.errors.push(String(e?.stack ?? e)); process.exitCode = 1; }
finally { await browser.close(); }
writeFileSync(`${out}/shots.json`, JSON.stringify(record, null, 2));
console.log(JSON.stringify({ renderer: record.renderer, shots: record.shots.length, errors: record.errors.slice(0, 6) }, null, 1));
