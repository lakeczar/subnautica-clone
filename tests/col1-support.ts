// COL-1 test support (not a test file): synthetic meshes for the static collider.
import type { Vec3 } from "../src/sim/types.js";
import type { TriangleMesh } from "../src/world/collision/bake.js";

export const random = (seed: number) => () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);

/** A closed axis-aligned box as an outward-wound triangle mesh, each face an
 * n x n grid of quads (faces do not share vertices; edges meet exactly). */
export function gridBoxMesh(lo: Vec3, hi: Vec3, n: number): TriangleMesh {
  const pos: number[] = [], idx: number[] = [];
  const X = { x: hi.x - lo.x, y: 0, z: 0 }, Y = { x: 0, y: hi.y - lo.y, z: 0 }, Z = { x: 0, y: 0, z: hi.z - lo.z };
  // Origin corner and two edges U, V with U x V pointing out.
  const faces: [Vec3, Vec3, Vec3][] = [
    [{ x: hi.x, y: lo.y, z: lo.z }, Y, Z], [{ x: lo.x, y: lo.y, z: lo.z }, Z, Y],
    [{ x: lo.x, y: hi.y, z: lo.z }, Z, X], [{ x: lo.x, y: lo.y, z: lo.z }, X, Z],
    [{ x: lo.x, y: lo.y, z: hi.z }, X, Y], [{ x: lo.x, y: lo.y, z: lo.z }, Y, X],
  ];
  for (const [o, u, v] of faces) {
    const base = pos.length / 3;
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++)
      pos.push(o.x + u.x * i / n + v.x * j / n, o.y + u.y * i / n + v.y * j / n, o.z + u.z * i / n + v.z * j / n);
    const at = (i: number, j: number): number => base + i + (n + 1) * j;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) idx.push(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j), at(i + 1, j + 1), at(i, j + 1));
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}
export const boxMesh = (lo: Vec3, hi: Vec3): TriangleMesh => gridBoxMesh(lo, hi, 1);

/** A simple polygon (X/Z, counter-clockwise or not) extruded through Y
 * [y0, y1] as a closed, outward-wound mesh. `tops` triangulates the cap: an
 * index list into `poly`, sharing the polygon's own vertices, so every edge
 * has exactly two opposite uses. */
export function prismMesh(poly: readonly (readonly [number, number])[], tops: readonly number[], y0: number, y1: number): TriangleMesh {
  const n = poly.length, pos: number[] = [], idx: number[] = [];
  for (const y of [y0, y1]) for (const [x, z] of poly) pos.push(x, y, z);
  const inside = (x: number, z: number): boolean => {
    let odd = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, zi] = poly[i]!, [xj, zj] = poly[j]!;
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) odd = !odd;
    }
    return odd;
  };
  // Wind one triangle so (b - a) x (c - a) points away from the solid.
  const add = (a: number, b: number, c: number): void => {
    const P = (i: number): [number, number, number] => [pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!];
    const A = P(a), B = P(b), C = P(c);
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const nn = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!], l = Math.hypot(...nn);
    const m = [(A[0] + B[0] + C[0]) / 3 + nn[0]! / l * 1e-3, (A[1] + B[1] + C[1]) / 3 + nn[1]! / l * 1e-3, (A[2] + B[2] + C[2]) / 3 + nn[2]! / l * 1e-3];
    const out = m[1]! < y0 || m[1]! > y1 || !inside(m[0]!, m[2]!);
    idx.push(...(out ? [a, b, c] : [a, c, b]));
  };
  for (let t = 0; t < tops.length; t += 3) { add(tops[t]!, tops[t + 1]!, tops[t + 2]!); add(n + tops[t]!, n + tops[t + 1]!, n + tops[t + 2]!); }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; add(i, j, n + j); add(i, n + j, n + i); }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}

/** A closed latitude/longitude sphere: `bands` rings of latitude, `segments`
 * of longitude, one shared vertex at each pole, longitude indices wrapped,
 * outward-wound: 2 * segments * (bands - 1) triangles. */
export function sphereMesh(r: number, bands: number, segments: number): TriangleMesh {
  const pos: number[] = [0, r, 0], idx: number[] = [];
  for (let b = 1; b < bands; b++) for (let s = 0; s < segments; s++) {
    const t = Math.PI * b / bands, p = 2 * Math.PI * s / segments;
    pos.push(r * Math.sin(t) * Math.cos(p), r * Math.cos(t), r * Math.sin(t) * Math.sin(p));
  }
  const south = pos.length / 3;
  pos.push(0, -r, 0);
  const at = (b: number, s: number): number => 1 + (b - 1) * segments + ((s % segments) + segments) % segments;
  for (let s = 0; s < segments; s++) {
    idx.push(0, at(1, s + 1), at(1, s));
    for (let b = 1; b < bands - 1; b++) idx.push(at(b, s), at(b, s + 1), at(b + 1, s + 1), at(b, s), at(b + 1, s + 1), at(b + 1, s));
    idx.push(south, at(bands - 1, s), at(bands - 1, s + 1));
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}
