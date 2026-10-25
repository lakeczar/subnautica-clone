/** ENV-1 stage 1: every interior's air proof played from the real first-visit
 * states: each declared route@milestone is the SAVE-1 library's save for this
 * commit (the nearest compatible export), so the craft, the suit and the
 * restored facilities are what that route actually has there. Heavy: it reads
 * the shared library. Where a machine has no library at all, the test says so
 * and skips; it never substitutes a stand-in state. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { INTERIORS } from "../src/content/interiors/index.js";
import type { InteriorDef } from "../src/content/interiors/types.js";
import { resolveAccess, validateInterior } from "../src/sim/interiors/validate.js";
import type { InteriorExterior } from "../src/sim/interiors/world.js";
import { librarySave, libraryRoot } from "../scripts/playthrough/library.js";
import { coldStoreHill, flatExterior, realExterior } from "./interiors-support.js";

/** The world each interior is proved in: today's terrain and solids, or a stand-in for the unbuilt island (as interiors-defs). */
function exteriorFor(def: InteriorDef): InteriorExterior {
  if (def.id === "island_field_station") return flatExterior(28);
  if (def.id === "island_cold_store") return coldStoreHill;
  return realExterior(def);
}

const root = libraryRoot();
for (const def of INTERIORS) {
  test(`${def.id}: the air proof holds from each route's real first-visit save`, (t) => {
    if (!fs.existsSync(root)) { t.skip(`no SAVE-1 library at ${root} on this machine: this proof did not run here`); return; }
    const used: string[] = [];
    const scenarios = resolveAccess(def, (kind) => { const p = librarySave(kind); used.push(p.describe); return p.state; });
    t.diagnostic(used.join("\n"));
    // The pump house waits for stage 2's composed world: a cave owns the ground beside it (see interiors-defs).
    const expected = def.id === "reef_pump_house" ? ["exterior"] : [];
    assert.deepEqual(validateInterior({ def, exterior: exteriorFor(def), scenarios }).map((p) => `${p.code}: ${p.message}`).map((m) => m.split(":")[0]), expected);
  });
}
