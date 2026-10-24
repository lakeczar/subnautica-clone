// Flight plan for the 3090 session: each deep leg's route as waypoints (every ~40 m), with the
// stops where a POI is glimpsed (~200 m before it) and passed (nearest approach).
const B = process.argv[2] + "/.test-build/";
const { ROUTES } = await import(B + "src/content/regions/passages.js");
const { POIS } = await import(B + "src/content/poi/sets.js");
const { VISTA_SOLIDS } = await import(B + "src/content/vistas.js");
const { worldFloor } = await import(B + "src/content/regions/worldFloor.js");
/** The middle of a POI's solids: what the camera frames. */
const focusOf = (id) => {
  const k = VISTA_SOLIDS.filter(s => s.id.startsWith(`vista.${id}.`) || s.id.startsWith(`vista.${id}`));
  const lo = { x: Math.min(...k.map(s => s.bounds.min.x)), y: Math.min(...k.map(s => s.bounds.min.y)), z: Math.min(...k.map(s => s.bounds.min.z)) };
  const hi = { x: Math.max(...k.map(s => s.bounds.max.x)), y: Math.max(...k.map(s => s.bounds.max.y)), z: Math.max(...k.map(s => s.bounds.max.z)) };
  return { x: +((lo.x + hi.x) / 2).toFixed(1), y: +((lo.y + hi.y) / 2).toFixed(1), z: +((lo.z + hi.z) / 2).toFixed(1) };
};
/** Clear water between a and b over the terrain (sampled every 2 m). */
const clear = (a, b) => { const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 2);
  for (let i = 1; i < n; i++) { const t = i / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t; if (worldFloor(x, z) > y - 1) return false; } return true; };
const LEGS = [
  { id: "basin_rift", save: "leg1-basin", route: "route.basin.rift", reverse: false },
  { id: "basin_divide", save: "leg23-divide", route: "route.basin.divide", reverse: true },
  { id: "divide_meridian", save: "leg23-divide", route: "route.divide.meridian_broad", reverse: false },
  { id: "service_ledge", save: "leg4-dock", route: "route.divide.service_ledge", reverse: false },
];
const out = [];
for (const leg of LEGS) {
  let path = ROUTES.find(r => r.id === leg.route).path.map(p => ({ x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1) }));
  if (leg.reverse) path = [...path].reverse();
  const pts = [path[0]]; let acc = 0;
  for (let i = 1; i < path.length; i++) { acc += Math.hypot(path[i].x - path[i-1].x, path[i].y - path[i-1].y, path[i].z - path[i-1].z); if (acc >= 40 || i === path.length - 1) { pts.push(path[i]); acc = 0; } }
  const stops = [];
  for (const p of POIS.filter(q => q.leg === leg.id)) {
    const f = focusOf(p.id), d = pts.map(q => Math.hypot(q.x - f.x, q.y - f.y, q.z - f.z)), near = d.indexOf(Math.min(...d));
    // Glimpse: the first waypoint within 240 m that sees it over the terrain.
    let glimpse = pts.findIndex((q, i) => i <= near && d[i] <= 240 && d[i] >= 120 && clear(q, f));
    if (glimpse < 0) glimpse = near;
    stops.push({ poi: p.id, at: near, glimpse, beacon: f, nearM: +d[near].toFixed(0), glimpseM: +d[glimpse].toFixed(0), seen: clear(pts[glimpse], f) });
  }
  out.push({ ...leg, points: pts, stops });
  console.error(leg.id, pts.length, "points", JSON.stringify(stops.map(s => [s.poi, s.glimpse, s.glimpseM, s.at, s.nearM])));
}
console.log(JSON.stringify(out));
