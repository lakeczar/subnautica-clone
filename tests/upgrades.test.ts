import test from "node:test";
import assert from "node:assert/strict";
import { HULLS, MATERIALS, MODULES, RECIPES } from "../src/content/registry.js";
import type { HullId } from "../src/content/registry.js";
import { HULL_SLOTS, upgrade, UPGRADE_IDS, UPGRADES } from "../src/content/upgrades/catalogue.js";
import type { UpgradeId } from "../src/content/upgrades/catalogue.js";
import {
  applyFit, berthLayouts, fabricatePreview, heatMargin, installPreview, profileOf, refitPreview, removePreview,
} from "../src/sim/upgrades/fitting.js";
import type { FitTarget, Fitted } from "../src/sim/upgrades/fitting.js";

const near = (a: number, b: number, eps = 1e-9): void => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const fit = (kind: UpgradeId, n = 1): Fitted => ({ itemId: `${kind}#${n}`, kind });
function target(hull: HullId, over: Partial<FitTarget> = {}): FitTarget {
  return { hull, rating: HULLS[hull].initialDepth, fitted: [], dock: "workshop", depth: 5, berth: null,
    hazards: { heat: [], brine: 0 }, hold: { usedCu: 0, baseCu: hull === "creel" ? 64 : 32 }, ...over };
}

// ---------------------------------------------------------------- catalogue
test("signature upgrades match GAME-DIRECTION's table, each fitting exactly one hull", () => {
  const expected: Record<HullId, UpgradeId[]> = {
    dart: ["dart_acoustic_trim", "dart_overdrive", "dart_wide_sonar", "dart_range_tagger"],
    creel: ["creel_cargo_rack", "creel_cabin", "creel_service_head", "creel_cutting_arm", "creel_grapple", "creel_drop_pod"],
    hush: ["hush_listening_array", "hush_specimen_bay", "hush_extended_glide"],
    spindle: ["spindle_solar_array", "spindle_shore_ramp", "spindle_deck_crane", "spindle_radio_mast"],
    mantle: ["mantle_thermal_shroud", "mantle_salvage_clamp", "mantle_hull_air_line", "mantle_drone_bay"],
    hearthline: ["hearthline_berth_extension", "hearthline_system_bay", "hearthline_mooring_anchor", "hearthline_550"],
  };
  for (const [hull, ids] of Object.entries(expected) as [HullId, UpgradeId[]][]) {
    const actual = UPGRADE_IDS.filter((id) => upgrade(id).layer === "signature" && Object.hasOwn(upgrade(id).fits, hull));
    assert.deepEqual(actual.sort(), [...ids].sort(), hull);
  }
  for (const id of UPGRADE_IDS.filter((id) => upgrade(id).layer === "signature"))
    assert.equal(Object.keys(upgrade(id).fits).length, 1, id);
});

test("the common pool covers every family, and depth refits never fit the Spindle", () => {
  const lines = new Set(UPGRADE_IDS.filter((id) => upgrade(id).layer === "common").map((id) => upgrade(id).line));
  for (const line of ["depth", "plating", "heat", "brine", "cells", "efficiency", "lights", "silent", "flare", "ballast", "thermal"])
    assert.ok(lines.has(line), line);
  for (const id of UPGRADE_IDS.filter((id) => "refit" in upgrade(id))) {
    assert.equal(upgrade(id).fits.spindle, undefined, id);
    const { from } = (upgrade(id) as { refit: { from: number } }).refit, hull = Object.keys(upgrade(id).fits)[0] as HullId;
    assert.ok(from >= HULLS[hull].initialDepth && from < HULLS[hull].maximumDepth, id);
  }
  // Every hull except the surface tender takes at least one common pool item in each family it can use.
  for (const hull of ["dart", "creel", "hush", "mantle"] as const)
    for (const line of ["plating", "heat", "brine", "cells", "efficiency", "lights", "silent", "ballast", "thermal"])
      assert.ok(UPGRADE_IDS.some((id) => upgrade(id).line === line && Object.hasOwn(upgrade(id).fits, hull)), `${hull} ${line}`);
});

test("costs use only the shared materials: no per-vessel currency", () => {
  const shared = new Set([...Object.keys(MATERIALS), "tagged_frame"]);
  for (const id of UPGRADE_IDS)
    for (const [kind, n] of Object.entries(upgrade(id).cost)) {
      assert.ok(shared.has(kind), `${id}: ${kind}`);
      assert.ok(Number.isInteger(n) && n > 0, `${id}: ${kind} ${n}`);
    }
});

test("entries that describe registry content keep its costs and hull", () => {
  for (const id of UPGRADE_IDS) {
    const reg = (upgrade(id) as { registry?: string }).registry;
    if (!reg) continue;
    // Recipes composed from C3/S9 appear once C3 lands; until then nothing to compare.
    if (Object.hasOwn(RECIPES, reg)) assert.deepEqual(RECIPES[reg as keyof typeof RECIPES].cost, upgrade(id).cost, id);
    if (Object.hasOwn(MODULES, reg)) assert.ok(Object.hasOwn(upgrade(id).fits, MODULES[reg as keyof typeof MODULES].hull), id);
  }
  // M1 trim and the Creel mount hold sizes are preserved by the effects.
  assert.equal(64 + (UPGRADES.creel_cargo_rack.effect.holdCu ?? 0), MODULES.creel_cargo_rack.holdCu);
  assert.equal(64 + (UPGRADES.creel_cabin.effect.holdCu ?? 0), MODULES.creel_cabin.holdCu);
});

test("slot limits keep signatures as choices on every craft", () => {
  for (const hull of Object.keys(HULL_SLOTS) as HullId[]) {
    const contested = (Object.keys(HULL_SLOTS[hull]) as (keyof (typeof HULL_SLOTS)[HullId])[]).some((slot) => {
      const candidates = UPGRADE_IDS.filter((id) => (upgrade(id).fits as Partial<Record<HullId, string>>)[hull] === slot);
      return candidates.some((id) => upgrade(id).layer === "signature") && candidates.length > HULL_SLOTS[hull][slot];
    });
    assert.ok(contested, `${hull}: some slot must hold fewer options than compete for it`);
  }
});

// ---------------------------------------------------------------- refusals
test("refuses the wrong hull, naming the hull a signature belongs to", () => {
  assert.match(installPreview(target("creel"), fit("dart_overdrive")).refusal!, /Dart signature upgrade; it fits only the Dart/);
  assert.match(installPreview(target("spindle"), fit("hull_heat_lining")).refusal!, /surface-only hull/);
  assert.match(installPreview(target("hearthline"), fit("flare_launcher")).refusal!, /does not fit the Hearthline/);
  assert.match(installPreview(target("dart"), fit("dart_350")).refusal!, /paid hull refit/);
  assert.match(installPreview(target("dart"), { itemId: "x", kind: "meal" as UpgradeId }).refusal!, /not an upgrade module/);
});

test("refuses without a free socket, and swaps only the module the player names", () => {
  const t = target("dart", { fitted: [fit("dart_overdrive"), fit("cell_bank_1")], hold: { usedCu: 5, baseCu: 32 } });
  const full = installPreview(t, fit("flare_launcher"));
  assert.match(full.refusal!, /No free socket: the Dart's 2 sockets hold Dart overdrive and Extended cell bank/);
  const swap = installPreview(t, fit("flare_launcher"), { replace: "cell_bank_1#1" });
  assert.equal(swap.refusal, null);
  assert.deepEqual(swap.displaced, fit("cell_bank_1"));
  assert.ok(swap.losses.some((l) => /Replaces Extended cell bank; it returns intact/.test(l)));
  assert.ok(swap.losses.some((l) => /Battery capacity 1.5 → 1×/.test(l)));
  assert.deepEqual(applyFit(swap).map((f) => f.kind), ["dart_overdrive", "flare_launcher"]);
  // A single-slot mount swaps its occupant without asking.
  const creel = installPreview(target("creel", { fitted: [fit("creel_cargo_rack")] }), fit("creel_cabin"));
  assert.equal(creel.refusal, null);
  assert.equal(creel.displaced?.kind, "creel_cargo_rack");
  assert.ok(creel.losses.some((l) => /Hold 96 → 40 CU/.test(l)));
});

test("refuses away from a supported dock, and at docks that cannot change that slot", () => {
  assert.match(installPreview(target("dart", { dock: null }), fit("flare_launcher")).refusal!, /at a supported dock/);
  assert.match(installPreview(target("dart", { dock: "outpost" }), fit("plating_alloy")).refusal!, /A field outpost can change sockets only/);
  assert.equal(installPreview(target("dart", { dock: "outpost" }), fit("flare_launcher")).refusal, null);
  assert.match(installPreview(target("dart", { dock: "carrier_mooring" }), fit("flare_launcher")).refusal!, /Berth the Dart in the carrier/);
  assert.match(installPreview(target("hearthline", { dock: "workshop" }), fit("hearthline_mooring_anchor")).refusal!, /yard berth or while station keeping/);
  assert.equal(installPreview(target("hearthline", { dock: "carrier_mooring" }), fit("hearthline_mooring_anchor")).refusal, null);
  assert.match(removePreview(target("dart", { dock: null, fitted: [fit("flare_launcher")] }), "flare_launcher#1").refusal!, /at a supported dock/);
});

test("refuses an unpayable cost or missing plans when fabricating, and lists the shortfall", () => {
  const short = fabricatePreview("plating_ceramic", { structural_alloy: 6, conductive_crust: 1 }, ["bp_rift_pressure"]);
  assert.match(short.refusal!, /needs 1 more conductive crust, 3 more pressure ceramic\. Nothing was used/);
  assert.deepEqual(short.shortfalls.map((s) => s.kind), ["conductive_crust", "pressure_ceramic"]);
  assert.match(fabricatePreview("plating_alloy", { structural_alloy: 9, conductive_crust: 9 }, []).refusal!, /needs its plans/);
  assert.equal(fabricatePreview("plating_alloy", { structural_alloy: 4, conductive_crust: 2 }, ["bp_island_workshop"]).refusal, null);
});

test("refits: right hull, right rating, at the workshop or yard, and paid", () => {
  const stock = { tagged_frame: 1, conductive_crust: 3, buoyant_resin: 3, silica_glass: 1 };
  assert.match(refitPreview(target("spindle"), "dart_350", stock).refusal!, /surface hull/);
  assert.match(refitPreview(target("creel"), "dart_350", stock).refusal!, /another hull/);
  assert.match(refitPreview(target("hush"), "hush_450", stock).refusal!, /refits a 350 m hull; this one is rated 220 m/);
  assert.match(refitPreview(target("hush", { dock: "service_stop" }), "hush_350", stock).refusal!, /workshop slip or the yard/);
  assert.match(refitPreview(target("hush"), "hush_350", { ...stock, tagged_frame: 0 }).refusal!, /1 more tagged frame/);
  assert.deepEqual(refitPreview(target("hush"), "hush_350", stock), { refusal: null, ratingAfter: 350, shortfalls: [] });
  assert.match(refitPreview(target("dart", { rating: 350 }), "dart_350", stock).refusal!, /already rated 350 m/);
});

// ---------------------------------------------------------------- previews
test("an install preview shows the benefit and what it costs", () => {
  const p = installPreview(target("creel"), fit("silent_running"));
  assert.equal(p.refusal, null);
  assert.ok(p.gains.includes(UPGRADES.silent_running.benefit));
  assert.ok(p.gains.some((g) => /Cruise loudness 0.62 → 0.34/.test(g)));
  assert.ok(p.losses.includes(UPGRADES.silent_running.tradeoff));
  assert.ok(p.losses.some((l) => /Cruise speed 5 → 4.5 m\/s/.test(l)));
  assert.ok(p.losses.some((l) => /Boost speed 6.5 → 4.5 m\/s/.test(l)));
  assert.deepEqual(p.slotUse, { used: 1, capacity: 2 });
  assert.deepEqual(p.hold, { capacityCu: 64, usedCu: 2 });
});

test("removal returns the module intact and shows what is given up", () => {
  const t = target("dart", { fitted: [fit("floodlights_1", 7)], hold: { usedCu: 2, baseCu: 32 } });
  const p = removePreview(t, "floodlights_1#7");
  assert.equal(p.refusal, null);
  assert.ok(p.gains[0]!.includes("returns intact to the hold"));
  assert.ok(p.losses.some((l) => l.startsWith("Gives up: Lamp output ×1.6")));
  assert.deepEqual(applyFit(p), []);
  // Socket modules already count in the hold; a bay module moves into it.
  assert.deepEqual(p.hold, { capacityCu: 32, usedCu: 2 });
  const bay = removePreview(target("dart", { fitted: [fit("plating_alloy")] }), "plating_alloy#1");
  assert.deepEqual(bay.hold, { capacityCu: 32, usedCu: 4 });
  assert.match(removePreview(target("dart", { fitted: [fit("plating_alloy")] }), "nope").refusal!, /Choose an upgrade fitted/);
  assert.throws(() => applyFit(installPreview(target("dart"), fit("creel_grapple"))), /refused/);
});

test("a higher tier replaces the lower one in place; never the reverse", () => {
  const t = target("creel", { fitted: [fit("plating_alloy")] });
  const up = installPreview(t, fit("plating_ceramic"));
  assert.equal(up.refusal, null);
  assert.equal(up.displaced?.kind, "plating_alloy");
  assert.ok(up.gains.some((g) => /Rating 240 → 290 m/.test(g)));
  const down = installPreview(target("creel", { fitted: [fit("plating_ceramic")] }), fit("plating_alloy"));
  assert.match(down.refusal!, /already has Ceramic pressure plating, a higher tier/);
  assert.match(installPreview(t, fit("plating_alloy", 2)).refusal!, /already has Alloy hull plating/);
  assert.match(installPreview(t, fit("plating_alloy")).refusal!, /already fitted/);
  assert.match(removePreview(target("creel", { fitted: [fit("creel_350")] }), "creel_350#1").refusal!, /structural; they stay with the hull/);
});

test("a hold that would overflow refuses the change", () => {
  const rack = target("creel", { fitted: [fit("creel_cargo_rack")], hold: { usedCu: 80, baseCu: 64 } });
  assert.match(removePreview(rack, "creel_cargo_rack#1").refusal!, /would need 86 CU but holds 64 CU without it\. Store 22 CU first/);
  // Stowing the rack elsewhere still leaves 80 CU of cargo in a 64 CU hold.
  assert.match(removePreview(rack, "creel_cargo_rack#1", { elsewhere: true }).refusal!, /would need 80 CU/);
  assert.equal(removePreview({ ...rack, hold: { usedCu: 58, baseCu: 64 } }, "creel_cargo_rack#1").refusal, null);
  assert.match(installPreview(target("dart", { hold: { usedCu: 31, baseCu: 32 } }), fit("cell_bank_1")).refusal!, /Store 2 CU first/);
  assert.equal(installPreview(target("dart", { hold: { usedCu: 31, baseCu: 32 } }), fit("cell_bank_1"), { fromHold: true }).refusal, null);
});

// ---------------------------------------------------------------- adverse case
test("adverse: removing the plating that keeps a deep hull safe is refused, with a way out", () => {
  // A 350 m Dart works at 380 m on its ceramic plating's 50 m margin, at the Divide's 365 m+ stop.
  const deep = target("dart", { rating: 350, fitted: [fit("plating_ceramic")], depth: 380, dock: "service_stop" });
  assert.equal(profileOf(deep).rating, 400);
  const remove = removePreview(deep, "plating_ceramic#1");
  assert.match(remove.refusal!, /leaves the Dart rated 350 m, but it is at 380 m\. Climb above 350 m first\. Nothing changed\./);
  // Swapping the only hull bay for a heat lining is the same loss, refused the same way.
  const swap = installPreview(deep, fit("hull_heat_lining"));
  assert.match(swap.refusal!, /Swapping Ceramic pressure plating for Hull heat lining leaves the Dart rated 350 m/);
  // Above its own rating the change is allowed.
  assert.equal(removePreview({ ...deep, depth: 340 }, "plating_ceramic#1").refusal, null);
  // In the carrier's dry berth it is allowed, but the player is told launch will wait.
  const berthed = removePreview({ ...deep, berth: { carrierDepth: 390, exterior: { heat: [], brine: 0 } }, dock: "carrier_berth" }, "plating_ceramic#1");
  assert.equal(berthed.refusal, null);
  assert.match(berthed.warnings[0]!, /carrier is at 390 m: the Dart \(rated 350 m\) cannot launch until the carrier rises above 350 m/);
});

test("adverse: heat and brine protection cannot be removed inside the hazard", () => {
  const hot = target("creel", { rating: 450, fitted: [fit("hull_heat_lining")], depth: 300, dock: "service_stop",
    hazards: { heat: [{ level: 0.6, kind: "ambient" }], brine: 0 } });
  assert.match(removePreview(hot, "hull_heat_lining#1").refusal!, /unprotected in this heat\. Move to cooler water first/);
  assert.equal(removePreview({ ...hot, hazards: { heat: [], brine: 0 } }, "hull_heat_lining#1").refusal, null);
  const brine = target("creel", { rating: 800, fitted: [fit("hull_brine_seals")], depth: 450, dock: "service_stop",
    hazards: { heat: [], brine: 0.7 } });
  assert.match(removePreview(brine, "hull_brine_seals#1").refusal!, /unprotected in this brine\. Climb above the dense layer first/);
  // Already overloaded by heat: the exchanger's slower load is margin; losing it is refused too.
  const vent = target("dart", { fitted: [fit("thermal_exchanger")], dock: "service_stop", hazards: { heat: [{ level: 0.9, kind: "core" }], brine: 0 } });
  assert.match(removePreview(vent, "thermal_exchanger#1").refusal!, /loading heat faster here/);
});

// ---------------------------------------------------------------- carrier structure
test("berth extension adds the mixed layout; removal and system sockets guard their occupants", () => {
  const plain = target("hearthline", { dock: "carrier_mooring", hold: { usedCu: 0, baseCu: 192 } });
  assert.deepEqual(Object.keys(berthLayouts(profileOf(plain))), ["compact", "medium"]);
  const ext = { ...plain, fitted: [fit("hearthline_berth_extension"), fit("hearthline_system_bay")] };
  assert.deepEqual(berthLayouts(profileOf(ext)).mixed, ["medium", "compact"]);
  assert.equal(profileOf(ext).systemSockets, 4);
  assert.match(removePreview({ ...ext, carrier: { configuration: "mixed", berthsEmpty: false, systemOccupied: 0 } },
    "hearthline_berth_extension#1").refusal!, /Empty both berths/);
  assert.equal(removePreview({ ...ext, carrier: { configuration: "compact", berthsEmpty: true, systemOccupied: 0 } },
    "hearthline_berth_extension#1").refusal, null);
  assert.match(removePreview({ ...ext, carrier: { configuration: "compact", berthsEmpty: true, systemOccupied: 3 } },
    "hearthline_system_bay#1").refusal!, /Clear 1 system socket first/);
  // Signature retrofits do not compete with each other; hull bays do.
  assert.equal(installPreview(plain, fit("hearthline_berth_extension")).refusal, null);
  const bays = { ...plain, fitted: [fit("plating_alloy"), fit("hull_heat_lining"), fit("cell_bank_1"), fit("silent_running")] };
  assert.match(installPreview(bays, fit("hearthline_mooring_anchor")).refusal!, /No free hull bay: the Hearthline's 4 hull bays hold/);
});

test("a module whose tool is out in the world stays fitted until it is recovered", () => {
  const pod = target("creel", { fitted: [fit("creel_drop_pod")], inUse: { pod: true } });
  assert.match(removePreview(pod, "creel_drop_pod#1").refusal!, /pod is still out\. Collect it/);
  assert.equal(removePreview({ ...pod, inUse: {} }, "creel_drop_pod#1").refusal, null);
  const line = target("creel", { fitted: [fit("creel_grapple")], inUse: { grapple: true } });
  assert.match(installPreview(line, fit("creel_cutting_arm")).refusal!, /grapple line is attached/);
  const anchored = target("hearthline", { dock: "carrier_mooring", fitted: [fit("hearthline_mooring_anchor")], inUse: { anchored: true },
    hold: { usedCu: 0, baseCu: 192 } });
  assert.match(removePreview(anchored, "hearthline_mooring_anchor#1").refusal!, /anchor is down/);
  // A fitting record that does not belong on the hull is refused, not crashed on.
  assert.match(removePreview(target("dart", { fitted: [fit("creel_grapple")] }), "creel_grapple#1").refusal!, /does not belong on the Dart/);
});

test("R1: while already overheated, a change is judged by survival's own load rate", () => {
  const core = { heat: [{ level: 0.9, kind: "core" as const }], brine: 0 };
  // A 450 m Creel at 300 m with its lining: tolerance 0.75 → 0.35 would load 0.15 → 0.55 per unit time.
  const creel = target("creel", { rating: 450, fitted: [fit("hull_heat_lining")], depth: 300, dock: "service_stop", hazards: core });
  const p = removePreview(creel, "hull_heat_lining#1");
  assert.match(p.refusal!, /Removing Hull heat lining leaves the Creel loading heat faster here\. Move to cooler water first/);
  near(heatMargin(p.before, core.heat), -0.15);
  near(heatMargin(p.after, core.heat), -0.55);
  // A genuinely safer swap is allowed: the Dart's exchanger (load 0.6 × 0.6) for a lining (0.2 × 1).
  const dart = target("dart", { fitted: [fit("thermal_exchanger")], dock: "service_stop", hazards: core });
  const swap = installPreview(dart, fit("hull_heat_lining"));
  assert.equal(swap.refusal, null);
  assert.equal(swap.displaced?.kind, "thermal_exchanger");
  near(heatMargin(swap.before, core.heat), -0.36);
  near(heatMargin(swap.after, core.heat), -0.2);
  // The boundary holds: tolerated heat is positive margin, and crossing it is refused.
  assert.ok(heatMargin(profileOf(creel), [{ level: 0.7, kind: "ambient" }]) > 0);
  assert.match(removePreview({ ...creel, hazards: { heat: [{ level: 0.6, kind: "ambient" }], brine: 0 } }, "hull_heat_lining#1").refusal!,
    /unprotected in this heat/);
});

test("R1: dry-berth changes stay allowed but warn per hazard outside the lock", () => {
  const berth = (exterior: { heat: { level: number; kind: "ambient" }[]; brine: number }, carrierDepth = 300) =>
    ({ carrierDepth, exterior });
  const lined = target("creel", { rating: 450, fitted: [fit("hull_heat_lining")], depth: 300, dock: "carrier_berth",
    berth: berth({ heat: [{ level: 0.6, kind: "ambient" }], brine: 0 }) });
  const heat = removePreview(lined, "hull_heat_lining#1");
  assert.equal(heat.refusal, null);
  assert.equal(heat.warnings.length, 1);
  assert.match(heat.warnings[0]!, /water outside the lock is too hot for the Creel without it/);
  const sealed = target("creel", { rating: 800, fitted: [fit("hull_brine_seals")], depth: 450, dock: "carrier_berth",
    berth: berth({ heat: [], brine: 0.7 }, 450) });
  const brine = removePreview(sealed, "hull_brine_seals#1");
  assert.equal(brine.refusal, null);
  assert.equal(brine.warnings.length, 1);
  assert.match(brine.warnings[0]!, /brine the Creel cannot take without it/);
  const plated = target("dart", { rating: 350, fitted: [fit("plating_ceramic")], depth: 380, dock: "carrier_berth",
    berth: berth({ heat: [], brine: 0 }, 390) });
  const pressure = removePreview(plated, "plating_ceramic#1");
  assert.equal(pressure.refusal, null);
  assert.equal(pressure.warnings.length, 1);
  assert.match(pressure.warnings[0]!, /cannot launch until the carrier rises above 350 m/);
  // Only an explicit benign sample outside the lock gives no warning.
  assert.deepEqual(removePreview({ ...lined, berth: berth({ heat: [], brine: 0 }) }, "hull_heat_lining#1").warnings, []);
  assert.deepEqual(removePreview({ ...sealed, berth: berth({ heat: [], brine: 0 }, 450) }, "hull_brine_seals#1").warnings, []);
  // R2: the exterior sample is required; an unknown exterior cannot certify a safe launch.
  // @ts-expect-error berth.exterior is required
  const unknown: FitTarget["berth"] = { carrierDepth: 300 };
  assert.ok(unknown);
});
