/** Sol R1 (CY-01..04): impacts, the no-riding invariant through the real
 * sweep, downflow over the floor, and the migration of C3's flow fields. */
import test from "node:test";
import assert from "node:assert/strict";
import { ACTORS } from "../src/content/currents/actors.js";
import type { ActorId } from "../src/content/currents/actors.js";
import { CHIMNEY_PULSE, CYCLE_BY_ID, SEDIMENT_SURGE } from "../src/content/currents/cycles.js";
import { createCurrentField, MAX_FLOW } from "../src/sim/currents/flow.js";
import { fromHazardField } from "../src/sim/currents/migrate.js";
import { exposure, respondToFlow } from "../src/sim/currents/motion.js";
import { moveHullWithCurrent, SUPPORT_MARGIN } from "../src/sim/currents/move.js";
import { initialSandbox, stepSandbox } from "../src/sim/currents/sandbox.js";
import type { Sandbox, SandboxInput, SandboxState } from "../src/sim/currents/sandbox.js";
import type { CurrentVolumeDef } from "../src/sim/currents/types.js";
import type { Vec3 } from "../src/sim/types.js";
import { createWorldQueries, hullFloor, hullClearance } from "../src/sim/world.js";
import { C3_FIELDS, s4Flow } from "./currents-c3-reference.js";
import type { ReferenceField } from "./currents-c3-reference.js";
import { run } from "./currents-support.js";

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const HULLS = (Object.keys(ACTORS) as ActorId[]).filter(id => id !== "diver");
const box = (id: string, center: Vec3, half: Vec3, direction: Vec3, strength: number, extra: Partial<CurrentVolumeDef> = {}): CurrentVolumeDef =>
  ({ id, label: id, shape: { kind: "box", center, half }, direction, strength, edge: 0, cue: "c", ...extra });
const basin = (floor: (x: number, z: number) => number, volumes: readonly CurrentVolumeDef[], solids = [] as { id: string; min: Vec3; max: Vec3 }[]): Sandbox =>
  ({ world: createWorldQueries(solids, floor), field: createCurrentField(volumes, CYCLE_BY_ID) });

// ------------------------------------------------------------------ CY-01 impacts

const WALL = { id: "t.wall", min: v(50, -40, -320), max: v(50.3, 2, 66) };
const crossFlow = (strength: number) => [box("t.flow", v(20, -20, -127), v(40, 25, 200), v(1, 0, 0), strength)];

test("CY-01: powered hulls sliding along rock under a cross-current take no impact, at cruise or boost", () => {
  const world = basin(() => -80, crossFlow(MAX_FLOW), [WALL]);
  for (const id of HULLS) for (const sprint of [false, true]) {
    const a = ACTORS[id], s = initialSandbox(id, v(WALL.min.x - a.shape.radius - 0.5, -20, -20));
    const { readouts } = run(s, world, 12, () => ({ forward: 1, yaw: 0, sprint }));
    assert.ok(readouts.filter(r => r.hitSolid).length > 100, `${id} pressed on the face`);
    assert.equal(s.health, 100, `${id} ${sprint ? "boost" : "cruise"}: health ${s.health}`);
    assert.equal(readouts.flatMap(r => r.events).filter(e => e.type === "impact").length, 0, id);
    assert.ok(Math.max(...readouts.map(r => r.impact)) === 0);
  }
});

test("CY-01: a genuine head-on hit still damages, once, with or without a current", () => {
  for (const strength of [0, 4]) {
    const world = basin(() => -80, strength ? crossFlow(strength) : [], [WALL]);
    for (const id of ["dart", "hush", "creel", "spindle"] as const) {
      const a = ACTORS[id], s = initialSandbox(id, v(WALL.min.x - a.shape.radius - 12, -20, -20));
      // Reach boost speed first, then meet the wall square on.
      const { readouts } = run(s, world, 6, () => ({ forward: 1, yaw: Math.PI / 2, sprint: true }));
      const hits = readouts.flatMap(r => r.events).filter(e => e.type === "impact");
      assert.ok(hits.length > 0 && s.health < 100, `${id} in ${strength} m/s: no impact (${s.health})`);
      assert.ok(Math.max(...hits.map(h => (h as { closing: number }).closing)) > a.boost * 0.8, `${id}: the closing speed is the drive`);
      // Face damping makes it one collision, not a grind: the hull pressing on afterwards is not destroyed.
      assert.ok(s.health > 90, `${id} in ${strength} m/s ground down to ${s.health.toFixed(1)}`);
      assert.ok(s.position.x + a.shape.radius <= WALL.min.x + 1e-6);
    }
  }
});

// ------------------------------------------------------------------ CY-02 through the sweep

test("CY-02: through the real sweep, across volume edges and cycles, no step gains on still water or letting go", () => {
  const dot = (p: Vec3, q: Vec3) => p.x * q.x + p.y * q.y + p.z * q.z;
  const dirs: Vec3[] = [];
  for (let i = 0; i < 24; i++) dirs.push(v(Math.cos(i * Math.PI / 12), 0, Math.sin(i * Math.PI / 12)));
  dirs.push(v(0, 1, 0), v(0, -1, 0));
  // Open water: a cycled cross-current beside an opposed one, overlapping in a band, plus a tube.
  const world = basin(() => -200, [
    box("t.east", v(0, -50, -100), v(60, 40, 30), v(1, 0, 0), 6, { edge: 8, cycle: CYCLE_BY_ID.get("cycle.lab.spill_slack")!.id }),
    box("t.west", v(0, -50, -40), v(60, 40, 40), v(-0.7, 0, 0.7), 5, { edge: 8 }),
    { id: "t.tube", label: "t", shape: { kind: "tube", a: v(-60, -50, -160), b: v(60, -30, -160), radius: 15 }, strength: 3, edge: 5, cue: "c" },
  ]);
  let steps = 0;
  for (const id of ["diver", "dart", "hush", "creel", "mantle"] as const) {
    const a = ACTORS[id];
    for (const mode of ["quiet", "cruise", "boost"] as const) {
      const s = initialSandbox(id, v(-40, -50, -170));
      const input = (st: SandboxState): SandboxInput => ({ forward: 1, yaw: 0.7 + st.tick / 97, pitch: Math.sin(st.tick / 53) * 0.4,
        quiet: mode === "quiet", sprint: mode === "boost" });
      for (let i = 0; i < 900; i++) {
        const from = { ...s.position }, r = stepSandbox(s, input(s), world);
        if (r.hitSolid) continue;
        const k = exposure(a), d = v(r.flow.x * k, r.flow.y * k, r.flow.z * k), u = Math.hypot(r.drive.x, r.drive.y, r.drive.z);
        const g = v((s.position.x - from.x) * 60, (s.position.y - from.y) * 60, (s.position.z - from.z) * 60);
        if (u > 0.05) for (const w of dirs) assert.ok(dot(g, w) <= Math.max(u, dot(d, w)) + 1e-6, `${id} ${mode} step ${i}: ${dot(g, w)} along ${JSON.stringify(w)}`);
        steps++;
      }
    }
  }
  assert.ok(steps > 10000, `${steps} steps`);
});

test("CY-02: riding downstream or diagonally never beats swimming in still water to a target", () => {
  // A diver heads for a point 60 m away at 0°, 30°, 45°, 60° and 90° off a 3 m/s current, crabbing as a skilled player would.
  const field = [box("t.river", v(0, -50, -100), v(200, 40, 200), v(1, 0, 0), 3)];
  for (const id of ["diver", "dart", "hush"] as const) {
    const a = ACTORS[id];
    for (const deg of [0, 30, 45, 60, 90]) {
      const t = deg * Math.PI / 180, start = v(-50, -50, -100), goal = v(start.x + 60 * Math.cos(t), -50, start.z - 60 * Math.sin(t));
      const world = basin(() => -200, field);
      let best = Infinity;
      for (const aim of [-0.6, -0.3, 0, 0.3, 0.6]) {
        const st = initialSandbox(id, start);
        const out = run(st, world, 60, x => {
          const dx = goal.x - x.position.x, dz = goal.z - x.position.z;
          return { forward: 1, yaw: Math.atan2(dx, -dz) + aim, sprint: true };
        }, x => Math.hypot(goal.x - x.position.x, goal.z - x.position.z) < 1.5);
        if (out.stoppedAt !== null) best = Math.min(best, out.stoppedAt);
      }
      // The run stops 1.5 m short; still water covers 58.5 m at full boost from the first step.
      const still = 58.5 / a.boost;
      assert.ok(best >= still - 1 / 60, `${id} at ${deg}°: ${best.toFixed(2)} s, still water takes ${still.toFixed(2)} s`);
    }
  }
});

// ------------------------------------------------------------------ CY-03 downflow over the floor

const DOWNWELLING = (strength = 1.1) => [box("t.down", v(60, -30, -100), v(200, 60, 200), v(0, -0.6, -0.8), strength)];

test("CY-03: a hull resting on the floor under downflow still drives along it", () => {
  const flat = () => -40;
  for (const id of ["dart", "creel", "hush", "mantle"] as const) {
    const a = ACTORS[id], calmWorld = basin(flat, []), flowWorld = basin(flat, DOWNWELLING());
    const start = (w: Sandbox) => { const p = v(40, 0, -30); p.y = hullFloor(w.world, p, a.shape) + SUPPORT_MARGIN; return p; };
    const calm = initialSandbox(id, start(calmWorld)), flowing = initialSandbox(id, start(flowWorld));
    run(calm, calmWorld, 2, () => ({ forward: 1, yaw: Math.PI / 2, sprint: true }));
    run(flowing, flowWorld, 2, st => {
      assert.ok(hullClearance(flowWorld.world, st.position, a.shape), `${id} left its support margin`);
      return { forward: 1, yaw: Math.PI / 2, sprint: true };
    });
    const calmX = calm.position.x - 40, flowX = flowing.position.x - 40;
    assert.ok(calmX > 5 && flowX >= 0.9 * calmX, `${id}: ${flowX.toFixed(2)} m under downflow vs ${calmX.toFixed(2)} m calm`);
    // Upward escape from the floor against the downflow.
    run(flowing, flowWorld, 3, () => ({ vertical: 1 }));
    assert.ok(flowing.position.y > hullFloor(flowWorld.world, flowing.position, a.shape) + 2, `${id} cannot rise off the floor`);
  }
});

test("CY-03: downflow neither lets a hull climb an upslope nor sinks it into a downslope", () => {
  const up = (x: number) => -40 + Math.max(0, x - 50) * 0.6, down = (x: number) => -40 - Math.max(0, x - 50) * 0.4;
  for (const id of ["dart", "creel", "mantle"] as const) {
    const a = ACTORS[id];
    for (const [name, floor] of [["up", up], ["down", down]] as const) {
      const calm = basin(floor, []), flowing = basin(floor, DOWNWELLING(1.5));
      const begin = (w: Sandbox) => { const p = v(40, 0, -30); p.y = hullFloor(w.world, p, a.shape) + SUPPORT_MARGIN; return initialSandbox(id, p); };
      const c = begin(calm), f = begin(flowing);
      run(c, calm, 4, () => ({ forward: 1, yaw: Math.PI / 2 }));
      run(f, flowing, 4, st => {
        assert.ok(st.position.y >= hullFloor(flowing.world, st.position, a.shape) + SUPPORT_MARGIN - 1e-6, `${id} ${name}: below the margin`);
        assert.ok(flowing.world.clearance(st.position, a.shape), `${id} ${name}: in rock`);
        return { forward: 1, yaw: Math.PI / 2 };
      });
      if (name === "up") assert.ok(f.position.x <= c.position.x + 0.25 && f.position.y <= c.position.y + 0.25, `${id}: climbed further with the current`);
      else assert.ok(f.position.x >= 0.9 * (c.position.x - 40) + 40 && f.position.y < c.position.y, `${id}: downslope`);
    }
  }
});

test("CY-03: the adapter changes only a downward drift at the support margin", () => {
  const world = createWorldQueries([], () => -40), shape = ACTORS.dart.shape;
  const onFloor = v(0, hullFloor(world, v(0, 0, 0), shape) + SUPPORT_MARGIN, 0), high = v(0, -20, 0);
  const drive = v(8, 0, 0), down = v(0, -2, 0);
  assert.ok(moveHullWithCurrent(world, onFloor, drive, down, shape, 1 / 60).position.x > 0.13, "slides along the floor");
  const free = moveHullWithCurrent(world, high, drive, down, shape, 1 / 60);
  assert.ok(Math.abs(free.position.y - (high.y - 2 / 60)) < 1e-9, "drift is unchanged in open water");
  const dive = moveHullWithCurrent(world, onFloor, v(8, -3, 0), v(0, 0, 0), shape, 1 / 60);
  assert.ok(dive.position.x === onFloor.x && dive.hitSolid, "a pilot diving into the floor is still refused, as today");
});

// ------------------------------------------------------------------ CY-04 every flow contributor migrated

const MIGRATED = (fields: Record<string, ReferenceField>) => Object.entries(fields)
  .map(([id, f]) => fromHazardField(id, f, f.shape.center, id === "basin_sediment_lane" ? SEDIMENT_SURGE : f.cycle ? CHIMNEY_PULSE : undefined))
  .filter((x): x is CurrentVolumeDef => x !== null);

function compare(fields: Record<string, ReferenceField>, around: Vec3[], label: string): number {
  const field = createCurrentField(MIGRATED(fields), CYCLE_BY_ID), refs = Object.values(fields);
  let n = 0;
  for (const c of around) for (let i = -9; i <= 9; i++) for (let j = -9; j <= 9; j++) for (const dy of [-80, -10, 0, 10, 40]) {
    const p = v(c.x + i * 25 + 0.37, c.y + dy, c.z + j * 25 - 0.21);
    // Quiet, active, falling and rising parts of the lane's 100 s clock.
    for (const tick of [0, 1234, 3000, 3300, 3540, 3780, 4100, 6000, 8880]) {
      const got = field.sample(p, tick).flow, want = s4Flow(refs, p, tick);
      assert.ok(Math.abs(got.x - want.x) + Math.abs(got.y - want.y) + Math.abs(got.z - want.z) < 1e-12,
        `${label} at ${JSON.stringify(p)} tick ${tick}: ${JSON.stringify(got)} vs ${JSON.stringify(want)}`);
      if (want.x || want.y || want.z) n++;
    }
  }
  return n;
}

test("CY-04: both C3 flow fields migrate exactly, separately and overlapping; non-flow fields move nothing", () => {
  const { divide_downwelling: down, basin_sediment_lane: lane, rift_split_plume: plume } = C3_FIELDS;
  const downC = v(565 + 15, -450 + 99, -1456 + 207), laneC = v(783 - 23, -256 - 100, -612 - 208);
  assert.ok(compare({ divide_downwelling: down }, [downC, v(565 + 395, -450 + 120, -1456 + 241)], "downwelling") > 100);
  assert.ok(compare({ basin_sediment_lane: lane }, [laneC, v(783 + 117, -256 - 64, -612 - 88)], "sediment lane") > 100);
  // Overlap: move the lane onto the crest so both contribute at once.
  const moved = { ...lane, shape: { ...lane.shape, center: v(565 + 15 - (-163 + 117) / 2, -450 + 99 - (-136 - 64) / 2, -1456 + 207 - (-328 - 88) / 2) } };
  assert.ok(compare({ divide_downwelling: down, basin_sediment_lane: moved }, [downC], "overlap") > 100);
  assert.equal(fromHazardField("rift_split_plume", plume, plume.shape.center, CHIMNEY_PULSE), null, "heat moves nothing");
  // The quiet baseline and the 0.45 sediment share survive: quiet lane flow is 0.8 × 0.45 × 0.08.
  const laneVol = fromHazardField("basin_sediment_lane", lane, lane.shape.center, SEDIMENT_SURGE)!;
  const quiet = createCurrentField([laneVol], CYCLE_BY_ID).sample(laneC, 5400);
  assert.ok(Math.abs(quiet.flow.z - 0.8 * 0.45 * 0.08) < 1e-12, `quiet lane ${quiet.flow.z}`);
});

test("CY-04: the migration refuses a cycle that is not the field's own clock, and keeps S4's idle drift", () => {
  const lane = C3_FIELDS.basin_sediment_lane, down = C3_FIELDS.divide_downwelling;
  assert.throws(() => fromHazardField("basin_sediment_lane", lane, lane.shape.center, CHIMNEY_PULSE), /does not run the field's own clock/);
  assert.throws(() => fromHazardField("basin_sediment_lane", lane, lane.shape.center), /needs its framework cycle/);
  assert.throws(() => fromHazardField("divide_downwelling", down, down.shape.center, SEDIMENT_SURGE), /needs its framework cycle/);
  // Stopped, an unprotected diver drifts exactly as S4's driftFrom (flow × (1 − 0.15)).
  const field = createCurrentField(MIGRATED({ divide_downwelling: down }), CYCLE_BY_ID), p = v(600, -350, -1250);
  const flow = field.sample(p, 0).flow, drift = respondToFlow(flow, ACTORS.diver, v(0, 0, 0), "none").drift, want = s4Flow([down], p, 0);
  for (const axis of ["x", "y", "z"] as const) assert.ok(Math.abs(drift[axis] - want[axis] * 0.85) < 1e-12, axis);
});
