// Ecology composed, heavy tier (TT-1): the split-chimney vent held for 20 s bare and
// shrouded. tests/ecology-composed.test.ts keeps the rest and a fast smoke.
import test from "node:test";
import assert from "node:assert/strict";
import { HAZARD_FIELDS } from "../src/content/ecology/hazards.js";
import { sitePosition } from "../src/content/ecology/sites.js";
import { RECIPES, type ItemKind } from "../src/content/registry.js";
import { CueMapper } from "../src/audio/mapping.js";
import { sceneFromState } from "../src/audio/scene.js";
import { regionAtPosition } from "../src/content/regions/layout.js";
import { addItem } from "../src/sim/inventory.js";
import { craft } from "../src/sim/progression.js";
import { at, saveable, world, WORKSHOP_BENCH } from "./b1-support.js";
import { hold, riftDiver, start } from "./ecology-composed-support.js";

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
  const scene = sceneFromState(step.state, true, regionAtPosition);
  const cues = mapper.events(step.events, step.state, scene);
  assert.ok(cues.some((c) => c.cue === "alert.threat-call" && c.distance > 0), "a positional warning call at the animal");
});
