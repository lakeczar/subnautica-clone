// CW-1 traversal plan and saves (headless, the game's own rules and world).
// A Dart tour that passes every kit cave's mouths (55 caves, all seven regions):
// at each cave it drops to a point a few metres outside a mouth (at most
// 340 m deep: the playthrough's Dart has its 350 m refit), between caves it
// cruises at least 14 m over the highest floor on the leg. The tour is cut
// into segments, each started from its own save: the creel route's state
// after its refits phase (the real Dart and suits), the Dart moved to the
// segment's first stop at full charge, the diver aboard. So every browser
// job stays under 30 minutes.
// usage: node derive.mjs <repo> <outdir> [segments]
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const [repo, out, segArg, onlyArg] = process.argv.slice(2), B = path.join(repo, ".test-build/");
/** Optional: only these caves (a make-up tour for stops a pass missed). */
const ONLY = onlyArg ? new Set(onlyArg.split(",")) : null;
const SEGMENTS = Number(segArg ?? 8);
mkdirSync(out, { recursive: true });
const { CAVE_SOURCES } = await import(B + "src/content/regions/caves.js");
const { worldFloor } = await import(B + "src/content/regions/worldFloor.js");
const { gameWorld, hullClearance } = await import(B + "src/sim/world.js");
const { HULL_COLLIDERS } = await import(B + "src/content/registry.js");
const { createEnvelope, encodeSave, decodeSave } = await import(B + "src/save/codec.js");
const world = gameWorld(), DART = HULL_COLLIDERS.dart, DEEPEST = -340;
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
let total = 0;
for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y, points[i].z - points[i - 1].z);
// Segments of equal length, each starting at a cave stop.
const per = total / SEGMENTS, segments = [];
let acc = 0, start = 0;
for (let i = 1; i < points.length; i++) {
  acc += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y, points[i].z - points[i - 1].z);
  if ((acc >= per && points[i].cave && segments.length < SEGMENTS - 1) || i === points.length - 1) {
    segments.push(points.slice(start, i + 1)); start = i; acc = 0;
  }
}
// The real late state: the creel route through its refits phase.
const { Driver } = await import(B + "scripts/playthrough/driver.js");
const { LIVE_PHASES } = await import(B + "scripts/playthrough/live.js");
const { SaveSlot, loadSnapshot } = await import(B + "scripts/playthrough/persistence.js");
const { runPhases } = await import(B + "scripts/playthrough/runner.js");
await (await import(B + "scripts/playthrough/content.js")).loadCampaign();
const slot = new SaveSlot("cw1-traversal");
const run = await runPhases(new Driver("creel", "creel"), LIVE_PHASES, { readOptional: true, reverse: false, verbose: false }, slot);
console.log(run.phases.map((p) => `${p.id}:${p.status}`).join(" "));
const base = loadSnapshot(slot.snapshots.get("refits"));
segments.forEach((seg, k) => {
  const s = structuredClone(base), dart = s.fleet.vehicles.find(v => v.hull === "dart");
  if (!dart || dart.rating < 350) throw new Error("no 350 m Dart in the refits state");
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
console.log("stops above the mouth (deeper than 340 m or no clear mouth):", stops.filter(s => s.via === "above" || (s.mouthY ?? 0) < DEEPEST).map(s => s.cave).join(", "));
