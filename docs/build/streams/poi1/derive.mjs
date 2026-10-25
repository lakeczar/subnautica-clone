// POI-1: derive the 3090 evidence saves headlessly with the game's own step (after ATM-1's derive.mjs):
// a Creel at each deep leg's start and at a ~250 m vantage on each lit landmark, so the GPU session
// spends its time flying and looking. usage (repo root, after the playthrough tsc): node derive.mjs <auditSaves> <outDir>
import fs from "node:fs";
import path from "node:path";
const [inDir, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const B = process.cwd() + "/.test-build/";
const { Driver } = await import(B + "scripts/playthrough/driver.js");
const { loadSnapshot } = await import(B + "scripts/playthrough/persistence.js");
const { pilotTo, turnTo } = await import(B + "scripts/playthrough/routes.js");
const { yawTo } = await import(B + "scripts/playthrough/travel.js");
const { createEnvelope, encodeSave } = await import(B + "src/save/codec.js");
await (await import(B + "scripts/playthrough/content.js")).loadCampaign();
const load = (file) => new Driver("poi1", "creel", loadSnapshot(fs.readFileSync(path.join(inDir, `${file}.json`), "utf8")));
const save = (d, name, look) => {
  if (look) turnTo(d, yawTo(d.occupied().pose.position, look));
  const e = encodeSave(createEnvelope(d.state, { sessionId: "poi1-evidence", createdAt: "2026-10-01T00:00:00.000Z",
    savedAt: new Date(Date.parse("2026-10-01T00:00:00.000Z") + d.state.tick * 1000 / 60).toISOString() }));
  if (!e.ok) throw new Error(e.error);
  fs.writeFileSync(path.join(outDir, `${name}.json`), e.value);
  const v = d.occupied();
  console.log(name, JSON.stringify(v.pose.position), "yaw", v.pose.yaw.toFixed(2), "hull", v.hull, "rating", v.depthRating ?? v.rating ?? "?", "charge", v.charge?.toFixed(1), "hp", v.hull ? v.health?.toFixed?.(1) : "");
};
const lift = (d, frames = 120) => { for (let i = 0; i < frames; i++) d.tick([{ type: "move", forward: 0, right: 0, vertical: 1, sprint: false }]); };
const go = (d, label, to) => { lift(d, 90); pilotTo(d, label, to, { quiet: true }); };
// The Basin hub, Creel at the carrier anchorage (360, -240, -430): leg 1 starts here.
let d = load("derived-rift-head");
save(d, "leg1-basin", { x: 290, y: -246, z: -520 });
// Vantages ~250 m off the Basin landmarks and the Rift head.
go(d, "dish vantage", { x: 300, y: -197, z: -360 }); save(d, "view-dishes", { x: 508, y: -250, z: -572 });
go(d, "wreck vantage", { x: 560, y: -236, z: -440 }); save(d, "view-wreck", { x: 780, y: -240, z: -610 });
d = load("derived-rift-head");
go(d, "rift vantage", { x: 230, y: -196, z: -520 }); save(d, "view-rift-head", { x: 90, y: -290, z: -720 });
// The Divide: leg 2 runs back to the Basin, leg 3 on to Meridian, from the lee mooring.
d = load("derived-divide-end");
save(d, "divide-as-saved");
go(d, "lee mooring", { x: 560, y: -386, z: -1116 }); save(d, "leg23-divide", { x: 660, y: -384, z: -1124 });
go(d, "gate vantage", { x: 548, y: -374, z: -1016 }); save(d, "view-gateworks", { x: 600, y: -340, z: -1262 });
d = load("derived-divide-end");
go(d, "lee mooring", { x: 560, y: -386, z: -1116 });
go(d, "dock approach", { x: 640, y: -360, z: -1205 }); save(d, "leg4-dock", { x: 632, y: -372, z: -1224 });
d = load("derived-divide-end");
go(d, "lee mooring", { x: 560, y: -386, z: -1116 });
go(d, "staging approach", { x: 980, y: -386, z: -1120 });
go(d, "spire vantage", { x: 1052, y: -500, z: -1132 }); save(d, "view-spire", { x: 1215, y: -480, z: -1319 });
