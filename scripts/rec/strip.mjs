#!/usr/bin/env node
// REC-1 frame strips on demand: N consecutive frames of a pack's video (or,
// without video, its nearest snapshots) tiled into ONE image about 1280 px
// wide, each tile labelled with time, tick, depth, speed and hold state.
// Agents read images, not video: this is how they see motion.
//
//   node scripts/rec/strip.mjs PACK --event A07            ±2 s at 12 fps around an attention entry
//   node scripts/rec/strip.mjs PACK --event 1234           …or around event seq 1234 (recording/events.ndjson)
//   node scripts/rec/strip.mjs PACK --at 312.4 [--before 2] [--after 2] [--fps 12]
//   node scripts/rec/strip.mjs PACK --from 300 --to 360 --fps 1    a minute of travel
//     [--out FILE] [--pw DIR] [--chrome BIN]
// Times are seconds from the start of the run (as story.md shows them).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { analyse, loadRecording } from "./analyse.mjs";
import { composer, ensureDir } from "./imaging.mjs";
import { strip } from "./pack.mjs";

const args = process.argv.slice(2), arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const pack = args[0];
if (!pack || pack.startsWith("--")) { console.error("usage: strip.mjs PACK (--event ID|SEQ | --at S | --from S --to S) [--before S --after S --fps N --out FILE]"); process.exit(2); }
const r = loadRecording(pack), a = analyse(r), fps = Number(arg("fps", 12));
let center = null, from, to, title;
const ev = arg("event");
if (ev) {
  const saved = existsSync(path.join(pack, "analysis.json")) ? JSON.parse(readFileSync(path.join(pack, "analysis.json"), "utf8")).attention : a.attention;
  const hit = /^A\d+$/.test(ev) ? saved.find((e) => e.id === ev) : r.events.find((e) => e.seq === Number(ev));
  if (!hit) { console.error(`no event ${ev}`); process.exit(2); }
  center = hit.t; title = `${ev} · ${hit.reason ?? `${hit.kind}: ${hit.text}`}`;
} else if (arg("at")) { center = a.t0 + Number(arg("at")) * 1000; title = `at ${arg("at")} s`; }
if (center != null) { from = center - Number(arg("before", 2)) * 1000; to = center + Number(arg("after", 2)) * 1000; }
else if (arg("from") && arg("to")) { from = a.t0 + Number(arg("from")) * 1000; to = a.t0 + Number(arg("to")) * 1000; title = `${arg("from")}–${arg("to")} s at ${fps} fps`; }
else { console.error("give --event, --at or --from/--to"); process.exit(2); }
const out = arg("out", path.join(ensureDir(path.join(pack, "strips")), `x-${(ev ?? arg("at") ?? `${arg("from")}-${arg("to")}`).replace(/[^\w.-]+/g, "_")}-${fps}fps.jpg`));
const c = await composer({ pw: arg("pw"), chrome: arg("chrome") });
try {
  const made = await strip(r, a, c.page, { title, out, center, from, to, fps });
  if (!made) { console.error("no frames in that window"); process.exit(1); }
  console.log(`${out} (${made.frames} frames from the ${made.source})`);
} finally { await c.close(); }
