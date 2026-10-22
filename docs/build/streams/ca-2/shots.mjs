// CA-2 cave screenshots: one task-owned headless Chrome (ANGLE GL-EGL on the RTX 3090) against the
// Canopy/Basin cave lab under the caller's Vite dev server. For every cave group: a daylight view
// from outside a mouth, and a lamp-off view from inside its deepest-reaching room looking at the
// way out. Basin caves get their swim-in wake seeded first, so the glowing trail shows lamp-off.
// Run through scripts/heavy-check.sh (one GPU job at a time); the browser is closed at the end.
// usage: node shots.mjs <repo> <port> <outdir>
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const require = createRequire("/work/tmp/gpu-prep/pw/");
const { chromium } = require("playwright-core");
const [repo, port, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const B = path.join(repo, ".test-build/");
const { CANOPY_BASIN_GROUPS, groupDef } = await import(B + "src/content/regions/caves/index.js");
const { worldFloor } = await import(B + "src/content/regions/worldFloor.js");

/** Per group: the mouth to look in from (daylight), and a diver route pose to look out from (lamp
 * off): route `route`, eye at pose `eye`, looking at pose `at`. Basin caves get the swim in along
 * the route (mouth to eye) laid as wake 12 s before the shot. */
const PLAN = {
  canopy_knot_hollow: { mouth: "canopy_knot_hollow.mouth", route: "canopy_knot_hollow.route.exit", eye: 0, at: 3 },
  canopy_eastcrown: { mouth: "canopy_bladder_pocket.mouth.rim", route: "canopy_eastcrown.route.crawl_back", eye: 0, at: 3 },
  canopy_lee_hollow: { mouth: "canopy_lee_hollow.mouth", route: "canopy_lee_hollow.route.exit", eye: 0, at: 4 },
  canopy_fin_cleft: { mouth: "canopy_fin_cleft.mouth.north", route: "canopy_fin_cleft.route.through", eye: 3, at: 5 },
  canopy_root_arch: { mouth: "canopy_escarp_gallery.mouth.arch", route: "canopy_root_arch.route.hall", eye: 8, at: 12 },
  canopy_lantern_hall: { mouth: "canopy_lantern_hall.mouth.mooring", route: "canopy_lantern_hall.route.hall", eye: 4, at: 9 },
  basin_culvert_north: { mouth: "basin_culvert_north.mouth", route: "basin_culvert_north.route.exit", eye: 0, at: 4 },
  basin_burrow_warren: { mouth: "basin_burrow_warren.mouth", route: "basin_burrow_warren.route.exit", eye: 0, at: 4 },
  basin_buried_hut: { mouth: "basin_buried_hut.mouth.slot", route: "basin_buried_hut.route.exit", eye: 1, at: 4 },
  basin_fracture_pocket: { mouth: "basin_fracture_pocket.mouth", route: "basin_fracture_pocket.route.exit", eye: 0, at: 4 },
  basin_west_rim: { mouth: "basin_west_rim_cut.mouth.rim", route: "basin_west_rim.route.pipe_gallery", eye: 7, at: 4 },
  basin_dish_lee_vault: { mouth: "basin_dish_lee_vault.mouth.cliff", route: "basin_dish_lee_vault.route.alcove_exit", eye: 0, at: 4 },
};

const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`,
  headless: true, args: ["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist", "--ca2-shots"], timeout: 30000 });
const result = { renderer: null, shots: [], errors: [] };
try {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  for (const g of CANOPY_BASIN_GROUPS) {
    const id = g.source.id, plan = PLAN[id], def = groupDef(g, worldFloor);
    const page = await context.newPage();
    page.on("pageerror", e => result.errors.push(`${id}: ${e.message}`));
    page.on("console", m => { if (m.type() === "error") result.errors.push(`${id}: ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${port}/tools/cave-lab-canopy-basin.html?cave=${id}&hud=0&loop=message&collide=0`, { waitUntil: "load", timeout: 180000 });
    await page.waitForFunction(() => Number(document.getElementById("view")?.dataset.frame ?? 0) > 8, null, { timeout: 180000 });
    result.renderer ??= await page.evaluate(() => { const gl = document.createElement("canvas").getContext("webgl2"); const i = gl?.getExtension("WEBGL_debug_renderer_info"); return i ? gl.getParameter(i.UNMASKED_RENDERER_WEBGL) : null; });
    // Daylight, outside the mouth, lamp off.
    await page.evaluate(v => window.caveLab.show(v, false, "fine"), `${plan.mouth}.out`);
    const day = path.join(out, `${id}-day.jpg`);
    await page.screenshot({ path: day, type: "jpeg", quality: 72 });
    // Lamp off, inside on a diver route, looking towards the way out. Basin caves show the swim-in wake.
    const route = def.routes.find(x => x.id === plan.route).path, up = p => ({ x: p.x, y: p.y + 0.6, z: p.z });
    if (g.style === "silt_vault") {
      const swimIn = plan.eye > plan.at ? route.slice(0, plan.eye + 1) : [...route].reverse().slice(0, route.length - plan.eye);
      await page.evaluate(p => window.caveLab.seedWake(p, 12), swimIn);
    }
    await page.evaluate(v => window.caveLab.show(v, false, "fine"), { pos: up(route[plan.eye]), at: up(route[plan.at]) });
    const dark = path.join(out, `${id}-lamp-off.jpg`);
    await page.screenshot({ path: dark, type: "jpeg", quality: 72 });
    result.shots.push({ id, day: path.basename(day), dark: path.basename(dark) });
    await page.close();
  }
  await context.close();
} finally {
  await browser.close();
}
writeFileSync(path.join(out, "shots.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ renderer: result.renderer, shots: result.shots.length, errors: result.errors }, null, 2));
