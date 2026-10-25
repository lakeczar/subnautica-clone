// UX-1: the two 3090 saves, from the carrier-deep milestone with the harness's own moves.
// S1 "outside-vestibule": ride the Creel to the yard, leave it, swim to the Hearthline's
//   exterior vestibule (the carrier holding station at the yard).
// S2 "helm-blocked": board, take the helm, pilot low over a nearby slope and turn to a
//   heading whose lock corridor the terrain obstructs, with a turn hint of 25-100°.
// usage: node derive2.mjs <tb dir> <saves dir>
const [B0, OUT] = process.argv.slice(2);
const B = B0.endsWith("/") ? B0 : B0 + "/";
const fs = await import("node:fs");
const { Driver } = await import(B + "scripts/playthrough/driver.js");
const { loadSnapshot } = await import(B + "scripts/playthrough/persistence.js");
const { reach, board, leaveCraft } = await import(B + "scripts/playthrough/actions.js");
const { fly, pilotTo, turnTo } = await import(B + "scripts/playthrough/routes.js");
const { travel, route } = await import(B + "scripts/playthrough/travel.js");
const { walkAboard } = await import(B + "scripts/playthrough/carrierplay.js");
const { ROUTES } = await import(B + "src/content/regions/passages.js");
const { HULL_COLLIDERS } = await import(B + "src/content/registry.js");
const { createEnvelope, encodeSave } = await import(B + "src/save/codec.js");
const { sweptHullClearance } = await import(B + "src/sim/world.js");
const C = await import(B + "src/sim/carrier.js");
const S = await import(B + "src/sim/carrierStations.js");
await (await import(B + "scripts/playthrough/content.js")).loadCampaign();
const t0 = Date.now();
const d = new Driver("ux1-gpu", "carrier", loadSnapshot(fs.readFileSync(`${OUT}/carrier-deep.json`, "utf8")));
const save = (name) => {
  const e = encodeSave(createEnvelope(d.state, { sessionId: "ux1-gpu-play", createdAt: "2026-10-20T00:00:00.000Z",
    savedAt: new Date(Date.parse("2026-10-20T00:00:00.000Z") + d.state.tick * 1000 / 60).toISOString() }));
  if (!e.ok) throw new Error(e.error);
  fs.writeFileSync(`${OUT}/${name}.json`, e.value);
  console.log("saved", name, JSON.stringify(d.state.player.pose.position), d.state.player.mode);
};
const h = () => C.carrierHull(d.state);
const s2 = (id) => { const r = ROUTES.find((x) => x.id === id); fly(d, { id, source: `S2 ${id}`, points: r.path.map((p) => ({ ...p })) }); };
// S1: by Creel to the yard, out, and a swim to the exterior vestibule.
const creel = d.vehicle("creel");
reach(d, creel.id); board(d, creel.id);
fly(d, "creel_out");
s2("route.isles.workshop_stack");
const vest = C.localToWorld(C.CARRIER_LAYOUT.exteriorVestibule, h());
let parked = false;
for (const off of [[14, -4, 0], [14, -6, 8], [0, -6, 18], [-14, -6, 0], [20, -2, -10]]) {
  try { pilotTo(d, "beside the carrier", { x: vest.x + off[0], y: vest.y + off[1], z: vest.z + off[2] }); parked = true; break; }
  catch (e) { console.log("park try failed", off.join(","), String(e.message).slice(0, 120)); }
}
if (!parked) throw new Error("could not park the Creel by the carrier");
leaveCraft(d);
travel(d, route("to the carrier vestibule", "diver", "local swim, played", [{ ...vest, y: vest.y - 0.5, tolerance: 1.5 }]));
if (!d.state.fleet.docking.stationKeeping) throw new Error("the carrier is not holding station");
save("outside-vestibule");
// S2: aboard, the helm, then a slope.
d.command({ type: "carrier", action: "enter-interior" });
walkAboard(d, C.CARRIER_LAYOUT.helm, "to the helm");
d.command({ type: "carrier", action: "helm" });
const start = { ...h().pose.position }, hullShape = HULL_COLLIDERS.hearthline;
const mantle = d.state.fleet.vehicles.find((v) => v.berth);
const candidates = [];
for (let r = 30; r <= 150; r += 15) for (let k = 0; k < 16; k++) {
  const a = k * Math.PI / 8, x = start.x + r * Math.cos(a), z = start.z + r * Math.sin(a);
  const y = Math.min(-2, d.world.groundHeight(x, z) + 5.5);
  if (!d.world.clearance({ x, y, z }, hullShape)) continue;
  const headings = [];
  for (let deg = 0; deg < 360; deg += 15) {
    const s = structuredClone(d.state), c = C.carrierHull(s);
    c.pose.position = { x, y, z }; c.pose.yaw = deg * Math.PI / 180; C.updateBerth(s, d.world);
    const m = s.fleet.vehicles.find((v) => v.id === mantle.id);
    if (C.transferBlock(s, m, m.berth.slot, "launch", d.world) !== "terrain") continue;
    const remedy = C.corridorRemedy(s, m, d.world);
    if (remedy && "turn" in remedy && Math.abs(remedy.turn) >= 25 * Math.PI / 180 && Math.abs(remedy.turn) <= 100 * Math.PI / 180) headings.push(deg);
  }
  if (headings.length) candidates.push({ x, y, z, r, headings });
}
candidates.sort((a, b) => a.r - b.r);
console.log("slope candidates", candidates.length, JSON.stringify(candidates.slice(0, 5)));
let at = null;
for (const c of candidates.slice(0, 12)) {
  try { pilotTo(d, "low over a slope", { x: c.x, y: c.y, z: c.z }); at = c; break; }
  catch (e) { console.log("slope try failed", c.x.toFixed(0), c.z.toFixed(0), String(e.message).slice(0, 120)); }
}
if (!at) throw new Error("no reachable slope");
// Stop, then turn (look steps at the helm) to the first planned blocked heading still blocked here.
d.idle(3);
let chosen = null;
for (const deg of at.headings) {
  turnTo(d, deg * Math.PI / 180); d.idle(2);
  const st = S.launchCorridor(d.state, d.world);
  console.log("heading", deg, "→", st.clear ? "clear" : st.advice);
  if (!st.clear && /Turn about/.test(st.advice)) { chosen = deg; break; }
}
if (chosen === null) throw new Error("no blocked heading after arriving");
console.log("carrier", JSON.stringify(h().pose.position), "yaw", h().pose.yaw.toFixed(3), "speed", Math.hypot(h().velocity.x, h().velocity.y, h().velocity.z).toFixed(2));
save("helm-blocked");
console.log("done in", ((Date.now() - t0) / 1000).toFixed(0), "s");
