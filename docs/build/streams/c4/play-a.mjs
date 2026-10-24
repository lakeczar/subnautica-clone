// C4 stage A, 3090 ordinary-key play: one task-owned headless Chrome (ANGLE GL-EGL on the RTX 3090),
// from New Game with no derived save. Keys only (Space hold, W/S, arrows, Space/C, Shift, L), steering
// closed-loop from the HUD (bearing, pitch cue, depth) and the canvas camera position.
// Route: pod → surface swim west → the Fanvault north mouth → vault (lamp off, then on) → south mouth
// → across the shelf-break race → surface.
// usage: node play-a.mjs <repo> <dist> <outdir> <port>
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const require = createRequire("/work/tmp/gpu-prep/pw/");
const { chromium } = require("playwright-core");
const [repo, dist, out, port] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const B = path.join(repo, ".test-build/");
const { caveDef } = await import(B + "src/content/regions/caves.js");
const { worldFloor } = await import(B + "src/content/regions/worldFloor.js");
const { REEF_SHELF_RACE } = await import(B + "src/content/currents/world.js");
const fanvault = caveDef("fanvault", worldFloor), loop = fanvault.routes.find((r) => r.role === "loop").path;
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
  headless: true, args: ["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist", "--c4-play-a"], timeout: 30000 });
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
const above = (x, z, lift) => ({ x, y: worldFloor(x, z) + lift, z });
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
  await page.locator("#new-game").click();
  await page.waitForFunction(() => !document.querySelector("#hud")?.hidden, null, { timeout: 60000 });
  await page.locator("#ocean").click();
  // Skip the pod opening: hold Space.
  await page.keyboard.down("Space"); await page.waitForTimeout(1300); await page.keyboard.up("Space");
  await page.waitForFunction(() => document.querySelector("#ocean").dataset.ready === "true", null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  let s = await read(); note("start", JSON.stringify({ cam: s.cam, depth: s.depth, vitals: s.vitals }));
  // Walk off the pod deck down its ramp into the water (face -Z).
  await turnTo(0, 0);
  await key("KeyW", true); await page.waitForTimeout(4500); await releaseAll(); await page.waitForTimeout(800);
  // Swimming: the HUD depth is the body's, so the eye height is camera Y + depth (C3's rule).
  await key("KeyC", true); await page.waitForTimeout(600); await releaseAll(); await page.waitForTimeout(500);
  s = await read(); eye = s.cam[1] + s.depth; note("in water", JSON.stringify({ cam: s.cam, depth: s.depth, eye }));
  // 1. Surface swim west to the Fanvault's north approach, then down to the mouth.
  await frames("pod → Fanvault (surface swim)", async () => {
    await goto({ x: -60, y: -0.6, z: -10 }, { tol: 4, label: "west 1", sprint: true, timeout: 90 });
    await goto({ x: -200, y: -0.6, z: -25 }, { tol: 4, label: "west 2", sprint: true, timeout: 120 });
    await goto({ x: -282.5, y: -0.6, z: -32 }, { tol: 3, label: "over the north approach", sprint: true, timeout: 120 });
  });
  s = await read(); note("over the Fanvault", JSON.stringify({ cam: s.cam, vitals: s.vitals }));
  await frames("dive and swim the Fanvault north passage", async () => {
    await goto({ x: loop[0].x, y: loop[0].y + 0.8, z: loop[0].z }, { tol: 1.5, label: "north approach" });
    for (const [i, q] of loop.slice(1, 7).entries()) await goto({ ...q, y: q.y + 0.8 }, { tol: 1.4, label: `loop#${i + 1}` });
  });
  s = await read(); result.checks.inVault = { cave: s.cave, pos: pos(s), vitals: s.vitals };
  note("in the vault", JSON.stringify(result.checks.inVault));
  // 2. Lamp off (it starts on): look toward the south passage; the exit should glow.
  await tap("KeyL"); await page.waitForTimeout(400); watch(await read());
  await turnTo(Math.atan2(-292.5 - pos(s).x, -(-71 - pos(s).z)), 0); await page.waitForTimeout(800);
  await shot("vault-lamp-off-south-exit");
  await turnTo(Math.atan2(-304 - pos(s).x, -(-64.5 - pos(s).z)), -5); await page.waitForTimeout(800);
  await shot("vault-lamp-off-pocket");
  // Lamp on at the same view.
  await tap("KeyL"); await page.waitForTimeout(800); watch(await read());
  await shot("vault-lamp-on-pocket");
  await turnTo(Math.atan2(-289.5 - pos(s).x, -(-64 - pos(s).z)), 70); await page.waitForTimeout(800);
  await shot("vault-skylight");
  // 3. Lamp off again and out the south passage by the glow.
  await tap("KeyL"); await page.waitForTimeout(300);
  await frames("lamp off: vault → south mouth", async () => {
    for (const [i, q] of loop.slice(7).entries()) await goto({ ...q, y: q.y + 0.8 }, { tol: 1.5, label: `loop#${i + 7}` });
  });
  s = await read(); result.checks.outSouth = { cave: s.cave, pos: pos(s), vitals: s.vitals };
  note("out the south mouth", JSON.stringify(result.checks.outSouth));
  await tap("KeyL");
  // 4. The shelf-break race: approach from the east, cross west, record the downslope sweep.
  const sh = REEF_SHELF_RACE.shape, mid = { x: sh.a.x + (sh.b.x - sh.a.x) * 0.45, z: sh.a.z + (sh.b.z - sh.a.z) * 0.45 };
  const east = above(mid.x + 11, mid.z, 2.5), west = above(mid.x - 11, mid.z, 2.5);
  await frames("south mouth → east edge of the race", async () => { await goto(above(-318, -100, 3), { tol: 2, label: "slope" }); await goto(east, { tol: 1.5, label: "race east edge" }); });
  await turnTo(-Math.PI / 2, -8); await page.waitForTimeout(1000);
  s = await read(); note("streaks", s.streaks); result.checks.streaksAtEdge = s.streaks;
  await shot("shelf-race-from-east");
  const before = pos(s);
  let maxSweep = 0;
  await frames("swim across the race (W only, heading west)", async () => {
    await key("KeyW", true);
    const t0 = performance.now();
    while (performance.now() - t0 < 15000) {
      const r = await read(); watch(r); const p = pos(r);
      maxSweep = Math.max(maxSweep, before.z - p.z);
      if (p.x < west.x) break;
      await key("Space", p.y < worldFloor(p.x, p.z) + 1.5);
      await page.waitForTimeout(50);
    }
    await releaseAll();
  });
  s = await read(); const after = pos(s);
  result.checks.race = { before, after, crossedWest: after.x < mid.x - 6, sweptDownslope: +maxSweep.toFixed(2), vitals: s.vitals };
  note("race", JSON.stringify(result.checks.race));
  await shot("across-the-race");
  // 5. Up to the surface.
  await frames("ascent", async () => { await goto({ ...after, y: -0.6 }, { tol: 1, label: "surface", timeout: 60 }); });
  s = await read(); result.checks.surfaced = { pos: pos(s), vitals: s.vitals };
  await shot("surfaced");
} catch (e) { result.errors.push(String(e && e.stack || e)); note("ERROR", String(e && e.message || e)); try { await shot("error"); } catch {} }
finally { await browser.close().catch(() => {}); server.close(); }
result.log = log;
writeFileSync(path.join(out, "play-a.json"), JSON.stringify(result, null, 2));
console.log("done; errors", result.errors.length);
