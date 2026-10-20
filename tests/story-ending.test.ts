import test from "node:test";
import assert from "node:assert/strict";
import { STORY_RECIPES } from "../src/content/story/evidence.js";
import type { DiscoveryId, StorySiteId } from "../src/content/story/evidence.js";
import { FACT_IDS, FACTS } from "../src/content/story/facts.js";
import type { AnyBlueprint } from "../src/content/story/strategies.js";
import { EQUALIZE_STEPS, GALLERY_BAR, RESOLUTION_SCENES, WORKS_TEXT } from "../src/content/story/works.js";
import type { WorksAction } from "../src/content/story/works.js";
import { blueprints, learned, recordDiscovery } from "../src/sim/story/knowledge.js";
import { beginResolution, canBegin, completeResolution, requirements } from "../src/sim/story/resolution.js";
import { planCampaign } from "../src/sim/story/reachability.js";
import { createStory, validStory } from "../src/sim/story/state.js";
import type { StoryState } from "../src/sim/story/state.js";
import { advanceWorks, galleryBar, gatePanel, worksAction } from "../src/sim/story/works.js";
import type { Assembly } from "../src/sim/story/works.js";

const GATE: StorySiteId = "meridian_gate_hall", HALL: StorySiteId = "meridian_upper_hall";
function storyOf(ids: readonly DiscoveryId[]): StoryState {
  const s = createStory();
  ids.forEach((id, i) => recordDiscovery(s, id, i + 1));
  return s;
}
const ctx = (site: StorySiteId | null, opts: { carry?: Assembly[]; pay?: boolean; plans?: AnyBlueprint[] } = {}) => ({
  site,
  carries: (a: Assembly) => (opts.carry ?? ["service_power_assembly", "service_air_assembly"]).includes(a),
  canPay: () => opts.pay ?? true,
  blueprints: new Set<AnyBlueprint>(opts.plans ?? ["bp_works_hall", "bp_food_module"]),
});
const act = (s: StoryState, action: WorksAction, site: StorySiteId, opts = {}) => worksAction(s, action, ctx(site, opts));

function prepared(s: StoryState): void {
  for (const a of ["install_power", "install_air", "isolate", "equalize"] as const) assert.ok(act(s, a, GATE).ok, a);
  advanceWorks(s, EQUALIZE_STEPS);
  assert.ok(act(s, "open", GATE).ok);
  assert.ok(act(s, "restore_hall", HALL).ok);
  assert.ok(act(s, "restore_food", HALL).ok);
  assert.ok(act(s, "route_power", GATE).ok);
}

test("adverse: opening the gate out of order is refused with a physical reason and changes nothing", () => {
  const s = storyOf(["C01", "C09"]);
  const before = structuredClone(s.works);
  assert.deepEqual(act(s, "open", GATE), { ok: false, message: WORKS_TEXT.open.blocked, consume: null });
  assert.equal(act(s, "isolate", GATE).message, WORKS_TEXT.isolate.blocked);
  assert.equal(act(s, "equalize", GATE).message, WORKS_TEXT.equalize.blocked);
  assert.equal(act(s, "route_power", GATE).message, WORKS_TEXT.route_power.route);
  assert.equal(act(s, "install_power", GATE, { carry: [] }).message, WORKS_TEXT.install_power.missing);
  assert.equal(act(s, "install_power", HALL).message, WORKS_TEXT.site);
  assert.deepEqual(s.works, before);
  assert.ok(act(s, "install_power", GATE).ok);
  assert.equal(act(s, "isolate", GATE).message, WORKS_TEXT.isolate.blocked, "air is still needed");
});

test("staged assemblies are consumed once and cannot be installed twice", () => {
  const s = createStory();
  assert.equal(act(s, "install_power", GATE).consume, "service_power_assembly");
  const again = act(s, "install_power", GATE);
  assert.equal(again.ok, false);
  assert.equal(again.consume, null);
});

test("the gallery drains while the player is away, and an interrupted save resumes", () => {
  const s = createStory();
  for (const a of ["install_power", "install_air", "isolate", "equalize"] as const) act(s, a, GATE);
  const bars = [galleryBar(s.works)];
  advanceWorks(s, EQUALIZE_STEPS / 3);
  bars.push(galleryBar(s.works));
  assert.equal(act(s, "open", GATE).message, WORKS_TEXT.open.waiting);
  const reloaded: StoryState = JSON.parse(JSON.stringify(s));
  advanceWorks(reloaded, EQUALIZE_STEPS);
  bars.push(galleryBar(reloaded.works));
  assert.deepEqual(bars, [GALLERY_BAR.flooded, 48, GALLERY_BAR.dry]);
  assert.equal(reloaded.works.gate, "equalized");
  assert.ok(act(reloaded, "open", GATE).ok);
  assert.equal(reloaded.works.equalizeSteps, EQUALIZE_STEPS, "progress is capped, not overrun");
});

test("the panel shows the procedure without any record", () => {
  const panel = gatePanel(createStory().works);
  assert.match(panel.lines.join(" "), /stage power · stage air · isolate · equalize · open/);
  assert.match(panel.lines.join(" "), new RegExp(`${GALLERY_BAR.flooded} bar`));
});

test("hall work needs plans, stock and order, then reports what is missing", () => {
  const s = createStory();
  assert.equal(act(s, "restore_food", HALL).message, WORKS_TEXT.restore_food.hall);
  assert.equal(act(s, "restore_hall", HALL, { plans: [] }).message, WORKS_TEXT.restore_hall.plans);
  assert.equal(act(s, "restore_hall", HALL, { pay: false }).message, WORKS_TEXT.restore_hall.stock);
  const done = act(s, "restore_hall", HALL);
  assert.equal(done.consume, "restore_upper_hall");
  assert.equal(act(s, "route_power", GATE).message, WORKS_TEXT.route_power.route);
});

test("the ending refuses until every requirement is met, then names nothing optional", () => {
  const s = storyOf(["C01", "C13"]);
  const refused = canBegin(s, "meridian_service_window");
  assert.equal(refused.ok, false);
  assert.match(refused.message, /restore the upper hall/);
  assert.equal(canBegin(s, GATE).ok, false, "the controller handles it, not the gate panel");
  prepared(s);
  assert.ok(requirements(s).every((r) => r.met));
  assert.ok(canBegin(s, "meridian_service_window").ok);
});

test("starting the resolution with only the window seen still answers every central question", () => {
  const s = storyOf(["C01", "C13"]);
  prepared(s);
  const first = beginResolution(s, "meridian_service_window", 99);
  assert.ok(first.ok);
  const known = learned(s.discoveries);
  for (const f of FACT_IDS) if (FACTS[f].critical) assert.ok(known.has(f), f);
  assert.equal(s.resolution.first, "iona", "the medically safe default comes first");
  assert.deepEqual(first.lines, RESOLUTION_SCENES.iona.filter((l) => !("if" in l)).map((l) => l.text));
});

test("dialogue adapts to optional finds without requiring them", () => {
  const plain = storyOf(["C01", "C13"]), read = storyOf(["C01", "C13", "C15", "C12"]);
  prepared(plain);
  prepared(read);
  const a = beginResolution(plain, "meridian_inner_hall", 50, "tavi"), b = beginResolution(read, "meridian_inner_hall", 50, "tavi");
  assert.ok(a.ok && b.ok);
  assert.ok(a.lines.some((l) => l.includes("Don't read it")));
  assert.ok(b.lines.some((l) => l.includes("Both halves")));
  assert.equal(a.lines.length, b.lines.length);
});

test("the epilogue closes the story, keeps losses permanent and varies on the mast", () => {
  const s = storyOf(["C01", "C13"]);
  prepared(s);
  assert.equal(completeResolution(s, { mastRestored: false }).ok, false, "the closing scene comes first");
  beginResolution(s, "meridian_service_window", 9);
  const end = completeResolution(s, { mastRestored: true });
  assert.ok(end.ok);
  const text = end.lines.join(" ");
  assert.match(text, /191 awake/);
  assert.match(text, /Twenty died on the first day and six at the return gate/);
  assert.match(text, /carries a call outward/);
  assert.equal(s.resolution.phase, "complete");
  assert.equal(beginResolution(s, "meridian_service_window", 10).ok, false);
});

test("final repair stock uses only established materials and fits a deep craft's hold per sortie", () => {
  const MANTLE_HOLD_CU = 32;
  for (const r of Object.values(STORY_RECIPES)) assert.ok(r.cu <= MANTLE_HOLD_CU);
  for (const id of ["service_power_assembly", "service_air_assembly", "restore_upper_hall", "restore_food_module"] as const) {
    const sources = { bp_service_power: ["C07", "C09", "gate_panel"], bp_service_air: ["C08", "C10", "gate_panel"],
      bp_works_hall: ["C08", "district_controller"], bp_food_module: ["C10", "district_controller"] }[STORY_RECIPES[id].bp];
    for (const src of sources) assert.ok(blueprints([{ id: src as DiscoveryId, tick: 0 }]).has(STORY_RECIPES[id].bp), `${src} grants ${id}`);
  }
});

test("saved story state validates strictly and holds through a round trip at every stage", () => {
  assert.ok(validStory(createStory()));
  const s = storyOf(["C01", "C13"]);
  for (const a of ["install_power", "install_air", "isolate", "equalize"] as const) {
    act(s, a, GATE);
    assert.ok(validStory(JSON.parse(JSON.stringify(s))), a);
  }
  advanceWorks(s, 100);
  assert.ok(validStory(JSON.parse(JSON.stringify(s))), "mid-drain");
  assert.ok(validStory(JSON.parse(JSON.stringify(planCampaign("carrier").story))), "completed");
  const bad = (f: (x: StoryState) => void) => { const x: StoryState = JSON.parse(JSON.stringify(s)); f(x); return validStory(x); };
  assert.equal(bad((x) => x.discoveries.push({ id: "C13", tick: 3 })), false, "duplicate");
  assert.equal(bad((x) => (x.discoveries[0] as { id: string }).id = "C99"), false, "unknown ID");
  assert.equal(bad((x) => { x.works.power = false; }), false, "isolated without power");
  assert.equal(bad((x) => { x.works.equalizeSteps = EQUALIZE_STEPS + 1; }), false, "overrun");
  assert.equal(bad((x) => { x.works.hallPower = true; }), false, "powered hall before the gate opens");
  assert.equal(bad((x) => { x.resolution = { phase: "first", first: "iona" }; }), false, "ending before requirements");
  assert.equal(bad((x) => { (x.hints as Record<string, number>).L01 = 4; }), false, "hint tier out of range");
});
