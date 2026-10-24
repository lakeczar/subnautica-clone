import test from "node:test";
import { HOST_KNOWLEDGE_RECIPES, UPGRADE_RECIPES, UPGRADE_REFIT_RECIPES } from "../src/content/upgrades/registry.js";
import assert from "node:assert/strict";
import { PanelView } from "../src/ui/panels.js";
import { DART_BUILD_POSE, RECIPES, SOURCES, type ItemKind, type RecipeId } from "../src/content/registry.js";
import { CAMPAIGN_RECIPES } from "../src/content/campaign/index.js";
import { addItem, available, fabricationContainers, materialStoragePreview, usedCapacity } from "../src/sim/inventory.js";
import { completeOpening, craftingRefusal, discover } from "../src/sim/progression.js";
import { createGame, makeVehicle } from "../src/sim/state.js";
import { executeCommand } from "../src/sim/step.js";
import { disableVehicle } from "../src/sim/recovery.js";
import { serviceRefusal, serviceWouldRestore } from "../src/sim/vehicles.js";
import { createWorldQueries } from "../src/sim/world.js";
import type { GameCommand, GameState, WorldQueries } from "../src/sim/types.js";
import { UI_SCENARIOS } from "./ui-scenarios.js";

/** Panel-local port: checks construction/intent against real simulation commands.
 * Actual layout, native details and keyboard focus are exercised in the browser. */
function panelFixture(t: test.TestContext, world: WorldQueries = createWorldQueries()) {
  class Port {
    private html = "";
    groups: { dataset: { panelGroup: string }; open: boolean }[] = [];
    textContent = "";
    hidden = false;
    scrollTop = 0;
    classList = { remove() {}, toggle() {} };
    get innerHTML() { return this.html; }
    set innerHTML(value: string) {
      this.html = value;
      this.groups = [...value.matchAll(/<details\b([^>]*)>/g)].flatMap((m) => {
        const id = m[1]!.match(/data-panel-group="([^"]*)"/)?.[1];
        return id ? [{ dataset: { panelGroup: id }, open: /\bopen(?:\s|$)/.test(m[1]!) }] : [];
      });
    }
    contains() { return false; }
    querySelectorAll(selector: string) { return selector === "details[data-panel-group]" ? this.groups : []; }
  }
  const ports = new Map<string, Port>();
  const get = (id: string): Port => {
    if (!ports.has(id)) ports.set(id, new Port());
    return ports.get(id)!;
  };
  const previous = ["document", "window"].map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { clearTimeout() {} } });
  t.after(() => ["document", "window"].forEach((key, i) => previous[i] ? Object.defineProperty(globalThis, key, previous[i]!) : Reflect.deleteProperty(globalThis, key)));
  const root = { querySelector: (selector: string) => get(selector.slice(1)), querySelectorAll: () => [] };
  const panel = new PanelView(root as unknown as HTMLElement, world);
  const html = () => get("panel-content").innerHTML;
  // Game commands only: the journal's tab buttons (C4) are view actions.
  const commands = (): GameCommand[] => [...html().matchAll(/data-action="([^"]*)"/g)].flatMap((m) => panel.command(m[1]!) ?? []);
  const controls = () => [...html().matchAll(/<button\b([^>]*)>([^<]*)<\/button>/g)].map((m) => ({
    command: panel.command(m[1]!.match(/data-action="([^"]*)"/)![1]!)!,
    disabled: /\sdisabled(?:\s|$)/.test(m[1]!), label: m[2]!, attrs: m[1]!,
  })).filter((b) => b.command !== undefined);
  const recipe = (id: string) => html().split(`data-recipe="${id}"`)[1]!.split("</article>")[0]!;
  const groupOf = (id: string) => {
    const before = html().slice(0, html().indexOf(`data-recipe="${id}"`));
    return [...before.matchAll(/data-recipe-group="([^"]*)"|data-panel-group="(completed-recipes|locked-recipes)"/g)].at(-1)?.slice(1).find(Boolean);
  };
  return { panel, get, html, commands, controls, recipe, groupOf };
}
function workshop(): GameState {
  const s = createGame(); completeOpening(s); discover(s, "C03"); discover(s, "C04");
  s.player.pose.position = { x: 11, y: 1.2, z: -35 };
  s.knowledge.crafted.push("pod_repair", "essential_tools", "restore_workshop", "suit_150", "dart_base");
  for (const f of s.world.facilities) if (f.id === "pod_fabricator" || f.id === "island_workshop") f.repaired = true;
  return s;
}
function addDart(s: GameState, id = "menu-dart") {
  const v = makeVehicle(id, "dart", { x: 20, y: -1.6, z: -22 }, `${id}-hold`);
  s.fleet.vehicles.push(v);
  s.inventory.containers.push({ id: v.cargoId, kind: "vehicle", ownerId: v.id, capacity: 32 });
  return v;
}

test("actual-ready work leads; only completed one-time recipes collapse and repeatable work retains its command", (t) => {
  const { panel, html, recipe, groupOf, commands } = panelFixture(t);
  const s = workshop(); addItem(s, "conductive_crust", 2, "diver"); addItem(s, "buoyant_resin", 2, "diver");
  addDart(s);
  const before = structuredClone(s);
  panel.refresh("craft", s);
  assert.equal(craftingRefusal(s, "dart_acoustic_trim", createWorldQueries()), null);
  assert.equal(groupOf("dart_acoustic_trim"), "ready");
  assert.equal(groupOf("essential_tools"), "completed-recipes");
  assert.equal(groupOf("dart_base"), "current");
  assert.ok(html().indexOf('data-recipe="dart_acoustic_trim"') < html().indexOf('data-recipe="dart_base"'));
  assert.ok(commands().some((c) => c.type === "craft" && c.recipeId === "dart_base"));
  assert.match(recipe("dart_base"), /A Dart already exists/);
  assert.ok(!commands().some((c) => c.type === "craft" && c.recipeId === "essential_tools"));
  assert.ok(!html().includes('data-panel-group="completed-recipes" open'));
  assert.deepEqual(s, before);
});

test("usable counts exclude inaccessible carried/elsewhere quantities without overlap or maintenance spending", (t) => {
  const { panel, recipe } = panelFixture(t);
  const s = workshop(); const v = addDart(s);
  addItem(s, "conductive_crust", 2, "diver"); addItem(s, "conductive_crust", 3, "workshop_locker");
  addItem(s, "conductive_crust", 4, v.cargoId); addItem(s, "conductive_crust", 5, "pod_locker");
  addItem(s, "conductive_crust", 20, "diver", null, "maintenance");
  addItem(s, "conductive_crust", 30, "equipment", "tools");
  panel.refresh("craft", s);
  assert.equal(available(s, "conductive_crust", fabricationContainers(s, "island_workshop")), 9);
  assert.match(recipe("dart_acoustic_trim"), /Conductive crust: 9 \/ 2.*Not usable at this bench · Conductive crust: \+5 elsewhere/);
  assert.ok(!recipe("dart_acoustic_trim").includes("+2 carried"), "carried stock already usable is not added twice");
  s.player.mode = "piloting"; s.player.controlledVehicleId = v.id; s.player.pose = structuredClone(v.pose);
  panel.refresh("craft", s);
  assert.match(recipe("dart_acoustic_trim"), /Conductive crust: 0 \/ 2.*Conductive crust: \+2 carried, \+12 elsewhere/);
  assert.match(recipe("dart_acoustic_trim"), /Leave the craft to use a bench/, "a seated pilot gets the actionable site reason");
  assert.match(recipe("dart_acoustic_trim"), /away from this bench/);
});

test("prerequisites are named and a site refusal with short stock stays blocked; restoration remains findable", (t) => {
  const { panel, html, recipe, groupOf } = panelFixture(t);
  const s = createGame(); completeOpening(s); discover(s, "C03");
  s.player.pose.position = { x: 10, y: 2, z: -35 };
  addItem(s, "structural_alloy", 8, "workshop_locker");
  panel.refresh("craft", s);
  assert.equal(groupOf("dart_base"), "locked-recipes", "unmet prerequisites collapse");
  assert.match(recipe("dart_base"), /Needs: Restore workshop services.*Fit 150 m pressure suit/);
  assert.match(recipe("restore_workshop"), /Structural alloy: 0 \/ 3/);
  assert.match(html(), /repair needed; locker locked/);
  assert.match(recipe("restore_workshop"), /repair available before restoration/);
  assert.ok(!html().includes('data-recipe="dart_acoustic_trim"'), "unknown blueprints remain filtered");
  s.knowledge.crafted.push("pod_repair");
  panel.refresh("craft", s);
  assert.equal(groupOf("essential_tools"), "blocked", "wrong site wins even when materials are also missing");
  assert.match(recipe("essential_tools"), /action-reason[^>]*>At Home pod · [NSEW]+ · \d+ m</, "the row names where to go");
});

test("protected maintenance counts are separate from abundant public stock and command refusal is atomic", (t) => {
  const { panel, recipe, groupOf } = panelFixture(t);
  const s = createGame(); completeOpening(s); discover(s, "C02");
  s.knowledge.crafted.push("pod_repair", "essential_tools");
  s.world.facilities.find((f) => f.id === "pod_fabricator")!.repaired = true;
  s.world.maintenance = { alloy: 1, glass: 0, membrane: 2 };
  addItem(s, "structural_alloy", 10, "pod_locker"); addItem(s, "silica_glass", 10, "pod_locker"); addItem(s, "flex_membrane", 10, "pod_locker");
  panel.refresh("craft", s);
  assert.equal(groupOf("bobbin_kit"), "materials");
  assert.match(recipe("bobbin_kit"), /Structural alloy: 1 \/ 2/);
  assert.match(recipe("bobbin_kit"), /Rescue stock only · protected from ordinary fabrication/);
  assert.ok(!recipe("bobbin_kit").includes("+10 elsewhere"));
  const result = executeCommand(s, { type: "craft", recipeId: "bobbin_kit" }, createWorldQueries());
  assert.deepEqual(result.state, s);
  assert.ok(result.events.some((e) => e.type === "notice" && e.error && e.message.includes("Rescue stock is low")));
});

test("full output and blocked construction keep specific refusals and spend nothing", (t) => {
  const world = createWorldQueries([], () => -100);
  world.clearance = () => false;
  const { panel, recipe, groupOf } = panelFixture(t, world);
  const s = workshop();
  for (const [kind, n] of Object.entries(RECIPES.dart_base.cost)) addItem(s, kind as ItemKind, n, "workshop_locker");
  addItem(s, "conductive_crust", 2, "workshop_locker"); addItem(s, "buoyant_resin", 2, "workshop_locker");
  addItem(s, "meal", 16, "diver");
  panel.refresh("craft", s);
  assert.equal(groupOf("dart_base"), "blocked"); assert.match(recipe("dart_base"), /Construction clearance is blocked. Nothing consumed/);
  assert.equal(groupOf("dart_acoustic_trim"), "blocked"); assert.match(recipe("dart_acoustic_trim"), /Output would not fit your hold. Nothing consumed/);
  for (const recipeId of ["dart_base", "dart_acoustic_trim"] as const) assert.deepEqual(executeCommand(s, { type: "craft", recipeId }, world).state, s);
});

test("an implicit Dart-only default improves to the local locker; explicit accessible intent survives roster and bench/cradle changes", (t) => {
  const { panel, commands } = panelFixture(t);
  const s = workshop(); const v = addDart(s);
  s.player.controlledVehicleId = v.id; s.player.pose = structuredClone(v.pose); s.player.mode = "piloting";
  const destination = () => commands().find((c) => c.type === "store-materials");
  panel.refresh("inventory", s); assert.deepEqual(destination(), { type: "store-materials", from: "diver", to: v.cargoId });
  s.player.controlledVehicleId = null; s.player.mode = "walking"; s.player.pose.position = { x: 11, y: 1.2, z: -35 };
  panel.refresh("inventory", s); assert.equal((destination() as { to: string }).to, "workshop_locker");
  panel.selectStorage("storage-to", v.cargoId); panel.refresh("inventory", s);
  const other = addDart(s, "passing-dart"); panel.refresh("inventory", s);
  s.fleet.vehicles = s.fleet.vehicles.filter((a) => a.id !== other.id); panel.refresh("inventory", s);
  assert.equal((destination() as { to: string }).to, v.cargoId);
  s.player.controlledVehicleId = v.id; s.player.pose = structuredClone(v.pose); s.player.mode = "piloting";
  panel.refresh("inventory", s); assert.equal((destination() as { to: string }).to, v.cargoId);
  s.player.controlledVehicleId = null; s.player.pose.position = { x: 11, y: 1.2, z: -35 };
  panel.refresh("inventory", s); assert.equal((destination() as { to: string }).to, v.cargoId);
});

test("invalid or identical destinations explain a valid fallback; leaving the site clears explicit intent", (t) => {
  const { panel, html, commands } = panelFixture(t);
  const s = workshop(); const v = addDart(s);
  const destination = () => commands().find((c) => c.type === "store-materials") as Extract<GameCommand, { type: "store-materials" }>;
  panel.refresh("inventory", s); panel.selectStorage("storage-to", v.cargoId); panel.refresh("inventory", s);
  v.pose.position = { x: 90, y: -20, z: -80 }; panel.refresh("inventory", s);
  assert.equal(destination().to, "workshop_locker"); assert.match(html(), /Dart hold is out of reach. Using Workshop locker/);
  v.pose.position = { x: 20, y: -1.6, z: -22 }; panel.selectStorage("storage-to", v.cargoId); panel.refresh("inventory", s);
  panel.selectStorage("storage-from", v.cargoId); panel.refresh("inventory", s);
  assert.equal(destination().to, "workshop_locker"); assert.match(html(), /Dart hold is now the source/);
  panel.selectStorage("storage-from", "diver"); panel.selectStorage("storage-to", v.cargoId); panel.refresh("inventory", s);
  s.player.pose.position = { x: 0, y: .18, z: 21.2 }; panel.refresh("notebook", s);
  s.player.pose.position = { x: 11, y: 1.2, z: -35 }; panel.refresh("inventory", s);
  assert.equal(destination().to, "workshop_locker");
  const preview = materialStoragePreview(s, destination().from, destination().to);
  assert.equal(preview.refusal, "No public material stacks in the source. Meals, cells, tools and modules stay with their container.");
});

test("native expansion state is remembered across refresh/panel switches; session reset removes intent, commands and inline result", (t) => {
  const { panel, get, html, commands } = panelFixture(t);
  const s = workshop(); const v = addDart(s);
  panel.refresh("inventory", s); panel.selectStorage("storage-to", v.cargoId);
  get("panel-content").groups.find((g) => g.dataset.panelGroup === "power")!.open = true;
  panel.refresh("craft", s); panel.refresh("inventory", s);
  assert.match(html(), /data-panel-group="power" open/);
  panel.notify("Old result", true); const oldAction = html().match(/data-action="([^"]*)"/)![1]!;
  panel.resetSession();
  assert.equal(panel.command(oldAction), undefined); assert.equal(get("panel-feedback").textContent, ""); assert.equal(get("panel-feedback").hidden, true);
  panel.refresh("inventory", structuredClone(s));
  assert.ok(!html().includes('data-panel-group="power" open'));
  assert.equal((commands().find((c) => c.type === "store-materials") as { to: string }).to, "workshop_locker");
});

test("observed departure clears obsolete storage fallback without rendering a panel en route", (t) => {
  const { panel, html, commands } = panelFixture(t), s = workshop(), v = addDart(s);
  panel.refresh("inventory", s); panel.selectStorage("storage-to", v.cargoId);
  v.pose.position = { x: 90, y: -20, z: -80 }; panel.refresh("inventory", s);
  assert.match(html(), /Dart hold is out of reach/);
  const previousHtml = html();
  s.player.pose.position = { x: 70, y: -5, z: -35 }; panel.observeStorageContext(s);
  s.player.pose.position = { x: 11, y: 1.2, z: -35 }; panel.observeStorageContext(s);
  assert.equal(html(), previousHtml, "context observation leaves the rendered DOM alone");
  panel.refresh("inventory", s);
  assert.doesNotMatch(html(), /Dart hold is out of reach/);
  assert.deepEqual(commands().find(c => c.type === "store-materials"), { type: "store-materials", from: "diver", to: "workshop_locker" });
});

test("ordinary panel labels are readable; empty-inventory emergency food and retained facts stay accessible", (t) => {
  const { panel, html, commands } = panelFixture(t);
  const s = workshop(); const v = addDart(s);
  addItem(s, "reserve_cell", 1, "diver"); addItem(s, "reserve_cell", 1, v.cargoId); addItem(s, "dart_acoustic_trim", 1, "diver");
  for (const kind of ["inventory", "craft", "notebook"] as const) {
    panel.refresh(kind, s);
    const text = html().replace(/<[^>]*>/g, "");
    assert.doesNotMatch(text, /\bitem_\w+\b/);
    if (kind === "inventory") assert.ok(commands().some((c) => c.type === "emergency-meal"));
    if (kind === "notebook") {
      assert.match(text, /full tank 180 s/); assert.ok(!text.includes("Recovered research:"));
      assert.match(text, /Source ·.*Observed.*(?:Hypothesis|Read again)/s);
      assert.match(text, /future construction opportunity; no campaign carrier is available here yet/);
    }
  }
});

test("Cargo context rows use actual local access: field, locked workshop, restored bench and supported seat", (t) => {
  const { panel, html, controls, get } = panelFixture(t);
  const s = workshop();
  s.player.pose.position = { x: 65, y: -5, z: 10 };
  panel.refresh("inventory", s);
  assert.equal(get("panel-title").textContent, "Cargo");
  assert.doesNotMatch(html(), /class="here-actions"/);
  assert.ok(!controls().some((b) => b.command.type === "store-materials"));
  s.player.pose.position = { x: 11, y: 1.2, z: -35 };
  s.world.facilities.find((f) => f.id === "island_workshop")!.repaired = false;
  panel.refresh("inventory", s);
  assert.match(html(), /Locked · restore workshop services/);
  assert.ok(!controls().some((b) => b.command.type === "store-materials"));
  s.world.facilities.find((f) => f.id === "island_workshop")!.repaired = true;
  const cell = addItem(s, "reserve_cell", 1, "workshop_locker"); cell.charge = 20;
  panel.refresh("inventory", s);
  assert.ok(html().indexOf('class="bulk-storage"') < html().indexOf('id="container-diver"'));
  assert.ok(html().indexOf('class="bench-charge"') < html().indexOf('id="container-diver"'));
  assert.equal(controls().find((b) => b.command.type === "recharge-cells")!.disabled, false);
  const v = addDart(s); v.charge = 60;
  s.player.controlledVehicleId = v.id; s.player.mode = "piloting"; s.player.pose = structuredClone(v.pose);
  panel.refresh("inventory", s);
  assert.match(html(), /Seated · power 60%/); assert.doesNotMatch(html(), /0m away/);
  assert.ok(html().indexOf('id="vessel-menu-dart"') < html().indexOf('class="bulk-storage"'));
  assert.equal(controls().find((b) => b.command.type === "service")!.disabled, false);
  assert.deepEqual(controls().find((b) => b.command.type === "store-materials")!.command, { type: "store-materials", from: "diver", to: v.cargoId });
});

test("unsupported occupied craft offers reserve power; supported service and bench cells retain distinct exact rules", (t) => {
  const { panel, controls, html } = panelFixture(t);
  const s = workshop(), v = addDart(s);
  v.charge = 35; v.pose.position = { x: 60, y: -30, z: -40 };
  s.player.mode = "piloting"; s.player.controlledVehicleId = v.id; s.player.pose = structuredClone(v.pose);
  addItem(s, "reserve_cell", 1, "diver").charge = 50;
  panel.refresh("inventory", s);
  assert.equal(controls().find((b) => b.command.type === "reserve")!.disabled, false);
  const service = controls().find((b) => b.command.type === "service")!;
  assert.equal(service.disabled, true); assert.match(service.attrs, /aria-describedby=/);
  assert.ok(html().includes(serviceRefusal(s, v.id)!));
  v.pose.position = { ...DART_BUILD_POSE }; s.player.pose = structuredClone(v.pose);
  v.charge = 100; s.inventory.items.find((i) => i.kind === "reserve_cell")!.charge = 100;
  assert.equal(serviceWouldRestore(s, v), false);
  panel.refresh("inventory", s);
  assert.match(html(), /Fully serviced/); assert.ok(!controls().some((b) => b.command.type === "service"));
  assert.equal(executeCommand(s, { type: "service", vehicleId: v.id }, createWorldQueries()).events.some((e) => e.type === "notice" && e.error), false);
  s.player.controlledVehicleId = null; s.player.mode = "walking"; s.player.pose.position = { x: 11, y: 1.2, z: -35 };
  addItem(s, "reserve_cell", 1, "workshop_locker").charge = 25;
  panel.refresh("inventory", s);
  assert.equal(controls().find((b) => b.command.type === "recharge-cells")!.disabled, false);
  assert.ok(!controls().some((b) => b.command.type === "service" && !b.disabled), "a bench can reach cargo without reaching the hull socket");
  const pod = createGame(); completeOpening(pod); pod.world.facilities.find((f) => f.id === "pod_fabricator")!.repaired = true;
  addItem(pod, "reserve_cell", 1, "pod_locker").charge = 0;
  panel.refresh("inventory", pod);
  assert.equal(controls().find((b) => b.command.type === "recharge-cells")!.disabled, false);
});

test("Nothing to store and full destinations are native disabled with adjacent reasons; stale transfers remain atomic", (t) => {
  const { panel, controls, html } = panelFixture(t);
  const s = workshop(), v = addDart(s), world = createWorldQueries();
  panel.refresh("inventory", s);
  let store = controls().find((b) => b.command.type === "store-materials")!;
  assert.equal(store.label, "Nothing to store"); assert.equal(store.disabled, true);
  assert.doesNotMatch(html().split('class="bulk-storage"')[1]!.split('</article>')[0]!, /recipe-status|No public material stacks/);
  const item = addItem(s, "structural_alloy", 2, "diver");
  addItem(s, "structural_alloy", 16, v.cargoId);
  panel.refresh("inventory", s);
  const moves = controls().filter((b) => b.command.type === "transfer" && b.command.to === v.cargoId);
  assert.ok(moves.length === 2 && moves.every((b) => b.disabled));
  assert.match(html(), /Needs 4 CU free in Dart hold/);
  store = controls().find((b) => b.command.type === "store-materials")!;
  assert.equal(store.disabled, false);
  s.player.pose.position = { x: 65, y: -5, z: -35 };
  const before = structuredClone(s);
  assert.deepEqual(executeCommand(s, store.command, world).state, before);
  assert.deepEqual(executeCommand(s, { type: "transfer", itemId: item.id, to: "workshop_locker", quantity: 2 }, world).state, before);
});

test("Move disclosures retain quantities, CU, charge, provenance and reset only on semantic departure", (t) => {
  const { panel, html, get } = panelFixture(t);
  const s = workshop(), v = addDart(s);
  const alloy = addItem(s, "structural_alloy", 3, "diver", null, "maintenance");
  addItem(s, "reserve_cell", 1, "diver").charge = 37;
  const trim = addItem(s, "dart_acoustic_trim", 1, v.cargoId); v.modules.push(trim.id);
  panel.refresh("inventory", s);
  assert.match(html(), /Structural alloy × 3.*6 CU · rescue stock/);
  assert.match(html(), /charge 37%/); assert.match(html(), /2 CU · Installed in Dart/);
  assert.ok(!html().includes(`data-panel-group="move:${trim.id}"`));
  const key = `move:${alloy.id}`;
  get("panel-content").groups.find((g) => g.dataset.panelGroup === key)!.open = true;
  get("game-panel").scrollTop = 210;
  addDart(s, "roster-change"); panel.refresh("inventory", s);
  assert.ok(html().includes(`data-panel-group="${key}" open`)); assert.equal(get("game-panel").scrollTop, 210);
  // Depart and return with the old open DOM still present; it must not repopulate the map.
  s.player.pose.position = { x: 65, y: -5, z: -35 }; panel.observeStorageContext(s);
  s.player.pose.position = { x: 11, y: 1.2, z: -35 }; panel.observeStorageContext(s);
  panel.refresh("inventory", s);
  assert.ok(!html().includes(`data-panel-group="${key}" open`));
  get("panel-content").groups.find((g) => g.dataset.panelGroup === key)!.open = true;
  panel.resetSession(); panel.refresh("inventory", s);
  assert.ok(!html().includes(`data-panel-group="${key}" open`));
});

test("disabled recovery stays prominent with exact occupancy, stock, contents and complete-frame return reasons", (t) => {
  const { panel, html, controls } = panelFixture(t);
  const s = workshop(), v = addDart(s);
  addItem(s, "bobbin_kit", 1, "equipment", "recovery"); disableVehicle(s, v.id);
  s.player.controlledVehicleId = v.id; s.player.mode = "piloting"; s.player.pose = structuredClone(v.pose);
  const before = structuredClone(s); panel.refresh("inventory", s); assert.deepEqual(s, before);
  assert.ok(html().indexOf('class="recovery-choices"') < html().indexOf('id="container-diver"'));
  const recover = controls().filter((b) => b.command.type === "recover");
  assert.equal(recover.find((b) => b.command.type === "recover" && b.command.method === "repair")!.disabled, false);
  assert.ok(recover.filter((b) => b.command.type === "recover" && b.command.method !== "repair").every((b) => b.disabled));
  assert.match(html(), /the Dart is occupied/); assert.match(html(), /2 alloy \+ 1 membrane · rescue stock/);
  assert.match(html(), /No repair or recharge/); assert.match(html(), /Empty the hull, hold and module sockets first/);
  s.player.controlledVehicleId = null; s.player.mode = "swimming";
  s.world.maintenance.alloy = 0;
  addItem(s, "meal", 1, v.cargoId); panel.refresh("inventory", s);
  assert.match(html(), /Not enough rescue stock for a patch/);
  assert.match(html(), /transfer all cargo before salvaging/);
});

test("one trim tradeoff keeps socket costs and exact fitting/removal prerequisites without duplicate speeds", (t) => {
  const { panel, html, controls } = panelFixture(t);
  const s = workshop(), v = addDart(s);
  s.knowledge.crafted.push("dart_acoustic_trim");
  const trim = addItem(s, "dart_acoustic_trim", 1, "diver");
  panel.refresh("inventory", s);
  assert.equal((html().match(/Quiet 3 → 4.2/g) ?? []).length, 1);
  assert.doesNotMatch(html(), /Now: quiet|normal 8|Faster quiet travel/);
  assert.match(html(), /1 socket · 2 CU/);
  const fit = controls().find((b) => b.command.type === "install-module")!;
  assert.equal(fit.disabled, false);
  let out = executeCommand(s, fit.command, createWorldQueries());
  panel.refresh("inventory", out.state);
  assert.equal(controls().find((b) => b.command.type === "remove-module")!.disabled, false);
  out.state.player.controlledVehicleId = v.id; out.state.player.mode = "piloting"; out.state.player.pose = structuredClone(v.pose);
  panel.refresh("inventory", out.state);
  assert.equal(controls().find((b) => b.command.type === "remove-module")!.disabled, true);
  assert.match(html(), /Leave the hull to change its modules/);
  assert.ok(out.state.fleet.vehicles[0]!.modules.includes(trim.id));
});

test("live ownership wins the presentation group while the original first refusal stays visible; cradle status is truthful", (t) => {
  const { panel, recipe, groupOf, controls } = panelFixture(t);
  const s = workshop(), v = addDart(s);
  const cases: { change: () => void; expected: RegExp }[] = [
    { change: () => {}, expected: /Dart owned — in cradle/ },
    { change: () => { s.player.controlledVehicleId = v.id; s.player.mode = "piloting"; s.player.pose = structuredClone(v.pose); }, expected: /Dart owned — piloting/ },
    { change: () => { s.player.controlledVehicleId = null; s.player.mode = "walking"; s.player.pose.position = { x: 11, y: 1.2, z: -35 }; v.disabled = true; }, expected: /Dart owned — disabled/ },
    { change: () => { v.disabled = false; v.velocity.x = .2; }, expected: /Dart owned — [NSEW]/ },
    { change: () => { v.velocity.x = 0; v.pose.position.x += 1.5; }, expected: /Dart owned — [NSEW]/ },
    { change: () => { v.pose.position = { ...DART_BUILD_POSE }; s.world.facilities.find((f) => f.id === "island_workshop")!.repaired = false; }, expected: /Dart owned — [NSEW]/ },
  ];
  for (const c of cases) {
    c.change(); panel.refresh("craft", s);
    assert.equal(groupOf("dart_base"), "current"); assert.match(recipe("dart_base"), c.expected);
    assert.ok(recipe("dart_base").includes(craftingRefusal(s, "dart_base", createWorldQueries())!));
    assert.equal(controls().find((b) => b.command.type === "craft" && b.command.recipeId === "dart_base")!.disabled, true);
  }
});

test("paid live Dart salvage removes Current craft and crafted history still allows a second paid build", (t) => {
  const world = createWorldQueries(); const { panel, groupOf, controls } = panelFixture(t, world);
  let s = workshop();
  for (const [kind, q] of Object.entries(RECIPES.dart_base.cost)) addItem(s, kind as ItemKind, q, "workshop_locker");
  panel.refresh("craft", s); assert.equal(groupOf("dart_base"), "ready");
  const build = controls().find((b) => b.command.type === "craft" && b.command.recipeId === "dart_base")!;
  assert.equal(build.disabled, false); assert.match(build.attrs, /class="primary"/);
  s = executeCommand(s, build.command, world).state;
  assert.equal(usedCapacity(s, "workshop_locker"), 0);
  const v = s.fleet.vehicles.find((v) => v.hull === "dart")!;
  addItem(s, "bobbin_kit", 1, "equipment", "recovery");
  disableVehicle(s, v.id); s.player.pose.position = { x: 23, y: -1.6, z: -22 }; s.player.mode = "swimming";
  const buoy = addItem(s, "salvage_buoy", 1, "equipment", "buoy");
  s.inventory.buoy.itemId = buoy.id;
  s.inventory.buoy.deployed = true; s.inventory.buoy.position = { ...s.player.pose.position };
  s = executeCommand(s, { type: "recover", vehicleId: v.id, method: "salvage" }, world).state;
  assert.equal(s.fleet.vehicles.length, 0); assert.ok(s.knowledge.crafted.includes("dart_base"));
  s.player.pose.position = { x: 11, y: 1.2, z: -35 }; s.player.mode = "walking";
  s.inventory.buoy.position = { ...s.player.pose.position };
  panel.refresh("craft", s); assert.equal(groupOf("dart_base"), "ready");
  assert.ok(usedCapacity(s, "buoy_hold") > 0);
  s = executeCommand(s, build.command, world).state;
  assert.equal(s.fleet.vehicles.filter((v) => v.hull === "dart").length, 1);
  assert.equal(usedCapacity(s, "buoy_hold"), 0);
});

test("M2 preparation presents the paid in-place personal refit beside the unchanged chosen hull and exact local costs", (t) => {
  const { panel, html, controls, recipe } = panelFixture(t), s = workshop(), v = addDart(s);
  panel.refresh("craft", s);
  const refit = () => controls().find(b => b.command.type === "craft" && b.command.recipeId === "suit_350")!;
  assert.equal(refit().disabled, true); assert.match(refit().attrs, /aria-describedby/);
  const fitted = addItem(s, "suit_150", 1, "equipment", "suit"), identity = fitted.id;
  for (const [kind, quantity] of Object.entries(RECIPES.suit_350.cost)) addItem(s, kind as ItemKind, quantity, "workshop_locker");
  const before = structuredClone(s); panel.refresh("craft", s);
  assert.match(html(), /Suit 150 m · Dart hull 180 m/);
  assert.match(recipe("suit_350"), /Paid in-place refit · fitted suit 150 → 350 m/);
  assert.match(recipe("suit_350"), /Dart hull stays 180 m/);
  // C4 (CB): the 350 m refit's frontier material is one tagged frame from the 150 m rim.
  assert.match(recipe("suit_350"), /Tagged structural frame: 1 \/ 1/);
  assert.match(recipe("suit_350"), /Conductive crust: 4 \/ 4/);
  // C4 (M2 audit #3): the restored stop of the refit's tier also does it.
  // HUB-2: the crown station's bench also runs the refit once its dock stage is restored.
  assert.match(recipe("suit_350"), /Splitspine workshop bench or the outer-crown mooring, Crown station · restored/);
  assert.equal(refit().disabled, false); assert.equal(refit().label, "Refit");
  assert.match(refit().attrs, /aria-label="Suit refit · 350 m"/);
  assert.deepEqual(s, before);
  const result = executeCommand(s, refit().command, createWorldQueries());
  assert.equal(result.events.some(e => e.type === "notice" && e.error), false);
  assert.equal(result.state.inventory.items.find(i => i.id === identity)?.kind, "suit_350");
  assert.equal(result.state.inventory.items.filter(i => i.fitted === "suit").length, 1);
  panel.refresh("craft", result.state);
  assert.match(html(), /Suit 350 m · Dart hull 180 m/);
  assert.equal(result.state.fleet.vehicles[0]!.id, v.id);
  assert.ok(!controls().some(b => b.command.type === "craft" && b.command.recipeId === "suit_350"));
});

test("M2 notebook preserves C06-first provenance, observation and inference, showing future plans as knowledge", (t) => {
  const { panel, html, commands } = panelFixture(t), s = createGame(); completeOpening(s); discover(s, "C06");
  const recorded = structuredClone(s.knowledge.evidence), before = structuredClone(s);
  panel.refresh("notebook", s);
  assert.match(html(), /What changed the water\?/, "the story's question opens from the C06 record alone");
  assert.match(html(), /data-status="supported"><span class="status-chip">Supported<\/span> Dense water spread before the machines failed/);
  assert.match(html(), /D−12 profile; D0 \+00:35 trace and fractured slope/);
  assert.match(html(), /<b>Observed<\/b>.*Profiles dated/);
  assert.match(html(), /<b>Hypothesis<\/b>.*do not establish the extraction history/);
  assert.match(html(), /Cool-flank personal pressure research beyond 350 m/);
  assert.match(html(), /Research knowledge · construction not available yet/);
  assert.doesNotMatch(html(), /id="finding-C04"|id="finding-C05"/);
  assert.ok(!commands().some(c => c.type === "craft"));
  assert.deepEqual(s, before);
  discover(s, "C05"); discover(s, "C04"); panel.refresh("notebook", s);
  assert.deepEqual(s.knowledge.evidence[0], recorded[0], "later context cannot rewrite the early finding");
  assert.match(html(), /Where did everyone go\?/);
  assert.match(html(), /data-status="established"><span class="status-chip">Established<\/span> Dense water spread/, "the corroborated reading settles");
  assert.match(html(), /Read again<\/b> · The fauna read the dense water before the instruments did/, "C04 is reread in the light of C06");
  assert.match(html(), /Creel workboat/);
  assert.match(html(), /Carrier Basin frame and anchorage survey/);
  assert.doesNotMatch(html(), /Basin.*(?:not yet open|future expedition|later expedition)/);
});

test("M2 learned habitats occur once in the notebook, while recovered local materials and services lead the return", (t) => {
  const { panel, html, controls } = panelFixture(t), s = workshop(), v = addDart(s);
  s.knowledge.scans.push("canopy_grounding_fins_upper", "canopy_resin_lee_upper");
  addItem(s, "structural_alloy", 8, v.cargoId); addItem(s, "conductive_crust", 4, v.cargoId);
  panel.refresh("notebook", s);
  assert.equal(html().split(SOURCES.canopy_grounding_fins_upper.context).length - 1, 1);
  assert.match(html(), /data-panel-group="scan:canopy_grounding_fins_upper"/);
  assert.doesNotMatch(html(), /basin_ridge_salvage_north|basin_survey_fins_east/, "unknown sources gain no exact pins or records");
  panel.refresh("inventory", s);
  assert.match(html(), /Local materials · 8 Structural alloy · 4 Conductive crust/);
  assert.ok(html().indexOf('class="bulk-storage"') < html().indexOf('id="container-diver"'));
  assert.ok(controls().some(b => b.command.type === "store-materials" && b.disabled), "the default empty diver source is retained");
  panel.selectStorage("storage-from", v.cargoId); panel.refresh("inventory", s);
  assert.ok(controls().some(b => b.command.type === "store-materials" && !b.disabled));
  v.charge = 40; panel.refresh("inventory", s);
  assert.ok(controls().some(b => b.command.type === "service" && b.disabled), "bench cargo access cannot grant remote hull service");
  s.player.mode = "piloting"; s.player.controlledVehicleId = v.id; s.player.pose = structuredClone(v.pose);
  panel.refresh("inventory", s);
  assert.ok(controls().some(b => b.command.type === "service" && !b.disabled));
});

test("both rescue work faces expose one visited Basin target with actual local eligibility and retained route identity", (t) => {
  const { panel, html, controls } = panelFixture(t), s = workshop(), v = addDart(s);
  addItem(s, "bobbin_kit", 1, "equipment", "recovery", "maintenance");
  v.pose.position = { x: 178, y: -160, z: -208 }; disableVehicle(s, v.id);
  for (const y of [-0.5, -12]) {
    s.player.mode = "swimming"; s.player.pose.position = { x: 46, y, z: -54 };
    const before = structuredClone(s); panel.refresh("inventory", s);
    const recovery = controls().filter(b => b.command.type === "recover");
    assert.equal(recovery.length, 3, "one target, not one registry per work face");
    assert.equal(recovery.find(b => b.command.type === "recover" && b.command.method === "tow")!.disabled, false);
    assert.equal(recovery.find(b => b.command.type === "recover" && b.command.method === "repair")!.disabled, true);
    assert.equal(recovery.find(b => b.command.type === "recover" && b.command.method === "salvage")!.disabled, true);
    assert.match(html(), /Pale Basin · surveyed overhead lift and shallow return · 650 m tether limit/);
    assert.match(html(), /same station/); assert.match(html(), /Only the surface work face has surface air/);
    assert.ok(html().indexOf('id="vessel-menu-dart"') < html().indexOf('id="container-diver"'));
    assert.deepEqual(s, before);
  }
  const tow = controls().find(b => b.command.type === "recover" && b.command.method === "tow")!;
  const active = executeCommand(s, tow.command, createWorldQueries()).state;
  assert.equal(active.recovery.operation?.routeId, "basin");
  active.fleet.vehicles[0]!.pose.position = { x: 100, y: -4, z: -170 };
  panel.refresh("inventory", active);
  assert.match(html(), /Pale Basin overhead lift/);
  assert.doesNotMatch(html(), /Upper-Canopy corridor only/);
});

test("recovery names where an unknown Bobbin plan comes from; known habitats distinguish living sheds from finite stock", (t) => {
  const { panel, html } = panelFixture(t);
  const s = workshop(); const v = addDart(s); disableVehicle(s, v.id);
  s.player.pose.position = { x: 0, y: 0.18, z: 21.2 };
  panel.refresh("inventory", s);
  assert.match(html(), /Requires Bobbin kit · plans at the reef intake/, "C03/C04 without C02 has no Bobbin plan");
  assert.doesNotMatch(html(), /fabricate at the pod/);
  discover(s, "C02");
  panel.refresh("inventory", s);
  assert.match(html(), /Requires Bobbin kit · fabricate at the pod/);
  s.knowledge.scans.push("reef_ribbon_catch_north", "canopy_resin_lee_lower", "island_resin_cove_east", "reef_edible_school_north");
  s.world.resources.find((n) => n.id === "canopy_resin_lee_lower")!.reserve = 0;
  s.world.resources.find((n) => n.id === "island_resin_cove_east")!.reserve = 0;
  panel.refresh("notebook", s);
  const source = (label: string) => html().split(label)[0]!.split("<section ").at(-1)! + html().split(label)[1]!.split("</small>")[0]!;
  const north = source(SOURCES.reef_ribbon_catch_north.label), lower = source(SOURCES.canopy_resin_lee_lower.label);
  const drift = source(SOURCES.island_resin_cove_east.label), food = source(SOURCES.reef_edible_school_north.label);
  assert.match(north, /data-lifecycle="renewing"/); assert.match(north, /12 ready · 12 in reserve · 4 per gather · Living shed · regrows to 12 ready$/);
  assert.match(lower, /data-lifecycle="renewing"/); assert.match(lower, /0 in reserve · 2 per gather · Living shed · regrows to 12 ready$/);
  assert.match(drift, /data-lifecycle="finite"/); assert.match(drift, /Finite · no reserve left$/);
  assert.match(food, /data-lifecycle="tended"/); assert.match(food, /Tended · when empty, tend 20 s for two more$/);
  assert.equal(html().match(/sort a reserve/gi)?.length, 1, "the shared sorting rule is stated once, not per source");
  assert.doesNotMatch(html(), /\d+:\d\d|seconds? (?:left|remaining)|minutes?/i, "no regrowth countdown clutter");
});

test("the fabricator lists only known plans; Basin plans add exactly the earned Creel rows, and carrier plans stay research", (t) => {
  const { panel, html } = panelFixture(t);
  const s = createGame(); completeOpening(s);
  panel.refresh("craft", s);
  const listed = () => [...html().matchAll(/data-recipe="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(new Set(listed()), new Set(["pod_repair", "essential_tools", "suit_150", "reserve_cells"]));
  for (const id of ["C05", "C06"] as const) discover(s, id);
  panel.refresh("craft", s);
  // M2-B1: C05 pays off as the Creel, its two mounts and frame stripping; C06 as the Creel 350 refit.
  // S9: the carrier survey and the cool-flank research also list their campaign rows.
  const campaign = Object.keys(CAMPAIGN_RECIPES).filter((id) => s.knowledge.blueprints.includes(RECIPES[id as RecipeId].bp));
  assert.deepEqual(campaign.sort(), ["creel_450", "hearthline_550", "hearthline_keel", "heat_shroud", "hull_heat_lining",
    "restore_rift_station", "suit_450"]);
  // C4: the same plans carry the SYS-1 upgrades drawn on them.
  const c4 = Object.keys({ ...UPGRADE_RECIPES, ...UPGRADE_REFIT_RECIPES, ...HOST_KNOWLEDGE_RECIPES })
    .filter((id) => s.knowledge.blueprints.includes(RECIPES[id as RecipeId].bp));
  // SIG-1: the Creel service plans also carry its cutting arm, grapple and cargo pod.
  assert.deepEqual(c4.sort(), ["cell_bank_2", "creel_cutting_arm", "creel_drop_pod", "creel_grapple", "creel_service_head", "dart_450",
    "drive_tuning_2", "floodlights_2", "hush_450", "plating_ceramic", "thermal_exchanger"]);
  assert.deepEqual(new Set(listed()), new Set(["pod_repair", "essential_tools", "suit_150", "reserve_cells",
    "creel_base", "creel_cargo_rack", "creel_cabin", "strip_frame", "creel_350", ...campaign, ...c4,
    // HUB-2: the crown station's stages ride on the Creel and Rift plans.
    "restore_crown_power", "restore_crown_survey"]), "Basin clues add the earned workboat rows");
  panel.refresh("notebook", s);
  assert.match(html(), /Plans retained <small>2<\/small>/);
  assert.match(html(), /Research knowledge · construction not available yet\./);
});

test("the first fabrication shows the next useful row with one reason; detail and prerequisite work collapse", (t) => {
  const { panel, html, recipe, groupOf, controls } = panelFixture(t);
  const s = UI_SCENARIOS["opening-fabrication"](), before = structuredClone(s);
  panel.refresh("craft", s);
  assert.equal(groupOf("pod_repair"), "blocked");
  for (const id of ["essential_tools", "suit_150", "reserve_cells"]) assert.equal(groupOf(id), "locked-recipes", id);
  assert.ok(!html().includes('data-panel-group="locked-recipes" open'), "locked work starts collapsed");
  assert.equal(html().match(/class="action-reason"/g)?.length, 4, "one reason per row");
  assert.match(recipe("pod_repair"), /action-reason[^>]*>At Home pod · [NSEW]+ · \d+ m</);
  assert.ok(!/data-panel-group="recipe:[^"]*" open/.test(html()), "sources and preparation sit behind selection");
  assert.match(recipe("pod_repair"), /Silica glass: 0 \/ 1.*Silica glass: \+2 carried/);
  assert.doesNotMatch(html(), /Required bench|Have here \/ needed<\/p>|Material sources/, "no repeated bench guidance");
  const repair = controls().find((b) => b.command.type === "craft" && b.command.recipeId === "pod_repair")!;
  assert.equal(repair.label, "Repair"); assert.match(repair.attrs, /aria-label="Repair pod regulator &amp; bench"/);
  assert.match(repair.attrs, /aria-describedby=/);
  assert.deepEqual(s, before);
});

test("cabin and mooring lockers keep their own names; an unknown mooring stays off the map; mount rows are compact", (t) => {
  const { panel, html, controls } = panelFixture(t);
  const cabin = UI_SCENARIOS["creel-cabin"]();
  panel.refresh("inventory", cabin);
  assert.match(html(), /<option value="[^"]*_locker"[^>]*>Cabin locker · \d+ \/ 16 CU/);
  assert.doesNotMatch(html(), /Visited cargo cache/, "no cache exists in this state");
  assert.match(html(), /<h3>Cabin · powered · your refuge<\/h3>/);
  assert.ok(controls().some((b) => b.command.type === "cabin" && b.command.action === "hatch" && b.label === "Leave by hatch"));
  const early = UI_SCENARIOS["opening-fabrication"]();
  panel.refresh("inventory", early);
  assert.doesNotMatch(html(), /Mooring locker/, "the dark mooring is unknown at the start");
  early.knowledge.markers.push("canopy_stop"); panel.refresh("inventory", early);
  assert.match(html(), /<b>Mooring locker<\/b> · 0 \/ 48 CU · Out of reach/);
  const slip = UI_SCENARIOS["creel-slip"]();
  panel.refresh("inventory", slip);
  assert.doesNotMatch(html(), /Unfitted packages stow|Meals, cells, tools and modules stay/, "no helper copy on routine rows");
  const unfit = controls().find((b) => b.command.type === "remove-module")!;
  assert.equal(unfit.label, "Unfit · hold 64 CU"); assert.match(unfit.attrs, /aria-label="Unfit cargo rack into the Creel hold · hold 64 CU"/);
  const swap = controls().find((b) => b.command.type === "install-module")!;
  assert.equal(swap.label, "Swap · hold 40 CU"); assert.equal(swap.disabled, true); assert.match(swap.attrs, /aria-describedby=/);
});

test("the notebook keeps every record whole but opens only the newest; reference blocks collapse; extensions slot in by anchor", (t) => {
  const { panel, html } = panelFixture(t);
  const s = UI_SCENARIOS["notebook-late"](), latest = s.knowledge.evidence.at(-1)!.id;
  panel.addSection("notebook", { id: "interpretations", after: "interpretation", render: (_, kit) => kit.group("pairs", "Interpretations", "<p>Paired reading</p>") });
  panel.addSection("notebook", { id: "tail", after: "no-such-anchor", render: () => "<p>Appended</p>" });
  panel.refresh("notebook", s);
  for (const e of s.knowledge.evidence) {
    assert.match(html(), new RegExp(`id="finding-${e.id}"[^>]*data-panel-group="notebook:finding:${e.id}"${e.id === latest ? " open" : ">"}`), e.id);
    assert.match(html().split(`id="finding-${e.id}"`)[1]!.split("</details>")[0]!, /Source ·.*Observed.*(?:Hypothesis|Read again)/);
  }
  for (const group of ["places", "habitats", "dive-preparation", "retained-plans", "return-recovery"])
    assert.ok(!html().includes(`data-panel-group="${group}" open`), group);
  assert.doesNotMatch(html(), /Personal field notes add context/);
  assert.ok(html().indexOf('data-section="interpretations"') > html().indexOf('data-section="story-questions"'));
  assert.ok(html().indexOf('data-section="interpretations"') < html().indexOf('id="finding-'));
  assert.match(html(), /data-panel-group="notebook:pairs"/, "extension disclosures are namespaced by panel");
  // C4: the notebook is the journal's first tab; its extensions still close it.
  assert.ok(html().trimEnd().endsWith('<section class="panel-extension" data-section="tail"><p>Appended</p></section></div>'));
});

test("only the newest record opens across later finds and reloads; a record the player opened stays open", (t) => {
  const { panel, get, html } = panelFixture(t);
  const s = UI_SCENARIOS["opening-fabrication"]();
  const open = () => [...html().matchAll(/data-panel-group="notebook:finding:(C\d\d)" open/g)].map((m) => m[1]);
  panel.refresh("notebook", s); assert.deepEqual(open(), ["C01"]);
  panel.refresh("inventory", s); discover(s, "C02");
  panel.refresh("notebook", s); assert.deepEqual(open(), ["C02"], "the earlier automatic choice is not sticky");
  panel.refresh("craft", s); discover(s, "C03");
  panel.refresh("notebook", s); assert.deepEqual(open(), ["C03"]);
  get("panel-content").groups.find((g) => g.dataset.panelGroup === "notebook:finding:C01")!.open = true;
  panel.refresh("notebook", s); discover(s, "C04"); panel.refresh("notebook", s);
  assert.deepEqual(open(), ["C01", "C04"], "explicit intent survives; the newest still opens");
  get("panel-content").groups.find((g) => g.dataset.panelGroup === "notebook:finding:C04")!.open = false;
  panel.refresh("notebook", s); assert.deepEqual(open(), ["C01"], "closing the newest is also intent");
  panel.resetSession(); panel.refresh("notebook", structuredClone(s));
  assert.deepEqual(open(), ["C04"], "a reload starts from the default: newest only");
});

test("C3: later campaign rows fold under Later, and refit rows name their real tiers", (t) => {
  const { panel, html } = panelFixture(t);
  const s = createGame(); completeOpening(s);
  for (const id of ["C05", "C06"] as const) discover(s, id);
  panel.refresh("craft", s);
  const later = html().match(/<details[^>]*>\s*<summary[^>]*>Later <small>(\d+)<\/small>/);
  assert.ok(later && Number(later[1]) > 0, "a closed Later fold holds the unready campaign rows");
  const laterSection = html().slice(html().indexOf("Later <small>"));
  assert.match(laterSection, /data-recipe="suit_450"/);
  assert.match(html(), /fitted suit 350 → 450 m/);
  assert.match(html(), /Creel 350 → 450 m/);
  assert.doesNotMatch(html(), /150 → 350 m[^<]*450/);
});
