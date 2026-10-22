// POI-1 3090 session (copied from ATM-1): one task-owned headless Chrome (ANGLE GL-EGL, RTX 3090), ordinary keys only, driven turn by
// turn over a loopback control API (after the M2 audit's server). Serves two dists so the same pose can be shot
// before and after. Run it through scripts/heavy-check.sh with a deadline of at most 25 minutes; POST /quit closes it.
// usage: node server.mjs <beforeDist> <afterDist> <gamePortBefore> <gamePortAfter> <ctlPort> <outDir>
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync, appendFileSync } from "node:fs";
import path from "node:path";
const require = createRequire("/work/tmp/gpu-prep/pw/");
const { chromium } = require("playwright-core");
const [beforeDist, afterDist, portBefore, portAfter, ctlPort, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".wasm": "application/wasm", ".bin": "application/octet-stream" };
const serve = (dist, port) => new Promise((r) => {
  const root = path.resolve(dist);
  const s = createServer((req, res) => {
    const rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const file = path.resolve(root, "." + (rel.endsWith("/") ? rel + "index.html" : rel));
    if (!file.startsWith(root + path.sep) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(readFileSync(file));
  });
  s.listen(Number(port), "127.0.0.1", () => r(s));
});
const games = [await serve(beforeDist, portBefore), await serve(afterDist, portAfter)];
const logFile = path.join(out, "session.log");
const t0 = Date.now();
const log = (...a) => appendFileSync(logFile, `[${((Date.now() - t0) / 1000).toFixed(1)}] ${a.join(" ")}\n`);
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`,
  headless: true, args: ["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist", "--poi1-evidence"], timeout: 30000 });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => { errors.push(e.message); log("pageerror", e.message); });
page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) { errors.push(m.text().slice(0, 400)); log("console.error", m.text().slice(0, 400)); } });
await page.addInitScript(() => { window.__gaps = []; let last = 0; const loop = (now) => { if (last) window.__gaps.push(now - last); last = now; requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
let renderer = "";

const held = new Set();
const key = async (k, on) => { if (on && !held.has(k)) { held.add(k); await page.keyboard.down(k); } else if (!on && held.has(k)) { held.delete(k); await page.keyboard.up(k); } };
const releaseAll = async () => { for (const k of [...held]) await key(k, false); };
const tap = async (k, ms = 80) => { await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k); };
const hold = async (keys, ms) => { for (const k of [].concat(keys)) await key(k, true); await page.waitForTimeout(ms); for (const k of [].concat(keys)) await key(k, false); };
const wait = (ms) => page.waitForTimeout(ms);
const wrap = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
async function read() {
  return page.evaluate(() => {
    const c = document.querySelector("#ocean")?.dataset ?? {}, q = (s) => document.querySelector(s);
    const txt = (s) => (q(s)?.innerText ?? "").replace(/\s+/g, " ").trim();
    const pitch = Number(/(-?\d+)/.exec(q("#pitch-cue")?.getAttribute("aria-label") ?? "Pitch 0")?.[1] ?? 0);
    return { cam: (c.cameraPosition ?? "0,0,0").split(",").map(Number), bearing: parseFloat(q("#bearing")?.textContent ?? "0"), pitch,
      depth: parseFloat(q("#depth")?.textContent ?? "0"), region: txt("#region-name"), movement: txt("#movement"), vitals: txt("#vitals"),
      prompt: txt("#interact-prompt"), menu: !q("#menu")?.hidden, panel: q("#game-panel") && !q("#game-panel").hidden ? txt("#panel-title") : "",
      graphics: c.graphics, ready: c.ready, lights: c.localLights ?? "", work: c.workView ?? "", cave: c.cave ?? "", regions: c.regions ?? "" };
  });
}
let eye = null;
const calibrate = async () => { const s = await read(); eye = s.cam[1] + s.depth; return eye; };
const pos = (s) => ({ x: s.cam[0], y: s.cam[1] - (eye ?? 0), z: s.cam[2] });
async function turnTo(bearingDeg, pitchDeg = 0) {
  for (let i = 0; i < 400; i++) {
    const s = await read(), err = wrap((bearingDeg - s.bearing) * Math.PI / 180), perr = pitchDeg - s.pitch;
    await key("ArrowRight", err > 0.02); await key("ArrowLeft", err < -0.02); await key("ArrowUp", perr > 1.5); await key("ArrowDown", perr < -1.5);
    if (Math.abs(err) <= 0.02 && Math.abs(perr) <= 1.5) break; await wait(30);
  }
  await releaseAll();
}
async function goto(t, { tol = 3, timeout = 120 } = {}) {
  if (eye === null) await calibrate();
  const start = Date.now(); let best = Infinity, bestAt = start;
  for (;;) {
    const s = await read(), p = pos(s), dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z, hd = Math.hypot(dx, dz), d3 = Math.hypot(hd, dy);
    if (d3 <= tol) break;
    if (d3 < best - 0.3) { best = d3; bestAt = Date.now(); }
    if (Date.now() - bestAt > 15000 || Date.now() - start > timeout * 1000) { await releaseAll(); return { stalled: +d3.toFixed(1), at: p }; }
    const yaw = s.bearing * Math.PI / 180, want = hd > 1.2 ? Math.atan2(dx, -dz) : yaw, err = wrap(want - yaw);
    await key("ArrowRight", err > 0.035); await key("ArrowLeft", err < -0.035);
    await key("ArrowUp", s.pitch < -2); await key("ArrowDown", s.pitch > 2);
    await key("KeyW", Math.abs(err) < (hd > 8 ? 0.45 : 0.25) && hd > tol * 0.6);
    await key("Space", dy > 0.7); await key("KeyC", dy < -0.7);
    await wait(40);
  }
  await releaseAll();
  return { arrived: true, seconds: (Date.now() - start) / 1000 };
}
/** Open a dist ("before" | "after") at the title. */
async function open(which) {
  eye = null;
  await page.goto(`http://127.0.0.1:${which === "before" ? portBefore : portAfter}/`, { waitUntil: "load", timeout: 60000 });
  if (!renderer) renderer = await page.evaluate(() => { const g = document.createElement("canvas").getContext("webgl2"); const e = g.getExtension("WEBGL_debug_renderer_info"); return g.getParameter(e.UNMASKED_RENDERER_WEBGL); });
  await page.waitForFunction(() => document.querySelector("#ocean")?.dataset.graphics === "available", null, { timeout: 60000 });
  log("open", which, renderer);
  return renderer;
}
/** Import a save through the menu's file input (the player's own path), then resume. */
async function importSave(file) {
  eye = null;
  const s = await read();
  if (!s.menu) { await tap("Escape"); await wait(400); }
  // The input fires no change event for the same file twice (M2 audit): clear it first.
  await page.locator("#import-file").setInputFiles([]); await page.locator("#import-file").setInputFiles(file); await wait(1200);
  if (await page.locator("#confirmation").isVisible().catch(() => false)) await page.locator("#confirm-accept").click();
  await page.waitForFunction(() => !document.querySelector("#hud")?.hidden && document.querySelector("#ocean").dataset.ready === "true", null, { timeout: 90000 });
  await wait(1500); await page.locator("#ocean").focus();
  const r = await read();
  if (r.menu && await page.locator("#resume").isVisible().catch(() => false)) { await page.locator("#resume").click(); await wait(300); await page.locator("#ocean").focus(); }
  log("imported", file);
}
let shotN = 0;
/** A screenshot with the HUD, plus the scene's mean brightness measured on a HUD-hidden capture. */
async function shot(name) {
  await wait(400);
  const file = path.join(out, `${String(++shotN).padStart(2, "0")}-${name}.jpg`);
  await page.screenshot({ path: file, type: "jpeg", quality: 84 });
  await page.evaluate(() => { const h = document.querySelector("#hud"); if (h) h.style.visibility = "hidden"; });
  await wait(120);
  const raw = await page.screenshot({ type: "png" });
  await page.evaluate(() => { const h = document.querySelector("#hud"); if (h) h.style.visibility = ""; });
  const mean = await page.evaluate(async (b64) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob(), bmp = await createImageBitmap(blob);
    const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext("2d"); g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, bmp.width, bmp.height).data; let sum = 0, dark = 0;
    for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; sum += l; if (l < 24) dark++; }
    return { mean: +(sum / (d.length / 4)).toFixed(1), darkShare: +(dark / (d.length / 4)).toFixed(3) };
  }, raw.toString("base64"));
  log("shot", file, JSON.stringify(mean));
  return { file: path.basename(file), ...mean };
}
async function fps() {
  const g = await page.evaluate(() => { const x = window.__gaps; window.__gaps = []; return x; });
  const s = [...g].sort((a, b) => a - b), q = (f) => s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * f))].toFixed(1) : null;
  return { frames: s.length, fps: s.length ? +(1000 / (s.reduce((a, b) => a + b, 0) / s.length)).toFixed(1) : null, p50: q(0.5), p95: q(0.95), worst: s.length ? +s[s.length - 1].toFixed(1) : null };
}
const h = { page, key, tap, hold, wait, read, goto, turnTo, shot, fps, open, importSave, releaseAll, calibrate, pos, log, setEye: (v) => { eye = v; }, errors: () => errors.splice(0) };
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const ctl = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  if (req.url === "/quit") {
    res.end("bye\n"); await browser.close().catch(() => {}); for (const g of games) g.close(); ctl.close(); log("quit");
    setTimeout(() => process.exit(0), 200); return;
  }
  try {
    const value = await new AsyncFunction("h", body)(h);
    res.end(JSON.stringify({ value, state: await read().catch(() => null), errors: errors.splice(0) }, null, 1) + "\n");
  } catch (e) { await releaseAll().catch(() => {}); res.end(JSON.stringify({ error: String(e?.stack ?? e), errors: errors.splice(0) }) + "\n"); }
});
ctl.listen(Number(ctlPort), "127.0.0.1", () => log("ready"));
