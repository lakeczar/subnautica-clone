// UX-1: derive the 3090 carrier saves with the harness's own phases (headless, the game's step).
// creel LIVE_PHASES to refits, then the carrier route's rift, hearthline and carrier-deep phases:
// the Hearthline holding station with the Mantle berthed. Then the diver swims out of the
// vestibule (the harness's own walk and leave), and that is the "outside" save.
// usage: node derive.mjs <tb dir> <out dir>
const [B0, OUT] = process.argv.slice(2);
const B = B0.endsWith("/") ? B0 : B0 + "/";
const fs = await import("node:fs");
fs.mkdirSync(OUT, { recursive: true });
const { Driver } = await import(B + "scripts/playthrough/driver.js");
const { LIVE_PHASES } = await import(B + "scripts/playthrough/live.js");
const { CARRIER_LATER } = await import(B + "scripts/playthrough/later.js");
const { SaveSlot, loadSnapshot } = await import(B + "scripts/playthrough/persistence.js");
const { runPhases } = await import(B + "scripts/playthrough/runner.js");
const { exitCarrier, carrierOut } = await import(B + "scripts/playthrough/carrierplay.js");
const { createEnvelope, encodeSave } = await import(B + "src/save/codec.js");
const C = await import(B + "src/sim/carrier.js");
const S = await import(B + "src/sim/carrierStations.js");
await (await import(B + "scripts/playthrough/content.js")).loadCampaign();
const opts = { readOptional: true, reverse: false, verbose: false };
const t0 = Date.now();
const slot = new SaveSlot("ux1-creel");
const a = await runPhases(new Driver("ux1-creel", "creel"), LIVE_PHASES, opts, slot);
console.log("creel", a.phases.map((p) => `${p.id}:${p.status}`).join(" "), ((Date.now() - t0) / 1000).toFixed(0), "s");
const slot2 = new SaveSlot("ux1-carrier");
const b = await runPhases(new Driver("ux1-carrier", "carrier", loadSnapshot(slot.snapshots.get("refits"))), CARRIER_LATER.slice(0, 3), opts, slot2);
console.log("carrier", b.phases.map((p) => `${p.id}:${p.status}`).join(" "), ((Date.now() - t0) / 1000).toFixed(0), "s");
const text = slot2.snapshots.get("carrier-deep");
if (!text) throw new Error("no carrier-deep milestone");
fs.writeFileSync(`${OUT}/carrier-deep.json`, text);
const d = new Driver("ux1-carrier", "carrier", loadSnapshot(text));
const where = () => { const h = C.carrierHull(d.state); return { mode: d.state.player.mode, carrier: h.pose.position, yaw: h.pose.yaw.toFixed(3), holding: d.state.fleet.docking.stationKeeping,
  config: d.state.fleet.docking.configuration, berthed: d.state.fleet.vehicles.filter((v) => v.berth).map((v) => `${v.hull}@${v.berth.slot}`), supported: d.state.fleet.docking.supportedDock }; };
console.log("at carrier-deep", JSON.stringify(where()));
// Plan the refused-launch demonstration: the corridor at every 15° heading here.
const plan = [];
for (let deg = 0; deg < 360; deg += 15) {
  const s = structuredClone(d.state), h = C.carrierHull(s);
  h.pose.yaw = deg * Math.PI / 180; C.updateBerth(s, d.world);
  const st = S.launchCorridor(s, d.world);
  plan.push(`${deg}:${st ? (st.clear ? "clear" : st.advice.replace(/^.*Turn about (\d+)° to (\w+).*$/, "turn $1 $2").slice(0, 60)) : "none"}`);
}
console.log("corridor by heading", plan.join(" | "));
// Out through the vestibule, as the harness does it.
if (d.state.player.controlledVehicleId) carrierOut(d); else if (d.state.player.interiorId) exitCarrier(d);
console.log("outside", JSON.stringify(where()), JSON.stringify(d.state.player.pose.position));
const save = (name) => {
  const e = encodeSave(createEnvelope(d.state, { sessionId: "ux1-gpu-play", createdAt: "2026-10-20T00:00:00.000Z",
    savedAt: new Date(Date.parse("2026-10-20T00:00:00.000Z") + d.state.tick * 1000 / 60).toISOString() }));
  if (!e.ok) throw new Error(e.error);
  fs.writeFileSync(`${OUT}/${name}.json`, e.value);
  console.log("saved", name);
};
save("outside-vestibule");
console.log("done in", ((Date.now() - t0) / 1000).toFixed(0), "s");
