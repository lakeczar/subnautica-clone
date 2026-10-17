import test from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { GameView, type UiActions } from "../src/ui/view.js";
import { createGame, makeVehicle } from "../src/sim/state.js";
import { completeOpening, discover } from "../src/sim/progression.js";
import { incapacitate } from "../src/sim/recovery.js";
import { addItem, available } from "../src/sim/inventory.js";
import { executeCommand } from "../src/sim/step.js";
import { createWorldQueries } from "../src/sim/world.js";
import type { GameCommand } from "../src/sim/types.js";

/** Minimal DOM port for rendered buttons, replacement and command wiring. Native
 * keyboard/layout behavior is checked separately in the production browser. */
function viewFixture(t: test.TestContext) {
  const document = { activeElement: null as ElementPort | null };
  const decodeHtml = (value: string): string => value.replace(/&(amp|lt|gt|quot|#39);/g,
    (entity) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" })[entity]!);
  class ElementPort {
    private html = "";
    private buttons: ElementPort[] = [];
    get innerHTML() { return this.html; }
    set innerHTML(value: string) {
      if (this.buttons.includes(document.activeElement!)) document.activeElement = null;
      this.html = value;
      this.buttons = [...value.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gs)].map((match) => {
        const button = new ElementPort();
        button.textContent = decodeHtml(match[2]!.replace(/<[^>]*>/g, ""));
        button.disabled = /\sdisabled(?:\s|=|$)/.test(match[1]!);
        for (const [, name, text] of match[1]!.matchAll(/\bdata-([\w-]+)="([^"]*)"/g))
          button.dataset[name!.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())] = decodeHtml(text!);
        return button;
      });
    }
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
    contains(element: unknown) { return element === this || this.buttons.includes(element as ElementPort); }
    querySelectorAll(selector: string) { return this.buttons.filter((button) => !selector.includes(":not([disabled])") || !button.disabled); }
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
  // Inspect commands through the production click listener, not private maps or
  // focus-key attributes. Dispatch is captured; only each test executes it.
  const commandFor = (target: ElementPort | null): GameCommand | undefined => {
    const count = commands.length;
    if (target) root.emit("click", { target });
    return commands.splice(count)[0];
  };
  return {
    view, commands, audio, get: (id: string) => root.querySelector(`#${id}`),
    active: () => document.activeElement,
    activeCommand: () => commandFor(document.activeElement),
    commandButton: (command: GameCommand) => {
      const matches = root.querySelector("#panel-content").querySelectorAll("button:not([disabled])")
        .filter((button) => isDeepStrictEqual(commandFor(button), command));
      assert.equal(matches.length, 1, `expected one control for ${JSON.stringify(command)}`);
      return matches[0]!;
    },
    click: (label: string) => {
      const button = root.querySelector("#panel-content").querySelectorAll("button:not([disabled])")
        .find((candidate) => candidate.textContent === label);
      assert.ok(button, `missing command button ${label}`);
      root.emit("click", { target: button });
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
  click("Fabricate · Repair pod regulator & bench");
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

test("panel focus repeats the same partial transfer across duplicate labels and changing command positions", (t) => {
  const { view, get, commandButton, active, activeCommand } = viewFixture(t);
  const world = createWorldQueries();
  let s = createGame(); completeOpening(s);
  addItem(s, "meal", 3, "pod_locker");
  const glass = addItem(s, "silica_glass", 3, "pod_locker");
  const intended: GameCommand = { type: "transfer", itemId: glass.id, to: "diver", quantity: 1 };
  view.openPanel("inventory", s);
  const original = commandButton(intended);
  original.focus();
  for (const remaining of [2, 1, 0]) {
    const command = activeCommand();
    assert.deepEqual(command, intended, "activation must keep the original item, destination and quantity");
    s = executeCommand(s, command!, world).state;
    view.refreshPanel(s);
    assert.equal(available(s, "silica_glass", ["pod_locker"]), remaining);
    assert.equal(available(s, "meal", ["pod_locker"]), 3, "equal-label meal controls must never be activated");
    if (remaining) {
      assert.deepEqual(activeCommand(), intended);
      assert.notEqual(active()?.dataset.action, original.dataset.action, "render order changed after new diver cargo appeared");
    }
  }
  assert.equal(available(s, "silica_glass", ["diver"]), 3);
  assert.equal(active(), get("panel-return"), "the last item removes the original destination action");
  assert.equal(activeCommand(), undefined, "Return must not dispatch another cargo command");
});

test("a completed all-items transfer focuses Return while an equal-label transfer still exists", (t) => {
  const { view, get, commandButton, active, activeCommand } = viewFixture(t);
  let s = createGame(); completeOpening(s);
  const meal = addItem(s, "meal", 3, "pod_locker");
  const glass = addItem(s, "silica_glass", 3, "pod_locker");
  const command: GameCommand = { type: "transfer", itemId: glass.id, to: "diver", quantity: 3 };
  view.openPanel("inventory", s);
  commandButton(command).focus();
  s = executeCommand(s, command, createWorldQueries()).state;
  view.refreshPanel(s);
  assert.equal(commandButton({ ...command, itemId: meal.id }).textContent, "Take to diver · 3");
  assert.equal(active(), get("panel-return"));
  assert.equal(activeCommand(), undefined);
  assert.equal(available(s, "meal", ["pod_locker"]), 3);
});

test("refusal refresh preserves the refused item action without selecting equal-label cargo", (t) => {
  const { view, get, commandButton, activeCommand } = viewFixture(t);
  const s = createGame(); completeOpening(s);
  addItem(s, "meal", 16, "diver");
  addItem(s, "meal", 3, "pod_locker");
  const glass = addItem(s, "silica_glass", 3, "pod_locker");
  const command: GameCommand = { type: "transfer", itemId: glass.id, to: "diver", quantity: 1 };
  const before = structuredClone(s);
  view.openPanel("inventory", s);
  commandButton(command).focus();
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.deepEqual(activeCommand(), command);
    const result = executeCommand(s, command, createWorldQueries());
    const refusal = result.events.find((event) => event.type === "notice" && event.error);
    assert.ok(refusal?.type === "notice");
    assert.equal(refusal.message, "The destination is full. Nothing moved.");
    view.notify(refusal.message, true);
    view.refreshPanel(result.state);
    assert.deepEqual(activeCommand(), command);
    assert.equal(get("panel-feedback").textContent, refusal.message);
    assert.deepEqual(result.state, before);
  }
});

test("same-label service controls retain their vessel through refresh and reordering", (t) => {
  const { view, get, commandButton, active, activeCommand } = viewFixture(t);
  let s = createGame(); completeOpening(s);
  for (const id of ["first-dart", "second-dart"]) {
    const v = makeVehicle(id, "dart", { x: 0, y: 0.5, z: 18 }, `${id}-hold`);
    v.charge = 25;
    s.fleet.vehicles.push(v);
    s.inventory.containers.push({ id: v.cargoId, kind: "vehicle", ownerId: v.id, capacity: 32 });
  }
  const command: GameCommand = { type: "service", vehicleId: "second-dart" };
  view.openPanel("inventory", s);
  assert.equal(commandButton(command).textContent, commandButton({ type: "service", vehicleId: "first-dart" }).textContent);
  commandButton(command).focus();
  s = executeCommand(s, command, createWorldQueries()).state;
  view.refreshPanel(s);
  assert.deepEqual(activeCommand(), command);
  assert.equal(s.fleet.vehicles.find((v) => v.id === "first-dart")?.charge, 25);
  assert.equal(s.fleet.vehicles.find((v) => v.id === "second-dart")?.charge, 100);
  s.fleet.vehicles.reverse();
  view.refreshPanel(s);
  assert.deepEqual(activeCommand(), command, "vessel order must not define focus identity");
  s.fleet.vehicles = s.fleet.vehicles.filter((v) => v.id !== "second-dart");
  view.refreshPanel(s);
  assert.equal(active(), get("panel-return"), "a removed vessel must not redirect service to another hull");
  assert.equal(activeCommand(), undefined);
});

test("inaccessible transfers and newly disabled controls deliberately return focus to Return", (t) => {
  const { view, get, commandButton, active } = viewFixture(t);
  const s = createGame(); completeOpening(s);
  const glass = addItem(s, "silica_glass", 2, "pod_locker");
  view.openPanel("inventory", s);
  commandButton({ type: "transfer", itemId: glass.id, to: "diver", quantity: 1 }).focus();
  s.player.pose.position = { x: 10, y: 2, z: -35 };
  view.refreshPanel(s);
  assert.equal(active(), get("panel-return"));
  const buoy = addItem(s, "salvage_buoy", 1, "diver");
  s.inventory.buoy.itemId = buoy.id;
  view.refreshPanel(s);
  commandButton({ type: "buoy" }).focus();
  s.inventory.items = s.inventory.items.filter((i) => i.id !== buoy.id);
  view.refreshPanel(s);
  assert.equal(active(), get("panel-return"), "a matching disabled control cannot retain focus");
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

test("reopened Hold and Notebook retain saved recovery explanations without reviving unrelated feedback", (t) => {
  const { view, get } = viewFixture(t);
  const s = createGame(); completeOpening(s);
  for (const message of [
    "Bobbin reached the exterior collar. Confirm local tow to attach; no hull has moved.",
    "Tow clearance blocked. Dart and cargo remain at this visited site. Approach locally for in-place repair or salvage.",
    "Dart moored at the shallow rescue bench, with its original cargo, damage and charge. Apply a bound field patch and reserve cell locally.",
  ]) {
    s.feedback = message;
    view.notify(message);
    view.closePanel();
    for (const panel of ["inventory", "notebook"] as const) {
      view.openPanel(panel, JSON.parse(JSON.stringify(s)));
      assert.ok(get("panel-content").innerHTML.includes(message), `${panel}: ${message}`);
      view.refreshPanel(s);
      assert.ok(get("panel-content").innerHTML.includes(message));
      view.closePanel();
    }
  }
  s.feedback = "Transferred 1 × Prepared reef meal to Diver hold.";
  view.notify(s.feedback);
  view.openPanel("inventory", s);
  assert.equal(get("panel-feedback").hidden, true);
  assert.ok(!get("panel-content").innerHTML.includes(s.feedback));
  assert.ok(!get("panel-content").innerHTML.includes("Last recovery report"));
});
