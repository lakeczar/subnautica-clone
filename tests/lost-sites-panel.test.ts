/** LS-1 stage 1a, R1 F1 and F4: the records reach the real journal panel, and a
 * door's code shows nowhere (journal or site inspection) until the door is placed.
 * Panel output is read through a light DOM port, as preparation-panels.test.ts does;
 * layout and focus are browser concerns. */
import test from "node:test";
import assert from "node:assert/strict";
import { CODED_DOORS } from "../src/content/systems/decodes.js";
import { FOUND_NOTE_TEXTS } from "../src/content/systems/notes.js";
import { completeOpening } from "../src/sim/progression.js";
import { createGame } from "../src/sim/state.js";
import { cellOf } from "../src/sim/systems/navigation.js";
import { noteHostPosition } from "../src/sim/systems/notes.js";
import { readLostSite } from "../src/sim/systemsLink.js";
import { createWorldQueries } from "../src/sim/world.js";
import type { GameState } from "../src/sim/types.js";
import { PanelView } from "../src/ui/panels.js";

function panels(t: test.TestContext) {
  class Port {
    innerHTML = ""; textContent = ""; hidden = false; scrollTop = 0;
    classList = { remove() {}, toggle() {} };
    contains() { return false; }
    querySelectorAll() { return []; }
  }
  const ports = new Map<string, Port>();
  const get = (id: string): Port => { if (!ports.has(id)) ports.set(id, new Port()); return ports.get(id)!; };
  const previous = ["document", "window"].map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { clearTimeout() {} } });
  t.after(() => ["document", "window"].forEach((key, i) => previous[i] ? Object.defineProperty(globalThis, key, previous[i]!) : Reflect.deleteProperty(globalThis, key)));
  const panel = new PanelView({ querySelector: (s: string) => get(s.slice(1)), querySelectorAll: () => [] } as unknown as HTMLElement, createWorldQueries());
  return (s: GameState, tab: "notebook" | "decodes"): string => {
    panel.showJournalTab(tab);
    panel.refresh("notebook", s);
    return get("panel-content").innerHTML.replace(/&#39;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&");
  };
}
const opened = (): GameState => { const s = createGame(); completeOpening(s); return s; };
const decode = (s: GameState, id: "reef_pumphouse_log" | "isles_strain_gauge_log") => { s.systems.found.push(id); s.systems.decoded.push(id); };

test("the real journal shows a board note once you've been there, a decoded note, and a completed log's prose", (t) => {
  const render = panels(t), s = opened();
  const galley = FOUND_NOTE_TEXTS.find((n) => n.id === "note_yard_galley")!, season = FOUND_NOTE_TEXTS.find((n) => n.id === "note_reef_season")!;
  assert.ok(!render(s, "notebook").includes(galley.label), "not before the place is visited");
  const at = noteHostPosition(galley.host)!;
  s.systems.chart.push(cellOf(at.x, at.z));
  const visited = render(s, "notebook");
  assert.ok(visited.includes("Found notes") && visited.includes(galley.label) && visited.includes(galley.text.slice(0, 40)), "a newly readable board note");
  assert.ok(!visited.includes(season.label), "the decode note waits for its decode");
  decode(s, "reef_pumphouse_log");
  assert.ok(render(s, "notebook").includes(season.label), "a decoded note");
  const decodes = render(s, "decodes");
  assert.ok(decodes.includes("Pump house log") && decodes.includes("the intake ran clean"), "a completed log's prose, by its completed identity");
});

test("a door's code shows nowhere until the door is placed: journal and site inspection, before decoding, before and after placement", (t) => {
  const render = panels(t), s = opened(), hatch = CODED_DOORS["island.cold_store_hatch"];
  hatch.placed = true;
  try {
    assert.ok(!render(s, "notebook").includes("4-4-1-7"), "placed, but not decoded: no code");
    assert.ok(!readLostSite(s, "isles_strain_gauges").includes("4-4-1-7"));
  } finally { hatch.placed = false; }
  decode(s, "isles_strain_gauge_log");
  assert.ok(!render(s, "notebook").includes("4-4-1-7"), "decoded, door not placed: no code in the notebook");
  assert.ok(!render(s, "decodes").includes("4-4-1-7"), "nor in the decoded log");
  assert.ok(!readLostSite(s, "isles_strain_gauges").includes("4-4-1-7"), "nor at the site");
  assert.ok(readLostSite(s, "isles_strain_gauges").includes("flat and then climbing"), "the rest of the log reads");
  hatch.placed = true;
  try {
    const notebook = render(s, "notebook");
    assert.ok(notebook.includes("Door codes") && notebook.includes("Cold store hatch") && notebook.includes("4-4-1-7"), "a placed door's code");
    assert.ok(render(s, "decodes").includes("Door code 4-4-1-7"));
    assert.ok(readLostSite(s, "isles_strain_gauges").includes("4-4-1-7"));
  } finally { hatch.placed = false; }
});
