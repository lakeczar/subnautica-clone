// W2 evidence, diver views (the second /run of the session): leave the Creel with X so its cockpit roof
// never hides the beacon, then look at the crown from each viewpoint. Shots 01-04 in W2.md come from this pass.
const S = "/work/tmp/w2/saves/", out = { shots: [] };
const BEACON = [341, -37.5, -567];
const shot = async (name) => { const r = await h.shot(name); out.shots.push({ name, ...r }); return r; };
const imp = async (file) => { await h.page.locator("#import-file").setInputFiles([]); await h.importSave(file); };
const face = async (t, extraPitch = 0) => {
  const c = (await h.read()).cam, dx = t[0] - c[0], dy = t[1] - c[1], dz = t[2] - c[2];
  await h.turnTo((Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360, Math.max(-60, Math.min(60, Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI + extraPitch)));
};
/** Leave the Creel (X) and look as a diver: no cockpit roof in the view. */
const diver = async () => { await h.tap("KeyX"); await h.wait(1800); };
await h.open("after");
await imp(S + "canopy-edge.json"); await diver(); await face(BEACON, -2); await h.wait(2500); await shot("d-canopy-edge");
await imp(S + "rift-head.json"); await diver(); await face([BEACON[0], BEACON[1] + 14, BEACON[2]], -6); await h.wait(2500); await shot("d-rift-head");
await imp(S + "anchorage.json"); await diver(); await face([BEACON[0], BEACON[1] + 10, BEACON[2]], -10); await h.wait(2500); await shot("d-anchorage");
await imp(S + "summit.json"); await diver(); await face([319, -47, -547], 4); await h.wait(2500); await shot("d-summit-station");
return out;
