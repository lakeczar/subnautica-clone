import test from "node:test";
import assert from "node:assert/strict";
import { PanelView } from "../src/ui/panels.js";
import { RECIPES, type ItemKind } from "../src/content/registry.js";
import { addItem, available, fabricationContainers, materialStoragePreview } from "../src/sim/inventory.js";
import { completeOpening, craftingRefusal, discover } from "../src/sim/progression.js";
import { createGame, makeVehicle } from "../src/sim/state.js";
import { executeCommand } from "../src/sim/step.js";
import { createWorldQueries } from "../src/sim/world.js";
import type { GameCommand, GameState, WorldQueries } from "../src/sim/types.js";

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
  const commands = (): GameCommand[] => [...html().matchAll(/data-action="([^"]*)"/g)].map((m) => panel.command(m[1]!)!);
  const recipe = (id: string) => html().split(`data-recipe="${id}"`)[1]!.split("</article>")[0]!;
  const groupOf = (id: string) => {
    const before = html().slice(0, html().indexOf(`data-recipe="${id}"`));
    return [...before.matchAll(/data-recipe-group="([^"]*)"|data-panel-group="(completed-recipes)"/g)].at(-1)?.slice(1).find(Boolean);
  };
  return { panel, get, html, commands, recipe, groupOf };
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
  assert.equal(groupOf("dart_base"), "blocked");
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
  assert.match(recipe("dart_acoustic_trim"), /Conductive crust: 9 \/ 2.*\(\+5 elsewhere, unavailable here\)/);
  assert.ok(!recipe("dart_acoustic_trim").includes("+2 carried"), "carried stock already usable is not added twice");
  s.player.mode = "piloting"; s.player.controlledVehicleId = v.id; s.player.pose = structuredClone(v.pose);
  panel.refresh("craft", s);
  assert.match(recipe("dart_acoustic_trim"), /Conductive crust: 0 \/ 2.*\(\+2 carried, unavailable here\).*\(\+12 elsewhere, unavailable here\)/);
  assert.match(recipe("dart_acoustic_trim"), /away from this bench/);
});

test("prerequisites are named and a site refusal with short stock stays blocked; restoration remains findable", (t) => {
  const { panel, html, recipe, groupOf } = panelFixture(t);
  const s = createGame(); completeOpening(s); discover(s, "C03");
  s.player.pose.position = { x: 10, y: 2, z: -35 };
  addItem(s, "structural_alloy", 8, "workshop_locker");
  panel.refresh("craft", s);
  assert.equal(groupOf("dart_base"), "blocked");
  assert.match(recipe("dart_base"), /Needs: Restore workshop services.*Fit 150 m pressure suit/);
  assert.match(recipe("restore_workshop"), /Structural alloy: 0 \/ 3/);
  assert.match(html(), /repair needed; locker locked/);
  assert.match(recipe("restore_workshop"), /repair available before restoration/);
  assert.ok(!html().includes('data-recipe="dart_acoustic_trim"'), "unknown blueprints remain filtered");
  s.knowledge.crafted.push("pod_repair");
  panel.refresh("craft", s);
  assert.equal(groupOf("essential_tools"), "blocked", "wrong site wins even when materials are also missing");
  assert.match(html(), /Required bench.*Home pod/);
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
      assert.match(text, /Full-tank rating 180 s/); assert.ok(!text.includes("Recovered research:"));
      assert.match(text, /Source ·.*Observed.*Hypothesis.*Regional lead/s);
      assert.match(text, /future construction opportunity; no campaign carrier is available here yet/);
    }
  }
});
