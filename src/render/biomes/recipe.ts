// FORK(biome-recipe-builder): a second Babylon-free RecipeBuilder beside
// render/kit/recipe.ts; its box yaw mirrors the kit's (biome box(c, s, col, yaw) is
// kit box(c, s, col, −yaw)); retire in WK-1's one builder seam (CORE-HELPERS).
import type { MeshRecipe } from "../kit/types.js";

/** Babylon-free mesh builder for chunk recipes. Faceted (flat-normal) parts
 * suit the cel pass; `smoothQuadGrid` is for terrain. Colours are linear
 * rgb in 0..1 with the cel alpha slot: 0 ground, 1 plain, >1 contour ink,
 * -1 unlit (emissive). */
export type Rgb = readonly [number, number, number];
export type P3 = readonly [number, number, number];

export function hex(h: string): Rgb {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const scale = (a: Rgb, k: number): Rgb => [a[0] * k, a[1] * k, a[2] * k];

export class RecipeBuilder {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly colors: number[] = [];
  readonly indices: number[] = [];
  /** Alpha written for plain parts; `finish` can promote it to contour ink. */
  alpha = 1;

  get vertexCount(): number { return this.positions.length / 3; }

  vertex(p: P3, n: P3, c: Rgb, alpha = this.alpha): number {
    this.positions.push(p[0], p[1], p[2]);
    this.normals.push(n[0], n[1], n[2]);
    this.colors.push(c[0], c[1], c[2], alpha);
    return this.vertexCount - 1;
  }

  /** Flat polygon (convex, counter-clockwise seen from its front). */
  face(pts: readonly P3[], c: Rgb, alpha = this.alpha): void {
    if (pts.length < 3) return;
    const [a, b, d] = [pts[0]!, pts[1]!, pts[2]!];
    let nx = (b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]);
    let ny = (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]);
    let nz = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
    const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
    const base = this.vertexCount;
    for (const p of pts) this.vertex(p, [nx, ny, nz], c, alpha);
    for (let i = 1; i < pts.length - 1; i++) this.indices.push(base, base + i, base + i + 1);
  }

  /** Box centred at `c` with size `s`, rotated `yaw` about +Y. */
  box(c: P3, s: P3, color: Rgb, yaw = 0, top?: Rgb): void {
    const hx = s[0] / 2, hy = s[1] / 2, hz = s[2] / 2, cy = Math.cos(yaw), sy = Math.sin(yaw);
    const at = (x: number, y: number, z: number): P3 => [c[0] + x * cy - z * sy, c[1] + y, c[2] + x * sy + z * cy];
    const v = [at(-hx, -hy, -hz), at(hx, -hy, -hz), at(hx, hy, -hz), at(-hx, hy, -hz),
      at(-hx, -hy, hz), at(hx, -hy, hz), at(hx, hy, hz), at(-hx, hy, hz)];
    const q = (a: number, b: number, d: number, e: number, col = color): void => this.face([v[a]!, v[b]!, v[d]!, v[e]!], col);
    q(0, 3, 2, 1); q(4, 5, 6, 7); q(0, 4, 7, 3); q(1, 2, 6, 5); q(3, 7, 6, 2, top ?? color); q(0, 1, 5, 4);
  }

  /** Axis box from min/max corners. */
  aabb(min: P3, max: P3, color: Rgb, top?: Rgb): void {
    this.box([(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
      [max[0] - min[0], max[1] - min[1], max[2] - min[2]], color, 0, top);
  }

  /** Faceted frustum between two points, radii r0 -> r1. */
  frustum(a: P3, b: P3, r0: number, r1: number, sides: number, color: Rgb, capColor?: Rgb, twist = 0): void {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz) || 1;
    const w: P3 = [dx / len, dy / len, dz / len];
    const ref: P3 = Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let u: P3 = [w[1] * ref[2] - w[2] * ref[1], w[2] * ref[0] - w[0] * ref[2], w[0] * ref[1] - w[1] * ref[0]];
    const ul = Math.hypot(...u); u = [u[0] / ul, u[1] / ul, u[2] / ul];
    const v: P3 = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
    const ring = (o: P3, r: number): P3[] => Array.from({ length: sides }, (_, i) => {
      const t = (i / sides) * Math.PI * 2 + twist, cs = Math.cos(t) * r, sn = Math.sin(t) * r;
      return [o[0] + u[0] * cs + v[0] * sn, o[1] + u[1] * cs + v[1] * sn, o[2] + u[2] * cs + v[2] * sn] as P3;
    });
    const A = ring(a, r0), B = ring(b, r1);
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      this.face([A[i]!, A[j]!, B[j]!, B[i]!], color);
    }
    // Caps face outward along the axis: +w at `b`, -w at `a`.
    if (r1 > 1e-4) this.face(B, capColor ?? color);
    if (r0 > 1e-4) this.face([...A].reverse(), capColor ?? color);
  }

  /** Vertical elliptical frustum from y0 to y1 (radii per end), faceted. */
  vprism(x: number, z: number, y0: number, y1: number, rx0: number, rz0: number, rx1: number, rz1: number,
    sides: number, color: Rgb, cap?: Rgb, twist = 0): void {
    const ring = (y: number, rx: number, rz: number): P3[] => Array.from({ length: sides }, (_, i) => {
      const t = (i / sides) * Math.PI * 2 + twist;
      return [x + Math.cos(t) * rx, y, z + Math.sin(t) * rz] as P3;
    });
    const A = ring(y0, rx0, rz0), B = ring(y1, rx1, rz1);
    for (let i = 0; i < sides; i++) { const j = (i + 1) % sides; this.face([A[j]!, A[i]!, B[i]!, B[j]!], color); }
    if (cap) this.face([...B].reverse(), cap);
  }

  /** Tube along a path (faceted segments). */
  tube(path: readonly P3[], r: number, sides: number, color: Rgb): void {
    for (let i = 0; i < path.length - 1; i++) this.frustum(path[i]!, path[i + 1]!, r, r, sides, color, color);
  }

  /** Low-poly ellipsoid with per-face normals (faceted gem / boulder look). */
  ellipsoid(c: P3, r: P3, color: Rgb, rings = 4, segments = 7, jitter?: (i: number) => number): void {
    const pt = (i: number, j: number): P3 => {
      const phi = (i / rings) * Math.PI, th = (j / segments) * Math.PI * 2;
      const k = jitter && i > 0 && i < rings ? jitter(i * 31 + (j % segments)) : 1;
      return [c[0] + Math.sin(phi) * Math.cos(th) * r[0] * k, c[1] + Math.cos(phi) * r[1] * k, c[2] + Math.sin(phi) * Math.sin(th) * r[2] * k];
    };
    for (let i = 0; i < rings; i++) for (let j = 0; j < segments; j++) {
      const a = pt(i, j), b = pt(i, j + 1), d = pt(i + 1, j + 1), e = pt(i + 1, j);
      if (i === 0) this.face([a, d, e], color);
      else if (i === rings - 1) this.face([a, b, e], color);
      else this.face([a, b, d, e], color);
    }
  }

  /** Two-sided ribbon leaf from a centre line with widths. */
  leaf(path: readonly P3[], widths: readonly number[], across: P3, color: Rgb, edge: Rgb): void {
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i]!, b = path[i + 1]!, wa = widths[i]!, wb = widths[i + 1]!;
      const l = (p: P3, w: number): P3 => [p[0] - across[0] * w, p[1] - across[1] * w, p[2] - across[2] * w];
      const r = (p: P3, w: number): P3 => [p[0] + across[0] * w, p[1] + across[1] * w, p[2] + across[2] * w];
      this.face([l(a, wa), a, b, l(b, wb)], color);
      this.face([a, r(a, wa), r(b, wb), b], i % 2 ? edge : color);
    }
  }

  /** Copy the geometry, promoting plain alpha 1 to contour ink 1 + contour. */
  finish(name: string, contour = 0): MeshRecipe {
    const colors = new Float32Array(this.colors);
    if (contour > 0) for (let i = 3; i < colors.length; i += 4) if (colors[i] === 1) colors[i] = 1 + contour;
    const n = this.vertexCount;
    return {
      name, positions: new Float32Array(this.positions), normals: new Float32Array(this.normals), colors,
      indices: n > 65535 ? new Uint32Array(this.indices) : new Uint16Array(this.indices),
    };
  }
}

/** Babylon-layout instance matrix: scale, tilt about X, tilt about Z, yaw
 * about +Y, then translate. Rows 0..2 hold the images of the template's X/Y/Z
 * axes (row-vector convention), translation sits at 12..14. Allocation-free:
 * scatter writes tens of thousands of these per chunk. */
export function writeInstance(out: Float32Array, at: number, x: number, y: number, z: number, yaw: number,
  s: number, tiltX = 0, tiltZ = 0): void {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(tiltX), sx = Math.sin(tiltX), cz = Math.cos(tiltZ), sz = Math.sin(tiltZ);
  out[at] = cz * cy * s; out[at + 1] = sz * s; out[at + 2] = -cz * sy * s; out[at + 3] = 0;
  out[at + 4] = (-cx * sz * cy + sx * sy) * s; out[at + 5] = cx * cz * s; out[at + 6] = (cx * sz * sy + sx * cy) * s; out[at + 7] = 0;
  out[at + 8] = (sx * sz * cy + cx * sy) * s; out[at + 9] = -sx * cz * s; out[at + 10] = (-sx * sz * sy + cx * cy) * s; out[at + 11] = 0;
  out[at + 12] = x; out[at + 13] = y; out[at + 14] = z; out[at + 15] = 1;
}

/** Apply an instance matrix to a template-local point (row-vector convention). */
export function transformPoint(m: Float32Array, at: number, p: P3): P3 {
  return [p[0] * m[at]! + p[1] * m[at + 4]! + p[2] * m[at + 8]! + m[at + 12]!,
    p[0] * m[at + 1]! + p[1] * m[at + 5]! + p[2] * m[at + 9]! + m[at + 13]!,
    p[0] * m[at + 2]! + p[1] * m[at + 6]! + p[2] * m[at + 10]! + m[at + 14]!];
}
