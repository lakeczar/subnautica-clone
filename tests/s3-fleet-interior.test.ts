import test from "node:test";
import assert from "node:assert/strict";
import { BERTH_ENVELOPES, HULL_COLLIDERS } from "../src/content/registry.js";
import { CARRIER_LAYOUT, carrierRooms, carrierStructure } from "../src/sim/carrier.js";
import { createWorldQueries, type Solid } from "../src/sim/world.js";
import type { Vec3 } from "../src/sim/types.js";
import {
  BERTH_ZONE, DECK_Y, HEARTHLINE_FIXTURES, HEARTHLINE_ROOMS, HEARTHLINE_SOCKETS, HEARTHLINE_STATIONS,
  HEARTHLINE_CONTAINERS, LINING, hearthlineInteriorSolids, type InteriorSolid,
} from "../src/content/fleet/hearthlineInterior.js";
import { HEARTHLINE_KEELS, S3_HULLS } from "../src/content/fleet/hulls.js";

const WALKER = { radius: .34, height: 1.75 };
type Configuration = "compact" | "medium";
const overlaps = (a: InteriorSolid | Solid, b: InteriorSolid | Solid): boolean =>
  a.min.x < b.max.x - 1e-6 && a.max.x > b.min.x + 1e-6 && a.min.y < b.max.y - 1e-6 &&
  a.max.y > b.min.y + 1e-6 && a.min.z < b.max.z - 1e-6 && a.max.z > b.min.z + 1e-6;

/** Exactly the sim's walking world: structure, sealed rooms, plus the kit. */
function walkingWorld(configuration: Configuration, extra: readonly InteriorSolid[]) {
  return createWorldQueries([...carrierStructure(configuration), ...carrierRooms(configuration), ...extra], () => -200);
}

/** 4-connected flood over the clamped walking bounds at 0.1 m. Two clear boxes
 * 0.1 m apart overlap, so no wall fits between grid neighbours. */
function reachable(configuration: Configuration, extra: readonly InteriorSolid[]) {
  const world = walkingWorld(configuration, extra), b = CARRIER_LAYOUT.interior, step = .1;
  const nx = Math.round((b.maxX - b.minX) / step), nz = Math.round((b.maxZ - b.minZ) / step);
  const point = (i: number, j: number): Vec3 => ({ x: b.minX + i * step, y: DECK_Y, z: b.minZ + j * step });
  const clear = new Uint8Array((nx + 1) * (nz + 1)), seen = new Uint8Array(clear.length);
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) clear[i * (nz + 1) + j] = world.clearance(point(i, j), WALKER) ? 1 : 0;
  const index = (p: Vec3): number => Math.round((p.x - b.minX) / step) * (nz + 1) + Math.round((p.z - b.minZ) / step);
  const start = index(CARRIER_LAYOUT.helm);
  assert.equal(clear[start], 1, `${configuration}: helm stand is clear`);
  const queue = [start]; seen[start] = 1;
  while (queue.length) {
    const k = queue.pop()!, i = Math.floor(k / (nz + 1)), j = k % (nz + 1);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const a = i + di, c = j + dj;
      if (a < 0 || c < 0 || a > nx || c > nz) continue;
      const n = a * (nz + 1) + c;
      if (clear[n] && !seen[n]) { seen[n] = 1; queue.push(n); }
    }
  }
  return { world, reached: (p: Vec3): boolean => world.clearance(p, WALKER) && seen[index(p)] === 1 };
}

const occupiedAll = HEARTHLINE_SOCKETS.map((s) => s.id);

for (const configuration of ["compact", "medium"] as const) {
  test(`Hearthline ${configuration}: every room, station and the vestibule is walkable from the helm, sockets empty or full`, () => {
    for (const occupied of [[], occupiedAll]) {
      const { reached } = reachable(configuration, hearthlineInteriorSolids(occupied));
      const label = `${configuration}, ${occupied.length} sockets occupied`;
      for (const room of HEARTHLINE_ROOMS) {
        const p = configuration === "medium" && room.mediumAnchor ? room.mediumAnchor : room.anchor;
        assert.ok(reached(p), `${label}: room ${room.id} anchor (${p.x}, ${p.z}) is reachable`);
      }
      for (const s of HEARTHLINE_STATIONS) assert.ok(reached(s.stand), `${label}: station ${s.id} stand is reachable`);
      assert.ok(reached(CARRIER_LAYOUT.vestibule), `${label}: vestibule interaction point is reachable`);
    }
  });

  test(`Hearthline ${configuration}: the real moveCapsule walks helm → passage → vestibule through the kit`, () => {
    const world = walkingWorld(configuration, hearthlineInteriorSolids(occupiedAll));
    const passageX = configuration === "compact" ? .05 : 2.4;
    const route: Vec3[] = [CARRIER_LAYOUT.helm, { x: passageX, y: DECK_Y, z: -5.2 }, { x: passageX, y: DECK_Y, z: 6.6 },
      { x: 4, y: DECK_Y, z: 6.6 }, CARRIER_LAYOUT.vestibule];
    let p = { ...route[0]! };
    for (const target of route.slice(1)) {
      // Small steps, as the 60 Hz walking command does at 3 m/s.
      for (let i = 0; i < 400 && Math.hypot(target.x - p.x, target.z - p.z) > .01; i++) {
        const d = Math.hypot(target.x - p.x, target.z - p.z), s = Math.min(.05, d);
        const moved = world.moveCapsule(p, { x: (target.x - p.x) / d * s, y: 0, z: (target.z - p.z) / d * s }, WALKER);
        assert.equal(moved.hitSolid, false, `${configuration}: walking to (${target.x}, ${target.z}) hit a solid at (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
        p = moved.position;
      }
      assert.ok(Math.hypot(target.x - p.x, target.z - p.z) <= .01, `${configuration}: reached (${target.x}, ${target.z})`);
    }
  });

  test(`Hearthline ${configuration}: fixtures and socket footprints stay out of rooms, structure and the lining`, () => {
    const structure = [...carrierStructure(configuration), ...carrierRooms(configuration)];
    for (const f of [...HEARTHLINE_FIXTURES, ...HEARTHLINE_SOCKETS.map((s) => s.footprint)]) {
      for (const s of structure) assert.ok(!overlaps(f, s), `${f.id} intersects ${s.id}`);
      assert.ok(f.min.y >= DECK_Y - 1e-9, `${f.id} sits on the deck`);
      assert.ok(f.min.x >= -LINING.x - 1e-9 && f.max.x <= LINING.x + 1e-9 && f.min.z >= LINING.bow - 1e-9 && f.max.z <= LINING.stern + 1e-9,
        `${f.id} stays inside the house lining`);
      assert.ok(f.max.y <= LINING.ceiling + 1e-9, `${f.id} stays below the ceiling`);
    }
  });
}

test("Hearthline kit: sockets never overlap fixtures or each other; ids, containers and stations resolve", () => {
  for (const s of HEARTHLINE_SOCKETS) {
    for (const f of HEARTHLINE_FIXTURES) assert.ok(!overlaps(s.footprint, f), `${s.id} footprint intersects ${f.id}`);
    for (const t of HEARTHLINE_SOCKETS) if (t !== s) assert.ok(!overlaps(s.footprint, t.footprint), `${s.id} intersects ${t.id}`);
    assert.ok(s.accepts.length > 0);
  }
  const ids = new Set(HEARTHLINE_FIXTURES.map((f) => f.id));
  assert.equal(ids.size, HEARTHLINE_FIXTURES.length, "fixture ids are unique");
  for (const c of HEARTHLINE_CONTAINERS) assert.ok(ids.has(c.fixture), `${c.id} names a fixture`);
  assert.equal(HEARTHLINE_CONTAINERS.reduce((n, c) => n + c.capacityCu, 0), 256, "containers share B1's 256 CU hold");
  for (const s of HEARTHLINE_STATIONS) assert.ok(ids.has(s.fixture), `${s.id} names a fixture`);
  // Everything that must stay config-independent avoids the berth zone.
  for (const f of HEARTHLINE_FIXTURES) assert.ok(f.max.z <= BERTH_ZONE.minZ + 1e-9 || f.min.z >= BERTH_ZONE.maxZ - 1e-9, `${f.id} avoids the berth zone`);
  // Leaving the interior requires z >= 7 in sim/carrier.ts; the vestibule stand qualifies.
  assert.ok(HEARTHLINE_STATIONS.find((s) => s.action === "leave_interior")!.stand.z >= 7);
});

test("Adverse: an obstruction across the compact passage is reported as an unreachable vestibule", () => {
  const blocker: InteriorSolid = { id: "test.crate", min: { x: -.45, y: 4, z: 1 }, max: { x: .55, y: 5, z: 1.4 } };
  const { reached } = reachable("compact", [...hearthlineInteriorSolids(), blocker]);
  assert.equal(reached(CARRIER_LAYOUT.vestibule), false, "the flood check catches a blocked passage");
  assert.equal(reached({ x: -3.4, y: DECK_Y, z: -5 }), true, "fore rooms stay reachable");
});

test("Proposed hull envelopes fit their carrier berth rooms and the lock; keels clear the transfer corridor", () => {
  for (const hull of [S3_HULLS.hush, S3_HULLS.spindle, S3_HULLS.mantle]) {
    const berth = hull.berth!, e = berth.envelope;
    const rooms = berth.size === "compact" ? CARRIER_LAYOUT.compact : [CARRIER_LAYOUT.medium];
    for (const [slot, room] of rooms.entries()) {
      const c = slot === 0 ? { x: -3, z: 1 } : { x: 3, z: 1 };
      assert.ok(c.x - e.halfWidth >= room.min.x - 1e-9 && c.x + e.halfWidth <= room.max.x + 1e-9, `${hull.id} width fits ${room.id}`);
      assert.ok(c.z - e.halfLength >= room.min.z - 1e-9 && c.z + e.halfLength <= room.max.z + 1e-9, `${hull.id} length fits ${room.id}`);
      assert.ok(4 + e.height <= room.max.y, `${hull.id} height fits ${room.id}`);
    }
    assert.ok(CARRIER_LAYOUT.lockKeelY + e.height <= CARRIER_LAYOUT.lock.max.y, `${hull.id} fits the lock height`);
    assert.ok(e.halfWidth <= CARRIER_LAYOUT.throat.max.x, `${hull.id} fits the throat`);
    // Nothing proposed is larger than today's sim envelopes, except Spindle's height (flagged).
    const current = BERTH_ENVELOPES[hull.id as "hush" | "spindle" | "mantle"];
    assert.ok(e.halfWidth <= current.halfWidth && e.halfLength <= current.halfLength, `${hull.id} footprint unchanged or smaller`);
    if (hull.id !== "spindle") assert.ok(e.height <= current.height, `${hull.id} height unchanged`);
    assert.equal(hull.collider.radius, HULL_COLLIDERS[hull.id as "hush" | "spindle" | "mantle"].radius, `${hull.id} piloting radius unchanged`);
  }
  // A medium hull lowered at the port berth reaches x = -3 - 2.9; the keel stays outboard.
  assert.ok(HEARTHLINE_KEELS.inner > 3 + BERTH_ENVELOPES.mantle.halfWidth + .1);
  assert.ok(HEARTHLINE_KEELS.inner > CARRIER_LAYOUT.lock.max.x, "keels clear the lock box");
});
