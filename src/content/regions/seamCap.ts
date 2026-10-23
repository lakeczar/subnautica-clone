/** Closing a clipped cave shell where it meets the terrain, one footprint side
 * plane at a time (COL-1 R7).
 *
 * The shell is clipped to its footprint, so where it reaches a side plane its
 * open edges (the cut) lie in that plane. Just inside the plane is the shell's
 * cross-section, solid or water; just outside is the terrain, solid below the
 * floor. The plane needs a face exactly where the two differ: facing out where
 * the shell is solid over terrain water, facing in where the terrain is solid
 * against shell water. That signed region is the sum, over cut edges, of the
 * strip between each edge and the floor. Summed as faces, those strips overlap
 * with opposite normals wherever the cut doubles back in the plane (R7-1).
 * Here they're summed as boundaries instead: shared floor pieces and strip
 * sides cancel exactly, what remains bounds the signed region, and only that
 * region is triangulated, once, from its own boundary, then checked against it.
 *
 * Plane coordinates are (u, y), chosen so that counter-clockwise in (u, y) is
 * the plane's outward normal: a +1 region's triangles come out
 * counter-clockwise, a -1 region's clockwise. Pure and Babylon-free. */

export interface PlanePoint { readonly u: number; readonly y: number }

/** Triangles (vertex id triples) covering the region the directed boundary
 * edges bound, each wound by its region's sign: counter-clockwise in (u, y)
 * where the winding number is +1, clockwise where it is -1. `edges` is a flat
 * list of directed edges (from, to), any order, summing to closed cycles.
 * Throws, naming `label`, if the boundary crosses itself, covers anywhere
 * twice, or the triangles fail to tile the region exactly. */
export function capTriangles(edges: readonly number[], at: (v: number) => PlanePoint, label: string): number[] {
  const boundary = cancel(edges, label);
  if (!boundary.length) return [];
  const crossing = firstCrossing(boundary, at);
  if (crossing) throw new Error(`${label}: the seam boundary crosses itself at ${crossing}`);
  const loops = extractLoops(boundary, at, label);
  const regions = nestLoops(loops, at, label);
  const out: number[] = [];
  for (const r of regions) {
    const tris = earcut(r.outer, r.holes, at);
    for (let t = 0; t < tris.length; t += 3) {
      const a = tris[t]!, b = tris[t + 1]!, c = tris[t + 2]!, s = cross(at(a), at(b), at(c));
      if (s === 0) continue;
      if ((s > 0) === (r.winding > 0)) out.push(a, b, c); else out.push(a, c, b);
    }
  }
  const problems = capProblems(edges, out, at);
  if (problems.length) throw new Error(`${label}: the seam faces don't tile their region:\n- ${problems.slice(0, 5).join("\n- ")}`);
  return out;
}

/** How `triangles` fail to tile exactly the signed region `edges` bound:
 * each triangle's winding sign matches the region's winding at its centroid,
 * no two overlap, and their signed area equals the region's (Green's
 * theorem on the edges). Empty when they tile it. */
export function capProblems(edges: readonly number[], triangles: readonly number[], at: (v: number) => PlanePoint): string[] {
  const out: string[] = [];
  let green = 0, scale = 0;
  for (let e = 0; e < edges.length; e += 2) {
    const p = at(edges[e]!), q = at(edges[e + 1]!);
    green += (p.u * q.y - q.u * p.y) / 2;
    scale = Math.max(scale, Math.abs(p.u), Math.abs(p.y));
  }
  let signed = 0;
  const boxes: { t: number; u0: number; u1: number; y0: number; y1: number }[] = [];
  for (let t = 0; t < triangles.length; t += 3) {
    const a = at(triangles[t]!), b = at(triangles[t + 1]!), c = at(triangles[t + 2]!), s = cross(a, b, c);
    signed += s / 2;
    const w = winding(edges, at, (a.u + b.u + c.u) / 3, (a.y + b.y + c.y) / 3);
    if (w !== Math.sign(s)) out.push(`triangle ${t / 3} is wound ${Math.sign(s)} where the region's winding is ${w}`);
    boxes.push({ t, u0: Math.min(a.u, b.u, c.u), u1: Math.max(a.u, b.u, c.u), y0: Math.min(a.y, b.y, c.y), y1: Math.max(a.y, b.y, c.y) });
  }
  // Areas carry Float32 positions' rounding: compare relative to the plane's scale.
  const tolerance = 1e-9 * Math.max(1, scale * scale) * Math.max(1, triangles.length);
  if (Math.abs(signed - green) > Math.max(1e-6, tolerance)) out.push(`signed area ${signed} against the region's ${green}`);
  boxes.sort((p, q) => p.u0 - q.u0);
  for (let i = 0; i < boxes.length && out.length < 20; i++) {
    const p = boxes[i]!;
    for (let j = i + 1; j < boxes.length && boxes[j]!.u0 < p.u1; j++) {
      const q = boxes[j]!;
      if (q.y0 >= p.y1 || q.y1 <= p.y0) continue;
      const area = capOverlap(triangles, p.t, q.t, at);
      if (area > 1e-9) out.push(`triangles ${p.t / 3} and ${q.t / 3} overlap by ${area.toExponential(2)} m²`);
    }
  }
  return out;
}

/** Twice the signed area of (a, b, c): positive counter-clockwise. */
function cross(a: PlanePoint, b: PlanePoint, c: PlanePoint): number {
  return (b.u - a.u) * (c.y - a.y) - (b.y - a.y) * (c.u - a.u);
}

/** Cancel opposite directed edges pairwise; a duplicate that survives means
 * twice-covered ground, which no valid seam has. */
function cancel(edges: readonly number[], label: string): number[] {
  const count = new Map<string, number>();
  for (let e = 0; e < edges.length; e += 2) {
    const a = edges[e]!, b = edges[e + 1]!;
    if (a === b) continue;
    const back = `${b},${a}`, n = count.get(back) ?? 0;
    if (n > 0) count.set(back, n - 1);
    else count.set(`${a},${b}`, (count.get(`${a},${b}`) ?? 0) + 1);
  }
  const out: number[] = [];
  for (const [key, n] of count) {
    if (n > 1) throw new Error(`${label}: the seam covers the edge ${key} ${n} times`);
    if (n === 1) { const [a, b] = key.split(",").map(Number); out.push(a!, b!); }
  }
  return out;
}

/** A proper crossing or collinear overlap between two boundary edges (a
 * shared endpoint is fine), as text, or null. */
function firstCrossing(edges: readonly number[], at: (v: number) => PlanePoint): string | null {
  const segs: { a: number; b: number; u0: number; u1: number }[] = [];
  for (let e = 0; e < edges.length; e += 2) {
    const a = edges[e]!, b = edges[e + 1]!, p = at(a), q = at(b);
    segs.push({ a, b, u0: Math.min(p.u, q.u), u1: Math.max(p.u, q.u) });
  }
  segs.sort((s, t) => s.u0 - t.u0);
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!;
    for (let j = i + 1; j < segs.length && segs[j]!.u0 <= s.u1; j++) {
      const t = segs[j]!;
      if (s.a === t.a || s.a === t.b || s.b === t.a || s.b === t.b) {
        // Sharing an endpoint: only a collinear overlap is a problem.
        const shared = s.a === t.a || s.a === t.b ? s.a : s.b, so = s.a === shared ? s.b : s.a, to = t.a === shared ? t.b : t.a;
        const o = at(shared), p = at(so), q = at(to);
        if (cross(o, p, q) === 0 && (p.u - o.u) * (q.u - o.u) + (p.y - o.y) * (q.y - o.y) > 0) return `edges ${s.a}-${s.b} and ${t.a}-${t.b} (collinear)`;
        continue;
      }
      const p1 = at(s.a), p2 = at(s.b), q1 = at(t.a), q2 = at(t.b);
      const d1 = cross(p1, p2, q1), d2 = cross(p1, p2, q2), d3 = cross(q1, q2, p1), d4 = cross(q1, q2, p2);
      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return `edges ${s.a}-${s.b} and ${t.a}-${t.b}`;
      const on = (d: number, o: PlanePoint, p: PlanePoint, r: PlanePoint): boolean => d === 0 &&
        r.u >= Math.min(o.u, p.u) && r.u <= Math.max(o.u, p.u) && r.y >= Math.min(o.y, p.y) && r.y <= Math.max(o.y, p.y);
      if (on(d1, p1, p2, q1) || on(d2, p1, p2, q2) || on(d3, q1, q2, p1) || on(d4, q1, q2, p2)) return `edges ${s.a}-${s.b} and ${t.a}-${t.b} (touching)`;
    }
  }
  return null;
}

/** Split the boundary (an Eulerian set of directed edges) into simple closed
 * loops. Where loops touch at a vertex, each leaves along the first outgoing
 * edge clockwise from the way it came in, so loops never cross; a walk that
 * still comes back through a vertex (a region pinched there) is cut there
 * into simple loops, whose sum is the same cycle. */
function extractLoops(edges: readonly number[], at: (v: number) => PlanePoint, label: string): number[][] {
  const out = new Map<number, number[]>(), used = new Uint8Array(edges.length / 2);
  for (let e = 0; e < edges.length; e += 2) (out.get(edges[e]!) ?? out.set(edges[e]!, []).get(edges[e]!)!).push(e / 2);
  const loops: number[][] = [];
  for (let first = 0; first < used.length; first++) {
    if (used[first]) continue;
    const loop: number[] = [], start = edges[first * 2]!;
    let e = first;
    for (let guard = 0; ; guard++) {
      if (guard > used.length) throw new Error(`${label}: the seam boundary doesn't close`);
      used[e] = 1; loop.push(edges[e * 2]!);
      const from = at(edges[e * 2]!), v = edges[e * 2 + 1]!, here = at(v);
      if (v === start) break;
      const back = Math.atan2(from.y - here.y, from.u - here.u);
      let best = -1, bestTurn = Infinity;
      for (const o of out.get(v) ?? []) {
        if (used[o]) continue;
        const to = at(edges[o * 2 + 1]!);
        let turn = back - Math.atan2(to.y - here.y, to.u - here.u);
        while (turn <= 0) turn += 2 * Math.PI;
        while (turn > 2 * Math.PI) turn -= 2 * Math.PI;
        if (turn < bestTurn) { bestTurn = turn; best = o; }
      }
      if (best < 0) throw new Error(`${label}: the seam boundary is open at vertex ${v}`);
      e = best;
    }
    loops.push(...simpleLoops(loop));
  }
  return loops;
}

/** A closed walk cut into simple loops at every vertex it passes twice. */
function simpleLoops(walk: readonly number[]): number[][] {
  const out: number[][] = [], path: number[] = [], seen = new Map<number, number>();
  for (const v of walk) {
    const was = seen.get(v);
    if (was !== undefined) {
      const loop = path.splice(was);
      for (const w of loop) seen.delete(w);
      out.push(loop);
    }
    seen.set(v, path.length);
    path.push(v);
  }
  if (path.length) out.push(path);
  return out.filter(l => l.length >= 3);
}

interface Region { readonly outer: number[]; readonly holes: number[][]; readonly winding: number }

/** Nest loops by containment: inside a loop and outside its children the
 * winding number is the sum of that loop's and its ancestors' signs. Each
 * loop with a nonzero winding becomes a region, its children its holes. */
function nestLoops(loops: readonly number[][], at: (v: number) => PlanePoint, label: string): Region[] {
  const info = loops.map(loop => {
    let area = 0;
    for (let i = 0; i < loop.length; i++) {
      const p = at(loop[i]!), q = at(loop[(i + 1) % loop.length]!);
      area += (p.u * q.y - q.u * p.y) / 2;
    }
    return { loop, area, inside: area === 0 ? null : interiorPoint(loop, at) };
  }).filter(l => l.inside !== null);
  const parent = info.map((l, i) => {
    let best = -1;
    for (let j = 0; j < info.length; j++) {
      if (j === i || Math.abs(info[j]!.area) <= Math.abs(l.area)) continue;
      if (!containsPoint(info[j]!.loop, at, l.inside!)) continue;
      if (best < 0 || Math.abs(info[j]!.area) < Math.abs(info[best]!.area)) best = j;
    }
    return best;
  });
  const winding = info.map((_, i) => {
    let w = 0;
    for (let j = i; j >= 0; j = parent[j]!) w += Math.sign(info[j]!.area);
    return w;
  });
  const regions: Region[] = [];
  info.forEach((l, i) => {
    const w = winding[i]!;
    if (w === 0) return;
    if (Math.abs(w) > 1) throw new Error(`${label}: the seam covers ground ${w} times`);
    // With |w| <= 1 every loop directly inside a covered region opens a hole in it.
    const holes: number[][] = [];
    info.forEach((h, j) => {
      if (parent[j] !== i) return;
      if (winding[j] !== 0) throw new Error(`${label}: a loop inside a covered region covers it again`);
      holes.push(h.loop);
    });
    regions.push({ outer: l.loop, holes, winding: w });
  });
  return regions;
}

/** A point strictly inside a simple loop: the centroid of its largest ear. */
function interiorPoint(loop: readonly number[], at: (v: number) => PlanePoint): PlanePoint | null {
  const tris = earcut(loop, [], at);
  let best = -1, area = 0;
  for (let t = 0; t < tris.length; t += 3) {
    const s = Math.abs(cross(at(tris[t]!), at(tris[t + 1]!), at(tris[t + 2]!)));
    if (s > area) { area = s; best = t; }
  }
  if (best < 0) return null;
  const a = at(tris[best]!), b = at(tris[best + 1]!), c = at(tris[best + 2]!);
  return { u: (a.u + b.u + c.u) / 3, y: (a.y + b.y + c.y) / 3 };
}

/** Even-odd containment of a point in a simple loop. */
function containsPoint(loop: readonly number[], at: (v: number) => PlanePoint, p: PlanePoint): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = at(loop[i]!), b = at(loop[j]!);
    if ((a.y > p.y) !== (b.y > p.y) && p.u < (b.u - a.u) * (p.y - a.y) / (b.y - a.y) + a.u) inside = !inside;
  }
  return inside;
}

/** Winding number of the directed edges around a point (signed crossings of
 * a ray towards +u). */
function winding(edges: readonly number[], at: (v: number) => PlanePoint, u: number, y: number): number {
  let w = 0;
  for (let e = 0; e < edges.length; e += 2) {
    const a = at(edges[e]!), b = at(edges[e + 1]!);
    if (a.y <= y) { if (b.y > y && (b.u - a.u) * (y - a.y) - (u - a.u) * (b.y - a.y) > 0) w++; }
    else if (b.y <= y && (b.u - a.u) * (y - a.y) - (u - a.u) * (b.y - a.y) < 0) w--;
  }
  return w;
}

/** Area of the intersection of two triangles (convex clipping), given as
 * offsets `s` and `t` into a flat list of vertex id triples. */
export function capOverlap(tris: readonly number[], s: number, t: number, at: (v: number) => PlanePoint): number {
  let poly: PlanePoint[] = [at(tris[s]!), at(tris[s + 1]!), at(tris[s + 2]!)];
  const clip: PlanePoint[] = [at(tris[t]!), at(tris[t + 1]!), at(tris[t + 2]!)];
  if (cross(clip[0]!, clip[1]!, clip[2]!) < 0) clip.reverse();
  if (cross(poly[0]!, poly[1]!, poly[2]!) < 0) poly.reverse();
  for (let i = 0; i < 3 && poly.length; i++) {
    const a = clip[i]!, b = clip[(i + 1) % 3]!, next: PlanePoint[] = [];
    for (let k = 0; k < poly.length; k++) {
      const p = poly[k]!, q = poly[(k + 1) % poly.length]!, dp = cross(a, b, p), dq = cross(a, b, q);
      if (dp >= 0) next.push(p);
      if ((dp >= 0) !== (dq >= 0)) { const r = dp / (dp - dq); next.push({ u: p.u + (q.u - p.u) * r, y: p.y + (q.y - p.y) * r }); }
    }
    poly = next;
  }
  let area = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i]!, q = poly[(i + 1) % poly.length]!; area += (p.u * q.y - q.u * p.y) / 2; }
  return Math.abs(area);
}

// --- Polygon triangulation ----------------------------------------------------
// A compact port of earcut (Mapbox, ISC licence, https://github.com/mapbox/earcut),
// without its z-order hashing (seam polygons are small), over vertex ids.

interface Node { i: number; u: number; y: number; prev: Node; next: Node; steiner: boolean }

/** Triangles of a polygon (outer loop, holes) as vertex id triples, in no
 * particular winding. */
function earcut(outer: readonly number[], holes: readonly (readonly number[])[], at: (v: number) => PlanePoint): number[] {
  const tris: number[] = [];
  let node = linkedList(outer, at, true);
  if (!node || node.next === node.prev) return tris;
  if (holes.length) node = eliminateHoles(holes, node, at);
  earcutLinked(node, tris, 0);
  return tris;
}

function linkedList(ids: readonly number[], at: (v: number) => PlanePoint, clockwise: boolean): Node | null {
  let sum = 0;
  for (let i = 0, j = ids.length - 1; i < ids.length; j = i++) { const a = at(ids[i]!), b = at(ids[j]!); sum += (b.u - a.u) * (a.y + b.y); }
  let last: Node | null = null;
  if (clockwise === sum > 0) for (const v of ids) last = insertNode(v, at(v), last);
  else for (let k = ids.length - 1; k >= 0; k--) last = insertNode(ids[k]!, at(ids[k]!), last);
  if (last && equals(last, last.next)) { removeNode(last); last = last.next; }
  return last;
}

function filterPoints(start: Node | null, end?: Node): Node | null {
  if (!start) return start;
  if (!end) end = start;
  let p = start, again: boolean;
  do {
    again = false;
    if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
      removeNode(p);
      p = end = p.prev;
      if (p === p.next) break;
      again = true;
    } else p = p.next;
  } while (again || p !== end);
  return end;
}

function earcutLinked(ear: Node | null, tris: number[], pass: number): void {
  if (!ear) return;
  let stop = ear;
  while (ear.prev !== ear.next) {
    const prev: Node = ear.prev, next: Node = ear.next;
    if (isEar(ear)) {
      tris.push(prev.i, ear.i, next.i);
      removeNode(ear);
      ear = next.next; stop = next.next;
      continue;
    }
    ear = next;
    if (ear === stop) {
      if (!pass) earcutLinked(filterPoints(ear), tris, 1);
      else if (pass === 1) earcutLinked(cureLocalIntersections(filterPoints(ear)!, tris), tris, 2);
      else if (pass === 2) splitEarcut(ear, tris);
      break;
    }
  }
}

function isEar(ear: Node): boolean {
  const a = ear.prev, b = ear, c = ear.next;
  if (area(a, b, c) >= 0) return false;
  const u0 = Math.min(a.u, b.u, c.u), u1 = Math.max(a.u, b.u, c.u), y0 = Math.min(a.y, b.y, c.y), y1 = Math.max(a.y, b.y, c.y);
  let p = c.next;
  while (p !== a) {
    if (p.u >= u0 && p.u <= u1 && p.y >= y0 && p.y <= y1 && pointInTriangle(a.u, a.y, b.u, b.y, c.u, c.y, p.u, p.y) && area(p.prev, p, p.next) >= 0) return false;
    p = p.next;
  }
  return true;
}

function cureLocalIntersections(start: Node, tris: number[]): Node | null {
  let p = start;
  do {
    const a = p.prev, b = p.next.next;
    if (!equals(a, b) && intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {
      tris.push(a.i, p.i, b.i);
      removeNode(p); removeNode(p.next);
      p = start = b;
    }
    p = p.next;
  } while (p !== start);
  return filterPoints(p);
}

function splitEarcut(start: Node, tris: number[]): void {
  let a = start;
  do {
    let b = a.next.next;
    while (b !== a.prev) {
      if (a.i !== b.i && isValidDiagonal(a, b)) {
        let c: Node | null = splitPolygon(a, b);
        const a2 = filterPoints(a, a.next);
        c = filterPoints(c, c.next);
        earcutLinked(a2, tris, 0);
        earcutLinked(c, tris, 0);
        return;
      }
      b = b.next;
    }
    a = a.next;
  } while (a !== start);
}

function eliminateHoles(holes: readonly (readonly number[])[], outer: Node, at: (v: number) => PlanePoint): Node {
  const queue: Node[] = [];
  for (const h of holes) {
    const list = linkedList(h, at, false);
    if (!list) continue;
    if (list === list.next) list.steiner = true;
    queue.push(leftmost(list));
  }
  queue.sort((p, q) => p.u - q.u);
  for (const h of queue) outer = eliminateHole(h, outer);
  return outer;
}

function eliminateHole(hole: Node, outer: Node): Node {
  const bridge = findHoleBridge(hole, outer);
  if (!bridge) return outer;
  const reverse = splitPolygon(bridge, hole);
  filterPoints(reverse, reverse.next);
  return filterPoints(bridge, bridge.next)!;
}

function findHoleBridge(hole: Node, outer: Node): Node | null {
  let p = outer, qu = -Infinity, m: Node | null = null;
  const hu = hole.u, hy = hole.y;
  do {
    if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
      const u = p.u + (hy - p.y) * (p.next.u - p.u) / (p.next.y - p.y);
      if (u <= hu && u > qu) {
        qu = u;
        m = p.u < p.next.u ? p : p.next;
        if (u === hu) return m;
      }
    }
    p = p.next;
  } while (p !== outer);
  if (!m) return null;
  const stop = m, mu = m.u, my = m.y;
  let tanMin = Infinity;
  p = m;
  do {
    if (hu >= p.u && p.u >= mu && hu !== p.u && pointInTriangle(hy < my ? hu : qu, hy, mu, my, hy < my ? qu : hu, hy, p.u, p.y)) {
      const tan = Math.abs(hy - p.y) / (hu - p.u);
      if (locallyInside(p, hole) && (tan < tanMin || (tan === tanMin && (p.u > m.u || (p.u === m.u && sectorContainsSector(m, p)))))) { m = p; tanMin = tan; }
    }
    p = p.next;
  } while (p !== stop);
  return m;
}

function sectorContainsSector(m: Node, p: Node): boolean { return area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0; }

function leftmost(start: Node): Node {
  let p = start, best = start;
  do { if (p.u < best.u || (p.u === best.u && p.y < best.y)) best = p; p = p.next; } while (p !== start);
  return best;
}

function pointInTriangle(au: number, ay: number, bu: number, by: number, cu: number, cy: number, pu: number, py: number): boolean {
  return (cu - pu) * (ay - py) >= (au - pu) * (cy - py) && (au - pu) * (by - py) >= (bu - pu) * (ay - py) && (bu - pu) * (cy - py) >= (cu - pu) * (by - py);
}

function isValidDiagonal(a: Node, b: Node): boolean {
  return a.next.i !== b.i && a.prev.i !== b.i && !intersectsPolygon(a, b) &&
    ((locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b) && (area(a.prev, a, b.prev) !== 0 || area(a, b.prev, b) !== 0)) ||
      (equals(a, b) && area(a.prev, a, a.next) > 0 && area(b.prev, b, b.next) > 0));
}

function area(p: Node, q: Node, r: Node): number { return (q.y - p.y) * (r.u - q.u) - (q.u - p.u) * (r.y - q.y); }
function equals(p: Node, q: Node): boolean { return p.u === q.u && p.y === q.y; }

function intersects(p1: Node, q1: Node, p2: Node, q2: Node): boolean {
  const o1 = Math.sign(area(p1, q1, p2)), o2 = Math.sign(area(p1, q1, q2)), o3 = Math.sign(area(p2, q2, p1)), o4 = Math.sign(area(p2, q2, q1));
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}
function onSegment(p: Node, q: Node, r: Node): boolean {
  return q.u <= Math.max(p.u, r.u) && q.u >= Math.min(p.u, r.u) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
}

function intersectsPolygon(a: Node, b: Node): boolean {
  let p = a;
  do {
    if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i && intersects(p, p.next, a, b)) return true;
    p = p.next;
  } while (p !== a);
  return false;
}

function locallyInside(a: Node, b: Node): boolean {
  return area(a.prev, a, a.next) < 0 ? area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0 : area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
}

function middleInside(a: Node, b: Node): boolean {
  let p = a, inside = false;
  const pu = (a.u + b.u) / 2, py = (a.y + b.y) / 2;
  do {
    if ((p.y > py) !== (p.next.y > py) && p.next.y !== p.y && pu < (p.next.u - p.u) * (py - p.y) / (p.next.y - p.y) + p.u) inside = !inside;
    p = p.next;
  } while (p !== a);
  return inside;
}

function splitPolygon(a: Node, b: Node): Node {
  const a2 = makeNode(a.i, a), b2 = makeNode(b.i, b), an = a.next, bp = b.prev;
  a.next = b; b.prev = a;
  a2.next = an; an.prev = a2;
  b2.next = a2; a2.prev = b2;
  bp.next = b2; b2.prev = bp;
  return b2;
}

function makeNode(i: number, p: PlanePoint): Node {
  const n = { i, u: p.u, y: p.y, steiner: false } as Node;
  n.prev = n; n.next = n;
  return n;
}

function insertNode(i: number, p: PlanePoint, last: Node | null): Node {
  const n = makeNode(i, p);
  if (last) { n.next = last.next; n.prev = last; last.next.prev = n; last.next = n; }
  return n;
}

function removeNode(p: Node): void { p.next.prev = p.prev; p.prev.next = p.next; }
