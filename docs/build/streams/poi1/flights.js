// POI-1 evidence pass: the body of one POST to server.mjs (ordinary keys only). "__WHICH__" is the dist
// ("before" | "after"), "__PLAN__" the flight plan from plan.mjs, "__LEGS__" which legs to fly ("all" or ids),
// "__VIEWS__" whether to shoot the landmark vantages.
const which = "__WHICH__", PLAN = __PLAN__, LEGS = "__LEGS__", VIEWS = __VIEWS__, STOPS = __STOPS__, S = "/work/tmp/poi-1/saves/";
const out = { which, legs: [], views: [], errors: [] };
out.renderer = await h.open(which);
const ds = () => h.page.evaluate(() => { const d = document.querySelector("#ocean").dataset; return { draws: +d.draws, lights: d.localLights, vertices: +d.vertices, meshes: +d.meshes, regions: d.regions }; });
const pull = () => h.page.evaluate(() => { const x = window.__gaps; window.__gaps = []; return x; });
const stats = (g) => {
  const s = [...g].sort((a, b) => a - b), q = (f) => s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * f))].toFixed(1) : null;
  return { frames: s.length, fps: s.length ? +(1000 / (s.reduce((a, b) => a + b, 0) / s.length)).toFixed(1) : null, p50: q(0.5), p95: q(0.95), p99: q(0.99), worst: s.length ? +s[s.length - 1].toFixed(1) : null };
};
const imp = async (file) => { await h.page.locator("#import-file").setInputFiles([]); await h.importSave(file); await h.calibrate(); };
const deg = (r) => r * 180 / Math.PI;
const face = async (t) => {
  const p = h.pos(await h.read()), dx = t.x - p.x, dz = t.z - p.z, dy = t.y - p.y;
  const bearing = (deg(Math.atan2(dx, -dz)) + 360) % 360, pitch = Math.max(-40, Math.min(40, deg(Math.atan2(dy, Math.hypot(dx, dz)))));
  await h.turnTo(bearing, pitch);
  return +Math.hypot(dx, dy, dz).toFixed(0);
};
const shot = async (name, t) => {
  const range = t ? await face(t) : null;
  await h.wait(900);
  const r = await h.shot(`${which}-${name}`), d = await ds();
  return { name, range, ...r, ...d };
};
for (const leg of PLAN) {
  if (LEGS !== "all" && !LEGS.split(",").includes(leg.id)) continue;
  await imp(S + leg.save + ".json");
  const rec = { id: leg.id, route: leg.route, reverse: leg.reverse, waypoints: [], shots: [], stalls: [] };
  rec.shots.push(await shot(`${leg.id}-start`, leg.points[1]));
  await pull();
  const gaps = [], t0 = Date.now();
  let flying = 0;
  for (let i = 1; i < leg.points.length; i++) {
    const f0 = Date.now(), r = await h.goto(leg.points[i], { tol: 7, timeout: 70 });
    flying += Date.now() - f0;
    gaps.push(...await pull());
    const d = await ds();
    rec.waypoints.push({ i, ...d, ...(r.stalled ? { stalled: r.stalled } : {}) });
    if (r.stalled) rec.stalls.push({ i, ...r });
    for (const st of STOPS ? leg.stops : []) for (const kind of ["glimpse", "pass"]) if ((kind === "glimpse" ? st.glimpse : st.at) === i && !(kind === "glimpse" && st.glimpse === st.at)) {
      rec.shots.push({ poi: st.poi, kind, ...await shot(`${leg.id}-${st.poi.replace(/^poi\./, "")}-${kind}`, st.beacon) });
      await pull();
    }
  }
  rec.seconds = +((Date.now() - t0) / 1000).toFixed(1);
  rec.flyingSeconds = +(flying / 1000).toFixed(1);
  rec.frames = stats(gaps);
  rec.drawsMax = Math.max(...rec.waypoints.map(w => w.draws)); rec.drawsMean = +(rec.waypoints.reduce((s, w) => s + w.draws, 0) / rec.waypoints.length).toFixed(0);
  out.legs.push(rec);
  h.log("leg", leg.id, JSON.stringify(rec.frames), "draws", rec.drawsMean, rec.drawsMax);
}
if (VIEWS) {
  const views = [["view-spire", { x: 1215, y: -485, z: -1319 }], ["view-gateworks", { x: 600, y: -345, z: -1262 }], ["view-rift-head", { x: 90, y: -290, z: -720 }],
    ["view-dishes", { x: 508, y: -255, z: -572 }], ["view-wreck", { x: 780, y: -242, z: -605 }]];
  for (const [save, target] of views) {
    await imp(S + save + ".json");
    const on = await shot(`${save}-lamp-on`, target);
    await h.tap("KeyL"); await h.wait(700);
    const off = await shot(`${save}-lamp-toggled`, null);
    await h.tap("KeyL"); await h.wait(300);
    out.views.push({ save, target, on, off });
  }
}
out.errors = h.errors();
return out;
