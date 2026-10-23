// REC-1 driver browser: one task-owned headless Chrome on the GPU (ANGLE
// GL-EGL on factory-worker; the sandbox's own wrapper on alickers), the built
// game served from `dist` on a loopback port, a save imported through the menu
// like a player's backup, and ordinary keys only, steered closed-loop from the
// test hook (window.__siltwake.read(): camera, yaw, pitch) instead of DOM text.
// Follows docs/BROWSER_RULES.md: own profile, own port, closes what it opens.
//
// The server sends COOP/COEP by default, so the page is cross-origin isolated:
// performance.now() is precise to 5 µs instead of 100 µs, and the browser's
// memory API is available. `isolate: false` serves it as a plain static host.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".wasm": "application/wasm", ".bin": "application/octet-stream", ".webm": "video/webm", ".jpg": "image/jpeg", ".png": "image/png" };
const wrap = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
export const DEFAULT_CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
export const DEFAULT_PW = process.env.REC_PW ?? "/work/tmp/gpu-prep/pw/";

export class Blocked extends Error {}

/** A static server for `root`; resolves to { port, close }. */
export async function serve(root, port, { isolate = true } = {}) {
  root = path.resolve(root);
  const server = createServer((req, res) => {
    const rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const file = path.resolve(root, "." + (rel.endsWith("/") ? rel + "index.html" : rel));
    if (!file.startsWith(root + path.sep) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store",
      ...(isolate ? { "cross-origin-opener-policy": "same-origin", "cross-origin-embedder-policy": "require-corp" } : {}) });
    res.end(readFileSync(file));
  });
  await new Promise((r, j) => { server.once("error", j); server.listen(Number(port), "127.0.0.1", r); });
  return { port: server.address().port, close: () => new Promise((r) => server.close(r)) };
}

/** The browser's own PID, found by a unique flag on its command line. */
function findBrowserPid(label) {
  return readdirSync("/proc").filter((d) => /^\d+$/.test(d)).map(Number).find((p) => {
    try { const c = readFileSync(`/proc/${p}/cmdline`, "utf8"); return c.includes(`--siltwake-rec=${label}`) && !c.includes("--type="); } catch { return false; }
  }) ?? null;
}

/**
 * Launches the task's Chrome. opts: { chrome (binary; a wrapper that sets its
 * own GPU flags, like alickers' siltwake-chrome, gets none of ours), pw, label,
 * width, height, software (SwiftShader: no GPU, for packing and tests only) }.
 */
export async function launch(opts = {}) {
  const { chromium } = createRequire(opts.pw ?? DEFAULT_PW)("playwright-core");
  const chrome = opts.chrome ?? DEFAULT_CHROME, wrapper = chrome !== DEFAULT_CHROME && !chrome.includes("ms-playwright");
  const label = `${opts.label ?? "rec"}-${process.pid}-${Math.random().toString(36).slice(2, 7)}`;
  const gpuFlags = opts.software ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : wrapper ? [] : ["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist"];
  const browser = await chromium.launch({
    executablePath: chrome, headless: true, timeout: 30000,
    ...(wrapper ? { ignoreDefaultArgs: ["--enable-unsafe-swiftshader"] } : {}),
    args: [...gpuFlags, "--enable-precise-memory-info", `--siltwake-rec=${label}`],
  });
  const context = await browser.newContext({ viewport: { width: opts.width ?? 1280, height: opts.height ?? 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  return { browser, context, page, cdp, label, pid: findBrowserPid(label), version: browser.version(), close: () => browser.close().catch(() => {}) };
}

/** The game's renderer string (WEBGL_debug_renderer_info). */
export const rendererOf = (page) => page.evaluate(() => {
  const c = document.createElement("canvas").getContext("webgl2"), e = c?.getExtension("WEBGL_debug_renderer_info");
  return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : "unknown";
});

/** Opens the game at `url`, imports `save` through the menu, waits until it plays. Returns timings (ms). */
export async function openGame(page, url, save, { gpu } = {}) {
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  const renderer = await rendererOf(page);
  if (gpu && !new RegExp(gpu).test(renderer)) throw new Error(`renderer ${renderer} is not ${gpu}`);
  await page.waitForFunction(() => document.querySelector("#ocean")?.dataset.graphics === "available" && !!window.__siltwake, null, { timeout: 60000 });
  await page.locator("#new-game").waitFor({ state: "visible", timeout: 60000 });
  const title = Date.now() - t0;
  await page.locator("#import-file").setInputFiles(save);
  await page.waitForTimeout(300);
  if (await page.locator("#confirmation").isVisible().catch(() => false)) await page.locator("#confirm-accept").click();
  await page.waitForFunction(() => { const r = window.__siltwake.read(); return !!r && r.ready && !document.querySelector("#hud")?.hidden; }, null, { timeout: 120000 });
  // A save at the very start plays the pod opening; a player skips it by holding Space.
  if ((await read(page)).phase < 4) { await page.keyboard.down("Space"); await page.waitForTimeout(1300); await page.keyboard.up("Space"); }
  await page.waitForFunction(() => window.__siltwake.read()?.ready === true, null, { timeout: 120000 });
  await page.locator("#ocean").click();
  await page.waitForTimeout(500);
  return { renderer, titleMs: title, playableMs: Date.now() - t0 };
}

export const read = (page) => page.evaluate(() => window.__siltwake.read());

/** Ordinary keys, closed loop on the hook's camera, yaw and pitch. */
export function pilot(page) {
  const held = new Set();
  const key = async (k, on) => { if (on && !held.has(k)) { held.add(k); await page.keyboard.down(k); } else if (!on && held.has(k)) { held.delete(k); await page.keyboard.up(k); } };
  const releaseAll = async () => { for (const k of [...held]) await key(k, false); };
  let eye = null;
  /** Travel to `t` ({x,y,z}, feet); snagged: back off and lift up to 3 times; no progress for `stallS`: Blocked (or false with `soft`). */
  async function goto(t, { tol = 4, label = "", boost = true, timeoutS = 120, stallS = 12, soft = true, stop = () => false } = {}) {
    const start = Date.now();
    let best = Infinity, bestAt = start, recoveries = 0;
    for (;;) {
      if (stop()) { await releaseAll(); return false; }
      const s = await read(page);
      eye ??= s.camera[1] - s.feet[1];
      const p = { x: s.feet[0], y: s.feet[1], z: s.feet[2] }, dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z, h = Math.hypot(dx, dz), d3 = Math.hypot(h, dy);
      if (d3 <= tol) { await releaseAll(); return true; }
      if (d3 < best - 0.3) { best = d3; bestAt = Date.now(); }
      if (Date.now() - bestAt > 5000 && recoveries < 3) {
        recoveries++;
        await releaseAll(); await key("KeyS", true); await key("Space", true); await page.waitForTimeout(1200); await releaseAll();
        bestAt = Date.now(); best = Infinity; continue;
      }
      if (Date.now() - bestAt > stallS * 1000 || Date.now() - start > timeoutS * 1000) {
        await releaseAll();
        const why = `stalled ${d3.toFixed(1)} m short of ${label} at ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`;
        if (soft) return false;
        throw new Blocked(why);
      }
      const yaw = s.yaw * Math.PI / 180, want = h > 1.5 ? Math.atan2(dx, -dz) : yaw, err = wrap(want - yaw);
      await key("ArrowRight", err > 0.04); await key("ArrowLeft", err < -0.04);
      await key("ArrowUp", s.pitch < -2); await key("ArrowDown", s.pitch > 2);
      await key("KeyW", Math.abs(err) < (h > 12 ? 0.5 : 0.3) && h > tol * 0.5);
      await key("ShiftLeft", boost && h > 25 && Math.abs(err) < 0.3);
      await key("Space", dy > 1); await key("KeyC", dy < -1);
      await page.waitForTimeout(40);
    }
  }
  return { goto, releaseAll, key };
}
