import test from "node:test";
import assert from "node:assert/strict";
import { GameView, type UiActions } from "../src/ui/view.js";
import { createGame, makeVehicle } from "../src/sim/state.js";
import { completeOpening, discover } from "../src/sim/progression.js";
import { incapacitate } from "../src/sim/recovery.js";
import { addItem } from "../src/sim/inventory.js";
import { createWorldQueries } from "../src/sim/world.js";
import type { GameCommand } from "../src/sim/types.js";

/** Minimal DOM port for view output and command wiring. Browser layout/focus is
 * checked separately against the real production UI; this is not a DOM engine. */
function viewFixture(t: test.TestContext) {
  const document = { activeElement: null as ElementPort | null };
  class ElementPort {
    innerHTML = "";
    textContent = "";
    hidden = false;
    disabled = false;
    checked = false;
    value = "";
    valueAsNumber = 0;
    dataset: Record<string, string> = {};
    classList = { toggle() {} };
    private listeners = new Map<string, ((e: Event) => void)[]>();
    addEventListener(type: string, listener: (e: Event) => void) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }
    emit(type: string, value: unknown) { for (const listener of this.listeners.get(type) ?? []) listener(value as Event); }
    setAttribute() {}
    contains(element: unknown) { return element === this; }
    querySelectorAll() { return []; }
    focus() { document.activeElement = this; }
    closest() { return this; }
  }
  const elements = new Map<string, ElementPort>();
  const root = Object.assign(new ElementPort(), {
    querySelector: (selector: string) => {
      let element = elements.get(selector);
      if (!element) { element = new ElementPort(); elements.set(selector, element); }
      return element;
    },
    replaceChildren() {},
  });
  const globals = ["document", "window"] as const;
  const previous = globals.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { clearTimeout() {}, setTimeout: () => 1 } });
  const commands: GameCommand[] = [];
  const audio: Parameters<UiActions["audio"]>[0][] = [];
  const noop = () => {};
  const actions: UiActions = {
    command: (c) => commands.push(c), audio: (a) => audio.push(a),
    panel: noop, closePanel: noop, fixture: noop, newGame: noop,
    continueGame: noop, resume: noop, pause: noop, save: noop,
    exportGame: noop, exportBackup: noop, exportRaw: noop,
    importFile: noop, confirm: noop, cancelConfirm: noop, lockMouse: noop, settings: noop,
  };
  const view = new GameView(root as unknown as HTMLElement, actions, createWorldQueries());
  t.after(() => {
    view.dispose();
    globals.forEach((key, i) => previous[i] ? Object.defineProperty(globalThis, key, previous[i]!) : Reflect.deleteProperty(globalThis, key));
  });
  return {
    view, commands, audio, get: (id: string) => root.querySelector(`#${id}`),
    click: (label: string) => {
      const html = root.querySelector("#panel-content").innerHTML;
      const button = [...html.matchAll(/<button data-action="([^"]+)"[^>]*>([^<]+)<\/button>/g)].find((m) => m[2] === label);
      assert.ok(button, `missing command button ${label}`);
      const target = new ElementPort(); target.dataset.action = button[1]!;
      root.emit("click", { target });
    },
  };
}

test("recipe quantities count accessible bench inputs, exclude craft cargo, and dispatch without optimistic mutation", (t) => {
  const { view, get, click, commands } = viewFixture(t);
  const s = createGame(); completeOpening(s);
  addItem(s, "structural_alloy", 2, "pod_locker");
  addItem(s, "silica_glass", 1, "diver");
  const v = makeVehicle("test-dart", "dart", { x: 0, y: -1, z: 8 }, "test-hold");
  s.fleet.vehicles.push(v);
  s.inventory.containers.push({ id: v.cargoId, kind: "vehicle", ownerId: v.id, capacity: 32 });
  addItem(s, "flex_membrane", 4, v.cargoId);
  const snapshot = structuredClone(s);
  view.openPanel("craft", s);
  let recipe = get("panel-content").innerHTML.split('data-recipe="pod_repair"')[1]!.split("</article>")[0]!;
  assert.match(recipe, /Structural alloy: 2 \/ 2/);
  assert.match(recipe, /Flexible membrane: 0 \/ 2/);
  click("Fabricate · Repair pod regulator &amp; bench");
  assert.deepEqual(commands, [{ type: "craft", recipeId: "pod_repair" }]);
  assert.deepEqual(s, snapshot, "view never consumes or moves ingredients");
  s.player.pose.position = { x: 10, y: 2, z: -35 };
  view.refreshPanel(s);
  recipe = get("panel-content").innerHTML.split('data-recipe="pod_repair"')[1]!.split("</article>")[0]!;
  assert.match(recipe, /Structural alloy: 0 \/ 2/, "remote pod locker must not count as a reachable ingredient");
});

test("notebook retains both early orders and omits unknown sources and an uncollected optional record", (t) => {
  const { view, get } = viewFixture(t);
  for (const order of [["C02", "C03"], ["C03", "C02"]] as const) {
    const s = createGame(); completeOpening(s);
    for (const id of order) discover(s, id);
    const snapshot = structuredClone(s);
    view.openPanel("notebook", s);
    const html = get("panel-content").innerHTML;
    assert.ok(html.indexOf("Intake & living filters") < html.indexOf("Unspent departure supplies") === (order[0] === "C02"));
    for (const finding of s.knowledge.evidence) assert.ok(html.includes(finding.provenance));
    assert.ok(!html.includes("Mara Sen / field method"));
    assert.ok(!html.includes("Upper grounding fins"), "undiscovered source is not revealed by a regional lead");
    assert.deepEqual(s, snapshot);
  }
});

test("captions can be disabled without hiding simultaneous body, pressure and threat warnings or opening actions", (t) => {
  const { view, get } = viewFixture(t);
  const s = createGame();
  view.audioSettings({ volume: 0, muted: true, subtitles: false });
  view.update(s, false);
  assert.equal(get("opening-caption").hidden, true);
  assert.ok(get("opening-act").textContent.includes("Release restraint"));
  completeOpening(s);
  s.player.pose.position = { x: 120, y: -110, z: -100 };
  s.player.mode = "swimming";
  s.player.vitals.oxygen = 10;
  s.world.threat.mode = "pursue";
  view.update(s, false);
  const html = get("hazard").innerHTML;
  assert.match(html, /LOW OXYGEN/);
  assert.match(html, /PRESSURE/);
  assert.match(html, /SOUND HUNTER/);
  assert.ok(html.indexOf("LOW OXYGEN") < html.indexOf("SOUND HUNTER"));
});

test("inventory keeps one buoy identity, shows local transfer commands and retains validated refusal feedback", (t) => {
  const { view, get, click, commands } = viewFixture(t);
  const s = createGame(); completeOpening(s);
  const buoy = addItem(s, "salvage_buoy", 1, "diver");
  s.inventory.buoy.itemId = buoy.id;
  addItem(s, "meal", 2, "pod_locker");
  const snapshot = structuredClone(s);
  view.openPanel("inventory", s);
  assert.ok(!get("panel-content").innerHTML.includes("Deployed buoy ("), "a packed buoy is not a distant deployed container");
  click("Deploy carried buoy");
  click("Take to diver · 1");
  assert.deepEqual(commands[0], { type: "buoy" });
  assert.equal(commands[1]?.type, "transfer");
  assert.deepEqual(s, snapshot);
  view.notify("The destination is full. Nothing moved.", true);
  view.refreshPanel(s);
  assert.equal(get("panel-feedback").hidden, false);
  assert.equal(get("panel-feedback").textContent, "The destination is full. Nothing moved.");
  buoy.fitted = "buoy"; buoy.containerId = "equipment"; s.inventory.buoy.deployed = true;
  view.refreshPanel(s);
  assert.match(get("panel-content").innerHTML, /Pack empty buoy/);
  assert.equal(s.inventory.buoy.itemId, buoy.id);
});

test("recovery information follows visited caches and actual hull state without unlocking unknown refuges", (t) => {
  const { view, get } = viewFixture(t);
  const s = createGame(); completeOpening(s);
  const v = makeVehicle("lost-dart", "dart", { x: 100, y: -100, z: -100 }, "lost-hold");
  s.fleet.vehicles.push(v);
  s.inventory.containers.push({ id: v.cargoId, kind: "vehicle", ownerId: v.id, capacity: 32 });
  addItem(s, "meal", 2, "diver");
  s.player.controlledVehicleId = v.id;
  s.player.mode = "piloting";
  s.player.pose.position = { ...v.pose.position };
  incapacitate(s, "Diagnostic loss.");
  const snapshot = structuredClone(s);
  view.openPanel("inventory", s);
  const html = get("panel-content").innerHTML;
  assert.match(html, /Visited cargo cache/);
  assert.match(html, /2 Prepared reef meal/);
  assert.match(html, /Dart loss transponder/);
  assert.ok(!html.includes("Upper Canopy laboratory"), "a loss does not discover a refuge");
  assert.match(html, /Deploy Bobbin \/ local tow/);
  assert.deepEqual(s, snapshot);
  v.disabled = false;
  s.recovery.losses = [];
  view.refreshPanel(s);
  assert.ok(!get("panel-content").innerHTML.includes("Deploy Bobbin / local tow"), "repair actions are not presented as available for a healthy hull");
});
