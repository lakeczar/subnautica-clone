// ENC-1: derive the 3090 play save headless with the game's own step: the save
// library's "dart" save (SAVE-1: P1's opening, reef and isles phases, earned by the
// bot at the nearest compatible root commit; the Dart built, cells in the pod
// locker), then the Dart flown out to the head of the authored Reef → Canopy route.
// No phase is replayed here; a missing or incompatible library save refuses loudly.
const B = process.env.B ?? "/home/worker/.t3/worktrees/subnautica-clone/t3-208fe0c1/.test-build/";
const fs = await import("node:fs");
const { Driver } = await import(B + "scripts/playthrough/driver.js");
const { boardAt } = await import(B + "scripts/playthrough/live.js");
const { reach } = await import(B + "scripts/playthrough/actions.js");
const { fly } = await import(B + "scripts/playthrough/routes.js");
const { librarySave } = await import(B + "scripts/playthrough/library.js");
const { createEnvelope, encodeSave } = await import(B + "src/save/codec.js");
await (await import(B + "scripts/playthrough/content.js")).loadCampaign();
const start = librarySave("dart");
console.log(start.describe);
const d = new Driver("enc1-play", "creel", start.state, start.entry.commands);
const dart = d.vehicle("dart");
reach(d, dart.id); boardAt(d, dart); fly(d, "dart_out");
const v = d.vehicle("dart");
const save = (name, state) => { const e = encodeSave(createEnvelope(state, { sessionId: "enc1-gpu-play", createdAt: "2026-10-21T00:00:00.000Z",
  savedAt: new Date(Date.parse("2026-10-21T00:00:00.000Z") + state.tick * 1000 / 60).toISOString() }));
  if (!e.ok) throw new Error(e.error); fs.mkdirSync("/work/tmp/enc1/saves", { recursive: true }); fs.writeFileSync(`/work/tmp/enc1/saves/${name}.json`, e.value);
  console.log(name, JSON.stringify(v.pose.position), "yaw", v.pose.yaw.toFixed(3), "hull", v.health.toFixed(1), "charge", v.charge.toFixed(1),
    "lamp", state.player.lamp, "cells", state.inventory.items.filter((i) => i.kind === "reserve_cell").map((i) => i.containerId).join(",")); };
save("canopy-head", d.state);
