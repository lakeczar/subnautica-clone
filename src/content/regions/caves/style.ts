import type { CaveDef } from "../caves.js";
import { caveShell, caveVolume } from "../caveGeometry.js";
import { fbm, smooth } from "../noise.js";
import type { MeshRecipe } from "../../../render/kit/types.js";
import type { LodLevel } from "../../../world/types.js";
import type { CaveGroup } from "./authored.js";

/** Region cave styles for the shell (Babylon-free): the kit's shell with
 * each region's own palette and wayfinding cues. Positions, normals and
 * indices are the kit's own arrays, so rock and shell still agree; only the
 * per-vertex colour changes. Cel alpha keeps the kit's meanings: 0 ground,
 * 1 lit, -1 unlit (self-lit), and stays an integer for the terrain codec.
 *
 * - Root hollow (Lantern Canopy): holdfast roots braided over mineral ribs.
 *   Bark and rib bands outside; petrol and violet inside, black overhead;
 *   amber root colonies just inside each mouth; sparse mint root tips, the
 *   only landmarks in the dark.
 * - Silt vault (Pale Basin): shell-grey sediment in worked layers outside;
 *   grey walls and soft pale floors inside; a cool grey glow just inside each
 *   mouth. The wake itself (`wakeglow.ts`) is drawn by the renderer.
 *
 * INTEGRATION: the bake takes `styledShell(def, lod, group.style)` where the
 * kit takes `caveShell(def, lod)`, then clips per column as before. */

type Rgb = readonly [number, number, number];
const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

interface Palette {
  readonly top: Rgb; readonly top2: Rgb; readonly bandA: Rgb; readonly bandB: Rgb; readonly sand: Rgb;
  readonly wall: Rgb; readonly wall2: Rgb; readonly ceiling: Rgb; readonly floor: Rgb; readonly floor2: Rgb;
  readonly mouthGlow: Rgb; readonly tip: Rgb | null;
  /** Band period outside, metres, and how much the bands lean (root braids lean, sediment layers lie flat). */
  readonly band: number; readonly lean: number;
}
const PALETTES: Record<CaveGroup["style"], Palette> = {
  root_hollow: {
    top: hex("#5f7a5c"), top2: hex("#6d8562"), bandA: hex("#7a5a3c"), bandB: hex("#6f7d74"), sand: hex("#9fb79a"),
    wall: hex("#2f4b55"), wall2: hex("#4a3d5c"), ceiling: hex("#262f3b"), floor: hex("#4f5f58"), floor2: hex("#46564f"),
    mouthGlow: hex("#ffb45e"), tip: hex("#8ff0c8"), band: 1.1, lean: 0.9,
  },
  silt_vault: {
    top: hex("#c4c6bb"), top2: hex("#b6b9ae"), bandA: hex("#a9aca3"), bandB: hex("#93978f"), sand: hex("#b3b6aa"),
    wall: hex("#5d6461"), wall2: hex("#535a58"), ceiling: hex("#474d4c"), floor: hex("#8d918a"), floor2: hex("#83877f"),
    mouthGlow: hex("#d8e2dc"), tip: null, band: 0.8, lean: 0,
  },
};

const styled = new WeakMap<CaveDef, Partial<Record<string, MeshRecipe>>>();
/** The cave's shell at one LOD in its region's style. Built once per
 * definition, LOD and style. */
export function styledShell(def: CaveDef, lod: LodLevel, style: CaveGroup["style"]): MeshRecipe {
  const key = `${lod}:${style}`, cached = styled.get(def)?.[key];
  if (cached) return cached;
  const shell = caveShell(def, lod), p = PALETTES[style], v = caveVolume(def), g = v.grid;
  const P = shell.positions, N = shell.normals, colors = new Float32Array(shell.colors.length);
  const mouths = def.portals.filter(m => m.kind === "mouth"), f = def.replacementFootprints[0]!;
  const roomAt = (x: number, y: number, z: number): number => {
    const i = Math.floor((x - g.origin.x) / g.voxel), j = Math.floor((y - g.origin.y) / g.voxel), k = Math.floor((z - g.origin.z) / g.voxel);
    return i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz ? 0 : v.room[i + g.nx * (j + g.ny * k)]!;
  };
  for (let n = 0; n < P.length / 3; n++) {
    const x = P[n * 3]!, y = P[n * 3 + 1]!, z = P[n * 3 + 2]!, nx = N[n * 3]!, ny = N[n * 3 + 1]!, nz = N[n * 3 + 2]!;
    const fine = fbm(x + y, z - y, 3, 2, 7202), patch = fbm(x, z, 9, 2, 7201);
    // Inside when the water in front of the surface is cave water.
    const inside = roomAt(x + nx * 0.4, y + ny * 0.4, z + nz * 0.4) !== 0 || roomAt(x + nx * 0.9, y + ny * 0.9, z + nz * 0.9) !== 0;
    let c: Rgb, alpha: number;
    if (inside) {
      if (ny > 0.55) { c = mix(p.floor, p.floor2, smooth(-0.2, 0.4, patch)); alpha = 0; }
      else if (ny < -0.45) { c = p.ceiling; alpha = 1; }
      else { c = mix(p.wall, p.wall2, smooth(-0.3, 0.3, fine)); alpha = 1; }
      // Colonies just inside each mouth: the exit glows from inside.
      for (const m of mouths) {
        const inward = m.normal.y !== 0 ? { x: 0, y: -2.5, z: 0 } : { x: -m.normal.x * 3, y: 0, z: -m.normal.z * 3 };
        const d = Math.hypot(x - m.center.x - inward.x, y - m.center.y - inward.y, z - m.center.z - inward.z);
        if (d < 4.4 && ny < 0.5 && fbm(x * 1.7, z * 1.7 + y, 2.2, 2, 7203) > 0.16 + 0.36 * d / 4.4) { c = p.mouthGlow; alpha = -1; }
      }
      // Root tips: sparse self-lit points on walls and ceilings.
      if (p.tip && alpha !== -1 && ny < 0.4 && fbm(x * 2.3 + z, y * 2.3 - x, 1.6, 2, 7204) > 0.66) { c = p.tip; alpha = -1; }
    } else {
      // Outside: bands (leaning root braids, or flat sediment layers) and level tops.
      const level = ny > 0.72;
      const phase = (y + p.lean * (x * 0.6 + z * 0.4) * (1 - Math.abs(ny)) + 1.4 * fbm(x, z, 12, 2, 7205)) / p.band;
      const stone = level ? mix(p.top, p.top2, smooth(-0.25, 0.35, patch)) : Math.floor(phase) % 2 === 0 ? p.bandA : p.bandB;
      // Towards the footprint edge the shell meets the seabed: fade to sand.
      const edge = Math.min(x - f.minX, f.maxX - x, z - f.minZ, f.maxZ - z);
      c = mix(p.sand, stone, smooth(0.5, 3, edge));
      alpha = level ? 0 : 1;
    }
    const k = 1 + fine * 0.05;
    colors[n * 4] = c[0] * k; colors[n * 4 + 1] = c[1] * k; colors[n * 4 + 2] = c[2] * k; colors[n * 4 + 3] = alpha;
  }
  const out: MeshRecipe = { name: shell.name, positions: shell.positions, normals: shell.normals, colors, indices: shell.indices };
  styled.set(def, { ...styled.get(def), [key]: out });
  return out;
}
