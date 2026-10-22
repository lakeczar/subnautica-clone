// ATM-1: derive the evidence saves headlessly with the game's own step (the playthrough harness),
// from the M2 audit's milestone saves, so the 3090 session spends its time looking, not commuting.
// usage (repo root, after `npm run test:build`): node docs/build/streams/atm1/derive.mjs <auditSaves> <outDir>
import fs from "node:fs";
import path from "node:path";
const [inDir, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const B = process.cwd() + "/.test-build/";
const { Driver } = await import(B + "scripts/playthrough/driver.js");
const { loadSnapshot } = await import(B + "scripts/playthrough/persistence.js");
const { reach, board } = await import(B + "scripts/playthrough/actions.js");
const { fly, pilotTo, turnTo } = await import(B + "scripts/playthrough/routes.js");
const { yawTo } = await import(B + "scripts/playthrough/travel.js");
const { ROUTES } = await import(B + "src/content/regions/passages.js");
const { SOURCES, HULL_COLLIDERS } = await import(B + "src/content/registry.js");
const { sweptHullClearance } = await import(B + "src/sim/world.js");
const { createEnvelope, encodeSave } = await import(B + "src/save/codec.js");
await (await import(B + "scripts/playthrough/content.js")).loadCampaign();
const load = (file) => new Driver("atm1", "creel", loadSnapshot(fs.readFileSync(path.join(inDir, `${file}.json`), "utf8")));
const boardCreel = (d) => { const c = d.state.fleet.vehicles.find((v) => v.hull === "creel"); if (d.state.player.controlledVehicleId !== c.id) { reach(d, c.id); board(d, c.id); } return d; };
const s2 = (d, id, until = () => false) => {
  const r = ROUTES.find((x) => x.id === id), points = [];
  for (const p of r.path) { points.push({ ...p }); if (until(p)) break; }
  fly(d, { id, source: `S2 ${id}`, points });
};
const save = (d, name) => {
  const e = encodeSave(createEnvelope(d.state, { sessionId: "atm1-evidence", createdAt: "2026-10-01T00:00:00.000Z",
    savedAt: new Date(Date.parse("2026-10-01T00:00:00.000Z") + d.state.tick * 1000 / 60).toISOString() }));
  if (!e.ok) throw new Error(e.error);
  fs.writeFileSync(path.join(outDir, `${name}.json`), e.value);
  const v = d.occupied();
  console.log(name, JSON.stringify(v.pose.position), "yaw", v.pose.yaw.toFixed(2), "lamp", d.state.player.lamp, "charge", v.charge?.toFixed(1));
};
// Basin 240 m: the audit's derived Rift-head save sits at the Basin hub (360, -240, -430).
let d = load("derived-rift-head"); save(d, "basin-240");
// Rift: down S2's Rift route to its head (the first point past z -600), and on to the 300 m flank mooring.
s2(d, "route.basin.rift", (p) => p.z < -600); save(d, "rift-head");
s2(d, "route.basin.rift"); save(d, "rift-300");
// Divide 395 m: the audit's derived Divide save.
d = load("derived-divide-end"); save(d, "divide-395");
// Meridian 590 m: Divide → Meridian broad, then down the terraces until 590 m.
s2(d, "route.divide.meridian_broad"); s2(d, "route.meridian.terraces", (p) => p.y < -585); save(d, "meridian-590");
// Creel arm work: bow over the Basin ridge frame stack, as the playthrough parks it (live.ts armLift).
d = boardCreel(load("creel-basin-frames")); fly(d, "creel_out"); fly(d, "basin_outbound");
{
  const host = SOURCES.basin_frame_ridge.position, shape = HULL_COLLIDERS.creel;
  const park = [[0, 5.5], [0, -5.5], [5.5, 0], [-5.5, 0]].map(([dx, dz]) => ({ x: host.x + dx, y: host.y + 4.5, z: host.z + dz }))
    .find((q) => sweptHullClearance(d.world, [{ ...q, y: q.y + 30 }, q], shape));
  pilotTo(d, "bow over the ridge frames", park); turnTo(d, yawTo(park, host));
}
save(d, "creel-arm");
