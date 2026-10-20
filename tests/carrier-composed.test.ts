import test from "node:test";
import assert from "node:assert/strict";
import { HEARTHLINE_FIXTURES, HEARTHLINE_SOCKETS } from "../src/content/fleet/hearthlineInterior.js";
import { createEnvelope, decodeSave } from "../src/save/codec.js";
import { validState } from "../src/save/validation.js";
import { CARRIER_LAYOUT, carrierInteriorSolids, emptySockets, fixtureGame, occupiedSockets } from "../src/sim/carrier.js";
import { createWorldQueries } from "../src/sim/world.js";
import { hullContactPose, hullMesh } from "../src/sim/hunterQueries.js";
import { addItem, containerAccessible, transfer } from "../src/sim/inventory.js";
import type { GameState, Vec3 } from "../src/sim/types.js";
import { encoded, withComposedFields, withoutComposedFields } from "./persistence-support.js";

const meta = { sessionId: "carrier-composed-01", createdAt: "2026-10-20T00:00:00.000Z", savedAt: "2026-10-20T00:00:00.000Z" };
const pantry = "fixture_hearthline_pantry", fab = "fixture_hearthline_fabrication", stores = "fixture_carrier_hold";

test("the fixture carrier's hold is 192 CU stores plus 32 CU pantry and fabrication, reachable from inside", () => {
  const s = fixtureGame();
  assert.ok(validState(s));
  const cap = (id: string) => s.inventory.containers.find((c) => c.id === id)!.capacity;
  assert.deepEqual([cap(stores), cap(pantry), cap(fab)], [192, 32, 32]);
  for (const id of [stores, pantry, fab]) assert.ok(containerAccessible(s, id), id);
  const meal = addItem(s, "meal", 2, "diver"), alloy = addItem(s, "structural_alloy", 3, "diver");
  assert.match(transfer(s, alloy.id, pantry, 1)!, /pantry does not take structural alloy/);
  assert.match(transfer(s, meal.id, fab, 1)!, /fabrication locker does not take/);
  assert.equal(transfer(s, meal.id, pantry, 2), null);
  assert.equal(transfer(s, alloy.id, fab, 3), null);
  assert.ok(validState(s));
  const outside = structuredClone(s); outside.player.interiorId = null; outside.player.interiorPose = null; outside.player.mode = "swimming";
  assert.ok(!containerAccessible(outside, pantry) && !containerAccessible(outside, fab), "compartments open only from inside");
  const wrong = structuredClone(s); wrong.inventory.items.find((i) => i.containerId === fab)!.kind = "meal";
  assert.equal(validState(wrong), false, "adverse: a meal saved in the fabrication locker");
});

test("the interior kit's fixtures and occupied sockets are walking solids; sockets validate by kind", () => {
  const s = fixtureGame(), ids = new Set(carrierInteriorSolids(s).map((x) => x.id));
  for (const f of HEARTHLINE_FIXTURES) assert.ok(ids.has(f.id), f.id);
  assert.deepEqual(occupiedSockets(s.fleet.docking!), ["hl.socket.bridge.survey", "hl.socket.galley.planter"]);
  for (const socket of HEARTHLINE_SOCKETS) assert.equal(ids.has(socket.id), occupiedSockets(s.fleet.docking!).includes(socket.id), socket.id);
  const bad: [string, (g: GameState) => void][] = [
    ["an occupant the socket does not accept", (g) => { g.fleet.docking!.sockets["hl.socket.galley.planter"] = "chair"; }],
    ["an unknown socket", (g) => { g.fleet.docking!.sockets["hl.socket.roof"] = null; }],
    ["a missing socket", (g) => { delete g.fleet.docking!.sockets["hl.socket.cabin.wall"]; }],
  ];
  for (const [label, mutate] of bad) { const g = structuredClone(s); mutate(g); assert.equal(validState(g), false, label); }
});

test("a carrier save from before the split loads with empty sockets and split hold; an overfull hold is refused", () => {
  const s = fixtureGame(); s.fleet.docking!.sockets = emptySockets();
  addItem(s, "silica_glass", 40, stores);
  const old = { ...createEnvelope(s, meta), state: withoutComposedFields(s) };
  assert.equal(old.state.inventory.containers.find((c: { id: string }) => c.id === stores).capacity, 256);
  const out = decodeSave(JSON.stringify(old)); assert.ok(out.ok, out.ok ? "" : out.error);
  assert.deepEqual(out.value, withComposedFields(old));
  assert.deepEqual(out.value.state, s, "exactly today's fixture with empty sockets");
  assert.equal(JSON.stringify(JSON.parse(encoded(out.value))), JSON.stringify(createEnvelope(s, meta)), "re-saves in New Game order");
  const full = structuredClone(old); full.state.inventory.items.push({ id: "bulk", kind: "structural_alloy", quantity: 80, containerId: stores, fitted: null, charge: null, provenance: "public" });
  const refused = decodeSave(JSON.stringify(full));
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.match(refused.error, /holds 200 CU, more than its 192 CU stores/);
});

test("hunter contact follows S3's posed parts: a berthed Spindle presents its stowed outriggers", () => {
  const s = fixtureGame(), spindle = s.fleet.vehicles.find((v) => v.hull === "spindle")!;
  assert.deepEqual(hullContactPose(s, spindle), { fold: 1, cargoLoaded: false });
  const stowed = hullMesh("spindle", hullContactPose(s, spindle)).bounds, deployed = hullMesh("spindle", { fold: 0 }).bounds;
  assert.ok(stowed.max.x < deployed.max.x - .5, `stowed ${stowed.max.x.toFixed(2)} vs deployed ${deployed.max.x.toFixed(2)}`);
  addItem(s, "silica_glass", 1, spindle.cargoId);
  assert.ok(hullMesh("spindle", hullContactPose(s, spindle)).bounds.max.y >= stowed.max.y, "loaded cargo adds its stack");
  const keel = hullMesh("hearthline").bounds;
  assert.ok(Math.abs(keel.max.x - 9.32) < .01, "carrier contact uses S3's keels");
});

test("C3 (P1): the compact Hearthline's bow-to-stern walkway passes a capsule on lanes off the centre line", () => {
  const s = fixtureGame(), local = createWorldQueries(carrierInteriorSolids(s), () => -200), shape = { radius: 0.34, height: 1.75 };
  const b = CARRIER_LAYOUT.interior;
  // The strip spans x -0.47..0.67: any lane within 0.2 m of its centre (0.1) passes.
  for (const x of [-0.1, 0, 0.1, 0.2, 0.3]) {
    let p: Vec3 = { x, y: b.y, z: b.maxZ - 0.5 };
    // Through the whole strip between the berth rooms (z 4.88 .. -2.88), into the open bow deck.
    const bow = CARRIER_LAYOUT.compact[0].min.z - 0.8;
    for (let i = 0; i < 400 && p.z > bow; i++) p = local.moveCapsule(p, { x: 0, y: 0, z: -0.05 }, shape).position;
    assert.ok(p.z <= bow, `lane x ${x} passes the berth rooms (stopped at z ${p.z.toFixed(2)})`);
  }
});
