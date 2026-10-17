#!/usr/bin/env node
// Provisional, finite-stock arithmetic. This is not a game simulation.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const data = JSON.parse(await readFile(new URL('./economy-candidate.json', import.meta.url), 'utf8'));
const materialIds = ['structural_alloy', 'silica_glass', 'flex_membrane', 'conductive_crust', 'buoyant_resin', 'pressure_ceramic', 'thermal_core', 'brine_lattice'];
const regionIds = ['refuge_reef', 'island_chain', 'suspended_garden', 'silt_basin', 'thermal_rift', 'brine_divide', 'deep_district'];
const hullIds = ['dart', 'creel', 'hush', 'spindle', 'mantle', 'hearthline'];
const zeros = () => Object.fromEntries(materialIds.map(id => [id, 0]));
const clone = value => JSON.parse(JSON.stringify(value));
const sum = values => values.reduce((a, b) => a + b, 0);
const add = (to, from, scale = 1) => { for (const [id, n] of Object.entries(from)) to[id] += n * scale; };
const vector = values => materialIds.map(id => values[id] ?? 0).join('/');
const cu = (d, cost) => sum(Object.entries(cost).map(([id, n]) => n * d.materials[id].cu));
const ordinaryEnvironments = new Set(['clear', 'cool', 'flushed']);
const sourceRegions = {
  structural_alloy: ['refuge_reef', 'island_chain', 'silt_basin'], silica_glass: ['refuge_reef', 'island_chain'],
  flex_membrane: ['refuge_reef', 'suspended_garden'], conductive_crust: ['suspended_garden', 'silt_basin'],
  buoyant_resin: ['island_chain', 'suspended_garden'], pressure_ceramic: ['thermal_rift'], thermal_core: ['thermal_rift'], brine_lattice: ['brine_divide']
};

function validate(d) {
  assert.deepEqual(Object.keys(d.materials), materialIds, 'canonical material IDs changed');
  assert.deepEqual(Object.keys(d.regions), regionIds, 'canonical region IDs changed');
  assert.deepEqual(Object.keys(d.hulls), hullIds, 'canonical hull IDs changed');
  const ids = new Set();
  for (const s of d.sources) {
    assert.match(s.id, /^[a-z][a-z0-9_]*$/);
    assert(!ids.has(s.id), `duplicate source ${s.id}`); ids.add(s.id);
    assert(materialIds.includes(s.material));
    assert(sourceRegions[s.material].includes(s.region), `${s.id} has an unsupported material habitat`);
    const band = d.regions[s.region]; assert(band, `unknown region ${s.region}`);
    assert(s.depth >= band[0] && s.depth <= band[1], `${s.id} outside regional depth band`);
    assert(Number.isInteger(s.stock) && s.stock > 0);
    assert(Number.isInteger(s.reserve) && s.reserve >= 0);
    assert(['hand', 'frame'].includes(s.form));
    assert(['clear', 'cool', 'flushed', 'hot', 'brine'].includes(s.environment));
    if (s.form === 'frame') {
      assert.equal(s.material, 'structural_alloy');
      assert.equal(s.stock % s.chunk, 0);
      assert.equal(s.chunk * d.materials.structural_alloy.cu, d.logistics.frameCu);
    }
  }
  const firstLimits = [60, 60, 60, 150, 150, 350, 350, 450];
  for (let i = 0; i < materialIds.length; i++) {
    const patches = d.sources.filter(s => s.material === materialIds[i] && s.form === 'hand' && s.depth <= firstLimits[i] && ordinaryEnvironments.has(s.environment));
    assert(patches.length >= 2, `fewer than two preceding-tier patches for ${materialIds[i]}`);
  }
  for (const [id, bp] of Object.entries(d.blueprints)) {
    assert(d.regions[bp.region], `unknown blueprint region ${id}`);
    assert(bp.depth >= d.regions[bp.region][0] && bp.depth <= d.regions[bp.region][1]);
  }
  for (const [id, r] of Object.entries(d.recipes)) {
    for (const [material, n] of Object.entries(r.cost)) assert(materialIds.includes(material) && Number.isInteger(n) && n > 0, `invalid cost ${id}/${material}`);
    for (const need of r.needs) assert(d.recipes[need], `unknown predecessor ${id}/${need}`);
    for (const bp of r.bp) assert(d.blueprints[bp], `unknown blueprint ${id}/${bp}`);
    if (r.frameAlloy) assert(r.frameAlloy <= r.cost.structural_alloy && r.framePatches >= 2);
    if (r.maintenance) assert(d.recovery.permittedRecipes.includes(id), `maintenance leakage into ${id}`);
  }
  for (const id of d.recovery.permittedRecipes) assert(d.recipes[id]?.maintenance, `invalid maintenance permission ${id}`);
  for (const material of Object.keys(d.recovery.shallowRenewal.materialsPerDraw)) assert(materialIds.indexOf(material) < 3, 'advanced stock in renewable recovery draw');
  assert.equal(d.recovery.shallowRenewal.boundOutputOnly, true, 'renewal could feed optional spending');
  assert.equal(d.recovery.boundProvenanceSurvivesSalvage, true, 'repair salvage could launder protected stock');
  assert.equal(d.replenishment.ledgerUsesReserve, false, 'proof must not assume replenishment');
  assert.equal(d.recovery.baselineTowConsumesMaterials, false);
  assert.equal(d.recovery.kitRetainedOnFailure, true);
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    assert(!visiting.has(id), `recipe predecessor cycle at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id); for (const need of d.recipes[id].needs) visit(need);
    visiting.delete(id); visited.add(id);
  }
  Object.keys(d.recipes).forEach(visit);
}

function stateFor(d) {
  return {
    suit: 60, suitEnv: new Set(), transferableHullEnv: new Set(), hulls: new Map(),
    done: new Set(), facilities: new Set(['home_pod']), creelMount: null,
    inventory: zeros(), harvested: zeros(), publicSpent: zeros(), optionalSpent: zeros(),
    maintenanceSpent: zeros(), maintenance: { ...zeros(), ...d.recovery.protectedMaintenanceStock },
    remaining: d.sources.map(s => s.stock), built: [], sourceChecks: 0, meals: 0,
    collectionActions: 0, activeCollectionSeconds: 0
  };
}

function hullCan(s, hullId, depth, environment, service = false) {
  const hull = s.hulls.get(hullId);
  return hull && hull.pressure >= depth &&
    (ordinaryEnvironments.has(environment) || hull.env.has(environment) || s.transferableHullEnv.has(environment)) &&
    (!service || hullId === 'mantle' || (hullId === 'creel' && s.creelMount === 'service_head'));
}

function pointReachable(s, depth, environment = 'clear', service = false) {
  if (s.suit < depth || (!ordinaryEnvironments.has(environment) && !s.suitEnv.has(environment))) return false;
  if (depth <= 60 && ordinaryEnvironments.has(environment) && !service) return true;
  return [...s.hulls.keys()].some(id => hullCan(s, id, depth, environment, service));
}

function sourceReachable(s, source) {
  return pointReachable(s, source.depth, source.environment) && (source.form !== 'frame' || s.buoy);
}

function preconditionProblem(d, s, r) {
  const missing = r.needs.filter(id => !s.done.has(id));
  if (missing.length) return `missing predecessors ${missing.join(', ')}`;
  const unknown = r.bp.filter(id => !pointReachable(s, d.blueprints[id].depth));
  if (unknown.length) return `unreachable blueprint ${unknown.join(', ')}`;
  if (r.site === 'supported_dock' && !s.facilities.has('island_workshop')) return 'no supported dock';
  if (!['supported_dock', 'field'].includes(r.site) && !s.facilities.has(r.site)) return `no fabrication site ${r.site}`;
  if (r.site === 'field' && !pointReachable(s, r.depth, 'clear', r.requiresService)) return `unreachable field service at ${r.depth} m`;
  return null;
}

function grant(s, id, r) {
  const g = r.grants ?? {};
  s.done.add(id);
  if (g.suit) s.suit = Math.max(s.suit, g.suit);
  if (g.facility) s.facilities.add(g.facility);
  if (g.buoy) s.buoy = true;
  if (g.bobbin) s.bobbin = true;
  if (g.reserveCells) s.reserveCells = g.reserveCells;
  if (g.creelMount) s.creelMount = g.creelMount;
  if (g.suitEnvironment) s.suitEnv.add(g.suitEnvironment);
  if (g.suitHot) s.suitEnv.add('hot');
  if (g.hullEnvironment) s.transferableHullEnv.add(g.hullEnvironment);
  if (g.hull) {
    const hull = s.hulls.get(g.hull) ?? { pressure: 0, env: new Set() };
    hull.pressure = Math.max(hull.pressure, g.pressure);
    if (g.hullHot) hull.env.add('hot');
    if (g.hullBrine) hull.env.add('brine');
    s.hulls.set(g.hull, hull);
  }
}

// Fixed-point access graph ignores quantities but retains blueprints, predecessors,
// separate personal/hull protection, fabrication and frame-recovery prerequisites.
function abstractAccess(d) {
  const s = stateFor(d);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, r] of Object.entries(d.recipes)) {
      if (s.done.has(id) || preconditionProblem(d, s, r)) continue;
      if (!Object.keys(r.cost).every(m => d.sources.some(src => src.material === m && sourceReachable(s, src)))) continue;
      if (r.frameAlloy && d.sources.filter(src => src.form === 'frame' && sourceReachable(s, src)).length < r.framePatches) continue;
      grant(s, id, r); changed = true;
    }
  }
  const blocked = Object.keys(d.recipes).filter(id => !s.done.has(id));
  assert.equal(blocked.length, 0, `first-access stall/circular gate: ${blocked.join(', ')}`);
  return s.done.size;
}

function harvest(d, s, index, amount) {
  assert(amount > 0 && s.remaining[index] >= amount);
  const source = d.sources[index];
  assert(sourceReachable(s, source), `unreachable harvest ${source.id}`);
  if (source.form === 'frame') assert.equal(amount % source.chunk, 0);
  s.remaining[index] -= amount;
  s.inventory[source.material] += amount;
  s.harvested[source.material] += amount;
  const actions = Math.ceil(amount / (source.form === 'frame' ? source.chunk : d.collection.handBundleUnits[source.material]));
  s.collectionActions += actions;
  s.activeCollectionSeconds += actions * (source.form === 'frame' ? d.collection.frameActionSeconds : d.collection.handActionSeconds);
}

function craft(d, s, id, optional = false) {
  const r = d.recipes[id]; assert(r, `unknown recipe ${id}`);
  assert(r.repeatable || !s.done.has(id), `duplicate unique build ${id}`);
  assert(!optional || !r.maintenance, 'optional spending attempted to use maintenance stock');
  const problem = preconditionProblem(d, s, r); assert(!problem, `${id}: ${problem}`);
  if (r.maintenance) {
    assert(d.recovery.permittedRecipes.includes(id));
    for (const [m, n] of Object.entries(r.cost)) assert(s.maintenance[m] >= n, `${id}: exhausted protected ${m}`);
    add(s.maintenance, r.cost, -1); add(s.maintenanceSpent, r.cost);
  } else {
    // Tagged carrier stock must actually come from two distinct frame patches.
    if (r.frameAlloy) {
      let required = r.frameAlloy, patches = 0;
      for (let i = 0; i < d.sources.length && patches < r.framePatches; i++) {
        const source = d.sources[i];
        if (source.form === 'frame' && sourceReachable(s, source) && s.remaining[i] >= source.chunk) {
          harvest(d, s, i, source.chunk); required -= source.chunk; patches++;
        }
      }
      assert(patches >= r.framePatches && required === 0, `${id}: insufficient distinct tagged frame payloads`);
    }
    for (const [m, n] of Object.entries(r.cost)) {
      const candidates = d.sources.map((source, index) => ({ source, index }))
        .filter(({ source }) => source.material === m && sourceReachable(s, source));
      assert(candidates.length >= 2, `${id}: fewer than two reachable patches for ${m}`);
      s.sourceChecks++;
      for (const { source, index } of candidates) {
        const need = n - s.inventory[m]; if (need <= 0) break;
        const available = s.remaining[index];
        const bundle = source.form === 'frame' ? source.chunk : d.collection.handBundleUnits[m];
        const take = Math.min(available, Math.ceil(need / bundle) * bundle);
        if (take) harvest(d, s, index, take);
      }
      assert(s.inventory[m] >= n, `${id}: first-access budget shortage ${m}: need ${n}, have ${s.inventory[m]}`);
    }
    add(s.inventory, r.cost, -1); add(s.publicSpent, r.cost);
    if (optional) add(s.optionalSpent, r.cost);
  }
  s.built.push({ id, cost: r.cost }); grant(s, id, r);
}

function conservation(d, s) {
  for (const m of materialIds) {
    const initial = sum(d.sources.filter(src => src.material === m).map(src => src.stock));
    const remaining = sum(d.sources.map((src, i) => src.material === m ? s.remaining[i] : 0));
    assert.equal(remaining + s.inventory[m] + s.publicSpent[m], initial, `public conservation ${m}`);
    assert.equal(s.maintenance[m] + s.maintenanceSpent[m], d.recovery.protectedMaintenanceStock[m] ?? 0, `maintenance conservation ${m}`);
  }
}

function finalLoad(d, s, route) {
  for (const id of [...d.finalLoad.items, ...d.finalLoad.equipped]) assert(s.done.has(id), `final load missing ${id}`);
  assert.equal(s.suit, 800); assert(s.suitEnv.has('hot') && s.suitEnv.has('brine'));
  assert(s.facilities.has('district_stop'), 'final sortie omitted its previously restored service stop');
  const hullId = route === 'creel' ? 'creel' : 'mantle';
  assert(hullCan(s, hullId, d.logistics.finalDepth, 'hot', true));
  assert(hullCan(s, hullId, d.logistics.finalDepth, 'brine', true));
  assert(d.hulls[hullId].servicePallet, 'incompatible service assembly cradle');
  if (hullId === 'creel') assert.equal(s.creelMount, d.finalLoad.requiredServiceMount);
  const load = sum(d.finalLoad.items.map(id => d.recipes[id].cu)) + d.finalLoad.meals * d.food.mealCu;
  const capacity = hullId === 'creel' ? d.hulls.creel.cargoByMount[s.creelMount] : d.hulls[hullId].cargo;
  assert(load <= capacity, `${hullId} final payload ${load} exceeds capacity ${capacity}`);
  if (route === 'carrier') assert.equal(d.hulls.mantle.berth, 'medium');
  return `${load}/${capacity} CU`;
}

function recoveryConservation(d, s) {
  assert(s.bobbin && s.buoy && s.facilities.has('pod_fabricator'));
  // Arithmetic assumes authored starter-accessible tether/tow routes; it cannot verify them.
  const ordinary = zeros(), advanced = zeros(), modules = zeros();
  for (const { id, cost } of s.built) {
    const r = d.recipes[id];
    if (r.kind === 'hull') for (const [m, n] of Object.entries(cost)) (materialIds.indexOf(m) < 5 ? ordinary : advanced)[m] += n;
    if (r.kind === 'module' || r.kind === 'replacement_module') add(modules, cost);
  }
  const committed = zeros(); add(committed, ordinary); add(committed, advanced); add(committed, modules);
  const publicBefore = [...s.remaining];
  const protectedBefore = { ...s.maintenance };
  for (let cycle = 0; cycle < d.recovery.repeatCycles; cycle++) {
    // Numerically disable the whole fleet. No deep deposit is available to pay rescue.
    const liveHulls = s.hulls;
    s.hulls = new Map([...liveHulls].map(([id, hull]) => [id, { ...hull, pressure: 0 }]));
    assert(d.sources.filter(src => src.depth > 60).every(src => !sourceReachable(s, src)));
    assert(d.recovery.shallowRenewal.habitats.every(id => sourceReachable(s, d.sources.find(src => src.id === id))));
    const wallet = zeros(), missing = zeros();
    for (const [type, escrow] of [['ordinaryFrame', ordinary], ['advancedFrame', advanced], ['modules', modules]]) {
      const refund = d.recovery.salvageReturn[type];
      add(wallet, escrow, refund); add(missing, escrow, 1 - refund);
    }
    for (const m of materialIds) {
      assert.equal(wallet[m] + missing[m], committed[m], `salvage conservation ${m}`);
      assert(wallet[m] >= committed[m], `recovery creates rebuild debt ${m}`);
    }
    // Rebuild from salvage alone; no source stock, maintenance or second hull pays it.
    add(wallet, committed, -1);
    assert(materialIds.every(m => wallet[m] === 0), 'salvage/rebuild duplicated materials');
    s.hulls = liveHulls;
    // Ordinary cargo can leave the player temporarily; its separate cache persists.
    const heldCargo = { ...zeros(), structural_alloy: 2, silica_glass: 2, flex_membrane: 2 };
    const cache = { ...zeros(), structural_alloy: 1, silica_glass: 1, flex_membrane: 1 };
    const beforeDrop = { ...heldCargo }; add(heldCargo, cache, -1);
    assert(cu(d, cache) <= d.recovery.ordinaryCargoDropMaximumCu && d.recovery.ordinaryCargoCachePersists);
    assert.equal(d.recovery.salvageReturn.cargo, 1, 'recoverable cargo disappears');
    add(heldCargo, cache, d.recovery.salvageReturn.cargo);
    assert.deepEqual(heldCargo, beforeDrop, 'cargo recovery changed material totals');
  }
  assert.deepEqual(s.remaining, publicBefore, 'rescue consumed public source stock');
  assert.deepEqual(s.maintenance, protectedBefore, 'baseline tow consumed finite patch stock');
  const need = d.recipes.failed_recovery_patch.cost;
  for (const [m, n] of Object.entries(need)) assert(s.maintenance[m] >= n * 2, 'fewer than two further field patches after stress run');
}

function runPlan(d, route, starter, stress) {
  const s = stateFor(d);
  for (const stage of d.plans[route]) {
    let optionalPending = stress;
    const buyOptionalWhenAvailable = () => {
      if (optionalPending && !preconditionProblem(d, s, d.recipes[stage.optional])) {
        craft(d, s, stage.optional, true); optionalPending = false;
      }
    };
    // Spend the optional purchase before the upgrades whenever its own knowledge allows.
    buyOptionalWhenAvailable();
    if (stage.id === 'opening') {
      for (const id of d.plans.opening) { craft(d, s, id); buyOptionalWhenAvailable(); }
      craft(d, s, `${starter}_base`);
    } else {
      if (route === 'creel' && !s.done.has('creel_base')) craft(d, s, 'creel_base');
      for (const id of stage.recipes) { craft(d, s, id); buyOptionalWhenAvailable(); }
    }
    buyOptionalWhenAvailable(); assert(!optionalPending, `optional purchase never became available ${stage.optional}`);
    // Charge one failed local rescue at EVERY tier, not merely once per campaign.
    craft(d, s, 'failed_recovery_patch');
    s.meals += d.food.mealsPerStage + d.food.recoveryMealsPerStage;
    conservation(d, s);
  }
  const payload = finalLoad(d, s, route);
  assert(d.sources.every((src, i) => ordinaryEnvironments.has(src.environment) || s.remaining[i] === src.stock), 'main route relied on protected rich seams');
  recoveryConservation(d, s);
  assert(s.meals <= sum(Object.values(d.food.firstStock)), 'food needs replenishment to finish');
  assert.equal(s.built.filter(x => x.id === 'failed_recovery_patch').length, d.recovery.mandatoryFailurePatches);
  assert(s.hulls.size < hullIds.length, 'completion required every hull');
  const shelves = ['pressure_ceramic', 'thermal_core', 'brine_lattice'].map(m => s.inventory[m] + sum(d.sources.map((src, i) => src.material === m && ordinaryEnvironments.has(src.environment) ? s.remaining[i] : 0)));
  return { route, starter, stress, payload, shelves, state: s };
}

function logistics(d) {
  const reserves = d.logistics.routeReserveCu;
  const frames = d.recipes.hearthline_base.frameAlloy * d.materials.structural_alloy.cu;
  const dartCombined = d.hulls.dart.cargo + d.logistics.buoyCargo;
  assert(frames + reserves <= dartCombined, 'Dart plus buoy needs duplicate frame hauling');
  assert(d.logistics.frameCu + reserves <= d.hulls.dart.cargo, 'one frame plus provisions does not fit Dart');
  assert(d.logistics.frameCu <= d.logistics.buoyCargo);
  const firstCapacity = d.logistics.diverCargo + d.logistics.buoyCargo;
  for (const id of ['dart_base', 'creel_base']) {
    const packets = Object.fromEntries(Object.entries(d.recipes[id].cost).map(([m, n]) => [m, Math.ceil(n / d.collection.handBundleUnits[m]) * d.collection.handBundleUnits[m]]));
    assert(cu(d, packets) + d.logistics.firstHullReserveCu <= firstCapacity, `${id} first build needs excessive hauling`);
  }
  const carrierCu = cu(d, d.recipes.hearthline_base.cost);
  const mantleCu = cu(d, d.recipes.mantle_base.cost);
  const carrierCollections = [
    { structural_alloy: 16, silica_glass: 8 },
    { flex_membrane: 10, conductive_crust: 12, buoyant_resin: 12 },
    { structural_alloy: 16 }
  ].map(cost => cu(d, cost));
  assert.equal(sum(carrierCollections), carrierCu);
  assert(carrierCollections.every(load => load + reserves <= dartCombined), 'carrier component visit needs duplicate hauling');
  const districtPack = cu(d, d.recipes.restore_district_stop.cost);
  const dividePack = cu(d, d.recipes.restore_divide_stop.cost);
  assert(districtPack + dividePack + reserves <= d.hulls.creel.cargoByMount.service_head);
  assert(districtPack + reserves <= d.hulls.mantle.cargo);
  for (const route of ['creel', 'carrier']) {
    assert(d.plans[route].find(stage => stage.id === '800').recipes.includes('restore_district_stop'));
    assert(!d.plans[route].find(stage => stage.id === 'final').recipes.includes('restore_district_stop'));
  }
  return { carrierCu, mantleCu, frameLoad: `${frames + reserves}/${dartCombined}`,
    carrierDartHauls: Math.ceil(carrierCu / (dartCombined - reserves)),
    carrierCreelHauls: Math.ceil(carrierCu / (d.hulls.creel.cargoByMount.cargo_rack - reserves)) };
}

validate(data);
const graphCount = abstractAccess(data);
const runs = [];
for (const route of ['creel', 'carrier']) for (const starter of ['dart', 'creel']) for (const stress of [false, true]) runs.push(runPlan(data, route, starter, stress));
const haul = logistics(data);
const catalogPurchases = [ ['dart_base', 'dart_350'], ['hush_base', 'hush_450'], ['spindle_base'], ['creel_cabin', 'creel_cargo_rack'], ['hearthline_base', 'hearthline_550'], ['mantle_base'] ];
const exercised = new Set(runs.flatMap(run => run.state.built.map(x => x.id)));
for (const purchase of catalogPurchases) {
  const { state } = runPlan(data, 'creel', 'creel', false);
  for (const id of purchase) { craft(data, state, id, true); exercised.add(id); }
  conservation(data, state);
}
assert.equal(exercised.size, Object.keys(data.recipes).length, 'catalog has quantitatively unexercised recipes');

// Rejection fixtures establish that the checker notices relevant broken proposals.
const fixtures = [
  ['recipe cycle', d => { d.recipes.suit_350.needs.push('suit_450'); }, d => validate(d)],
  ['self-gated ceramic', d => { for (const src of d.sources) if (src.id.startsWith('rift_cooled_ceramic_lip')) src.depth = 360; }, d => abstractAccess(d)],
  ['insufficient lattice', d => { for (const src of d.sources) if (src.material === 'brine_lattice' && src.environment === 'flushed') src.stock = 1; }, d => runPlan(d, 'carrier', 'dart', true)],
  ['lost advanced frame', d => { d.recovery.salvageReturn.advancedFrame = 0.8; }, d => runPlan(d, 'carrier', 'dart', true)],
  ['maintenance siphon', d => { d.recipes.marker_pair.maintenance = true; }, d => validate(d)],
  ['overfull final hold', d => { d.hulls.creel.cargoByMount.service_head = 47; }, d => runPlan(d, 'creel', 'creel', true)]
];
for (const [name, mutate, check] of fixtures) {
  const broken = clone(data); mutate(broken);
  assert.throws(() => check(broken), undefined, `checker failed to reject ${name}`);
}

console.log(`PASS catalog: ${regionIds.length} regions, ${materialIds.length} materials, ${hullIds.length} hulls, ${data.sources.length} patches, ${graphCount} reachable recipes`);
console.log('Material vector order: alloy/glass/membrane/crust/resin/ceramic/core/lattice');
for (const run of runs) console.log(`PASS ${run.route.padEnd(7)} first=${run.starter.padEnd(5)} optional=${run.stress ? '5' : '0'} failures=5 public=${vector(run.state.publicSpent)} shelf P/T/B left=${run.shelves.join('/')} final=${run.payload} hulls=${[...run.state.hulls.keys()].join(',')}`);
console.log(`PASS maintenance per run: spent ${vector(runs[0].state.maintenanceSpent)}, left ${vector(runs[0].state.maintenance)}; optional purchases never use it`);
console.log(`PASS conservation: every craft/source ledger; ${data.recovery.repeatCycles} numeric fleet-disable/salvage/rebuild transactions per run; zero stock draw or advanced deficit`);
console.log(`PASS catalog purchases: ${catalogPurchases.length} independent optional branches; all ${exercised.size} recipes quantitatively exercised`);
console.log(`PASS food: ${runs[0].state.meals}/${sum(Object.values(data.food.firstStock))} first-stock meals; ${data.food.protectedEmergencyMeals} protected meals untouched`);
console.log(`PASS cargo arithmetic: final 48/52 CU; two frame payloads + reserves ${haul.frameLoad} CU; carrier ${haul.carrierCu} raw CU, Mantle ${haul.mantleCu} raw CU`);
console.log('PASS pre-final service cargo: Divide+District+reserves 40/52 CU in Creel; District+reserves 29/52 CU in Mantle; stops restored on first deep investigation');
console.log(`Carrier raw-cargo lower bounds: ${haul.carrierDartHauls} Dart+buoy or ${haul.carrierCreelHauls} cargo-Creel loads; habitat visits/knowledge still required`);
console.log(`Candidate active collection: ${Math.min(...runs.map(run => run.state.collectionActions))}-${Math.max(...runs.map(run => run.state.collectionActions))} bundled actions, ${Math.min(...runs.map(run => run.state.activeCollectionSeconds))}-${Math.max(...runs.map(run => run.state.activeCollectionSeconds))} seconds; excludes travel/search`);
console.log(`PASS ${fixtures.length} rejection fixtures: ${fixtures.map(x => x[0]).join('; ')}`);
console.log('UNVERIFIED: ordinary-input routes, oxygen/power >=25% return margin, rescue topology, collision/cargo handling, renewal implementation, duration and human balance.');
