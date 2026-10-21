import test from "node:test";
import assert from "node:assert/strict";
import { storyNotebook } from "../src/sim/storyLink.js";
import { discoverSite, startDecode } from "../src/sim/systems/decoder.js";
import { installModule } from "../src/sim/systems/hosts.js";
import { buildJournal, searchJournal } from "../src/sim/systems/journal.js";
import type { FieldJournal, JournalTabId } from "../src/sim/systems/journal.js";
import { deployOutpost } from "../src/sim/systems/outposts.js";
import { give, opened, siteTable, SPOTS, swimTo } from "./systems-support.js";

const tab = (j: FieldJournal, id: JournalTabId) => j.tabs.find((t) => t.id === id)!;
const entries = (j: FieldJournal, id: JournalTabId) => tab(j, id).sections.flatMap((s) => s.entries);

test("one journal with the six tabs in order", () => {
  const { s, sys } = opened();
  const j = buildJournal(s, sys);
  assert.deepEqual(j.tabs.map((t) => t.id), ["materials", "creatures", "tech", "notebook", "cycles", "decodes"]);
  for (const t of j.tabs) assert.ok(t.empty.length > 0);
});

test("materials: an unfamiliar material is kept with use unknown until a recipe shows its use", () => {
  const { s, sys } = opened();
  give(s, "brine_lattice", 2);
  let m = entries(buildJournal(s, sys), "materials").find((e) => e.id === "material:brine_lattice")!;
  assert.equal(m.status, "unknown");
  assert.match(m.subtitle, /Use unknown/);
  s.knowledge.scans.push("reef_glass_ridge_north");
  s.knowledge.blueprints.push("bp_pod_checklist");
  const j = buildJournal(s, sys);
  m = entries(j, "materials").find((e) => e.id === "material:silica_glass")!;
  assert.equal(m.status, "known");
  assert.match(m.subtitle, /Used in Repair pod regulator/);
  assert.match(m.lines.join("\n"), /Grazer glass ledge · Hearth Reef · 8 ready · 8 reserve · finite/);
  assert.deepEqual(m.tags, ["Hearth Reef"]);
  s.knowledge.scans.push("reef_ribbon_catch_north");
  const ribbon = entries(buildJournal(s, sys), "materials").find((e) => e.id === "material:flex_membrane")!;
  assert.match(ribbon.lines.join("\n"), /regrows 2 every 6 min up to 12/);
  assert.match(ribbon.lines.join("\n"), /Also grown: Ribbon fan planter/);
  give(s, "seed_lumen_bulb", 1);
  assert.match(entries(buildJournal(s, sys), "materials").find((e) => e.id === "material:seed_lumen_bulb")!.subtitle, /grows bio-cell/);
});

test("the notebook tab reuses S5's notebook view rather than a fork", () => {
  const { s, sys } = opened();
  const j = buildJournal(s, sys);
  assert.deepEqual(j.notebook, storyNotebook(s));
  assert.ok(entries(j, "notebook").some((e) => e.id === "finding:C01"), "the opening's first finding is browsable");
  const given = { ...storyNotebook(s), leads: [] };
  assert.equal(buildJournal(s, sys, { notebook: given }).notebook, given);
});

test("tech, creatures, cycles and decodes fill from state and the slots", () => {
  const { s, sys } = opened();
  s.knowledge.blueprints.push("bp_field_outpost" as never);
  s.knowledge.scans.push("basin_keel_plate");
  const id = give(s, "outpost_kit_basic");
  swimTo(s, SPOTS.a);
  deployOutpost(s, sys, id, SPOTS.a, siteTable({ ventDistance: 2 }));
  installModule(s, sys, id, "s0", give(s, "mod_decoder"));
  discoverSite(sys, "demo_relay_hut");
  discoverSite(sys, "demo_survey_cairn");
  startDecode(s, sys, id, "demo_hut_fragment");
  const j = buildJournal(s, sys, {
    creatures: [{ id: "demo_grazer", label: "Ledge grazer", region: "refuge_reef", behaviour: "Scrapes algae from glass ledges.", danger: "harmless" }],
    cycles: [{ id: "demo_pulse", label: "Vent pulse", region: "thermal_rift", periodSeconds: 240, windowSeconds: 40, alternative: "the cool flank route" }],
  });
  const tech = entries(j, "tech");
  assert.ok(tech.some((e) => e.id === "recipe:outpost_kit_basic"));
  assert.ok(tech.some((e) => e.id === "record:basin_keel_plate"));
  assert.ok(tech.some((e) => e.id === "plan:bp_field_outpost" && e.title === "Field outpost kit plans"));
  assert.equal(entries(j, "creatures")[0]!.title, "Ledge grazer");
  assert.match(entries(j, "cycles")[0]!.subtitle, /Ember Rift · every 4 min · lasts 40 s/);
  const dec = tab(j, "decodes");
  assert.deepEqual(dec.sections.map((x) => x.id), ["running", "found"]);
  assert.match(dec.sections[0]!.entries[0]!.subtitle, /Decoding · 0% · 3 min left/);
  assert.match(dec.sections[1]!.entries[0]!.subtitle, /Unreadable · about 6 min/);
  assert.ok(searchJournal(j, "grazer").some((r) => r.tab === "creatures"));
  assert.ok(searchJournal(j, "relay hut").some((r) => r.tab === "decodes"));
  assert.deepEqual(searchJournal(j, "  "), []);
});
