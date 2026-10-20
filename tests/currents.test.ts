import test from "node:test";
import assert from "node:assert/strict";
import { ACTORS } from "../src/content/currents/actors.js";
import type { ActorId } from "../src/content/currents/actors.js";
import { CYCLE_BY_ID, SPILL_SLACK } from "../src/content/currents/cycles.js";
import { CANDIDATES, EDGE, EDGE_RACE, GULLY, LAB_SOLIDS, LAB_VOLUMES, SPILL, VENT_COLUMN, WARDEN } from "../src/content/currents/lab.js";
import { createCurrentField, insideDepth, MAX_FLOW, volumeProblems, volumeWeight } from "../src/sim/currents/flow.js";
import { exposure, MOTION, respondToFlow } from "../src/sim/currents/motion.js";
import { createSandbox, initialSandbox, stepSandbox, ventHeat, wardenAt } from "../src/sim/currents/sandbox.js";
import type { Sandbox, SandboxInput, SandboxState } from "../src/sim/currents/sandbox.js";
import { TURBINE, turbineNet, turbineRate } from "../src/sim/currents/turbine.js";
import type { CurrentVolumeDef } from "../src/sim/currents/types.js";
import type { Vec3 } from "../src/sim/types.js";
import { createWorldQueries } from "../src/sim/world.js";
import { crab, distance, run, toward } from "./currents-support.js";

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const NO_CYCLES = new Map();
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;
const lab = createSandbox();
const HULLS = Object.keys(ACTORS).filter(id => id !== "diver") as ActorId[];

// ------------------------------------------------------------------ flow maths

test("flow: box weight is 1 deep inside, smooth over the edge, 0 at and beyond the boundary", () => {
  const box: CurrentVolumeDef = { id: "b", label: "b", shape: { kind: "box", center: v(0, 0, 0), half: v(10, 5, 4) },
    direction: v(2, 0, 0), strength: 3, edge: 2, cue: "c" };
  assert.equal(volumeWeight(box, v(0, 0, 0)), 1);
  assert.equal(volumeWeight(box, v(0, 0, 4)), 0);
  assert.equal(volumeWeight(box, v(0, 0, 9)), 0);
  assert.ok(near(volumeWeight(box, v(0, 0, 3)), 0.5));
  assert.equal(insideDepth(box.shape, v(13, 4, 0)), -3);
  const f = createCurrentField([box], NO_CYCLES).sample(v(1, 1, 0), 0);
  assert.ok(near(f.flow.x, 3) && f.flow.y === 0 && f.flow.z === 0, "direction is normalised");
  assert.deepEqual(f.volumes.map(x => x.id), ["b"]);
});

test("flow: a yawed box turns its axes; a tube flows a→b with rounded ends", () => {
  const yawed: CurrentVolumeDef = { id: "y", label: "y", shape: { kind: "box", center: v(0, 0, 0), half: v(20, 5, 2), yaw: Math.PI / 2 },
    direction: v(0, 0, -1), strength: 1, edge: 0, cue: "c" };
  assert.equal(volumeWeight(yawed, v(0, 0, -15)), 1, "local +X lies along world −Z");
  assert.equal(volumeWeight(yawed, v(15, 0, 0)), 0);
  const tube: CurrentVolumeDef = { id: "t", label: "t", shape: { kind: "tube", a: v(0, 0, 0), b: v(30, 0, 40), radius: 5 }, strength: 2, edge: 1, cue: "c" };
  const s = createCurrentField([tube], NO_CYCLES).sample(v(15, 0, 20), 0);
  assert.ok(near(s.flow.x, 2 * 0.6) && near(s.flow.z, 2 * 0.8));
  assert.equal(volumeWeight(tube, v(15, 0, 20)), 1);
  assert.equal(volumeWeight(tube, v(15, 6, 20)), 0);
  assert.ok(volumeWeight(tube, v(-4, 0, 0)) > 0 && volumeWeight(tube, v(-4, 4, 0)) === 0, "rounded cap");
});

test("flow: lees still the flow; cycles scale it; overlaps add and are capped", () => {
  assert.equal(volumeWeight(SPILL, v(42, -20, -30)), 0, "boulder lee");
  assert.ok(volumeWeight(SPILL, v(60, -20, -30)) === 1);
  const field = createCurrentField(LAB_VOLUMES, CYCLE_BY_ID), p = v(70, -20, -30);
  assert.ok(near(field.sample(p, 0).speed, 6.5), "surge");
  assert.ok(near(field.sample(p, 40 * 60).speed, 0.65), "lull");
  assert.ok(near(field.peak(p).speed, 6.5), "peak ignores the cycle");
  assert.ok(field.sample(p, 0).flow.x < 0, "spill runs west");
  const a: CurrentVolumeDef = { id: "a", label: "a", shape: { kind: "box", center: v(0, 0, 0), half: v(9, 9, 9) }, direction: v(1, 0, 0), strength: 6, edge: 0, cue: "c" };
  const capped = createCurrentField([a, { ...a, id: "b" }], NO_CYCLES).sample(v(0, 0, 0), 0);
  assert.equal(capped.speed, MAX_FLOW);
  assert.ok(near(capped.flow.x, MAX_FLOW));
});

test("flow: bad volumes are refused with their id", () => {
  const bad: CurrentVolumeDef = { id: "bad", label: "x", shape: { kind: "box", center: v(0, 0, 0), half: v(0, 1, 1) }, strength: 9, edge: -1, cycle: "nope", cue: " " };
  const p = volumeProblems(bad, CYCLE_BY_ID).join("\n");
  for (const fragment of ["strength", "edge", "needs a direction", "empty box", "unknown cycle nope", "no cue"]) assert.match(p, new RegExp(fragment));
  assert.throws(() => createCurrentField([bad], CYCLE_BY_ID), /bad:/);
  for (const vol of LAB_VOLUMES) assert.deepEqual(volumeProblems(vol, CYCLE_BY_ID), [], vol.id);
});

test("flow: a gated volume flush against rock is full strength at the face (no still layer to creep along)", () => {
  const field = createCurrentField([SPILL], CYCLE_BY_ID), r = ACTORS.diver.shape.radius;
  const windows = (x: number) => x > GULLY.windowX[0] - 2 && x < GULLY.windowX[1] + 2;
  // The open west end is a deliberate soft edge in water; start past it.
  for (let x = GULLY.minX + SPILL.edge + 0.5; x < GULLY.maxX - r; x += 1) {
    if (!windows(x)) for (const z of [GULLY.minZ + r, GULLY.maxZ - r]) {
      const s = field.peak(v(x, -20, z)).speed;
      assert.ok(s >= 0.97 * SPILL.strength, `wall face at x ${x}, z ${z}: ${s.toFixed(2)} m/s`);
    }
    const inLee = SPILL.lees!.some(l => x > l.min.x - 2 && x < l.max.x + 2);
    if (!inLee) assert.ok(field.peak(v(x, -40, -30)).speed >= 0.97 * SPILL.strength, `floor at x ${x}`);
  }
  assert.ok(field.peak(v(GULLY.maxX - r, -20, -30)).speed >= 0.97 * SPILL.strength, "east cap");
});

// ------------------------------------------------------------------ the motion rules

test("motion: drift is flow × (1 − authority); idle actors drift, holds cancel up to their limit", () => {
  const flow = v(4, 0, 0);
  for (const id of Object.keys(ACTORS) as ActorId[]) {
    const a = ACTORS[id], r = respondToFlow(flow, a, v(0, 0, 0), "none");
    assert.ok(near(r.drift.x, 4 * exposure(a)), id);
    assert.equal(r.extraDrain, 0, `${id}: drifting costs nothing`);
  }
  assert.equal(exposure({ id: "x", authority: 2, cruise: 1, drain: 0 }), 1 - MOTION.maxAuthority);
  const dart = ACTORS.dart; // drift 2.0 m/s in a 4 m/s flow
  const station = respondToFlow(flow, dart, v(0, 0, 0), "station");
  assert.ok(near(station.drift.x, 0) && near(station.held, 2) && !station.overpowered);
  assert.ok(near(station.extraDrain, dart.drain * MOTION.fightDrain * (2 / dart.cruise)));
  const strong = respondToFlow(v(20, 0, 0), dart, v(0, 0, 0), "station"); // 10 m/s of drift > cruise 8 (pre-cap)
  assert.ok(strong.overpowered && near(strong.drift.x, 2) && near(strong.effort, 1));
  const grapple = respondToFlow(flow, ACTORS.creel, v(0, 0, 0), "grapple"), creelStation = respondToFlow(flow, ACTORS.creel, v(0, 0, 0), "station");
  assert.ok(near(grapple.drift.x, 0) && grapple.extraDrain > 0 && grapple.extraDrain < creelStation.extraDrain, "the line is cheaper than thrusters");
  const anchor = respondToFlow(v(20, 0, 0), ACTORS.hearthline, v(0, 0, 0), "anchor"); // 2 m/s of drift
  assert.ok(near(anchor.held, MOTION.anchorHolds) && near(anchor.drift.x, 2 - MOTION.anchorHolds) && anchor.extraDrain === 0 && anchor.overpowered);
  const flat = respondToFlow(flow, dart, v(0, 0, 0), "station", false);
  assert.ok(near(flat.drift.x, 2) && flat.extraDrain === 0, "an unpowered hull cannot hold");
});

test("motion: no riding — along the flow you go at the faster of drive and drift, never their sum", () => {
  for (const id of Object.keys(ACTORS) as ActorId[]) {
    const a = ACTORS[id];
    for (let i = 0; i < 400; i++) {
      const ang = i * 2.399, f = 0.5 + (i % 8);
      const flow = v(Math.cos(ang) * f, Math.sin(i * 1.7) * f * 0.3, Math.sin(ang) * f);
      const drive = v(a.cruise * Math.cos(i * 0.9), 0, a.cruise * Math.sin(i * 0.9));
      const r = respondToFlow(flow, a, drive, "station");
      const d = Math.hypot(flow.x, flow.y, flow.z) * exposure(a), n = v(flow.x / Math.hypot(flow.x, flow.y, flow.z), flow.y / Math.hypot(flow.x, flow.y, flow.z), flow.z / Math.hypot(flow.x, flow.y, flow.z));
      const dot = (p: Vec3, q: Vec3) => p.x * q.x + p.y * q.y + p.z * q.z;
      const g = v(drive.x + r.drift.x, drive.y + r.drift.y, drive.z + r.drift.z), uf = dot(drive, n);
      // Downstream: max(drive, drift); upstream: drive + drift; across: the drive is untouched.
      assert.ok(near(dot(g, n), uf > 0 ? Math.max(uf, d) : uf + d, 1e-9), `${id} sample ${i}`);
      const gp = v(g.x - n.x * dot(g, n), g.y - n.y * dot(g, n), g.z - n.z * dot(g, n));
      const up = v(drive.x - n.x * uf, drive.y - n.y * uf, drive.z - n.z * uf);
      assert.ok(near(gp.x, up.x, 1e-9) && near(gp.y, up.y, 1e-9) && near(gp.z, up.z, 1e-9), `${id} sample ${i}: sideways drive changed`);
      assert.ok(Math.hypot(g.x, g.y, g.z) <= Math.max(a.cruise, Math.hypot(d, Math.hypot(up.x, up.y, up.z))) + 1e-9, `${id} sample ${i}: carried`);
    }
  }
  const diver = ACTORS.diver;
  const tail = respondToFlow(v(4, 0, 0), diver, v(3.4, 0, 0), "none");
  assert.ok(near(tail.drift.x, 0) && tail.headwind === 0, "a slower tailwind adds nothing");
  const fast = respondToFlow(v(8, 0, 0), diver, v(3.4, 0, 0), "none");
  assert.ok(near(3.4 + fast.drift.x, 8 * 0.85), "a faster one carries you at its own speed, not the sum");
  const head = respondToFlow(v(-4, 0, 0), diver, v(3.4, 0, 0), "none");
  assert.ok(near(head.drift.x, -3.4) && near(head.headwind, 3.4), "headwind: a diver in 4 m/s just holds");
  const cross = respondToFlow(v(0, 0, 4), diver, v(3.4, 0, 0), "none");
  assert.ok(near(cross.drift.z, 3.4) && cross.drift.x === 0, "sideways travel keeps the whole drive");
  const diagonal = respondToFlow(v(4, 0, 0), diver, v(1.7, 0, -2.94), "none");
  assert.ok(diagonal.drift.z === 0 && near(diagonal.drift.x, 3.4 - 1.7), "a diagonal heading is never pushed back along its own path");
  assert.equal(cross.extraDrain, 0, "the diver has no battery to drain");
  const dartCross = respondToFlow(v(0, 0, 4), ACTORS.dart, v(8, 0, 0), "none");
  assert.ok(dartCross.extraDrain > 0, "crossing costs a hull power");
});

// ------------------------------------------------------------------ collision safety

/** A test basin: floor, a 0.3 m wall at x 50 and a rock block, all under an 8 m/s current east. */
function wallBasin(): { lab: Sandbox; wall: number } {
  const solids = [
    { id: "t.floor", min: v(-76, -80, -320), max: v(248, -40, 66) },
    { id: "t.wall", min: v(50, -40, -320), max: v(50.3, 2, 66) },
    { id: "t.block", min: v(30, -40, -130), max: v(34, 2, -110) },
  ];
  const flow: CurrentVolumeDef = { id: "t.flow", label: "t", shape: { kind: "box", center: v(20, -20, -127), half: v(40, 25, 200) },
    direction: v(1, 0, 0), strength: MAX_FLOW, edge: 0, cue: "c" };
  return { lab: { world: createWorldQueries(solids, () => -40), field: createCurrentField([flow], NO_CYCLES) }, wall: 50 };
}

test("collision: drift never tunnels — every actor driven hard into thin rock in 8 m/s flow stays on its side", () => {
  const { lab: basin, wall } = wallBasin();
  for (const id of Object.keys(ACTORS) as ActorId[]) {
    const a = ACTORS[id], r = a.shape.radius;
    for (const sprint of [false, true]) {
      const s = initialSandbox(id, v(wall - r - 20, -20, -60));
      // Full boost straight at the wall, then diagonally along it, then idle.
      const input = (st: SandboxState): SandboxInput => st.tick < 600 ? { forward: 1, yaw: Math.PI / 2, sprint }
        : st.tick < 1200 ? { forward: 1, yaw: Math.PI / 2 + 0.6, sprint } : {};
      for (let i = 0; i < 1800; i++) {
        stepSandbox(s, input(s), basin);
        assert.ok(s.position.x + r <= wall + 1e-6, `${id} ${sprint ? "boost" : "cruise"} crossed the wall at step ${i}: x ${s.position.x}`);
        assert.ok(basin.world.clearance(s.position, a.shape), `${id} overlaps rock at step ${i}`);
      }
      assert.ok(s.position.x + r > wall - 0.05, `${id} is pressed against the wall`);
    }
  }
});

test("collision: fast hulls racing along rock in a strong cross-flow slide, never pass, and the current never counts as an impact", () => {
  const { lab: basin, wall } = wallBasin();
  for (const id of HULLS) {
    const a = ACTORS[id];
    // Boost south along the wall while the flow presses it east into the wall.
    const s = initialSandbox(id, v(wall - a.shape.radius - 0.5, -20, -20));
    const { readouts } = run(s, basin, 12, () => ({ forward: 1, yaw: 0, sprint: true }));
    assert.ok(readouts.every(r => r.flowSpeed > 7) && s.position.x + a.shape.radius <= wall + 1e-6, id);
    assert.ok(s.position.z < -40, `${id} still made progress along the face (${s.position.z.toFixed(1)})`);
    // A flat hull pressed onto rock by the current alone takes no damage.
    const dead = initialSandbox(id, v(wall - a.shape.radius - 15, -20, -60));
    dead.charge = 0;
    run(dead, basin, 20, () => ({}));
    assert.equal(dead.health, 100, `${id}: drift is not an impact`);
    assert.ok(dead.position.x + a.shape.radius > wall - 0.05 && dead.position.x + a.shape.radius <= wall + 1e-6, `${id} drifted onto the wall`);
  }
});

// ------------------------------------------------------------------ station keeping costs power

test("station keeping holds a hull in a current for a power cost; letting go drifts for free", () => {
  const at = v(-20, -26, -150); // the always-on cliff race, 6.5 m/s
  for (const id of HULLS) {
    const a = ACTORS[id];
    const held = initialSandbox(id, at), calm = initialSandbox(id, v(150, -20, 30)), loose = initialSandbox(id, at);
    run(held, lab, 30, () => ({ hold: "station" }));
    run(calm, lab, 30, () => ({ hold: "station" }));
    run(loose, lab, 30, () => ({ hold: "off" }));
    const drift = 6.5 * exposure(a);
    if (drift <= a.cruise) assert.ok(distance(held.position, at) < 0.5, `${id} held station (${distance(held.position, at).toFixed(2)} m)`);
    const heldCost = 100 - held.charge, calmCost = 100 - calm.charge, looseCost = 100 - loose.charge;
    assert.ok(near(calmCost, 0.015 * 30, 1e-6), `${id} idle drain in calm water`);
    if (id === "hearthline") assert.ok(near(heldCost, calmCost, 1e-6), "the mooring anchor holds for free");
    else assert.ok(heldCost > calmCost * 3, `${id}: holding costs ${heldCost.toFixed(3)}% vs ${calmCost.toFixed(3)}% in calm water`);
    assert.ok(near(looseCost, calmCost, 1e-6), `${id}: drifting costs nothing extra`);
    assert.ok(loose.position.x > at.x + 10, `${id} drifted downstream when it let go`);
  }
});

test("the Creel's grapple holds against the current for less power than its thrusters", () => {
  const at = v(5, -26, -150), facingCliff = Math.PI / 2;
  const line = initialSandbox("creel", at), thrust = initialSandbox("creel", at);
  const fired = stepSandbox(line, { grapple: true, yaw: facingCliff }, lab);
  assert.match((fired.events.find(e => e.type === "grapple") as { message: string }).message, /Line fast/);
  const lineRun = run(line, lab, 30, () => ({ yaw: facingCliff }));
  run(thrust, lab, 30, () => ({ yaw: facingCliff, hold: "station" }));
  assert.ok(lineRun.readouts.every(r => r.hold === "grapple"));
  assert.ok(line.grapple && distance(line.position, line.grapple.anchor) <= line.grapple.length + 1e-6, "on the line");
  assert.ok(distance(line.position, at) < 1, "held in place");
  assert.ok(100 - line.charge < 100 - thrust.charge, `line ${(100 - line.charge).toFixed(3)}% < thrusters ${(100 - thrust.charge).toFixed(3)}%`);
});

// ------------------------------------------------------------------ the adverse case

test("adverse: a powerless diver pinned on rock at a strong current's edge escapes sideways or into the lee, never hurt", () => {
  const field = lab.field, r = ACTORS.diver.shape.radius;
  // Caught 2 m inside the race's north edge, pressed onto the cliff, with 20% air (36 s).
  const s = initialSandbox("diver", v(EDGE.cliffX - r - 3, -25, EDGE.flowMaxZ - 2));
  s.oxygen = 20;
  run(s, lab, 6, () => ({}));
  assert.ok(s.position.x > EDGE.cliffX - r - 0.05 && s.position.x <= EDGE.cliffX - r + 1e-6, "pinned on the cliff face, not through it");
  assert.equal(s.health, 100, "being pressed onto rock does no harm");
  // Sideways out of the flow: swim north (+Z, yaw π).
  const out = run(s, lab, 10, () => ({ forward: 1, yaw: Math.PI }), st => field.sample(st.position, st.tick).speed < 0.1);
  assert.ok(out.stoppedAt !== null && out.stoppedAt < 2, `out of the race in ${out.stoppedAt} s`);
  // And up to air with what is left.
  const up = run(s, lab, 30, () => ({ vertical: 1 }), st => st.position.y > -1);
  assert.ok(up.stoppedAt !== null && s.health === 100 && s.oxygen > 0, `surfaced with ${s.oxygen.toFixed(1)}% air`);

  // From the race's middle, the notch in the cliff is a lee: swim into it and rest.
  const mid = initialSandbox("diver", v(EDGE.cliffX - r - 1, -25, -150));
  mid.oxygen = 20;
  run(mid, lab, 3, () => ({}));
  const notch = (EDGE.notchZ[0] + EDGE.notchZ[1]) / 2;
  run(mid, lab, 4, st => toward(st, v(EDGE.cliffX + 2, -25, notch)), st => st.position.x > EDGE.cliffX + 0.5);
  run(mid, lab, 10, () => ({}));
  assert.ok(mid.position.x > EDGE.cliffX && field.sample(mid.position, mid.tick).speed < 0.05 * EDGE_RACE.strength,
    `resting in the lee at ${JSON.stringify(mid.position)}`);
  assert.equal(mid.health, 100);
});

test("adverse: from anywhere inside every lab current a powerless diver reaches still water within 25 s", () => {
  const field = lab.field, diver = ACTORS.diver;
  const tries: { label: string; input: (s: SandboxState) => SandboxInput }[] = [
    { label: "rest", input: () => ({}) },
    { label: "up", input: () => ({ vertical: 1 }) },
    { label: "north", input: () => ({ forward: 1, yaw: Math.PI }) },
    { label: "south", input: () => ({ forward: 1, yaw: 0 }) },
    { label: "east", input: () => ({ forward: 1, yaw: Math.PI / 2 }) },
    { label: "west", input: () => ({ forward: 1, yaw: -Math.PI / 2 }) },
  ];
  let worst = 0, checked = 0;
  for (const vol of LAB_VOLUMES) {
    const b = vol.shape.kind === "box"
      ? { min: v(vol.shape.center.x - vol.shape.half.x, vol.shape.center.y - vol.shape.half.y, vol.shape.center.z - vol.shape.half.z),
        max: v(vol.shape.center.x + vol.shape.half.x, vol.shape.center.y + vol.shape.half.y, vol.shape.center.z + vol.shape.half.z) }
      : { min: v(Math.min(vol.shape.a.x, vol.shape.b.x), vol.shape.a.y - 5, Math.min(vol.shape.a.z, vol.shape.b.z)),
        max: v(Math.max(vol.shape.a.x, vol.shape.b.x), vol.shape.a.y + 5, Math.max(vol.shape.a.z, vol.shape.b.z)) };
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (const fy of [0.15, 0.8]) {
      const p = v(b.min.x + (b.max.x - b.min.x) * (i + 0.5) / 4, Math.min(-1, b.min.y + (b.max.y - b.min.y) * fy), b.min.z + (b.max.z - b.min.z) * (j + 0.5) / 4);
      if (field.peak(p).speed < 0.5 || !lab.world.clearance(p, diver.shape) || p.y < -39) continue;
      checked++;
      let best = Infinity;
      for (const t of tries) {
        const s = initialSandbox("diver", p); // tick 0: the spill is surging
        const { stoppedAt } = run(s, lab, 25, t.input, st => field.sample(st.position, st.tick).speed < 0.5);
        assert.equal(s.health, 100);
        if (stoppedAt !== null) best = Math.min(best, stoppedAt);
      }
      assert.ok(best <= 25, `${vol.id}: no escape from ${JSON.stringify(p)}`);
      worst = Math.max(worst, best);
    }
  }
  assert.ok(checked >= 40, `${checked} start points`);
  assert.ok(worst <= 25, `worst escape ${worst} s`);
});

// ------------------------------------------------------------------ gates and alternatives

test("gates: every gated passage has an always-open alternative a diver can swim", () => {
  const diver = ACTORS.diver;
  for (const c of CANDIDATES) {
    assert.ok(c.alternative.length >= 2 && c.direct.length >= 2, c.id);
    assert.deepEqual(c.alternative[0], c.direct[0], `${c.id}: both ways start at the same place`);
    for (let i = 1; i < c.alternative.length; i++) {
      const a = c.alternative[i - 1]!, b = c.alternative[i]!, n = Math.ceil(distance(a, b) / 0.25);
      let p = a;
      for (let k = 1; k <= n; k++) {
        const q = v(a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n, a.z + (b.z - a.z) * k / n);
        const moved = lab.world.moveCapsule(p, v(q.x - p.x, q.y - p.y, q.z - p.z), diver.shape);
        assert.ok(!moved.hitSolid && distance(moved.position, q) < 1e-6, `${c.id}: alternative blocked near ${JSON.stringify(q)}`);
        // Never gated, whatever the cycle: no strong flow, no vent heat over a diver's tolerance, outside the pocket.
        assert.ok(lab.field.peak(q).speed < 0.5, `${c.id}: current on the alternative at ${JSON.stringify(q)}`);
        assert.ok(peakVentHeat(q) <= diver.heat, `${c.id}: heat on the alternative`);
        assert.ok(distance(q, WARDEN.den) > WARDEN.territory + 2, `${c.id}: the alternative enters the warden's pocket`);
        p = moved.position;
      }
    }
  }
});

/** Vent heat with the chimney venting. */
function peakVentHeat(p: Vec3): number {
  const venting = CYCLE_BY_ID.get(VENT_COLUMN.cycle)!.offset * 60 + 60; // 1 s into "active"
  return ventHeat(p, venting);
}

test("gates: the direct ways really are gated when closed and open when open", () => {
  // b: the spill. At surge no diver reaches the far window, even crabbing at full sprint; in the lull they cross.
  const b = CANDIDATES.find(c => c.id === "slack_current")!, far = b.direct[1]!, lull = 36 * 60;
  for (const sprint of [false, true]) for (const [tick, expect] of [[0, false], [lull, true]] as const) {
    const s = initialSandbox("diver", b.direct[0]!); s.tick = tick;
    const speed = sprint ? ACTORS.diver.boost : ACTORS.diver.cruise;
    const { stoppedAt } = run(s, lab, 20, st => crab(st, far, respondToFlow(lab.field.sample(st.position, st.tick).flow, ACTORS.diver, v(0, 0, 0), "none").drift, speed, { sprint }),
      st => st.position.z < far.z + 2);
    assert.equal(stoppedAt !== null, expect, `spill at tick ${tick}, sprint ${sprint}: ${JSON.stringify(s.position)}`);
    if (expect) assert.ok(stoppedAt! < SPILL_SLACK.phases.find(p => p.id === "lull")!.seconds, "the lull is long enough to cross");
    else assert.ok(s.position.z > GULLY.minZ - 4, "swept down the gully instead");
  }
  // a: the vent passage is over a diver's tolerance while venting and at baseline when quiet.
  const a = CANDIDATES.find(c => c.id === "vent_pulse")!, mid = v(186, -20, -85);
  assert.ok(peakVentHeat(mid) > 0.9 && ventHeat(mid, CYCLE_BY_ID.get(a.cycle)!.offset * 60 + 40 * 60) <= ACTORS.diver.heat);
  assert.ok(a.direct.every(p => peakVentHeat(p) === 0) && peakVentHeat(v(186, -20, -85)) > 0, "the direct way passes the column");
  // d: the warden shoos a diver from its pocket while home and is gone while feeding.
  const d = CANDIDATES.find(c => c.id === "migration")!, warden = CYCLE_BY_ID.get(d.cycle)!;
  const home = initialSandbox("diver", d.direct[0]!); home.tick = Math.round(warden.offset * 60);
  const homeRun = run(home, lab, 20, st => toward(st, WARDEN.node, { pick: st.tick % 30 === 0 }));
  assert.ok(homeRun.readouts.some(r => r.wardenShove) && home.picks.node === 0, "shooed away, nothing picked");
  const awayTick = Math.round((warden.offset + 45) * 60);
  assert.ok(distance(wardenAt(awayTick), WARDEN.den) > WARDEN.territory + 20);
  const visit = initialSandbox("diver", d.direct[0]!); visit.tick = awayTick;
  run(visit, lab, 20, st => toward(st, WARDEN.node, { pick: st.tick % 30 === 0 }));
  assert.ok(visit.picks.node >= 5 && visit.health === 100, `picked ${visit.picks.node} at the node while the warden fed`);
});

test("gates: each alternative costs extra travel but never more than a minute at diver cruise", () => {
  const len = (path: readonly Vec3[]) => path.slice(1).reduce((n, p, i) => n + distance(path[i]!, p), 0);
  for (const c of CANDIDATES) {
    const extra = (len(c.alternative) - len(c.direct)) / ACTORS.diver.cruise;
    assert.ok(extra > -30 && extra < 60, `${c.id}: alternative costs ${extra.toFixed(1)} s`);
    if (c.kind === "gate") assert.ok(extra > 5, `${c.id}: the gated way must be worth taking`);
  }
});

// ------------------------------------------------------------------ determinism across a save

test("determinism: a sandbox run saved and reloaded mid-way ends exactly like an unbroken run", () => {
  const script = (s: SandboxState): SandboxInput => {
    const t = s.tick;
    if (s.actor === "creel") return t < 900 ? toward(s, v(5, -26, -150)) : t === 900 ? { grapple: true, yaw: Math.PI / 2 } : t < 2400 ? { yaw: Math.PI / 2 } : { forward: 1, yaw: 0 };
    return t < 1500 ? toward(s, v(83, -24, -48)) : t < 3000 ? toward(s, v(186, -20, -100)) : { forward: 0.5, yaw: t / 400, vertical: Math.sin(t / 90), pick: t % 45 === 0 };
  };
  for (const actor of ["diver", "creel"] as const) {
    const start = actor === "diver" ? v(83, -24, -12) : v(-30, -26, -150);
    const whole = initialSandbox(actor, start);
    let last = null;
    for (let i = 0; i < 4200; i++) last = stepSandbox(whole, script(whole), lab);
    const first = initialSandbox(actor, start);
    for (let i = 0; i < 2137; i++) stepSandbox(first, script(first), lab);
    const restored = JSON.parse(JSON.stringify(first)) as SandboxState;
    let again = null;
    for (let i = 2137; i < 4200; i++) again = stepSandbox(restored, script(restored), lab);
    assert.deepEqual(restored, whole, actor);
    assert.deepEqual(again, last, `${actor} readout`);
    if (actor === "diver") assert.ok(Object.keys(whole.observations).length >= 1, "a cycle was watched across the save");
    else assert.ok(whole.grapple !== null && whole.charge < 100, "the line held across the save");
  }
});

// ------------------------------------------------------------------ the turbine stub

test("turbine stub: charges only while stopped and held in flow, saturates, stops at 80%, and nets little", () => {
  const base = { fitted: true, hold: "grapple" as const, speed: 0, flow: v(1, 0, 0), charge: 50, capacity: 1 };
  assert.ok(near(turbineRate(base), TURBINE.rate));
  assert.equal(turbineRate({ ...base, fitted: false }), 0);
  assert.equal(turbineRate({ ...base, hold: "station" }), 0, "thrusters cannot hold a turbine");
  assert.equal(turbineRate({ ...base, speed: 1 }), 0, "moving");
  assert.equal(turbineRate({ ...base, flow: v(0.3, 0, 0) }), 0, "too slack");
  assert.equal(turbineRate({ ...base, charge: 80 }), 0, "stops at 80%");
  assert.ok(near(turbineRate({ ...base, flow: v(6, 0, 0) }), TURBINE.rate * TURBINE.saturates), "saturates");
  assert.ok(near(turbineRate({ ...base, capacity: 2 }), TURBINE.rate / 2));
  // A grapple-held Creel in the cliff race gains, but slowly: 0 → 80% takes over 15 minutes parked.
  const net = turbineNet(ACTORS.creel, { ...base, flow: v(6.5, 0, 0) });
  assert.ok(net > 0 && 80 / net > 15 * 60, `net ${net.toFixed(4)} %/s`);
  const s = initialSandbox("creel", v(5, -26, -150)); s.turbine = true; s.charge = 40;
  stepSandbox(s, { grapple: true, yaw: Math.PI / 2 }, lab);
  run(s, lab, 60, () => ({ yaw: Math.PI / 2 }));
  assert.ok(s.charge > 40 && s.charge < 46, `charged to ${s.charge.toFixed(2)}% in a minute`);
});

test("lab content stays inside today's world bounds and clear of its own rock", () => {
  for (const solid of LAB_SOLIDS) assert.ok(solid.min.x >= -76 && solid.max.x <= 248 && solid.min.z >= -320 && solid.max.z <= 66, solid.id);
  for (const c of CANDIDATES) for (const p of [...c.direct, ...c.alternative, c.site])
    assert.ok(lab.world.clearance(p, ACTORS.diver.shape), `${c.id} point ${JSON.stringify(p)} is in rock`);
});
