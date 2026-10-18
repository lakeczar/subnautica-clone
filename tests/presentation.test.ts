import test from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { GameView, type UiActions } from "../src/ui/view.js";
import { createGame, makeVehicle } from "../src/sim/state.js";
import { completeOpening, discover } from "../src/sim/progression.js";
import { incapacitate, RECOVERY_NOTICES } from "../src/sim/recovery.js";
import { addItem, available, materialStoragePreview } from "../src/sim/inventory.js";
import { cellRechargePreview, distractionPreview } from "../src/sim/vehicles.js";
import { dartPerformance } from "../src/sim/modules.js";
import { executeCommand } from "../src/sim/step.js";
import { createWorldQueries } from "../src/sim/world.js";
import { aimedInteraction } from "../src/sim/targeting.js";
import { faceTarget, NORMAL_VIEWS, readyState } from "./targeting-support.js";
import type { GameCommand } from "../src/sim/types.js";
import { ExpeditionSession } from "../src/runtime/session.js";
import { SaveRepository } from "../src/save/repository.js";
import { MemoryStorage, TestWriterLock, encoded, sample, settled } from "./persistence-support.js";

/** Minimal DOM port for rendered buttons, replacement and command wiring. Native
 * keyboard/layout behavior is checked separately in the production browser. */
function viewFixture(t: test.TestContext) {
  const document = { activeElement: null as ElementPort | null };
  const decodeHtml = (value: string): string => value.replace(/&(amp|lt|gt|quot|#39);/g,
    (entity) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" })[entity]!);
  class ElementPort {
    private html = "";
    private buttons: ElementPort[] = [];
    children: ElementPort[] = [];
    get innerHTML() { return this.html; }
    set innerHTML(value: string) {
      if (this.buttons.includes(document.activeElement!)) document.activeElement = null;
      this.html = value;
      this.buttons = [...value.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gs)].map((match) => {
        const button = new ElementPort();
        button.tagName = "BUTTON";
        button.textContent = decodeHtml(match[2]!.replace(/<[^>]*>/g, ""));
        button.disabled = /\sdisabled(?:\s|=|$)/.test(match[1]!);
        button.hidden = /\shidden(?:\s|=|$)/.test(match[1]!);
        for (const [, name, text] of match[1]!.matchAll(/\bdata-([\w-]+)="([^"]*)"/g))
          button.dataset[name!.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())] = decodeHtml(text!);
        return button;
      });
    }
    textContent = "";
    tagName = "DIV";
    hidden = false;
    disabled = false;
    checked = false;
    value = "";
    valueAsNumber = 0;
    dataset: Record<string, string> = {};
    classList = { toggle() {}, add() {}, remove() {} };
    scrollIntoView() {}
    private listeners = new Map<string, ((e: Event) => void)[]>();
    addEventListener(type: string, listener: (e: Event) => void) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }
    emit(type: string, value: unknown) { for (const listener of this.listeners.get(type) ?? []) listener(value as Event); }
    setAttribute() {}
    contains(element: unknown): boolean { return element === this || this.buttons.includes(element as ElementPort) || this.children.some((child) => child.contains(element)); }
    querySelectorAll(selector: string): ElementPort[] {
      const candidates = [...this.buttons, ...this.children.flatMap((child) => [child, ...child.querySelectorAll(selector)])];
      return candidates.filter((element) =>
        (selector.includes(",") ? ["BUTTON", "SELECT", "INPUT", "TEXTAREA", "A", "SUMMARY"].includes(element.tagName) : element.tagName === "BUTTON") &&
        (!selector.includes(":not([disabled])") || !element.disabled));
    }
    getClientRects() { return this.hidden ? [] : [{}]; }
    focus() { document.activeElement = this; }
    closest() { return this; }
  }
  const elements = new Map<string, ElementPort>();
  const root = Object.assign(new ElementPort(), {
    querySelector: (selector: string) => {
      let element = elements.get(selector);
      if (!element) {
        element = new ElementPort();
        const tag = root.innerHTML.match(new RegExp(`<[^>]*\\bid="${selector.slice(1)}"[^>]*>`))?.[0] ?? "";
        element.tagName = tag.match(/^<(\w+)/)?.[1]?.toUpperCase() ?? "DIV";
        element.hidden = /\bhidden\b/.test(tag);
        const action = tag.match(/data-action="([^"]*)"/)?.[1];
        if (action) element.dataset.action = action;
        elements.set(selector, element);
      }
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
  root.querySelector("#opening").children = ["opening-act", "opening-skip", "opening-subtitles"].map((id) => root.querySelector(`#${id}`));
  root.querySelector("#game-panel").children = [root.querySelector("#panel-return"),
    ...root.querySelectorAll("button").filter((button) => ["inventory-panel", "craft-panel", "notebook-panel", "carrier-panel"].includes(button.dataset.action!)),
    root.querySelector("#panel-title"), root.querySelector("#panel-content")];
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
    activate: (id: string) => root.emit("click", { target: root.querySelector(`#${id}`) }),
    key: (key: string, code = key, shiftKey = false) => {
      const event = { key, code, shiftKey, prevented: false, stopped: false,
        preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
      root.emit("keydown", event);
      return event;
    },
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

for (const panel of ["inventory", "craft", "notebook", "carrier"] as const) {
  test(`${panel} wraps Tab both ways, including non-control panel focus, and consumes only its wrap`, (t) => {
    const { view, get, key, active } = viewFixture(t), s = readyState();
    view.update(s, false); view.showGame(); view.openPanel(panel, s);
    const first = get("panel-return");
    const last = get("game-panel").querySelectorAll("button:not([disabled])").filter((control) => !control.hidden).at(-1)!;
    assert.notEqual(last, first);
    assert.equal(active(), first, "initial panel focus remains Return");
    assert.equal(key("Tab").prevented, false, "interior traversal belongs to the browser");
    for (const origin of [first, get("panel-title"), get("ocean")]) {
      origin.focus();
      const event = key("Tab", "Tab", true);
      assert.equal(active(), last, "reverse wrap reaches the last visible control");
      assert.equal(event.prevented && event.stopped, true, "runtime cannot reinterpret a handled wrap");
    }
    for (const origin of [last, get("panel-title"), get("ocean")]) {
      origin.focus();
      const event = key("Tab");
      assert.equal(active(), first, "forward wrap reaches Return");
      assert.equal(event.prevented && event.stopped, true);
    }
    assert.equal(view.currentPanel, panel);
    assert.equal(get("game-panel").hidden, false);
  });
}

test("menu settings retain native interior Tab and wrap at visible boundaries", (t) => {
  const { view, get, key, active } = viewFixture(t);
  // Supply the existing settings controls' hierarchy; this port does not parse layout.
  get("menu").children = [get("resume"), get("quality"), get("subtitles")];
  view.showMenu(true);
  get("quality").focus();
  assert.equal(key("Tab").prevented, false);
  assert.equal(key("Tab", "Tab", true).prevented, false);
  get("resume").focus();
  assert.equal(key("Tab", "Tab", true).stopped, true);
  assert.equal(active(), get("subtitles"));
  assert.equal(key("Tab").stopped, true);
  assert.equal(active(), get("resume"));
});

test("minimal prompt follows actual aimed actions across all real hosts, and is absent after looking away", (t) => {
  const { view, get } = viewFixture(t), world = createWorldQueries();
  const opening = readyState(); view.update(opening, false);
  assert.equal(get("interact-prompt").innerHTML, "", "known regulator to the side does not prompt at stand-up");
  for (const v of NORMAL_VIEWS) {
    const s = readyState(); s.player.pose.position = { ...v.position }; s.player.mode = v.mode; faceTarget(s, v.id);
    const before = structuredClone(s), target = aimedInteraction(s, world)!;
    view.update(s, false);
    const prompt = get("interact-prompt").innerHTML;
    assert.ok(prompt.startsWith("<kbd>E</kbd> "), v.id);
    assert.ok(prompt.replace(/&amp;/g, "&").includes(target.label), v.id);
    assert.ok(!prompt.includes("Q scan"), "no scanner-less scan promise");
    const result = executeCommand(s, { type: "interact" }, world);
    assert.ok(!result.events.some(e => e.type === "notice" && e.error), v.id);
    assert.deepEqual(s, before, "presentation and target queries are pure");
    s.player.pose.yaw += Math.PI; view.update(s, false);
    const away = aimedInteraction(s, world);
    if (!away) assert.equal(get("interact-prompt").innerHTML, "", v.id + " looking away");
  }
});

test("minimal per-verb prompt names collect, gather, sort, tend, empty, review, read, services, board, recovery and cache actions", (t) => {
  const { view, get } = viewFixture(t);
  const render = (s: ReturnType<typeof readyState>, id: string): string => { faceTarget(s, id); view.update(s, false); return get("interact-prompt").innerHTML; };
  const s = readyState(); s.player.mode = "walking"; s.player.pose.position = { x: 8, y: 1.2, z: -32.5 };
  assert.match(render(s, "island_workshop_scraps"), /<small>Collect<\/small>/);
  addItem(s, "essential_tools", 1, "equipment", "tools");
  assert.match(render(s, "island_workshop_scraps"), /Collect · Q scan/);
  const n = s.world.resources.find(n => n.id === "island_workshop_scraps")!; n.stock = 0;
  assert.match(render(s, n.id), /Sort · 20 s/); n.reserve = 0;
  assert.match(render(s, n.id), /Empty/); assert.ok(!get("interact-prompt").innerHTML.includes("<kbd>E</kbd>"));
  s.player.pose.position = { x: 13, y: 1.2, z: -32.5 };
  assert.match(render(s, "island_shore_crop_east"), /Gather/);
  s.world.resources.find(n => n.id === "island_shore_crop_east")!.stock = 0;
  assert.match(render(s, "island_shore_crop_east"), /Tend · 20 s/);
  s.player.pose.position = { x: 10, y: 1.2, z: -36.3 };
  assert.match(render(s, "C03"), /Inspect/); discover(s, "C03"); assert.match(render(s, "C03"), /Notebook/);
  assert.match(render(s, "workshop_services"), /Use/);
  s.player.mode = "swimming"; s.player.pose.position = { x: -24, y: -8, z: -6.5 };
  assert.match(render(s, "mara_reef_note"), /Read/);
  s.player.pose.position = { x: 60, y: -20, z: -30 };
  const v = makeVehicle("prompt-dart", "dart", { x: 60, y: -20, z: -32 }, "dart_hold"); s.fleet.vehicles.push(v);
  assert.match(render(s, v.id), /Dart <small>Board/); v.disabled = true;
  assert.match(render(s, v.id), /Dart · disabled <small>Recover/);
  s.fleet.vehicles = []; s.recovery.caches.push({ id: "prompt-cache", position: { x: 60, y: -20, z: -32 }, containerId: "cache_hold" });
  addItem(s, "structural_alloy", 1, "cache_hold"); assert.match(render(s, "prompt-cache"), /Identified cargo cache <small>Open/);
});

test("recipe quantities use the same supported-cradle inputs as fabrication, without optimistic mutation", (t) => {
  const { view, get, click, commands } = viewFixture(t);
  const s = createGame(); completeOpening(s);
  addItem(s, "structural_alloy", 2, "pod_locker");
  addItem(s, "silica_glass", 1, "diver");
  const v = makeVehicle("test-dart", "dart", { x: 0, y: -1, z: 8 }, "test-hold");
  s.fleet.vehicles.push(v);
  s.inventory.containers.push({ id: v.cargoId, kind: "vehicle", ownerId: v.id, capacity: 32 });
  addItem(s, "flex_membrane", 4, v.cargoId);
  s.world.facilities.find((f) => f.id === "pod_fabricator")!.repaired = true;
  const snapshot = structuredClone(s);
  view.openPanel("craft", s);
  let recipe = get("panel-content").innerHTML.split('data-recipe="pod_repair"')[1]!.split("</article>")[0]!;
  assert.match(recipe, /Structural alloy: 2 \/ 2/);
  assert.match(recipe, /Flexible membrane: 4 \/ 2/);
  assert.match(recipe, /Local sources:.*Dart hold.*supported-cradle cargo/);
  click("Fabricate · Repair pod regulator & bench");
  assert.deepEqual(commands, [{ type: "craft", recipeId: "pod_repair" }]);
  assert.deepEqual(s, snapshot, "view never consumes or moves ingredients");
  s.player.pose.position = { x: 10, y: 2, z: -35 };
  view.refreshPanel(s);
  recipe = get("panel-content").innerHTML.split('data-recipe="pod_repair"')[1]!.split("</article>")[0]!;
  assert.match(recipe, /Structural alloy: 0 \/ 2/, "remote pod locker must not count as a reachable ingredient");
});

test("pulse presentation follows the paying cell, excludes remote charge, and never offers an active pulse", (t) => {
  const { view, get, commandButton } = viewFixture(t);
  const s = createGame(); completeOpening(s);
  addItem(s, "essential_tools", 1, "equipment", "tools");
  const remote = addItem(s, "reserve_cell", 1, "pod_locker");
  const carried = addItem(s, "reserve_cell", 1, "diver"); carried.charge = 30;
  s.player.pose.position = { x: 80, y: -48, z: -89 };
  const preview = distractionPreview(s); assert.equal(preview.cellId, carried.id);
  const before = structuredClone(s);
  view.openPanel("inventory", s);
  assert.match(get("panel-content").innerHTML, new RegExp(`Next payment: ${carried.id}.*30 → 5%`));
  assert.ok(!get("panel-content").innerHTML.includes(`Next payment: ${remote.id}`));
  assert.deepEqual(s, before);
  commandButton({ type: "distraction" });
  carried.charge = 24; view.refreshPanel(s);
  assert.match(get("panel-content").innerHTML, /one reserve cell in your hold or the controlled craft/);
  assert.ok(get("panel-content").innerHTML.includes('disabled>Release pulse'));
  carried.charge = 100; s.world.threat.distractionSeconds = 10; view.refreshPanel(s);
  assert.match(get("panel-content").innerHTML, /already active.*10 seconds remain/);
  assert.ok(get("panel-content").innerHTML.includes('disabled>Release pulse'));
});

test("bench cell recharge is an explicit pre-vessel command, separate from hull service", (t) => {
  const { view, get, commandButton, active } = viewFixture(t);
  let s = createGame(); completeOpening(s);
  s.world.facilities.find((f) => f.id === "pod_fabricator")!.repaired = true;
  const cell = addItem(s, "reserve_cell", 1, "pod_locker"); cell.charge = 50;
  assert.deepEqual(cellRechargePreview(s).cellIds, [cell.id]);
  view.openPanel("craft", s);
  const html = get("panel-content").innerHTML;
  assert.match(html, /Bench cell recharge/);
  assert.match(html, /Cells only\. Hull battery, health and emergency air require supported service/);
  commandButton({ type: "recharge-cells" }).focus();
  s = executeCommand(s, { type: "recharge-cells" }, createWorldQueries()).state;
  view.refreshPanel(s);
  assert.equal(s.inventory.items.find((i) => i.id === cell.id)?.charge, 100);
  assert.equal(s.fleet.vehicles.length, 0);
  assert.equal(active(), get("panel-return"), "a now-disabled action falls back to Return");
});

test("bulk storage shows the shared whole-stack set and preserves operands and focus on refusal", (t) => {
  const { view, get, commandButton, activeCommand, active } = viewFixture(t);
  let s = createGame(); completeOpening(s);
  addItem(s, "structural_alloy", 2, "diver");
  addItem(s, "silica_glass", 3, "diver");
  const meal = addItem(s, "meal", 1, "diver"), cell = addItem(s, "reserve_cell", 1, "diver");
  s.inventory.containers.find((c) => c.id === "pod_locker")!.capacity = 6;
  const command: GameCommand = { type: "store-materials", from: "diver", to: "pod_locker" };
  const p = materialStoragePreview(s, command.from, command.to);
  view.openPanel("inventory", s);
  assert.match(get("panel-content").innerHTML, /2 × Structural alloy<br \/>3 × Silica glass.*7 CU · whole stacks/);
  assert.ok(get("panel-content").innerHTML.includes(p.refusal!));
  const before = structuredClone(s);
  commandButton(command).focus();
  let result = executeCommand(s, command, createWorldQueries());
  assert.deepEqual(result.state, before);
  const notice = result.events.find((e) => e.type === "notice"); assert.ok(notice?.type === "notice");
  view.notify(notice.message, true); view.refreshPanel(result.state);
  assert.deepEqual(activeCommand(), command);
  assert.equal(get("panel-feedback").textContent, p.refusal);
  s.inventory.containers.find((c) => c.id === "pod_locker")!.capacity = 80;
  result = executeCommand(s, command, createWorldQueries()); s = result.state;
  view.refreshPanel(s);
  assert.deepEqual(activeCommand(), command, "empty selected source does not silently select another source");
  assert.equal(s.inventory.items.find((i) => i.id === meal.id)?.containerId, "diver");
  assert.equal(s.inventory.items.find((i) => i.id === cell.id)?.containerId, "diver");
  s.player.pose.position = { x: 80, y: -48, z: -89 }; view.refreshPanel(s);
  assert.equal(active(), get("panel-return"));
});

test("trim UI distinguishes stored from installed, uses actual occupancy, and exposes safe local removal", (t) => {
  const { view, get, commandButton, active } = viewFixture(t);
  let s = createGame(); completeOpening(s); discover(s, "C04");
  s.world.facilities.find((f) => f.id === "pod_fabricator")!.repaired = true;
  s.knowledge.crafted.push("dart_acoustic_trim");
  const item = addItem(s, "dart_acoustic_trim", 1, "diver");
  const v = makeVehicle("refit-dart", "dart", { x: 0, y: -1, z: 8 }, "refit-hold");
  s.fleet.vehicles.push(v);
  s.inventory.containers.push({ id: v.cargoId, kind: "vehicle", ownerId: v.id, capacity: 32 });
  view.openPanel("inventory", s);
  assert.match(get("panel-content").innerHTML, /Dart acoustic trim · fabricated \/ stored/);
  assert.match(get("panel-content").innerHTML, /Quiet 3 → 4\.2 m\/s · normal 8 → 8 · boost 11 → 9/);
  assert.match(get("panel-content").innerHTML, /0 \/ 2 sockets · 0 \/ 32 CU hold/);
  const install: GameCommand = { type: "install-module", vehicleId: v.id, itemId: item.id };
  commandButton(install).focus(); s = executeCommand(s, install, createWorldQueries()).state;
  view.refreshPanel(s);
  assert.equal(active(), get("panel-return"));
  assert.match(get("panel-content").innerHTML, /1 \/ 2 sockets · 2 \/ 32 CU hold/);
  assert.match(get("panel-content").innerHTML, /Now: quiet 4\.2 · normal 8 · boost 9 m\/s · trim occupies 2 CU/);
  assert.equal(dartPerformance(s, v.id)?.acousticTrim, true);
  assert.ok(!get("panel-content").querySelectorAll("button").some((b) => {
    const c = b.dataset.commandKey ? JSON.parse(b.dataset.commandKey) as GameCommand : null;
    return c?.type === "transfer" && c.itemId === item.id;
  }), "installed items offer removal rather than a direct transfer control");
  const transferred = executeCommand(s, { type: "transfer", itemId: item.id, to: "diver", quantity: 1 }, createWorldQueries());
  assert.deepEqual(transferred.state, s);
  assert.ok(transferred.events.some((e) => e.type === "notice" && e.error && e.message.includes("Remove this installed module")));
  const owned = s.fleet.vehicles[0]!;
  owned.pose.position = { x: 80, y: -48, z: -89 }; owned.disabled = true;
  s.player.pose.position = { x: 80, y: -47, z: -89 }; s.player.mode = "swimming";
  addItem(s, "essential_tools", 1, "equipment", "tools"); addItem(s, "bobbin_kit", 1, "equipment", "recovery");
  view.refreshPanel(s);
  assert.match(get("panel-content").innerHTML, /Eligible local collar removal.*before frame salvage/);
  const remove: GameCommand = { type: "remove-module", vehicleId: owned.id, itemId: item.id };
  commandButton(remove); s = executeCommand(s, remove, createWorldQueries()).state;
  assert.equal(s.fleet.vehicles[0]!.modules.length, 0);
  assert.equal(s.inventory.items.find((i) => i.id === item.id)?.containerId, owned.cargoId);
});

test("completed receipts label current reference prices honestly and a locked workshop cannot fund itself", (t) => {
  const { view, get } = viewFixture(t);
  const s = createGame(); completeOpening(s); discover(s, "C03");
  s.knowledge.crafted.push("essential_tools");
  s.player.pose.position = { x: 10, y: 2, z: -35 };
  addItem(s, "structural_alloy", 8, "workshop_locker");
  view.openPanel("craft", s);
  const html = get("panel-content").innerHTML;
  const completed = html.split('data-recipe="essential_tools"')[1]!.split("</article>")[0]!;
  assert.match(completed, /completed.*Current recipe reference/s);
  assert.ok(!completed.includes("used") && !completed.includes("installed"));
  const repair = html.split('data-recipe="restore_workshop"')[1]!.split("</article>")[0]!;
  assert.match(repair, /Structural alloy: 0 \/ 3/);
  assert.ok(!repair.includes("Local sources: Diver hold · Workshop locker"));
  assert.match(html, /unrestored workshop locker stays locked.*carried materials or a nearby deployed buoy/);
});

test("saved recovery wording stays intact while its displayed next step names rescue stock", (t) => {
  const { view, get } = viewFixture(t);
  const s = createGame(); completeOpening(s); s.feedback = RECOVERY_NOTICES.completed;
  const before = structuredClone(s);
  view.openPanel("inventory", s); view.notify(s.feedback);
  assert.match(get("panel-content").innerHTML, /Last recovery report.*Apply a rescue patch/s);
  assert.match(get("notification").textContent, /Cargo, damage and charge are unchanged/);
  assert.deepEqual(s, before, "display conversion never rewrites the compatibility notice in a save");
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

test("four opening actions and skip preserve command identity, keyboard access and a visible safety layer", (t) => {
  const { view, get, activate, commands, active, key, audio } = viewFixture(t);
  let s = createGame();
  view.update(s, false); view.showGame();
  assert.equal(key("Tab").stopped, true, "Tab reaches opening controls before the runtime inventory shortcut");
  assert.equal(active(), get("opening-act"));
  key("Tab"); assert.equal(active(), get("opening-skip"));
  key("Tab"); assert.equal(active(), get("opening-subtitles"));
  assert.equal(key(" ", "Space").stopped, true, "focused captions may toggle without skipping");
  get("opening-subtitles").checked = false;
  get("opening-subtitles").emit("change", {});
  assert.equal(audio.at(-1)?.subtitles, false);
  view.audioSettings({ volume: 0.4, muted: false, subtitles: false });
  assert.equal(get("subtitles").checked, false);
  assert.equal(get("opening-caption").hidden, true);
  key("Tab"); assert.equal(active(), get("hud-pause"));
  for (let phase = 0; phase < 4; phase++) {
    assert.equal(s.opening.phase, phase);
    assert.equal(get("opening").hidden, false);
    for (const id of ["hud-region", "hud-heading", "hud-tools", "vitals", "hud-bottom", "interact-prompt"])
      assert.equal(get(id).hidden, true, id);
    assert.equal(get("hud-pause").hidden, false);
    assert.equal(get("hazard").hidden, false);
    get("opening-act").focus(); activate("opening-act");
    assert.deepEqual(commands.at(-1), { type: "interact" });
    s = executeCommand(s, commands.at(-1)!, createWorldQueries()).state;
    view.update(s, false);
  }
  assert.equal(s.opening.phase, 4);
  assert.equal(get("opening").hidden, true);
  assert.equal(get("vitals").hidden, false);
  assert.equal(active(), get("ocean"), "finishing cannot leave focus inside a hidden opening");
  s = createGame(); view.update(s, false);
  get("opening-skip").focus(); activate("opening-skip");
  assert.deepEqual(commands.at(-1), { type: "skip-opening" });
  s = executeCommand(s, commands.at(-1)!, createWorldQueries()).state;
  view.update(s, false);
  assert.equal(s.opening.phase, 4);
  assert.equal(active(), get("ocean"));
});

test("actual session entry order omits only the redundant New success, without leaking it into imports or Continue", async (t) => {
  const { view, get } = viewFixture(t);
  const storage = new MemoryStorage(), repository = new SaveRepository(storage, new TestWriterLock());
  const session = new ExpeditionSession(repository, {
    changed: () => {
      view.slot(repository.status, session.state !== null);
      view.persistence(session.persistenceMessage, session.autoSaveAllowed, session.state !== null, session.busy);
    },
    pause: () => view.showMenu(session.state !== null),
    entered: () => { view.update(session.state!, false); view.showGame(); },
    notify: (message, error) => view.notify(message, error),
  });
  t.after(() => session.dispose());
  session.newGame(); await settled();
  assert.equal(session.state?.opening.phase, 0);
  assert.equal(get("notification").hidden, true, "New notifies after entered/update; its success is redundant");
  view.notify("Could not save this expedition.", true);
  const redundant = "Expedition saved. The island shore and reef ribs are yours to explore.";
  view.notify(redundant);
  assert.equal(get("notification").textContent, "Could not save this expedition.", "omitting routine success cannot replace an error");
  view.notify(redundant, true);
  assert.equal(get("notification").textContent, redundant, "the error flag takes precedence even for identical text");
  const imported = sample(); imported.state.opening.phase = 2;
  const text = encoded(imported);
  await session.importFile({ size: text.length, text: async () => text });
  session.confirm(); await settled();
  assert.equal(session.state?.opening.phase, 2);
  assert.equal(get("notification").textContent, "Imported and saved locally.");
  session.newGame(); session.confirm(); await settled();
  session.state = executeCommand(session.state!, { type: "skip-opening" }, createWorldQueries()).state;
  view.update(session.state, false);
  assert.notEqual(get("notification").textContent, redundant, "finishing a replacement opening must not revive deferred text");
  session.dispose();
  const continued = new ExpeditionSession(new SaveRepository(storage, new TestWriterLock()), {
    changed: () => {}, pause: () => {},
    entered: () => view.update(continued.state!, false),
    notify: (message, error) => view.notify(message, error),
  });
  t.after(() => continued.dispose());
  continued.continueGame();
  assert.equal(continued.state?.opening.phase, 0);
  assert.notEqual(get("notification").textContent, redundant);
});

test("storage-off sessions, errors and graphics recovery remain visible through opening and pause", async (t) => {
  const { view, get } = viewFixture(t);
  const storage = new MemoryStorage(); storage.failWrite = true;
  const session = new ExpeditionSession(new SaveRepository(storage, new TestWriterLock()), {
    changed: () => view.persistence(session.persistenceMessage, session.autoSaveAllowed, session.state !== null, session.busy),
    pause: () => view.showMenu(session.state !== null),
    entered: () => { view.update(session.state!, false); view.showGame(); },
    notify: (message, error) => view.notify(message, error),
  });
  t.after(() => session.dispose());
  session.newGame(); await settled(); session.confirm();
  assert.equal(get("opening").hidden, false);
  assert.equal(get("session-warning").hidden, false);
  assert.equal(get("notification").hidden, false);
  assert.match(get("notification").textContent, /Session only/);
  view.showMenu(true);
  assert.equal(get("session-warning").hidden, false, "the reminder must not inherit the hidden HUD");
  view.showGame();
  const s = session.state!;
  s.player.vitals.health = 10;
  view.update(s, false);
  assert.match(get("hazard").innerHTML, /LOW HEALTH/);
  view.notify("Graphics restored. Resume when ready.");
  assert.equal(get("notification").hidden, false);
  view.graphicsError("Graphics context unavailable.");
  assert.equal(get("graphics-error").hidden, false);
  assert.equal(get("session-warning").hidden, false);
});

test("moving pilot guidance stays secondary, explains stopped and blocked exits, and retains emergencies and E behavior", (t) => {
  const { view, get } = viewFixture(t);
  const s = createGame(); completeOpening(s);
  const v = makeVehicle("pilot-dart", "dart", { x: 80, y: -48, z: -89 }, "pilot-hold");
  s.fleet.vehicles.push(v);
  s.player.mode = "piloting"; s.player.controlledVehicleId = v.id;
  s.player.pose = structuredClone(v.pose); v.velocity.z = 5;
  view.update(s, false);
  assert.equal(get("interact-prompt").innerHTML, "", "routine exit text does not occupy the interaction centre");
  assert.equal(get("pilot-guidance").hidden, false);
  assert.ok(!get("pilot-guidance").innerHTML.includes("<small>"));
  assert.match(get("pilot-guidance").innerHTML, /E.*Hold to exit/);
  const exited = executeCommand(s, { type: "interact" }, createWorldQueries()).state;
  assert.equal(exited.player.controlledVehicleId, null, "moving guidance does not change the actual E exit command");
  v.velocity.z = 0; view.update(s, false);
  assert.match(get("pilot-guidance").innerHTML, /Suit 60 m · hull 180 m/);
  v.pose.position.y = -170; s.player.pose.position.y = -170;
  v.charge = 10; v.health = 20;
  view.update(s, false);
  assert.match(get("pilot-guidance").innerHTML, /Exit blocked.*Exit exposure.*personal suit/);
  assert.match(get("hazard").innerHTML, /HULL DEPTH/);
  assert.match(get("hazard").innerHTML, /LOW POWER/);
  assert.match(get("hazard").innerHTML, /LOW HULL/);
  v.disabled = true; v.charge = 0; v.emergencyAir = 0; s.player.vitals.oxygen = 10;
  view.update(s, false);
  assert.match(get("hazard").innerHTML, /HULL DISABLED.*emergency air 0 s/);
  assert.match(get("hazard").innerHTML, /LOW OXYGEN/);
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
  assert.match(html, /Tow home · deploy Bobbin/);
  assert.deepEqual(s, snapshot);
  v.disabled = false;
  s.recovery.losses = [];
  view.refreshPanel(s);
  assert.ok(!get("panel-content").innerHTML.includes("Tow home · deploy Bobbin"), "repair actions are not presented as available for a healthy hull");
});

test("occupied Hold disables tow and salvage, explains conditional safe exit, and retains patch/reserve controls", (t) => {
  const { view, get, commandButton } = viewFixture(t);
  const s = createGame(); completeOpening(s);
  const v = makeVehicle("occupied-dart", "dart", { x: 80, y: -48, z: -89 }, "occupied-hold");
  v.disabled = true; v.health = 0; v.charge = 20;
  s.fleet.vehicles.push(v);
  s.inventory.containers.push({ id: v.cargoId, kind: "vehicle", ownerId: v.id, capacity: 32 });
  addItem(s, "reserve_cell", 1, v.cargoId);
  s.player.mode = "piloting";
  s.player.controlledVehicleId = v.id;
  s.player.pose = structuredClone(v.pose);
  for (const phase of [null, "ready"] as const) {
    s.recovery.operation = phase ? { vehicleId: v.id, method: "tow", phase, waypoint: 3, position: { ...v.pose.position } } : null;
    const before = structuredClone(s);
    view.openPanel("inventory", s);
    const buttons = get("panel-content").querySelectorAll("button");
    for (const label of [phase ? "Attach collar / confirm tow" : "Tow home · deploy Bobbin", "Salvage frame"]) {
      const control = buttons.find((b) => b.textContent === label);
      assert.ok(control);
      assert.equal(control.disabled, true, label);
    }
    assert.match(get("panel-content").innerHTML, /occupied.*exit.*safely.*exterior collar/i);
    assert.match(get("panel-content").innerHTML, /depth.*clearance/i);
    assert.match(get("panel-content").innerHTML, /patch/i);
    assert.equal(commandButton({ type: "recover", vehicleId: v.id, method: "repair" }).disabled, false);
    assert.equal(commandButton({ type: "reserve", vehicleId: v.id }).disabled, false);
    assert.equal(commandButton({ type: "service", vehicleId: v.id }).disabled, false);
    assert.match(get("panel-content").innerHTML, /Cells in diver \/ this craft: item_\d+ · 100%/);
    assert.deepEqual(s, before, "recovery presentation cannot mutate the occupied state");
  }
});

test("recovery focus falls back when occupation disables tow, retains patch identity, and allows controls after safe exit", (t) => {
  const { view, get, commandButton, active, activeCommand } = viewFixture(t);
  let s = createGame(); completeOpening(s);
  const v = makeVehicle("focus-dart", "dart", { x: 80, y: -48, z: -89 }, "focus-hold");
  v.disabled = true; v.health = 0;
  s.fleet.vehicles.push(v);
  s.inventory.containers.push({ id: v.cargoId, kind: "vehicle", ownerId: v.id, capacity: 32 });
  s.player.mode = "swimming";
  s.player.pose.position = { ...v.pose.position, x: v.pose.position.x + 3.1 };
  const tow: GameCommand = { type: "recover", vehicleId: v.id, method: "tow" };
  const patch: GameCommand = { type: "recover", vehicleId: v.id, method: "repair" };
  view.openPanel("inventory", s);
  commandButton(tow).focus();
  s.player.mode = "piloting";
  s.player.controlledVehicleId = v.id;
  s.player.pose = structuredClone(v.pose);
  view.refreshPanel(s);
  assert.equal(active(), get("panel-return"));
  commandButton(patch).focus();
  view.refreshPanel(s);
  assert.deepEqual(activeCommand(), patch);
  s = executeCommand(s, { type: "exit" }, createWorldQueries()).state;
  assert.equal(s.player.controlledVehicleId, null);
  view.refreshPanel(s);
  assert.deepEqual(activeCommand(), patch);
  assert.equal(commandButton(tow).disabled, false);
  assert.equal(commandButton({ type: "recover", vehicleId: v.id, method: "salvage" }).disabled, false);
});

test("recovery choices preview actual frame returns and capped rescue stock while refusals preserve their command", (t) => {
  const { view, get, commandButton, activeCommand, active } = viewFixture(t);
  let s = createGame(); completeOpening(s);
  const v = makeVehicle("return-dart", "dart", { x: 80, y: -48, z: -89 }, "return-hold");
  v.disabled = true; v.health = 0; v.boundRepairs = 2;
  v.investment = { structural_alloy: 3, silica_glass: 2 };
  s.fleet.vehicles.push(v);
  s.inventory.containers.push({ id: v.cargoId, kind: "vehicle", ownerId: v.id, capacity: 32 });
  s.player.mode = "swimming"; s.player.pose.position = { ...v.pose.position, x: 83.1 };
  s.world.maintenance.alloy = 13; s.world.maintenance.membrane = 6;
  view.openPanel("inventory", s);
  const salvage: GameCommand = { type: "recover", vehicleId: v.id, method: "salvage" };
  commandButton(salvage).focus();
  const before = structuredClone(s);
  const refused = executeCommand(s, activeCommand()!, createWorldQueries());
  assert.deepEqual(refused.state, before);
  const notice = refused.events.find((e) => e.type === "notice");
  assert.ok(notice?.type === "notice" && notice.error);
  view.notify(notice.message, notice.error); view.refreshPanel(refused.state);
  assert.deepEqual(activeCommand(), salvage);
  assert.equal(get("panel-feedback").textContent, notice.message);
  addItem(s, "bobbin_kit", 1, "equipment", "recovery", "maintenance");
  view.refreshPanel(s);
  const html = get("panel-content").innerHTML;
  assert.match(html, /Patch here/); assert.match(html, /Tow home/); assert.match(html, /Salvage frame/);
  assert.match(html, /3 Structural alloy \/ 2 Silica glass/);
  assert.match(html, /Past patches return 1 alloy \/ 1 membrane to rescue stock only/);
  assert.match(html, /230 m/); assert.match(html, /No repair or recharge/);
  v.investment = { structural_alloy: 6, silica_glass: 3, flex_membrane: 2 };
  view.refreshPanel(s);
  assert.match(get("panel-content").innerHTML, /Make 17 CU free in a deployed buoy within 6 m/);
  assert.ok(!get("panel-content").innerHTML.includes("Make 17 CU free in the diver hold"));
  v.investment = { structural_alloy: 3, silica_glass: 2 };
  s = executeCommand(s, activeCommand()!, createWorldQueries()).state;
  assert.equal(available(s, "structural_alloy", ["diver"]), 3);
  assert.equal(available(s, "silica_glass", ["diver"]), 2);
  assert.equal(s.world.maintenance.alloy, 14);
  assert.equal(s.world.maintenance.membrane, 7);
  view.refreshPanel(s);
  assert.equal(active(), get("panel-return"));
});

test("reopened Hold and Notebook retain saved recovery explanations without reviving unrelated feedback", (t) => {
  const { view, get } = viewFixture(t);
  const s = createGame(); completeOpening(s);
  for (const message of [
    "Bobbin reached the exterior collar. Confirm local tow to attach; no hull has moved.",
    "Tow clearance blocked. Dart and cargo remain at this visited site. Approach locally for in-place repair or salvage.",
    "Dart moored at the shallow rescue bench, with its original cargo, damage and charge. Apply a bound field patch and reserve cell locally.",
    "Bobbin recovery stopped: the Dart is occupied. Tow and salvage require an empty hull. Exit only when depth and clearance allow it safely, then approach the exterior collar; a bound field patch remains available if eligible.",
  ]) {
    s.feedback = message;
    view.notify(message);
    const displayed = get("notification").textContent;
    view.closePanel();
    for (const panel of ["inventory", "notebook"] as const) {
      view.openPanel(panel, JSON.parse(JSON.stringify(s)));
      assert.ok(get("panel-content").innerHTML.includes(displayed), `${panel}: ${message}`);
      view.refreshPanel(s);
      assert.ok(get("panel-content").innerHTML.includes(displayed));
      assert.equal(s.feedback, message, "the saved notice is never rewritten");
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


test("validated notebook focus only targets an existing finding, without discovering one", (t) => {
  const { view, get, active } = viewFixture(t), s = readyState();
  const before = structuredClone(s);
  view.openPanel("notebook", s, "C01");
  assert.equal(active(), get("finding-C01"));
  assert.match(get("panel-content").innerHTML, /id="finding-C01" tabindex="-1"/);
  view.openPanel("notebook", s, "C04");
  assert.equal(active(), get("panel-return"));
  assert.ok(!get("panel-content").innerHTML.includes('id="finding-C04"'));
  assert.deepEqual(s, before);
});

test("impact loss is coalesced once, cancellation clears it, and pitch/surface cues use real input", (t) => {
  const { view, get } = viewFixture(t), s = readyState();
  const v = makeVehicle("cue-dart", "dart", { x: 20, y: -0.9, z: 0 }, "cue-hold");
  s.fleet.vehicles.push(v); s.player.controlledVehicleId = v.id; s.player.mode = "piloting";
  s.player.pose = structuredClone(v.pose); s.player.pose.pitch = v.pose.pitch = 0.3;
  view.update(s, false);
  assert.equal(get("pitch-cue").hidden, false);
  assert.equal(get("surface-cue").hidden, true, "pitch alone is not forward thrust");
  view.update(s, false, 1); assert.equal(get("surface-cue").hidden, false);
  view.impact(0.25, s); view.impact(1.25, s);
  assert.equal(get("impact-notice").textContent, "Hull −1.5%");
  view.impact(0, s); assert.equal(get("impact-notice").textContent, "Hull −1.5%");
  view.cancelFeedback(); assert.equal(get("impact-notice").hidden, true);
  view.impact(0.2, s); assert.equal(get("impact-notice").textContent, "Hull −0.2%");
  view.resetPresentation(); assert.equal(get("impact-notice").hidden, true);
});
