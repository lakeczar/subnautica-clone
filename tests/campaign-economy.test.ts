import { FIRST_WORKABLE } from "../src/content/c4Sources.js";
import test from "node:test";
import assert from "node:assert/strict";
import { MATERIALS, RECIPES, RENEWABLE_SOURCE_IDS, SOURCES, type SourceId } from "../src/content/registry.js";
import { CAMPAIGN_SOURCE_SITES } from "../src/content/campaign/index.js";
import { FAILURE, finiteStock, OPTIONAL, REQUIRED, runScenario, solvency } from "../src/sim/campaignEconomy.js";
import type { EconomyStrategy } from "../src/sim/campaignEconomy.js";
import { CANISTER_CU } from "../src/sim/recovery.js";

const STRATEGIES: EconomyStrategy[] = ["independent", "carrier"];
const COUNTED = (Object.keys(SOURCES) as SourceId[]).filter((id) => SOURCES[id].item !== "meal");

for (const strategy of STRATEGIES) {
  test(`${strategy}: required progression, a credible optional spend and a failed rescue are solvent on finite stock`, () => {
    const r = solvency(strategy);
    assert.equal(r.solvent, true, JSON.stringify(r.shortfalls));
    assert.equal(r.renewalCredited, 0);
    assert.ok(r.acts.filter((a) => a.endsWith("(optional)")).length >= 5, "the optional spend is real");
    assert.ok(r.acts.some((a) => a.startsWith("lose ")), "the failed rescue happened");
    for (const kind of [...Object.keys(MATERIALS), "tagged_frame"]) {
      const total = finiteStock(kind as keyof typeof MATERIALS), left = r.remaining[kind]!;
      assert.equal((r.spent[kind] ?? 0) + left.exposed + left.reserve, total.exposed + total.reserve, `${kind}: every unit accounted`);
    }
    // Zero renewal: no living shed gave more than its original exposed stock plus its reserve.
    // (CR-1's fish and roe are food, outside the materials ledger.)
    for (const id of RENEWABLE_SOURCE_IDS) if (Object.hasOwn(r.remaining, SOURCES[id].item)) assert.ok(r.remaining[SOURCES[id].item]!.exposed >= 0);
  });

  test(`${strategy}: the failed rescue rebuilds the lost hull from its own canister`, () => {
    const r = solvency(strategy), loss = FAILURE[strategy];
    assert.equal(r.rebuild!.hull, loss.hull);
    assert.ok(r.rebuild!.fits && r.rebuild!.canisterCu <= CANISTER_CU, `${r.rebuild!.canisterCu} CU`);
    assert.ok(r.rebuild!.chain.length >= 1 && r.rebuild!.chain.every((id) => r.acts.includes(id)), "every paid tier is in the record");
    // Its written-off cargo was bought twice; the run is still solvent.
    for (const c of loss.cargo) assert.ok(r.acts.includes(c) && r.trips[`replace ${c}`], c);
  });

  test(`${strategy}: each purchase draws only on deposits its preceding equipment works`, () => {
    const r = runScenario(strategy);
    assert.equal(r.solvent, true);
    const lips: readonly string[] = FIRST_WORKABLE.pressure_ceramic;
    const ledges: readonly string[] = [...FIRST_WORKABLE.brine_lattice, "divide_lattice_ledge_west", "divide_lattice_ledge_east"];
    assert.ok(r.drawn.suit_450!.every((id) => lips.includes(id) || SOURCES[id].item !== "pressure_ceramic"), "the first ceramic is lip stock");
    const firstLattice = strategy === "independent" ? "restore_divide_stop" : "hearthline_550";
    assert.ok(r.drawn[firstLattice]!.filter((id) => SOURCES[id].item === "brine_lattice").every((id) => ledges.includes(id)));
    // Required progression never needs heat or brine protection.
    for (const ids of Object.values(r.drawn)) for (const id of ids)
      if (Object.hasOwn(CAMPAIGN_SOURCE_SITES, id) && CAMPAIGN_SOURCE_SITES[id as keyof typeof CAMPAIGN_SOURCE_SITES].protection === "brine")
        assert.fail(`${id} drawn without brine protection`);
    assert.deepEqual(r.finalCaps.suit, 800);
  });

  test(`${strategy}: losing any one deposit still leaves required progression and a failed rescue solvent`, () => {
    for (const id of COUNTED) {
      const r = runScenario(strategy, { failure: true, without: [id] });
      assert.equal(r.solvent, true, `${id}: ${JSON.stringify(r.shortfalls)}`);
    }
    // With the optional spend too, only a living reef catch (renewing in play, zero here) is load-bearing.
    for (const id of COUNTED.filter((id) => !(RENEWABLE_SOURCE_IDS as readonly string[]).includes(id)))
      assert.equal(solvency(strategy, [id]).solvent, true, id);
  });

  test(`${strategy}: without both first deposits of a late material the chain stops at its first use (vacuity)`, () => {
    // CB tier rule (C4): the first workable deposits, plus the tastes that sit shallower.
    const tastes: Record<string, SourceId[]> = { thermal_core: ["rift_core_shoulder_north", "rift_core_shoulder_west"],
      brine_lattice: ["divide_lattice_ledge_west", "divide_lattice_ledge_east"] };
    const first = (kind: keyof typeof FIRST_WORKABLE) => [...FIRST_WORKABLE[kind], ...(tastes[kind] ?? [])] as SourceId[];
    const expected = strategy === "independent"
      ? { pressure_ceramic: "suit_450", thermal_core: "suit_450", brine_lattice: "restore_divide_stop" }
      : { pressure_ceramic: "suit_450", thermal_core: "suit_450", brine_lattice: "hearthline_550" };
    for (const [kind, act] of Object.entries(expected)) {
      const r = runScenario(strategy, { without: first(kind as keyof typeof FIRST_WORKABLE) });
      assert.equal(r.solvent, false, kind);
      assert.deepEqual([r.shortfalls[0]!.act, r.shortfalls[0]!.kind], [act, kind]);
    }
  });
}

test("the strategies differ: no carrier on the Creel route, no deep Creel on the carrier route", () => {
  const independent = solvency("independent"), carrier = solvency("carrier");
  assert.deepEqual(independent.finalCaps.hulls, { dart: 350, creel: 800, hush: 220 });
  // C4: the carrier route's scout refits to 450 m for the Divide's flank lattice.
  assert.deepEqual(carrier.finalCaps.hulls, { dart: 450, creel: 350, spindle: 0, hearthline: 550, mantle: 800 });
  assert.ok(REQUIRED.independent.some((a) => a.kind === "craft" && a.recipe === "restore_divide_stop"));
  assert.ok(!REQUIRED.carrier.some((a) => a.kind === "craft" && a.recipe === "restore_divide_stop"));
  // Neither strategy requires a specialist: they appear only as optional spend.
  for (const s of STRATEGIES) assert.ok(!REQUIRED[s].some((a) => a.kind === "craft" && (a.recipe === "hush_base" || a.recipe === "spindle_base")));
  assert.ok(OPTIONAL.independent.some((o) => o.recipe === "hush_base") && OPTIONAL.carrier.some((o) => o.recipe === "spindle_base"));
  // The Creel route alone holds on exposed stock; the carrier sorts a few reserve units of glass at the end.
  assert.equal(runScenario("independent", { exposedOnly: true }).solvent, true);
  const exposed = runScenario("carrier", { exposedOnly: true });
  assert.ok(exposed.shortfalls.every((f) => f.kind === "silica_glass" && f.short <= 3), JSON.stringify(exposed.shortfalls));
  assert.equal(runScenario("carrier").solvent, true);
  assert.ok(RECIPES.hearthline_keel.cost.tagged_frame! + RECIPES.creel_350.cost.tagged_frame! <= 6, "frame demand survives any one frame host");
});
