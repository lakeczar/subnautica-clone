// HUB-2, 3090 ordinary-key play (after C4B's play-b): one task-owned headless Chrome (ANGLE GL-EGL on the
// RTX 3090), from the derived crown-door save (derive.mjs: stage 1 restored, the dock stage's materials in the
// diver hold and the Creel at 30% moored at the dock are STAGED). Keys and keyboard focus only: K opens
// Fabricate, Tab walks focus to "Restore" for the crown dock, Enter presses it; the diver swims to the Creel;
// Tab opens Cargo, Tab walks focus to its Service button, Enter presses it. Steering from the HUD and camera.

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
  headless: true, args: ["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist", "--hub2-play"], timeout: 30000 });
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
  // The derived save, imported through the menu like a player's backup.
  await page.locator("#import-file").setInputFiles(saveFile);
  await page.waitForTimeout(500);
  if (await page.locator("#confirmation").isVisible().catch(() => false)) { await page.locator("#confirm-accept").focus(); await page.keyboard.press("Enter"); }
  await page.waitForFunction(() => !document.querySelector("#hud")?.hidden && document.querySelector("#ocean").dataset.ready === "true", null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  if (await page.locator("#resume").isVisible().catch(() => false)) { await page.locator("#resume").focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(400); }
  await page.locator("#ocean").focus();
  eye = EYE_SWIM;
  const start = await read(); watch(start);
  note("at", JSON.stringify(pos(start)), start.region, start.vitals);
  await turnTo(Math.atan2(331 - start.cam[0], -(-559 - start.cam[2])), -10); await page.waitForTimeout(1500);
  await shot("crown-door-stage-1");
  // 1. Fabricate (K): restore the crown dock and fabricator at the door.
  await page.keyboard.press("KeyK"); await page.waitForTimeout(600);
  if (!await panelOpen()) throw new Error("K opened no panel");
  result.checks.fabricateBefore = await panelText();
  await shot("fabricate-crown-dock-ready");
  await press("button[data-command-key*='restore_crown_dock']:not([disabled])", "Restore the crown dock and fabricator");
  await page.waitForTimeout(600);
  const after = await read(); watch(after);
  result.checks.restoredNotice = after.notices;
  if (!/dock and fabricator restored/i.test(after.notices + (await panelText()))) throw new Error(`no restoration notice: ${after.notices}`);
  await shot("crown-dock-restored");
  await closePanel();
  // 2. Swim to the Creel at the dock (about 15 m west), within the 7 m service reach.
  await frames("door → beside the Creel", async () => { await goto({ x: 309, y: -46.5, z: -549 }, { tol: 1.2, label: "beside the Creel", timeout: 60 }); });
  await turnTo(Math.atan2(304.2 - 309, -(-552 - -549)), -5); await page.waitForTimeout(800);
  // 3. Cargo (Tab): the Creel's Service button, through the composed preview.
  await page.keyboard.press("Tab"); await page.waitForTimeout(600);
  if (!await panelOpen()) throw new Error("Tab opened no panel");
  result.checks.cargoBefore = await panelText();
  if (!/power 30%/.test(result.checks.cargoBefore)) throw new Error(`the Creel is not at 30%: ${result.checks.cargoBefore}`);
  await shot("cargo-service-ready");
  await press("button[data-command-key*='service']:not([disabled])", "Service");
  await page.waitForTimeout(600);
  result.checks.cargoAfter = await panelText();
  if (!/power 100%/.test(result.checks.cargoAfter)) throw new Error(`service did not charge: ${result.checks.cargoAfter}`);
  await shot("cargo-serviced");
  await closePanel();
  await frames("hold at the dock", async () => { await page.waitForTimeout(4000); });
  result.ok = result.errors.length === 0;
} catch (e) { result.failure = String(e?.stack ?? e); note("FAILED", String(e)); await shot("failure").catch(() => {}); }
finally {
  writeFileSync(path.join(out, "play.json"), JSON.stringify({ ...result, log }, null, 2));
  await browser.close().catch(() => {}); server.close();
}
