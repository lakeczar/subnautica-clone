import type { ChunkRecipe, InstanceRecipe, MeshRecipe } from "./types.js";

export type Rgba = readonly [number, number, number, number];
export type P3 = readonly [number, number, number];

/** Hex "#rrggbb" plus the cel alpha meaning (0 ground, 1 plain, >1 ink). */
export function rgba(hex: string, alpha = 1): Rgba {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
}

/** Accumulates cel-ready triangles as plain arrays, Babylon-free, so it can
 * run in a worker or a time-sliced generator. Mirrors the subset of the
 * existing `ArtBatch` vocabulary that chunk art needs. */
export class RecipeBuilder {
  private readonly p: number[] = [];
  private readonly n: number[] = [];
  private readonly c: number[] = [];
  private readonly i: number[] = [];

  get vertexCount(): number { return this.p.length / 3; }

  vertex(p: P3, n: P3, color: Rgba): number {
    this.p.push(p[0], p[1], p[2]);
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    this.n.push(n[0] / l, n[1] / l, n[2] / l);
    this.c.push(color[0], color[1], color[2], color[3]);
    return this.vertexCount - 1;
  }
  triangle(a: number, b: number, c: number): void { this.i.push(a, b, c); }

  /** Box with flat faces, rotated by `yaw` about +Y. */
  box(center: P3, size: P3, color: Rgba, yaw = 0): void {
    const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2];
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const rot = (x: number, y: number, z: number): P3 => [center[0] + x * cs + z * sn, center[1] + y, center[2] - x * sn + z * cs];
    const faces: [P3, P3, P3][] = [ // normal, u, v
      [[1, 0, 0], [0, 0, 1], [0, 1, 0]], [[-1, 0, 0], [0, 0, -1], [0, 1, 0]],
      [[0, 1, 0], [1, 0, 0], [0, 0, 1]], [[0, -1, 0], [1, 0, 0], [0, 0, -1]],
      [[0, 0, 1], [-1, 0, 0], [0, 1, 0]], [[0, 0, -1], [1, 0, 0], [0, 1, 0]],
    ];
    for (const [nn, u, v] of faces) {
      const base = this.vertexCount;
      const normal = rot(nn[0], nn[1], nn[2]);
      const nrm: P3 = [normal[0] - center[0], normal[1] - center[1], normal[2] - center[2]];
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        const x = nn[0] * hx + u[0] * su * hx + v[0] * sv * hx;
        const y = nn[1] * hy + u[1] * su * hy + v[1] * sv * hy;
        const z = nn[2] * hz + u[2] * su * hz + v[2] * sv * hz;
        this.vertex(rot(x, y, z), nrm, color);
      }
      this.triangle(base, base + 1, base + 2); this.triangle(base, base + 2, base + 3);
    }
  }

  /** Latitude/longitude ellipsoid. */
  ellipsoid(center: P3, radii: P3, color: Rgba, segments = 8): void {
    const rings = Math.max(2, Math.round(segments / 2)), base = this.vertexCount;
    for (let r = 0; r <= rings; r++) {
      const phi = (r / rings) * Math.PI, y = Math.cos(phi), s = Math.sin(phi);
      for (let k = 0; k <= segments; k++) {
        const th = (k / segments) * Math.PI * 2, x = s * Math.cos(th), z = s * Math.sin(th);
        this.vertex([center[0] + x * radii[0], center[1] + y * radii[1], center[2] + z * radii[2]],
          [x / radii[0], y / radii[1], z / radii[2]], color);
      }
    }
    for (let r = 0; r < rings; r++) for (let k = 0; k < segments; k++) {
      const a = base + r * (segments + 1) + k, b = a + segments + 1;
      this.triangle(a, b, a + 1); this.triangle(a + 1, b, b + 1);
    }
  }

  /** Tube through `points` with per-point radius, capped at neither end. */
  tube(points: readonly P3[], radius: number | readonly number[], color: Rgba | readonly Rgba[], sides = 6): void {
    const base = this.vertexCount;
    for (let j = 0; j < points.length; j++) {
      const p = points[j]!, q = points[Math.min(points.length - 1, j + 1)]!, o = points[Math.max(0, j - 1)]!;
      const t = norm([q[0] - o[0], q[1] - o[1], q[2] - o[2]]);
      const side = Math.abs(t[1]) < 0.9 ? norm(cross(t, [0, 1, 0])) : norm(cross(t, [1, 0, 0]));
      const up = cross(side, t);
      const rad = typeof radius === "number" ? radius : radius[j]!;
      const col = (Array.isArray(color[0]) ? (color as readonly Rgba[])[j] : color) as Rgba;
      for (let k = 0; k <= sides; k++) {
        const a = (k / sides) * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a);
        const n: P3 = [side[0] * cs + up[0] * sn, side[1] * cs + up[1] * sn, side[2] * cs + up[2] * sn];
        this.vertex([p[0] + n[0] * rad, p[1] + n[1] * rad, p[2] + n[2] * rad], n, col);
      }
    }
    for (let j = 0; j < points.length - 1; j++) for (let k = 0; k < sides; k++) {
      const a = base + j * (sides + 1) + k, b = a + sides + 1;
      this.triangle(a, b, a + 1); this.triangle(a + 1, b, b + 1);
    }
  }

  /** Flat double-sided quad strip (fronds, fins), normals from the first edge. */
  ribbon(left: readonly P3[], right: readonly P3[], color: Rgba | readonly Rgba[]): void {
    const base = this.vertexCount;
    for (let j = 0; j < left.length; j++) {
      const l = left[j]!, r = right[j]!, nx = left[Math.min(j + 1, left.length - 1)]!, pr = left[Math.max(0, j - 1)]!;
      const n = norm(cross([r[0] - l[0], r[1] - l[1], r[2] - l[2]], [nx[0] - pr[0], nx[1] - pr[1], nx[2] - pr[2]]));
      const col = (Array.isArray(color[0]) ? (color as readonly Rgba[])[j] : color) as Rgba;
      this.vertex(l, n, col); this.vertex(r, n, col);
    }
    for (let j = 0; j < left.length - 1; j++) {
      const a = base + j * 2;
      this.triangle(a, a + 2, a + 1); this.triangle(a + 1, a + 2, a + 3);
    }
  }

  build(name: string): MeshRecipe {
    const big = this.vertexCount > 65535;
    return {
      name,
      positions: new Float32Array(this.p),
      normals: new Float32Array(this.n),
      colors: new Float32Array(this.c),
      indices: big ? new Uint32Array(this.i) : new Uint16Array(this.i),
    };
  }
}

function cross(a: P3, b: P3): P3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a: P3): P3 { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

export function meshBytes(m: MeshRecipe): number {
  return m.positions.byteLength + m.normals.byteLength + m.colors.byteLength + m.indices.byteLength;
}
export function instanceBytes(i: InstanceRecipe): number {
  return i.matrices.byteLength + (i.tints?.byteLength ?? 0);
}
export function recipeBytes(r: ChunkRecipe): number {
  return r.meshes.reduce((n, m) => n + meshBytes(m), 0) + r.instances.reduce((n, i) => n + instanceBytes(i), 0);
}

/** Column-major TRS matrix (Babylon layout) with yaw, uniform-ish scale and
 * a small tilt, written into `out` at `offset`. */
export function writeMatrix(out: Float32Array, offset: number, x: number, y: number, z: number,
  yaw: number, scale: P3, tiltX = 0, tiltZ = 0): void {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(tiltX), sx = Math.sin(tiltX), cz = Math.cos(tiltZ), sz = Math.sin(tiltZ);
  // R = Ry * Rx * Rz
  const r00 = cy * cz + sy * sx * sz, r01 = -cy * sz + sy * sx * cz, r02 = sy * cx;
  const r10 = cx * sz, r11 = cx * cz, r12 = -sx;
  const r20 = -sy * cz + cy * sx * sz, r21 = sy * sz + cy * sx * cz, r22 = cy * cx;
  // Babylon matrices are row-vector (v * M); element [row*4+col], translation in 12..14.
  out[offset] = r00 * scale[0]; out[offset + 1] = r10 * scale[0]; out[offset + 2] = r20 * scale[0]; out[offset + 3] = 0;
  out[offset + 4] = r01 * scale[1]; out[offset + 5] = r11 * scale[1]; out[offset + 6] = r21 * scale[1]; out[offset + 7] = 0;
  out[offset + 8] = r02 * scale[2]; out[offset + 9] = r12 * scale[2]; out[offset + 10] = r22 * scale[2]; out[offset + 11] = 0;
  out[offset + 12] = x; out[offset + 13] = y; out[offset + 14] = z; out[offset + 15] = 1;
}

/** Split a mesh into parts of at most about `maxBytes` each, by consecutive
 * triangles with vertex remapping, so no single upload part exceeds a
 * per-frame upload cap. A mesh already within the cap is returned as is. */
export function splitMesh(m: MeshRecipe, maxBytes: number): MeshRecipe[] {
  const steps = splitMeshSteps(m, maxBytes);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}
/** `splitMesh` in bounded steps: yields whenever `due()` is true. */
export function* splitMeshSteps(m: MeshRecipe, maxBytes: number,
  due: () => boolean = () => false): Generator<void, MeshRecipe[]> {
  if (meshBytes(m) <= maxBytes) return [m];
  const parts: MeshRecipe[] = [];
  const VERTEX = 40, INDEX = 4;
  let remap = new Map<number, number>(), p: number[] = [], n: number[] = [], c: number[] = [], idx: number[] = [];
  const flush = (): void => {
    if (!idx.length) return;
    const big = p.length / 3 > 65535;
    parts.push({ name: `${m.name}.${parts.length}`, positions: new Float32Array(p), normals: new Float32Array(n),
      colors: new Float32Array(c), indices: big ? new Uint32Array(idx) : new Uint16Array(idx) });
    remap = new Map(); p = []; n = []; c = []; idx = [];
  };
  for (let t = 0; t < m.indices.length; t += 3) {
    const tri = [m.indices[t]!, m.indices[t + 1]!, m.indices[t + 2]!];
    const fresh = tri.filter(v => !remap.has(v)).length;
    if (idx.length && (remap.size + fresh) * VERTEX + (idx.length + 3) * INDEX > maxBytes) flush();
    for (const v of tri) {
      let k = remap.get(v);
      if (k === undefined) {
        k = remap.size; remap.set(v, k);
        p.push(m.positions[v * 3]!, m.positions[v * 3 + 1]!, m.positions[v * 3 + 2]!);
        n.push(m.normals[v * 3]!, m.normals[v * 3 + 1]!, m.normals[v * 3 + 2]!);
        c.push(m.colors[v * 4]!, m.colors[v * 4 + 1]!, m.colors[v * 4 + 2]!, m.colors[v * 4 + 3]!);
      }
      idx.push(k);
    }
    if ((t & 1023) === 0 && due()) yield;
  }
  flush();
  return parts;
}
