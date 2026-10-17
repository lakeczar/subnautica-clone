import { Mesh, VertexData } from '@babylonjs/core';

// Original, deliberately small environment study. All geometry is generated here.
// The height field is shared with the plants and vehicle staging; rock formations
// and the horizontal wave-cut benches are separate geological features.
export function terrainHeight(x, z) {
  return -13 + Math.sin(x * .16) * 1.2 + Math.cos(z * .15) * 1.1
    + 34 * Math.exp(-((x + 29) ** 2 / 170 + (z - 36) ** 2 / 280))
    + 17 * Math.exp(-((x + 39) ** 2 / 80 + (z - 46) ** 2 / 110))
    + 3 * Math.exp(-((x - 20) ** 2 / 220 + (z - 12) ** 2 / 180));
}

const P = {
  sand: '#a6caba', sandShade: '#8bb7aa', sandLight: '#c3d7bd',
  basalt: '#456f78', basaltDark: '#315a69', basaltLight: '#638c91',
  stratum: '#769d9b', mineral: '#c6d9bb', shore: '#e3d19b',
  wetShore: '#c6bd91', soil: '#7d9278', ridge: '#6a817d',
  hull: '#e0e3cd', hullShade: '#b4c6bc', metal: '#3c6873',
  ink: '#143f50', glass: '#18556a', glassLight: '#5d9b9c',
  orange: '#c87942', ochre: '#e1b066', cream: '#ffe3a1',
  vein: '#90c9bf', ore: '#d5ad75', crack: '#234b59'
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const mixPoint = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const n = Math.hypot(...a) || 1; return a.map(v => v / n); };
const plus = (a, b, s = 1) => a.map((v, i) => v + b[i] * s);
const snap = (v, size) => Math.round(v / size) * size;

// One mesh per batch, with flat authored faces, correct outward normals and no
// individual materials per piece. Reversed triangle order is Babylon's LH order.
class SurfaceBatch {
  constructor(ctx, name) {
    this.ctx = ctx; this.name = name;
    this.positions = []; this.normals = []; this.indices = []; this.colors = [];
    this.palette = new Map();
  }
  face(points, hex, gain = 1) {
    // Grid snapping can collapse a corner of a coastal shelf or dish facet.
    // Keep the resulting triangle, but never submit zero-area/zero-normal faces.
    points = points.filter((p, i) => !points.slice(0, i).some(q => Math.hypot(...sub(p, q)) < .00001));
    if (points.length < 3) return;
    let normal = null;
    const triangles = [];
    for (let i = 1; i < points.length - 1; i++) {
      const v = cross(sub(points[i], points[0]), sub(points[i + 1], points[0]));
      if (Math.hypot(...v) < .00001) continue;
      if (!normal) normal = unit(v);
      const agrees = v.reduce((sum, value, axis) => sum + value * normal[axis], 0) >= 0;
      triangles.push(agrees ? [0, i + 1, i] : [0, i, i + 1]);
    }
    if (!normal) return;
    if (!this.palette.has(hex)) this.palette.set(hex, this.ctx.C(hex));
    const c = this.palette.get(hex), base = this.positions.length / 3;
    for (const p of points) {
      this.positions.push(...p); this.normals.push(...normal);
      this.colors.push(c.r * gain, c.g * gain, c.b * gain, 1);
    }
    for (const tri of triangles) this.indices.push(...tri.map(i => base + i));
  }
  box(p, s, hex, gain = 1) {
    const [x, y, z] = p, [w, h, d] = s.map(v => v / 2);
    const a = x - w, b = x + w, c = y - h, e = y + h, f = z - d, g = z + d;
    this.face([[a, e, f], [a, e, g], [b, e, g], [b, e, f]], hex, gain);
    this.face([[a, c, g], [a, c, f], [b, c, f], [b, c, g]], hex, gain);
    this.face([[b, c, f], [a, c, f], [a, e, f], [b, e, f]], hex, gain);
    this.face([[a, c, g], [b, c, g], [b, e, g], [a, e, g]], hex, gain);
    this.face([[b, c, g], [b, c, f], [b, e, f], [b, e, g]], hex, gain);
    this.face([[a, c, f], [a, c, g], [a, e, g], [a, e, f]], hex, gain);
  }
  beam(a, b, width, depth, hex) {
    const dir = unit(sub(b, a));
    const side = unit(cross(dir, Math.abs(dir[1]) > .95 ? [1, 0, 0] : [0, 1, 0]));
    const up = unit(cross(side, dir));
    const ring = p => [plus(plus(p, side, -width / 2), up, -depth / 2),
      plus(plus(p, side, width / 2), up, -depth / 2),
      plus(plus(p, side, width / 2), up, depth / 2),
      plus(plus(p, side, -width / 2), up, depth / 2)];
    const x = ring(a), y = ring(b);
    for (let i = 0; i < 4; i++) this.face([x[(i + 1) % 4], x[i], y[i], y[(i + 1) % 4]], hex);
    this.face(x, hex); this.face([...y].reverse(), hex);
  }
  finish(outline = false, outlineWidth = .025) {
    if (!this.positions.length) return null;
    const mesh = new Mesh(this.name, this.ctx.scene), data = new VertexData();
    data.positions = this.positions; data.indices = this.indices;
    data.normals = this.normals; data.colors = this.colors;
    data.applyToMesh(mesh); mesh.useVertexColors = true;
    mesh.material = this.ctx.variant === 'cel' ? this.ctx.toon : this.ctx.voxelMaterial;
    if (outline && this.ctx.variant === 'cel') {
      mesh.renderOutline = true; mesh.outlineColor = this.ctx.C('#254b55'); mesh.outlineWidth = outlineWidth;
    }
    mesh.isPickable = false;
    mesh.metadata = { originalAsset: true, module: 'environment', vertexCount: this.positions.length / 3 };
    return mesh;
  }
}

function slopeAt(x, z) {
  return Math.hypot(terrainHeight(x + .6, z) - terrainHeight(x - .6, z), terrainHeight(x, z + .6) - terrainHeight(x, z - .6)) / 1.2;
}

function terrainColor(x, y, z) {
  const slope = slopeAt(x, z), stripe = Math.sin((y + x * .028) * 2.0);
  if (y > 13.5) {
    if (slope > .8) return stripe > .5 ? P.stratum : (stripe < -.5 ? P.basalt : P.ridge);
    return Math.sin(x * .31 + z * .17) > .3 ? P.soil : P.ridge;
  }
  if (y > 7.2) return y > 11.8 && slope > 1.3 ? P.basaltLight : (y > 9.4 ? P.shore : P.wetShore);
  if (slope > .72) return stripe > .45 ? P.basaltLight : P.basalt;
  const patch = Math.sin(x * .075 + Math.sin(z * .08)) + Math.sin(z * .11 - x * .03) * .55;
  if (patch < -1.12 && z > 1) return P.basaltLight;
  return patch > .9 ? P.sandLight : (patch < -.35 ? P.sandShade : P.sand);
}

const REFINED_ROCK_BEDS = [
  [-5.5, 17, 6.4, 5.8], [18.2, 21, 6.0, 6.7],
  [-31, 8.5, 7.3, 4.8], [29, 15, 7.7, 5.4], [34, 39, 7.1, 7.3]
];

function refinedTerrainColor(x, y, z) {
  const slope = slopeAt(x, z);
  if (y > 13.5) {
    if (slope > .8) return ['#416873', '#5b7f7c', '#6b8980', '#527575'][Math.floor((y + x * .018 + 30) / 1.3) % 4];
    return Math.sin(x * .31 + z * .17) > .3 ? '#849a71' : '#6f8a74';
  }
  if (y > 7.2) return y > 11.8 && slope > 1.3 ? '#5c827d' : (y > 9.4 ? '#e3d39e' : '#c5c396');
  if (slope > .72) return Math.sin(y * 1.4 + x * .03) > .55 ? '#70978b' : '#3e737a';
  const bed = Math.max(...REFINED_ROCK_BEDS.map(([cx, cz, rx, rz]) =>
    Math.exp(-(((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2) * 2)));
  const currents = Math.sin(x * .22 + Math.sin(z * .13) * 1.7) * .13;
  if (bed + currents > .52) return '#547e7c';
  if (bed + currents > .30) return '#91ac98';
  const sand = Math.sin(x * .075 + Math.sin(z * .08)) + Math.sin(z * .11 - x * .03) * .55;
  return sand > .85 ? '#c4d7b4' : (sand < -.3 ? '#98bea5' : '#b2ceb0');
}

function supportingHeight(ctx, x, z) {
  if (ctx.variant !== 'voxel') return terrainHeight(x, z);
  const step = ctx.refined ? 1.15 : 2.3, quantum = ctx.refined ? .425 : .85;
  const px = -69 + (Math.floor((x + 69) / step) + .5) * step;
  const pz = -48 + (Math.floor((z + 48) / step) + .5) * step;
  return snap(terrainHeight(px, pz), quantum);
}

function strataColor(y, land = false) {
  const band = Math.floor((y + 30) / 1.45) % 5;
  return (land ? [P.basalt, P.ridge, P.stratum, P.basaltLight, P.ridge] :
    [P.basaltDark, P.basalt, P.basaltLight, P.basalt, P.stratum])[band];
}

function archStrataColor(x, y) {
  // Closely related basalt values: bedding should survive close inspection
  // without turning the entire landmark into a striped graphic.
  const palette = ['#47737b', '#4d7a81', '#578388', '#4a767e', '#5e898c'];
  return palette[Math.floor((y + x * .045 + 30) / 1.8) % palette.length];
}

function makeTerrain(ctx) {
  const colorAt = ctx.refined ? refinedTerrainColor : terrainColor;
  if (ctx.variant === 'voxel') {
    const b = new SurfaceBatch(ctx, 'env-exposed-voxel-terrain'), n = ctx.refined ? 120 : 60, step = ctx.refined ? 1.15 : 2.3, bottom = -20;
    const heights = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) =>
      snap(terrainHeight(-69 + (i + .5) * step, -48 + (j + .5) * step), ctx.refined ? .425 : .85)));
    const wall = (a, c, lo, hi, x, z) => {
      if (hi <= lo + .01) return;
      const count = Math.max(1, Math.ceil((hi - lo) / 1.7));
      for (let k = 0; k < count; k++) {
        const y0 = lerp(lo, hi, k / count), y1 = lerp(lo, hi, (k + 1) / count);
        b.face([[a[0], y0, a[1]], [c[0], y0, c[1]], [c[0], y1, c[1]], [a[0], y1, a[1]]],
          hi > 6 ? strataColor((y0 + y1) / 2, true) : colorAt(x, hi, z), .94);
      }
    };
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = -69 + i * step, z = -48 + j * step, y = heights[i][j];
      b.face([[x, y, z], [x, y, z + step], [x + step, y, z + step], [x + step, y, z]], colorAt(x + step / 2, y, z + step / 2));
      const l = i ? heights[i - 1][j] : bottom, r = i < n - 1 ? heights[i + 1][j] : bottom;
      const f = j ? heights[i][j - 1] : bottom, back = j < n - 1 ? heights[i][j + 1] : bottom;
      wall([x, z], [x, z + step], l, y, x, z);
      wall([x + step, z + step], [x + step, z], r, y, x, z);
      wall([x + step, z], [x, z], f, y, x, z);
      wall([x, z + step], [x + step, z + step], back, y, x, z);
    }
    b.finish();
  } else {
    const positions = [], indices = [], colors = [], normals = [], n = ctx.refined ? 120 : 72, step = 138 / n;
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const x = -69 + i * step, z = -48 + j * step, y = terrainHeight(x, z), c = ctx.C(colorAt(x, y, z));
      positions.push(x, y, z); colors.push(c.r, c.g, c.b, 1);
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * (n + 1) + i;
      // Preserve the first study for comparison. Its direct grid used the
      // opposite LH winding: refined sand must face the light, not the seabed.
      if (ctx.refined) indices.push(k, k + 1, k + n + 1, k + 1, k + n + 2, k + n + 1);
      else indices.push(k, k + n + 1, k + 1, k + 1, k + n + 1, k + n + 2);
    }
    VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData(), mesh = new Mesh('env-sculpted-sand-and-island', ctx.scene);
    data.positions = positions; data.indices = indices; data.normals = normals; data.colors = colors;
    data.applyToMesh(mesh); mesh.material = ctx.toon; mesh.useVertexColors = true; mesh.isPickable = false;
    mesh.metadata = { originalAsset: true, module: 'environment', vertexCount: positions.length / 3 };
  }
}

function contourRadius(angle, level) {
  const dx = Math.cos(angle), dz = Math.sin(angle), ox = -32, oz = 39;
  let lo = 0, hi = .6;
  while (hi < 60 && terrainHeight(ox + dx * hi, oz + dz * hi) > level) { lo = hi; hi += .6; }
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (terrainHeight(ox + dx * mid, oz + dz * mid) > level) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function makeIslandShelves(ctx) {
  const b = new SurfaceBatch(ctx, 'env-island-wavecut-bench-and-strata');
  const voxel = ctx.variant === 'voxel', n = ctx.refined ? (voxel ? 144 : 140) : (voxel ? 72 : 100);
  // Broad intertidal limestone/sand apron, then narrower resistant basalt beds.
  const levels = [6.6, 10.25, 13.65, 17.35, 20.75, 24.0];
  for (let s = 0; s < levels.length; s++) {
    const level = levels[s], shore = s === 1, points = [];
    for (let i = 0; i <= n; i++) {
      const angle = i / n * Math.PI * 2, r = contourRadius(angle, level), dx = Math.cos(angle), dz = Math.sin(angle);
      const erosion = .72 + .27 * Math.sin(angle * 5 + s) + .15 * Math.sin(angle * 11 - s);
      const width = (shore ? 1.8 : s === 0 ? 1.15 : .75) * erosion;
      const point = radius => {
        let x = -32 + dx * radius, z = 39 + dz * radius;
        if (voxel) { x = snap(x, ctx.refined ? .575 : 1.15); z = snap(z, ctx.refined ? .575 : 1.15); }
        return [x, level + .07, z];
      };
      const inner = point(r - .38), outer = point(r + width);
      points.push({ inner, outer, bottom: [outer[0], Math.min(level - .6, terrainHeight(outer[0], outer[2]) - .08), outer[2]] });
    }
    for (let i = 0; i < n; i++) {
      const fraction = (i + .5) / n;
      const shoreGap = shore && [[.055, .085], [.35, .38], [.70, .73], [.84, .875]].some(([lo, hi]) => fraction > lo && fraction < hi);
      const exposedBasalt = shore && [[.04, .105], [.335, .395], [.68, .745], [.825, .895], [.955, .98]].some(([lo, hi]) => fraction > lo && fraction < hi);
      if (shoreGap) continue;
      // Eroded upper beds deliberately have two small missing sections.
      if (s > 2 && ((i + s * 7) % 53 === 0 || (i + s * 7) % 53 === 1)) continue;
      const a = points[i], c = points[i + 1];
      if (Math.hypot(a.outer[0] - c.outer[0], a.outer[2] - c.outer[2]) < .01) continue;
      b.face([a.inner, c.inner, c.outer, a.outer], shore ? (exposedBasalt ? P.basaltLight : P.shore) : s === 0 ? P.wetShore : strataColor(level, true));
      b.face([a.outer, c.outer, c.bottom, a.bottom], shore && !exposedBasalt ? P.wetShore : P.basalt, shore ? .98 : .9);
      if (shore && !exposedBasalt && i % 8 < 6) {
        const ia = mixPoint(a.inner, a.outer, .82), ib = mixPoint(c.inner, c.outer, .82);
        ia[1] += .025; ib[1] += .025;
        const oa = [...a.outer], ob = [...c.outer]; oa[1] += .025; ob[1] += .025;
        b.face([ia, ib, ob, oa], '#f0dfa9');
      }
    }
  }
  b.finish();
}

// Outer cap and inner opening have different asymmetry. The western pillar is
// undercut; a lower eastern shoulder and a broad broken crown shift the weight.
const ARCH_OUTER = [[16.7, -12.3], [16.1, -8.4], [15, -4.7], [13.0, -2.3],
  [11.4, -.95], [7.2, .35], [3.4, 1.05], [.5, -.5], [-1.8, -3.5], [-3.1, -6.8], [-4.9, -12.2]];
const ARCH_INNER = [[12.7, -12.7], [12.2, -8.9], [11.2, -6.3], [10.1, -4.6],
  [8.8, -3.4], [6.7, -2.8], [3.9, -2.9], [2.0, -4.1], [.8, -6.2], [-.3, -8.5], [-.8, -12.7]];

function archProfile(points, t) {
  const q = clamp(t, 0, 1) * (points.length - 1), i = Math.min(points.length - 2, Math.floor(q)), f = q - i;
  const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
  return [0, 1].map(axis => .5 * (2 * p1[axis] + (-p0[axis] + p2[axis]) * f
    + (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * f * f
    + (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]) * f * f * f));
}

function pointInProfile(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

// An eroded arch with one continuous load-bearing crown; no overlapping blobs.
function makeArch(ctx) {
  const b = new SurfaceBatch(ctx, 'env-eroded-basalt-arch'), voxel = ctx.variant === 'voxel';
  if (voxel) {
    const step = ctx.refined ? .39 : .78, nx = ctx.refined ? 58 : 29, ny = ctx.refined ? 38 : 19, nz = ctx.refined ? 14 : 7;
    const occupied = new Set();
    const key = (i, j, k) => `${i},${j},${k}`;
    const outline = Array.from({ length: 51 }, (_, i) => archProfile(ARCH_OUTER, i / 50))
      .concat(Array.from({ length: 51 }, (_, i) => archProfile(ARCH_INNER, 1 - i / 50)));
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
      const x = -5.31 + (i + .5) * step, y = -13.35 + (j + .5) * step, z = 15.27 + (k + .5) * step;
      const local = x - 6, insideCrown = pointInProfile(x, y, outline);
      const depth = 2.05 + .3 * Math.sin(local * .7) + .22 * Math.cos(y * 1.4)
        + (ctx.refined ? .085 * Math.sin(local * 3.1 + y * .4) : 0);
      if (insideCrown && Math.abs(z - 18) < depth && y > -13.1) occupied.add(key(i, j, k));
    }
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
      if (!occupied.has(key(i, j, k))) continue;
      const x0 = -5.31 + i * step, x1 = x0 + step, y0 = -13.35 + j * step, y1 = y0 + step;
      const z0 = 15.27 + k * step, z1 = z0 + step, col = archStrataColor((x0 + x1) / 2, (y0 + y1) / 2);
      if (!occupied.has(key(i, j + 1, k))) b.face([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], col, 1.07);
      if (!occupied.has(key(i, j - 1, k))) b.face([[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]], '#3e6973');
      if (!occupied.has(key(i - 1, j, k))) b.face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], col);
      if (!occupied.has(key(i + 1, j, k))) b.face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], col);
      if (!occupied.has(key(i, j, k - 1))) b.face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], col);
      if (!occupied.has(key(i, j, k + 1))) b.face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], col, .92);
    }
  } else {
    const n = ctx.refined ? 48 : 30, rings = ctx.refined ? 8 : 6;
    const point = (i, r, back) => {
      const a = i / n * Math.PI, wave = .10 * Math.sin(a * 7) + .06 * Math.sin(a * 13);
      const inner = archProfile(ARCH_INNER, i / n), outer = archProfile(ARCH_OUTER, i / n);
      const x = lerp(inner[0], outer[0], r) + wave * r;
      const y = lerp(inner[1], outer[1], r) + wave * r;
      const bevel = Math.sin(r * Math.PI) * .45;
      const z = 18 + (back ? 2.05 + bevel : -2.05 - bevel) + Math.sin(a * 4) * .22;
      return [x, y, z];
    };
    for (let i = 0; i < n; i++) for (let r = 0; r < rings; r++) {
      const a = point(i, r / rings, false), c = point(i + 1, r / rings, false);
      const d = point(i + 1, (r + 1) / rings, false), e = point(i, (r + 1) / rings, false);
      const midY = (a[1] + c[1] + d[1] + e[1]) / 4;
      b.face([a, c, d, e], archStrataColor((a[0] + d[0]) / 2, midY));
      b.face([point(i, (r + 1) / rings, true), point(i + 1, (r + 1) / rings, true), point(i + 1, r / rings, true), point(i, r / rings, true)], archStrataColor((a[0] + d[0]) / 2, midY), .94);
    }
    for (let i = 0; i < n; i++) {
      b.face([point(i, 0, true), point(i + 1, 0, true), point(i + 1, 0, false), point(i, 0, false)], '#3e6973');
      b.face([point(i, 1, false), point(i + 1, 1, false), point(i + 1, 1, true), point(i, 1, true)], archStrataColor(point(i, 1, false)[0], point(i, 1, false)[1]), 1.04);
    }
    for (const i of [0, n]) {
      const pts = [point(i, 0, false), point(i, 0, true), point(i, 1, true), point(i, 1, false)];
      b.face(i ? pts : pts.reverse(), P.basaltDark);
    }
  }
  b.finish(true, .036);
}

const ROCK_SITES = [
  { x: -4.3, z: 18.6, rx: 3.2, rz: 4.8, h: 3.2, angle: -.22 },
  { x: 16.5, z: 20.0, rx: 3.9, rz: 5.0, h: 3.6, angle: .32 },
  { x: 29, z: 15, rx: 5.7, rz: 3.2, h: 3.2, angle: .25 },
  { x: -31, z: 9, rx: 5.5, rz: 3.2, h: 3.4, angle: -.36 },
  { x: 34, z: 39, rx: 4.8, rz: 5.3, h: 4.8, angle: .18 },
  { x: -37, z: 41.5, rx: 3.2, rz: 6.6, h: 5.7, angle: -.25 }
];

function makeOutcrops(ctx) {
  const b = new SurfaceBatch(ctx, 'env-bedded-basalt-outcrops'), voxel = ctx.variant === 'voxel';
  for (const [index, s] of ROCK_SITES.entries()) {
    const ca = Math.cos(s.angle), sa = Math.sin(s.angle), base = terrainHeight(s.x, s.z) - .75;
    const world = (x, y, z) => [s.x + x * ca - z * sa, y, s.z + z * ca + x * sa];
    if (voxel) {
      const step = ctx.refined ? .45 : .9, nx = Math.ceil(s.rx * 2 / step), nz = Math.ceil(s.rz * 2 / step), heights = [];
      const top = (i, j) => (i < 0 || j < 0 || i >= nx || j >= nz) ? base - 1 : heights[i][j];
      for (let i = 0; i < nx; i++) {
        heights[i] = [];
        for (let j = 0; j < nz; j++) {
          const x = (i + .5) * step - s.rx, z = (j + .5) * step - s.rz;
          const q = Math.abs(x / s.rx) ** 1.8 + Math.abs(z / s.rz) ** 2.7;
          heights[i][j] = q > 1 ? base - 1 : base + snap(s.h * Math.max(0, 1 - q * .73) + (x / s.rx) * .35, ctx.refined ? .325 : .65);
        }
      }
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const y = top(i, j); if (y < base) continue;
        const x0 = i * step - s.rx, x1 = x0 + step, z0 = j * step - s.rz, z1 = z0 + step;
        b.face([world(x0, y, z0), world(x0, y, z1), world(x1, y, z1), world(x1, y, z0)], strataColor(y, index === 5), 1.06);
        const sides = [[i - 1, j, [x0, z0], [x0, z1]], [i + 1, j, [x1, z1], [x1, z0]], [i, j - 1, [x1, z0], [x0, z0]], [i, j + 1, [x0, z1], [x1, z1]]];
        for (const [ii, jj, a, c] of sides) if (top(ii, jj) < y) {
          const lo = Math.max(base - .4, top(ii, jj)), count = Math.ceil((y - lo) / 1.3);
          for (let k = 0; k < count; k++) {
            const y0 = lerp(lo, y, k / count), y1 = lerp(lo, y, (k + 1) / count);
            b.face([world(a[0], y0, a[1]), world(c[0], y0, c[1]), world(c[0], y1, c[1]), world(a[0], y1, a[1])], strataColor((y0 + y1) / 2, index === 5));
          }
        }
      }
    } else {
      const footprint = [[-.82, -.75], [.25, -.97], [.9, -.61], [1, .24], [.59, .85], [-.32, 1], [-1, .35]];
      const tiers = [{ scale: 1.04, y: -.35, shift: 0 }, { scale: 1.0, y: .24, shift: .03 },
        { scale: .81, y: .48, shift: -.03 }, { scale: .85, y: .57, shift: -.03 },
        { scale: .56, y: .94, shift: -.12 }, { scale: .21, y: 1, shift: -.18 }];
      if (ctx.refined) tiers.splice(2, 0, { scale: .93, y: .36, shift: .015 }, { scale: .97, y: .405, shift: .015 });
      if (ctx.refined) tiers.splice(6, 0, { scale: .69, y: .73, shift: -.075 }, { scale: .73, y: .78, shift: -.075 });
      const ring = t => footprint.map(([x, z]) => world((x * t.scale + t.shift) * s.rx, base + t.y * s.h + x * .3, z * t.scale * s.rz));
      for (let j = 0; j < tiers.length - 1; j++) {
        const a = ring(tiers[j]), c = ring(tiers[j + 1]);
        for (let k = 0; k < footprint.length; k++) b.face([a[(k + 1) % a.length], a[k], c[k], c[(k + 1) % c.length]], strataColor(base + (tiers[j].y + tiers[j + 1].y) * s.h / 2, index === 5));
      }
      b.face(ring(tiers[tiers.length - 1]).reverse(), index === 5 ? P.ridge : P.basaltLight, 1.09);
    }
  }
  b.finish();
}

function makeGeologicalDetails(ctx) {
  const sand = new SurfaceBatch(ctx, 'env-sparse-sand-ripples'), minerals = new SurfaceBatch(ctx, 'env-resource-bearing-seams');
  const voxel = ctx.variant === 'voxel';
  // Ripples are confined to three low-current pockets, never sprinkled over rock.
  for (const [cx, cz, angle, length] of [[2, -17, .25, 13], [24, 2, -.45, 9], [-28, -8, -.2, 8]]) {
    for (let row = 0; row < 7; row++) {
      if (ctx.refined) {
        const strips = [], count = 22, across = [-1, -.38, .38, 1];
        for (let i = 0; i <= count; i++) {
          const xx = (i / count - .5) * length, fade = Math.sin(i / count * Math.PI);
          const centreZ = (row - 3) * .78 + Math.sin(xx * .45 + row * .35) * .12;
          const width = .10 + fade * .15;
          strips.push(across.map((side, k) => {
            const zz = centreZ + side * width;
            let x = cx + xx * Math.cos(angle) - zz * Math.sin(angle), z = cz + xx * Math.sin(angle) + zz * Math.cos(angle);
            if (voxel) { x = snap(x, .115); z = snap(z, .115); }
            const relief = (k === 1 || k === 2 ? .055 : .008) * fade;
            return [x, supportingHeight(ctx, x, z) + .012 + (voxel ? snap(relief, .02) : relief), z];
          }));
        }
        for (let i = 0; i < count; i++) for (let k = 0; k < 3; k++) {
          sand.face([strips[i][k], strips[i][k + 1], strips[i + 1][k + 1], strips[i + 1][k]], k === 1 ? '#b3c6a3' : '#a0bc9e');
        }
        continue;
      }
      const points = [];
      for (let i = 0; i <= 15; i++) {
        const xx = (i / 15 - .5) * length, zz = (row - 3) * .78 + Math.sin(xx * .45 + row * .35) * .12;
        let x = cx + xx * Math.cos(angle) - zz * Math.sin(angle), z = cz + xx * Math.sin(angle) + zz * Math.cos(angle);
        if (voxel) { x = snap(x, .35); z = snap(z, .35); }
        const y = voxel ? snap(terrainHeight(x, z), .85) + .045 : terrainHeight(x, z) + .035;
        points.push([x, y, z]);
      }
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i], c = points[i + 1], width = .045 + Math.sin((i + 1) / 16 * Math.PI) * .065;
        sand.face([[a[0], a[1], a[2] - width], [a[0], a[1], a[2] + width], [c[0], c[1], c[2] + width], [c[0], c[1], c[2] - width]], row % 3 ? '#c2d6bc' : '#91b5a6');
      }
    }
  }
  // Deposits follow exposed bedding at two readable basalt habitats.
  const seamOnOutcrop = s => Array.from({ length: 6 }, (_, i) => {
    const t = .16 + i / 5 * .70, ca = Math.cos(s.angle), sa = Math.sin(s.angle);
    let px = lerp(-.82, .25, t) * .85 * s.rx, pz = lerp(-.75, -.97, t) * .85 * s.rz;
    const base = terrainHeight(s.x, s.z) - .75;
    let py;
    if (voxel) {
      const step = ctx.refined ? .45 : .9;
      px = (Math.floor((px + s.rx) / step) + .5) * step - s.rx;
      pz = (Math.floor((pz + s.rz) / step) + .5) * step - s.rz;
      const q = Math.abs(px / s.rx) ** 1.8 + Math.abs(pz / s.rz) ** 2.7;
      py = base + snap(s.h * Math.max(0, 1 - q * .73) + (px / s.rx) * .35, ctx.refined ? .325 : .65) + .08;
    } else {
      py = base + .57 * s.h + (px / s.rx) * .3 + .035;
      pz -= .035;
    }
    return [s.x + px * ca - pz * sa, py, s.z + pz * ca + px * sa];
  });
  const seams = [
    seamOnOutcrop(ROCK_SITES[3]),
    seamOnOutcrop(ROCK_SITES[2]),
    [[-3.3, -9.0, 15.40], [-2.9, -7.6, 15.40], [-2.2, -6.7, 15.45], [-1.7, -5.7, 15.50]]
  ];
  seams.forEach((path, index) => {
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], c = path[i + 1], col = ctx.refined ? (index === 1 ? '#e0b065' : '#a5d3b2') : (index === 1 ? P.ore : P.vein);
      if (voxel) {
        const count = Math.ceil(Math.hypot(...sub(c, a)) / (ctx.refined ? .16 : .26));
        for (let k = 0; k < count; k++) minerals.box(mixPoint(a, c, k / count).map(v => snap(v, ctx.refined ? .1 : .2)), ctx.refined ? [.18, .13, .14] : [.27, .19, .18], col);
      } else minerals.beam(a, c, .10, .12, col);
    }
    if (index < 2) for (let j = 0; j < 3; j++) {
      const p = mixPoint(path[1], path[2], j / 3), size = .22 + j * .045;
      if (voxel) minerals.box([p[0], p[1] + .14, p[2] - .14], [size, size * 1.4, size], index ? P.ore : P.mineral);
      else {
        const tip = [p[0] - .06, p[1] + size * 1.9, p[2] - .26];
        const corners = [[p[0] - size, p[1], p[2]], [p[0], p[1] - size * .45, p[2] - size], [p[0] + size, p[1], p[2]], [p[0], p[1] + size * .45, p[2] + size * .3]];
        corners.forEach((v, k) => minerals.face([v, corners[(k + 1) % 4], tip], index ? P.ore : P.mineral, .92 + k * .04));
      }
    }
  });
  sand.finish(); minerals.finish();
}

function makeResearchStation(ctx) {
  const structural = new SurfaceBatch(ctx, 'env-station-deck-and-stilts');
  const shell = new SurfaceBatch(ctx, 'env-station-folded-pressure-shell');
  const glazing = new SurfaceBatch(ctx, 'env-station-blue-glass');
  const details = new SurfaceBatch(ctx, 'env-station-salvage-and-signals');
  const voxel = ctx.variant === 'voxel', x = -27, z = 35, floor = terrainHeight(x, z) + 4.35;
  const W = p => [x + p[0], floor + p[1], z + p[2]];
  const box = (batch, p, s, color) => batch.box(W(p), s, color);
  const beam = (batch, a, b, width, depth, color) => {
    if (!voxel || Math.abs(a[1] - b[1]) < .01 || Math.abs(a[0] - b[0]) + Math.abs(a[2] - b[2]) < .01) {
      batch.beam(W(a), W(b), width, depth, color); return;
    }
    const count = Math.ceil(Math.hypot(...sub(a, b)) / (ctx.refined ? .25 : .45));
    for (let i = 0; i <= count; i++) box(batch, mixPoint(a, b, i / count).map(v => snap(v, ctx.refined ? .15 : .3)), [width, ctx.refined ? .3 : .5, depth], color);
  };

  const deckPlan = [[-6.1, -3.2], [-4.3, -4.4], [4.3, -4.4], [6.1, -2.8], [6.1, 2.6], [4.4, 4], [-4.6, 4], [-6.1, 2.6]];
  const deckTop = deckPlan.map(([a, b]) => W([a, 0, b]));
  if (voxel) {
    for (let i = -6; i <= 6; i++) for (let j = -4; j <= 3; j++) {
      if ((Math.abs(i) > 4 && j < -3) || (Math.abs(i) > 5 && j > 2)) continue;
      box(structural, [i, -.23, j + .1], [1, .46, 1], P.metal);
    }
  } else {
    structural.face([...deckTop].reverse(), P.metal);
    for (let i = 0; i < deckTop.length; i++) {
      const a = deckTop[i], c = deckTop[(i + 1) % deckTop.length];
      structural.face([a, c, [c[0], c[1] - .45, c[2]], [a[0], a[1] - .45, a[2]]], P.metal);
    }
  }
  for (const [a, b] of [[-4.5, -3], [4.6, -2.6], [4.6, 2.8], [-4.5, 2.8]]) {
    const ground = terrainHeight(x + a, z + b) - floor - .5;
    box(structural, [a, (ground - .5) / 2, b], [.56, -.5 - ground, .56], P.metal);
    box(structural, [a, ground + .45, b], [1.6, .5, 1.6], P.basaltLight);
    box(details, [a, -1.2, b], [.64, .62, .64], P.orange);
  }
  beam(structural, [-4.5, -.7, -3], [4.6, -5.2, -2.6], .28, .32, P.metal);
  beam(structural, [4.6, -.7, 2.8], [-4.5, -4.7, 2.8], .28, .32, P.metal);
  box(details, [0, -.03, -4.34], [8.4, .13, .2], P.ochre);
  for (let i = -3; i <= 3; i++) box(details, [i * .72, .025, -3.8], [.11, .06, .8], P.hullShade);

  // An asymmetric folded shell with a forward research window and a damaged bay.
  box(shell, [0, .43, -.1], [10.3, .86, 6.65], P.hullShade);
  box(shell, [.8, 2.65, 2.95], [8.6, 3.45, .48], P.hull);
  box(shell, [-4.85, 1.9, .85], [.52, 2.95, 4.4], P.hull);
  box(shell, [4.85, 1.75, .4], [.48, 2.6, 5.1], P.hull);
  box(shell, [1.0, 3.2, -3.05], [7.7, .65, .55], P.hull);
  box(shell, [1.1, .86, -3.22], [7.7, .55, .45], P.hull);
  box(glazing, [1.15, 1.98, -3.24], [7.45, 1.62, .14], P.glass);
  box(glazing, [4.99, 1.99, -.5], [.13, 1.35, 3.55], P.glass);
  box(glazing, [.4, 2.5, -3.33], [5.4, .18, .05], P.glassLight);
  for (const xx of [-2.55, 1.1, 4.55]) box(structural, [xx, 1.93, -3.36], [.16, 1.95, .22], P.metal);
  box(structural, [4.99, 1.9, -1.1], [.21, 1.6, .15], P.metal);

  // Missing wall exposes a dark airlock and two cream strips, not a glowing cube.
  box(glazing, [-3.9, 1.7, -2.45], [1.55, 2.35, .18], P.ink);
  box(shell, [-4.77, 1.8, -2.95], [.45, 2.9, .4], P.hull);
  box(shell, [-2.85, 2.95, -3.05], [.54, .75, .55], P.hull);
  for (const xx of [-4.55, -3.1]) box(details, [xx, 1.75, -2.60], [.11, 2.3, .1], P.cream);
  box(details, [-3.8, .48, -2.95], [1.7, .12, .7], P.ochre);
  beam(details, [-4.75, 3.05, -3.1], [-3.95, 2.6, -3.8], .18, .18, P.orange);

  // Roof cross section: a shallow folded wing, never an ellipsoid house.
  const roofX = [-5.55, -4.5, 0, 4.6, 5.5], roofY = [3.2, 3.88, 4.35, 3.72, 3.05];
  if (voxel) {
    const half = ctx.refined ? 22 : 11, step = ctx.refined ? .25 : .5;
    for (let i = -half; i <= half - 1; i++) {
      const xx = (i + .5) * step;
      let k = 0; while (k < roofX.length - 2 && xx > roofX[k + 1]) k++;
      const yy = snap(lerp(roofY[k], roofY[k + 1], clamp((xx - roofX[k]) / (roofX[k + 1] - roofX[k]), 0, 1)), ctx.refined ? .14 : .28);
      box(shell, [xx, yy, .12], [step, .36, 7.5], i < (ctx.refined ? -14 : -7) ? P.hullShade : P.hull);
    }
  } else {
    for (let i = 0; i < roofX.length - 1; i++) {
      shell.face([W([roofX[i], roofY[i], -3.7]), W([roofX[i], roofY[i] + .15, 3.95]), W([roofX[i + 1], roofY[i + 1] + .15, 3.95]), W([roofX[i + 1], roofY[i + 1], -3.7])], i === 0 ? P.hullShade : P.hull);
      shell.face([W([roofX[i], roofY[i], -3.7]), W([roofX[i + 1], roofY[i + 1], -3.7]), W([roofX[i + 1], roofY[i + 1] - .29, -3.7]), W([roofX[i], roofY[i] - .29, -3.7])], P.hullShade);
    }
  }
  for (const xx of [-4.55, 4.65]) beam(structural, [xx, 3.9, -3.6], [xx, 4.03, 3.9], .15, .13, P.metal);
  box(details, [.0, 4.47, .3], [.45, .18, 5.1], P.orange);
  box(details, [2.6, 3.03, -3.4], [1.5, .24, .1], P.ochre);
  // Small geometric archive mark: three bars remain readable without text textures.
  for (let i = 0; i < 3; i++) box(details, [3.2 + i * .26, 2.65, 3.205], [.12, .45 + i * .15, .08], P.orange);

  // Narrow exterior stair lands on the high side of the hill, with one handrail.
  const stairA = [-6.15, -.05, 1.4], stairB = [-9, terrainHeight(x - 9, z + 3) - floor + .25, 3], steps = 17;
  for (let i = 0; i < steps; i++) {
    const p = mixPoint(stairA, stairB, i / (steps - 1));
    box(structural, p, [.6, .20, 1.72], P.metal);
    if (i % 4 === 0) beam(structural, [p[0], p[1], p[2] + .82], [p[0], p[1] + 1.08, p[2] + .82], .08, .08, P.hullShade);
  }
  beam(structural, [stairA[0], stairA[1] + 1.08, stairA[2] + .82], [stairB[0], stairB[1] + 1.08, stairB[2] + .82], .09, .09, P.hullShade);
  const landing = W(stairB); landing[1] = terrainHeight(landing[0], landing[2]) + .12;
  structural.box(landing, [2.2, .25, 1.6], P.basaltLight);
  for (const xx of [-.5, 1.2, 2.9, 4.6]) {
    beam(structural, [xx, .1, -4.35], [xx, 1.03, -4.35], .075, .075, P.hullShade);
  }
  beam(structural, [-.5, 1.03, -4.35], [4.6, 1.03, -4.35], .08, .08, P.hullShade);

  // Survey mast with a physically incomplete collecting dish and a bent spar.
  beam(structural, [3.6, -.1, 2], [3.6, 8.0, 2], .22, .22, P.metal);
  beam(details, [3.6, 8, 2], [4.15, 9.15, 2.1], .16, .16, P.orange);
  beam(structural, [3.6, 7.2, 2], [1.9, 7.7, 1.6], .14, .14, P.metal);
  const centre = [3.6, 7.8, 1.55], nr = 3, na = voxel ? 16 : 24;
  for (let j = 0; j < nr; j++) for (let i = 0; i < na; i++) {
    if (i > na * .16 && i < na * .32) continue;
    const point = (r, k) => {
      const a = k / na * Math.PI * 2;
      const p = [centre[0] + Math.cos(a) * r, centre[1] + Math.sin(a) * r, centre[2] + r * r * .20];
      return W(voxel ? p.map(v => snap(v, .22)) : p);
    };
    const r0 = .18 + j * .43, r1 = r0 + .43;
    details.face([point(r0, i), point(r0, i + 1), point(r1, i + 1), point(r1, i)], j === 2 ? P.ochre : P.hullShade);
  }
  box(details, [3.6, 7.8, 1.37], [.26, .26, .5], P.orange);
  box(details, [3.6, 9.35, 2.1], [.25, .18, .25], P.cream);

  // A detached shell panel on the slope records the ruin's damage at a third scale.
  const dropped = [-19.4, terrainHeight(-19.4, 33) + .8, 33];
  const u = [2.15, -.95, .2], v = [.15, -.15, 1.2];
  const panel = [plus(plus(dropped, u, -1), v, -1), plus(plus(dropped, u), v, -1), plus(plus(dropped, u), v), plus(plus(dropped, u, -1), v)];
  shell.face(panel, P.hullShade); shell.face([...panel].reverse(), P.hullShade);
  details.beam(plus(dropped, u, -.9), plus(dropped, u, .9), .16, .12, P.orange);
  if (ctx.refined) {
    // Human-scale maintenance fittings, kept in the existing merged batches.
    for (const xx of [-1.8, .0, 1.8, 3.6]) {
      box(details, [xx, .87, -3.48], [1.28, .045, .07], '#77928b');
      for (const dx of [-.48, .48]) box(details, [xx + dx, .72, -3.48], [.075, .075, .06], P.metal);
    }
    box(structural, [5.15, .95, 1.65], [.18, 1.08, 1.26], P.metal);
    box(details, [5.26, .95, 1.65], [.06, .88, 1.05], P.orange);
    for (let i = 0; i < 4; i++) box(details, [5.30, .7 + i * .15, 1.65], [.07, .06, .66], P.ink);
    box(details, [-3.12, 1.68, -2.72], [.28, .42, .12], P.metal);
    box(details, [-3.12, 1.79, -2.80], [.13, .09, .06], '#c9dc9c');
    box(details, [-3.12, 1.60, -2.80], [.11, .07, .06], P.ochre);
    for (let i = 0; i < 6; i++) box(structural, [-2.9 + i * .40, 4.23 + i * .042, .35], [.18, .09, 1.45], P.metal);
    for (const xx of [-4.8, 4.9]) beam(structural, [xx, 3.7, -.9], [xx, 3.76, 2.2], .10, .12, P.metal);
    glazing.face([W([-.8, 2.25, -3.325]), W([-.4, 2.7, -3.325]), W([.1, 2.7, -3.325]), W([-.3, 2.25, -3.325])], '#609399');
    glazing.face([W([2.4, 2.3, -3.325]), W([2.65, 2.7, -3.325]), W([2.83, 2.7, -3.325]), W([2.58, 2.3, -3.325])], '#6e9d9e');
  }
  structural.finish(); shell.finish(true, .022); glazing.finish(); details.finish();
}

function makeRefinedGeology(ctx) {
  const gravel = new SurfaceBatch(ctx, 'env-refined-sediment-lenses-and-talus');
  const cliff = new SurfaceBatch(ctx, 'env-refined-cliff-weathering');
  const bedding = new SurfaceBatch(ctx, 'env-refined-arch-bedding-and-fissures');
  const voxel = ctx.variant === 'voxel';
  const lenses = [
    [-7.0, 15.5, 3.0, 1.7, -.32], [19.2, 18.1, 3.2, 1.75, .5],
    [-32.0, 5.6, 3.6, 1.6, -.36], [28.4, 10.7, 3.8, 1.75, .25],
    [-20.5, 31.5, 2.3, 1.8, -.9], [-39.0, 31.3, 2.2, 1.8, .2]
  ];
  const rotate = (cx, cz, angle, x, z, y) => [cx + x * Math.cos(angle) - z * Math.sin(angle), y, cz + z * Math.cos(angle) + x * Math.sin(angle)];
  const localStone = (cx, cz, rx, rz, height, angle, index) => {
    const world = (x, z, y) => rotate(cx, cz, angle, x, z, y);
    const col = index % 3 === 0 ? '#768e80' : (index % 3 === 1 ? '#4b7375' : '#5d827b');
    if (voxel) {
      const step = .20, nx = Math.ceil(rx * 2 / step), nz = Math.ceil(rz * 2 / step), top = [], base = [];
      for (let i = 0; i < nx; i++) {
        top[i] = []; base[i] = [];
        for (let j = 0; j < nz; j++) {
          const x = (i + .5) * step - rx, z = (j + .5) * step - rz, p = world(x, z, 0);
          const q = Math.abs(x / rx) ** 2.1 + Math.abs(z / rz) ** 2.8;
          base[i][j] = supportingHeight(ctx, p[0], p[2]);
          top[i][j] = q > 1 ? -Infinity : base[i][j] + .035 + snap(height * (1 - q * .62), .08);
        }
      }
      const neighbor = (i, j, fallback) => i < 0 || j < 0 || i >= nx || j >= nz ? fallback : top[i][j];
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const y = top[i][j]; if (!Number.isFinite(y)) continue;
        const x0 = i * step - rx, x1 = x0 + step, z0 = j * step - rz, z1 = z0 + step;
        gravel.face([world(x0, z0, y), world(x0, z1, y), world(x1, z1, y), world(x1, z0, y)], col, 1.04);
        for (const [ii, jj, a, c] of [[i - 1, j, [x0, z0], [x0, z1]], [i + 1, j, [x1, z1], [x1, z0]], [i, j - 1, [x1, z0], [x0, z0]], [i, j + 1, [x0, z1], [x1, z1]]]) {
          const lo = Math.max(base[i][j] - .015, neighbor(ii, jj, base[i][j]));
          if (lo < y) gravel.face([world(a[0], a[1], lo), world(c[0], c[1], lo), world(c[0], c[1], y), world(a[0], a[1], y)], col);
        }
      }
    } else {
      const footprint = [[-.9, -.4], [-.28, -.95], [.67, -.72], [1, .1], [.3, .88], [-.7, .65]];
      const bottom = footprint.map(([x, z]) => {
        const p = world(x * rx, z * rz, 0); p[1] = supportingHeight(ctx, p[0], p[2]) - .05; return p;
      });
      const top = footprint.map(([x, z]) => {
        const p = world((x * .68 - .08) * rx, z * .67 * rz, 0);
        p[1] = supportingHeight(ctx, p[0], p[2]) + height * (1 + x * .16); return p;
      });
      for (let i = 0; i < footprint.length; i++) gravel.face([bottom[(i + 1) % bottom.length], bottom[i], top[i], top[(i + 1) % top.length]], col);
      gravel.face([...top].reverse(), col, 1.06);
    }
  };

  // Low sediment lenses collect talus beside existing rock habitats. Each has
  // the same deliberate seven-chip arrangement; none occupies a vehicle pad.
  const chips = [[-.68, -.24, .36, .24, .22], [-.42, .15, .46, .31, .28],
    [-.18, -.35, .26, .18, .17], [.05, .1, .55, .36, .36], [.36, -.26, .40, .25, .25],
    [.64, .14, .24, .17, .16], [.2, .58, .22, .16, .12]];
  lenses.forEach(([cx, cz, rx, rz, angle], index) => {
    const world = (x, z, y = 0) => rotate(cx, cz, angle, x, z, y);
    if (voxel) {
      const step = .575, nx = Math.ceil(rx * 2 / step), nz = Math.ceil(rz * 2 / step);
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const x = (i + .5) * step - rx, z = (j + .5) * step - rz;
        const q = (x / rx) ** 2 + (z / rz) ** 2;
        if (q > 1 + Math.sin(x * 2 + index) * .09) continue;
        const p = world(x, z), y = supportingHeight(ctx, p[0], p[2]) + (q < .5 ? .13 : .065);
        gravel.face([world(x - step / 2, z - step / 2, y), world(x - step / 2, z + step / 2, y), world(x + step / 2, z + step / 2, y), world(x + step / 2, z - step / 2, y)], q < .5 ? '#72958a' : '#95af96');
      }
    } else {
      const rings = [0, .54, 1], count = 18, ring = r => Array.from({ length: count }, (_, i) => {
        const a = i / count * Math.PI * 2, erosion = 1 + .08 * Math.sin(a * 5 + index);
        const p = world(Math.cos(a) * rx * r * erosion, Math.sin(a) * rz * r * erosion);
        p[1] = supportingHeight(ctx, p[0], p[2]) + (1 - r * r) * .14 + .035; return p;
      });
      const middle = ring(rings[1]), outside = ring(rings[2]), centre = world(0, 0);
      centre[1] = supportingHeight(ctx, centre[0], centre[2]) + .175;
      for (let i = 0; i < count; i++) {
        const j = (i + 1) % count;
        gravel.face([centre, middle[j], middle[i]], '#72958a');
        gravel.face([middle[i], middle[j], outside[j], outside[i]], '#95af96');
      }
    }
    chips.forEach(([px, pz, sx, sz, tall], k) => {
      const p = world(px * rx, pz * rz);
      localStone(p[0], p[2], sx, sz, tall, angle + k * .6, index + k);
    });
  });

  // Narrow runoff ribs and short resistant beds break the blank island face.
  // Their positions follow the shared contours; the station approach stays clear.
  for (const [g, angle] of [-1.95, -1.52, -1.12, -.72, -.25, .38].entries()) {
    const rings = [], count = 19;
    for (let i = 0; i <= count; i++) {
      const level = lerp(24.8, 11.35, i / count), a = angle + Math.sin(i * .34 + g) * .035;
      const r = contourRadius(a, level), x = -32 + Math.cos(a) * r, z = 39 + Math.sin(a) * r;
      const tangent = [-Math.sin(a), Math.cos(a)], width = .28 + .10 * Math.sin(i * .4 + g);
      if (voxel) {
        const px = snap(x, .575), pz = snap(z, .575), base = supportingHeight(ctx, px, pz);
        cliff.box([px, base + .12, pz], [.575, .24, .575], i % 4 === 0 ? '#809786' : '#4d7777');
      } else rings.push([-1, 0, 1].map((side, k) => {
        const px = x + tangent[0] * width * side, pz = z + tangent[1] * width * side;
        return [px, supportingHeight(ctx, px, pz) + (k === 1 ? .23 + .06 * Math.sin(i) : .025), pz];
      }));
    }
    if (!voxel) for (let i = 0; i < count; i++) for (let k = 0; k < 2; k++) {
      cliff.face([rings[i][k + 1], rings[i + 1][k + 1], rings[i + 1][k], rings[i][k]], k ? '#6f8f82' : '#486f71');
    }
  }
  for (const [index, level] of [12.2, 15.2, 19.0, 22.5].entries()) {
    const strip = [], count = 26;
    for (let i = 0; i <= count; i++) {
      const a = lerp(-2.0 + index * .1, -.35 + index * .08, i / count), r = contourRadius(a, level);
      const width = .32 + Math.sin(i * .45 + index) * .16;
      strip.push([-.12, width].map(offset => {
        let x = -32 + Math.cos(a) * (r + offset), z = 39 + Math.sin(a) * (r + offset);
        if (voxel) { x = snap(x, .575); z = snap(z, .575); }
        return [x, level + .07, z];
      }));
    }
    for (let i = 0; i < count; i++) if (i % 11 !== 5) {
      const a = strip[i], b = strip[i + 1];
      cliff.face([a[0], b[0], b[1], a[1]], index % 2 ? '#6e9081' : '#5b817c');
      cliff.face([a[1], b[1], [b[1][0], b[1][1] - .25, b[1][2]], [a[1][0], a[1][1] - .25, a[1][2]]], '#426c72');
    }
  }

  const archFront = (t, r) => {
    const a = t * Math.PI, inner = archProfile(ARCH_INNER, t), outer = archProfile(ARCH_OUTER, t);
    const wave = .10 * Math.sin(a * 7) + .06 * Math.sin(a * 13);
    const x = lerp(inner[0], outer[0], r) + wave * r, y = lerp(inner[1], outer[1], r) + wave * r;
    let z = 18 - 2.05 - Math.sin(r * Math.PI) * .45 + Math.sin(a * 4) * .22;
    if (voxel) {
      const px = -5.31 + (Math.floor((x + 5.31) / .39) + .5) * .39;
      const py = -13.35 + (Math.floor((y + 13.35) / .39) + .5) * .39;
      const depth = 2.05 + .3 * Math.sin((px - 6) * .7) + .22 * Math.cos(py * 1.4) + .085 * Math.sin((px - 6) * 3.1 + py * .4);
      z = 15.27 + Math.ceil((18 - depth - 15.27) / .39 - .5) * .39;
    }
    return [x, y, z];
  };
  for (const [j, patch] of [[.12, .25, .55, .87], [.34, .50, .68, .93], [.65, .77, .28, .58], [.80, .92, .60, .88]].entries()) {
    const [t0, t1, r0, r1] = patch, count = 7;
    for (let i = 0; i < count; i++) for (let row = 0; row < 2; row++) {
      const t = lerp(t0, t1, i / count), tNext = lerp(t0, t1, (i + 1) / count);
      const r = lerp(r0, r1, row / 2), rNext = lerp(r0, r1, (row + 1) / 2);
      if (voxel) {
        const p = archFront((t + tNext) / 2, (r + rNext) / 2);
        bedding.box([snap(p[0], .195), snap(p[1], .195), p[2] - .045], [.34, .28, .11], j % 2 ? '#638984' : '#527d7e');
      } else {
        const a = archFront(t, r), b = archFront(tNext, r), c = archFront(tNext, rNext), d = archFront(t, rNext);
        for (const p of [a, b, c, d]) p[2] -= .055 + row * .025;
        bedding.face([a, b, c, d], j % 2 ? '#638984' : '#527d7e');
        bedding.face([d, c, plus(c, [0, 0, .10]), plus(d, [0, 0, .10])], '#3e6871');
      }
    }
  }
  for (const [j, path] of [[[.18, .40], [.205, .50], [.20, .67], [.23, .78]],
    [[.72, .43], [.75, .49], [.78, .65], [.81, .72]]].entries()) {
    const points = path.map(([t, r]) => { const p = archFront(t, r); p[2] -= .09; return p; });
    for (let i = 0; i < points.length - 1; i++) bedding.beam(points[i], points[i + 1], .035, .045, j ? '#355e69' : '#8fae96');
  }
  gravel.finish(); cliff.finish(); bedding.finish();
}

export function createEnvironment(ctx) {
  makeTerrain(ctx);
  makeIslandShelves(ctx);
  makeArch(ctx);
  makeOutcrops(ctx);
  makeGeologicalDetails(ctx);
  makeResearchStation(ctx);
  if (ctx.refined) makeRefinedGeology(ctx);
  return {};
}
