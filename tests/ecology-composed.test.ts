import test from "node:test";
import assert from "node:assert/strict";
import { HAZARD_FIELDS } from "../src/content/ecology/hazards.js";
import { sitePosition } from "../src/content/ecology/sites.js";
import { RECIPES, type ItemKind } from "../src/content/registry.js";
import { CueMapper } from "../src/audio/mapping.js";
import { sceneFromState } from "../src/audio/scene.js";
import { worldRegionAt } from "../src/render/regions.js";
import { homeOf } from "../src/sim/ecology/agents.js";
import { createEcology, resumeEcology } from "../src/sim/ecology/ecology.js";
import { addItem } from "../src/sim/inventory.js";
import { craft } from "../src/sim/progression.js";
import { executeCommand, stepGame } from "../src/sim/step.js";
import { recordStory } from "../src/sim/storyLink.js";
import type { GameEvent, GameState, Vec3 } from "../src/sim/types.js";
import { addNewContent } from "../src/save/content.js";
import { at, creelFirst, fund, saveable, world, WORKSHOP_BENCH } from "./b1-support.js";

/** Rule-staged diver with an 800 m suit (real recipes), placed at a real Rift pose. */
function riftDiver(p: Vec3): GameState {
  const s = creelFirst(["creel_350"]);
  recordStory(s, "C07");
  for (const id of ["suit_450", "suit_800"] as const) fund(s, id);
  at(s, p);
  s.player.vitals.health = 100;
  return s;
}
const hold = (s: GameState, n: number, still = true): { state: GameState; events: GameEvent[] } => {
  const events: GameEvent[] = [];
  for (let i = 0; i < n; i++) {
    const r = stepGame(s, still ? [{ type: "move", forward: 0, right: 0, vertical: 0, sprint: false }] : [], world);
    s = r.state; events.push(...r.events);
  }
  return { state: s, events };
};
const near = homeOf("rift_stalker_passage");
const start = { x: near.x + 8, y: near.y, z: near.z };

test("COMPOSED: in the real warm passage the glare stalker warns in hazard notices before it strikes a lit diver", () => {
  let s = riftDiver(start);
  const r = hold(s, 60 * 25);
  s = r.state;
  const notices = r.events.filter((e): e is Extract<GameEvent, { type: "notice" }> => e.type === "notice" && e.context === "ecology");
  assert.ok(notices.some((n) => /Rippling lights|turns its head/.test(n.message)), "first warning names the cue and the way out");
  const strikes = r.events.filter((e) => e.type === "threat-damage" && e.source === "ecology");
  const first = r.events.findIndex((e) => e.type === "notice" && e.context === "ecology" && !/heat|warm/i.test(e.message));
  if (strikes.length) assert.ok(first >= 0 && first < r.events.indexOf(strikes[0]!), "a warning precedes every strike");
  assert.ok(r.events.some((e) => e.type === "ecology"), "audio-mappable events");
  saveable(s);
});

test("COMPOSED: dark and still at the first warning, the stalker never strikes; the lamp key is the switch", () => {
  let s = riftDiver(start), struck = 0, warned = false;
  for (let i = 0; i < 60 * 40; i++) {
    const r = stepGame(s, [{ type: "move", forward: 0, right: 0, vertical: 0, sprint: false }], world);
    s = r.state;
    if (!warned && r.events.some((e) => e.type === "notice" && e.context === "ecology")) {
      warned = true;
      const lamp = executeCommand(s, { type: "lamp" }, world);
      s = lamp.state;
      assert.equal(s.player.lamp, false);
      assert.match(s.feedback, /running dark/);
    }
    struck += r.events.filter((e) => e.type === "threat-damage" && e.source === "ecology").length;
  }
  assert.ok(warned, "the lit diver was noticed first");
  assert.equal(struck, 0, "never struck after going dark and still");
  saveable(s);
});

test("COMPOSED: a save mid-encounter loads, resumes without fresh grace, and steps identically", () => {
  let s = riftDiver(start);
  s = hold(s, 60 * 6).state;
  assert.ok(s.world.ecology.agents.some((a) => a.mode !== "rest"), "an encounter is under way");
  saveable(s);
  const loaded = structuredClone(s); resumeEcology(loaded.world.ecology);
  const a = hold(s, 60 * 5), b = hold(loaded, 60 * 5);
  assert.deepEqual(b.state.world.ecology.agents, a.state.world.ecology.agents, "the encounter continues identically");
  assert.equal(b.state.player.vitals.health, a.state.player.vitals.health);
  // An old save gains New Game's ecology and lamp, then validates.
  const old = structuredClone(riftDiver(start)) as unknown as Record<string, any>;
  delete old.world.ecology; delete old.player.lamp;
  const completed = addNewContent(old as unknown as GameState);
  assert.ok(completed.ok);
  if (completed.ok) { assert.deepEqual(completed.value.world.ecology, createEcology()); assert.equal(completed.value.player.lamp, true); saveable(completed.value); }
});

test("COMPOSED: glow lures and startle ink are fabricated in pairs, carried, and released as deterrents", () => {
  const s = creelFirst();
  for (const id of ["glow_lures", "startle_ink"] as const) {
    at(s, { x: 0, y: 0.18, z: 21.2 });
    for (const [k, q] of Object.entries(RECIPES[id].cost)) addItem(s, k as ItemKind, q, "pod_locker");
    assert.equal(craft(s, id, world), null, id);
  }
  const count = (st: GameState, kind: ItemKind) => st.inventory.items.filter((i) => i.kind === kind).reduce((n, i) => n + i.quantity, 0);
  assert.equal(count(s, "glow_lure"), 2); assert.equal(count(s, "startle_ink"), 2);
  saveable(s);
  assert.match(executeCommand(s, { type: "deploy-lure" }, world).events.map((e) => e.type === "notice" ? e.message : "").join(), /open water/);
  at(s, { x: 30, y: -8, z: -20 });
  const lured = executeCommand(s, { type: "deploy-lure" }, world).state;
  assert.equal(lured.world.ecology.deterrents.at(-1)?.kind, "lure");
  assert.equal(count(lured, "glow_lure"), 1);
  saveable(lured);
  const inked = executeCommand(lured, { type: "release-ink" }, world).state;
  assert.equal(inked.world.ecology.deterrents.at(-1)?.kind, "ink");
  saveable(inked);
  const none = structuredClone(inked); none.inventory.items = none.inventory.items.filter((i) => i.kind !== "startle_ink");
  assert.match(executeCommand(none, { type: "release-ink" }, world).events.map((e) => e.type === "notice" ? e.message : "").join(), /No startle ink/);
});

test("COMPOSED: the split-chimney vent warns before harm; the fitted heat shroud holds; the mapper sounds it", () => {
  const plume = sitePosition(HAZARD_FIELDS.rift_split_plume.shape.center), inside = { ...plume, y: plume.y + 20 };
  const vent = HAZARD_FIELDS.rift_split_plume.cycle!;
  const bare = riftDiver(inside);
  bare.tick = vent.start * 60 - 60;
  const r = hold(bare, 60 * 20, false);
  const warnAt = r.events.findIndex((e) => e.type === "notice" && e.context === "ecology" && /Heat load/.test(e.message));
  assert.ok(warnAt >= 0, "a heat warning names the protection");
  assert.ok(r.state.player.vitals.health < 100, "unprotected harm after the warning");
  // Fit the shroud at the workshop (worn in equipment), then stand in the same vent.
  const fitted = riftDiver(WORKSHOP_BENCH);
  for (const [k, q] of Object.entries(RECIPES.heat_shroud.cost)) addItem(fitted, k as ItemKind, q, "workshop_locker");
  assert.equal(craft(fitted, "heat_shroud", world), null);
  assert.equal(fitted.inventory.items.find((i) => i.kind === "heat_shroud")?.fitted, "protection");
  saveable(fitted);
  at(fitted, inside); fitted.tick = vent.start * 60 - 60; fitted.player.vitals.health = 100;
  const shielded = hold(fitted, 60 * 20, false);
  const heatHarm = (shielded.events.filter((e) => e.type === "notice" && /Heat load critical/.test(e.message))).length;
  assert.equal(heatHarm, 0, "the shroud keeps the load below harm");
  // S6's mapper: an ecology warning becomes the positional warning call.
  const s = riftDiver(start), mapper = new CueMapper();
  const step = hold(s, 60 * 8);
  const scene = sceneFromState(step.state, true, worldRegionAt);
  const cues = mapper.events(step.events, step.state, scene);
  assert.ok(cues.some((c) => c.cue === "alert.threat-call" && c.distance > 0), "a positional warning call at the animal");
});
