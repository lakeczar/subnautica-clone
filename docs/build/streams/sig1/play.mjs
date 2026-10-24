// SIG-1 browser check: one task-owned headless Chrome on the GPU (ANGLE GL-EGL on factory-worker's
// RTX 3090, or /usr/local/bin/siltwake-chrome on alickers' RTX 4070 Laptop), keys only. Each diagnostic
// save from derive.mjs is imported through the menu like a player's backup; the craft's actions are
// pressed by the number the HUD's action bar shows for them, and every effect is screenshotted.
// usage: node play.mjs <repo> <dist> <out> <port> <saves-dir> [chrome]
// env: SIG1_PW (playwright-core's install dir), SIG1_ANGLE (gl-egl on the 3090, gl on alickers), SIG1_EXPECT (renderer regex)
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const [repo, dist, out, port, saves, chromePath] = process.argv.slice(2);
const require = createRequire(path.join(process.env.SIG1_PW ?? "/work/tmp/gpu-prep/pw", "/"));
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
  headless: true, args: ["--use-gl=angle", `--use-angle=${process.env.SIG1_ANGLE ?? "gl-egl"}`, "--ignore-gpu-blocklist", "--sig1-play"], timeout: 30000 });
let page, scenario = "";
const wrap = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
async function shot(name) {
  const file = path.join(out, `${String(result.shots.length + 1).padStart(2, "0")}-${scenario}-${name}.jpg`);
  await page.screenshot({ path: file, type: "jpeg", quality: 82 }); result.shots.push(path.basename(file)); note("screenshot", path.basename(file));
}
/** Every notice and toast as it appears (they are transient), recorded in the page. */
const NOTICE_RECORDER = () => {
  window.__notices = [];
  setInterval(() => {
    for (const sel of ["#alert-stack", "#notification", "#action-result"]) {
      const text = document.querySelector(sel)?.innerText.replace(/\s+/g, " ").trim();
      if (text && window.__notices.at(-1) !== text) window.__notices.push(text);
    }
  }, 100);
};
const noticesSince = async (n) => page.evaluate((k) => window.__notices.slice(k), n);
const noticeCount = () => page.evaluate(() => window.__notices.length);
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
/** Leave the craft by its exit key (held, for a deliberate exit), as the HUD says. */
async function exitCraft() {
  const g = (await read()).guidance, k = /X Exit|X Hold/.test(g) ? "KeyX" : "KeyE";
  await hold(k, 1500); await page.waitForTimeout(900);
  note("exited", JSON.stringify((await read()).guidance.slice(0, 80)));
}
const look = async (from, to) => turnTo(bearingTo(from, to), Math.atan2(to.y - from.y, Math.hypot(to.x - from.x, to.z - from.z)) * 180 / Math.PI);
const camPos = async () => { const c = (await read()).cam; return { x: c[0], y: c[1], z: c[2] }; };
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
const panelText = () => page.evaluate(() => document.querySelector("#game-panel")?.innerText.replace(/\s+/g, " ").slice(0, 2400) ?? "");
async function closePanel() { await page.keyboard.press("Escape"); await page.waitForTimeout(400); }

async function load(name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page = await context.newPage(); scenario = name;
  page.on("pageerror", (e) => result.errors.push(`${name}: ${e.message}`));
  await page.addInitScript(NOTICE_RECORDER);
  page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) result.errors.push(`${name}: ${m.text().slice(0, 300)}`); });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load", timeout: 60000 });
  if (!result.renderer) {
    result.renderer = await page.evaluate(() => { const g = document.createElement("canvas").getContext("webgl2"); const e = g.getExtension("WEBGL_debug_renderer_info"); return g.getParameter(e.UNMASKED_RENDERER_WEBGL); });
    note("renderer", result.renderer);
    if (!new RegExp(process.env.SIG1_EXPECT ?? "RTX 3090").test(result.renderer)) throw new Error(`unexpected renderer: ${result.renderer}`);
  }
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
  r.noticesFrom = await noticeCount();
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
    r.notices = await noticesSince(r.noticesFrom); await context.close();
  },
  async "creel-arm"() {
    const { r, context } = await load("creel-arm");
    r.checks.prompt = (await read()).guidance; await shot("cutting-arm-prompt");
    await page.keyboard.press("KeyE"); await page.waitForTimeout(800); await shot("cutting");
    await page.waitForTimeout(4000); r.checks.cut = (await read()).notices; await shot("cut-aboard");
    r.notices = await noticesSince(r.noticesFrom); await context.close();
  },
  async "creel-grapple"() {
    const { r, context } = await load("creel-grapple");
    await shot("action-bar");
    r.checks.hooked = (await action("Grapple")).notices;
    await page.waitForTimeout(1500); await shot("frame-hooked");
    await page.waitForTimeout(6500); r.checks.landed = (await read()).notices; await shot("frame-aboard");
    r.checks.drop = (await action("Drop pod")).notices;
    // The diver leaves the Creel and swims down to the dropped pod: it is a container within 8 m.
    await exitCraft();
    await hold("KeyC", 3000); await page.waitForTimeout(600);
    const at = plan["creel-grapple"].at; await look(await camPos(), { x: at.x, y: plan["creel-grapple"].position.y, z: at.z }); await shot("pod-dropped");
    await page.keyboard.press("Tab"); await page.waitForTimeout(700);
    r.checks.cargo = await panelText(); await shot("cargo-with-pod");
    await page.locator("#cargo-filter").focus(); await page.locator("#cargo-filter").selectOption("materials"); await page.waitForTimeout(400);
    for (const name of ["Creel hold", "cargo pod"]) {
      const summary = page.locator("summary", { hasText: name }).first();
      if (await summary.count()) { await summary.focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(250); }
    }
    r.checks.cargoMaterials = await panelText(); await shot("cargo-materials");
    await closePanel();
    r.notices = await noticesSince(r.noticesFrom); await context.close();
  },
  async spindle() {
    const { r, context } = await load("spindle");
    await shot("action-bar");
    r.checks.crane = (await action("Crane lift")).notices;
    // Seen from the water beside the Spindle: the boom and its line down to the ledge.
    await exitCraft(); await hold("KeyS", 1400); await hold("Space", 300);
    const sp = plan.spindle.hull; await look(await camPos(), { x: sp.x, y: sp.y + 1.5, z: sp.z }); await shot("crane-lifting");
    await page.waitForTimeout(4200); r.checks.lifted = (await read()).notices; await shot("crane-lifted");
    r.notices = await noticesSince(r.noticesFrom); await context.close();
  },
  async mantle() {
    const { r, context } = await load("mantle");
    await shot("action-bar");
    r.checks.drone = (await action("Drone")).notices;
    await page.waitForTimeout(600); await shot("drone-view");
    await hold("KeyW", 3500); await page.waitForTimeout(300); r.checks.droneOut = await read(); await shot("drone-out");
    r.checks.recall = (await action("Recall drone")).notices; await page.waitForTimeout(600); await shot("drone-recalled");
    r.checks.clamp = (await action("Clamp")).notices;
    // Seen from the water: the jaw and its line on the frame host below.
    await exitCraft(); await page.waitForTimeout(300);
    await hold("KeyS", 900); await look(await camPos(), plan.mantle.position); await shot("clamp-gripping");
    await page.waitForTimeout(5200); r.checks.gripped = (await read()).notices; await shot("clamp-aboard");
    r.notices = await noticesSince(r.noticesFrom); await context.close();
  },
  async carrier() {
    const { r, context } = await load("carrier");
    await shot("aboard");
    const console_ = async () => {
      await page.keyboard.press("Tab"); await page.waitForTimeout(600);
      await press("button[data-action='carrier-panel']", "Hearthline console");
    };
    await console_();
    r.checks.before = await panelText(); await shot("console-before-refit");
    await press("button[data-command-key*='reconfigure']:not([disabled])", "Refit berths");
    r.checks.refit = await panelText(); await shot("console-mixed");
    // Each lock cycle runs in play (the panel pauses the game): close it, wait, reopen.
    for (let n = 0; n < 2; n++) {
      await press("button[data-command-key*='capture']:not([disabled])", `Recover craft ${n + 1}`);
      await closePanel(); await page.waitForTimeout(16000);
      await console_();
    }
    r.checks.after = await panelText(); await shot("both-berthed");
    await closePanel();
    await turnTo(((await read()).bearing * Math.PI / 180) + Math.PI * 0.5, -5); await shot("mixed-rooms");
    r.notices = await noticesSince(r.noticesFrom); await context.close();
  },
  async outpost() {
    const { r, context } = await load("outpost");
    await shot("outpost-in-world");
    await page.keyboard.press("KeyO"); await page.waitForTimeout(700);
    r.checks.base = await panelText(); await shot("base-lattice-offer");
    await press("button[data-command-key*='upgrade-host-module']:not([disabled])", "Fit lattice");
    await page.waitForTimeout(500); r.checks.fitted = await panelText(); await shot("base-lattice-fitted");
    await closePanel();
    r.notices = await noticesSince(r.noticesFrom); await context.close();
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
