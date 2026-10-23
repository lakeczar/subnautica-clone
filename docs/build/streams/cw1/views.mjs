// CW-1 view stops for the traversal harness (TST-08, ART-06, CAV-07): plan
// points carrying `view` (a shot name) and `look` (what to face), driven by
// traverse.mjs like any segment, from saves of the same late state as the tour.
//   segment 0, the crown mast line (bearing 134° from the island lookout):
//     1 km, the lookout itself (765 m) and 400 m from the mast, each surfaced
//     (the mast and its lamp above water) and submerged (the mast's far-layer
//     silhouette where its chunk is not drawn).
//   segment 1, a network seam: the diver, lamp on, swims Bellhole's crawl into
//     the Archlet across the two caves' shared footprint edge (z = 84), with
//     shots before, at and after the seam.
// usage: node views.mjs <repo> <outdir>
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const [repo, out] = process.argv.slice(2), B = path.join(repo, ".test-build/");
mkdirSync(out, { recursive: true });
const { CAVE_SOURCES } = await import(B + "src/content/regions/caves.js");
const { worldFloor } = await import(B + "src/content/regions/worldFloor.js");
const { CROWN_MAST, ISLAND_LOOKOUT } = await import(B + "src/content/hub/crownStation.js");
const { createEnvelope, encodeSave, decodeSave } = await import(B + "src/save/codec.js");

// The mast line.
const m = CROWN_MAST, L = ISLAND_LOOKOUT, d = Math.hypot(L.x - m.x, L.z - m.z), u = { x: (L.x - m.x) / d, z: (L.z - m.z) / d };
const at = (r) => ({ x: +(m.x + u.x * r).toFixed(1), z: +(m.z + u.z * r).toFixed(1) });
const SURFACE = -1.5, UNDER = -10, CRUISE = -3;
const lamp = { x: m.lamp.x, y: m.lamp.y, z: m.lamp.z }, body = { x: m.x, y: -20, z: m.z };
const clampY = (y, p) => Math.min(-2, Math.max(worldFloor(p.x, p.z) + 3, y));
const mast = [];
const stop = (r, name) => {
  const p = at(r);
  mast.push({ ...p, y: SURFACE, view: `mast-${name}-surface`, look: lamp, tol: 3 });
  mast.push({ ...p, y: clampY(UNDER, p), view: `mast-${name}-submerged`, look: body, tol: 3 });
};
const cruise = (r0, r1) => { for (let r = r0 - 50; r > r1 + 25; r -= 50) { const p = at(r); mast.push({ ...p, y: clampY(CRUISE, p) }); } };
mast.push({ ...at(1000), y: SURFACE });
stop(1000, "1km");
cruise(1000, d);
mast.push({ ...L, y: SURFACE, view: "mast-lookout-765m-surface", look: lamp, tol: 3 },
  { ...L, y: clampY(UNDER, L), view: "mast-lookout-765m-submerged", look: body, tol: 3 });
cruise(d, 400);
stop(400, "400m");

// The seam: Bellhole's route into the Archlet.
const bell = CAVE_SOURCES.find(c => c.id === "reef_bellhole"), arch = CAVE_SOURCES.find(c => c.id === "reef_archlet");
if (bell.footprint.maxZ !== arch.footprint.minZ) throw new Error("the Bellhole and the Archlet no longer share an edge");
const crawl = bell.routes.find(r => r.id === "reef_bellhole.route.archlet").path, seamZ = bell.footprint.maxZ;
const ahead = (i) => crawl[Math.min(crawl.length - 1, i + 2)];
const seam = crawl.map((p, i) => ({ x: p.x, y: p.y, z: p.z, tol: 1.5 }));
for (const [i, p] of seam.entries()) {
  const before = p.z < seamZ - 5 && p.z >= seamZ - 9, on = Math.abs(p.z - seamZ) < 0.5, after = p.z > seamZ + 4 && p.z <= seamZ + 11;
  const name = before ? "seam-bellhole-side" : on ? "seam-at-edge" : after ? "seam-archlet-side" : null;
  if (name && !seam.some(q => q.view === name)) Object.assign(p, { view: name, look: ahead(i) });
}

// Saves: the creel route's state after its refits phase.
const { Driver } = await import(B + "scripts/playthrough/driver.js");
const { LIVE_PHASES } = await import(B + "scripts/playthrough/live.js");
const { SaveSlot, loadSnapshot } = await import(B + "scripts/playthrough/persistence.js");
const { runPhases } = await import(B + "scripts/playthrough/runner.js");
await (await import(B + "scripts/playthrough/content.js")).loadCampaign();
const slot = new SaveSlot("cw1-views");
await runPhases(new Driver("creel", "creel"), LIVE_PHASES, { readOptional: true, reverse: false, verbose: false }, slot);
const base = loadSnapshot(slot.snapshots.get("refits"));
const write = (k, s) => {
  const meta = { sessionId: "cw1-views", createdAt: "2026-10-22T00:00:00.000Z",
    savedAt: new Date(Date.parse("2026-10-22T00:00:00.000Z") + s.tick * 1000 / 60).toISOString() };
  const e = encodeSave(createEnvelope(s, meta));
  if (!e.ok) throw new Error(`views ${k}: ${e.error}`);
  const back = decodeSave(e.value);
  if (!back.ok) throw new Error(`views ${k}: ${back.error}`);
  writeFileSync(path.join(out, `seg${k}.json`), e.value);
};
{ // The Dart on the mast line.
  const s = structuredClone(base), dart = s.fleet.vehicles.find(v => v.hull === "dart"), p0 = mast[0];
  dart.pose = { ...dart.pose, frame: "world", position: { x: p0.x, y: p0.y, z: p0.z }, yaw: 0, pitch: 0 };
  dart.velocity = { x: 0, y: 0, z: 0 }; dart.charge = 100; dart.health = 100; dart.disabled = false;
  s.player.controlledVehicleId = dart.id; s.player.mode = "piloting"; s.player.interiorId = null; s.player.interiorPose = null;
  s.player.pose = { frame: "world", position: { ...dart.pose.position }, yaw: 0, pitch: 0 };
  s.player.vitals = { health: 100, oxygen: 100, food: 100 }; s.player.lamp = true;
  write(0, s);
}
{ // The diver at Bellhole's crawl.
  const s = structuredClone(base), p0 = seam[0];
  s.player.controlledVehicleId = null; s.player.mode = "swimming"; s.player.interiorId = null; s.player.interiorPose = null;
  s.player.pose = { frame: "world", position: { x: p0.x, y: p0.y, z: p0.z }, yaw: 0, pitch: 0 };
  s.player.velocity = { x: 0, y: 0, z: 0 };
  s.player.vitals = { health: 100, oxygen: 100, food: 100 }; s.player.lamp = true;
  write(1, s);
}
writeFileSync(path.join(out, "plan.json"), JSON.stringify({ views: true, segments: [mast, seam] }, null, 1));
console.log(`views: mast line ${mast.filter(p => p.view).length} views over ${mast.length} points; seam ${seam.filter(p => p.view).map(p => p.view).join(", ")}`);
