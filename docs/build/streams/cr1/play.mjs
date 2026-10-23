// CR-1 3090 ordinary-key play: one task-owned headless Chrome (ANGLE GL-EGL on the RTX 3090), driven by
// the game's keys (W, arrows, Space/C, Shift sprint, Z quiet, L lamp, E, Tab, O) and the panels' own
// buttons, with closed-loop steering read from the HUD and the canvas camera, as in ENC-1's play.mjs.
// Scenes: ribs (catch), pod (cook, trap), canopy (hunter's round), rift (stalkers' vent feeding),
// divide (skates' slack rest), meridian (choir rest). Saves come from derive.mjs.
// usage: node play.mjs <dist> <saves> <outdir> <port> <test-build> <scene...>
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const require = createRequire("/work/tmp/gpu-prep/pw/");
const { chromium } = require("playwright-core");
const [dist, saves, out, port, build, ...scenes] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const { CANOPY_BASIN_ROUTE } = await import(path.join(build, "src/content/routes.js"));
const { HUNTER_FEEDING_SPOT } = await import(path.join(build, "src/content/fauna/windows.js"));
const { sitePosition } = await import(path.join(build, "src/content/ecology/sites.js"));
const { homeOf, layerY } = await import(path.join(build, "src/sim/ecology/agents.js"));
const { FAUNA_SOURCES } = await import(path.join(build, "src/content/fauna/grounds.js"));
const { THREAT_HOME } = await import(path.join(build, "src/content/registry.js"));
const { windowOpen, windowSample } = await import(path.join(build, "src/sim/fauna/windows.js"));
const PLANS = existsSync(path.join(saves, "approach-plans.json")) ? JSON.parse(readFileSync(path.join(saves, "approach-plans.json"), "utf8")) : {};
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
const note = (...a) => console.log(`[${(performance.now() / 1000).toFixed(1)}s] ${a.join(" ")}`);
const result = { scenes: {}, shots: [], errors: [] };
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`,
  headless: true, args: ["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist", "--cr1-play"], timeout: 30000 });
let page, eye = 0, scene = "";
const held = new Set();
const key = async (k, on) => { if (on && !held.has(k)) { held.add(k); await page.keyboard.down(k); } else if (!on && held.has(k)) { held.delete(k); await page.keyboard.up(k); } };
const releaseAll = async (keep = []) => { for (const k of [...held]) if (!keep.includes(k)) await key(k, false); };
const tap = async (k, ms = 80) => { await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k); };
const wrap = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
async function read() {
  return page.evaluate(() => {
    const c = document.querySelector("#ocean").dataset, q = (s) => document.querySelector(s);
    const pitch = Number(/(-?\d+)/.exec(q("#pitch-cue")?.getAttribute("aria-label") ?? "Pitch 0")?.[1] ?? 0);
    return { cam: (c.cameraPosition ?? "0,0,0").split(",").map(Number), bearing: parseFloat(q("#bearing")?.textContent ?? "0"), pitch,
      depth: parseFloat(q("#depth")?.textContent ?? "0"), banner: q("#hazard")?.innerText.replace(/\s+/g, " ") ?? "",
      prompt: q("#interact-prompt")?.innerText.replace(/\s+/g, " ") ?? "",
      notices: [q("#alert-stack"), q("#notification"), q("#action-result"), q("#impact-notice")].map((e) => e && !e.hidden ? e.innerText : "").join(" | ").replace(/\s+/g, " "),
      vitals: q("#vitals")?.innerText.replace(/\s+/g, " ") ?? "" };
  });
}
const pos = (s) => ({ x: s.cam[0], y: s.cam[1] - eye, z: s.cam[2] });
const health = (s) => Number(/HEALTH (\d+)/i.exec(s.vitals)?.[1] ?? NaN);
async function shot(name) {
  const file = path.join(out, `${scene}-${String(result.shots.filter((f) => path.basename(f).startsWith(scene + "-")).length + 1).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file }); result.shots.push(file); note("screenshot", file);
}
let lastNotice = "", lastBanner = "";
async function observe(s) {
  const r = result.scenes[scene];
  if (s.notices && s.notices !== lastNotice) { r.captions.push(s.notices); note("caption", s.notices.slice(0, 220)); lastNotice = s.notices; }
  if (s.banner !== lastBanner) { r.banners.push(s.banner); if (s.banner) note("banner", s.banner.slice(0, 160)); lastBanner = s.banner; }
  r.minHealth = Math.min(r.minHealth, health(s));
}
/** Watch (and look along `yaw`/`pitch`) for `seconds`, observing. */
async function watch(seconds, look = null) {
  const t0 = performance.now();
  while (performance.now() - t0 < seconds * 1000) {
    const s = await read(); await observe(s);
    if (look) {
      const err = wrap(look.yaw - s.bearing * Math.PI / 180);
      await key("ArrowRight", err > 0.04); await key("ArrowLeft", err < -0.04);
      await key("ArrowUp", s.pitch < (look.pitch ?? 0) - 3); await key("ArrowDown", s.pitch > (look.pitch ?? 0) + 3);
    }
    await page.waitForTimeout(80);
  }
  await releaseAll();
}
const yawTo = (from, to) => Math.atan2(to.x - from.x, -(to.z - from.z));
const pitchTo = (from, to) => Math.atan2(to.y - from.y, Math.hypot(to.x - from.x, to.z - from.z)) * 180 / Math.PI;
/** Closed-loop movement to a point with the ordinary keys. */
async function goto(t, { tol = 2, label = "", timeout = 120, keep = [] } = {}) {
  const start = performance.now(); let best = Infinity, bestAt = start;
  for (;;) {
    const s = await read(); await observe(s);
    const p = pos(s), dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z, h = Math.hypot(dx, dz), d3 = Math.hypot(h, dy);
    if (d3 <= tol) break;
    if (d3 < best - 0.3) { best = d3; bestAt = performance.now(); }
    if (performance.now() - bestAt > 15000 || performance.now() - start > timeout * 1000) { await releaseAll(keep); note("stalled", label, d3.toFixed(1)); return "stalled"; }
    const yaw = s.bearing * Math.PI / 180, want = h > 1.2 ? Math.atan2(dx, -dz) : yaw, err = wrap(want - yaw);
    const wantPitch = Math.max(-60, Math.min(60, Math.atan2(dy, Math.max(h, 0.1)) * 180 / Math.PI));
    await key("ArrowRight", err > 0.035); await key("ArrowLeft", err < -0.035);
    await key("ArrowUp", s.pitch < wantPitch - 3); await key("ArrowDown", s.pitch > wantPitch + 3);
    await key("KeyW", Math.abs(err) < (h > 8 ? 0.45 : 0.25));
    await page.waitForTimeout(40);
  }
  await releaseAll(keep);
  return "arrived";
}
async function load(name) {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => document.querySelector("#ocean")?.dataset.graphics === "available", null, { timeout: 60000 });
  await page.locator("#new-game").waitFor({ state: "visible", timeout: 30000 });
  await page.locator("#import-file").setInputFiles(path.join(saves, `${name}.json`));
  await page.waitForTimeout(500);
  if (await page.locator("#confirmation").isVisible().catch(() => false)) await page.locator("#confirm-accept").click();
  await page.waitForFunction(() => !document.querySelector("#hud")?.hidden && document.querySelector("#ocean").dataset.ready === "true", null, { timeout: 90000 });
  await page.locator("#ocean").click();
  await page.waitForTimeout(1200);
  const s = await read(); eye = s.cam[1] + s.depth; lastNotice = ""; lastBanner = "";
  note("loaded", name, JSON.stringify({ cam: s.cam, bearing: s.bearing, depth: s.depth, vitals: s.vitals }));
  return s;
}
const begin = (name) => { scene = name; result.scenes[name] = { captions: [], banners: [], minHealth: Infinity, notes: {} }; };
const button = (label) => page.locator(`button:has-text("${label}")`).first();

/** The sim tick the page shows (canvas dataset), for timing a rhythm the way a watching player would. */
const tickNow = async () => Number(await page.evaluate(() => document.querySelector("#ocean").dataset.tick ?? "0"));
/** Watch (looking at `look`) until `ready(tick)` holds, at most `limit` seconds; returns the wait. */
async function waitFor(ready, look, limit = 120) {
  const t0 = performance.now();
  for (;;) {
    const s = await read(); await observe(s);
    if (look) {
      const p = pos(s), err = wrap(yawTo(p, look) - s.bearing * Math.PI / 180), wantPitch = pitchTo(p, look);
      await key("ArrowRight", err > 0.04); await key("ArrowLeft", err < -0.04);
      await key("ArrowUp", s.pitch < wantPitch - 3); await key("ArrowDown", s.pitch > wantPitch + 3);
    }
    if (ready(await tickNow())) break;
    if (performance.now() - t0 > limit * 1000) { await releaseAll(); note("wait limit"); break; }
    await page.waitForTimeout(80);
  }
  await releaseAll();
  return (performance.now() - t0) / 1000;
}
/** Fly the planned legs, park, and step out (hold X). */
async function flyAndExit(plan) {
  if (plan.mode === "piloting") {
    for (const [i, q] of (plan.route ?? []).entries()) await goto(q, { tol: 3, label: `leg ${i}`, timeout: 180 });
    await page.keyboard.down("KeyX"); await page.waitForTimeout(700); await page.keyboard.up("KeyX"); await page.waitForTimeout(1200);
    const s = await read(); eye = s.cam[1] + s.depth; result.scenes[scene].notes.exited = { at: pos(s), vitals: s.vitals };
  }
}
/** One native approach: from where the bot's own play left the player, by keys, to the threat; wait and watch for its window; cross. */
async function approach(name, crossing, look, windowId, before = []) {
  const plan = PLANS[name]; if (!plan) throw new Error(`no native save for ${name}`);
  result.scenes[scene].notes.start = { distance: plan.distance, mode: plan.mode, hull: plan.hull };
  await load(`approach-${name}`); await shot("native-start");
  await flyAndExit(plan);
  for (const [i, q] of before.entries()) await goto(q, { tol: 2, label: `before ${i}`, timeout: 40 });
  await shot("arrived-watching");
  const waited = await waitFor((t) => windowOpen(windowId, t) && windowSample(windowId, t).elapsed > 2, look);
  result.scenes[scene].notes.waited = waited; await shot("window-open");
  await key("ShiftLeft", true);
  for (const [i, q] of crossing.entries()) { await goto(q, { tol: 2, label: `cross ${i}`, keep: ["ShiftLeft"], timeout: 60 }); if (q.dwell) { await releaseAll(); await watch(q.dwell, look); await key("ShiftLeft", true); } }
  await releaseAll(); await shot("crossed");
}

const SCENES = {
  async ribs() {
    const s0 = await load("ribs"), school = FAUNA_SOURCES.reef_fish_ribs.position, eyeAt = { x: s0.cam[0], y: s0.cam[1], z: s0.cam[2] };
    // Turn onto the school with the arrow keys, as a player would.
    await watch(3, { yaw: yawTo(eyeAt, school), pitch: pitchTo(eyeAt, { ...school, y: school.y - 0.2 }) });
    result.scenes.ribs.notes.prompt = (await read()).prompt;
    await shot("school-catch-prompt");
    for (let i = 0; i < 2; i++) { await tap("KeyE"); await page.waitForTimeout(900); const s = await read(); await observe(s); result.scenes.ribs.notes[`catch${i}`] = s.notices; }
    await shot("caught-with-net");
    await tap("Tab"); await page.waitForTimeout(700); await shot("cargo-catch-section"); await tap("Escape");
  },
  async pod() {
    await load("pod");
    await tap("Tab"); await page.waitForTimeout(700); await shot("cargo-catch-before-cooking");
    await button("Cook 1 portion").click(); await page.waitForTimeout(700);
    result.scenes.pod.notes.cooked = (await read()).notices; await shot("cooked-one-portion");
    await tap("Escape"); await page.waitForTimeout(300);
    await tap("KeyO"); await page.waitForTimeout(800); await shot("base-trap-holding-fish");
    result.scenes.pod.notes.base = (await page.locator("#panel-body, .panel, #panels").first().innerText().catch(() => "")).slice(0, 1500);
    await button("Empty").click(); await page.waitForTimeout(700);
    result.scenes.pod.notes.emptied = (await read()).notices; await shot("trap-emptied");
    await tap("Escape");
  },
  async canopy() {
    await load("canopy-head"); await shot("route-head-loud-lit");
    const route = CANOPY_BASIN_ROUTE.upper.map((p) => ({ ...p }));
    for (const [i, q] of route.entries()) {
      if (i === 0) continue;
      await goto(q, { label: `upper#${i}`, tol: 3 });
      if (i === Math.floor(route.length / 2)) {
        const p = pos(await read());
        await watch(3, { yaw: yawTo(p, HUNTER_FEEDING_SPOT), pitch: pitchTo(p, HUNTER_FEEDING_SPOT) });
        await shot("hunter-feeding-on-east-shoal");
      }
    }
    await shot("lab-reached-unbothered");
    const p = pos(await read());
    await watch(4, { yaw: yawTo(p, HUNTER_FEEDING_SPOT), pitch: pitchTo(p, HUNTER_FEEDING_SPOT) });
    await shot("looking-east-from-lab");
  },
  async rift() {
    await load("rift-mouth");
    const c = sitePosition({ site: "rift_split_chimney", offset: { x: 0, y: 0, z: 0 } });
    const look = (p) => ({ yaw: yawTo(p, { x: c.x - 8, y: c.y + 28, z: c.z }), pitch: pitchTo(p, { x: c.x - 8, y: c.y + 28, z: c.z }) });
    await watch(8, look(pos(await read()))); await shot("stalkers-hunting-passage");
    await watch(14, look(pos(await read()))); await shot("stalkers-feeding-in-plume");
    await key("ShiftLeft", true);
    await goto({ x: c.x - 26, y: c.y + 8, z: c.z + 2 }, { label: "into the passage", keep: ["ShiftLeft"], timeout: 40 });
    await releaseAll(); await watch(4, look(pos(await read()))); await shot("in-the-passage-lit-loud");
    await key("ShiftLeft", true);
    await goto({ x: c.x - 54, y: c.y + 8, z: c.z }, { label: "back out", keep: ["ShiftLeft"], timeout: 40 });
    await releaseAll(); await shot("out-of-the-passage");
  },
  async divide() {
    await load("divide-mirror");
    const h = homeOf("divide_skate_saddle"), y = layerY("divide_dense_layer");
    const down = (p) => ({ yaw: yawTo(p, { x: h.x, y: y - 10, z: h.z }), pitch: -35 });
    await watch(6, down(pos(await read()))); await shot("skate-patrolling-under-mirror");
    await watch(12, down(pos(await read()))); await shot("skate-sinking-to-rest");
    await key("ShiftLeft", true);
    await goto({ x: h.x + 30, y: y + 1.5, z: h.z }, { label: "across the mirror", keep: ["ShiftLeft"], timeout: 45 });
    await releaseAll(); await shot("across-the-mirror");
    await goto({ x: h.x + 30, y: y + 12, z: h.z }, { label: "up and away", timeout: 20 });
    await shot("above-the-layer");
  },
  async "approach-rift"() {
    const c = sitePosition({ site: "rift_split_chimney", offset: { x: 0, y: 0, z: 0 } });
    await approach("rift", [{ x: c.x - 26, y: c.y + 8, z: c.z + 2, dwell: 5 }, { x: c.x - 64, y: c.y + 10, z: c.z }], { x: c.x - 8, y: c.y + 28, z: c.z }, "glare_stalker");
  },
  async "approach-divide"() {
    const h = homeOf("divide_skate_saddle"), y = layerY("divide_dense_layer");
    // Wait above the skates' reach; go down to the mirror only once they rest.
    await approach("divide", [{ x: h.x - 44, y: y + 1.5, z: h.z }, { x: h.x + 30, y: y + 1.5, z: h.z }, { x: h.x + 30, y: y + 12, z: h.z }], { x: h.x, y, z: h.z }, "layer_skate",
      [{ x: h.x - 44, y: y + 12, z: h.z }]);
  },
  async "approach-meridian"() {
    const h = homeOf("district_choir_gallery");
    // From the parking point 45 m south: down outside the reach, then straight through the bells and out the north side.
    await approach("meridian", [{ x: h.x, y: h.y + 1.5, z: h.z - 26 }, { x: h.x, y: h.y + 1.5, z: h.z + 26 }, { x: h.x, y: h.y + 1.5, z: h.z + 44 }], { ...h, y: h.y + 2 }, "hollow_choir",
      [{ x: h.x, y: h.y + 4, z: h.z - 45 }]);
  },
  async "approach-canopy"() {
    // The Dart as the bot left it on the Reef → Canopy route; on to the approach ring, watch, then on to the lab.
    const plan = PLANS.canopy; if (!plan) throw new Error("no native save for canopy");
    result.scenes[scene].notes.start = { distance: plan.distance, mode: plan.mode, hull: plan.hull };
    await load("approach-canopy"); await shot("native-start");
    const route = CANOPY_BASIN_ROUTE.upper.map((p) => ({ ...p })), here = pos(await read());
    let i = route.reduce((b, q, k) => Math.hypot(q.x - here.x, q.z - here.z) < Math.hypot(route[b].x - here.x, route[b].z - here.z) ? k : b, 0);
    for (; i < route.length && Math.hypot(route[i].x - THREAT_HOME.x, route[i].z - THREAT_HOME.z) > 110; i++) await goto(route[i], { tol: 3, label: `upper#${i}` });
    await shot("at-the-approach-ring");
    result.scenes[scene].notes.waited = await waitFor((t) => windowSample("canopy_sound_hunter", t).phase === "away", { ...THREAT_HOME });
    await shot("hunter-gone-to-feed");
    for (; i < route.length; i++) await goto(route[i], { tol: 3, label: `upper#${i}` });
    await shot("lab-reached-loud-and-lit");
  },
  async meridian() {
    await load("meridian-gallery");
    const h = homeOf("district_choir_gallery");
    const at = (p) => ({ yaw: yawTo(p, { ...h, y: h.y + 2 }), pitch: pitchTo(p, { ...h, y: h.y + 2 }) });
    await watch(5, at(pos(await read()))); await shot("bells-open-listening");
    await watch(9, at(pos(await read()))); await shot("bells-closed-resting");
    await key("ShiftLeft", true);
    await goto({ x: h.x + 26, y: h.y + 1.5, z: h.z }, { label: "through the reach", keep: ["ShiftLeft"], timeout: 40 });
    await releaseAll(); await shot("through-the-gallery");
  },
};

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  page.on("pageerror", (e) => result.errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) result.errors.push(m.text().slice(0, 300)); });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load", timeout: 60000 });
  result.renderer = await page.evaluate(() => { const g = document.createElement("canvas").getContext("webgl2"); const e = g.getExtension("WEBGL_debug_renderer_info"); return g.getParameter(e.UNMASKED_RENDERER_WEBGL); });
  note("renderer", result.renderer);
  if (!/RTX 3090/.test(result.renderer)) throw new Error(`not the RTX 3090: ${result.renderer}`);
  for (const name of scenes) {
    begin(name);
    try { await SCENES[name](); }
    catch (e) { result.errors.push(`${name}: ${String(e?.stack ?? e)}`); note("error", name, e?.message ?? e); await shot("error").catch(() => {}); }
    note("scene done", name, JSON.stringify({ minHealth: result.scenes[name].minHealth, captions: result.scenes[name].captions.length }));
  }
} catch (e) {
  result.errors.push(String(e?.stack ?? e)); note("error", e?.message ?? e);
} finally {
  writeFileSync(path.join(out, `play-${scenes.join("-")}.json`), JSON.stringify(result, null, 2));
  await browser.close(); server.close();
}
