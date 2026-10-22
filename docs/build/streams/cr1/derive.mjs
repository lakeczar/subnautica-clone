// CR-1: derive the 3090 play saves headless with the game's own step. P1's creel
// scenario is played to the Meridian; each save branches from one of its milestone
// snapshots, idles there (real steps) until the scene's window is due, then places
// the diver at the scene. Placement is a diagnostic shortcut (as C4's derive-c):
// every other fact in the save was earned by the bot.
// usage: node derive.mjs <repo> <outdir>
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
const [repo, out] = process.argv.slice(2), B = path.join(repo, ".test-build/");
mkdirSync(out, { recursive: true });
const { Driver } = await import(B + "scripts/playthrough/driver.js");
const { LIVE_PHASES, boardAt, make } = await import(B + "scripts/playthrough/live.js");
const { CREEL_LATER } = await import(B + "scripts/playthrough/later.js");
const { SaveSlot, loadSnapshot } = await import(B + "scripts/playthrough/persistence.js");
const { runPhases } = await import(B + "scripts/playthrough/runner.js");
const { gather, reach } = await import(B + "scripts/playthrough/actions.js");
const { enter } = await import(B + "scripts/playthrough/nav.js");
const { fly } = await import(B + "scripts/playthrough/routes.js");
const { createEnvelope, encodeSave } = await import(B + "src/save/codec.js");
const { sitePosition } = await import(B + "src/content/ecology/sites.js");
const { homeOf, layerY } = await import(B + "src/sim/ecology/agents.js");
const { windowOpen } = await import(B + "src/sim/fauna/windows.js");
const { NORMAL_VIEWS, faceTarget } = await import(B + "tests/targeting-support.js");
await (await import(B + "scripts/playthrough/content.js")).loadCampaign();

const opts = { readOptional: true, reverse: false, verbose: false };
const slot = new SaveSlot("cr1-play");
const upTo = [...LIVE_PHASES, ...CREEL_LATER];
const phases = upTo.slice(0, upTo.findIndex((p) => p.id === "meridian") + 1);
const run = await runPhases(new Driver("creel", "creel"), phases, opts, slot);
console.log(run.phases.map((p) => `${p.id}:${p.status}`).join(" "));

const save = (name, s) => {
  const e = encodeSave(createEnvelope(s, { sessionId: `cr1-${name}`, createdAt: "2026-10-22T00:00:00.000Z",
    savedAt: new Date(Date.parse("2026-10-22T00:00:00.000Z") + s.tick * 1000 / 60).toISOString() }));
  if (!e.ok) throw new Error(`${name}: ${e.error}`);
  writeFileSync(path.join(out, `${name}.json`), e.value);
  console.log(name, "tick", s.tick, JSON.stringify(s.player.pose.position), s.player.mode);
};
/** Idle (real steps) until `window` opens exactly `seconds` from now. */
function lead(d, window, seconds) {
  const at = seconds * 60;
  d.waitFor(`${window} due in ${seconds} s`, 400, (s) => windowOpen(window, s.tick + at) && !windowOpen(window, s.tick + at - 1));
}
/** The diver, alone in the water at `p`, looking along `yaw`. */
function diverAt(s, p, yaw) {
  Object.assign(s.player, { mode: "swimming", controlledVehicleId: null, interiorId: null, interiorPose: null,
    velocity: { x: 0, y: 0, z: 0 }, lamp: true });
  s.player.pose = { frame: "world", position: { ...p }, yaw, pitch: 0 };
  s.player.vitals.oxygen = 100;
}

// 1. The rib school: a hand net made at the pod, then the diver at the school's normal view, facing it.
{
  const d = new Driver("cr1-ribs", "creel", loadSnapshot(slot.snapshots.get("creatures")));
  make(d, "hand_net", "pod", ["island_chain", "refuge_reef"]);
  d.waitFor("the rib school to regather", 900, (s) => s.world.resources.find((r) => r.id === "reef_fish_ribs").stock >= 4);
  const s = structuredClone(d.state), v = NORMAL_VIEWS.find((x) => x.id === "reef_fish_ribs");
  diverAt(s, v.position, 0); faceTarget(s, "reef_fish_ribs");
  save("ribs", s);
}
// 2. The pod with fish in the hold and the trap holding its catch.
{
  const d = new Driver("cr1-pod", "creel", loadSnapshot(slot.snapshots.get("creatures")));
  d.waitFor("the trap's catch", 1200, (s) => (s.systems.traps[0]?.held ?? 0) >= 2);
  gather(d, "reef_fish_ribs", 2);
  enter(d, "pod");
  save("pod", d.state);
}
// 3. The Dart at the head of the Canopy route, the hunter's round due in 20 s.
{
  const d = new Driver("cr1-canopy", "creel", loadSnapshot(slot.snapshots.get("isles")));
  const dart = d.vehicle("dart");
  reach(d, dart.id); boardAt(d, dart); fly(d, "dart_out");
  lead(d, "canopy_sound_hunter", 20);
  save("canopy-head", d.state);
}
// 4. The Rift: the diver at the warm passage's west mouth, the vent feeding due in 15 s.
{
  const d = new Driver("cr1-rift", "creel", loadSnapshot(slot.snapshots.get("rift")));
  lead(d, "glare_stalker", 15);
  const s = structuredClone(d.state), c = sitePosition({ site: "rift_split_chimney", offset: { x: 0, y: 0, z: 0 } });
  diverAt(s, { x: c.x - 54, y: c.y + 8, z: c.z }, Math.PI / 2);
  save("rift-mouth", s);
}
// 5. The Divide: the diver a metre over the mirror, 30 m west of a skate's home, slack due in 12 s.
{
  const d = new Driver("cr1-divide", "creel", loadSnapshot(slot.snapshots.get("divide")));
  lead(d, "layer_skate", 12);
  const s = structuredClone(d.state), h = homeOf("divide_skate_saddle");
  diverAt(s, { x: h.x - 30, y: layerY("divide_dense_layer") + 1.5, z: h.z }, Math.PI / 2);
  save("divide-mirror", s);
}
// 6. Meridian: the diver 26 m west of the gallery choir, its rest due in 10 s.
{
  const d = new Driver("cr1-meridian", "creel", loadSnapshot(slot.snapshots.get("meridian")));
  lead(d, "hollow_choir", 10);
  const s = structuredClone(d.state), h = homeOf("district_choir_gallery");
  diverAt(s, { x: h.x - 26, y: h.y + 1.5, z: h.z }, Math.PI / 2);
  save("meridian-gallery", s);
}
