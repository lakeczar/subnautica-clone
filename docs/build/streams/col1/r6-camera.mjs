// For each cave and spot: a camera in open water 4-10 m away whose line of sight to the spot stays in water
// (the cave's own rock field, positive in water), so before and after shots share one honest view.
const T = process.env.T;
const C = await import(T + "src/content/regions/caves.js"), I = await import(T + "src/content/regions/caves/index.js"), D = await import(T + "src/content/regions/caves/deep.js");
const G = await import(T + "src/content/regions/caveGeometry.js"), { worldFloor } = await import(T + "src/content/regions/worldFloor.js");
const defOf = id => {
  if (C.AUTHORED_CAVE_SOURCES.some(s => s.id === id)) return [C.caveDef(id, worldFloor), "authored"];
  const g = I.CANOPY_BASIN_GROUPS.find(x => x.source.id === id); if (g) return [I.groupDef(g, worldFloor), "canopy-basin"];
  return [G.buildCave(D.DEEP_CAVES.find(c => c.source.id === id).source, worldFloor), "deep"];
};
const spots = JSON.parse(process.env.SPOTS), out = [];
for (const { id, at } of spots) {
  const [def, lab] = defOf(id), s = G.caveSampler(def.source, worldFloor, G.caveNeighbours(def)), water = (x, y, z) => s.rock(x, y, z) > 0.3;
  // The spot's nearest footprint side: look at it at least 30 degrees off its plane (never edge-on).
  const f = def.replacementFootprints[0], sides = [[at[0] - f.minX, [1, 0, 0]], [f.maxX - at[0], [-1, 0, 0]], [at[2] - f.minZ, [0, 0, 1]], [f.maxZ - at[2], [0, 0, -1]]];
  const n = sides.reduce((m, x) => x[0] < m[0] ? x : m)[1];
  let best = null;
  for (const dist of [6, 4, 8, 10]) for (const el of [20, 0, 40, 60, -20]) for (let a = 0; a < 360 && !best; a += 22.5) {
    const r = el * Math.PI / 180, t = a * Math.PI / 180, d = [Math.cos(r) * Math.cos(t), Math.sin(r), Math.cos(r) * Math.sin(t)];
    if (Math.abs(d[0] * n[0] + d[2] * n[2]) < 0.5) continue;
    const cam = at.map((x, i) => x + d[i] * dist);
    let clear = water(...cam);
    for (let k = 1; clear && k < dist - 0.4; k += 0.25) clear = s.rock(...at.map((x, i) => x + d[i] * k)) > 0.05;
    if (clear) best = { cam: cam.map(x => +x.toFixed(2)), dist, el, az: a, side: n, inward: d[0] * n[0] + d[2] * n[2] > 0 };
  }
  const row = { id, lab, at, view: best }; out.push(row); console.log(JSON.stringify(row));
}
(await import("node:fs")).writeFileSync(process.env.OUT, JSON.stringify(out, null, 1));
