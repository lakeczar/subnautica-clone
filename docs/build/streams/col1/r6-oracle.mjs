// COL-1 R6 oracle on given caves, one scene per cave, in tree T (support module S, defaulting to T's).
// Prints, per cave: the shell variant's spurious blocks/stops, newly illegal ends and the protected
// routes, tethers and poses it newly blocks against today's box queries (and the columns control's).
const T = process.env.T, S = process.env.S ?? T + "tests/col1-oracle-support.js";
const { caveScenes, probe } = await import(S);
const C = await import(T + "src/content/regions/caves.js"), I = await import(T + "src/content/regions/caves/index.js"), D = await import(T + "src/content/regions/caves/deep.js");
const G = await import(T + "src/content/regions/caveGeometry.js"), { worldFloor } = await import(T + "src/content/regions/worldFloor.js");
const defOf = id => {
  if (C.AUTHORED_CAVE_SOURCES.some(s => s.id === id)) return C.caveDef(id, worldFloor);
  const g = I.CANOPY_BASIN_GROUPS.find(x => x.source.id === id); if (g) return I.groupDef(g, worldFloor);
  return G.buildCave(D.DEEP_CAVES.find(c => c.source.id === id).source, worldFloor);
};
const opts = { poses: 3000, moves: 1000, columns: 600, sights: 400, seed: 3 }, out = [];
for (const id of process.env.IDS.split(",")) {
  const { variants } = caveScenes([id], defOf), shell = probe(variants.shell, opts), cols = probe(variants.columns, opts);
  const row = { id, protectedPaths: shell.protected.paths, protectedPoses: shell.protected.poses,
    clearanceSpurious: shell.clearance.spurious, movesSpurious: shell.moves.spurious, endIllegal: shell.moves.endIllegal, endIllegalAsOld: shell.moves.endIllegalAsOld,
    newlyBlocked: shell.protected.newlyBlocked, columnsNewlyBlocked: cols.protected.newlyBlocked,
    examples: shell.examples.filter(e => /illegal|spurious|block/.test(e.kind)).slice(0, 3) };
  out.push(row); console.log(JSON.stringify(row));
}
(await import("node:fs")).writeFileSync(process.env.OUT, JSON.stringify(out, null, 1));
