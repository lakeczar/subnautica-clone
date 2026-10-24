// SIG-1 browser check: one task-owned headless Chrome on the GPU (ANGLE GL-EGL on factory-worker's
// RTX 3090, or /usr/local/bin/siltwake-chrome on alickers' RTX 4070 Laptop), keys only. Each diagnostic
// save from derive.mjs is imported through the menu like a player's backup; the craft's actions are
// pressed by the number the HUD's action bar shows for them, and every effect is screenshotted.
// usage: node play.mjs <repo> <dist> <out> <port> <saves-dir> [chrome]
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const [repo, dist, out, port, saves, chromePath] = process.argv.slice(2);
const require = createRequire(existsSync("/work/tmp/gpu-prep/pw/") ? "/work/tmp/gpu-prep/pw/" : path.join(repo, "/"));
const { chromium } = require("playwright-core");
mkdirSync(out, { recursive: true });
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
const log = [], note = (...a) => { const line = `[${(performance.now() / 1000).toFixed(1)}s] ${a.join(" ")}`; log.push(line); console.log(line); };
const plan = JSON.parse(readFileSync(path.join(saves, "plan.json"), "utf8"));
const result = { commit: existsSync(path.join(dist, "COMMIT")) ? readFileSync(path.join(dist, "COMMIT"), "utf8").trim() : null, scenarios: {}, shots: [], errors: [] };
const browser = await chromium.launch({ executablePath: chromePath || `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`,
  headless: true, args: ["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist", "--sig1-play"], timeout: 30000 });
let page, scenario = "";
const wrap = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
async function shot(name) {
  const file = path.join(out, `${String(result.shots.length + 1).padStart(2, "0")}-${scenario}-${name}.jpg`);
  await page.screenshot({ path: file, type: "jpeg", quality: 82 }); result.shots.push(path.basename(file)); note("screenshot", path.basename(file));
}
const read = () => page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  return {
    cam: (q("#ocean").dataset.cameraPosition ?? "0,0,0").split(",").map(Number), bearing: parseFloat(q("#bearing")?.textContent ?? "0"),
    pitch: Number(/(-?\d+)/.exec(q("#pitch-cue")?.getAttribute("aria-label") ?? "Pitch 0")?.[1] ?? 0),
    notices: [q("#alert-stack"), q("#notification"), q("#action-result")].map((e) => e?.innerText ?? "").join(" | ").replace(/\s+/g, " "),
    actions: [...document.querySelectorAll(".craft-action")].map((e) => e.innerText.replace(/\s+/g, " ").trim()),
    guidance: q("#pilot-guidance")?.innerText.replace(/\s+/g, " ") ?? "",
  };
});
/** The number the HUD's action bar shows for `label`, pressed as an ordinary key. */
async function action(label) {
  const s = await read(), row = s.actions.find((a) => a.slice(2).startsWith(label));
  if (!row) throw new Error(`no "${label}" on the action bar: ${s.actions.join(" · ")}`);
  await page.keyboard.press(`Digit${row[0]}`); await page.waitForTimeout(250);
  const after = await read(); note("pressed", row, "→", after.notices.slice(0, 200));
  return after;
}
async function hold(k, ms) { await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k); }
async function turnTo(yaw, pitchDeg = 0) {
  for (let i = 0; i < 500; i++) {
    const s = await read(), err = wrap(yaw - s.bearing * Math.PI / 180), perr = pitchDeg - s.pitch;
    if (Math.abs(err) <= 0.02 && Math.abs(perr) <= 1.5) break;
    if (Math.abs(err) > 0.02) await hold(err > 0 ? "ArrowRight" : "ArrowLeft", Math.min(120, Math.max(20, Math.abs(err) * 200)));
    if (Math.abs(perr) > 1.5) await hold(perr > 0 ? "ArrowUp" : "ArrowDown", 40);
  }
}
async function press(selector, label) {
  for (let i = 0; i < 160; i++) {
    if (await page.evaluate((sel) => !!document.activeElement?.matches(sel), selector)) { await page.keyboard.press("Enter"); await page.waitForTimeout(400); note("pressed", label, `after ${i} Tabs`); return; }
    await page.keyboard.press("Tab"); await page.waitForTimeout(25);
  }
  throw new Error(`Tab never reached ${label} (${selector})`);
}
const panelText = () => page.evaluate(() => document.querySelector("#game-panel")?.innerText.replace(/\s+/g, " ").slice(0, 900) ?? "");
async function closePanel() { await page.keyboard.press("Escape"); await page.waitForTimeout(400); }

async function load(name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page = await context.newPage(); scenario = name;
  page.on("pageerror", (e) => result.errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) result.errors.push(`${name}: ${m.text().slice(0, 300)}`); });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load", timeout: 60000 });
  if (!result.renderer) { result.renderer = await page.evaluate(() => { const g = document.createElement("canvas").getContext("webgl2"); const e = g.getExtension("WEBGL_debug_renderer_info"); return g.getParameter(e.UNMASKED_RENDERER_WEBGL); }); note("renderer", result.renderer); }
  await page.waitForFunction(() => document.querySelector("#ocean")?.dataset.graphics === "available", null, { timeout: 60000 });
  await page.locator("#new-game").waitFor({ state: "visible", timeout: 30000 });
  await page.locator("#import-file").setInputFiles(path.join(saves, `${name}.json`));
  await page.waitForTimeout(500);
  if (await page.locator("#confirmation").isVisible().catch(() => false)) { await page.locator("#confirm-accept").focus(); await page.keyboard.press("Enter"); }
  await page.waitForFunction(() => !document.querySelector("#hud")?.hidden && document.querySelector("#ocean").dataset.ready === "true", null, { timeout: 90000 });
  await page.locator("#ocean").focus();
  await page.waitForTimeout(2500);
  const r = { checks: {} }; result.scenarios[name] = r;
  r.loaded = await read(); note("loaded", name, JSON.stringify(r.loaded.actions));
  return { r, context };
}
const bearingTo = (from, to) => Math.atan2(to.x - from.x, -(to.z - from.z));

const SCENARIOS = {
  async dart() {
    const { r, context } = await load("dart");
    await shot("action-bar");
    r.checks.sonar = (await action("Sonar")).notices;
    await page.waitForTimeout(500); await shot("sonar-pulse");
    await page.waitForTimeout(1300); await shot("sonar-contacts");
    r.checks.cooling = (await read()).actions;
    await page.keyboard.press("KeyO"); await page.waitForTimeout(600);
    r.checks.chart = await panelText(); await shot("chart-beacons"); await closePanel();
    const at = plan.dart.at, site = plan.dart.target.position;
    await turnTo(bearingTo(at, site), Math.atan2(site.y - at.y, Math.hypot(site.x - at.x, site.z - at.z)) * 180 / Math.PI);
    r.checks.tag = (await action("Tag")).notices;
    await page.waitForTimeout(600); await shot("tagging");
    await page.waitForTimeout(1400); r.checks.tagged = (await read()).notices; await shot("tagged");
    await context.close();
  },
  async "creel-arm"() {
    const { r, context } = await load("creel-arm");
    r.checks.prompt = (await read()).guidance; await shot("cutting-arm-prompt");
    await page.keyboard.press("KeyE"); await page.waitForTimeout(800); await shot("cutting");
    await page.waitForTimeout(4000); r.checks.cut = (await read()).notices; await shot("cut-aboard");
    await context.close();
  },
  async "creel-grapple"() {
    const { r, context } = await load("creel-grapple");
    await shot("action-bar");
    r.checks.hooked = (await action("Grapple")).notices;
    await page.waitForTimeout(1500); await shot("frame-hooked");
    await page.waitForTimeout(6500); r.checks.landed = (await read()).notices; await shot("frame-aboard");
    r.checks.drop = (await action("Drop pod")).notices;
    await page.waitForTimeout(800); await turnTo(((await read()).bearing * Math.PI / 180), -60); await shot("pod-dropped");
    await page.keyboard.press("Tab"); await page.waitForTimeout(700);
    r.checks.cargo = await panelText(); await shot("cargo-filter");
    await page.locator("#cargo-filter").focus(); await page.locator("#cargo-filter").selectOption("materials"); await page.waitForTimeout(400);
    r.checks.cargoMaterials = await panelText(); await shot("cargo-materials");
    await closePanel();
    await context.close();
  },
  async spindle() {
    const { r, context } = await load("spindle");
    await shot("action-bar");
    r.checks.crane = (await action("Crane lift")).notices;
    await page.waitForTimeout(1200); await turnTo(((await read()).bearing * Math.PI / 180), -35); await shot("crane-lifting");
    await page.waitForTimeout(4500); r.checks.lifted = (await read()).notices; await shot("crane-lifted");
    await context.close();
  },
  async mantle() {
    const { r, context } = await load("mantle");
    await shot("action-bar");
    r.checks.clamp = (await action("Clamp")).notices;
    await page.waitForTimeout(800); await turnTo(((await read()).bearing * Math.PI / 180), -50); await shot("clamp-gripping");
    await page.waitForTimeout(6000); r.checks.gripped = (await read()).notices; await shot("clamp-aboard");
    await turnTo(((await read()).bearing * Math.PI / 180), 0);
    r.checks.drone = (await action("Drone")).notices;
    await page.waitForTimeout(600); await shot("drone-view");
    await hold("KeyW", 3500); await page.waitForTimeout(300); r.checks.droneOut = await read(); await shot("drone-out");
    r.checks.recall = (await action("Recall drone")).notices; await page.waitForTimeout(600); await shot("drone-recalled");
    await context.close();
  },
  async outpost() {
    const { r, context } = await load("outpost");
    await shot("outpost-in-world");
    await page.keyboard.press("KeyO"); await page.waitForTimeout(700);
    r.checks.base = await panelText(); await shot("base-lattice-offer");
    await press("button[data-command-key*='upgrade-host-module']:not([disabled])", "Fit lattice");
    await page.waitForTimeout(500); r.checks.fitted = await panelText(); await shot("base-lattice-fitted");
    await closePanel();
    await context.close();
  },
};
try {
  for (const [name, run] of Object.entries(SCENARIOS)) {
    if (!plan[name]) continue;
    try { await run(); } catch (e) { result.scenarios[name] = { ...(result.scenarios[name] ?? {}), failure: String(e?.stack ?? e) }; note("FAILED", name, String(e)); await shot("failure").catch(() => {}); }
  }
  result.ok = result.errors.length === 0 && Object.values(result.scenarios).every((s) => !s.failure);
} finally {
  writeFileSync(path.join(out, "play.json"), JSON.stringify({ ...result, log }, null, 2));
  await browser.close().catch(() => {}); server.close();
}
