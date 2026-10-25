// CA-3 hazards through the real survival path, heavy. The cave fields are
// registered in the canonical HAZARD_FIELDS before the simulation loads (as
// composition will), then an unprotected diver held still in a cave pose is
// stepped with `stepGame`: the warm end and every pool must raise the real
// load at their peak, a breath must ease at slack, and the way out must not.
// Positive controls: with every intensity zeroed these fail.
import test from "node:test";
import assert from "node:assert/strict";
import { HAZARD_FIELDS } from "../src/content/ecology/hazards.js";
import { RIFT_CAVES } from "../src/content/regions/caves/rift.js";
import { DIVIDE_CAVES } from "../src/content/regions/caves/divide.js";
import { MERIDIAN_CAVES } from "../src/content/regions/caves/meridian.js";
import { KILN_BREATH, type CaveHazard, type DeepCave } from "../src/content/regions/caves/deepKit.js";
import type { Vec3 } from "../src/sim/types.js";

const CAVES: readonly DeepCave[] = [...RIFT_CAVES, ...DIVIDE_CAVES, ...MERIDIAN_CAVES];
for (const h of CAVES.flatMap(c => c.hazards)) (HAZARD_FIELDS as Record<string, unknown>)[h.id] = h;
// Only now load the simulation, which reads HAZARD_FIELDS once.
const { createGame } = await import("../src/sim/state.js");
const { completeOpening } = await import("../src/sim/progression.js");
const { stepGame } = await import("../src/sim/step.js");
const { caveFieldLevel } = await import("../src/content/regions/caves/deep.js");
const { deepWorld, retreatStarts, probeOf, DIVER } = await import("./caves-deep-support.js");
const { sitePosition } = await import("../src/content/ecology/sites.js");

const PEAK = (KILN_BREATH.start + KILN_BREATH.ramp + 1) * 60;
const SLACK = (KILN_BREATH.start + KILN_BREATH.duration + 2 * KILN_BREATH.ramp + 8) * 60;
/** Feet, middle and head: the strongest reading of one field on the body. */
const body = (h: CaveHazard, p: Vec3, tick: number): number => Math.max(...[0, 0.5, 0.95].map(dy => caveFieldLevel(h, { ...p, y: p.y + dy }, tick)));

/** An unprotected diver (pressure suit only, full air, lamp off) held still at
 * `p` from `tick` for `seconds`; returns the real heat and brine loads. */
function hold(p: Vec3, tick: number, seconds: number): { heat: number; brine: number; health: number } {
  let s = createGame();
  completeOpening(s);
  s.tick = tick; s.player.mode = "swimming"; s.player.pose.position = { ...p }; s.player.lamp = false;
  s.player.vitals.oxygen = 100; s.player.vitals.health = 100;
  s.inventory.items.push({ id: "ca3.suit", kind: "suit_800", quantity: 1, containerId: "equipment", fitted: "suit" } as never);
  const world = deepWorld();
  for (let i = 0; i < seconds * 60; i++) s = stepGame(s, [], world).state;
  return { heat: s.world.ecology.diver.heat, brine: s.world.ecology.diver.brine, health: s.player.vitals.health };
}

for (const c of CAVES.filter(c => c.hazards.some(h => h.kind === "brine" || h.intensity > 0.3))) {
  test(`${c.source.id}: the real survival load rises in the hazard and not on the way out`, t => {
    const world = deepWorld(), starts = retreatStarts(c, world);
    for (const h of c.hazards) {
      if (h.kind === "heat" && h.intensity <= 0.3) continue;
      // The pose in the cave's own reachable water that this field reaches hardest.
      // Retreat starts plus a 0.5 m lattice of clear in-cave water round the
      // field (small pools hold no 2 m lattice pose).
      const others = c.hazards.filter(o => o !== h), o = sitePosition(h.shape.center), sh = h.shape, near: Vec3[] = [];
      const box = sh.kind === "cylinder" ? { min: { x: -sh.radius, y: sh.bottom, z: -sh.radius }, max: { x: sh.radius, y: sh.top, z: sh.radius } }
        : sh.kind === "box" ? sh : { min: { ...sh.min, y: sh.y - 3 }, max: { ...sh.max, y: sh.y + 1 } };
      const probe = probeOf(c);
      for (let x = o.x + box.min.x - 1; x <= o.x + box.max.x + 1; x += 0.5) for (let z = o.z + box.min.z - 1; z <= o.z + box.max.z + 1; z += 0.5)
        for (let y = o.y + box.min.y - 1.5; y <= o.y + box.max.y + 0.5; y += 0.25) {
          const p = { x, y, z };
          if (probe.roomAt({ ...p, y: p.y + 0.3 }) !== "" && world.clearance(p, DIVER)) near.push(p);
        }
      const pool = [...starts, ...near].filter(p => !h.cycle || others.every(q => body(q, p, SLACK) <= 1e-9));
      const danger = pool.reduce((a, b) => body(h, b, PEAK) > body(h, a, PEAK) ? b : a);
      assert.ok(body(h, danger, PEAK) > (h.kind === "brine" ? 0.5 : 0.45), `${h.id}: reaches no reachable water (${body(h, danger, PEAK).toFixed(2)})`);
      const hot = hold(danger, PEAK, 3);
      const load = h.kind === "brine" ? hot.brine : hot.heat;
      assert.ok(load >= 15, `${h.id}: load ${load.toFixed(1)} after 3 s at ${JSON.stringify(danger)}`);
      t.diagnostic(`${h.id}: ${h.kind} load ${load.toFixed(1)} after 3 s still at the peak`);
      if (h.cycle) {
        const eased = hold(danger, SLACK, 3);
        assert.ok(eased.heat < 1, `${h.id}: still loading at slack (${eased.heat.toFixed(1)})`);
      }
    }
    // Cool control: just outside each exit, at the peak, nothing loads.
    for (const r of c.source.routes.filter(r => r.profile === "diver")) {
      const out = r.path[r.path.length - 1]!, calm = hold(out, PEAK, 3);
      assert.ok(calm.heat === 0 && calm.brine === 0, `${r.id}: loads at its exit (${calm.heat.toFixed(1)}, ${calm.brine.toFixed(1)})`);
    }
  });
}

test("negative control: with every cave field zeroed, the warm end and the pools load nothing", () => {
  const saved = CAVES.flatMap(c => c.hazards).map(h => [h, h.intensity] as const);
  try {
    for (const [h] of saved) (h as { intensity: number }).intensity = 0;
    const kiln = CAVES.find(c => c.source.id === "rift_kiln_tube")!, starts = retreatStarts(kiln, deepWorld());
    const vent = kiln.hazards.find(h => h.id === "rift_kiln_tube.heat.vent_east")!;
    const danger = starts.reduce((a, b) => caveFieldLevel({ ...vent, intensity: 1 }, b, PEAK) > caveFieldLevel({ ...vent, intensity: 1 }, a, PEAK) ? b : a);
    assert.equal(hold(danger, PEAK, 3).heat, 0);
  } finally { for (const [h, i] of saved) (h as { intensity: number }).intensity = i; }
});
