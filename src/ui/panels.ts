import {
  EVIDENCE, FUTURE_BLUEPRINTS, HULL_BUILD, HULLS, ITEMS, MATERIALS, MODULES, OPTIONAL_RECORD, PLACES,
  RECOVERY_STAGE, RECIPES, REGIONS, renewable, SOURCES, TECH_RECORDS, techRecord,
  type Recipe,
} from "../content/registry.js";
import { RECOVERY_ROUTES, RECOVERY_SURFACE_OPERATOR } from "../content/routes.js";
import type { ItemKind, MountKind, RecipeId } from "../content/registry.js";
import { isMountKind } from "../content/registry.js";
import {
  available, containerAccessible, containerLabel as inventoryLabel, distance, equipped, fabricationContainers,
  facility, hasRoom, localBenchSite, materialStoragePreview, nearCanopyStop, nearPod,
  nearWorkshop, supportedServiceSite, usedCapacity,
} from "../sim/inventory.js";
import { craftingBlock, hullOutput, personalLimit, refitHull } from "../sim/progression.js";
import { RECOVERY_NOTICES, recoveryCommand, recoveryRouteFor } from "../sim/recovery.js";
import { cellRechargePreview, distractionPreview, PULSE_CHARGE_COST, reserve, serviceRefusal, serviceState, serviceWouldRestore } from "../sim/vehicles.js";
import { dartPerformance, installModuleRefusal, mountChangePreview, removeModuleRefusal } from "../sim/modules.js";
import { canisterSalvagePreview } from "../sim/recovery.js";
import { cabinHull, fittedMount, holdCapacity, mobileRefugeBlock, mountLabel } from "../sim/fleet.js";
import type { GameCommand, GameState, ItemStack, VehicleState, WorldQueries } from "../sim/types.js";
import { bearing, escapeHtml, heading, recoveryDisplay } from "./format.js";

export type PanelKind = "inventory" | "craft" | "notebook" | "carrier";

/** A block owned by another stream, placed after a named built-in section:
 * notebook "dive-check", "question", "interpretation", "findings", "field-notes",
 * "refuge", "places", "habitats", "preparation", "plans", "return", "berth";
 * Cargo "cargo"; Fabricate "fabricate". Unknown anchors append at the end.
 * Render compact rows; put longer help behind `group` and actions through `button`. */
export interface PanelSection {
  id: string;
  after: string;
  render(state: GameState, kit: SectionKit): string;
}
export interface SectionKit {
  button: CommandButton;
  /** Native disclosure whose open state survives refreshes. */
  group(id: string, label: string, body: string, initiallyOpen?: boolean): string;
  escape(text: string): string;
}
/** `name` gives a short visible verb its full accessible name, e.g. "Repair" → "Repair · Pod regulator". */
export type CommandButton = (label: string, command: GameCommand, disabled?: boolean, reason?: string, name?: string) => string;

/** Display names over the simulation's labels, so every destination stays distinct. */
function containerLabel(state: GameState, id: string): string {
  if (id === "equipment") return "Retained equipment";
  if (id === "buoy_hold") return "Deployed buoy";
  const cache = state.recovery.caches.find((c) => c.containerId === id);
  if (cache) return cache.id.startsWith("canister") ? "Salvage canister" : "Visited cargo cache";
  const label = inventoryLabel(state, id);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// GameView owns panel visibility, the latest state and all input listeners.
// This owner builds content and retains only panel-local command/selection state.
export class PanelView {
  private readonly commands = new Map<string, GameCommand>();
  private storageFrom: string | null = null;
  // A default is never promoted to explicit intent by rendering it.
  private storageToChosen: string | null = null;
  private storageContext: string | null = null;
  private storageNotice = "";
  private readonly expansions = new Map<string, boolean>();
  private discardRenderedMoves = false;
  private highlightTimer = 0;
  private renderedKind: PanelKind | null = null;
  private readonly sections = new Map<PanelKind, PanelSection[]>();

  constructor(private readonly root: HTMLElement, private readonly world: WorldQueries) {}

  private get<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = this.root.querySelector<T>(`#${id}`);
    if (!element) throw new Error(`Missing UI element ${id}`);
    return element;
  }

  /** Register an extension section; a repeated id replaces the earlier one. */
  addSection(kind: PanelKind, section: PanelSection): void {
    this.sections.set(kind, [...(this.sections.get(kind) ?? []).filter((s) => s.id !== section.id), section]);
  }

  /** Built sections in order, each followed by its extensions. Consecutive
   * `fold` sections share one row of closed disclosures. */
  private compose(kind: PanelKind, built: [id: string, html: string, fold?: boolean][], state: GameState, button: CommandButton): string {
    const kit: SectionKit = { button, group: (id, label, body, open) => this.group(`${kind}:${id}`, label, body, open), escape: escapeHtml };
    const extra = this.sections.get(kind) ?? [];
    const anchors = new Set(built.map(([id]) => id));
    const after = (anchor: string): string => extra.filter((s) => s.after === anchor)
      .map((s) => `<section class="panel-extension" data-section="${escapeHtml(s.id)}">${s.render(state, kit)}</section>`).join("");
    let html = "", folding = false;
    for (const [id, part, fold = false] of built) {
      if (fold !== folding) html += fold ? '<div class="panel-folds">' : "</div>";
      folding = fold;
      html += part + after(id);
    }
    return html + (folding ? "</div>" : "") +
      extra.filter((s) => !anchors.has(s.after)).map((s) => `<section class="panel-extension" data-section="${escapeHtml(s.id)}">${s.render(state, kit)}</section>`).join("");
  }

  command(action: string): GameCommand | undefined {
    return this.commands.get(action);
  }

  selectStorage(id: "storage-from" | "storage-to", value: string): void {
    if (id === "storage-from") this.storageFrom = value;
    else this.storageToChosen = value;
    this.storageNotice = "";
  }

  // Observe travel even with panels closed, without touching their DOM/focus.
  observeStorageContext(state: GameState): void {
    const context = this.storageAnchor(state);
    if (context !== this.storageContext) {
      this.storageContext = context;
      this.storageFrom = this.storageToChosen = null;
      this.storageNotice = "";
      for (const key of this.expansions.keys()) if (key.startsWith("move:")) this.expansions.delete(key);
      // A closed panel may still contain the departed site's native details.
      this.discardRenderedMoves = true;
    }
  }

  refresh(kind: PanelKind, state: GameState): void {
    const content = this.get("panel-content");
    const restoreFocus = content.contains(document.activeElement);
    const focused = restoreFocus ? document.activeElement as HTMLElement : null;
    const restoreKey = focused?.dataset.commandKey;
    const restoreLocalKey = focused?.dataset.focusKey;
    const fallbackKey = focused?.dataset.focusFallback;
    const rowKey = focused?.closest<HTMLElement>(".item-row")?.dataset.rowKey;
    const moveKey = focused?.closest<HTMLDetailsElement>(".row-move")?.dataset.panelGroup;
    const oldMoves = [...content.querySelectorAll<HTMLElement>(".row-move > summary")].map((e) => e.dataset.focusKey);
    const followingMoves = moveKey ? oldMoves.slice(oldMoves.indexOf(moveKey) + 1) : [];
    this.observeStorageContext(state);
    for (const group of content.querySelectorAll<HTMLDetailsElement>("details[data-panel-group]"))
      if (group.dataset.panelGroup && !(this.discardRenderedMoves && group.dataset.panelGroup.startsWith("move:")))
        this.expansions.set(group.dataset.panelGroup, group.open);
    this.discardRenderedMoves = false;
    const scrollTop = this.renderedKind === kind ? this.get("game-panel").scrollTop : 0;
    this.renderedKind = kind;
    this.commands.clear();
    this.get("carrier-nav").hidden = state.scenario !== "carrier-fixture";
    const button: CommandButton = (label, command, disabled = false, reason, name) => {
      const id = `command-${this.commands.size}`;
      this.commands.set(id, command);
      // Every operand identifies the action, independently of its label or render order.
      const key = JSON.stringify(command, Object.keys(command).sort());
      const fallback = command.type === "craft" ? `recipe:${command.recipeId}`
        : command.type === "install-module" || command.type === "remove-module" ? `fitting:${command.vehicleId}`
        : command.type === "transfer" ? `move:${command.itemId}`
        : command.type === "service" || command.type === "reserve" ? `vessel:${command.vehicleId}`
        : command.type === "store-materials" ? "storage" : "";
      return `<span class="panel-action"><button data-action="${id}" data-command-key="${escapeHtml(key)}" data-focus-fallback="${escapeHtml(fallback)}"${command.type === "craft" && !disabled ? ' class="primary"' : ""}${disabled ? " disabled" : ""}${name ? ` aria-label="${escapeHtml(name)}"` : ""}${reason ? ` aria-describedby="${id}-reason"` : ""}>${escapeHtml(label)}</button>${reason ? `<small class="action-reason" id="${id}-reason">${escapeHtml(reason)}</small>` : ""}</span>`;
    };
    this.get("panel-title").textContent = {
      inventory: "Cargo",
      craft: "Fabricate",
      notebook: "Notebook",
      carrier: "Developer test · carrier fixture",
    }[kind];
    for (const nav of this.get("game-panel").querySelectorAll<HTMLButtonElement>("nav button"))
      nav.setAttribute("aria-current", nav.dataset.action === `${kind}-panel` ? "page" : "false");
    let html = "";
    if (kind === "inventory") {
      html = this.compose(kind, [["cargo", this.hold(state, button)]], state, button);
    } else if (kind === "craft") {
      html = this.compose(kind, [["fabricate", this.fabricate(state, button)]], state, button);
    } else if (kind === "notebook") {
      html = this.compose(kind, this.notebook(state, button), state, button);
    } else {
      const d = state.fleet.docking;
      html =
        '<p class="fixture-label">SEEDED FEASIBILITY · no earned campaign progression · station keeping only, no underway walking</p>';
      if (!d)
        html += "<p>Open the separate carrier fixture from the main menu.</p>";
      else {
        html += `<p>${d.stationKeeping ? "Station keeping" : "Under helm control"} · ${d.configuration} configuration · ${d.transaction ? `${d.transaction.type} / ${d.transaction.phase}` : "lock closed"} · completed transactions ${d.completed.length}</p><div class="service-actions">`;
        for (const [label, a] of [
          ["Engage station keeping", "station-keep"],
          ["Take helm", "helm"],
          ["Leave helm", "leave-helm"],
          ["Leave aft vestibule", "leave-interior"],
          ["Enter exterior vestibule", "enter-interior"],
          ["Reconfigure empty supported berth", "reconfigure"],
          ["Toggle fixture obstruction", "block-exit"],
          ["Interrupt lock transaction", "interrupt"],
          ["Fixture incapacity / refuge fallback", "failure-drill"],
        ] as const)
          html += button(label, { type: "carrier", action: a });
        html += "</div>";
        for (const v of state.fleet.vehicles.filter(
          (v) => v.id !== d.vehicleId,
        ))
          html += `<article><h3>${HULLS[v.hull].label} · ${v.berth ? "dry isolated berth " + v.berth.slot : "world craft"}</h3><p>Identity ${v.id} · power ${v.charge.toFixed(1)} · damage ${(100 - v.health).toFixed(1)} · cargo ${usedCapacity(state, v.cargoId)} CU</p>${button(v.berth ? "Launch through lock" : "Capture from corridor", { type: "carrier", action: v.berth ? "launch" : "capture", vehicleId: v.id })}</article>`;
      }
    }
    this.get("panel-content").innerHTML = html;
    if (restoreFocus) {
      const next = restoreKey ? [...content.querySelectorAll<HTMLButtonElement>("button:not([disabled])")].find((b) => b.dataset.commandKey === restoreKey) : undefined;
      const targets = [...content.querySelectorAll<HTMLElement>("[data-focus-key]")];
      const rowGone = rowKey && ![...content.querySelectorAll<HTMLElement>(".item-row")].some((e) => e.dataset.rowKey === rowKey);
      const local = rowGone ? targets.find((e) => followingMoves.includes(e.dataset.focusKey) && e.checkVisibility())
        ?? targets.find((e) => e.dataset.focusKey === "carried")
        : targets.find((e) => e.dataset.focusKey === (restoreLocalKey ?? fallbackKey));
      const outcomeGroup = local?.closest<HTMLDetailsElement>("details");
      const outcome = local?.checkVisibility() ? local
        : outcomeGroup?.tagName === "DETAILS" ? outcomeGroup.querySelector<HTMLElement>("summary") : null;
      (next?.checkVisibility() ? next : outcome?.checkVisibility() ? outcome : this.get("panel-return")).focus({ preventScroll: true });
    }
    this.get("game-panel").scrollTop = scrollTop;
  }

  resetSession(): void {
    this.cancelFeedback();
    this.storageFrom = this.storageToChosen = this.storageContext = null;
    this.storageNotice = "";
    this.expansions.clear();
    this.discardRenderedMoves = false;
    this.renderedKind = null;
    this.commands.clear();
    // Do not re-read the previous session's native details on its next render.
    this.get("panel-content").innerHTML = "";
    this.get("panel-feedback").classList.remove("error");
    this.get("panel-feedback").textContent = "";
    this.get("panel-feedback").hidden = true;
  }

  private group(id: string, label: string, body: string, initiallyOpen = false): string {
    const move = id.startsWith("move:");
    return `<details class="${move ? "row-move" : "panel-group"}" data-panel-group="${escapeHtml(id)}"${(this.expansions.get(id) ?? initiallyOpen) ? " open" : ""}><summary data-focus-key="${move ? "" : "group:"}${escapeHtml(id)}">${label}</summary>${body}</details>`;
  }

  private itemLabel(state: GameState, item: ItemStack): string {
    if (item.kind !== "reserve_cell") return ITEMS[item.kind].label;
    const cells = state.inventory.items.filter((i) => i.kind === "reserve_cell").sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    return `Reserve cell ${cells.findIndex((i) => i.id === item.id) + 1}`;
  }

  private storageAnchor(state: GameState): string {
    // Bench and cradle are one meaningful site; restoration and a fluctuating
    // cargo roster cannot change an explicit choice at that site.
    if (nearPod(state)) return "site:home_pod";
    if (nearWorkshop(state)) return "site:island_workshop";
    const local = state.fleet.vehicles.filter((v) => !v.berth &&
      (v.id === state.player.controlledVehicleId || distance(state.player.pose.position, v.pose.position) < 7))
      .sort((a, b) => distance(state.player.pose.position, a.pose.position) - distance(state.player.pose.position, b.pose.position) || a.id.localeCompare(b.id));
    const supported = local.map((v) => supportedServiceSite(state, v)).find((site) => site !== null);
    if (supported) return `site:${supported}`;
    if (containerAccessible(state, "buoy_hold")) return "anchor:buoy";
    if (local[0]) return `craft:${local[0].id}`;
    const cache = state.recovery.caches.find((c) => containerAccessible(state, c.containerId));
    return cache ? `cache:${cache.id}` : state.player.interiorId ? `interior:${state.player.interiorId}` : "field";
  }

  private knownContainer(state: GameState, id: string): boolean {
    if (id === "workshop_locker") return nearWorkshop(state) || facility(state, "island_workshop") || state.knowledge.markers.includes("island_workshop");
    if (id === "buoy_hold") return state.inventory.buoy.deployed;
    if (id === "canopy_stop_locker") return nearCanopyStop(state) || facility(state, "canopy_stop") || state.knowledge.markers.includes("canopy_stop");
    return true;
  }

  private itemRows(state: GameState, containerId: string, button: CommandButton): string {
    const bins = state.inventory.containers.filter((c) => c.kind !== "equipment" && containerAccessible(state, c.id));
    const items = state.inventory.items.filter((i) => i.containerId === containerId);
    return items.map((i) => {
      const installed = state.fleet.vehicles.find((v) => v.modules.includes(i.id));
      let actions = "";
      const buoy = i.kind === "salvage_buoy" ? button(state.inventory.buoy.deployed ? "Pack empty buoy" : "Deploy carried buoy", { type: "buoy" }) : "";
      if (!i.fitted && !installed)
        for (const d of bins.filter((d) => d.id !== containerId)) {
          const label = d.id === "diver" ? "Take to diver" : `To ${containerLabel(state, d.id)}`;
          const room = hasRoom(state, d.id, ITEMS[i.kind].cu * i.quantity);
          actions += button(`${label} · all (${i.quantity})`, { type: "transfer", itemId: i.id, to: d.id, quantity: i.quantity }, !room, room ? undefined : `Needs ${ITEMS[i.kind].cu * i.quantity} CU free in ${containerLabel(state, d.id)}.`);
          if (i.quantity > 1) {
            const one = hasRoom(state, d.id, ITEMS[i.kind].cu);
            actions += button(`${label} · 1`, { type: "transfer", itemId: i.id, to: d.id, quantity: 1 }, !one, one ? undefined : `Needs ${ITEMS[i.kind].cu} CU free in ${containerLabel(state, d.id)}.`);
          }
        }
      return `<div class="item-row" data-row-key="${escapeHtml(`${containerId}:${i.id}`)}"><div><strong>${escapeHtml(this.itemLabel(state, i))}${i.quantity > 1 ? ` × ${i.quantity}` : ""}</strong><small>${ITEMS[i.kind].cu * i.quantity} CU${installed ? ` · Installed in ${HULLS[installed.hull].label} · remove at collar before transfer` : i.fitted ? " · Fitted / retained" : ""}${i.charge !== null ? ` · charge ${i.charge.toFixed(0)}%` : ""}${i.provenance === "maintenance" ? " · rescue stock" : ""}</small></div><div class="item-actions">${buoy}${actions ? this.group(`move:${i.id}`, `Move <span class="sr-only">${escapeHtml(this.itemLabel(state, i))}</span>`, `<div class="move-destinations">${actions}</div>`) : ""}</div></div>`;
    }).join("") || '<p class="empty-hold">Empty</p>';
  }

  private hold(state: GameState, button: CommandButton): string {
    const diver = state.inventory.containers.find((c) => c.id === "diver");
    let html = `<p class="panel-status">${this.protection(state)} · Carried ${usedCapacity(state, "diver")} / ${diver?.capacity ?? 0} CU</p>`;
    if (localBenchSite(state)) {
      const bins = state.inventory.containers.filter(c => containerAccessible(state, c.id)).map(c => c.id);
      const stock = (Object.keys(MATERIALS) as (keyof typeof MATERIALS)[]).map(kind => ({ kind, quantity: available(state, kind, bins) })).filter(s => s.quantity > 0);
      if (stock.length) html += `<p class="local-stock">Local materials · ${stock.map(s => `${s.quantity} ${ITEMS[s.kind].label}`).join(" · ")}</p>`;
    }
    const vessels = state.fleet.vehicles.filter((v) => !v.berth && v.hull !== "hearthline");
    const here = vessels.filter((v) => v.id === state.player.controlledVehicleId || distance(state.player.pose.position, v.pose.position) <= 7 || localBenchSite(state) !== null && supportedServiceSite(state, v) === localBenchSite(state));
    const seated = here.find((v) => v.id === state.player.controlledVehicleId);
    const recoverable = (v: VehicleState): boolean => v.hull === "dart" || v.hull === "creel";
    const staged = this.atRescueStation(state) ? vessels.filter(v => v.disabled && recoverable(v) &&
      !here.includes(v) && state.recovery.losses.some(l => l.vehicleId === v.id && l.visited)) : [];
    const disabled = [...here.filter((v) => v.disabled && recoverable(v)), ...staged];
    let actions = disabled.map((v) => this.vesselService(state, v, button)).join("");
    if (seated && !disabled.includes(seated)) actions += this.vesselService(state, seated, button);
    if (!seated && !disabled.length) actions += this.materialStorageControls(state, button);
    const localDart = here.find((v) => v.hull === "dart");
    if (localDart || localBenchSite(state) && !vessels.some((v) => v.hull === "dart")) actions += this.moduleFitting(state, button, localDart);
    const localCreel = here.find((v) => v.hull === "creel" && !v.disabled);
    if (localCreel) actions += this.mountFitting(state, button, localCreel);
    if (cabinHull(state)) actions = this.cabinActions(state, button) + actions;
    if (seated || disabled.length) actions += this.materialStorageControls(state, button);
    for (const v of here.filter((v) => v !== seated && !disabled.includes(v))) actions += this.vesselService(state, v, button);
    if (localBenchSite(state)) actions += this.benchRecharge(state, button);
    if (actions) html += `<section class="here-actions" aria-label="Here"><h3>Here</h3>${actions}</section>`;
    html += `<article class="container carried" id="container-diver" data-focus-key="carried" tabindex="-1"><h3>Carried items</h3>${this.itemRows(state, "diver", button)}<div class="service-actions">${button("Eat a meal", { type: "eat" })}${button("Request emergency refuge meal", { type: "emergency-meal" })}</div></article>`;
    const bins = state.inventory.containers.filter((c) => c.id !== "diver" && containerAccessible(state, c.id));
    html += '<div class="container-grid">';
    for (const c of bins) {
      const name = c.kind === "equipment" ? "Retained equipment" : containerLabel(state, c.id);
      const body = `<div id="container-${escapeHtml(c.id)}" tabindex="-1">${this.itemRows(state, c.id, button)}</div>`;
      const fill = c.kind === "equipment" ? `${state.inventory.items.filter((i) => i.containerId === c.id).length} fitted` : `${usedCapacity(state, c.id)} / ${c.capacity} CU`;
      html += this.group(`container:${c.id}`, `${escapeHtml(name)} <small>${fill}</small>`, body);
    }
    html += '</div>';
    html += this.powerPreparation(state, button);
    const distant = state.inventory.containers.filter((c) => !containerAccessible(state, c.id) && this.knownContainer(state, c.id));
    let elsewhere = distant.map((c) => `<p><b>${escapeHtml(containerLabel(state, c.id))}</b> · ${usedCapacity(state, c.id)} / ${c.capacity} CU · ${c.id === "workshop_locker" && !facility(state, "island_workshop") ? "Locked · restore workshop services" : "Out of reach"}</p>`).join("");
    for (const v of vessels.filter((v) => !here.includes(v) && !staged.includes(v))) elsewhere += this.vesselService(state, v, button);
    html += this.group("elsewhere", `Elsewhere <small>${distant.length} known container${distant.length === 1 ? "" : "s"}${vessels.some((v) => !here.includes(v) && v.disabled) ? " · disabled craft recovery" : ""}</small>`, elsewhere || "<p>No other known containers.</p>");
    if (state.recovery.operation || state.recovery.losses.length || state.recovery.caches.some((c) => state.inventory.items.some((i) => i.containerId === c.containerId)) || Object.values(RECOVERY_NOTICES).some((message) => message === state.feedback))
      html += this.returnInformation(state);
    return html;
  }

  private vesselService(state: GameState, v: VehicleState, button: CommandButton): string {
    const local = distance(state.player.pose.position, v.pose.position) <= 7;
    const seated = state.player.controlledVehicleId === v.id;
    const readiness = serviceState(state, v.id);
    const refusal = serviceRefusal(state, v.id);
    const cells = state.inventory.items.filter((i) => i.kind === "reserve_cell" && (i.containerId === "diver" || i.containerId === v.cargoId));
    const mount = v.hull === "creel" ? fittedMount(state, v) : null;
    const reserveNo = reserve(structuredClone(state), v.id);
    const serviceActions = (): string => `<div class="service-actions">${readiness === "ready" && !serviceWouldRestore(state, v) ? '<span class="service-full">Fully serviced</span>'
      : button("Service", { type: "service", vehicleId: v.id }, refusal !== null, refusal ?? undefined)}${local && reserveNo === null ? button("Use reserve cell for hull power", { type: "reserve", vehicleId: v.id }) : ""}</div>`;
    let html = `<article class="vessel-service" id="vessel-${escapeHtml(v.id)}" tabindex="-1" data-focus-key="vessel:${escapeHtml(v.id)}"><div class="vessel-line"><h3>${HULLS[v.hull].label}${v.disabled ? " · disabled transponder" : ""}</h3><span>${seated ? "Seated" : state.player.interiorId === v.id ? "In cabin" : bearing(state.player.pose.position, v.pose.position)} · power ${v.charge.toFixed(0)}% · hull ${v.health.toFixed(0)}% · rated ${v.rating} m${v.hull === "creel" ? ` · ${mount ? mountLabel(mount.kind).toLowerCase() : "bare mount"} · hold ${usedCapacity(state, v.cargoId)} / ${holdCapacity(state, v)} CU` : ""}</span>${v.disabled ? "" : serviceActions()}</div>`;
    if (v.disabled && (v.hull === "dart" || v.hull === "creel")) {
      const creel = v.hull === "creel";
      const loss = state.recovery.losses.find(l => l.vehicleId === v.id && l.visited);
      const routeId = state.recovery.operation?.vehicleId === v.id ? state.recovery.operation.routeId : recoveryRouteFor(loss?.position ?? v.pose.position);
      const route = RECOVERY_ROUTES[routeId];
      const frame = Object.entries(v.investment).map(([k, q]) => `${q} ${ITEMS[k as ItemKind].label}`).join(" / ") || "No frame materials recorded";
      const cu = Object.entries(v.investment).reduce((n, [k, q]) => n + ITEMS[k as ItemKind].cu * (q ?? 0), 0);
      const canister = creel || cu > 24 ? canisterSalvagePreview(state, v.id) : null;
      const destination = state.inventory.buoy.deployed && distance(state.inventory.buoy.position, state.player.pose.position) < 6 && hasRoom(state, "buoy_hold", cu)
        ? "Deployed buoy" : hasRoom(state, "diver", cu) ? "Diver hold" : null;
      const eligibleHolds = [
        (state.inventory.containers.find((c) => c.id === "diver")?.capacity ?? 0) >= cu ? "the diver hold" : null,
        (state.inventory.containers.find((c) => c.id === "buoy_hold")?.capacity ?? 0) >= cu ? "a deployed buoy within 6 m" : null,
      ].filter(Boolean).join(" or ");
      const patchAlloy = Math.min(14, state.world.maintenance.alloy + v.boundRepairs * 2) - state.world.maintenance.alloy;
      const patchMembrane = Math.min(7, state.world.maintenance.membrane + v.boundRepairs) - state.world.maintenance.membrane;
      // Recovery has no preview export. Validate a detached state so its exact
      // occupancy/prerequisite order remains authoritative without a UI mutation.
      const recovery = (label: string, method: "repair" | "tow" | "salvage"): string => {
        const no = recoveryCommand(structuredClone(state), v.id, method);
        return button(label, { type: "recover", vehicleId: v.id, method }, no !== null, no ?? undefined);
      };
      html += `<p class="recovery-kit">${equipped(state, "bobbin_kit") ? "Bobbin kit retained" : `Requires Bobbin kit · ${state.knowledge.blueprints.includes(RECIPES.bobbin_kit.bp) ? "fabricate at the pod" : "plans at the reef intake"}`} · Rescue stock: ${state.world.maintenance.alloy} alloy / ${state.world.maintenance.membrane} membrane.</p><div class="recovery-choices" aria-label="${HULLS[v.hull].label} recovery choices">
        <section class="recovery-choice"><h4>Patch here</h4><p class="recovery-cost">2 alloy + 1 membrane · rescue stock</p><p>At the collar, within 7 m. Restores hull to 65%; keeps cargo and charge.</p>${recovery("Patch here", "repair")}</section>
        <section class="recovery-choice"><h4>Tow home</h4><p class="recovery-cost">No materials · to the shallow rescue bench</p><p>Empty hull; cargo stays aboard. Start at the staging bench or collar, within 7 m.</p><small>${routeId === "basin" ? "Pale Basin · surveyed overhead lift and shallow return" : "Upper-Canopy corridor"} · ${route.maximumTether} m tether limit. Blocked routes stop the tow. No repair or recharge.</small>${recovery(state.recovery.operation?.vehicleId === v.id && state.recovery.operation.phase === "ready" ? "Attach collar / confirm tow" : "Tow home · deploy Bobbin", "tow")}</section>
        ${canister ? `<section class="recovery-choice"><h4>Salvage in place</h4><p class="recovery-cost">No materials · one pressure canister at this collar</p><p>At the collar, within 7 m. Frame, fitted mount, hold${creel ? " and cabin locker" : ""} seal together; haul the canister home in trips.</p><small>${escapeHtml(frame)} · ${canister.cu} CU total.${v.boundRepairs ? `<br />Past patches return ${patchAlloy} alloy / ${patchMembrane} membrane to rescue stock only (limits 14 / 7).` : ""}</small>${recovery("Salvage into canister", "salvage")}</section>`
        : `<section class="recovery-choice"><h4>Salvage frame</h4><p class="recovery-cost">No materials · returns the frame’s ingredients</p><p>At the collar, within 7 m. Empty the hull, hold and module sockets first.</p><small>${escapeHtml(frame)} · ${cu} CU.<br />${destination ? `Return to ${destination}.` : eligibleHolds ? `Make ${cu} CU free in ${eligibleHolds}.` : `Requires a container large enough for the complete ${cu} CU return.`}${v.boundRepairs ? `<br />Past patches return ${patchAlloy} alloy / ${patchMembrane} membrane to rescue stock only (limits 14 / 7).` : ""}</small>${recovery("Salvage frame", "salvage")}</section>`}
      </div>`;
    }
    // Disabled hulls show recovery choices before routine service.
    html += `${v.disabled ? serviceActions() : ""}${this.group(`service:${v.id}`, "Reserve power & service", `<p>Cells in diver / this craft: ${cells.length ? cells.map((i) => `${escapeHtml(this.itemLabel(state, i))} · ${(i.charge ?? 0).toFixed(0)}%`).join(", ") : "none"}. A full cell gives up to 35% hull power at the craft’s socket; a pulse spends 25 points.${reserveNo ? ` ${escapeHtml(reserveNo)}` : ""}</p><p>Service within 7 m at pod waters, the restored workshop cradle or a restored mooring restores battery, hull, emergency air and cells aboard. Patch a disabled hull first; recharge locker cells at the bench.</p>`)}</article>`;
    return html;
  }


  /** The Creel's single major mount: fitted package, stowed alternatives and the
   * exact hold outcome of each change. A capacity refusal offers the stow path. */
  private mountFitting(state: GameState, button: CommandButton, v: VehicleState): string {
    const mount = fittedMount(state, v);
    const packages = state.inventory.items.filter((i): i is ItemStack & { kind: MountKind } => isMountKind(i.kind) && i.fitted === null);
    let html = `<article class="module-fitting mount-fitting" data-focus-key="mount:${escapeHtml(v.id)}" tabindex="-1"><div class="fitting-head"><h3>Creel mount · ${mount ? mountLabel(mount.kind) : "bare"}</h3><small class="trim-tradeoff">Rack 96 CU · cabin 40 CU + 16 CU locker, bunk, cooker · bare 64 CU</small></div>`;
    if (mount) {
      const no = removeModuleRefusal(state, v.id, mount.id, this.world);
      html += `<section class="fitting-choice here-row"><span>${mountLabel(mount.kind)} · fitted</span>${button("Unfit · hold 64 CU", { type: "remove-module", vehicleId: v.id, itemId: mount.id }, no !== null, no ?? undefined, `Unfit ${mountLabel(mount.kind).toLowerCase()} into the Creel hold · hold 64 CU`)}</section>`;
    }
    for (const item of packages) {
      const change = mountChangePreview(state, v.id, item.id);
      const verb = mount ? "Swap" : "Fit";
      html += `<section class="fitting-choice here-row"><span>${mountLabel(item.kind)} · ${escapeHtml(containerLabel(state, item.containerId))}</span>${button(`${verb} · hold ${MODULES[item.kind].holdCu} CU`, { type: "install-module", vehicleId: v.id, itemId: item.id }, change.refusal !== null, change.refusal ?? undefined, `${mount ? "Swap to" : "Fit"} ${mountLabel(item.kind).toLowerCase()} · hold ${MODULES[item.kind].holdCu} CU`)}</section>`;
    }
    // Explicit stow path when a smaller mount would overfill the hold.
    const lockers = state.inventory.containers.filter((c) => c.kind === "locker" && c.id !== v.cargoId && containerAccessible(state, c.id));
    const stow = lockers[0] ? materialStoragePreview(state, v.cargoId, lockers[0].id) : null;
    if (stow && stow.items.length && packages.some((i) => mountChangePreview(state, v.id, i.id).refusal?.includes("Store")))
      html += button(`Stow hold materials · ${stow.totalCu} CU → ${containerLabel(state, lockers[0]!.id)}`, { type: "store-materials", from: v.cargoId, to: lockers[0]!.id }, stow.refusal !== null, stow.refusal ?? undefined);
    for (const kind of ["creel_cargo_rack", "creel_cabin"] as const)
      if (!state.inventory.items.some((i) => i.kind === kind))
        html += `<section class="fitting-choice here-row"><span>${mountLabel(kind)} · not made</span><small>${Object.entries(RECIPES[kind].cost).map(([k, q]) => `${q} ${ITEMS[k as ItemKind].label}`).join(" + ")} · workshop</small></section>`;
    return html + "</article>";
  }

  private cabinActions(state: GameState, button: CommandButton): string {
    const v = cabinHull(state)!, registered = state.player.mobileRefuge?.vehicleId === v.id;
    const block = registered ? mobileRefugeBlock(state, this.world) : null;
    return `<article class="cabin-actions"><div class="vessel-line"><h3>Cabin · ${v.disabled ? "disabled hull" : v.charge > 0 ? "powered" : "unpowered"}${v.disabled || v.charge <= 0 ? ` · emergency air ${Math.ceil(v.emergencyAir)} s` : ""}${registered ? " · your refuge" : ""}</h3><div class="service-actions">${button(registered ? "Clear refuge" : "Register refuge", { type: "register-refuge", vehicleId: registered ? null : v.id }, false, undefined, registered ? "Clear refuge registration" : "Register cabin as refuge")}${button("Cook meal", { type: "cabin", action: "cook" })}${button("Take helm", { type: "cabin", action: "helm" })}${button("Leave by hatch", { type: "cabin", action: "hatch" })}</div></div>${block ? `<p class="recipe-status">Refuge unavailable: ${escapeHtml(block.message)}</p>` : ""}</article>`;
  }

  private powerPreparation(state: GameState, button: CommandButton): string {
    const pulse = distractionPreview(state);
    const cell = pulse.refusal === null ? state.inventory.items.find((i) => i.id === pulse.cellId) : undefined;
    const summary = `Power <small>Pulse G · −${PULSE_CHARGE_COST} points${cell && pulse.refusal === null ? ` · ${escapeHtml(this.itemLabel(state, cell))} ${cell.charge!.toFixed(0)} → ${pulse.remainingCharge.toFixed(0)}%` : " · no usable cell"}</small>`;
    return this.group("power", summary, `<article class="power-preparation"><p><kbd>G</kbd> Directional pulse · ${PULSE_CHARGE_COST} charge points from one cell · 12 seconds.</p>${cell && pulse.refusal === null
      ? `<p class="recipe-ready">Next payment: ${escapeHtml(this.itemLabel(state, cell))} in ${escapeHtml(containerLabel(state, cell.containerId))} · ${cell.charge!.toFixed(0)} → ${pulse.remainingCharge.toFixed(0)}%.</p>`
      : `<p class="recipe-status">${escapeHtml(pulse.refusal ?? "")}${state.world.threat.distractionSeconds > 0 ? ` ${Math.ceil(state.world.threat.distractionSeconds)} seconds remain.` : ""}</p>`}
      ${button(`Release pulse · ${PULSE_CHARGE_COST} cell points`, { type: "distraction" }, pulse.refusal !== null)}<small class="no-charge-options">No charge: Z quiet · cover · retreat.</small>
      ${localBenchSite(state) ? "" : this.benchRecharge(state, button)}</article>`);
  }

  private benchRecharge(state: GameState, button: CommandButton): string {
    const recharge = cellRechargePreview(state);
    const charging = recharge.cellIds.map((id) => state.inventory.items.find((i) => i.id === id)!);
    return `<article class="bench-charge"><div class="here-row"><h3>Local cells</h3><span>${charging.length ? charging.map((i) => `${escapeHtml(this.itemLabel(state, i))} · ${escapeHtml(containerLabel(state, i.containerId))} · ${(i.charge ?? 0).toFixed(0)} → 100%`).join("<br />") : "Cells only · hull service is separate"}</span>${button("Recharge local cells", { type: "recharge-cells" }, recharge.refusal !== null, recharge.refusal ?? undefined)}</div></article>`;
  }

  private materialStorageControls(state: GameState, button: CommandButton): string {
    const bins = state.inventory.containers.filter((c) => c.kind !== "equipment" && containerAccessible(state, c.id));
    this.storageFrom = bins.find((c) => c.id === this.storageFrom)?.id
      ?? bins.find((c) => c.id === "diver")?.id ?? bins[0]?.id ?? null;
    const destinations = bins.filter((c) => c.id !== this.storageFrom);
    if (this.storageToChosen && !destinations.some((c) => c.id === this.storageToChosen)) {
      this.storageNotice = `${containerLabel(state, this.storageToChosen)} ${this.storageToChosen === this.storageFrom ? "is now the source" : "is out of reach"}.`;
      this.storageToChosen = null;
    }
    const to = this.storageToChosen
      ?? destinations.find((c) => c.kind === "locker")?.id
      ?? destinations.find((c) => c.kind === "buoy")?.id
      ?? destinations.find((c) => c.kind === "vehicle")?.id
      ?? destinations[0]?.id;
    if (!this.storageFrom || !to) return this.storageNotice ? `<p class="storage-context">${escapeHtml(this.storageNotice)} Approach a local locker, deployed buoy or craft hold to store materials.</p>` : "";
    const preview = materialStoragePreview(state, this.storageFrom, to);
    const options = (choices: typeof bins, selected: string): string => choices.map((c) => `<option value="${escapeHtml(c.id)}"${c.id === selected ? " selected" : ""}>${escapeHtml(containerLabel(state, c.id))} · ${usedCapacity(state, c.id)} / ${c.capacity} CU</option>`).join("");
    // "Nothing to store" explains itself; only a real refusal gets a reason.
    const reason = preview.items.length ? preview.refusal ?? undefined : undefined;
    return `<article class="bulk-storage" data-focus-key="storage" tabindex="-1"><div class="storage-operands"><h3>Store materials</h3><label>From<select id="storage-from" data-focus-key="storage-from">${options(bins, this.storageFrom)}</select></label><span aria-hidden="true">→</span><label>To<select id="storage-to" data-focus-key="storage-to">${options(destinations, to)}</select></label>${button(preview.items.length ? `Store · ${preview.totalCu} CU` : "Nothing to store", { type: "store-materials", from: this.storageFrom, to }, preview.refusal !== null, reason)}</div>${this.storageNotice ? `<p class="storage-context">${escapeHtml(this.storageNotice)} Using ${escapeHtml(containerLabel(state, to))}.</p>` : ""}${preview.items.length ? `<p class="storage-quantities">${Object.entries(preview.quantities).map(([k, q]) => `${q} × ${ITEMS[k as ItemKind].label}`).join(" · ")} · whole stacks</p>` : ""}</article>`;
  }

  private moduleFitting(state: GameState, button: CommandButton, vessel?: VehicleState): string {
    if (!state.knowledge.blueprints.includes(RECIPES.dart_acoustic_trim.bp)) return "";
    const item = state.inventory.items.find((i) => i.kind === "dart_acoustic_trim");
    const spec = MODULES.dart_acoustic_trim;
    const cost = Object.entries(RECIPES.dart_acoustic_trim.cost).map(([k, q]) => `${q} ${ITEMS[k as ItemKind].label}`).join(" + ");
    let html = `<article class="module-fitting"><div class="fitting-head"><h3>Dart acoustic trim · ${item ? state.fleet.vehicles.some((v) => v.modules.includes(item.id)) ? "installed" : escapeHtml(containerLabel(state, item.containerId)) : "not made"}</h3><small class="trim-tradeoff">Quiet 3 → ${spec.quietSpeed} · boost 11 → ${spec.boostSpeed} m/s · 1 socket · ${ITEMS.dart_acoustic_trim.cu} CU</small></div>${item ? "" : `<small>${escapeHtml(cost)} · workshop · fit at the pod or workshop cradle</small>`}`;
    for (const v of state.fleet.vehicles.filter((v) => v.hull === "dart" && (!vessel || vessel.id === v.id))) {
      const perf = dartPerformance(state, v.id)!;
      const installed = item && v.modules.includes(item.id);
      html += `<section class="fitting-choice here-row" tabindex="-1" data-focus-key="fitting:${escapeHtml(v.id)}"><small>${HULLS[v.hull].label} · ${perf.socketsUsed} / ${perf.sockets} sockets · ${usedCapacity(state, v.cargoId)} / ${state.inventory.containers.find((c) => c.id === v.cargoId)?.capacity ?? 0} CU hold</small>`;
      if (item) {
        const refusal = installed ? removeModuleRefusal(state, v.id, item.id, this.world) : installModuleRefusal(state, v.id, item.id);
        html += button(installed ? "Remove trim into Dart hold" : "Fit acoustic trim", { type: installed ? "remove-module" : "install-module", vehicleId: v.id, itemId: item.id }, refusal !== null, refusal ?? undefined);
      }
      html += "</section>";
    }
    return html + this.group("trim-details", "Fitting details", `<p>Cruise 8 m/s, noise, power use per second and pressure rating stay the same. Remove intact into the Dart hold before transferring. Use the pod or restored workshop cradle; eligible local disabled-hull collar removal requires the service tool and Bobbin kit, safe personal depth and clearance.</p>`) + "</article>";
  }

  private fabricate(state: GameState, button: CommandButton): string {
    const atPod = nearPod(state), atWorkshop = nearWorkshop(state) && !state.player.interiorId, atStop = nearCanopyStop(state);
    const atBench = (site: Recipe["site"]): boolean => site === "island_workshop" ? atWorkshop : site === "canopy_stop" ? atStop : atPod;
    const benchOf = (site: Recipe["site"]): "home_pod" | "island_workshop" | "canopy_stop" =>
      site === "island_workshop" || site === "canopy_stop" ? site : "home_pod";
    const recipes = (Object.keys(RECIPES) as RecipeId[]).filter((id) => state.knowledge.blueprints.includes(RECIPES[id].bp)).map((id) => {
      const r = RECIPES[id];
      const done = r.once && state.knowledge.crafted.includes(id);
      const block = craftingBlock(state, id, this.world);
      const owned = hullOutput(r), dart = owned ? state.fleet.vehicles.find((v) => v.hull === owned) : undefined;
      // Ownership is live, independent of whichever validation check wins first.
      // In particular a seated owner still sees Current craft, with the site refusal.
      const group = dart ? "current" : done ? "completed" : block === null ? "ready"
        : block.code === "needs" ? "locked"
        : block.code === "materials" || block.code === "rescue-low" ? "materials" : "blocked";
      return { id, r, done, block, dart, group };
    });
    const current = atPod ? `Home pod bench · ${facility(state, "pod_fabricator") ? "restored" : "repair needed"}`
      : atWorkshop ? `Splitspine workshop bench · ${facility(state, "island_workshop") ? "restored" : "repair needed; locker locked"}`
      : atStop ? `Outer-crown mooring mast · ${facility(state, "canopy_stop") ? "restored" : "dark; locker locked"}`
      : `No bench here${state.player.controlledVehicleId ? " · exit the craft to use a bench" : ""}`;
    let html = `<p class="panel-status">${current} · ${this.protection(state)}</p><p class="sr-only">Costs read have here / needed.</p>`;
    const render = ({ id, r, done, block, dart }: typeof recipes[number]): string => {
      const bins = fabricationContainers(state, r.site);
      const isWorkshop = r.site === "island_workshop", isStop = r.site === "canopy_stop";
      const restored = facility(state, isWorkshop ? "island_workshop" : isStop ? "canopy_stop" : "pod_fabricator");
      const bench = isWorkshop ? "Splitspine workshop bench" : isStop ? "Outer-crown mooring mast" : r.site === "home_pod" ? "Home pod repair bench" : "Home pod fabricator";
      const trim = state.inventory.items.find((i) => i.kind === "dart_acoustic_trim");
      const completion = id === "dart_acoustic_trim" ? trim && state.fleet.vehicles.some((v) => v.modules.includes(trim.id)) ? "installed" : "fabricated" : "completed";
      const short: string[] = [], away: string[] = [];
      let fetchable = true;
      const costs = Object.entries(r.cost).map(([k, q]) => {
        const kind = k as ItemKind;
        if (done) return `<span class="ingredient">${ITEMS[kind].label}: ${q}</span>`;
        const have = r.maintenance ? kind === "structural_alloy" ? state.world.maintenance.alloy : kind === "silica_glass" ? state.world.maintenance.glass : state.world.maintenance.membrane : available(state, kind, bins);
        const carried = r.maintenance || bins.includes("diver") ? 0 : available(state, kind, ["diver"]);
        const elsewhere = r.maintenance ? 0 : available(state, kind, state.inventory.containers.filter((c) => c.id !== "diver" && !bins.includes(c.id)).map((c) => c.id));
        if (have < q) { short.push(`${q - have} ${ITEMS[kind].label}`); if (carried + elsewhere < q - have) fetchable = false; }
        if (carried || elsewhere) away.push(`${ITEMS[kind].label}: ${[carried ? `+${carried} carried` : "", elsewhere ? `+${elsewhere} elsewhere` : ""].filter(Boolean).join(", ")}`);
        return `<span class="ingredient${have < q ? " missing" : ""}">${ITEMS[kind].label}: ${have} / ${q}</span>`;
      }).join("");
      const inCradle = dart && !dart.disabled && !dart.berth &&
        state.player.controlledVehicleId !== dart.id && state.player.interiorId !== dart.id &&
        supportedServiceSite(state, dart) === "island_workshop" && distance(dart.pose.position, HULL_BUILD[dart.hull as "dart" | "creel"].pose) < 1.5 &&
        Math.hypot(dart.velocity.x, dart.velocity.y, dart.velocity.z) < 0.2;
      const location = !dart ? "" : dart.disabled ? `disabled · ${heading(state.player.pose.position, dart.pose.position)}`
        : state.player.controlledVehicleId === dart.id ? "piloting"
        : state.player.interiorId === dart.id ? "occupied"
        : dart.berth ? "berthed" : inCradle ? "in cradle" : heading(state.player.pose.position, dart.pose.position);
      // One actionable reason in the row; the exact refusal stays in the details.
      const place = PLACES[benchOf(r.site)];
      const missingSteps = r.needs.filter((n) => !state.knowledge.crafted.includes(n as RecipeId));
      const reason = !block ? undefined
        : dart ? `${HULLS[dart.hull].label} owned — ${location}`
        : block.code === "site" ? state.player.controlledVehicleId || state.player.interiorId ? "Leave the craft to use a bench"
          : `At ${place.label}${benchOf(r.site) === "home_pod" || state.knowledge.markers.includes(benchOf(r.site)) || facility(state, benchOf(r.site)) ? ` · ${heading(state.player.pose.position, place.position)}` : ""}`
        : block.code === "needs" ? `Needs: ${missingSteps.map((n) => RECIPES[n as RecipeId].label).join(" → ")}`
        : block.code === "restore" ? `First: ${isWorkshop ? RECIPES.restore_workshop.label : RECIPES.pod_repair.label}`
        : block.code === "materials" ? `${fetchable ? "Bring" : "Need"} ${short.slice(0, 2).join(", ")}${short.length > 2 ? " …" : ""}`
        : block.message;
      const refit = refitHull(id);
      const sources = r.maintenance ? "Rescue stock only · protected from ordinary fabrication" : `Local sources: ${bins.length ? bins.map((c) => containerLabel(state, c)).join(" · ") : "none at this recipe’s bench"}${bins.some((c) => state.fleet.vehicles.some((v) => v.cargoId === c)) ? " (includes supported-cradle cargo)" : ""}`;
      const habitats = Object.entries(SOURCES).filter(([sourceId, source]) => source.item in r.cost && state.knowledge.scans.includes(sourceId));
      const detail = [
        id === "suit_350" ? `<p class="refit-scope">${done ? "Fitted personal suit 350 m" : "Paid in-place refit · fitted suit 150 → 350 m"} · ${state.fleet.vehicles.filter((v) => !v.berth && v.hull !== "hearthline").map((v) => `${HULLS[v.hull].label} hull stays ${v.rating} m`).join(" · ") || "hull ratings are separate"}.</p>` : "",
        refit ? `<p class="refit-scope">Hull refit · ${HULLS[refit].label} ${HULLS[refit].initialDepth} → 350 m · your suit limit is separate.</p>` : "",
        dart ? `<p>One ${HULLS[dart.hull].label} at a time · salvage its frame to rebuild.</p>` : "",
        done ? "<p>Current recipe reference</p>" : "",
        `<p>${bench} · ${restored ? "restored" : id === "pod_repair" || id === "restore_workshop" ? "repair available before restoration" : "restore services first"}${!atBench(r.site) ? " · away from this bench" : ""}${r.maintenance ? " · rescue stock only" : ""}</p>`,
        block && block.message !== reason ? `<p class="recipe-status">${escapeHtml(block.message)}</p>` : "",
        away.length ? `<p class="recipe-sources">Not usable at this bench · ${escapeHtml(away.join(" · "))}</p>` : "",
        done ? "" : `<p class="recipe-sources">${escapeHtml(sources)}.</p>`,
        !done && habitats.length ? `<p class="recipe-sources">Known habitats: ${habitats.map(([, source]) => `${escapeHtml(source.label)} · ${REGIONS[source.region].label}`).join("; ")}.</p>` : "",
        !done && isWorkshop && !restored ? "<p>The unrestored workshop locker stays locked. Restore with carried materials or a nearby deployed buoy.</p>" : "",
      ].join("");
      const verb = id === "pod_repair" ? "Repair" : id.startsWith("restore_") ? "Restore" : id === "suit_350" || refit ? "Refit"
        : hullOutput(r) ? "Build" : id === "strip_frame" ? "Strip" : "Fabricate";
      const action = done ? `<span class="recipe-done">${completion}</span>`
        : button(verb, { type: "craft", recipeId: id }, block !== null, reason, r.label.startsWith(verb) ? r.label : `${verb} · ${r.label}`);
      return `<article class="recipe" data-recipe="${id}" data-readiness="${dart ? "current" : done ? "completed" : block === null ? "ready" : "blocked"}" data-focus-key="recipe:${id}" tabindex="-1">${this.group(`recipe:${id}`, `<span class="recipe-name">${r.label}</span><span class="recipe-costs">${costs}</span>`, `<div class="recipe-more">${detail}</div>`)}${action}</article>`;
    };
    // The next useful work leads; prerequisites, completed work and owned craft collapse.
    for (const [group, label] of [["ready", "Ready"], ["materials", "Needs materials"], ["blocked", "Not here"]] as const) {
      const rows = recipes.filter((r) => r.group === group);
      if (rows.length) html += `<section class="recipe-group" data-recipe-group="${group}"><h3>${label} <small>${rows.length}</small></h3>${rows.map(render).join("")}</section>`;
    }
    // Owned, locked and completed work share one row of closed folds.
    const folds = ([["current", "owned-recipes", "Owned craft"], ["locked", "locked-recipes", "Locked"], ["completed", "completed-recipes", "Completed"]] as const)
      .map(([group, id, label]) => {
        const rows = recipes.filter((r) => r.group === group);
        return rows.length ? this.group(id, `${label} <small>${rows.length}</small>`, rows.map(render).join("")).replace("<details ", group === "current" ? '<details data-recipe-group="current" ' : "<details ") : "";
      }).join("");
    if (folds) html += `<div class="panel-folds">${folds}</div>`;
    if (!recipes.length) html += "<p>Inspect the pod regulator to recover its checklist.</p>";
    return html;
  }

  /** Ordered notebook sections. Story records stay whole; reference blocks collapse. */
  private notebook(state: GameState, button: CommandButton): [string, string, boolean?][] {
    const found = (id: string): boolean => state.knowledge.evidence.some((e) => e.id === id);
    const question = found("C06") ? found("C05")
      ? "The dated water change and inward movement are separate facts. What connects them? Keep the residents’ destination and the cause open while comparing the records."
      : "What drove the dated sediment surge? The dormitory’s transfer tags are an independent lead; its record can be investigated in either order."
      : found("C05") ? "Where did the inward transfer go? The southern dish’s boundary station may explain the water change; the tags alone do not establish the residents’ fate."
      : found("C04") ? "What changed in the water before the equipment failed? Follow the fallen survey dishes beyond the lower Canopy crowns into Pale Basin."
      : found("C02") && found("C03") ? "Why were the intake and workshop left behind? The upper laboratory beside the Canopy’s tall rib may preserve another observation." : found("C03") ? "Why were departure supplies left unused? The reef intake is an independent lead; the laboratory lies beyond the eastern buoyant crowns." : found("C02") ? "Why is the intake abandoned while its filters still live? The workshop by Splitspine’s landing may preserve a different account." : "Why is the pod damaged? Compare its regulator with the intake below the reef ribs, or investigate the workshop above the island landing.";
    const payoff = found("C04") || found("C05") || found("C06") ? `<p class="expedition-payoff">${personalLimit(state) < 350 ? "Before Basin work: refit the fitted 150 m suit to 350 m at the restored workshop. Canopy crust and cured resin fund the refit; Dart’s 180 m hull reaches the first shelves." : `Basin preparation: suit 350 m${this.hullSummary(state)}. Keep exits on survey shelves you can reach, with air, power and cargo room for the return.`}${found("C05") ? " The dormitory rack's plans build a Creel workboat in the workshop slip; tagged frames on the Basin ridge feed hull refits and the dark outer-crown mooring." : ""}${found("C06") ? " The station's fracture survey rates a Creel hull ring to 350 m for the slope below." : ""}</p>` : "";
    const latest = state.knowledge.evidence.at(-1)?.id;
    const findings = state.knowledge.evidence.map((f) => {
      const e = EVIDENCE[f.id], key = `finding:${f.id}`;
      return `<details class="panel-group finding" id="finding-${f.id}" tabindex="-1" data-panel-group="${key}"${(this.expansions.get(key) ?? f.id === latest) ? " open" : ""}><summary data-focus-key="group:${key}">${e.label}</summary><p class="provenance">Source · ${escapeHtml(e.provenance)}</p><p><b>Observed</b> · ${e.observation}</p><p><b>Hypothesis</b> · ${e.hypothesis}</p><p class="lead"><b>Regional lead</b> · ${e.lead}</p></details>`;
    }).join("");
    let notes = state.knowledge.scans.includes("filter_flow") ? '<article><h3>Current-facing filters</h3><p>Open fans face the current. Harvest loose membrane from downstream catch hollows.</p></article>' : "";
    for (const scan of state.knowledge.scans.filter(techRecord))
      notes += `<article class="tech-record"><h3>${escapeHtml(TECH_RECORDS[scan].label)}</h3><p>${escapeHtml(TECH_RECORDS[scan].text)}</p></article>`;
    if (state.knowledge.journals.includes(OPTIONAL_RECORD.id)) notes += `<article><h3>Personal record · optional</h3><p>${OPTIONAL_RECORD.text}</p></article>`;
    const plans = Object.entries(FUTURE_BLUEPRINTS).filter(([id]) => state.knowledge.blueprints.includes(id as keyof typeof FUTURE_BLUEPRINTS));
    return [
      ["dive-check", this.diveCheck(state, button("Hint", { type: "hint" }, false, undefined, "Request a regional hint"))],
      ["question", `<article class="next-question"><h3>Current question</h3><p>${question}</p>${payoff}</article>`],
      ["interpretation", found("C02") && found("C03") ? '<p class="interpretation">Together: the living intake and unspent shore supplies suggest disrupted services. The reason people left these sites is still unconfirmed, whichever record you found first.</p>' : ""],
      ["findings", findings],
      ["field-notes", notes],
      ["refuge", this.refugeStatus(state)],
      ["places", this.places(state), true],
      ["habitats", this.knownHabitats(state), true],
      ["preparation", this.group("dive-preparation", "Dive preparation & safety", `<p>Plan for at least a quarter of your air and power before refilling. Personal protection applies outside the hull; the upper laboratory needs suit 150 m, Basin work needs the paid 350 m refit. Carry a meal and charged cell.</p><p>Z quiet, cover and retreat cost no charge. G spends ${PULSE_CHARGE_COST} points from one carried cell, then a controlled-craft cell, for a 12-second directional distraction. Move quietly away; remote locker cells cannot pay. A full cell can instead supply up to 35% hull power locally.</p><p>Recharge local cells at a restored bench; hull service requires the supported craft nearby. Calls and injury remain visible with mute or opening captions off.</p>`), true],
      ["plans", plans.length ? this.group("retained-plans", `Plans retained <small>${plans.length}</small>`, `<p>Research knowledge · construction not available yet.</p>${plans.map(([, label]) => `<p>${escapeHtml(label)}</p>`).join("")}`) : "", true],
      ["return", this.returnInformation(state), true],
      ["berth", facility(state, "island_workshop") ? this.group("unfinished-berth", "The unfinished large berth", "<p>The carrier cradle needs complementary surveys and frame recovery from Pale Basin. It is a future construction opportunity; no campaign carrier is available here yet.</p>") : "", true],
    ];
  }

  private hullSummary(state: GameState): string {
    const hulls = state.fleet.vehicles.filter((v) => !v.berth && v.hull !== "hearthline");
    return hulls.length ? ` · ${hulls.map((v) => `${HULLS[v.hull].label} hull ${v.rating} m`).join(" · ")}` : " · no hull yet";
  }

  /** Registered mobile refuge and its current safety, in one line. */
  private refugeStatus(state: GameState): string {
    const r = state.player.mobileRefuge;
    if (!r) return state.inventory.items.some((i) => i.kind === "creel_cabin")
      ? '<p class="refuge-status">Refuge · fixed refuges only. Register a fitted Creel cabin at its bunk.</p>' : "";
    const block = mobileRefugeBlock(state, this.world);
    const v = state.fleet.vehicles.find((a) => a.id === r.vehicleId);
    return `<p class="refuge-status"><b>Registered refuge</b> · Creel cabin${v ? ` · ${bearing(state.player.pose.position, v.pose.position)}` : ""} · ${block ? `unavailable now: ${escapeHtml(block.message)} · recovery falls back to the home pod` : "ready"}</p>`;
  }

  private diveCheck(state: GameState, hint: string): string {
    const meals = state.inventory.items.filter((i) => i.kind === "meal" && i.containerId === "diver").reduce((n, i) => n + i.quantity, 0);
    const cells = state.inventory.items.filter((i) => i.kind === "reserve_cell" && i.containerId === "diver");
    const hulls = state.fleet.vehicles.filter((v) => !v.berth && v.hull !== "hearthline");
    return `<article class="dive-check"><div class="vessel-line"><h3>Dive check</h3><span>Suit ${personalLimit(state)} m · Oxygen ${state.player.vitals.oxygen.toFixed(0)}% · full tank 180 s · Food ${state.player.vitals.food.toFixed(0)}% · ${meals} meal${meals === 1 ? "" : "s"}</span><div class="service-actions">${hint}</div></div><p>${cells.length ? cells.map((i) => `${escapeHtml(this.itemLabel(state, i))} ${(i.charge ?? 0).toFixed(0)}%`).join(" · ") : "No carried reserve cell"}${hulls.length ? ` · ${hulls.map((v) => `${HULLS[v.hull].label} ${v.rating} m · hull ${v.health.toFixed(0)}% · power ${v.charge.toFixed(0)}%${v.disabled ? " · disabled" : ""}`).join(" · ")}` : " · No craft"}</p></article>`;
  }

  private protection(state: GameState): string {
    const hull = state.fleet.vehicles.find(v => v.id === state.player.controlledVehicleId) ?? cabinHull(state) ??
      state.fleet.vehicles.find(v => v.hull === "dart" && !v.berth) ?? state.fleet.vehicles.find(v => v.hull === "creel" && !v.berth);
    return `Suit ${personalLimit(state)} m${hull ? ` · ${HULLS[hull.hull].label} hull ${hull.rating} m`
      : state.knowledge.blueprints.includes(RECIPES.dart_base.bp) ? ` · Dart plan: hull ${HULLS.dart.initialDepth} m` : ""}`;
  }

  private atRescueStation(state: GameState): boolean {
    return distance(state.player.pose.position, RECOVERY_STAGE) < 7 ||
      distance(state.player.pose.position, RECOVERY_SURFACE_OPERATOR) < 7;
  }

  private knownHabitats(state: GameState): string {
    const known = Object.entries(SOURCES).filter(([id]) => state.knowledge.scans.includes(id));
    // The shared rule is stated once; each row carries only its own lifecycle.
    if (!known.length) return "";
    return this.group("habitats", `Known habitats <small>${known.length}</small>`, `<article class="habitat-notes">${known.length ? `<p class="habitat-legend">Living sheds regrow while you explore; finite stock does not. When none are ready, sort a reserve on site.</p>${known.map(([id, s]) => {
      const stock = state.world.resources.find((r) => r.id === id), reserve = stock?.reserve ?? 0;
      const lifecycle = s.item === "meal" ? "Tended · when empty, tend 20 s for two more"
        : renewable(id) ? `Living shed · regrows to ${s.stock} ready` : reserve ? "Finite" : "Finite · no reserve left";
      return `<section class="known-source" data-lifecycle="${s.item === "meal" ? "tended" : renewable(id) ? "renewing" : "finite"}"><p><b>${ITEMS[s.item].label} · ${s.label}</b><br />${REGIONS[s.region].label} · ${s.context}<br /><small>${stock?.stock ?? 0} ready · ${reserve} in reserve · ${s.bundle} per gather · ${lifecycle}</small></p>${this.group(`scan:${id}`, "Field scan", `<p>${escapeHtml(s.scan)}</p>`)}</section>`;
    }).join("")}` : ""}</article>`);
  }

  private places(state: GameState): string {
    const rows = (["home_pod", "island_workshop", "canopy_lab", "canopy_stop", "basin_dormitory", "basin_boundary_station"] as const).filter((id) => id === "home_pod" || state.knowledge.markers.includes(id) || facility(state, id)).map((id) => {
      const capabilities = id === "home_pod" ? `Air · healing · locker · emergency meal · ${facility(state, "pod_fabricator") ? "equipment bench restored" : "bench needs repair"} · craft service in pod waters`
        : id === "island_workshop" ? facility(state, id) ? "Air · healing · locker · charging · hull bench · craft service at cradle and slip" : "Services offline · restore at workshop bench; locker locked"
        : id === "canopy_lab" ? "Air pocket · healing · no locker or craft charging"
        : id === "canopy_stop" ? facility(state, id) ? "Hull service · cell charging · 48 CU locker · mount changes · no air" : "Dark mooring · restore at its mast with a tagged frame"
        : "Flooded survey site · no refuge air or craft service";
      return `<p><b>${PLACES[id].label}</b> · ${bearing(state.player.pose.position, PLACES[id].position)}<br /><small>${capabilities}</small></p>`;
    });
    return this.group("places", `Places <small>${rows.length}</small>`, `<article class="known-places">${rows.join("")}</article>`);
  }

  private returnInformation(state: GameState): string {
    let html = '<article class="return-plan"><p>Knowledge, blueprints and retained equipment survive incapacity. Ordinary cargo may remain in a visited cache; disabled craft keep their own holds. Recovering takes a local expedition.</p>';
    // The saved report survives toast expiry, panel reopening and reload. Only
    // recovery transitions belong here; other command feedback stays transient.
    if (Object.values(RECOVERY_NOTICES).some((message) => message === state.feedback))
      html += `<p class="recipe-status"><b>Last recovery report</b><br />${escapeHtml(recoveryDisplay(state.feedback))}</p>`;
    for (const cache of state.recovery.caches) {
      const items = state.inventory.items.filter((i) => i.containerId === cache.containerId);
      if (!items.length) continue;
      html += `<p><b>Visited cargo cache</b> · ${bearing(state.player.pose.position, cache.position)}<br />${items.map((i) => `${i.quantity} ${ITEMS[i.kind].label}`).join(" / ")}. Approach within 4 m, then open Cargo to transfer.</p>`;
    }
    for (const loss of state.recovery.losses.filter((l) => l.visited)) {
      const v = state.fleet.vehicles.find((v) => v.id === loss.vehicleId);
      if (!v) continue;
      html += `<p><b>${HULLS[v.hull].label} loss transponder</b> · ${bearing(state.player.pose.position, v.pose.position)} · hold ${usedCapacity(state, v.cargoId)} CU.<br />${v.hull === "dart" ? "Use the retained Bobbin kit for local tow, a bound field patch, or salvage after emptying the hold. Tow does not restore damage or charge." : "This fixture hull is outside the expedition’s implemented Dart recovery options."}</p>`;
    }
    if (equipped(state, "bobbin_kit") || state.recovery.losses.length) {
      const face = distance(state.player.pose.position, RECOVERY_SURFACE_OPERATOR) < distance(state.player.pose.position, RECOVERY_STAGE) ? RECOVERY_SURFACE_OPERATOR : RECOVERY_STAGE;
      html += `<p><b>Shallow rescue staging</b> · east of Splitspine · ${bearing(state.player.pose.position, face)}. Surface operator and ${Math.max(0, -RECOVERY_STAGE.y)} m bench serve the same station. Start a visited Dart’s Canopy or Basin tow here, or at its safe exterior collar. Only the surface work face has surface air.</p>`;
      const op = state.recovery.operation;
      if (op) html += `<p class="recipe-status">Bobbin · ${op.routeId === "basin" ? "Pale Basin overhead lift" : "Upper-Canopy corridor"}: ${op.phase === "ready" ? "at the exterior collar — confirm tow in Cargo to attach" : op.phase === "tow" ? "guiding the original hull back to shallow staging" : "following the local tether corridor toward the collar"}. Progress pauses while this panel is open.</p>`;
    }
    return this.group("return-recovery", "Return & recovery", html + "</article>", state.recovery.losses.length > 0 || state.recovery.operation !== null || state.recovery.caches.length > 0 || Object.values(RECOVERY_NOTICES).some((message) => message === state.feedback));
  }

  focusTarget(kind: PanelKind, state: GameState, targetId: string): void {
    let id: string | null = null;
    if (kind === "notebook" && state.knowledge.evidence.some(e => e.id === targetId)) id = `finding-${targetId}`;
    if (kind === "inventory") {
      const cache = state.recovery.caches.find(c => c.id === targetId);
      if (cache) id = `container-${cache.containerId}`;
      else if (state.fleet.vehicles.some(v => v.id === targetId)) id = `vessel-${targetId}`;
      else if (targetId === "rescue_staging") id = "panel-content";
    }
    if (kind === "craft") id = "panel-title";
    if (!id) return;
    const element = this.get(id);
    let group = element.closest<HTMLDetailsElement>("details");
    while (group?.tagName === "DETAILS") {
      group.open = true;
      if (group.dataset.panelGroup) this.expansions.set(group.dataset.panelGroup, true);
      group = group.parentElement?.closest<HTMLDetailsElement>("details") ?? null;
    }
    element.setAttribute("tabindex", "-1");
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: "nearest" });
    element.classList.add("interaction-focus");
    window.clearTimeout(this.highlightTimer);
    this.highlightTimer = window.setTimeout(() => element.classList.remove("interaction-focus"), 1400);
  }

  notify(message: string, error: boolean): void {
    this.get("panel-feedback").textContent = recoveryDisplay(message);
    this.get("panel-feedback").hidden = false;
    this.get("panel-feedback").classList.toggle("error", error);
  }

  clearNotice(): void {
    const feedback = this.get("panel-feedback");
    feedback.hidden = true;
    feedback.textContent = "";
    feedback.classList.remove("error");
  }

  cancelFeedback(): void {
    window.clearTimeout(this.highlightTimer);
    for (const element of this.root.querySelectorAll<HTMLElement>(".interaction-focus"))
      element.classList.remove("interaction-focus");
  }
}
