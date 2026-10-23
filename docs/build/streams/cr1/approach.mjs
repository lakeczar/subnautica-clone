// CR-1 (CRE-08): native continuous approaches. P1's creel scenario is played
// headless to the Meridian with the game's own step. The first time the bot's
// own play brings the player within RANGE of a threat, its exact state is saved:
// no placement, no idling. The GPU leg (play.mjs approach scenes) continues from
// there with ordinary keys. Also writes collision-checked waypoints for that leg:
// a craft is flown to a parking point near the threat (straight if the swept
// hull is clear, otherwise up, across and down), where the diver gets out.
// usage: node approach.mjs <repo> <outdir>
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const [repo, out] = process.argv.slice(2), B = path.join(repo, ".test-build/");
mkdirSync(out, { recursive: true });
const { Driver } = await import(B + "scripts/playthrough/driver.js");
const { LIVE_PHASES } = await import(B + "scripts/playthrough/live.js");
const { CREEL_LATER } = await import(B + "scripts/playthrough/later.js");
const { SaveSlot } = await import(B + "scripts/playthrough/persistence.js");
const { runPhases } = await import(B + "scripts/playthrough/runner.js");
const { createEnvelope, encodeSave } = await import(B + "src/save/codec.js");
const { sitePosition } = await import(B + "src/content/ecology/sites.js");
const { homeOf, layerY } = await import(B + "src/sim/ecology/agents.js");
const { THREAT_HOME, HULL_COLLIDERS } = await import(B + "src/content/registry.js");
const { gameWorld, sweptHullClearance } = await import(B + "src/sim/world.js");
await (await import(B + "scripts/playthrough/content.js")).loadCampaign();

const RANGE = 260;
const chimney = sitePosition({ site: "rift_split_chimney", offset: { x: 0, y: 0, z: 0 } });
// Each threat, where its window is crossed, and where a craft parks to let the diver out.
// `range`: how near the bot's own play must bring the player; `hull`: only while piloting that hull.
const TARGETS = {
  canopy: { at: THREAT_HOME, park: null, range: 150, hull: "dart" },
  rift: { at: chimney, park: { x: chimney.x - 64, y: chimney.y + 10, z: chimney.z } },
  divide: { at: homeOf("divide_skate_saddle"), park: { x: homeOf("divide_skate_saddle").x - 44, y: layerY("divide_dense_layer") + 14, z: homeOf("divide_skate_saddle").z } },
  meridian: { at: homeOf("district_choir_gallery"), park: { x: homeOf("district_choir_gallery").x - 48, y: homeOf("district_choir_gallery").y + 6, z: homeOf("district_choir_gallery").z } },
};
const captured = new Map();
const actor = (s) => s.fleet.vehicles.find((v) => v.id === s.player.controlledVehicleId) ?? null;
const place = (s) => actor(s)?.pose.position ?? s.player.pose.position;
const original = Driver.prototype.tick;
Driver.prototype.tick = function (controls) {
  const events = original.call(this, controls), s = this.state, p = place(s);
  if (s.player.mode === "piloting" || s.player.mode === "swimming")
    for (const [name, t] of Object.entries(TARGETS)) {
      if (captured.has(name) || Math.hypot(p.x - t.at.x, p.y - t.at.y, p.z - t.at.z) > (t.range ?? RANGE)) continue;
      if (t.hull && actor(s)?.hull !== t.hull) continue;
      captured.set(name, structuredClone(s));
    }
  return events;
};
const upTo = [...LIVE_PHASES, ...CREEL_LATER];
const phases = upTo.slice(0, upTo.findIndex((p) => p.id === "meridian") + 1);
const run = await runPhases(new Driver("creel", "creel"), phases, { readOptional: true, reverse: false, verbose: false }, new SaveSlot("cr1-approach"));
console.log(run.phases.map((p) => `${p.id}:${p.status}`).join(" "));

const world = gameWorld(), plans = {};
/** Swept, collision-checked legs for this hull from `a` to `b`: straight, or up, across and down. */
function legs(hull, a, b) {
  const shape = HULL_COLLIDERS[hull];
  if (sweptHullClearance(world, [a, b], shape)) return [b];
  for (let lift = 15; lift <= 240; lift += 15) {
    const top = Math.min(-12, Math.max(a.y, b.y) + lift), up = { ...a, y: top }, over = { ...b, y: top };
    if (sweptHullClearance(world, [a, up], shape) && sweptHullClearance(world, [up, over], shape) && sweptHullClearance(world, [over, b], shape)) return [up, over, b];
  }
  return null;
}
for (const [name, s] of captured) {
  const e = encodeSave(createEnvelope(s, { sessionId: `cr1-approach-${name}`, createdAt: "2026-10-23T00:00:00.000Z",
    savedAt: new Date(Date.parse("2026-10-23T00:00:00.000Z") + s.tick * 1000 / 60).toISOString() }));
  if (!e.ok) throw new Error(`${name}: ${e.error}`);
  writeFileSync(path.join(out, `approach-${name}.json`), e.value);
  const v = actor(s), t = TARGETS[name], start = place(s);
  plans[name] = { tick: s.tick, mode: s.player.mode, hull: v?.hull ?? null, start,
    distance: Math.hypot(start.x - t.at.x, start.y - t.at.y, start.z - t.at.z),
    route: v && t.park ? legs(v.hull, start, t.park) : null };
  console.log(name, JSON.stringify(plans[name]));
}
writeFileSync(path.join(out, "approach-plans.json"), JSON.stringify(plans, null, 2));
for (const name of Object.keys(TARGETS)) if (!captured.has(name)) console.log("NOT REACHED by the bot:", name);
