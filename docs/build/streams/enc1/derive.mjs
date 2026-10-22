// ENC-1: derive the 3090 play save headless with the game's own step: P1's opening,
// reef and isles phases (Dart built, cells in the pod locker), then the Dart flown
// out to the head of the authored Reef → Canopy route.
const B = process.env.B ?? "/home/worker/.t3/worktrees/subnautica-clone/t3-208fe0c1/.test-build/";
const fs = await import("node:fs");
const { Driver } = await import(B + "scripts/playthrough/driver.js");
const { LIVE_PHASES, boardAt } = await import(B + "scripts/playthrough/live.js");
const { SaveSlot, loadSnapshot } = await import(B + "scripts/playthrough/persistence.js");
const { runPhases } = await import(B + "scripts/playthrough/runner.js");
const { reach } = await import(B + "scripts/playthrough/actions.js");
const { fly } = await import(B + "scripts/playthrough/routes.js");
const { createEnvelope, encodeSave } = await import(B + "src/save/codec.js");
await (await import(B + "scripts/playthrough/content.js")).loadCampaign();
const opts = { readOptional: true, reverse: false, verbose: false };
const slot = new SaveSlot("enc1-play");
const phases = LIVE_PHASES.slice(0, LIVE_PHASES.findIndex((p) => p.id === "canopy"));
const run = await runPhases(new Driver("creel", "creel"), phases, opts, slot);
console.log(run.phases.map((p) => `${p.id}:${p.status}`).join(" "));
const d = new Driver("enc1-play", "creel", loadSnapshot(slot.snapshots.get("isles")));
const dart = d.vehicle("dart");
reach(d, dart.id); boardAt(d, dart); fly(d, "dart_out");
const v = d.vehicle("dart");
const save = (name, state) => { const e = encodeSave(createEnvelope(state, { sessionId: "enc1-gpu-play", createdAt: "2026-10-21T00:00:00.000Z",
  savedAt: new Date(Date.parse("2026-10-21T00:00:00.000Z") + state.tick * 1000 / 60).toISOString() }));
  if (!e.ok) throw new Error(e.error); fs.writeFileSync(`/work/tmp/enc1/saves/${name}.json`, e.value);
  console.log(name, JSON.stringify(v.pose.position), "yaw", v.pose.yaw.toFixed(3), "hull", v.health.toFixed(1), "charge", v.charge.toFixed(1),
    "lamp", state.player.lamp, "cells", state.inventory.items.filter((i) => i.kind === "reserve_cell").map((i) => i.containerId).join(",")); };
save("canopy-head", d.state);
