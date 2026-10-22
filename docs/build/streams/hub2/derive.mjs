// HUB-2: derive the crown-station 3090 save headlessly with the game's own step (the playthrough harness), from
// ATM-1's Basin anchorage save. The Creel climbs the crown's north cliff to the dock; the diver restores stage 1
// (power and air) at the door with ordinary commands. STAGED (rule staging, not earned play): the stage 1 and
// stage 2 materials are added to the diver's hold, and the Creel's charge is set to 30% so the dock has work.
// usage (repo root, after `npm run test:build`): node docs/build/streams/hub2/derive.mjs <atm1Saves> <outDir>
import fs from "node:fs";
import path from "node:path";
const [inDir, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const B = process.cwd() + "/.test-build/";
const { Driver } = await import(B + "scripts/playthrough/driver.js");
const { loadSnapshot } = await import(B + "scripts/playthrough/persistence.js");
const { fly, pilotTo } = await import(B + "scripts/playthrough/routes.js");
const { route, travel } = await import(B + "scripts/playthrough/travel.js");
const { craft, leaveCraft } = await import(B + "scripts/playthrough/actions.js");
const { ROUTES } = await import(B + "src/content/regions/passages.js");
const { RECIPES } = await import(B + "src/content/registry.js");
const { CROWN_STATION } = await import(B + "src/content/hub/crownStation.js");
const { addItem } = await import(B + "src/sim/inventory.js");
const { createEnvelope, encodeSave } = await import(B + "src/save/codec.js");
await (await import(B + "scripts/playthrough/content.js")).loadCampaign();
const d = new Driver("hub2", "creel", loadSnapshot(fs.readFileSync(path.join(inDir, "basin-240.json"), "utf8")));
const s2 = (id) => fly(d, { id, source: `S2 ${id}`, points: ROUTES.find((x) => x.id === id).path.map((p) => ({ ...p })) });
s2("route.hub.balcony");
pilotTo(d, "the crown dock", CROWN_STATION.dock);
const creel = d.occupied();
leaveCraft(d);
for (const i of d.state.inventory.items.filter((x) => x.containerId === "diver" && !x.fitted)) i.containerId = creel.cargoId;
const fund = (id) => { for (const [k, q] of Object.entries(RECIPES[id].cost)) addItem(d.state, k, q, "diver"); };
for (const bp of ["bp_creel_service", "bp_canopy_reinforcement"]) if (!d.state.knowledge.blueprints.includes(bp)) d.state.knowledge.blueprints.push(bp);
fund("restore_crown_power"); // STAGED
travel(d, route("to the crown door", "diver", "local swim, played", [{ ...CROWN_STATION.work, tolerance: 0.8 }]), "to the crown door");
craft(d, "restore_crown_power");
fund("restore_crown_dock"); // STAGED: the keyboard session pays this one at the door
d.state.fleet.vehicles.find((v) => v.id === creel.id).charge = 30; // STAGED: something for the dock to do
const e = encodeSave(createEnvelope(d.state, { sessionId: "hub2-evidence", createdAt: "2026-10-01T00:00:00.000Z",
  savedAt: new Date(Date.parse("2026-10-01T00:00:00.000Z") + d.state.tick * 1000 / 60).toISOString() }));
if (!e.ok) throw new Error(e.error);
fs.writeFileSync(path.join(outDir, "crown-door.json"), e.value);
console.log("crown-door", JSON.stringify(d.state.player.pose.position), "stage power", d.state.world.facilities.find((f) => f.id === "crown_power").repaired,
  "creel", JSON.stringify(d.state.fleet.vehicles.find((v) => v.id === creel.id).pose.position), "charge 30");
