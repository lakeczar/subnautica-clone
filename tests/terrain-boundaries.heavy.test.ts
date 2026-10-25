import test from "node:test";
import assert from "node:assert/strict";
import { createTerrainSurface, TERRAIN_EXTENT } from "../src/render/terrainSurface.js";
import { terrainHeight, createWorldQueries } from "../src/sim/world.js";
import { BASIN_GEOMETRY, CANOPY_BASIN_ROUTE } from "../src/content/routes.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { aimRay } from "../src/sim/targeting.js";
import { readyState } from "./targeting-support.js";

/** Submitted float32 triangles, not the generator's double precision samples. */
function submittedSurface() {
  const data = createTerrainSurface(), p = Float32Array.from(data.positions), ix = data.indices;
  const bins = new Map<string, number[]>();
  for (let i = 0; i < ix.length; i += 3) {
    const vertices = ix.slice(i, i + 3).map(v => v * 3);
    const xs = vertices.map(v => p[v]!), zs = vertices.map(v => p[v + 2]!);
    for (let x = Math.floor(Math.min(...xs)); x <= Math.floor(Math.max(...xs)); x++)
      for (let z = Math.floor(Math.min(...zs)); z <= Math.floor(Math.max(...zs)); z++) {
        const key = `${x},${z}`;
        if (!bins.has(key)) bins.set(key, []);
        bins.get(key)!.push(i);
      }
  }
  return { p, ix, height(x: number, z: number): number | null {
    for (const i of bins.get(`${Math.floor(x)},${Math.floor(z)}`) ?? []) {
      const [a, b, c] = ix.slice(i, i + 3).map(v => v * 3) as [number, number, number];
      const d = (p[b + 2]! - p[c + 2]!) * (p[a]! - p[c]!) + (p[c]! - p[b]!) * (p[a + 2]! - p[c + 2]!);
      if (Math.abs(d) < 1e-12) continue; // A vertical join has no XZ area.
      const u = ((p[b + 2]! - p[c + 2]!) * (x - p[c]!) + (p[c]! - p[b]!) * (z - p[c + 2]!)) / d;
      const v = ((p[c + 2]! - p[a + 2]!) * (x - p[c]!) + (p[a]! - p[c]!) * (z - p[c + 2]!)) / d;
      if (u >= -1e-8 && v >= -1e-8 && u + v <= 1 + 1e-8)
        return u * p[a + 1]! + v * p[b + 1]! + (1 - u - v) * p[c + 1]!;
    }
    return null;
  } };
}
let cached: ReturnType<typeof submittedSurface> | undefined;
const submitted = (): ReturnType<typeof submittedSurface> => cached ??= submittedSurface();

test("submitted terrain fixes both signs of the rescue, Basin and smooth Canopy floor regressions", () => {
  const mesh = submitted();
  for (const [x, z] of [[53.325, -60], [54.15, -59.5], [173.125, -211.75], [96.8965517, -98.2241379],
    [101.4193548, -101.9516129], [93.5, -95.1875]]) {
    const h = mesh.height(x!, z!);
    assert.notEqual(h, null);
    assert.ok(Math.abs(h! - terrainHeight(x!, z!)) <= .1, `${x},${z}: rendered minus physical ${h! - terrainHeight(x!, z!)}`);
  }
});

test("closed bench/pad tops, all exterior sides and corners follow the correct one-sided physical heights", () => {
  const mesh = submitted();
  const pads = [{ minX: 38, maxX: 54, minZ: -60, maxZ: -48 }, ...BASIN_GEOMETRY.terrainPads];
  const check = (x: number, z: number): void => {
    const h = mesh.height(x, z);
    assert.notEqual(h, null, `no floor gap at ${x},${z}`);
    assert.ok(Math.abs(h! - terrainHeight(x, z)) <= .1, `one-sided error at ${x},${z}: ${h! - terrainHeight(x, z)}`);
  };
  for (const pad of pads) {
    for (let n = 0; n <= 128; n++) {
      const x = pad.minX + (pad.maxX - pad.minX) * n / 128;
      const z = pad.minZ + (pad.maxZ - pad.minZ) * n / 128;
      for (const delta of [-.25, -.025, -.0001, 0, .0001, .025, .25]) {
        check(x, pad.minZ + delta); check(x, pad.maxZ + delta);
        check(pad.minX + delta, z); check(pad.maxX + delta, z);
      }
    }
    for (const x of [pad.minX, pad.maxX]) for (const z of [pad.minZ, pad.maxZ])
      for (const dx of [-.25, -.0001, 0, .0001, .25]) for (const dz of [-.25, -.0001, 0, .0001, .25]) check(x + dx, z + dz);
  }
});

test("physical discontinuities have opaque vertical joins covering both limits, including the bench cut into higher ground", () => {
  const { p, ix } = submitted();
  const walls: number[][] = [];
  for (let i = 0; i < ix.length; i += 3) {
    const vs = ix.slice(i, i + 3).map(v => v * 3);
    if (vs.every(v => p[v] === p[vs[0]!]) || vs.every(v => p[v + 2] === p[vs[0]! + 2])) walls.push(vs);
  }
  assert.ok(walls.length > 100, "the jumps are faces, not artificial ramps or missing triangles");
  const pads = [{ minX: 38, maxX: 54, minZ: -60, maxZ: -48 }, ...BASIN_GEOMETRY.terrainPads];
  for (const pad of pads) for (const axis of [0, 2] as const) for (const upper of [false, true]) for (let n = 1; n < 64; n++) {
    const at = axis === 0 ? (upper ? pad.maxX : pad.minX) : (upper ? pad.maxZ : pad.minZ);
    const lo = axis === 0 ? pad.minZ : pad.minX, hi = axis === 0 ? pad.maxZ : pad.maxX;
    const along = lo + (hi - lo) * (n + .137) / 64, x = axis === 0 ? at : along, z = axis === 2 ? at : along;
    const inside = terrainHeight(x, z), outside = terrainHeight(x + (axis === 0 ? (upper ? .0001 : -.0001) : 0),
      z + (axis === 2 ? (upper ? .0001 : -.0001) : 0));
    if (Math.abs(inside - outside) < .3) continue; // A max-pad may meet the unraised surface continuously.
    for (const fraction of [.1, .5, .9]) {
      const y = inside * fraction + outside * (1 - fraction);
      assert.ok(walls.some(vs => {
        if (!vs.every(v => Math.abs(p[v + axis]! - at) < 1e-6)) return false;
        const [a, b, c] = vs as [number, number, number], other = axis === 0 ? 2 : 0;
        const ax = p[a + other]!, ay = p[a + 1]!, bx = p[b + other]!, by = p[b + 1]!, cx = p[c + other]!, cy = p[c + 1]!;
        const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
        if (Math.abs(d) < 1e-12) return false;
        const u = ((by - cy) * (along - cx) + (cx - bx) * (y - cy)) / d;
        const v = ((cy - ay) * (along - cx) + (ax - cx) * (y - cy)) / d;
        return u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6;
      }), `closed vertical join at ${x},${y},${z}`);
    }
  }
});

test("smooth route terrain and complete lane widths meet .1 m in submitted float32 geometry", () => {
  const mesh = submitted();
  const check = (x: number, z: number): void => {
    const h = mesh.height(x, z);
    assert.notEqual(h, null, `missing terrain at ${x},${z}`);
    assert.ok(Math.abs(h! - terrainHeight(x, z)) <= .1, `smooth error at ${x},${z}: ${h! - terrainHeight(x, z)}`);
  };
  // Dense independent locations across the affected connected route, rather
  // than only vertices, endpoints or the particular camera reproductions.
  for (let z = -261.91; z < -38.1; z += .53) for (let x = 36.07; x < 249.9; x += .53) check(x, z);
  for (const crease of [42, 102]) for (let z = TERRAIN_EXTENT.minZ + .17; z < TERRAIN_EXTENT.maxZ; z += .37)
    for (const dx of [-.7, -.13, .11, .71]) check(crease + dx, z);
  for (const name of ["upper", "quiet", "basin", "returnLoop"] as const) {
    const lane = CANOPY_BASIN_ROUTE[name];
    for (let i = 1; i < lane.length; i++) {
      const a = lane[i - 1]!, b = lane[i]!, steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
      for (let n = 0; n <= steps; n++) for (let ix = -4; ix <= 4; ix++) for (let iz = -4; iz <= 4; iz++)
        check(a.x + (b.x - a.x) * n / steps + ix * CANOPY_BASIN_ROUTE.minimumHalfWidth / 4,
          a.z + (b.z - a.z) * n / steps + iz * CANOPY_BASIN_ROUTE.minimumHalfWidth / 4);
    }
  }
});

test("supported regression floor contacts retain physical clearance and clear eyes and all near-plane corners", () => {
  const mesh = submitted(), world = createWorldQueries();
  for (const [x, z, yaw, pitch] of [[53.325, -60, Math.PI / 2, -1.3], [54.15, -59.5, 3 * Math.PI / 2, -1.2],
    [173.125, -211.75, 0, -1.3], [96.8965517, -98.2241379, .46, -1.3], [101.4193548, -101.9516129, 2.4, -1.3]]) {
    const s = readyState(); s.player.mode = "swimming"; s.player.controlledVehicleId = null;
    s.player.pose.position = { x: x!, y: terrainHeight(x!, z!) + .1, z: z! };
    s.player.pose.yaw = yaw!; s.player.pose.pitch = pitch!;
    assert.ok(world.clearance(s.player.pose.position, { radius: .34, height: .95 }), "the diagnostic contact must be physically supported");
    const ray = aimRay(s)!, eye = new Vector3(ray.origin.x, ray.origin.y, ray.origin.z), forward = new Vector3(ray.dir.x, ray.dir.y, ray.dir.z);
    const right = new Vector3(Math.cos(yaw!), 0, Math.sin(yaw!)), up = Vector3.Cross(right, forward).normalize();
    assert.ok(eye.y - mesh.height(eye.x, eye.z)! > .5);
    const half = .07 * Math.tan(1.02 / 2);
    for (const h of [-1, 1]) for (const v of [-1, 1]) {
      const q = eye.add(forward.scale(.07)).add(right.scale(h * half * 1.6)).add(up.scale(v * half));
      assert.ok(q.y - terrainHeight(q.x, q.z) > .25, "near plane is physically clear too");
      assert.ok(q.y - mesh.height(q.x, q.z)! > .25, "the submitted floor cannot cover the near plane");
    }
  }
});
