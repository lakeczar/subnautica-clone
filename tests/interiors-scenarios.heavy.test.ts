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
import { worldFloor } from "../src/content/regions/worldFloor.js";
import { resolveAccess, validateInterior } from "../src/sim/interiors/validate.js";
import type { WorldQueries } from "../src/sim/types.js";
import { createWorldQueries } from "../src/sim/world.js";
import { librarySave, libraryRoot } from "../scripts/playthrough/library.js";
import { flatWorld } from "./interiors-support.js";

/** The world each interior is proved in: today's terrain, or a stand-in for the unbuilt island (as interiors-defs). */
function exteriorFor(def: InteriorDef): WorldQueries {
  if (def.id === "island_field_station") return flatWorld(28);
  if (def.id === "island_cold_store") return createWorldQueries([], (x, z) => Math.abs(x + 232) < 0.6 && z > 3 + 7.6 && z < 3 + 8.8 ? 0 : 24);
  return createWorldQueries([], worldFloor);
}

const root = libraryRoot();
for (const def of INTERIORS) {
  test(`${def.id}: the air proof holds from each route's real first-visit save`, (t) => {
    if (!fs.existsSync(root)) { t.skip(`no SAVE-1 library at ${root} on this machine: this proof did not run here`); return; }
    const used: string[] = [];
    const scenarios = resolveAccess(def, (kind) => { const p = librarySave(kind); used.push(p.describe); return p.state; });
    t.diagnostic(used.join("\n"));
    assert.deepEqual(validateInterior({ def, exterior: exteriorFor(def), scenarios }), []);
  });
}
