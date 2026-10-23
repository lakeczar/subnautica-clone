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
