// W2 evidence pass, the body of one /run call to server.mjs (ordinary keys only): the crown and its beacon from
// the Canopy edge, the Rift head and the carrier anchorage, the spur, and the summit with the crown station.
const S = "/work/tmp/w2/saves/", out = { shots: [], segments: [], notes: [] };
const BEACON = [341, -37.5, -567];
const shot = async (name) => { const r = await h.shot(name); out.shots.push({ name, ...r }); return r; };
const segment = async (label, ms, keys = ["KeyW"]) => {
  await h.fps(); for (const k of keys) await h.key(k, true); await h.wait(ms); await h.releaseAll();
  const f = await h.fps(); out.segments.push({ label, ...f }); return f;
};
const imp = async (file) => { await h.page.locator("#import-file").setInputFiles([]); await h.importSave(file); };
/** Face a world point: bearing and pitch from the camera, both by arrow keys. */
const face = async (t, extraPitch = 0) => {
  const c = (await h.read()).cam, dx = t[0] - c[0], dy = t[1] - c[1], dz = t[2] - c[2];
  const bearing = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360, pitch = Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI + extraPitch;
  await h.turnTo(bearing, Math.max(-60, Math.min(60, pitch)));
  out.notes.push({ at: c.map((v) => +v.toFixed(1)), target: t, bearing: +bearing.toFixed(1), pitch: +pitch.toFixed(1),
    distance: +Math.hypot(dx, dy, dz).toFixed(0) });
};
await h.open("after");

// 1. The Lantern Canopy's south edge (about 280 m): the crown's beacon over the dark Basin.
await imp(S + "canopy-edge.json"); await face(BEACON, -4); await h.wait(2500);
await shot("canopy-edge-to-crown");
await segment("Canopy edge: Creel toward the crown", 8000);
await face(BEACON, -4); await h.wait(1500); await shot("canopy-edge-to-crown-closer");

// 2. The Rift head (about 250 m, 180 m below the summit): the light shaft over the crown.
await imp(S + "rift-head.json"); await face([BEACON[0], BEACON[1] + 12, BEACON[2]]); await h.wait(2500);
await shot("rift-head-to-crown");

// 3. The carrier anchorage (240 m): up the crown's north cliff, the balcony lip and the beacon.
await imp(S + "anchorage.json"); await face([345, -120, -515], 8); await h.wait(2500);
await shot("anchorage-to-crown");
await segment("Anchorage: Creel toward the cliff", 6000);

// 4. The rim balcony: the flank mouth and the drop to the anchorage.
await imp(S + "balcony.json"); await face([348, -113, -520]); await h.wait(2000);
await shot("balcony-flank-mouth");
await face([360, -240, -430]); await h.wait(1500); await shot("balcony-over-anchorage");

// 5. The summit: the crown station, its mast, the beacon house and the crown mouth; then the rays below.
await imp(S + "summit.json"); await face([325, -46, -552], -6); await h.wait(2500);
await shot("summit-station-beacon");
await face([330, -78, -470]); await h.wait(2000); await shot("summit-rays-below");
await segment("Summit: Creel across the crown", 6000);

// 6. The first step: along the spur to the crown.
await imp(S + "first-step.json"); await face(BEACON, -3); await h.wait(2500);
await shot("first-step-along-spur");
out.errors = h.errors();
return out;
