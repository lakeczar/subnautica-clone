import test from "node:test";
import assert from "node:assert/strict";
import { CANOPY_ROOT_CAVES as S } from "../src/content/caves/canopyRootCaves.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { actorBox } from "../src/sim/ribCollision.js";
import type { Vec3 } from "../src/sim/types.js";
import { createLargeCave } from "../src/world/caves/large/build.js";
import { caveWorldMap, CavePins, coverageProblems, shownLods } from "../src/world/caves/large/streaming.js";
import { createResidency, type ChunkLoader, type PreparedArt, type ResidentArt } from "../src/world/residency.js";
import { validateLayout } from "../src/world/map.js";
import type { WorldMap } from "../src/world/types.js";
import { DART } from "./large-cave-support.js";

// LC streaming: the Canopy's chunks through S1 residency, and the adverse
// case: a fast craft crossing the biome while chunks are still constructing
// must never touch rock that is not drawn fine, nor enter a zone with an
// undrawn chunk. Builds and uploads cost simulated time on a fake clock.
const cave = createLargeCave(S, worldFloor);
const cm = caveWorldMap(cave);
/** Tighter bands than the default: what a memory-squeezed tuning might pick. */
const tight = caveWorldMap(cave, { fine: 32, coarse: 96, hysteresis: 8 });

/** A loader whose builds take `buildMs` per step (fine 3 steps, coarse 1). */
function fakeLoader(clock: { t: number }, buildMs: number): ChunkLoader {
  return {
    *build(_chunk, lod) {
      for (let i = 0; i < (lod === "fine" ? 3 : 1); i++) { clock.t += buildMs; yield; }
      const bytes = lod === "fine" ? 420 * 1024 : 110 * 1024;
      const art: PreparedArt = {
        cpuBytes: bytes, gpuBytes: bytes, discard() {},
        upload(): ResidentArt { clock.t += 1; return { cpuBytes: bytes, gpuBytes: bytes, setVisible() {}, dispose() {} }; },
      };
      return art;
    },
  };
}

/** A tight share of S1's 256 MiB: about a coarse floor plus two zones fine. */
const BUDGET_MIB = 32;
interface Run { readyFrames: number; frames: number; failures: string[]; maxShownMiB: number }
function traverse(path: readonly Vec3[], speed: number, map: WorldMap, pins: CavePins | null, budgetMiB = BUDGET_MIB, cmap = cm): Run {
  const clock = { t: 0 };
  const residency = createResidency({ map, loader: fakeLoader(clock, 2.5), now: () => clock.t,
    budget: { cpuBytes: budgetMiB * 1048576, gpuBytes: budgetMiB * 1048576, buildMsPerFrame: 4, uploadMsPerFrame: 4 } });
  let p = { ...path[0]! }, wp = 1, frames = 0, readyFrames = -1, maxShown = 0;
  const failures: string[] = [];
  const check = (): string[] => {
    const eye = { x: p.x, y: p.y + 1.4, z: p.z };
    pins?.update(eye);
    const zone = pins ? pins.current.zone : cave.field.zoneAt(eye.x, eye.y, eye.z);
    const stats = residency.update(eye);
    maxShown = Math.max(maxShown, stats.gpuBytes);
    return coverageProblems(cmap, shownLods(residency.units()), actorBox(p, DART), 2, zone);
  };
  // Cold entry: held outside the hollow until what it touches and its zone are drawn.
  for (let i = 0; i < 2000 && readyFrames < 0; i++) { clock.t += 16.7; if (!check().length && i > 1) readyFrames = i; }
  assert.ok(readyFrames >= 0, "the cave never became enterable");
  while (wp < path.length && frames < 20000) {
    const g = path[wp]!, dx = g.x - p.x, dy = g.y - p.y, dz = g.z - p.z, l = Math.hypot(dx, dy, dz);
    if (l < 0.5) { wp++; continue; }
    const s = Math.min(speed / 60, l);
    p = { x: p.x + dx / l * s, y: p.y + dy / l * s, z: p.z + dz / l * s };
    clock.t += 16.7; frames++;
    const problems = check();
    if (problems.length) failures.push(`frame ${frames} at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}): ${problems[0]}`);
  }
  return { readyFrames, frames, failures, maxShownMiB: maxShown / 1048576 };
}

/** The craft loop out and back, the west loop and the pool spur, joined. */
const tour = (() => {
  const r = (id: string) => S.routes.find(x => x.id === id)!.path;
  return [...r("canopy_roots.route.craft_loop").slice(0, 9), ...r("canopy_roots.route.pool_spur"), ...[...r("canopy_roots.route.pool_spur")].reverse(),
    ...r("canopy_roots.route.west_loop"), ...[...r("canopy_roots.route.craft_loop")].reverse().slice(0, 5)];
})();

test("LC streaming: the cave map is a valid S1 layout with one layer stack per column", () => {
  assert.deepEqual(validateLayout(cm.map.layout), []);
  assert.equal(cm.refs.length, cave.chunks.length);
  // Every carve-reached chunk knows its zones; the hub links to four zones.
  const hub = S.zones.findIndex(z => z.id === "canopy_roots.hub");
  assert.deepEqual(cm.neighbours(hub).map(i => S.zones[i]!.id).sort(),
    ["canopy_roots.garden", "canopy_roots.hall", "canopy_roots.passage", "canopy_roots.pool"]);
});

test("LC streaming: pins put the viewer's zone and its neighbours fine, and the whole cave at least coarse", () => {
  const pins = new CavePins(cm);
  const inHall = pins.update({ x: 742, y: -126, z: -100 });
  const hall = S.zones.findIndex(z => z.id === "canopy_roots.hall");
  assert.equal(inHall.zone, hall);
  assert.ok(inHall.active);
  for (const r of cm.refs) if (r.zones.includes(hall)) assert.ok(inHall.fine.has(r.id));
  // Through the view, every chunk is wanted within the coarse band.
  const wanted = pins.view.chunksWithin({ x: 742, y: -126, z: -100 }, 10000);
  assert.equal(wanted.length, cm.refs.length);
  assert.ok(wanted.every(w => w.distance < w.chunk.lod.coarse));
  // Far away nothing is pinned.
  const far = pins.update({ x: 742, y: -60, z: 400 });
  assert.ok(!far.active && far.fine.size === 0);
});

test("LC adverse: a Dart at boost and at overdrive crosses the biome while chunks construct, never meeting undrawn rock", () => {
  for (const [speed, map] of [[11, cm], [16, cm], [16, tight]] as const) {
    const pins = new CavePins(map), r = traverse(tour, speed, pins.view, pins, BUDGET_MIB, map);
    assert.deepEqual(r.failures.slice(0, 3), [], `at ${speed} m/s, fine band ${map.map.layout.chunks[0]!.lod.fine} m`);
    assert.ok(r.frames > 1500, `the tour is ${r.frames} frames`);
    assert.ok(r.maxShownMiB <= BUDGET_MIB, `held ${r.maxShownMiB.toFixed(1)} MiB`);
  }
});

test("LC adverse control: on the same tight bands and budget, distance alone meets undrawn rock", () => {
  const r = traverse(tour, 16, tight.map, null, BUDGET_MIB, tight);
  assert.ok(r.failures.length > 0, "the control should fail: pins are what keep the craft covered");
  if (process.env.LC_VERBOSE) console.log(`control: ${r.failures.length} uncovered frames of ${r.frames}; first ${r.failures[0]}`);
});
