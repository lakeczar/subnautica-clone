import test from "node:test";
import assert from "node:assert/strict";
import { EVIDENCE } from "../src/content/registry.js";
import { DISCOVERY_IDS, siteOf } from "../src/content/story/evidence.js";
import { LEADS } from "../src/content/story/leads.js";
import { placedSite } from "../src/content/story/sites.js";
import { createEnvelope, decodeSave } from "../src/save/codec.js";
import { validState } from "../src/save/validation.js";
import { completeOpening, craft, discover, interactions } from "../src/sim/progression.js";
import { addItem } from "../src/sim/inventory.js";
import { createGame } from "../src/sim/state.js";
import { executeCommand, stepGame } from "../src/sim/step.js";
import { planCampaign } from "../src/sim/story/index.js";
import { audit, planRegistryCampaign, registryModel } from "../src/sim/storyCampaign.js";
import { FRONTIER_HINT, recordStory, storyHint, storyNotebook, storyView } from "../src/sim/storyLink.js";
import { createWorldQueries } from "../src/sim/world.js";
import type { GameState } from "../src/sim/types.js";
import { encoded } from "./persistence-support.js";

const world = createWorldQueries();
const meta = { sessionId: "story-composed-01", createdAt: "2026-10-20T00:00:00.000Z", savedAt: "2026-10-20T00:00:00.000Z" };
const opened = (): GameState => { const s = createGame(); completeOpening(s); return s; };
const reload = (s: GameState): GameState => { const out = decodeSave(encoded(createEnvelope(s, meta))); assert.ok(out.ok, out.ok ? "" : out.error); return out.value.state; };
const UNPLACED = DISCOVERY_IDS.filter((id) => !placedSite(siteOf(id)));

test("one adapter records every discovery in its saved home with its first tick, and grants plans once", () => {
  const s = opened();
  s.tick = 40; discover(s, "C02");
  s.tick = 90; recordStory(s, "mara_reef_note");
  s.tick = 120; const line = recordStory(s, "pod_checklist");
  s.tick = 500; recordStory(s, "C02"); recordStory(s, "pod_checklist");
  assert.deepEqual(s.knowledge.evidence.map((e) => [e.id, e.tick]), [["C01", 0], ["C02", 40]], "C01–C06 keep knowledge.evidence and their ticks");
  assert.deepEqual(s.knowledge.journals, ["mara_reef_note"]);
  assert.deepEqual(s.story.discoveries, [{ id: "pod_checklist", tick: 120 }], "only new discoveries enter story.discoveries");
  assert.match(line, /^Pod service checklist recorded\./);
  assert.ok(s.knowledge.blueprints.includes("bp_pod_checklist"));
  assert.ok(s.knowledge.markers.includes("reef_ribs") && s.knowledge.scans.includes("filter_flow"), "C02's original side effects remain");
  assert.deepEqual(storyView(s).discoveries.map((d) => d.id), ["C01", "mara_reef_note", "C02", "pod_checklist"]);
  assert.deepEqual(reload(s), s, "saveable after every discovery");
});

test("reverse order: C04 before the reef and island still reads coherently, and later finds reread it", () => {
  const s = opened();
  s.tick = 10; discover(s, "C04");
  const early = storyNotebook(s);
  assert.ok(early.entries.find((e) => e.id === "C04")!.reading, "the first reading stands alone");
  s.tick = 20; discover(s, "C06");
  const later = storyNotebook(s).entries.find((e) => e.id === "C04")!;
  assert.equal(later.reading, null);
  assert.match(later.firstRead!, /\S/, "the reading the player saw first is kept, folded");
  assert.ok(later.notes.length > 0, "and the record is read again");
  assert.ok(storyNotebook(s).leads.every((l) => placedSite(LEADS[l.id].site)), "no lead points at a site the world lacks");
});

test("H gives graduated reef hints, then practical preparation for an unreachable lead, then the frontier", () => {
  const s = opened();
  const tiers = [1, 2, 3].map(() => storyHint(s));
  assert.deepEqual(s.story.hints, { L01: 3 });
  assert.deepEqual(tiers, LEADS.L01.hints);
  discover(s, "C02"); discover(s, "C03");
  assert.match(storyHint(s), /build the Dart/, "the Canopy laboratory needs a craft first");
  const all = opened();
  for (const id of Object.keys(EVIDENCE) as (keyof typeof EVIDENCE)[]) discover(all, id);
  recordStory(all, "pod_checklist");
  for (const id of ["suit_350", "dart_base", "creel_base", "creel_cargo_rack", "restore_canopy_stop"] as const) all.knowledge.crafted.push(id);
  all.inventory.items.push({ id: "rack_1", kind: "creel_cargo_rack", quantity: 1, containerId: "diver", fitted: null, charge: null, provenance: "public" });
  all.world.facilities.find((f) => f.id === "canopy_stop")!.repaired = true;
  // C3 placed the later sites: the next hint is a placed lead's graduated hint, never the frontier
  // and never an unbuilt site.
  const next = storyHint(all);
  assert.notEqual(next, FRONTIER_HINT);
  assert.ok(Object.values(LEADS).some((l) => (l.hints as readonly string[]).includes(next) && placedSite(l.site)), next);
});

test("the works machinery advances exactly once per active simulation step and survives a reload", () => {
  let s = opened();
  Object.assign(s.story.works, { power: true, air: true, gate: "equalizing", equalizeSteps: 10 });
  const idle = { type: "move", forward: 0, right: 0, vertical: 0, sprint: false } as const;
  for (let i = 0; i < 25; i++) s = stepGame(s, [idle], world).state;
  assert.equal(s.story.works.equalizeSteps, 35);
  assert.equal(reload(s).story.works.equalizeSteps, 35);
  const before = structuredClone(s);
  assert.equal(executeCommand(s, { type: "hint" }, world).state.story.works.equalizeSteps, 35, "commands are not steps");
  assert.deepEqual(s, before);
});

test("adverse: strict validation refuses a story that duplicates, back-dates or invents what knowledge holds", () => {
  const good = opened(); discover(good, "C02"); good.tick = 100; recordStory(good, "pod_checklist");
  assert.ok(validState(good));
  const bad: [string, (s: GameState) => void][] = [
    ["registry evidence copied into the story", (s) => s.story.discoveries.push({ id: "C02", tick: 1 })],
    ["the reef journal copied into the story", (s) => s.story.discoveries.push({ id: "mara_reef_note", tick: 1 })],
    ["a tick after the game tick", (s) => { s.story.discoveries[0]!.tick = s.tick + 1; }],
    ["an unknown discovery", (s) => s.story.discoveries.push({ id: "C99" as never, tick: 1 })],
    ["a pod repair nobody paid for", (s) => s.story.works.repairs.push("pod_buffer")],
    ["a paid repair missing from the story", (s) => s.knowledge.crafted.push("pod_buffer")],
    ["an extra story field", (s) => Object.assign(s.story, { notes: [] })],
    ["a missing story field", (s) => { delete (s as Partial<GameState>).story; }],
  ];
  for (const [label, mutate] of bad) {
    const s = structuredClone(good); mutate(s);
    assert.equal(validState(s), false, label);
  }
  // Paid through the real recipe: the pod repair, then the buffer at the pod bench.
  // C07's plans include the buffer; the save derives every plan from what has been found.
  const paid = structuredClone(good); recordStory(paid, "C07");
  assert.ok(paid.knowledge.blueprints.includes("bp_pod_buffer") && validState(paid));
  const unsourced = structuredClone(good); unsourced.knowledge.blueprints.push("bp_pod_buffer");
  assert.equal(validState(unsourced), false, "a plan nothing granted");
  addItem(paid, "structural_alloy", 2, "diver"); addItem(paid, "silica_glass", 3, "diver"); addItem(paid, "flex_membrane", 2, "diver");
  addItem(paid, "conductive_crust", 2, "diver");
  assert.equal(craft(paid, "pod_repair", world), null); assert.equal(craft(paid, "pod_buffer", world), null);
  assert.deepEqual(paid.story.works.repairs, ["pod_buffer"]);
  assert.ok(interactions(paid).some((t) => t.id === "C14"), "the buffer's log is now a visible record at the pod");
  assert.ok(validState(paid), "a paid buffer repair agrees in both places");
});

test("composed planner: every strategy step is a real recipe, and both strategies reach the ending on the real registry", () => {
  for (const strategy of ["independent", "carrier"] as const) {
    const report = audit(strategy);
    assert.ok(report.every((a) => a.recipe), "every step has a real recipe");
    assert.deepEqual(report.filter((a) => a.blocked.length), [], "real recipes have sourced materials, stock and frames");
    // With S2's sites placed, the real recipes, deposits and plan sources reach the ending.
    const plan = planRegistryCampaign(strategy);
    assert.equal(plan.ending, true, strategy);
    assert.deepEqual([...plan.steps].sort(), report.map((a) => a.step).sort(), "every step completes");
    assert.equal(planCampaign(strategy, { model: registryModel(strategy), reverse: true }).ending, true, `${strategy} reversed`);
    // C3 placed every story site at S2's: skipping only unplaced sites still reaches the ending.
    assert.deepEqual(UNPLACED, [], "every story site is placed");
    const today = planCampaign(strategy, { model: registryModel(strategy), skip: UNPLACED });
    assert.equal(today.ending, true, `${strategy} reaches the ending in the composed world`);
  }
  const independent = planRegistryCampaign("independent"), carrier = planRegistryCampaign("carrier");
  assert.deepEqual(independent.caps.hulls, { dart: 350, creel: 800 });
  assert.deepEqual(carrier.caps.hulls, { dart: 350, creel: 350, hearthline: 550, mantle: 800 });
  assert.equal(independent.caps.suit, 800); assert.equal(carrier.caps.suit, 800);
  assert.ok(independent.caps.stops.has("stop_divide_lee") && !carrier.caps.stops.has("stop_divide_lee"));
});

test("composed planner: the real first deposits, not the proposal shelves, gate each tier", () => {
  const shelves = registryModel("independent").shelves!;
  assert.deepEqual([shelves.pressure_ceramic.depth, shelves.thermal_core.depth, shelves.brine_lattice.depth], [258, 289, 366]);
  // Without both ceramic lips the only ceramic is deeper than any 350 m configuration: no 450 tier, no ending.
  const deeper = { ...shelves, pressure_ceramic: { depth: 398, exit: 398 } };
  for (const strategy of ["independent", "carrier"] as const) {
    const plan = planCampaign(strategy, { model: { ...registryModel(strategy), shelves: deeper } });
    assert.equal(plan.ending, false, strategy);
    assert.ok(!plan.steps.includes("suit_450"), strategy);
  }
});
