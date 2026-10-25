// Derive the 3090 play save from the harness's Creel route (headless, the game's own step):
// every phase through "rift", then the Creel flown to the head of S2's route.basin.rift.
// Also rehearse the stalker approach headless to pick waypoints the hull sweeps clear.
const B = "/work/tmp/c3-play/tb/";
const fs = await import("node:fs");
const { Driver } = await import(B + "scripts/playthrough/driver.js");
const { LIVE_PHASES } = await import(B + "scripts/playthrough/live.js");
const { CREEL_LATER } = await import(B + "scripts/playthrough/later.js");
const { SaveSlot, loadSnapshot } = await import(B + "scripts/playthrough/persistence.js");
const { runPhases } = await import(B + "scripts/playthrough/runner.js");
const { reach, board } = await import(B + "scripts/playthrough/actions.js");
const { fly, pilotTo } = await import(B + "scripts/playthrough/routes.js");
const { ROUTES } = await import(B + "src/content/regions/passages.js");
const { createEnvelope, encodeSave } = await import(B + "src/save/codec.js");
await (await import(B + "scripts/playthrough/content.js")).loadCampaign();
const opts = { readOptional: true, reverse: false, verbose: false };
const slot = new SaveSlot("c3-play");
const run = await runPhases(new Driver("creel", "creel"), [...LIVE_PHASES, CREEL_LATER[0]], opts, slot);
console.log(run.phases.map((p) => `${p.id}:${p.status}`).join(" "));
const d = new Driver("c3-play", "creel", loadSnapshot(slot.snapshots.get("rift")));
const creel = d.state.fleet.vehicles.find((v) => v.hull === "creel");
reach(d, creel.id); board(d, creel.id);
fly(d, "creel_out"); fly(d, "basin_outbound");
const s2 = (id, rev = false) => { const r = ROUTES.find((x) => x.id === id); const pts = (rev ? [...r.path].reverse() : r.path).map((p) => ({ ...p }));
  fly(d, { id, source: `S2 ${id}`, points: pts }); };
s2("route.basin.legacy_anchorage");
const save = (name) => { const e = encodeSave(createEnvelope(d.state, { sessionId: "c3-gpu-play", createdAt: "2026-10-20T00:00:00.000Z", savedAt: new Date(Date.parse("2026-10-20T00:00:00.000Z") + d.state.tick * 1000 / 60).toISOString() }));
  if (!e.ok) throw new Error(e.error); fs.writeFileSync(`/work/tmp/c3-play/saves/${name}.json`, e.value);
  const v = d.state.fleet.vehicles.find((x) => x.id === creel.id);
  console.log(name, JSON.stringify(v.pose.position), "yaw", v.pose.yaw.toFixed(3), "charge", v.charge.toFixed(1), "rating", v.rating, "suit", d.state.inventory.items.filter((i) => i.fitted).map((i) => i.kind).join(","), "lamp", d.state.player.lamp); };
save("basin-rift-head");
// Rehearsal: down S2's Rift route and the ceramic ledge to the south lip, lamp on, then west toward the chimney.
s2("route.basin.rift"); s2("route.rift.ceramic");
console.log("at lip", JSON.stringify(d.occupied().pose.position));
const stalkers = () => d.state.world.ecology.agents.filter((a) => a.id.startsWith("rift_stalker")).map((a) => `${a.id}:${a.mode}@${a.position.x.toFixed(0)},${a.position.y.toFixed(0)},${a.position.z.toFixed(0)} aw ${a.awareness.toFixed(2)}`).join(" ");
console.log("stalkers", stalkers(), "lamp", d.state.player.lamp);
const { sampleHazards } = await import(B + "src/sim/ecology/hazards.js");
for (const q of [{ x: -40, y: -282, z: -1050 }, { x: -100, y: -286, z: -1045 }, { x: -130, y: -288, z: -1045 }, { x: -145, y: -288, z: -1045 }, { x: -160, y: -288, z: -1043 }, { x: -185, y: -290, z: -1055 }]) {
  try { pilotTo(d, `toward the chimney`, q); } catch (e) { console.log("blocked", JSON.stringify(q), e.message); break; }
  for (let i = 0; i < 12; i++) { d.idle(0.5); if (d.state.world.ecology.agents.some((a) => a.mode !== "rest")) break; }
  const p = d.occupied().pose.position;
  console.log(JSON.stringify(q), stalkers(), "hp", d.occupied().health.toFixed(1), "heat", sampleHazards ? JSON.stringify(sampleHazards(p, d.state.tick)) : "");
}
{ const p = d.occupied().pose.position, st = d.state.world.ecology.agents.find((a) => a.id === "rift_stalker_chimney");
  const { stimulusFrom } = await import(B + "src/sim/ecology/stimulus.js");
  const sti = stimulusFrom(d.state, 0, { lamp: d.state.player.lamp });
  console.log("scenario", d.state.scenario, "phase", d.state.opening.phase, "light", sti.light, "los", d.world.lineOfSight(st.position, p), "dist", Math.hypot(p.x - st.position.x, p.y - st.position.y, p.z - st.position.z).toFixed(1), JSON.stringify(st));
}
// Evade: lamp off, back east to cool water; watch the stalkers settle.
d.command({ type: "lamp" });
console.log("lamp", d.state.player.lamp, d.state.feedback);
for (const q of [{ x: -130, y: -284, z: -1045 }, { x: -60, y: -280, z: -1060 }]) { pilotTo(d, "away", q); d.idle(4); console.log("away", JSON.stringify(q), stalkers(), "hp", d.occupied().health.toFixed(1)); }
const { leaveCraft, workPoses, gather } = await import(B + "scripts/playthrough/actions.js");
const { SOURCES } = await import(B + "src/content/registry.js");
pilotTo(d, "back to the south lip", { x: -6.8, y: -264, z: -1090 });
s2("route.rift.divide_flank");
save("divide-west");
console.log("divide", JSON.stringify(d.occupied().pose.position), "charge", d.occupied().charge.toFixed(1), "hp", d.occupied().health.toFixed(1));
const src = SOURCES.divide_lattice_ledge_west.position;
const park = (() => { const sh = { radius: 3.9, height: 3.6 };
  for (const up of [5, 8, 12]) for (const r of [0, 5, 9]) for (let k = 0; k < (r ? 8 : 1); k++) { const a = k / 8 * Math.PI * 2, q = { x: src.x + Math.cos(a) * r, y: src.y + up, z: src.z + Math.sin(a) * r };
    if (d.world.clearance ? true : true) return q; } })();
leaveCraft(d);
console.log("diver out", JSON.stringify(d.state.player.pose.position), d.state.player.mode);
const poses = workPoses(d, "divide_lattice_ledge_west");
console.log("work poses", poses.slice(0, 3).map((p) => JSON.stringify(p.body)).join(" "));
const got = gather(d, "divide_lattice_ledge_west", 2);
console.log("gathered", got, "diver at", JSON.stringify(d.state.player.pose), "src", JSON.stringify(src));
