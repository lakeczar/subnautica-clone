// SIG-1: the saves the browser check starts from. Diagnostic, rule-staged saves,
// labelled as such: each starts from the shared library's earned carrier-route
// save (`carrier-deep`: Dart 350, Creel 350, Hearthline 550, Mantle 800) where it
// has the craft, or from B1's Creel-first staging, and then fits the upgrades
// under test and places the pilot beside the target. No playthrough route builds
// a Spindle, so its save stages one at the paid build cost.
// usage: node derive.mjs <repo> <library-save.json> <out-dir>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
const [repo, librarySave, out] = process.argv.slice(2), B = path.join(repo, ".test-build/");
mkdirSync(out, { recursive: true });
const { creelFirst, meta } = await import(B + "tests/b1-support.js");
const { busyOutpost } = await import(B + "tests/c4-systems-support.js");
const { addItem } = await import(B + "src/sim/inventory.js");
const { makeVehicle } = await import(B + "src/sim/state.js");
const { vehicleHoldCapacity } = await import(B + "src/sim/fittings.js");
const { slotOf } = await import(B + "src/sim/upgrades/fitting.js");
const { SOURCES, RECIPES, MATERIALS } = await import(B + "src/content/registry.js");
const { LOST_SITES } = await import(B + "src/content/systems/decodes.js");
const { CAVE_FEATURES } = await import(B + "src/sim/signatures.js");
const { hostKind } = await import(B + "src/sim/upgrades/tools.js");
const { createEnvelope, decodeSave, encodeSave } = await import(B + "src/save/codec.js");
const { gameWorld } = await import(B + "src/sim/world.js");
const world = gameWorld();

const library = () => { const d = decodeSave(readFileSync(librarySave, "utf8")); if (!d.ok) throw new Error(d.error); return d.value.state; };
const plan = {};
function write(name, s, target) {
  const e = encodeSave(createEnvelope(s, { ...meta, sessionId: `sig1-${name}` }));
  if (!e.ok) throw new Error(`${name}: ${e.error}`);
  writeFileSync(path.join(out, `${name}.json`), e.value);
  plan[name] = target;
  console.log("derived", name, JSON.stringify(target));
}
/** Fit `kinds` to `v` (rule-staged items) and seat the pilot facing `look`. */
function fit(s, v, kinds) {
  for (const k of kinds) {
    const item = addItem(s, k, 1, v.cargoId, slotOf(v.hull, k) === "socket" ? null : "mount");
    v.modules.push(item.id);
  }
  s.inventory.containers.find((c) => c.id === v.cargoId).capacity = vehicleHoldCapacity(s, v);
}
function pilot(s, v, at, look) {
  v.pose.position = { ...at }; v.velocity = { x: 0, y: 0, z: 0 };
  const dx = look.x - at.x, dz = look.z - at.z, dy = look.y - at.y;
  v.pose.yaw = (Math.atan2(dx, -dz) + Math.PI * 2) % (Math.PI * 2);
  s.player.controlledVehicleId = v.id; s.player.mode = "piloting"; s.player.interiorId = null; s.player.interiorPose = null;
  s.player.pose = { frame: "world", position: { ...at }, yaw: v.pose.yaw, pitch: Math.max(-1.3, Math.min(1.3, Math.atan2(dy, Math.hypot(dx, dz)))) };
  s.player.velocity = { x: 0, y: 0, z: 0 };
  s.player.mobileRefuge = null;
}
/** The save's own hull; a berthed one is taken out of its berth (the pilot places it). */
const hullOf = (s, hull) => {
  const v = s.fleet.vehicles.find((x) => x.hull === hull);
  if (!v) throw new Error(`the library save has no ${hull}`);
  v.berth = null;
  return v;
};
/** A staged hull of `hull` at its paid build cost (no route builds a Spindle). */
function stagedHull(s, hull) {
  const v = makeVehicle(`${hull}_sig1`, hull, { x: 0, y: -0.5, z: 0 }, `${hull}_sig1_hold`);
  v.investment = { ...RECIPES[`${hull}_base`].cost };
  s.fleet.vehicles.push(v);
  s.inventory.containers.push({ id: v.cargoId, kind: "vehicle", capacity: 0, ownerId: v.id });
  if (!s.knowledge.crafted.includes(`${hull}_base`)) s.knowledge.crafted.push(`${hull}_base`);
  return v;
}

// 1. Dart: wide sonar and range tagger, 110 m east of the Fanvault north mouth, at its depth.
{
  const s = library(), v = hullOf(s, "dart"), mouth = CAVE_FEATURES.find((f) => f.id === "fanvault.mouth.north");
  fit(s, v, ["dart_wide_sonar", "dart_range_tagger"]);
  const at = { x: mouth.position.x + 110, y: mouth.position.y - 2, z: mouth.position.z + 20 };
  pilot(s, v, at, mouth.position);
  // A tag target: the nearest lost site, for a second aim.
  const site = Object.entries(LOST_SITES).sort(([, a], [, b]) => Math.hypot(a.position.x - at.x, a.position.z - at.z) - Math.hypot(b.position.x - at.x, b.position.z - at.z))[0];
  write("dart", s, { mouth: mouth.position, at, site: { id: site[0], position: site[1].position } });
}
// 2. Creel: cutting arm at an island mineral host (arm 3 m off it).
{
  const s = library(), v = hullOf(s, "creel");
  const id = Object.keys(SOURCES).find((k) => SOURCES[k].region === "island_chain" && Object.hasOwn(MATERIALS, SOURCES[k].item) &&
    hostKind(SOURCES[k].item) === "mineral" && (s.world.resources.find((r) => r.id === k)?.stock ?? 0) > 0);
  fit(s, v, ["creel_cutting_arm"]);
  const src = SOURCES[id].position;
  pilot(s, v, { x: src.x, y: src.y + 2, z: src.z + 3.3 }, { x: src.x, y: src.y + 2, z: src.z - 5 });
  write("creel-arm", s, { source: id, position: src });
}
// 3. Creel: grapple and cargo pod over open Basin water beside a frame host.
{
  const s = library(), v = hullOf(s, "creel");
  const id = Object.keys(SOURCES).find((k) => SOURCES[k].item === "tagged_frame" && (s.world.resources.find((r) => r.id === k)?.stock ?? 0) > 0);
  const pod = addItem(s, "creel_drop_pod", 1, v.cargoId);
  s.inventory.containers.push({ id: `${pod.id}_pod`, kind: "locker", capacity: 16, ownerId: pod.id });
  v.modules.push(pod.id);
  fit(s, v, ["creel_grapple"]);
  const f = SOURCES[id].position, at = { x: f.x + 14, y: f.y + 10, z: f.z };
  pilot(s, v, at, f);
  write("creel-grapple", s, { frame: id, position: f, at });
}
// 4. Spindle (staged): deck crane, surfaced over the reef service scraps.
{
  const s = creelFirst(), v = stagedHull(s, "spindle");
  fit(s, v, ["spindle_deck_crane"]);
  const src = SOURCES.reef_service_scraps_east.position;
  pilot(s, v, { x: src.x, y: -0.5, z: src.z + 4 }, { x: src.x, y: -0.5, z: src.z - 6 });
  write("spindle", s, { source: "reef_service_scraps_east", position: src });
}
// 5. Mantle: salvage clamp and drone bay above a Basin frame host.
{
  const s = library(), v = hullOf(s, "mantle");
  const id = Object.keys(SOURCES).find((k) => SOURCES[k].item === "tagged_frame" && (s.world.resources.find((r) => r.id === k)?.stock ?? 0) >= 2);
  fit(s, v, ["mantle_salvage_clamp", "mantle_drone_bay"]);
  const f = SOURCES[id].position;
  pilot(s, v, { x: f.x, y: f.y + 3, z: f.z + 1 }, { x: f.x, y: f.y + 1, z: f.z - 20 });
  write("mantle", s, { frame: id, position: f });
}
// 6. A standard outpost on the west ledge: decode running, staple cups growing, a fish trap fitted;
// lattice plans and materials carried for the Base screen's in-place upgrade.
{
  const { s, outpost } = busyOutpost();
  const trap = addItem(s, "mod_fish_trap", 1, "diver");
  const inst = (await import(B + "src/sim/step.js")).executeCommand(s, { type: "install-host-module", hostId: outpost, socket: "s2", itemId: trap.id }, world).state;
  if (!inst.knowledge.blueprints.includes("bp_rift_pressure")) inst.knowledge.blueprints.push("bp_rift_pressure");
  for (const [k, q] of Object.entries({ silica_glass: 2, conductive_crust: 1, structural_alloy: 1, thermal_core: 1 })) addItem(inst, k, q, "diver");
  const o = inst.systems.outposts.find((x) => x.id === outpost);
  inst.player.pose.position = { x: o.position.x + 4, y: o.position.y + 1.6, z: o.position.z + 3 };
  inst.player.pose.yaw = (Math.atan2(-4, 3) + Math.PI * 2) % (Math.PI * 2); inst.player.pose.pitch = -0.25;
  write("outpost", inst, { outpost, position: o.position });
}
writeFileSync(path.join(out, "plan.json"), JSON.stringify(plan, null, 2));
