// UX-1 3090 ordinary-control play: one task-owned headless Chrome (ANGLE GL-EGL on the RTX 3090),
// driven by the game's keys (W/S, A/D, arrows, E, X, V, Esc) and clicks inside its own console panel,
// with closed-loop steering read from the HUD (bearing, helm readout) and the canvas camera position.
// Boarding at the hatch, walking to the helm, taking it, steering by the window view, a refused launch
// with its hint, the turn, a launch, a recovery, and leaving the helm. Frame times on the bridge.
// usage: node play.mjs <dist> <save.json> <outdir> <port> <tb>
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const require = createRequire("/work/tmp/gpu-prep/pw/");
const { chromium } = require("playwright-core");
const [dist, saveFile, out, port, tb] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const B = tb.endsWith("/") ? tb : tb + "/";
const C = await import(B + "src/sim/carrier.js");
const S = await import(B + "src/sim/carrierStations.js");
const saved = JSON.parse(readFileSync(saveFile, "utf8"));
const hull = saved.state.fleet.vehicles.find((v) => v.hull === "hearthline");
const W = (local) => C.localToWorld(local, hull);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".wasm": "application/wasm", ".bin": "application/octet-stream" };
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
const result = { commit: readFileSync(path.join(dist, "COMMIT"), "utf8").trim(), save: saveFile, segments: [], shots: [], errors: [], notices: [], steps: {} };
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`,
  headless: true, args: ["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist", "--ux1-play"], timeout: 30000 });
let page;
const held = new Set();
const key = async (k, on) => { if (on && !held.has(k)) { held.add(k); await page.keyboard.down(k); } else if (!on && held.has(k)) { held.delete(k); await page.keyboard.up(k); } };
const releaseAll = async () => { for (const k of [...held]) await key(k, false); };
const tap = async (k, ms = 80) => { await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k); };
const wrap = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
async function read() {
  return page.evaluate(() => {
    const c = document.querySelector("#ocean").dataset, q = (s) => document.querySelector(s);
    const hud = q("#hud").dataset;
    return { cam: (c.cameraPosition ?? "0,0,0").split(",").map(Number), bearing: parseFloat(q("#bearing")?.textContent ?? "0"),
      yaw: Number(hud.yaw), pitch: Number(hud.pitch), pos: (hud.position ?? "0,0,0").split(",").map(Number), mode: hud.mode,
      depth: parseFloat(q("#depth")?.textContent ?? "0"), prompt: q("#interact-prompt")?.innerText ?? "", movement: q("#movement")?.innerText ?? "",
      helm: q("#helm-readout")?.hidden ? "" : (q("#helm-readout")?.innerText ?? "").replace(/\s+/g, " "),
      guidance: q("#pilot-guidance")?.hidden ? "" : (q("#pilot-guidance")?.innerText ?? "").replace(/\s+/g, " "),
      notice: [q("#action-result"), q("#notification"), q("#panel-feedback"), q("#audio-caption")].map((e) => e && !e.hidden ? e.innerText : "").join(" | ").replace(/\s+/g, " "),
      corridor: c.corridor ?? "", controls: q("#control-hint")?.innerText ?? "" };
  });
}
const seen = new Set();
function watch(s) { for (const part of s.notice.split(" | ")) if (part.trim() && !seen.has(part)) { seen.add(part); result.notices.push({ t: +(performance.now() / 1000).toFixed(1), text: part }); note("notice:", part.slice(0, 200)); } }
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
  const file = path.join(out, `${String(result.shots.length + 1).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file }); result.shots.push(file); note("screenshot", file);
}
/** Aim the view (arrow keys) at a world point from the current eye. */
async function aimAt(target, eyeY) {
  for (let i = 0; i < 300; i++) {
    const s = await read(), eye = { x: s.cam[0], y: s.cam[1], z: s.cam[2] };
    const dx = target.x - eye.x, dy = target.y - eye.y, dz = target.z - eye.z;
    const want = Math.atan2(dx, -dz), wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
    const err = wrap(want - s.yaw), perr = wantPitch - s.pitch;
    await key("ArrowRight", err > 0.015); await key("ArrowLeft", err < -0.015);
    await key("ArrowUp", perr > 0.015); await key("ArrowDown", perr < -0.015);
    if (Math.abs(err) <= 0.015 && Math.abs(perr) <= 0.015) break;
    await page.waitForTimeout(25);
  }
  await releaseAll();
}
/** Walk or swim (W and arrows) to a world point, closed loop on the HUD position. */
async function goto(t, tol = 0.35, timeout = 40) {
  const start = performance.now();
  for (;;) {
    const s = await read(), p = { x: s.pos[0], y: s.pos[1], z: s.pos[2] };
    const dx = t.x - p.x, dz = t.z - p.z, dy = t.y - p.y, h = Math.hypot(dx, dz);
    if (h <= tol && (s.mode !== "swimming" || Math.abs(dy) < 1)) break;
    if (performance.now() - start > timeout * 1000) { await releaseAll(); throw new Error(`stalled ${h.toFixed(2)} m short of ${JSON.stringify(t)} at ${JSON.stringify(p)}`); }
    const err = wrap(Math.atan2(dx, -dz) - s.yaw);
    await key("ArrowRight", err > 0.04); await key("ArrowLeft", err < -0.04);
    await key("KeyW", Math.abs(err) < 0.35 && (h > 1 || Math.floor(performance.now() / 200) % 2 === 0));
    if (s.mode === "swimming") { await key("Space", dy > 0.5); await key("KeyC", dy < -0.5); }
    await page.waitForTimeout(30);
  }
  await releaseAll();
}
/** Steer the carrier at the helm (A/D) to a heading in degrees, holding W if `ahead`. */
async function steerTo(deg, { ahead = false, tol = 2, timeout = 60 } = {}) {
  const start = performance.now();
  for (;;) {
    const s = await read(), err = wrap((deg - s.bearing) * Math.PI / 180) * 180 / Math.PI;
    if (Math.abs(err) <= tol) break;
    if (performance.now() - start > timeout * 1000) throw new Error(`heading ${s.bearing} not ${deg}`);
    await key("KeyD", err > tol); await key("KeyA", err < -tol); await key("KeyW", ahead);
    await page.waitForTimeout(40);
  }
  await releaseAll();
}
async function untilHelm(pattern, timeout = 20) {
  const start = performance.now();
  for (;;) { const s = await read(); watch(s); if (pattern.test(s.helm)) return s; if (performance.now() - start > timeout * 1000) return s; await page.waitForTimeout(150); }
}
async function console_() { await tap("KeyV"); await page.waitForTimeout(600); return page.evaluate(() => document.querySelector("#panel-content")?.innerText ?? ""); }
async function click(label) {
  const b = page.locator("#panel-content button", { hasText: label }).first();
  const disabled = await b.isDisabled();
  if (disabled) return `disabled: ${await page.locator(`#${await b.getAttribute("aria-describedby")}`).innerText().catch(() => "")}`;
  await b.click(); await page.waitForTimeout(400); return "clicked";
}
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  page.on("pageerror", (e) => result.errors.push(e.message));
  page.on("response", (r) => { if (r.status() >= 400) result.errors.push(`HTTP ${r.status()} ${r.url()}`); });
  page.on("console", (m) => { if (m.type() === "error") result.errors.push(m.text().slice(0, 300)); });
  await page.addInitScript(() => { window.__gaps = []; let last = 0; const loop = (now) => { if (last) window.__gaps.push(now - last); last = now; requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load", timeout: 60000 });
  result.renderer = await page.evaluate(() => { const g = document.createElement("canvas").getContext("webgl2"); const e = g.getExtension("WEBGL_debug_renderer_info"); return g.getParameter(e.UNMASKED_RENDERER_WEBGL); });
  note("renderer", result.renderer);
  if (!/RTX 3090/.test(result.renderer)) throw new Error(`not the RTX 3090: ${result.renderer}`);
  await page.waitForFunction(() => document.querySelector("#ocean")?.dataset.graphics === "available", null, { timeout: 60000 });
  await page.locator("#new-game").waitFor({ state: "visible", timeout: 30000 });
  result.controlsList = await page.evaluate(() => document.querySelector(".controls")?.innerText.replace(/\s+/g, " ") ?? "");
  await page.locator("#import-file").setInputFiles(saveFile);
  await page.waitForTimeout(500);
  if (await page.locator("#confirmation").isVisible().catch(() => false)) await page.locator("#confirm-accept").click();
  await page.waitForFunction(() => !document.querySelector("#hud")?.hidden && document.querySelector("#ocean").dataset.ready === "true", null, { timeout: 90000 });
  await page.locator("#ocean").click();
  await page.waitForTimeout(1500);
  let s = await read(); watch(s); note("loaded", JSON.stringify({ pos: s.pos, mode: s.mode, bearing: s.bearing }));
  await shot("outside-the-vestibule");

  // 1. Boarding: aim at the hatch on the hull side, E.
  await aimAt(W(S.CARRIER_STATIONS["carrier:board"].center));
  s = await read(); result.steps.boardPrompt = s.prompt; note("prompt", s.prompt.replace(/\s+/g, " "));
  await shot("board-prompt-at-hatch");
  await tap("KeyE"); await page.waitForTimeout(800); s = await read(); watch(s); result.steps.boarded = s.mode;
  note("after board", s.mode, s.movement);
  await shot("aboard-vestibule");

  // 2. Walk forward to the helm (the medium berth's passage to starboard), aim at the console, E.
  const config = saved.state.fleet.docking.configuration;
  const lane = config === "medium" ? 2.4 : 0.05;
  for (const q of [{ x: lane, z: 6.4 }, { x: lane, z: -3.3 }, { x: 0.9, z: -5.2 }, { x: 0, z: -6.0 }]) await goto(W({ x: q.x, y: 4, z: q.z }), 0.3);
  await aimAt(W(S.CARRIER_STATIONS["carrier:helm"].center));
  s = await read(); result.steps.helmPrompt = s.prompt; note("prompt", s.prompt.replace(/\s+/g, " "));
  await shot("helm-prompt-on-the-bridge");
  await tap("KeyE"); await page.waitForTimeout(1200); s = await read(); watch(s);
  result.steps.atHelm = { movement: s.movement, helm: s.helm, guidance: s.guidance, controls: s.controls, corridor: s.corridor };
  note("at helm", JSON.stringify(result.steps.atHelm));
  await frames("bridge at the helm, holding station (5 s)", async () => { await page.waitForTimeout(5000); });
  await shot("helm-window-view");

  // 3. Look around without steering: arrows turn the head, not the hull.
  const before = (await read()).bearing;
  await key("ArrowLeft", true); await page.waitForTimeout(900); await releaseAll(); await page.waitForTimeout(300);
  s = await read(); result.steps.headLook = { bearingBefore: before, bearingAfter: s.bearing, cameraYaw: null };
  note("head look", JSON.stringify(result.steps.headLook));
  await shot("head-look-to-port-hull-unturned");
  await key("ArrowRight", true); await page.waitForTimeout(900); await releaseAll();

  // 4. Steer by the window: ahead with starboard rudder, then straighten.
  await frames("helm under way, turning (10 s)", async () => {
    await key("KeyW", true); await page.waitForTimeout(1500); await key("KeyD", true); await page.waitForTimeout(3500); await key("KeyD", false);
    await page.waitForTimeout(5000); s = await read(); watch(s); result.steps.underWay = s.helm;
  });
  await shot("under-way-window-view");
  await releaseAll();
  // Ease off until stopped.
  await untilHelm(/Stopped/, 30);

  // 5. A refused launch with its hint: the second derived save, the carrier low over a slope at the
  // helm, turned to a heading whose corridor is obstructed. Imported through the menu like a backup.
  await tap("Escape"); await page.waitForTimeout(600);
  await page.locator("#import-file").setInputFiles(saveFile.replace("outside-vestibule", "helm-blocked"));
  await page.waitForTimeout(600);
  if (await page.locator("#confirmation").isVisible().catch(() => false)) await page.locator("#confirm-accept").click();
  await page.waitForTimeout(800);
  if (await page.locator("#resume").isVisible().catch(() => false)) await page.locator("#resume").click();
  await page.waitForFunction(() => !document.querySelector("#hud")?.hidden && document.querySelector("#ocean").dataset.ready === "true", null, { timeout: 90000 });
  // No canvas click here: Resume re-acquires pointer lock, and moving the mouse to the canvas would be a look.
  await page.waitForTimeout(2500);
  s = await untilHelm(/obstructed/, 10);
  result.steps.blocked = { bearing: s.bearing, helm: s.helm, corridor: s.corridor };
  note("blocked?", JSON.stringify(result.steps.blocked));
  await shot("corridor-obstructed-hint");
  let text = await console_(); result.steps.consoleRefused = text;
  result.steps.launchAttempt = await click("Launch Mantle");
  note("launch attempt", result.steps.launchAttempt);
  await shot("console-launch-refused-with-reason");
  await tap("Escape"); await page.waitForTimeout(400);

  // 6. Turn as the hint says, until the corridor reads clear.
  const m = /Turn about (\d+)° to (starboard|port)/.exec(s.helm);
  if (m) {
    const target = (s.bearing + (m[2] === "starboard" ? 1 : -1) * Number(m[1]) + 360) % 360;
    await steerTo(target);
  }
  s = await untilHelm(/Lock corridor clear/, 20); await untilHelm(/Stopped/, 30); s = await untilHelm(/Lock corridor clear/, 5);
  result.steps.cleared = { bearing: s.bearing, helm: s.helm, corridor: s.corridor };
  note("cleared", JSON.stringify(result.steps.cleared));
  await shot("corridor-clear-after-turn");
  text = await console_();
  result.steps.hold = await click("Hold station");
  result.steps.launch = await click("Launch Mantle");
  note("hold", result.steps.hold, "launch", result.steps.launch);
  await page.waitForTimeout(1500); watch(await read());
  result.steps.consoleAfterLaunch = await page.evaluate(() => document.querySelector("#panel-content")?.innerText ?? "");
  await shot("launched-mantle");
  // Panels pause the game: return to the water so the lock completes, then reopen.
  await tap("Escape"); await page.locator("#ocean").click(); await page.waitForTimeout(2000); watch(await read());
  await shot("after-launch-helm");

  // 7. Recover it: the console offers the Mantle at the lock mouth.
  text = await console_(); result.steps.consoleRecover = text;
  result.steps.recover = await click("Recover Mantle");
  note("recover", result.steps.recover);
  await tap("Escape"); await page.locator("#ocean").click(); await page.waitForTimeout(2000); s = await read(); watch(s);
  text = await console_(); result.steps.consoleAfterRecover = text;
  await shot("mantle-recovered");
  await tap("Escape"); await page.locator("#ocean").click(); await page.waitForTimeout(800);

  // 8. Leave the helm: X.
  await tap("KeyX"); await page.waitForTimeout(1200); s = await read(); watch(s);
  result.steps.leftHelm = { movement: s.movement, notice: s.notice };
  await frames("bridge on foot (3 s)", async () => { await page.waitForTimeout(3000); });
  await shot("left-the-helm");
} catch (e) { result.errors.push(String(e && e.stack || e)); note("ERROR", String(e && e.message || e)); try { await shot("error"); } catch {} }
finally { await browser.close().catch(() => {}); server.close(); }
result.log = log;
writeFileSync(path.join(out, "play.json"), JSON.stringify(result, null, 2));
console.log("done; errors", result.errors.length);
