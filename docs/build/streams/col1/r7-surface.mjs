// Surface-to-surface distance, pre-R6 vs R6 fine shells, per kit cave (COL-1 R6 clarification).
// Surface distance between two trees' shells at one LOD (PRE, NOW, LOD); correspondence-free.
// appended), so only changed triangles are sampled (area-weighted, ~5 cm spacing, plus corners), each
// sample's distance taken to the whole other mesh. Classes: a changed triangle is "broken" when one of
// its moved vertices lies on a pre-R6 triangle that faced against R6's (flipped) or crossed rock (folded).
const PRE = process.env.PRE ?? "/work/tmp/col1-pre/.test-build/", NOW = process.env.NOW ?? "/home/worker/.t3/worktrees/subnautica-clone/t3-74e12f2f/.test-build/";
const fs = await import("node:fs");
const mods = async T => ({
  C: await import(T + "src/content/regions/caves.js"), G: await import(T + "src/content/regions/caveGeometry.js"),
  I: await import(T + "src/content/regions/caves/index.js"), D: await import(T + "src/content/regions/caves/deep.js"),
  W: await import(T + "src/content/regions/worldFloor.js"),
});
const [mp, mn] = [await mods(PRE), await mods(NOW)];
const defsOf = m => [...m.C.AUTHORED_CAVE_SOURCES.map(s => [s.id, () => m.C.caveDef(s.id, m.W.worldFloor)]), ...m.I.CANOPY_BASIN_GROUPS.map(g => [g.source.id, () => m.I.groupDef(g, m.W.worldFloor)]), ...m.D.DEEP_CAVES.map(c => [c.source.id, () => m.G.buildCave(c.source, m.W.worldFloor)])];
const only = process.env.IDS ? new Set(process.env.IDS.split(",")) : null;
const listP = new Map(defsOf(mp)), listN = defsOf(mn);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const V = (P, v) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
function closest(p, a, b, c) { // Ericson, Real-Time Collision Detection 5.1.5
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]]; }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]]; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return [b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])]; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
}
function grid(P, I, CELL = 1) {
  const cells = new Map(), key = (i, j, k) => (i * 73856093) ^ (j * 19349663) ^ (k * 83492791);
  for (let t = 0; t < I.length / 3; t++) {
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < 3; k++) for (let c = 0; c < 3; c++) { const x = P[I[t * 3 + k] * 3 + c]; lo[c] = Math.min(lo[c], x); hi[c] = Math.max(hi[c], x); }
    for (let i = Math.floor(lo[0] / CELL); i <= Math.floor(hi[0] / CELL); i++) for (let j = Math.floor(lo[1] / CELL); j <= Math.floor(hi[1] / CELL); j++) for (let k = Math.floor(lo[2] / CELL); k <= Math.floor(hi[2] / CELL); k++) {
      const h = key(i, j, k); let l = cells.get(h); if (!l) cells.set(h, l = []); l.push(t);
    }
  }
  const stamp = new Int32Array(I.length / 3); let q = 0;
  return p => { // nearest distance from p to the mesh: grow the searched cube until the best hit lies inside it
    for (let r = 1; r <= 128; r *= 2) {
      let best = Infinity; q++;
      const seen = { has: t => stamp[t] === q, add: t => { stamp[t] = q; } };
      const c0 = p.map(x => Math.floor(x / CELL));
      for (let i = c0[0] - r; i <= c0[0] + r; i++) for (let j = c0[1] - r; j <= c0[1] + r; j++) for (let k = c0[2] - r; k <= c0[2] + r; k++)
        for (const t of cells.get(key(i, j, k)) ?? []) { if (seen.has(t)) continue; seen.add(t); const q = closest(p, V(P, I[t * 3]), V(P, I[t * 3 + 1]), V(P, I[t * 3 + 2])), d = Math.hypot(...sub(p, q)); if (d < best) best = d; }
      if (best <= r * CELL) return best;
    }
    return Infinity;
  };
}
const area = (P, I, t) => { const a = V(P, I[t * 3]), b = V(P, I[t * 3 + 1]), c = V(P, I[t * 3 + 2]); return Math.hypot(...cross(sub(b, a), sub(c, a))) / 2; };
function samples(P, I, t, step = Number(process.env.STEP ?? 0.05)) { // barycentric lattice on the triangle, n per edge from its longest side
  const a = V(P, I[t * 3]), b = V(P, I[t * 3 + 1]), c = V(P, I[t * 3 + 2]);
  const n = Math.max(1, Math.min(400, Math.ceil(Math.max(Math.hypot(...sub(a, b)), Math.hypot(...sub(b, c)), Math.hypot(...sub(c, a))) / step)));
  const out = [];
  for (let i = 0; i <= n; i++) for (let j = 0; i + j <= n; j++) { const u = i / n, v = j / n, w = 1 - u - v; out.push([a[0] * w + b[0] * u + c[0] * v, a[1] * w + b[1] * u + c[1] * v, a[2] * w + b[2] * u + c[2] * v]); }
  return out;
}
const tn = (P, I, t) => { const a = V(P, I[t * 3]), b = V(P, I[t * 3 + 1]), c = V(P, I[t * 3 + 2]); return cross(sub(b, a), sub(c, a)); };
const rows = [];
const GN = mn.G, WF = mn.W.worldFloor;
for (const [id, mk] of listN) {
  if (only && !only.has(id)) continue;
  const LOD = process.env.LOD ?? "fine", pre = mp.G.caveShell(listP.get(id)(), LOD), now = mn.G.caveShell(mk(), LOD);
  const Pp = pre.positions, Ip = pre.indices, Pn = now.positions, In = now.indices, nv = Pp.length / 3, nt = Ip.length / 3;
  // Correspondence-free: a triangle is unchanged when the other mesh has a
  // triangle with the same three vertex positions.
  const tkey = (P, I, t) => [0, 1, 2].map(k => { const v = I[t * 3 + k]; return `${P[v * 3]},${P[v * 3 + 1]},${P[v * 3 + 2]}`; }).sort().join("|");
  const keysP = new Set(), keysN = new Set();
  for (let t = 0; t < Ip.length / 3; t++) keysP.add(tkey(Pp, Ip, t));
  for (let t = 0; t < In.length / 3; t++) keysN.add(tkey(Pn, In, t));
  const changedP = [], changedN = [];
  for (let t = 0; t < Ip.length / 3; t++) if (!keysN.has(tkey(Pp, Ip, t))) changedP.push(t);
  for (let t = 0; t < In.length / 3; t++) if (!keysP.has(tkey(Pn, In, t))) changedN.push(t);
  if (!changedP.length && !changedN.length) { const r = { id, area: 0, hausdorff: 0, unchanged: true }; rows.push(r); console.log(JSON.stringify(r)); continue; }
  const gp = grid(Pp, Ip);
  const gn = grid(Pn, In), defN = mk(), samp = GN.caveSampler(defN.source, WF, GN.caveNeighbours(defN));
  let H = 0, total = 0, at = null; const dir = { pre: { max: 0, at: null }, now: { max: 0, at: null } }, all = [];
  const vis = { buried: { area: 0, max: 0 }, water: { area: 0, max: 0, at: null } };
  const tally = (p, d, w) => { if (d <= 0.05) return; const r = samp.rock(p[0], p[1], p[2]), k = r < -0.25 ? "buried" : "water"; vis[k].area += w / 2; if (d > vis[k].max) { vis[k].max = d; if (k === "water") vis.water.at = p.map(x => +x.toFixed(2)); } };
  for (let t = 0; t < Ip.length / 3; t++) total += area(Pp, Ip, t);
  for (const [P, I, list, other, D] of [[Pp, Ip, changedP, gn, dir.pre], [Pn, In, changedN, gp, dir.now]]) for (const t of list) {
    const a = area(P, I, t);
    if (a < 1e-9) continue; // a null triangle is no surface
    const ss = samples(P, I, t), w = a / ss.length;
    for (const p of ss) { const d = other(p); all.push([d, w]); if (d > H) { H = d; at = p; } if (d > D.max) { D.max = d; D.at = p; } tally(p, d, w); }
  }
  const pct = (list, q) => { if (!list.length) return 0; const s = list.slice().sort((x, y) => x[0] - y[0]), tot = s.reduce((m, x) => m + x[1], 0); let c = 0; for (const [d, w] of s) { c += w; if (c >= q * tot) return d; } return s[s.length - 1][0]; };
  const r = { id, area: +total.toFixed(0), hausdorff: +H.toFixed(3), at: at && at.map(x => +x.toFixed(2)),
    preToNow: { max: +dir.pre.max.toFixed(3), at: dir.pre.at?.map(x => +x.toFixed(2)) }, nowToPre: { max: +dir.now.max.toFixed(3), at: dir.now.at?.map(x => +x.toFixed(2)) },
    changedTriangles: [changedP.length, changedN.length], p95changed: +pct(all, 0.95).toFixed(3),
    visibility: { buriedM2: +vis.buried.area.toFixed(2), buriedMax: +vis.buried.max.toFixed(3), waterM2: +vis.water.area.toFixed(2), waterMax: +vis.water.max.toFixed(3), waterAt: vis.water.at } };
  rows.push(r); console.log(JSON.stringify(r));
}
fs.writeFileSync(process.env.OUT ?? "/work/tmp/col1/surfdist.json", JSON.stringify(rows));
