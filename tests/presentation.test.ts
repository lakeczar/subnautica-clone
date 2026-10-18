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
import { LOCAL_SAVE_KEY, SaveRepository } from "../src/save/repository.js";
import { MemoryStorage, TestWriterLock, encoded, sample, settled } from "./persistence-support.js";

/** Minimal DOM port for rendered buttons, replacement and command wiring. Native
 * keyboard/layout behavior is checked separately in the production browser. */
function viewFixture(t: test.TestContext) {
  const document = { activeElement: null as ElementPort | null };
  const decodeHtml = (value: string): string => value.replace(/&(amp|lt|gt|quot|#39);/g,
    (entity) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" })[entity]!);
  class ElementPort {
    private html = "";
    private nodes: ElementPort[] = [];
    children: ElementPort[] = [];
    parentElement: ElementPort | null = null;
    id = "";
    classes = "";
    attrs: Record<string, string> = {};
    open = false;
    htmlWrites = 0;
    scrollTop = 0;
    get innerHTML() { return this.html; }
    set innerHTML(value: string) {
      this.htmlWrites++;
      if (this.contains(document.activeElement) && document.activeElement !== this) document.activeElement = null;
      this.html = value;
      this.nodes = [];
      // Parse the small rendered panel tree so closed native disclosures and
      // semantic outcome anchors participate in focus checks, not just buttons.
      const stack: ElementPort[] = [this];
      for (const token of value.matchAll(/<\/([a-z][\w-]*)\s*>|<([a-z][\w-]*)\b([^>]*)>|([^<]+)/gi)) {
        if (token[1]) {
          const at = stack.map(e => e.tagName).lastIndexOf(token[1]!.toUpperCase());
          if (at > 0) stack.length = at;
        } else if (token[2]) {
          const element = new ElementPort(), attrs = token[3]!;
          element.tagName = token[2]!.toUpperCase();
          element.parentElement = stack.at(-1)!;
          element.parentElement.nodes.push(element);
          for (const [, name, value] of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) element.attrs[name!] = decodeHtml(value ?? "");
          element.id = attrs.match(/\bid="([^"]*)"/)?.[1] ?? "";
          element.classes = attrs.match(/\bclass="([^"]*)"/)?.[1] ?? "";
          element.disabled = /\sdisabled(?:\s|=|$)/.test(attrs);
          element.hidden = /\shidden(?:\s|=|$)/.test(attrs);
          element.open = /\sopen(?:\s|=|$)/.test(attrs);
          for (const [, name, text] of attrs.matchAll(/\bdata-([\w-]+)="([^"]*)"/g))
            element.dataset[name!.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())] = decodeHtml(text!);
          if (!/^(INPUT|BR|HR|META|LINK|IMG)$/.test(element.tagName)) stack.push(element);
        } else if (token[4]) {
          for (const element of stack.slice(1)) element.text += decodeHtml(token[4]);
        }
      }
    }
    private text = "";
    textWrites = 0;
    get textContent() { return this.text; }
    set textContent(value: string) { this.text = value; this.textWrites++; }
    tagName = "DIV";
    hidden = false;
    layoutVisible = true;
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
    setAttribute(name: string, value: string) { this.attrs[name] = value; }
    contains(element: unknown): boolean { return element === this || [...this.nodes, ...this.children].some(child => child.contains(element)); }
    private matches(selector: string): boolean {
      if (selector.includes(",")) return selector.split(",").some(part => this.matches(part.trim()));
      if (selector.includes(" > ")) {
        const [parent, child] = selector.split(" > ");
        return this.matches(child!) && !!this.parentElement?.matches(parent!);
      }
      if (selector.includes(" ")) {
        const [ancestor, child] = selector.split(" ");
        return this.matches(child!) && !!this.parentElement?.closest(ancestor!);
      }
      for (const [, excluded] of selector.matchAll(/:not\(([^)]+)\)/g)) if (this.matches(excluded!)) return false;
      selector = selector.replace(/:not\([^)]+\)/g, "");
      for (const [, name, value] of selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
        if (name === "disabled" ? !this.disabled : !(name! in this.attrs)) return false;
        if (value !== undefined && this.attrs[name!] !== value) return false;
      }
      const tag = selector.match(/^[a-z]+/i)?.[0];
      const cls = selector.match(/\.([\w-]+)/)?.[1];
      const data = selector.match(/\[data-([\w-]+)\]/)?.[1];
      return (!tag || this.tagName === tag.toUpperCase()) &&
        (!cls || this.classes.split(" ").includes(cls)) &&
        (!data || data.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()) in this.dataset) &&
        (!selector.startsWith("#") || this.id === selector.slice(1));
    }
    querySelectorAll(selector: string): ElementPort[] {
      return [...this.nodes, ...this.children].flatMap(child => [child, ...child.querySelectorAll("*")]).filter(e => e.matches(selector));
    }
    querySelector(selector: string): ElementPort { return this.querySelectorAll(selector)[0]!; }
    getClientRects() { return this.hidden ? [] : [{}]; }
    checkVisibility(): boolean {
      if (this.hidden || !this.layoutVisible) return false;
      for (let child: ElementPort = this, parent = this.parentElement; parent; child = parent, parent = parent.parentElement) {
        if (parent.hidden || !parent.layoutVisible || parent.tagName === "DETAILS" && !parent.open && child.tagName !== "SUMMARY") return false;
      }
      return true;
    }
    focus() { document.activeElement = this; }
    closest(selector: string): ElementPort | null { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }

  }
  const elements = new Map<string, ElementPort>();
  const root = Object.assign(new ElementPort(), {
    querySelector: (selector: string) => {
      const rendered = elements.get("#panel-content")?.querySelector(selector);
      if (rendered) return rendered;
      let element = elements.get(selector);
      if (!element) {
        element = new ElementPort();
        const tag = root.innerHTML.match(new RegExp(`<[^>]*\\bid="${selector.slice(1)}"[^>]*>`))?.[0] ?? "";
        for (const [, name, value] of tag.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) element.attrs[name!] = decodeHtml(value ?? "");
        element.id = selector.slice(1);
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
  const globals = ["document", "window", "performance"] as const;
  let now = 0, nextTimer = 0;
  const timers = new Map<number, { due: number; callback: () => void }>();
  const previous = globals.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  Object.defineProperty(globalThis, "performance", { configurable: true, value: { now: () => now } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    clearTimeout: (id: number) => timers.delete(id),
    setTimeout: (callback: () => void, delay: number) => { timers.set(++nextTimer, { callback, due: now + delay }); return nextTimer; },
  } });
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
  for (const child of root.querySelector("#game-panel").children) child.parentElement = root.querySelector("#game-panel");
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
    view, commands, audio, markup: () => root.innerHTML, get: (id: string) => root.querySelector(`#${id}`),
    active: () => document.activeElement,
    timerCount: () => timers.size,
    wall: (milliseconds: number) => {
      now += milliseconds;
      for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.callback(); }
    },
    navigate: (kind: string) => root.emit("click", { target: root.querySelectorAll("button").find(b => b.dataset.action === `${kind}-panel`)! }),
    activate: (id: string) => root.emit("click", { target: root.querySelector(`#${id}`) }),
    selectStorage: (id: "storage-from" | "storage-to", value: string) => {
      const target = Object.assign(root.querySelector(`#${id}`), { id, value, tagName: "SELECT" });
      root.emit("change", { target });
    },
    key: (key: string, code = key, shiftKey = false) => {
      const event = { key, code, shiftKey, prevented: false, stopped: false,
        preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
      root.emit("keydown", event);
      return event;
    },
    activeCommand: () => commandFor(document.activeElement),
    activateControl: commandFor,
    renderedControl: (command: GameCommand) => {
      const matches = root.querySelector("#panel-content").querySelectorAll("button")
        .filter(b => b.dataset.commandKey && isDeepStrictEqual(JSON.parse(b.dataset.commandKey), command));
      assert.equal(matches.length, 1, `expected one rendered control for ${JSON.stringify(command)}`);
      return matches[0]!;
    },
    commandButton: (command: GameCommand) => {
      const matches = root.querySelector("#panel-content").querySelectorAll("button:not([disabled])")
        .filter((button) => isDeepStrictEqual(commandFor(button), command));
      assert.equal(matches.length, 1, `expected one control for ${JSON.stringify(command)}`);
      const button = matches[0]!;
      for (let group = button.closest("details"); group; group = group.parentElement?.closest("details") ?? null) group.open = true;
      return button;
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
    const last = get("game-panel").querySelectorAll("button:not([disabled]), select, input, a, summary").filter(control => control.checkVisibility()).at(-1)!;
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

test("menu settings leave interior Tab to the browser and wrap past collapsed details", (t) => {
  const { view, get, key, active } = viewFixture(t);
  // Supply the existing settings controls' hierarchy; this port does not parse layout.
  get("menu").children = [get("resume"), get("quality"), get("sensitivity"), get("invert"), get("subtitles")];
  // Chromium can retain layout rectangles for descendants of closed details.
  get("subtitles").layoutVisible = false;
  view.showMenu(true);
  get("quality").focus();
  assert.equal(key("Tab").prevented, false);
  assert.equal(key("Tab", "Tab", true).prevented, false);
  get("resume").focus();
  assert.equal(key("Tab", "Tab", true).stopped, true);
  assert.equal(active(), get("invert"));
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
  assert.match(get("panel-content").innerHTML, /Next payment: Reserve cell 2.*30 → 5%/);
  assert.ok(!get("panel-content").innerHTML.includes("Next payment: Reserve cell 1"));
  assert.ok(remote.id !== carried.id);
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
  view.openPanel("inventory", s);
  const html = get("panel-content").innerHTML;
  assert.match(html, /<h3>Local cells<\/h3>/);
  assert.match(html, /Hull battery, health and emergency air require supported service beside the craft/);
  commandButton({ type: "recharge-cells" }).focus();
  s = executeCommand(s, { type: "recharge-cells" }, createWorldQueries()).state;
  view.refreshPanel(s);
  assert.equal(s.inventory.items.find((i) => i.id === cell.id)?.charge, 100);
  assert.equal(s.fleet.vehicles.length, 0);
  assert.equal(active(), get("panel-return"), "a now-disabled action falls back to Return");
});

test("bulk storage retains whole-stack CU and operands, suppresses known refusal and atomically refuses a stale enabled command", (t) => {
  const { view, get, commandButton, renderedControl, activateControl, activeCommand, active } = viewFixture(t);
  let s = createGame(); completeOpening(s);
  addItem(s, "structural_alloy", 2, "diver"); addItem(s, "silica_glass", 3, "diver");
  const meal = addItem(s, "meal", 1, "diver"), cell = addItem(s, "reserve_cell", 1, "diver");
  s.inventory.containers.find(c => c.id === "pod_locker")!.capacity = 6;
  const command: GameCommand = { type: "store-materials", from: "diver", to: "pod_locker" };
  const preview = materialStoragePreview(s, command.from, command.to);
  view.openPanel("inventory", s);
  assert.match(get("panel-content").innerHTML, /2 × Structural alloy · 3 × Silica glass · whole stacks/);
  assert.equal(renderedControl(command).textContent, "Store · 7 CU");
  assert.equal(renderedControl(command).disabled, true);
  assert.equal(activateControl(renderedControl(command)), undefined, "known full destination cannot dispatch");
  assert.ok(get("panel-content").innerHTML.includes(preview.refusal!));
  s.inventory.containers.find(c => c.id === "pod_locker")!.capacity = 80;
  view.refreshPanel(s); commandButton(command).focus();
  // Capacity can change after rendering. The simulation still validates this
  // formerly enabled command, independently of the DOM's activation guard.
  s.inventory.containers.find(c => c.id === "pod_locker")!.capacity = 6;
  const before = structuredClone(s), stale = activeCommand(); assert.deepEqual(stale, command);
  const refused = executeCommand(s, stale!, createWorldQueries());
  assert.deepEqual(refused.state, before);
  const notice = refused.events.find(e => e.type === "notice" && e.error); assert.ok(notice?.type === "notice");
  view.notify(notice.message, true); view.refreshPanel(refused.state);
  assert.equal(active()?.dataset.focusKey, "storage");
  assert.equal(activeCommand(), undefined, "disabled Store never retargets a different command");
  assert.equal(get("panel-feedback").textContent, preview.refusal);
  s.inventory.containers.find(c => c.id === "pod_locker")!.capacity = 80;
  view.refreshPanel(s); commandButton(command).focus();
  s = executeCommand(s, activeCommand()!, createWorldQueries()).state; view.refreshPanel(s);
  assert.equal(active()?.dataset.focusKey, "storage");
  assert.equal(renderedControl(command).disabled, true); assert.equal(renderedControl(command).textContent, "Nothing to store");
  assert.equal(activateControl(renderedControl(command)), undefined);
  assert.equal(s.inventory.items.find(i => i.id === meal.id)?.containerId, "diver");
  assert.equal(s.inventory.items.find(i => i.id === cell.id)?.containerId, "diver");
  assert.equal(available(s, "structural_alloy", ["pod_locker"]), 2); assert.equal(available(s, "silica_glass", ["pod_locker"]), 3);
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
  assert.match(get("panel-content").innerHTML, /Quiet 3 → 4\.2 · boost 11 → 9 m\/s · 1 socket · 2 CU/);
  assert.match(get("panel-content").innerHTML, /0 \/ 2 sockets · 0 \/ 32 CU hold/);
  const install: GameCommand = { type: "install-module", vehicleId: v.id, itemId: item.id };
  commandButton(install).focus(); s = executeCommand(s, install, createWorldQueries()).state;
  view.refreshPanel(s);
  assert.equal(active()?.dataset.focusKey, `fitting:${v.id}`);
  assert.match(get("panel-content").innerHTML, /1 \/ 2 sockets · 2 \/ 32 CU hold/);
  assert.equal((get("panel-content").innerHTML.match(/class="trim-tradeoff"/g) ?? []).length, 1);
  assert.doesNotMatch(get("panel-content").innerHTML, /Now: quiet/);
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
  assert.match(get("panel-content").innerHTML, /eligible local disabled-hull collar removal requires the service tool and Bobbin kit, safe personal depth and clearance/);
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
  assert.match(get("panel-feedback").textContent, /Cargo, damage and charge are unchanged/);
  assert.equal(get("notification").hidden, true);
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
    entered: () => { view.resetPresentation(); view.update(session.state!, false); view.showGame(); },
    notify: (message, error, options) => view.notify(message, error, options),
  });
  t.after(() => session.dispose());
  session.newGame(); await settled();
  assert.equal(session.state?.opening.phase, 0);
  assert.equal(get("notification").hidden, true, "New notifies after entered/update; its success is redundant");
  view.notify("Could not save this expedition.", true, { channel: "persistence" });
  const redundant = "Expedition saved. The island shore and reef ribs are yours to explore.";
  view.notify(redundant);
  assert.equal(get("notification").textContent, "Could not save this expedition.", "omitting routine success cannot replace an error");
  view.notify(redundant, true, { channel: "persistence" });
  assert.equal(get("notification").textContent, redundant, "the error flag takes precedence even for identical text");
  const imported = sample(); imported.state.opening.phase = 2;
  const text = encoded(imported);
  await session.importFile({ size: text.length, text: async () => text });
  session.confirm(); await settled();
  assert.equal(session.state?.opening.phase, 2);
  assert.equal(get("system-status").textContent, "Imported and saved locally.");
  session.newGame(); session.confirm(); await settled();
  session.state = executeCommand(session.state!, { type: "skip-opening" }, createWorldQueries()).state;
  view.update(session.state, false);
  assert.notEqual(get("notification").textContent, redundant, "finishing a replacement opening must not revive deferred text");
  session.dispose();
  const continued = new ExpeditionSession(new SaveRepository(storage, new TestWriterLock()), {
    changed: () => {}, pause: () => {},
    entered: () => { view.resetPresentation(); view.update(continued.state!, false); },
    notify: (message, error, options) => view.notify(message, error, options),
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
    entered: () => { view.resetPresentation(); view.update(session.state!, false); view.showGame(); },
    notify: (message, error, options) => view.notify(message, error, options),
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
  view.notify("Graphics restored. Resume when ready.", false, { channel: "system" });
  assert.equal(get("notification").hidden, false);
  view.graphicsError("Graphics context unavailable.");
  assert.equal(get("graphics-error").hidden, false);
  assert.equal(get("session-warning").hidden, false);
});

test("a confirmed local retry resolves the failed-save alert and reminder while Hold stays paused", async (t) => {
  const { view, get, active, wall, timerCount } = viewFixture(t);
  const storage = new MemoryStorage(), repository = new SaveRepository(storage, new TestWriterLock());
  const initial = sample(); completeOpening(initial.state);
  repository.load(); assert.equal((await repository.commit(initial)).ok, true);
  const session = new ExpeditionSession(repository, {
    changed: () => {
      view.slot(repository.status, session.state !== null);
      view.persistence(session.persistenceMessage, session.autoSaveAllowed, session.state !== null, session.busy);
    },
    pause: () => view.showMenu(session.state !== null),
    entered: () => { view.resetPresentation(); view.update(session.state!, false); view.showGame(); },
    notify: (message, error, options) => view.notify(message, error, options),
  });
  t.after(() => session.dispose());
  session.continueGame(); view.openPanel("inventory", session.state!);
  const focus = active(), before = repository.raw, state = structuredClone(session.state);
  assert.ok(before); assert.equal(session.autoSaveAllowed, true);

  storage.failWrite = true; session.manualSave(); await settled();
  const failure = get("notification").textContent;
  assert.match(failure, /Browser storage refused the save/);
  assert.equal(get("notification").hidden, false);
  assert.equal(get("session-warning").hidden, false);
  assert.equal(session.autoSaveAllowed, false);
  assert.equal(new SaveRepository(storage, new TestWriterLock()).load().save?.meta.savedAt, initial.meta.savedAt);
  assert.equal(repository.raw, before); assert.equal(storage.getItem(LOCAL_SAVE_KEY), before);
  assert.equal(active(), focus);

  wall(1000); session.manualSave(); await settled();
  assert.equal(get("notification").textContent, failure, "a still-failing retry keeps the truthful alert");
  assert.equal(session.autoSaveAllowed, false); assert.equal(repository.raw, before);
  assert.equal(storage.getItem(LOCAL_SAVE_KEY), before);
  view.notify("Exported portable copy", false, { channel: "system" });
  view.notify("Graphics restored", false, { channel: "system" });
  assert.equal(get("notification").textContent, failure, "system success cannot establish local recovery");
  assert.equal(get("session-warning").hidden, false);
  view.notify("Suppressed invalid import", true, { channel: "system" });

  wall(1000); storage.failWrite = false; session.manualSave(); await settled();
  assert.equal(session.autoSaveAllowed, true);
  assert.equal(session.persistenceMessage, "");
  assert.equal(get("session-warning").hidden, true);
  assert.match(get("save-status").textContent, /Saved locally/);
  assert.notEqual(repository.raw, before);
  assert.equal(storage.getItem(LOCAL_SAVE_KEY), repository.raw);
  const loaded = new SaveRepository(storage, new TestWriterLock()).load();
  assert.deepEqual(loaded.save?.state, state); assert.deepEqual(loaded.backup, initial);
  assert.equal(get("notification").hidden, true, "confirmed recovery immediately resolves the obsolete failure");
  assert.match(get("system-status").textContent, /Saved locally/);
  assert.equal(get("system-status").hidden, false);
  assert.equal(active(), focus); assert.equal(view.currentPanel, "inventory");
  assert.equal(timerCount(), 1);
  wall(3001);
  assert.equal(get("system-status").hidden, true); assert.equal(get("notification").hidden, true);
  assert.equal(timerCount(), 0, "the obsolete failure's timeout is removed with its notice");
  wall(20000);
  assert.equal(get("notification").hidden, true, "suppressed notices never replay after recovery or chip expiry");
  assert.deepEqual(session.state, state, "paused retry and wall expiry do not advance simulation");
  assert.equal(active(), focus);
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
  assert.match(get("hazard").innerHTML, /HULL DISABLED.*emergency air exhausted.*Suit air · 18 s/);
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
  assert.equal(active(), get("container-diver"), "the removed last source row falls back to carried items");
  assert.equal(activeCommand(), undefined, "the outcome anchor must not dispatch another cargo command");
});

test("a completed all-items transfer focuses the next visible Move while an equal-label command remains", (t) => {
  const { view, commandButton, active, activeCommand } = viewFixture(t);
  let s = createGame(); completeOpening(s);
  const glass = addItem(s, "silica_glass", 3, "pod_locker");
  const meal = addItem(s, "meal", 3, "pod_locker");
  const command: GameCommand = { type: "transfer", itemId: glass.id, to: "diver", quantity: 3 };
  view.openPanel("inventory", s);
  commandButton(command).focus();
  s = executeCommand(s, command, createWorldQueries()).state;
  view.refreshPanel(s);
  assert.equal(commandButton({ ...command, itemId: meal.id }).textContent, "Take to diver · all (3)");
  assert.equal(active()?.dataset.focusKey, `move:${meal.id}`);
  assert.equal(active()?.checkVisibility(), true);
  assert.equal(activeCommand(), undefined);
  assert.equal(available(s, "meal", ["pod_locker"]), 3);
});

test("known-full transfers suppress activation; stale enabled refusal preserves item identity and a useful Move anchor", (t) => {
  const { view, get, commandButton, renderedControl, activateControl, activeCommand, active } = viewFixture(t);
  const s = createGame(); completeOpening(s);
  const filling = addItem(s, "meal", 16, "diver");
  const other = addItem(s, "meal", 3, "pod_locker"), glass = addItem(s, "silica_glass", 3, "pod_locker");
  const command: GameCommand = { type: "transfer", itemId: glass.id, to: "diver", quantity: 1 };
  view.openPanel("inventory", s);
  assert.equal(renderedControl(command).disabled, true);
  assert.equal(activateControl(renderedControl(command)), undefined);
  assert.match(get("panel-content").innerHTML, /Needs 1 CU free in Diver hold/);
  for (let attempt = 0; attempt < 2; attempt++) {
    filling.quantity = 15; view.refreshPanel(s); commandButton(command).focus();
    filling.quantity = 16;
    const before = structuredClone(s); assert.deepEqual(activeCommand(), command);
    const result = executeCommand(s, command, createWorldQueries());
    const refusal = result.events.find(event => event.type === "notice" && event.error);
    assert.ok(refusal?.type === "notice"); assert.equal(refusal.message, "The destination is full. Nothing moved.");
    view.notify(refusal.message, true); view.refreshPanel(result.state);
    assert.equal(active()?.dataset.focusKey, `move:${glass.id}`);
    assert.equal(active()?.checkVisibility(), true); assert.equal(activeCommand(), undefined);
    assert.equal(get("panel-feedback").textContent, refusal.message);
    assert.deepEqual(result.state, before); assert.equal(other.quantity, 3);
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
  s.fleet.vehicles.reverse(); view.refreshPanel(s); assert.deepEqual(activeCommand(), command);
  s = executeCommand(s, command, createWorldQueries()).state;
  view.refreshPanel(s);
  assert.equal(active()?.dataset.focusKey, "vessel:second-dart");
  assert.equal(activeCommand(), undefined);
  assert.equal(s.fleet.vehicles.find((v) => v.id === "first-dart")?.charge, 25);
  assert.equal(s.fleet.vehicles.find((v) => v.id === "second-dart")?.charge, 100);
  s.fleet.vehicles.reverse();
  view.refreshPanel(s);
  assert.equal(active()?.dataset.focusKey, "vessel:second-dart", "vessel order must not define focus identity");
  s.fleet.vehicles = s.fleet.vehicles.filter((v) => v.id !== "second-dart");
  view.refreshPanel(s);
  assert.equal(active(), get("panel-return"), "a removed vessel must not redirect service to another hull");
  assert.equal(activeCommand(), undefined);
});

test("departed transfers fall back to carried items and removed unrelated controls fall back to Return", (t) => {
  const { view, get, commandButton, active } = viewFixture(t);
  const s = createGame(); completeOpening(s);
  const glass = addItem(s, "silica_glass", 2, "pod_locker");
  view.openPanel("inventory", s);
  commandButton({ type: "transfer", itemId: glass.id, to: "diver", quantity: 1 }).focus();
  s.player.pose.position = { x: 10, y: 2, z: -35 };
  view.refreshPanel(s);
  assert.equal(active(), get("container-diver"));
  const buoy = addItem(s, "salvage_buoy", 1, "diver");
  s.inventory.buoy.itemId = buoy.id;
  view.refreshPanel(s);
  commandButton({ type: "buoy" }).focus();
  s.inventory.items = s.inventory.items.filter((i) => i.id !== buoy.id);
  view.refreshPanel(s);
  assert.equal(active(), get("container-diver"), "a removed buoy row must not retain its disabled command");
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
  const { view, get, commandButton, renderedControl, activateControl } = viewFixture(t);
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
    const patch: GameCommand = { type: "recover", vehicleId: v.id, method: "repair" };
    assert.equal(renderedControl(patch).disabled, true);
    assert.equal(activateControl(renderedControl(patch)), undefined);
    assert.match(get("panel-content").innerHTML, /Fabricate the reusable Bobbin \/ collar/);
    assert.equal(commandButton({ type: "reserve", vehicleId: v.id }).disabled, false);
    assert.equal(renderedControl({ type: "service", vehicleId: v.id }).disabled, true);
    assert.match(get("panel-content").innerHTML, /Cells in diver \/ this craft: Reserve cell 1 · 100%/);
    assert.deepEqual(s, before, "recovery presentation cannot mutate the occupied state");
  }
  addItem(s, "bobbin_kit", 1, "equipment", "recovery", "maintenance");
  view.refreshPanel(s);
  commandButton({ type: "recover", vehicleId: v.id, method: "repair" });
  const patched = executeCommand(s, { type: "recover", vehicleId: v.id, method: "repair" }, createWorldQueries()).state;
  assert.equal(patched.fleet.vehicles[0]!.health, 65); assert.equal(patched.fleet.vehicles[0]!.charge, 20);
  assert.equal(patched.player.controlledVehicleId, v.id, "a local patch may repair an occupied hull");
});

test("recovery focus falls back when occupation disables tow, retains patch identity, and allows controls after safe exit", (t) => {
  const { view, get, commandButton, active, activeCommand } = viewFixture(t);
  let s = createGame(); completeOpening(s);
  addItem(s, "bobbin_kit", 1, "equipment", "recovery", "maintenance");
  addItem(s, "suit_150", 1, "equipment", "suit");
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
  const { view, get, commandButton, renderedControl, activateControl, activeCommand, active } = viewFixture(t);
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
  assert.equal(renderedControl(salvage).disabled, true);
  assert.equal(activateControl(renderedControl(salvage)), undefined);
  const kit = addItem(s, "bobbin_kit", 1, "equipment", "recovery", "maintenance");
  view.refreshPanel(s); commandButton(salvage).focus();
  s.inventory.items = s.inventory.items.filter(i => i.id !== kit.id);
  const before = structuredClone(s);
  const refused = executeCommand(s, activeCommand()!, createWorldQueries());
  assert.deepEqual(refused.state, before);
  const notice = refused.events.find((e) => e.type === "notice");
  assert.ok(notice?.type === "notice" && notice.error);
  view.notify(notice.message, notice.error); view.refreshPanel(refused.state);
  assert.equal(active(), get("panel-return"));
  assert.equal(renderedControl(salvage).disabled, true);
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
  view.refreshPanel(s); commandButton(salvage).focus();
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
    const displayed = get("action-result").textContent;
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


test("recipe focus follows its full command as shortage work becomes ready; completion has a safe visible fallback", (t) => {
  const { view, get, commandButton, renderedControl, activateControl, activeCommand, active } = viewFixture(t);
  let s = createGame(); completeOpening(s);
  const command: GameCommand = { type: "craft", recipeId: "pod_repair" };
  view.openPanel("craft", s);
  assert.equal(renderedControl(command).disabled, true); assert.equal(activateControl(renderedControl(command)), undefined);
  assert.match(get("panel-content").innerHTML, /Missing public materials/);
  addItem(s, "structural_alloy", 2, "diver"); addItem(s, "silica_glass", 1, "diver"); addItem(s, "flex_membrane", 2, "diver");
  view.refreshPanel(s); commandButton(command).focus();
  view.refreshPanel(s); assert.deepEqual(activeCommand(), command);
  s = executeCommand(s, command, createWorldQueries()).state;
  view.refreshPanel(s); assert.equal(active()?.dataset.focusKey, "group:completed-recipes");
  assert.equal(activeCommand(), undefined, "completed one-time work cannot redirect to another recipe");
});

test("the GameView replacement boundary clears panel results and invalidates old commands", (t) => {
  const { view, get, commandButton, activeCommand } = viewFixture(t);
  const s = createGame(); completeOpening(s); addItem(s, "meal", 1, "diver");
  view.openPanel("inventory", s);
  const stale = commandButton({ type: "eat" });
  view.notify("Previous expedition result", true);
  view.resetPresentation();
  assert.equal(get("panel-content").innerHTML, "");
  assert.equal(get("panel-feedback").textContent, ""); assert.equal(get("panel-feedback").hidden, true);
  stale.focus(); assert.equal(activeCommand(), undefined);
  view.openPanel("inventory", structuredClone(s));
  commandButton({ type: "eat" });
});

test("closed-panel travel resets storage operands without rendering panels, changing focus or mutating the expedition", (t) => {
  const { view, get, active, commands, commandButton, renderedControl, selectStorage, timerCount } = viewFixture(t), s = readyState();
  s.player.pose.position = { x: 11, y: 1.2, z: -35 };
  s.world.facilities.find(f => f.id === "island_workshop")!.repaired = true;
  const v = makeVehicle("storage-dart", "dart", { x: 20, y: -1.6, z: -22 }, "storage-hold");
  s.fleet.vehicles.push(v);
  s.inventory.containers.push({ id: v.cargoId, kind: "vehicle", ownerId: v.id, capacity: 32 });
  addItem(s, "structural_alloy", 2, "diver");
  view.update(s, false); view.showGame(); view.openPanel("inventory", s);
  selectStorage("storage-from", "workshop_locker"); selectStorage("storage-to", v.cargoId);
  assert.equal(renderedControl({ type: "store-materials", from: "workshop_locker", to: v.cargoId }).disabled, true);
  view.closePanel(); view.showGame();
  const html = get("panel-content").innerHTML, writes = get("panel-content").htmlWrites,
    focus = active(), timers = timerCount();
  get("game-panel").scrollTop = 137;
  const away = structuredClone(s); away.player.pose.position = { x: 70, y: -5, z: -35 };
  const beforeAway = structuredClone(away), beforeReturn = structuredClone(s);
  for (let i = 0; i < 100; i++) view.update(away, false);
  view.update(s, false);
  assert.equal(view.currentPanel, null);
  assert.equal(get("panel-content").innerHTML, html); assert.equal(get("panel-content").htmlWrites, writes);
  assert.equal(get("game-panel").scrollTop, 137); assert.equal(active(), focus);
  assert.equal(timerCount(), timers); assert.deepEqual(commands, []);
  assert.deepEqual(away, beforeAway); assert.deepEqual(s, beforeReturn);
  view.openPanel("inventory", s);
  commandButton({ type: "store-materials", from: "diver", to: "workshop_locker" });
  assert.match(get("panel-content").innerHTML, /<option value="workshop_locker" selected>Workshop locker/);
  assert.equal(get("panel-feedback").hidden, true);
});

test("closed-panel observations preserve same-site storage intent through roster, pause and bench/cradle changes", (t) => {
  const { view, renderedControl, selectStorage, navigate } = viewFixture(t), s = readyState();
  s.player.pose.position = { x: 11, y: 1.2, z: -35 };
  s.world.facilities.find(f => f.id === "island_workshop")!.repaired = true;
  const v = makeVehicle("storage-dart", "dart", { x: 20, y: -1.6, z: -22 }, "storage-hold");
  s.fleet.vehicles.push(v);
  s.inventory.containers.push({ id: v.cargoId, kind: "vehicle", ownerId: v.id, capacity: 32 });
  view.update(s, false); view.openPanel("inventory", s); selectStorage("storage-to", v.cargoId);
  const chosen: GameCommand = { type: "store-materials", from: "diver", to: v.cargoId };
  view.closePanel(); view.showGame(); view.update(s, false); view.openPanel("inventory", s);
  assert.equal(renderedControl(chosen).disabled, true);
  view.closePanel();
  const other = makeVehicle("passing-dart", "dart", { x: 21, y: -1.6, z: -22 }, "passing-hold");
  s.fleet.vehicles.push(other);
  s.inventory.containers.push({ id: other.cargoId, kind: "vehicle", ownerId: other.id, capacity: 32 });
  view.update(s, false);
  s.fleet.vehicles = s.fleet.vehicles.filter(a => a.id !== other.id);
  s.inventory.containers = s.inventory.containers.filter(c => c.id !== other.cargoId);
  view.update(s, false);
  const cradle = structuredClone(s);
  cradle.player.controlledVehicleId = v.id; cradle.player.mode = "piloting"; cradle.player.pose = structuredClone(v.pose);
  view.update(cradle, false); view.update(s, false);
  view.showMenu(true); view.update(s, false); view.openPanel("inventory", s);
  assert.equal(renderedControl(chosen).disabled, true);
  navigate("craft"); navigate("inventory"); assert.equal(renderedControl(chosen).disabled, true);
  view.resetPresentation(); view.update(s, false); view.openPanel("inventory", s);
  assert.equal(renderedControl({ type: "store-materials", from: "diver", to: "workshop_locker" }).disabled, true);
});

test("panel outcomes are singular, preserve focus, and clear on switch/close while persistence remains independent", (t) => {
  const { view, get, active, navigate } = viewFixture(t), s = readyState();
  view.update(s, false); view.showGame(); view.openPanel("inventory", s);
  const focus = active();
  view.notify("Nothing moved.", true, { channel: "action" });
  assert.equal(active(), focus);
  assert.equal(get("panel-feedback").textContent, "Nothing moved.");
  assert.equal(get("notification").hidden, true);
  view.notify("Export before closing.", true, { channel: "persistence" });
  assert.equal(get("notification").textContent, "Export before closing.");
  assert.equal(get("panel-feedback").textContent, "Nothing moved.");
  view.notify("Stored materials.", false, { channel: "action" });
  assert.equal(get("panel-feedback").textContent, "Stored materials.");
  assert.equal(get("notification").textContent, "Export before closing.");
  assert.equal(active(), focus);
  view.closePanel(); view.showGame();
  assert.equal(get("panel-feedback").hidden, true);
  assert.equal(get("panel-feedback").textContent, "");
  view.openPanel("inventory", s); view.notify("Another result", false);
  navigate("craft");
  assert.equal(view.currentPanel, "craft");
  assert.equal(get("panel-feedback").hidden, true);
  assert.equal(get("notification").textContent, "Export before closing.");
});

test("real view active clocks, wall timers and disposal stay bounded and do not repeatedly announce unchanged calls", (t) => {
  const { view, get, timerCount, wall } = viewFixture(t), s = readyState();
  s.player.mode = "swimming"; s.player.pose.position = { x: -55, y: -15, z: 30 };
  view.update(s, false); view.showGame(); view.notify("Collected", false, { channel: "action" });
  for (let i = 0; i < 600; i++) view.update(s, false);
  wall(20000);
  assert.equal(get("action-result").textContent, "Collected", "paints and wall time do not consume the action clock");
  view.showMenu(true);
  assert.equal(get("action-result").hidden, true, "menu clears without replay");
  assert.equal(timerCount(), 0);
  view.showGame(); for (let i = 0; i < 240; i++) view.presentationStep(s);
  assert.equal(get("notification").hidden, true);
  s.world.threat.mode = "warn"; view.update(s, false);
  view.notify("Warning calls", true, { channel: "hazard", context: "threat" });
  view.threatCall({ x: -55, y: -14.35, z: 10 }, s);
  const writes = get("call-direction").textWrites;
  for (let i = 0; i < 100; i++) view.update(s, false);
  assert.equal(get("call-direction").textWrites, writes, "unchanged live text is not replaced per refresh");
  view.notify("Saved", false, { channel: "persistence" });
  assert.equal(get("notification").hidden, true, "the current threat banner covers its prose");
  assert.equal(get("system-status").textContent, "Saved");
  assert.equal(timerCount(), 1);
  view.showMenu(true); wall(3000);
  assert.equal(get("system-status").hidden, true);
  assert.equal(get("call-cue").hidden, false, "pause freezes the call's active clock");
  view.notify("Invalid import", true, { channel: "system" });
  assert.equal(get("notification").textContent, "Invalid import");
  wall(11999); assert.equal(get("notification").hidden, false);
  wall(1); assert.equal(get("notification").hidden, true);
  view.blockedAscent(true); view.cancelFeedback();
  assert.equal(get("blocked-ascent").hidden, true);
  view.resetPresentation();
  assert.equal(get("call-cue").hidden, true);
  assert.equal(timerCount(), 0);
  view.notify("Failed save", true, { channel: "persistence" });
  assert.equal(timerCount(), 1); view.dispose(); assert.equal(timerCount(), 0);
});

test("air card follows authoritative current-source precedence and remaining seconds, including the first submerged ramp transition", (t) => {
  const { view, get } = viewFixture(t), s = readyState();
  const check = (kind: string, text: RegExp) => {
    const before = structuredClone(s); view.update(s, false);
    assert.equal(get("vitals").dataset.airSource, kind);
    assert.match(get("vitals").innerHTML, text);
    assert.deepEqual(s, before);
    assert.ok(!get("vitals").innerHTML.includes("180 s tank"));
  };
  s.player.mode = "walking"; s.player.pose.position = { x: 0, y: 0.18, z: 14 };
  check("refuge", /Home pod air/);
  s.player.mode = "swimming"; s.player.pose.position = { x: 0, y: -0.850001, z: 9 };
  s.player.vitals.oxygen = 37.5; check("suit", /Suit air · 68 s/);
  s.player.pose.position.y = -0.85; check("surface", /Surface air/);
  s.player.pose.position = { x: 116, y: -117.9, z: -126 }; check("refuge", /Upper Canopy laboratory air/);
  s.player.pose.position = { x: 10, y: 1.2, z: -34 };
  s.world.facilities.find(f => f.id === "island_workshop")!.repaired = true;
  check("refuge", /Splitspine workshop air/);
  const v = makeVehicle("air-dart", "dart", { x: -55, y: -20, z: 30 }, "air-hold");
  s.fleet.vehicles.push(v); s.player.mode = "piloting"; s.player.controlledVehicleId = v.id;
  s.player.pose = structuredClone(v.pose); check("craft", /Dart air/);
  v.disabled = true; v.charge = 0; v.emergencyAir = 7.25; check("emergency", /Emergency air · 8 s/);
  v.emergencyAir = 0; s.player.vitals.oxygen = 10; check("suit", /Suit air · 18 s/);
  s.player.vitals.oxygen = 0; check("suit", /Suit air · 0 s/);
  s.player.pose.position.y = v.pose.position.y = -0.9; check("surface", /Surface air/);
  assert.ok(!get("hazard").innerHTML.includes("emergency air exhausted"));
  assert.match(get("hazard").innerHTML, /HULL DISABLED · Surface air/);
  assert.doesNotMatch(get("hazard").innerHTML, /Emergency air|0 s/);
});

test("pulse HUD stays contextual while Hold retains the actual cost, selected cell and free alternatives", (t) => {
  const { view, get } = viewFixture(t), s = readyState();
  addItem(s, "essential_tools", 1, "equipment").fitted = "tools";
  s.player.pose.position = { x: 90, y: -40, z: -90 }; s.player.mode = "swimming";
  view.update(s, false); assert.equal(get("pulse-summary").textContent, "");
  s.world.threat.mode = "disengage";
  view.update(s, false); assert.equal(get("pulse-summary").textContent, "", "release alone does not advertise a charged response");
  s.world.threat.mode = "warn"; view.update(s, false);
  assert.match(get("pulse-summary").textContent, /G · (25 cell points|unavailable)/);
  view.openPanel("inventory", s);
  assert.match(get("panel-content").innerHTML, /Pulse G · −25 points/);
  s.world.threat.mode = "idle"; s.world.threat.distractionSeconds = 2;
  view.update(s, false); assert.match(get("pulse-summary").textContent, /pulse active 2 s/);
  s.world.threat.distractionSeconds = 0; view.update(s, false);
  assert.equal(get("pulse-summary").textContent, "");
});


test("interaction stack preserves full receipts during danger and save errors; repeated live updates cancel on all boundaries", (t) => {
  const { view, get, wall, timerCount, markup } = viewFixture(t), s = readyState();
  s.player.mode = "swimming"; s.player.pose.position = { x: 100, y: -30, z: -100 }; s.player.vitals.oxygen = 30;
  view.update(s, false); view.showGame(); view.update(s, false);
  const refusal = "No room for this bundle. Stow cargo, or deploy the 24 CU salvage buoy. Nothing collected.";
  view.notify("Save retry failed; export remains available", true, { channel: "persistence" });
  view.notify("Long full action message", false, { summary: "+4 Structural alloy · Diver hold 8/16" });
  assert.match(get("hazard").innerHTML, /LOW OXYGEN/);
  assert.equal(get("action-result").textContent, "+4 Structural alloy · Diver hold 8/16");
  assert.match(get("notification").textContent, /Save retry failed/);
  wall(0); const writes = get("action-announce").textWrites;
  view.notify("Long full action message", false, { summary: "+4 Structural alloy · Diver hold 8/16" });
  assert.equal(get("action-announce").textContent, ""); wall(0);
  assert.ok(get("action-announce").textWrites > writes);
  assert.equal(get("action-announce").textContent, get("action-result").textContent);
  view.notify(refusal, true); assert.equal(get("action-result").textContent, refusal);
  view.openPanel("inventory", s); wall(0);
  assert.equal(get("action-result").hidden, true); assert.equal(get("action-announce").textContent, "");
  view.notify("Full panel message", false, { summary: "Short field receipt" });
  assert.equal(get("panel-feedback").textContent, "Full panel message");
  view.closePanel(); view.showGame();
  view.notify("old callback"); view.notify("new callback"); wall(0);
  assert.equal(get("action-announce").textContent, "new callback");
  view.notify("reset callback"); view.resetPresentation(); wall(0);
  assert.equal(get("action-announce").textContent, "");
  view.notify("menu callback"); view.showMenu(true); wall(0);
  assert.equal(get("action-announce").textContent, "");
  view.showGame(); view.notify("dispose callback"); view.dispose(); wall(0); assert.equal(timerCount(), 0);
  assert.match(markup(), /id="interaction-stack"[^]*id="interact-prompt"[^]*id="action-result"[^]*id="look-action"/);
  assert.match(markup(), /<\/main>[^]*id="alert-stack"/);
});

test("current notice state renders matching hazard coverage before dedup; percentages never chatter", (t) => {
  const { view, get } = viewFixture(t), s = readyState();
  s.player.mode = "swimming"; s.player.pose.position = { x: 100, y: -30, z: -100 };
  view.update(s, false); view.showGame();
  const current = structuredClone(s); current.player.vitals.oxygen = 30; current.world.threat.mode = "warn";
  view.notify("newly crossed oxygen threshold", true, { channel: "hazard", context: "oxygen" }, current);
  assert.match(get("hazard").innerHTML, /LOW OXYGEN/); assert.equal(get("notification").hidden, true);
  view.update(current, false); const writes = get("hazard-announce").textWrites;
  for (const value of [29, 28, 27, 26]) { current.player.vitals.oxygen = value; view.update(current, false); }
  assert.equal(get("hazard-announce").textWrites, writes);
  assert.equal(get("context-hint").textContent, ""); assert.equal(get("control-hint").textContent, "");
  // The prior oxygen banner is stale: current air is safe and the delivered
  // context has no matching visible banner. It must not be silently dropped.
  const safe = structuredClone(current); safe.player.vitals.oxygen = 100;
  view.notify("A current unmatched hazard", true, { channel: "hazard", context: "recovery" }, safe);
  assert.equal(get("notification").textContent, "A current unmatched hazard");
  view.showMenu(true);
  view.notify("Menu warning without a visible banner", true, { channel: "hazard", context: "oxygen" }, current);
  assert.equal(get("notification").textContent, "Menu warning without a visible banner");
});

test("preview has no key, respects nullable labels and never shadows an executable target", (t) => {
  const { view, get } = viewFixture(t), s = readyState(); view.update(s, false);
  const preview = { id: "C02", kind: "evidence" as const, label: null, host: { center: { x: 1, y: -1, z: 0 }, radius: .7, solidIds: [] } };
  view.target(null, preview); assert.equal(get("interact-prompt").innerHTML, "Move closer");
  view.target(null, { ...preview, label: "Known source" });
  assert.equal(get("interact-prompt").innerHTML, "Known source · Move closer");
  faceTarget(s, "C01"); const target = aimedInteraction(s, createWorldQueries()); assert.ok(target);
  view.target(target, preview);
  assert.match(get("interact-prompt").innerHTML, /<kbd>E<\/kbd>/);
  assert.equal(get("interact-prompt").dataset.preview, "false");
  assert.ok(!get("interact-prompt").innerHTML.includes("Move closer"));
});

test("service support is visible for a full piloted Dart; disabled and unsupported state stay truthful", (t) => {
  const { view, get } = viewFixture(t), s = readyState();
  const v = makeVehicle("service-dart", "dart", { x: 0, y: -1, z: 8 }, "service-hold");
  s.fleet.vehicles.push(v); s.player.controlledVehicleId = v.id; s.player.mode = "piloting"; s.player.pose = structuredClone(v.pose);
  view.update(s, false); assert.match(get("vitals").innerHTML, /Service here · Tab/);
  v.disabled = true; view.update(s, false); assert.match(get("vitals").innerHTML, /Patch hull first/);
  v.pose.position.x = s.player.pose.position.x = 70; view.update(s, false);
  assert.doesNotMatch(get("vitals").innerHTML, /Service here|Patch hull first/);
});

test("ascent cue wins; rail help requires current forward rail-end contact, with generic text elsewhere", (t) => {
  const { view, get } = viewFixture(t), s = readyState();
  const v = makeVehicle("blocked-dart", "dart", { x: 18, y: -.9, z: -14.4 }, "blocked-hold");
  s.fleet.vehicles.push(v); s.player.controlledVehicleId = v.id; s.player.mode = "piloting"; s.player.pose = structuredClone(v.pose);
  view.update(s, false); view.blockedThrust(true, s);
  assert.equal(get("blocked-ascent").textContent, "Blocked ahead · Centre between the rails");
  view.blockedAscent(true); assert.equal(get("blocked-ascent").textContent, "Blocked above");
  view.blockedAscent(false); v.pose.position = { x: 80, y: -40, z: -80 };
  view.blockedThrust(true, s); assert.equal(get("blocked-ascent").textContent, "Blocked ahead");
  v.pose.position = { x: 20, y: -.9, z: -14.4 };
  view.blockedThrust(true, s); assert.equal(get("blocked-ascent").textContent, "Blocked ahead", "centred does not need rail-centering advice");
  view.cancelFeedback(); assert.equal(get("blocked-ascent").hidden, true);
});

test("empty opening detail and in-session subtitle hide while capture affordance remains until explicitly changed", (t) => {
  const { view, get } = viewFixture(t), s = createGame(); view.update(s, false); view.showGame();
  assert.equal(get("opening-detail").hidden, true);
  view.showMenu(true); assert.equal(get("menu-subtitle").hidden, true);
  view.showMenu(false); assert.equal(get("menu-subtitle").hidden, false);
  completeOpening(s); view.update(s, false); view.showGame(); view.lookAction(true, true);
  for (let i = 0; i < 1000; i++) view.update(s, false);
  assert.equal(get("look-action").hidden, false); assert.match(get("look-action").textContent, /drag \/ arrows available/);
});
