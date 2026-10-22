import test from "node:test";
import assert from "node:assert/strict";
import { AMBIENT_KNOTS, REGION_LIGHT, ambientAt, ambientGlsl, depthLightAt, fogLightAt, regionLightAt, upLightAt,
  waterLightAt, type Rgb } from "../src/render/lighting/depthLight.js";
import { MAX_LIGHTS, LIGHT_RANGE, clusterEmissive, lightFromCluster, lightUniforms, selectLights,
  type PointLight } from "../src/render/lighting/localLights.js";
import { CREEL_WORK_EYE, EYE_RADIUS, clearEye, creelEye, eyeClear, playerView, workView } from "../src/render/camera.js";
import { CREEL_SEAT } from "../src/sim/fleet.js";
import { createWorldQueries, type Solid } from "../src/sim/world.js";
import { createGame } from "../src/sim/state.js";
import { completeOpening } from "../src/sim/progression.js";

const lum = (c: Rgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const near = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) <= eps;

test("depth light: the shallows keep full light, the deep falls to near-black", () => {
  for (const d of [0, 5, 10, 20]) assert.equal(ambientAt(d), 1, `${d} m keeps the shallows' look`);
  let previous = 1;
  for (let d = 0; d <= 1000; d += 5) {
    const a = ambientAt(d);
    assert.ok(a <= previous + 1e-12, `never brighter going down (${d} m)`);
    assert.ok(a > 0, `never pure black (${d} m)`);
    previous = a;
  }
  assert.ok(ambientAt(200) < 0.25, "below 200 m the lamp is the main light");
  assert.ok(ambientAt(250) < 0.101, "near-black beyond about 250 m");
  assert.ok(ambientAt(395) < 0.04 && ambientAt(590) < 0.025);
  for (const [d, l] of AMBIENT_KNOTS) assert.ok(near(ambientAt(d), l, 1e-12), `knot ${d} m`);
});

test("depth light: the GLSL curve is generated from the same knots", () => {
  const glsl = ambientGlsl();
  // Re-evaluate every generated segment and compare with the CPU curve.
  const segments = [...glsl.matchAll(/if\(depth<([\d.]+)\)return exp\(mix\((-?[\d.]+),(-?[\d.]+),\(depth-([\d.]+)\)\/([\d.]+)\)\);/g)];
  assert.equal(segments.length, AMBIENT_KNOTS.length - 1);
  for (const m of segments) {
    const [end, a, b, start, span] = [m[1], m[2], m[3], m[4], m[5]].map(Number) as [number, number, number, number, number];
    assert.ok(near(start + span, end, 1e-6));
    for (const t of [0, 0.25, 0.5, 0.9]) {
      const depth = start + span * t;
      assert.ok(near(Math.exp(a + (b - a) * t), ambientAt(depth), 2e-6), `GLSL equals CPU at ${depth} m`);
    }
  }
});

test("depth light: each region keeps its palette in the dark", () => {
  const at = (region: keyof typeof REGION_LIGHT, depth: number): Rgb => {
    const r = REGION_LIGHT[region];
    return depthLightAt(depth, { tint: [parseInt(r.tint.slice(1, 3), 16) / 255, parseInt(r.tint.slice(3, 5), 16) / 255,
      parseInt(r.tint.slice(5, 7), 16) / 255], gain: r.gain });
  };
  for (const region of Object.keys(REGION_LIGHT) as (keyof typeof REGION_LIGHT)[])
    assert.deepEqual(at(region, 10), [1, 1, 1], `${region}: shallows untinted`);
  const basin = at("silt_basin", 240), divide = at("brine_divide", 395), meridian = at("deep_district", 590);
  const canopy = at("suspended_garden", 120), rift = at("thermal_rift", 300);
  assert.ok(basin[1] > basin[2] && basin[1] > basin[0] * 0.95, "Basin silt-green");
  assert.ok(canopy[1] > canopy[0] && canopy[2] > canopy[0], "Canopy teal");
  assert.ok(rift[0] > rift[2], "Rift bone (warm)");
  assert.ok(divide[2] > divide[0], "Divide slate (cold)");
  assert.ok(lum(basin) > lum(at("brine_divide", 240)), "silt scatters: the Basin is brighter than clear brine at the same depth");
  assert.ok(lum(divide) < 0.035 && lum(meridian) < 0.025, "the Divide and Meridian are near-black off the lamp");
});

test("depth light: the water darkens slower than surfaces, and the way up always glows", () => {
  for (const d of [0, 10, 20]) assert.equal(fogLightAt(d), 1, `${d} m fog unchanged`);
  for (const d of [60, 150, 250, 400, 600]) {
    assert.ok(fogLightAt(d) > ambientAt(d), `${d} m: near rock reads as a silhouette against the water`);
    assert.ok(upLightAt(d) > fogLightAt(d), `${d} m: brighter overhead`);
  }
  // Reef at 10 m: the region optics' water passes through unchanged.
  const reef = waterLightAt(0, -10, 10, [0.137, 0.494, 0.537], 0.0105);
  assert.deepEqual(reef.fog, [0.137, 0.494, 0.537]);
  assert.equal(reef.density, 0.0105);
  assert.equal(reef.up[3], 0, "no gradient in the shallows");
  assert.ok(reef.rays > 0.9, "god rays near the surface");
  // Divide at 395 m with the lamp off: dark water, a visible way up.
  const divide = waterLightAt(600, -395, -1150, [0.125, 0.239, 0.361], 0.0055);
  const up: Rgb = [divide.up[0], divide.up[1], divide.up[2]];
  assert.ok(lum(divide.fog) < 0.05, `deep water is dark (${lum(divide.fog).toFixed(3)})`);
  assert.ok(lum(up) > lum(divide.fog) * 1.8 && divide.up[3] === 1, "the surface glow overhead stays readable");
  assert.ok(divide.density > 0.0055 * 1.5, "fog tightens with depth");
  assert.equal(divide.rays, 0);
  // Ember Rift: looking down the trench glows warm.
  const rift = waterLightAt(150, -300, -640, [0.18, 0.2, 0.22], 0.0075);
  assert.ok(rift.down[0] > rift.down[2] * 2 && lum([rift.down[0], rift.down[1], rift.down[2]]) > lum(rift.fog), "the Rift glows below");
});

test("depth light: region blending never steps across a border", () => {
  // Basin -> Rift border at z = -640 near x 150, and Divide -> Meridian at x = 960.
  for (const [x0, z0, dx, dz] of [[150, -560, 0, -1], [900, -1300, 1, 0]] as const) {
    let prev = regionLightAt(x0, z0);
    for (let i = 1; i <= 160; i++) {
      const next = regionLightAt(x0 + dx * i, z0 + dz * i);
      for (let c = 0; c < 3; c++) assert.ok(Math.abs(next.tint[c]! - prev.tint[c]!) < 0.025, `tint step at ${i}`);
      assert.ok(Math.abs(next.gain - prev.gain) < 0.08);
      prev = next;
    }
  }
});

test("local lights: unlit art clusters into lights, plain art never does", () => {
  // Two unlit quads 10 m apart, one faint shard, one plain box.
  const positions = [0, 0, 0, 0.5, 0, 0, 0, 0.5, 0, 10, 0, 0, 10.4, 0.2, 0, 20, 0, 0, 20, 1, 0, 30, 0, 0];
  const colors = [1, .9, .6, -1, 1, .9, .6, -1, 1, .9, .6, -1, .6, .9, 1, -1, .6, .9, 1, -1, .7, .8, .9, -0.3, .7, .8, .9, -0.3, .5, .5, .5, 1];
  const clusters = clusterEmissive(positions, colors);
  assert.equal(clusters.length, 3);
  const warm = clusters.find(c => c.x < 1)!, cold = clusters.find(c => c.x > 9 && c.x < 11)!, faint = clusters.find(c => c.faint)!;
  assert.ok(near(warm.x, 1 / 6) && near(warm.extent, 0.5) && warm.r > warm.b);
  assert.ok(cold.b > cold.r && !cold.faint);
  assert.ok(faint.x === 20 && near(faint.extent, 1));
  const lantern = lightFromCluster({ ...warm, extent: 0.8 }), eye = lightFromCluster({ ...warm, extent: 0.05 });
  assert.ok(lantern.radius > eye.radius && lantern.strength > eye.strength * 2, "a lantern lights more than a creature's eye");
  assert.ok(lightFromCluster(faint).strength < lightFromCluster({ ...faint, faint: false }).strength, "faint art is a faint light");
  assert.ok(lightFromCluster(warm, true).strength < lightFromCluster(warm).strength, "art on a moving hull lights gently");
});

test("local lights: reserved first, best of the rest, never past range", () => {
  const at = (x: number, extra: Partial<PointLight> = {}): PointLight => ({ x, y: 0, z: 0, radius: 6, r: 1, g: 1, b: 1, strength: 1, ...extra });
  const many = Array.from({ length: 40 }, (_, i) => at(5 + i * 5));
  const reserved = at(500, { reserved: true });
  const chosen = selectLights([...many, reserved, at(LIGHT_RANGE + 50)], { x: 0, y: 0, z: 0 });
  assert.equal(chosen.length, MAX_LIGHTS);
  assert.equal(chosen[0], reserved, "a reserved light (marker, instruments) is always sent");
  assert.deepEqual(chosen.slice(1).map(l => l.x), many.slice(0, MAX_LIGHTS - 1).map(l => l.x), "nearest lights next");
  const far = selectLights([at(LIGHT_RANGE + 7)], { x: 0, y: 0, z: 0 });
  assert.equal(far.length, 0, "beyond range: not sent");
  const edge = selectLights([at(LIGHT_RANGE * 0.95)], { x: 0, y: 0, z: 0 })[0]!;
  assert.ok(edge.strength < 1 && edge.strength > 0, "fades near the range edge instead of popping");
  const u = lightUniforms(chosen);
  assert.equal(u.count, MAX_LIGHTS);
  assert.equal(u.position.length, MAX_LIGHTS * 4);
  assert.deepEqual(u.position.slice(0, 4), [500, 0, 0, 6]);
});

test("camera: pitching down to work the Creel arm slides the eye over the bow, through the window opening", () => {
  assert.equal(workView(0), 0);
  assert.equal(workView(-0.3), 0, "ordinary flying keeps the seat");
  assert.equal(workView(-1.24), 1, "the audit's -71 degree arm pitch is the full work view");
  assert.deepEqual(creelEye(0), CREEL_SEAT);
  assert.deepEqual(creelEye(-1.24), CREEL_WORK_EYE);
  assert.ok(CREEL_WORK_EYE.z < -2.95, "ahead of the bow face");
  // Where the path crosses the forward wall (z -2.75) it is inside the opening
  // (x within 0.95, y 1.71..2.45), never through porcelain.
  for (let p = -0.3; p >= -1.3; p -= 0.002) {
    const e = creelEye(p);
    if (Math.abs(e.z + 2.75) < 0.02) assert.ok(Math.abs(e.x) < 0.95 && e.y > 1.71 + 0.07 && e.y < 2.45 - 0.07, `crosses in the opening at ${e.y.toFixed(2)}`);
  }
});

test("camera: the eye never rests inside a solid or under the floor", () => {
  // The audit's case: a thin cradle rail; the diver's eye ended up inside it.
  const rail: Solid = { id: "rail", min: { x: 15.4, y: -2.5, z: -26 }, max: { x: 15.7, y: 0.5, z: -18 } };
  const world = createWorldQueries([rail], () => -4);
  const inside = { x: 15.55, y: -1.35, z: -22 };
  assert.equal(eyeClear(world, inside), false);
  const out = clearEye(world, inside);
  assert.ok(eyeClear(world, out), "stepped out of the rail");
  assert.ok(Math.hypot(out.x - inside.x, out.y - inside.y, out.z - inside.z) <= 0.5, "by the shortest way");
  // From a clear anchor the eye stops short of the wall.
  const stopped = clearEye(world, { x: 15.45, y: -1, z: -22 }, { x: 14.8, y: -1, z: -22 });
  assert.ok(stopped.x <= 15.4 - EYE_RADIUS + 1e-3 && stopped.x > 15.1 && eyeClear(world, stopped));
  // Under the floor: lifted.
  const lifted = clearEye(world, { x: 0, y: -4.05, z: 0 }, { x: 0, y: -3, z: 0 });
  assert.ok(lifted.y - EYE_RADIUS >= -4.02 && eyeClear(world, lifted));
  // Open water: unchanged.
  const free = { x: 0, y: -2, z: 0 };
  assert.deepEqual(clearEye(world, free), free);
});

test("camera: a diver's view is the pose eye in open water, and the lamp sits at the eye", () => {
  const state = createGame();
  completeOpening(state);
  state.player.mode = "swimming";
  state.player.pose.position = { x: -200, y: -20, z: 60 };
  state.player.pose.yaw = 0; state.player.pose.pitch = 0;
  const world = createWorldQueries([], () => -60);
  const v = playerView(state, null, world, { x: 0, y: 1, z: 0 });
  assert.ok(near(v.eye.y, -20 + 0.65) && v.eye.x === -200 && v.work === 0);
  assert.ok(near(v.forward.z, -1) && v.lamp.z < v.eye.z && Math.abs(v.lamp.z - v.eye.z) < 0.3);
});
