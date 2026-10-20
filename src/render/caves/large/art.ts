import type { LodLevel } from "../../../world/types.js";
import type { MeshRecipe } from "../../kit/types.js";
import type { LargeCave } from "../../../world/caves/large/build.js";
import { wallNoise } from "../../../world/caves/large/field.js";
import type { LifePlacement } from "../../../world/caves/large/life.js";
import { vertexLight, type LightGrid } from "../../../world/caves/large/light.js";
import { chunkKey, type ChunkCoord, type ChunkMesh } from "../../../world/caves/large/mesh.js";

/** Cave-biome chunk art as plain recipes (Babylon-free).
 *
 * The rock recipe is the chunk mesh itself (the fine one is the collision
 * mesh) with cel colours from the zone palette by facing, plus a per-vertex
 * `light` attribute: [daylight, glow r, g, b] from the light grid, sampled
 * in front of each vertex. Life is a separate unlit mesh (alpha -1), drawn
 * at fine only; its glow is already in the rock's light at both LODs. */

export interface CaveRecipe {
  readonly mesh: MeshRecipe;
  /** 4 floats per vertex. */
  readonly light: Float32Array;
}
export interface CaveChunkArt {
  readonly key: string;
  readonly coord: ChunkCoord;
  readonly fine: CaveRecipe;
  readonly coarse: CaveRecipe;
  /** Unlit life at fine, or null. Its `light` is all glow. */
  readonly life: CaveRecipe | null;
}

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const SAND: Rgb = hex("#9db8a4"), SAND2: Rgb = hex("#8aa894"), LIP: Rgb = hex("#c7b38d");

/** Rock colours for a chunk mesh. Alpha: 0 floors (ground relief), 1 walls
 * and ceilings, 2 (grazing ink) on the rim of each exterior opening. */
export function rockColors(cave: LargeCave, m: ChunkMesh, light: Float32Array): Float32Array {
  const zones = cave.source.zones.map(z => ({ floor: hex(z.palette.floor), wall: hex(z.palette.wall), ceiling: hex(z.palette.ceiling), accent: hex(z.palette.accent) }));
  const P = m.positions, N = m.normals, Z = m.zones, out = new Float32Array(P.length / 3 * 4);
  const mouths = cave.source.portals.filter(p => p.between.includes("exterior"));
  for (let v = 0; v < P.length / 3; v++) {
    const x = P[v * 3]!, y = P[v * 3 + 1]!, z = P[v * 3 + 2]!, ny = N[v * 3 + 1]!, zone = Z[v]! - 1;
    const grain = wallNoise(x * 1.7, y * 1.7, z * 1.7, 9001), patch = wallNoise(x * 0.35, y * 0.2, z * 0.35, 9002);
    let c: Rgb, alpha = 1;
    if (zone < 0) {
      c = mix(SAND, SAND2, 0.5 + 0.5 * patch); alpha = ny > 0.6 ? 0 : 1;
      if (ny <= 0.6) c = mix(c, LIP, 0.35);
    } else {
      const p = zones[zone]!;
      c = ny > 0.55 ? mix(p.floor, p.wall, 0.25 + 0.25 * patch) : ny < -0.4 ? p.ceiling : mix(p.wall, p.ceiling, 0.3 + 0.3 * patch);
      if (ny > 0.55) alpha = 0;
      // Stains where life lights the rock.
      const g = light[v * 4 + 1]! + light[v * 4 + 2]! + light[v * 4 + 3]!;
      if (g > 0.12) c = mix(c, p.accent, Math.min(0.32, (g - 0.12) * 0.5));
    }
    // Ink round each opening's lip so a mouth reads at distance.
    for (const mo of mouths) {
      const d = Math.hypot(x - mo.center.x, y - mo.center.y, z - mo.center.z), r = Math.max(mo.clear.width, mo.clear.height) / 2;
      if (zone < 0 && d > r * 0.8 && d < r * 1.25) alpha = 2;
    }
    const k = 1 + grain * 0.07;
    out[v * 4] = c[0] * k; out[v * 4 + 1] = c[1] * k; out[v * 4 + 2] = c[2] * k; out[v * 4 + 3] = alpha;
  }
  return out;
}

export function rockRecipe(cave: LargeCave, grid: LightGrid, m: ChunkMesh): CaveRecipe {
  const light = vertexLight(grid, m.positions, m.normals, m.lod === "fine" ? 0.6 : 1.3);
  return { mesh: { name: `${cave.id}.${m.key}.${m.lod}`, positions: m.positions, normals: m.normals, colors: rockColors(cave, m, light),
    indices: m.positions.length / 3 > 65535 ? m.indices : new Uint16Array(m.indices) }, light };
}

// --- Life ------------------------------------------------------------------------

interface Builder { p: number[]; n: number[]; c: number[]; i: number[] }
function basis(nx: number, ny: number, nz: number, spin: number): { t: Rgb; b: Rgb } {
  const ref: Rgb = Math.abs(ny) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let t: Rgb = [ref[1] * nz - ref[2] * ny, ref[2] * nx - ref[0] * nz, ref[0] * ny - ref[1] * nx];
  const tl = Math.hypot(...t); t = [t[0] / tl, t[1] / tl, t[2] / tl];
  const b: Rgb = [ny * t[2] - nz * t[1], nz * t[0] - nx * t[2], nx * t[1] - ny * t[0]];
  const cs = Math.cos(spin), sn = Math.sin(spin);
  return { t: [t[0] * cs + b[0] * sn, t[1] * cs + b[1] * sn, t[2] * cs + b[2] * sn], b: [b[0] * cs - t[0] * sn, b[1] * cs - t[1] * sn, b[2] * cs - t[2] * sn] };
}
function quad(B: Builder, a: Rgb, b: Rgb, c: Rgb, d: Rgb, n: Rgb, col: Rgb): void {
  const base = B.p.length / 3;
  for (const v of [a, b, c, d]) { B.p.push(...v); B.n.push(...n); B.c.push(col[0], col[1], col[2], -1); }
  B.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
function tri(B: Builder, a: Rgb, b: Rgb, c: Rgb, n: Rgb, col: Rgb): void {
  const base = B.p.length / 3;
  for (const v of [a, b, c]) { B.p.push(...v); B.n.push(...n); B.c.push(col[0], col[1], col[2], -1); }
  B.i.push(base, base + 1, base + 2);
}
const add = (a: Rgb, b: Rgb, s: number): Rgb => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

function lifeGeometry(B: Builder, p: LifePlacement, color: Rgb): void {
  const o: Rgb = [p.position.x, p.position.y, p.position.z], n: Rgb = [p.normal.x, p.normal.y, p.normal.z];
  const { t, b } = basis(n[0], n[1], n[2], p.spin), s = p.size;
  const dim = mix(color, [0.05, 0.1, 0.12], 0.45);
  if (p.kind === "frond") {
    // Three crossed blades leaning off the floor, bright at the tips.
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI / 3, dir = add([t[0] * Math.cos(a), t[1] * Math.cos(a), t[2] * Math.cos(a)], b, Math.sin(a));
      const w = 0.12 * s, h = 1.3 * s, lean = add(add(o, n, h), dir, 0.25 * s);
      quad(B, add(o, dir, -w), add(o, dir, w), add(lean, dir, w * 0.4), add(lean, dir, -w * 0.4), [dir[1] * n[2] - dir[2] * n[1], dir[2] * n[0] - dir[0] * n[2], dir[0] * n[1] - dir[1] * n[0]], k ? color : mix(color, [1, 1, 1], 0.2));
    }
  } else if (p.kind === "root_tip") {
    // A hanging tapered prism (normal points down from a ceiling).
    const len = 0.9 * s, w = 0.16 * s, tip = add(o, n, len);
    const ring = [t, b, [-t[0], -t[1], -t[2]] as Rgb, [-b[0], -b[1], -b[2]] as Rgb];
    for (let k = 0; k < 4; k++) {
      const u = ring[k]!, v = ring[(k + 1) % 4]!;
      quad(B, add(o, u, w), add(o, v, w), add(tip, v, w * 0.25), add(tip, u, w * 0.25), add(u, v, 1), k % 2 ? color : dim);
    }
  } else if (p.kind === "colony") {
    // A low six-sided blob on the wall.
    const r = 0.3 * s, top = add(o, n, 0.12 * s);
    for (let k = 0; k < 6; k++) {
      const a0 = k * Math.PI / 3, a1 = (k + 1) * Math.PI / 3;
      const u = add([t[0] * Math.cos(a0), t[1] * Math.cos(a0), t[2] * Math.cos(a0)], b, Math.sin(a0));
      const v = add([t[0] * Math.cos(a1), t[1] * Math.cos(a1), t[2] * Math.cos(a1)], b, Math.sin(a1));
      tri(B, top, add(o, u, r), add(o, v, r), n, k % 2 ? color : dim);
    }
  } else {
    // Silt glow: a flat irregular patch just off the floor.
    const r = 0.7 * s, c0 = add(o, n, 0.04);
    for (let k = 0; k < 6; k++) {
      const a0 = k * Math.PI / 3, a1 = (k + 1) * Math.PI / 3, r0 = r * (0.7 + 0.3 * ((k * 37) % 5) / 4), r1 = r * (0.7 + 0.3 * (((k + 1) * 37) % 5) / 4);
      const u = add([t[0] * Math.cos(a0), t[1] * Math.cos(a0), t[2] * Math.cos(a0)], b, Math.sin(a0));
      const v = add([t[0] * Math.cos(a1), t[1] * Math.cos(a1), t[2] * Math.cos(a1)], b, Math.sin(a1));
      tri(B, c0, add(c0, u, r0), add(c0, v, r1), n, mix(color, dim, 0.3));
    }
  }
}

export function lifeRecipe(cave: LargeCave, coord: ChunkCoord, life: readonly LifePlacement[]): CaveRecipe | null {
  const l = cave.lattice, o = l.origin, C = l.chunk, B: Builder = { p: [], n: [], c: [], i: [] };
  for (const p of life) {
    if (Math.floor((p.position.x - o.x) / C) !== coord.cx || Math.floor((p.position.y - o.y) / C) !== coord.cy || Math.floor((p.position.z - o.z) / C) !== coord.cz) continue;
    lifeGeometry(B, p, hex(cave.source.life[p.group]!.color));
  }
  if (!B.i.length) return null;
  const positions = new Float32Array(B.p), light = new Float32Array(positions.length / 3 * 4);
  return { mesh: { name: `${cave.id}.${chunkKey(coord)}.life`, positions, normals: new Float32Array(B.n), colors: new Float32Array(B.c),
    indices: positions.length / 3 > 65535 ? new Uint32Array(B.i) : new Uint16Array(B.i) }, light };
}

/** Every chunk's art (needs every fine mesh, the life and the light grid). */
export function caveArt(cave: LargeCave, grid: LightGrid, life: readonly LifePlacement[]): CaveChunkArt[] {
  return cave.chunks.map(c => ({
    key: chunkKey(c), coord: c,
    fine: rockRecipe(cave, grid, cave.mesh(c, "fine")),
    coarse: rockRecipe(cave, grid, cave.mesh(c, "coarse")),
    life: lifeRecipe(cave, c, life),
  }));
}
export const recipeOf = (art: CaveChunkArt, lod: LodLevel): CaveRecipe => art[lod];
