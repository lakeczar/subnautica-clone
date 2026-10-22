// C4 stage A, 3090 ordinary-key play: one task-owned headless Chrome (ANGLE GL-EGL on the RTX 3090),
// from New Game with no derived save. Keys only (Space hold, W/S, arrows, Space/C, Shift, L), steering
// closed-loop from the HUD (bearing, pitch cue, depth) and the canvas camera position.
// Route: pod → surface swim west → the Fanvault north mouth → vault (lamp off, then on) → south mouth
// → across the shelf-break race → surface.

import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const require = createRequire("/work/tmp/gpu-prep/pw/");
const { chromium } = require("playwright-core");
const [repo, dist, out, port, saveFile] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const B = path.join(repo, ".test-build/");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".wasm": "application/wasm" };
const root = path.resolve(dist);
const server = createServer((req, res) => {
  const rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const file = path.resolve(root, "." + (rel.endsWith("/") ? rel + "index.html" : rel));
  if (!file.startsWith(root + path.sep) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(Number(port), "127.0.0.1", r));
const log = [];
const note = (...a) => { const line = `[${(performance.now() / 1000).toFixed(1)}s] ${a.join(" ")}`; log.push(line); console.log(line); };
const result = { commit: readFileSync(path.join(dist, "COMMIT"), "utf8").trim(), segments: [], shots: [], errors: [], captions: [], checks: {} };
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`,
  headless: true, args: ["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist", "--c4-play-b"], timeout: 30000 });
let page;
const held = new Set();
const key = async (k, on) => { if (on && !held.has(k)) { held.add(k); await page.keyboard.down(k); } else if (!on && held.has(k)) { held.delete(k); await page.keyboard.up(k); } };
const releaseAll = async () => { for (const k of [...held]) await key(k, false); };
const tap = async (k, ms = 80) => { await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k); };
const wrap = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
let eye = 0;
async function read() {
  return page.evaluate(() => {
    const c = document.querySelector("#ocean").dataset, q = (s) => document.querySelector(s);
    const pitch = Number(/(-?\d+)/.exec(q("#pitch-cue")?.getAttribute("aria-label") ?? "Pitch 0")?.[1] ?? 0);
    return { cam: (c.cameraPosition ?? "0,0,0").split(",").map(Number), bearing: parseFloat(q("#bearing")?.textContent ?? "0"), pitch,
      depth: parseFloat(q("#depth")?.textContent ?? "0"), cave: c.cave ?? "", streaks: Number(c.currentStreaks ?? 0),
      notices: [q("#alert-stack"), q("#hazard"), q("#notification"), q("#action-result"), q("#audio-caption"), q("#subtitles")].map((e) => e?.innerText ?? "").join(" | ").replace(/\s+/g, " "),
      vitals: q("#vitals")?.innerText.replace(/\s+/g, " ") ?? "", region: q("#region-name")?.innerText ?? "" };
  });
}
const pos = (s) => ({ x: s.cam[0], y: s.cam[1] - eye, z: s.cam[2] });
const seen = new Set();
const { eyeHeight, createGame } = await import(B + "src/sim/state.js");
const EYE_SWIM = (() => { const g = createGame(); g.player.mode = "swimming"; return eyeHeight(g); })();
function watch(s) {
  for (const part of s.notices.split(" | ")) if (part && !seen.has(part)) { seen.add(part); result.captions.push({ t: +(performance.now() / 1000).toFixed(1), text: part }); note("caption:", part.slice(0, 160)); }
}
async function frames(label, run) {
  await page.evaluate(() => { window.__gaps = []; });
  const t0 = performance.now();
  await run();
  const g = await page.evaluate(() => window.__gaps.slice());
  const s = [...g].sort((a, b) => a - b), qq = (f) => s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * f))].toFixed(1) : null;
  const seg = { label, seconds: +((performance.now() - t0) / 1000).toFixed(1), frames: s.length, fps: s.length ? +(1000 / (s.reduce((a, b) => a + b, 0) / s.length)).toFixed(1) : null,
    p50: qq(0.5), p95: qq(0.95), p99: qq(0.99), max: s.length ? +s[s.length - 1].toFixed(1) : null, over50: s.filter((x) => x > 50).length };
  result.segments.push(seg); note("segment", JSON.stringify(seg));
}
async function shot(name) {
  const file = path.join(out, `${String(result.shots.length + 1).padStart(2, "0")}-${name}.jpg`);
  await page.screenshot({ path: file, type: "jpeg", quality: 82 }); result.shots.push(path.basename(file)); note("screenshot", file);
}
/** Closed-loop swimming to a point with the ordinary keys (C3's driver). */
async function goto(t, { tol = 1.5, label = "", timeout = 120, sprint = false } = {}) {
  const start = performance.now(); let best = Infinity, bestAt = start, recoveries = 0;
  for (;;) {
    const s = await read(); watch(s);
    const p = pos(s), dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z, h = Math.hypot(dx, dz), d3 = Math.hypot(h, dy);
    if (d3 <= tol) break;
    if (d3 < best - 0.3) { best = d3; bestAt = performance.now(); }
    if (performance.now() - bestAt > 6000 && recoveries < 3) {
      recoveries++; note("recover", label, `${d3.toFixed(1)} m short`);
      await releaseAll(); await key("KeyS", true); await key("Space", true); await page.waitForTimeout(1200); await releaseAll();
      bestAt = performance.now(); best = Infinity; result.recoveries = (result.recoveries ?? 0) + 1; continue;
    }
    if (performance.now() - bestAt > 20000 || performance.now() - start > timeout * 1000) { await releaseAll(); throw new Error(`stalled ${d3.toFixed(1)} m short of ${label} at ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`); }
    const yaw = s.bearing * Math.PI / 180, want = h > 0.8 ? Math.atan2(dx, -dz) : yaw, err = wrap(want - yaw);
    await key("ArrowRight", err > 0.035); await key("ArrowLeft", err < -0.035);
    await key("ArrowUp", s.pitch < -2); await key("ArrowDown", s.pitch > 2);
    await key("KeyW", Math.abs(err) < (h > 6 ? 0.45 : 0.25) && h > tol * 0.5);
    await key("ShiftLeft", sprint && h > 8);
    await key("Space", dy > 0.5); await key("KeyC", dy < -0.5);
    await page.waitForTimeout(40);
  }
  await releaseAll();
}
async function turnTo(yaw, pitchDeg = 0) {
  for (let i = 0; i < 400; i++) {
    const s = await read(), err = wrap(yaw - s.bearing * Math.PI / 180), perr = pitchDeg - s.pitch;
    await key("ArrowRight", err > 0.02); await key("ArrowLeft", err < -0.02);
    await key("ArrowUp", perr > 1.5); await key("ArrowDown", perr < -1.5);
    if (Math.abs(err) <= 0.02 && Math.abs(perr) <= 1.5) break;
    await page.waitForTimeout(30);
  }
  await releaseAll();
}

/** Keyboard focus: Tab until the target has focus (a bounded walk), then Enter. */
async function press(selector, label) {
  for (let i = 0; i < 120; i++) {
    if (await page.evaluate((sel) => !!document.activeElement?.matches(sel), selector)) {
      await page.keyboard.press("Enter"); await page.waitForTimeout(400); result.checks[`pressed ${label}`] = `${i} Tabs`; note("pressed", label, `after ${i} Tabs`); return;
    }
    await page.keyboard.press("Tab"); await page.waitForTimeout(30);
  }
  throw new Error(`Tab never reached ${label} (${selector})`);
}
const panelText = () => page.evaluate(() => document.querySelector("#game-panel")?.innerText.replace(/\s+/g, " ").slice(0, 600) ?? "");
const panelOpen = () => page.evaluate(() => !document.querySelector("#game-panel")?.hidden);
async function closePanel() { await page.keyboard.press("Escape"); await page.waitForTimeout(400); if (await panelOpen()) throw new Error("Escape left the panel open"); }
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  page.on("pageerror", (e) => result.errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) result.errors.push(m.text().slice(0, 300)); });
  await page.addInitScript(() => { window.__gaps = []; let last = 0; const loop = (now) => { if (last) window.__gaps.push(now - last); last = now; requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load", timeout: 60000 });
  result.renderer = await page.evaluate(() => { const g = document.createElement("canvas").getContext("webgl2"); const e = g.getExtension("WEBGL_debug_renderer_info"); return g.getParameter(e.UNMASKED_RENDERER_WEBGL); });
  note("renderer", result.renderer);
  if (!/RTX 3090/.test(result.renderer)) throw new Error(`not the RTX 3090: ${result.renderer}`);
  await page.waitForFunction(() => document.querySelector("#ocean")?.dataset.graphics === "available", null, { timeout: 60000 });
  await page.locator("#new-game").waitFor({ state: "visible", timeout: 30000 });
  await shot("title");
  result.checks.titlePrimary = await page.evaluate(() => [...document.querySelectorAll("button.primary")].filter((b) => b.offsetParent !== null).map((b) => b.id || b.textContent));
  // The derived save, imported through the menu like a player's backup.
  await page.locator("#import-file").setInputFiles(saveFile);
  await page.waitForTimeout(500);
  if (await page.locator("#confirmation").isVisible().catch(() => false)) { await page.locator("#confirm-accept").focus(); await page.keyboard.press("Enter"); }
  await page.waitForFunction(() => !document.querySelector("#hud")?.hidden && document.querySelector("#ocean").dataset.ready === "true", null, { timeout: 60000 });
  await page.locator("#ocean").focus();
  await page.waitForTimeout(1500);
  let s = await read(); eye = EYE_SWIM; note("loaded", JSON.stringify({ cam: s.cam, depth: s.depth, eye, region: s.region }));
  result.checks.objective = await page.evaluate(() => document.querySelector("#hud-objective")?.innerText ?? null);
  result.checks.oldHeader = await page.evaluate(() => /FIRST EXPEDITION/i.test(document.querySelector("#hud")?.innerText ?? ""));
  await shot("hud-objective");
  // 1. The journal: J opens it on the notebook; each tab by Tab + Enter.
  await page.keyboard.press("KeyJ"); await page.waitForTimeout(500);
  if (!await panelOpen()) throw new Error("J opened no panel");
  await shot("journal-notebook");
  result.checks.journalTabs = await page.evaluate(() => [...document.querySelectorAll("[data-action^='journal-tab:']")].map((b) => b.textContent));
  for (const tab of ["materials", "tech", "decodes"]) {
    await press(`[data-action='journal-tab:${tab}']`, `journal tab ${tab}`);
    await shot(`journal-${tab}`);
  }
  await closePanel();
  // 2. The fit screen.
  await page.keyboard.press("KeyU"); await page.waitForTimeout(500);
  if (!await panelOpen()) throw new Error("U opened no panel");
  result.checks.fitText = await panelText();
  await shot("fit");
  await closePanel();
  // 3. Down to the west ledge (ground about -8.1 m).
  await frames("surface → west ledge", async () => { await goto({ x: -44, y: -7.3, z: 8 }, { tol: 0.9, label: "ledge", timeout: 60 }); });
  await page.waitForTimeout(800);
  // 4. The base screen: deploy the outpost here, then pack it up.
  await page.keyboard.press("KeyO"); await page.waitForTimeout(600);
  if (!await panelOpen()) throw new Error("O opened no panel");
  result.checks.baseBefore = await panelText();
  await shot("base-kit-ready");
  await press("button[data-command-key*='deploy-outpost']:not([disabled])", "Deploy here");
  await page.waitForTimeout(600);
  result.checks.baseDeployed = await panelText();
  if (!/Pack up/.test(result.checks.baseDeployed)) throw new Error(`no deployed outpost on the base screen: ${result.checks.baseDeployed}`);
  await shot("base-outpost-deployed");
  await closePanel();
  await turnTo(Math.PI, -20); await page.waitForTimeout(800);
  await shot("outpost-in-world");
  await page.keyboard.press("KeyO"); await page.waitForTimeout(600);
  await press("button[data-command-key*='pack-outpost']:not([disabled])", "Pack up");
  await page.waitForTimeout(600);
  result.checks.basePacked = await panelText();
  if (!/Deploy here/.test(result.checks.basePacked)) throw new Error(`the kit did not come back: ${result.checks.basePacked}`);
  await shot("base-packed");
  await closePanel();
  result.ok = result.errors.length === 0;
} catch (e) { result.failure = String(e?.stack ?? e); note("FAILED", String(e)); await shot("failure").catch(() => {}); }
finally {
  writeFileSync(path.join(out, "play-b.json"), JSON.stringify({ ...result, log }, null, 2));
  await browser.close().catch(() => {}); server.close();
}
