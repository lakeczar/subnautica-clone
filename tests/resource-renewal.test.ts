import test from "node:test";
import assert from "node:assert/strict";
import { RENEWABLE_SOURCE_IDS, SOURCE_RENEWAL, SOURCES, type SourceId } from "../src/content/registry.js";
import { FIXED_SECONDS } from "../src/sim/clock.js";
import { collectWithOutcome, completeOpening } from "../src/sim/progression.js";
import { advanceRenewal, renewalCap } from "../src/sim/renewal.js";
import { createGame } from "../src/sim/state.js";
import { executeCommand, stepGame } from "../src/sim/step.js";
import { createWorldQueries } from "../src/sim/world.js";
import { createEnvelope, decodeSave, encodeSave } from "../src/save/codec.js";
import { validState } from "../src/save/validation.js";
import type { GameState } from "../src/sim/types.js";

const world = createWorldQueries();
const meta = { sessionId: "renewal-rules-01", createdAt: "2026-10-19T00:00:00.000Z", savedAt: "2026-10-19T00:10:00.000Z" };
const NORTH = "reef_ribbon_catch_north", UPPER_RESIN = "canopy_resin_lee_upper";
const node = (s: GameState, id: SourceId) => s.world.resources.find((n) => n.id === id)!;
const progress = (s: GameState, id: SourceId) => s.world.renewal.find((r) => r.id === id)?.progress;
function opened(): GameState { const s = createGame(); completeOpening(s); return s; }
/** Hold position at the source; the only commands are an idle move. */
function steps(s: GameState, n: number): GameState {
  for (let i = 0; i < n; i++) s = stepGame(s, [{ type: "move", forward: 0, right: 0, vertical: 0, sprint: false }], world).state;
  return s;
}
function atSource(s: GameState, id: SourceId): GameState {
  s.player.pose.position = { ...SOURCES[id].position };
  s.player.mode = "swimming";
  return s;
}
const roundTrip = (s: GameState): GameState => {
  const text = encodeSave(createEnvelope(s, meta)); assert.ok(text.ok, text.ok ? "" : text.error);
  const back = decodeSave(text.value); assert.ok(back.ok, back.ok ? "" : back.error);
  return back.value.state;
};

test("only the two reef ribbon catches and two Canopy cured-resin pockets renew, at the specified active rates", () => {
  assert.deepEqual(RENEWABLE_SOURCE_IDS, ["reef_ribbon_catch_north", "reef_ribbon_catch_south", "canopy_resin_lee_upper", "canopy_resin_lee_lower"]);
  for (const id of RENEWABLE_SOURCE_IDS) {
    const policy = SOURCE_RENEWAL[id];
    assert.equal(policy.quantity, 2);
    const minutes = SOURCES[id].item === "flex_membrane" ? 6 : 10;
    assert.equal(policy.intervalSteps * FIXED_SECONDS, minutes * 60, `${id}: ${minutes} active minutes at the fixed step`);
    assert.equal(renewalCap(id), SOURCES[id].stock, "cap is the original exposed stock");
  }
  assert.equal(SOURCES.reef_ribbon_catch_north.item, "flex_membrane");
  assert.equal(SOURCES.canopy_resin_lee_lower.item, "buoyant_resin");
  // Island drift resin, minerals, salvage, crust and food keep their existing rules.
  for (const id of ["island_resin_cove_east", "island_resin_cove_west", "reef_service_scraps_east", "basin_ridge_salvage_north",
    "canopy_grounding_fins_upper", "reef_glass_ridge_north", "reef_edible_school_north"] as const)
    assert.equal(Object.hasOwn(SOURCE_RENEWAL, id), false, id);
  const s = createGame();
  assert.deepEqual(s.world.renewal, RENEWABLE_SOURCE_IDS.map((id) => ({ id, progress: 0 })));
  assert.deepEqual(s.world.resources.map((n) => [n.id, n.stock, n.reserve]),
    Object.entries(SOURCES).map(([id, d]) => [id, d.stock, d.reserve]), "initial stock/reserve unchanged");
});

test("finite sources never refill from active time; depleted living sheds regrow only through ordinary steps", () => {
  let s = opened();
  for (const n of s.world.resources) { n.stock = 0; n.reserve = 0; }
  const finite = s.world.resources.filter((n) => !RENEWABLE_SOURCE_IDS.includes(n.id as never)).map((n) => n.id);
  // Far longer than either interval, through the authoritative per-step rule.
  for (let i = 0; i < 80_000; i++) advanceRenewal(s);
  for (const id of finite) assert.deepEqual([node(s, id).stock, node(s, id).reserve], [0, 0], `${id} stays finite`);
  for (const id of RENEWABLE_SOURCE_IDS) {
    assert.equal(node(s, id).stock, Math.min(renewalCap(id), Math.floor(80_000 / SOURCE_RENEWAL[id].intervalSteps) * 2), id);
    assert.equal(node(s, id).reserve, 0, "finite reserves are never replenished");
  }
  // The ordinary fixed step is the same rule: one step advances one unit of progress.
  s = opened(); node(s, NORTH).stock = 0;
  s.world.renewal.find((r) => r.id === NORTH)!.progress = SOURCE_RENEWAL[NORTH].intervalSteps - 2;
  s = steps(atSource(s, NORTH), 1);
  assert.deepEqual([node(s, NORTH).stock, progress(s, NORTH)], [0, SOURCE_RENEWAL[NORTH].intervalSteps - 1], "one step short");
  s = steps(s, 1);
  assert.deepEqual([node(s, NORTH).stock, progress(s, NORTH)], [2, 0], "exact boundary yields one shed and restarts");
  assert.ok(validState(s));
});

test("pause, opening, menu transactions, save/Continue, tick gaps and the carrier fixture generate nothing", () => {
  const s = opened(); node(s, UPPER_RESIN).stock = 4;
  s.world.renewal.find((r) => r.id === UPPER_RESIN)!.progress = 1234;
  const before = structuredClone(s);
  // Menu transactions use executeCommand without advancing world time.
  for (const command of [{ type: "hint" }, { type: "craft", recipeId: "pod_repair" }, { type: "mark", placeId: "home_pod" }] as const)
    assert.deepEqual(executeCommand(s, command, world).state.world, before.world);
  assert.deepEqual(roundTrip(s).world, before.world, "export/import or Continue banks nothing");
  const gap = structuredClone(s); gap.tick += 10_000_000;
  assert.deepEqual(roundTrip(gap).world, before.world, "elapsed tick/wall time is not an input");
  const opening = createGame(); node(opening, NORTH).stock = 0;
  const during = steps(opening, 5);
  assert.equal(during.opening.phase, 0); assert.equal(progress(during, NORTH), 0, "no regrowth before the opening ends");
  const fixture = structuredClone(s); fixture.scenario = "carrier-fixture";
  advanceRenewal(fixture);
  assert.equal(progress(fixture, UPPER_RESIN), 1234, "seeded feasibility fixtures are not campaign time");
});

test("generation clips to the cap, discards progress at or above it and never shrinks sorted stock", () => {
  const interval = SOURCE_RENEWAL[NORTH].intervalSteps;
  const s = opened(), n = node(s, NORTH), r = s.world.renewal.find((x) => x.id === NORTH)!;
  n.stock = 11; r.progress = interval - 1;
  advanceRenewal(s);
  assert.deepEqual([n.stock, r.progress], [12, 0], "partial generation clips to remaining capacity");
  for (let i = 0; i < interval * 3; i++) advanceRenewal(s);
  assert.deepEqual([n.stock, r.progress], [12, 0], "time spent full is not banked");
  n.stock = 14; n.reserve = 10;
  for (let i = 0; i < interval * 2; i++) advanceRenewal(s);
  assert.deepEqual([n.stock, n.reserve, r.progress], [14, 10, 0], "sorted stock above the cap is kept, not trimmed");
  // After a collection the full interval must elapse again: no instant refill.
  n.stock = 12; n.reserve = 12;
  atSource(s, NORTH);
  assert.equal(collectWithOutcome(s, NORTH).refusal, null);
  assert.equal(n.stock, 8);
  for (let i = 0; i < interval - 1; i++) advanceRenewal(s);
  assert.equal(n.stock, 8);
  advanceRenewal(s);
  assert.deepEqual([n.stock, r.progress], [10, 0]);
});

test("sorting that fills the cap clears renewal progress in the same step; otherwise progress continues", () => {
  let s = atSource(opened(), NORTH);
  node(s, NORTH).stock = 10; node(s, NORTH).reserve = 12;
  s.world.renewal.find((r) => r.id === NORTH)!.progress = 5000;
  s = stepGame(s, [{ type: "sort", sourceId: NORTH }], world).state;
  assert.equal(s.world.action?.kind, "sort");
  let previous = s;
  while (s.world.action) { previous = s; s = steps(s, 1); }
  assert.ok(progress(previous, NORTH)! > 5000, "progress kept advancing while below the cap");
  assert.deepEqual([node(s, NORTH).stock, node(s, NORTH).reserve, progress(s, NORTH)], [12, 10, 0]);
  assert.ok(validState(s));
  // Sorting that leaves stock below the cap keeps accumulated progress.
  s = atSource(opened(), NORTH);
  node(s, NORTH).stock = 0; node(s, NORTH).reserve = 12;
  s.world.renewal.find((r) => r.id === NORTH)!.progress = 100;
  s = stepGame(s, [{ type: "sort", sourceId: NORTH }], world).state;
  let n = 1;
  while (s.world.action) { s = steps(s, 1); n++; }
  assert.ok(n >= 1200 && n <= 1201, "the existing 20 s action");
  assert.equal(node(s, NORTH).stock, 2);
  assert.equal(progress(s, NORTH), 100 + n, "every active step of the action also counted toward regrowth");
});

test("food tending and the recovery-only allocation keep their existing rules", () => {
  let s = atSource(opened(), "reef_edible_school_north");
  node(s, "reef_edible_school_north").stock = 0;
  assert.equal(collectWithOutcome(s, "reef_edible_school_north").refusal, null, "the sole collection path starts tending");
  assert.equal(s.world.action?.kind, "food");
  while (s.world.action) s = steps(s, 1);
  assert.equal(node(s, "reef_edible_school_north").stock, 2, "tending still prepares exactly two portions");
  s = atSource(opened(), NORTH);
  s.world.maintenance.alloy = 0; s.world.maintenance.membrane = 0;
  node(s, NORTH).stock = 0; node(s, NORTH).reserve = 0;
  s = stepGame(s, [{ type: "sort", sourceId: NORTH, maintenance: true }], world).state;
  while (s.world.action) s = steps(s, 1);
  assert.deepEqual(s.world.maintenance, { alloy: 2, glass: 1, membrane: 1 });
  assert.equal(node(s, NORTH).stock, 0, "the recovery allocation never becomes public membrane");
});

test("save → decode → future execution equals uninterrupted execution across a regrowth boundary", () => {
  let s = atSource(opened(), NORTH);
  node(s, NORTH).stock = 4;
  s.world.renewal.find((r) => r.id === NORTH)!.progress = SOURCE_RENEWAL[NORTH].intervalSteps - 30;
  s = steps(s, 10);
  const reloaded = roundTrip(s);
  assert.deepEqual(reloaded, JSON.parse(JSON.stringify(s)));
  const direct = steps(s, 60), resumed = steps(reloaded, 60);
  assert.deepEqual(JSON.parse(JSON.stringify(resumed)), JSON.parse(JSON.stringify(direct)), "JSON canonicalizes -0");
  assert.equal(node(direct, NORTH).stock, 6, "exactly one generation, regardless of the reload");
  // Repeated save/load cycles in place never advance progress.
  let cycled = s;
  for (let i = 0; i < 25; i++) cycled = roundTrip(cycled);
  assert.deepEqual(cycled.world, JSON.parse(JSON.stringify(s.world)));
});

test("an exhausted living shed reports that it is regrowing, without mutating state", () => {
  const s = opened();
  // Aim pose observed in the production browser at the north catch work face.
  s.player.pose = { frame: "world", position: { x: -14.15118033707345, y: -8.955320926570177, z: -0.7535187354912509 },
    yaw: 3.635685307179557, pitch: -0.7875 };
  s.player.mode = "swimming";
  node(s, NORTH).stock = 0; node(s, NORTH).reserve = 0;
  const { state, events } = executeCommand(s, { type: "interact" }, world);
  assert.deepEqual(events.filter((e) => e.type === "notice").map((e) => e.type === "notice" && e.message),
    [`${SOURCES[NORTH].label} · Empty · regrowing.`]);
  assert.deepEqual(state.world, s.world);
});
