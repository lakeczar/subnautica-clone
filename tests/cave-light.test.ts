import test from "node:test";
import assert from "node:assert/strict";
import type { Solid } from "../src/sim/world.js";
import type { Vec3 } from "../src/sim/types.js";
import { caveDaylight, LAMP_SKIN, lampVisible, sampleLightField } from "../src/render/caves/lightField.js";
import { CAVE_ANCHORS, injectCaveLight } from "../src/render/caves/caveLight.js";
import { CLEAR, R1_LEAKS } from "./cave-light-controls.js";
import { def, fine, roomAt, world, worldWith } from "./cave-support.js";
import { field, head, retreat, retreatStarts } from "./cave-light-retreat-support.js";

const seen = (p: Vec3): number => { const c = sampleLightField(field, p); return caveDaylight(c.r, c.g, c.a); };
/** Parameter ranges of segment a->b inside collision rock (union of solids). */
function rockRanges(a: Vec3, b: Vec3, solids: readonly Solid[] = def.rock): [number, number][] {
  const ranges: [number, number][] = [];
  const lo = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) }, hi = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) };
  for (const s of solids) {
    if (s.max.x < lo.x || s.min.x > hi.x || s.max.y < lo.y || s.min.y > hi.y || s.max.z < lo.z || s.min.z > hi.z) continue;
    let t0 = 0, t1 = 1;
    for (const k of ["x", "y", "z"] as const) {
      const d = b[k] - a[k];
      if (Math.abs(d) < 1e-12) { if (a[k] <= s.min[k] || a[k] >= s.max[k]) { t1 = -1; break; } continue; }
      const u = (s.min[k] - a[k]) / d, w = (s.max[k] - a[k]) / d;
      t0 = Math.max(t0, Math.min(u, w)); t1 = Math.min(t1, Math.max(u, w));
    }
    if (t0 < t1) ranges.push([t0, t1]);
  }
  return ranges;
}
/** The most surface skin a lamp ray may ignore, pinned here and NOT read
 * from the implementation (R2-05): the shell lies at most 0.35 m inside its
 * rock and the ray starts 0.3 m off the surface, so 0.5 m covers it. */
const MAX_SKIN = 0.5;

test("cave light: dark inside by path length from the openings, lit at the mouths and in the skylight beam", () => {
  const vault = def.rooms.find(r => r.id === "fanvault.vault")!, pocket = def.rooms.find(r => r.role === "pocket")!;
  const middle = (r: typeof vault): Vec3 => ({ x: (r.bounds.min.x + r.bounds.max.x) / 2, y: r.bounds.min.y + 1.5, z: (r.bounds.min.z + r.bounds.max.z) / 2 });
  assert.equal(seen({ x: -270, y: -15, z: -30 }), 1, "open water is fully lit");
  for (const m of def.portals.filter(p => p.kind === "mouth"))
    assert.ok(seen({ x: m.center.x - m.normal.x, y: m.center.y, z: m.center.z - m.normal.z }) > 0.6, `${m.id} is dark`);
  const deep = seen({ x: pocket.bounds.min.x + 2, y: pocket.bounds.min.y + 1.2, z: (pocket.bounds.min.z + pocket.bounds.max.z) / 2 });
  assert.ok(deep < 0.25, `the pocket is lit at ${deep.toFixed(2)}`);
  // The skylight's beam reaches the vault floor: a pool of full daylight.
  let beam = 0;
  for (let x = vault.bounds.min.x; x < vault.bounds.max.x; x += 0.5) for (let z = vault.bounds.min.z; z < vault.bounds.max.z; z += 0.5) {
    const c = sampleLightField(field, { x, y: vault.bounds.min.y + 0.6, z });
    if (c.a > 0.5 && c.g > 0.6) beam++;
  }
  assert.ok(beam >= 8, `${beam} beam cells on the vault floor`);
  assert.ok(seen(middle(vault)) < 0.8, "the vault is not darker than open water");
});

test("lamp: no ray through collision rock lights a surface; clear mouth and skylight rays do", () => {
  // Every shell vertex (sampled) lit from every route head pose in range,
  // as the shader does it: start 0.3 m off the surface, skip the skin.
  const m = fine, lamps = def.routes.flatMap(r => r.path).map(head).filter(p => roomAt(p) !== "");
  let throughRock = 0, open = 0, openLit = 0;
  for (let v = 0; v < m.positions.length / 3; v += 7) {
    const n = { x: m.normals[v * 3]!, y: m.normals[v * 3 + 1]!, z: m.normals[v * 3 + 2]! };
    const p = { x: m.positions[v * 3]! + n.x * 0.3, y: m.positions[v * 3 + 1]! + n.y * 0.3, z: m.positions[v * 3 + 2]! + n.z * 0.3 };
    if (roomAt(p) === "") continue;
    for (const lamp of lamps) {
      const d = { x: lamp.x - p.x, y: lamp.y - p.y, z: lamp.z - p.z }, len = Math.hypot(d.x, d.y, d.z);
      if (len > 22 || len < 0.5 || n.x * d.x + n.y * d.y + n.z * d.z <= 0) continue;
      const skip = MAX_SKIN / len, rock = rockRanges(p, lamp).filter(([a, b]) => b > skip + 1e-6 && (b - Math.max(a, skip)) * len > 0.02);
      const lit = lampVisible(field.rock, p, lamp);
      if (rock.length) { throughRock++; assert.equal(lit, false, `lamp at ${JSON.stringify(lamp)} lights ${JSON.stringify(p)} through rock`); }
      else if (rockRanges(p, lamp).every(([, b]) => b <= skip)) { open++; if (lit) openLit++; }
    }
  }
  assert.ok(throughRock > 2000, `${throughRock} rays cross rock`);
  assert.ok(openLit >= open * 0.98, `${open - openLit} of ${open} open rays blocked`);
  // R1's twelve shell-obstructed rays, each still crossing at least 1 m of rock.
  assert.ok(LAMP_SKIN <= MAX_SKIN, `the lamp skips ${LAMP_SKIN} m of rock, more than ${MAX_SKIN}`);
  // R2's control: rock that starts past the skin and ends before 2.5 m.
  {
    const p = { x: -284.432239, y: -19.577581, z: -49.374072 }, lamp = { x: -291, y: -23.2, z: -65 };
    const len = Math.hypot(lamp.x - p.x, lamp.y - p.y, lamp.z - p.z), first = rockRanges(p, lamp).sort((u, w) => u[0] - w[0])[0]!;
    assert.ok(first[0] * len > MAX_SKIN && first[1] * len < 2.5, `fixture: rock from ${first[0] * len} to ${first[1] * len} m`);
    assert.equal(lampVisible(field.rock, p, lamp), false, "near rock past the skin must block");
  }
  for (const [p, lamp] of R1_LEAKS) {
    const a = { x: p[0], y: p[1], z: p[2] }, b = { x: lamp[0], y: lamp[1], z: lamp[2] }, len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    assert.ok(Math.max(0, ...rockRanges(a, b).map(([u, w]) => (w - u) * len)) > 1, "fixture: the R1 ray still crosses rock");
    assert.equal(lampVisible(field.rock, a, b), false, `R1 ray from ${p} still lit`);
  }
  // Positive controls: lamps in the passages light the seabed outside the
  // mouths through the openings, and the shaft through the skylight.
  for (const [lamp, targets] of CLEAR) for (const t of targets)
    assert.equal(lampVisible(field.rock, lamp, t), true, `clear ray ${JSON.stringify(lamp)} -> ${JSON.stringify(t)} blocked`);
});

test("adverse: lamp off, a diver anywhere on the routes swims the glow out through a mouth or the skylight", () => {
  assert.ok(retreatStarts.length >= 30, `${retreatStarts.length} starts`);
  const { failures, exits, hops } = retreat(world, retreatStarts);
  assert.deepEqual(failures, []);
  assert.ok(hops > retreatStarts.length, "the retreat is a swim of several hops, not a jump");
  assert.ok(Object.keys(exits).length >= 2, `exits used: ${JSON.stringify(exits)}`);
});

test("cave light splice: anchors are required once each", () => {
  const fragment = `void main(){\n  vec3 n=normalize(vNormal); float d=dot(n,normalize(lightDirection));\n` +
    `  float sky=smoothstep(.3,.9,n.y)*(1.0-smoothstep(-.8,-.1,vWorld.y))*underwater;\n` +
    `  shade=mix(shade,vColor.rgb*1.12,step(vColor.a,-.5));\n  gl_FragColor=vec4(opticalFog(shade,vWorld),1.0);\n}`;
  const out = injectCaveLight(fragment);
  assert.match(out, /caveFog\(shade,vWorld,cave\)/);
  assert.match(out, /shade=caveShade\(shade,n,cave\);\s*shade=mix/);
  assert.ok(out.indexOf("vec4 cave=caveFace") < out.indexOf("sky*=mix"));
  for (const anchor of CAVE_ANCHORS) assert.throws(() => injectCaveLight(fragment.replace(anchor, "")), /anchor missing/);
  assert.throws(() => injectCaveLight(fragment + "\nvoid main(){"), /anchor repeated/);
});

test("smoke: with every opening plugged, the retreat from every 12th start fails", () => {
  // Every start: tests/cave-light-retreat.heavy.test.ts (TT-1).
  const plugs = def.portals.filter(o => o.kind === "mouth" || o.kind === "skylight").map((o, i) => {
    const w = o.clear.width / 2 + 2, h = o.clear.height / 2 + 2, t = 1;
    const half = o.normal.y !== 0 ? { x: w, y: t, z: h } : o.normal.z !== 0 ? { x: w, y: h, z: t } : { x: t, y: h, z: w };
    return { id: `test.plug.${i}`, min: { x: o.center.x - half.x, y: o.center.y - half.y, z: o.center.z - half.z },
      max: { x: o.center.x + half.x, y: o.center.y + half.y, z: o.center.z + half.z } };
  });
  const starts = retreatStarts.filter((_, i) => i % 12 === 0);
  const { failures } = retreat(worldWith(plugs), starts);
  assert.ok(failures.length >= starts.length * 0.9, `${failures.length} of ${starts.length} still escaped a sealed cave`);
});
