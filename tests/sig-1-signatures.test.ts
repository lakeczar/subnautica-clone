/** SIG-1: every craft's signature upgrades work in the simulation, through the
 * real commands and the fixed step. Rule-level setups (a hull with its fitting,
 * placed beside its target) stand in for the build chains; the browser run is
 * the ordinary-control evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { ITEMS, MATERIALS, RECIPES, SOURCES } from "../src/content/registry.js";
import type { HullId, ItemKind, SourceId } from "../src/content/registry.js";
import { UPGRADES } from "../src/content/upgrades/catalogue.js";
import type { UpgradeId } from "../src/content/upgrades/catalogue.js";
import { LOST_SITES, DECODABLES } from "../src/content/systems/decodes.js";
import { addItem, containerAccessible, podContainerId } from "../src/sim/inventory.js";
import { makeVehicle } from "../src/sim/state.js";
import { executeCommand, stepGameInPlace } from "../src/sim/step.js";
import { gameWorld } from "../src/sim/world.js";
import { vehicleHoldCapacity } from "../src/sim/fittings.js";
import { slotOf } from "../src/sim/upgrades/fitting.js";
import { armTarget } from "../src/sim/fleet.js";
import { CAVE_FEATURES, craftActions, lineHolds, liftJob, signatureLoudness, stepSignatures } from "../src/sim/signatures.js";
import { CUTTING_ARM, GRAPPLE, hostKind, WIDE_SONAR } from "../src/sim/upgrades/tools.js";
import { berthLocal, carrierRooms, CARRIER_LAYOUT, fixtureGame, freeBerth, nextBerthLayout, slotSize, transferBlock } from "../src/sim/carrier.js";
import { createWorldQueries } from "../src/sim/world.js";
import { playerView } from "../src/render/camera.js";
import type { GameCommand, GameEvent, GameState, Vec3, VehicleState, WorldQueries } from "../src/sim/types.js";
import { at, creelFirst, creelOf, fund, saveable } from "./b1-support.js";

const world = gameWorld();
/** A hull of `hull` at `p` with `kinds` fitted, optionally piloted, facing `yaw`. */
function withHull(s: GameState, hull: HullId, p: Vec3, kinds: readonly UpgradeId[], pilot = true, yaw = 0): VehicleState {
  const v = makeVehicle(`${hull}_sig`, hull, { ...p }, `${hull}_sig_hold`);
  v.pose.yaw = yaw;
  s.fleet.vehicles.push(v);
  s.inventory.containers.push({ id: v.cargoId, kind: "vehicle", capacity: 0, ownerId: v.id });
  for (const k of kinds) {
    const item = addItem(s, k as ItemKind, 1, v.cargoId, slotOf(hull, k) === "socket" ? null : "mount");
    v.modules.push(item.id);
  }
  s.inventory.containers.find((c) => c.id === v.cargoId)!.capacity = vehicleHoldCapacity(s, v);
  if (pilot) {
    s.player.controlledVehicleId = v.id; s.player.mode = "piloting"; s.player.interiorId = null; s.player.interiorPose = null;
    s.player.pose = { ...structuredClone(v.pose) };
  }
  return v;
}
const act = (s: GameState, action: Extract<GameCommand, { type: "upgrade" }>["action"], w: WorldQueries = world) =>
  executeCommand(s, { type: "upgrade", action }, w);
const hullIn = (s: GameState, v: VehicleState): VehicleState => s.fleet.vehicles.find((x) => x.id === v.id)!;
/** Point the pilot's view from `from` at `to`. */
function aim(s: GameState, from: Vec3, to: Vec3): void {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  s.player.pose.yaw = (Math.atan2(dx, -dz) + Math.PI * 2) % (Math.PI * 2);
  s.player.pose.pitch = Math.max(-1.35, Math.min(1.35, Math.atan2(dy, Math.hypot(dx, dz))));
}
/** Run the fixed step for `seconds`, returning every event. */
function run(s: GameState, seconds: number, commands: readonly GameCommand[] = []): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) events.push(...stepGameInPlace(s, commands, world));
  return events;
}
const signature = (events: readonly GameEvent[]) => events.flatMap((e) => e.type === "signature" ? [e.event] : []);
const refusal = (events: readonly GameEvent[]): string | undefined =>
  events.find((e): e is Extract<GameEvent, { type: "notice" }> => e.type === "notice" && !!e.error)?.message;
const count = (s: GameState, kind: string, container: string): number =>
  s.inventory.items.filter((i) => i.kind === kind && i.containerId === container).reduce((n, i) => n + i.quantity, 0);

test("no catalogue upgrade is inert: every one has a recipe (ART-09)", () => {
  for (const id of Object.keys(UPGRADES) as UpgradeId[])
    assert.ok(Object.hasOwn(RECIPES, id) || Object.hasOwn(RECIPES, UPGRADES[id].registry ?? ""), `${id} is fabricable`);
});

test("Dart wide-sweep sonar: a loud, charged sweep marks cave openings in range on the chart, then recharges", () => {
  const mouth = CAVE_FEATURES.find((f) => f.kind === "cave_mouth")!;
  const s = creelFirst(), p = { x: mouth.position.x + 100, y: mouth.position.y, z: mouth.position.z };
  const bare = structuredClone(s);
  withHull(bare, "dart", p, []);
  const none = act(bare, "sonar");
  assert.equal(none.state, bare, "a refusal changes nothing");
  assert.match(refusal(none.events) ?? "", /No wide-sweep sonar/);

  const v = withHull(s, "dart", p, ["dart_wide_sonar"]);
  const out = act(s, "sonar"), sweep = signature(out.events)[0];
  assert.equal(sweep?.kind, "sonar");
  assert.ok(sweep?.kind === "sonar" && sweep.contacts.some((c) => c.id === mouth.id), "the mouth 100 m away answers");
  assert.ok(sweep?.kind === "sonar" && sweep.contacts.every((c) => c.distance <= WIDE_SONAR.range));
  assert.ok(out.state.systems.beacons.some((b) => b.id === `sonar:${mouth.id}` && b.category === "landmark"), "marked on the chart");
  assert.equal(hullIn(out.state, v).charge, v.charge - WIDE_SONAR.charge);
  assert.equal(signatureLoudness(out.state, hullIn(out.state, v)), WIDE_SONAR.loudness, "a loud ping");
  assert.match(refusal(act(out.state, "sonar").events) ?? "", /recharging/);
  out.state.tick += WIDE_SONAR.cooldown * 60;
  assert.equal(refusal(act(out.state, "sonar").events), undefined, "ready again after its cooldown");
  saveable(out.state);
});

test("Dart range tagger: a steady 1.5 s aim captures a lost site's data from 40 m; a drifting aim loses it", () => {
  const site = LOST_SITES.reef_pumphouse_site.position;
  const s = creelFirst(), p = { x: site.x + 40, y: site.y, z: site.z };
  withHull(s, "dart", p, ["dart_range_tagger"]);
  aim(s, p, site);
  const start = act(s, "tag");
  assert.equal(refusal(start.events), undefined);
  const t = start.state;
  assert.ok(!t.systems.found.length, "nothing captured yet");
  const events = run(t, 1.6);
  const done = signature(events).find((e) => e.kind === "tag" && e.phase === "done");
  assert.ok(done, "the tag completes");
  const mine = Object.entries(DECODABLES).filter(([, d]) => d.site === "reef_pumphouse_site").map(([id]) => id);
  assert.ok(mine.every((d) => (t.systems.found as string[]).includes(d)), "the site's records are found, from range");
  saveable(t);

  const drift = act(s, "tag").state;
  const lost = run(drift, 0.5, [{ type: "look", yawDelta: 0.4, pitchDelta: 0 }]);
  assert.ok(signature(lost).some((e) => e.kind === "tag" && e.phase === "lost"), "the aim left the target");
  assert.equal(drift.fleet.vehicles.find((v) => v.hull === "dart")!.upgrades.tag, null);
});

test("Creel cutting arm: mineral hosts become arm work, in 4 s, yielding half again", () => {
  const id = (Object.keys(SOURCES) as SourceId[]).find((k) => SOURCES[k].region === "island_chain" &&
    Object.hasOwn(MATERIALS, SOURCES[k].item) && hostKind(SOURCES[k].item as never) === "mineral")!;
  const src = SOURCES[id].position, p = { x: src.x, y: src.y + 2, z: src.z + 3.3 };
  const plain = creelFirst();
  withHull(plain, "creel", p, []);
  assert.equal(armTarget(plain), null, "without the arm, mineral stays hand work");
  const s = creelFirst(), v = withHull(s, "creel", p, ["creel_cutting_arm"]);
  const target = armTarget(s);
  assert.equal(target?.sourceId, id);
  assert.equal(target!.work.seconds, CUTTING_ARM.seconds);
  assert.equal(target!.work.bundle, Math.min(Math.ceil(SOURCES[id].bundle * CUTTING_ARM.yield), s.world.resources.find((r) => r.id === id)!.stock));
  const lift = executeCommand(s, { type: "arm-lift" }, world).state;
  run(lift, CUTTING_ARM.seconds + 0.1);
  assert.equal(count(lift, SOURCES[id].item, v.cargoId), target!.work.bundle, "the bundle comes aboard");
});

test("Creel grapple: the line holds the hull at its length, reels it in, and releases", () => {
  const s = creelFirst(), p = { x: 300, y: -40, z: -300 }, v = withHull(s, "creel", p, ["creel_grapple"]);
  aim(s, p, { x: p.x, y: p.y, z: p.z - 1 });
  const anchor = { x: p.x, y: p.y, z: p.z - 18 };
  const rock: WorldQueries = { ...world, moveCapsule: () => ({ position: { ...anchor }, hitSolid: true, hitBoundary: false }) };
  const set = act(s, "grapple", rock).state, h = hullIn(set, v);
  assert.ok(h.upgrades.grapple && lineHolds(h), "a rock line holds against currents");
  h.pose.position = { x: p.x, y: p.y, z: p.z + 10 };
  stepSignatures(set, createWorldQueries([], () => -500), []);
  const d = Math.hypot(h.pose.position.x - anchor.x, h.pose.position.y - anchor.y, h.pose.position.z - anchor.z);
  assert.ok(Math.abs(d - 18) < 0.05, `held at the line's length (${d.toFixed(2)} m)`);
  const reeling = act(set, "reel").state;
  for (let i = 0; i < 120; i++) stepSignatures(reeling, createWorldQueries([], () => -500), []);
  assert.ok(Math.abs(hullIn(reeling, v).upgrades.grapple!.length - (18 - GRAPPLE.reel * 2)) < 0.05, "reeled 2.5 m/s");
  const released = act(reeling, "grapple").state;
  assert.equal(hullIn(released, v).upgrades.grapple, null);
  saveable(reeling);
});

test("Creel grapple hooks a frame within 30 m and reels it aboard", () => {
  const id = (Object.keys(SOURCES) as SourceId[]).find((k) => SOURCES[k].item === "tagged_frame")!;
  const f = SOURCES[id].position, p = { x: f.x, y: f.y + 15, z: f.z };
  const s = creelFirst(), v = withHull(s, "creel", p, ["creel_grapple"]);
  aim(s, p, f);
  const water = createWorldQueries([], () => -2000);
  const hooked = act(s, "grapple", water).state;
  assert.equal(hullIn(hooked, v).upgrades.grapple?.load, id);
  const stock = hooked.world.resources.find((r) => r.id === id)!.stock;
  const events: GameEvent[] = [];
  for (let i = 0; i < 60 * 8; i++) stepSignatures(hooked, water, events);
  assert.ok(signature(events).some((e) => e.kind === "grapple" && e.phase === "landed"));
  assert.equal(count(hooked, "tagged_frame", v.cargoId), 1);
  assert.equal(hooked.world.resources.find((r) => r.id === id)!.stock, stock - 1);
});

test("Creel cargo pod: dropped at a work site, the diver loads it there; collected, it rides in the hold again", () => {
  const s = creelFirst();
  fund(s, "creel_drop_pod");
  const pod = s.inventory.items.find((i) => i.kind === "creel_drop_pod")!;
  const p = { x: 200, y: -30, z: -150 }, v = withHull(s, "creel", p, []);
  pod.containerId = v.cargoId; v.modules.push(pod.id);
  s.player.controlledVehicleId = v.id; s.player.mode = "piloting"; s.player.pose.position = { ...p };
  const dropped = act(s, "pod").state, out = hullIn(dropped, v).upgrades.pod!;
  assert.ok(out, "the pod is out");
  at(dropped, { x: out.position.x + 3, y: out.position.y, z: out.position.z });
  assert.equal(containerAccessible(dropped, podContainerId(pod.id)), true, "the diver reaches it within 8 m");
  const alloy = addItem(dropped, "structural_alloy", 2, "diver");
  const loaded = executeCommand(dropped, { type: "transfer", itemId: alloy.id, to: podContainerId(pod.id), quantity: 2 }, world).state;
  assert.equal(count(loaded, "structural_alloy", podContainerId(pod.id)), 2);
  saveable(loaded);
  loaded.player.controlledVehicleId = v.id; loaded.player.mode = "piloting"; loaded.player.pose.position = { ...out.position, y: out.position.y + 3 };
  hullIn(loaded, v).pose.position = { ...out.position, y: out.position.y + 3 };
  const back = act(loaded, "pod").state;
  assert.equal(hullIn(back, v).upgrades.pod, null);
  assert.equal(containerAccessible(back, podContainerId(pod.id)), true, "aboard, it opens like the hold");
  assert.equal(count(back, "structural_alloy", podContainerId(pod.id)), 2, "its contents stayed in it");
});

test("Spindle deck crane: from the surface it lifts shallow salvage aboard in 5 s for 3% charge", () => {
  const src = SOURCES.reef_service_scraps_east.position;
  const s = creelFirst(), v = withHull(s, "spindle", { x: src.x, y: -0.5, z: src.z + 3 }, ["spindle_deck_crane"]);
  const job = liftJob(s, v, "crane")!;
  assert.equal(job.refusal, null);
  assert.ok(job.quantity * ITEMS[job.item].cu <= 10);
  const started = act(s, "crane").state;
  run(started, 5.1);
  assert.equal(count(started, job.item, v.cargoId), job.quantity);
  assert.ok(Math.abs(hullIn(started, v).charge - (v.charge - 3)) < 0.5, "about 3% charge");
});

test("Mantle salvage clamp: two frames per grip; a disabled hull is held and towed", () => {
  const id = (Object.keys(SOURCES) as SourceId[]).find((k) => SOURCES[k].item === "tagged_frame" && SOURCES[k].stock >= 2)!;
  const f = SOURCES[id].position;
  const s = creelFirst(), v = withHull(s, "mantle", { x: f.x, y: f.y + 3, z: f.z }, ["mantle_salvage_clamp"]);
  const gripped = act(s, "clamp").state;
  run(gripped, 6.1);
  assert.equal(count(gripped, "tagged_frame", v.cargoId), 2);

  const t = creelFirst(), m = withHull(t, "mantle", { x: 300, y: -60, z: -300 }, ["mantle_salvage_clamp"]);
  const dart = makeVehicle("dart_lost", "dart", { x: 300, y: -60, z: -306 }, "dart_lost_hold");
  dart.disabled = true; t.fleet.vehicles.push(dart);
  t.inventory.containers.push({ id: dart.cargoId, kind: "vehicle", capacity: 32, ownerId: dart.id });
  const held = act(t, "clamp").state;
  assert.equal(hullIn(held, m).upgrades.tow, dart.id);
  hullIn(held, m).pose.position = { x: 330, y: -60, z: -300 };
  stepSignatures(held, createWorldQueries([], () => -500), []);
  const d = held.fleet.vehicles.find((x) => x.id === dart.id)!.pose.position;
  assert.ok(Math.hypot(d.x - 330, d.z + 300) < 12, "the towed hull follows the Mantle");
});

test("Mantle scout drone: it flies on the pilot's input while the Mantle holds, scans what it passes, and comes home at its tether", () => {
  const s = creelFirst(), p = { x: 300, y: -60, z: -300 }, v = withHull(s, "mantle", p, ["mantle_drone_bay"]);
  aim(s, p, { x: p.x, y: p.y, z: p.z - 10 });
  const out = act(s, "drone").state, d0 = { ...hullIn(out, v).upgrades.drone!.position };
  run(out, 2, [{ type: "move", forward: 1, right: 0, vertical: 0, sprint: false }]);
  const h = hullIn(out, v), d = h.upgrades.drone!.position;
  assert.ok(Math.hypot(d.x - d0.x, d.z - d0.z) > 4, "the drone moved about 5 m");
  assert.ok(Math.hypot(h.pose.position.x - p.x, h.pose.position.z - p.z) < 0.6, "the Mantle held station");
  const view = playerView(out, null, null, { x: 0, y: 0, z: 0 });
  assert.deepEqual(view.eye, d, "the view is the drone's");
  const src = (Object.keys(SOURCES) as SourceId[]).find((k) => !out.knowledge.scans.includes(k))!;
  h.upgrades = { ...h.upgrades, drone: { ...h.upgrades.drone!, position: { ...SOURCES[src].position, y: SOURCES[src].position.y + 2 } } };
  const found: GameEvent[] = [];
  stepSignatures(out, world, found);
  assert.ok(out.knowledge.scans.includes(src), "a source within 12 m is scanned");
  h.upgrades = { ...h.upgrades, drone: { ...h.upgrades.drone!, position: { x: p.x + 70, y: p.y, z: p.z } } };
  const home: GameEvent[] = [];
  stepSignatures(out, world, home);
  assert.equal(h.upgrades.drone, null, "beyond its tether it is recalled");
});

test("Hearthline berth extension: the mixed layout berths a medium and a compact craft, with the walkway open", () => {
  const s = fixtureGame(), h = s.fleet.vehicles[0]!;
  assert.equal(nextBerthLayout(s, h), "medium", "compact → medium without the extension");
  s.fleet.docking!.configuration = "medium";
  assert.equal(nextBerthLayout(s, h), "compact");
  const ext = addItem(s, "hearthline_berth_extension", 1, h.cargoId, "mount"); h.modules.push(ext.id);
  assert.equal(nextBerthLayout(s, h), "mixed", "with it, medium → mixed");
  s.fleet.docking!.configuration = "mixed";
  assert.equal(slotSize("mixed", 0), "medium"); assert.equal(slotSize("mixed", 1), "compact");
  // The diver walks from the helm aft past both rooms.
  const rooms = carrierRooms("mixed"), wall = CARRIER_LAYOUT.wall;
  const gap = { min: rooms[0]!.max.x + wall, max: rooms[1]!.min.x - wall };
  assert.ok(gap.max - gap.min >= 0.68 + 0.04, `the walkway is ${(gap.max - gap.min).toFixed(2)} m`);
  const lane = createWorldQueries([...rooms], () => -200), x = (gap.min + gap.max) / 2;
  for (let z = -6; z <= 8; z += 0.5) assert.ok(lane.clearance({ x, y: 4, z }, { radius: 0.34, height: 1.75 }), `clear at z ${z}`);
  // Both berths' transfer routes clear the carrier's own structure.
  for (const v of s.fleet.vehicles.slice(1)) v.berth = null;
  const creel = makeVehicle("mixed_creel", "creel", berthLocal("mixed", 0), "mixed_creel_hold");
  const dart = makeVehicle("mixed_dart", "dart", berthLocal("mixed", 1), "mixed_dart_hold");
  s.fleet.vehicles = [h, creel, dart];
  assert.equal(freeBerth(s, h, creel), 0); assert.equal(freeBerth(s, h, dart), 1);
  const water = createWorldQueries([], () => -200);
  assert.equal(transferBlock(s, creel, 0, "launch", water), null, "medium slot route");
  assert.equal(transferBlock(s, dart, 1, "launch", water), null, "compact slot route");
});

test("the craft action bar numbers each craft's fitted actions in a fixed order", () => {
  const s = creelFirst();
  withHull(s, "dart", { x: 0, y: -10, z: 40 }, ["dart_overdrive", "dart_wide_sonar", "flare_launcher"]);
  assert.deepEqual(craftActions(s).map((a) => [a.key, a.action]), [[1, "overdrive"], [2, "sonar"], [3, "flare"]]);
});
