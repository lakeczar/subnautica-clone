#!/usr/bin/env node
// REC-1: the owner's playtest path, end to end, as a player would use it:
// the recorder on by default (spooled to the browser's private storage, with
// the in-game 12 fps video), a stretch of play, then Settings → Export flight
// recording. The downloaded ZIP is unpacked and built into a pack like any
// other recording.
//
//   node scripts/rec/playtest-check.mjs --dist DIST --save SAVE --plan PLAN --segment N --seconds S --out DIR
//     [--chrome BIN --pw DIR --gpu REGEX --machine LABEL]
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { launch, openGame, pilot, serve } from "./browser.mjs";
import { unzip } from "./unzip.mjs";
import { buildPack } from "./pack.mjs";

const args = process.argv.slice(2), arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const out = arg("out"), seconds = Number(arg("seconds", 60));
if (!out || !arg("dist") || !arg("save")) { console.error("usage: playtest-check.mjs --dist DIST --save SAVE --out DIR [--plan PLAN --segment N --seconds S]"); process.exit(2); }
if (process.env.SILTWAKE_GPU_LEASE === undefined) { const { requireGpuLease } = await import("../heavy/gpu-lease.mjs"); requireGpuLease("REC-1's playtest check"); }
mkdirSync(out, { recursive: true });
const plan = arg("plan") ? JSON.parse(readFileSync(arg("plan"), "utf8")) : null, points = plan ? plan.segments[Number(arg("segment", 0))] : [];
const server = await serve(arg("dist"), 0, { isolate: false }); // as a static host serves it: no isolation headers
const b = await launch({ chrome: arg("chrome"), pw: arg("pw"), label: "rec1-playtest" });
const result = { errors: [] };
let exit = 0;
try {
  b.page.on("pageerror", (e) => result.errors.push(e.message.slice(0, 300)));
  // The player's default (a person's browser is not automated, so this one names it).
  const open = await openGame(b.page, `http://127.0.0.1:${server.port}/?rec=playtest`, arg("save"), { gpu: arg("gpu") });
  result.renderer = open.renderer;
  result.mode = await b.page.evaluate(() => window.__siltwake.recorder?.mode ?? "off");
  if (result.mode !== "playtest") throw new Error(`the recorder is ${result.mode} by default, not playtest`);
  const p = pilot(b.page), end = Date.now() + seconds * 1000;
  for (const pt of points.slice(1)) { if (Date.now() > end) break; await p.goto(pt, { tol: pt.cave ? 4 : 7, stop: () => Date.now() > end }); }
  while (Date.now() < end) await b.page.waitForTimeout(500);
  await p.releaseAll();
  // A feedback note, as the owner would leave one (N), then the export from Settings.
  await b.page.keyboard.press("KeyN");
  await b.page.locator("#note-text").fill("REC-1 check: a note from the feedback key");
  await b.page.keyboard.press("Enter");
  await b.page.waitForTimeout(500);
  await b.page.keyboard.press("Escape");
  await b.page.locator("#open-settings").click();
  const [download] = await Promise.all([b.page.waitForEvent("download", { timeout: 120000 }), b.page.locator('[data-action="flight"]').click()]);
  const zip = path.join(out, download.suggestedFilename());
  await download.saveAs(zip);
  result.zip = { file: path.basename(zip), bytes: statSync(zip).size };
} catch (e) {
  result.errors.push(String(e?.stack ?? e).slice(0, 1000));
  exit = 1;
} finally {
  await b.close();
  await server.close();
}
if (result.zip) {
  const rec = path.join(out, "recording");
  mkdirSync(rec, { recursive: true });
  result.entries = unzip(path.join(out, result.zip.file), rec);
  const s = await buildPack(out, { chrome: arg("chrome"), pw: arg("pw") });
  result.pack = s.summary;
}
writeFileSync(path.join(out, "playtest-check.json"), JSON.stringify(result, null, 1));
console.log(JSON.stringify({ mode: result.mode, zip: result.zip, entries: result.entries, verdict: result.pack?.verdict, errors: result.errors.length }));
process.exit(exit);
