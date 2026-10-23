#!/usr/bin/env node
// REC-1 fixed-view set: derives the versioned camera poses from the content
// (the composed world decides where the diver fits and what it can see), and
// writes scripts/rec/views/views.json. Run after `node scripts/test-build.mjs`;
// it builds every cave cluster it looks into, so run it as a job.
//
//   node scripts/rec/views/make-views.mjs [OUT]
//
// Groups: places (PLACES, the pod first), regions (one or two per region:
// its places and sites), caves (each authored cave's mouth from outside and
// its first room from inside), the crown station (outside and its work
// pose), the dish field, threat-window vantages (the ecology sites), and
// named pending slots (the island lookout after OP-1; the carrier bridge,
// which needs a crewed-Hearthline save from SAVE-1).
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, "../../.."), B = path.join(repo, ".test-build/");
const out = process.argv[2] ?? path.join(here, "views.json");
const { CAVE_SOURCES, caveDef, caveSourceAt: caveAt } = await import(B + "src/content/regions/caves.js");
const { worldFloor } = await import(B + "src/content/regions/worldFloor.js");
const { gameWorld } = await import(B + "src/sim/world.js");
const { PLACES, REGIONS } = await import(B + "src/content/registry.js");
const { ECOLOGY_SITES } = await import(B + "src/content/ecology/sites.js");
const { regionAtPoint } = await import(B + "src/content/regions/layout.js");
const { CROWN_STATION } = await import(B + "src/content/hub/crownStation.js");

export const VIEWS_VERSION = 1;
const world = gameWorld(), DIVER = { radius: 0.34, height: 0.95 }, EYE = 0.6;
const deg = (r) => Math.round((r * 180) / Math.PI * 10) / 10;
const r1 = (v) => Math.round(v * 10) / 10;
/** Yaw and pitch (degrees, the HUD's convention: bearing from -Z, pitch up) from eye to target. */
const aim = (e, t) => ({ yaw: deg((Math.atan2(t.x - e.x, -(t.z - e.z)) + Math.PI * 2) % (Math.PI * 2)), pitch: deg(Math.atan2(t.y - e.y, Math.hypot(t.x - e.x, t.z - e.z))) });
const fits = (p) => p.y < -0.6 && world.clearance(p, DIVER);
const sees = (e, t) => { try { return world.lineOfSight({ x: e.x, y: e.y + EYE, z: e.z }, t); } catch { return true; } };

/** A clear, seeing eye near `t`: around the preferred direction, nearer or further, higher or lower. */
function standoff(t, dir, dist, rise, { surface = false } = {}) {
  const base = Math.atan2(dir.x, dir.z);
  for (const turn of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, -2.4, Math.PI])
    for (const d of [dist, dist * 0.7, dist * 1.4, dist * 0.45])
      for (const h of [rise, rise + 4, rise - 3, rise + 10]) {
        const a = base + turn, p = { x: t.x + Math.sin(a) * d, z: t.z + Math.cos(a) * d, y: surface ? -0.7 : t.y + h };
        if (!surface) p.y = Math.min(-1, Math.max(p.y, worldFloor(p.x, p.z) + 1.5));
        if (fits(p) && sees(p, t)) return p;
      }
  return null;
}
const views = [], pending = [];
function add(id, group, label, eye, target, extra = {}) {
  if (!eye) { pending.push({ id, group, label, reason: "no clear pose that sees it (derivation found none)" }); return; }
  const e = { x: r1(eye.x), y: r1(eye.y), z: r1(eye.z) };
  views.push({ id, group, label, region: regionAtPoint(e.x, e.z), pos: e, ...aim({ ...e, y: e.y + EYE }, target), target: { x: r1(target.x), y: r1(target.y), z: r1(target.z) }, lamp: e.y < -60, ...extra });
}

// Places, the pod first; surface places are seen from the water beside them.
const places = Object.entries(PLACES).filter(([, p]) => p.position).sort(([a], [b]) => (a === "home_pod" ? -1 : b === "home_pod" ? 1 : a.localeCompare(b)));
for (const [id, p] of places) {
  const t = p.position, surface = t.y > -2;
  add(`place.${id}`, "places", p.label ?? id, standoff(t, { x: 0.6, z: 0.8 }, surface ? 22 : 18, surface ? 0 : 5, { surface }), surface ? { ...t, y: Math.max(t.y, 0.5) } : t);
}
// The crown station, outside and at its work pose; the dish field from above.
add("hub.crown_station.outside", "hub", "Crown station, outside", standoff(CROWN_STATION.work, { x: -0.7, z: 0.7 }, 30, 6), CROWN_STATION.work);
add("hub.crown_station.work", "hub", "Crown station, at the work pose", fits(CROWN_STATION.work) ? CROWN_STATION.work : standoff(CROWN_STATION.work, { x: 1, z: 0 }, 3, 0), CROWN_STATION.dock);
const dish = { x: 508, y: -40 - 18, z: -572 };
add("basin.dish_field", "places", "The dish field (basin dish centre)", standoff(dish, { x: 0.5, z: 0.85 }, 45, 22), dish);
// Threat-window vantages: each ecology site, from where its rhythm can be watched.
for (const [id, s] of Object.entries(ECOLOGY_SITES)) add(`threat.${id}`, "threats", `Threat vantage: ${id}`, standoff(s.position, { x: 0.7, z: 0.7 }, 35, 8), s.position);
// Regions: one or two wide views each, over its places, else its sites, else its cave mouths.
for (const region of Object.keys(REGIONS)) {
  const anchors = [
    ...places.filter(([, p]) => regionAtPoint(p.position.x, p.position.z) === region && p.position.y < -3).map(([, p]) => p.position),
    ...Object.values(ECOLOGY_SITES).filter((s) => s.region === region).map((s) => s.position),
    ...CAVE_SOURCES.filter((c) => c.region === region).flatMap((c) => c.portals.filter((p) => p.kind === "mouth").slice(0, 1).map((p) => p.center)),
  ];
  for (const [i, t] of anchors.slice(0, 2).entries()) add(`region.${region}.${i + 1}`, "regions", `${REGIONS[region].label}, wide ${i + 1}`, standoff(t, { x: i ? -0.8 : 0.8, z: 0.6 }, 60, 18), t);
  if (!anchors.length) pending.push({ id: `region.${region}.1`, group: "regions", label: REGIONS[region].label, reason: "no authored place, site or cave mouth to frame" });
}
// Caves: the main mouth from outside, the first room from inside (toward that mouth).
for (const src of CAVE_SOURCES) {
  const def = caveDef(src.id, worldFloor);
  const mouth = [...src.portals].filter((p) => p.kind === "mouth").sort((a, b) => b.clear.width * b.clear.height - a.clear.width * a.clear.height)[0];
  if (mouth) {
    const n = Math.hypot(mouth.normal.x, mouth.normal.z) > 0.5 ? mouth.normal : { x: 1, z: 0 };
    // The outward side is the one outside every footprint.
    const out1 = { x: mouth.center.x + n.x * 14, z: mouth.center.z + n.z * 14 };
    const outward = caveAt(out1.x, out1.z) ? { x: -n.x, z: -n.z } : { x: n.x, z: n.z };
    add(`cave.${src.id}.mouth`, "caves", `${src.label}: mouth`, standoff(mouth.center, outward, 14, 2), mouth.center);
  }
  const room = def.rooms[0], b = room?.bounds;
  if (b) {
    const c = { x: (b.min.x + b.max.x) / 2, y: Math.min(b.max.y - 1.5, b.min.y + 2.5), z: (b.min.z + b.max.z) / 2 };
    let eye = fits(c) ? c : null;
    for (let i = 0; !eye && i < 40; i++) {
      const p = { x: b.min.x + ((i * 7) % 10 + 0.5) / 10 * (b.max.x - b.min.x), y: c.y + ((i % 3) - 1), z: b.min.z + ((i * 3) % 10 + 0.5) / 10 * (b.max.z - b.min.z) };
      if (fits(p)) eye = p;
    }
    const look = mouth?.center ?? { x: b.max.x, y: c.y, z: c.z };
    add(`cave.${src.id}.interior`, "caves", `${src.label}: inside ${room.label}`, eye, look, { lamp: true });
  }
}
pending.push({ id: "island.lookout", group: "places", label: "The starting island lookout", reason: "after OP-1 lands (slot kept)" });
pending.push({ id: "carrier.bridge", group: "hub", label: "The carrier bridge", reason: "needs a save with the Hearthline crewed (SAVE-1's library); interior staging is not derived" });
const doc = { version: VIEWS_VERSION, made: new Date().toISOString().slice(0, 10), note: "Fixed-view poses (REC-1). Regenerate with make-views.mjs when content moves; bump `version`.",
  defaults: { size: "1280x720", ssim: 0.97, settleMs: 1500 }, views, pending };
writeFileSync(out, JSON.stringify(doc, null, 1) + "\n");
console.log(`${views.length} views, ${pending.length} pending → ${out}`);
