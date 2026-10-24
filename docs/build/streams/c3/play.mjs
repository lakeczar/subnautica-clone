// C3 3090 ordinary-control play: one task-owned headless Chrome (ANGLE GL-EGL on the RTX 3090),
// driven only by the game's keys (W/S, arrows, Space/C, L, X, E, F5, K) with closed-loop
// steering read from the HUD (bearing, pitch cue, depth) and the canvas camera position.
// usage: node play.mjs <dist> <save.json> <outdir> <port>
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const require = createRequire("/work/tmp/gpu-prep/pw/");
const { chromium } = require("playwright-core");
const [dist, saveFile, out, port] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const B = "/work/tmp/c3-play/tb/";
const { ROUTES } = await import(B + "src/content/regions/passages.js");
const W = await import(B + "src/sim/world.js"), { HULL_COLLIDERS } = await import(B + "src/content/registry.js");
const world = W.createWorldQueries();
/** The harness's pilotTo plan: straight if the hull sweeps clear (1.5 m margin first), else up, across and down. */
function legs(points, hull = "creel") {
  const shape = HULL_COLLIDERS[hull], wide = { ...shape, radius: shape.radius + 1.5 }, out = [];
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1], to = points[i];
    const plan = (h) => { if (W.sweptHullClearance(world, [from, to], h)) return [to];
      for (const rise of [8, 16, 30, 50]) { const y = Math.min(-2, Math.max(from.y, to.y) + rise);
        const over = [{ ...from, y }, { ...to, y }, to];
        if (W.sweptHullClearance(world, [from, over[0], over[1]], h) && W.sweptHullClearance(world, [over[1], to], shape)) return over; }
      return null; };
    const p = plan(wide) ?? plan(shape);
    if (!p) throw new Error(`no clear plan ${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
    out.push(...p);
  }
  return out;
}
const route = (id, rev = false) => { const r = ROUTES.find((x) => x.id === id).path; return (rev ? [...r].reverse() : r).map((p) => ({ x: p.x, y: p.y, z: p.z })); };
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
const result = { commit: readFileSync(path.join(dist, "COMMIT"), "utf8").trim(), save: saveFile, segments: [], shots: [], errors: [], captions: [] };
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`,
  headless: true, args: ["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist", "--c3-play"], timeout: 30000 });
let page;
const held = new Set();
const key = async (k, on) => { if (on && !held.has(k)) { held.add(k); await page.keyboard.down(k); } else if (!on && held.has(k)) { held.delete(k); await page.keyboard.up(k); } };
const releaseAll = async () => { for (const k of [...held]) await key(k, false); };
const tap = async (k, ms = 80) => { await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k); };
const wrap = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
let eye = null;
async function read() {
  return page.evaluate(() => {
    const c = document.querySelector("#ocean").dataset, q = (s) => document.querySelector(s);
    const pitch = Number(/(-?\d+)/.exec(q("#pitch-cue")?.getAttribute("aria-label") ?? "Pitch 0")?.[1] ?? 0);
    return { cam: (c.cameraPosition ?? "0,0,0").split(",").map(Number), bearing: parseFloat(q("#bearing")?.textContent ?? "0"), pitch,
      depth: parseFloat(q("#depth")?.textContent ?? "0"), prompt: q("#interact-prompt")?.innerText ?? "",
      notices: [q("#alert-stack"), q("#hazard"), q("#notification"), q("#action-result"), q("#audio-caption"), q("#subtitles")].map((e) => e?.innerText ?? "").join(" | ").replace(/\s+/g, " "),
      vitals: q("#vitals")?.innerText.replace(/\s+/g, " ") ?? "", region: q("#region-name")?.innerText ?? "", menu: !!q("#menu") && !q("#menu").hidden };
  });
}
const pos = (s) => ({ x: s.cam[0], y: s.cam[1] - (eye ?? 0), z: s.cam[2] });
const seen = new Set();
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
    p50: qq(0.5), p95: qq(0.95), p99: qq(0.99), max: s.length ? +s[s.length - 1].toFixed(1) : null, over50: s.filter((x) => x > 50).length, over100: s.filter((x) => x > 100).length };
  result.segments.push(seg); note("segment", JSON.stringify(seg));
}
async function shot(name) {
  const file = path.join(out, `${String(result.shots.length + 1).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file }); result.shots.push(file); note("screenshot", file);
}
/** Closed-loop piloting or swimming to a point with the ordinary keys. */
async function goto(t, { tol = 3, final = false, label = "", timeout = 240 } = {}) {
  const start = performance.now(); let best = Infinity, bestAt = start, recoveries = 0;
  for (;;) {
    const s = await read(); watch(s);
    const p = pos(s), dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z, h = Math.hypot(dx, dz), d3 = Math.hypot(h, dy);
    if (d3 <= tol) break;
    if (d3 < best - 0.3) { best = d3; bestAt = performance.now(); }
    // Snagged on a ledge (a cut corner): back off and lift, as a player would, then go on.
    if (performance.now() - bestAt > 6000 && recoveries < 3 && performance.now() - start < timeout * 1000) {
      recoveries++; note("recover", label, `${d3.toFixed(1)} m short`);
      await releaseAll(); await key("KeyS", true); await key("Space", true); await page.waitForTimeout(1500); await releaseAll();
      bestAt = performance.now(); best = Infinity; result.recoveries = (result.recoveries ?? 0) + 1; continue;
    }
    if (performance.now() - bestAt > 20000 || performance.now() - start > timeout * 1000) { await releaseAll(); throw new Error(`stalled ${d3.toFixed(1)} m short of ${label} (${t.x},${t.y},${t.z}) at ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`); }
    const yaw = s.bearing * Math.PI / 180, want = h > 1.2 ? Math.atan2(dx, -dz) : yaw, err = wrap(want - yaw);
    await key("ArrowRight", err > 0.035); await key("ArrowLeft", err < -0.035);
    await key("ArrowUp", s.pitch < -2); await key("ArrowDown", s.pitch > 2);
    const slow = final && h < 5;
    await key("KeyW", Math.abs(err) < (h > 8 ? 0.45 : 0.25) && h > (final ? 0.5 : tol * 0.6) && (!slow || Math.floor(performance.now() / 300) % 2 === 0));
    await key("Space", dy > 0.7); await key("KeyC", dy < -0.7);
    await page.waitForTimeout(40);
  }
  await releaseAll();
}
async function path_(points, label, opts = {}) { for (const [i, q] of points.entries()) await goto(q, { tol: i === points.length - 1 ? (opts.tol ?? 2.5) : 2.5, final: i === points.length - 1, label: `${label}#${i}` }); }
async function turnTo(yaw, pitchDeg) {
  for (let i = 0; i < 400; i++) {
    const s = await read(), err = wrap(yaw - s.bearing * Math.PI / 180), perr = pitchDeg - s.pitch;
    await key("ArrowRight", err > 0.02); await key("ArrowLeft", err < -0.02);
    await key("ArrowUp", perr > 1.5); await key("ArrowDown", perr < -1.5);
    if (Math.abs(err) <= 0.02 && Math.abs(perr) <= 1.5) break;
    await page.waitForTimeout(30);
  }
  await releaseAll();
}
async function settle(ms = 1500) { await releaseAll(); await page.waitForTimeout(ms); }
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
  // The derived save, imported through the menu like a player's backup.
  await page.locator("#import-file").setInputFiles(saveFile);
  await page.waitForTimeout(500);
  if (await page.locator("#confirmation").isVisible().catch(() => false)) await page.locator("#confirm-accept").click();
  await page.waitForFunction(() => !document.querySelector("#hud")?.hidden && document.querySelector("#ocean").dataset.ready === "true", null, { timeout: 60000 });
  await page.locator("#ocean").click();
  await page.waitForTimeout(1500);
  let s = await read(); eye = s.cam[1] + s.depth; note("loaded", JSON.stringify({ cam: s.cam, bearing: s.bearing, depth: s.depth, eye, region: s.region, vitals: s.vitals }));
  await shot("loaded-basin-rift-head");

  if (process.env.PLAY_MODE !== "divide") {
  // 1. Creel down S2's Rift route and along the ceramic ledge to the south lip: the Rift edge.
  await frames("creel basin → rift edge", async () => { await path_(route("route.basin.rift"), "basin.rift"); await path_(route("route.rift.ceramic").slice(1), "rift.ceramic"); });
  await settle(); await shot("rift-edge-south-lip");
  // 2. The glare stalker: west toward the split chimney, lamp on, into the warm passage mouth.
  await frames("toward the chimney, lamp on", async () => {
    await path_(legs([{ x: -6.8, y: -264, z: -1090 }, { x: -40, y: -282, z: -1050 }, { x: -100, y: -286, z: -1045 }, { x: -160, y: -288, z: -1043 }, { x: -185, y: -290, z: -1055 }]), "chimney");
    const t0 = performance.now();
    while (performance.now() - t0 < 12000) { const r = await read(); watch(r); if (/stalker|Rippling lights/i.test(r.notices)) break; await page.waitForTimeout(100); }
  });
  await shot("glare-stalker-noticed");
  // Evade: lamp off (L) and back east out of the warm water.
  await tap("KeyL"); await page.waitForTimeout(300); watch(await read());
  await frames("lamp off, retreat to cool water", async () => { await path_(legs([{ x: -185, y: -290, z: -1055 }, { x: -130, y: -284, z: -1045 }, { x: -60, y: -280, z: -1060 }]), "retreat");
    const t0 = performance.now(); while (performance.now() - t0 < 5000) { watch(await read()); await page.waitForTimeout(100); } });
  await shot("stalker-evaded-lamp-off");
  await tap("KeyL");
  // 3. To the Divide: back to the south lip and S2's flank line to the western lattice ledge.
  await frames("rift → divide", async () => { await path_(legs([{ x: -60, y: -280, z: -1060 }, { x: -6.8, y: -264, z: -1090 }]), "lip"); await path_(route("route.rift.divide_flank").slice(1), "divide_flank"); });
  await settle(); await shot("divide-west-ledge");
  s = await read(); result.divide = { pos: pos(s), vitals: s.vitals, region: s.region };
  // 4. Save (F5), reload the page, Continue.
  await tap("F5"); await page.waitForTimeout(2500); watch(await read());
  const saveStatus = await page.evaluate(() => document.querySelector("#save-status")?.innerText ?? "");
  note("save status", saveStatus); result.saveStatus = saveStatus;
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("#ocean")?.dataset.graphics === "available", null, { timeout: 60000 });
  await page.locator("#continue").waitFor({ state: "visible", timeout: 30000 });
  await shot("reloaded-title-continue");
  const t0 = performance.now();
  await page.locator("#continue").click();
  await page.waitForFunction(() => !document.querySelector("#hud")?.hidden && document.querySelector("#ocean").dataset.ready === "true", null, { timeout: 60000 });
  result.continueMs = Math.round(performance.now() - t0);
  await page.locator("#ocean").click(); await page.waitForTimeout(1500);
  s = await read(); result.afterContinue = { pos: pos(s), vitals: s.vitals, region: s.region };
  note("continued", JSON.stringify(result.afterContinue), "in", result.continueMs, "ms");
  await shot("continued-at-divide");
  } else {
    // Diagnostics at the Divide: the whole page, then the canvas alone, level and pitched up.
    await shot("divide-page");
    const canvasOnly = async (name) => { await page.evaluate(() => { for (const el of document.querySelectorAll("body *")) if (el.id !== "ocean" && !el.contains(document.querySelector("#ocean"))) el.style.visibility = "hidden"; });
      await shot(name); result.pixels = { ...(result.pixels ?? {}), [name]: await page.evaluate(() => { const c = document.querySelector("#ocean"); const g = c.getContext("webgl2"); return null; }) };
      await page.evaluate(() => { for (const el of document.querySelectorAll("body *")) el.style.visibility = ""; }); };
    await canvasOnly("divide-canvas-level");
    await turnTo((await read()).bearing * Math.PI / 180, 20); await canvasOnly("divide-canvas-up20");
    await turnTo((await read()).bearing * Math.PI / 180, 0);
  }
  // 5. One lattice: leave the Creel (hold X), swim to the ledge work pose, aim, E.
  await page.keyboard.down("KeyX"); await page.waitForTimeout(1500); await page.keyboard.up("KeyX"); await page.waitForTimeout(800);
  s = await read(); eye = s.cam[1] + s.depth; note("diver out", JSON.stringify({ cam: s.cam, depth: s.depth, eye }));
  await frames("diver to the lattice", async () => { await goto({ x: 336.5, y: -364, z: -1185.5 }, { tol: 1.0, final: true, label: "lattice work pose", timeout: 90 }); });
  await turnTo(0.047, -44);
  s = await read(); note("prompt", s.prompt);
  await shot("aimed-at-lattice");
  // Aimed but out of reach ("Move closer"): ease forward along the aim in short taps.
  for (let i = 0; i < 25 && /Move closer/i.test(s.prompt); i++) { await tap("KeyW", 120); await page.waitForTimeout(250); s = await read(); }
  note("after nudges", s.prompt.replace(/\s+/g, " "));
  if (!/Collect/i.test(s.prompt)) for (const [dy, dp] of [[0, -10], [0, 10], [0.15, 0], [-0.15, 0], [0.3, -10], [-0.3, -10]]) {
    await turnTo(0.047 + dy, -44 + dp); s = await read(); note("re-aim", dy, dp, s.prompt.replace(/\s+/g, " ")); if (/Collect/i.test(s.prompt)) break; }
  await tap("KeyE"); await page.waitForTimeout(7000); s = await read(); watch(s);
  result.latticeNotice = s.notices; await shot("lattice-collected");
  await tap("Tab"); await page.waitForTimeout(1000);
  result.cargoPanel = await page.evaluate(() => document.querySelector("#panel-content")?.innerText ?? "");
  await shot("cargo-after-lattice"); await tap("Escape"); await page.waitForTimeout(500);
  // 6. A refit at a restored stop: open the craft panel (K) and record what it offers here.
  await tap("KeyK"); await page.waitForTimeout(1000);
  result.craftPanel = await page.evaluate(() => document.querySelector("#panel-content")?.innerText ?? "");
  await shot("craft-panel-at-divide");
  await tap("Escape");
} catch (e) { result.errors.push(String(e && e.stack || e)); note("ERROR", String(e && e.message || e)); try { await shot("error"); } catch {} }
finally { await browser.close().catch(() => {}); server.close(); }
result.log = log;
writeFileSync(path.join(out, "play.json"), JSON.stringify(result, null, 2));
console.log("done; errors", result.errors.length);
