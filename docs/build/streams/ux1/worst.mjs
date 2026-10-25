// UX-1 R1: worst-case corridor queries on the composed world (timing only).
const B = process.argv[2].replace(/\/?$/, "/");
const C = await import(B + "src/sim/carrier.js");
const S = await import(B + "src/sim/carrierStations.js");
const { gameWorld } = await import(B + "src/sim/world.js");
const w = gameWorld();
const s = C.fixtureGame(); s.opening.phase = 4;
const h = C.carrierHull(s), dart = s.fleet.vehicles.find((v) => v.hull === "dart");
const rows = [];
const time = (label, pose, n = 5) => {
  h.pose.position = { ...pose }; h.pose.yaw = pose.yaw ?? 0; C.updateBerth(s, w);
  const t = []; let last;
  for (let i = 0; i < n; i++) { const t0 = performance.now(); last = S.launchCorridor(s, w); t.push(performance.now() - t0); }
  t.sort((a, b) => a - b);
  rows.push({ label, median: +t[Math.floor(n / 2)].toFixed(1), max: +t[n - 1].toFixed(1), advice: last.advice.slice(0, 80) });
};
// Deep and low over flat ground: every heading blocked, the rise search climbs far.
for (const [x, z] of [[300, -600], [0, -1100], [400, -1200], [-200, -900], [600, -300]]) {
  const g = w.groundHeight(x, z);
  time(`low over ground at ${x},${z} (floor ${g.toFixed(0)})`, { x, y: g + 3, z });
  time(`clear water at ${x},${z}`, { x, y: Math.min(-2, g + 25), z });
}
console.table(rows);
