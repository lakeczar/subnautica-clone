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

/** Test diagnostic, never a decider: probe votes on a provenance-oriented
 * mesh, per connected component. Every `step`-th triangle is probed either
 * side at 5, 10, 20 and 40 cm with `inside` (true, false, or null for
 * unknown). A triangle **agrees** if any offset's classified, differing pair
 * agrees with its component's provenance facing, is **contrary** if every
 * decisive offset disagrees, else **undecided**. A wrongly wound component
 * is contrary at every scale; a single triangle tilted by relaxing can be
 * contrary close in and agree further out. */
export interface ComponentVotes { component: number; triangles: number; agree: number; contrary: number; undecided: number; examples: number[] }
export function probeComponents(mesh: TriangleMesh, component: Int32Array, facing: Int8Array, inside: (p: Vec3) => boolean | null, samples = 400): ComponentVotes[] {
  const P = mesh.positions, I = mesh.indices, n = I.length / 3, step = Math.max(1, Math.floor(n / samples));
  const rows = new Map<number, ComponentVotes>();
  for (let t = 0; t < n; t++) {
    const c = component[t]!;
    if (!rows.has(c)) rows.set(c, { component: c, triangles: 0, agree: 0, contrary: 0, undecided: 0, examples: [] });
    rows.get(c)!.triangles++;
  }
  for (let t = 0; t < n; t += step) {
    const a = I[t * 3]! * 3, b = I[t * 3 + 1]! * 3, c = I[t * 3 + 2]! * 3;
    const ux = P[b]! - P[a]!, uy = P[b + 1]! - P[a + 1]!, uz = P[b + 2]! - P[a + 2]!, vx = P[c]! - P[a]!, vy = P[c + 1]! - P[a + 1]!, vz = P[c + 2]! - P[a + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) continue;
    const m = { x: (P[a]! + P[b]! + P[c]!) / 3, y: (P[a + 1]! + P[b + 1]! + P[c + 1]!) / 3, z: (P[a + 2]! + P[b + 2]! + P[c + 2]!) / 3 };
    const row = rows.get(component[t]!)!, want = facing[component[t]!]!;
    let agree = false, contrary = false;
    for (const off of [0.05, 0.1, 0.2, 0.4]) {
      const h = off / l, plus = inside({ x: m.x + nx * h, y: m.y + ny * h, z: m.z + nz * h }), minus = inside({ x: m.x - nx * h, y: m.y - ny * h, z: m.z - nz * h });
      if (plus === null || minus === null || plus === minus) continue;
      if ((minus ? 1 : -1) === want) agree = true; else contrary = true;
    }
    if (agree) row.agree++;
    else if (contrary) { row.contrary++; if (row.examples.length < 3) row.examples.push(t); }
    else row.undecided++;
  }
  return [...rows.values()];
}

/** Every crossing of the vertical line at (x, z) with the mesh's triangles,
 * top to bottom: height, triangle, and the Y component of (b - a) x (c - a).
 * Brute force over the triangles (independent of the collider). */
export function columnCrossings(mesh: TriangleMesh, x: number, z: number): { y: number; t: number; ny: number }[] {
  const P = mesh.positions, I = mesh.indices, out: { y: number; t: number; ny: number }[] = [];
  for (let t = 0; t < I.length / 3; t++) {
    const a = I[t * 3]! * 3, b = I[t * 3 + 1]! * 3, c = I[t * 3 + 2]! * 3;
    const ax = P[a]!, az = P[a + 2]!, bx = P[b]!, bz = P[b + 2]!, cx = P[c]!, cz = P[c + 2]!;
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(det) < 1e-12) continue;
    const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, l3 = 1 - l1 - l2;
    if (l1 < 0 || l2 < 0 || l3 < 0) continue;
    out.push({ y: l1 * P[a + 1]! + l2 * P[b + 1]! + l3 * P[c + 1]!, t, ny: (bz - az) * (cx - ax) - (bx - ax) * (cz - az) });
  }
  return out.sort((p, q) => q.y - p.y);
}

/** Columns (at triangle centroids, nudged off the lattice) where an outward
 * wound closed volume's crossings contradict its own parity: counted from
 * the top, an odd crossing has solid below it, so its outward normal must
 * point up; an even one, down. A fold or a flip shows here; nothing is
 * probed. Returns the contradicting columns (at most `limit`). */
export function parityContradictions(mesh: TriangleMesh, columns = 3000, limit = 10): { x: number; z: number; j: number; t: number }[] {
  const P = mesh.positions, I = mesh.indices, n = I.length / 3, step = Math.max(1, Math.floor(n / columns)), out: { x: number; z: number; j: number; t: number }[] = [];
  // X/Z buckets, so each column reads only nearby triangles.
  const C = 1, buckets = new Map<number, number[]>(), key = (i: number, k: number): number => i * 1000003 + k;
  for (let t = 0; t < n; t++) {
    const xs = [0, 1, 2].map(k => P[I[t * 3 + k]! * 3]!), zs = [0, 1, 2].map(k => P[I[t * 3 + k]! * 3 + 2]!);
    for (let i = Math.floor(Math.min(...xs) / C); i <= Math.floor(Math.max(...xs) / C); i++) for (let k = Math.floor(Math.min(...zs) / C); k <= Math.floor(Math.max(...zs) / C); k++)
      (buckets.get(key(i, k)) ?? buckets.set(key(i, k), []).get(key(i, k))!).push(t);
  }
  for (let t0 = 0; t0 < n && out.length < limit; t0 += step) {
    const x = (P[I[t0 * 3]! * 3]! + P[I[t0 * 3 + 1]! * 3]! + P[I[t0 * 3 + 2]! * 3]!) / 3 + 1.37e-6, z = (P[I[t0 * 3]! * 3 + 2]! + P[I[t0 * 3 + 1]! * 3 + 2]! + P[I[t0 * 3 + 2]! * 3 + 2]!) / 3 + 2.91e-6;
    const near = buckets.get(key(Math.floor(x / C), Math.floor(z / C))) ?? [];
    const sub = { positions: P, indices: Uint32Array.from(near.flatMap(t => [I[t * 3]!, I[t * 3 + 1]!, I[t * 3 + 2]!])) };
    const hits = columnCrossings(sub, x, z);
    for (let j = 0; j < hits.length; j++) {
      const want = j % 2 === 0 ? 1 : -1;
      if (Math.abs(hits[j]!.ny) > 1e-9 && Math.sign(hits[j]!.ny) !== want) { out.push({ x, z, j, t: near[hits[j]!.t]! }); break; }
    }
  }
  return out;
}

/** Boundary vertices on an unshared footprint side that don't sit on the
 * floor, or (within `band` of one, measured to its nearest side) sit below
 * it: gaps in the shell's seam with the terrain. */
export function seamGaps(mesh: TriangleMesh, foot: { minX: number; maxX: number; minZ: number; maxZ: number },
  shared: (x: number, z: number) => boolean, floor: (x: number, z: number) => number, band = 0): Vec3[] {
  const P = mesh.positions, I = mesh.indices, uses = new Map<number, number>(), nv = P.length / 3, out: Vec3[] = [];
  for (let t = 0; t < I.length / 3; t++) for (let k = 0; k < 3; k++) {
    const a = I[t * 3 + k]!, b = I[t * 3 + (k + 1) % 3]!, e = Math.min(a, b) * nv + Math.max(a, b);
    uses.set(e, (uses.get(e) ?? 0) + 1);
  }
  const seen = new Set<number>();
  for (const [e, n] of uses) {
    if (n !== 1) continue;
    for (const v of [Math.floor(e / nv), e % nv]) {
      if (seen.has(v)) continue;
      seen.add(v);
      const x = P[v * 3]!, y = P[v * 3 + 1]!, z = P[v * 3 + 2]!, off = y - Math.fround(floor(x, z));
      // The nearest side, and the point on it straight across.
      const sides: [number, number, number][] = [[x - foot.minX, foot.minX, z], [foot.maxX - x, foot.maxX, z], [z - foot.minZ, x, foot.minZ], [foot.maxZ - z, x, foot.maxZ]];
      const [d, sx, sz] = sides.reduce((m, s) => s[0] < m[0] ? s : m);
      if (shared(sx, sz)) continue;
      if (d === 0 ? Math.abs(off) > 1e-4 : d < band && off < -1e-4) out.push({ x, y, z });
    }
  }
  return out;
}

type Footprint = { minX: number; maxX: number; minZ: number; maxZ: number };

/** Faces crossed along the horizontal line through (y, w) parallel to `axis`
 * (0 = X, 2 = Z; w is the other horizontal coordinate), sorted along it,
 * each with the sign of its normal along the line and its triangle. Brute
 * force; hits on a shared edge are counted once. */
export function lineCrossings(mesh: TriangleMesh, axis: 0 | 2, y: number, w: number): { s: number; t: number; facing: number }[] {
  const P = mesh.positions, I = mesh.indices, o = axis === 0 ? 2 : 0, out: { s: number; t: number; facing: number }[] = [];
  for (let t = 0; t < I.length / 3; t++) {
    const a = I[t * 3]! * 3, b = I[t * 3 + 1]! * 3, c = I[t * 3 + 2]! * 3;
    if (Math.min(P[a + 1]!, P[b + 1]!, P[c + 1]!) > y || Math.max(P[a + 1]!, P[b + 1]!, P[c + 1]!) < y) continue;
    if (Math.min(P[a + o]!, P[b + o]!, P[c + o]!) > w || Math.max(P[a + o]!, P[b + o]!, P[c + o]!) < w) continue;
    const e1 = [P[b]! - P[a]!, P[b + 1]! - P[a + 1]!, P[b + 2]! - P[a + 2]!], e2 = [P[c]! - P[a]!, P[c + 1]! - P[a + 1]!, P[c + 2]! - P[a + 2]!];
    const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    if (Math.abs(n[axis]!) < 1e-12) continue;
    // Barycentric coordinates of (w, y) in the triangle's projection onto (o, y).
    const ou = P[b + o]! - P[a + o]!, oy = P[b + 1]! - P[a + 1]!, vu = P[c + o]! - P[a + o]!, vy = P[c + 1]! - P[a + 1]!, pu = w - P[a + o]!, py = y - P[a + 1]!;
    const den = ou * vy - oy * vu;
    if (den === 0) continue;
    const u = (pu * vy - py * vu) / den, v = (ou * py - oy * pu) / den;
    if (u < 0 || v < 0 || u + v > 1) continue;
    const s = P[a + axis]! + u * (P[b + axis]! - P[a + axis]!) + v * (P[c + axis]! - P[a + axis]!);
    out.push({ s, t, facing: Math.sign(n[axis]!) });
  }
  out.sort((p, q) => p.s - q.s || p.facing - q.facing);
  return out.filter((h, i) => i === 0 || !(Math.abs(h.s - out[i - 1]!.s) < 1e-9 && h.facing === out[i - 1]!.facing));
}

/** Horizontal wall-normal and occupancy control (COL-1 R7): along lines
 * parallel to `axis` through the centroid of every face lying in a side
 * plane across it, and along `lines` random ones, every face crossed (not
 * grazing) must agree with the collider's own occupancy (`solidAt`, from
 * vertical parity, which can't see vertical faces) on each side that lies in
 * the footprint: a face whose normal points along the line has solid behind
 * it and water ahead. Two opposite faces meeting the line at one place in
 * one side plane (a zero-thickness sheet, R7-1) are reported outright. The
 * vertical-column parity test can't see vertical faces at all. */
export function wallContradictions(mesh: TriangleMesh, solidAt: (p: Vec3) => boolean, axis: 0 | 2, foot: Footprint,
  lines = 1500, seed = 7, limit = 10): string[] {
  const P = mesh.positions, o = axis === 0 ? 2 : 0, rnd = random(seed), out: string[] = [], d = 1e-3;
  let y0 = Infinity, y1 = -Infinity;
  for (let v = 0; v < P.length / 3; v++) { y0 = Math.min(y0, P[v * 3 + 1]!); y1 = Math.max(y1, P[v * 3 + 1]!); }
  const lo = axis === 0 ? foot.minX : foot.minZ, hi = axis === 0 ? foot.maxX : foot.maxZ, wlo = o === 0 ? foot.minX : foot.minZ, whi = o === 0 ? foot.maxX : foot.maxZ;
  const at = (s: number, y: number, w: number): Vec3 => axis === 0 ? { x: s, y, z: w } : { x: w, y, z: s };
  // Lines through the centroid of every face lying in a side plane across
  // this axis (each seam face, by construction), then random ones.
  const I = mesh.indices, through: [number, number][] = [];
  const inSide = (t: number): number | null => { for (const side of [lo, hi]) if ([0, 1, 2].every(k => P[I[t * 3 + k]! * 3 + axis] === side)) return side; return null; };
  for (let t = 0; t < I.length / 3; t++) {
    const vs = [I[t * 3]!, I[t * 3 + 1]!, I[t * 3 + 2]!];
    if (![lo, hi].some(side => vs.every(v => P[v * 3 + axis] === side))) continue;
    through.push([vs.reduce((m, v) => m + P[v * 3 + 1]!, 0) / 3 + 1.3e-7, vs.reduce((m, v) => m + P[v * 3 + o]!, 0) / 3 + 2.9e-7]);
  }
  for (let k = 0; k < through.length + lines && out.length < limit; k++) {
    const [y, w] = k < through.length ? through[k]! : [y0 + (y1 - y0) * rnd() + 1.3e-6, wlo + (whi - wlo) * rnd() + 2.7e-6], hits = lineCrossings(mesh, axis, y, w);
    for (let i = 0; i < hits.length && out.length < limit; i++) {
      const h = hits[i]!, prev = hits[i - 1], next = hits[i + 1];
      // Opposite faces in one side plane where the line meets both: a
      // zero-thickness sheet (R7-1). Faces merely close (a wedge folding at a
      // shared edge, thin by its tip) are a thin feature, skipped below.
      if (next && next.s - h.s < 1e-5 && next.facing !== h.facing && inSide(h.t) !== null && inSide(h.t) === inSide(next.t)) {
        out.push(`${axis === 0 ? "x" : "z"} line (y ${y.toFixed(3)}, ${w.toFixed(3)}): opposite faces ${h.t} and ${next.t} coincide in the plane at ${h.s.toFixed(5)}`);
        continue;
      }
      if ((prev && h.s - prev.s < 2 * d) || (next && next.s - h.s < 2 * d)) continue;
      for (const [side, want] of [[-1, h.facing > 0], [1, h.facing < 0]] as const) {
        const s = h.s + side * d;
        if (s <= lo || s >= hi) continue;
        if (solidAt(at(s, y, w)) !== want) out.push(`${axis === 0 ? "x" : "z"} line (y ${y.toFixed(3)}, ${w.toFixed(3)}): face ${h.t} at ${h.s.toFixed(4)} faces ${h.facing > 0 ? "+" : "-"}, but the ${side < 0 ? "near" : "far"} side is ${want ? "water" : "solid"}`);
      }
    }
  }
  return out;
}

/** Independent audit of the faces lying in a shell's footprint side planes
 * (COL-1 R7): no two overlap with positive area in their plane (sharing
 * vertices doesn't excuse it), no other triangle passes through one, and
 * each of their edges is used by at most two triangles, never twice in the
 * same direction. */
export function seamAudit(mesh: TriangleMesh, foot: Footprint, limit = 10): string[] {
  const P = mesh.positions, I = mesh.indices, n = I.length / 3, nv = P.length / 3, out: string[] = [];
  const planes: [0 | 2, number][] = [[0, foot.minX], [0, foot.maxX], [2, foot.minZ], [2, foot.maxZ]];
  const directed = new Map<number, number>(), undirected = new Map<number, number>();
  for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
    const a = I[t * 3 + k]!, b = I[t * 3 + (k + 1) % 3]!;
    directed.set(a * nv + b, (directed.get(a * nv + b) ?? 0) + 1);
    undirected.set(Math.min(a, b) * nv + Math.max(a, b), (undirected.get(Math.min(a, b) * nv + Math.max(a, b)) ?? 0) + 1);
  }
  for (const [axis, at] of planes) {
    const h = axis === 0 ? 2 : 0, on = (v: number): boolean => P[v * 3 + axis] === at;
    const flat: number[] = [];
    for (let t = 0; t < n; t++) if (on(I[t * 3]!) && on(I[t * 3 + 1]!) && on(I[t * 3 + 2]!)) flat.push(t);
    const pt = (v: number): [number, number] => [P[v * 3 + h]!, P[v * 3 + 1]!];
    const tri = (t: number): [number, number][] => [pt(I[t * 3]!), pt(I[t * 3 + 1]!), pt(I[t * 3 + 2]!)];
    for (const t of flat) for (let k = 0; k < 3; k++) {
      const a = I[t * 3 + k]!, b = I[t * 3 + (k + 1) % 3]!;
      if ((directed.get(a * nv + b) ?? 0) > 1 || (undirected.get(Math.min(a, b) * nv + Math.max(a, b)) ?? 0) > 2)
        if (out.length < limit) out.push(`plane ${axis === 0 ? "x" : "z"} = ${at}: edge ${a}-${b} of face ${t} is shared incoherently`);
    }
    // Pairwise positive-area overlap, swept along the plane's horizontal axis.
    const boxes = flat.map(t => { const q = tri(t); return { t, q, lo: Math.min(q[0]![0], q[1]![0], q[2]![0]), hi: Math.max(q[0]![0], q[1]![0], q[2]![0]) }; }).sort((p, q) => p.lo - q.lo);
    for (let i = 0; i < boxes.length && out.length < limit; i++) for (let j = i + 1; j < boxes.length && boxes[j]!.lo < boxes[i]!.hi; j++) {
      const area = convexOverlap(boxes[i]!.q, boxes[j]!.q);
      if (area > 1e-9 && out.length < limit) out.push(`plane ${axis === 0 ? "x" : "z"} = ${at}: faces ${boxes[i]!.t} and ${boxes[j]!.t} overlap by ${area.toExponential(2)} m²`);
    }
    // Triangles touching the plane against its faces: no edge passes through a face.
    const flatSet = new Set(flat);
    for (let s = 0; s < n && out.length < limit; s++) {
      if (flatSet.has(s) || ![0, 1, 2].some(k => Math.abs(P[I[s * 3 + k]! * 3 + axis]! - at) < 1e-3)) continue;
      for (const t of flat) if (edgeThroughTriangle(P, I, s, t) || edgeThroughTriangle(P, I, t, s)) { out.push(`plane ${axis === 0 ? "x" : "z"} = ${at}: triangle ${s} passes through face ${t}`); break; }
    }
  }
  return out;
}

/** Area of the overlap of two 2-D triangles (convex clipping). */
function convexOverlap(a: readonly [number, number][], b: readonly [number, number][]): number {
  const area2 = (p: readonly [number, number][]): number => { let s = 0; for (let i = 0; i < p.length; i++) { const q = p[i]!, r = p[(i + 1) % p.length]!; s += q[0] * r[1] - r[0] * q[1]; } return s; };
  let poly: [number, number][] = area2(a) < 0 ? [...a].reverse() : [...a];
  const clip = area2(b) < 0 ? [...b].reverse() : [...b];
  for (let i = 0; i < 3 && poly.length; i++) {
    const p0 = clip[i]!, p1 = clip[(i + 1) % 3]!, side = (q: [number, number]): number => (p1[0] - p0[0]) * (q[1] - p0[1]) - (p1[1] - p0[1]) * (q[0] - p0[0]);
    const next: [number, number][] = [];
    for (let k = 0; k < poly.length; k++) {
      const q = poly[k]!, r = poly[(k + 1) % poly.length]!, sq = side(q), sr = side(r);
      if (sq >= 0) next.push(q);
      if ((sq >= 0) !== (sr >= 0)) { const f = sq / (sq - sr); next.push([q[0] + (r[0] - q[0]) * f, q[1] + (r[1] - q[1]) * f]); }
    }
    poly = next;
  }
  return poly.length < 3 ? 0 : Math.abs(area2(poly)) / 2;
}

/** Whether an edge of triangle s passes through the interior of triangle t
 * (strictly: touching an edge or a vertex doesn't count). */
function edgeThroughTriangle(P: ArrayLike<number>, I: ArrayLike<number>, s: number, t: number): boolean {
  const v = (i: number): number[] => [P[i * 3]!, P[i * 3 + 1]!, P[i * 3 + 2]!];
  const A = v(I[t * 3]!), B = v(I[t * 3 + 1]!), C = v(I[t * 3 + 2]!);
  for (let k = 0; k < 3; k++) {
    const p = v(I[s * 3 + k]!), q = v(I[s * 3 + (k + 1) % 3]!), d = [q[0]! - p[0]!, q[1]! - p[1]!, q[2]! - p[2]!];
    const e1 = [B[0]! - A[0]!, B[1]! - A[1]!, B[2]! - A[2]!], e2 = [C[0]! - A[0]!, C[1]! - A[1]!, C[2]! - A[2]!];
    const h = [d[1]! * e2[2]! - d[2]! * e2[1]!, d[2]! * e2[0]! - d[0]! * e2[2]!, d[0]! * e2[1]! - d[1]! * e2[0]!];
    const det = e1[0]! * h[0]! + e1[1]! * h[1]! + e1[2]! * h[2]!;
    if (Math.abs(det) < 1e-12) continue;
    const sv = [p[0]! - A[0]!, p[1]! - A[1]!, p[2]! - A[2]!], u = (sv[0]! * h[0]! + sv[1]! * h[1]! + sv[2]! * h[2]!) / det;
    if (u <= 1e-7 || u >= 1 - 1e-7) continue;
    const qv = [sv[1]! * e1[2]! - sv[2]! * e1[1]!, sv[2]! * e1[0]! - sv[0]! * e1[2]!, sv[0]! * e1[1]! - sv[1]! * e1[0]!];
    const w = (d[0]! * qv[0]! + d[1]! * qv[1]! + d[2]! * qv[2]!) / det;
    if (w <= 1e-7 || u + w >= 1 - 1e-7) continue;
    const r = (e2[0]! * qv[0]! + e2[1]! * qv[1]! + e2[2]! * qv[2]!) / det;
    if (r > 1e-7 && r < 1 - 1e-7) return true;
  }
  return false;
}
