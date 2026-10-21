// ENC-1 3090 ordinary-key play: one task-owned headless Chrome (ANGLE GL-EGL on the RTX 3090), driven
// only by the game's keys (W/S, arrows, Space/C, Z quiet, L lamp) with closed-loop steering read from
// the HUD (bearing, pitch cue, depth) and the canvas camera position, as in C3's play.mjs.
// Run A flies the Dart loud and lit along the authored Reef → Canopy route; on the first bite it goes
// quiet and dark and backs away. Run B re-imports the save and flies the same route holding Z.
// usage: node play.mjs <dist> <save.json> <outdir> <port> <test-build>
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const require = createRequire("/work/tmp/gpu-prep/pw/");
const { chromium } = require("playwright-core");
const [dist, saveFile, out, port, build] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const { CANOPY_BASIN_ROUTE } = await import(path.join(build, "src/content/routes.js"));
const ROUTE = CANOPY_BASIN_ROUTE.upper.map((p) => ({ ...p }));
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
const note = (...a) => console.log(`[${(performance.now() / 1000).toFixed(1)}s] ${a.join(" ")}`);
const result = { commit: existsSync(path.join(dist, "COMMIT")) ? readFileSync(path.join(dist, "COMMIT"), "utf8").trim() : "?", save: saveFile, runs: {}, shots: [], errors: [] };
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`,
  headless: true, args: ["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist", "--enc1-play"], timeout: 30000 });
let page, eye = 0, run = null;
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
      notices: [q("#alert-stack"), q("#notification"), q("#action-result"), q("#impact-notice")].map((e) => e && !e.hidden ? e.innerText : "").join(" | ").replace(/\s+/g, " "),
      edge: [...document.querySelectorAll("#threat-edge .threat-mark")].map((m) => m.dataset.stage).join(","),
      call: q("#call-cue")?.hidden ? "" : q("#call-direction")?.textContent ?? "",
      vitals: q("#vitals")?.innerText.replace(/\s+/g, " ") ?? "" };
  });
}
const pos = (s) => ({ x: s.cam[0], y: s.cam[1] - eye, z: s.cam[2] });
const hull = (s) => Number(/Hull (\d+)%/.exec(s.vitals)?.[1] ?? NaN);
const stage = (s) => /pursuit/.test(s.banner) ? "pursue" : /passing ahead/.test(s.banner) ? "investigate" : /paired calls/.test(s.banner) ? "warn" : "";
async function shot(name) {
  const file = path.join(out, `${String(result.shots.length + 1).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file }); result.shots.push(file); note("screenshot", file);
}
let lastStage = "", lastNotice = "", shotsAt = {};
/** Log every caption and stage change; take the evidence shots as the encounter unfolds. */
async function observe(s) {
  const st = stage(s), r = result.runs[run];
  if (st !== lastStage) { r.stages.push({ t: +(performance.now() / 1000).toFixed(1), stage: st || "none", hull: hull(s), edge: s.edge, call: s.call }); note("stage", st || "none", "hull", hull(s), "edge", s.edge); lastStage = st; }
  if (s.notices && s.notices !== lastNotice) { r.captions.push(s.notices); note("caption", s.notices.slice(0, 200)); lastNotice = s.notices; }
  if (st) r.maxStage = Math.max(r.maxStage, ["", "warn", "investigate", "pursue"].indexOf(st));
  const every = (k, ms, n) => { const a = shotsAt[k] ?? { n: 0, at: 0 }; if (a.n < n && performance.now() - a.at > ms) { shotsAt[k] = { n: a.n + 1, at: performance.now() }; return true; } return false; };
  if (st === "warn" && every(`${run}-warn`, 900, 2)) await shot(`${run}-warn-paired-calls`);
  if (st === "investigate" && every(`${run}-pass`, 450, 10)) await shot(`${run}-investigate-pass`);
  if (st === "pursue" && every(`${run}-pursue`, 700, 6)) await shot(`${run}-pursuit${s.edge ? "-edge-" + s.edge : ""}`);
  if (s.edge && every(`${run}-edge`, 600, 4)) await shot(`${run}-edge-cue-${s.edge.replace(/,/g, "+")}`);
}
/** Closed-loop piloting to a point with the ordinary keys; `stop` ends the leg early. */
async function goto(t, { tol = 3, label = "", timeout = 120, stop = null, keep = [] } = {}) {
  const start = performance.now(); let best = Infinity, bestAt = start;
  for (;;) {
    const s = await read(); await observe(s);
    if (stop && await stop(s)) return "stopped";
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
async function load() {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => document.querySelector("#ocean")?.dataset.graphics === "available", null, { timeout: 60000 });
  await page.locator("#new-game").waitFor({ state: "visible", timeout: 30000 });
  await page.locator("#import-file").setInputFiles(saveFile);
  await page.waitForTimeout(500);
  if (await page.locator("#confirmation").isVisible().catch(() => false)) await page.locator("#confirm-accept").click();
  await page.waitForFunction(() => !document.querySelector("#hud")?.hidden && document.querySelector("#ocean").dataset.ready === "true", null, { timeout: 60000 });
  await page.locator("#ocean").click();
  await page.waitForTimeout(1500);
  const s = await read(); eye = s.cam[1] + s.depth; lastStage = ""; lastNotice = "";
  note("loaded", JSON.stringify({ cam: s.cam, bearing: s.bearing, depth: s.depth, vitals: s.vitals }));
  return s;
}
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  page.on("pageerror", (e) => result.errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) result.errors.push(m.text().slice(0, 300)); });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load", timeout: 60000 });
  result.renderer = await page.evaluate(() => { const g = document.createElement("canvas").getContext("webgl2"); const e = g.getExtension("WEBGL_debug_renderer_info"); return g.getParameter(e.UNMASKED_RENDERER_WEBGL); });
  note("renderer", result.renderer);
  if (!/RTX 3090/.test(result.renderer)) throw new Error(`not the RTX 3090: ${result.renderer}`);

  // Run A: loud and lit along the route. After the first bite: quiet (Z), dark (L) and back away.
  run = "loud"; result.runs.loud = { stages: [], captions: [], maxStage: 0 };
  await load(); await shot("loud-route-head");
  let bitten = false;
  for (const [i, q] of ROUTE.entries()) {
    if (i === 0) continue;
    const r = await goto(q, { label: `upper#${i}`, stop: async (s) => { if (hull(s) < 100) { bitten = true; return true; } return false; } });
    if (r === "stopped") break;
  }
  const A = result.runs.loud; A.bittenAt = await read().then((s) => ({ hull: hull(s), pos: pos(s), banner: s.banner }));
  note("bitten", JSON.stringify(A.bittenAt));
  if (bitten) {
    // Stay loud one more bite to show the ramp, then quiet + dark + back away.
    const t0 = performance.now(), h0 = hull(await read());
    while (performance.now() - t0 < 6000) { const s = await read(); await observe(s); await key("KeyW", Math.floor(performance.now() / 400) % 2 === 0); if (hull(s) < h0) break; await page.waitForTimeout(60); }
    await releaseAll(); A.afterRamp = hull(await read()); note("after ramp", A.afterRamp);
    await tap("KeyL"); await key("KeyZ", true);
    const away = { ...ROUTE[2] };
    await goto(away, { label: "quiet retreat", timeout: 40, keep: ["KeyZ"], stop: async (s) => !stage(s) });
    const t1 = performance.now();
    while (performance.now() - t1 < 8000) { const s = await read(); await observe(s); if (!stage(s)) break; await page.waitForTimeout(100); }
    await releaseAll(); const s = await read(); A.disengaged = { hull: hull(s), stage: stage(s) || "none", banner: s.banner };
    note("disengaged", JSON.stringify(A.disengaged)); await shot("loud-disengaged-quiet-dark");
  }
  // Run B: the same route holding Z, lamp on.
  run = "quiet"; result.runs.quiet = { stages: [], captions: [], maxStage: 0 };
  await load(); await key("KeyZ", true);
  for (const [i, q] of ROUTE.entries()) if (i > 0) await goto(q, { label: `quiet#${i}`, keep: ["KeyZ"], timeout: 150 });
  await releaseAll(); const sq = await read();
  result.runs.quiet.end = { hull: hull(sq), pos: pos(sq), banner: sq.banner };
  note("quiet end", JSON.stringify(result.runs.quiet.end)); await shot("quiet-arrived-lab-parking");
} catch (e) {
  result.errors.push(String(e?.stack ?? e)); note("error", e?.message ?? e);
  if (page) await shot("error").catch(() => {});
} finally {
  writeFileSync(path.join(out, "play.json"), JSON.stringify(result, null, 2));
  await browser.close(); server.close();
}
