// CW-1 traversal plan and saves (headless, the game's own rules and world).
// A tour that passes every kit cave's mouths: at each cave it drops to a point
// a few metres outside a mouth (no deeper than the craft's rating allows),
// between caves it cruises at least 14 m over the highest floor on the leg,
// and every leg is swept against the game world's solids (A* where blocked).
// Saves are earned, not edited (SAVE-1): every segment starts from the same
// library save (by default `tour-ready`: the 350 m Dart at its cradle, full,
// two reserve cells aboard) and first flies from there to its first stop, so
// each segment opens with a cold approach at travel speed.
// usage: node derive.mjs <repo> <outdir> [segments | hops] [cave,...]
// Deep caves (mouths below the Dart's 350 m): CW1_SAVE=canopy-over-geared
// CW1_HULL=creel CW1_DEEPEST=-790 tours them in the 800 m Creel.
import { closeSync, copyFileSync, mkdirSync, openSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
const [repo, out, segArg, onlyArg] = process.argv.slice(2), B = path.join(repo, ".test-build/");
/** Optional: only these caves (a make-up tour for stops a pass missed). */
const ONLY = onlyArg ? new Set(onlyArg.split(",")) : null;
const SEGMENTS = segArg === "hops" ? 0 : Number(segArg ?? 8);
mkdirSync(out, { recursive: true });
// Long A* work prints nothing: tell the heavy-check job we are alive (at most every 30 s).
let beatAt = 0;
const beat = () => {
  const f = process.env.SILTWAKE_JOB_HEARTBEAT, t = Date.now();
  if (!f || t - beatAt < 30000) return;
  beatAt = t;
  try { utimesSync(f, t / 1000, t / 1000); } catch { closeSync(openSync(f, "a")); }
};
const { CAVE_SOURCES } = await import(B + "src/content/regions/caves.js");
const { worldFloor } = await import(B + "src/content/regions/worldFloor.js");
const { gameWorld, hullClearance, hullFloor, sweptHullClearance } = await import(B + "src/sim/world.js");
const { HULL_COLLIDERS } = await import(B + "src/content/registry.js");
const { decodeSave } = await import(B + "src/save/codec.js");
const { vehicleProfile } = await import(B + "src/sim/fittings.js");
const { motion } = await import(B + "src/sim/upgrades/effects.js");
const { supportedServiceSite } = await import(B + "src/sim/inventory.js");
const { STOP_IDS, WORKING_STOPS, SERVICE_MOORINGS } = await import(B + "src/content/stops.js");
const HULL = process.env.CW1_HULL ?? "dart", SAVE = process.env.CW1_SAVE ?? "tour-ready";
const world = gameWorld(), DART = HULL_COLLIDERS[HULL], DEEPEST = Number(process.env.CW1_DEEPEST ?? -340);
// Every kit cave's solids resident: the caves stream in play, and the planner
// must sweep the hull against them (mouths, terraces, overhangs), not only the floor.
world.kitCaves.step(world.kitCaves.clusters.map(c => c.index), Infinity, () => performance.now());
console.log(`kit caves resident for planning: ${world.kitCaves.resident.length} clusters, ${world.kitCaves.stats.residentBoxes} boxes`);
/** The keel's margin over the floor under the hull's footprint, metres. */
const KEEL = 1;
const clamp = (y, x, z) => Math.min(-2, Math.max(DEEPEST, worldFloor(x, z) + 3, y));
// The library save every segment starts from, and its craft.
const picked = execFileSync(process.execPath, [path.join(B, "scripts/playthrough/saves.js"), "pick", SAVE], { cwd: repo, encoding: "utf8" }).trim().split("\n");
const saveFile = picked.at(-1);
console.log(picked.join(" | "));
const base = decodeSave(readFileSync(saveFile, "utf8"));
if (!base.ok) throw new Error(`${SAVE}: ${base.error}`);
const craft = base.value.state.fleet.vehicles.find(v => v.id === base.value.state.player.controlledVehicleId);
if (!craft || craft.hull !== HULL || craft.rating < -DEEPEST + 10) throw new Error(`${SAVE}: not piloting a ${HULL} rated below ${-DEEPEST} m`);
const START = { ...craft.pose.position };
// The power plan, from the game's own drain for this craft: battery percent per
// metre at boost and at cruise, the charge aboard and the reserve cells the
// diver or the craft's hold carries (each swapped in through the inventory
// panel when the battery runs low). A powered craft supplies air; its 120 s
// of emergency air begins only when power is lost, so power is the budget.
const profile = vehicleProfile(base.value.state, craft);
const perMetre = (mode) => { const m = motion(profile, mode, { lamp: true }); return m.drain / m.speed; };
const cells = base.value.state.inventory.items.filter(i => i.kind === "reserve_cell" && (i.containerId === "diver" || i.containerId === craft.cargoId)).map(i => i.charge ?? 0);
const POWER = { charge: +craft.charge.toFixed(1), cells, capacity: profile.capacity, boostPerMetre: +perMetre("boost").toFixed(5), cruisePerMetre: +perMetre("cruise").toFixed(5),
  swapBelow: 20, emergencyAirS: craft.emergencyAir };
// Where this save's craft can be serviced (power, hull and air full, cells
// charged): the working stops and charging moorings the save has restored,
// each with a clear pose for the hull inside its service radius.
const SITES = [...STOP_IDS.map(id => ({ id, at: WORKING_STOPS[id].mooring, radius: WORKING_STOPS[id].serviceRadius })),
  ...SERVICE_MOORINGS.map(m => ({ id: `mooring:${m.id}`, at: m.position, radius: 14 }))].flatMap(site => {
  const probe = structuredClone(craft);
  probe.pose.position = { ...site.at };
  if (!supportedServiceSite(base.value.state, probe)) return [];
  for (const r of [0, 3, 6, 9]) for (let k = 0; k < (r ? 8 : 1); k++) for (const up of [0, 2, 4]) {
    const q = { x: site.at.x + r * Math.cos(k * Math.PI / 4), z: site.at.z + r * Math.sin(k * Math.PI / 4), y: 0 };
    q.y = clamp(site.at.y + up, q.x, q.z);
    probe.pose.position = q;
    if (Math.hypot(q.x - site.at.x, q.y - site.at.y, q.z - site.at.z) < site.radius - 3 && hullClearance(world, q, DART) && q.y >= hullFloor(world, q, DART) + KEEL &&
      supportedServiceSite(base.value.state, probe)) return [{ id: site.id, x: q.x, y: q.y, z: q.z }];
  }
  return [];
});
console.log(`service sites on this save: ${SITES.map(s => s.id).join(", ")}`);
/** A clear pose near `p`: step outward along `n`, then up, until it fits. */
function clearNear(p, n) {
  for (let out = 0; out <= 24; out += 2) for (const up of [0, 2, 4, 7, 10]) {
    const q = { x: p.x + n.x * out, z: p.z + n.z * out, y: 0 };
    q.y = clamp(p.y + up, q.x, q.z);
    // Clear of solids, and the keel over the floor under the whole footprint.
    if (hullClearance(world, q, DART) && q.y >= hullFloor(world, q, DART) + KEEL) return q;
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
// Greedy tour from the stop nearest the save's craft.
const tour = [], left = [...stops];
while (left.length) {
  const last = tour.at(-1)?.at ?? START;
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
const points = [{ ...START, start: true }, ...leg(START, tour[0].outer), { ...tour[0].outer }, { ...tour[0].at, cave: tour[0].cave }];
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
// The game's movement keeps the hull's keel over the highest floor under its
// whole footprint (hullFloor), which the swept solid test does not model: a
// leg must also keep a metre over that floor every 2 m along it.
const keelClear = (a, b) => {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2));
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
    if (p.y < hullFloor(world, p, DART) + KEEL) return false;
  }
  return true;
};
const sweeps = (a, b) => keelClear(a, b) && sweptHullClearance(world, [a, b], DART);
// -1.5: awash, as the Dart runs on the surface (its cap is -0.9 m) over the Isles' shallows.
const CELL = 8, LEVELS = [-1.5, -4, -8, -14, -22, -34, -50, -70, -100, -140, -200, -260, -340, -420, -520, -640, -760].filter(y => y >= DEEPEST);
function plan(a, b, movableGoal) {
  const pad = 160, x0 = Math.max(EDGE.minX - 30, Math.min(a.x, b.x) - pad), x1 = Math.min(EDGE.maxX + 30, Math.max(a.x, b.x) + pad);
  const z0 = Math.max(EDGE.minZ - 30, Math.min(a.z, b.z) - pad), z1 = Math.min(EDGE.maxZ + 30, Math.max(a.z, b.z) + pad);
  const nx = Math.ceil((x1 - x0) / CELL), nz = Math.ceil((z1 - z0) / CELL), nl = LEVELS.length;
  const id = (i, k, l) => (k * nx + i) * nl + l, pos = (n) => { const l = n % nl, c = (n - l) / nl, i = c % nx, k = (c - i) / nx;
    const x = x0 + (i + 0.5) * CELL, z = z0 + (k + 0.5) * CELL, q = { x, z, y: 0 }; q.y = Math.max(hullFloor(world, { x, y: 0, z }, DART) + KEEL + 1.5, LEVELS[l]); return q; };
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
    if ((expanded & 1023) === 0) beat();
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
/** Replan, in place, every leg of `points` that does not sweep clear. */
function repair(points) {
for (let i = 1; i < points.length; i++) {
  const a = points[i - 1], b = points[i];
  if (hullClearance(world, b, DART) && sweeps(a, b)) continue;
  // The craft's own start (its berth) is where the game put it: legs from it are planned like any other.
  const movable = !!b.cruise;
  const via = plan(a, b, movable);
  // A cruise corner no path reaches (on land) is only a waypoint: drop it and plan to the next point.
  if (!via && movable && i + 1 < points.length) { points.splice(i, 1); i--; dropped++; continue; }
  if (!via) { blocked.push(`${b.cave ?? "cruise"} at ${b.x.toFixed(0)},${b.y.toFixed(0)},${b.z.toFixed(0)}`); continue; }
  replanned++;
  if (movable) points.splice(i, 1, ...via); else points.splice(i, 0, ...via);
  i += via.length - (movable ? 1 : 0);
}
return points;
}
repair(points);
const reportBlocked = () => console.log(`swept every leg: ${replanned} replanned, ${dropped} unreachable corners dropped, ${blocked.length} still blocked${blocked.length ? ": " + blocked.join("; ") : ""}`);
reportBlocked();
let total = 0;
for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y, points[i].z - points[i - 1].z);
// Exactly SEGMENTS segments of near-equal length, each cut at the cave stop
// nearest its share of the tour; or, with "hops", one short run per cave:
// its approach point, the mouth, and back.
const segments = [];
// A segment after the first starts at the save's craft too: a cold transit
// to its first stop. It leaves the berth the way the tour does (the tour's
// own repaired opening waypoints, down to open water), then cruises to the
// stop through corners at most 150 m apart, so a blocked piece is short
// enough to replan.
const firstOpen = points.findIndex((q, i) => i > 0 && q.y < -20 && hullFloor(world, q, DART) < q.y - 10);
const berthExit = points.slice(0, Math.max(1, firstOpen) + 1).map(q => ({ ...q, cave: undefined }));
const densify = (path) => {
  const out = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 150);
    for (let k = 1; k < n; k++) { const x = a.x + (b.x - a.x) * k / n, z = a.z + (b.z - a.z) * k / n; out.push({ x, z, y: clamp(a.y + (b.y - a.y) * k / n, x, z), cruise: true }); }
    out.push(b);
  }
  return out;
};
const fromStart = (seg) => {
  const from = berthExit.at(-1);
  return repair([...berthExit, ...densify([from, ...leg(from, seg[0]), seg[0]]).slice(1, -1), ...seg]);
};
if (segArg === "hops") for (const t of tour) segments.push(fromStart([{ ...t.outer }, { ...t.at, cave: t.cave }, { ...t.outer }]));
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
  for (let k = 0; k < SEGMENTS; k++) segments.push(k === 0 ? points.slice(0, cuts[1] + 1) : fromStart(points.slice(cuts[k], cuts[k + 1] + 1)));
}
// Power: walk each segment at boost from the save's charge; before a leg that
// would leave less than MARGIN after it plus the way to the nearest site, call
// at the nearest site from where the craft is (a `service` point), which fills
// the battery. Inserted legs are swept and repaired like any other.
const MARGIN = 15;
const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const nearestSite = (p) => SITES.reduce((b, s) => !b || d3(p, s) < d3(p, b) ? s : b, null);
function withService(seg) {
  // At most one call before any planned point: a leg that a full battery
  // cannot cover is flown as planned (the reserve cells and the ledger cover it).
  const calledFor = new Set();
  let charge = POWER.charge;
  for (let i = 1; i < seg.length; i++) {
    beat();
    if (seg[i].service) { charge = 100; continue; }
    const cost = d3(seg[i - 1], seg[i]) * POWER.boostPerMetre, site = nearestSite(seg[i]);
    const after = charge - cost - (site ? d3(seg[i], site) * 1.5 * POWER.boostPerMetre : 0);
    if (after >= MARGIN || !SITES.length || seg[i].call || calledFor.has(seg[i])) { charge -= cost; continue; }
    calledFor.add(seg[i]);
    const here = nearestSite(seg[i - 1]);
    // A call at the site, then back to where the route left off.
    const call = repair([{ ...seg[i - 1] }, { x: here.x, y: here.y, z: here.z, service: here.id, tol: 3 }, { ...seg[i - 1], cave: undefined, cruise: true }]).slice(1)
      .map(q => q.service ? q : { ...q, call: true });
    seg.splice(i, 0, ...call);
    i--; // the next leg is to the first point of the call
  }
  return seg;
}
if (SITES.length) for (const seg of segments) withService(seg);
reportBlocked();
// Every segment's save is the library save itself, unedited.
segments.forEach((_, k) => copyFileSync(saveFile, path.join(out, `seg${k}.json`)));
reportBlocked();
// Each segment's energy: out along its points at boost, then home to the berth
// at cruise (its straight distance, half again for detours), against the charge
// and cells aboard. A plan that cannot come home on them is refused.
const metres = (seg) => seg.reduce((m, q, i) => i ? m + Math.hypot(q.x - seg[i - 1].x, q.y - seg[i - 1].y, q.z - seg[i - 1].z) : 0, 0);
// One full reserve cell is 35% of a stock battery (cellTransfer), less of a bigger bank.
const have = POWER.charge + POWER.cells.reduce((a, c) => a + 0.35 * c / POWER.capacity, 0);
// With service calls the budget runs from the last call (or the start); home
// is the berth or the nearest service site, whichever is nearer.
const energy = segments.map((seg, k) => {
  const last = seg.findLastIndex(q => q.service), from = last < 0 ? 0 : last, fill = last < 0 ? have : 100 + (have - POWER.charge);
  const end = seg.at(-1), home = Math.min(d3(end, START), ...SITES.map(s => d3(end, s))) * 1.5;
  const back = home * POWER.cruisePerMetre, boosted = metres(seg.slice(from)) * POWER.boostPerMetre;
  // Boost if the budget allows it, else cruise (the driver holds Shift only when boosting).
  const cruise = boosted + back > fill, out = cruise ? metres(seg.slice(from)) * POWER.cruisePerMetre : boosted;
  return { segment: k, metres: Math.round(metres(seg)), calls: seg.filter(q => q.service).map(q => q.service), cruise, outPercent: +out.toFixed(1), homePercent: +back.toFixed(1),
    havePercent: +fill.toFixed(1), viable: out + back <= fill };
});
for (const e of energy) console.log(`segment ${e.segment} power: ${e.metres} m out ${e.outPercent}% + home ${e.homePercent}% of ${e.havePercent}%${e.viable ? "" : " NOT VIABLE"}`);
if (energy.some(e => !e.viable)) process.exitCode = 2;
writeFileSync(path.join(out, "plan.json"), JSON.stringify({ save: { kind: SAVE, file: saveFile, start: START }, power: { ...POWER, segments: energy }, totalMetres: Math.round(total), stops: tour, segments }, null, 1));
console.log(`${tour.length} caves, ${Math.round(total)} m, ${segments.length} segments:`,
  segments.map(s => `${s.filter(p => p.cave).length} caves`).join(", "));
console.log("regions", [...new Set(tour.map(s => s.region))].join(", "));
console.log(`stops above the mouth (deeper than ${-DEEPEST} m or no clear mouth):`, stops.filter(s => s.via === "above" || (s.mouthY ?? 0) < DEEPEST).map(s => s.cave).join(", "));
