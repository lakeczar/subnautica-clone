import test from "node:test";
import assert from "node:assert/strict";
import { caveVolume } from "../src/content/regions/caveGeometry.js";
import { worldFloor } from "../src/content/regions/worldFloor.js";
import type { Solid } from "../src/sim/world.js";
import type { Vec3, WorldQueries } from "../src/sim/types.js";
import { caveDaylight, caveLightField, LAMP_SKIN, lampVisible, sampleLightField, type CaveLightField } from "../src/render/caves/lightField.js";
import { CAVE_ANCHORS, injectCaveLight } from "../src/render/caves/caveLight.js";
import { CLEAR, R1_LEAKS } from "./cave-light-controls.js";
import { def, DIVER, fine, insideFootprint, roomAt, shift, SHIFT, world, worldWith } from "./cave-support.js";

const field: CaveLightField = caveLightField(def, worldFloor);
const seen = (p: Vec3): number => { const c = sampleLightField(field, p); return caveDaylight(c.r, c.g, c.a); };
/** The glow a diver reads with the lamp off: path-length daylight only. A
 * sun pool also reads 1, so it guides nothing (R1-01). */
const glow = (p: Vec3): number => { const c = sampleLightField(field, p); return caveDaylight(c.r, 0, c.a); };
/** Open water between two points: the fine voxels along it are not rock. */
function clearSight(a: Vec3, b: Vec3): boolean {
  const v = caveVolume(def), g = v.grid, steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 0.25);
  for (let s = 1; s < steps; s++) {
    const t = s / steps, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
    const i = Math.floor((x - g.origin.x) / g.voxel), j = Math.floor((y - g.origin.y) / g.voxel), k = Math.floor((z - g.origin.z) / g.voxel);
    if (i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz) continue;
    if (v.solid[i + g.nx * (j + g.ny * k)]) return false;
  }
  return true;
}
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
const head = (p: Vec3): Vec3 => ({ ...p, y: p.y + 0.6 });

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
      const skip = LAMP_SKIN / len, rock = rockRanges(p, lamp).filter(([a, b]) => b > skip + 1e-6 && (b - Math.max(a, skip)) * len > 0.02);
      const lit = lampVisible(field.rock, p, lamp);
      if (rock.length) { throughRock++; assert.equal(lit, false, `lamp at ${JSON.stringify(lamp)} lights ${JSON.stringify(p)} through rock`); }
      else if (rockRanges(p, lamp).every(([, b]) => b <= skip)) { open++; if (lit) openLit++; }
    }
  }
  assert.ok(throughRock > 2000, `${throughRock} rays cross rock`);
  assert.ok(openLit >= open * 0.98, `${open - openLit} of ${open} open rays blocked`);
  // R1's twelve shell-obstructed rays, each still crossing at least 1 m of rock.
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

/** The lamp-off retreat. The policy uses only what an unlit diver sees: from
 * the current pose, among water in clear sight within 7 m whose glow is
 * brighter, take the brightest one the full diver can actually reach: the
 * destination must clear and the sweep from the last accepted pose must
 * arrive. Success is clear exterior water entered through a mouth or the
 * skylight. Returns each start's outcome. */
function retreat(q: WorldQueries, starts: readonly Vec3[]): { failures: string[]; exits: Record<string, number>; hops: number } {
  const exterior = (p: Vec3): boolean => roomAt(p) === "" && roomAt(head(p)) === "" && roomAt({ ...p, y: p.y + 0.95 }) === "";
  const rank = (p: Vec3): number => glow(head(p)) + (exterior(p) ? 0.01 : 0); // open water outside tops a lit pool inside
  const v = caveVolume(def), g = v.grid, spots: { p: Vec3; rank: number }[] = [];
  for (let k = 0; k < g.nz; k += 2) for (let j = 0; j < g.ny; j += 2) for (let i = 0; i < g.nx; i += 2) {
    if (v.solid[i + g.nx * (j + g.ny * k)]) continue;
    const p = { x: g.origin.x + (i + 0.5) * g.voxel, y: g.origin.y + (j + 0.5) * g.voxel, z: g.origin.z + (k + 0.5) * g.voxel };
    if (q.clearance(shift(p), DIVER)) spots.push({ p, rank: rank(p) });
  }
  const openings = def.portals.filter(o => o.kind === "mouth" || o.kind === "skylight");
  const openingOf = (a: Vec3, b: Vec3): string | null => {
    for (let s = 0; s <= 40; s++) {
      const t = s / 40, w = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
      if (roomAt(w) !== "") continue;
      return openings.find(o => {
        const along = (w.x - o.center.x) * o.normal.x + (w.y - o.center.y) * o.normal.y + (w.z - o.center.z) * o.normal.z;
        const off = { x: w.x - o.center.x - o.normal.x * along, y: w.y - o.center.y - o.normal.y * along, z: w.z - o.center.z - o.normal.z * along };
        return Math.abs(along) < 3 && Math.hypot(off.x, off.y, off.z) < Math.hypot(o.clear.width, o.clear.height) / 2 + 1.5;
      })?.id ?? null;
    }
    return null;
  };
  const failures: string[] = [], exits: Record<string, number> = {};
  let hops = 0;
  for (const start of starts) {
    if (!q.clearance(shift(start), DIVER)) { failures.push(`start ${JSON.stringify(start)} is not a diver pose`); continue; }
    let at = start, exit: string | null = null, lost: string | null = null;
    for (let hop = 0; !exterior(at); hop++) {
      if (hop >= 25) { lost = `lost from ${JSON.stringify(start)} at ${JSON.stringify(at)}`; break; }
      const here = rank(at);
      const options = spots.filter(o => o.rank > here + 1e-3 && Math.hypot(o.p.x - at.x, o.p.y - at.y, o.p.z - at.z) <= 7)
        .sort((x, y) => y.rank - x.rank || Math.hypot(x.p.x - at.x, x.p.z - at.z) - Math.hypot(y.p.x - at.x, y.p.z - at.z));
      let next: Vec3 | null = null;
      for (const o of options) {
        if (!clearSight(head(at), head(o.p))) continue;
        const r = q.moveCapsule(shift(at), { x: o.p.x - at.x, y: o.p.y - at.y, z: o.p.z - at.z }, DIVER);
        if (r.hitSolid || r.hitBoundary || Math.hypot(r.position.x - SHIFT.x - o.p.x, r.position.y - o.p.y, r.position.z - SHIFT.z - o.p.z) > 1e-6) continue;
        next = o.p; break;
      }
      if (!next) { lost = `no brighter water a diver can reach from ${JSON.stringify(at)} (glow ${here.toFixed(2)})`; break; }
      if (exterior(next)) exit = openingOf(at, next);
      at = next; hops++;
    }
    if (lost) failures.push(lost);
    else if (!exit) failures.push(`left ${JSON.stringify(start)} without passing a mouth or the skylight`);
    else if (!q.clearance(shift(at), DIVER) || glow(head(at)) !== 1) failures.push(`arrival ${JSON.stringify(at)} is not clear lit water`);
    else exits[exit] = (exits[exit] ?? 0) + 1;
  }
  return { failures, exits, hops };
}
/** Every metre along both routes, inside the cave. */
const retreatStarts: Vec3[] = def.routes.flatMap(r => r.path.slice(1).flatMap((b, i) => {
  const a = r.path[i]!, n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  return Array.from({ length: n }, (_, s) => ({ x: a.x + (b.x - a.x) * s / n, y: a.y + (b.y - a.y) * s / n, z: a.z + (b.z - a.z) * s / n }));
})).filter(p => insideFootprint(p) && roomAt(head(p)) !== "");

test("adverse: lamp off, a diver anywhere on the routes swims the glow out through a mouth or the skylight", () => {
  assert.ok(retreatStarts.length >= 30, `${retreatStarts.length} starts`);
  const { failures, exits, hops } = retreat(world, retreatStarts);
  assert.deepEqual(failures, []);
  assert.ok(hops > retreatStarts.length, "the retreat is a swim of several hops, not a jump");
  assert.ok(Object.keys(exits).length >= 2, `exits used: ${JSON.stringify(exits)}`);
});

test("negative control: with every opening plugged the same retreat fails", () => {
  const plugs = def.portals.filter(o => o.kind === "mouth" || o.kind === "skylight").map((o, i) => {
    const w = o.clear.width / 2 + 2, h = o.clear.height / 2 + 2, t = 1;
    const half = o.normal.y !== 0 ? { x: w, y: t, z: h } : o.normal.z !== 0 ? { x: w, y: h, z: t } : { x: t, y: h, z: w };
    return { id: `test.plug.${i}`, min: { x: o.center.x - half.x, y: o.center.y - half.y, z: o.center.z - half.z },
      max: { x: o.center.x + half.x, y: o.center.y + half.y, z: o.center.z + half.z } };
  });
  const { failures } = retreat(worldWith(plugs), retreatStarts);
  assert.ok(failures.length >= retreatStarts.length * 0.9, `${failures.length} of ${retreatStarts.length} still escaped a sealed cave`);
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

