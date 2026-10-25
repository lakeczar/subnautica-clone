// CA-3 darkness and hazards, heavy. With the lamp off, a diver anywhere in
// any of these caves swims the glow out (the W1 retreat: only what an unlit
// diver sees, every hop swept with the full diver). In a heat or brine cave
// that same swim, at ordinary speed and on S4's own exposure model, reaches
// safe water within the remaining suit tolerance and air at every phase of
// the tube's breath.
import test from "node:test";
import assert from "node:assert/strict";
import { DEEP_CAVES } from "../src/content/regions/caves/deep.js";
import { KILN_BREATH, type DeepCave } from "../src/content/regions/caves/deepKit.js";
import type { Vec3 } from "../src/sim/types.js";
import { AIR_20, bodyHazard, deepWorld, retreat, retreatStarts, swim, TICKS, worldWith } from "./caves-deep-support.js";

const cave = (id: string): DeepCave => DEEP_CAVES.find(c => c.source.id === id)!;
const results = new Map<string, ReturnType<typeof retreat>>();
const retreatOf = (c: DeepCave) => {
  let r = results.get(c.source.id);
  if (!r) results.set(c.source.id, r = retreat(c, retreatStarts(c, deepWorld()), deepWorld()));
  return r;
};

for (const c of DEEP_CAVES) {
  test(`${c.source.id}: lamp off, a diver anywhere inside swims the glow out through an authored opening`, () => {
    const r = retreatOf(c);
    assert.ok(r.length >= 15, `${r.length} starts`);
    assert.deepEqual(r.filter(x => x.failure).map(x => x.failure), []);
    const exits = new Set(r.map(x => x.exit));
    // A cave with two openings is left by both, depending on where you start.
    if (Object.keys(c.exits).length >= 2) assert.ok(exits.size >= 2, `only ${[...exits].join()} used`);
    assert.ok(r.reduce((n, x) => n + x.path.length - 1, 0) > r.length, "the retreat is a swim of several hops");
  });
}

test("negative control: with every kiln-tube opening plugged, the same retreat fails", () => {
  const c = cave("rift_kiln_tube");
  const plugs = c.source.portals.filter(o => o.kind === "mouth" || o.kind === "skylight").map((o, i) => {
    // Thick and wide: a mouth on a cliff opens across several metres.
    const w = o.clear.width / 2 + 5, h = o.clear.height / 2 + 5, t = 4;
    const half = o.normal.y !== 0 ? { x: w, y: t, z: h } : o.normal.z !== 0 ? { x: w, y: h, z: t } : { x: t, y: h, z: w };
    return { id: `test.plug.${i}`, min: { x: o.center.x - half.x, y: o.center.y - half.y, z: o.center.z - half.z },
      max: { x: o.center.x + half.x, y: o.center.y + half.y, z: o.center.z + half.z } };
  });
  const world = worldWith(c, plugs), starts = retreatStarts(c, world, 4);
  const failed = retreat(c, starts, world).filter(x => x.failure).length;
  assert.ok(failed >= starts.length * 0.9, `${failed} of ${starts.length} still escaped a sealed cave`);
});

/** Every hazard cave: every retreat start at every breath phase (2 s apart),
 * starting with loads already at the second warning (70, grace spent) and
 * 20% air, never reaches harm, arrives in safe water, inside the air. */
for (const c of DEEP_CAVES.filter(c => c.hazards.length)) {
  test(`${c.source.id}: hazard-aware escape from every start and phase, within suit tolerance and 20% air`, () => {
    const breath = c.hazards.some(h => h.cycle), phases = breath ? KILN_BREATH.period / 2 : 1;
    let worst = { load: 0, seconds: 0 };
    for (const r of retreatOf(c)) for (let k = 0; k < phases; k++) {
      const s = swim(r.path, k * 2 * TICKS, { heat: 70, brine: 70, air: AIR_20 });
      assert.equal(s.harm, 0, `${JSON.stringify(r.start)} at ${k * 2} s: ${s.harm.toFixed(2)} harm (heat ${s.peakHeat.toFixed(0)}, brine ${s.peakBrine.toFixed(0)})`);
      assert.ok(s.safeAtEnd, `${JSON.stringify(r.start)} at ${k * 2} s ends in hazard`);
      assert.ok(s.seconds <= AIR_20, `${JSON.stringify(r.start)}: ${s.seconds.toFixed(1)} s against ${AIR_20.toFixed(0)} s of air`);
      worst = { load: Math.max(worst.load, s.peakHeat, s.peakBrine), seconds: Math.max(worst.seconds, s.seconds) };
    }
    assert.ok(worst.load < 100);
  });
}

test("never heat-only: in every warm Rift cave much of the water stays cool at the breath's peak, and the warmest pose has a cool way out", () => {
  for (const c of DEEP_CAVES.filter(c => c.hazards.some(h => h.kind === "heat" && h.intensity > 0.3))) {
    const peak = (KILN_BREATH.start + KILN_BREATH.ramp + 1) * TICKS;
    const starts = retreatStarts(c, deepWorld());
    const cool = starts.filter(p => bodyHazard(p, peak).heat <= 0.3).length;
    assert.ok(cool >= starts.length * 0.4, `${c.source.id}: only ${cool} of ${starts.length} poses cool at the peak`);
    // From the warmest pose, the lamp-off retreat at the peak passes only cool water after leaving the warm end.
    const hot = starts.reduce((a, b) => bodyHazard(b, peak).heat > bodyHazard(a, peak).heat ? b : a);
    const [r] = retreat(c, [hot], deepWorld());
    assert.equal(r!.failure, null);
    const firstCool = r!.path.findIndex(p => bodyHazard(p, peak).heat <= 0.3);
    assert.ok(firstCool >= 0 && r!.path.slice(firstCool).every(p => bodyHazard(p, peak).heat <= 0.3),
      `${c.source.id}: the way out from ${JSON.stringify(hot)} re-enters warm water`);
  }
});

test("adverse: 20% air, heat at 90 and the lamp off at the deepest point of each Rift tube network, every breath phase: out to cool open water inside both budgets", t => {
  for (const id of ["rift_kiln_tube", "rift_north_shoulder", "rift_tube_mites"]) {
    const c = cave(id), starts = retreatStarts(c, deepWorld());
    const deepest = starts.reduce((a, b) => b.y < a.y ? b : a);
    for (const start of [deepest] as Vec3[]) {
      const [r] = retreat(c, [start], deepWorld());
      assert.equal(r!.failure, null, `${id}: ${r!.failure}`);
      let worst = { heat: 0, seconds: 0 };
      for (let k = 0; k < KILN_BREATH.period / 2; k++) {
        const s = swim(r!.path, k * 2 * TICKS, { heat: 90, brine: 0, air: AIR_20 });
        assert.equal(s.harm, 0, `${id} from ${JSON.stringify(start)} at ${k * 2} s: harm ${s.harm.toFixed(2)}, heat ${s.peakHeat.toFixed(1)}`);
        assert.ok(s.safeAtEnd && s.seconds <= AIR_20);
        worst = { heat: Math.max(worst.heat, s.peakHeat), seconds: Math.max(worst.seconds, s.seconds) };
      }
      t.diagnostic(`${id} from ${JSON.stringify({ x: +start.x.toFixed(1), y: +start.y.toFixed(1), z: +start.z.toFixed(1) })}: exit ${r!.exit}, ` +
        `${r!.path.length - 1} hops, worst ${worst.seconds.toFixed(1)} s of ${AIR_20.toFixed(0)} s air, peak heat load ${worst.heat.toFixed(1)}`);
    }
  }
});
