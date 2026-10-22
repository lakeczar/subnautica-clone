// Dish look, before and after (ordinary keys): one POST to server.mjs per dist ("__WHICH__").
const which = "__WHICH__", S = "/work/tmp/poi-1/saves/", out = { which, shots: [] };
out.renderer = await h.open(which);
const imp = async (file) => { await h.page.locator("#import-file").setInputFiles([]); await h.importSave(file); await h.calibrate(); };
const face = async (t) => { const p = h.pos(await h.read()), dx = t.x - p.x, dz = t.z - p.z, dy = t.y - p.y;
  await h.turnTo((Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360, Math.max(-40, Math.min(40, Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI))); };
for (const [save, t] of [["view-dish-north", { x: 440, y: -262, z: -526 }], ["view-dish-centre", { x: 508, y: -266, z: -572 }], ["view-dish-south", { x: 578, y: -265, z: -612 }], ["view-dishes", { x: 508, y: -255, z: -572 }]]) {
  await imp(S + save + ".json"); await face(t); await h.wait(1500);
  out.shots.push({ save, ...await h.shot(`${which}-${save}`) });
}
out.errors = h.errors();
return out;
