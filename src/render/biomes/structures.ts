import type { ChunkArtFactory, MeshRecipe } from "../kit/types.js";
import { STRUCTURES, type StructureDef } from "../../content/regions/structures.js";
import { MERIDIAN_CENTRE, MERIDIAN_TERRACES, MERIDIAN_WALL } from "../../content/regions/terrain.js";
import { hash2 } from "../../content/regions/noise.js";
import { PALETTE } from "../palette.js";
import { hex, mix, RecipeBuilder, type P3 } from "./recipe.js";

/** `s2.structures`: cel art for authored structures, drawn inside the same
 * dimensions as their collision solids (content/regions/structures.ts), so
 * what blocks a hull is what the player sees. Lit windows, lamps and the
 * chimney's warm seam use the unlit alpha slot. */
const C = {
  porcelain: hex(PALETTE.porcelain), petrol: hex(PALETTE.petrol), ochre: hex(PALETTE.ochre), metal: hex(PALETTE.metal),
  steel: hex(PALETTE.steelLight), shell: hex(PALETTE.shell), basalt: hex(PALETTE.basalt), stone: hex(PALETTE.stoneLight),
  warm: hex(PALETTE.warm), seam: hex("#ff9a4a"), ember: hex("#c4552c"), pale: hex("#cfd9cf"), pale2: hex("#b3c4bb"),
  dark: hex("#2b3a44"), slate: hex("#56607c"), slate2: hex("#6c7795"), concrete: hex("#8e9a98"), concrete2: hex("#a7b0aa"),
  glow: hex("#ffd27a"), cyan: hex("#9fe6e0"), rust: hex("#a8743f"),
} as const;

type Draw = (b: RecipeBuilder, s: StructureDef, fine: boolean) => void;
const glow = (b: RecipeBuilder, f: () => void): void => { const a = b.alpha; b.alpha = -1; f(); b.alpha = a; };

const DRAW: Readonly<Record<StructureDef["kind"], Draw>> = {
  mast(b, s, fine) {
    const { x, z, base } = s, h = s.p.h!, half = s.p.w! / 2 - 0.15, top = 0.45;
    const legs: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [u, w] of legs) b.frustum([x + u * half, base, z + w * half], [x + u * top, base + h * 0.92, z + w * top], 0.09, 0.06, 4, C.steel);
    for (let y = 2; y < h * 0.9; y += fine ? 3.5 : 7) {
      const r = half + (top - half) * (y / (h * 0.92));
      for (let i = 0; i < 4; i++) {
        const [u0, w0] = legs[i]!, [u1, w1] = legs[(i + 1) % 4]!;
        b.tube([[x + u0 * r, base + y, z + w0 * r], [x + u1 * r, base + y + 1.6, z + w1 * r]], 0.04, 3, i % 2 ? C.steel : C.ochre);
      }
    }
    // The broken top: a bent mast head and a torn relay dish.
    b.frustum([x, base + h * 0.92, z], [x + 0.9, base + h - 0.3, z - 0.4], 0.12, 0.05, 4, C.ochre);
    b.frustum([x - 0.2, base + h * 0.72, z + 0.6], [x - 0.5, base + h * 0.72 + 0.6, z + 1.3], 0.15, 1.1, fine ? 8 : 5, C.porcelain, C.metal);
    glow(b, () => b.box([x + 0.9, base + h - 0.25, z - 0.4], [0.3, 0.3, 0.3], C.seam));
  },
  hut(b, s, fine) {
    const { x, z, base } = s, w = s.p.w!, h = s.p.h!, d = s.p.d!;
    b.box([x, base + h / 2, z], [w, h, d], C.porcelain, 0, C.petrol);
    if (fine) {
      b.box([x, base + h + 0.08, z], [w + 0.3, 0.16, d + 0.3], C.petrol);
      b.box([x, base + h * 0.42, z - d / 2 - 0.03], [w * 0.36, h * 0.8, 0.05], C.metal);
      glow(b, () => b.box([x + w * 0.3, base + h * 0.68, z - d / 2 - 0.04], [w * 0.18, h * 0.16, 0.04], C.warm));
    }
  },
  pier(b, s) {
    const sol = s.solids[0]!;
    b.aabb([sol.min.x, sol.min.y, sol.min.z], [sol.max.x, sol.max.y, sol.max.z], C.metal, C.shell);
    for (let zz = sol.min.z + 1; zz < sol.max.z; zz += 5) for (const xx of [sol.min.x + 0.4, sol.max.x - 0.4])
      b.frustum([xx, sol.min.y, zz], [xx, sol.min.y - 6, zz], 0.18, 0.18, 4, C.petrol);
  },
  cradle(b, s) {
    const sol = s.solids[0]!, x = (sol.min.x + sol.max.x) / 2;
    for (let zz = sol.min.z + 1; zz <= sol.max.z - 1; zz += 7.5) b.aabb([x - 0.9, sol.min.y, zz - 0.4], [x + 0.9, sol.max.y, zz + 0.4], C.ochre);
    b.aabb([sol.min.x, sol.max.y - 1, sol.min.z], [sol.max.x, sol.max.y, sol.max.z], C.petrol);
    b.aabb([sol.min.x, sol.max.y - 9, sol.min.z], [sol.max.x, sol.max.y - 8.3, sol.max.z], C.steel);
  },
  shelter(b, s, fine) {
    for (const sol of s.solids) b.aabb([sol.min.x, sol.min.y, sol.min.z], [sol.max.x, sol.max.y, sol.max.z], C.shell, C.petrol);
    if (fine) glow(b, () => {
      b.box([s.x, s.base + 2.3, s.z + 2.9], [2.4, 0.5, 0.1], C.warm);
      b.box([s.x + 2.5, s.base + 2.6, s.z - 3.6], [0.25, 0.25, 0.25], C.glow);
    });
  },
  pylon(b, s, fine) {
    const { x, z, base } = s, h = s.p.h!;
    b.frustum([x, base, z], [x, base + h, z], 0.95, 0.4, fine ? 6 : 4, C.petrol, C.steel);
    for (let y = 2; y < h - 1; y += 4) b.frustum([x, base + y, z], [x, base + y + 0.8, z], 0.9 - y * 0.03, 0.88 - y * 0.03, fine ? 6 : 4, C.ochre);
    glow(b, () => b.box([x, base + h + 0.2, z], [0.55, 0.4, 0.55], C.glow));
  },
  dish(b, s, fine) {
    const R = s.p.radius!, tilt = s.p.tilt!, face = s.p.facing!, seg = fine ? 18 : 10, rings = fine ? 6 : 3;
    const c: P3 = [s.x, s.base + 2.2, s.z];
    const ax: P3 = [Math.cos(face), 0, Math.sin(face)];
    const rot = (p: P3): P3 => {
      // Tilt about the horizontal axis perpendicular to `facing`.
      const along = p[0] * ax[0] + p[2] * ax[2], perp: P3 = [p[0] - along * ax[0], 0, p[2] - along * ax[2]];
      const ca = Math.cos(tilt), sa = Math.sin(tilt);
      const a2 = along * ca - p[1] * sa, y2 = along * sa + p[1] * ca;
      return [c[0] + perp[0] + a2 * ax[0], c[1] + y2 + Math.sin(tilt) * R * 0.5, c[2] + perp[2] + a2 * ax[2]];
    };
    const ring = (k: number): P3[] => Array.from({ length: seg }, (_, i) => {
      const r = R * k / rings, t = i / seg * Math.PI * 2;
      return rot([Math.cos(t) * r, (r * r) / R * 0.32, Math.sin(t) * r]);
    });
    let prev = Array.from({ length: seg }, () => rot([0, 0, 0]));
    for (let k = 1; k <= rings; k++) {
      const cur = ring(k);
      for (let i = 0; i < seg; i++) {
        const j = (i + 1) % seg;
        const col = (k + (i >> 1)) % 3 === 0 ? C.shell : C.porcelain;
        b.face([prev[j]!, cur[j]!, cur[i]!, prev[i]!], hash2(i, k, s.id.length) > 0.82 ? C.steel : col);
      }
      prev = cur;
    }
    b.tube([...prev, prev[0]!], 0.35, 4, C.petrol);
    // Feed tripod and horn over the bowl; grounding fins under the rim.
    const focus = rot([0, R * 0.62, 0]);
    for (let i = 0; i < 3; i++) b.tube([prev[Math.floor(i * seg / 3)]!, focus], 0.18, 4, C.metal);
    b.frustum(focus, rot([0, R * 0.55, 0]), 0.9, 0.5, 6, C.ochre);
    b.aabb([s.x - R * 0.14, s.base, s.z - R * 0.14], [s.x + R * 0.14, s.base + 3.2, s.z + R * 0.14], C.petrol);
    for (let i = 0; i < (fine ? 10 : 4); i++) {
      const t = (i + 0.3) / (fine ? 10 : 4) * Math.PI * 2, p = prev[Math.floor(t / (Math.PI * 2) * seg) % seg]!;
      b.box([p[0], p[1] - 1.2, p[2]], [0.18, 1.6, 1.4], C.metal, t);
    }
  },
  girder(b, s, fine) {
    const sol = s.solids[0]!, lx = sol.max.x - sol.min.x, lz = sol.max.z - sol.min.z;
    const along = lx > lz, len = along ? lx : lz, n = Math.max(2, Math.round(len / 2.5));
    const lo = sol.min.y + 0.3, hi = sol.max.y - 0.3;
    const p = (t: number, side: number, y: number): P3 => along
      ? [sol.min.x + t * lx, y, (sol.min.z + sol.max.z) / 2 + side * (lz / 2 - 0.3)]
      : [(sol.min.x + sol.max.x) / 2 + side * (lx / 2 - 0.3), y, sol.min.z + t * lz];
    for (const side of [-1, 1]) { b.tube([p(0.02, side, lo), p(0.98, side, lo)], 0.16, 4, C.rust); b.tube([p(0.02, side, hi), p(0.9, side, hi * 0.97 + lo * 0.03)], 0.14, 4, C.metal); }
    if (fine) for (let i = 0; i < n; i++) {
      const t0 = 0.02 + i / n * 0.94, t1 = t0 + 0.94 / n;
      b.tube([p(t0, -1, lo), p(t1, -1, hi)], 0.07, 3, C.steel); b.tube([p(t0, 1, hi), p(t1, 1, lo)], 0.07, 3, C.steel);
    }
    b.box(p(0.5, 0, (lo + hi) / 2), along ? [0.8, 0.5, 0.05] : [0.05, 0.5, 0.8], C.ochre);
  },
  post(b, s) {
    const { x, z, base } = s, w = s.p.w!, h = s.p.h!, d = s.p.d!;
    if (w > 1.5) { b.box([x, base + h * 0.65, z], [w, h * 0.6, d], C.porcelain, 0, C.ochre); b.frustum([x, base, z], [x, base + h * 0.4, z], 0.1, 0.1, 4, C.petrol); }
    else { b.frustum([x, base, z], [x, base + h, z], w / 2, w / 3, 5, C.petrol); b.box([x, base + h, z], [w * 1.6, 0.2, w * 1.6], C.ochre); }
  },
  split_chimney(b, s, fine) {
    // Each half is a stack of eroded elliptical layers inscribed in its
    // collision boxes, so the column tapers and bulges like built-up mineral.
    for (let k = 0; k < s.solids.length; k++) {
      const sol = s.solids[k]!, layer = fine ? 6 : 20, sides = fine ? 9 : 6;
      const cx = (sol.min.x + sol.max.x) / 2, cz = (sol.min.z + sol.max.z) / 2;
      const hx = (sol.max.x - sol.min.x) / 2, hz = (sol.max.z - sol.min.z) / 2;
      const radius = (y: number): number => 0.72 + 0.16 * Math.sin(y * 0.09 + k * 2) + 0.08 * hash2(Math.floor(y / layer), k, 9);
      for (let y = sol.min.y; y < sol.max.y - 1e-6; y += layer) {
        const y1 = Math.min(sol.max.y, y + layer), t = (y - s.base) / (s.p.top! - s.base);
        const r0 = Math.min(0.98, radius(y)), r1 = Math.min(0.98, radius(y1));
        const col = mix(mix(C.dark, C.basalt, hash2(Math.floor(y / layer), k, 5) * 0.5 + 0.5), C.stone, t * 0.55);
        b.vprism(cx, cz, y, y1, hx * r0, hz * r0, hx * r1, hz * r1, sides, col, undefined, k * 0.4);
        if (fine && hash2(Math.floor(y / layer), k, 11) > 0.45)
          b.vprism(cx, cz, y1 - 0.8, y1 + 0.4, hx * Math.min(0.99, r1 + 0.06), hz * Math.min(0.99, r1 + 0.06), hx * r1, hz * r1, sides, C.pale2, undefined, k * 0.4);
      }
    }
    // Warm seam in the split and the glowing rims of the twin vents.
    glow(b, () => {
      b.aabb([-166.4, s.base + 4, -1080], [-163.6, -330, -1050], C.seam);
      for (const cx of [-180, -150]) b.frustum([cx, -300.2, -1065], [cx, -299.6, -1065], 8, 7, fine ? 10 : 6, C.ember);
    });
  },
  chimney_stub(b, s, fine) {
    const { x, z, base } = s, r = s.p.w! / 2 - 0.2, h = s.p.h!, n = fine ? 9 : 6;
    const layer = fine ? 1.6 : 4;
    for (let y = 0; y < h; y += layer) {
      const t0 = y / h, t1 = Math.min(1, (y + layer) / h);
      b.frustum([x, base + y, z], [x, base + Math.min(h, y + layer), z], r * (1 - t0 * 0.35), r * (1 - t1 * 0.35), n,
        hash2(Math.floor(y / layer), 3, s.id.length) > 0 ? C.pale : C.pale2, C.dark, y * 0.2);
    }
    b.frustum([x, base + h, z], [x, base + h + 0.6, z], r * 0.68, r * 0.74, n, C.pale, C.dark);
  },
  station(b, s, fine) {
    const sol = s.solids[0]!, cx = s.x, cz = s.z, w = s.p.w!, h = s.p.h!, d = s.p.d!;
    // Rounded roof whose crown touches the collider's top, never above it.
    const roof = Math.min(d / 2 - 0.6, h / 2), axis = sol.max.y - roof;
    b.aabb([sol.min.x + 0.3, sol.min.y, sol.min.z + 0.3], [sol.max.x - 0.3, axis, sol.max.z - 0.3], C.porcelain);
    b.frustum([sol.min.x + 0.6, axis, cz], [sol.max.x - 0.6, axis, cz], roof, roof, fine ? 8 : 5, C.porcelain, C.petrol);
    b.aabb([sol.min.x, sol.min.y, sol.min.z], [sol.max.x, sol.min.y + 0.6, sol.max.z], C.petrol);
    if (fine) glow(b, () => {
      for (let i = 0; i < 4; i++) b.box([sol.min.x + 2.2 + i * (w - 4.4) / 3, sol.min.y + h * 0.45, sol.min.z - 0.02], [0.8, 0.8, 0.06], C.warm);
      b.box([cx, sol.min.y + 1.5, sol.max.z + 0.02], [1.4, 2.4, 0.06], C.glow);
    });
  },
  tower(b, s, fine) {
    const sol = s.solids[0]!;
    b.aabb([sol.min.x + 0.6, sol.min.y, sol.min.z + 0.6], [sol.max.x - 0.6, sol.max.y - 2, sol.max.z - 0.6], C.slate);
    b.aabb([sol.min.x, sol.max.y - 2, sol.min.z], [sol.max.x, sol.max.y, sol.max.z], C.slate2);
    for (let y = sol.min.y + 10; y < sol.max.y - 4; y += 12) b.aabb([sol.min.x, y, sol.min.z], [sol.max.x, y + 1.2, sol.max.z], C.slate2);
    if (fine) for (const u of [0.2, 0.5, 0.8]) {
      const xx = sol.min.x + u * (sol.max.x - sol.min.x);
      b.aabb([xx - 0.4, sol.min.y, sol.min.z], [xx + 0.4, sol.max.y - 2, sol.min.z + 0.6], C.steel);
      b.aabb([xx - 0.4, sol.min.y, sol.max.z - 0.6], [xx + 0.4, sol.max.y - 2, sol.max.z], C.steel);
    }
    glow(b, () => b.box([(sol.min.x + sol.max.x) / 2, sol.max.y - 6, sol.max.z + 0.05], [1.2, 1.2, 0.1], C.cyan));
  },
  lintel(b, s, fine) {
    const sol = s.solids[0]!;
    b.aabb([sol.min.x, sol.min.y, sol.min.z], [sol.max.x, sol.max.y, sol.max.z], C.slate2, C.slate);
    if (fine) for (let xx = sol.min.x + 10; xx < sol.max.x - 8; xx += 6)
      b.aabb([xx, sol.min.y - 0.01, sol.min.z - 0.05], [xx + 0.6, sol.max.y, sol.min.z + 0.3], C.ochre);
  },
  dock(b, s, fine) {
    const [deck, hut] = s.solids;
    b.aabb([deck!.min.x, deck!.min.y, deck!.min.z], [deck!.max.x, deck!.max.y, deck!.max.z], C.metal, C.steel);
    b.aabb([hut!.min.x, hut!.min.y, hut!.min.z], [hut!.max.x, hut!.max.y, hut!.max.z], C.porcelain, C.petrol);
    if (fine) {
      b.tube([[deck!.min.x, deck!.max.y + 1, deck!.max.z], [deck!.max.x, deck!.max.y + 1, deck!.max.z]], 0.06, 3, C.ochre);
      glow(b, () => { b.box([hut!.min.x - 0.03, hut!.min.y + 2.6, (hut!.min.z + hut!.max.z) / 2], [0.06, 0.8, 2.2], C.warm);
        b.box([deck!.min.x + 0.4, deck!.max.y + 0.3, deck!.max.z - 0.4], [0.4, 0.4, 0.4], C.glow); });
    }
  },
  building(b, s, fine) {
    const sol = s.solids[0]!, h = sol.max.y - sol.min.y;
    b.aabb([sol.min.x, sol.min.y, sol.min.z], [sol.max.x, sol.max.y - 1, sol.max.z], C.concrete, C.concrete2);
    b.aabb([sol.min.x + 1, sol.max.y - 1, sol.min.z + 1], [sol.max.x - 1, sol.max.y, sol.max.z - 1], C.petrol);
    if (fine) glow(b, () => {
      for (let y = sol.min.y + 2.2; y < sol.max.y - 2; y += 3.4) for (const zf of [sol.min.z - 0.03, sol.max.z + 0.03]) {
        for (let xx = sol.min.x + 1.5; xx < sol.max.x - 1.5; xx += 2.6)
          if (hash2(Math.floor(xx), Math.floor(y * 3), Math.floor(zf)) > -0.35) b.box([xx + 0.8, y, zf], [1.4, 0.9, 0.05], C.warm);
      }
      b.box([(sol.min.x + sol.max.x) / 2, sol.min.y + h * 0.12, sol.max.z + 0.04], [1.6, 2.2, 0.06], C.glow);
    });
  },
  beacon_mast(b, s, fine) {
    // HUB-2: a slim lattice tower from the summit to the surface, banded so it
    // reads against open water, with its lamp cage at the top (the lamp's
    // light itself is the hub art's flare).
    const sol = s.solids[0]!, x = s.x, z = s.z, r = (sol.max.x - sol.min.x) / 2, top = sol.max.y;
    b.frustum([x, sol.min.y, z], [x, top - 2, z], r, r * 0.6, fine ? 6 : 4, C.steel);
    for (let y = sol.min.y + 6; y < top - 3; y += fine ? 6 : 12) b.frustum([x, y, z], [x, y + 0.8, z], r * 1.15, r * 1.1, fine ? 6 : 4, C.ochre);
    glow(b, () => b.frustum([x, top - 2, z], [x, top - 0.6, z], r * 0.9, r * 0.9, fine ? 8 : 4, C.glow));
    b.frustum([x, top - 0.6, z], [x, top, z], r, 0.15, fine ? 6 : 4, C.petrol);
  },
  beacon(b, s, fine) {
    // A round beacon house inside its square collider: tapering wall, a
    // gallery ring, the lit lamp room and a cap.
    const sol = s.solids[0]!, x = s.x, z = s.z, top = sol.max.y, r = (sol.max.x - sol.min.x) / 2, n = fine ? 10 : 6;
    b.frustum([x, sol.min.y, z], [x, top - 2.4, z], r, r * 0.84, n, C.porcelain, C.petrol);
    b.frustum([x, top - 2.4, z], [x, top - 2.1, z], r, r, n, C.petrol);
    glow(b, () => b.frustum([x, top - 2.1, z], [x, top - 0.6, z], r * 0.55, r * 0.55, n, C.glow));
    b.frustum([x, top - 0.6, z], [x, top, z], r * 0.62, 0.2, n, C.petrol);
  },
  spire(b, s, fine) {
    const sol = s.solids[0]!, x = s.x, z = s.z, top = sol.max.y;
    b.frustum([x, sol.min.y, z], [x, top - 6, z], 4.6, 2.2, 4, C.concrete, C.steel, Math.PI / 4);
    for (let y = sol.min.y + 14; y < top - 10; y += 14) b.frustum([x, y, z], [x, y + 1.2, z], 4.4 - (y - sol.min.y) * 0.017, 4.3 - (y - sol.min.y) * 0.017, 4, C.ochre, C.ochre, Math.PI / 4);
    b.frustum([x, top - 6, z], [x, top, z], 2.2, 0.5, fine ? 6 : 4, C.steel);
    glow(b, () => {
      b.frustum([x, top - 9, z], [x, top - 8, z], 4.5, 4.5, fine ? 12 : 6, C.cyan);
      b.box([x, top - 0.4, z], [0.8, 0.8, 0.8], C.glow);
    });
  },
  gallery(b, s, fine) {
    for (const sol of s.solids) b.aabb([sol.min.x + 0.2, sol.min.y, sol.min.z + 0.2], [sol.max.x - 0.2, sol.max.y, sol.max.z - 0.2], C.concrete, C.petrol);
    const yaw = s.p.yaw!, ux = Math.cos(yaw), uz = Math.sin(yaw);
    // Door frame on the open bay; window strip along the facade.
    if (fine) glow(b, () => {
      b.box([s.x, s.base + 2.4, s.z], [3.4, 4.6, 0.3], C.glow, yaw);
      for (let t = -14; t <= 14; t += 3.5) if (Math.abs(t) > 6) b.box([s.x + ux * t, s.base + 8.6, s.z + uz * t], [2.2, 0.8, 6.2], C.warm, yaw);
    });
  },
  hall(b, s, fine) {
    const [back, west, east, roof, consoleBox, panel] = s.solids;
    for (const sol of [back!, west!, east!]) b.aabb([sol.min.x, sol.min.y, sol.min.z], [sol.max.x, sol.max.y, sol.max.z], C.concrete, C.concrete2);
    b.aabb([roof!.min.x - 0.6, roof!.min.y, roof!.min.z], [roof!.max.x + 0.6, roof!.max.y, roof!.max.z + 1.2], C.petrol);
    b.aabb([consoleBox!.min.x, consoleBox!.min.y, consoleBox!.min.z], [consoleBox!.max.x, consoleBox!.max.y, consoleBox!.max.z], C.metal, C.steel);
    b.aabb([panel!.min.x, panel!.min.y, panel!.min.z], [panel!.max.x, panel!.max.y, panel!.max.z], C.petrol);
    glow(b, () => {
      b.box([(panel!.min.x - 0.03), (panel!.min.y + panel!.max.y) / 2, (panel!.min.z + panel!.max.z) / 2], [0.04, 1.1, 2.4], C.cyan);
      b.box([(consoleBox!.min.x + consoleBox!.max.x) / 2, consoleBox!.max.y + 0.02, consoleBox!.max.z - 0.3], [2.4, 0.04, 0.5], C.warm);
      if (fine) for (const x of [roof!.min.x + 2, roof!.max.x - 2]) b.box([x, roof!.min.y - 0.15, roof!.max.z - 1], [0.6, 0.2, 0.6], C.glow);
    });
  },
  works(b, s, fine) {
    const sol = s.solids[0]!, h = sol.max.y - sol.min.y, mid = (sol.min.y + sol.max.y) / 2;
    b.aabb([sol.min.x, sol.min.y, sol.min.z], [sol.max.x, sol.max.y, sol.max.z], C.concrete, C.dark);
    for (let xx = sol.min.x + 3; xx < sol.max.x - 2; xx += 7) b.frustum([xx, sol.max.y, sol.min.z + 4], [xx, sol.max.y, sol.max.z - 4], 1.2, 1.2, fine ? 7 : 4, C.metal);
    // A dark plinth with hazard bands, and pilasters dividing the faces
    // into bays, all within a metre of the collider.
    b.aabb([sol.min.x - 0.4, sol.min.y, sol.min.z - 0.4], [sol.max.x + 0.4, sol.min.y + 2.4, sol.max.z + 0.4], C.dark);
    if (fine) {
      for (let xx = sol.min.x + 1.5; xx < sol.max.x - 1; xx += 3) b.box([xx, sol.min.y + 2.5, sol.max.z + 0.42], [1.4, 0.3, 0.06], C.ochre, 0.3);
      for (let xx = sol.min.x + 0.6; xx <= sol.max.x; xx += 6.5) for (const zf of [sol.min.z - 0.3, sol.max.z + 0.3]) b.box([xx, mid, zf], [1.2, h, 0.6], C.concrete2);
      for (let zz = sol.min.z + 0.6; zz <= sol.max.z; zz += 6) for (const xf of [sol.min.x - 0.3, sol.max.x + 0.3]) b.box([xf, mid, zz], [0.6, h, 1.2], C.concrete2);
    }
    glow(b, () => {
      b.box([1430, sol.min.y + 1.9, sol.max.z + 0.45], [4.2, 3.4, 0.1], C.glow);
      if (fine) {
        for (let xx = sol.min.x + 4; xx < sol.max.x - 3; xx += 6) b.box([xx, sol.min.y + 8, sol.max.z + 0.05], [2, 0.7, 0.1], C.cyan);
        // A band of lit windows under the roofline on every face.
        for (let xx = sol.min.x + 3.85; xx < sol.max.x - 2; xx += 6.5) for (const zf of [sol.min.z - 0.05, sol.max.z + 0.05])
          if (hash2(Math.floor(xx), Math.floor(zf), 23) > -0.5) b.box([xx, sol.max.y - 4.5, zf], [3.6, 1.6, 0.1], hash2(Math.floor(xx), 5, 29) > 0.3 ? C.cyan : C.warm);
        for (let zz = sol.min.z + 3.6; zz < sol.max.z - 2; zz += 6) for (const xf of [sol.min.x - 0.05, sol.max.x + 0.05])
          if (hash2(Math.floor(zz), Math.floor(xf), 31) > -0.5) b.box([xf, sol.max.y - 4.5, zz], [0.1, 1.6, 3.4], C.warm);
      }
    });
  },
};

/** Cut-stone facades on Meridian's terrace walls, inside the chunk: panels
 * standing just in front of the near-vertical floor cut, buttresses, and lit
 * gallery windows. Visual only; the floor itself is the wall's collision. */
function* terraceWalls(b: RecipeBuilder, floor: (x: number, z: number) => number, due: () => boolean,
  min: { x: number; z: number }, max: { x: number; z: number }, fine: boolean): Generator<void, void> {
  for (let w = 1; w < MERIDIAN_TERRACES.length; w++) {
    const radius = MERIDIAN_TERRACES[w]!.outer, step = fine ? 6 : 12, front = radius - MERIDIAN_WALL - 2.4;
    const span = Math.ceil(2 * Math.PI * radius / step);
    for (let i = 0; i < span; i++) {
      if (due()) yield;
      const a0 = i / span * Math.PI * 2, a1 = (i + 1) / span * Math.PI * 2;
      const x0 = MERIDIAN_CENTRE.x + Math.cos(a0) * front, z0 = MERIDIAN_CENTRE.z + Math.sin(a0) * front;
      const x1 = MERIDIAN_CENTRE.x + Math.cos(a1) * front, z1 = MERIDIAN_CENTRE.z + Math.sin(a1) * front;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      if (mx < min.x || mx >= max.x || mz < min.z || mz >= max.z) continue;
      if (mx < 950 || mz > -1030) continue;
      const top = floor(MERIDIAN_CENTRE.x + Math.cos((a0 + a1) / 2) * (radius + MERIDIAN_WALL + 1), MERIDIAN_CENTRE.z + Math.sin((a0 + a1) / 2) * (radius + MERIDIAN_WALL + 1));
      const bottom = floor(mx, mz) - 0.5;
      if (top - bottom < 20) continue;
      const k = hash2(i, w, 17), stone = k > 0.3 ? C.concrete2 : C.concrete;
      b.face([[x0, bottom, z0], [x1, bottom, z1], [x1, top, z1], [x0, top, z0]], stone);
      b.face([[x0, top, z0], [x1, top, z1], [x1, top + 0.6, z1], [x0, top + 0.6, z0]], C.ochre);
      if (fine && i % 3 === 0) {
        const nx = Math.cos(a0), nz = Math.sin(a0);
        b.box([x0 - nx * 0.7, (bottom + top) / 2, z0 - nz * 0.7], [1.4, top - bottom, 1.4], C.concrete2, a0);
      }
      if (fine && k > -0.2) glow(b, () => {
        for (const f of [0.22, 0.5]) {
          const y = bottom + (top - bottom) * f, nx = Math.cos((a0 + a1) / 2), nz = Math.sin((a0 + a1) / 2);
          b.box([mx - nx * 0.1, y, mz - nz * 0.1], [0.2, 1.1, step * 0.55], hash2(i, w + Math.round(f * 10), 4) > 0.2 ? C.warm : C.cyan, (a0 + a1) / 2);
        }
      });
    }
  }
}

export function structureMesh(list: readonly StructureDef[], name: string, fine: boolean): MeshRecipe | null {
  if (!list.length) return null;
  const b = new RecipeBuilder();
  for (const s of list) DRAW[s.kind](b, s, fine);
  return b.vertexCount ? b.finish(name, 0.25) : null;
}

export const structuresFactory: ChunkArtFactory = {
  id: "s2.structures",
  *build(ctx, chunk, _ref, lod) {
    const { min, max } = chunk.bounds;
    const here = STRUCTURES.filter(s => s.x >= min.x && s.x < max.x && s.z >= min.z && s.z < max.z);
    const b = new RecipeBuilder();
    for (const s of here) { DRAW[s.kind](b, s, lod === "fine"); if (ctx.due()) yield; }
    if (ctx.due()) yield;
    yield* terraceWalls(b, ctx.floor, ctx.due, min, max, lod === "fine");
    return { meshes: b.vertexCount ? [b.finish(`${chunk.id}.structures`, 0.25)] : [], instances: [] };
  },
};
