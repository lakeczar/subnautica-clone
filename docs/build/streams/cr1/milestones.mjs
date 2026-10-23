// CR-1 (CRE-08): play P1's creel scenario headless to the Meridian with the game's
// own step and cache its milestone snapshots, then report where the player and
// each craft are at the milestones the native approaches start from.
// usage: node milestones.mjs <repo> <outdir>
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const [repo, out] = process.argv.slice(2), B = path.join(repo, ".test-build/");
mkdirSync(out, { recursive: true });
const { Driver } = await import(B + "scripts/playthrough/driver.js");
const { LIVE_PHASES } = await import(B + "scripts/playthrough/live.js");
const { CREEL_LATER } = await import(B + "scripts/playthrough/later.js");
const { SaveSlot, loadSnapshot } = await import(B + "scripts/playthrough/persistence.js");
const { runPhases } = await import(B + "scripts/playthrough/runner.js");
await (await import(B + "scripts/playthrough/content.js")).loadCampaign();
const live = new SaveSlot("cr1-play");
const upTo = [...LIVE_PHASES, ...CREEL_LATER];
const phases = upTo.slice(0, upTo.findIndex((p) => p.id === "meridian") + 1);
const run = await runPhases(new Driver("creel", "creel"), phases, { readOptional: true, reverse: false, verbose: false }, live);
console.log(run.phases.map((p) => `${p.id}:${p.status}`).join(" "));
writeFileSync(path.join(out, "milestones.json"), JSON.stringify(Object.fromEntries(live.snapshots)));
for (const m of ["isles", "rift", "divide", "meridian"]) {
  const s = loadSnapshot(live.snapshots.get(m));
  console.log(m, "tick", s.tick, "player", s.player.mode, JSON.stringify(s.player.pose.position), "in", s.player.controlledVehicleId ?? s.player.interiorId ?? "-",
    s.fleet.vehicles.map((v) => `${v.id}:${v.hull}@${[v.pose.position.x, v.pose.position.y, v.pose.position.z].map((n) => n.toFixed(0)).join(",")}${v.berth ? "(berth)" : ""} ${v.rating}m`).join(" | "));
}
