import test from "node:test";
import assert from "node:assert/strict";
import { carrierCommand, carrierRooms, carrierStructure, carrierTransferPath, fixtureGame, LAUNCH_LOCAL, BERTH_LOCAL, localToWorld, launchPoint, updateBerth } from "../src/sim/carrier.js";
import { HULL_COLLIDERS } from "../src/content/registry.js";
import { createWorldQueries, hullClearance } from "../src/sim/world.js";
import { createEnvelope, decodeSave, encodeSave } from "../src/save/codec.js";
import { executeCommand, stepGame } from "../src/sim/step.js";
import type { GameState, Vec3 } from "../src/sim/types.js";

const world = createWorldQueries();
function roundTrip(s: GameState): GameState {
  const encoded = encodeSave(createEnvelope(s, { sessionId: "a0-corridor-test", createdAt: "2026-10-17T12:00:00.000Z", savedAt: "2026-10-17T12:00:00.000Z" }));
  assert.equal(encoded.ok, true, encoded.ok ? "" : encoded.error);
  const decoded = decodeSave(encoded.value);
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.value.state, s);
  return decoded.value.state;
}
function setup(configuration: "port" | "starboard" | "medium", type: "launch" | "capture"): { s: GameState; id: string; slot: 0 | 1 } {
  const s = fixtureGame(), h = s.fleet.vehicles[0]!;
  let v = s.fleet.vehicles[configuration === "starboard" ? 2 : configuration === "medium" ? 3 : 1]!;
  const slot = configuration === "starboard" ? 1 : 0;
  if (configuration === "medium") {
    h.pose.position.y = -0.9;
    for (const a of s.fleet.vehicles) if (a.berth) {
      a.berth = null;
      a.pose.position = { x: 120 + (a.hull === "dart" ? 0 : 15), y: -1, z: 40 };
    }
    assert.equal(carrierCommand(s, "station-keep", undefined, world), null);
    s.player.pose.position = localToWorld(s.player.interiorPose!.position, h);
    assert.equal(carrierCommand(s, "reconfigure", undefined, world), null);
    if (type === "launch") {
      v.berth = { carrierId: h.id, slot, pose: { frame: "carrier-local", position: { ...BERTH_LOCAL[slot]! }, yaw: 0 } };
      v.pose.position = localToWorld(BERTH_LOCAL[slot]!, h);
    }
  } else if (configuration === "starboard") {
    h.pose.position.y = -0.9;
    updateBerth(s, world);
  }
  if (type === "capture") {
    v.berth = null;
    v.pose.position = launchPoint(h, v);
    // Port remains occupied while capturing to starboard.
  }
  return { s: roundTrip(s), id: v.id, slot };
}
function blocker(p: Vec3) {
  return createWorldQueries([{ id: "a0-thin-corridor-obstruction", min: { x: p.x - 0.005, y: p.y - 0.005, z: p.z - 0.005 }, max: { x: p.x + 0.005, y: p.y + 0.005, z: p.z + 0.005 } }]);
}
function advance(s: GameState, w = world): void {
  for (let i = 0; i < 35; i++) updateBerth(s, w);
}

test("carrier refuses an intervening obstruction with a clear berth and launch endpoint", () => {
  const s = fixtureGame(), h = s.fleet.vehicles[0]!, v = s.fleet.vehicles[1]!;
  const from = localToWorld(BERTH_LOCAL[0]!, h), to = localToWorld(LAUNCH_LOCAL, h);
  const p = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, z: (from.z + to.z) / 2 };
  const blocked = createWorldQueries([{ id: "a0-between-berth-and-exit", min: { x: p.x - 0.1, y: p.y - 0.1, z: p.z - 0.1 }, max: { x: p.x + 0.1, y: p.y + 0.1, z: p.z + 0.1 } }]);
  assert.equal(hullClearance(blocked, from, HULL_COLLIDERS.dart), true);
  assert.equal(hullClearance(blocked, to, HULL_COLLIDERS.dart), true);
  const before = structuredClone(s.fleet);
  assert.match(carrierCommand(s, "launch", v.id, blocked) ?? "", /obstruct|clearance/);
  assert.deepEqual(s.fleet, before);
});

for (const configuration of ["port", "starboard", "medium"] as const)
  for (const type of ["launch", "capture"] as const) {
    test(`${configuration} ${type}: full corridor preflight and changed-clearance commit preserve all vessel and cargo data`, () => {
      const { s, id, slot } = setup(configuration, type), v = s.fleet.vehicles.find((a) => a.id === id)!;
      const route = carrierTransferPath(s, v, slot, type);
      // A thin blocker at every segment catches skipped shafts, lateral transfers,
      // the lock throat, exterior path and capture's independent approach.
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1]!, b = route[i]!;
        const p = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
        const before = structuredClone(s.fleet), items = structuredClone(s.inventory.items);
        assert.match(carrierCommand(s, type, id, blocker(p)) ?? "", /obstruct/);
        assert.deepEqual(s.fleet, before);
        assert.deepEqual(s.inventory.items, items);
      }
      const before = structuredClone(s.fleet.vehicles), items = structuredClone(s.inventory.items);
      assert.equal(carrierCommand(s, type, id, world), null);
      let loaded = roundTrip(s);
      updateBerth(loaded, world);
      loaded = roundTrip(loaded);
      // Interior throat blocker leaves berth and external endpoint clear.
      const h = loaded.fleet.vehicles[0]!, p = localToWorld({ x: 0, y: -0.3, z: -5 }, h);
      const blocked = blocker(p);
      assert.equal(hullClearance(blocked, localToWorld(BERTH_LOCAL[slot]!, h), HULL_COLLIDERS[v.hull]), true);
      assert.equal(hullClearance(blocked, launchPoint(h, v), HULL_COLLIDERS[v.hull]), true);
      advance(loaded, blocked);
      assert.equal(loaded.fleet.docking!.transaction, null);
      assert.equal(loaded.fleet.docking!.completed.length, 0);
      assert.deepEqual(loaded.fleet.vehicles, before);
      assert.deepEqual(loaded.inventory.items, items);
      roundTrip(loaded);
      // Retry a new identity after rollback, interrupt in lock, then commit once.
      assert.equal(carrierCommand(loaded, type, id, world), null);
      updateBerth(loaded, world);
      const interrupted = roundTrip(loaded);
      assert.equal(carrierCommand(interrupted, "interrupt", undefined, world), null);
      advance(interrupted);
      assert.deepEqual(interrupted.fleet.vehicles, before);
      roundTrip(interrupted);
      advance(loaded);
      assert.equal(!!loaded.fleet.vehicles.find((a) => a.id === id)!.berth, type === "capture");
      assert.equal(loaded.fleet.docking!.completed.length, 1);
      advance(loaded);
      assert.equal(loaded.fleet.docking!.completed.length, 1);
      assert.deepEqual(loaded.inventory.items, items);
      roundTrip(loaded);
    });
  }

test("only the selected dry floor hatch opens into the independent lock", () => {
  for (const slot of [0, 1] as const) {
    const rooms = carrierRooms("compact"), structure = carrierStructure("compact", slot);
    assert.equal(structure.some((b) => b.id === `${rooms[slot]!.id}.floor`), false);
    assert.equal(structure.some((b) => b.id === `${rooms[1 - slot]!.id}.floor`), true);
    assert.equal(structure.some((b) => b.id === "carrier.lock.gate"), false);
  }
  assert.ok(carrierStructure("compact").some((b) => b.id === "carrier.lock.gate"));
});

test("a capture approach cannot cross the carrier's closed dry deck or another independent craft", () => {
  const { s, id } = setup("port", "capture"), h = s.fleet.vehicles[0]!, v = s.fleet.vehicles.find((a) => a.id === id)!;
  v.pose.position = localToWorld({ x: 0, y: 3, z: -7 }, h);
  assert.match(carrierCommand(s, "capture", id, world) ?? "", /obstruct/);
  v.pose.position = launchPoint(h, v);
  const other = s.fleet.vehicles[3]!;
  other.pose.position = localToWorld({ x: 0, y: -0.3, z: -6 }, h);
  assert.match(carrierCommand(s, "capture", id, world) ?? "", /obstruct/);
  assert.equal(v.berth, null);
});

test("carrier-local corridor sweeps follow carrier yaw and keep obstructions on the actual world route", () => {
  for (const yaw of [0, Math.PI / 2, Math.PI]) {
    const s = fixtureGame(), h = s.fleet.vehicles[0]!, v = s.fleet.vehicles[1]!;
    h.pose.yaw = yaw;
    updateBerth(s, world);
    roundTrip(s);
    const p = localToWorld({ x: 0, y: -0.3, z: -5 }, h);
    assert.match(carrierCommand(s, "launch", v.id, blocker(p)) ?? "", /obstruct/);
    assert.equal(carrierCommand(s, "launch", v.id, world), null);
    advance(s);
    assert.deepEqual(v.pose.position, launchPoint(h, v));
    assert.equal(v.pose.yaw, yaw);
    roundTrip(s);
  }
});

test("the carrier's piloting envelope encloses the lower lock floor beneath its saved keel datum", () => {
  const s = fixtureGame(), h = s.fleet.vehicles[0]!;
  assert.equal(hullClearance(world, h.pose.position, HULL_COLLIDERS.hearthline), true);
  const p = { ...h.pose.position, y: h.pose.position.y - 0.4 };
  assert.equal(hullClearance(blocker(p), h.pose.position, HULL_COLLIDERS.hearthline), false);
});

test("empty reconfiguration cannot seal a walking diver inside its new compartment", () => {
  const { s } = setup("medium", "capture");
  assert.equal(carrierCommand(s, "reconfigure", undefined, world), null);
  s.player.interiorPose!.position = { x: -3, y: 4, z: -3.3 };
  s.player.pose.position = localToWorld(s.player.interiorPose!.position, s.fleet.vehicles[0]!);
  roundTrip(s);
  const result = executeCommand(s, { type: "carrier", action: "reconfigure" }, world);
  assert.ok(result.events.some((e) => e.type === "notice" && e.error));
  assert.deepEqual(result.state, s);
  roundTrip(result.state);
});

test("the stationary central passage admits the walking capsule from bridge to aft vestibule", () => {
  let s = fixtureGame();
  for (let i = 0; i < 280; i++) s = stepGame(s, [{ type: "move", forward: -1, right: 0, vertical: 0, sprint: false }], world).state;
  assert.ok(s.player.interiorPose!.position.z >= 7, "straight passage must clear the capsule, not just the camera centre");
  roundTrip(s);
});
