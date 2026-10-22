// W2: derive the hub viewpoint saves headlessly with the game's own step (the playthrough harness), from
// ATM-1's Basin anchorage save, so the 3090 session spends its time looking, not commuting.
// usage (repo root, after `npm run test:build`): node docs/build/streams/w2/derive.mjs <atm1Saves> <outDir>
import fs from "node:fs";
import path from "node:path";
const [inDir, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const B = process.cwd() + "/.test-build/";
const { Driver } = await import(B + "scripts/playthrough/driver.js");
const { loadSnapshot } = await import(B + "scripts/playthrough/persistence.js");
const { fly, pilotTo, turnTo } = await import(B + "scripts/playthrough/routes.js");
const { yawTo } = await import(B + "scripts/playthrough/travel.js");
const { ROUTES } = await import(B + "src/content/regions/passages.js");
const { createEnvelope, encodeSave } = await import(B + "src/save/codec.js");
await (await import(B + "scripts/playthrough/content.js")).loadCampaign();
const load = (file) => new Driver("w2", "creel", loadSnapshot(fs.readFileSync(path.join(inDir, `${file}.json`), "utf8")));
const CROWN = { x: 330, y: -60, z: -560 };
const s2 = (d, id, until = () => false, reverse = false) => {
  const r = ROUTES.find((x) => x.id === id), points = [];
  for (const p of reverse ? [...r.path].reverse() : r.path) { points.push({ ...p }); if (until(p)) break; }
  fly(d, { id, source: `S2 ${id}`, points });
};
const save = (d, name, face = CROWN) => {
  const v = d.occupied();
  turnTo(d, yawTo(v.pose.position, face));
  const e = encodeSave(createEnvelope(d.state, { sessionId: "w2-evidence", createdAt: "2026-10-01T00:00:00.000Z",
    savedAt: new Date(Date.parse("2026-10-01T00:00:00.000Z") + d.state.tick * 1000 / 60).toISOString() }));
  if (!e.ok) throw new Error(e.error);
  fs.writeFileSync(path.join(outDir, `${name}.json`), e.value);
  console.log(name, JSON.stringify(v.pose.position), "yaw", v.pose.yaw.toFixed(2), "charge", v.charge?.toFixed(1));
};
// The carrier anchorage (240 m), looking up the crown's north cliff.
let d = load("basin-240"); save(d, "anchorage");
// The Rift head: down the Basin-Rift lane through the step-two/crown gap, to the first point past z -600.
s2(d, "route.basin.rift", (p) => p.z < -600); save(d, "rift-head");
// The Canopy's south edge: up the crown's Canopy leg from the anchorage side, stopping at the Canopy footprint.
d = load("basin-240"); pilotTo(d, "toward the Canopy edge", { x: 470, y: -130, z: -345 }); save(d, "canopy-edge");
// The summit: up the balcony route to the crown, then off the station's west side.
d = load("basin-240"); s2(d, "route.hub.balcony", (p) => p.y > -101);
save(d, "balcony", { x: 360, y: -240, z: -430 });
s2(d, "route.hub.balcony"); pilotTo(d, "off the station", { x: 296, y: -40, z: -536 });
save(d, "summit", { x: 330, y: -46, z: -560 });
// The spur from the first step's summit, looking along it to the crown.
d = load("basin-240"); s2(d, "route.hub.spur", () => false, true); s2(d, "route.hub.spur", (p) => p.x > 78);
save(d, "first-step");
