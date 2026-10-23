// CW-1 traversal plan and saves (headless, the game's own rules and world).
// A Dart tour that passes every kit cave's mouths (55 caves, all seven regions):
// at each cave it drops to a point a few metres outside a mouth (at most
// 340 m deep: the playthrough's Dart has its 350 m refit), between caves it
// cruises at least 14 m over the highest floor on the leg. The tour is cut
// into segments, each started from its own save: the creel route's state
// after its refits phase (the real Dart and suits), the Dart moved to the
// segment's first stop at full charge, the diver aboard. So every browser
// job stays under 30 minutes.
// usage: node derive.mjs <repo> <outdir> [segments | hops] [cave,...]
// Deep caves (mouths below the Dart's 350 m): CW1_HULL=creel CW1_SNAPSHOT=divide
// CW1_DEEPEST=-790 tours them in the 800 m Creel of the divide phase's state.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const [repo, out, segArg, onlyArg] = process.argv.slice(2), B = path.join(repo, ".test-build/");
/** Optional: only these caves (a make-up tour for stops a pass missed). */
const ONLY = onlyArg ? new Set(onlyArg.split(",")) : null;
const SEGMENTS = segArg === "hops" ? 0 : Number(segArg ?? 8);
mkdirSync(out, { recursive: true });
const { CAVE_SOURCES } = await import(B + "src/content/regions/caves.js");
const { worldFloor } = await import(B + "src/content/regions/worldFloor.js");
const { gameWorld, hullClearance, sweptHullClearance } = await import(B + "src/sim/world.js");
const { HULL_COLLIDERS } = await import(B + "src/content/registry.js");
const { createEnvelope, encodeSave, decodeSave } = await import(B + "src/save/codec.js");
const HULL = process.env.CW1_HULL ?? "dart", SNAPSHOT = process.env.CW1_SNAPSHOT ?? "refits";
const world = gameWorld(), DART = HULL_COLLIDERS[HULL], DEEPEST = Number(process.env.CW1_DEEPEST ?? -340);
const clamp = (y, x, z) => Math.min(-2, Math.max(DEEPEST, worldFloor(x, z) + 3, y));
/** A clear Dart pose near `p`: step outward along `n`, then up, until it fits. */
function clearNear(p, n) {
  for (let out = 0; out <= 24; out += 2) for (const up of [0, 2, 4, 7, 10]) {
    const q = { x: p.x + n.x * out, z: p.z + n.z * out, y: 0 };
    q.y = clamp(p.y + up, q.x, q.z);
    if (hullClearance(world, q, DART)) return q;
  }
  return null;
}
// One stop per cave: outside its first mouth (largest first), else above its footprint.
const stops = [];
for (const s of CAVE_SOURCES.filter(c => !ONLY || ONLY.has(c.id))) {
  const mouths = s.portals.filter(p => p.kind === "mouth").sort((a, b) => b.clear.width * b.clear.height - a.clear.width * a.clear.height);
  let q = null, via = "", outer = null;
  for (const m of mouths) {
    const n = Math.hypot(m.normal.x, m.normal.z) > 0.5 ? m.normal : { x: 0, z: 0 };
    q = clearNear({ x: m.center.x + n.x * 6, y: m.center.y, z: m.center.z + n.z * 6 }, n.x || n.z ? n : { x: 1, z: 0 });
    // Leave and arrive along the mouth's own normal, out from under any overhang.
    if (q && (n.x || n.z)) outer = clearNear({ x: q.x + n.x * 16, y: q.y + 3, z: q.z + n.z * 16 }, n);
    if (q) { via = m.id; break; }
  }
  if (!q) { const f = s.footprint; q = clearNear({ x: (f.minX + f.maxX) / 2, y: s.topY + 4, z: (f.minZ + f.maxZ) / 2 }, { x: 1, z: 0 }); via = "above"; }
  if (!q) throw new Error(`no clear stop for ${s.id}`);
  stops.push({ cave: s.id, region: s.region, via, at: q, outer: outer ?? q, mouthY: mouths[0]?.center.y ?? null });
}
// Greedy tour from the Fanvault (beside the pod).
const tour = [stops.find(s => s.cave === "fanvault") ?? stops[0]];
const left = stops.filter(s => s !== tour[0]);
while (left.length) {
  const last = tour.at(-1).at;
  left.sort((a, b) => Math.hypot(a.at.x - last.x, a.at.z - last.z) - Math.hypot(b.at.x - last.x, b.at.z - last.z));
  tour.push(left.shift());
}
/** The highest obstacle on a straight leg: the floor, and each cave's top. */
function ceilingAlong(a, b) {
  const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 6));
  let hi = -Infinity;
  for (let i = 0; i <= n; i++) {
    const x = a.x + (b.x - a.x) * i / n, z = a.z + (b.z - a.z) * i / n;
    hi = Math.max(hi, worldFloor(x, z));
    // Cave terraces stand above the seabed: clear each cave's envelope too.
    for (const c of CAVE_SOURCES) { const f = c.footprint; if (x > f.minX - 6 && x < f.maxX + 6 && z > f.minZ - 6 && z < f.maxZ + 6) hi = Math.max(hi, c.topY - 10); }
  }
  return hi;
}
// Detours stay 40 m inside the world's edge (the Dart stops at the boundary).
const EDGE = { minX: -536, maxX: 1432, minZ: -1592, maxZ: 120 };
const inside = (p) => p.x >= EDGE.minX && p.x <= EDGE.maxX && p.z >= EDGE.minZ && p.z <= EDGE.maxZ;
const clampIn = (p) => ({ x: Math.min(EDGE.maxX, Math.max(EDGE.minX, p.x)), z: Math.min(EDGE.maxZ, Math.max(EDGE.minZ, p.z)) });
/** A leg's plan points: straight if it can cruise 14 m clear (and at least
 * 6 m under the surface), else bent round islands and shallows through a
 * detour beside its middle. */
function route(a, b, depth = 0) {
  if (ceilingAlong(a, b) <= -20 || depth >= 3) return [b];
  const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const px = -(b.z - a.z) / len, pz = (b.x - a.x) / len;
  for (const off of [60, 120, 200, 300, 450]) for (const side of [1, -1]) {
    const m = { x: mx + px * off * side, z: mz + pz * off * side };
    if (inside(m) && ceilingAlong(a, m) <= -20 && ceilingAlong(m, b) <= -20) return [m, b];
  }
  const m = clampIn({ x: mx + px * 200, z: mz + pz * 200 });
  return [...route(a, m, depth + 1), ...route(m, b, depth + 1)];
}
function leg(a, b) {
  const corners = [a, ...route(a, b)], out = [];
  for (let i = 1; i < corners.length; i++) {
    const p = corners[i - 1], q = corners[i];
    const y = Math.min(-6, Math.max(DEEPEST, ceilingAlong(p, q) + 14));
    if (i === 1) out.push({ x: p.x, y, z: p.z, cruise: true });
    out.push({ x: q.x, y, z: q.z, cruise: true });
  }
  return out;
}
const points = [{ ...tour[0].at, cave: tour[0].cave }];
for (let i = 1; i < tour.length; i++) {
  const a = tour[i - 1], b = tour[i];
  points.push({ ...a.outer }, ...leg(a.outer, b.outer), { ...b.outer }, { ...b.at, cave: b.cave });
}
// Every leg must sweep the Dart's hull clear of the game world's solids
// (structures, sea stacks, docks), not just the heightfield. A leg that does
// not is replanned: A* over Dart-clear cells (8 m, at a ladder of depths),
// every link swept, then string-pulled; a blocked cruise point may move to a
// clear cell within 12 m. What still has no path is reported (the driver
// would stall there).
const sweeps = (a, b) => sweptHullClearance(world, [a, b], DART);
// -1.5: awash, as the Dart runs on the surface (its cap is -0.9 m) over the Isles' shallows.
const CELL = 8, LEVELS = [-1.5, -4, -8, -14, -22, -34, -50, -70, -100, -140, -200, -260, -340, -420, -520, -640, -760].filter(y => y >= DEEPEST);
function plan(a, b, movableGoal) {
  const pad = 160, x0 = Math.max(EDGE.minX - 30, Math.min(a.x, b.x) - pad), x1 = Math.min(EDGE.maxX + 30, Math.max(a.x, b.x) + pad);
  const z0 = Math.max(EDGE.minZ - 30, Math.min(a.z, b.z) - pad), z1 = Math.min(EDGE.maxZ + 30, Math.max(a.z, b.z) + pad);
  const nx = Math.ceil((x1 - x0) / CELL), nz = Math.ceil((z1 - z0) / CELL), nl = LEVELS.length;
  const id = (i, k, l) => (k * nx + i) * nl + l, pos = (n) => { const l = n % nl, c = (n - l) / nl, i = c % nx, k = (c - i) / nx;
    const x = x0 + (i + 0.5) * CELL, z = z0 + (k + 0.5) * CELL; return { x, z, y: Math.max(worldFloor(x, z) + 3, LEVELS[l]) }; };
  const clear = new Map(), isClear = (n) => { let c = clear.get(n); if (c === undefined) { const p = pos(n); c = p.y <= -1.4 && hullClearance(world, p, DART); clear.set(n, c); } return c; };
  const cellOf = (p) => ({ i: Math.max(0, Math.min(nx - 1, Math.floor((p.x - x0) / CELL))), k: Math.max(0, Math.min(nz - 1, Math.floor((p.z - z0) / CELL))) });
  const near = (p) => { const { i, k } = cellOf(p), out = [];
    for (let di = -2; di <= 2; di++) for (let dk = -2; dk <= 2; dk++) for (let l = 0; l < nl; l++) {
      const ii = i + di, kk = k + dk; if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
      const n = id(ii, kk, l), q = pos(n); if (Math.abs(q.y - p.y) < 30 && isClear(n)) out.push(n);
    } return out; };
  const d3 = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
  const goals = new Set(near(b).filter(n => movableGoal ? d3(pos(n), b) <= 12 * 1.8 : sweeps(pos(n), b)));
  const g = new Map(), from = new Map(), open = [];
  // A start that is itself not clear (an earlier point no plan could move) starts from the clear cells round it.
  const startClear = hullClearance(world, a, DART);
  for (const n of near(a)) if (startClear ? sweeps(a, pos(n)) : d3(a, pos(n)) <= 12 * 1.8) { g.set(n, d3(a, pos(n))); from.set(n, -1); open.push([g.get(n) + d3(pos(n), b), n]); }
  let found = -1, expanded = 0;
  while (open.length && expanded < 60000) {
    let bi = 0; for (let j = 1; j < open.length; j++) if (open[j][0] < open[bi][0]) bi = j;
    const [, n] = open[bi]; open[bi] = open[open.length - 1]; open.pop(); expanded++;
    if (goals.has(n)) { found = n; break; }
    const l = n % nl, c = (n - l) / nl, i = c % nx, k = (c - i) / nx, p = pos(n);
    for (const [di, dk, dl] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[1,1,0],[1,-1,0],[-1,1,0],[-1,-1,0],[0,0,1],[0,0,-1]]) {
      const ii = i + di, kk = k + dk, ll = l + dl;
      if (ii < 0 || kk < 0 || ll < 0 || ii >= nx || kk >= nz || ll >= nl) continue;
      const m = id(ii, kk, ll); if (!isClear(m)) continue;
      const q = pos(m), cost = g.get(n) + d3(p, q);
      if (cost >= (g.get(m) ?? Infinity)) continue;
      if (!sweeps(p, q)) continue;
      g.set(m, cost); from.set(m, n); open.push([cost + d3(q, b), m]);
    }
  }
  if (found < 0) return null;
  const path = []; for (let n = found; n >= 0; n = from.get(n)) path.unshift({ ...pos(n), cruise: true });
  const goal = movableGoal ? null : b, full = [...(startClear ? [a] : []), ...path, ...(goal ? [goal] : [])];
  // String-pull: from each kept point, jump to the farthest that sweeps straight.
  const out = [full[0]];
  for (let i = 0; i < full.length - 1;) { let j = full.length - 1; while (j > i + 1 && !sweeps(full[i], full[j])) j--; out.push(full[j]); i = j; }
  return (startClear ? out.slice(1) : out).slice(0, goal ? -1 : undefined);
}
const blocked = [];
let replanned = 0, dropped = 0;
for (let i = 1; i < points.length; i++) {
  const a = points[i - 1], b = points[i];
  if (hullClearance(world, b, DART) && sweeps(a, b)) continue;
  const movable = !!b.cruise;
  const via = plan(a, b, movable);
  // A cruise corner no path reaches (on land) is only a waypoint: drop it and plan to the next point.
  if (!via && movable && i + 1 < points.length) { points.splice(i, 1); i--; dropped++; continue; }
  if (!via) { blocked.push(`${b.cave ?? "cruise"} at ${b.x.toFixed(0)},${b.y.toFixed(0)},${b.z.toFixed(0)}`); continue; }
  replanned++;
  if (movable) points.splice(i, 1, ...via); else points.splice(i, 0, ...via);
  i += via.length - (movable ? 1 : 0);
}
console.log(`swept every leg: ${replanned} replanned, ${dropped} unreachable corners dropped, ${blocked.length} still blocked${blocked.length ? ": " + blocked.join("; ") : ""}`);
let total = 0;
for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y, points[i].z - points[i - 1].z);
// Exactly SEGMENTS segments of near-equal length, each cut at the cave stop
// nearest its share of the tour; or, with "hops", one short run per cave:
// its approach point, the mouth, and back.
const segments = [];
if (segArg === "hops") for (const t of tour) segments.push([{ ...t.outer }, { ...t.at, cave: t.cave }, { ...t.outer }]);
else {
  const along = [0];
  for (let i = 1; i < points.length; i++) along.push(along[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y, points[i].z - points[i - 1].z));
  const stopsAt = points.map((p, i) => p.cave ? i : -1).filter(i => i > 0 && i < points.length - 1);
  if (stopsAt.length < SEGMENTS - 1) throw new Error(`${stopsAt.length} inner cave stops cannot cut ${SEGMENTS} segments`);
  const cuts = [0];
  for (let k = 1; k < SEGMENTS; k++) {
    // The nearest stop to k/SEGMENTS of the way, after the last cut, leaving one stop per cut still to come.
    const options = stopsAt.filter(i => i > cuts.at(-1)).slice(0, stopsAt.filter(i => i > cuts.at(-1)).length - (SEGMENTS - 1 - k));
    cuts.push(options.reduce((b, i) => Math.abs(along[i] - total * k / SEGMENTS) < Math.abs(along[b] - total * k / SEGMENTS) ? i : b));
  }
  cuts.push(points.length - 1);
  for (let k = 0; k < SEGMENTS; k++) segments.push(points.slice(cuts[k], cuts[k + 1] + 1));
}
// The real late state: the creel route through its refits phase.
const { Driver } = await import(B + "scripts/playthrough/driver.js");
const { LIVE_PHASES } = await import(B + "scripts/playthrough/live.js");
const { SaveSlot, loadSnapshot } = await import(B + "scripts/playthrough/persistence.js");
const { runPhases } = await import(B + "scripts/playthrough/runner.js");
await (await import(B + "scripts/playthrough/content.js")).loadCampaign();
const slot = new SaveSlot("cw1-traversal");
// The live phases reach the refits state; later states (the divide phase's 800 m Creel) need the creel route's later phases.
const later = LIVE_PHASES.some(p => p.id === SNAPSHOT) ? [] : (await import(B + "scripts/playthrough/later.js")).CREEL_LATER;
const run = await runPhases(new Driver("creel", "creel"), [...LIVE_PHASES, ...later], { readOptional: true, reverse: false, verbose: false }, slot);
console.log(run.phases.map((p) => `${p.id}:${p.status}`).join(" "));
const base = loadSnapshot(slot.snapshots.get(SNAPSHOT));
segments.forEach((seg, k) => {
  const s = structuredClone(base), dart = s.fleet.vehicles.find(v => v.hull === HULL);
  if (!dart || dart.rating < -DEEPEST + 10) throw new Error(`no ${HULL} rated below ${-DEEPEST} m in the ${SNAPSHOT} state (${dart?.rating})`);
  const p0 = seg[0];
  dart.pose = { ...dart.pose, frame: "world", position: { x: p0.x, y: p0.y, z: p0.z }, yaw: 0, pitch: 0 };
  dart.velocity = { x: 0, y: 0, z: 0 }; dart.charge = 100; dart.health = 100; dart.disabled = false;
  s.player.controlledVehicleId = dart.id; s.player.mode = "piloting"; s.player.interiorId = null; s.player.interiorPose = null;
  s.player.pose = { frame: "world", position: { ...dart.pose.position }, yaw: 0, pitch: 0 };
  s.player.vitals = { health: 100, oxygen: 100, food: 100 };
  const meta = { sessionId: "cw1-traversal", createdAt: "2026-10-22T00:00:00.000Z",
    savedAt: new Date(Date.parse("2026-10-22T00:00:00.000Z") + s.tick * 1000 / 60).toISOString() };
  const e = encodeSave(createEnvelope(s, meta));
  if (!e.ok) throw new Error(`segment ${k}: ${e.error}`);
  const back = decodeSave(e.value);
  if (!back.ok) throw new Error(`segment ${k}: ${back.error}`);
  writeFileSync(path.join(out, `seg${k}.json`), e.value);
});
writeFileSync(path.join(out, "plan.json"), JSON.stringify({ totalMetres: Math.round(total), stops: tour, segments }, null, 1));
console.log(`${tour.length} caves, ${Math.round(total)} m, ${segments.length} segments:`,
  segments.map(s => `${s.filter(p => p.cave).length} caves`).join(", "));
console.log("regions", [...new Set(tour.map(s => s.region))].join(", "));
console.log(`stops above the mouth (deeper than ${-DEEPEST} m or no clear mouth):`, stops.filter(s => s.via === "above" || (s.mouthY ?? 0) < DEEPEST).map(s => s.cave).join(", "));
