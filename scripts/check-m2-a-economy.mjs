// Compile the production modules with npm test first. Prices/yields live ONLY in the registry.
// Optional: --earned <retained-export.json> --out /tmp/siltwake-m2-a1/economy-result.json
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { CONTENT_VERSION, DART_BUILD_POSE, HULLS, ITEMS, PLACES, RECIPES, SOURCES } from "../.test-build/src/content/registry.js";
import { BASIN_GEOMETRY, BASIN_SOURCE_IDS, RECOVERY_SURFACE_OPERATOR } from "../.test-build/src/content/routes.js";
import { createGame } from "../.test-build/src/sim/state.js";
import { collect, completeOpening, craft, discover, personalLimit } from "../.test-build/src/sim/progression.js";
import { available, containerAccessible, fabricationContainers, transfer, usedCapacity } from "../.test-build/src/sim/inventory.js";
import { installModule } from "../.test-build/src/sim/modules.js";
import { disableVehicle, recoveryCommand, updateRecovery } from "../.test-build/src/sim/recovery.js";
import { createWorldQueries } from "../.test-build/src/sim/world.js";
import { createEnvelope, decodeSave, encodeSave, SAVE_SCHEMA_VERSION } from "../.test-build/src/save/codec.js";
import { validState } from "../.test-build/src/save/validation.js";

const args = process.argv.slice(2), option = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
assert.ok(args.every((a, i) => i % 2 ? true : ["--earned", "--out"].includes(a)), "only --earned and --out are supported");
const earnedPath = option("--earned"), output = option("--out"), world = createWorldQueries();
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const meta = { sessionId: "m2-economy-diagnostic", createdAt: "2026-10-18T00:00:00.000Z", savedAt: "2026-10-18T00:01:00.000Z" };
const predecessor = Object.entries(SOURCES).filter(([, d]) => d.item !== "meal" && -d.position.y <= 150 && d.region !== "silt_basin");
const family = kind => predecessor.filter(([, d]) => d.item === kind);
const budget = {};
for (const id of ["suit_350", "dart_acoustic_trim"]) for (const [kind, q] of Object.entries(RECIPES[id].cost)) budget[kind] = (budget[kind] ?? 0) + q;
for (const [kind, q] of Object.entries(budget)) {
  const patches = family(kind); assert.ok(patches.length >= 2, `${kind}: independent predecessor patches`);
  assert.ok(patches.reduce((n, [, d]) => n + d.stock, 0) >= q, `${kind}: exposed stock, no reserve/respawn dependency`);
}
assert.equal(HULLS.dart.initialDepth, 180);
for (const id of BASIN_SOURCE_IDS) assert.ok(-SOURCES[id].position.y > 150 && -SOURCES[id].position.y <= 175 && -SOURCES[id].position.y < HULLS.dart.initialDepth);
assert.equal(BASIN_SOURCE_IDS.filter(id => SOURCES[id].item === "structural_alloy").length, 2);
assert.equal(BASIN_SOURCE_IDS.filter(id => SOURCES[id].item === "conductive_crust").length, 2);

function run(initial, provenance) {
  let s = structuredClone(initial); completeOpening(s);
  const receipts = [], gathered = {}, spent = {}, peak = { diver: 0, craft: 0, saveBytes: 0 };
  let codecChecks = 0;
  function check() {
    assert.ok(validState(s), `${provenance}: strict state`);
    for (const c of s.inventory.containers) assert.ok(usedCapacity(s, c.id) <= c.capacity, c.id);
    peak.diver = Math.max(peak.diver, usedCapacity(s, "diver"));
    if (s.fleet.vehicles[0]) peak.craft = Math.max(peak.craft, usedCapacity(s, s.fleet.vehicles[0].cargoId));
    const encoded = encodeSave(createEnvelope(s, meta)); assert.ok(encoded.ok, encoded.ok ? "" : encoded.error);
    peak.saveBytes = Math.max(peak.saveBytes, Buffer.byteLength(encoded.value)); const d = decodeSave(encoded.value);
    assert.ok(d.ok); assert.deepEqual(d.value.state, s); codecChecks++;
  }
  function visit(p) {
    s.player.pose.position = { ...p }; s.player.velocity = { x: 0, y: 0, z: 0 };
    s.player.controlledVehicleId = null; s.player.interiorId = null; s.player.interiorPose = null;
    s.player.mode = p.y < 0 ? "swimming" : "walking"; s.world.action = null;
  }
  for (const id of ["C02", "C03", "C04"]) discover(s, id);
  function storeAtBench(locker) {
    if (!containerAccessible(s, locker)) return;
    for (const i of [...s.inventory.items].filter(i => i.containerId === "diver" && !i.fitted))
      assert.equal(transfer(s, i.id, locker, i.quantity), null);
    check();
  }
  function fundAndCraft(id) {
    const r = RECIPES[id]; if (s.knowledge.crafted.includes(id)) return;
    const site = r.site === "island_workshop" ? "island_workshop" : "home_pod", locker = site === "island_workshop" ? "workshop_locker" : "pod_locker";
    visit(PLACES[site].position); storeAtBench(locker);
    if (!r.maintenance) for (const [kind, required] of Object.entries(r.cost)) {
      while (available(s, kind, fabricationContainers(s, r.site)) < required) {
        const candidates = family(kind).filter(([id]) => s.world.resources.find(n => n.id === id).stock > 0)
          .sort((a, b) => (gathered[a[0]] ?? 0) - (gathered[b[0]] ?? 0));
        assert.ok(candidates.length, `${id}: reachable exposed ${kind} remains in this actual state`);
        const [sourceId, source] = candidates[0]; visit(source.position);
        assert.ok(-source.position.y <= personalLimit(s), "before-upgrade source capability");
        assert.equal(collect(s, sourceId), null, sourceId); gathered[sourceId] = (gathered[sourceId] ?? 0) + 1; check();
        visit(PLACES[site].position); storeAtBench(locker);
      }
    }
    const suitId = s.inventory.items.find(i => i.fitted === "suit")?.id;
    assert.equal(craft(s, id, world), null, id); check();
    if (!r.maintenance) for (const [kind, q] of Object.entries(r.cost)) spent[kind] = (spent[kind] ?? 0) + q;
    receipts.push({ id, cost: r.cost, maintenance: r.maintenance });
    if (id === "suit_350") assert.equal(s.inventory.items.find(i => i.fitted === "suit").id, suitId);
  }
  for (const id of ["pod_repair", "essential_tools", "suit_150", "salvage_buoy", "reserve_cells", "bobbin_kit", "restore_workshop", "dart_base", "dart_acoustic_trim", "suit_350"]) fundAndCraft(id);
  assert.equal(personalLimit(s), 350); assert.ok(s.knowledge.crafted.includes("suit_150"));
  const v = s.fleet.vehicles.find(v => v.hull === "dart"); assert.ok(v);
  visit(PLACES.island_workshop.position); v.pose.position = { ...DART_BUILD_POSE }; v.velocity = { x: 0, y: 0, z: 0 };
  if (s.inventory.items.some(i => i.containerId === v.cargoId && Object.hasOwn(ITEMS, i.kind) && !v.modules.includes(i.id))) {
    for (const i of [...s.inventory.items].filter(i => i.containerId === v.cargoId && !v.modules.includes(i.id))) assert.equal(transfer(s, i.id, "workshop_locker", i.quantity), null);
  }
  const trim = s.inventory.items.find(i => i.kind === "dart_acoustic_trim");
  if (!v.modules.includes(trim.id)) assert.equal(installModule(s, v.id, trim.id), null);
  storeAtBench("workshop_locker"); check();
  const retainedModuleId = trim.id, retainedFrame = structuredClone(v.investment), cargo = {};
  for (const id of BASIN_SOURCE_IDS) {
    const d = SOURCES[id]; visit(d.position); v.pose.position = { ...d.position, y: d.position.y + 4 };
    assert.equal(collect(s, id), null, id); gathered[id] = (gathered[id] ?? 0) + 1; check();
    const item = s.inventory.items.find(i => i.kind === d.item && i.containerId === "diver");
    cargo[d.item] = (cargo[d.item] ?? 0) + item.quantity; assert.equal(transfer(s, item.id, v.cargoId, item.quantity), null); check();
  }
  for (const order of [["C05", "C06"], ["C06", "C05"]]) {
    const branch = structuredClone(s); for (const id of order) discover(branch, id);
    assert.deepEqual(branch.knowledge.evidence.slice(-2).map(e => e.id), order);
    assert.equal(branch.knowledge.journals.length, s.knowledge.journals.length);
  }
  discover(s, "C06"); discover(s, "C05");
  const inventory = structuredClone(s.inventory); v.pose.position = { ...BASIN_GEOMETRY.station.parking }; v.charge = 0; disableVehicle(s, v.id);
  visit(RECOVERY_SURFACE_OPERATOR); assert.equal(recoveryCommand(s, v.id, "tow", world), null); check();
  let steps = 0;
  while (s.recovery.operation?.phase !== "ready") { assert.ok(s.recovery.operation); const e = updateRecovery(s, world); assert.ok(!e?.error); if (++steps % 120 === 0) check(); assert.ok(steps < 12000); }
  assert.equal(recoveryCommand(s, v.id, "tow", world), null); check();
  while (s.recovery.operation) { const e = updateRecovery(s, world); assert.ok(!e?.error); if (++steps % 120 === 0) check(); assert.ok(steps < 12000); }
  assert.deepEqual(s.inventory, inventory); assert.deepEqual(v.investment, retainedFrame); assert.deepEqual(v.modules, [retainedModuleId]);
  visit({ x: 54, y: -11, z: -54 }); const reserveBefore = structuredClone(s.world.maintenance);
  assert.equal(recoveryCommand(s, v.id, "repair", world), null); check();
  assert.equal(s.world.maintenance.alloy, reserveBefore.alloy - 2); assert.equal(s.world.maintenance.membrane, reserveBefore.membrane - 1);
  assert.ok(s.world.maintenance.alloy >= 2 && s.world.maintenance.membrane >= 1, "another failure retains a patch reserve");
  assert.deepEqual(v.modules, [retainedModuleId]); assert.deepEqual(v.investment, retainedFrame);
  return { provenance, scope: "Staged positions and direct discovery, real collection/transfer/craft/recovery/codec rules. No ordinary route or oxygen/power-margin claim.",
    receipts, spent, gathered, deliveredBasinCargo: cargo, remainingRescue: s.world.maintenance, peak, codecChecks, rescueSteps: steps,
    finalSuitId: s.inventory.items.find(i => i.fitted === "suit").id, retainedModuleId, retainedFrame };
}
const scenarios = [run(createGame(), "Fresh New Game state; rule-staged preparation, not played New Game")];
let retainedInput = null;
if (earnedPath) {
  const bytes = fs.readFileSync(earnedPath), decoded = decodeSave(bytes.toString("utf8")); assert.ok(decoded.ok, decoded.ok ? "" : decoded.error);
  const original = JSON.parse(bytes), before = hash(bytes);
  retainedInput = { path: earnedPath, sha256: before, originalSchema: original.schemaVersion, originalContent: original.contentVersion, originalTick: original.state.tick,
    originalResources: original.state.world.resources, classification: "Actual retained earned gameplay import, followed by explicitly staged rule diagnostics" };
  scenarios.push(run(decoded.value.state, `Retained earned export ${before}`)); assert.equal(hash(fs.readFileSync(earnedPath)), before);
}
const result = { schema: SAVE_SCHEMA_VERSION, content: CONTENT_VERSION, predecessorBudgetWithOptionalTrim: budget,
  predecessorStock: Object.fromEntries(Object.keys(budget).map(kind => [kind, family(kind).reduce((n, [, d]) => n + d.stock, 0)])), retainedInput, scenarios };
if (output) fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
